import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HistoryItem, HistoryRepository, RequestIdentityScope } from '../../../core/database/history.repository';
import { formatTimestampMs } from '../../../core/linguistics/segmentation';
import { AiProvidersService } from '../../ai-providers/ai-providers.service';
import { MediaTranscriptionService } from '../../american-extractor/sources/media-transcription.service';
import { ShadowingReviewService } from './shadowing.review.service';
import { ShadowingAskMessage, TranscriptSentence } from './shadowing.types';

const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': '.webm',
  'video/webm': '.webm',
  'audio/mp4': '.m4a',
  'video/mp4': '.mp4',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/mpeg': '.mp3',
};

export interface AskLessonDto {
  question: string;
  selectedText?: string;
  startMs?: number;
  endMs?: number;
  sentenceIndex?: number;
  speaker?: string;
  view?: 'reviewed' | 'raw';
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  keyId?: string;
  model?: string;
  variant?: string;
}

export interface AskLessonResponse {
  answer: string;
  userMessage: ShadowingAskMessage;
  assistantMessage: ShadowingAskMessage;
  providerName: string;
  modelUsed: string;
  variantUsed: string;
  executionTimeMs: number;
  fallbackFrom?: string;
}

function formatMsClock(ms: number): string {
  const safe = Math.max(0, Math.round(Number(ms) || 0));
  return formatTimestampMs(safe / 1000);
}

/**
 * Pure system prompt builder for the Context-Aware Native American English Companion.
 */
export function buildShadowingAskSystemPrompt(nativeLanguage = 'ar'): string {
  const langCode = String(nativeLanguage || 'ar').trim() || 'ar';
  return `You are an elite Native American English Thinking & Speaking Mentor embedded directly inside the learner's active video/audio transcript studio.

LEARNER MISSION (DO NOT ASK THEM TO EXPLAIN THIS — YOU ALREADY KNOW):
The learner is studying authentic, unscripted spoken American English to internalize how native speakers actually think in real time: how they sequence ideas, connect clauses spontaneously, use idioms/phrasal verbs/hedging/discourse markers ("like", "you know", "I mean", "kind of"), self-correct mid-sentence, handle interruptions, and choose natural phrasing over textbook English.

COMMUNICATION RULES:
1. LANGUAGE MATCHING: Answer in the exact language the learner writes or speaks in.
   - If the learner asks in Arabic (including Egyptian/colloquial Arabic or mixed Arabic + English), explain naturally and clearly in Arabic while keeping all English examples, alternatives, spoken reductions, and IPA in Latin script.
   - If the learner asks in English, respond in crisp, natural English.
   - Learner's default native language code for reference: "${langCode}".
2. ZERO FLUFF, ZERO ROBOTIC INTROS: Start directly with the substance. Never say "Great question!" or restate what they asked. Keep answers sharp, scannable (short paragraphs and tight bullet points when comparing alternatives), and deeply practical.
3. FULL CONTEXT INTELLIGENCE: You have the exact quote they highlighted (with timestamps & speaker), the surrounding sentences (±5 lines), the overall video outline/transcript, and their prior questions.
   - Explain *why* the speaker phrased it that way in that exact moment (tone, spontaneity, thought transition, emotion, register).
   - If the highlighted line is a genuine self-correction, false start, or speaker interruption/overlap, point that out immediately so the learner understands the natural spoken mechanic without mistaking a cut-off fragment for standard grammar.
   - When relevant (or when asked for alternatives), offer 2-4 natural spoken American alternatives ranging from casual everyday speech to sharper/clearer phrasing, showing subtle nuance differences.
   - Also happily answer general English or topic questions without forcing artificial ties to the quote if the learner asks something broad.`;
}

function pickCanonicalSentencesForView(
  lesson: HistoryItem,
  view: 'reviewed' | 'raw',
): Array<{
  index: number;
  text: string;
  speaker?: string;
  startMs: number;
  endMs: number;
  isOverlap?: boolean;
  isInterrupted?: boolean;
  repairNote?: string;
}> {
  const td = lesson.transcriptData;
  if (view === 'raw') {
    const rawCanon = td?.raw?.canonicalSentences;
    if (Array.isArray(rawCanon) && rawCanon.length > 0) return rawCanon;
    const rawSents = td?.raw?.sentences;
    if (Array.isArray(rawSents) && rawSents.length > 0) return rawSents;
  } else {
    const revCanon = td?.reviewed?.canonicalSentences;
    if (Array.isArray(revCanon) && revCanon.length > 0) return revCanon;
    const revSents = td?.reviewed?.sentences;
    if (Array.isArray(revSents) && revSents.length > 0) return revSents;
    const rawCanon = td?.raw?.canonicalSentences;
    if (Array.isArray(rawCanon) && rawCanon.length > 0) return rawCanon;
  }

  return (lesson.sentences || []).map((s) => ({
    index: Number(s.index) || 1,
    text: s.text,
    speaker: s.speaker,
    startMs: Number.isFinite(s.startMs) ? Number(s.startMs) : Math.round((Number(s.startSec) || 0) * 1000),
    endMs: Number.isFinite(s.endMs) ? Number(s.endMs) : Math.round((Number(s.endSec) || 0) * 1000),
    isOverlap: s.isOverlap,
    isInterrupted: (s as TranscriptSentence).isInterrupted,
    repairNote: s.repairNote,
  }));
}

