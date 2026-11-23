import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DEFAULT_LANGUAGE, getLanguage } from '../../core/ai/languages';
import {
  SHARED_CEFR_LEVELS,
  SHARED_STUDY_GOALS,
} from '../../core/ai/translation-rules.util';
import { WordDefinitionResponse, WordLookupService } from '../../core/ai/word-lookup.service';
import { AiProvidersService } from '../ai-providers/ai-providers.service';
import { LearningDomainRegistry } from './domains/learning-domain.registry';
import {
  ExistingDedupRow,
  LearningLibraryRepository,
} from './learning-library.repository';
import {
  GenerateLibraryItemsDto,
  GeneratedLearningCandidate,
  LearningDomainMetadata,
  LearningLibraryAiEngineInfo,
  LearningLibraryBatch,
  LearningLibraryItem,
  LearningLibraryStats,
  ListLibraryItemsQuery,
  UpdateLibraryItemDto,
} from './learning-library.types';
import {
  extractCompletedItemsSince,
  extractJsonBlock,
  parseLearningGenerationResponse,
} from './utils/json-salvage.util';
import { LearningDeduplicationIndex } from './utils/lexical-dedup.util';

const MIN_GENERATION_COUNT = 1;
const MAX_GENERATION_COUNT = 25;
const DEFAULT_GENERATION_COUNT = 8;
const MAX_ITEMS_PER_CHUNK = 5;
const MAX_PARALLEL_WORKERS = 5;
const MAX_EXCLUSION_PROMPT_ITEMS = 40;
/** Hard stop for the whole generation so a slow upstream can never run for minutes. */
const GENERATION_DEADLINE_MS = 120000;
const HEAVY_GENERATION_DEADLINE_MS = 165000;

/**
 * Output budget per item. The full item schema (slots, IPA, 2 examples, 2
 * variations, 2 combinations, patterns, related expressions, localized
 * meaning) costs roughly 450-600 tokens in minified JSON. Budgeting 420 tokens
 * per item used to truncate a 5-item chunk mid-array, which is exactly how a
 * 10-item request ended up saving only 4.
 */
const OUTPUT_TOKENS_PER_ITEM = 760;
/** Reasoning models bill thinking tokens inside max_tokens before any JSON. */
const REASONING_HEADROOM_TOKENS = 4800;
const HEAVY_OUTPUT_TOKENS_FLOOR = 16384;
const MIN_OUTPUT_TOKENS = 4096;
const MAX_OUTPUT_TOKENS = 24576;
/** Extra refill rounds after the sharded first wave, each asking the real deficit. */
const MAX_REFILL_WAVES = 3;
const MAX_REFILL_PLANS_PER_WAVE = 2;

const REFILL_ANGLES = [
  'Cover high-frequency expressions still missing: everyday reactions and quick agreements.',
  'Cover a different social register than earlier passes: dry humor, understatement, and soft hedges.',
  'Cover storytelling pivots and frame phrases heard on podcasts and in group chats.',
  'Cover modern peer-chat shorthand and creator commentary not used in earlier passes.',
  'Cover casual workplace and tech banter phrasing not used in earlier passes.',
];


const SINGLE_CATEGORY_ANGLES = [
  'Focus on spontaneous reactions, enthusiastic agreement, and quick responses.',
  'Focus on subtle understatement, hedging, and playful or dry humor.',
  'Focus on storytelling pivots, framing phrases, and relatable social commentary.',
  'Focus on modern peer chat, creator banter, and high-frequency everyday shortcuts.',
];

interface ChunkWorkPlan {
  chunkIndex: number;
  askCount: number;
  targetCategories?: string[];
  angleHint?: string;
}

