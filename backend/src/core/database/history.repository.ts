import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SqliteService } from './sqlite.service';
import { escapeTranscriptHtml, highlightsAreVerbatim, sanitizeVerbatimHtml } from '../linguistics/highlights';
import { segmentParagraphs, segmentSentences } from '../linguistics/segmentation';

export interface RequestIdentityScope {
  userId?: string | null;
  guestToken?: string | null;
}

export interface ChunkItem {
  index?: number;
  timeRange: string;
  time_range?: string;
  start?: string;
  end?: string;
  startSec: number;
  endSec: number;
  sentenceIndices?: number[];
  title?: string;
  text: string;
  highlightedHtml: string;
}

export interface SentenceItem {
  id: string;
  index: number;
  timeRange: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  text: string;
  highlightedHtml: string;
  translations?: Record<string, string>;
}

export interface ConnectedSpeechEntry {
  exactPhrase: string;
  spokenIpa: string;
  phenomenon: string;
  mechanics: string;
  sentenceIndex: number;
}

export interface ExpressionEntry {
  phrase: string;
  meaning: string;
  register: string;
  usageNote: string;
  sentenceIndex: number;
}

export interface VocabularyCoachEntry {
  term: string;
  ipa: string;
  partOfSpeech: string;
  definition: string;
  sentenceIndex: number;
}

export interface AiCoachAnalysis {
  version: number;
  analyzedAt: string;
  aiModel: string;
  overview: {
    summary: string;
    speakerStyle: string;
    cefrLevel: 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
    focusTips: string[];
  };
  connectedSpeech: ConnectedSpeechEntry[];
  expressions: ExpressionEntry[];
  vocabulary: VocabularyCoachEntry[];
}

export interface LessonCacheInfo {
  transcriptCached: boolean;
  transcriptBytes: number;
  aiCoachCached: boolean;
  aiInsightsCount: number;
  translationLanguages: string[];
  hasNotes: boolean;
}

export interface HistoryItem {
  id: string;
  userId?: string | null;
  guestToken?: string | null;
  track: 'shadowing' | 'street_talk' | 'phonetics' | 'creator_script';
  trackTitle: string;
  title: string;
  creator: string;
  videoId?: string;
  sourceUrl: string;
  thumbnailUrl: string;
  accentDialect: string;
  durationSeconds: number;
  pacingWpm: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  cefrLevel?: string;
  sentencesCount?: number;
  chunksCount: number;
  analysisStatus?: 'pending' | 'ready';
  aiAnalysis?: AiCoachAnalysis;
  stats: {
    totalWords: number;
    sentencesCount: number;
    connectedCount: number;
    expressionsCount: number;
    vocabularyCount: number;
  };
  chunks?: ChunkItem[];
  sentences?: SentenceItem[];
  translationsCache?: Record<string, Record<number, string>>;
  translationEngineVersion?: number;
  timingVersion?: number;
  segmentationVersion?: number;
  studyNotes?: string;
  noteMarkdown: string;
  payloadBytes?: number;
  cacheInfo?: LessonCacheInfo;
  createdAt: string;
  updatedAt?: string;
  completedDrills: number;
}

export type HistorySummary = Omit<
  HistoryItem,
  'chunks' | 'sentences' | 'noteMarkdown' | 'translationsCache' | 'aiAnalysis'
>;

export type CacheClearScope = 'all' | 'coach' | 'translations' | 'transcript';

@Injectable()
export class HistoryRepository {
  private readonly logger = new Logger(HistoryRepository.name);
  private readonly transcriptCacheDir = path.resolve(__dirname, '../../../../data/transcripts');

  constructor(private readonly sqlite: SqliteService) {
    this.backfillCacheMetadataColumns();
  }

  private backfillCacheMetadataColumns(): void {
    try {
      const rows = this.sqlite.db
        .prepare(
          `SELECT id, payload_json FROM lessons WHERE cached_langs = '' AND ai_insights_count = 0 LIMIT 250`,
        )
        .all() as Array<Record<string, any>>;

      for (const r of rows) {
        try {
          const parsed: HistoryItem = JSON.parse(String(r.payload_json));
          const langs = Object.keys(parsed.translationsCache || {}).sort().join(',');
          const insights = parsed.aiAnalysis
            ? (parsed.aiAnalysis.connectedSpeech?.length || 0) +
              (parsed.aiAnalysis.expressions?.length || 0) +
              (parsed.aiAnalysis.vocabulary?.length || 0)
            : 0;
          if (langs || insights > 0) {
            this.sqlite.db
              .prepare('UPDATE lessons SET cached_langs = ?, ai_insights_count = ? WHERE id = ?')
              .run(langs, insights, String(r.id));
          }
        } catch {
          // Ignore malformed legacy row
        }
      }
    } catch {
      // Non-fatal
    }
  }