/**
 * Pure context assembly helper for unit-testable prompt grounding.
 */
export function buildShadowingAskContextBundle(
  lesson: HistoryItem,
  params: AskLessonDto,
): {
  view: 'reviewed' | 'raw';
  anchorIndex: number;
  userPrompt: string;
} {
  const view: 'reviewed' | 'raw' = params.view === 'raw' ? 'raw' : 'reviewed';
  const sentences = pickCanonicalSentencesForView(lesson, view);

  let anchorIdxPos = -1;
  const targetSentIdx = Number(params.sentenceIndex);
  const targetStartMs = Number(params.startMs);

  if (Number.isFinite(targetSentIdx) && targetSentIdx > 0) {
    anchorIdxPos = sentences.findIndex((s) => Number(s.index) === targetSentIdx);
  }
  if (anchorIdxPos === -1 && Number.isFinite(targetStartMs) && targetStartMs >= 0) {
    let bestDist = Infinity;
    sentences.forEach((s, idx) => {
      if (targetStartMs >= s.startMs - 80 && targetStartMs <= s.endMs + 80) {
        anchorIdxPos = idx;
        bestDist = 0;
        return;
      }
      const dist = Math.min(Math.abs(targetStartMs - s.startMs), Math.abs(targetStartMs - s.endMs));
      if (dist < bestDist) {
        bestDist = dist;
        anchorIdxPos = idx;
      }
    });
  }
  if (anchorIdxPos === -1 && params.selectedText) {
    const needle = params.selectedText.trim().toLowerCase().slice(0, 60);
    if (needle) {
      anchorIdxPos = sentences.findIndex((s) => s.text.toLowerCase().includes(needle));
    }
  }

  const anchorSentence = anchorIdxPos >= 0 ? sentences[anchorIdxPos] : null;
  const anchorIndex = anchorSentence?.index || (Number.isFinite(targetSentIdx) && targetSentIdx > 0 ? targetSentIdx : 1);

  const metaLines: string[] = [
    `Title: ${lesson.title || 'Untitled Lesson'}`,
    `Creator / Channel: ${lesson.creator || 'Unknown'}`,
    `Platform: ${lesson.platform || lesson.transcriptData?.platform || 'Video'}`,
    `View Mode: ${view === 'raw' ? 'Original Raw Provider Transcript' : 'AI Cleaned Verbatim Transcript'}`,
  ];
  if (lesson.pacingWpm) metaLines.push(`Speaking Pace: ~${lesson.pacingWpm} WPM`);
  if (lesson.cefrLevel || lesson.aiAnalysis?.overview?.cefrLevel) {
    metaLines.push(`CEFR Level: ${lesson.cefrLevel || lesson.aiAnalysis?.overview?.cefrLevel}`);
  }
  if (lesson.aiAnalysis?.overview?.speakerStyle) {
    metaLines.push(`Speaker Style: ${lesson.aiAnalysis.overview.speakerStyle}`);
  }
  if (lesson.aiAnalysis?.overview?.summary) {
    metaLines.push(`Lesson Summary: ${lesson.aiAnalysis.overview.summary}`);
  }

  const parts: string[] = [`<lesson_metadata>\n${metaLines.join('\n')}\n</lesson_metadata>`];

  const ideas = lesson.transcriptData?.reviewed?.ideas;
  if (Array.isArray(ideas) && ideas.length > 0) {
    const ideasBlock = ideas
      .slice(0, 18)
      .map((id) => `${id.index}. ${id.title} [${formatMsClock(id.startMs)}–${formatMsClock(id.endMs)}]: ${id.summary || ''}`)
      .join('\n');
    parts.push(`<video_ideas_arc>\n${ideasBlock}\n</video_ideas_arc>`);
  }

  if (params.selectedText && params.selectedText.trim()) {
    const timeLabel =
      Number.isFinite(params.startMs) && Number.isFinite(params.endMs)
        ? `[${formatMsClock(Number(params.startMs))} – ${formatMsClock(Number(params.endMs))}]`
        : anchorSentence
          ? `[${formatMsClock(anchorSentence.startMs)} – ${formatMsClock(anchorSentence.endMs)}]`
          : '';
    const spk = params.speaker || anchorSentence?.speaker || '';
    const flags: string[] = [];
    if (anchorSentence?.isInterrupted) flags.push('speaker_interrupted_cut_off');
    if (anchorSentence?.isOverlap) flags.push('overlapping_crosstalk');
    if (anchorSentence?.repairNote) flags.push(`asr_note: ${anchorSentence.repairNote}`);

    parts.push(
      `<selected_excerpt>\n${spk ? `Speaker: ${spk}\n` : ''}${timeLabel ? `Timestamp: ${timeLabel}\n` : ''}${flags.length ? `Flags: ${flags.join(' | ')}\n` : ''}Quote: "${params.selectedText.trim()}"\n</selected_excerpt>`,
    );
  }

  if (sentences.length > 0) {
    const center = anchorIdxPos >= 0 ? anchorIdxPos : 0;
    const winStart = Math.max(0, center - 5);
    const winEnd = Math.min(sentences.length, center + 6);
    const windowLines = sentences.slice(winStart, winEnd).map((s, offset) => {
      const realPos = winStart + offset;
      const prefix = realPos === anchorIdxPos ? '>>> ' : '    ';
      const spk = s.speaker ? `${s.speaker}: ` : '';
      const tag = s.isInterrupted ? ' [cut off]' : s.isOverlap ? ' [overlap]' : '';
      return `${prefix}#${s.index} [${formatMsClock(s.startMs)}] ${spk}${s.text}${tag}`;
    });
    parts.push(`<surrounding_context>\n${windowLines.join('\n')}\n</surrounding_context>`);

    // Bounded broader transcript window (~5,500 chars centered on selection)
    const fullLines: string[] = [];
    let charCount = 0;
    const maxChars = 5500;
    let lo = center;
    let hi = center;
    const addLine = (idx: number, pushBack: boolean): boolean => {
      const s = sentences[idx];
      if (!s) return false;
      const spk = s.speaker ? `${s.speaker}: ` : '';
      const line = `[${formatMsClock(s.startMs)}] ${spk}${s.text}`;
      if (charCount + line.length + 1 > maxChars) return false;
      charCount += line.length + 1;
      if (pushBack) fullLines.push(line);
      else fullLines.unshift(line);
      return true;
    };
    addLine(center, true);
    let canLeft = lo > 0;
    let canRight = hi + 1 < sentences.length;
    while (canLeft || canRight) {
      if (canRight) {
        hi += 1;
        canRight = hi < sentences.length && addLine(hi, true);
      }
      if (canLeft) {
        lo -= 1;
        canLeft = lo >= 0 && addLine(lo, false);
      }
    }
    if (fullLines.length > 0) {
      parts.push(`<transcript_window>\n${fullLines.join('\n')}\n</transcript_window>`);
    }
  }

  const history = Array.isArray(params.history) && params.history.length > 0
    ? params.history
    : (lesson.transcriptData?.askHistory || []);
  const recentHistory = history.slice(-10);
  if (recentHistory.length > 0) {
    const histBlock = recentHistory
      .map((m) => {
        const sel = 'selectedText' in m && m.selectedText ? String(m.selectedText) : '';
        const q = m.role === 'user' && sel ? `[About "${sel.slice(0, 80)}"] ` : '';
        return `${m.role === 'user' ? 'Learner' : 'Mentor'}: ${q}${String(m.content || '').trim()}`;
      })
      .join('\n');
    parts.push(`<conversation_history>\n${histBlock}\n</conversation_history>`);
  }

  parts.push(`<learner_question>\n${params.question.trim()}\n</learner_question>`);

  return {
    view,
    anchorIndex,
    userPrompt: parts.join('\n\n'),
  };
}

