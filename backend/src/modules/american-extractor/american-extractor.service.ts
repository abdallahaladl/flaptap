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
import { SharedSourcesService } from '../shared-sources/shared-sources.service';
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
  UploadedFileInput,
} from './american-extractor.types';
import {
  buildExtractionPrompts,
  EXTRACTION_CATEGORIES_CATALOG,
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
  resolveEffectiveCategories,
} from './extraction.prompt';
import { isImageUploadFile, SourceResolverService } from './sources/source-resolver.service';
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_EXTRACTION } from './sources/vision-ocr.service';
import {
  cleanModelTitle,
  deriveContextualFallbackTitle,
  extractCompletedItemsFromStream,
  isGenericOrFilenameTitle,
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
import { anchorItemsToSegments, anchorItemsToTimedSentences } from './utils/timestamp-anchor.util';

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
  sourceId?: string;
  language?: string;
  extractionType?: string;
  categories?: string[];
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
    private readonly sharedSources: SharedSourcesService,
  ) {}

  getConfig(): ExtractorConfig {
    const summary = this.aiProviders.getDefaultSummary();
    return {
      categories: EXTRACTION_CATEGORIES_CATALOG.map((category) => ({ ...category })),
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
      maxImagesPerUpload: MAX_IMAGES_PER_EXTRACTION,
      maxImageMb: Math.round(MAX_IMAGE_BYTES / (1024 * 1024)),
      acceptedUploadTypes: [
        '.pdf', '.txt', '.md', '.markdown', '.srt', '.vtt', '.json',
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
      (request.sourceId
        ? 'source'
        : request.url
          ? 'url'
          : request.lessonId
            ? 'lesson'
            : 'text');

    hooks.onStage?.({
      stage: 'detecting',
      label: 'Detecting source',
      detail:
        inputKind === 'source'
          ? 'Reusing your cached Flaptap source'
          : inputKind === 'url'
            ? 'Checking URL platform and shared cache'
            : inputKind === 'lesson'
              ? 'Locating your saved Flaptap lesson'
              : 'Inspecting pasted text',
      progress: 8,
    });

    hooks.onStage?.({
      stage: 'resolving',
      label:
        inputKind === 'source'
          ? 'Loading shared source'
          : inputKind === 'url'
            ? 'Reading link source'
            : inputKind === 'lesson'
              ? 'Loading saved transcript'
              : 'Preparing text',
      detail:
        inputKind === 'source'
          ? 'Reusing stored transcript and timestamps without re-fetching'
          : inputKind === 'url'
            ? 'Reusing cache or fetching captions, article, or audio transcription'
            : inputKind === 'lesson'
              ? 'Importing timed transcript from your Flaptap Library'
              : 'Normalizing formatting and punctuation',
      progress: 18,
    });

    let source: ResolvedSource;
    if (inputKind === 'source' && request.sourceId) {
      source = await this.resolver.resolveSharedSource(userId, String(request.sourceId));
    } else if (inputKind === 'url') {
      source = await this.resolver.resolveUrl(String(request.url || ''), {
        userId,
        keyId: request.keyId,
        model: request.model,
        variant: request.variant,
        force: request.force,
      });
    } else if (inputKind === 'lesson') {
      source = await this.resolver.resolveLesson(userId, String(request.lessonId || ''));
    } else {
      source = await this.resolver.resolveText(String(request.text || ''), request.title, userId);
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
      categories?: string[];
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
    return this.extractUploads(
      {
        ...params,
        files: [
          {
            buffer: params.buffer,
            originalName: params.originalName,
            mimeType: params.mimeType,
          },
        ],
      },
      hooks,
    );
  }

  async extractUploads(
    params: {
      userId: string;
      files: UploadedFileInput[];
      language?: string;
      extractionType?: string;
      categories?: string[];
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
    const files = Array.isArray(params.files) ? params.files : [];
    if (files.length === 0) {
      throw new BadRequestException('Choose a file to upload.');
    }
    if (files.length > MAX_IMAGES_PER_EXTRACTION) {
      throw new BadRequestException(
        `Upload up to ${MAX_IMAGES_PER_EXTRACTION} images per extraction.`,
      );
    }

    let totalBytes = 0;
    for (const file of files) {
      if (!file?.buffer || file.buffer.length === 0) {
        throw new BadRequestException('Choose a non-empty file to upload.');
      }
      totalBytes += file.buffer.length;
    }
    if (totalBytes > MAX_UPLOAD_MB * 1024 * 1024) {
      throw new BadRequestException(`Combined upload size must be ${MAX_UPLOAD_MB} MB or smaller.`);
    }

    const multiFile = files.length > 1;
    if (multiFile && !files.every((f) => isImageUploadFile(f.originalName, f.mimeType))) {
      throw new BadRequestException(
        'Multi-file uploads currently support images only (PNG, JPEG, WebP, GIF). Upload PDFs, audio, video, or text files one at a time.',
      );
    }

    const isImageBatch = multiFile || isImageUploadFile(files[0].originalName, files[0].mimeType);
    throwIfAborted(hooks.signal);

    hooks.onStage?.({
      stage: 'detecting',
      label: isImageBatch
        ? files.length === 1
          ? 'Inspecting image'
          : `Inspecting ${files.length} images`
        : 'Inspecting file',
      detail: isImageBatch
        ? `${files.length} image${files.length === 1 ? '' : 's'} (${(totalBytes / (1024 * 1024)).toFixed(1)} MB)`
        : `${files[0].originalName} (${(totalBytes / (1024 * 1024)).toFixed(1)} MB)`,
      progress: 8,
    });

    hooks.onStage?.({
      stage: 'resolving',
      label: isImageBatch ? 'Reading uploaded images' : 'Reading uploaded file',
      detail: isImageBatch
        ? 'Checking shared cache, or extracting text via Vision OCR'
        : 'Checking shared cache, or running PDF parse, OCR, or speech-to-text',
      progress: 12,
    });

    const source = isImageBatch
      ? await this.resolver.resolveImageUploads({
          userId: params.userId,
          files,
          keyId: params.keyId,
          model: params.model,
          variant: params.variant,
          force: params.force,
          signal: hooks.signal,
          onProgress: (p) => {
            hooks.onStage?.({
              stage: 'resolving',
              label: 'Reading uploaded images',
              detail: p.message,
              progress: p.percent,
            });
          },
        })
      : await this.resolver.resolveUpload({
          userId: params.userId,
          buffer: files[0].buffer,
          originalName: files[0].originalName,
          mimeType: files[0].mimeType,
          keyId: params.keyId,
          model: params.model,
          variant: params.variant,
          force: params.force,
          signal: hooks.signal,
        });

    throwIfAborted(hooks.signal);
    return this.runExtraction(
      params.userId,
      source,
      {
        userId: params.userId,
        language: params.language,
        extractionType: params.extractionType,
        categories: params.categories,
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
    const hasAudio = Boolean(source.hasAudio);
    const extractionType = normalizeExtractionType(request.extractionType);
    const { selectedCategories, isAll, rejectedAudioOnly } = resolveEffectiveCategories({
      categories: request.categories,
      extractionType: extractionType.id,
      hasAudio,
    });

    if (rejectedAudioOnly) {
      throw new BadRequestException(
        'Audio-dependent categories (Connected Speech, Pronunciation & Phonetics, Word & Sentence Stress, Linking & Sound Changes) require a source with real audio such as a YouTube video, audio/video upload, or video lesson.',
      );
    }

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
      categories: isAll ? undefined : selectedCategories,
      hasAudio,
      style: style.id,
      level: level.id,
      focus: focus.id,
      depth: depth.id,
      studyGoal: studyGoal.id,
      order: order.id,
    });

    const chunks =
      depth.id === 'exhaustive'
        ? splitSourceIntoChunks(source.text, { maxChunkChars: 6000, maxChunks: 12 })
        : splitSourceIntoChunks(source.text);
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
          hasAudio: Boolean(cached.media?.hasAudio ?? hasAudio),
          hasVideo: Boolean(cached.media?.hasVideo ?? source.hasVideo),
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

    const needsContextualTitle = Boolean(source.needsContextualTitle || source.sourceType === 'image');
    const previewTitle = needsContextualTitle
      ? source.title && !isGenericOrFilenameTitle(source.title, source.submittedFileNames || [])
        ? source.title
        : 'Generating contextual title...'
      : source.title;

    hooks.onSourceReady?.({
      title: previewTitle,
      creator: source.creator,
      sourceType: source.sourceType,
      sourceLabel: source.sourceLabel,
      wordCount,
      truncated: source.truncated,
      chunkCount: chunks.length,
      cached: false,
      hasAudio,
      hasVideo: Boolean(source.hasVideo),
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
        categories: isAll ? undefined : selectedCategories,
        hasAudio,
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
        selectedCategories: isAll ? undefined : selectedCategories,
        hasAudio,
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

    const merged =
      chunkResults.length === 1
        ? chunkResults[0]
        : mergeChunkExtractions({
            chunks: chunkResults,
            sourceText: source.text,
            fallbackTitle: source.title,
            order: order.id,
          });

    // Anchor exact millisecond source timestamps (word-level when timedSentences exist)
    const anchoredItems =
      Array.isArray(source.timedSentences) && source.timedSentences.length > 0
        ? anchorItemsToTimedSentences(merged.items, source.timedSentences, source.text)
        : Array.isArray(source.segments) && source.segments.length > 0
          ? anchorItemsToSegments(merged.items, source.segments, source.text)
          : merged.items;

    const normalized = {
      ...merged,
      items: anchoredItems,
    };

    let synthesizedTitle = '';
    if (needsContextualTitle && chunks.length > 1) {
      try {
        const excerptLines = chunks
          .slice(0, 6)
          .map((chunk, idx) => `Excerpt ${idx + 1}: ${chunk.slice(0, 400).replace(/\s+/g, ' ').trim()}`);
        const chunkTitles = chunkResults
          .map((c) => c.title)
          .filter(Boolean)
          .slice(0, 4)
          .join(' | ');
        const titleResp = await this.aiProviders.executeChat(userId, {
          keyId: aiTarget.keyId,
          model: aiTarget.model,
          variant: 'none',
          temperature: 0.2,
          maxTokens: 64,
          timeoutMs: 25000,
          signal: hooks.signal,
          systemPrompt:
            'Generate ONE concise 3-8 word English title describing the shared topic across the combined excerpts. Never output filenames, file extensions, camera codes, quotes, or generic words like Screenshot or Image. Return ONLY the title.',
          userPrompt: [
            chunkTitles ? `Section candidates: ${chunkTitles}` : '',
            normalized.summary ? `Summary: ${normalized.summary}` : '',
            ...excerptLines,
          ]
            .filter(Boolean)
            .join('\n\n'),
        });
        synthesizedTitle = cleanModelTitle(titleResp?.content || '');
      } catch (err: any) {
        this.logger.warn(`Multi-chunk contextual title synthesis failed cleanly: ${err?.message || err}`);
      }
    }

    let resolvedTitle = '';
    if (needsContextualTitle) {
      const candidate = cleanModelTitle(synthesizedTitle || normalized.title || '');
      resolvedTitle = isGenericOrFilenameTitle(candidate, source.submittedFileNames || [])
        ? deriveContextualFallbackTitle(normalized.summary, source.text)
        : candidate;
    } else {
      resolvedTitle =
        source.title &&
        source.title !== 'Pasted English Text' &&
        source.title !== 'Uploaded source'
          ? source.title
          : normalized.title || source.title;
    }
    const title = resolvedTitle || deriveContextualFallbackTitle(normalized.summary, source.text);

    if (source.sourceId && needsContextualTitle && title) {
      this.sharedSources.updateTitle(userId, source.sourceId, title);
    }
    const createdAt = new Date().toISOString();
    const id = `aex_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const executionTimeMs = Date.now() - startedAt;

    const mediaKind = source.mediaKind || 'none';
    const mediaId = source.mediaId || '';
    const streamUrl =
      (mediaKind === 'audio' || mediaKind === 'video') && mediaId
        ? `/api/sources/media/${encodeURIComponent(mediaId)}`
        : undefined;

    const mediaInfo = {
      hasAudio,
      hasVideo: Boolean(source.hasVideo),
      mediaKind,
      mediaId,
      durationSeconds: Number(source.durationSeconds) || 0,
      ...(streamUrl ? { streamUrl } : {}),
    };

    const enrichedMeta = {
      ...source.sourceMeta,
      ...(source.sourceId ? { sourceId: source.sourceId } : {}),
      hasAudio,
      hasVideo: Boolean(source.hasVideo),
      mediaKind,
      ...(mediaId ? { mediaId } : {}),
      warnings: source.warnings,
      truncated: source.truncated,
      chunkCount: chunks.length,
      timedItemCount: anchoredItems.filter((it) => typeof it.startSec === 'number').length,
      extractionOptions: {
        extractionType: isAll ? 'all' : selectedCategories.length === 1 ? selectedCategories[0] : 'custom',
        extractionTypeLabel: isAll
          ? 'All categories'
          : selectedCategories.length === 1
            ? EXTRACTION_CATEGORIES_CATALOG.find((c) => c.id === selectedCategories[0])?.label || selectedCategories[0]
            : `${selectedCategories.length} selected categories`,
        categories: isAll ? ['all'] : selectedCategories,
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
      sourceId: source.sourceId || '',
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
        `(${chunks.length} chunk${chunks.length === 1 ? '' : 's'}, audio=${hasAudio ? 'yes' : 'no'}, ` +
        `timed=${enrichedMeta.timedItemCount}) via ${lastProviderName}/${lastModelUsed} in ${executionTimeMs}ms`,
    );

    return {
      id,
      ...(source.sourceId ? { sourceId: source.sourceId } : {}),
      title,
      creator: source.creator,
      summary: normalized.summary,
      speakerStyle: normalized.speakerStyle,
      sourceType: source.sourceType,
      sourceUrl: source.sourceUrl,
      sourceLabel: source.sourceLabel,
      sourceMeta: enrichedMeta,
      media: mediaInfo,
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

  /**
   * Resolves the latest Phrase Miner / Deep Lexical Extraction guide linked to a
   * Media Hub lesson, dynamically upgrading word-level `[phraseStartSec, phraseEndSec]`
   * and `sentenceIndex` anchors when the lesson has timed word arrays.
   */
  getLatestForLesson(userId: string, lessonId: string) {
    const lesson = this.historyRepo.findById(lessonId, { userId });
    if (!lesson) throw new NotFoundException(`Lesson "${lessonId}" not found.`);

    const links = this.sharedSources.resolveLinks(userId, {
      lessonId: lesson.id,
      sourceId: lesson.sourceId || lesson.transcriptData?.sourceId,
      url: lesson.sourceUrl || undefined,
    });

    const guides = links.extractorNotes || [];
    let latest: ExtractionResult | null = null;

    if (guides.length > 0) {
      latest = this.repository.findById(userId, guides[0].id);
      if (
        latest &&
        Array.isArray(lesson.sentences) &&
        lesson.sentences.length > 0 &&
        latest.items.some((it) => it.sentenceIndex == null || it.phraseStartSec == null)
      ) {
        const timedSentences = lesson.sentences.map((s) => ({
          index: Number(s.index) || 1,
          startSec: Number(s.startSec) || 0,
          endSec: Number(s.endSec) || 0,
          text: String(s.text || '').trim(),
          words: Array.isArray(s.words)
            ? s.words.map((w) => ({
                word: String(w.word || ''),
                clean: String(w.clean || ''),
                startMs: Number(w.startMs) || 0,
                endMs: Number(w.endMs) || 0,
              }))
            : undefined,
        }));
        latest = {
          ...latest,
          items: anchorItemsToTimedSentences(latest.items, timedSentences, latest.sourceText),
        };
      }
    }

    return { latest, guides };
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
  ): { id: string; completionProgress: ExtractorCompletionProgress; isCompleted: boolean } {
    try {
      const updated = this.repository.setItemCompletion(userId, id, index, completed);
      if (!updated) throw new NotFoundException('Extraction not found.');
      return updated;
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException(error?.message || 'Could not update study progress.');
    }
  }

  deleteNoteItem(userId: string, id: string, index: number) {
    try {
      const updated = this.repository.deleteNoteItem(userId, id, index);
      if (!updated) throw new NotFoundException('Extraction not found.');
      return updated;
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException(error?.message || 'Could not remove phrase.');
    }
  }

  resetNoteProgress(userId: string, id: string) {
    const updated = this.repository.resetProgress(userId, id);
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
        videoId: item.videoId || '',
        hasAudio: Boolean(item.media?.hasAudio ?? item.videoId),
        hasVideo: Boolean(item.media?.hasVideo ?? item.videoId),
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
