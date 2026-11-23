import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import { WordLookupService } from '../../core/ai/word-lookup.service';
import { classifyMediaUrl } from '../../core/media/media-url';
import { AiProvidersService } from '../ai-providers/ai-providers.service';
import { MediaTranscriptionService } from '../american-extractor/sources/media-transcription.service';
import {
  buildCanonicalSourceKey,
  extractYouTubeVideoId,
  SharedSourcesService,
} from '../shared-sources/shared-sources.service';
import { SharedMediaKind, SharedSourceType, SourceSegment } from '../shared-sources/shared-sources.types';
import { TranscriptService } from '../tracks/shadowing/transcript.service';
import {
  ListTranscriptDocsQuery,
  TranscriptLabRepository,
} from './transcript-lab.repository';
import {
  ExportOptions,
  ExportResult,
  ReviewedTranscriptSnapshot,
  ReviewProgressEvent,
  TranscriptLabDoc,
  TranscriptLabListResult,
} from './transcript-lab.types';
import {
  buildReviewChunks,
  buildTranscriptReviewSystemPrompt,
  buildTranscriptReviewUserPrompt,
  parseTranscriptReviewResponse,
} from './transcript-review.prompt';
import {
  exportTranscriptDocument,
  SUPPORTED_EXPORT_FORMATS,
  SUPPORTED_VIEW_MODES,
} from './utils/transcript-export.util';
import {
  assembleAlignedReviewedViews,
  buildRawTranscriptSnapshot,
  DraftReviewedIdea,
  DraftReviewedSentence,
} from './utils/word-alignment.util';

const MEDIA_UPLOAD_EXT = /\.(mp3|m4a|wav|aac|flac|ogg|opus|mp4|mov|m4v|webm|mkv)$/i;

function inferSourceType(platform: string, hasVideo: boolean): SharedSourceType {
  const low = (platform || '').toLowerCase();
  if (low === 'youtube') return 'youtube';
  if (low.includes('podcast') || low.includes('soundcloud') || low.includes('spotify') || low.includes('overcast')) {
    return 'podcast';
  }
  if (['tiktok', 'instagram', 'x', 'facebook', 'reddit', 'threads', 'linkedin', 'bluesky'].some((k) => low.includes(k))) {
    return 'social_video';
  }
  return hasVideo ? 'video' : 'audio';
}

function prettifyFileTitle(fileName: string): string {
  const base = path.basename(String(fileName || 'Uploaded Media'), path.extname(String(fileName || '')));
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Uploaded Media';
}

@Injectable()
export class TranscriptLabService {
  private readonly logger = new Logger(TranscriptLabService.name);

  constructor(
    private readonly repository: TranscriptLabRepository,
    private readonly sharedSources: SharedSourcesService,
    private readonly transcriptService: TranscriptService,
    private readonly mediaTranscription: MediaTranscriptionService,
    private readonly aiProviders: AiProvidersService,
    private readonly wordLookup: WordLookupService,
  ) {}

  getConfig() {
    return {
      views: SUPPORTED_VIEW_MODES,
      exportFormats: SUPPORTED_EXPORT_FORMATS,
      supportedPlatforms: [
        'YouTube',
        'TikTok',
        'Instagram',
        'X',
        'Vimeo',
        'Podcast RSS',
        'Apple Podcasts',
        'SoundCloud',
        'TED',
        'Loom',
        'Direct Audio/Video',
      ],
      aiConfigured: this.aiProviders.hasAnyConfiguredKey(null),
    };
  }

  listDocs(userId: string, query: ListTranscriptDocsQuery = {}): TranscriptLabListResult {
    return this.repository.list(userId, query);
  }

  getDoc(userId: string, id: string): TranscriptLabDoc {
    const doc = this.repository.findById(userId, id);
    if (!doc) throw new NotFoundException('Transcript not found.');
    return doc;
  }