@Injectable()
export class ShadowingAskService {
  private readonly logger = new Logger(ShadowingAskService.name);

  constructor(
    private readonly historyRepo: HistoryRepository,
    private readonly aiProviders: AiProvidersService,
    private readonly reviewService: ShadowingReviewService,
    private readonly mediaTranscription: MediaTranscriptionService,
  ) {}

  async askLesson(
    lessonId: string,
    dto: AskLessonDto,
    scope?: RequestIdentityScope & { user?: { nativeLanguage?: string } },
    hooks?: {
      signal?: AbortSignal;
      onDelta?: (delta: string, accumulated: string) => void;
    },
  ): Promise<AskLessonResponse> {
    const question = String(dto?.question || '').trim();
    if (!question) {
      throw new BadRequestException('Please type or speak a question first.');
    }
    if (question.length > 2500) {
      throw new BadRequestException('Question is too long (max 2500 characters).');
    }

    const userId = scope?.userId || null;
    if (!this.aiProviders.hasAnyConfiguredKey(userId)) {
      throw new BadRequestException(
        'No AI provider key is configured. Add an API key in AI Models to ask questions.',
      );
    }

    const lesson = this.historyRepo.findById(lessonId, scope);
    if (!lesson) {
      throw new NotFoundException(`Lesson "${lessonId}" not found.`);
    }

    const nativeLanguage = scope?.user?.nativeLanguage || 'ar';
    const systemPrompt = buildShadowingAskSystemPrompt(nativeLanguage);
    const { userPrompt } = buildShadowingAskContextBundle(lesson, {
      ...dto,
      question,
    });

    const startedAt = Date.now();
    const response = await this.aiProviders.executeChat(userId, {
      keyId: dto.keyId,
      model: dto.model,
      variant: dto.variant || 'none',
      systemPrompt,
      userPrompt,
      temperature: 0.4,
      maxTokens: 2048,
      json: false,
      timeoutMs: 65000,
      signal: hooks?.signal,
      allowIntraKeyFailover: true,
      onContentDelta: hooks?.onDelta,
    });

    const answer = String(response.content || '').trim();
    if (!answer) {
      throw new Error('The AI model returned an empty answer.');
    }

    const now = new Date().toISOString();
    const userMessage: ShadowingAskMessage = {
      id: `ask_u_${randomUUID().slice(0, 12)}`,
      role: 'user',
      content: question,
      ...(dto.selectedText?.trim() ? { selectedText: dto.selectedText.trim().slice(0, 400) } : {}),
      ...(Number.isFinite(Number(dto.startMs)) ? { startMs: Math.max(0, Math.round(Number(dto.startMs))) } : {}),
      ...(Number.isFinite(Number(dto.endMs)) ? { endMs: Math.max(0, Math.round(Number(dto.endMs))) } : {}),
      ...(dto.speaker?.trim() ? { speaker: dto.speaker.trim().slice(0, 64) } : {}),
      createdAt: now,
    };
    const assistantMessage: ShadowingAskMessage = {
      id: `ask_a_${randomUUID().slice(0, 12)}`,
      role: 'assistant',
      content: answer,
      modelName: response.modelUsed || response.providerName || '',
      createdAt: new Date().toISOString(),
    };

    const latest = this.historyRepo.findById(lesson.id, scope) || lesson;
    const td = this.reviewService.ensureTranscriptData(latest);
    const existingHistory = Array.isArray(td.askHistory) ? td.askHistory : [];
    td.askHistory = [...existingHistory, userMessage, assistantMessage].slice(-40);
    this.historyRepo.update(lesson.id, { transcriptData: td }, scope);

    const executionTimeMs = response.executionTimeMs || Date.now() - startedAt;
    this.logger.log(
      `Shadowing Ask answered for ${lesson.id} in ${executionTimeMs}ms (${response.modelUsed})`,
    );

    return {
      answer,
      userMessage,
      assistantMessage,
      providerName: response.providerName,
      modelUsed: response.modelUsed,
      variantUsed: response.variantUsed,
      executionTimeMs,
      fallbackFrom: response.fallbackFrom,
    };
  }

