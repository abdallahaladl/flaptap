import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SqliteService } from '../../core/database/sqlite.service';
import {
  LinkedExtractorNoteSummary,
  LinkedLessonSummary,
  SharedMediaKind,
  SharedSourceRecord,
  SharedSourceSummary,
  SharedSourceType,
  SourceSegment,
  UpsertSharedSourceInput,
} from './shared-sources.types';

function countCompletedItems(raw: unknown, itemCount: number): number {
  try {
    const parsed = JSON.parse(String(raw || '{}'));
    const indices = Array.isArray(parsed?.items) ? parsed.items : [];
    const unique = new Set(
      indices.map(Number).filter((v: number) => Number.isInteger(v) && v >= 0),
    );
    return Math.min(unique.size, Math.max(0, itemCount));
  } catch {
    return 0;
  }
}

function countWordsSimple(text: string): number {
  const m = String(text || '').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

@Injectable()
export class SharedSourcesRepository {
  private readonly logger = new Logger(SharedSourcesRepository.name);

  constructor(private readonly sqlite: SqliteService) {}

  findById(userId: string, id: string): SharedSourceRecord | null {
    const row = this.sqlite.db
      .prepare('SELECT * FROM shared_sources WHERE id = ? AND user_id = ?')
      .get(id, userId) as Record<string, any> | undefined;
    return row ? this.hydrate(row) : null;
  }

  findByKey(userId: string, sourceKey: string): SharedSourceRecord | null {
    const row = this.sqlite.db
      .prepare('SELECT * FROM shared_sources WHERE user_id = ? AND source_key = ?')
      .get(userId, sourceKey) as Record<string, any> | undefined;
    return row ? this.hydrate(row) : null;
  }

  findByMediaId(userId: string, mediaId: string): SharedSourceRecord | null {
    const row = this.sqlite.db
      .prepare('SELECT * FROM shared_sources WHERE user_id = ? AND media_id = ? LIMIT 1')
      .get(userId, mediaId) as Record<string, any> | undefined;
    return row ? this.hydrate(row) : null;
  }

  hasLessonWithVideoId(userId: string, mediaId: string): boolean {
    const row = this.sqlite.db
      .prepare('SELECT id FROM lessons WHERE user_id = ? AND video_id = ? LIMIT 1')
      .get(userId, mediaId);
    return Boolean(row);
  }

  upsert(userId: string, input: UpsertSharedSourceInput): SharedSourceRecord {
    const now = new Date().toISOString();
    const existing = this.findByKey(userId, input.sourceKey);

    if (existing) {
      const nextSegments =
        Array.isArray(input.segments) && input.segments.length > 0
          ? input.segments
          : existing.segments;
      const nextTranscript = input.transcriptText?.trim() || existing.transcriptText;
      const nextMeta = {
        ...(existing.sourceMeta || {}),
        ...(input.sourceMeta || {}),
      };
      const nextHasAudio = Boolean(input.hasAudio ?? existing.hasAudio);
      const nextHasVideo = Boolean(input.hasVideo ?? existing.hasVideo);
      const nextMediaKind =
        input.mediaKind && input.mediaKind !== 'none' ? input.mediaKind : existing.mediaKind;
      const nextMediaId = input.mediaId || existing.mediaId;
      const nextDuration =
        Number(input.durationSeconds) > 0 ? Number(input.durationSeconds) : existing.durationSeconds;

      this.sqlite.db
        .prepare(
          `UPDATE shared_sources
           SET title = ?, creator = ?, source_url = ?, source_label = ?,
               mime_type = ?, file_name = ?, has_audio = ?, has_video = ?,
               media_kind = ?, media_id = ?, duration_seconds = ?,
               transcript_text = ?, segments_json = ?, source_meta_json = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`,
        )
        .run(
          input.title || existing.title,
          input.creator || existing.creator,
          input.sourceUrl || existing.sourceUrl,
          input.sourceLabel || existing.sourceLabel,
          input.mimeType || existing.mimeType,
          input.fileName || existing.fileName,
          nextHasAudio ? 1 : 0,
          nextHasVideo ? 1 : 0,
          nextMediaKind,
          nextMediaId,
          nextDuration,
          nextTranscript,
          JSON.stringify(nextSegments),
          JSON.stringify(nextMeta),
          now,
          existing.id,
          userId,
        );

      return this.findById(userId, existing.id)!;
    }

    const id = `src_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const segments = Array.isArray(input.segments) ? input.segments : [];
    this.sqlite.db
      .prepare(
        `INSERT INTO shared_sources (
          id, user_id, source_key, source_type, title, creator, source_url, source_label,
          mime_type, file_name, has_audio, has_video, media_kind, media_id,
          duration_seconds, transcript_text, segments_json, source_meta_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        userId,
        input.sourceKey,
        input.sourceType,
        input.title || 'Untitled source',
        input.creator || '',
        input.sourceUrl || '',
        input.sourceLabel || '',
        input.mimeType || '',
        input.fileName || '',
        input.hasAudio ? 1 : 0,
        input.hasVideo ? 1 : 0,
        input.mediaKind || 'none',
        input.mediaId || '',
        Number(input.durationSeconds) || 0,
        input.transcriptText || '',
        JSON.stringify(segments),
        JSON.stringify(input.sourceMeta || {}),
        now,
        now,
      );

    return this.findById(userId, id)!;
  }

  updateTitle(userId: string, id: string, title: string): void {
    const clean = String(title || '').trim().slice(0, 140);
    if (!id || !clean) return;
    this.sqlite.db
      .prepare('UPDATE shared_sources SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(clean, new Date().toISOString(), id, userId);
  }

  listSummaries(userId: string, limit = 50): SharedSourceSummary[] {
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    const rows = this.sqlite.db
      .prepare(
        `SELECT id, source_key, source_type, title, creator, source_url, source_label,
                has_audio, has_video, media_kind, media_id, duration_seconds,
                transcript_text, segments_json, updated_at
         FROM shared_sources
         WHERE user_id = ?
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
      .all(userId, safeLimit) as Array<Record<string, any>>;

    return rows.map((row) => this.toSummaryRow(row));
  }

  findAllForUser(userId: string): SharedSourceRecord[] {
    const rows = this.sqlite.db
      .prepare('SELECT * FROM shared_sources WHERE user_id = ? ORDER BY updated_at DESC')
      .all(userId) as Array<Record<string, any>>;
    return rows.map((row) => this.hydrate(row));
  }

  findByCriteria(
    userId: string,
    opts: {
      sourceId?: string;
      sourceKey?: string;
      sourceUrl?: string;
      mediaId?: string;
      lessonId?: string;
    },
  ): SharedSourceRecord[] {
    const found = new Map<string, SharedSourceRecord>();
    const add = (row: Record<string, any> | undefined) => {
      if (!row?.id) return;
      const rec = this.hydrate(row);
      found.set(rec.id, rec);
    };
    const addAll = (rows: Array<Record<string, any>>) => {
      for (const r of rows || []) add(r);
    };

    if (opts.sourceId) {
      add(
        this.sqlite.db
          .prepare('SELECT * FROM shared_sources WHERE id = ? AND user_id = ?')
          .get(opts.sourceId, userId) as Record<string, any> | undefined,
      );
    }
    if (opts.sourceKey) {
      add(
        this.sqlite.db
          .prepare('SELECT * FROM shared_sources WHERE user_id = ? AND source_key = ?')
          .get(userId, opts.sourceKey) as Record<string, any> | undefined,
      );
    }
    if (opts.mediaId) {
      addAll(
        this.sqlite.db
          .prepare('SELECT * FROM shared_sources WHERE user_id = ? AND media_id = ?')
          .all(userId, opts.mediaId) as Array<Record<string, any>>,
      );
    }
    if (opts.sourceUrl) {
      addAll(
        this.sqlite.db
          .prepare('SELECT * FROM shared_sources WHERE user_id = ? AND LOWER(source_url) = LOWER(?)')
          .all(userId, opts.sourceUrl) as Array<Record<string, any>>,
      );
    }
    if (opts.lessonId) {
      addAll(
        this.sqlite.db
          .prepare('SELECT * FROM shared_sources WHERE user_id = ? AND source_meta_json LIKE ?')
          .all(userId, `%"lessonId":"${opts.lessonId}"%`) as Array<Record<string, any>>,
      );
    }
    return Array.from(found.values());
  }

  deleteById(userId: string, id: string): boolean {
    if (!id) return false;
    const res = this.sqlite.db
      .prepare('DELETE FROM shared_sources WHERE id = ? AND user_id = ?')
      .run(id, userId);
    return Number(res.changes) > 0;
  }

  deleteAllForUser(userId: string): number {
    const res = this.sqlite.db
      .prepare('DELETE FROM shared_sources WHERE user_id = ?')
      .run(userId);
    return Number(res.changes) || 0;
  }

  countReferencesForSource(userId: string, sourceId: string): { lessons: number; notes: number } {
    const lRow = this.sqlite.db
      .prepare('SELECT COUNT(*) AS cnt FROM lessons WHERE user_id = ? AND source_id = ?')
      .get(userId, sourceId) as Record<string, any> | undefined;
    const nRow = this.sqlite.db
      .prepare('SELECT COUNT(*) AS cnt FROM american_extractor_notes WHERE user_id = ? AND source_id = ?')
      .get(userId, sourceId) as Record<string, any> | undefined;
    return {
      lessons: Number(lRow?.cnt) || 0,
      notes: Number(nRow?.cnt) || 0,
    };
  }

  countGlobalMediaReferences(mediaId: string): number {
    const clean = String(mediaId || '').trim();
    if (!clean) return 0;
    const sRow = this.sqlite.db
      .prepare('SELECT COUNT(*) AS cnt FROM shared_sources WHERE media_id = ?')
      .get(clean) as Record<string, any> | undefined;
    const lRow = this.sqlite.db
      .prepare('SELECT COUNT(*) AS cnt FROM lessons WHERE video_id = ?')
      .get(clean) as Record<string, any> | undefined;
    const tRow = this.sqlite.db
      .prepare('SELECT COUNT(*) AS cnt FROM think_aloud_sessions WHERE media_id = ?')
      .get(clean) as Record<string, any> | undefined;
    return (Number(sRow?.cnt) || 0) + (Number(lRow?.cnt) || 0) + (Number(tRow?.cnt) || 0);
  }

  linkLessonToSource(userId: string, lessonId: string, sourceId: string): void {
    try {
      this.sqlite.db
        .prepare('UPDATE lessons SET source_id = ? WHERE id = ? AND user_id = ?')
        .run(sourceId, lessonId, userId);
    } catch (err: any) {
      this.logger.warn(`Could not link lesson ${lessonId} to source ${sourceId}: ${err?.message}`);
    }
  }

  findLinkedLesson(
    userId: string,
    opts: { sourceId?: string; videoId?: string; sourceUrl?: string; lessonId?: string },
  ): LinkedLessonSummary | null {
    let row: Record<string, any> | undefined;

    if (opts.lessonId) {
      row = this.sqlite.db
        .prepare(
          `SELECT id, title, track, video_id, sentences_count, is_completed, completed_items_count, total_items_count
           FROM lessons WHERE user_id = ? AND id = ? LIMIT 1`,
        )
        .get(userId, opts.lessonId) as Record<string, any> | undefined;
    }
    if (!row && opts.sourceId) {
      row = this.sqlite.db
        .prepare(
          `SELECT id, title, track, video_id, sentences_count, is_completed, completed_items_count, total_items_count
           FROM lessons WHERE user_id = ? AND source_id = ? ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(userId, opts.sourceId) as Record<string, any> | undefined;
    }
    if (!row && opts.videoId) {
      row = this.sqlite.db
        .prepare(
          `SELECT id, title, track, video_id, sentences_count, is_completed, completed_items_count, total_items_count
           FROM lessons WHERE user_id = ? AND video_id = ? ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(userId, opts.videoId) as Record<string, any> | undefined;
    }
    if (!row && opts.sourceUrl) {
      row = this.sqlite.db
        .prepare(
          `SELECT id, title, track, video_id, sentences_count, is_completed, completed_items_count, total_items_count
           FROM lessons WHERE user_id = ? AND source_url = ? ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(userId, opts.sourceUrl) as Record<string, any> | undefined;
    }
    if (!row) return null;

    const totalItems = Number(row.total_items_count) || 0;
    const doneItems = Number(row.completed_items_count) || 0;
    return {
      id: String(row.id),
      title: String(row.title || 'Lesson'),
      track: String(row.track || 'media_hub'),
      videoId: row.video_id ? String(row.video_id) : undefined,
      sentencesCount: Number(row.sentences_count) || 0,
      isCompleted: totalItems > 0 ? doneItems >= totalItems : Boolean(row.is_completed),
    };
  }

  findLinkedExtractorNotes(
    userId: string,
    opts: { sourceId?: string; videoId?: string; sourceUrl?: string; lessonId?: string },
  ): LinkedExtractorNoteSummary[] {
    const seen = new Map<string, LinkedExtractorNoteSummary>();
    const collect = (rows: Array<Record<string, any>>) => {
      for (const row of rows || []) {
        const id = String(row.id);
        if (seen.has(id)) continue;
        const itemCount = Number(row.item_count) || 0;
        const completedCount = countCompletedItems(row.completion_json, itemCount);
        seen.set(id, {
          id,
          title: String(row.title || 'Study Guide'),
          itemCount,
          completedCount,
          isCompleted: itemCount > 0 && completedCount >= itemCount,
          targetLanguage: String(row.target_language || 'ar'),
          createdAt: String(row.created_at || ''),
        });
      }
    };

    const cols = `id, title, item_count, target_language, COALESCE(completion_json, '{}') AS completion_json, created_at`;
    if (opts.sourceId) {
      collect(
        this.sqlite.db
          .prepare(
            `SELECT ${cols} FROM american_extractor_notes WHERE user_id = ? AND source_id = ? ORDER BY created_at DESC LIMIT 12`,
          )
          .all(userId, opts.sourceId) as Array<Record<string, any>>,
      );
    }
    if (opts.sourceUrl) {
      collect(
        this.sqlite.db
          .prepare(
            `SELECT ${cols} FROM american_extractor_notes WHERE user_id = ? AND source_url = ? ORDER BY created_at DESC LIMIT 12`,
          )
          .all(userId, opts.sourceUrl) as Array<Record<string, any>>,
      );
    }
    if (opts.videoId) {
      collect(
        this.sqlite.db
          .prepare(
            `SELECT ${cols} FROM american_extractor_notes
             WHERE user_id = ? AND (source_url LIKE ? OR source_meta_json LIKE ?)
             ORDER BY created_at DESC LIMIT 12`,
          )
          .all(userId, `%${opts.videoId}%`, `%"videoId":"${opts.videoId}"%`) as Array<Record<string, any>>,
      );
    }
    if (opts.lessonId) {
      collect(
        this.sqlite.db
          .prepare(
            `SELECT ${cols} FROM american_extractor_notes
             WHERE user_id = ? AND source_meta_json LIKE ?
             ORDER BY created_at DESC LIMIT 12`,
          )
          .all(userId, `%"lessonId":"${opts.lessonId}"%`) as Array<Record<string, any>>,
      );
    }

    return Array.from(seen.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  toSummary(record: SharedSourceRecord): SharedSourceSummary {
    return {
      id: record.id,
      sourceKey: record.sourceKey,
      sourceType: record.sourceType,
      title: record.title,
      creator: record.creator,
      sourceUrl: record.sourceUrl,
      sourceLabel: record.sourceLabel,
      hasAudio: record.hasAudio,
      hasVideo: record.hasVideo,
      mediaKind: record.mediaKind,
      mediaId: record.mediaId,
      durationSeconds: record.durationSeconds,
      segmentCount: record.segments.length,
      wordCount: countWordsSimple(record.transcriptText),
      updatedAt: record.updatedAt,
    };
  }

  private toSummaryRow(row: Record<string, any>): SharedSourceSummary {
    let segCount = 0;
    try {
      const parsed = JSON.parse(String(row.segments_json || '[]'));
      if (Array.isArray(parsed)) segCount = parsed.length;
    } catch {}
    return {
      id: String(row.id),
      sourceKey: String(row.source_key || ''),
      sourceType: String(row.source_type || 'text') as SharedSourceType,
      title: String(row.title || 'Untitled source'),
      creator: String(row.creator || ''),
      sourceUrl: String(row.source_url || ''),
      sourceLabel: String(row.source_label || ''),
      hasAudio: Boolean(row.has_audio),
      hasVideo: Boolean(row.has_video),
      mediaKind: (row.media_kind || 'none') as SharedMediaKind,
      mediaId: String(row.media_id || ''),
      durationSeconds: Number(row.duration_seconds) || 0,
      segmentCount: segCount,
      wordCount: countWordsSimple(String(row.transcript_text || '')),
      updatedAt: String(row.updated_at || ''),
    };
  }

  private hydrate(row: Record<string, any>): SharedSourceRecord {
    let segments: SourceSegment[] = [];
    let sourceMeta: Record<string, any> = {};
    try {
      const parsed = JSON.parse(String(row.segments_json || '[]'));
      if (Array.isArray(parsed)) segments = parsed;
    } catch {}
    try {
      const parsed = JSON.parse(String(row.source_meta_json || '{}'));
      if (parsed && typeof parsed === 'object') sourceMeta = parsed;
    } catch {}

    return {
      id: String(row.id),
      userId: String(row.user_id),
      sourceKey: String(row.source_key || ''),
      sourceType: String(row.source_type || 'text') as SharedSourceType,
      title: String(row.title || ''),
      creator: String(row.creator || ''),
      sourceUrl: String(row.source_url || ''),
      sourceLabel: String(row.source_label || ''),
      mimeType: String(row.mime_type || ''),
      fileName: String(row.file_name || ''),
      hasAudio: Boolean(row.has_audio),
      hasVideo: Boolean(row.has_video),
      mediaKind: (row.media_kind || 'none') as SharedMediaKind,
      mediaId: String(row.media_id || ''),
      durationSeconds: Number(row.duration_seconds) || 0,
      transcriptText: String(row.transcript_text || ''),
      segments,
      sourceMeta,
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    };
  }
}