  /**
   * Stage 1 (Fast Path): Ingests ANY media URL (YouTube, social media, podcast RSS,
   * Apple Podcasts episode, SoundCloud, Vimeo, direct MP3/MP4) into an untouched raw
   * millisecond word-timed transcript + playable media source and returns immediately.
   */
  async ingestUrl(
    userId: string,
    rawUrl: string,
    options: { force?: boolean } = {},
  ): Promise<{ doc: TranscriptLabDoc; cached: boolean }> {
    const cleanUrl = String(rawUrl || '').trim();
    if (!cleanUrl) {
      throw new BadRequestException('Paste a YouTube, podcast, social video, or audio/video URL.');
    }

    const mediaInfo = classifyMediaUrl(cleanUrl);
    if (!mediaInfo) {
      throw new BadRequestException(
        'Enter a valid public http(s) media URL (YouTube, TikTok, Instagram, X, Vimeo, Podcast RSS, or direct audio/video link).',
      );
    }

    const ytId = mediaInfo.source === 'youtube' ? extractYouTubeVideoId(cleanUrl) : '';
    const sourceKey = buildCanonicalSourceKey({
      sourceUrl: mediaInfo.canonicalUrl,
      videoId: ytId || undefined,
    });

    const existing = this.repository.findBySourceKey(userId, sourceKey);
    if (existing && !options.force) {
      return { doc: existing, cached: true };
    }

    // 1. YouTube Fast Path (~1-2s via JSON3 per-word timedtext, with Whisper fallback)
    if (mediaInfo.source === 'youtube' && ytId) {
      try {
        const yt = await this.transcriptService.extract(mediaInfo.canonicalUrl, Boolean(options.force));
        const rawSnapshot = buildRawTranscriptSnapshot({
          provider: yt.timed_words?.length ? 'youtube_json3' : 'youtube_captions',
          title: yt.title || 'YouTube Video',
          creator: yt.creator || 'YouTube Creator',
          url: mediaInfo.canonicalUrl,
          mediaId: ytId,
          durationSeconds: yt.duration_seconds || 0,
          fullText: yt.full_raw_transcript,
          cues: yt.cues,
          timedWords: yt.timed_words,
        });

        const segments: SourceSegment[] = rawSnapshot.sentences.map((s) => ({
          startSec: s.startSec,
          endSec: s.endSec,
          text: s.text,
        }));

        const shared = this.sharedSources.upsert(userId, {
          sourceKey,
          sourceType: 'youtube',
          title: yt.title || 'YouTube Video',
          creator: yt.creator || 'YouTube Creator',
          sourceUrl: mediaInfo.canonicalUrl,
          sourceLabel: 'YouTube · captions',
          hasAudio: true,
          hasVideo: true,
          mediaKind: 'youtube',
          mediaId: ytId,
          durationSeconds: yt.duration_seconds || 0,
          transcriptText: rawSnapshot.fullText,
          segments,
          sourceMeta: {
            videoId: ytId,
            thumbnailUrl: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
            platform: 'YouTube',
          },
        });

        const doc = this.repository.createOrUpdateRaw(
          userId,
          {
            sourceId: shared.id,
            sourceKey,
            sourceUrl: mediaInfo.canonicalUrl,
            sourceType: 'youtube',
            platform: 'YouTube',
            title: yt.title || 'YouTube Video',
            creator: yt.creator || 'YouTube Creator',
            thumbnailUrl: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
            durationSeconds: yt.duration_seconds || 0,
            hasAudio: true,
            hasVideo: true,
            mediaKind: 'youtube',
            mediaId: ytId,
            mimeType: 'video/youtube',
            providerEngine: rawSnapshot.provider,
            raw: rawSnapshot,
          },
          existing?.id,
        );

        return { doc, cached: false };
      } catch (ytErr: any) {
        this.logger.warn(`YouTube caption path fell back to speech engine: ${ytErr?.message}`);
        // Fall through to universal yt-dlp + faster-whisper with word timestamps
      }
    }

    // 2. Universal Media / Podcast / Social Video / Direct Audio-Video Path
    const persistedDir = this.sharedSources.getMediaDir();
    const mediaResult = await this.mediaTranscription.transcribeUrl(mediaInfo.canonicalUrl, {
      wordTimestamps: true,
      persistMediaDir: mediaInfo.source === 'youtube' ? undefined : persistedDir,
      mediaId: mediaInfo.mediaId,
      force: Boolean(options.force),
    });

    const isYouTubeFallback = mediaInfo.source === 'youtube' && Boolean(ytId);
    const hasVideo = isYouTubeFallback ? true : Boolean(mediaResult.hasVideo);
    const hasAudio = true;
    const mediaKind: SharedMediaKind = isYouTubeFallback
      ? 'youtube'
      : mediaResult.mediaFile
        ? hasVideo
          ? 'video'
          : 'audio'
        : 'none';
    const mediaId = isYouTubeFallback ? ytId : mediaResult.mediaFile || '';
    const sourceType = inferSourceType(mediaInfo.platform, hasVideo);

    const rawSnapshot = buildRawTranscriptSnapshot({
      provider: mediaResult.engine || 'faster_whisper',
      model: mediaResult.model || '',
      title: mediaResult.title || `${mediaInfo.platform} Media`,
      creator: mediaResult.creator || mediaInfo.platform,
      url: mediaInfo.canonicalUrl,
      mediaId: mediaId || mediaInfo.mediaId,
      durationSeconds: mediaResult.durationSeconds || 0,
      fullText: mediaResult.text,
      cues: mediaResult.cues,
      timedWords: mediaResult.timedWords,
    });

    const segments: SourceSegment[] = rawSnapshot.sentences.map((s) => ({
      startSec: s.startSec,
      endSec: s.endSec,
      text: s.text,
    }));

    const thumb =
      mediaResult.thumbnailUrl ||
      (isYouTubeFallback ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : '');

    const shared = this.sharedSources.upsert(userId, {
      sourceKey,
      sourceType,
      title: mediaResult.title || `${mediaInfo.platform} Media`,
      creator: mediaResult.creator || mediaInfo.platform,
      sourceUrl: mediaInfo.canonicalUrl,
      sourceLabel: `${mediaInfo.platform} · ${mediaResult.engine || 'audio'}`,
      mimeType: mediaResult.mimeType || '',
      hasAudio,
      hasVideo,
      mediaKind,
      mediaId,
      durationSeconds: mediaResult.durationSeconds || 0,
      transcriptText: rawSnapshot.fullText,
      segments,
      sourceMeta: {
        platform: mediaInfo.platform,
        thumbnailUrl: thumb,
        engine: mediaResult.engine,
      },
    });

    const doc = this.repository.createOrUpdateRaw(
      userId,
      {
        sourceId: shared.id,
        sourceKey,
        sourceUrl: mediaInfo.canonicalUrl,
        sourceType,
        platform: mediaInfo.platform,
        title: mediaResult.title || `${mediaInfo.platform} Media`,
        creator: mediaResult.creator || mediaInfo.platform,
        thumbnailUrl: thumb,
        durationSeconds: mediaResult.durationSeconds || 0,
        hasAudio,
        hasVideo,
        mediaKind,
        mediaId,
        mimeType: mediaResult.mimeType || '',
        providerEngine: mediaResult.engine || 'faster_whisper',
        raw: rawSnapshot,
      },
      existing?.id,
    );

    return { doc, cached: false };
  }

