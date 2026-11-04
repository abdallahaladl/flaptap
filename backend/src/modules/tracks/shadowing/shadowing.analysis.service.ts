import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiClient } from '../../../core/ai/ai.client';
import { DEFAULT_LANGUAGE, getLanguage } from '../../../core/ai/languages';
import {
  AiCoachAnalysis,
  ConnectedSpeechEntry,
  ExpressionEntry,
  HistoryItem,
  HistoryRepository,
  SentenceItem,
  VocabularyCoachEntry,
} from '../../../core/database/history.repository';
import {
  applyDynamicHighlights,
  escapeTranscriptHtml,
  HighlightAnnotation,
} from '../../../core/linguistics/highlights';

export interface WordDefinitionResponse {
  term: string;
  ipa: string;
  partOfSpeech: string;
  definition: string;
  translation: string;
  targetLanguage: string;
  targetLanguageName: string;
  rtl: boolean;
  spokenTip: string;
  contextSentence: string;
  sentenceIndex: number;
  timestampSec: number;
}

const ANALYSIS_VERSION = 1;

@Injectable()
export class ShadowingAnalysisService {
  private readonly logger = new Logger(ShadowingAnalysisService.name);
  private readonly inFlight = new Map<string, Promise<AiCoachAnalysis>>();

  constructor(
    private readonly ai: AiClient,
    private readonly historyRepo: HistoryRepository,
  ) {}

  async analyze(historyId: string, force = false): Promise<{
    success: boolean;
    historyId: string;
    fromCache: boolean;
    analysis: AiCoachAnalysis;
    sentences?: SentenceItem[];
  }> {
    if (!historyId) {
      throw new BadRequestException('historyId is required.');
    }

    const item = this.historyRepo.findById(historyId);
    if (!item) {
      throw new NotFoundException(`Lesson "${historyId}" not found.`);
    }

    if (
      !force &&
      item.aiAnalysis &&
      item.aiAnalysis.version === ANALYSIS_VERSION &&
      (item.aiAnalysis.connectedSpeech?.length > 0 || item.aiAnalysis.expressions?.length > 0)
    ) {
      return {
        success: true,
        historyId,
        fromCache: true,
        analysis: item.aiAnalysis,
        sentences: item.sentences,
      };
    }

    let running = this.inFlight.get(historyId);
    if (!running) {
      running = this.generateAndPersistAnalysis(item).finally(() => {
        this.inFlight.delete(historyId);
      });
      this.inFlight.set(historyId, running);
    }

    const analysis = await running;
    const refreshed = this.historyRepo.findById(historyId);
    return {
      success: true,
      historyId,
      fromCache: false,
      analysis,
      sentences: refreshed?.sentences || item.sentences,
    };
  }

  private selectRepresentativeSentences(sentences: SentenceItem[]): SentenceItem[] {
    if (sentences.length <= 75) return sentences;
    // Sample evenly across opening, body, and conclusion while preserving original indices
    const selected: SentenceItem[] = [];
    const step = sentences.length / 72;
    const used = new Set<number>();
    for (let i = 0; i < 72; i++) {
      const idx = Math.min(sentences.length - 1, Math.floor(i * step));
      if (!used.has(idx)) {
        used.add(idx);
        selected.push(sentences[idx]);
      }
    }
    return selected;
  }

