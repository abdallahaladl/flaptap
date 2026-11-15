import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WordDefinitionResponse, WordLookupService } from '../../core/ai/word-lookup.service';
import { AiProvidersService } from '../ai-providers/ai-providers.service';
import { TranscriptService } from '../tracks/shadowing/transcript.service';
import { ExtractionModeRegistry } from './modes/extraction-mode.registry';
import { TechLinguistRepository } from './tech-linguist.repository';
import {
  ExtractionHistoryItem,
  ExtractionModeMetadata,
  ExtractionResultPayload,
  TechLexiconCompletionSubject,
} from './tech-linguist.types';
import { parseExtractionResponse } from './utils/json-salvage.util';
import { cleanAsrTranscript } from './utils/transcript-cleaner.util';

export {
  ExtractionHistoryItem,
  ExtractionModeId,
  ExtractionModeMetadata,
  ExtractionResultPayload,
  IdiomItem,
  ThoughtPatternItem,
  VocabItem,
} from './tech-linguist.types';

@Injectable()
export class TechLinguistService {
  private readonly logger = new Logger(TechLinguistService.name);

  constructor(
    private readonly transcriptService: TranscriptService,
    private readonly aiProviders: AiProvidersService,
    private readonly wordLookup: WordLookupService,
    private readonly modeRegistry: ExtractionModeRegistry,
    private readonly repository: TechLinguistRepository,
  ) {}

  cleanAsrTranscript(text: string): string {
    return cleanAsrTranscript(text);
  }

  getExtractionModes(): ExtractionModeMetadata[] {
    return this.modeRegistry.listModes();
  }

