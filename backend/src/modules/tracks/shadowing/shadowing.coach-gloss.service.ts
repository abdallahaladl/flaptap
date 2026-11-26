import { Injectable, Logger } from '@nestjs/common';
import { AiClient } from '../../../core/ai/ai.client';
import {
  AiCoachAnalysis,
  CoachGlossBundle,
  HistoryItem,
  HistoryRepository,
  SentenceItem,
} from '../../../core/database/history.repository';

const GLOSS_LANGUAGE = 'ar';
const GLOSS_LANGUAGE_NAME = 'Arabic';
const GLOSS_ENGINE_VERSION = 3;
const GLOSS_BATCH_SIZE = 24;
const CONTEXT_SENTENCE_MAX_CHARS = 180;

export interface CoachGlossResponse {
  success: boolean;
  historyId: string;
  language: string;
  languageName: string;
  rtl: boolean;
  glosses: Record<string, string>;
  fromCache: boolean;
  aiModel?: string;
}

interface CoachGlossSourceEntry {
  key: string;
  kind: 'expression' | 'vocabulary';
  phrase: string;
  explanation: string;
  context: string;
}

/**
 * Model-authored Arabic meaning for the items a learner actually takes away
 * from a lesson: expressions / phrasal verbs / idioms and key contextual
 * vocabulary. Connected-speech coaching is pronunciation mechanics, so it is
 * deliberately excluded.
 *
 * Glosses are authored once from the exact analysis plus the source sentence
 * the item came from, then persisted inside the lesson payload so every later
 * visit renders instantly with zero extra model calls.
 */
@Injectable()
export class ShadowingCoachGlossService {
  private readonly logger = new Logger(ShadowingCoachGlossService.name);
  private readonly inFlight = new Map<string, Promise<CoachGlossResponse>>();

  constructor(
    private readonly ai: AiClient,
    private readonly historyRepo: HistoryRepository,
  ) {}

  /** Single-flight per lesson + analysis stamp; cached glosses never hit AI. */
  async gloss(historyId: string, force = false): Promise<CoachGlossResponse> {
    const flightKey = `${historyId}:${force ? 'force' : 'std'}`;
    const running = this.inFlight.get(flightKey);
    if (running) return running;

    const promise = this.glossInternal(historyId, force).finally(() =>
      this.inFlight.delete(flightKey),
    );
    this.inFlight.set(flightKey, promise);
    return promise;
  }

  private async glossInternal(historyId: string, force: boolean): Promise<CoachGlossResponse> {
    const item = this.historyRepo.findById(historyId);
    if (!item) {
      throw new Error(`Practice session with ID "${historyId}" not found`);
    }

    const analysis = item.aiAnalysis;
    const sources = this.buildSources(analysis, item.sentences);
    if (sources.length === 0) {
      return this.respond(historyId, {}, true, analysis);
    }

    const stamp = this.analysisStamp(analysis);
    const cached = force ? null : this.readCache(item, stamp, sources);

    if (cached && Object.keys(cached.entries).length === sources.length) {
      return this.respond(historyId, cached.entries, true, analysis);
    }

    const known: Record<string, string> = cached ? { ...cached.entries } : {};
    const missing = sources.filter((entry) => !known[entry.key]);
    if (missing.length === 0) {
      return this.respond(historyId, known, true, analysis);
    }

    const startedAt = Date.now();
    const generated = await this.generate(item, missing);

    if (Object.keys(generated).length === 0) {
      if (Object.keys(known).length === 0) {
        throw new Error('Arabic meaning is temporarily unavailable. Please try again.');
      }
      return this.respond(historyId, known, true, analysis);
    }

    Object.assign(known, generated);
    this.persist(item, stamp, known);

    this.logger.log(
      `Arabic coach glosses ready (${Object.keys(generated).length} new, ${Object.keys(known).length} total) ` +
        `for ${historyId} in ${Date.now() - startedAt}ms`,
    );

    return this.respond(historyId, known, false, analysis);
  }