  private async generateAndPersistAnalysis(item: HistoryItem): Promise<AiCoachAnalysis> {
    if (!this.ai.isConfigured()) {
      throw new ServiceUnavailableException(
        'AI coaching requires OPENCODE_GO_API_KEY to be configured.',
      );
    }

    const allSentences = item.sentences || [];
    if (allSentences.length === 0) {
      throw new BadRequestException('This lesson has no transcript sentences to analyze.');
    }

    const sampled = this.selectRepresentativeSentences(allSentences);
    const numberedLines = sampled
      .map((s) => `[${s.index}] ${s.text}`)
      .join('\n');

    const systemPrompt = [
      'You are an elite American English phonetician, prosody coach, and applied linguist.',
      'Your task is to analyze a real verbatim spoken English transcript (which may be a tech talk, science lecture, podcast, interview, news report, vlog, or dialogue) and extract dynamic, deeply educational spoken-English insights.',
      '',
      'CRITICAL ENGINEERING RULES:',
      '1. UNIVERSAL GENRE ADAPTABILITY: Every spoken English transcript contains rich connected speech, natural phrasal/idiomatic expressions, and high-value vocabulary — NEVER return empty arrays.',
      '   - For connectedSpeech: identify real multi-word sequences from the transcript demonstrating American connected speech: alveolar Flap-T between vowels ("got a", "lot of", "better", "put it"), consonant-to-vowel linking/catenation ("done it again", "came across"), function-word schwa reductions ("to", "for", "of", "and", "can"), consonant cluster elision ("just got", "next day", "first time"), palatalization ("did you", "would you"), or glottal stops.',
      '   - For expressions: identify real phrasal verbs, idioms, collocations, discourse transitions, or rhetorical phrases actually spoken in the transcript (even in technical or academic speech, speakers use phrases like "come across", "put to the side", "no longer the case", "done it again", "keep in mind", "cut down on").',
      '   - For vocabulary: identify high-leverage content words, domain terms, verbs, or modifiers from the transcript.',
      '2. STRICT VERBATIM GROUNDING: Every `exactPhrase`, `phrase`, and `term` MUST appear verbatim (character-for-character substring) inside the referenced `[sentenceIndex]` line.',
      '3. ACCURATE PHONETICS: Provide genuine General American IPA (with linking ties ‿, flaps t̬, and schwas ə) and concrete physical tongue/jaw/airflow mechanics.',
      '4. Return ONLY a single valid JSON object with no markdown fences and no extra commentary.',
    ].join('\n');

    const userPrompt = [
      `Lesson Title: ${item.title || 'Spoken English Lesson'}`,
      `Speaker / Channel: ${item.creator || 'Speaker'}`,
      `Estimated Pacing: ${item.pacingWpm || 150} WPM`,
      '',
      'Numbered Verbatim Sentences:',
      numberedLines,
      '',
      'Return strictly this JSON schema:',
      '{',
      '  "overview": {',
      '    "summary": "2 concise sentences describing what the speaker covers and why this clip is valuable for spoken English mastery.",',
      '    "speakerStyle": "Short 3-6 word cadence label, e.g. Fast Technical Explainer, Measured Academic Storytelling",',
      '    "cefrLevel": "B1" | "B2" | "C1" | "C2",',
      '    "focusTips": [',
      '      "Actionable prosody/shadowing coaching tip specific to this speaker",',
      '      "Second specific rhythm, linking, or stress coaching tip"',
      '    ]',
      '  },',
      '  "connectedSpeech": [',
      '    {',
      '      "exactPhrase": "exact 2-5 word substring from sentence",',
      '      "spokenIpa": "/phonetic IPA showing real American linking or reduction/",',
      '      "phenomenon": "e.g. Alveolar Flap-T & Linking | Schwa Function Reduction | Consonant Elision | Palatalization",',
      '      "mechanics": "Concise physical mouth/tongue instruction for shadowing this smoothly",',
      '      "sentenceIndex": 1',
      '    }',
      '  ],',
      '  "expressions": [',
      '    {',
      '      "phrase": "exact multi-word expression, phrasal verb, or collocation from sentence",',
      '      "meaning": "Clear plain-English explanation in context",',
      '      "register": "Conversational | Idiomatic | Professional | Academic | Colloquial",',
      '      "usageNote": "How and why native speakers deploy this phrase naturally",',
      '      "sentenceIndex": 1',
      '    }',
      '  ],',
      '  "vocabulary": [',
      '    {',
      '      "term": "exact word or compound term from sentence",',
      '      "ipa": "/General American IPA/",',
      '      "partOfSpeech": "noun | verb | adjective | adverb | phrasal verb",',
      '      "definition": "Crisp contextual meaning in this talk",',
      '      "sentenceIndex": 1',
      '    }',
      '  ]',
      '}',
      '',
      'Target counts: 5 to 8 items in connectedSpeech, 4 to 8 items in expressions, and 5 to 8 items in vocabulary (scale naturally if the clip is very short, minimum 3 per array).',
    ].join('\n');

    const startedAt = Date.now();
    let raw: any;
    try {
      raw = await this.ai.chatJson<any>(systemPrompt, userPrompt, {
        temperature: 0.2,
        maxTokens: 3600,
        timeoutMs: 55000,
        json: true,
      });
    } catch (error: any) {
      this.logger.error(`Dynamic AI analysis failed for ${item.id}: ${error.message}`);
      throw new ServiceUnavailableException(
        error?.message || 'AI Coach analysis is temporarily unavailable.',
      );
    }

    const analysis = this.groundAndValidateAnalysis(raw, allSentences);

    // Apply dynamic verbatim highlights across sentences and paragraphs
    const annotations: HighlightAnnotation[] = [
      ...analysis.connectedSpeech.map((c) => ({
        phrase: c.exactPhrase,
        category: 'connected' as const,
      })),
      ...analysis.expressions.map((e) => ({
        phrase: e.phrase,
        category: 'expression' as const,
      })),
      ...analysis.vocabulary.map((v) => ({
        phrase: v.term,
        category: 'vocab' as const,
      })),
    ];

    const updatedSentences = allSentences.map((s) => ({
      ...s,
      highlightedHtml: applyDynamicHighlights(s.text, annotations),
    }));

    const sentenceByIdx = new Map<number, SentenceItem>(
      updatedSentences.map((s) => [s.index, s]),
    );

    const updatedChunks = (item.chunks || []).map((chunk) => {
      if (Array.isArray(chunk.sentenceIndices) && chunk.sentenceIndices.length > 0) {
        const html = chunk.sentenceIndices
          .map((idx) => sentenceByIdx.get(idx)?.highlightedHtml || '')
          .filter(Boolean)
          .join(' ');
        return {
          ...chunk,
          highlightedHtml: html || applyDynamicHighlights(chunk.text, annotations),
        };
      }
      return {
        ...chunk,
        highlightedHtml: applyDynamicHighlights(chunk.text, annotations),
      };
    });

    const noteMarkdown = this.historyRepo.buildCleanMarkdown(
      item.title,
      item.creator,
      item.sourceUrl,
      updatedChunks,
      analysis,
      item.studyNotes,
    );

    this.historyRepo.update(item.id, {
      aiAnalysis: analysis,
      analysisStatus: 'ready',
      cefrLevel: analysis.overview.cefrLevel,
      sentences: updatedSentences,
      chunks: updatedChunks,
      noteMarkdown,
    });

    this.logger.log(
      `AI Coach ready for "${item.title}" in ${Date.now() - startedAt}ms ` +
        `(${analysis.connectedSpeech.length} connected, ${analysis.expressions.length} expressions, ${analysis.vocabulary.length} vocab)`,
    );

    return analysis;
  }

