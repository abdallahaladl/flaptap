import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService, LoginInput, RegisterInput, UpdatePreferencesInput } from './auth.service';
import { HistoryRepository } from '../../core/database/history.repository';
import { DataLifecycleService } from '../data-lifecycle/data-lifecycle.service';
import {
  clearSessionCookie,
  extractClientMeta,
  extractGuestToken,
  requireAuthenticatedUser,
  resolveRequestIdentity,
  setSessionCookie,
} from './auth.request';

@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly historyRepo: HistoryRepository,
    private readonly dataLifecycle: DataLifecycleService,
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
    };
  }

  @Get('me')
  me(@Req() req: Request) {
    const identity = resolveRequestIdentity(req, this.authService);

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
      };
    }

    const stats = this.historyRepo.getStats({ userId: identity.userId });
    return {
      authenticated: true,
      user: identity.user,
      stats,
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
    const purged = this.dataLifecycle.purgeAccountExternalArtifacts(identity.userId, () =>
      this.authService.deleteAccount(identity.userId),
    );
    clearSessionCookie(res, req);
    return {
      success: true,
      authenticated: false,
      purged,
      message: 'Your account and all personal history have been permanently deleted.',
    };
  }
}
