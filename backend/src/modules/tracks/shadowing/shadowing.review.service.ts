import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ChunkItem,
  HistoryItem,
  HistoryRepository,
  RequestIdentityScope,
  SentenceItem,
} from '../../../core/database/history.repository';
import {
  applyDynamicHighlights,
  escapeTranscriptHtml,
  HighlightAnnotation,
} from '../../../core/linguistics/highlights';
import {
  formatTimestampMs,
  normalizePacingMode,
} from '../../../core/linguistics/segmentation';
import { AiProvidersService } from '../../ai-providers/ai-providers.service';
import {
  ReviewedTranscriptSnapshot,
  ReviewProgressEvent,
  TranscriptSentence,
} from './shadowing.types';
import {
  buildReviewChunks,
  buildTranscriptReviewSystemPrompt,
  buildTranscriptReviewUserPrompt,
  parseTranscriptReviewResponse,
} from './shadowing-review.prompt';
import {
  captureCompletedCoverage,
  remapCompletedIndices,
  restoreExactTranslations,
  snapshotTranslationsByText,
} from './utils/pacing-regroup.util';
import {
  applySpeakerOverridesToReviewed,
  assembleAlignedReviewedViews,
  buildRawTranscriptSnapshot,
  coalesceToCanonicalSentences,
  DraftReviewedIdea,
  DraftReviewedSentence,
} from './utils/word-alignment.util';

export interface ReviewLessonOptions {
  keyId?: string;
  model?: string;
  variant?: string;
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (event: ReviewProgressEvent) => void;
}

@Injectable()
export class ShadowingReviewService {
  private readonly logger = new Logger(ShadowingReviewService.name);

  constructor(
    private readonly historyRepo: HistoryRepository,
    private readonly aiProviders: AiProvidersService,
  ) {}

  /**
   * Ensures a lesson has an untouched `transcriptData.raw` baseline snapshot
   * even for legacy lessons created before millisecond transcript snapshots existed.
   */
  public ensureTranscriptData(lesson: HistoryItem): NonNullable<HistoryItem['transcriptData']> {
    if (lesson.transcriptData?.raw?.sentences?.length) {
      return lesson.transcriptData;
    }

    const sentences = Array.isArray(lesson.sentences) ? lesson.sentences : [];
    const cues = sentences.map((s) => ({
      start: s.timeRange?.split(' - ')[0] || '00:00',
      end: s.timeRange?.split(' - ')[1] || '00:00',
      start_sec: Number(s.startSec) || 0,
      end_sec: Number(s.endSec) || (Number(s.startSec) || 0) + 1,
      text: s.text,
    }));
    const timedWords = sentences.flatMap((s) =>
      Array.isArray(s.words)
        ? s.words.map((w) => ({
            word: w.word,
            clean: w.clean,
            start_sec: w.startMs / 1000,
            end_sec: w.endMs / 1000,
          }))
        : [],
    );

    const pacingMode = normalizePacingMode(lesson.pacingMode || lesson.transcriptData?.pacingMode);
    const raw = buildRawTranscriptSnapshot({
      provider: lesson.transcriptData?.providerEngine || (lesson.videoId ? 'youtube_captions' : 'lesson_text'),
      title: lesson.title || 'Lesson',
      creator: lesson.creator || 'Speaker 1',
      url: lesson.sourceUrl || '',
      mediaId: lesson.videoId || lesson.media?.mediaId || '',
      durationSeconds: lesson.durationSeconds || 0,
      fullText: sentences.map((s) => s.text).join(' '),
      cues,
      timedWords: timedWords.length > 0 ? timedWords : undefined,
      pacingMode,
    });

    const data: NonNullable<HistoryItem['transcriptData']> = {
      sourceId: lesson.transcriptData?.sourceId,
      sourceKey: lesson.transcriptData?.sourceKey,
      sourceType: lesson.transcriptData?.sourceType || (lesson.videoId ? 'youtube' : 'text'),
      platform: lesson.platform || lesson.transcriptData?.platform || (lesson.videoId ? 'YouTube' : 'Studio'),
      providerEngine: lesson.transcriptData?.providerEngine || raw.provider,
      pacingMode,
      raw,
      reviewed: lesson.transcriptData?.reviewed || null,
      reviewStatus: lesson.transcriptData?.reviewStatus || 'pending',
      reviewError: lesson.transcriptData?.reviewError || '',
      speakerOverrides: lesson.transcriptData?.speakerOverrides || {},
    };
    lesson.transcriptData = data;
    return data;
  }

