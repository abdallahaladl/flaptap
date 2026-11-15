import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiClient } from './ai.client';
import { DEFAULT_LANGUAGE, getLanguage } from './languages';

export type WordLookupScope = 'word' | 'phrase' | 'sentence';

export interface WordDefinitionResponse {
  term: string;
  ipa: string;
  partOfSpeech: string;
  definition: string;
  generalTranslation: string;
  translation: string;
  targetLanguage: string;
  targetLanguageName: string;
  rtl: boolean;
  spokenTip: string;
  contextSentence: string;
  sentenceIndex: number;
  timestampSec: number;
  scope: WordLookupScope;
}

export interface WordLookupRequest {
  word: string;
  contextSentence?: string;
  title?: string;
  targetLanguageCode?: string;
  sentenceIndex?: number;
  timestampSec?: number;
  scope?: WordLookupScope;
}

const VALID_SCOPES = new Set<WordLookupScope>(['word', 'phrase', 'sentence']);

function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

function inferScope(text: string): WordLookupScope {
  const wordCount = countWords(text);
  if (wordCount > 8) return 'sentence';
  if (wordCount > 1) return 'phrase';
  return 'word';
}

@Injectable()
export class WordLookupService {
  private readonly cache = new Map<string, WordDefinitionResponse>();
  private readonly maxCacheEntries = 400;

  constructor(private readonly ai: AiClient) {}

  async defineWordInContext(req: WordLookupRequest): Promise<WordDefinitionResponse> {
    const cleanWord = (req.word || '')
      .replace(/^[^\p{L}\p{N}'-]+|[^\p{L}\p{N}'-]+$/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 400);

    if (!cleanWord) {
      throw new BadRequestException('A valid word is required.');
    }

    if (!this.ai.isConfigured()) {
      throw new ServiceUnavailableException(
        'Contextual word lookup requires OPENCODE_GO_API_KEY to be configured.',
      );
    }

    const scope: WordLookupScope =
      req.scope && VALID_SCOPES.has(req.scope) ? req.scope : inferScope(cleanWord);

    const contextText = (req.contextSentence || cleanWord).trim().slice(0, 1000);
    const lang = getLanguage(req.targetLanguageCode || DEFAULT_LANGUAGE);
    const cacheKey = `${cleanWord.toLowerCase()}::${scope}::${contextText.slice(0, 180).toLowerCase()}::${lang.code}`;

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        sentenceIndex: req.sentenceIndex ?? cached.sentenceIndex,
        timestampSec: req.timestampSec ?? cached.timestampSec,
      };
    }

    const { systemPrompt, userPrompt } = this.buildPrompts({
      text: cleanWord,
      scope,
      contextText,
      lang,
      title: req.title,
    });

    const payload = await this.ai.chatJson<any>(systemPrompt, userPrompt, {
      temperature: 0.15,
      maxTokens: 700,
      timeoutMs: 14000,
      json: true,
    });

    const result: WordDefinitionResponse = {
      term: String(payload?.term || cleanWord).trim(),
      ipa: String(payload?.ipa || '').trim(),
      partOfSpeech: String(payload?.partOfSpeech || '').trim(),
      definition: String(payload?.definition || '').trim(),
      generalTranslation: String(payload?.generalTranslation || '').trim(),
      translation: String(payload?.translation || '').trim(),
      targetLanguage: lang.code,
      targetLanguageName: lang.name,
      rtl: Boolean(lang.rtl),
      spokenTip: String(payload?.spokenTip || '').trim(),
      contextSentence: contextText,
      sentenceIndex: req.sentenceIndex ?? 1,
      timestampSec: req.timestampSec ?? 0,
      scope,
    };

    if (this.cache.size >= this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Scope-specific prompting keeps one endpoint serving word clicks, phrase
   * selections, and whole-excerpt selections without duplicating transport or
   * caching logic.
   */
  private buildPrompts(input: {
    text: string;
    scope: WordLookupScope;
    contextText: string;
    lang: ReturnType<typeof getLanguage>;
    title?: string;
  }): { systemPrompt: string; userPrompt: string } {
    const { text, scope, contextText, lang, title } = input;

    const systemLines = [
      'You are a concise, authoritative English lexicographer and American pronunciation coach.',
      'First provide general dictionary meaning(s) ("generalTranslation") in the target language covering common everyday and alternative senses regardless of this sentence context.',
      'Then explain the requested English selection strictly according to its exact sense in the given context.',
      `Provide a natural, standard ${lang.name} (${lang.native}) translation for that exact contextual meaning.`,
    ];

    if (scope === 'sentence') {
      systemLines[1] =
        'Treat the selected excerpt as connected discourse: explain its overall meaning and give one natural translation.';
      systemLines.splice(
        2,
        1,
        'The learner selected a full spoken excerpt inside a transcript. Explain its meaning and discourse function in context rather than listing dictionary senses of each word.',
      );
    } else if (scope === 'phrase') {
      systemLines.splice(
        2,
        1,
        'The learner selected a multi-word phrase. Treat it as one phrasal unit (phrasal verb, idiom, collocation, or fixed chunk) when that is what the context implies.',
      );
    }

    systemLines.push('Return ONLY a valid JSON object.');

    const jsonShape =
      scope === 'sentence'
        ? [
            '{',
            '  "term": "the selected excerpt exactly as given, trimmed",',
            '  "ipa": "",',
            '  "partOfSpeech": "sentence | clause | phrase",',
            '  "definition": "1-2 plain-English sentences paraphrasing the exact meaning in context",',
            '  "generalTranslation": "",',
            `  "translation": "natural ${lang.name} translation of the whole excerpt",`,
            '  "spokenTip": "1 brief tip on rhythm, linking, stress, or tone for delivering this line like a native"',
            '}',
          ]
        : [
            '{',
            '  "term": "canonical word or multi-word phrasal unit if part of a phrasal verb/idiom in this sentence",',
            '  "ipa": "/General American IPA/",',
            '  "partOfSpeech": "noun | verb | adjective | adverb | phrasal verb | idiom",',
            '  "definition": "1 crisp plain-English sentence defining it in this exact context",',
            `  "generalTranslation": "common general dictionary ${lang.name} meanings including common alternative senses regardless of context (2-5 concise meanings separated by ' · ')",`,
            `  "translation": "natural ${lang.name} equivalent in context",`,
            '  "spokenTip": "1 brief tip on how native American speakers pronounce, stress, or use this in speech"',
            '}',
          ];

    const userPrompt = [
      title ? `Topic / Title: ${title}` : '',
      `Context sentence: "${contextText}"`,
      `${scope === 'sentence' ? 'Selected excerpt' : scope === 'phrase' ? 'Selected phrase' : 'Selected word'}: "${text}"`,
      `Target translation language: ${lang.name} (${lang.native})`,
      '',
      'Return strictly this JSON shape:',
      ...jsonShape,
    ]
      .filter(Boolean)
      .join('\n');

    return { systemPrompt: systemLines.join('\n'), userPrompt };
  }
}
