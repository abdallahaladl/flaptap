import { Injectable, Logger } from '@nestjs/common';
import { AiClient } from '../../../core/ai/ai.client';
import { DEFAULT_LANGUAGE, getLanguage } from '../../../core/ai/languages';
import { HistoryRepository, HistoryItem } from '../../../core/database/history.repository';

const BATCH_SIZE = 20;
const MAX_PARALLEL_BATCHES = 2;

export interface TranslationResponse {
  success: boolean;
  historyId: string;
  language: string;
  languageName: string;
  rtl: boolean;
  translations: Record<number, string>;
  translatedCount: number;
  totalSentences: number;
  fromCache: boolean;
  aiModel?: string;
}

/**
 * Language translation, with no dialect variants.
 *
 * The prompt is deliberately about accuracy and natural target-language
 * phrasing, and it explicitly protects names and untranslatable technical
 * terms so they stay in their original English script instead of being
 * mangled into a forced equivalent.
 */
@Injectable()
export class ShadowingTranslationService {
  private readonly logger = new Logger(ShadowingTranslationService.name);
  private readonly inFlight = new Map<string, Promise<TranslationResponse>>();

  constructor(
    private readonly ai: AiClient,
    private readonly historyRepo: HistoryRepository,
  ) {}

  /**
   * Deduplicate concurrent requests for the same session + language + scope.
   * Already-translated sentences are served from SQLite/video cache without
   * ever re-requesting AI model quota.
   */
  async translate(
    historyId: string,
    requestedLanguage?: string,
    force = false,
    sentenceIndices?: number[],
  ): Promise<TranslationResponse> {
    const language = getLanguage(requestedLanguage || DEFAULT_LANGUAGE);
    const cleanIndices = Array.isArray(sentenceIndices)
      ? Array.from(new Set(sentenceIndices.map(Number).filter((n) => Number.isFinite(n) && n > 0))).sort((a, b) => a - b)
      : [];
    const scopeKey = cleanIndices.length > 0 ? cleanIndices.join(',') : 'all';
    const allKey = `${historyId}:${language.code}:${force ? 'force' : 'std'}:all`;
    const key = `${historyId}:${language.code}:${force ? 'force' : 'std'}:${scopeKey}`;

    const runningAll = this.inFlight.get(allKey);
    if (runningAll) return runningAll;

    const running = this.inFlight.get(key);
    if (running) return running;

    const promise = this.translateInternal(
      historyId,
      language.code,
      force,
      cleanIndices.length > 0 ? cleanIndices : undefined,
    ).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  private async translateInternal(
    historyId: string,
    requestedLanguage?: string,
    force = false,
    sentenceIndices?: number[],
  ): Promise<TranslationResponse> {
    const item = this.historyRepo.findById(historyId);
    if (!item) {
      throw new Error(`Practice session with ID "${historyId}" not found`);
    }

    const language = getLanguage(requestedLanguage || DEFAULT_LANGUAGE);
    const languageCode = language.code;

    const allSentences = (item.sentences || [])
      .map((sentence) => ({ index: Number(sentence.index), text: sentence.text }))
      .filter((sentence) => Number.isFinite(sentence.index) && sentence.text?.trim());

    if (allSentences.length === 0) {
      return {
        success: true,
        historyId,
        language: languageCode,
        languageName: language.name,
        rtl: Boolean(language.rtl),
        translations: {},
        translatedCount: 0,
        totalSentences: 0,
        fromCache: true,
        aiModel: this.ai.modelName,
      };
    }

    const requestedSet =
      Array.isArray(sentenceIndices) && sentenceIndices.length > 0
        ? new Set(sentenceIndices.map(Number))
        : null;
    const targetSentences = requestedSet
      ? allSentences.filter((s) => requestedSet.has(s.index))
      : allSentences;

    const cached: Record<number, string> = force
      ? {}
      : this.readPartialCache(item, languageCode);

    // English -> English is an identity target; no model call is needed.
    if (languageCode === 'en') {
      for (const sentence of targetSentences) {
        cached[sentence.index] = this.toDisplayHtml(sentence.text, false);
      }
      this.persistCache(item, languageCode, cached);
      return {
        success: true,
        historyId,
        language: languageCode,
        languageName: language.name,
        rtl: false,
        translations: cached,
        translatedCount: Object.keys(cached).length,
        totalSentences: allSentences.length,
        fromCache: false,
        aiModel: this.ai.modelName,
      };
    }

    const missingSentences = targetSentences.filter((s) => !cached[s.index]);
    if (missingSentences.length === 0) {
      this.persistCache(item, languageCode, cached);
      this.logger.log(
        `Translation cache hit (${Object.keys(cached).length}/${allSentences.length} sentences): ${languageCode} / ${historyId}`,
      );
      return {
        success: true,
        historyId,
        language: languageCode,
        languageName: language.name,
        rtl: Boolean(language.rtl),
        translations: cached,
        translatedCount: Object.keys(cached).length,
        totalSentences: allSentences.length,
        fromCache: true,
        aiModel: this.ai.modelName,
      };
    }

    const startedAt = Date.now();
    await this.translateBatches(item, missingSentences, language, languageCode, cached);
    this.persistCache(item, languageCode, cached);

    this.logger.log(
      `Translated ${missingSentences.length} new sentence(s) (${Object.keys(cached).length}/${allSentences.length} total) ` +
        `into ${languageCode} in ${Date.now() - startedAt}ms`,
    );

    return {
      success: true,
      historyId,
      language: languageCode,
      languageName: language.name,
      rtl: Boolean(language.rtl),
      translations: cached,
      translatedCount: Object.keys(cached).length,
      totalSentences: allSentences.length,
      fromCache: false,
      aiModel: this.ai.modelName,
    };
  }

  private async translateBatches(
    item: HistoryItem,
    sentences: Array<{ index: number; text: string }>,
    language: ReturnType<typeof getLanguage>,
    languageCode: string,
    accumulatedCache: Record<number, string>,
  ): Promise<Record<number, string>> {
    const newlyTranslated: Record<number, string> = {};
    const batches: Array<typeof sentences> = [];

    for (let i = 0; i < sentences.length; i += BATCH_SIZE) {
      batches.push(sentences.slice(i, i + BATCH_SIZE));
    }

    for (let i = 0; i < batches.length; i += MAX_PARALLEL_BATCHES) {
      const group = batches.slice(i, i + MAX_PARALLEL_BATCHES);
      const settled = await Promise.allSettled(
        group.map((batch) => this.translateBatch(item, batch, language)),
      );

      let batchAdded = false;
      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          Object.assign(newlyTranslated, outcome.value);
          Object.assign(accumulatedCache, outcome.value);
          if (Object.keys(outcome.value).length > 0) batchAdded = true;
        } else {
          this.logger.warn(`Translation batch failed: ${outcome.reason?.message || outcome.reason}`);
        }
      }

      if (batchAdded) {
        this.persistCache(item, languageCode, accumulatedCache);
      }
    }