  /**
   * Stage 2: Faithful Verbatim-First AI Review, Multi-Speaker Diarization,
   * Overlap Resolution, Idea Structuring, and Wagner-Fischer Millisecond Alignment.
   */
  async reviewLesson(
    lessonId: string,
    options: ReviewLessonOptions = {},
    scope?: RequestIdentityScope,
  ): Promise<HistoryItem> {
    const userId = scope?.userId || null;
    const lesson = this.historyRepo.findById(lessonId, scope);
    if (!lesson) {
      throw new NotFoundException(`Lesson "${lessonId}" not found.`);
    }

    const td = this.ensureTranscriptData(lesson);

    if (td.reviewed && td.reviewStatus === 'ready' && !options.force) {
      options.onProgress?.({
        stage: 'complete',
        percent: 100,
        message: 'Loaded cached AI-reviewed transcript.',
      });
      return lesson;
    }

    if (!this.aiProviders.hasAnyConfiguredKey(userId)) {
      throw new BadRequestException(
        'No AI provider key is configured. Add an API key in AI Models to run AI transcript review.',
      );
    }

    // Always send complete canonical sentences to AI Review (never fragmented pacing slices with fake periods)
    const canonicalForReview =
      Array.isArray(td.raw.canonicalSentences) && td.raw.canonicalSentences.length > 0
        ? td.raw.canonicalSentences
        : coalesceToCanonicalSentences(td.raw.sentences, td.raw.words);
    td.raw.canonicalSentences = canonicalForReview;
    const chunks = buildReviewChunks(canonicalForReview, 1100);
    if (chunks.length === 0) {
      throw new BadRequestException('This lesson has no sentences to review.');
    }

    const startedAt = Date.now();
    td.reviewStatus = 'processing';
    td.reviewError = '';
    this.historyRepo.update(lesson.id, { transcriptData: td }, scope);

    options.onProgress?.({
      stage: 'preparing',
      percent: 8,
      message: `Preparing ${chunks.length} section${chunks.length === 1 ? '' : 's'} for verbatim review…`,
      totalChunks: chunks.length,
    });

    const systemPrompt = buildTranscriptReviewSystemPrompt();
    const allSentences: DraftReviewedSentence[] = [];
    const allIdeas: DraftReviewedIdea[] = [];
    const knownSpeakers = new Set<string>();
    let previousTail = '';
    let providerName = '';
    let modelName = '';
    let reasoningLevel = options.variant || 'none';
    let fallbackFrom = '';
    let paragraphOffset = 0;
    let ideaOffset = 0;

    try {
      for (let idx = 0; idx < chunks.length; idx++) {
        if (options.signal?.aborted) {
          throw new Error('Review cancelled.');
        }

        const chunk = chunks[idx];
        const pctStart = 12 + Math.round((idx / chunks.length) * 68);
        options.onProgress?.({
          stage: 'chunk',
          percent: pctStart,
          chunkIndex: chunk.chunkIndex,
          totalChunks: chunk.totalChunks,
          message:
            chunks.length === 1
              ? 'Reviewing wording, punctuation, speakers & ideas…'
              : `Reviewing section ${chunk.chunkIndex} of ${chunk.totalChunks}…`,
        });

        const userPrompt = buildTranscriptReviewUserPrompt({
          title: lesson.title,
          creator: lesson.creator,
          platform: td.platform || lesson.platform || 'Media',
          chunk,
          knownSpeakers: Array.from(knownSpeakers),
          previousTail,
        });

        const response = await this.aiProviders.executeChat(userId, {
          keyId: options.keyId,
          model: options.model,
          variant: options.variant || 'none',
          systemPrompt,
          userPrompt,
          temperature: 0.1,
          maxTokens: 12000,
          json: true,
          timeoutMs: 90000,
          signal: options.signal,
          allowIntraKeyFailover: true,
        });

        providerName = response.providerName || providerName;
        modelName = response.modelUsed || modelName;
        reasoningLevel = response.variantUsed || reasoningLevel;
        if (response.fallbackFrom) fallbackFrom = response.fallbackFrom;

        const parsed = parseTranscriptReviewResponse(response.content);

        let maxParaInChunk = 0;
        let maxIdeaInChunk = 0;
        const sentStartOffset = allSentences.length;

        parsed.sentences.forEach((s) => {
          if (s.speaker) knownSpeakers.add(s.speaker);
          const pIdx = s.paragraphIndex && s.paragraphIndex > 0 ? s.paragraphIndex : 1;
          const iIdx = s.ideaIndex && s.ideaIndex > 0 ? s.ideaIndex : 1;
          if (pIdx > maxParaInChunk) maxParaInChunk = pIdx;
          if (iIdx > maxIdeaInChunk) maxIdeaInChunk = iIdx;

          allSentences.push({
            ...s,
            paragraphIndex: paragraphOffset + pIdx,
            ideaIndex: ideaOffset + iIdx,
          });
        });

        parsed.ideas.forEach((idea, i) => {
          const localIdx = idea.index && idea.index > 0 ? idea.index : i + 1;
          if (localIdx > maxIdeaInChunk) maxIdeaInChunk = localIdx;
          allIdeas.push({
            ...idea,
            index: ideaOffset + localIdx,
            sentenceIndices: idea.sentenceIndices?.map((n) => sentStartOffset + n),
          });
        });

        paragraphOffset += Math.max(1, maxParaInChunk);
        ideaOffset += Math.max(1, maxIdeaInChunk);

        const tailSlice = parsed.sentences.slice(-2);
        previousTail = tailSlice.map((s) => `${s.speaker || 'Speaker'}: ${s.text}`).join('\n');
      }

      options.onProgress?.({
        stage: 'aligning',
        percent: 86,
        message: 'Aligning every reviewed word to exact millisecond audio timestamps…',
      });

      const pacingMode = normalizePacingMode(lesson.pacingMode || td.pacingMode);
      const assembled = assembleAlignedReviewedViews({
        rawWords: td.raw.words,
        draftSentences: allSentences,
        draftIdeas: allIdeas,
        defaultSpeaker: lesson.creator || 'Speaker 1',
        speakerOverrides: td.speakerOverrides,
        pacingMode,
      });

      const ratio = assembled.quality.totalWords / Math.max(1, td.raw.words.length);
      if (ratio < 0.45 && td.raw.words.length >= 30) {
        throw new Error(
          'AI review omitted too much of the original transcript. Try re-running with another model.',
        );
      }

      const reviewedSnapshot: ReviewedTranscriptSnapshot = {
        ...assembled,
        providerName,
        modelName,
        reasoningLevel,
        executionTimeMs: Date.now() - startedAt,
        fallbackFrom: fallbackFrom || undefined,
        reviewedAt: new Date().toISOString(),
      };

      options.onProgress?.({
        stage: 'saving',
        percent: 94,
        message: 'Syncing reviewed transcript & millisecond timings to your studio…',
      });

      const latest = this.historyRepo.findById(lesson.id, scope) || lesson;
      const updated = this.applyReviewedSnapshotToLesson(latest, reviewedSnapshot);
      const saved = this.historyRepo.update(lesson.id, updated, scope);
      if (!saved) throw new NotFoundException(`Lesson "${lessonId}" not found.`);

      options.onProgress?.({
        stage: 'complete',
        percent: 100,
        message: 'Transcript reviewed and millisecond-aligned.',
      });

      this.logger.log(
        `Reviewed shadowing lesson ${lesson.id} in ${reviewedSnapshot.executionTimeMs}ms ` +
          `(${reviewedSnapshot.sentences.length} sentences, ${reviewedSnapshot.speakers.length} speakers, ` +
          `${reviewedSnapshot.quality.verbatimScore}% verbatim)`,
      );

      return saved;
    } catch (error: any) {
      const msg = error?.message || 'AI transcript review failed.';
      const latest = this.historyRepo.findById(lesson.id, scope);
      if (latest) {
        const curTd = this.ensureTranscriptData(latest);
        curTd.reviewStatus = 'failed';
        curTd.reviewError = msg.slice(0, 400);
        this.historyRepo.update(lesson.id, { transcriptData: curTd }, scope);
      }
      throw error;
    }
  }

