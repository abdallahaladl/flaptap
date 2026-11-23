import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SqliteService } from '../../core/database/sqlite.service';
import { SharedMediaKind, SharedSourceType } from '../shared-sources/shared-sources.types';
import {
  RawTranscriptSnapshot,
  ReviewedTranscriptSnapshot,
  TranscriptCompletionState,
  TranscriptLabDoc,
  TranscriptLabListResult,
  TranscriptLabSummary,
  TranscriptReviewStatus,
} from './transcript-lab.types';
import { applySpeakerOverridesToReviewed } from './utils/word-alignment.util';

export interface CreateTranscriptDocInput {
  sourceId: string;
  sourceKey: string;
  sourceUrl: string;
  sourceType: SharedSourceType;
  platform: string;
  title: string;
  creator: string;
  thumbnailUrl: string;
  durationSeconds: number;
  hasAudio: boolean;
  hasVideo: boolean;
  mediaKind: SharedMediaKind;
  mediaId: string;
  mimeType: string;
  providerEngine: string;
  raw: RawTranscriptSnapshot;
}

export interface ListTranscriptDocsQuery {
  q?: string;
  platform?: string;
  status?: 'all' | 'new' | 'progress' | 'done' | 'reviewed' | 'pending';
  page?: number;
  limit?: number;
}

function parseCompletionItems(raw: unknown, sentenceCount: number): number[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
    const arr: unknown[] = Array.isArray((parsed as any)?.items) ? (parsed as any).items : [];
    const maxIdx = Math.max(0, sentenceCount);
    const nums = arr
      .map((n: unknown) => Math.floor(Number(n)))
      .filter((n: number) => Number.isInteger(n) && n >= 1 && (maxIdx === 0 || n <= maxIdx));
    return Array.from(new Set<number>(nums)).sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function parseOverrides(raw: unknown): Record<string, string> {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const cleanK = String(k || '').trim();
      const cleanV = String(v || '').trim().slice(0, 64);
      if (cleanK && cleanV) out[cleanK] = cleanV;
    }
    return out;
  } catch {
    return {};
  }
}

function buildStreamUrl(mediaKind: SharedMediaKind, mediaId: string): string {
  if ((mediaKind === 'audio' || mediaKind === 'video') && mediaId) {
    return `/api/sources/media/${encodeURIComponent(mediaId)}`;
  }
  return '';
}

@Injectable()
export class TranscriptLabRepository {
  constructor(private readonly sqlite: SqliteService) {}

