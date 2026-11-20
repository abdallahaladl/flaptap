import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getLanguage } from '../../core/ai/languages';
import { WordDefinitionResponse, WordLookupService } from '../../core/ai/word-lookup.service';
import { HistoryRepository } from '../../core/database/history.repository';
import { AiProvidersService } from '../ai-providers/ai-providers.service';
import { AmericanExtractorRepository } from './american-extractor.repository';
import {
  ExtractionProgressHooks,
  ExtractionResult,
  ExtractorCompletionProgress,
  ExtractorConfig,
  ExtractorInputKind,
  ListHistoryQuery,
  PaginatedHistoryResult,
  ResolvedSource,
} from './american-extractor.types';
import {
  buildExtractionPrompts,
  EXTRACTION_DEPTHS,
  EXTRACTION_FOCUSES,
  EXTRACTION_GOALS,
  EXTRACTION_LEVELS,
  EXTRACTION_ORDERS,
  EXTRACTION_STYLES,
  EXTRACTION_TYPES,
  normalizeDepth,
  normalizeExtractionType,
  normalizeFocus,
  normalizeLevel,
  normalizeOrder,
  normalizeStyle,
  normalizeStudyGoal,
} from './extraction.prompt';
import { SourceResolverService } from './sources/source-resolver.service';
import {
  extractCompletedItemsFromStream,
  mergeChunkExtractions,
  NormalizedExtraction,
  normalizeExtraction,
  parseModelJson,
} from './utils/extraction-normalize.util';
import {
  computeExtractionHash,
  countWords,
  findContextSentence,
  normalizeWhitespace,
  splitSourceIntoChunks,
} from './utils/source-text.util';

const EXTRACTION_CATEGORIES = [
  { id: 'all', label: 'All items', hint: 'Every extracted American English item.' },
  { id: 'idiom', label: 'Idioms & expressions', hint: 'Figurative multi-word expressions.' },
  { id: 'slang', label: 'Slang', hint: 'Current casual and internet-native language.' },
  { id: 'phrasal_verb', label: 'Phrasal verbs', hint: 'Verb + particle units with shifted meaning.' },
  { id: 'vocabulary', label: 'Advanced vocabulary', hint: 'High-value words above B1.' },
  { id: 'collocation', label: 'Collocations', hint: 'Natural word partnerships.' },
  { id: 'connected_speech', label: 'Connected speech', hint: 'Reductions, linking, and fast-speech forms.' },
  { id: 'discourse_marker', label: 'Discourse markers', hint: 'Spoken pivots and framing moves.' },
  { id: 'pattern', label: 'Patterns', hint: 'Reusable sentence frames.' },
] as const;

const MAX_UPLOAD_MB = 50;
const EXTRACTOR_PREFERRED_MODELS = ['gpt-6-luna', 'gpt-5.6-luna'];
const EXTRACTOR_PREFERRED_VARIANTS = ['medium', 'low', 'standard'];

export interface ExtractRequest {
  userId: string;
  inputKind?: ExtractorInputKind;
  url?: string;
  text?: string;
  title?: string;
  lessonId?: string;
  language?: string;
  extractionType?: string;
  style?: string;
  level?: string;
  focus?: string;
  depth?: string;
  studyGoal?: string;
  order?: string;
  keyId?: string;
  model?: string;
  variant?: string;
  force?: boolean;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error('Extraction cancelled.');
    err.name = 'AbortError';
    throw err;
  }
}

@Injectable()
export class AmericanExtractorService {
  private readonly logger = new Logger(AmericanExtractorService.name);

  constructor(
    private readonly resolver: SourceResolverService,
    private readonly aiProviders: AiProvidersService,
    private readonly wordLookup: WordLookupService,
    private readonly repository: AmericanExtractorRepository,
    private readonly historyRepo: HistoryRepository,
  ) {}

  getConfig(): ExtractorConfig {
    const summary = this.aiProviders.getDefaultSummary();
    return {
      categories: EXTRACTION_CATEGORIES.map((category) => ({ ...category })),
      focuses: EXTRACTION_FOCUSES.map((focus) => ({ ...focus })),
      extractionTypes: EXTRACTION_TYPES.map((item) => ({ ...item })),
      styles: EXTRACTION_STYLES.map((item) => ({ ...item })),
      levels: EXTRACTION_LEVELS.map((item) => ({ ...item })),
      depths: EXTRACTION_DEPTHS.map((item) => ({ ...item })),
      studyGoals: EXTRACTION_GOALS.map((item) => ({ ...item })),
      orders: EXTRACTION_ORDERS.map((item) => ({ ...item })),
      defaultModel: EXTRACTOR_PREFERRED_MODELS[0],
      defaultVariant: EXTRACTOR_PREFERRED_VARIANTS[0],
      maxUploadMb: MAX_UPLOAD_MB,
      acceptedUploadTypes: [
        '.txt', '.md', '.markdown', '.srt', '.vtt', '.json',
        '.png', '.jpg', '.jpeg', '.webp', '.gif',
        '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg', '.opus',
        '.mp4', '.mov', '.webm', '.mkv',
      ],
      aiConfigured: summary.configured,
    };
  }