export interface LibraryStreamCallbacks {
  signal?: AbortSignal;
  onStarted?: (info: {
    batchId: string;
    requestedCount: number;
    chunksPlanned: number;
    provider: string;
    model: string;
  }) => void;
  onChunk?: (info: {
    chunkIndex: number;
    chunksCompleted: number;
    chunksTotal: number;
    newItems: LearningLibraryItem[];
    totalSavedCount: number;
    requestedCount: number;
    skippedDuplicatesCount: number;
    elapsedMs: number;
    modelUsed: string;
  }) => void;
}

export interface GenerateLibraryItemsResult {
  batch: LearningLibraryBatch;
  items: LearningLibraryItem[];
  stats: LearningLibraryStats;
  categoryCounts: Record<string, number>;
  registerCounts: Record<string, number>;
  cefrCounts: Record<string, number>;
  requestedCount: number;
  fulfilledCount: number;
  skippedDuplicatesCount: number;
  cancelled?: boolean;
}

@Injectable()
export class LearningLibraryService {
  private readonly logger = new Logger(LearningLibraryService.name);

  constructor(
    private readonly domainRegistry: LearningDomainRegistry,
    private readonly repository: LearningLibraryRepository,
    private readonly aiProviders: AiProvidersService,
    private readonly wordLookup: WordLookupService,
  ) {}

  getEngineInfo(): LearningLibraryAiEngineInfo {
    const summary = this.aiProviders.getDefaultSummary();
    return {
      provider: summary.provider,
      model: summary.model,
      configured: summary.configured,
    };
  }

  listDomains(): {
    defaultDomainId: string;
    domains: LearningDomainMetadata[];
    levels: typeof SHARED_CEFR_LEVELS;
    studyGoals: typeof SHARED_STUDY_GOALS;
    aiEngine: LearningLibraryAiEngineInfo;
  } {
    return {
      defaultDomainId: this.domainRegistry.getDefaultDomainId(),
      domains: this.domainRegistry.listDomains(),
      levels: SHARED_CEFR_LEVELS,
      studyGoals: SHARED_STUDY_GOALS,
      aiEngine: this.getEngineInfo(),
    };
  }

  getItemById(userId: string, id: string): LearningLibraryItem {
    const item = this.repository.getItemById(userId, id);
    if (!item) {
      throw new NotFoundException('Learning library item not found.');
    }
    return item;
  }

  listLibrary(userId: string, query: ListLibraryItemsQuery) {
    const strategy = this.domainRegistry.getStrategy(query.domainId);
    const domainId = strategy.id;

    const paged = this.repository.listItemsPaged(userId, domainId, query);
    const stats = this.repository.getStats(userId, domainId);
    const categoryCounts = this.repository.getCategoryCounts(userId, domainId);
    const registerCounts = this.repository.getRegisterCounts(userId, domainId);
    const cefrCounts = this.repository.getCefrCounts(userId, domainId);
    const batches = this.repository.listBatches(userId, domainId);

    return {
      domain: strategy.metadata,
      items: paged.items,
      totalCount: stats.totalItems,
      filteredCount: paged.filteredCount,
      filteredCompletedCount: paged.filteredCompletedCount,
      page: paged.page,
      pageSize: paged.pageSize,
      totalPages: paged.totalPages,
      hasMore: paged.hasMore,
      categoryCounts,
      registerCounts,
      cefrCounts,
      stats,
      batches,
    };
  }

  listBatches(userId: string, domainId?: string): LearningLibraryBatch[] {
    const strategy = this.domainRegistry.getStrategy(domainId);
    return this.repository.listBatches(userId, strategy.id);
  }