  clearHistory(lessonId: string, scope?: RequestIdentityScope): { success: boolean } {
    const lesson = this.historyRepo.findById(lessonId, scope);
    if (!lesson) {
      throw new NotFoundException(`Lesson "${lessonId}" not found.`);
    }
    const td = this.reviewService.ensureTranscriptData(lesson);
    td.askHistory = [];
    this.historyRepo.update(lesson.id, { transcriptData: td }, scope);
    return { success: true };
  }

  async transcribeQuestionAudio(
    file: { buffer: Buffer; mimetype?: string; originalname?: string },
    scope?: RequestIdentityScope,
  ): Promise<{ text: string; engine: string }> {
    if (!file || !file.buffer || file.buffer.length < 512) {
      throw new BadRequestException('Audio recording is empty.');
    }

    const mime = String(file.mimetype || '').split(';')[0].trim().toLowerCase();
    const ext =
      EXT_BY_MIME[mime] ||
      path.extname(file.originalname || '').toLowerCase() ||
      '.webm';

    const tmpPath = path.join(os.tmpdir(), `flaptap-ask-${randomUUID()}${ext}`);
    try {
      fs.writeFileSync(tmpPath, file.buffer);
      const cloudStt = this.aiProviders.resolvePreferredCloudSttKey(scope?.userId);
      const result = await this.mediaTranscription.transcribeFile(tmpPath, {
        force: true,
        skipCache: true,
        wordTimestamps: false,
        cloudStt,
        allowLocalWhisper: true,
      });
      return {
        text: String(result.text || '').trim(),
        engine: result.engine || 'faster_whisper',
      };
    } finally {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        // Ignore cleanup failure
      }
    }
  }
}