  /**
   * Grounds every AI-extracted phrase against the real transcript sentences so
   * timestamps and "Play in Video" links are 100% accurate and verbatim.
   */
  private groundAndValidateAnalysis(raw: any, sentences: SentenceItem[]): AiCoachAnalysis {
    const validCefr = new Set(['A2', 'B1', 'B2', 'C1', 'C2']);
    const rawCefr = String(raw?.overview?.cefrLevel || 'B2').toUpperCase();
    const cefrLevel = (validCefr.has(rawCefr) ? rawCefr : 'B2') as AiCoachAnalysis['overview']['cefrLevel'];

    const findGroundedSentence = (phrase: string, hintedIndex?: number): { index: number; exact: string } | null => {
      const clean = (phrase || '').replace(/\s+/g, ' ').trim();
      if (!clean || clean.length < 2) return null;
      const lower = clean.toLowerCase();

      // 1. Check hinted sentence first
      if (hintedIndex && Number.isFinite(Number(hintedIndex))) {
        const target = sentences.find((s) => s.index === Number(hintedIndex));
        if (target) {
          const pos = target.text.toLowerCase().indexOf(lower);
          if (pos >= 0) {
            return {
              index: target.index,
              exact: target.text.slice(pos, pos + clean.length),
            };
          }
        }
      }

      // 2. Search all sentences for exact case-insensitive substring
      for (const s of sentences) {
        const pos = s.text.toLowerCase().indexOf(lower);
        if (pos >= 0) {
          return {
            index: s.index,
            exact: s.text.slice(pos, pos + clean.length),
          };
        }
      }

      // 3. Tolerate internal punctuation differences (e.g. comma inside phrase)
      const tokens = clean
        .split(/\s+/)
        .map((t) => t.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, ''))
        .filter(Boolean);
      if (tokens.length > 0) {
        const pattern = tokens
          .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('[\\s,;:—–-]+');
        const rx = new RegExp(`\\b(${pattern})\\b`, 'iu');
        for (const s of sentences) {
          const m = rx.exec(s.text);
          if (m) {
            return { index: s.index, exact: m[1] };
          }
        }
      }

      return null;
    };