  private buildPrioritizedExclusions(
    existingRows: ExistingDedupRow[],
    acceptedThisRun: GeneratedLearningCandidate[],
    categoryFilter: string,
  ): string[] {
    const prioritized: string[] = [];
    const seen = new Set<string>();

    const pushLabel = (val: string) => {
      const clean = String(val || '').trim();
      if (!clean) return;
      const lower = clean.toLowerCase();
      if (seen.has(lower)) return;
      seen.add(lower);
      prioritized.push(clean);
    };

    // Always exclude everything newly accepted in earlier chunks of this same run first
    for (const acc of acceptedThisRun) {
      pushLabel(acc.expression);
    }

    // Prioritize items matching the active category filter so the model never collides there
    if (categoryFilter && categoryFilter !== 'all') {
      for (const row of existingRows) {
        if (row.categoryId === categoryFilter) {
          pushLabel(row.expression);
        }
      }
    }

    for (const row of existingRows) {
      pushLabel(row.expression);
      if (prioritized.length >= MAX_EXCLUSION_PROMPT_ITEMS) break;
    }

    return prioritized.slice(0, MAX_EXCLUSION_PROMPT_ITEMS);
  }

  private buildChunkPlans(
    requestedCount: number,
    domain: LearningDomainMetadata,
    categoryFilter: string,
  ): ChunkWorkPlan[] {
    const chunkSizes: number[] = [];
    let left = requestedCount;
    while (left > 0) {
      const size = Math.min(MAX_ITEMS_PER_CHUNK, left);
      chunkSizes.push(size);
      left -= size;
    }

    const totalChunks = chunkSizes.length;
    const allCatIds = domain.categories.map((c) => c.id);
    const sliceBuckets: string[][] = Array.from({ length: totalChunks }, () => []);

    if (categoryFilter === 'all' && totalChunks > 1 && allCatIds.length > 0) {
      allCatIds.forEach((catId, idx) => {
        sliceBuckets[idx % totalChunks].push(catId);
      });
    }

    return chunkSizes.map((size, idx) => ({
      chunkIndex: idx,
      askCount: size,
      targetCategories:
        sliceBuckets[idx] && sliceBuckets[idx].length > 0 ? sliceBuckets[idx] : undefined,
      angleHint:
        categoryFilter !== 'all' && totalChunks > 1
          ? SINGLE_CATEGORY_ANGLES[idx % SINGLE_CATEGORY_ANGLES.length]
          : undefined,
    }));
  }