  createOrUpdateRaw(userId: string, input: CreateTranscriptDocInput, existingId?: string): TranscriptLabDoc {
    const now = new Date().toISOString();
    const sentenceCount = input.raw.sentences.length;
    const wordCount = input.raw.words.length;

    if (existingId) {
      this.sqlite.db
        .prepare(
          `UPDATE transcript_lab_docs
           SET source_id = ?, source_key = ?, source_url = ?, source_type = ?, platform = ?,
               title = ?, creator = ?, thumbnail_url = ?, duration_seconds = ?,
               has_audio = ?, has_video = ?, media_kind = ?, media_id = ?, mime_type = ?,
               provider_engine = ?, raw_json = ?, reviewed_json = '{}', review_status = 'pending',
               review_error = '', sentence_count = ?, word_count = ?, speaker_count = 1,
               repair_count = 0, completion_json = '{}', is_completed = 0, updated_at = ?
           WHERE id = ? AND user_id = ?`,
        )
        .run(
          input.sourceId,
          input.sourceKey,
          input.sourceUrl,
          input.sourceType,
          input.platform,
          input.title || 'Untitled Transcript',
          input.creator || '',
          input.thumbnailUrl || '',
          Number(input.durationSeconds) || 0,
          input.hasAudio ? 1 : 0,
          input.hasVideo ? 1 : 0,
          input.mediaKind,
          input.mediaId || '',
          input.mimeType || '',
          input.providerEngine || '',
          JSON.stringify(input.raw),
          sentenceCount,
          wordCount,
          now,
          existingId,
          userId,
        );
      return this.findById(userId, existingId)!;
    }

    const id = `tr_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    this.sqlite.db
      .prepare(
        `INSERT INTO transcript_lab_docs (
          id, user_id, source_id, source_key, source_url, source_type, platform,
          title, creator, thumbnail_url, duration_seconds, has_audio, has_video,
          media_kind, media_id, mime_type, provider_engine,
          raw_json, reviewed_json, review_status, review_error,
          speaker_overrides_json, completion_json,
          sentence_count, word_count, speaker_count, repair_count, is_completed,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 'pending', '', '{}', '{}', ?, ?, 1, 0, 0, ?, ?)`,
      )
      .run(
        id,
        userId,
        input.sourceId,
        input.sourceKey,
        input.sourceUrl,
        input.sourceType,
        input.platform,
        input.title || 'Untitled Transcript',
        input.creator || '',
        input.thumbnailUrl || '',
        Number(input.durationSeconds) || 0,
        input.hasAudio ? 1 : 0,
        input.hasVideo ? 1 : 0,
        input.mediaKind,
        input.mediaId || '',
        input.mimeType || '',
        input.providerEngine || '',
        JSON.stringify(input.raw),
        sentenceCount,
        wordCount,
        now,
        now,
      );

    return this.findById(userId, id)!;
  }

  findById(userId: string, id: string): TranscriptLabDoc | null {
    const row = this.sqlite.db
      .prepare('SELECT * FROM transcript_lab_docs WHERE id = ? AND user_id = ?')
      .get(id, userId) as Record<string, any> | undefined;
    return row ? this.hydrateDoc(row) : null;
  }

  findBySourceKey(userId: string, sourceKey: string): TranscriptLabDoc | null {
    if (!sourceKey) return null;
    const row = this.sqlite.db
      .prepare(
        'SELECT * FROM transcript_lab_docs WHERE user_id = ? AND source_key = ? ORDER BY updated_at DESC LIMIT 1',
      )
      .get(userId, sourceKey) as Record<string, any> | undefined;
    return row ? this.hydrateDoc(row) : null;
  }

  setReviewStatus(
    userId: string,
    id: string,
    status: TranscriptReviewStatus,
    reviewError = '',
  ): void {
    this.sqlite.db
      .prepare(
        `UPDATE transcript_lab_docs
         SET review_status = ?, review_error = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .run(status, reviewError.slice(0, 400), new Date().toISOString(), id, userId);
  }

