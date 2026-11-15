import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { SqliteService } from '../../core/database/sqlite.service';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  hasPassword: boolean;
  nativeLanguage: string;
  uiLanguage: string;
  dailyGoalMinutes: number;
  streakDays: number;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SessionClientMeta {
  userAgent?: string;
  ipAddress?: string;
}

export interface ActiveSessionInfo {
  sessionId: string;
  userAgent: string;
  ipAddress: string;
  lastActiveAt: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
  current: boolean;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  nativeLanguage?: string;
  uiLanguage?: string;
  guestToken?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  guestToken?: string;
}

export interface UpdatePreferencesInput {
  name?: string;
  nativeLanguage?: string;
  uiLanguage?: string;
  dailyGoalMinutes?: number;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const OAUTH_ONLY_PASSWORD_SENTINEL = 'oauth_google_only';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly sqlite: SqliteService) {}

  private hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derived}`;
  }

  private hasUsablePassword(storedHash: string): boolean {
    if (!storedHash || storedHash === OAUTH_ONLY_PASSWORD_SENTINEL) return false;
    const parts = storedHash.split(':');
    return parts.length === 2 && parts[0].length >= 16 && parts[1].length >= 32;
  }

  private verifyPassword(password: string, storedHash: string): boolean {
    if (!this.hasUsablePassword(storedHash)) return false;
    const [salt, expectedHex] = storedHash.split(':');
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  }

  private hashSessionToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private rowToUser(row: Record<string, any> | undefined): UserProfile | null {
    if (!row) return null;
    const storedHash = String(row.password_hash || '');
    return {
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      hasPassword: this.hasUsablePassword(storedHash),
      nativeLanguage: String(row.native_language || 'ar'),
      uiLanguage: String(row.ui_language || 'en'),
      dailyGoalMinutes: Number(row.daily_goal_minutes) || 15,
      streakDays: Number(row.streak_days) || 0,
      lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
      createdAt: String(row.created_at),
    };
  }

  register(input: RegisterInput, meta?: SessionClientMeta): { user: UserProfile; token: string } {
    const name = (input?.name || '').trim();
    const email = (input?.email || '').trim().toLowerCase();
    const password = input?.password || '';

    if (!name || name.length < 2) {
      throw new BadRequestException('Please enter your name (at least 2 characters).');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Please enter a valid email address.');
    }
    if (!password || password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long.');
    }

    const existing = this.sqlite.db
      .prepare('SELECT id, password_hash FROM users WHERE email = ?')
      .get(email) as Record<string, any> | undefined;
    if (existing) {
      if (this.hasUsablePassword(String(existing.password_hash || ''))) {
        throw new ConflictException('An account with this email already exists. Please sign in instead.');
      }

      // Upgrade a legacy passwordless account to email+password without losing existing lessons
      const existingId = String(existing.id);
      const now = new Date().toISOString();
      const passwordHash = this.hashPassword(password);
      const nativeLanguage = (input.nativeLanguage || 'ar').trim() || 'ar';
      const uiLanguage = (input.uiLanguage || 'en').trim() || 'en';
      this.sqlite.db
        .prepare(`
          UPDATE users
          SET name = ?,
              password_hash = ?,
              native_language = ?,
              ui_language = ?,
              auth_provider = 'email',
              last_login_at = ?
          WHERE id = ?
        `)
        .run(name, passwordHash, nativeLanguage, uiLanguage, now, existingId);

      if (input.guestToken) {
        this.claimGuestData(input.guestToken, existingId);
      }

      const token = this.createSession(existingId, meta);
      const user = this.getUserById(existingId)!;
      this.logger.log(`Set email password for existing user account: ${email}`);
      return { user, token };
    }

    const userId = uuidv4();
    const now = new Date().toISOString();
    const passwordHash = this.hashPassword(password);
    const nativeLanguage = (input.nativeLanguage || 'ar').trim() || 'ar';
    const uiLanguage = (input.uiLanguage || 'en').trim() || 'en';

    this.sqlite.db
      .prepare(`
        INSERT INTO users (
          id, email, name, password_hash, native_language, ui_language,
          daily_goal_minutes, streak_days, last_practice_date,
          google_sub, avatar_url, auth_provider, email_verified, last_login_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 15, 0, NULL, NULL, '', 'email', 0, ?, ?)
      `)
      .run(userId, email, name, passwordHash, nativeLanguage, uiLanguage, now, now);

    if (input.guestToken) {
      this.claimGuestData(input.guestToken, userId);
    }

    const token = this.createSession(userId, meta);
    const user = this.getUserById(userId)!;
    this.logger.log(`Registered user account: ${email}`);
    return { user, token };
  }

  login(input: LoginInput, meta?: SessionClientMeta): { user: UserProfile; token: string } {
    const email = (input?.email || '').trim().toLowerCase();
    const password = input?.password || '';

    if (!email || !password) {
      throw new BadRequestException('Email and password are required.');
    }

    const row = this.sqlite.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email) as Record<string, any> | undefined;

    if (!row) {
      throw new UnauthorizedException('Incorrect email or password.');
    }

    const storedHash = String(row.password_hash || '');
    if (!this.hasUsablePassword(storedHash)) {
      throw new UnauthorizedException(
        'This account does not have a password yet. Switch to "Create account" with this email to set a password.',
      );
    }

    if (!this.verifyPassword(password, storedHash)) {
      throw new UnauthorizedException('Incorrect email or password.');
    }

    const userId = String(row.id);
    const now = new Date().toISOString();
    this.sqlite.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, userId);

    if (input.guestToken) {
      this.claimGuestData(input.guestToken, userId);
    }

    const token = this.createSession(userId, meta);
    return {
      user: this.getUserById(userId)!,
      token,
    };
  }

  logout(rawToken?: string | null): void {
    if (!rawToken) return;
    const tokenHash = this.hashSessionToken(rawToken);
    this.sqlite.db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
  }

  validateSession(rawToken?: string | null): UserProfile | null {
    if (!rawToken || typeof rawToken !== 'string') return null;
    const tokenHash = this.hashSessionToken(rawToken.trim());
    const now = new Date().toISOString();

    const session = this.sqlite.db
      .prepare('SELECT user_id, expires_at, last_active_at FROM auth_sessions WHERE token_hash = ?')
      .get(tokenHash) as Record<string, any> | undefined;
    if (!session) return null;

    if (String(session.expires_at) <= now) {
      this.sqlite.db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
      return null;
    }

    const prevActive = String(session.last_active_at || '');
    if (!prevActive || Date.now() - new Date(prevActive).getTime() > 120_000) {
      this.sqlite.db
        .prepare('UPDATE auth_sessions SET last_active_at = ? WHERE token_hash = ?')
        .run(now, tokenHash);
    }

    return this.getUserById(String(session.user_id));
  }

  getUserById(userId: string): UserProfile | null {
    const row = this.sqlite.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    return this.rowToUser(row);
  }

  updatePreferences(userId: string, updates: UpdatePreferencesInput): UserProfile {
    const current = this.getUserById(userId);
    if (!current) {
      throw new UnauthorizedException('User account not found.');
    }

    const name = updates.name?.trim() || current.name;
    const nativeLanguage = updates.nativeLanguage?.trim() || current.nativeLanguage;
    const uiLanguage = updates.uiLanguage?.trim() || current.uiLanguage;
    const dailyGoalMinutes = Number.isFinite(Number(updates.dailyGoalMinutes))
      ? Math.max(5, Math.min(180, Math.round(Number(updates.dailyGoalMinutes))))
      : current.dailyGoalMinutes;

    this.sqlite.db
      .prepare(`
        UPDATE users
        SET name = ?, native_language = ?, ui_language = ?, daily_goal_minutes = ?
        WHERE id = ?
      `)
      .run(name, nativeLanguage, uiLanguage, dailyGoalMinutes, userId);

    return this.getUserById(userId)!;
  }

  changeOrSetPassword(
    userId: string,
    input: { currentPassword?: string; newPassword?: string },
    currentSessionToken?: string | null,
  ): UserProfile {
    const row = this.sqlite.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as
      | Record<string, any>
      | undefined;
    if (!row) {
      throw new UnauthorizedException('User account not found.');
    }

    const newPassword = input?.newPassword || '';
    if (newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters long.');
    }

    const storedHash = String(row.password_hash || '');
    if (this.hasUsablePassword(storedHash)) {
      if (!input?.currentPassword || !this.verifyPassword(input.currentPassword, storedHash)) {
        throw new UnauthorizedException('Current password is incorrect.');
      }
    }

    const nextHash = this.hashPassword(newPassword);

    this.sqlite.db
      .prepare("UPDATE users SET password_hash = ?, auth_provider = 'email' WHERE id = ?")
      .run(nextHash, userId);

    if (currentSessionToken) {
      this.revokeOtherSessions(userId, currentSessionToken);
    }

    return this.getUserById(userId)!;
  }

  listSessions(userId: string, currentSessionToken?: string | null): ActiveSessionInfo[] {
    const currentHash = currentSessionToken ? this.hashSessionToken(currentSessionToken) : '';
    const nowIso = new Date().toISOString();

    this.sqlite.db
      .prepare('DELETE FROM auth_sessions WHERE user_id = ? AND expires_at <= ?')
      .run(userId, nowIso);

    const rows = this.sqlite.db
      .prepare(
        `SELECT token_hash, session_id, user_agent, ip_address, last_active_at, created_at, expires_at
         FROM auth_sessions WHERE user_id = ? ORDER BY created_at DESC`,
      )
      .all(userId) as Array<Record<string, any>>;

    return rows.map((r) => {
      const isCurrent = String(r.token_hash) === currentHash;
      return {
        sessionId: String(r.session_id || String(r.token_hash).slice(0, 16)),
        userAgent: String(r.user_agent || 'Browser session'),
        ipAddress: String(r.ip_address || ''),
        lastActiveAt: String(r.last_active_at || r.created_at),
        createdAt: String(r.created_at),
        expiresAt: String(r.expires_at),
        isCurrent,
        current: isCurrent,
      };
    });
  }

  revokeSession(userId: string, sessionId: string): boolean {
    const res = this.sqlite.db
      .prepare('DELETE FROM auth_sessions WHERE user_id = ? AND session_id = ?')
      .run(userId, (sessionId || '').trim());
    return Number(res.changes) > 0;
  }

  revokeOtherSessions(userId: string, currentSessionToken?: string | null): number {
    if (!currentSessionToken) return 0;
    const currentHash = this.hashSessionToken(currentSessionToken);
    const res = this.sqlite.db
      .prepare('DELETE FROM auth_sessions WHERE user_id = ? AND token_hash != ?')
      .run(userId, currentHash);
    return Number(res.changes) || 0;
  }

  deleteAccount(userId: string): void {
    this.sqlite.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    this.logger.log(`Deleted user account and cascaded data: ${userId}`);
  }

  public createSession(userId: string, meta?: SessionClientMeta): string {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashSessionToken(rawToken);
    const sessionId = tokenHash.slice(0, 16);
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

    this.sqlite.db
      .prepare(`
        INSERT INTO auth_sessions (
          token_hash, session_id, user_id, user_agent, ip_address, auth_method, last_active_at, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, 'email', ?, ?, ?)
      `)
      .run(
        tokenHash,
        sessionId,
        userId,
        (meta?.userAgent || '').slice(0, 240),
        (meta?.ipAddress || '').slice(0, 64),
        nowIso,
        expiresAt,
        nowIso,
      );

    return rawToken;
  }

  claimGuestData(guestToken: string, userId: string): void {
    const cleanGuest = (guestToken || '').trim();
    if (!cleanGuest || cleanGuest.length < 8) return;

    this.sqlite.db
      .prepare('UPDATE lessons SET user_id = ?, guest_token = NULL WHERE guest_token = ? AND user_id IS NULL')
      .run(userId, cleanGuest);

    this.sqlite.db
      .prepare('UPDATE vocabulary_items SET user_id = ?, guest_token = NULL WHERE guest_token = ? AND user_id IS NULL')
      .run(userId, cleanGuest);

    this.sqlite.db
      .prepare('UPDATE practice_logs SET user_id = ?, guest_token = NULL WHERE guest_token = ? AND user_id IS NULL')
      .run(userId, cleanGuest);
  }
}