    const missing = sentences.filter((sentence) => !newlyTranslated[sentence.index]);
    if (missing.length > 0 && missing.length <= BATCH_SIZE) {
      try {
        const retried = await this.translateBatch(item, missing, language);
        Object.assign(newlyTranslated, retried);
        Object.assign(accumulatedCache, retried);
      } catch (error: any) {
        this.logger.warn(`Translation retry failed: ${error.message}`);
      }
    }

    if (Object.keys(newlyTranslated).length === 0 && Object.keys(accumulatedCache).length === 0) {
      throw new Error('Translation is temporarily unavailable. Please try again.');
    }

    return accumulatedCache;
  }

  private async translateBatch(
    item: HistoryItem,
    batch: Array<{ index: number; text: string }>,
    language: ReturnType<typeof getLanguage>,
  ): Promise<Record<number, string>> {
    const source: Record<string, string> = {};
    for (const sentence of batch) {
      source[String(sentence.index)] = sentence.text;
    }

    const systemPrompt = [
      `You are a professional literary and media translator working into ${language.name} (${language.native}).`,
      `You are a native ${language.name} speaker with deep knowledge of spoken English and of how real people actually talk.`,
      '',
      'Translate each English sentence with these absolute rules:',
      `1. ACCURACY FIRST: carry the complete meaning of the sentence into ${language.name}. Never add, omit, soften, explain, summarize, merge, or split information.`,
      `2. NATURAL TARGET LANGUAGE: write idiomatic ${language.name} that a native speaker would actually say, with the same tone, register, and intent as the speaker. Never translate word-for-word or produce stiff textbook calques.`,
      `3. STANDARD LANGUAGE: use clear, widely understood standard ${language.name}. Do not switch to a regional dialect or slang unless the source itself is slang that must be mirrored.`,
      '4. KEEP THESE IN THEIR ORIGINAL ENGLISH / LATIN FORM, exactly as spoken, without translating or transliterating them:',
      '   - personal names, characters, creators, brands, companies, products, apps, handles, URLs, emails, file paths;',
      '   - technical, scientific, medical, legal, financial, software and startup terms, acronyms (AI, API, GPU, SaaS), code identifiers and commands, when the target language has no natural everyday equivalent;',
      '   - English words the speaker deliberately said in English, and titles of works;',
      '   - numbers, units, and symbols.',
      '   If a standard, widely used equivalent genuinely exists in the target language, use that equivalent instead.',
      '5. Do not wrap preserved English terms in punctuation or quotes unless the source did.',
      '6. Preserve the sentence ids exactly. Return only a JSON object of this shape:',
      '   {"translations":{"<id>":"<translation>","<id>":"<translation>"}}',
      '7. Every value must be one plain string. Never return objects, arrays, notes, markdown, or the English source.',
    ].join('\n');

    const context = [
      `Video title: ${item.title || 'Untitled'}`,
      `Creator: ${item.creator || 'Unknown'}`,
      `Source language: English (spoken YouTube speech)`,
      `Target language: ${language.name} (${language.native})`,
      '',
      'Translate every item below. Preserve the numeric keys:',
      JSON.stringify(source, null, 2),
    ].join('\n');

    const data = await this.ai.chatJson<Record<string, any>>(systemPrompt, context, {
      temperature: 0.15,
      maxTokens: Math.min(6000, 800 + batch.length * 220),
      timeoutMs: 60000,
      json: true,
    });

    const dictionary =
      data && typeof data === 'object' && data.translations && typeof data.translations === 'object'
        ? data.translations
        : data;

    const out: Record<number, string> = {};
    if (!dictionary || typeof dictionary !== 'object') return out;

    for (const sentence of batch) {
      const raw = (dictionary as any)[String(sentence.index)] ?? (dictionary as any)[sentence.index];
      if (typeof raw !== 'string') continue;
      const cleaned = this.cleanTranslation(raw, Boolean(language.rtl));
      if (cleaned) out[sentence.index] = cleaned;
    }

    return out;
  }

  /**
   * Model output is untrusted text. Escape it, then (for RTL targets) isolate
   * preserved Latin runs so punctuation and mixed-direction text render
   * correctly without corrupting the sentence.
   */
  private cleanTranslation(raw: string, rtl: boolean): string {
    let text = raw
      .replace(/<\/?bdi[^>]*>/gi, '')
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();

    if (!text) return '';
    return this.toDisplayHtml(text, rtl);
  }

  private toDisplayHtml(text: string, rtl: boolean): string {
    if (!rtl) {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    // Wrap only Latin runs that actually contain a letter. Numbers alone are
    // direction-neutral and should not become loanword badges.
    const latinRun = /\b[A-Za-z](?:[A-Za-z0-9._'\/-]*[A-Za-z0-9])?(?:[ \t]+[A-Za-z0-9](?:[A-Za-z0-9._'\/-]*[A-Za-z0-9])?)*/g;
    const parts: string[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    const escape = (value: string) => value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    while ((match = latinRun.exec(text)) !== null) {
      parts.push(escape(text.slice(lastIndex, match.index)));
      parts.push(`<bdi class="tech-loanword" dir="ltr">${escape(match[0])}</bdi>`);
      lastIndex = match.index + match[0].length;
    }
    parts.push(escape(text.slice(lastIndex)));
    return parts.join('');
  }

  private readPartialCache(
    item: HistoryItem,
    languageCode: string,
  ): Record<number, string> {
    const normalized: Record<number, string> = {};

    const absorb = (map?: Record<string | number, any> | null) => {
      if (!map || typeof map !== 'object') return;
      for (const [key, value] of Object.entries(map)) {
        const index = Number(key);
        if (Number.isFinite(index) && typeof value === 'string' && value.trim()) {
          normalized[index] = value;
        }
      }
    };

    if (item.translationEngineVersion === 4 || !item.translationEngineVersion) {
      absorb(item.translationsCache?.[languageCode]);
    }

    if (Array.isArray(item.sentences)) {
      for (const s of item.sentences) {
        const idx = Number(s.index);
        const val = s.translations?.[languageCode];
        if (Number.isFinite(idx) && typeof val === 'string' && val.trim() && !normalized[idx]) {
          normalized[idx] = val;
        }
      }
    }

    return normalized;
  }

  private persistCache(item: HistoryItem, languageCode: string, translations: Record<number, string>): void {
    if (!item.translationsCache) item.translationsCache = {};
    item.translationsCache[languageCode] = {
      ...(item.translationsCache[languageCode] || {}),
      ...translations,
    };
    item.translationEngineVersion = 4;

    if (item.sentences) {
      for (const sentence of item.sentences) {
        const translated = item.translationsCache[languageCode][Number(sentence.index)];
        if (!translated) continue;
        if (!sentence.translations) sentence.translations = {};
        sentence.translations[languageCode] = translated;
      }
    }

    this.historyRepo.update(item.id, {
      translationsCache: item.translationsCache,
      sentences: item.sentences,
      translationEngineVersion: 4,
    });
  }
}
