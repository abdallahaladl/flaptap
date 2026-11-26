import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SqliteService } from '../../core/database/sqlite.service';
import {
  BUILT_IN_SPINE_PACKS,
  computeAutomaticityStage,
} from './think-aloud.catalog';
import {
  AutomaticityOverview,
  CoachingReport,
  DailyRitualStep,
  FluencyMetrics,
  SpeakingRoundMetrics,
  SpineChunkItem,
  ThinkAloudDomain,
  ThinkAloudInputMode,
  ThinkAloudLevel,
  ThinkAloudMode,
  ThinkAloudPromptMeta,
  ThinkAloudSessionRecord,
  ThinkAloudSpinePack,
} from './think-aloud.types';

function safeJsonParse<T>(raw: any, fallback: T): T {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

@Injectable()
export class ThinkAloudRepository {
  constructor(private readonly sqlite: SqliteService) {}

  saveSession(input: {
    userId: string;
    mode: ThinkAloudMode;
    domain: ThinkAloudDomain;
    cefrLevel: ThinkAloudLevel;
    frameworkId: string;
    promptTitle: string;
    promptBody: string;
    promptMeta: ThinkAloudPromptMeta;
    inputMode: ThinkAloudInputMode;
    rounds: SpeakingRoundMetrics[];
    metrics: FluencyMetrics;
    coaching: CoachingReport;
    mediaId?: string;
    modelUsed: string;
    nativeLanguage: string;
  }): ThinkAloudSessionRecord {
    const id = `ta_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    this.sqlite.db
      .prepare(
        `INSERT INTO think_aloud_sessions (
          id, user_id, mode, domain, cefr_level, framework_id,
          prompt_title, prompt_body, prompt_meta_json, input_mode,
          rounds_json, metrics_json, coaching_json,
          directness_score, flow_score, structure_score, naturalness_score, overall_score,
          avg_wpm, total_duration_sec, media_id, model_used, native_language,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.userId,
        input.mode,
        input.domain,
        input.cefrLevel,
        input.frameworkId || '',
        input.promptTitle,
        input.promptBody,
        JSON.stringify(input.promptMeta || {}),
        input.inputMode || 'mic',
        JSON.stringify(input.rounds || []),
        JSON.stringify(input.metrics || {}),
        JSON.stringify(input.coaching || {}),
        input.coaching.directnessScore,
        input.coaching.flowScore,
        input.coaching.structureScore,
        input.coaching.naturalnessScore,
        input.coaching.overallScore,
        input.metrics.avgWpm,
        input.metrics.totalDurationSec,
        input.mediaId || '',
        input.modelUsed || '',
        input.nativeLanguage || 'ar',
        now,
        now,
      );

    this.recordPracticeAndStreak(input.userId, id, input.metrics.totalDurationSec);

    return this.getSessionById(input.userId, id)!;
  }

  recordPracticeAndStreak(userId: string, sessionId: string, durationSec: number): void {
    const now = new Date().toISOString();
    const safeSec = Math.max(15, Math.min(3600, Math.round(Number(durationSec) || 60)));

    this.sqlite.db
      .prepare(
        `INSERT INTO practice_logs (id, user_id, lesson_id, mode, drills_count, duration_sec, created_at)
         VALUES (?, ?, ?, 'think_aloud', 1, ?, ?)`,
      )
      .run(`pl_${randomUUID().replace(/-/g, '').slice(0, 14)}`, userId, sessionId, safeSec, now);

    const user = this.sqlite.db
      .prepare('SELECT streak_days, last_practice_date FROM users WHERE id = ?')
      .get(userId) as Record<string, any> | undefined;
    if (!user) return;

    const today = now.slice(0, 10);
    const last = user.last_practice_date ? String(user.last_practice_date) : '';
    if (last === today) return;

    const yesterdayDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const nextStreak = last === yesterdayDate ? Number(user.streak_days || 0) + 1 : 1;

    this.sqlite.db
      .prepare('UPDATE users SET streak_days = ?, last_practice_date = ? WHERE id = ?')
      .run(nextStreak, today, userId);
  }

  getSessionById(userId: string, id: string): ThinkAloudSessionRecord | null {
    const row = this.sqlite.db
      .prepare('SELECT * FROM think_aloud_sessions WHERE id = ? AND user_id = ?')
      .get(id, userId) as Record<string, any> | undefined;
    return row ? this.rowToSession(row) : null;
  }

  deleteSession(userId: string, id: string): boolean {
    const res = this.sqlite.db
      .prepare('DELETE FROM think_aloud_sessions WHERE id = ? AND user_id = ?')
      .run(id, userId);
    if (Number(res.changes || 0) > 0) {
      this.sqlite.db
        .prepare('DELETE FROM practice_logs WHERE user_id = ? AND lesson_id = ?')
        .run(userId, id);
      return true;
    }
    return false;
  }

  listSessions(
    userId: string,
    query: {
      mode?: string;
      domain?: string;
      q?: string;
      page?: number;
      limit?: number;
    } = {},
  ): {
    items: ThinkAloudSessionRecord[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } {
    const conditions: string[] = ['user_id = ?'];
    const params: any[] = [userId];

    if (query.mode && query.mode !== 'all') {
      conditions.push('mode = ?');
      params.push(query.mode);
    }
    if (query.domain && query.domain !== 'all') {
      conditions.push('domain = ?');
      params.push(query.domain);
    }
    if (query.q && query.q.trim()) {
      const like = `%${query.q.trim().toLowerCase()}%`;
      conditions.push('(LOWER(prompt_title) LIKE ? OR LOWER(prompt_body) LIKE ? OR LOWER(rounds_json) LIKE ?)');
      params.push(like, like, like);
    }

    const whereClause = conditions.join(' AND ');
    const countRow = this.sqlite.db
      .prepare(`SELECT COUNT(*) AS cnt FROM think_aloud_sessions WHERE ${whereClause}`)
      .get(...params) as { cnt?: number };
    const total = Number(countRow?.cnt || 0);

    const limit = Math.max(1, Math.min(50, Number(query.limit) || 12));
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.max(1, Math.min(totalPages, Number(query.page) || 1));
    const offset = (page - 1) * limit;

    const rows = this.sqlite.db
      .prepare(
        `SELECT * FROM think_aloud_sessions WHERE ${whereClause}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Array<Record<string, any>>;

    return {
      items: rows.map((r) => this.rowToSession(r)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  getOverviewMetrics(userId: string): AutomaticityOverview {
    const rows = this.sqlite.db
      .prepare('SELECT * FROM think_aloud_sessions WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Array<Record<string, any>>;

    const sessions = rows.map((r) => this.rowToSession(r));
    const totalSessions = sessions.length;
    const totalDurationSec = sessions.reduce((s, x) => s + x.totalDurationSec, 0);
    const totalSpeakingMinutes = Math.round((totalDurationSec / 60) * 10) / 10;

    const avgWpm =
      totalSessions > 0
        ? Math.round((sessions.reduce((s, x) => s + x.avgWpm, 0) / totalSessions) * 10) / 10
        : 0;
    const avgDirectness =
      totalSessions > 0
        ? Math.round(sessions.reduce((s, x) => s + x.directnessScore, 0) / totalSessions)
        : 0;
    const avgOverallScore =
      totalSessions > 0
        ? Math.round(sessions.reduce((s, x) => s + x.overallScore, 0) / totalSessions)
        : 0;

    // WPM delta comparing recent 3 sessions vs prior sessions
    let wpmDeltaRecent = 0;
    if (sessions.length >= 4) {
      const recent3 = sessions.slice(0, 3);
      const older = sessions.slice(3, 8);
      const rAvg = recent3.reduce((s, x) => s + x.avgWpm, 0) / recent3.length;
      const oAvg = older.reduce((s, x) => s + x.avgWpm, 0) / older.length;
      wpmDeltaRecent = Math.round((rAvg - oAvg) * 10) / 10;
    }

    const fourThreeTwoSessions = sessions.filter((s) => s.mode === 'four_three_two');
    const avgFourThreeTwoGainPct =
      fourThreeTwoSessions.length > 0
        ? Math.round(
            (fourThreeTwoSessions.reduce((s, x) => s + (x.metrics?.wpmGainPct || 0), 0) /
              fourThreeTwoSessions.length) *
              10,
          ) / 10
        : 0;

    const todayPrefix = new Date().toISOString().slice(0, 10);
    const todaySessions = sessions.filter((s) => s.createdAt.startsWith(todayPrefix));

    const warmupMatch = todaySessions.find((s) => s.mode === 'circumlocution');
    const coreMatch = todaySessions.find(
      (s) => s.mode === 'four_three_two' || s.mode === 'framework',
    );
    const transferMatch = todaySessions.find((s) => s.mode === 'camera_qa');

    const steps: DailyRitualStep[] = [
      {
        id: 'warmup_reflex',
        title: '1. Warm-Up Reflex',
        subtitle: 'Circumlocution (Concept -> English)',
        targetModes: ['circumlocution'],
        completed: Boolean(warmupMatch),
        completedSessionId: warmupMatch?.id,
      },
      {
        id: 'core_compression',
        title: '2. Core Compression',
        subtitle: '4/3/2 Loop or Framework Sprint',
        targetModes: ['four_three_two', 'framework'],
        completed: Boolean(coreMatch),
        completedSessionId: coreMatch?.id,
      },
      {
        id: 'real_transfer',
        title: '3. Real-World Transfer',
        subtitle: 'Unscripted Camera & Q&A',
        targetModes: ['camera_qa'],
        completed: Boolean(transferMatch),
        completedSessionId: transferMatch?.id,
      },
    ];

    const completedCount = steps.filter((s) => s.completed).length;

    return {
      totalSessions,
      totalSpeakingMinutes,
      avgWpm,
      wpmDeltaRecent,
      avgDirectness,
      avgOverallScore,
      avgFourThreeTwoGainPct,
      stage: computeAutomaticityStage({
        totalSessions,
        avgWpm,
        avgDirectness,
      }),
      dailyRitual: {
        date: todayPrefix,
        completedCount,
        totalCount: steps.length,
        isComplete: completedCount === steps.length,
        steps,
      },
      recentSessions: sessions.slice(0, 6),
    };
  }

  listSpinePacks(userId?: string | null): ThinkAloudSpinePack[] {
    const customRows = userId
      ? (this.sqlite.db
          .prepare('SELECT * FROM think_aloud_spine_packs WHERE user_id = ? ORDER BY created_at DESC')
          .all(userId) as Array<Record<string, any>>)
      : [];

    // Built-in practice tracking can also be stored per user via a lightweight synthetic pack row or dedicated JSON?
    // Keep built-in packs clean and also merge any user-saved practice state row keyed by `builtin_<userId>_<packId>` if present.
    const stateMap = new Map<string, string[]>();
    if (userId) {
      const stateRows = this.sqlite.db
        .prepare(
          "SELECT id, practiced_ids_json FROM think_aloud_spine_packs WHERE user_id = ? AND id LIKE 'state_%'",
        )
        .all(userId) as Array<{ id: string; practiced_ids_json: string }>;
      for (const r of stateRows) {
        const prefix = `state_${userId}_`;
        if (r.id.startsWith(prefix)) {
          stateMap.set(r.id.slice(prefix.length), safeJsonParse<string[]>(r.practiced_ids_json, []));
        }
      }
    }

    const customPacks = customRows
      .filter((r) => !String(r.id || '').startsWith('state_'))
      .map((r) => this.rowToSpinePack(r));

    const builtIns = BUILT_IN_SPINE_PACKS.map((p) => {
      const practicedIds = stateMap.get(p.id) || [];
      const totalItems = p.starters.length + p.engines.length + p.tails.length + p.chunks.length;
      const practicedCount = practicedIds.length;
      return {
        ...p,
        practicedIds,
        totalItems,
        practicedCount,
        isCompleted: totalItems > 0 && practicedCount >= totalItems,
      };
    });

    return [...customPacks, ...builtIns];
  }

  saveSpinePack(input: {
    userId: string;
    title: string;
    domain: ThinkAloudDomain;
    topic: string;
    starters: SpineChunkItem[];
    engines: SpineChunkItem[];
    tails: SpineChunkItem[];
    chunks: SpineChunkItem[];
    modelUsed: string;
  }): ThinkAloudSpinePack {
    const id = `sp_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    this.sqlite.db
      .prepare(
        `INSERT INTO think_aloud_spine_packs (
          id, user_id, title, domain, topic,
          starters_json, engines_json, tails_json, chunks_json,
          practiced_ids_json, model_used, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?)`,
      )
      .run(
        id,
        input.userId,
        input.title,
        input.domain,
        input.topic,
        JSON.stringify(input.starters || []),
        JSON.stringify(input.engines || []),
        JSON.stringify(input.tails || []),
        JSON.stringify(input.chunks || []),
        input.modelUsed || '',
        now,
        now,
      );

    const row = this.sqlite.db
      .prepare('SELECT * FROM think_aloud_spine_packs WHERE id = ? AND user_id = ?')
      .get(id, input.userId) as Record<string, any>;
    return this.rowToSpinePack(row);
  }

  toggleSpineItemPracticed(
    userId: string,
    packId: string,
    itemId: string,
  ): ThinkAloudSpinePack | null {
    const builtIn = BUILT_IN_SPINE_PACKS.find((p) => p.id === packId);
    const now = new Date().toISOString();

    if (builtIn) {
      const validIds = new Set(
        [...builtIn.starters, ...builtIn.engines, ...builtIn.tails, ...builtIn.chunks].map((x) => x.id),
      );
      if (!validIds.has(itemId)) return null;

      const stateId = `state_${userId}_${packId}`;
      const existing = this.sqlite.db
        .prepare('SELECT practiced_ids_json FROM think_aloud_spine_packs WHERE id = ? AND user_id = ?')
        .get(stateId, userId) as { practiced_ids_json?: string } | undefined;

      const set = new Set<string>(safeJsonParse<string[]>(existing?.practiced_ids_json, []));
      if (set.has(itemId)) set.delete(itemId);
      else set.add(itemId);
      const nextIds = [...set].filter((id) => validIds.has(id));

      if (existing) {
        this.sqlite.db
          .prepare('UPDATE think_aloud_spine_packs SET practiced_ids_json = ?, updated_at = ? WHERE id = ? AND user_id = ?')
          .run(JSON.stringify(nextIds), now, stateId, userId);
      } else {
        this.sqlite.db
          .prepare(
            `INSERT INTO think_aloud_spine_packs (
              id, user_id, title, domain, topic, starters_json, engines_json, tails_json, chunks_json,
              practiced_ids_json, model_used, created_at, updated_at
            ) VALUES (?, ?, ?, ?, '', '[]', '[]', '[]', '[]', ?, 'state', ?, ?)`,
          )
          .run(stateId, userId, builtIn.title, builtIn.domain, JSON.stringify(nextIds), now, now);
      }

      return this.listSpinePacks(userId).find((p) => p.id === packId) || null;
    }

    const row = this.sqlite.db
      .prepare('SELECT * FROM think_aloud_spine_packs WHERE id = ? AND user_id = ?')
      .get(packId, userId) as Record<string, any> | undefined;
    if (!row) return null;

    const pack = this.rowToSpinePack(row);
    const validIds = new Set(
      [...pack.starters, ...pack.engines, ...pack.tails, ...pack.chunks].map((x) => x.id),
    );
    if (!validIds.has(itemId)) return null;

    const set = new Set<string>(pack.practicedIds);
    if (set.has(itemId)) set.delete(itemId);
    else set.add(itemId);
    const nextIds = [...set].filter((id) => validIds.has(id));

    this.sqlite.db
      .prepare('UPDATE think_aloud_spine_packs SET practiced_ids_json = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(JSON.stringify(nextIds), now, packId, userId);

    const updated = this.sqlite.db
      .prepare('SELECT * FROM think_aloud_spine_packs WHERE id = ? AND user_id = ?')
      .get(packId, userId) as Record<string, any>;
    return this.rowToSpinePack(updated);
  }

  deleteSpinePack(userId: string, packId: string): boolean {
    if (packId.startsWith('builtin_') || packId.startsWith('state_')) return false;
    const res = this.sqlite.db
      .prepare('DELETE FROM think_aloud_spine_packs WHERE id = ? AND user_id = ?')
      .run(packId, userId);
    return Number(res.changes || 0) > 0;
  }

  private rowToSession(row: Record<string, any>): ThinkAloudSessionRecord {
    const promptMeta = safeJsonParse<ThinkAloudPromptMeta>(row.prompt_meta_json, {});
    const rounds = safeJsonParse<SpeakingRoundMetrics[]>(row.rounds_json, []);
    const metrics = safeJsonParse<FluencyMetrics>(row.metrics_json, {
      totalWords: 0,
      totalDurationSec: Number(row.total_duration_sec) || 0,
      avgWpm: Number(row.avg_wpm) || 0,
      totalFillers: 0,
      fillerRatePer100: 0,
      uniqueWordRatio: 0,
      wpmGainPct: 0,
      forbiddenHitsTotal: 0,
      rounds,
    });
    const coaching = safeJsonParse<CoachingReport>(row.coaching_json, {
      directnessScore: Number(row.directness_score) || 0,
      flowScore: Number(row.flow_score) || 0,
      structureScore: Number(row.structure_score) || 0,
      naturalnessScore: Number(row.naturalness_score) || 0,
      overallScore: Number(row.overall_score) || 0,
      headlineVerdict: '',
      strengths: [],
      calquesAndUpgrades: [],
      shadowableRecast: '',
      extractedChunks: [],
      microMission: '',
    });

    return {
      id: String(row.id),
      userId: String(row.user_id),
      mode: row.mode as ThinkAloudMode,
      domain: row.domain as ThinkAloudDomain,
      cefrLevel: (row.cefr_level || 'B2') as ThinkAloudLevel,
      frameworkId: String(row.framework_id || ''),
      promptTitle: String(row.prompt_title || ''),
      promptBody: String(row.prompt_body || ''),
      promptMeta,
      inputMode: (row.input_mode || 'mic') as ThinkAloudInputMode,
      rounds,
      metrics,
      coaching,
      directnessScore: Number(row.directness_score) || 0,
      flowScore: Number(row.flow_score) || 0,
      structureScore: Number(row.structure_score) || 0,
      naturalnessScore: Number(row.naturalness_score) || 0,
      overallScore: Number(row.overall_score) || 0,
      avgWpm: Number(row.avg_wpm) || 0,
      totalDurationSec: Number(row.total_duration_sec) || 0,
      mediaId: String(row.media_id || ''),
      modelUsed: String(row.model_used || ''),
      nativeLanguage: String(row.native_language || 'ar'),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private rowToSpinePack(row: Record<string, any>): ThinkAloudSpinePack {
    const starters = safeJsonParse<SpineChunkItem[]>(row.starters_json, []);
    const engines = safeJsonParse<SpineChunkItem[]>(row.engines_json, []);
    const tails = safeJsonParse<SpineChunkItem[]>(row.tails_json, []);
    const chunks = safeJsonParse<SpineChunkItem[]>(row.chunks_json, []);
    const practicedIds = safeJsonParse<string[]>(row.practiced_ids_json, []);
    const totalItems = starters.length + engines.length + tails.length + chunks.length;
    const practicedCount = practicedIds.length;

    return {
      id: String(row.id),
      userId: String(row.user_id),
      isBuiltIn: false,
      title: String(row.title || 'Custom Spine Pack'),
      domain: (row.domain || 'custom') as ThinkAloudDomain,
      topic: String(row.topic || ''),
      starters,
      engines,
      tails,
      chunks,
      practicedIds,
      totalItems,
      practicedCount,
      isCompleted: totalItems > 0 && practicedCount >= totalItems,
      modelUsed: String(row.model_used || ''),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}
