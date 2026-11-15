import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Injectable,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  AiCoachAnalysis,
  HistoryItem,
  HistoryRepository,
  RequestIdentityScope,
  SentenceItem,
} from '../../../core/database/history.repository';
import { AiClient } from '../../../core/ai/ai.client';
import { applyDynamicHighlights, HighlightAnnotation } from '../../../core/linguistics/highlights';
import { formatTimestampMs, roundMs, segmentParagraphs } from '../../../core/linguistics/segmentation';
import { AuthService } from '../../auth/auth.service';
import { requireAuthenticatedUser } from '../../auth/auth.request';

interface DialoguePayload {
  title: string;
  speakerStyle?: string;
  cefrLevel?: 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  pacingWpm?: number;
  summary?: string;
  focusTips?: string[];
  sentences?: Array<string | { text?: string; sentence?: string; line?: string }>;
  lines?: Array<string | { text?: string; sentence?: string; line?: string }>;
  dialogue?: Array<string | { text?: string; sentence?: string; line?: string }>;
  connectedSpeech?: Array<{
    exactPhrase: string;
    spokenIpa: string;
    phenomenon: string;
    mechanics: string;
    sentenceIndex?: number;
  }>;
  expressions?: Array<{
    phrase: string;
    meaning: string;
    register: string;
    usageNote: string;
    sentenceIndex?: number;
  }>;
  vocabulary?: Array<{
    term: string;
    ipa: string;
    partOfSpeech: string;
    definition: string;
    sentenceIndex?: number;
  }>;
}

@Injectable()
export class StreetTalkService {
  private readonly logger = new Logger(StreetTalkService.name);

  constructor(
    private readonly historyRepo: HistoryRepository,
    private readonly ai: AiClient,
  ) {}

