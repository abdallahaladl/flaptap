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
  ExtractionHistoryItem,
  ExtractionResult,
  ExtractorConfig,
  ExtractorCompletionProgress,
  ExtractorInputKind,
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
} from './extraction.prompt';
import { SourceResolverService } from './sources/source-resolver.service';
import { normalizeExtraction, parseModelJson } from './utils/extraction-normalize.util';
import { findContextSentence } from './utils/source-text.util';

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

  async extract(request: ExtractRequest): Promise<ExtractionResult> {
    const userId = request.userId;
    if (!userId) throw new BadRequestException('Sign in to run an extraction.');

    const inputKind: ExtractorInputKind =
      request.inputKind ||
      (request.url ? 'url' : request.lessonId ? 'lesson' : 'text');

    let source;
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

    return this.runExtraction(userId, source, request);
  }

  async extractUpload(params: {
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
  }): Promise<ExtractionResult> {
    if (!params.userId) throw new BadRequestException('Sign in to run an extraction.');
    if (!params.buffer || params.buffer.length === 0) {
      throw new BadRequestException('Choose a file to upload.');
    }
    if (params.buffer.length > MAX_UPLOAD_MB * 1024 * 1024) {
      throw new BadRequestException(`Files must be ${MAX_UPLOAD_MB} MB or smaller.`);
    }

    const source = await this.resolver.resolveUpload({
      userId: params.userId,
      buffer: params.buffer,
      originalName: params.originalName,
      mimeType: params.mimeType,
      keyId: params.keyId,
      model: params.model,
      variant: params.variant,
    });

    return this.runExtraction(params.userId, source, {
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
    });
  }

  private async runExtraction(
    userId: string,
    source: Awaited<ReturnType<SourceResolverService['resolveText']>>,
    request: ExtractRequest,
  ): Promise<ExtractionResult> {
    const startedAt = Date.now();
    const language = getLanguage(request.language);

    const prompt = buildExtractionPrompts({
      source,
      targetLanguage: language.code,
      extractionType: request.extractionType,
      style: request.style,
      level: request.level,
      focus: request.focus,
      depth: request.depth,
      studyGoal: request.studyGoal,
      order: request.order,
    });

    const aiTarget = await this.resolveAiDefaults(userId, request);

    const call = async (expanded: boolean) =>
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
        allowIntraKeyFailover: true,
      });

    let aiResponse = await call(false);
    let parsed: any;
    try {
      parsed = parseModelJson(aiResponse.content);
    } catch (error: any) {
      this.logger.warn(`Extraction JSON parse failed; retrying once with a larger budget.`);
      aiResponse = await call(true);
      parsed = parseModelJson(aiResponse.content);
    }

    const normalized = normalizeExtraction({
      parsed,
      sourceText: source.text,
      fallbackTitle: source.title,
      targetLanguage: language.code,
      extractionType: prompt.extractionType.id,
    });

    const title =
      source.title && source.title !== 'Pasted English Text' && source.title !== 'Uploaded source'
        ? source.title
        : normalized.title || source.title;
    const createdAt = new Date().toISOString();
    const id = `aex_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const executionTimeMs = Date.now() - startedAt;

    const enrichedMeta = {
      ...source.sourceMeta,
      warnings: source.warnings,
      truncated: source.truncated,
      extractionOptions: {
        extractionType: prompt.extractionType.id,
        extractionTypeLabel: prompt.extractionType.shortLabel || prompt.extractionType.label,
        style: prompt.style.id,
        styleLabel: prompt.style.shortLabel || prompt.style.label,
        level: prompt.level.id,
        levelLabel: prompt.level.shortLabel || prompt.level.label,
        focus: prompt.focus.id,
        focusLabel: prompt.focus.shortLabel || prompt.focus.label,
        depth: prompt.depth.id,
        depthLabel: prompt.depth.shortLabel || prompt.depth.label,
        studyGoal: prompt.studyGoal.id,
        studyGoalLabel: prompt.studyGoal.shortLabel || prompt.studyGoal.label,
        order: prompt.order.id,
        orderLabel: prompt.order.shortLabel || prompt.order.label,
      },
    };

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
      agentName: aiResponse.providerName,
      modelName: aiResponse.modelUsed,
      reasoningLevel: aiResponse.variantUsed || 'standard',
      executionTimeMs,
      fallbackFrom: aiResponse.fallbackFrom,
      items: normalized.items,
      sourceText: source.text,
      createdAt,
    });

    this.logger.log(
      `Extractor note ${id}: ${normalized.items.length} items from ${source.sourceType} ` +
        `(${prompt.extractionType.id}/${prompt.style.id}/${prompt.level.id}) ` +
        `via ${aiResponse.providerName}/${aiResponse.modelUsed} in ${executionTimeMs}ms`,
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
      agentUsed: aiResponse.providerName,
      modelUsed: aiResponse.modelUsed,
      reasoningLevel: aiResponse.variantUsed || 'standard',
      executionTimeMs,
      fallbackFrom: aiResponse.fallbackFrom,
      itemCount: normalized.items.length,
      items: normalized.items,
      sourceText: source.text,
      isCompleted: false,
      completionProgress: {},
      createdAt,
    };
  }

  listHistory(userId: string): { items: ExtractionHistoryItem[]; total: number } {
    return {
      items: this.repository.list(userId),
      total: this.repository.countForUser(userId),
    };
  }

  getNote(userId: string, id: string): ExtractionResult {
    const note = this.repository.findById(userId, id);
    if (!note) throw new NotFoundException('Extraction not found.');
    return note;
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
      title: title || 'American English Extractor',
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