  /**
   * Applies custom speaker names onto both `transcriptData.reviewed` and the
   * Studio's primary `sentences` & `chunks` arrays so every view stays 100% in sync.
   */
  renameSpeakers(
    lessonId: string,
    overrides: Record<string, string>,
    scope?: RequestIdentityScope,
  ): HistoryItem {
    const lesson = this.historyRepo.findById(lessonId, scope);
    if (!lesson) {
      throw new NotFoundException(`Lesson "${lessonId}" not found.`);
    }

    const td = this.ensureTranscriptData(lesson);
    const merged: Record<string, string> = { ...(td.speakerOverrides || {}) };
    for (const [k, v] of Object.entries(overrides || {})) {
      const cleanK = String(k || '').trim();
      const cleanV = String(v || '').trim().slice(0, 64);
      if (!cleanK) continue;
      if (cleanV) merged[cleanK] = cleanV;
      else delete merged[cleanK];
    }
    td.speakerOverrides = merged;

    if (td.reviewed) {
      applySpeakerOverridesToReviewed(td.reviewed, merged);
      const sentByIndex = new Map<number, TranscriptSentence>();
      td.reviewed.sentences.forEach((s) => sentByIndex.set(s.index, s));

      lesson.sentences = (lesson.sentences || []).map((s) => {
        const rev = sentByIndex.get(s.index);
        return rev ? { ...s, speaker: rev.speaker, speakerId: rev.speakerId } : s;
      });
      const paraByIndex = new Map(td.reviewed.paragraphs.map((p) => [p.index, p]));
      lesson.chunks = (lesson.chunks || []).map((c, idx) => {
        const revP = paraByIndex.get(c.index || idx + 1);
        return revP ? { ...c, speaker: revP.speaker, speakerId: revP.speakerId } : c;
      });
    }

    const saved = this.historyRepo.update(
      lesson.id,
      {
        transcriptData: td,
        sentences: lesson.sentences,
        chunks: lesson.chunks,
      },
      scope,
    );
    if (!saved) throw new NotFoundException(`Lesson "${lessonId}" not found.`);
    return saved;
  }

