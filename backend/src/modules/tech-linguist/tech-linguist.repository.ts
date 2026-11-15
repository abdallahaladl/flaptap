import { Injectable, Logger } from '@nestjs/common';
import { SqliteService } from '../../core/database/sqlite.service';
import {
  ExtractionHistoryItem,
  ExtractionModeId,
  ExtractionResultPayload,
  IdiomItem,
  TechLexiconCompletionProgress,
  TechLexiconCompletionSubject,
  ThoughtPatternItem,
  VocabItem,
} from './tech-linguist.types';

export interface SaveExtractionInput {
  id: string;
  userId?: string;
  guestToken?: string;
  extractionMode: ExtractionModeId;
  title: string;
  creator: string;
  summary: string;
  sourceUrl: string;
  agentId: string;
  agentUsed: string;
  modelUsed: string;
  reasoningLevel: string;
  executionTimeMs: number;
  vocabItems: VocabItem[];
  idiomItems: IdiomItem[];
  thoughtPatterns: ThoughtPatternItem[];
  fullTranscript: string;
  createdAt: string;
}

@Injectable()
export class TechLinguistRepository {
  private readonly logger = new Logger(TechLinguistRepository.name);

  constructor(private readonly sqlite: SqliteService) {}

  saveExtraction(input: SaveExtractionInput): void {
    try {
      this.sqlite.db
        .prepare(
          `INSERT INTO tech_linguist_extractions (
            id, user_id, guest_token, extraction_mode, title, creator, summary, source_url,
            agent_id, agent_name, model_name, reasoning_level, execution_time_ms,
            vocab_count, idioms_count, patterns_count,
            vocab_items_json, idiom_items_json, patterns_json,
            full_transcript, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.id,
          input.userId || null,
          input.guestToken || null,
          input.extractionMode,
          input.title,
          input.creator,
          input.summary,
          input.sourceUrl,
          input.agentId,
          input.agentUsed,
          input.modelUsed,
          input.reasoningLevel,
          input.executionTimeMs,
          input.vocabItems.length,
          input.idiomItems.length,
          input.thoughtPatterns.length,
          JSON.stringify(input.vocabItems),
          JSON.stringify(input.idiomItems),
          JSON.stringify(input.thoughtPatterns),
          input.fullTranscript,
          input.createdAt,
        );
    } catch (err: any) {
      this.logger.error(`Failed to persist extraction to SQLite: ${err.message}`);
    }
  }

  getHistory(userId?: string, guestToken?: string): ExtractionHistoryItem[] {
    const query = userId
      ? `SELECT id, COALESCE(NULLIF(extraction_mode, ''), 'comprehensive') AS extraction_mode, title, creator, summary, source_url, agent_name, model_name, reasoning_level, vocab_count, idioms_count, patterns_count, execution_time_ms, COALESCE(is_completed, 0) AS is_completed, created_at FROM tech_linguist_extractions WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`
      : `SELECT id, COALESCE(NULLIF(extraction_mode, ''), 'comprehensive') AS extraction_mode, title, creator, summary, source_url, agent_name, model_name, reasoning_level, vocab_count, idioms_count, patterns_count, execution_time_ms, COALESCE(is_completed, 0) AS is_completed, created_at FROM tech_linguist_extractions WHERE guest_token = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT 30`;

    const param = userId || guestToken || '';
    return ((this.sqlite.db.prepare(query).all(param) as ExtractionHistoryItem[]) || []).map((row) => ({
      ...row,
      isCompleted: Boolean(row.is_completed),
      extraction_mode: row.extraction_mode === 'advanced_native' ? 'advanced_native' : 'comprehensive',
    }));
  }

  getExtractionById(id: string): ExtractionResultPayload | null {
    const row = this.sqlite.db
      .prepare(
        `SELECT id, user_id, guest_token, COALESCE(NULLIF(extraction_mode, ''), 'comprehensive') AS extraction_mode, title, creator, summary, source_url, agent_id, agent_name, model_name, reasoning_level, execution_time_ms, vocab_count, idioms_count, patterns_count, vocab_items_json, idiom_items_json, patterns_json, full_transcript, COALESCE(is_completed, 0) AS is_completed, COALESCE(completion_json, '{}') AS completion_json, created_at FROM tech_linguist_extractions WHERE id = ?`,
      )
      .get(id) as any;

    if (!row) return null;

    let vocabItems: VocabItem[] = [];
    let idiomItems: IdiomItem[] = [];
    let thoughtPatterns: ThoughtPatternItem[] = [];
    let completionProgress: TechLexiconCompletionProgress = {};

    try {
      vocabItems = JSON.parse(row.vocab_items_json || '[]');
      idiomItems = JSON.parse(row.idiom_items_json || '[]');
      thoughtPatterns = JSON.parse(row.patterns_json || '[]');
      const parsedCompletion = JSON.parse(row.completion_json || '{}');
      if (parsedCompletion && typeof parsedCompletion === 'object') {
        completionProgress = parsedCompletion;
      }
    } catch {
      // Fall back to empty arrays if corrupted
    }

    const extractionMode: ExtractionModeId =
      row.extraction_mode === 'advanced_native' ? 'advanced_native' : 'comprehensive';

    return {
      id: row.id,
      extractionMode,
      title: row.title,
      creator: row.creator || 'Tech Media',
      summary: row.summary || '',
      sourceUrl: row.source_url,
      agentUsed: row.agent_name,
      modelUsed: row.model_name,
      reasoningLevel: row.reasoning_level,
      executionTimeMs: row.execution_time_ms,
      vocabItems,
      idiomItems,
      thoughtPatterns: extractionMode === 'advanced_native' ? [] : thoughtPatterns,
      fullTranscript: row.full_transcript || '',
      isCompleted: Boolean(row.is_completed),
      completionProgress,
      createdAt: row.created_at,
    };
  }

  private findOwnedRow(id: string, userId?: string, guestToken?: string): Record<string, any> | undefined {
    if (userId) {
      return this.sqlite.db
        .prepare(`SELECT id, COALESCE(completion_json, '{}') AS completion_json FROM tech_linguist_extractions WHERE id = ? AND user_id = ?`)
        .get(id, userId) as Record<string, any> | undefined;
    }
    if (guestToken) {
      return this.sqlite.db
        .prepare(`SELECT id, COALESCE(completion_json, '{}') AS completion_json FROM tech_linguist_extractions WHERE id = ? AND (guest_token = ? OR user_id IS NULL)`)
        .get(id, guestToken) as Record<string, any> | undefined;
    }
    return this.sqlite.db
      .prepare(`SELECT id, COALESCE(completion_json, '{}') AS completion_json FROM tech_linguist_extractions WHERE id = ? AND user_id IS NULL`)
      .get(id) as Record<string, any> | undefined;
  }

  setExtractionCompleted(
    id: string,
    isCompleted: boolean,
    userId?: string,
    guestToken?: string,
  ): { id: string; isCompleted: boolean } | null {
    const owned = this.findOwnedRow(id, userId, guestToken);
    if (!owned) return null;

    this.sqlite.db
      .prepare('UPDATE tech_linguist_extractions SET is_completed = ? WHERE id = ?')
      .run(isCompleted ? 1 : 0, id);

    return { id, isCompleted: Boolean(isCompleted) };
  }

  setExtractionItemCompletion(
    id: string,
    subject: TechLexiconCompletionSubject,
    index: number,
    completed: boolean,
    userId?: string,
    guestToken?: string,
  ): { id: string; subject: TechLexiconCompletionSubject; completionProgress: TechLexiconCompletionProgress } | null {
    const owned = this.findOwnedRow(id, userId, guestToken);
    if (!owned) return null;

    let progress: TechLexiconCompletionProgress = {};
    try {
      const parsed = JSON.parse(String(owned.completion_json || '{}'));
      if (parsed && typeof parsed === 'object') {
        progress = parsed;
      }
    } catch {
      progress = {};
    }

    const existing = new Set<number>(
      Array.isArray(progress[subject])
        ? progress[subject]!
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 0)
        : [],
    );

    if (completed) {
      existing.add(index);
    } else {
      existing.delete(index);
    }

    progress[subject] = Array.from(existing).sort((a, b) => a - b);

    this.sqlite.db
      .prepare('UPDATE tech_linguist_extractions SET completion_json = ? WHERE id = ?')
      .run(JSON.stringify(progress), id);

    return { id, subject, completionProgress: progress };
  }

  deleteExtraction(id: string, userId?: string): boolean {
    if (userId) {
      this.sqlite.db.prepare(`DELETE FROM tech_linguist_extractions WHERE id = ? AND user_id = ?`).run(id, userId);
    } else {
      this.sqlite.db.prepare(`DELETE FROM tech_linguist_extractions WHERE id = ?`).run(id);
    }
    return true;
  }
}
