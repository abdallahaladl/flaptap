import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SqliteService implements OnModuleDestroy {
  private readonly logger = new Logger(SqliteService.name);
  public readonly dbPath: string;
  public readonly db: DatabaseSync;

  constructor() {
    const customPath = (process.env.FLAPTAP_SQLITE_PATH || '').trim();
    if (customPath) {
      const dir = path.dirname(path.resolve(customPath));
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      this.dbPath = path.resolve(customPath);
    } else {
      const dataDir = path.resolve(__dirname, '../../../../data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      this.dbPath = path.join(dataDir, 'flaptap.sqlite');
    }
    this.db = new DatabaseSync(this.dbPath);

    this.initializeSchema();
    this.logger.log(`SQLite relational engine ready at ${this.dbPath}`);
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
    const exists = cols.some((c) => String(c.name).toLowerCase() === column.toLowerCase());
    if (!exists) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    }
  }

  private initializeSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        native_language TEXT NOT NULL DEFAULT 'ar',
        ui_language TEXT NOT NULL DEFAULT 'en',
        daily_goal_minutes INTEGER NOT NULL DEFAULT 15,
        streak_days INTEGER NOT NULL DEFAULT 0,
        last_practice_date TEXT,
        google_sub TEXT,
        avatar_url TEXT NOT NULL DEFAULT '',
        auth_provider TEXT NOT NULL DEFAULT 'email',
        email_verified INTEGER NOT NULL DEFAULT 0,
        last_login_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash TEXT PRIMARY KEY,
        session_id TEXT NOT NULL DEFAULT '',
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_agent TEXT NOT NULL DEFAULT '',
        ip_address TEXT NOT NULL DEFAULT '',
        auth_method TEXT NOT NULL DEFAULT 'email',
        last_active_at TEXT NOT NULL DEFAULT '',
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

      CREATE TABLE IF NOT EXISTS oauth_states (
        state TEXT PRIMARY KEY,
        code_verifier TEXT NOT NULL,
        return_to TEXT NOT NULL DEFAULT '/',
        mode TEXT NOT NULL DEFAULT 'popup',
        ui_language TEXT NOT NULL DEFAULT 'en',
        native_language TEXT NOT NULL DEFAULT 'ar',
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lessons (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        guest_token TEXT,
        track TEXT NOT NULL,
        video_id TEXT,
        source_url TEXT NOT NULL,
        title TEXT NOT NULL,
        creator TEXT NOT NULL,
        thumbnail_url TEXT NOT NULL,
        accent_dialect TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        pacing_wpm INTEGER NOT NULL DEFAULT 140,
        difficulty TEXT NOT NULL DEFAULT 'Intermediate',
        cefr_level TEXT DEFAULT '',
        sentences_count INTEGER NOT NULL DEFAULT 0,
        chunks_count INTEGER NOT NULL DEFAULT 0,
        completed_drills INTEGER NOT NULL DEFAULT 0,
        study_notes TEXT NOT NULL DEFAULT '',
        analysis_status TEXT NOT NULL DEFAULT 'pending',
        cached_langs TEXT NOT NULL DEFAULT '',
        ai_insights_count INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_lessons_user_created ON lessons(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_lessons_guest_created ON lessons(guest_token, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_lessons_track_video ON lessons(track, video_id);

      CREATE TABLE IF NOT EXISTS vocabulary_items (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        guest_token TEXT,
        lesson_id TEXT,
        video_id TEXT DEFAULT '',
        lesson_title TEXT DEFAULT '',
        term TEXT NOT NULL,
        ipa TEXT NOT NULL DEFAULT '',
        part_of_speech TEXT NOT NULL DEFAULT '',
        definition TEXT NOT NULL,
        translation TEXT NOT NULL DEFAULT '',
        context_sentence TEXT NOT NULL DEFAULT '',
        timestamp_sec REAL NOT NULL DEFAULT 0,
        mastery_level INTEGER NOT NULL DEFAULT 0,
        next_review_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_vocab_user ON vocabulary_items(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_vocab_guest ON vocabulary_items(guest_token, created_at DESC);

      CREATE TABLE IF NOT EXISTS practice_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        guest_token TEXT,
        lesson_id TEXT,
        mode TEXT NOT NULL DEFAULT 'shadow',
        drills_count INTEGER NOT NULL DEFAULT 1,
        duration_sec INTEGER NOT NULL DEFAULT 30,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_practice_user_date ON practice_logs(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_practice_guest_date ON practice_logs(guest_token, created_at DESC);
    `);

    // Idempotent schema migrations for pre-existing databases
    this.ensureColumn('users', 'google_sub', 'TEXT');
    this.ensureColumn('users', 'avatar_url', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('users', 'auth_provider', "TEXT NOT NULL DEFAULT 'email'");
    this.ensureColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('users', 'last_login_at', 'TEXT');

    this.ensureColumn('auth_sessions', 'session_id', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('auth_sessions', 'user_agent', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('auth_sessions', 'ip_address', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('auth_sessions', 'auth_method', "TEXT NOT NULL DEFAULT 'email'");
    this.ensureColumn('auth_sessions', 'last_active_at', "TEXT NOT NULL DEFAULT ''");

    this.ensureColumn('lessons', 'cached_langs', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('lessons', 'ai_insights_count', 'INTEGER NOT NULL DEFAULT 0');

    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
      ON users(google_sub)
      WHERE google_sub IS NOT NULL AND google_sub != '';

      UPDATE auth_sessions
      SET session_id = SUBSTR(token_hash, 1, 16)
      WHERE session_id = '' OR session_id IS NULL;
    `);
  }

  onModuleDestroy(): void {
    try {
      this.db.close();
    } catch {
      // Already closed
    }
  }
}