  async extract(
    request: ExtractRequest,
    hooks: ExtractionProgressHooks = {},
  ): Promise<ExtractionResult> {
    const userId = request.userId;
    if (!userId) throw new BadRequestException('Sign in to run an extraction.');
    throwIfAborted(hooks.signal);

    const inputKind: ExtractorInputKind =
      request.inputKind ||
      (request.url ? 'url' : request.lessonId ? 'lesson' : 'text');

    hooks.onStage?.({
      stage: 'detecting',
      label: 'Detecting source',
      detail:
        inputKind === 'url'
          ? 'Checking URL platform and readability'
          : inputKind === 'lesson'
            ? 'Locating your saved Flaptap lesson'
            : 'Inspecting pasted text',
      progress: 8,
    });

    hooks.onStage?.({
      stage: 'resolving',
      label:
        inputKind === 'url'
          ? 'Reading link source'
          : inputKind === 'lesson'
            ? 'Loading saved transcript'
            : 'Preparing text',
      detail:
        inputKind === 'url'
          ? 'Fetching captions, readable article, or audio transcription'
          : inputKind === 'lesson'
            ? 'Importing transcript from your Flaptap Library'
            : 'Normalizing formatting and punctuation',
      progress: 18,
    });

    let source: ResolvedSource;
    if (inputKind === 'url') {
      source = await this.resolver.resolveUrl(String(request.url || ''), {
        userId,
        keyId: request.keyId,
        model: request.model,
        variant: request.variant,
      });
    } else if (inputKind === 'lesson') {
      source = await this.resolver.resolveLesson(userId, String(request.lessonId || ''));
    } else {
      source = await this.resolver.resolveText(String(request.text || ''), request.title);
    }

    throwIfAborted(hooks.signal);
    return this.runExtraction(userId, source, request, hooks);
  }

  async extractUpload(
    params: {
      userId: string;
      buffer: Buffer;
      originalName: string;
      mimeType?: string;
      language?: string;
      extractionType?: string;
      style?: string;
      level?: string;
      focus?: string;
      depth?: string;
      studyGoal?: string;
      order?: string;
      keyId?: string;
      model?: string;
      variant?: string;
      force?: boolean;
    },
    hooks: ExtractionProgressHooks = {},
  ): Promise<ExtractionResult> {
    if (!params.userId) throw new BadRequestException('Sign in to run an extraction.');
    if (!params.buffer || params.buffer.length === 0) {
      throw new BadRequestException('Choose a file to upload.');
    }
    if (params.buffer.length > MAX_UPLOAD_MB * 1024 * 1024) {
      throw new BadRequestException(`Files must be ${MAX_UPLOAD_MB} MB or smaller.`);
    }
    throwIfAborted(hooks.signal);

    hooks.onStage?.({
      stage: 'detecting',
      label: 'Inspecting file',
      detail: `${params.originalName} (${(params.buffer.length / (1024 * 1024)).toFixed(1)} MB)`,
      progress: 8,
    });

    hooks.onStage?.({
      stage: 'resolving',
      label: 'Reading uploaded file',
      detail: 'Running OCR, speech-to-text, or document parsing',
      progress: 20,
    });

    const source = await this.resolver.resolveUpload({
      userId: params.userId,
      buffer: params.buffer,
      originalName: params.originalName,
      mimeType: params.mimeType,
      keyId: params.keyId,
      model: params.model,
      variant: params.variant,
    });

    throwIfAborted(hooks.signal);
    return this.runExtraction(
      params.userId,
      source,
      {
        userId: params.userId,
        language: params.language,
        extractionType: params.extractionType,
        style: params.style,
        level: params.level,
        focus: params.focus,
        depth: params.depth,
        studyGoal: params.studyGoal,
        order: params.order,
        keyId: params.keyId,
        model: params.model,
        variant: params.variant,
        force: params.force,
      },
      hooks,
    );
  }