  private cleanTrackTitle(track: string): string {
    switch (track) {
      case 'street_talk':
        return 'Dialogue Practice';
      case 'phonetics':
        return 'Pronunciation Workout';
      default:
        return 'Video Lesson';
    }
  }

  public buildCleanMarkdown(
    title: string,
    creator: string,
    sourceUrl: string,
    chunks: ChunkItem[] = [],
    analysis?: AiCoachAnalysis,
    studyNotes?: string,
  ): string {
    const lines: string[] = [
      `# ${title || 'English Lesson'}`,
      `> **Source:** ${creator || 'Creator'}${sourceUrl ? ` · ${sourceUrl}` : ''}`,
      '',
    ];

    if (studyNotes && studyNotes.trim()) {
      lines.push('## Personal Study Notes', '', studyNotes.trim(), '');
    }

    if (analysis) {
      lines.push(
        '## Coaching Overview',
        `- **CEFR Level:** ${analysis.overview.cefrLevel}`,
        `- **Delivery Style:** ${analysis.overview.speakerStyle}`,
        `- **Summary:** ${analysis.overview.summary}`,
        '',
      );

      if (analysis.connectedSpeech.length > 0) {
        lines.push(
          '## Connected Speech & Prosody',
          '| Spoken Phrase | IPA / Sound | Phenomenon | Articulatory Mechanics |',
          '| :--- | :--- | :--- | :--- |',
          ...analysis.connectedSpeech.map(
            (c) => `| \`${c.exactPhrase}\` | **${c.spokenIpa}** | ${c.phenomenon} | ${c.mechanics} |`,
          ),
          '',
        );
      }

      if (analysis.expressions.length > 0) {
        lines.push(
          '## Expressions & Idioms',
          '| Expression | Meaning | Register | Usage Note |',
          '| :--- | :--- | :--- | :--- |',
          ...analysis.expressions.map(
            (e) => `| **${e.phrase}** | ${e.meaning} | ${e.register} | ${e.usageNote} |`,
          ),
          '',
        );
      }

      if (analysis.vocabulary.length > 0) {
        lines.push(
          '## Key Vocabulary',
          '| Term | IPA | Part of Speech | Contextual Definition |',
          '| :--- | :--- | :--- | :--- |',
          ...analysis.vocabulary.map(
            (v) => `| **${v.term}** | ${v.ipa} | *${v.partOfSpeech}* | ${v.definition} |`,
          ),
          '',
        );
      }
    }

    lines.push('## Transcript Paragraphs', '');
    for (const chunk of chunks) {
      lines.push(`### ${chunk.timeRange}`, chunk.text, '');
    }

    return lines.join('\n');
  }

  /**
   * Strict account isolation: every user only ever sees and controls their own
   * personal history, caches, notes, and practice records.
   */
  private scopeWhereClause(scope?: RequestIdentityScope): { sql: string; params: any[] } {
    if (scope?.userId) {
      return {
        sql: 'user_id = ?',
        params: [scope.userId],
      };
    }
    return {
      sql: '1 = 0',
      params: [],
    };
  }

  private getTranscriptCacheFileStats(videoId?: string): { cached: boolean; bytes: number } {
    if (!videoId) return { cached: false, bytes: 0 };
    try {
      const file = path.join(this.transcriptCacheDir, `${videoId}.json`);
      if (!fs.existsSync(file)) return { cached: false, bytes: 0 };
      const st = fs.statSync(file);
      return { cached: true, bytes: st.size };
    } catch {
      return { cached: false, bytes: 0 };
    }
  }

  private deleteTranscriptCacheFile(videoId?: string): boolean {
    if (!videoId) return false;
    try {
      const file = path.join(this.transcriptCacheDir, `${videoId}.json`);
      if (!fs.existsSync(file)) return false;
      fs.unlinkSync(file);
      return true;
    } catch {
      return false;
    }
  }

