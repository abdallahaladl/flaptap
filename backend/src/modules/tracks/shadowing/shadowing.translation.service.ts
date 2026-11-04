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
   * Deduplicate concurrent requests for the same session + language. A quick
   * toggle or a second tab must not trigger a second paid translation batch.
   */
  async translate(
    historyId: string,
    requestedLanguage?: string,
    force = false,
  ): Promise<TranslationResponse> {
    const language = getLanguage(requestedLanguage || DEFAULT_LANGUAGE);
    const key = `${historyId}:${language.code}:${force ? 'force' : 'std'}`;
    const running = this.inFlight.get(key);
    if (running) return running;

    const promise = this.translateInternal(historyId, language.code, force)
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  private async translateInternal(
    historyId: string,
    requestedLanguage?: string,
    force = false,
  ): Promise<TranslationResponse> {
    const item = this.historyRepo.findById(historyId);
    if (!item) {
      throw new Error(`Practice session with ID "${historyId}" not found`);
    }

    const language = getLanguage(requestedLanguage || DEFAULT_LANGUAGE);
    const languageCode = language.code;

    const sentences = (item.sentences || [])
      .map((sentence) => ({ index: Number(sentence.index), text: sentence.text }))
      .filter((sentence) => Number.isFinite(sentence.index) && sentence.text?.trim());

    if (sentences.length === 0) {
      return {
        success: true,
        historyId,
        language: languageCode,
        languageName: language.name,
        rtl: Boolean(language.rtl),
        translations: {},
        fromCache: true,
        aiModel: this.ai.modelName,
      };
    }

    // English -> English is an identity target; no model call is needed.
    if (languageCode === 'en') {
      const identity: Record<number, string> = {};
      for (const sentence of sentences) {
        identity[sentence.index] = this.toDisplayHtml(sentence.text, false);
      }
      this.persistCache(item, languageCode, identity);
      return {
        success: true,
        historyId,
        language: languageCode,
        languageName: language.name,
        rtl: false,
        translations: identity,
        fromCache: false,
        aiModel: this.ai.modelName,
      };
    }

    const cached = force ? null : this.readCache(item, languageCode, sentences.length);
    if (cached) {
      this.logger.log(`Translation cache hit: ${languageCode} / ${historyId}`);
      return {
        success: true,
        historyId,
        language: languageCode,
        languageName: language.name,
        rtl: Boolean(language.rtl),
        translations: cached,
        fromCache: true,
        aiModel: this.ai.modelName,
      };
    }

    const startedAt = Date.now();
    const translations = await this.translateBatches(item, sentences, language);
    this.persistCache(item, languageCode, translations);

    this.logger.log(
      `Translated ${Object.keys(translations).length}/${sentences.length} sentences ` +
      `into ${languageCode} in ${Date.now() - startedAt}ms`,
    );

    return {
      success: true,
      historyId,
      language: languageCode,
      languageName: language.name,
      rtl: Boolean(language.rtl),
      translations,
      fromCache: false,
      aiModel: this.ai.modelName,
    };
  }

  private async translateBatches(
    item: HistoryItem,
    sentences: Array<{ index: number; text: string }>,
    language: ReturnType<typeof getLanguage>,
  ): Promise<Record<number, string>> {
    const result: Record<number, string> = {};
    const batches: Array<typeof sentences> = [];

    for (let i = 0; i < sentences.length; i += BATCH_SIZE) {
      batches.push(sentences.slice(i, i + BATCH_SIZE));
    }

    for (let i = 0; i < batches.length; i += MAX_PARALLEL_BATCHES) {
      const group = batches.slice(i, i + MAX_PARALLEL_BATCHES);
      const settled = await Promise.allSettled(
        group.map((batch) => this.translateBatch(item, batch, language)),
      );

      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          Object.assign(result, outcome.value);
        } else {
          this.logger.warn(`Translation batch failed: ${outcome.reason?.message || outcome.reason}`);
        }
      }
    }

    const missing = sentences.filter((sentence) => !result[sentence.index]);
    if (missing.length > 0 && missing.length <= BATCH_SIZE) {
      try {
        Object.assign(result, await this.translateBatch(item, missing, language));
      } catch (error: any) {
        this.logger.warn(`Translation retry failed: ${error.message}`);
      }
    }

    if (Object.keys(result).length === 0) {
      throw new Error('Translation is temporarily unavailable. Please try again.');
    }

    return result;
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

  private readCache(
    item: HistoryItem,
    languageCode: string,
    sentenceCount: number,
  ): Record<number, string> | null {
    if (item.translationEngineVersion !== 4) return null;
    const cache = item.translationsCache?.[languageCode];
    if (!cache || typeof cache !== 'object') return null;

    const normalized: Record<number, string> = {};
    for (const [key, value] of Object.entries(cache)) {
      const index = Number(key);
      if (Number.isFinite(index) && typeof value === 'string' && value.trim()) {
        normalized[index] = value;
      }
    }

    // A partial cache is a miss: translating again is better than leaving
    // shimmer placeholders forever in the drill list.
    return Object.keys(normalized).length >= sentenceCount ? normalized : null;
  }

  private persistCache(item: HistoryItem, languageCode: string, translations: Record<number, string>): void {
    if (!item.translationsCache) item.translationsCache = {};
    item.translationsCache[languageCode] = translations;
    item.translationEngineVersion = 4;

    if (item.sentences) {
      for (const sentence of item.sentences) {
        const translated = translations[Number(sentence.index)];
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
