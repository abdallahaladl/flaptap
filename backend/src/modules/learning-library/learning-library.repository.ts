import { Injectable, Logger } from '@nestjs/common';
import { SqliteService } from '../../core/database/sqlite.service';
import {
  GeneratedLearningCandidate,
  LearningLibraryBatch,
  LearningLibraryItem,
  LearningLibraryStats,
  ListLibraryItemsQuery,
  MasteryStatus,
  UpdateLibraryItemDto,
} from './learning-library.types';
import {
  computeTokenSignature,
  ExistingDedupRecord,
  normalizeCanonicalKey,
  normalizeSlugKey,
} from './utils/lexical-dedup.util';

export interface ExistingDedupRow extends ExistingDedupRecord {
  id: string;
  categoryId: string;
}

export interface PersistBatchInput {
  batch: LearningLibraryBatch;
  userId: string;
  candidates: GeneratedLearningCandidate[];
}

@Injectable()
export class LearningLibraryRepository {
  private readonly logger = new Logger(LearningLibraryRepository.name);

  constructor(private readonly sqlite: SqliteService) {}

  private parseJsonArray<T>(raw: unknown): T[] {
    if (typeof raw !== 'string' || !raw.trim()) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private buildSearchBlob(item: GeneratedLearningCandidate): string {
    const parts = [
      item.expression,
      item.categoryLabel,
      item.register,
      item.tone,
      item.level,
      item.spokenForm,
      item.coreMeaning,
      item.localizedMeaning,
      item.textbookEquivalent,
      item.nativeContext,
      item.mistakesToAvoid,
      ...(item.variations || []),
      ...(item.combinations || []),
      ...(item.relatedExpressions || []),
      ...(item.usagePatterns || []).flatMap((p) => [p.pattern, p.meaning, p.example]),
      ...(item.patternSlots || []).flatMap((s) => [s.slot, s.role, s.example]),
      ...(item.examples || []).flatMap((e) => [e.speakerContext, e.sentence, e.explanation]),
    ];
    return parts
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  private buildSequenceMap(userId: string, domainId: string): Map<string, number> {
    const rows = this.sqlite.db
      .prepare(
        `SELECT id FROM learning_library_items
         WHERE user_id = ? AND domain_id = ?
         ORDER BY created_at ASC, rowid ASC`,
      )
      .all(userId, domainId) as Array<{ id: string }>;

    const map = new Map<string, number>();
    rows.forEach((row, index) => map.set(String(row.id), index + 1));
    return map;
  }

  private rowToItem(row: Record<string, any>): LearningLibraryItem {
    const masteryRaw = String(row.mastery_status || 'new');
    const masteryStatus: MasteryStatus =
      masteryRaw === 'learning' || masteryRaw === 'mastered' ? masteryRaw : 'new';

    return {
      id: String(row.id),
      batchId: row.batch_id ? String(row.batch_id) : null,
      domainId: String(row.domain_id),
      categoryId: String(row.category_id),
      categoryLabel: String(row.category_label),
      expression: String(row.expression),
      canonicalKey: String(row.canonical_key),
      slugKey: String(row.slug_key),
      tokenSignature: String(row.token_signature || ''),
      sequenceNumber: Number(row.sequence_number) || 0,
      register: String(row.register || ''),
      tone: String(row.tone || ''),
      level: String(row.level || ''),
      ipa: String(row.ipa || ''),
      spokenForm: String(row.spoken_form || ''),
      phoneticBreakdown: String(row.phonetic_breakdown || ''),
      coreMeaning: String(row.core_meaning || ''),
      localizedMeaning: String(row.localized_meaning || ''),
      targetLanguage: String(row.target_language || 'ar'),
      textbookEquivalent: String(row.textbook_equivalent || ''),
      nativeContext: String(row.native_context || ''),
      mistakesToAvoid: String(row.mistakes_to_avoid || ''),
      variations: this.parseJsonArray<string>(row.variations_json),
      combinations: this.parseJsonArray<string>(row.combinations_json),
      usagePatterns: this.parseJsonArray(row.usage_patterns_json),
      patternSlots: this.parseJsonArray(row.pattern_slots_json),
      examples: this.parseJsonArray(row.examples_json),
      relatedExpressions: this.parseJsonArray<string>(row.related_json),
      isFavorite: Boolean(row.is_favorite),
      isCompleted: Boolean(row.is_completed),
      masteryStatus,
      reviewCount: Number(row.review_count) || 0,
      userNotes: String(row.user_notes || ''),
      agentName: String(row.agent_name || ''),
      modelName: String(row.model_name || ''),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private rowToBatch(row: Record<string, any>): LearningLibraryBatch {
    return {
      id: String(row.id),
      domainId: String(row.domain_id),
      categoryFilter: String(row.category_filter || 'all'),
      focusTopic: String(row.focus_topic || ''),
      requestedCount: Number(row.requested_count) || 0,
      generatedCount: Number(row.generated_count) || 0,
      skippedDuplicatesCount: Number(row.skipped_duplicates_count) || 0,
      agentId: String(row.agent_id || ''),
      agentName: String(row.agent_name || ''),
      modelName: String(row.model_name || ''),
      variantName: String(row.variant_name || ''),
      executionTimeMs: Number(row.execution_time_ms) || 0,
      fallbackFrom: String(row.fallback_from || ''),
      createdAt: String(row.created_at),
    };
  }

  getExistingForDedup(userId: string, domainId: string): ExistingDedupRow[] {
    const rows = this.sqlite.db
      .prepare(
        `SELECT id, category_id, expression, canonical_key, slug_key, token_signature, variations_json
         FROM learning_library_items
         WHERE user_id = ? AND domain_id = ?
         ORDER BY created_at DESC`,
      )
      .all(userId, domainId) as Array<Record<string, any>>;

    return rows.map((row) => ({
      id: String(row.id),
      categoryId: String(row.category_id),
      expression: String(row.expression),
      canonicalKey: String(row.canonical_key),
      slugKey: String(row.slug_key),
      tokenSignature: String(row.token_signature || ''),
      variations: this.parseJsonArray<string>(row.variations_json),
    }));
  }

  private insertBatchRow(userId: string, batch: LearningLibraryBatch): void {
    this.sqlite.db
      .prepare(
        `INSERT INTO learning_library_batches (
          id, user_id, domain_id, category_filter, focus_topic,
          requested_count, generated_count, skipped_duplicates_count,
          agent_id, agent_name, model_name, variant_name,
          execution_time_ms, fallback_from, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        batch.id,
        userId,
        batch.domainId,
        batch.categoryFilter,
        batch.focusTopic,
        batch.requestedCount,
        batch.generatedCount,
        batch.skippedDuplicatesCount,
        batch.agentId,
        batch.agentName,
        batch.modelName,
        batch.variantName,
        batch.executionTimeMs,
        batch.fallbackFrom,
        batch.createdAt,
      );
  }

  private insertCandidatesInternal(
    userId: string,
    batchId: string,
    domainId: string,
    agentName: string,
    modelName: string,
    now: string,
    candidates: GeneratedLearningCandidate[],
    itemIdFactory: () => string,
  ): LearningLibraryItem[] {
    const persistedIds: string[] = [];
    const insertStmt = this.sqlite.db.prepare(
      `INSERT OR IGNORE INTO learning_library_items (
        id, user_id, batch_id, domain_id, category_id, category_label,
        expression, canonical_key, slug_key, token_signature,
        register, tone, level, ipa, spoken_form, phonetic_breakdown,
        core_meaning, localized_meaning, target_language,
        textbook_equivalent, native_context, mistakes_to_avoid,
        variations_json, combinations_json, usage_patterns_json,
        pattern_slots_json, examples_json, related_json, search_blob,
        is_favorite, mastery_status, review_count, user_notes,
        agent_name, model_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'new', 0, '', ?, ?, ?, ?)`,
    );

    for (const c of candidates) {
      const canonicalKey = normalizeCanonicalKey(c.expression);
      if (!canonicalKey) continue;

      const slugKey = normalizeSlugKey(c.expression);
      const tokenSig = computeTokenSignature(c.expression);
      const itemId = itemIdFactory();

      const res = insertStmt.run(
        itemId,
        userId,
        batchId,
        domainId,
        c.categoryId,
        c.categoryLabel,
        c.expression,
        canonicalKey,
        slugKey,
        tokenSig,
        c.register,
        c.tone,
        c.level,
        c.ipa,
        c.spokenForm,
        c.phoneticBreakdown,
        c.coreMeaning,
        c.localizedMeaning,
        c.targetLanguage,
        c.textbookEquivalent,
        c.nativeContext,
        c.mistakesToAvoid,
        JSON.stringify(c.variations || []),
        JSON.stringify(c.combinations || []),
        JSON.stringify(c.usagePatterns || []),
        JSON.stringify(c.patternSlots || []),
        JSON.stringify(c.examples || []),
        JSON.stringify(c.relatedExpressions || []),
        this.buildSearchBlob(c),
        agentName,
        modelName,
        now,
        now,
      );

      if (Number(res.changes) > 0) {
        persistedIds.push(itemId);
      }
    }

    if (persistedIds.length === 0) return [];
    const placeholders = persistedIds.map(() => '?').join(', ');
    const rows = this.sqlite.db
      .prepare(`SELECT * FROM learning_library_items WHERE id IN (${placeholders})`)
      .all(...persistedIds) as Array<Record<string, any>>;

    const byId = new Map(rows.map((r) => [String(r.id), this.rowToItem(r)]));
    const sequenceMap = this.buildSequenceMap(userId, domainId);
    return persistedIds
      .map((id) => {
        const item = byId.get(id);
        if (!item) return undefined;
        if (!item.sequenceNumber) item.sequenceNumber = sequenceMap.get(id) || 0;
        return item;
      })
      .filter((item): item is LearningLibraryItem => Boolean(item));
  }

  createBatchRecord(userId: string, batch: LearningLibraryBatch): void {
    this.insertBatchRow(userId, batch);
  }

  appendItemsToBatch(
    params: {
      userId: string;
      batchId: string;
      domainId: string;
      agentName: string;
      modelName: string;
      candidates: GeneratedLearningCandidate[];
    },
    itemIdFactory: () => string,
  ): LearningLibraryItem[] {
    if (!params.candidates.length) return [];
    const now = new Date().toISOString();
    this.sqlite.db.exec('BEGIN IMMEDIATE');
    try {
      const inserted = this.insertCandidatesInternal(
        params.userId,
        params.batchId,
        params.domainId,
        params.agentName,
        params.modelName,
        now,
        params.candidates,
        itemIdFactory,
      );
      this.sqlite.db.exec('COMMIT');
      return inserted;
    } catch (err: any) {
      try {
        this.sqlite.db.exec('ROLLBACK');
      } catch {
        // Ignore rollback errors if not in transaction
      }
      this.logger.error(`Failed to append Learning Library chunk: ${err?.message}`);
      throw err;
    }
  }

  finalizeBatchRecord(
    userId: string,
    batchId: string,
    stats: {
      generatedCount: number;
      skippedDuplicatesCount: number;
      executionTimeMs: number;
      modelName: string;
    },
  ): void {
    this.sqlite.db
      .prepare(
        `UPDATE learning_library_batches
         SET generated_count = ?, skipped_duplicates_count = ?, execution_time_ms = ?, model_name = ?
         WHERE id = ? AND user_id = ?`,
      )
      .run(
        stats.generatedCount,
        stats.skippedDuplicatesCount,
        stats.executionTimeMs,
        stats.modelName,
        batchId,
        userId,
      );
  }

  deleteBatchIfEmpty(userId: string, batchId: string): void {
    this.sqlite.db
      .prepare('DELETE FROM learning_library_batches WHERE id = ? AND user_id = ? AND generated_count = 0')
      .run(batchId, userId);
  }

  persistBatchAndItems(
    input: PersistBatchInput,
    itemIdFactory: () => string,
  ): LearningLibraryItem[] {
    const { batch, userId, candidates } = input;
    const now = batch.createdAt;

    this.sqlite.db.exec('BEGIN IMMEDIATE');
    try {
      this.insertBatchRow(userId, { ...batch, generatedCount: candidates.length });
      const persisted = this.insertCandidatesInternal(
        userId,
        batch.id,
        batch.domainId,
        batch.agentName,
        batch.modelName,
        now,
        candidates,
        itemIdFactory,
      );

      if (persisted.length !== candidates.length) {
        this.sqlite.db
          .prepare('UPDATE learning_library_batches SET generated_count = ? WHERE id = ?')
          .run(persisted.length, batch.id);
      }

      this.sqlite.db.exec('COMMIT');
      return persisted;
    } catch (err: any) {
      try {
        this.sqlite.db.exec('ROLLBACK');
      } catch {
        // Ignore rollback errors if not in transaction
      }
      this.logger.error(`Failed to persist Learning Library batch: ${err?.message}`);
      throw err;
    }
  }

  getStats(userId: string, domainId: string): LearningLibraryStats {
    const row = this.sqlite.db
      .prepare(
        `SELECT
          COUNT(*) AS totalItems,
          COALESCE(SUM(CASE WHEN mastery_status = 'new' THEN 1 ELSE 0 END), 0) AS newCount,
          COALESCE(SUM(CASE WHEN mastery_status = 'learning' THEN 1 ELSE 0 END), 0) AS learningCount,
          COALESCE(SUM(CASE WHEN mastery_status = 'mastered' THEN 1 ELSE 0 END), 0) AS masteredCount,
          COALESCE(SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END), 0) AS completedCount,
          COALESCE(SUM(CASE WHEN is_favorite = 1 THEN 1 ELSE 0 END), 0) AS favoritesCount
         FROM learning_library_items
         WHERE user_id = ? AND domain_id = ?`,
      )
      .get(userId, domainId) as Record<string, any> | undefined;

    const batchRow = this.sqlite.db
      .prepare(
        `SELECT COUNT(*) AS batchesCount
         FROM learning_library_batches
         WHERE user_id = ? AND domain_id = ?`,
      )
      .get(userId, domainId) as Record<string, any> | undefined;

    return {
      totalItems: Number(row?.totalItems) || 0,
      newCount: Number(row?.newCount) || 0,
      learningCount: Number(row?.learningCount) || 0,
      masteredCount: Number(row?.masteredCount) || 0,
      completedCount: Number(row?.completedCount) || 0,
      favoritesCount: Number(row?.favoritesCount) || 0,
      batchesCount: Number(batchRow?.batchesCount) || 0,
    };
  }

  getCategoryCounts(userId: string, domainId: string): Record<string, number> {
    const rows = this.sqlite.db
      .prepare(
        `SELECT category_id, COUNT(*) AS cnt
         FROM learning_library_items
         WHERE user_id = ? AND domain_id = ?
         GROUP BY category_id`,
      )
      .all(userId, domainId) as Array<{ category_id: string; cnt: number }>;

    const out: Record<string, number> = {};
    for (const r of rows) {
      out[String(r.category_id)] = Number(r.cnt) || 0;
    }
    return out;
  }

  getRegisterCounts(userId: string, domainId: string): Record<string, number> {
    const rows = this.sqlite.db
      .prepare(
        `SELECT register, COUNT(*) AS cnt
         FROM learning_library_items
         WHERE user_id = ? AND domain_id = ? AND register != ''
         GROUP BY register`,
      )
      .all(userId, domainId) as Array<{ register: string; cnt: number }>;

    const out: Record<string, number> = {};
    for (const r of rows) {
      out[String(r.register)] = Number(r.cnt) || 0;
    }
    return out;
  }

  listBatches(userId: string, domainId: string): LearningLibraryBatch[] {
    const rows = this.sqlite.db
      .prepare(
        `SELECT * FROM learning_library_batches
         WHERE user_id = ? AND domain_id = ?
         ORDER BY created_at DESC
         LIMIT 50`,
      )
      .all(userId, domainId) as Array<Record<string, any>>;

    return rows.map((r) => this.rowToBatch(r));
  }

  listItems(userId: string, domainId: string, query: ListLibraryItemsQuery): LearningLibraryItem[] {
    const conditions: string[] = ['user_id = ?', 'domain_id = ?'];
    const params: any[] = [userId, domainId];

    if (query.categoryId && query.categoryId !== 'all') {
      conditions.push('category_id = ?');
      params.push(query.categoryId);
    }

    if (query.masteryStatus === 'completed') {
      conditions.push('is_completed = 1');
    } else if (query.masteryStatus === 'pending') {
      conditions.push('is_completed = 0');
    } else if (query.masteryStatus && ['new', 'learning', 'mastered'].includes(query.masteryStatus)) {
      conditions.push('mastery_status = ?');
      params.push(query.masteryStatus);
    }

    if (query.favoritesOnly) {
      conditions.push('is_favorite = 1');
    }

    if (query.batchId && query.batchId !== 'all') {
      conditions.push('batch_id = ?');
      params.push(query.batchId);
    }

    if (query.register && query.register !== 'all') {
      conditions.push('LOWER(register) = ?');
      params.push(query.register.trim().toLowerCase());
    }

    if (query.q && query.q.trim()) {
      const needle = `%${query.q.trim().toLowerCase()}%`;
      conditions.push('search_blob LIKE ?');
      params.push(needle);
    }

    let orderBy = 'created_at DESC, rowid DESC';
    if (query.sort === 'alphabetical') {
      orderBy = 'LOWER(expression) ASC';
    } else if (query.sort === 'mastery') {
      orderBy =
        "is_completed ASC, CASE mastery_status WHEN 'new' THEN 0 WHEN 'learning' THEN 1 ELSE 2 END ASC, created_at DESC";
    } else if (query.sort === 'most_reviewed') {
      orderBy = 'review_count DESC, created_at DESC';
    }

    const sql = `SELECT * FROM learning_library_items WHERE ${conditions.join(' AND ')} ORDER BY ${orderBy}`;
    const rows = this.sqlite.db.prepare(sql).all(...params) as Array<Record<string, any>>;
    const sequenceMap = this.buildSequenceMap(userId, domainId);
    return rows.map((r) => {
      const item = this.rowToItem(r);
      if (!item.sequenceNumber) item.sequenceNumber = sequenceMap.get(item.id) || 0;
      return item;
    });
  }

  getItemById(userId: string, id: string): LearningLibraryItem | null {
    const row = this.sqlite.db
      .prepare('SELECT * FROM learning_library_items WHERE id = ? AND user_id = ?')
      .get(id, userId) as Record<string, any> | undefined;
    if (!row) return null;
    const item = this.rowToItem(row);
    if (!item.sequenceNumber) {
      item.sequenceNumber = this.buildSequenceMap(userId, item.domainId).get(item.id) || 0;
    }
    return item;
  }

  updateItem(userId: string, id: string, dto: UpdateLibraryItemDto): LearningLibraryItem | null {
    const existing = this.getItemById(userId, id);
    if (!existing) return null;

    const nextFav =
      typeof dto.isFavorite === 'boolean' ? (dto.isFavorite ? 1 : 0) : existing.isFavorite ? 1 : 0;
    const hasCompletedPatch = typeof dto.isCompleted === 'boolean';
    const hasMasteryPatch = Boolean(
      dto.masteryStatus && ['new', 'learning', 'mastered'].includes(dto.masteryStatus),
    );
    let nextCompleted = hasCompletedPatch
      ? dto.isCompleted
        ? 1
        : 0
      : existing.isCompleted
        ? 1
        : 0;
    let nextMastery: MasteryStatus = hasMasteryPatch
      ? (dto.masteryStatus as MasteryStatus)
      : existing.masteryStatus;

    if (hasCompletedPatch && !hasMasteryPatch) {
      nextMastery = nextCompleted === 1 ? 'mastered' : 'new';
    } else if (hasMasteryPatch && !hasCompletedPatch) {
      nextCompleted = nextMastery === 'mastered' ? 1 : 0;
    }

    const becameCompleted = nextCompleted === 1 && !existing.isCompleted;
    const nextReview =
      dto.incrementReview || becameCompleted ? existing.reviewCount + 1 : existing.reviewCount;
    const nextNotes =
      typeof dto.userNotes === 'string' ? dto.userNotes.slice(0, 2000) : existing.userNotes;
    const now = new Date().toISOString();

    this.sqlite.db
      .prepare(
        `UPDATE learning_library_items
         SET is_favorite = ?, is_completed = ?, mastery_status = ?, review_count = ?, user_notes = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .run(nextFav, nextCompleted, nextMastery, nextReview, nextNotes, now, id, userId);

    return this.getItemById(userId, id);
  }

  deleteItem(userId: string, id: string): boolean {
    const res = this.sqlite.db
      .prepare('DELETE FROM learning_library_items WHERE id = ? AND user_id = ?')
      .run(id, userId);
    return Number(res.changes) > 0;
  }

  clearDomain(userId: string, domainId?: string): number {
    if (domainId) {
      const res = this.sqlite.db
        .prepare('DELETE FROM learning_library_items WHERE user_id = ? AND domain_id = ?')
        .run(userId, domainId);
      this.sqlite.db
        .prepare('DELETE FROM learning_library_batches WHERE user_id = ? AND domain_id = ?')
        .run(userId, domainId);
      return Number(res.changes) || 0;
    }

    const res = this.sqlite.db
      .prepare('DELETE FROM learning_library_items WHERE user_id = ?')
      .run(userId);
    this.sqlite.db.prepare('DELETE FROM learning_library_batches WHERE user_id = ?').run(userId);
    return Number(res.changes) || 0;
  }

  exportAll(userId: string, domainId?: string) {
    const items = domainId
      ? (this.sqlite.db
          .prepare(
            'SELECT * FROM learning_library_items WHERE user_id = ? AND domain_id = ? ORDER BY created_at DESC',
          )
          .all(userId, domainId) as Array<Record<string, any>>)
      : (this.sqlite.db
          .prepare('SELECT * FROM learning_library_items WHERE user_id = ? ORDER BY created_at DESC')
          .all(userId) as Array<Record<string, any>>);

    const batches = domainId
      ? (this.sqlite.db
          .prepare(
            'SELECT * FROM learning_library_batches WHERE user_id = ? AND domain_id = ? ORDER BY created_at DESC',
          )
          .all(userId, domainId) as Array<Record<string, any>>)
      : (this.sqlite.db
          .prepare('SELECT * FROM learning_library_batches WHERE user_id = ? ORDER BY created_at DESC')
          .all(userId) as Array<Record<string, any>>);

    const sequenceByDomain = new Map<string, Map<string, number>>();
    const withSequence = (row: Record<string, any>) => {
      const item = this.rowToItem(row);
      let sequenceMap = sequenceByDomain.get(item.domainId);
      if (!sequenceMap) {
        sequenceMap = this.buildSequenceMap(userId, item.domainId);
        sequenceByDomain.set(item.domainId, sequenceMap);
      }
      item.sequenceNumber = sequenceMap.get(item.id) || 0;
      return item;
    };

    return {
      exportedAt: new Date().toISOString(),
      platform: 'Flaptap Learning Library',
      version: 1,
      domainFilter: domainId || 'all',
      itemsCount: items.length,
      batchesCount: batches.length,
      batches: batches.map((b) => this.rowToBatch(b)),
      items: items.map(withSequence),
    };
  }
}