  private respond(
    historyId: string,
    glosses: Record<string, string>,
    fromCache: boolean,
    analysis?: AiCoachAnalysis,
  ): CoachGlossResponse {
    return {
      success: true,
      historyId,
      language: GLOSS_LANGUAGE,
      languageName: GLOSS_LANGUAGE_NAME,
      rtl: true,
      glosses,
      fromCache,
      aiModel: analysis?.aiModel || this.ai.modelName,
    };
  }

  private analysisStamp(analysis?: AiCoachAnalysis): string {
    if (!analysis) return '';
    return [
      analysis.analyzedAt || '',
      analysis.aiModel || '',
      analysis.connectedSpeech?.length || 0,
      analysis.expressions?.length || 0,
      analysis.vocabulary?.length || 0,
    ].join('|');
  }

  /**
   * The gloss key is `<kind>:<arrayIndex>`, matching the Studio card markup, so
   * the mapping survives a re-render without patching.
   */
  private buildSources(
    analysis?: AiCoachAnalysis,
    sentences?: SentenceItem[],
  ): CoachGlossSourceEntry[] {
    if (!analysis) return [];
    const out: CoachGlossSourceEntry[] = [];
    const sentenceText = (index?: number): string => {
      const match = (sentences || []).find((s) => Number(s.index) === Number(index));
      const text = String(match?.text || '').replace(/\s+/g, ' ').trim();
      return text.length > CONTEXT_SENTENCE_MAX_CHARS
        ? `${text.slice(0, CONTEXT_SENTENCE_MAX_CHARS)}…`
        : text;
    };

    (analysis.expressions || []).forEach((entry, index) => {
      out.push({
        key: `expression:${index}`,
        kind: 'expression',
        phrase: entry.phrase,
        explanation: [entry.meaning, entry.usageNote].filter(Boolean).join(' — '),
        context: sentenceText(entry.sentenceIndex),
      });
    });

    (analysis.vocabulary || []).forEach((entry, index) => {
      out.push({
        key: `vocabulary:${index}`,
        kind: 'vocabulary',
        phrase: entry.term,
        explanation: [entry.definition, entry.partOfSpeech].filter(Boolean).join(' — '),
        context: sentenceText(entry.sentenceIndex),
      });
    });

    return out;
  }

  private readCache(
    item: HistoryItem,
    stamp: string,
    sources: CoachGlossSourceEntry[],
  ): CoachGlossBundle | null {
    const bundle = item.coachGlosses?.[GLOSS_LANGUAGE];
    if (!bundle || bundle.analysisStamp !== stamp) return null;
    if (bundle.engineVersion !== GLOSS_ENGINE_VERSION) return null;

    const allowed = new Set(sources.map((entry) => entry.key));
    const entries: Record<string, string> = {};
    for (const [key, value] of Object.entries(bundle.entries || {})) {
      if (!allowed.has(key)) continue;
      if (typeof value === 'string' && this.isArabicGloss(value)) {
        entries[key] = value;
      }
    }
    return { ...bundle, entries };
  }

  private persist(item: HistoryItem, stamp: string, entries: Record<string, string>): void {
    if (!this.historyRepo.findById(item.id)) return;
    const bundle: CoachGlossBundle = {
      language: GLOSS_LANGUAGE,
      engineVersion: GLOSS_ENGINE_VERSION,
      analysisStamp: stamp,
      aiModel: this.ai.modelName,
      updatedAt: new Date().toISOString(),
      entries,
    };

    const coachGlosses = { ...(item.coachGlosses || {}), [GLOSS_LANGUAGE]: bundle };
    this.historyRepo.update(item.id, { coachGlosses });
  }

