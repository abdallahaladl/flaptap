import { Injectable, Logger } from '@nestjs/common';
import { AiClient } from '../../../core/ai/ai.client';
import { DEFAULT_LANGUAGE, getLanguage } from '../../../core/ai/languages';
import { HistoryRepository, HistoryItem } from '../../../core/database/history.repository';

const BATCH_SIZE = 20;
const MAX_PARALLEL_BATCHES = 4;

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

    const isArabic = language.code === 'ar';
    const systemPrompt = [
      `You are an elite audiovisual subtitle translator working into ${language.name} (${language.native}).`,
      'RULES:',
      '1. COMMUNICATIVE INTENT: Translate natural spoken intent, idioms, and phrasal verbs contextually (never wooden word-for-word calques); resolve pronouns from surrounding dialogue.',
      ...(isArabic
        ? [
            '2. ARABIC STYLE: Clear Contemporary Standard Arabic (فصحى معاصرة), active fluent phrasing (avoid passive calques like "تم ... من قِبل"), matching speaker/addressee gender & number.',
          ]
        : []),
      '3. PRESERVE LATIN TERMS: Keep proper nouns, brands, URLs, numbers, and tech/dev terms & acronyms (AI, API, LLM, GPU, Docker, React, CSS) in Latin script without added quotes/brackets.',
      '4. OUTPUT: Compact JSON only (no translator notes, no context lines): {"translations":{"<id>":"<subtitle>"}}',
    ].join('\n');

    const contextLines: string[] = [
      `Title: ${item.title || 'Untitled'} | Creator: ${item.creator || 'Unknown'} | Target: ${language.name} (${language.native})`,
    ];

    if (item.aiAnalysis?.overview?.summary) {
      contextLines.push(`Topic: ${item.aiAnalysis.overview.summary}`);
    }

    const allSentences = (item.sentences || [])
      .map((s) => ({ index: Number(s.index), text: s.text }))
      .filter((s) => Number.isFinite(s.index) && s.text?.trim());

    const dialogueContext = this.buildSurroundingDialogueContext(allSentences, batch);
    if (dialogueContext) {
      contextLines.push('', dialogueContext);
    }

    contextLines.push(
      '',
      'Target Sentences (preserve exact numeric keys):',
      JSON.stringify(source),
    );

    const context = contextLines.join('\n');

    const data = await this.ai.chatJson<Record<string, any>>(systemPrompt, context, {
      temperature: 0.15,
      maxTokens: Math.min(4800, 500 + batch.length * 160),
      timeoutMs: 32000,
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
   * Provide surrounding dialogue lines from the video/dialogue transcript
   * to resolve pronoun antecedents, situational context, tone, and flow.
   */
  private buildSurroundingDialogueContext(
    allSentences: Array<{ index: number; text: string }>,
    batch: Array<{ index: number; text: string }>,
  ): string {
    if (!allSentences || allSentences.length === 0) return '';

    const sentenceMap = new Map<number, string>();
    for (const s of allSentences) {
      if (s && Number.isFinite(s.index) && s.text?.trim()) {
        sentenceMap.set(s.index, s.text.trim());
      }
    }

    const batchIndices = new Set(batch.map((b) => b.index));
    const contextIndices = new Set<number>();

    // For every sentence in the batch, gather up to 3 preceding and 2 following sentences
    // that are NOT in the batch itself to provide local dialogue continuity.
    for (const item of batch) {
      const idx = item.index;
      for (let p = Math.max(1, idx - 3); p < idx; p++) {
        if (!batchIndices.has(p) && sentenceMap.has(p)) {
          contextIndices.add(p);
        }
      }
      for (let f = idx + 1; f <= idx + 2; f++) {
        if (!batchIndices.has(f) && sentenceMap.has(f)) {
          contextIndices.add(f);
        }
      }
    }

    if (contextIndices.size === 0) return '';

    const sortedContext = Array.from(contextIndices).sort((a, b) => a - b);
    const lines = sortedContext.map(
      (idx) => `- Line #${idx}: "${sentenceMap.get(idx)}"`,
    );

    return [
      '### Surrounding Dialogue Flow & Narrative Context',
      'The following lines from the video/dialogue are provided strictly for conversational context, pronoun/subject resolution, emotional tone, and narrative flow.',
      'DO NOT translate these context lines, and do NOT include their keys in the JSON output:',
      ...lines,
    ].join('\n');
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

    if (item.translationEngineVersion === 5 || item.translationEngineVersion === 4 || !item.translationEngineVersion) {
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
    item.translationEngineVersion = 5;

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
      translationEngineVersion: 5,
    });
  }
}