  private rowToItem(row: Record<string, any> | undefined): HistoryItem | undefined {
    if (!row) return undefined;
    try {
      const payload: HistoryItem = JSON.parse(String(row.payload_json));
      payload.id = String(row.id);
      payload.userId = row.user_id ? String(row.user_id) : null;
      payload.guestToken = row.guest_token ? String(row.guest_token) : null;
      payload.completedDrills = Number(row.completed_drills ?? payload.completedDrills ?? 0);
      payload.studyNotes = String(row.study_notes ?? payload.studyNotes ?? '');
      payload.analysisStatus = (row.analysis_status as 'pending' | 'ready') || payload.analysisStatus || 'pending';
      payload.cefrLevel = String(row.cefr_level ?? payload.cefrLevel ?? '');
      payload.sentencesCount = Number(row.sentences_count ?? payload.sentences?.length ?? 0);
      payload.chunksCount = Number(row.chunks_count ?? payload.chunks?.length ?? 0);
      payload.createdAt = String(row.created_at || payload.createdAt);
      payload.updatedAt = String(row.updated_at || payload.updatedAt || payload.createdAt);

      if (
        payload.track === 'shadowing' &&
        payload.segmentationVersion !== 2 &&
        payload.videoId
      ) {
        const cacheFile = path.join(this.transcriptCacheDir, `${payload.videoId}.json`);
        if (fs.existsSync(cacheFile)) {
          try {
            const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
            if (cached?.data?.timed_words?.length) {
              payload.sentences = segmentSentences(cached.data);
              payload.chunks = segmentParagraphs(payload.sentences);
              payload.sentencesCount = payload.sentences.length;
              payload.chunksCount = payload.chunks.length;
              payload.segmentationVersion = 2;
              payload.timingVersion = 2;
              payload.translationsCache = {};
              this.insertOrReplaceRow(payload, {
                userId: payload.userId,
                guestToken: payload.guestToken,
              });
            }
          } catch {
            // Keep stored payload
          }
        }
      }

      return payload;
    } catch (error: any) {
      this.logger.warn(`Corrupt lesson row ${row?.id}: ${error.message}`);
      return undefined;
    }
  }

  private insertOrReplaceRow(item: HistoryItem, scope?: RequestIdentityScope): void {
    const now = new Date().toISOString();
    const userId = item.userId !== undefined ? item.userId : (scope?.userId ?? null);
    const guestToken = userId ? null : (item.guestToken !== undefined ? item.guestToken : (scope?.guestToken ?? null));
    const sentencesCount = item.sentences?.length ?? item.sentencesCount ?? 0;
    const chunksCount = item.chunks?.length ?? item.chunksCount ?? 0;
    const analysisStatus = item.aiAnalysis ? 'ready' : (item.analysisStatus || 'pending');
    const cefrLevel = item.aiAnalysis?.overview?.cefrLevel || item.cefrLevel || '';

    const cachedLangs = Object.keys(item.translationsCache || {})
      .filter((code) => Object.keys(item.translationsCache?.[code] || {}).length > 0)
      .sort()
      .join(',');

    const aiInsightsCount = item.aiAnalysis
      ? (item.aiAnalysis.connectedSpeech?.length || 0) +
        (item.aiAnalysis.expressions?.length || 0) +
        (item.aiAnalysis.vocabulary?.length || 0)
      : 0;

    item.userId = userId;
    item.guestToken = guestToken;
    item.sentencesCount = sentencesCount;
    item.chunksCount = chunksCount;
    item.analysisStatus = analysisStatus;
    item.cefrLevel = cefrLevel;
    item.updatedAt = now;
    if (!item.createdAt) item.createdAt = now;

    item.stats = {
      totalWords: item.stats?.totalWords || 1,
      sentencesCount,
      connectedCount: item.aiAnalysis?.connectedSpeech?.length || 0,
      expressionsCount: item.aiAnalysis?.expressions?.length || 0,
      vocabularyCount: item.aiAnalysis?.vocabulary?.length || 0,
    };

    // Do not embed transient summary-only fields inside payload_json
    const serializable = { ...item };
    delete serializable.payloadBytes;
    delete serializable.cacheInfo;
    const payloadJson = JSON.stringify(serializable);

    this.sqlite.db
      .prepare(`
        INSERT INTO lessons (
          id, user_id, guest_token, track, video_id, source_url, title, creator,
          thumbnail_url, accent_dialect, duration_seconds, pacing_wpm, difficulty,
          cefr_level, sentences_count, chunks_count, completed_drills, study_notes,
          analysis_status, cached_langs, ai_insights_count, payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          user_id = COALESCE(excluded.user_id, lessons.user_id),
          guest_token = CASE WHEN COALESCE(excluded.user_id, lessons.user_id) IS NOT NULL THEN NULL ELSE COALESCE(excluded.guest_token, lessons.guest_token) END,
          track = excluded.track,
          video_id = excluded.video_id,
          source_url = excluded.source_url,
          title = excluded.title,
          creator = excluded.creator,
          thumbnail_url = excluded.thumbnail_url,
          accent_dialect = excluded.accent_dialect,
          duration_seconds = excluded.duration_seconds,
          pacing_wpm = excluded.pacing_wpm,
          difficulty = excluded.difficulty,
          cefr_level = excluded.cefr_level,
          sentences_count = excluded.sentences_count,
          chunks_count = excluded.chunks_count,
          completed_drills = excluded.completed_drills,
          study_notes = excluded.study_notes,
          analysis_status = excluded.analysis_status,
          cached_langs = excluded.cached_langs,
          ai_insights_count = excluded.ai_insights_count,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at
      `)
      .run(
        item.id,
        userId,
        guestToken,
        item.track,
        item.videoId || null,
        item.sourceUrl || '',
        item.title || 'English Lesson',
        item.creator || 'Creator',
        item.thumbnailUrl || '',
        item.accentDialect || 'General American English',
        Math.round(Number(item.durationSeconds) || 0),
        Math.round(Number(item.pacingWpm) || 140),
        item.difficulty || 'Intermediate',
        cefrLevel,
        sentencesCount,
        chunksCount,
        Number(item.completedDrills) || 0,
        item.studyNotes || '',
        analysisStatus,
        cachedLangs,
        aiInsightsCount,
        payloadJson,
        item.createdAt,
        now,
      );
  }