  /**
   * Ingests a local audio/video file upload using SharedSourcesService + MediaTranscriptionService.
   */
  async ingestUpload(
    userId: string,
    file: { buffer: Buffer; originalname: string; mimetype?: string },
    options: { force?: boolean } = {},
  ): Promise<{ doc: TranscriptLabDoc; cached: boolean }> {
    if (!file?.buffer || file.buffer.length < 512) {
      throw new BadRequestException('Please upload a valid audio or video file.');
    }
    const name = String(file.originalname || 'media.mp3').trim();
    const mime = String(file.mimetype || '').toLowerCase();
    if (!mime.startsWith('audio/') && !mime.startsWith('video/') && !MEDIA_UPLOAD_EXT.test(name)) {
      throw new BadRequestException(
        'Upload an audio or video file (.mp3, .m4a, .wav, .mp4, .mov, .webm, .ogg).',
      );
    }

    const sourceKey = buildCanonicalSourceKey({ fileBuffer: file.buffer });
    const existing = this.repository.findBySourceKey(userId, sourceKey);
    if (existing && !options.force) {
      return { doc: existing, cached: true };
    }

    const persisted = this.sharedSources.persistMediaBuffer(file.buffer, name, mime);
    const title = prettifyFileTitle(name);
    const mediaResult = await this.mediaTranscription.transcribeFile(persisted.filePath, {
      title,
      creator: 'Uploaded Media',
      wordTimestamps: true,
      force: Boolean(options.force),
    });

    const rawSnapshot = buildRawTranscriptSnapshot({
      provider: mediaResult.engine || 'faster_whisper',
      model: mediaResult.model || '',
      title,
      creator: 'Uploaded Media',
      url: '',
      mediaId: persisted.mediaId,
      durationSeconds: mediaResult.durationSeconds || 0,
      fullText: mediaResult.text,
      cues: mediaResult.cues,
      timedWords: mediaResult.timedWords,
    });

    const sourceType: SharedSourceType = persisted.hasVideo ? 'video' : 'audio';
    const shared = this.sharedSources.upsert(userId, {
      sourceKey,
      sourceType,
      title,
      creator: 'Uploaded Media',
      sourceLabel: persisted.hasVideo ? 'Uploaded video' : 'Uploaded audio',
      mimeType: persisted.mimeType,
      fileName: name,
      hasAudio: true,
      hasVideo: persisted.hasVideo,
      mediaKind: persisted.mediaKind,
      mediaId: persisted.mediaId,
      durationSeconds: mediaResult.durationSeconds || 0,
      transcriptText: rawSnapshot.fullText,
      segments: rawSnapshot.sentences.map((s) => ({
        startSec: s.startSec,
        endSec: s.endSec,
        text: s.text,
      })),
      sourceMeta: { fileName: name, mimeType: persisted.mimeType },
    });

    const doc = this.repository.createOrUpdateRaw(
      userId,
      {
        sourceId: shared.id,
        sourceKey,
        sourceUrl: '',
        sourceType,
        platform: persisted.hasVideo ? 'Uploaded Video' : 'Uploaded Audio',
        title,
        creator: 'Uploaded Media',
        thumbnailUrl: '',
        durationSeconds: mediaResult.durationSeconds || 0,
        hasAudio: true,
        hasVideo: persisted.hasVideo,
        mediaKind: persisted.mediaKind,
        mediaId: persisted.mediaId,
        mimeType: persisted.mimeType,
        providerEngine: mediaResult.engine || 'faster_whisper',
        raw: rawSnapshot,
      },
      existing?.id,
    );

    return { doc, cached: false };
  }

