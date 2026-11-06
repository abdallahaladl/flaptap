import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { SqliteService } from '../../core/database/sqlite.service';

export interface VerifiedGoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string;
}

export interface GoogleAuthPublicConfig {
  enabled: boolean;
  clientId: string;
  oauthRedirectEnabled: boolean;
  gisEnabled: boolean;
}

interface JwkRsaKey {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
}

const DEFAULT_GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const DEFAULT_GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  private jwksCache: { keys: JwkRsaKey[]; expiresAt: number } | null = null;
  private redirectProbeCache = new Map<string, { allowed: boolean; expiresAt: number }>();

  constructor(private readonly sqlite: SqliteService) {}

  private get clientId(): string {
    return (process.env.GOOGLE_CLIENT_ID || '').trim();
  }

  private get clientSecret(): string {
    return (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  }

  private get configuredRedirectUri(): string {
    return (process.env.GOOGLE_REDIRECT_URI || '').trim();
  }

  private get authEndpoint(): string {
    return (process.env.GOOGLE_OAUTH_AUTH_URL || DEFAULT_GOOGLE_AUTH_URL).trim();
  }

  private get tokenEndpoint(): string {
    return (process.env.GOOGLE_OAUTH_TOKEN_URL || DEFAULT_GOOGLE_TOKEN_URL).trim();
  }

  private get jwksEndpoint(): string {
    return (process.env.GOOGLE_OAUTH_JWKS_URI || DEFAULT_GOOGLE_JWKS_URI).trim();
  }

  public getPublicConfig(): GoogleAuthPublicConfig {
    const clientId = this.clientId;
    const hasSecret = Boolean(this.clientSecret);
    return {
      enabled: Boolean(clientId),
      clientId,
      oauthRedirectEnabled: Boolean(clientId && hasSecret),
      gisEnabled: Boolean(clientId),
    };
  }

  public sanitizeReturnTo(raw?: string): string {
    const val = (raw || '/').trim();
    if (!val.startsWith('/') || val.startsWith('//') || val.includes('\\')) {
      return '/';
    }
    return val.slice(0, 512);
  }

  public resolveRedirectUri(requestOrigin: string): string {
    if (this.configuredRedirectUri) {
      return this.configuredRedirectUri;
    }
    const cleanOrigin = (requestOrigin || 'http://localhost:3333').replace(/\/+$/, '');
    return `${cleanOrigin}/api/auth/google/callback`;
  }

  public async probeRedirectUriAllowed(redirectUri: string): Promise<boolean> {
    if (!this.clientId) return false;
    const now = Date.now();
    const cached = this.redirectProbeCache.get(redirectUri);
    if (cached && cached.expiresAt > now) {
      return cached.allowed;
    }
    try {
      const u = new URL(this.authEndpoint);
      u.searchParams.set('client_id', this.clientId);
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('scope', 'openid email profile');
      const res = await fetch(u.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(3500),
      });
      const loc = (res.headers.get('location') || '').toLowerCase();
      const isMismatch =
        loc.includes('redirect_uri_mismatch') ||
        loc.includes('oauth/error') ||
        loc.includes('autherror=');
      const allowed = !isMismatch && (res.status === 302 || res.status === 303 || res.status === 200);
      this.redirectProbeCache.set(redirectUri, {
        allowed,
        expiresAt: now + (allowed ? 10 * 60 * 1000 : 25 * 1000),
      });
      return allowed;
    } catch {
      return true;
    }
  }

  public async resolveSmartRedirectUri(requestOrigin: string): Promise<string> {
    const primary = this.resolveRedirectUri(requestOrigin);
    if (primary.startsWith('http://localhost:')) {
      return primary;
    }
    const allowed = await this.probeRedirectUriAllowed(primary);
    if (allowed) {
      return primary;
    }
    const port = process.env.PORT || '3333';
    const localhostFallback = `http://localhost:${port}/api/auth/google/callback`;
    this.logger.log(
      `Origin redirect_uri (${primary}) not yet authorized in Google Cloud Console; using authorized fallback (${localhostFallback}).`,
    );
    return localhostFallback;
  }

  /**
   * Starts a standards-compliant OAuth 2.0 Authorization Code + PKCE (S256) flow.
   */
  public async createAuthorizationStart(params: {
    requestOrigin: string;
    returnTo?: string;
    mode?: 'popup' | 'redirect';
    uiLanguage?: string;
    nativeLanguage?: string;
  }): Promise<{ authorizationUrl: string; state: string }> {
    if (!this.clientId || !this.clientSecret) {
      throw new ServiceUnavailableException({
        code: 'google_oauth_not_configured',
        message:
          'Google OAuth is not configured on this server yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env to enable Google Sign-In.',
      });
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const expiresIso = new Date(now + OAUTH_STATE_TTL_MS).toISOString();

    // Purge expired one-time states
    this.sqlite.db.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').run(nowIso);

    const state = crypto.randomBytes(32).toString('base64url');
    const codeVerifier = crypto.randomBytes(48).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    const safeReturnTo = this.sanitizeReturnTo(params.returnTo);
    const mode = params.mode === 'redirect' ? 'redirect' : 'popup';
    const uiLanguage = (params.uiLanguage || 'en').trim().slice(0, 12) || 'en';
    const nativeLanguage = (params.nativeLanguage || 'ar').trim().slice(0, 12) || 'ar';
    const cleanOrigin = (params.requestOrigin || 'http://localhost:3333').replace(/\/+$/, '');
    const redirectUri = await this.resolveSmartRedirectUri(cleanOrigin);

    const statePayload = JSON.stringify({
      returnTo: safeReturnTo,
      requestOrigin: cleanOrigin,
      redirectUri,
    });

    this.sqlite.db
      .prepare(`
        INSERT INTO oauth_states (
          state, code_verifier, return_to, mode, ui_language, native_language, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(state, codeVerifier, statePayload, mode, uiLanguage, nativeLanguage, expiresIso, nowIso);

    const url = new URL(this.authEndpoint);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('access_type', 'online');
    url.searchParams.set('prompt', 'select_account');

    return {
      authorizationUrl: url.toString(),
      state,
    };
  }

  /**
   * Completes the OAuth 2.0 callback: validates CSRF state, exchanges authorization
   * code + PKCE verifier with Google's token endpoint, and cryptographically verifies
   * the returned OIDC ID token.
   */
  public async completeAuthorizationCallback(params: {
    code: string;
    state: string;
    cookieState?: string | null;
    requestOrigin: string;
  }): Promise<{
    profile: VerifiedGoogleProfile;
    returnTo: string;
    requestOrigin: string;
    mode: 'popup' | 'redirect';
    uiLanguage: string;
    nativeLanguage: string;
  }> {
    if (!this.clientId || !this.clientSecret) {
      throw new ServiceUnavailableException({
        code: 'google_oauth_not_configured',
        message: 'Google OAuth credentials are not configured.',
      });
    }

    const code = (params.code || '').trim();
    const state = (params.state || '').trim();
    if (!code || !state) {
      throw new BadRequestException('Missing Google OAuth authorization code or state.');
    }

    if (params.cookieState && params.cookieState !== state) {
      throw new UnauthorizedException('Google OAuth state mismatch (CSRF check failed).');
    }

    const row = this.sqlite.db
      .prepare('SELECT * FROM oauth_states WHERE state = ?')
      .get(state) as Record<string, any> | undefined;

    // One-time consumption: delete immediately before external network call
    this.sqlite.db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);

    if (!row) {
      throw new UnauthorizedException('Invalid or already-used Google OAuth state.');
    }

    if (String(row.expires_at) <= new Date().toISOString()) {
      throw new UnauthorizedException('Google OAuth login session expired. Please try again.');
    }

    let parsedReturnTo = '/';
    let savedRequestOrigin = (params.requestOrigin || 'http://localhost:3333').replace(/\/+$/, '');
    let redirectUri = this.resolveRedirectUri(params.requestOrigin);

    const rawReturnTo = String(row.return_to || '/');
    if (rawReturnTo.startsWith('{')) {
      try {
        const meta = JSON.parse(rawReturnTo);
        parsedReturnTo = this.sanitizeReturnTo(meta.returnTo);
        if (meta.requestOrigin) savedRequestOrigin = String(meta.requestOrigin).replace(/\/+$/, '');
        if (meta.redirectUri) redirectUri = String(meta.redirectUri);
      } catch {
        parsedReturnTo = this.sanitizeReturnTo(rawReturnTo);
      }
    } else {
      parsedReturnTo = this.sanitizeReturnTo(rawReturnTo);
    }

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      code_verifier: String(row.code_verifier),
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => '');
      this.logger.warn(`Google token exchange failed (${tokenRes.status}): ${errText.slice(0, 200)}`);
      throw new UnauthorizedException('Could not exchange Google authorization code.');
    }

    const tokenJson: any = await tokenRes.json();
    const idToken = String(tokenJson?.id_token || '').trim();
    if (!idToken) {
      throw new UnauthorizedException('Google token response did not include an OIDC id_token.');
    }

    const profile = await this.verifyIdToken(idToken);
    return {
      profile,
      returnTo: parsedReturnTo,
      requestOrigin: savedRequestOrigin,
      mode: row.mode === 'redirect' ? 'redirect' : 'popup',
      uiLanguage: String(row.ui_language || 'en'),
      nativeLanguage: String(row.native_language || 'ar'),
    };
  }

  /**
   * Cryptographically verifies a Google OpenID Connect RS256 ID token against
   * Google's JWKS keys using Node's built-in `node:crypto` (zero external SDKs).
   */
  public async verifyIdToken(idToken: string): Promise<VerifiedGoogleProfile> {
    if (!this.clientId) {
      throw new ServiceUnavailableException({
        code: 'google_oauth_not_configured',
        message:
          'Google Sign-In is not configured yet. Set GOOGLE_CLIENT_ID in .env to enable Google authentication.',
      });
    }

    const clean = (idToken || '').trim();
    const parts = clean.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Malformed Google ID token.');
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    let header: any;
    let payload: any;
    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('Unable to decode Google ID token.');
    }

    if (header?.alg !== 'RS256' || !header?.kid) {
      throw new UnauthorizedException('Unsupported Google ID token signature algorithm.');
    }

    const jwk = await this.findJwkByKid(String(header.kid));
    if (!jwk) {
      throw new UnauthorizedException('Unknown Google signing key (kid).');
    }

    let signatureValid = false;
    try {
      const publicKey = crypto.createPublicKey({
        key: {
          kty: 'RSA',
          n: jwk.n,
          e: jwk.e,
        },
        format: 'jwk',
      });
      const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, 'utf8');
      const signature = Buffer.from(signatureB64, 'base64url');
      signatureValid = crypto.verify('RSA-SHA256', signingInput, publicKey, signature);
    } catch (error: any) {
      this.logger.warn(`Google JWT crypto verification error: ${error.message}`);
      signatureValid = false;
    }

    if (!signatureValid) {
      throw new UnauthorizedException('Invalid Google ID token cryptographic signature.');
    }

    const validIssuers = new Set(['https://accounts.google.com', 'accounts.google.com']);
    if (!validIssuers.has(String(payload?.iss || ''))) {
      throw new UnauthorizedException('Invalid Google ID token issuer.');
    }

    const aud = payload?.aud;
    const audMatches = Array.isArray(aud)
      ? aud.includes(this.clientId)
      : String(aud || '') === this.clientId;
    if (!audMatches) {
      throw new UnauthorizedException('Google ID token audience does not match GOOGLE_CLIENT_ID.');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const exp = Number(payload?.exp || 0);
    if (!Number.isFinite(exp) || exp + 30 <= nowSec) {
      throw new UnauthorizedException('Google ID token has expired.');
    }

    const sub = String(payload?.sub || '').trim();
    const email = String(payload?.email || '').trim().toLowerCase();
    const emailVerified = payload?.email_verified === true || payload?.email_verified === 'true';

    if (!sub || !email) {
      throw new UnauthorizedException('Google ID token is missing required account claims.');
    }
    if (!emailVerified) {
      throw new UnauthorizedException('Your Google email address must be verified to sign in.');
    }

    const rawName = String(payload?.name || payload?.given_name || email.split('@')[0]).trim();
    const picture = String(payload?.picture || '').trim();

    return {
      sub,
      email,
      emailVerified: true,
      name: rawName.slice(0, 80) || 'Learner',
      picture: /^https?:\/\//i.test(picture) ? picture.slice(0, 512) : '',
    };
  }

  private async findJwkByKid(kid: string): Promise<JwkRsaKey | undefined> {
    const keys = await this.getGoogleJwks(false);
    const found = keys.find((k) => k.kid === kid && k.kty === 'RSA');
    if (found) return found;

    // Key rotation: force one fresh fetch if `kid` was not in cached JWKS
    const refreshed = await this.getGoogleJwks(true);
    return refreshed.find((k) => k.kid === kid && k.kty === 'RSA');
  }

  private async getGoogleJwks(forceRefresh: boolean): Promise<JwkRsaKey[]> {
    const now = Date.now();
    if (!forceRefresh && this.jwksCache && this.jwksCache.expiresAt > now) {
      return this.jwksCache.keys;
    }

    const res = await fetch(this.jwksEndpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new ServiceUnavailableException('Unable to reach Google OIDC public key certificates.');
    }

    const cacheControl = res.headers.get('cache-control') || '';
    const maxAgeMatch = /max-age=(\d+)/i.exec(cacheControl);
    const ttlMs = maxAgeMatch
      ? Math.max(60_000, Math.min(24 * 3600_000, Number(maxAgeMatch[1]) * 1000))
      : 3600_000;

    const data: any = await res.json();
    const keys: JwkRsaKey[] = Array.isArray(data?.keys) ? data.keys : [];
    this.jwksCache = {
      keys,
      expiresAt: now + ttlMs,
    };
    return keys;
  }
}