    const seenConnected = new Set<string>();
    const connectedSpeech: ConnectedSpeechEntry[] = [];
    for (const entry of Array.isArray(raw?.connectedSpeech) ? raw.connectedSpeech : []) {
      const rawPhrase = String(entry?.exactPhrase || entry?.written || '').trim();
      const grounded = findGroundedSentence(rawPhrase, entry?.sentenceIndex);
      if (!grounded) continue;
      const key = grounded.exact.toLowerCase();
      if (seenConnected.has(key)) continue;
      seenConnected.add(key);

      connectedSpeech.push({
        exactPhrase: grounded.exact,
        spokenIpa: String(entry?.spokenIpa || entry?.spoken || '').trim(),
        phenomenon: String(entry?.phenomenon || 'Connected Speech').trim(),
        mechanics: String(entry?.mechanics || '').trim(),
        sentenceIndex: grounded.index,
      });
    }

    const seenExpressions = new Set<string>();
    const expressions: ExpressionEntry[] = [];
    for (const entry of Array.isArray(raw?.expressions) ? raw.expressions : []) {
      const rawPhrase = String(entry?.phrase || entry?.term || '').trim();
      const grounded = findGroundedSentence(rawPhrase, entry?.sentenceIndex);
      if (!grounded) continue;
      const key = grounded.exact.toLowerCase();
      if (seenExpressions.has(key)) continue;
      seenExpressions.add(key);

      expressions.push({
        phrase: grounded.exact,
        meaning: String(entry?.meaning || '').trim(),
        register: String(entry?.register || 'Conversational').trim(),
        usageNote: String(entry?.usageNote || '').trim(),
        sentenceIndex: grounded.index,
      });
    }

    const seenVocab = new Set<string>();
    const vocabulary: VocabularyCoachEntry[] = [];
    for (const entry of Array.isArray(raw?.vocabulary) ? raw.vocabulary : []) {
      const rawTerm = String(entry?.term || '').trim();
      const grounded = findGroundedSentence(rawTerm, entry?.sentenceIndex);
      if (!grounded) continue;
      const key = grounded.exact.toLowerCase();
      if (seenVocab.has(key)) continue;
      seenVocab.add(key);

      vocabulary.push({
        term: grounded.exact,
        ipa: String(entry?.ipa || '').trim(),
        partOfSpeech: String(entry?.partOfSpeech || 'word').trim(),
        definition: String(entry?.definition || '').trim(),
        sentenceIndex: grounded.index,
      });
    }

    const tips = Array.isArray(raw?.overview?.focusTips)
      ? raw.overview.focusTips.map((t: any) => String(t || '').trim()).filter(Boolean).slice(0, 4)
      : [];

