import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DEFAULT_LANGUAGE, getLanguage } from '../../core/ai/languages';
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
const MAX_EXCLUSION_PROMPT_ITEMS = 120;

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
    aiEngine: LearningLibraryAiEngineInfo;
  } {
    return {
      defaultDomainId: this.domainRegistry.getDefaultDomainId(),
      domains: this.domainRegistry.listDomains(),
      aiEngine: this.getEngineInfo(),
    };
  }

  listLibrary(userId: string, query: ListLibraryItemsQuery) {
    const strategy = this.domainRegistry.getStrategy(query.domainId);
    const domainId = strategy.id;

    const items = this.repository.listItems(userId, domainId, query);
    const stats = this.repository.getStats(userId, domainId);
    const categoryCounts = this.repository.getCategoryCounts(userId, domainId);
    const registerCounts = this.repository.getRegisterCounts(userId, domainId);
    const batches = this.repository.listBatches(userId, domainId);

    return {
      domain: strategy.metadata,
      items,
      totalCount: stats.totalItems,
      filteredCount: items.length,
      categoryCounts,
      registerCounts,
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

    // When the library already has items, add +1 headroom inside Wave 1 so duplicate filtering
    // doesn't force a slow sequential Wave 2 top-up roundtrip.
    if (dedupIndex.size >= 5 && plans.length > 0) {
      plans[0].askCount += 1;
      if (plans.length > 1 && requestedCount >= 8) {
        plans[1].askCount += 1;
      }
    }

    const runSinglePlan = async (plan: ChunkWorkPlan, totalChunksPlanned: number) => {
      if (callbacks?.signal?.aborted) return;

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
        targetLanguageCode: lang.code,
        targetLanguageName: lang.name,
        targetLanguageNative: lang.native,
        excludedExpressions: exclusions,
      };
      const { systemPrompt, userPrompt, temperature } = strategy.buildGenerationPrompts(genCtx);

      let streamCursor = 0;
      const streamedNormKeys = new Set<string>();
      const proportionalMaxTokens = isHeavyTier
        ? 16384
        : Math.min(4096, plan.askCount * 420 + 600);

      const res = await this.aiProviders.executeChat(userId, {
        keyId: selection.key.id,
        model: selection.modelId,
        variant: selection.variantId,
        systemPrompt,
        userPrompt,
        temperature,
        maxTokens: proportionalMaxTokens,
        json: true,
        signal: callbacks?.signal,
        allowIntraKeyFailover: dto.allowFallback !== false,
        onContentDelta: callbacks?.onChunk
          ? (_delta, accumulated) => {
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
            }
          : undefined,
      });

      if (res.fallbackFrom && !fallbackFromNote) {
        fallbackFromNote = res.fallbackFrom;
      }

      if (callbacks?.signal?.aborted) return;

      const parsed = parseLearningGenerationResponse(res.content);
      const allRawItems = Array.isArray(parsed?.items) ? parsed.items : [];
      // Filter out items already processed live during incremental streaming so they aren't counted as duplicates
      const remainingRawItems =
        streamedNormKeys.size > 0
          ? allRawItems.filter((it) => {
              const key = String(it?.expression || it?.phrase || it?.term || '')
                .trim()
                .toLowerCase();
              return !key || !streamedNormKeys.has(key);
            })
          : allRawItems;

      ingestCandidateObjects(
        plan.chunkIndex,
        totalChunksPlanned,
        remainingRawItems,
        res.modelUsed,
        genCtx,
        true,
      );
    };

    // Wave 1: Execute sharded micro-batches concurrently (keep heavy reasoning concurrency at 2 to prevent upstream starvation)
    let cursor = 0;
    const maxWorkers = isHeavyTier ? 2 : MAX_PARALLEL_WORKERS;
    const workerCount = Math.min(maxWorkers, plans.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (cursor < plans.length && !callbacks?.signal?.aborted) {
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

    // Wave 2: Only run top-up passes if Wave 1 actually produced items (avoid doomed retries when upstream is down)
    if (persistedItems.length > 0 || workerErrors.length === 0) {
      for (
        let topUp = 0;
        topUp < 2 &&
        persistedItems.length < requestedCount &&
        !callbacks?.signal?.aborted;
        topUp++
      ) {
        const remaining = requestedCount - persistedItems.length;
        const headroom = dedupIndex.size >= 15 ? 1 : 0;
        const askCount = Math.min(MAX_ITEMS_PER_CHUNK + 1, Math.min(MAX_ITEMS_PER_CHUNK, remaining) + headroom);
        const topUpIdx = plans.length + topUp;

        try {
          await runSinglePlan(
            {
              chunkIndex: topUpIdx,
              askCount,
              angleHint:
                categoryFilter === 'all'
                  ? 'Choose fresh, distinctive expressions not yet covered in earlier passes.'
                  : SINGLE_CATEGORY_ANGLES[topUp % SINGLE_CATEGORY_ANGLES.length],
            },
            plans.length + topUp + 1,
          );
        } catch (err: any) {
          if (callbacks?.signal?.aborted) break;
          workerErrors.push(err);
          this.logger.warn(`Top-up pass ${topUp + 1} failed: ${err?.message}`);
        }
      }
    }

    const totalExecutionMs = Date.now() - startedAtMs;
    const finalModelSummary =
      modelsUsedSet.size > 0 ? Array.from(modelsUsedSet).join(', ') : primaryModel;

    if (persistedItems.length === 0) {
      this.repository.deleteBatchIfEmpty(userId, batchId);
      if (callbacks?.signal?.aborted) {
        return {
          batch: { ...batch, generatedCount: 0, executionTimeMs: totalExecutionMs },
          items: [],
          stats: this.repository.getStats(userId, domainId),
          categoryCounts: this.repository.getCategoryCounts(userId, domainId),
          registerCounts: this.repository.getRegisterCounts(userId, domainId),
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

    this.logger.log(
      `Generated ${persistedItems.length}/${requestedCount} unique items in "${domainId}" (skipped ${skippedDuplicatesCount} duplicates, ${totalExecutionMs}ms, model=${batch.modelName})`,
    );

    return {
      batch,
      items: persistedItems,
      stats,
      categoryCounts,
      registerCounts,
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
