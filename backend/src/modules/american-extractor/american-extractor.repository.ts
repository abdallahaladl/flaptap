import { Injectable, Logger } from '@nestjs/common';
import { SqliteService } from '../../core/database/sqlite.service';
import {
  ExtractionHistoryItem,
  ExtractionResult,
  ExtractorCompletionProgress,
  ExtractorItem,
  ExtractorSourceType,
  HistorySortBy,
  HistoryStatusFilter,
  ListHistoryQuery,
  PaginatedHistoryResult,
} from './american-extractor.types';
import { getLanguage } from '../../core/ai/languages';

export interface SaveExtractorNoteInput {
  id: string;
  userId: string;
  sourceId?: string;
  title: string;
  creator: string;
  summary: string;
  speakerStyle: string;
  sourceType: ExtractorSourceType;
  sourceUrl: string;
  sourceLabel: string;
  sourceMeta: Record<string, any>;
  targetLanguage: string;
  agentName: string;
  modelName: string;
  reasoningLevel: string;
  executionTimeMs: number;
  fallbackFrom?: string;
  items: ExtractorItem[];
  sourceText: string;
  contentHash?: string;
  createdAt: string;
}

/** Counts distinct, in-range item indices from a stored completion payload. */
function countCompletedItems(raw: unknown, itemCount: number): number {
  try {
    const parsed = JSON.parse(String(raw || '{}'));
    const indices = Array.isArray(parsed?.items) ? parsed.items : [];
    const unique = new Set(
      indices.map(Number).filter((value: number) => Number.isInteger(value) && value >= 0),
    );
    return Math.min(unique.size, Math.max(0, itemCount));
  } catch {
    return 0;
  }
}

function deriveStatus(item: ExtractionHistoryItem): 'new' | 'progress' | 'done' {
  const total = Number(item.item_count) || 0;
  const done = Number(item.completed_count) || 0;
  if (total > 0 && done >= total) return 'done';
  if (done > 0) return 'progress';
  return 'new';
}

function matchesSourceTypeFilter(sourceType: ExtractorSourceType, filter: string): boolean {
  const f = filter.trim().toLowerCase();
  if (!f || f === 'all') return true;
  if (f === 'video') return ['youtube', 'social_video', 'video'].includes(sourceType);
  if (f === 'file') return ['pdf', 'markdown', 'image', 'audio'].includes(sourceType);
  return sourceType === f;
}

@Injectable()
export class AmericanExtractorRepository {
  private readonly logger = new Logger(AmericanExtractorRepository.name);

  constructor(private readonly sqlite: SqliteService) {}

  save(input: SaveExtractorNoteInput): void {
    const now = input.createdAt || new Date().toISOString();
    this.sqlite.db
      .prepare(
        `INSERT INTO american_extractor_notes (
          id, user_id, source_id, title, creator, summary, speaker_style, source_type, source_url,
          source_label, source_meta_json, target_language, agent_name, model_name,
          reasoning_level, execution_time_ms, fallback_from, item_count, items_json,
          source_text, is_completed, completion_json, content_hash, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '{}', ?, ?, ?)`,
      )
      .run(
        input.id,
        input.userId,
        input.sourceId || '',
        input.title,
        input.creator,
        input.summary,
        input.speakerStyle,
        input.sourceType,
        input.sourceUrl,
        input.sourceLabel,
        JSON.stringify(input.sourceMeta || {}),
        input.targetLanguage,
        input.agentName,
        input.modelName,
        input.reasoningLevel,
        Math.round(input.executionTimeMs) || 0,
        input.fallbackFrom || '',
        input.items.length,
        JSON.stringify(input.items),
        input.sourceText,
        input.contentHash || '',
        now,
        now,
      );
  }