  /**
   * Shared extraction pipeline:
   * Ingest source -> Clean ASR -> Resolve Mode Strategy -> Dispatch Direct AI -> Normalize/Filter -> Persist.
   */
  async processExtraction(params: {
    url?: string;
    transcriptText?: string;
    mode?: string;
    keyId?: string;
    model?: string;
    variant?: string;
    userId?: string;
    guestToken?: string;
  }): Promise<ExtractionResultPayload> {
    let title = 'Technical English Study Note';
    let creator = 'Tech Speaker';
    let sourceUrl = params.url || '';
    let rawTranscript = params.transcriptText || '';

    if (params.url) {
      try {
        const transcriptResult = await this.transcriptService.extract(params.url);
        title = transcriptResult.title || title;
        creator = transcriptResult.creator || creator;
        sourceUrl = transcriptResult.url || params.url;
        rawTranscript = transcriptResult.full_raw_transcript || '';
      } catch (err: any) {
        this.logger.warn(`Transcript extraction failed for ${params.url}: ${err.message}`);
        if (!rawTranscript) {
          throw new Error(`Could not fetch transcript from URL: ${err.message}`);
        }
      }
    }

    if (!rawTranscript.trim()) {
      throw new Error('No transcript or text provided for extraction.');
    }

    const cleanedTranscript = this.cleanAsrTranscript(rawTranscript);
    const strategy = this.modeRegistry.getStrategy(params.mode);
    const promptCtx = {
      title,
      creator,
      sourceUrl,
      cleanedTranscript,
    };

    const variantNormalized = (params.variant || 'none').trim().toLowerCase();
    const isHeavyTier = ['high', 'xhigh', 'max', 'on'].includes(variantNormalized);
    const execStartedAt = Date.now();

    let parsed: any;
    let execMeta: {
      providerId: string;
      providerName: string;
      modelUsed: string;
      variantUsed?: string;
      executionTimeMs: number;
      fallbackFrom?: string;
    };

    if (typeof (strategy as any).buildParallelPrompts === 'function') {
      const { vocabBundle, idiomsBundle } = (strategy as any).buildParallelPrompts(promptCtx);
      const [vocabRes, idiomsRes] = await Promise.all([
        this.aiProviders.executeChat(params.userId || null, {
          keyId: params.keyId,
          model: params.model,
          variant: params.variant || 'none',
          systemPrompt: vocabBundle.systemPrompt,
          userPrompt: vocabBundle.userPrompt,
          temperature: vocabBundle.temperature,
          maxTokens: isHeavyTier ? 16384 : 3500,
          json: true,
        }),
        this.aiProviders.executeChat(params.userId || null, {
          keyId: params.keyId,
          model: params.model,
          variant: params.variant || 'none',
          systemPrompt: idiomsBundle.systemPrompt,
          userPrompt: idiomsBundle.userPrompt,
          temperature: idiomsBundle.temperature,
          maxTokens: isHeavyTier ? 16384 : 3500,
          json: true,
        }),
      ]);

      const vocabParsed = parseExtractionResponse(vocabRes.content, title);
      const idiomsParsed = parseExtractionResponse(idiomsRes.content, title);
      parsed = {
        title: vocabParsed?.title || title,
        summary: vocabParsed?.summary || '',
        vocabItems: vocabParsed?.vocabItems || [],
        idiomItems: idiomsParsed?.idiomItems || [],
        thoughtPatterns: idiomsParsed?.thoughtPatterns || [],
      };
      execMeta = {
        providerId: vocabRes.providerId,
        providerName: vocabRes.providerName,
        modelUsed: vocabRes.modelUsed,
        variantUsed: vocabRes.variantUsed,
        executionTimeMs: Date.now() - execStartedAt,
        fallbackFrom: vocabRes.fallbackFrom || idiomsRes.fallbackFrom,
      };
    } else {
      const { systemPrompt, userPrompt, temperature } = strategy.buildPrompts(promptCtx);
      const execResult = await this.aiProviders.executeChat(params.userId || null, {
        keyId: params.keyId,
        model: params.model,
        variant: params.variant || 'none',
        systemPrompt,
        userPrompt,
        temperature,
        maxTokens: isHeavyTier ? 16384 : 4200,
        json: true,
      });
      parsed = parseExtractionResponse(execResult.content, title);
      execMeta = execResult;
    }

    const usedVariant = execMeta.variantUsed || params.variant || 'none';
    const normalized = strategy.normalizeAndFilter(parsed, title);

    const extractionId = `ext_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const nowIso = new Date().toISOString();

    this.repository.saveExtraction({
      id: extractionId,
      userId: params.userId,
      guestToken: params.guestToken,
      extractionMode: strategy.id,
      title: normalized.title,
      creator,
      summary: normalized.summary,
      sourceUrl,
      agentId: execMeta.providerId,
      agentUsed: execMeta.providerName,
      modelUsed: execMeta.modelUsed,
      reasoningLevel: usedVariant,
      executionTimeMs: execMeta.executionTimeMs,
      vocabItems: normalized.vocabItems,
      idiomItems: normalized.idiomItems,
      thoughtPatterns: normalized.thoughtPatterns,
      fullTranscript: cleanedTranscript,
      createdAt: nowIso,
    });

    return {
      id: extractionId,
      extractionMode: strategy.id,
      title: normalized.title,
      summary: normalized.summary,
      sourceUrl,
      creator,
      agentUsed: execMeta.providerName,
      modelUsed: execMeta.modelUsed,
      reasoningLevel: usedVariant,
      executionTimeMs: execMeta.executionTimeMs,
      fallbackFrom: execMeta.fallbackFrom,
      vocabItems: normalized.vocabItems,
      idiomItems: normalized.idiomItems,
      thoughtPatterns: normalized.thoughtPatterns,
      fullTranscript: cleanedTranscript,
      createdAt: nowIso,
    };
  }

  /**
   * Shared click-any-word contextual definition & translation lookup inside Tech Lexicon.
   */
  async defineWordInContext(params: {
    extractionId?: string;
    word: string;
    contextSentence?: string;
    title?: string;
    language?: string;
  }): Promise<WordDefinitionResponse> {
    let contextText = (params.contextSentence || '').trim();
    let title = (params.title || '').trim();

    if (params.extractionId && (!contextText || !title)) {
      const row = this.getExtractionById(params.extractionId);
      if (row) {
        if (!title) title = row.title || '';
        if (!contextText && row.fullTranscript) {
          const cleanNeedle = (params.word || '')
            .replace(/^[^\p{L}\p{N}'-]+|[^\p{L}\p{N}'-]+$/gu, '')
            .toLowerCase();
          const sentences = String(row.fullTranscript)
            .split(/(?<=[.!?])\s+/)
            .filter(Boolean);
          const matching = sentences.find((s) => s.toLowerCase().includes(cleanNeedle));
          contextText = matching || sentences[0] || params.word;
        }
      }
    }

    return this.wordLookup.defineWordInContext({
      word: params.word,
      contextSentence: contextText || params.word,
      title: title || 'Technical English Study Note',
      targetLanguageCode: params.language,
    });
  }

  getHistory(userId?: string, guestToken?: string): ExtractionHistoryItem[] {
    return this.repository.getHistory(userId, guestToken);
  }

  getExtractionById(id: string): ExtractionResultPayload | null {
    return this.repository.getExtractionById(id);
  }

  setExtractionCompleted(
    id: string,
    isCompleted: boolean,
    userId?: string,
    guestToken?: string,
  ) {
    return this.repository.setExtractionCompleted(id, isCompleted, userId, guestToken);
  }

  setExtractionItemCompletion(
    id: string,
    subject: TechLexiconCompletionSubject,
    index: number,
    completed: boolean,
    userId?: string,
    guestToken?: string,
  ) {
    return this.repository.setExtractionItemCompletion(
      id,
      subject,
      index,
      completed,
      userId,
      guestToken,
    );
  }

  deleteExtraction(id: string, userId?: string, _guestToken?: string): boolean {
    return this.repository.deleteExtraction(id, userId);
  }
}