  private async runExtraction(
    userId: string,
    source: ResolvedSource,
    request: ExtractRequest,
    hooks: ExtractionProgressHooks = {},
  ): Promise<ExtractionResult> {
    const startedAt = Date.now();
    const language = getLanguage(request.language);
    const extractionType = normalizeExtractionType(request.extractionType);
    const style = normalizeStyle(request.style);
    const level = normalizeLevel(request.level);
    const focus = normalizeFocus(request.focus);
    const depth = normalizeDepth(request.depth);
    const studyGoal = normalizeStudyGoal(request.studyGoal);
    const order = normalizeOrder(request.order);

    const contentHash = computeExtractionHash({
      sourceText: source.text,
      targetLanguage: language.code,
      extractionType: extractionType.id,
      style: style.id,
      level: level.id,
      focus: focus.id,
      depth: depth.id,
      studyGoal: studyGoal.id,
      order: order.id,
    });

    const chunks = splitSourceIntoChunks(source.text);
    const wordCount = countWords(source.text);

    hooks.onStage?.({
      stage: 'cleaning',
      label: 'Checking library cache',
      detail: `${wordCount.toLocaleString()} words ready from ${source.sourceLabel}`,
      progress: 28,
    });

    if (!request.force) {
      const cached = this.repository.findByContentHash(userId, contentHash);
      if (cached) {
        hooks.onSourceReady?.({
          title: cached.title,
          creator: cached.creator,
          sourceType: cached.sourceType,
          sourceLabel: cached.sourceLabel,
          wordCount,
          truncated: source.truncated,
          chunkCount: chunks.length,
          cached: true,
        });
        hooks.onStage?.({
          stage: 'saving',
          label: 'Loaded instantly from your Library',
          detail: `${cached.itemCount} phrases already extracted for this source`,
          progress: 100,
        });
        this.logger.log(`Extractor cache hit ${cached.id} for user ${userId}`);
        return { ...cached, cached: true };
      }
    }

    hooks.onSourceReady?.({
      title: source.title,
      creator: source.creator,
      sourceType: source.sourceType,
      sourceLabel: source.sourceLabel,
      wordCount,
      truncated: source.truncated,
      chunkCount: chunks.length,
      cached: false,
    });

    if (chunks.length > 1) {
      hooks.onStage?.({
        stage: 'chunking',
        label: `Splitting long source into ${chunks.length} sections`,
        detail: `${wordCount.toLocaleString()} words will be analyzed across ${chunks.length} passes`,
        progress: 34,
        chunkIndex: 0,
        totalChunks: chunks.length,
      });
    }

    const aiTarget = await this.resolveAiDefaults(userId, request);
    throwIfAborted(hooks.signal);

    const emittedPreviewKeys = new Set<string>();
    const chunkResults: NormalizedExtraction[] = [];
    const seenTerms: string[] = [];
    let lastProviderName = '';
    let lastModelUsed = '';
    let lastVariantUsed = 'standard';
    let lastFallbackFrom: string | undefined;

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      throwIfAborted(hooks.signal);
      const chunkText = chunks[chunkIndex];
      const basePct = 36 + Math.round((chunkIndex / chunks.length) * 46);

      hooks.onStage?.({
        stage: 'extracting',
        label:
          chunks.length > 1
            ? `Extracting phrases · Section ${chunkIndex + 1} of ${chunks.length}`
            : 'Extracting American English phrases',
        detail: `Streaming from ${aiTarget.model || 'configured AI model'}`,
        progress: basePct,
        chunkIndex: chunkIndex + 1,
        totalChunks: chunks.length,
      });

      const prompt = buildExtractionPrompts({
        source,
        chunkText,
        chunkIndex,
        totalChunks: chunks.length,
        excludeTerms: seenTerms,
        targetLanguage: language.code,
        extractionType: extractionType.id,
        style: style.id,
        level: level.id,
        focus: focus.id,
        depth: depth.id,
        studyGoal: studyGoal.id,
        order: order.id,
      });

      const executePass = async (expanded: boolean) =>
        this.aiProviders.executeChat(userId, {
          keyId: aiTarget.keyId,
          model: aiTarget.model,
          variant: aiTarget.variant,
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          temperature: 0.2,
          maxTokens: expanded ? 24576 : 16384,
          timeoutMs: 180000,
          json: true,
          signal: hooks.signal,
          allowIntraKeyFailover: true,
          allowPartialOnTimeout: true,
          onContentDelta: hooks.onItemPreview
            ? (_delta, accumulated) => {
                const previews = extractCompletedItemsFromStream(
                  accumulated,
                  emittedPreviewKeys,
                  chunkText,
                );
                for (const preview of previews) {
                  hooks.onItemPreview?.(preview);
                }
              }
            : undefined,
        });

      let aiResponse = await executePass(false);
      let parsed: any;
      try {
        parsed = parseModelJson(aiResponse.content);
      } catch {
        throwIfAborted(hooks.signal);
        this.logger.warn(
          `Extraction JSON parse failed on chunk ${chunkIndex + 1}/${chunks.length}; retrying once with larger budget.`,
        );
        aiResponse = await executePass(true);
        parsed = parseModelJson(aiResponse.content);
      }

      lastProviderName = aiResponse.providerName;
      lastModelUsed = aiResponse.modelUsed;
      lastVariantUsed = aiResponse.variantUsed || 'standard';
      if (aiResponse.fallbackFrom) lastFallbackFrom = aiResponse.fallbackFrom;

      const chunkNormalized = normalizeExtraction({
        parsed,
        sourceText: chunkText,
        fallbackTitle: source.title,
        targetLanguage: language.code,
        extractionType: extractionType.id,
        allowEmpty: chunks.length > 1,
      });

      chunkResults.push(chunkNormalized);
      for (const item of chunkNormalized.items) {
        seenTerms.push(item.term);
      }
    }

