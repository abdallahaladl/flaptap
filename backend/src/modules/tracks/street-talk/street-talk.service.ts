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
      'Author a natural, realistic spoken American English dialogue for the requested real-life scenario.',
      'Every top-level field in the requested JSON schema (title, speakerStyle, cefrLevel, pacingWpm, summary, focusTips, sentences, connectedSpeech, expressions, vocabulary) is MANDATORY and must be populated with non-empty arrays.',
      'Return ONLY a single valid JSON object with no markdown fences and no commentary.',
    ].join('\n');

    const userPrompt = [
      `Create an interactive spoken American English dialogue lesson for: "${cleanScenario}"`,
      '',
      'Return strictly this JSON schema (all keys required):',
      '{',
      '  "title": "Clean editorial title (3-6 words, no emojis)",',
      '  "speakerStyle": "Short cadence description, e.g. Natural Workplace Conversational",',
      '  "cefrLevel": "B2",',
      '  "pacingWpm": 165,',
      '  "summary": "2 concise sentences explaining the situation and communicative goal.",',
      '  "focusTips": ["Actionable delivery tip 1", "Actionable rhythm/linking tip 2"],',
      '  "sentences": [',
      '    "Complete natural spoken English sentence 1 without speaker labels or quotes.",',
      '    "Complete natural spoken English sentence 2 without speaker labels or quotes."',
      '  ],',
      '  "connectedSpeech": [',
      '    { "exactPhrase": "exact 2-4 word substring from sentences", "spokenIpa": "/IPA/", "phenomenon": "Flap-T / Linking / Schwa Reduction", "mechanics": "mouth & tongue placement", "sentenceIndex": 1 }',
      '  ],',
      '  "expressions": [',
      '    { "phrase": "exact idiom, phrasal verb, or expression from sentences", "meaning": "plain meaning", "register": "Conversational", "usageNote": "when and how Americans use it", "sentenceIndex": 1 }',
      '  ],',
      '  "vocabulary": [',
      '    { "term": "exact word/term from sentences", "ipa": "/IPA/", "partOfSpeech": "verb", "definition": "contextual meaning", "sentenceIndex": 1 }',
      '  ]',
      '}',
      '',
      'Rules:',
      '1. Author 6 to 8 complete spoken sentences (each 7 to 18 words). Every sentence must end with proper punctuation (. ? !).',
      '2. Every exactPhrase, phrase, and term MUST appear verbatim inside the referenced sentenceIndex (1-based).',
      '3. MUST include 4-6 items in connectedSpeech, 4-6 items in expressions, and 4-6 items in vocabulary (never omit any of these three arrays).',
      '4. Never include emojis, stage directions, or speaker prefixes like "Speaker A:".',
    ].join('\n');

    const startedAt = Date.now();
    const payload = await this.ai.chatJson<DialoguePayload>(systemPrompt, userPrompt, {
      temperature: 0.55,
      maxTokens: 3500,
      timeoutMs: 45000,
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
      ...(payload.connectedSpeech || []).map((c) => ({
        phrase: c.exactPhrase,
        category: 'connected' as const,
      })),
      ...(payload.expressions || []).map((e) => ({
        phrase: e.phrase,
        category: 'expression' as const,
      })),
      ...(payload.vocabulary || []).map((v) => ({
        phrase: v.term,
        category: 'vocab' as const,
      })),
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

    const chunks = segmentParagraphs(sentences);
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
      connectedSpeech: (payload.connectedSpeech || [])
        .filter((c) => c?.exactPhrase)
        .map((c) => ({
          exactPhrase: c.exactPhrase,
          spokenIpa: c.spokenIpa || '',
          phenomenon: c.phenomenon || 'Connected Speech',
          mechanics: c.mechanics || '',
          sentenceIndex: locateIndex(c.exactPhrase, c.sentenceIndex),
        })),
      expressions: (payload.expressions || [])
        .filter((e) => e?.phrase)
        .map((e) => ({
          phrase: e.phrase,
          meaning: e.meaning || '',
          register: e.register || 'Conversational',
          usageNote: e.usageNote || '',
          sentenceIndex: locateIndex(e.phrase, e.sentenceIndex),
        })),
      vocabulary: (payload.vocabulary || [])
        .filter((v) => v?.term)
        .map((v) => ({
          term: v.term,
          ipa: v.ipa || '',
          partOfSpeech: v.partOfSpeech || 'word',
          definition: v.definition || '',
          sentenceIndex: locateIndex(v.term, v.sentenceIndex),
        })),
    };

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
