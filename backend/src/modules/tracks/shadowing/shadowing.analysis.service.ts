import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiClient } from '../../../core/ai/ai.client';
import { WordDefinitionResponse, WordLookupService } from '../../../core/ai/word-lookup.service';
import { DEFAULT_LANGUAGE } from '../../../core/ai/languages';
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

export { WordDefinitionResponse };

const ANALYSIS_VERSION = 1;

@Injectable()
export class ShadowingAnalysisService {
  private readonly logger = new Logger(ShadowingAnalysisService.name);
  private readonly inFlight = new Map<string, Promise<AiCoachAnalysis>>();

  constructor(
    private readonly ai: AiClient,
    private readonly historyRepo: HistoryRepository,
    private readonly wordLookup: WordLookupService,
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
    if (sentences.length <= 50) return sentences;
    // Sample evenly across opening, body, and conclusion while preserving original indices
    const selected: SentenceItem[] = [];
    const step = sentences.length / 48;
    const used = new Set<number>();
    for (let i = 0; i < 48; i++) {
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
      'Analyze a verbatim spoken English transcript across ANY genre and extract educational spoken-English insights (never return empty arrays).',
      'RULES:',
      '1. STRICT VERBATIM GROUNDING: Every exactPhrase, phrase, and term MUST appear character-for-character inside its referenced [sentenceIndex].',
      '2. connectedSpeech (5-7 items): 2-5 word verbatim substrings showing Flap-T, linking, schwa reductions, elision, or palatalization with General American IPA (ties ‿, flap t̬, schwa ə) and <=12-word physical mechanics.',
      '3. expressions (4-7 items): verbatim phrasal verbs, idioms, slang, or discourse markers with concise meaning, General American IPA, and <=12-word usageNote. Set register to "Slang" or "Colloquial" only when the phrase is genuinely informal.',
      '4. vocabulary (5-7 items): high-leverage verbatim content words/domain terms with IPA, POS, and <=10-word definition.',
      '5. Output ONLY compact single-line JSON (no markdown fences, no pretty-print whitespace):',
      '{"overview":{"summary":"1-2 concise sentences","speakerStyle":"3-6 word cadence","cefrLevel":"B1|B2|C1|C2","focusTips":["tip 1","tip 2"]},"connectedSpeech":[{"exactPhrase":"verbatim 2-5 words","spokenIpa":"/IPA/","phenomenon":"mechanism","mechanics":"<=12 words","sentenceIndex":1}],"expressions":[{"phrase":"verbatim phrase","meaning":"<=12 words","register":"Conversational|Professional|Academic|Colloquial|Slang","ipa":"/IPA/","usageNote":"<=12 words","sentenceIndex":1}],"vocabulary":[{"term":"verbatim word","ipa":"/IPA/","partOfSpeech":"noun|verb|adjective|adverb","definition":"<=10 words","sentenceIndex":1}]}',
    ].join('\n');

    const userPrompt = [
      `Title: ${item.title || 'Spoken English Lesson'} | Speaker: ${item.creator || 'Speaker'} | Pacing: ${item.pacingWpm || 150} WPM`,
      '',
      'Numbered Verbatim Sentences:',
      numberedLines,
      '',
      'Extract 5-7 connectedSpeech, 4-7 expressions, and 5-7 vocabulary (min 3 per array for short clips). Compact JSON only.',
    ].join('\n');

    const startedAt = Date.now();
    let raw: any;
    try {
      raw = await this.ai.chatJson<any>(systemPrompt, userPrompt, {
        temperature: 0.2,
        maxTokens: 3200,
        timeoutMs: 32000,
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
   * Pure local, zero-AI re-grounding after deterministic sentence pacing changes.
   * Updates every Coach entry's `sentenceIndex` and reapplies dynamic `<mark>`
   * highlights onto `item.sentences` and `item.chunks` while keeping entry order
   * and array indices intact so `coachGlosses` and Coach completion progress remain valid.
   */
  public regroundExistingAnalysisForSentences(item: HistoryItem): void {
    if (!item?.aiAnalysis || !Array.isArray(item.sentences) || item.sentences.length === 0) {
      return;
    }

    const sentences = item.sentences;
    const prev = item.aiAnalysis;
    const grounded = this.groundAndValidateAnalysis(prev, sentences, {
      preserveUngrounded: true,
      analyzedAt: prev.analyzedAt,
      aiModel: prev.aiModel,
    });

    const annotations: HighlightAnnotation[] = [
      ...grounded.connectedSpeech.map((c) => ({
        phrase: c.exactPhrase,
        category: 'connected' as const,
      })),
      ...grounded.expressions.map((e) => ({
        phrase: e.phrase,
        category: 'expression' as const,
      })),
      ...grounded.vocabulary.map((v) => ({
        phrase: v.term,
        category: 'vocab' as const,
      })),
    ];

    const updatedSentences = sentences.map((s) => ({
      ...s,
      highlightedHtml: annotations.length
        ? applyDynamicHighlights(s.text, annotations)
        : escapeTranscriptHtml(s.text),
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
          highlightedHtml:
            html ||
            (annotations.length
              ? applyDynamicHighlights(chunk.text, annotations)
              : escapeTranscriptHtml(chunk.text)),
        };
      }
      return {
        ...chunk,
        highlightedHtml: annotations.length
          ? applyDynamicHighlights(chunk.text, annotations)
          : escapeTranscriptHtml(chunk.text),
      };
    });

    item.aiAnalysis = grounded;
    item.sentences = updatedSentences;
    item.chunks = updatedChunks;
    if (item.stats) {
      item.stats.connectedCount = grounded.connectedSpeech.length;
      item.stats.expressionsCount = grounded.expressions.length;
      item.stats.vocabularyCount = grounded.vocabulary.length;
    }
  }

  /**
   * Grounds every AI-extracted phrase against the real transcript sentences so
   * timestamps and "Play in Video" links are 100% accurate and verbatim.
   */
  private groundAndValidateAnalysis(
    raw: any,
    sentences: SentenceItem[],
    options: {
      preserveUngrounded?: boolean;
      analyzedAt?: string;
      aiModel?: string;
    } = {},
  ): AiCoachAnalysis {
    const validCefr = new Set(['A2', 'B1', 'B2', 'C1', 'C2']);
    const rawCefr = String(raw?.overview?.cefrLevel || 'B2').toUpperCase();
    const cefrLevel = (validCefr.has(rawCefr) ? rawCefr : 'B2') as AiCoachAnalysis['overview']['cefrLevel'];
    const maxSentenceIdx = sentences.length > 0 ? sentences[sentences.length - 1].index : 1;

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

        // 4. When re-grounding after shorter pacing splits, match across adjacent sentence pairs
        if (options.preserveUngrounded && sentences.length > 1) {
          for (let i = 0; i < sentences.length - 1; i++) {
            const pairText = `${sentences[i].text} ${sentences[i + 1].text}`;
            const m = rx.exec(pairText);
            if (m) {
              return { index: sentences[i].index, exact: clean };
            }
          }
        }
      }

      return null;
    };

    const clampIndex = (rawIdx?: number): number => {
      const num = Math.floor(Number(rawIdx) || 1);
      return Math.max(1, Math.min(maxSentenceIdx, num));
    };

    const seenConnected = new Set<string>();
    const connectedSpeech: ConnectedSpeechEntry[] = [];
    for (const entry of Array.isArray(raw?.connectedSpeech) ? raw.connectedSpeech : []) {
      const rawPhrase = String(entry?.exactPhrase || entry?.written || '').trim();
      const grounded = findGroundedSentence(rawPhrase, entry?.sentenceIndex);
      if (!grounded && !options.preserveUngrounded) continue;
      const exact = grounded ? grounded.exact : rawPhrase;
      if (!exact) continue;
      const key = exact.toLowerCase();
      if (!options.preserveUngrounded && seenConnected.has(key)) continue;
      seenConnected.add(key);

      connectedSpeech.push({
        exactPhrase: exact,
        spokenIpa: String(entry?.spokenIpa || entry?.spoken || '').trim(),
        phenomenon: String(entry?.phenomenon || 'Connected Speech').trim(),
        mechanics: String(entry?.mechanics || '').trim(),
        sentenceIndex: grounded ? grounded.index : clampIndex(entry?.sentenceIndex),
      });
    }

    const seenExpressions = new Set<string>();
    const expressions: ExpressionEntry[] = [];
    for (const entry of Array.isArray(raw?.expressions) ? raw.expressions : []) {
      const rawPhrase = String(entry?.phrase || entry?.term || '').trim();
      const grounded = findGroundedSentence(rawPhrase, entry?.sentenceIndex);
      if (!grounded && !options.preserveUngrounded) continue;
      const exact = grounded ? grounded.exact : rawPhrase;
      if (!exact) continue;
      const key = exact.toLowerCase();
      if (!options.preserveUngrounded && seenExpressions.has(key)) continue;
      seenExpressions.add(key);

      expressions.push({
        phrase: exact,
        meaning: String(entry?.meaning || '').trim(),
        register: String(entry?.register || 'Conversational').trim(),
        ipa: String(entry?.ipa || '').trim(),
        usageNote: String(entry?.usageNote || '').trim(),
        sentenceIndex: grounded ? grounded.index : clampIndex(entry?.sentenceIndex),
      });
    }

    const seenVocab = new Set<string>();
    const vocabulary: VocabularyCoachEntry[] = [];
    for (const entry of Array.isArray(raw?.vocabulary) ? raw.vocabulary : []) {
      const rawTerm = String(entry?.term || '').trim();
      const grounded = findGroundedSentence(rawTerm, entry?.sentenceIndex);
      if (!grounded && !options.preserveUngrounded) continue;
      const exact = grounded ? grounded.exact : rawTerm;
      if (!exact) continue;
      const key = exact.toLowerCase();
      if (!options.preserveUngrounded && seenVocab.has(key)) continue;
      seenVocab.add(key);

      vocabulary.push({
        term: exact,
        ipa: String(entry?.ipa || '').trim(),
        partOfSpeech: String(entry?.partOfSpeech || 'word').trim(),
        definition: String(entry?.definition || '').trim(),
        sentenceIndex: grounded ? grounded.index : clampIndex(entry?.sentenceIndex),
      });
    }

    const tips = Array.isArray(raw?.overview?.focusTips)
      ? raw.overview.focusTips.map((t: any) => String(t || '').trim()).filter(Boolean).slice(0, 4)
      : [];

    return {
      version: ANALYSIS_VERSION,
      analyzedAt: options.analyzedAt || new Date().toISOString(),
      aiModel: options.aiModel || this.ai.modelName,
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
    lookupScope?: 'word' | 'phrase' | 'sentence',
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

    const sentences = item.sentences || [];
    const targetSentence =
      sentences.find((s) => s.index === Number(sentenceIndex)) ||
      sentences.find((s) => s.text.toLowerCase().includes(cleanWord.toLowerCase())) ||
      sentences[0];

    return this.wordLookup.defineWordInContext({
      word: cleanWord,
      contextSentence: targetSentence?.text || cleanWord,
      title: item.title,
      targetLanguageCode: targetLanguageCode || DEFAULT_LANGUAGE,
      sentenceIndex: targetSentence?.index || 1,
      timestampSec: targetSentence?.startSec || 0,
      scope: lookupScope,
    });
  }
}
