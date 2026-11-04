import { UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService, SessionClientMeta, UserProfile } from './auth.service';
import { RequestIdentityScope } from '../../core/database/history.repository';

export const SESSION_COOKIE_NAME = 'flaptap_session';
export const OAUTH_STATE_COOKIE_NAME = 'flaptap_oauth_state';
export const GUEST_COOKIE_NAME = 'flaptap_guest';

export interface ResolvedRequestIdentity extends RequestIdentityScope {
  user: UserProfile | null;
  sessionToken: string | null;
}

export interface AuthenticatedRequestIdentity {
  user: UserProfile;
  userId: string;
  guestToken: null;
  sessionToken: string | null;
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

export function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers?.authorization || '';
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookies = parseCookies(req.headers?.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

export function extractGuestToken(req: Request): string | null {
  const headerToken = req.headers?.['x-guest-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim().slice(0, 96);
  }
  const cookies = parseCookies(req.headers?.cookie);
  if (cookies[GUEST_COOKIE_NAME]) {
    return cookies[GUEST_COOKIE_NAME].trim().slice(0, 96);
  }
  return null;
}

export function extractClientMeta(req: Request): SessionClientMeta {
  const ua = String(req.headers?.['user-agent'] || '').slice(0, 240);
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = (forwarded || req.ip || req.socket?.remoteAddress || '').slice(0, 64);
  return { userAgent: ua, ipAddress: ip };
}

export function extractRequestOrigin(req: Request): string {
  const protoHeader = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = protoHeader || (req.secure ? 'https' : 'http');
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || 'localhost:3333')
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}

export function isSecureRequest(req?: Request): boolean {
  if (!req) return false;
  if (req.secure) return true;
  const proto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

export function resolveRequestIdentity(req: Request, authService: AuthService): ResolvedRequestIdentity {
  const sessionToken = extractSessionToken(req);
  const user = sessionToken ? authService.validateSession(sessionToken) : null;
  const guestToken = extractGuestToken(req);
  return {
    user,
    userId: user ? user.id : null,
    guestToken: user ? null : guestToken,
    sessionToken,
  };
}

/**
 * Hard authentication gate: ensures zero execution and zero data access
 * for unauthenticated requests.
 */
export function requireAuthenticatedUser(
  req: Request,
  authService: AuthService,
): AuthenticatedRequestIdentity {
  const identity = resolveRequestIdentity(req, authService);
  if (!identity.user || !identity.userId) {
    throw new UnauthorizedException({
      code: 'auth_required',
      message: 'Please sign in or create an account to continue.',
    });
  }
  return {
    user: identity.user,
    userId: identity.userId,
    guestToken: null,
    sessionToken: identity.sessionToken,
  };
}

export function setSessionCookie(res: Response, token: string, req?: Request): void {
  const maxAgeSec = 30 * 24 * 60 * 60;
  const secureAttr = isSecureRequest(req) ? '; Secure' : '';
  res.append(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secureAttr}`,
  );
}

export function clearSessionCookie(res: Response, req?: Request): void {
  const secureAttr = isSecureRequest(req) ? '; Secure' : '';
  res.append(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureAttr}`,
  );
}

export function setOAuthStateCookie(res: Response, state: string, req?: Request): void {
  const secureAttr = isSecureRequest(req) ? '; Secure' : '';
  res.append(
    'Set-Cookie',
    `${OAUTH_STATE_COOKIE_NAME}=${encodeURIComponent(state)}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${secureAttr}`,
  );
}

export function clearOAuthStateCookie(res: Response, req?: Request): void {
  const secureAttr = isSecureRequest(req) ? '; Secure' : '';
  res.append(
    'Set-Cookie',
    `${OAUTH_STATE_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureAttr}`,
  );
}