  async startScenario(
    scenario: string,
    scope?: RequestIdentityScope,
  ): Promise<HistoryItem> {
    const cleanScenario = (scenario || '').trim();
    if (!cleanScenario) {
      throw new BadRequestException('Please describe a conversation scenario.');
    }

    const systemPrompt = [
      'You are an expert American English dialogue writer, applied linguist, and prosody coach.',
      'Author a natural, realistic spoken American English dialogue (6-8 sentences, 7-18 words each, ending with . ? !, no speaker labels or emojis).',
      'Every exactPhrase, phrase, and term MUST appear verbatim inside its referenced 1-based sentenceIndex.',
      'MANDATORY: Populate 4-6 connectedSpeech, 4-6 expressions, and 4-6 vocabulary items (never empty).',
      'Keep fields crisp: summary 1-2 short sentences, mechanics <=12 words, usageNote <=12 words, definition <=10 words.',
      'Output ONLY compact single-line JSON (no markdown fences, no pretty-print whitespace):',
      '{"title":"3-6 word title","speakerStyle":"cadence label","cefrLevel":"B2","pacingWpm":165,"summary":"concise summary","focusTips":["tip 1","tip 2"],"sentences":["Sentence 1.","Sentence 2."],"connectedSpeech":[{"exactPhrase":"2-4 word verbatim substring","spokenIpa":"/IPA/","phenomenon":"Flap-T | Linking | Schwa Reduction","mechanics":"<=12 words","sentenceIndex":1}],"expressions":[{"phrase":"verbatim idiom/phrasal","meaning":"<=10 words","register":"Conversational","usageNote":"<=12 words","sentenceIndex":1}],"vocabulary":[{"term":"verbatim word","ipa":"/IPA/","partOfSpeech":"verb","definition":"<=10 words","sentenceIndex":1}]}',
    ].join('\n');

    const userPrompt = `Create an interactive spoken American English dialogue lesson for: "${cleanScenario}". Compact JSON only.`;

    const startedAt = Date.now();
    const payload = await this.ai.chatJson<DialoguePayload>(systemPrompt, userPrompt, {
      temperature: 0.25,
      maxTokens: 2200,
      timeoutMs: 30000,
      json: true,
    });

    const candidateLines = Array.isArray(payload?.sentences)
      ? payload.sentences
      : Array.isArray(payload?.lines)
        ? payload.lines
        : Array.isArray(payload?.dialogue)
          ? payload.dialogue
          : [];

    const rawLines = candidateLines
      .map((entry) => {
        const text =
          typeof entry === 'string'
            ? entry
            : entry?.text || entry?.sentence || entry?.line || '';
        return String(text)
          .replace(/^(?:Speaker\s*[A-Z0-9]+|[A-Z][a-z]{1,15})\s*:\s*/i, '')
          .replace(/\s+/g, ' ')
          .trim();
      })
      .filter(Boolean);

    if (rawLines.length === 0) {
      throw new BadGatewayException('Dialogue generation returned no spoken lines.');
    }

    const annotations: HighlightAnnotation[] = [
      ...((payload.connectedSpeech || (payload as any).connected_speech || []) as any[])
        .map((c) => ({
          phrase: String(c?.exactPhrase || c?.phrase || c?.exact_phrase || '').trim(),
          category: 'connected' as const,
        }))
        .filter((a) => a.phrase),
      ...((payload.expressions || []) as any[])
        .map((e) => ({
          phrase: String(e?.phrase || e?.exactPhrase || '').trim(),
          category: 'expression' as const,
        }))
        .filter((a) => a.phrase),
      ...((payload.vocabulary || (payload as any).keyVocabulary || (payload as any).key_vocabulary || []) as any[])
        .map((v) => ({
          phrase: String(v?.term || v?.word || '').trim(),
          category: 'vocab' as const,
        }))
        .filter((a) => a.phrase),
    ];

    let cursor = 0;
    const sentences: SentenceItem[] = rawLines.map((text, idx) => {
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const duration = roundMs(Math.max(2.2, Math.min(7.5, wordCount / 2.5)));
      const startSec = roundMs(cursor);
      const endSec = roundMs(startSec + duration);
      cursor = endSec;
      return {
        id: `sent-${idx + 1}`,
        index: idx + 1,
        timeRange: `[${formatTimestampMs(startSec)} - ${formatTimestampMs(endSec)}]`,
        startSec,
        endSec,
        durationSec: duration,
        text,
        highlightedHtml: applyDynamicHighlights(text, annotations),
      };
    });

    const locateIndex = (phrase: string, hinted?: number): number => {
      const lower = (phrase || '').toLowerCase();
      if (hinted && sentences[hinted - 1]?.text.toLowerCase().includes(lower)) return hinted;
      const found = sentences.find((s) => s.text.toLowerCase().includes(lower));
      return found ? found.index : 1;
    };

    const aiAnalysis: AiCoachAnalysis = {
      version: 1,
      analyzedAt: new Date().toISOString(),
      aiModel: this.ai.modelName,
      overview: {
        summary: payload.summary || `Spoken American dialogue practice for "${cleanScenario}".`,
        speakerStyle: payload.speakerStyle || 'Conversational American English',
        cefrLevel: (['A2', 'B1', 'B2', 'C1', 'C2'].includes(String(payload.cefrLevel))
          ? payload.cefrLevel
          : 'B2') as AiCoachAnalysis['overview']['cefrLevel'],
        focusTips:
          Array.isArray(payload.focusTips) && payload.focusTips.length > 0
            ? payload.focusTips.slice(0, 3)
            : ['Keep unstressed function words light and connected across phrase boundaries.'],
      },
      connectedSpeech: ((payload.connectedSpeech || (payload as any).connected_speech || []) as any[])
        .filter((c) => Boolean(c?.exactPhrase || c?.phrase || c?.exact_phrase))
        .map((c) => {
          const phrase = String(c.exactPhrase || c.phrase || c.exact_phrase || '').trim();
          return {
            exactPhrase: phrase,
            spokenIpa: c.spokenIpa || c.spoken_ipa || c.ipa || '',
            phenomenon: c.phenomenon || 'Connected Speech',
            mechanics: c.mechanics || '',
            sentenceIndex: locateIndex(phrase, c.sentenceIndex || c.sentence_index),
          };
        }),
      expressions: ((payload.expressions || []) as any[])
        .filter((e) => Boolean(e?.phrase || e?.exactPhrase))
        .map((e) => {
          const phrase = String(e.phrase || e.exactPhrase || '').trim();
          return {
            phrase,
            meaning: e.meaning || '',
            register: e.register || 'Conversational',
            usageNote: e.usageNote || e.usage_note || '',
            sentenceIndex: locateIndex(phrase, e.sentenceIndex || e.sentence_index),
          };
        }),
      vocabulary: ((payload.vocabulary || (payload as any).keyVocabulary || (payload as any).key_vocabulary || []) as any[])
        .filter((v) => Boolean(v?.term || v?.word))
        .map((v) => {
          const term = String(v.term || v.word || '').trim();
          return {
            term,
            ipa: v.ipa || '',
            partOfSpeech: v.partOfSpeech || v.part_of_speech || 'word',
            definition: v.definition || '',
            sentenceIndex: locateIndex(term, v.sentenceIndex || v.sentence_index),
          };
        }),
    };

    if (aiAnalysis.connectedSpeech.length === 0 || aiAnalysis.vocabulary.length === 0) {
      const numberedLines = sentences.map((s) => `[${s.index}] ${s.text}`).join('\n');
      const fallbackJobs: Array<Promise<void>> = [];

      if (aiAnalysis.connectedSpeech.length === 0) {
        fallbackJobs.push(
          this.ai
            .chatJson<{ connectedSpeech: any[] }>(
              'You are an expert American English phonetician. Return ONLY compact JSON.',
              `Extract 4-6 connected speech items from:\n${numberedLines}\nJSON: {"connectedSpeech":[{"exactPhrase":"verbatim substring","spokenIpa":"/IPA/","phenomenon":"Flap-T & Linking","mechanics":"<=12 words","sentenceIndex":1}]}`,
              { temperature: 0.2, maxTokens: 1100, timeoutMs: 20000, json: true },
            )
            .then((secondary) => {
              const secondaryConn = secondary?.connectedSpeech || (secondary as any)?.connected_speech || [];
              if (Array.isArray(secondaryConn) && secondaryConn.length > 0) {
                aiAnalysis.connectedSpeech = secondaryConn
                  .filter((c) => Boolean(c?.exactPhrase || c?.phrase || c?.exact_phrase))
                  .map((c) => {
                    const phrase = String(c.exactPhrase || c.phrase || c.exact_phrase || '').trim();
                    return {
                      exactPhrase: phrase,
                      spokenIpa: c.spokenIpa || c.spoken_ipa || c.ipa || '',
                      phenomenon: c.phenomenon || 'Connected Speech',
                      mechanics: c.mechanics || '',
                      sentenceIndex: locateIndex(phrase, c.sentenceIndex || c.sentence_index),
                    };
                  });
              }
            })
            .catch((err: any) => {
              this.logger.warn(`Secondary connected speech fallback failed: ${err?.message}`);
            }),
        );
      }

      if (aiAnalysis.vocabulary.length === 0) {
        fallbackJobs.push(
          this.ai
            .chatJson<{ vocabulary: any[] }>(
              'You are an expert English vocabulary coach. Return ONLY compact JSON.',
              `Extract 4-6 key vocabulary words from:\n${numberedLines}\nJSON: {"vocabulary":[{"term":"verbatim word","ipa":"/IPA/","partOfSpeech":"noun/verb/adj","definition":"<=10 words","sentenceIndex":1}]}`,
              { temperature: 0.2, maxTokens: 1100, timeoutMs: 20000, json: true },
            )
            .then((secondary) => {
              if (Array.isArray(secondary?.vocabulary) && secondary.vocabulary.length > 0) {
                aiAnalysis.vocabulary = secondary.vocabulary
                  .filter((v) => Boolean(v?.term))
                  .map((v) => ({
                    term: String(v.term).trim(),
                    ipa: v.ipa || '',
                    partOfSpeech: v.partOfSpeech || 'word',
                    definition: v.definition || '',
                    sentenceIndex: locateIndex(v.term, v.sentenceIndex),
                  }));
              }
            })
            .catch((err: any) => {
              this.logger.warn(`Secondary vocabulary fallback failed: ${err?.message}`);
            }),
        );
      }

      await Promise.all(fallbackJobs);
    }

    // Refresh annotations across sentences and paragraphs so highlights reflect finalized analysis
    const allRefreshedAnnotations: HighlightAnnotation[] = [
      ...aiAnalysis.connectedSpeech.map((c) => ({ phrase: c.exactPhrase, category: 'connected' as const })),
      ...aiAnalysis.expressions.map((e) => ({ phrase: e.phrase, category: 'expression' as const })),
      ...aiAnalysis.vocabulary.map((v) => ({ phrase: v.term, category: 'vocab' as const })),
    ].filter((a) => Boolean(a.phrase));

    for (const sent of sentences) {
      sent.highlightedHtml = applyDynamicHighlights(sent.text, allRefreshedAnnotations);
    }
    const chunks = segmentParagraphs(sentences);

    const slug = (payload.title || cleanScenario)
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 64);