    throwIfAborted(hooks.signal);

    hooks.onStage?.({
      stage: 'grounding',
      label: 'Verifying source grounding & context',
      detail: 'Anchoring every phrase to its exact source sentence',
      progress: 88,
    });

    const normalized =
      chunkResults.length === 1
        ? chunkResults[0]
        : mergeChunkExtractions({
            chunks: chunkResults,
            sourceText: source.text,
            fallbackTitle: source.title,
            order: order.id,
          });

    const title =
      source.title &&
      source.title !== 'Pasted English Text' &&
      source.title !== 'Uploaded source'
        ? source.title
        : normalized.title || source.title;
    const createdAt = new Date().toISOString();
    const id = `aex_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const executionTimeMs = Date.now() - startedAt;

    const enrichedMeta = {
      ...source.sourceMeta,
      warnings: source.warnings,
      truncated: source.truncated,
      chunkCount: chunks.length,
      extractionOptions: {
        extractionType: extractionType.id,
        extractionTypeLabel: extractionType.shortLabel || extractionType.label,
        style: style.id,
        styleLabel: style.shortLabel || style.label,
        level: level.id,
        levelLabel: level.shortLabel || level.label,
        focus: focus.id,
        focusLabel: focus.shortLabel || focus.label,
        depth: depth.id,
        depthLabel: depth.shortLabel || depth.label,
        studyGoal: studyGoal.id,
        studyGoalLabel: studyGoal.shortLabel || studyGoal.label,
        order: order.id,
        orderLabel: order.shortLabel || order.label,
      },
    };

    hooks.onStage?.({
      stage: 'saving',
      label: 'Saving to your Library',
      detail: `${normalized.items.length} verified American English phrases`,
      progress: 96,
    });

    this.repository.save({
      id,
      userId,
      title,
      creator: source.creator,
      summary: normalized.summary,
      speakerStyle: normalized.speakerStyle,
      sourceType: source.sourceType,
      sourceUrl: source.sourceUrl,
      sourceLabel: source.sourceLabel,
      sourceMeta: enrichedMeta,
      targetLanguage: language.code,
      agentName: lastProviderName,
      modelName: lastModelUsed,
      reasoningLevel: lastVariantUsed,
      executionTimeMs,
      fallbackFrom: lastFallbackFrom,
      items: normalized.items,
      sourceText: source.text,
      contentHash,
      createdAt,
    });

    this.logger.log(
      `Extractor note ${id}: ${normalized.items.length} items from ${source.sourceType} ` +
        `(${chunks.length} chunk${chunks.length === 1 ? '' : 's'}, ${extractionType.id}/${style.id}/${level.id}) ` +
        `via ${lastProviderName}/${lastModelUsed} in ${executionTimeMs}ms`,
    );

    return {
      id,
      title,
      creator: source.creator,
      summary: normalized.summary,
      speakerStyle: normalized.speakerStyle,
      sourceType: source.sourceType,
      sourceUrl: source.sourceUrl,
      sourceLabel: source.sourceLabel,
      sourceMeta: enrichedMeta,
      targetLanguage: language.code,
      targetLanguageName: language.name,
      rtl: Boolean(language.rtl),
      agentUsed: lastProviderName,
      modelUsed: lastModelUsed,
      reasoningLevel: lastVariantUsed,
      executionTimeMs,
      fallbackFrom: lastFallbackFrom,
      cached: false,
      itemCount: normalized.items.length,
      items: normalized.items,
      sourceText: source.text,
      isCompleted: false,
      completionProgress: {},
      createdAt,
      updatedAt: createdAt,
    };
  }

  listHistory(userId: string, query: ListHistoryQuery = {}): PaginatedHistoryResult {
    return this.repository.listPaginated(userId, query);
  }

  getNote(userId: string, id: string): ExtractionResult {
    const note = this.repository.findById(userId, id);
    if (!note) throw new NotFoundException('Extraction not found.');
    return note;
  }

  renameNote(userId: string, id: string, rawTitle: string) {
    const title = normalizeWhitespace(String(rawTitle || '')).slice(0, 140);
    if (!title) {
      throw new BadRequestException('Title cannot be empty.');
    }
    const updated = this.repository.rename(userId, id, title);
    if (!updated) throw new NotFoundException('Extraction not found.');
    return updated;
  }

  setItemCompletion(
    userId: string,
    id: string,
    index: number,
    completed: boolean,
  ): { id: string; completionProgress: ExtractorCompletionProgress } {
    try {
      const updated = this.repository.setItemCompletion(userId, id, index, completed);
      if (!updated) throw new NotFoundException('Extraction not found.');
      return updated;
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException(error?.message || 'Could not update study progress.');
    }
  }

  setCompleted(userId: string, id: string, completed: boolean) {
    const updated = this.repository.setCompleted(userId, id, completed);
    if (!updated) throw new NotFoundException('Extraction not found.');
    return updated;
  }

  deleteNote(userId: string, id: string): void {
    if (!this.repository.delete(userId, id)) {
      throw new NotFoundException('Extraction not found.');
    }
  }

  getTranscriptSources(userId: string) {
    const summaries = this.historyRepo
      .findSummaries(undefined, { userId })
      .filter((item) => (item.sentencesCount || 0) > 0)
      .slice(0, 80)
      .map((item) => ({
        id: item.id,
        title: item.title,
        creator: item.creator,
        track: item.track,
        trackTitle: item.trackTitle,
        sourceUrl: item.sourceUrl,
        sentencesCount: item.sentencesCount || 0,
        createdAt: item.createdAt,
      }));
    return summaries;
  }

  async defineWordInContext(params: {
    userId: string;
    noteId?: string;
    word: string;
    contextSentence?: string;
    title?: string;
    language?: string;
  }): Promise<WordDefinitionResponse> {
    let context = String(params.contextSentence || '').trim();
    let title = String(params.title || '').trim();

    if (params.noteId) {
      const note = this.repository.findById(params.userId, params.noteId);
      if (note) {
        if (!title) title = note.title;
        if (!context) {
          context =
            findContextSentence(note.sourceText, params.word, params.word) ||
            note.sourceText.slice(0, 600);
        }
      }
    }

    return this.wordLookup.defineWordInContext({
      word: params.word,
      contextSentence: context || params.word,
      title: title || 'Anything to Phrases',
      targetLanguageCode: params.language,
    });
  }

  private async resolveAiDefaults(
    userId: string,
    request: ExtractRequest,
  ): Promise<{ keyId?: string; model?: string; variant: string }> {
    const keyId = String(request.keyId || '').trim() || undefined;
    let model = String(request.model || '').trim() || undefined;
    let variant = String(request.variant || '').trim() || undefined;

    if (!model || !variant) {
      const effectiveKeyId = keyId || this.aiProviders.getDefaultSummary(userId).keyId;
      if (effectiveKeyId) {
        const live = await this.aiProviders
          .fetchModelsForKey(effectiveKeyId, userId)
          .catch(() => null);
        if (live?.fetchedLive && Array.isArray(live.models) && live.models.length > 0) {
          if (!model) {
            model =
              EXTRACTOR_PREFERRED_MODELS.find((id) => live.models.some((m) => m.id === id)) ||
              live.defaultModel ||
              live.models[0].id;
          }
          if (!variant) {
            const modelObj = live.models.find((m) => m.id === model);
            const variants = modelObj?.variants || [];
            variant =
              EXTRACTOR_PREFERRED_VARIANTS.find((id) => variants.some((v) => v.id === id)) ||
              modelObj?.defaultVariant ||
              variants[0]?.id ||
              'medium';
          }
        }
      }
    }

    return {
      keyId,
      model,
      variant: variant || EXTRACTOR_PREFERRED_VARIANTS[0],
    };
  }
}