    return {
      version: ANALYSIS_VERSION,
      analyzedAt: new Date().toISOString(),
      aiModel: this.ai.modelName,
      overview: {
        summary:
          String(raw?.overview?.summary || '').trim() ||
          'Authentic spoken English lesson analyzed for rhythm, linking, and contextual expression.',
        speakerStyle:
          String(raw?.overview?.speakerStyle || '').trim() ||
          'Natural American Cadence',
        cefrLevel,
        focusTips:
          tips.length > 0
            ? tips
            : [
                'Link final consonants smoothly into following vowel-initial words without glottal breaks.',
                'Compress unstressed function words so primary stress lands cleanly on key content words.',
              ],
      },
      connectedSpeech,
      expressions,
      vocabulary,
    };
  }

  /**
   * Instant contextual AI word/phrase lookup when clicking any word in the Studio.
   */
  async defineWordInContext(
    historyId: string,
    word: string,
    sentenceIndex?: number,
    targetLanguageCode?: string,
  ): Promise<WordDefinitionResponse> {
    const cleanWord = (word || '')
      .replace(/^[^\p{L}\p{N}'-]+|[^\p{L}\p{N}'-]+$/gu, '')
      .trim();
    if (!cleanWord) {
      throw new BadRequestException('A valid word is required.');
    }

    const item = this.historyRepo.findById(historyId);
    if (!item) {
      throw new NotFoundException(`Lesson "${historyId}" not found.`);
    }

    if (!this.ai.isConfigured()) {
      throw new ServiceUnavailableException(
        'Word lookup requires OPENCODE_GO_API_KEY to be configured.',
      );
    }

    const sentences = item.sentences || [];
    const targetSentence =
      sentences.find((s) => s.index === Number(sentenceIndex)) ||
      sentences.find((s) => s.text.toLowerCase().includes(cleanWord.toLowerCase())) ||
      sentences[0];

    const contextText = targetSentence?.text || cleanWord;
    const lang = getLanguage(targetLanguageCode || DEFAULT_LANGUAGE);

    const systemPrompt = [
      'You are a concise, authoritative English lexicographer and American pronunciation coach.',
      'Explain the requested English word or phrase strictly according to its exact sense in the given spoken sentence.',
      `Provide a natural, standard ${lang.name} (${lang.native}) translation for that exact contextual meaning.`,
      'Return ONLY a valid JSON object.',
    ].join('\n');

    const userPrompt = [
      `Video: ${item.title}`,
      `Spoken sentence: "${contextText}"`,
      `Selected word: "${cleanWord}"`,
      `Target translation language: ${lang.name} (${lang.native})`,
      '',
      'Return strictly this JSON shape:',
      '{',
      '  "term": "canonical word or multi-word phrasal unit if part of a phrasal verb in this sentence",',
      '  "ipa": "/General American IPA/",',
      '  "partOfSpeech": "noun | verb | adjective | adverb | phrasal verb | idiom",',
      '  "definition": "1 crisp plain-English sentence defining it in this exact context",',
      `  "translation": "natural ${lang.name} equivalent in context",`,
      '  "spokenTip": "1 brief tip on how Americans pronounce, stress, or link this word in speech"',
      '}',
    ].join('\n');

    const payload = await this.ai.chatJson<any>(systemPrompt, userPrompt, {
      temperature: 0.15,
      maxTokens: 600,
      timeoutMs: 25000,
      json: true,
    });

    return {
      term: String(payload?.term || cleanWord).trim(),
      ipa: String(payload?.ipa || '').trim(),
      partOfSpeech: String(payload?.partOfSpeech || '').trim(),
      definition: String(payload?.definition || '').trim(),
      translation: String(payload?.translation || '').trim(),
      targetLanguage: lang.code,
      targetLanguageName: lang.name,
      rtl: Boolean(lang.rtl),
      spokenTip: String(payload?.spokenTip || '').trim(),
      contextSentence: contextText,
      sentenceIndex: targetSentence?.index || 1,
      timestampSec: targetSentence?.startSec || 0,
    };
  }
}