    const totalWords = sentences.reduce(
      (sum, s) => sum + s.text.split(/\s+/).filter(Boolean).length,
      0,
    );

    const item: HistoryItem = {
      id: uuidv4(),
      track: 'street_talk',
      trackTitle: 'Dialogue Practice',
      title: payload.title || cleanScenario,
      creator: 'Dialogue Studio',
      sourceUrl: `dialogue://${slug}-${Date.now().toString(36)}`,
      thumbnailUrl: '',
      accentDialect: aiAnalysis.overview.speakerStyle,
      durationSeconds: Math.max(15, Math.round(cursor)),
      pacingWpm: Number(payload.pacingWpm) || 160,
      difficulty: 'Intermediate',
      cefrLevel: aiAnalysis.overview.cefrLevel,
      sentencesCount: sentences.length,
      chunksCount: chunks.length,
      analysisStatus: 'ready',
      aiAnalysis,
      stats: {
        totalWords,
        sentencesCount: sentences.length,
        connectedCount: aiAnalysis.connectedSpeech.length,
        expressionsCount: aiAnalysis.expressions.length,
        vocabularyCount: aiAnalysis.vocabulary.length,
      },
      chunks,
      sentences,
      studyNotes: '',
      noteMarkdown: this.historyRepo.buildCleanMarkdown(
        payload.title || cleanScenario,
        'Dialogue Studio',
        '',
        chunks,
        aiAnalysis,
      ),
      translationEngineVersion: 4,
      timingVersion: 2,
      segmentationVersion: 2,
      createdAt: new Date().toISOString(),
      completedDrills: 0,
    };

    const saved = this.historyRepo.create(item, scope);
    this.logger.log(`Dialogue ready in ${Date.now() - startedAt}ms: ${saved.title}`);
    return saved;
  }
}

@Controller('api/tracks/street-talk')
export class StreetTalkController {
  constructor(
    private readonly streetTalkService: StreetTalkService,
    private readonly authService: AuthService,
  ) {}

  @Post('start')
  startScenario(@Body() body: { scenario: string }, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.streetTalkService.startScenario(body?.scenario, identity);
  }
}