  findByContentHash(userId: string, contentHash: string): ExtractionResult | null {
    const hash = String(contentHash || '').trim();
    if (!hash) return null;
    const row = this.sqlite.db
      .prepare(
        `SELECT * FROM american_extractor_notes
         WHERE user_id = ? AND content_hash = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(userId, hash) as Record<string, any> | undefined;
    if (!row) return null;
    return this.hydrateRow(row);
  }

  list(userId: string, limit = 60): ExtractionHistoryItem[] {
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 60));
    const rows = this.sqlite.db
      .prepare(
        `SELECT id, title, creator, summary, source_type, source_url, source_label,
                target_language, agent_name, model_name, reasoning_level, item_count,
                execution_time_ms, COALESCE(is_completed, 0) AS is_completed,
                COALESCE(completion_json, '{}') AS completion_json,
                COALESCE(updated_at, created_at) AS updated_at, created_at
         FROM american_extractor_notes
         WHERE user_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?`,
      )
      .all(userId, safeLimit) as Array<ExtractionHistoryItem & { completion_json?: string }>;

    return (rows || []).map((row) => this.mapHistoryRow(row));
  }

  listPaginated(userId: string, query: ListHistoryQuery = {}): PaginatedHistoryResult {
    const rows = this.sqlite.db
      .prepare(
        `SELECT rowid AS _rowid, id, title, creator, summary, source_type, source_url, source_label,
                target_language, agent_name, model_name, reasoning_level, item_count,
                execution_time_ms, COALESCE(is_completed, 0) AS is_completed,
                COALESCE(completion_json, '{}') AS completion_json,
                COALESCE(updated_at, created_at) AS updated_at, created_at
         FROM american_extractor_notes
         WHERE user_id = ?
         ORDER BY created_at DESC, rowid DESC`,
      )
      .all(userId) as Array<ExtractionHistoryItem & { completion_json?: string; _rowid?: number }>;

    const allItems = (rows || []).map((row) => ({
      ...this.mapHistoryRow(row),
      _rowid: Number(row._rowid) || 0,
    }));
    const total = allItems.length;

    let totalItems = 0;
    let completedGuides = 0;
    let inProgressGuides = 0;
    for (const item of allItems) {
      totalItems += item.item_count;
      const st = deriveStatus(item);
      if (st === 'done') completedGuides++;
      else if (st === 'progress') inProgressGuides++;
    }

    const q = String(query.q || '').trim().toLowerCase();
    const sourceType = String(query.sourceType || 'all').trim().toLowerCase();
    const status: HistoryStatusFilter =
      query.status === 'new' || query.status === 'progress' || query.status === 'done'
        ? query.status
        : 'all';
    const sort: HistorySortBy =
      query.sort === 'oldest' ||
      query.sort === 'title' ||
      query.sort === 'items' ||
      query.sort === 'progress'
        ? query.sort
        : 'newest';

    let filtered = allItems.filter((item) => {
      if (sourceType && sourceType !== 'all' && !matchesSourceTypeFilter(item.source_type, sourceType)) {
        return false;
      }
      if (status !== 'all' && deriveStatus(item) !== status) {
        return false;
      }
      if (q) {
        const hay = [item.title, item.creator, item.summary, item.source_label, item.source_url, item.source_type]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const compareNewest = (
      a: ExtractionHistoryItem & { _rowid: number },
      b: ExtractionHistoryItem & { _rowid: number },
    ) =>
      String(b.created_at).localeCompare(String(a.created_at)) ||
      b._rowid - a._rowid ||
      String(b.id).localeCompare(String(a.id));

    filtered = [...filtered].sort((a, b) => {
      if (sort === 'oldest') {
        return (
          String(a.created_at).localeCompare(String(b.created_at)) ||
          a._rowid - b._rowid ||
          String(a.id).localeCompare(String(b.id))
        );
      }
      if (sort === 'title') {
        return (
          String(a.title || '').localeCompare(String(b.title || ''), undefined, {
            sensitivity: 'base',
          }) || compareNewest(a, b)
        );
      }
      if (sort === 'items') {
        return (b.item_count || 0) - (a.item_count || 0) || compareNewest(a, b);
      }
      if (sort === 'progress') {
        const pctA = a.item_count > 0 ? a.completed_count / a.item_count : 0;
        const pctB = b.item_count > 0 ? b.completed_count / b.item_count : 0;
        return pctB - pctA || compareNewest(a, b);
      }
      return compareNewest(a, b);
    });

    const filteredTotal = filtered.length;
    const hasPagination = query.page !== undefined || query.limit !== undefined;
    const pageSize = hasPagination
      ? Math.max(1, Math.min(100, Math.floor(Number(query.limit) || 10)))
      : Math.max(60, filteredTotal || 60);
    const totalPages = Math.max(1, hasPagination ? Math.ceil(filteredTotal / pageSize) : 1);
    const page = hasPagination
      ? Math.min(totalPages, Math.max(1, Math.floor(Number(query.page) || 1)))
      : 1;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize).map(({ _rowid, ...rest }) => rest);

    return {
      items,
      total,
      filteredTotal,
      page,
      pageSize,
      totalPages,
      hasMore: page < totalPages,
      stats: {
        totalGuides: total,
        totalItems,
        completedGuides,
        inProgressGuides,
      },
    };
  }

  findById(userId: string, id: string): ExtractionResult | null {
    const row = this.sqlite.db
      .prepare('SELECT * FROM american_extractor_notes WHERE id = ? AND user_id = ?')
      .get(id, userId) as Record<string, any> | undefined;
    if (!row) return null;
    return this.hydrateRow(row);
  }

  rename(
    userId: string,
    id: string,
    title: string,
  ): { id: string; title: string; updatedAt: string } | null {
    const existing = this.sqlite.db
      .prepare('SELECT id FROM american_extractor_notes WHERE id = ? AND user_id = ?')
      .get(id, userId);
    if (!existing) return null;

    const updatedAt = new Date().toISOString();
    this.sqlite.db
      .prepare('UPDATE american_extractor_notes SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(title, updatedAt, id, userId);
    return { id, title, updatedAt };
  }

  setItemCompletion(
    userId: string,
    id: string,
    index: number,
    completed: boolean,
  ): { id: string; completionProgress: ExtractorCompletionProgress; isCompleted: boolean } | null {
    const row = this.sqlite.db
      .prepare(
        `SELECT id, COALESCE(completion_json, '{}') AS completion_json, item_count
         FROM american_extractor_notes WHERE id = ? AND user_id = ?`,
      )
      .get(id, userId) as Record<string, any> | undefined;
    if (!row) return null;

    const total = Number(row.item_count) || 0;
    if (!Number.isInteger(index) || index < 0 || (total > 0 && index >= total)) {
      throw new Error('Invalid study item index.');
    }

    let progress: ExtractorCompletionProgress = {};
    try {
      const parsed = JSON.parse(String(row.completion_json || '{}'));
      if (parsed && typeof parsed === 'object') progress = parsed;
    } catch {}

    const existing = new Set<number>(
      Array.isArray(progress.items)
        ? progress.items
            .map(Number)
            .filter((n) => Number.isInteger(n) && n >= 0 && (total === 0 || n < total))
        : [],
    );
    if (completed) existing.add(index);
    else existing.delete(index);
    progress.items = Array.from(existing).sort((a, b) => a - b);

    const isCompleted = total > 0 && progress.items.length >= total;
    const updatedAt = new Date().toISOString();
    this.sqlite.db
      .prepare(
        'UPDATE american_extractor_notes SET completion_json = ?, is_completed = ?, updated_at = ? WHERE id = ? AND user_id = ?',
      )
      .run(JSON.stringify(progress), isCompleted ? 1 : 0, updatedAt, id, userId);

    return { id, completionProgress: progress, isCompleted };
  }

  deleteNoteItem(
    userId: string,
    id: string,
    index: number,
  ): {
    note: ExtractionResult;
    removedPhrase: string;
    completionProgress: ExtractorCompletionProgress;
    isCompleted: boolean;
  } | null {
    const note = this.findById(userId, id);
    if (!note) return null;
    if (!Number.isInteger(index) || index < 0 || index >= note.items.length) {
      throw new Error('Invalid study item index.');
    }
    const removedPhrase = String(note.items[index]?.term || '').trim();
    const nextItems = note.items
      .filter((_, idx) => idx !== index)
      .map((item, newIdx) => ({ ...item, index: newIdx }));
    const prevCompleted = Array.isArray(note.completionProgress?.items)
      ? note.completionProgress.items
      : [];
    const shiftedCompleted = prevCompleted
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n !== index && n < note.items.length)
      .map((n) => (n > index ? n - 1 : n))
      .sort((a, b) => a - b);

    const nextProgress: ExtractorCompletionProgress = { items: shiftedCompleted };
    const nextCompleted = nextItems.length > 0 && shiftedCompleted.length >= nextItems.length;
    const updatedAt = new Date().toISOString();

    this.sqlite.db
      .prepare(
        `UPDATE american_extractor_notes
         SET items_json = ?, item_count = ?, completion_json = ?, is_completed = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .run(
        JSON.stringify(nextItems),
        nextItems.length,
        JSON.stringify(nextProgress),
        nextCompleted ? 1 : 0,
        updatedAt,
        id,
        userId,
      );

    const refreshed = this.findById(userId, id)!;
    return {
      note: refreshed,
      removedPhrase,
      completionProgress: nextProgress,
      isCompleted: nextCompleted,
    };
  }

  resetProgress(
    userId: string,
    id: string,
  ): { id: string; title: string; completionProgress: ExtractorCompletionProgress; isCompleted: boolean } | null {
    const row = this.sqlite.db
      .prepare('SELECT id, title FROM american_extractor_notes WHERE id = ? AND user_id = ?')
      .get(id, userId) as { id: string; title?: string } | undefined;
    if (!row) return null;

    const updatedAt = new Date().toISOString();
    this.sqlite.db
      .prepare(
        `UPDATE american_extractor_notes
         SET completion_json = '{}', is_completed = 0, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .run(updatedAt, id, userId);

    return {
      id,
      title: String(row.title || 'Study Guide'),
      completionProgress: {},
      isCompleted: false,
    };
  }

  delete(userId: string, id: string): boolean {
    const result = this.sqlite.db
      .prepare('DELETE FROM american_extractor_notes WHERE id = ? AND user_id = ?')
      .run(id, userId);
    return Number(result.changes) > 0;
  }

  countForUser(userId: string): number {
    const row = this.sqlite.db
      .prepare('SELECT COUNT(*) AS total FROM american_extractor_notes WHERE user_id = ?')
      .get(userId) as { total?: number } | undefined;
    return Number(row?.total) || 0;
  }

  private mapHistoryRow(row: ExtractionHistoryItem & { completion_json?: string; _rowid?: number }): ExtractionHistoryItem {
    const { completion_json, _rowid, ...rest } = row;
    const itemCount = Number(row.item_count) || 0;
    const completedCount = countCompletedItems(completion_json, itemCount);
    const derivedCompleted = itemCount > 0 && completedCount >= itemCount ? 1 : 0;
    return {
      ...rest,
      is_completed: derivedCompleted,
      item_count: itemCount,
      execution_time_ms: Number(row.execution_time_ms) || 0,
      completed_count: completedCount,
    };
  }

  private hydrateRow(row: Record<string, any>): ExtractionResult {
    let items: ExtractorItem[] = [];
    let sourceMeta: Record<string, any> = {};
    let completionProgress: ExtractorCompletionProgress = {};

    try {
      const parsed = JSON.parse(String(row.items_json || '[]'));
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      this.logger.warn(`Corrupt extractor items for ${row.id}`);
    }
    try {
      const parsed = JSON.parse(String(row.source_meta_json || '{}'));
      if (parsed && typeof parsed === 'object') sourceMeta = parsed;
    } catch {}
    try {
      const parsed = JSON.parse(String(row.completion_json || '{}'));
      if (parsed && typeof parsed === 'object') completionProgress = parsed;
    } catch {}

    const language = getLanguage(String(row.target_language || 'ar'));
    const itemCount = Number(row.item_count) || items.length;
    const completedCount = countCompletedItems(row.completion_json, itemCount);
    const isCompleted = itemCount > 0 && completedCount >= itemCount;
    const sourceId = String(row.source_id || sourceMeta?.sourceId || '');

    const rawMediaKind = String(sourceMeta?.mediaKind || '').toLowerCase();
    const fallbackYtId =
      String(sourceMeta?.videoId || '') ||
      (/youtube\.com|youtu\.be/i.test(String(row.source_url || ''))
        ? String(row.source_url || '').match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([\w-]{11})/)?.[1] || ''
        : '');
    const mediaKind =
      rawMediaKind === 'youtube' || rawMediaKind === 'audio' || rawMediaKind === 'video'
        ? rawMediaKind
        : fallbackYtId
          ? 'youtube'
          : 'none';
    const mediaId = String(sourceMeta?.mediaId || fallbackYtId || '');
    const hasAudio =
      Boolean(sourceMeta?.hasAudio) ||
      mediaKind !== 'none' ||
      ['youtube', 'audio', 'video', 'social_video'].includes(String(row.source_type || ''));
    const hasVideo =
      Boolean(sourceMeta?.hasVideo) ||
      mediaKind === 'youtube' ||
      mediaKind === 'video';
    const streamUrl =
      (mediaKind === 'audio' || mediaKind === 'video') && mediaId
        ? `/api/sources/media/${encodeURIComponent(mediaId)}`
        : undefined;

    return {
      id: String(row.id),
      ...(sourceId ? { sourceId } : {}),
      title: String(row.title || ''),
      creator: String(row.creator || ''),
      summary: String(row.summary || ''),
      speakerStyle: String(row.speaker_style || ''),
      sourceType: String(row.source_type || 'text') as ExtractorSourceType,
      sourceUrl: String(row.source_url || ''),
      sourceLabel: String(row.source_label || ''),
      sourceMeta,
      media: {
        hasAudio,
        hasVideo,
        mediaKind: mediaKind as any,
        mediaId,
        durationSeconds: Number(sourceMeta?.durationSeconds) || 0,
        ...(streamUrl ? { streamUrl } : {}),
      },
      targetLanguage: language.code,
      targetLanguageName: language.name,
      rtl: Boolean(language.rtl),
      agentUsed: String(row.agent_name || ''),
      modelUsed: String(row.model_name || ''),
      reasoningLevel: String(row.reasoning_level || ''),
      executionTimeMs: Number(row.execution_time_ms) || 0,
      fallbackFrom: String(row.fallback_from || '') || undefined,
      itemCount,
      items,
      sourceText: String(row.source_text || ''),
      isCompleted,
      completionProgress,
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || row.created_at || ''),
    };
  }
}
