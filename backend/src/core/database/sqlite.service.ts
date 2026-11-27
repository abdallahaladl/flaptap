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
        is_completed INTEGER NOT NULL DEFAULT 0,
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
        general_translation TEXT NOT NULL DEFAULT '',
        translation TEXT NOT NULL DEFAULT '',
        context_sentence TEXT NOT NULL DEFAULT '',
        timestamp_sec REAL NOT NULL DEFAULT 0,
        mastery_level INTEGER NOT NULL DEFAULT 0,
        is_completed INTEGER NOT NULL DEFAULT 0,
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

      DROP TABLE IF EXISTS tech_linguist_extractions;

      CREATE TABLE IF NOT EXISTS american_extractor_notes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        creator TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        speaker_style TEXT NOT NULL DEFAULT '',
        source_type TEXT NOT NULL DEFAULT 'text',
        source_url TEXT NOT NULL DEFAULT '',
        source_label TEXT NOT NULL DEFAULT '',
        source_meta_json TEXT NOT NULL DEFAULT '{}',
        target_language TEXT NOT NULL DEFAULT 'ar',
        agent_name TEXT NOT NULL DEFAULT '',
        model_name TEXT NOT NULL DEFAULT '',
        reasoning_level TEXT NOT NULL DEFAULT '',
        execution_time_ms INTEGER NOT NULL DEFAULT 0,
        fallback_from TEXT NOT NULL DEFAULT '',
        item_count INTEGER NOT NULL DEFAULT 0,
        items_json TEXT NOT NULL DEFAULT '[]',
        source_text TEXT NOT NULL DEFAULT '',
        is_completed INTEGER NOT NULL DEFAULT 0,
        completion_json TEXT NOT NULL DEFAULT '{}',
        content_hash TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_aex_notes_user_created
        ON american_extractor_notes(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS learning_library_batches (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        domain_id TEXT NOT NULL,
        category_filter TEXT NOT NULL DEFAULT 'all',
        focus_topic TEXT NOT NULL DEFAULT '',
        requested_count INTEGER NOT NULL DEFAULT 8,
        generated_count INTEGER NOT NULL DEFAULT 0,
        skipped_duplicates_count INTEGER NOT NULL DEFAULT 0,
        agent_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        model_name TEXT NOT NULL,
        variant_name TEXT NOT NULL DEFAULT '',
        execution_time_ms INTEGER NOT NULL DEFAULT 0,
        fallback_from TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ll_batches_user_created
        ON learning_library_batches(user_id, domain_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS learning_library_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        batch_id TEXT REFERENCES learning_library_batches(id) ON DELETE SET NULL,
        domain_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        category_label TEXT NOT NULL,
        expression TEXT NOT NULL,
        canonical_key TEXT NOT NULL,
        slug_key TEXT NOT NULL,
        token_signature TEXT NOT NULL DEFAULT '',
        register TEXT NOT NULL DEFAULT '',
        tone TEXT NOT NULL DEFAULT '',
        level TEXT NOT NULL DEFAULT '',
        ipa TEXT NOT NULL DEFAULT '',
        spoken_form TEXT NOT NULL DEFAULT '',
        phonetic_breakdown TEXT NOT NULL DEFAULT '',
        core_meaning TEXT NOT NULL,
        localized_meaning TEXT NOT NULL DEFAULT '',
        target_language TEXT NOT NULL DEFAULT 'ar',
        textbook_equivalent TEXT NOT NULL DEFAULT '',
        native_context TEXT NOT NULL DEFAULT '',
        mistakes_to_avoid TEXT NOT NULL DEFAULT '',
        variations_json TEXT NOT NULL DEFAULT '[]',
        combinations_json TEXT NOT NULL DEFAULT '[]',
        usage_patterns_json TEXT NOT NULL DEFAULT '[]',
        pattern_slots_json TEXT NOT NULL DEFAULT '[]',
        examples_json TEXT NOT NULL DEFAULT '[]',
        related_json TEXT NOT NULL DEFAULT '[]',
        search_blob TEXT NOT NULL DEFAULT '',
        is_favorite INTEGER NOT NULL DEFAULT 0,
        is_completed INTEGER NOT NULL DEFAULT 0,
        mastery_status TEXT NOT NULL DEFAULT 'new',
        review_count INTEGER NOT NULL DEFAULT 0,
        user_notes TEXT NOT NULL DEFAULT '',
        agent_name TEXT NOT NULL DEFAULT '',
        model_name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_ll_items_unique_canonical
        ON learning_library_items(user_id, domain_id, canonical_key);
      CREATE INDEX IF NOT EXISTS idx_ll_items_slug
        ON learning_library_items(user_id, domain_id, slug_key);
      CREATE INDEX IF NOT EXISTS idx_ll_items_user_domain_cat
        ON learning_library_items(user_id, domain_id, category_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ll_items_user_mastery
        ON learning_library_items(user_id, domain_id, mastery_status, is_favorite);

      CREATE TABLE IF NOT EXISTS shared_sources (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_key TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'text',
        title TEXT NOT NULL DEFAULT '',
        creator TEXT NOT NULL DEFAULT '',
        source_url TEXT NOT NULL DEFAULT '',
        source_label TEXT NOT NULL DEFAULT '',
        mime_type TEXT NOT NULL DEFAULT '',
        file_name TEXT NOT NULL DEFAULT '',
        has_audio INTEGER NOT NULL DEFAULT 0,
        has_video INTEGER NOT NULL DEFAULT 0,
        media_kind TEXT NOT NULL DEFAULT 'none',
        media_id TEXT NOT NULL DEFAULT '',
        duration_seconds REAL NOT NULL DEFAULT 0,
        transcript_text TEXT NOT NULL DEFAULT '',
        segments_json TEXT NOT NULL DEFAULT '[]',
        source_meta_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_sources_user_key
        ON shared_sources(user_id, source_key);
      CREATE INDEX IF NOT EXISTS idx_shared_sources_user_updated
        ON shared_sources(user_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_shared_sources_media
        ON shared_sources(user_id, media_id);

      CREATE TABLE IF NOT EXISTS user_ai_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider_id TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        encrypted_key TEXT NOT NULL,
        key_mask TEXT NOT NULL,
        key_fingerprint TEXT NOT NULL,
        base_url TEXT NOT NULL DEFAULT '',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_user_ai_keys_user
        ON user_ai_keys(user_id, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_ai_keys_unique_fp
        ON user_ai_keys(user_id, key_fingerprint);

      CREATE TABLE IF NOT EXISTS think_aloud_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mode TEXT NOT NULL,
        domain TEXT NOT NULL,
        cefr_level TEXT NOT NULL DEFAULT 'B2',
        framework_id TEXT NOT NULL DEFAULT '',
        prompt_title TEXT NOT NULL,
        prompt_body TEXT NOT NULL,
        prompt_meta_json TEXT NOT NULL DEFAULT '{}',
        input_mode TEXT NOT NULL DEFAULT 'mic',
        rounds_json TEXT NOT NULL DEFAULT '[]',
        metrics_json TEXT NOT NULL DEFAULT '{}',
        coaching_json TEXT NOT NULL DEFAULT '{}',
        directness_score INTEGER NOT NULL DEFAULT 0,
        flow_score INTEGER NOT NULL DEFAULT 0,
        structure_score INTEGER NOT NULL DEFAULT 0,
        naturalness_score INTEGER NOT NULL DEFAULT 0,
        overall_score INTEGER NOT NULL DEFAULT 0,
        avg_wpm REAL NOT NULL DEFAULT 0,
        total_duration_sec INTEGER NOT NULL DEFAULT 0,
        media_id TEXT NOT NULL DEFAULT '',
        model_used TEXT NOT NULL DEFAULT '',
        native_language TEXT NOT NULL DEFAULT 'ar',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ta_sessions_user_created
        ON think_aloud_sessions(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ta_sessions_user_mode
        ON think_aloud_sessions(user_id, mode, created_at DESC);

      CREATE TABLE IF NOT EXISTS think_aloud_spine_packs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        domain TEXT NOT NULL,
        topic TEXT NOT NULL DEFAULT '',
        starters_json TEXT NOT NULL DEFAULT '[]',
        engines_json TEXT NOT NULL DEFAULT '[]',
        tails_json TEXT NOT NULL DEFAULT '[]',
        chunks_json TEXT NOT NULL DEFAULT '[]',
        practiced_ids_json TEXT NOT NULL DEFAULT '[]',
        model_used TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ta_spines_user_created
        ON think_aloud_spine_packs(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        feature TEXT NOT NULL,
        scope TEXT NOT NULL,
        target_id TEXT NOT NULL DEFAULT '',
        target_label TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        purged_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_events_user_created
        ON audit_events(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS ai_chat_threads (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT 'New Chat',
        persona TEXT NOT NULL DEFAULT 'smart_mentor',
        context_type TEXT NOT NULL DEFAULT 'general',
        context_id TEXT NOT NULL DEFAULT '',
        context_label TEXT NOT NULL DEFAULT '',
        context_snapshot_json TEXT NOT NULL DEFAULT '{}',
        is_pinned INTEGER NOT NULL DEFAULT 0,
        model_used TEXT NOT NULL DEFAULT '',
        message_count INTEGER NOT NULL DEFAULT 0,
        last_message_preview TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ai_chat_threads_user_updated
        ON ai_chat_threads(user_id, is_pinned DESC, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_chat_threads_user_context
        ON ai_chat_threads(user_id, context_type, context_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS ai_chat_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES ai_chat_threads(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        reasoning TEXT NOT NULL DEFAULT '',
        quote_json TEXT NOT NULL DEFAULT '{}',
        attachments_json TEXT NOT NULL DEFAULT '[]',
        model_name TEXT NOT NULL DEFAULT '',
        provider_name TEXT NOT NULL DEFAULT '',
        variant_used TEXT NOT NULL DEFAULT '',
        execution_time_ms INTEGER NOT NULL DEFAULT 0,
        finish_reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_thread_created
        ON ai_chat_messages(thread_id, created_at ASC);

      CREATE TABLE IF NOT EXISTS ai_chat_preferences (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        default_persona TEXT NOT NULL DEFAULT 'smart_mentor',
        response_style TEXT NOT NULL DEFAULT 'balanced',
        response_language TEXT NOT NULL DEFAULT 'auto',
        temperature REAL NOT NULL DEFAULT 0.45,
        custom_instructions TEXT NOT NULL DEFAULT '',
        use_page_context INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
    `);

    // Idempotent schema migrations for pre-existing databases
    this.ensureColumn('vocabulary_items', 'general_translation', "TEXT NOT NULL DEFAULT ''");
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
    this.ensureColumn('lessons', 'is_completed', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('lessons', 'completed_items_count', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('lessons', 'total_items_count', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('vocabulary_items', 'is_completed', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('learning_library_items', 'is_completed', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn(
      'learning_library_items',
      'pattern_slots_json',
      "TEXT NOT NULL DEFAULT '[]'",
    );
    this.ensureColumn('learning_library_items', 'cefr', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('american_extractor_notes', 'content_hash', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('american_extractor_notes', 'updated_at', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('american_extractor_notes', 'source_id', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('lessons', 'source_id', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('lessons', 'source_key', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('lessons', 'platform', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('lessons', 'media_kind', "TEXT NOT NULL DEFAULT 'none'");
    this.ensureColumn('lessons', 'review_status', "TEXT NOT NULL DEFAULT 'pending'");
    this.ensureColumn('lessons', 'speaker_count', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('lessons', 'repair_count', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('lessons', 'word_count', 'INTEGER NOT NULL DEFAULT 0');

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_aex_notes_user_hash
      ON american_extractor_notes(user_id, content_hash);

      CREATE INDEX IF NOT EXISTS idx_aex_notes_user_source
      ON american_extractor_notes(user_id, source_id);

      CREATE INDEX IF NOT EXISTS idx_lessons_user_source
      ON lessons(user_id, source_id);

      CREATE INDEX IF NOT EXISTS idx_lessons_user_source_key
      ON lessons(user_id, source_key);

      UPDATE american_extractor_notes
      SET updated_at = created_at
      WHERE updated_at = '' OR updated_at IS NULL;

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
