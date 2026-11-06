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

interface PhoneticsWorkoutPayload {
  title: string;
  accentProfile?: string;
  cefrLevel?: 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  pacingWpm?: number;
  summary?: string;
  focusTips?: string[];
  sentences?: Array<string | { text?: string; sentence?: string; line?: string }>;
  lines?: Array<string | { text?: string; sentence?: string; line?: string }>;
  drills?: Array<string | { text?: string; sentence?: string; line?: string }>;
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
export class PhoneticsService {
  private readonly logger = new Logger(PhoneticsService.name);

  constructor(
    private readonly historyRepo: HistoryRepository,
    private readonly ai: AiClient,
  ) {}

  async createDrill(
    topic: string,
    scope?: RequestIdentityScope,
  ): Promise<HistoryItem> {
    const cleanTopic = (topic || '').trim();
    if (!cleanTopic) {
      throw new BadRequestException('Please enter a pronunciation or prosody target.');
    }

    const systemPrompt = [
      'You are a master phonetician and American English pronunciation coach.',
      'Design a physically actionable spoken articulatory workout (IPA, tongue placement, jaw height, voicing, airflow, linking).',
      'Every top-level field in the requested JSON schema (title, accentProfile, cefrLevel, pacingWpm, summary, focusTips, sentences, connectedSpeech, expressions, vocabulary) is MANDATORY and must be populated with non-empty arrays.',
      'Return ONLY a single valid JSON object with no markdown fences and no commentary.',
    ].join('\n');

    const userPrompt = [
      `Create an American English pronunciation workout targeting: "${cleanTopic}"`,
      '',
      'Return strictly this JSON schema (all keys required):',
      '{',
      '  "title": "Clean editorial workout title (3-6 words, no emojis)",',
      '  "accentProfile": "Articulatory focus label, e.g. Alveolar Flap-T & Rhotic Linking",',
      '  "cefrLevel": "C1",',
      '  "pacingWpm": 130,',
      '  "summary": "2 concise sentences explaining the physical mouth mechanics trained in this workout.",',
      '  "focusTips": ["Physical tongue/jaw tip 1", "Airflow/rhythm tip 2"],',
      '  "sentences": [',
      '    "Complete natural spoken drill sentence 1 rich in the target sound.",',
      '    "Complete natural spoken drill sentence 2 rich in the target sound."',
      '  ],',
      '  "connectedSpeech": [',
      '    { "exactPhrase": "exact target phrase from sentence", "spokenIpa": "/General American IPA/", "phenomenon": "specific articulatory mechanism", "mechanics": "exact tongue, jaw, and vocal fold instruction", "sentenceIndex": 1 }',
      '  ],',
      '  "expressions": [',
      '    { "phrase": "exact natural phrase from sentences", "meaning": "meaning in context", "register": "Conversational", "usageNote": "prosody and stress pattern", "sentenceIndex": 1 }',
      '  ],',
      '  "vocabulary": [',
      '    { "term": "exact target word from sentences", "ipa": "/IPA/", "partOfSpeech": "word class", "definition": "meaning & phonetic value", "sentenceIndex": 1 }',
      '  ]',
      '}',
      '',
      'Rules:',
      '1. Write 5 to 7 complete, natural spoken English drill sentences (each 7 to 16 words) ending with proper punctuation.',
      '2. Every exactPhrase, phrase, and term MUST appear verbatim inside the referenced sentenceIndex (1-based).',
      '3. MUST include 4-6 items in connectedSpeech, 3-5 items in expressions, and 4-6 items in vocabulary (never omit any of these three arrays).',
      '4. Never include emojis or markdown.',
    ].join('\n');

    const startedAt = Date.now();
    const payload = await this.ai.chatJson<PhoneticsWorkoutPayload>(systemPrompt, userPrompt, {
      temperature: 0.45,
      maxTokens: 3500,
      timeoutMs: 45000,
      json: true,
    });

    const candidateLines = Array.isArray(payload?.sentences)
      ? payload.sentences
      : Array.isArray(payload?.lines)
        ? payload.lines
        : Array.isArray(payload?.drills)
          ? payload.drills
          : [];

    const rawLines = candidateLines
      .map((entry) => {
        const text =
          typeof entry === 'string'
            ? entry
            : entry?.text || entry?.sentence || entry?.line || '';
        return String(text).replace(/\s+/g, ' ').trim();
      })
      .filter(Boolean);

    if (rawLines.length === 0) {
      throw new BadGatewayException('Pronunciation workout generation returned no drill lines.');
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
      const duration = roundMs(Math.max(2.4, Math.min(7.5, wordCount / 2.2)));
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
        summary: payload.summary || `Articulatory pronunciation workout targeting "${cleanTopic}".`,
        speakerStyle: payload.accentProfile || 'General American Phonetics',
        cefrLevel: (['A2', 'B1', 'B2', 'C1', 'C2'].includes(String(payload.cefrLevel))
          ? payload.cefrLevel
          : 'C1') as AiCoachAnalysis['overview']['cefrLevel'],
        focusTips:
          Array.isArray(payload.focusTips) && payload.focusTips.length > 0
            ? payload.focusTips.slice(0, 3)
            : ['Keep jaw tension low and let unstressed syllables reduce cleanly toward schwa /ə/.'],
      },
      connectedSpeech: ((payload.connectedSpeech || (payload as any).connected_speech || []) as any[])
        .filter((c) => Boolean(c?.exactPhrase || c?.phrase || c?.exact_phrase))
        .map((c) => {
          const phrase = String(c.exactPhrase || c.phrase || c.exact_phrase || '').trim();
          return {
            exactPhrase: phrase,
            spokenIpa: c.spokenIpa || c.spoken_ipa || c.ipa || '',
            phenomenon: c.phenomenon || 'Articulatory Mechanics',
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
            register: e.register || 'Spoken Drill',
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
            partOfSpeech: v.partOfSpeech || v.part_of_speech || 'target',
            definition: v.definition || '',
            sentenceIndex: locateIndex(term, v.sentenceIndex || v.sentence_index),
          };
        }),
    };

    const slug = (payload.title || cleanTopic)
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
      track: 'phonetics',
      trackTitle: 'Pronunciation Workout',
      title: payload.title || cleanTopic,
      creator: 'Pronunciation Lab',
      sourceUrl: `pronunciation://${slug}-${Date.now().toString(36)}`,
      thumbnailUrl: '',
      accentDialect: aiAnalysis.overview.speakerStyle,
      durationSeconds: Math.max(15, Math.round(cursor)),
      pacingWpm: Number(payload.pacingWpm) || 130,
      difficulty: 'Advanced',
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
        payload.title || cleanTopic,
        'Pronunciation Lab',
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
    this.logger.log(`Pronunciation workout ready in ${Date.now() - startedAt}ms: ${saved.title}`);
    return saved;
  }
}

@Controller('api/tracks/phonetics')
export class PhoneticsController {
  constructor(
    private readonly phoneticsService: PhoneticsService,
    private readonly authService: AuthService,
  ) {}

  @Post('drill')
  createDrill(@Body() body: { topic: string }, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.phoneticsService.createDrill(body?.topic, identity);
  }
}