  /**
   * Stage 2: Runs the Faithful Verbatim-First AI Review, Multi-Speaker Disambiguation,
   * Idea Structuring, and Millisecond Word Re-Alignment pipeline via AiProvidersService.
   */
  async reviewTranscript(
    userId: string,
    docId: string,
    options: {
      keyId?: string;
      model?: string;
      variant?: string;
      force?: boolean;
      signal?: AbortSignal;
      onProgress?: (event: ReviewProgressEvent) => void;
    } = {},
  ): Promise<TranscriptLabDoc> {
    const doc = this.getDoc(userId, docId);
    if (doc.reviewed && doc.reviewStatus === 'ready' && !options.force) {
      options.onProgress?.({
        stage: 'complete',
        percent: 100,
        message: 'Loaded cached AI-reviewed transcript.',
      });
      return doc;
    }

    if (!this.aiProviders.hasAnyConfiguredKey(userId)) {
      throw new BadRequestException(
        'No AI provider key is configured. Add an API key in AI Keys & Models to run AI transcript review.',
      );
    }

    const chunks = buildReviewChunks(doc.raw.sentences, 1100);
    if (chunks.length === 0) {
      throw new BadRequestException('This transcript has no sentences to review.');
    }

    const startedAt = Date.now();
    this.repository.setReviewStatus(userId, docId, 'processing', '');
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
          title: doc.title,
          creator: doc.creator,
          platform: doc.platform,
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

        // Track chunk-local paragraph & idea offsets cleanly across multi-chunk podcasts
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

      const assembled = assembleAlignedReviewedViews({
        rawWords: doc.raw.words,
        draftSentences: allSentences,
        draftIdeas: allIdeas,
        defaultSpeaker: doc.creator || 'Speaker 1',
        speakerOverrides: doc.speakerOverrides,
      });

      // Verbatim Fidelity Guard: reject catastrophic LLM truncation/hallucination (< 50% word preservation)
      const ratio = assembled.quality.totalWords / Math.max(1, doc.raw.words.length);
      if (ratio < 0.45 && doc.raw.words.length >= 30) {
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
        message: 'Saving reviewed transcript to your library…',
      });

