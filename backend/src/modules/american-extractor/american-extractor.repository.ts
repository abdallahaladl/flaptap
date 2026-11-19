import { Injectable, Logger } from '@nestjs/common';
import { SqliteService } from '../../core/database/sqlite.service';
import {
  ExtractionHistoryItem,
  ExtractionResult,
  ExtractorCompletionProgress,
  ExtractorItem,
  ExtractorSourceType,
} from './american-extractor.types';
import { getLanguage } from '../../core/ai/languages';

export interface SaveExtractorNoteInput {
  id: string;
  userId: string;
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

@Injectable()
export class AmericanExtractorRepository {
  private readonly logger = new Logger(AmericanExtractorRepository.name);

  constructor(private readonly sqlite: SqliteService) {}

  save(input: SaveExtractorNoteInput): void {
    this.sqlite.db
      .prepare(
        `INSERT INTO american_extractor_notes (
          id, user_id, title, creator, summary, speaker_style, source_type, source_url,
          source_label, source_meta_json, target_language, agent_name, model_name,
          reasoning_level, execution_time_ms, fallback_from, item_count, items_json,
          source_text, is_completed, completion_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '{}', ?)`,
      )
      .run(
        input.id,
        input.userId,
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
        input.createdAt,
      );
  }

  list(userId: string, limit = 60): ExtractionHistoryItem[] {
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 60));
    const rows = this.sqlite.db
      .prepare(
        `SELECT id, title, creator, summary, source_type, source_url, source_label,
                target_language, agent_name, model_name, reasoning_level, item_count,
                execution_time_ms, COALESCE(is_completed, 0) AS is_completed,
                COALESCE(completion_json, '{}') AS completion_json, created_at
         FROM american_extractor_notes
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(userId, safeLimit) as Array<ExtractionHistoryItem & { completion_json?: string }>;

    return (rows || []).map((row) => {
      const { completion_json, ...rest } = row;
      const itemCount = Number(row.item_count) || 0;
      return {
        ...rest,
        is_completed: Number(row.is_completed) || 0,
        item_count: itemCount,
        execution_time_ms: Number(row.execution_time_ms) || 0,
        completed_count: countCompletedItems(completion_json, itemCount),
      };
    });
  }

  findById(userId: string, id: string): ExtractionResult | null {
    const row = this.sqlite.db
      .prepare('SELECT * FROM american_extractor_notes WHERE id = ? AND user_id = ?')
      .get(id, userId) as Record<string, any> | undefined;
    if (!row) return null;

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

    return {
      id: String(row.id),
      title: String(row.title || ''),
      creator: String(row.creator || ''),
      summary: String(row.summary || ''),
      speakerStyle: String(row.speaker_style || ''),
      sourceType: String(row.source_type || 'text') as ExtractorSourceType,
      sourceUrl: String(row.source_url || ''),
      sourceLabel: String(row.source_label || ''),
      sourceMeta,
      targetLanguage: language.code,
      targetLanguageName: language.name,
      rtl: Boolean(language.rtl),
      agentUsed: String(row.agent_name || ''),
      modelUsed: String(row.model_name || ''),
      reasoningLevel: String(row.reasoning_level || ''),
      executionTimeMs: Number(row.execution_time_ms) || 0,
      fallbackFrom: String(row.fallback_from || '') || undefined,
      itemCount: Number(row.item_count) || items.length,
      items,
      sourceText: String(row.source_text || ''),
      isCompleted: Boolean(row.is_completed),
      completionProgress,
      createdAt: String(row.created_at || ''),
    };
  }

  setItemCompletion(
    userId: string,
    id: string,
    index: number,
    completed: boolean,
  ): { id: string; completionProgress: ExtractorCompletionProgress } | null {
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
        ? progress.items.map(Number).filter((n) => Number.isInteger(n) && n >= 0)
        : [],
    );
    if (completed) existing.add(index);
    else existing.delete(index);
    progress.items = Array.from(existing).sort((a, b) => a - b);

    this.sqlite.db
      .prepare('UPDATE american_extractor_notes SET completion_json = ? WHERE id = ? AND user_id = ?')
      .run(JSON.stringify(progress), id, userId);

    return { id, completionProgress: progress };
  }

  setCompleted(
    userId: string,
    id: string,
    completed: boolean,
  ): { id: string; isCompleted: boolean } | null {
    const existing = this.sqlite.db
      .prepare('SELECT id FROM american_extractor_notes WHERE id = ? AND user_id = ?')
      .get(id, userId);
    if (!existing) return null;

    this.sqlite.db
      .prepare('UPDATE american_extractor_notes SET is_completed = ? WHERE id = ? AND user_id = ?')
      .run(completed ? 1 : 0, id, userId);
    return { id, isCompleted: Boolean(completed) };
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
}