  async generateItems(
    userId: string,
    dto: GenerateLibraryItemsDto,
    userNativeLanguage?: string,
    callbacks?: LibraryStreamCallbacks,
  ): Promise<GenerateLibraryItemsResult> {
    const strategy = this.domainRegistry.getStrategy(dto.domainId);
    const domainId = strategy.id;

    const rawCount =
      dto.count !== undefined && dto.count !== null
        ? Number(dto.count)
        : DEFAULT_GENERATION_COUNT;
    if (!Number.isFinite(rawCount) || rawCount < MIN_GENERATION_COUNT || rawCount > MAX_GENERATION_COUNT) {
      throw new BadRequestException(
        `Please choose between ${MIN_GENERATION_COUNT} and ${MAX_GENERATION_COUNT} items per generation.`,
      );
    }
    const requestedCount = Math.round(rawCount);

    const categoryFilter = String(dto.categoryId || 'all').trim() || 'all';
    if (
      categoryFilter !== 'all' &&
      !strategy.metadata.categories.some((c) => c.id === categoryFilter)
    ) {
      throw new BadRequestException(
        `Unknown category "${categoryFilter}" for domain "${strategy.metadata.title}".`,
      );
    }

    if (!this.aiProviders.hasAnyConfiguredKey(userId)) {
      throw new ServiceUnavailableException(
        'No AI provider API key is configured. Add one in API Keys manager or .env.',
      );
    }

    const selection = await this.aiProviders
      .resolveExecutionSelection({
        userId,
        keyId: dto.keyId,
        model: dto.model,
        variant: dto.variant || dto.thinking,
      })
      .catch((err: any) => {
        throw new BadRequestException(err?.message || 'Invalid provider, model, or variant selection.');
      });

    const focusTopic = String(dto.focusTopic || '').trim().slice(0, 200);
    const preferredRegister = String(dto.register || '').trim().slice(0, 80);
    const preferredLevel = String(dto.level || 'all').trim().slice(0, 32);
    const preferredStudyGoal = String(dto.studyGoal || 'full').trim().slice(0, 40);
    const lang = getLanguage(dto.targetLanguage || userNativeLanguage || DEFAULT_LANGUAGE);

    const existingRows = this.repository.getExistingForDedup(userId, domainId);
    const dedupIndex = new LearningDeduplicationIndex(existingRows);

    const batchId = `llb_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const startedAtMs = Date.now();
    const nowIso = new Date().toISOString();
    const primaryModel = selection.modelId;

    const batch: LearningLibraryBatch = {
      id: batchId,
      domainId,
      categoryFilter,
      focusTopic,
      requestedCount,
      generatedCount: 0,
      skippedDuplicatesCount: 0,
      agentId: selection.key.id,
      agentName: selection.key.providerName,
      modelName: selection.modelId,
      variantName: selection.variantId,
      executionTimeMs: 0,
      fallbackFrom: '',
      createdAt: nowIso,
    };

    this.repository.createBatchRecord(userId, batch);

    const plans = this.buildChunkPlans(requestedCount, strategy.metadata, categoryFilter);
    callbacks?.onStarted?.({
      batchId,
      requestedCount,
      chunksPlanned: plans.length,
      provider: selection.key.providerName,
      model: selection.modelId,
    });

    const persistedItems: LearningLibraryItem[] = [];
    const acceptedCandidates: GeneratedLearningCandidate[] = [];
    const modelsUsedSet = new Set<string>();
    const workerErrors: Error[] = [];
    let fallbackFromNote = '';
    let skippedDuplicatesCount = 0;
    let chunksCompleted = 0;

    const ingestCandidateObjects = (
      chunkIdx: number,
      totalChunksPlanned: number,
      rawItems: any[],
      modelUsed: string,
      genCtx: { targetCategories?: string[]; categoryFilter?: string; targetLanguageCode?: string },
      markChunkCompleted: boolean,
    ) => {
      modelsUsedSet.add(modelUsed || primaryModel);
      const freshCandidates: GeneratedLearningCandidate[] = [];

      for (const rawItem of rawItems) {
        if (persistedItems.length + freshCandidates.length >= requestedCount) break;
        const normalized = strategy.normalizeCandidate(rawItem, genCtx as any);
        if (!normalized) continue;

        if (dedupIndex.isDuplicate(normalized.expression, normalized.variations)) {
          skippedDuplicatesCount++;
          continue;
        }

        dedupIndex.add({
          expression: normalized.expression,
          variations: normalized.variations,
        });
        acceptedCandidates.push(normalized);
        freshCandidates.push(normalized);
      }

      const newlySaved =
        freshCandidates.length > 0
          ? this.repository.appendItemsToBatch(
              {
                userId,
                batchId,
                domainId,
                agentName: batch.agentName,
                modelName: modelUsed || primaryModel,
                candidates: freshCandidates,
              },
              () => `lli_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
            )
          : [];
      if (newlySaved.length > 0) {
        persistedItems.push(...newlySaved);
      }
      if (markChunkCompleted) {
        chunksCompleted++;
      }