  /**
   * Converts a `ReviewedTranscriptSnapshot` onto the lesson's primary Studio
   * `sentences`, `chunks`, `noteMarkdown`, and `transcriptData` while preserving
   * Coach highlights, study notes, and valid item completion progress.
   */
  public applyReviewedSnapshotToLesson(
    lesson: HistoryItem,
    reviewed: ReviewedTranscriptSnapshot,
  ): Partial<HistoryItem> {
    const pacingMode = normalizePacingMode(lesson.pacingMode || lesson.transcriptData?.pacingMode);
    const td = this.ensureTranscriptData(lesson);
    td.reviewed = reviewed;
    td.reviewStatus = 'ready';
    td.reviewError = '';
    td.pacingMode = pacingMode;

    const oldSentences = Array.isArray(lesson.sentences) ? lesson.sentences : [];
    const oldProgress =
      lesson.completionProgress && typeof lesson.completionProgress === 'object'
        ? lesson.completionProgress
        : {};
    const shadowCoverage = captureCompletedCoverage(oldSentences, oldProgress.sentences);
    const listenCoverage = captureCompletedCoverage(oldSentences, oldProgress.listen);
    const translationsByText = snapshotTranslationsByText(lesson);

    const annotations = this.collectCoachAnnotations(lesson);

    const sentences: SentenceItem[] = reviewed.sentences.map((s) => ({
      id: s.id,
      index: s.index,
      timeRange: `${formatTimestampMs(s.startSec)} - ${formatTimestampMs(s.endSec)}`,
      startSec: s.startSec,
      endSec: s.endSec,
      startMs: s.startMs,
      endMs: s.endMs,
      durationSec: Math.max(0.1, Number((s.endSec - s.startSec).toFixed(3))),
      text: s.text,
      rawText: s.rawText,
      speakerId: s.speakerId,
      speaker: s.speaker,
      repaired: s.repaired,
      repairNote: s.repairNote,
      isOverlap: s.isOverlap,
      paragraphIndex: s.paragraphIndex,
      ideaIndex: s.ideaIndex,
      words: s.words,
      highlightedHtml: annotations.length
        ? applyDynamicHighlights(s.text, annotations)
        : escapeTranscriptHtml(s.text),
    }));

    const translationsCache = restoreExactTranslations(sentences, translationsByText);
    const completionProgress = {
      ...oldProgress,
      sentences: remapCompletedIndices(shadowCoverage, sentences),
      listen: remapCompletedIndices(listenCoverage, sentences),
    };

    const chunks: ChunkItem[] = reviewed.paragraphs.map((p) => ({
      index: p.index,
      timeRange: `${formatTimestampMs(p.startSec)} - ${formatTimestampMs(p.endSec)}`,
      startSec: p.startSec,
      endSec: p.endSec,
      sentenceIndices: p.sentenceIndices,
      speakerId: p.speakerId,
      speaker: p.speaker,
      text: p.text,
      highlightedHtml: annotations.length
        ? applyDynamicHighlights(p.text, annotations)
        : escapeTranscriptHtml(p.text),
    }));

    const totalWords =
      reviewed.quality.totalWords ||
      sentences.reduce((sum, s) => sum + (s.words?.length || s.text.split(/\s+/).filter(Boolean).length), 0) ||
      1;

    const noteMarkdown = this.historyRepo.buildCleanMarkdown(
      lesson.title,
      lesson.creator,
      lesson.sourceUrl,
      chunks,
      lesson.aiAnalysis,
      lesson.studyNotes,
    );

    return {
      pacingMode,
      transcriptData: td,
      sentences,
      chunks,
      sentencesCount: sentences.length,
      chunksCount: chunks.length,
      translationsCache,
      translationsByText,
      completionProgress,
      noteMarkdown,
      stats: {
        totalWords,
        sentencesCount: sentences.length,
        connectedCount: lesson.aiAnalysis?.connectedSpeech?.length || 0,
        expressionsCount: lesson.aiAnalysis?.expressions?.length || 0,
        vocabularyCount: lesson.aiAnalysis?.vocabulary?.length || 0,
      },
    };
  }

  private collectCoachAnnotations(lesson: HistoryItem): HighlightAnnotation[] {
    const analysis = lesson.aiAnalysis;
    if (!analysis) return [];
    const list: HighlightAnnotation[] = [];
    for (const c of analysis.connectedSpeech || []) {
      if (c?.exactPhrase) list.push({ phrase: c.exactPhrase, category: 'connected' });
    }
    for (const e of analysis.expressions || []) {
      if (e?.phrase) list.push({ phrase: e.phrase, category: 'expression' });
    }
    for (const v of analysis.vocabulary || []) {
      if (v?.term) list.push({ phrase: v.term, category: 'vocab' });
    }
    return list;
  }
}