  /**
   * Fast SQL projection for Library and History & Cache Manager:
   * reads indexed metadata + cache telemetry columns without deserializing
   * heavy transcript JSON payloads.
   */
  findSummaries(track?: string, scope?: RequestIdentityScope): HistorySummary[] {
    const where = this.scopeWhereClause(scope);
    const params: any[] = [...where.params];
    let sql = `
      SELECT
        id, user_id, guest_token, track, video_id, source_url, title, creator,
        thumbnail_url, accent_dialect, duration_seconds, pacing_wpm, difficulty,
        cefr_level, sentences_count, chunks_count, completed_drills, study_notes,
        analysis_status, cached_langs, ai_insights_count,
        LENGTH(payload_json) AS payload_bytes,
        created_at, updated_at
      FROM lessons
      WHERE ${where.sql}
    `;

    if (track && track !== 'all') {
      sql += ' AND track = ?';
      params.push(track);
    }

    sql += ' ORDER BY updated_at DESC, created_at DESC';

    const rows = this.sqlite.db.prepare(sql).all(...params) as Array<Record<string, any>>;
    return rows.map((row) => {
      const videoId = row.video_id ? String(row.video_id) : undefined;
      const tStats = this.getTranscriptCacheFileStats(videoId);
      const langs = String(row.cached_langs || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const notes = String(row.study_notes || '');
      const analysisStatus = (row.analysis_status as 'pending' | 'ready') || 'pending';
      const insightsCount = Number(row.ai_insights_count) || 0;

      return {
        id: String(row.id),
        userId: row.user_id ? String(row.user_id) : null,
        guestToken: row.guest_token ? String(row.guest_token) : null,
        track: row.track as HistoryItem['track'],
        trackTitle: this.cleanTrackTitle(String(row.track)),
        title: String(row.title),
        creator: String(row.creator),
        videoId,
        sourceUrl: String(row.source_url),
        thumbnailUrl: String(row.thumbnail_url),
        accentDialect: String(row.accent_dialect),
        durationSeconds: Number(row.duration_seconds) || 0,
        pacingWpm: Number(row.pacing_wpm) || 140,
        difficulty: (row.difficulty as HistoryItem['difficulty']) || 'Intermediate',
        cefrLevel: String(row.cefr_level || ''),
        sentencesCount: Number(row.sentences_count) || 0,
        chunksCount: Number(row.chunks_count) || 0,
        analysisStatus,
        timingVersion: 2,
        segmentationVersion: 2,
        stats: {
          totalWords: Math.round(((Number(row.duration_seconds) || 60) / 60) * (Number(row.pacing_wpm) || 140)),
          sentencesCount: Number(row.sentences_count) || 0,
          connectedCount: insightsCount,
          expressionsCount: 0,
          vocabularyCount: 0,
        },
        studyNotes: notes,
        payloadBytes: Number(row.payload_bytes) || 0,
        cacheInfo: {
          transcriptCached: tStats.cached,
          transcriptBytes: tStats.bytes,
          aiCoachCached: analysisStatus === 'ready',
          aiInsightsCount: insightsCount,
          translationLanguages: langs,
          hasNotes: Boolean(notes.trim()),
        },
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        completedDrills: Number(row.completed_drills) || 0,
      };
    });
  }

  findById(id: string, scope?: RequestIdentityScope): HistoryItem | undefined {
    if (!id) return undefined;
    if (scope?.userId) {
      const row = this.sqlite.db
        .prepare('SELECT * FROM lessons WHERE id = ? AND user_id = ?')
        .get(id, scope.userId);
      return this.rowToItem(row);
    }
    const row = this.sqlite.db.prepare('SELECT * FROM lessons WHERE id = ?').get(id);
    return this.rowToItem(row);
  }

  findByUrlOrVideoId(url: string, videoId?: string, scope?: RequestIdentityScope): HistoryItem | undefined {
    const cleanUrl = (url || '').trim().toLowerCase();
    const cleanVid = (videoId || '').trim().toLowerCase();
    const where = this.scopeWhereClause(scope);

    if (cleanVid) {
      const row = this.sqlite.db
        .prepare(
          `SELECT * FROM lessons WHERE ${where.sql} AND track = 'shadowing' AND LOWER(video_id) = ? ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(...where.params, cleanVid);
      if (row) return this.rowToItem(row);
    }

    if (cleanUrl) {
      const row = this.sqlite.db
        .prepare(
          `SELECT * FROM lessons WHERE ${where.sql} AND LOWER(source_url) = ? ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(...where.params, cleanUrl);
      if (row) return this.rowToItem(row);
    }

    return undefined;
  }

  create(item: HistoryItem, scope?: RequestIdentityScope): HistoryItem {
    const existing =
      (item.id ? this.findById(item.id, scope) : undefined) ||
      this.findByUrlOrVideoId(item.sourceUrl, item.videoId, scope);

    if (existing) {
      item.id = existing.id;
      item.userId = existing.userId ?? scope?.userId ?? null;
      item.createdAt = existing.createdAt;
      item.completedDrills = Math.max(item.completedDrills || 0, existing.completedDrills || 0);
      item.studyNotes = item.studyNotes || existing.studyNotes || '';
      if (!item.aiAnalysis && existing.aiAnalysis && existing.segmentationVersion === item.segmentationVersion) {
        item.aiAnalysis = existing.aiAnalysis;
        item.analysisStatus = existing.analysisStatus;
      }
      if (!item.translationsCache && existing.translationsCache && existing.segmentationVersion === item.segmentationVersion) {
        item.translationsCache = existing.translationsCache;
      }
      this.insertOrReplaceRow(item, scope);
      this.logger.log(`Updated lesson in SQLite: ${item.title} (${item.id})`);
      return item;
    }

    this.insertOrReplaceRow(item, scope);
    this.logger.log(`Stored new lesson in SQLite: ${item.title} (${item.id})`);
    return item;
  }

  update(id: string, updates: Partial<HistoryItem>, scope?: RequestIdentityScope): HistoryItem | undefined {
    const existing = this.findById(id, scope);
    if (!existing) return undefined;
    const merged: HistoryItem = {
      ...existing,
      ...updates,
      id: existing.id,
    };
    this.insertOrReplaceRow(merged, {
      userId: merged.userId,
      guestToken: merged.guestToken,
    });
    return merged;
  }

  updateNotes(id: string, studyNotes: string, scope?: RequestIdentityScope): HistoryItem | undefined {
    const existing = this.findById(id, scope);
    if (!existing) return undefined;
    existing.studyNotes = String(studyNotes ?? '');
    existing.noteMarkdown = this.buildCleanMarkdown(
      existing.title,
      existing.creator,
      existing.sourceUrl,
      existing.chunks || [],
      existing.aiAnalysis,
      existing.studyNotes,
    );
    this.insertOrReplaceRow(existing, {
      userId: existing.userId,
      guestToken: existing.guestToken,
    });
    return existing;
  }

  delete(id: string, scope?: RequestIdentityScope): boolean {
    if (!id) return false;
    const where = this.scopeWhereClause(scope);
    const res = this.sqlite.db
      .prepare(`DELETE FROM lessons WHERE id = ? AND ${where.sql}`)
      .run(id, ...where.params);
    if (Number(res.changes) > 0 && scope?.userId) {
      this.sqlite.db
        .prepare('DELETE FROM practice_logs WHERE lesson_id = ? AND user_id = ?')
        .run(id, scope.userId);
    }
    return Number(res.changes) > 0;
  }

  clearAll(scope?: RequestIdentityScope): number {
    const where = this.scopeWhereClause(scope);
    const res = this.sqlite.db.prepare(`DELETE FROM lessons WHERE ${where.sql}`).run(...where.params);
    this.logger.log('Cleared scoped lesson library.');
    return Number(res.changes) || 0;
  }

  resetToDefaultShowcase(scope?: RequestIdentityScope): HistoryItem[] {
    this.clearAll(scope);
    return [];
  }

  /**
   * Granular per-lesson cache control: clear AI Coach analysis, cached translations,
   * and/or on-disk YouTube caption extraction cache without losing the lesson or notes.
   */
  clearLessonCache(
    id: string,
    cacheScope: CacheClearScope = 'all',
    scope?: RequestIdentityScope,
  ): HistorySummary | undefined {
    const item = this.findById(id, scope);
    if (!item) return undefined;

    if (cacheScope === 'coach' || cacheScope === 'all') {
      delete item.aiAnalysis;
      item.analysisStatus = 'pending';
      item.cefrLevel = '';
      item.sentences = (item.sentences || []).map((s) => ({
        ...s,
        highlightedHtml: escapeTranscriptHtml(s.text),
      }));
      item.chunks = (item.chunks || []).map((c) => ({
        ...c,
        highlightedHtml: escapeTranscriptHtml(c.text),
      }));
    }

    if (cacheScope === 'translations' || cacheScope === 'all') {
      item.translationsCache = {};
      item.sentences = (item.sentences || []).map((s) => ({
        ...s,
        translations: {},
      }));
    }

    if ((cacheScope === 'transcript' || cacheScope === 'all') && item.videoId) {
      this.deleteTranscriptCacheFile(item.videoId);
    }

    item.noteMarkdown = this.buildCleanMarkdown(
      item.title,
      item.creator,
      item.sourceUrl,
      item.chunks || [],
      item.aiAnalysis,
      item.studyNotes,
    );

    this.insertOrReplaceRow(item, scope);
    return this.findSummaries(undefined, scope).find((s) => s.id === id);
  }

  clearAllCaches(
    cacheScope: 'all' | 'coach' | 'translations' | 'transcripts' = 'all',
    scope?: RequestIdentityScope,
  ): { clearedLessonsCount: number } {
    const summaries = this.findSummaries(undefined, scope);
    let cleared = 0;
    const mapped: CacheClearScope =
      cacheScope === 'transcripts' ? 'transcript' : cacheScope;
    for (const s of summaries) {
      if (this.clearLessonCache(s.id, mapped, scope)) {
        cleared++;
      }
    }
    return { clearedLessonsCount: cleared };
  }

  resetLessonProgress(
    id: string,
    options: { clearNotes?: boolean } = {},
    scope?: RequestIdentityScope,
  ): HistorySummary | undefined {
    const item = this.findById(id, scope);
    if (!item) return undefined;

    item.completedDrills = 0;
    if (options.clearNotes) {
      item.studyNotes = '';
    }
    item.noteMarkdown = this.buildCleanMarkdown(
      item.title,
      item.creator,
      item.sourceUrl,
      item.chunks || [],
      item.aiAnalysis,
      item.studyNotes,
    );
    this.insertOrReplaceRow(item, scope);

    if (scope?.userId) {
      this.sqlite.db
        .prepare('DELETE FROM practice_logs WHERE user_id = ? AND lesson_id = ?')
        .run(scope.userId, id);
    }

    return this.findSummaries(undefined, scope).find((s) => s.id === id);
  }

  bulkManage(
    ids: string[],
    action: 'delete' | 'clear_cache' | 'reset_progress',
    scope?: RequestIdentityScope,
  ): { affectedCount: number } {
    if (!Array.isArray(ids) || ids.length === 0) return { affectedCount: 0 };
    let affected = 0;
    for (const rawId of ids) {
      const id = String(rawId || '').trim();
      if (!id) continue;
      if (action === 'delete') {
        if (this.delete(id, scope)) affected++;
      } else if (action === 'clear_cache') {
        if (this.clearLessonCache(id, 'all', scope)) affected++;
      } else if (action === 'reset_progress') {
        if (this.resetLessonProgress(id, {}, scope)) affected++;
      }
    }
    return { affectedCount: affected };
  }

  incrementDrill(id: string, scope?: RequestIdentityScope, mode = 'shadow'): HistoryItem | undefined {
    const item = this.findById(id, scope);
    if (!item) return undefined;

    item.completedDrills = (item.completedDrills || 0) + 1;
    this.insertOrReplaceRow(item, {
      userId: item.userId ?? scope?.userId ?? null,
      guestToken: null,
    });

    const now = new Date().toISOString();
    const logUserId = scope?.userId || item.userId || null;

    this.sqlite.db
      .prepare(`
        INSERT INTO practice_logs (id, user_id, guest_token, lesson_id, mode, drills_count, duration_sec, created_at)
        VALUES (?, ?, NULL, ?, ?, 1, 60, ?)
      `)
      .run(uuidv4(), logUserId, id, mode || 'shadow', now);

    if (logUserId) {
      this.updateUserStreak(logUserId);
    }

    return item;
  }

  private updateUserStreak(userId: string): void {
    const user = this.sqlite.db
      .prepare('SELECT streak_days, last_practice_date FROM users WHERE id = ?')
      .get(userId) as Record<string, any> | undefined;
    if (!user) return;

    const today = new Date().toISOString().slice(0, 10);
    const last = user.last_practice_date ? String(user.last_practice_date) : '';
    if (last === today) return;

    const yesterdayDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const nextStreak = last === yesterdayDate ? Number(user.streak_days || 0) + 1 : 1;

    this.sqlite.db
      .prepare('UPDATE users SET streak_days = ?, last_practice_date = ? WHERE id = ?')
      .run(nextStreak, today, userId);
  }

  deleteActivityLog(logId: string, scope?: RequestIdentityScope): boolean {
    if (!logId || !scope?.userId) return false;
    const res = this.sqlite.db
      .prepare('DELETE FROM practice_logs WHERE id = ? AND user_id = ?')
      .run(logId, scope.userId);
    return Number(res.changes) > 0;
  }

  clearActivityLogs(scope?: RequestIdentityScope): number {
    if (!scope?.userId) return 0;
    const res = this.sqlite.db
      .prepare('DELETE FROM practice_logs WHERE user_id = ?')
      .run(scope.userId);
    this.sqlite.db
      .prepare('UPDATE users SET streak_days = 0, last_practice_date = NULL WHERE id = ?')
      .run(scope.userId);
    return Number(res.changes) || 0;
  }

  getStats(scope?: RequestIdentityScope) {
    if (!scope?.userId) {
      return {
        lessonsCount: 0,
        completedDrills: 0,
        vocabularyCount: 0,
        dueVocabularyCount: 0,
        practiceMinutes: 0,
        streakDays: 0,
        dailyGoalMinutes: 15,
      };
    }

    const lessonRow = this.sqlite.db
      .prepare(
        `SELECT COUNT(*) AS lessonsCount, COALESCE(SUM(completed_drills), 0) AS completedDrills
         FROM lessons WHERE user_id = ?`,
      )
      .get(scope.userId) as Record<string, any> | undefined;

    const nowIso = new Date().toISOString();
    const vocabRow = this.sqlite.db
      .prepare(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN next_review_at <= ? THEN 1 ELSE 0 END), 0) AS due,
                COALESCE(SUM(CASE WHEN mastery_level >= 3 THEN 1 ELSE 0 END), 0) AS mastered
         FROM vocabulary_items WHERE user_id = ?`,
      )
      .get(nowIso, scope.userId) as Record<string, any> | undefined;

    const logsRow = this.sqlite.db
      .prepare(
        `SELECT COALESCE(SUM(duration_sec), 0) AS totalSec FROM practice_logs WHERE user_id = ?`,
      )
      .get(scope.userId) as Record<string, any> | undefined;

    const todayPrefix = `${new Date().toISOString().slice(0, 10)}%`;
    const todayLogsRow = this.sqlite.db
      .prepare(
        `SELECT COALESCE(SUM(duration_sec), 0) AS todaySec FROM practice_logs WHERE user_id = ? AND created_at LIKE ?`,
      )
      .get(scope.userId, todayPrefix) as Record<string, any> | undefined;

    let streakDays = 0;
    let dailyGoalMinutes = 15;
    const u = this.sqlite.db
      .prepare('SELECT streak_days, daily_goal_minutes FROM users WHERE id = ?')
      .get(scope.userId) as Record<string, any> | undefined;
    if (u) {
      streakDays = Number(u.streak_days) || 0;
      dailyGoalMinutes = Number(u.daily_goal_minutes) || 15;
    }

    return {
      lessonsCount: Number(lessonRow?.lessonsCount) || 0,
      completedDrills: Number(lessonRow?.completedDrills) || 0,
      vocabularyCount: Number(vocabRow?.total) || 0,
      dueVocabularyCount: Number(vocabRow?.due) || 0,
      masteredVocabularyCount: Number(vocabRow?.mastered) || 0,
      practiceMinutes: Math.max(
        Math.round((Number(logsRow?.totalSec) || 0) / 60),
        Number(lessonRow?.completedDrills) || 0,
      ),
      todayMinutes: Math.round((Number(todayLogsRow?.todaySec) || 0) / 60),
      streakDays,
      dailyGoalMinutes,
    };
  }

  getUsageOverview(scope?: RequestIdentityScope) {
    const stats = this.getStats(scope);
    const summaries = this.findSummaries(undefined, scope);

    const byTrack = {
      shadowing: 0,
      street_talk: 0,
      phonetics: 0,
    };

    let totalLessonsBytes = 0;
    let transcriptCacheCount = 0;
    let transcriptCacheBytes = 0;
    const seenVideoIds = new Set<string>();
    let aiCoachCachedCount = 0;
    let translationCachedLessonsCount = 0;
    let totalCachedLanguagesCount = 0;
    let notesCount = 0;

    for (const s of summaries) {
      if (s.track === 'street_talk') byTrack.street_talk++;
      else if (s.track === 'phonetics') byTrack.phonetics++;
      else byTrack.shadowing++;

      totalLessonsBytes += Number(s.payloadBytes) || 0;
      if (s.cacheInfo?.aiCoachCached) aiCoachCachedCount++;
      if (s.cacheInfo?.translationLanguages?.length) {
        translationCachedLessonsCount++;
        totalCachedLanguagesCount += s.cacheInfo.translationLanguages.length;
      }
      if (s.cacheInfo?.hasNotes) notesCount++;

      if (s.videoId && !seenVideoIds.has(s.videoId) && s.cacheInfo?.transcriptCached) {
        seenVideoIds.add(s.videoId);
        transcriptCacheCount++;
        transcriptCacheBytes += Number(s.cacheInfo.transcriptBytes) || 0;
      }
    }

    const recentActivity = scope?.userId
      ? (this.sqlite.db
          .prepare(`
            SELECT
              p.id,
              p.lesson_id AS lessonId,
              COALESCE(l.title, 'Deleted Lesson') AS lessonTitle,
              COALESCE(l.track, 'shadowing') AS track,
              p.mode,
              p.drills_count AS drillsCount,
              p.duration_sec AS durationSec,
              p.created_at AS createdAt
            FROM practice_logs p
            LEFT JOIN lessons l ON l.id = p.lesson_id
            WHERE p.user_id = ?
            ORDER BY p.created_at DESC
            LIMIT 80
          `)
          .all(scope.userId) as Array<Record<string, any>>)
      : [];

    return {
      stats: {
        ...stats,
        byTrack,
      },
      cacheOverview: {
        totalLessonsBytes,
        transcriptCacheCount,
        transcriptCacheBytes,
        totalStorageBytes: totalLessonsBytes + transcriptCacheBytes,
        aiCoachCachedCount,
        translationCachedLessonsCount,
        totalCachedLanguagesCount,
        notesCount,
      },
      recentActivity,
    };
  }

  exportAccountData(user: any, scope?: RequestIdentityScope) {
    if (!scope?.userId) return null;
    const lessonRows = this.sqlite.db
      .prepare('SELECT * FROM lessons WHERE user_id = ? ORDER BY created_at DESC')
      .all(scope.userId) as Array<Record<string, any>>;
    const lessons = lessonRows.map((r) => this.rowToItem(r)).filter(Boolean);

    const vocabulary = this.sqlite.db
      .prepare('SELECT * FROM vocabulary_items WHERE user_id = ? ORDER BY created_at DESC')
      .all(scope.userId);

    const practiceLogs = this.sqlite.db
      .prepare('SELECT * FROM practice_logs WHERE user_id = ? ORDER BY created_at DESC')
      .all(scope.userId);

    return {
      exportedAt: new Date().toISOString(),
      platform: 'Flaptap Spoken English Studio',
      version: 2,
      user,
      stats: this.getStats(scope),
      lessons,
      vocabulary,
      practiceLogs,
    };
  }
}