      if (newlySaved.length > 0 || markChunkCompleted) {
        callbacks?.onChunk?.({
          chunkIndex: chunkIdx,
          chunksCompleted,
          chunksTotal: totalChunksPlanned,
          newItems: newlySaved,
          totalSavedCount: persistedItems.length,
          requestedCount,
          skippedDuplicatesCount,
          elapsedMs: Date.now() - startedAtMs,
          modelUsed: modelUsed || primaryModel,
        });
      }
    };

    const isHeavyTier = ['high', 'xhigh', 'max', 'on'].includes(
      String(selection.variantId || '').toLowerCase(),
    );
    const deadlineAt =
      startedAtMs + (isHeavyTier ? HEAVY_GENERATION_DEADLINE_MS : GENERATION_DEADLINE_MS);

    // Rescue tier: used only to refill missing items after a heavy pass already
    // burned the latency budget, so a stall never becomes a second long wait.
    const rescueVariantId = (() => {
      if (!isHeavyTier) return undefined;
      const variants = (selection.modelOption?.variants || []).map((v) => String(v.id).toLowerCase());
      const pick = ['none', 'minimal', 'low', 'standard'].find((id) => variants.includes(id));
      if (pick) return pick;
      return selection.modelId.includes('luna') ? 'none' : 'low';
    })();

    // Extra headroom in Wave 1 costs a few output tokens but avoids a slow
    // sequential top-up roundtrip when the library already holds duplicates.
    if (dedupIndex.size >= 5 && plans.length > 0) {
      plans[0].askCount += dedupIndex.size >= 20 ? 2 : 1;
      if (plans.length > 1 && requestedCount >= 8) {
        plans[1].askCount += 1;
      }
    }

    const runSinglePlan = async (
      plan: ChunkWorkPlan,
      totalChunksPlanned: number,
      options?: { variantId?: string; timeoutMs?: number },
    ) => {
      if (callbacks?.signal?.aborted) return;

      const effectiveVariantId = options?.variantId || selection.variantId;
      const effectiveHeavy = ['high', 'xhigh', 'max', 'on'].includes(
        String(effectiveVariantId || '').toLowerCase(),
      );
      const requestTimeoutMs = Math.max(
        15000,
        Math.min(
          options?.timeoutMs ?? (effectiveHeavy ? 105000 : 48000),
          deadlineAt - Date.now(),
        ),
      );

      const exclusions = this.buildPrioritizedExclusions(
        existingRows,
        acceptedCandidates,
        categoryFilter,
      );
      const genCtx = {
        domainId,
        requestedCount,
        askCount: plan.askCount,
        categoryFilter,
        targetCategories: plan.targetCategories,
        angleHint: plan.angleHint,
        focusTopic,
        preferredRegister,
        level: preferredLevel,
        studyGoal: preferredStudyGoal,
        targetLanguageCode: lang.code,
        targetLanguageName: lang.name,
        targetLanguageNative: lang.native,
        excludedExpressions: exclusions,
      };
      const { systemPrompt, userPrompt, temperature } = strategy.buildGenerationPrompts(genCtx);

      let streamCursor = 0;
      const streamedNormKeys = new Set<string>();
      const contentTokenBudget = plan.askCount * OUTPUT_TOKENS_PER_ITEM;
      const proportionalMaxTokens = Math.max(
        MIN_OUTPUT_TOKENS,
        Math.min(
          MAX_OUTPUT_TOKENS,
          effectiveHeavy
            ? Math.max(HEAVY_OUTPUT_TOKENS_FLOOR, contentTokenBudget + REASONING_HEADROOM_TOKENS)
            : contentTokenBudget + REASONING_HEADROOM_TOKENS,
        ),
      );
      const passPersistedStart = persistedItems.length;

      const res = await this.aiProviders.executeChat(userId, {
        keyId: selection.key.id,
        model: selection.modelId,
        variant: effectiveVariantId,
        systemPrompt,
        userPrompt,
        temperature,
        maxTokens: proportionalMaxTokens,
        json: true,
        // A slow upstream must fail at the first ceiling: never chain a second
        // identical wait. Streamed items are already persisted by then.
        timeoutMs: requestTimeoutMs,
        retryOnTimeout: false,
        allowPartialOnTimeout: true,
        signal: callbacks?.signal,
        allowIntraKeyFailover: dto.allowFallback !== false,
        onContentDelta: (_delta, accumulated) => {
          if (callbacks?.signal?.aborted || persistedItems.length >= requestedCount) return;
          const { items: completedNow, nextIndex } = extractCompletedItemsSince(
            accumulated,
            streamCursor,
          );
          streamCursor = nextIndex;
          if (completedNow.length > 0) {
            for (const it of completedNow) {
              const key = String(it?.expression || '').trim().toLowerCase();
              if (key) streamedNormKeys.add(key);
            }
            ingestCandidateObjects(
              plan.chunkIndex,
              totalChunksPlanned,
              completedNow,
              selection.modelId,
              genCtx,
              false,
            );
          }
        },
      });

      if (res.fallbackFrom && !fallbackFromNote) {
        fallbackFromNote = res.fallbackFrom;
      }

      if (callbacks?.signal?.aborted) return;

      let parsedItems: any[] = [];
      try {
        const parsed = parseLearningGenerationResponse(res.content);
        parsedItems = Array.isArray(parsed?.items) ? parsed.items : [];
      } catch (parseErr: any) {
        // A truncated or malformed response still delivered whatever streamed
        // before the cutoff. Keep those items instead of failing the whole pass.
        if (persistedItems.length > passPersistedStart) {
          this.logger.warn(
            `Chunk #${plan.chunkIndex} response was incomplete; kept ${persistedItems.length - passPersistedStart} streamed item(s).`,
          );
        } else {
          throw parseErr;
        }
      }

      // Filter out items already processed live during incremental streaming so they aren't counted as duplicates
      const remainingRawItems =
        streamedNormKeys.size > 0
          ? parsedItems.filter((it) => {
              const key = String(it?.expression || it?.phrase || it?.term || '')
                .trim()
                .toLowerCase();
              return !key || !streamedNormKeys.has(key);
            })
          : parsedItems;

      ingestCandidateObjects(
        plan.chunkIndex,
        totalChunksPlanned,
        remainingRawItems,
        res.modelUsed,
        genCtx,
        true,
      );

      this.logger.log(
        `Chunk #${plan.chunkIndex}: asked ${plan.askCount}, received ${parsedItems.length}, ` +
          `saved ${persistedItems.length}/${requestedCount}${res.truncated ? ' (output hit max_tokens)' : ''}`,
      );
    };

    // Wave 1: Execute sharded micro-batches concurrently (keep heavy reasoning concurrency at 2 to prevent upstream starvation)
    let cursor = 0;
    const maxWorkers = isHeavyTier ? 2 : MAX_PARALLEL_WORKERS;
    const workerCount = Math.min(maxWorkers, plans.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (cursor < plans.length && !callbacks?.signal?.aborted) {
          if (Date.now() > deadlineAt - 20000) break;
          const plan = plans[cursor++];
          try {
            await runSinglePlan(plan, plans.length);
          } catch (err: any) {
            if (callbacks?.signal?.aborted) break;
            workerErrors.push(err);
            this.logger.warn(`Chunk #${plan.chunkIndex} failed cleanly: ${err?.message}`);
          }
        }
      }),
    );

    // Wave 2+: bounded refill waves. Each wave asks for the exact deficit (plus
    // one spare against duplicates) and runs up to two plans concurrently.
    // A single capped top-up is why a 10-item request could settle at 4 items.
    let refillWave = 0;
    let emptyWaves = 0;
    while (
      persistedItems.length < requestedCount &&
      !callbacks?.signal?.aborted &&
      refillWave < MAX_REFILL_WAVES &&
      emptyWaves < 2
    ) {
      const remaining = requestedCount - persistedItems.length;
      const useRescue = Boolean(rescueVariantId && rescueVariantId !== selection.variantId);
      const requiredWindowMs = useRescue ? 26000 : isHeavyTier ? 60000 : 18000;
      if (deadlineAt - Date.now() < requiredWindowMs) break;

      // Ask one spare item on every refill: a single duplicate must not cost a
      // whole extra roundtrip. Extra items are dropped by the requestedCount cap.
      const headroom = dedupIndex.size >= 40 ? 2 : 1;
      const plansToRun = Math.min(
        MAX_REFILL_PLANS_PER_WAVE,
        Math.ceil(remaining / MAX_ITEMS_PER_CHUNK),
      );
      const wavePlans: ChunkWorkPlan[] = Array.from({ length: plansToRun }, (_, i) => {
        const slotRemaining = remaining - i * MAX_ITEMS_PER_CHUNK;
        return {
          chunkIndex: plans.length + refillWave * MAX_REFILL_PLANS_PER_WAVE + i,
          askCount: Math.max(
            1,
            Math.min(MAX_ITEMS_PER_CHUNK, slotRemaining + headroom),
          ),
          angleHint:
            categoryFilter === 'all'
              ? REFILL_ANGLES[(refillWave * MAX_REFILL_PLANS_PER_WAVE + i) % REFILL_ANGLES.length]
              : SINGLE_CATEGORY_ANGLES[
                  (plans.length + refillWave + i) % SINGLE_CATEGORY_ANGLES.length
                ],
        };
      });

      const beforeWave = persistedItems.length;
      await Promise.all(
        wavePlans.map(async (plan) => {
          try {
            await runSinglePlan(
              plan,
              plans.length + wavePlans.length,
              {
                variantId: useRescue ? rescueVariantId : undefined,
                timeoutMs: useRescue ? 45000 : undefined,
              },
            );
          } catch (err: any) {
            if (!callbacks?.signal?.aborted) {
              workerErrors.push(err);
              this.logger.warn(
                `Refill wave ${refillWave + 1} chunk #${plan.chunkIndex} failed: ${err?.message}`,
              );
            }
          }
        }),
      );

      emptyWaves = persistedItems.length > beforeWave ? 0 : emptyWaves + 1;
      refillWave++;
    }

    const totalExecutionMs = Date.now() - startedAtMs;
    const finalModelSummary =
      modelsUsedSet.size > 0 ? Array.from(modelsUsedSet).join(', ') : primaryModel;

    if (persistedItems.length < requestedCount) {
      this.logger.warn(
        `Short of requested count: ${persistedItems.length}/${requestedCount} after ${refillWave} refill wave(s) ` +
          `(skipped ${skippedDuplicatesCount} duplicate(s), ${totalExecutionMs}ms).`,
      );
    }

    if (persistedItems.length === 0) {
      this.repository.deleteBatchIfEmpty(userId, batchId);
      if (callbacks?.signal?.aborted) {
        return {
          batch: { ...batch, generatedCount: 0, executionTimeMs: totalExecutionMs },
          items: [],
          stats: this.repository.getStats(userId, domainId),
          categoryCounts: this.repository.getCategoryCounts(userId, domainId),
          registerCounts: this.repository.getRegisterCounts(userId, domainId),
          cefrCounts: this.repository.getCefrCounts(userId, domainId),
          requestedCount,
          fulfilledCount: 0,
          skippedDuplicatesCount,
          cancelled: true,
        };
      }
      const firstErr = workerErrors[0];
      throw new Error(
        firstErr?.message ||
          'No unique new expressions could be generated. Try broadening the category or topic focus.',
      );
    }

    this.repository.finalizeBatchRecord(userId, batchId, {
      generatedCount: persistedItems.length,
      skippedDuplicatesCount,
      executionTimeMs: totalExecutionMs,
      modelName: finalModelSummary,
    });

    batch.generatedCount = persistedItems.length;
    batch.skippedDuplicatesCount = skippedDuplicatesCount;
    batch.executionTimeMs = totalExecutionMs;
    batch.modelName = finalModelSummary;
    batch.fallbackFrom = fallbackFromNote;

    const stats = this.repository.getStats(userId, domainId);
    const categoryCounts = this.repository.getCategoryCounts(userId, domainId);
    const registerCounts = this.repository.getRegisterCounts(userId, domainId);
    const cefrCounts = this.repository.getCefrCounts(userId, domainId);

    this.logger.log(
      `Generated ${persistedItems.length}/${requestedCount} unique items in "${domainId}" (skipped ${skippedDuplicatesCount} duplicates, ${totalExecutionMs}ms, model=${batch.modelName})`,
    );

    return {
      batch,
      items: persistedItems,
      stats,
      categoryCounts,
      registerCounts,
      cefrCounts,
      requestedCount,
      fulfilledCount: persistedItems.length,
      skippedDuplicatesCount,
      cancelled: Boolean(callbacks?.signal?.aborted),
    };
  }

  updateItem(userId: string, id: string, dto: UpdateLibraryItemDto): LearningLibraryItem {
    const updated = this.repository.updateItem(userId, id, dto);
    if (!updated) {
      throw new NotFoundException('Learning library item not found.');
    }
    return updated;
  }

  deleteItem(userId: string, id: string): boolean {
    return this.repository.deleteItem(userId, id);
  }

  clearDomain(userId: string, domainId?: string): number {
    if (domainId) {
      this.domainRegistry.getStrategy(domainId);
    }
    return this.repository.clearDomain(userId, domainId);
  }

  exportLibrary(userId: string, domainId?: string) {
    if (domainId) {
      this.domainRegistry.getStrategy(domainId);
    }
    return this.repository.exportAll(userId, domainId);
  }

  async defineWordInContext(
    userId: string,
    params: {
      itemId?: string;
      word: string;
      contextSentence?: string;
      language?: string;
    },
  ): Promise<WordDefinitionResponse> {
    let contextSentence = String(params.contextSentence || '').trim();
    let title = 'Natural American English';

    if (params.itemId) {
      const item = this.repository.getItemById(userId, params.itemId);
      if (item) {
        title = item.expression;
        if (!contextSentence) {
          contextSentence = item.examples?.[0]?.sentence || item.coreMeaning || item.expression;
        }
      }
    }

    const cleanContext = contextSentence || params.word;
    const lang = getLanguage(params.language || DEFAULT_LANGUAGE);

    try {
      return await this.wordLookup.defineWordInContext({
        word: params.word,
        contextSentence: cleanContext,
        title,
        targetLanguageCode: lang.code,
      });
    } catch {
      const lookupSys = [
        'You are a concise, authoritative English lexicographer and American pronunciation coach.',
        `Return ONLY a valid JSON object with fields: term, ipa, partOfSpeech, definition, generalTranslation (in ${lang.name}), translation (contextual ${lang.name}), spokenTip.`,
      ].join('\n');
      const lookupUsr = `Expression/Topic: "${title}"\nContext sentence: "${cleanContext}"\nWord: "${params.word}"\nTarget language: ${lang.name} (${lang.native})`;

      const execRes = await this.aiProviders.executeChat(userId, {
        systemPrompt: lookupSys,
        userPrompt: lookupUsr,
        temperature: 0.15,
        maxTokens: 700,
        timeoutMs: 18000,
        json: true,
      });

      const parsed = JSON.parse(extractJsonBlock(execRes.content));
      return {
        term: String(parsed?.term || params.word).trim(),
        ipa: String(parsed?.ipa || '').trim(),
        partOfSpeech: String(parsed?.partOfSpeech || '').trim(),
        definition: String(parsed?.definition || '').trim(),
        generalTranslation: String(parsed?.generalTranslation || '').trim(),
        translation: String(parsed?.translation || '').trim(),
        targetLanguage: lang.code,
        targetLanguageName: lang.name,
        rtl: Boolean(lang.rtl),
        spokenTip: String(parsed?.spokenTip || '').trim(),
        contextSentence: cleanContext,
        sentenceIndex: 1,
        timestampSec: 0,
        scope: 'word',
      };
    }
  }
}