  private async generate(
    item: HistoryItem,
    entries: CoachGlossSourceEntry[],
  ): Promise<Record<string, string>> {
    if (!this.ai.isConfigured()) return {};

    const systemPrompt = [
      `You are an elite Arabic lexicographer and spoken-English teacher. You write the Arabic MEANING of the expressions and vocabulary a learner should take away from a real spoken-English lesson.`,
      'RULES:',
      '1. SENSE, NOT WORDS: give the meaning the speaker actually intends in the given sentence. For an idiom, phrasal verb or slang phrase, give its idiomatic equivalent — never a word-by-word transfer, never a paraphrase of the English explanation.',
      '2. SELF-CONTAINED: 3-10 Arabic words that read as a complete meaning on their own. Fold the object, preposition, or nuance from the lesson sentence into the gloss when the bare phrase would leave a dangling word: "lines up more with" -> "يتوافق أكثر مع موقف أو استراتيجية" (not "ينسجم أكثر مع").',
      '3. KEEP THE NUANCE: where the bare Arabic word is thinner than what the lesson means, carry the extra nuance in a short phrase: "implications" -> "الآثار المترتبة المحتملة", "business model" -> "طريقة تحقيق الشركة للإيرادات", "advanced hardware" -> "معدات حاسوبية متقدمة".',
      '4. CONTEXT: use the supplied lesson sentence to pick the right sense when the word has several (e.g. "bank", "run", "deal"), and to keep the natural register of the speaker.',
      '5. Arabic script only: clear Modern Standard Arabic (فصحى معاصرة), active phrasing (never passive "تم ... من قِبل"), no transliteration, no English sentences, no notes, no numbering, no surrounding quotes.',
      '6. Keep proper nouns, brands and tech/dev terms (AI, API, LLM, GPU) in Latin script exactly as written.',
      '7. Output ONLY compact single-line JSON: {"glosses":{"<key>":"<Arabic meaning>"}}',
    ].join('\n');

    const contextLines = [
      `Title: ${item.title || 'Spoken English Lesson'} | Speaker: ${item.creator || 'Speaker'} | Target: ${GLOSS_LANGUAGE_NAME}`,
    ];
    if (item.aiAnalysis?.overview?.summary) {
      contextLines.push(`Topic: ${item.aiAnalysis.overview.summary}`);
    }

    const collected: Record<string, string> = {};
    for (let i = 0; i < entries.length; i += GLOSS_BATCH_SIZE) {
      const batch = entries.slice(i, i + GLOSS_BATCH_SIZE);
      const lines = batch.flatMap((entry) => [
        `- key=${entry.key} | ${entry.kind} | "${entry.phrase}" | lesson meaning: ${entry.explanation}`,
        entry.context ? `  lesson sentence: "${entry.context}"` : '',
      ]).filter(Boolean);

      const userPrompt = [
        ...contextLines,
        '',
        'Items from the video (return one Arabic meaning for every key):',
        ...lines,
        '',
        'Return compact JSON only: {"glosses":{"<key>":"<Arabic meaning>"}}',
      ].join('\n');

      try {
        const data = await this.ai.chatJson<{ glosses?: Record<string, unknown> }>(
          systemPrompt,
          userPrompt,
          {
            temperature: 0.15,
            maxTokens: 1600,
            timeoutMs: 24000,
            json: true,
            reasoningEffort: 'none',
          },
        );

        const dictionary =
          data && typeof data === 'object' && data.glosses && typeof data.glosses === 'object'
            ? data.glosses
            : (data as Record<string, unknown>);

        for (const entry of batch) {
          const raw = dictionary?.[entry.key];
          const gloss = this.cleanGloss(raw);
          if (gloss) collected[entry.key] = gloss;
        }
      } catch (error: any) {
        this.logger.warn(
          `Arabic coach gloss batch failed for ${item.id}: ${error?.message || error}`,
        );
      }
    }

    return collected;
  }

  private cleanGloss(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    const text = raw
      .replace(/<\/?bdi[^>]*>/gi, '')
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .replace(/^["'“”]+|["'“”]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) return '';
    return this.isArabicGloss(text) ? text : '';
  }

  /** Guard against the model answering in English or Latin transliteration. */
  private isArabicGloss(text: string): boolean {
    const arabic = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    return arabic >= 2 && arabic >= latin;
  }
}