      const saved = this.repository.saveReviewed(userId, docId, reviewedSnapshot);
      if (!saved) throw new NotFoundException('Transcript not found.');

      options.onProgress?.({
        stage: 'complete',
        percent: 100,
        message: 'Transcript reviewed and millisecond-aligned.',
      });

      this.logger.log(
        `Reviewed transcript ${docId} in ${reviewedSnapshot.executionTimeMs}ms ` +
          `(${saved.sentenceCount} sentences, ${saved.speakerCount} speakers, ` +
          `${reviewedSnapshot.quality.verbatimScore}% verbatim)`,
      );

      return saved;
    } catch (error: any) {
      const msg = error?.message || 'AI transcript review failed.';
      this.repository.setReviewStatus(userId, docId, 'failed', msg);
      throw error;
    }
  }

  renameDoc(userId: string, docId: string, title: string): TranscriptLabDoc {
    const clean = String(title || '').trim();
    if (!clean) throw new BadRequestException('Title cannot be empty.');
    const updated = this.repository.updateTitle(userId, docId, clean);
    if (!updated) throw new NotFoundException('Transcript not found.');
    if (updated.sourceId) {
      this.sharedSources.updateTitle(userId, updated.sourceId, clean);
    }
    return updated;
  }

  renameSpeakers(
    userId: string,
    docId: string,
    overrides: Record<string, string>,
  ): TranscriptLabDoc {
    const updated = this.repository.updateSpeakerOverrides(userId, docId, overrides);
    if (!updated) throw new NotFoundException('Transcript not found.');
    return updated;
  }

  toggleSentenceCompletion(
    userId: string,
    docId: string,
    sentenceIndex: number,
    completed: boolean,
  ) {
    const result = this.repository.toggleSentenceCompletion(userId, docId, sentenceIndex, completed);
    if (!result) throw new NotFoundException('Transcript not found.');
    return result;
  }

  exportDoc(userId: string, docId: string, options: ExportOptions): ExportResult {
    const doc = this.getDoc(userId, docId);
    return exportTranscriptDocument(doc, options);
  }

  deleteDoc(userId: string, docId: string): boolean {
    return this.repository.delete(userId, docId);
  }

  async lookupWord(params: {
    userId: string;
    docId?: string;
    word: string;
    contextSentence?: string;
    language?: string;
    lookupScope?: 'word' | 'phrase' | 'sentence';
  }) {
    const cleanWord = String(params.word || '').trim();
    if (!cleanWord) throw new BadRequestException('Select a word to look up.');
    let title = 'Media Transcript';
    if (params.docId) {
      const doc = this.repository.findById(params.userId, params.docId);
      if (doc?.title) title = doc.title;
    }
    return this.wordLookup.defineWordInContext({
      word: cleanWord,
      contextSentence: String(params.contextSentence || cleanWord).trim(),
      title,
      targetLanguageCode: params.language || 'ar',
      scope: params.lookupScope,
    });
  }
}