  saveReviewed(
    userId: string,
    id: string,
    reviewed: ReviewedTranscriptSnapshot,
  ): TranscriptLabDoc | null {
    const existing = this.findById(userId, id);
    if (!existing) return null;

    const sentenceCount = reviewed.sentences.length;
    const wordCount = reviewed.quality.totalWords || existing.wordCount;
    const speakerCount = Math.max(1, reviewed.speakers.length);
    const repairCount = reviewed.quality.repairedSentences;
    const validCompleted = parseCompletionItems(existing.completion, sentenceCount);
    const isCompleted = sentenceCount > 0 && validCompleted.length >= sentenceCount ? 1 : 0;

    this.sqlite.db
      .prepare(
        `UPDATE transcript_lab_docs
         SET reviewed_json = ?, review_status = 'ready', review_error = '',
             sentence_count = ?, word_count = ?, speaker_count = ?, repair_count = ?,
             completion_json = ?, is_completed = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .run(
        JSON.stringify(reviewed),
        sentenceCount,
        wordCount,
        speakerCount,
        repairCount,
        JSON.stringify({ items: validCompleted }),
        isCompleted,
        new Date().toISOString(),
        id,
        userId,
      );

    return this.findById(userId, id);
  }

  updateTitle(userId: string, id: string, title: string): TranscriptLabDoc | null {
    const clean = String(title || '').trim().slice(0, 160);
    if (!clean) return this.findById(userId, id);
    this.sqlite.db
      .prepare('UPDATE transcript_lab_docs SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(clean, new Date().toISOString(), id, userId);
    return this.findById(userId, id);
  }

  updateSpeakerOverrides(
    userId: string,
    id: string,
    overrides: Record<string, string>,
  ): TranscriptLabDoc | null {
    const existing = this.findById(userId, id);
    if (!existing) return null;
    const merged = { ...existing.speakerOverrides };
    for (const [k, v] of Object.entries(overrides || {})) {
      const cleanK = String(k || '').trim();
      const cleanV = String(v || '').trim().slice(0, 64);
      if (!cleanK) continue;
      if (cleanV) merged[cleanK] = cleanV;
      else delete merged[cleanK];
    }

    this.sqlite.db
      .prepare(
        'UPDATE transcript_lab_docs SET speaker_overrides_json = ?, updated_at = ? WHERE id = ? AND user_id = ?',
      )
      .run(JSON.stringify(merged), new Date().toISOString(), id, userId);
    return this.findById(userId, id);
  }

  /**
   * Real Derived Completion Law:
   * Updates ONLY an individual sentence's check state and strictly derives
   * container completion (`sentenceCount > 0 && completedCount === sentenceCount`).
   */
  toggleSentenceCompletion(
    userId: string,
    id: string,
    sentenceIndex: number,
    completed: boolean,
  ): {
    completion: TranscriptCompletionState;
    completedCount: number;
    sentenceCount: number;
    isCompleted: boolean;
  } | null {
    const existing = this.findById(userId, id);
    if (!existing) return null;

    const total = existing.sentenceCount;
    const idx = Math.floor(Number(sentenceIndex));
    if (!Number.isInteger(idx) || idx < 1 || (total > 0 && idx > total)) {
      return {
        completion: existing.completion,
        completedCount: existing.completedCount,
        sentenceCount: total,
        isCompleted: existing.isCompleted,
      };
    }

    const set = new Set(existing.completion.items);
    if (completed) set.add(idx);
    else set.delete(idx);

    const items = Array.from(set).sort((a, b) => a - b);
    const isCompleted = total > 0 && items.length >= total;

    this.sqlite.db
      .prepare(
        `UPDATE transcript_lab_docs
         SET completion_json = ?, is_completed = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .run(JSON.stringify({ items }), isCompleted ? 1 : 0, new Date().toISOString(), id, userId);

    return {
      completion: { items },
      completedCount: items.length,
      sentenceCount: total,
      isCompleted,
    };
  }

  delete(userId: string, id: string): boolean {
    const res = this.sqlite.db
      .prepare('DELETE FROM transcript_lab_docs WHERE id = ? AND user_id = ?')
      .run(id, userId);
    return Number(res.changes || 0) > 0;
  }

  list(userId: string, query: ListTranscriptDocsQuery = {}): TranscriptLabListResult {
    const rows = this.sqlite.db
      .prepare(
        `SELECT id, source_id, source_url, source_type, platform, title, creator, thumbnail_url,
                duration_seconds, has_audio, has_video, media_kind, provider_engine,
                review_status, completion_json, sentence_count, word_count, speaker_count,
                repair_count, created_at, updated_at
         FROM transcript_lab_docs
         WHERE user_id = ?
         ORDER BY updated_at DESC, rowid DESC`,
      )
      .all(userId) as Array<Record<string, any>>;

    const allSummaries = rows.map((row) => this.hydrateSummary(row));

    const stats = {
      totalDocs: allSummaries.length,
      reviewedDocs: allSummaries.filter((d) => d.reviewStatus === 'ready').length,
      completedDocs: allSummaries.filter((d) => d.isCompleted).length,
      totalWords: allSummaries.reduce((acc, d) => acc + d.wordCount, 0),
    };

    const q = String(query.q || '').trim().toLowerCase();
    const platform = String(query.platform || '').trim().toLowerCase();
    const status = String(query.status || 'all').trim().toLowerCase();

    const filtered = allSummaries.filter((item) => {
      if (q) {
        const hay = `${item.title} ${item.creator} ${item.platform} ${item.sourceUrl}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (platform && platform !== 'all') {
        const p = item.platform.toLowerCase();
        if (platform === 'podcast') {
          if (!p.includes('podcast') && item.sourceType !== 'podcast' && item.sourceType !== 'audio') {
            return false;
          }
        } else if (platform === 'social') {
          if (!['tiktok', 'instagram', 'x', 'facebook', 'reddit', 'threads', 'linkedin'].some((k) => p.includes(k))) {
            return false;
          }
        } else if (!p.includes(platform)) {
          return false;
        }
      }
      if (status === 'done' && !item.isCompleted) return false;
      if (status === 'progress' && (item.completedCount === 0 || item.isCompleted)) return false;
      if (status === 'new' && item.completedCount > 0) return false;
      if (status === 'reviewed' && item.reviewStatus !== 'ready') return false;
      if (status === 'pending' && item.reviewStatus === 'ready') return false;
      return true;
    });

    const limit = Math.max(1, Math.min(50, Number(query.limit) || 10));
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.max(1, Math.min(totalPages, Number(query.page) || 1));
    const start = (page - 1) * limit;

    return {
      items: filtered.slice(start, start + limit),
      total,
      page,
      limit,
      totalPages,
      stats,
    };
  }

  private hydrateSummary(row: Record<string, any>): TranscriptLabSummary {
    const sentenceCount = Math.max(0, Number(row.sentence_count) || 0);
    const completedItems = parseCompletionItems(row.completion_json, sentenceCount);
    const completedCount = completedItems.length;
    const isCompleted = sentenceCount > 0 && completedCount >= sentenceCount;

    return {
      id: String(row.id),
      sourceId: String(row.source_id || ''),
      sourceUrl: String(row.source_url || ''),
      sourceType: String(row.source_type || 'youtube') as SharedSourceType,
      platform: String(row.platform || 'Media'),
      title: String(row.title || 'Untitled Transcript'),
      creator: String(row.creator || ''),
      thumbnailUrl: String(row.thumbnail_url || ''),
      durationSeconds: Number(row.duration_seconds) || 0,
      hasAudio: Boolean(row.has_audio),
      hasVideo: Boolean(row.has_video),
      mediaKind: (row.media_kind || 'none') as SharedMediaKind,
      providerEngine: String(row.provider_engine || ''),
      reviewStatus: (row.review_status || 'pending') as TranscriptReviewStatus,
      sentenceCount,
      completedCount,
      wordCount: Math.max(0, Number(row.word_count) || 0),
      speakerCount: Math.max(1, Number(row.speaker_count) || 1),
      repairCount: Math.max(0, Number(row.repair_count) || 0),
      isCompleted,
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    };
  }

  private hydrateDoc(row: Record<string, any>): TranscriptLabDoc {
    let raw: RawTranscriptSnapshot = {
      provider: String(row.provider_engine || ''),
      model: '',
      fullText: '',
      cues: [],
      words: [],
      sentences: [],
      paragraphs: [],
      extractedAt: String(row.created_at || ''),
    };
    try {
      const parsed = JSON.parse(String(row.raw_json || '{}'));
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.words)) {
        raw = parsed as RawTranscriptSnapshot;
      }
    } catch {}

    let reviewed: ReviewedTranscriptSnapshot | null = null;
    try {
      const parsed = JSON.parse(String(row.reviewed_json || '{}'));
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.sentences) && parsed.sentences.length > 0) {
        reviewed = parsed as ReviewedTranscriptSnapshot;
      }
    } catch {}

    const speakerOverrides = parseOverrides(row.speaker_overrides_json);
    if (reviewed && Object.keys(speakerOverrides).length > 0) {
      applySpeakerOverridesToReviewed(reviewed, speakerOverrides);
    }

    const activeSentences = reviewed?.sentences || raw.sentences || [];
    const sentenceCount = activeSentences.length;
    const completedItems = parseCompletionItems(row.completion_json, sentenceCount);
    const completedCount = completedItems.length;
    const isCompleted = sentenceCount > 0 && completedCount >= sentenceCount;

    const mediaKind = (row.media_kind || 'none') as SharedMediaKind;
    const mediaId = String(row.media_id || '');

    return {
      id: String(row.id),
      userId: String(row.user_id),
      sourceId: String(row.source_id || ''),
      sourceKey: String(row.source_key || ''),
      sourceUrl: String(row.source_url || ''),
      sourceType: String(row.source_type || 'youtube') as SharedSourceType,
      platform: String(row.platform || 'Media'),
      title: String(row.title || 'Untitled Transcript'),
      creator: String(row.creator || ''),
      thumbnailUrl: String(row.thumbnail_url || ''),
      durationSeconds: Number(row.duration_seconds) || 0,
      providerEngine: String(row.provider_engine || ''),
      media: {
        hasAudio: Boolean(row.has_audio),
        hasVideo: Boolean(row.has_video),
        mediaKind,
        mediaId,
        streamUrl: buildStreamUrl(mediaKind, mediaId),
        mimeType: String(row.mime_type || ''),
        durationSeconds: Number(row.duration_seconds) || 0,
      },
      raw,
      reviewed,
      reviewStatus: (row.review_status || 'pending') as TranscriptReviewStatus,
      reviewError: String(row.review_error || ''),
      speakerOverrides,
      completion: { items: completedItems },
      sentenceCount,
      completedCount,
      wordCount: reviewed?.quality?.totalWords || raw.words.length || Number(row.word_count) || 0,
      speakerCount: reviewed ? Math.max(1, reviewed.speakers.length) : 1,
      repairCount: reviewed?.quality?.repairedSentences || 0,
      isCompleted,
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    };
  }
}
