import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService, LoginInput, RegisterInput, UpdatePreferencesInput } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';
import { HistoryRepository } from '../../core/database/history.repository';
import {
  clearOAuthStateCookie,
  clearSessionCookie,
  extractClientMeta,
  extractGuestToken,
  extractRequestOrigin,
  OAUTH_STATE_COOKIE_NAME,
  parseCookies,
  requireAuthenticatedUser,
  resolveRequestIdentity,
  setOAuthStateCookie,
  setSessionCookie,
} from './auth.request';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly historyRepo: HistoryRepository,
  ) {}

  @Post('register')
  register(
    @Body() body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const guestToken = body?.guestToken || extractGuestToken(req) || undefined;
    const { user, token } = this.authService.register(
      { ...body, guestToken },
      extractClientMeta(req),
    );
    setSessionCookie(res, token, req);
    const stats = this.historyRepo.getStats({ userId: user.id });
    return {
      authenticated: true,
      user,
      token,
      stats,
      googleAuth: this.googleOAuth.getPublicConfig(),
    };
  }

  @Post('login')
  login(
    @Body() body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const guestToken = body?.guestToken || extractGuestToken(req) || undefined;
    const { user, token } = this.authService.login(
      { ...body, guestToken },
      extractClientMeta(req),
    );
    setSessionCookie(res, token, req);
    const stats = this.historyRepo.getStats({ userId: user.id });
    return {
      authenticated: true,
      user,
      token,
      stats,
      googleAuth: this.googleOAuth.getPublicConfig(),
    };
  }

  @Post('logout')
  logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const identity = resolveRequestIdentity(req, this.authService);
    this.authService.logout(identity.sessionToken);
    clearSessionCookie(res, req);
    return {
      success: true,
      authenticated: false,
      googleAuth: this.googleOAuth.getPublicConfig(),
    };
  }

  @Get('me')
  me(@Req() req: Request) {
    const identity = resolveRequestIdentity(req, this.authService);
    const googleAuth = this.googleOAuth.getPublicConfig();

    if (!identity.user || !identity.userId) {
      return {
        authenticated: false,
        user: null,
        stats: {
          lessonsCount: 0,
          completedDrills: 0,
          vocabularyCount: 0,
          dueVocabularyCount: 0,
          practiceMinutes: 0,
          streakDays: 0,
          dailyGoalMinutes: 15,
        },
        googleAuth,
      };
    }

    const stats = this.historyRepo.getStats({ userId: identity.userId });
    return {
      authenticated: true,
      user: identity.user,
      stats,
      googleAuth,
    };
  }

  /* ========================================================================
     REAL GOOGLE OAUTH 2.0 + OIDC AUTHENTICATION
     ======================================================================== */

  @Get('google/config')
  googleConfig(@Req() req: Request) {
    const cfg = this.googleOAuth.getPublicConfig();
    const origin = extractRequestOrigin(req);
    return {
      ...cfg,
      redirectUri: this.googleOAuth.resolveRedirectUri(origin),
      authorizedOrigin: origin,
    };
  }

  @Get('google/start')
  async googleStart(
    @Query('mode') mode: string | undefined,
    @Query('returnTo') returnTo: string | undefined,
    @Query('uiLang') uiLang: string | undefined,
    @Query('nativeLang') nativeLang: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const origin = extractRequestOrigin(req);
    const { authorizationUrl, state } = await this.googleOAuth.createAuthorizationStart({
      requestOrigin: origin,
      returnTo,
      mode: mode === 'redirect' ? 'redirect' : 'popup',
      uiLanguage: uiLang,
      nativeLanguage: nativeLang,
    });
    setOAuthStateCookie(res, state, req);
    return res.redirect(302, authorizationUrl);
  }

  @Get('google/handoff')
  googleHandoff(
    @Query('token') token: string | undefined,
    @Query('returnTo') returnTo: string | undefined,
    @Query('mode') mode: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const cleanToken = (token || '').trim();
    const user = cleanToken ? this.authService.validateSession(cleanToken) : null;
    const safeReturnTo = this.googleOAuth.sanitizeReturnTo(returnTo);
    const safeMode: 'popup' | 'redirect' = mode === 'redirect' ? 'redirect' : 'popup';

    if (!user || !cleanToken) {
      return this.renderOAuthBridgeHtml(res, {
        success: false,
        error: 'Google sign-in handoff expired or invalid.',
        mode: safeMode,
        returnTo: safeReturnTo,
      });
    }

    setSessionCookie(res, cleanToken, req);
    const stats = this.historyRepo.getStats({ userId: user.id });
    return this.renderOAuthBridgeHtml(res, {
      success: true,
      mode: safeMode,
      returnTo: safeReturnTo,
      payload: {
        authenticated: true,
        isNewUser: false,
        user,
        token: cleanToken,
        stats,
      },
    });
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const origin = extractRequestOrigin(req).replace(/\/+$/, '');
    const cookies = parseCookies(req.headers?.cookie);
    const cookieState = cookies[OAUTH_STATE_COOKIE_NAME] || null;
    clearOAuthStateCookie(res, req);

    if (oauthError) {
      return this.renderOAuthBridgeHtml(res, {
        success: false,
        error: oauthError === 'access_denied'
          ? 'Google sign-in was cancelled.'
          : `Google sign-in failed (${oauthError}).`,
        mode: 'popup',
        returnTo: '/',
      });
    }

    try {
      const completed = await this.googleOAuth.completeAuthorizationCallback({
        code: code || '',
        state: state || '',
        cookieState,
        requestOrigin: origin,
      });

      const guestToken = extractGuestToken(req) || undefined;
      const { user, token, isNewUser } = this.authService.authenticateWithGoogle(
        completed.profile,
        {
          uiLanguage: completed.uiLanguage,
          nativeLanguage: completed.nativeLanguage,
          guestToken,
          meta: extractClientMeta(req),
        },
      );

      setSessionCookie(res, token, req);

      if (
        completed.requestOrigin &&
        completed.requestOrigin.toLowerCase() !== origin.toLowerCase()
      ) {
        const handoffUrl = new URL('/api/auth/google/handoff', completed.requestOrigin);
        handoffUrl.searchParams.set('token', token);
        handoffUrl.searchParams.set('returnTo', completed.returnTo);
        handoffUrl.searchParams.set('mode', completed.mode);
        return res.redirect(302, handoffUrl.toString());
      }

      const stats = this.historyRepo.getStats({ userId: user.id });
      return this.renderOAuthBridgeHtml(res, {
        success: true,
        mode: completed.mode,
        returnTo: completed.returnTo,
        payload: {
          authenticated: true,
          isNewUser,
          user,
          token,
          stats,
        },
      });
    } catch (error: any) {
      return this.renderOAuthBridgeHtml(res, {
        success: false,
        error: error?.message || 'Google sign-in failed.',
        mode: 'popup',
        returnTo: '/',
      });
    }
  }

  /**
   * Direct Google Identity Services (GIS) RS256 ID-Token endpoint.
   * Works when only GOOGLE_CLIENT_ID is configured (or alongside OAuth2 PKCE).
   */
  @Post('google/credential')
  async googleCredential(
    @Body()
    body: {
      credential?: string;
      idToken?: string;
      uiLanguage?: string;
      nativeLanguage?: string;
      guestToken?: string;
    },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawJwt = (body?.credential || body?.idToken || '').trim();
    if (!rawJwt) {
      throw new BadRequestException('Missing Google ID token credential.');
    }

    const profile = await this.googleOAuth.verifyIdToken(rawJwt);
    const guestToken = body?.guestToken || extractGuestToken(req) || undefined;
    const { user, token, isNewUser } = this.authService.authenticateWithGoogle(profile, {
      uiLanguage: body?.uiLanguage,
      nativeLanguage: body?.nativeLanguage,
      guestToken,
      meta: extractClientMeta(req),
    });

    setSessionCookie(res, token, req);
    const stats = this.historyRepo.getStats({ userId: user.id });
    return {
      authenticated: true,
      isNewUser,
      user,
      token,
      stats,
      googleAuth: this.googleOAuth.getPublicConfig(),
    };
  }

  /* ========================================================================
     ACCOUNT PREFERENCES, SECURITY, ACTIVE SESSIONS & ACCOUNT DELETION
     ======================================================================== */

  @Patch('preferences')
  updatePreferences(
    @Body() body: UpdatePreferencesInput,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const user = this.authService.updatePreferences(identity.userId, body || {});
    return {
      authenticated: true,
      user,
      stats: this.historyRepo.getStats({ userId: user.id }),
    };
  }

  @Post('password')
  updatePassword(
    @Body() body: { currentPassword?: string; newPassword?: string },
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const user = this.authService.changeOrSetPassword(
      identity.userId,
      body || {},
      identity.sessionToken,
    );
    return {
      success: true,
      user,
      message: 'Password updated successfully.',
    };
  }

  @Get('sessions')
  listSessions(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return {
      sessions: this.authService.listSessions(identity.userId, identity.sessionToken),
    };
  }

  @Delete('sessions/others')
  revokeOtherSessions(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const revoked = this.authService.revokeOtherSessions(identity.userId, identity.sessionToken);
    return { success: true, revokedCount: revoked };
  }

  @Delete('sessions/:sessionId')
  revokeSession(@Param('sessionId') sessionId: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return {
      success: this.authService.revokeSession(identity.userId, sessionId),
    };
  }

  @Delete('account')
  deleteAccount(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    this.authService.deleteAccount(identity.userId);
    clearSessionCookie(res, req);
    return {
      success: true,
      authenticated: false,
      message: 'Your account and all personal history have been permanently deleted.',
    };
  }

  private renderOAuthBridgeHtml(
    res: Response,
    opts: {
      success: boolean;
      mode: 'popup' | 'redirect';
      returnTo: string;
      error?: string;
      payload?: Record<string, any>;
    },
  ) {
    const safeJson = JSON.stringify({
      type: opts.success ? 'flaptap:google-auth-success' : 'flaptap:google-auth-error',
      error: opts.error || null,
      returnTo: opts.returnTo || '/',
      ...(opts.payload || {}),
    }).replace(/</g, '\\u003c');

    const fallbackHref = opts.success
      ? opts.returnTo || '/'
      : `/?auth_error=${encodeURIComponent(opts.error || 'Google sign-in failed')}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Completing Sign-In — Flaptap</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #F6F4EE; color: #141413; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #FCFBF7; border: 1px solid #DDD8CE; padding: 28px 32px; border-radius: 10px; text-align: center; max-width: 360px; }
  </style>
</head>
<body>
  <div class="card">
    <p style="margin:0;font-weight:600;">${opts.success ? 'Signed in with Google. Returning to Flaptap...' : 'Returning to Flaptap...'}</p>
  </div>
  <script>
    (function () {
      var msg = ${safeJson};
      try {
        if (msg.token) {
          localStorage.setItem('flaptap_auth_token', msg.token);
        }
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(msg, window.location.origin);
          window.close();
          return;
        }
      } catch (e) {}
      window.location.replace(${JSON.stringify(fallbackHref)});
    })();
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(opts.success ? 200 : 400).send(html);
  }
}
