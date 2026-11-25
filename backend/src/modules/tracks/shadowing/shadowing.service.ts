import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  ChunkItem,
  HistoryItem,
  HistoryRepository,
  RequestIdentityScope,
  SentenceItem,
} from '../../../core/database/history.repository';
import { escapeTranscriptHtml } from '../../../core/linguistics/highlights';
import {
  formatTimestampMs,
  normalizePacingMode,
  ShadowingPacingMode,
} from '../../../core/linguistics/segmentation';
import { classifyMediaUrl } from '../../../core/media/media-url';
import { AiProvidersService } from '../../ai-providers/ai-providers.service';
import { MediaTranscriptionService } from '../../american-extractor/sources/media-transcription.service';
import {
  buildCanonicalSourceKey,
  extractYouTubeVideoId,
  SharedSourcesService,
} from '../../shared-sources/shared-sources.service';
import {
  SharedMediaKind,
  SharedSourceType,
  SourceSegment,
} from '../../shared-sources/shared-sources.types';
import { ShadowingAnalysisService } from './shadowing.analysis.service';
import { ShadowingCoachGlossService } from './shadowing.coach-gloss.service';
import { ReviewLessonOptions, ShadowingReviewService } from './shadowing.review.service';
import {
  ShadowingTranslationService,
  TranslationResponse,
} from './shadowing.translation.service';
import {
  ExportOptions,
  ExportResult,
  RawTranscriptSnapshot,
  ShadowingMediaPlayback,
} from './shadowing.types';
import { TranscriptService } from './transcript.service';
import {
  exportShadowingLesson,
  SUPPORTED_EXPORT_FORMATS,
  SUPPORTED_VIEW_MODES,
} from './utils/transcript-export.util';
import { regroupShadowingLessonByPacing } from './utils/pacing-regroup.util';
import { buildRawTranscriptSnapshot } from './utils/word-alignment.util';

const MEDIA_UPLOAD_EXT = /\.(mp3|m4a|wav|aac|flac|ogg|opus|mp4|mov|m4v|webm|mkv)$/i;

function inferSourceType(platform: string, hasVideo: boolean): SharedSourceType {
  const low = (platform || '').toLowerCase();
  if (low === 'youtube') return 'youtube';
  if (
    low.includes('podcast') ||
    low.includes('soundcloud') ||
    low.includes('spotify') ||
    low.includes('overcast')
  ) {
    return 'podcast';
  }
  if (
    ['tiktok', 'instagram', 'x', 'facebook', 'reddit', 'threads', 'linkedin', 'bluesky'].some((k) =>
      low.includes(k),
    )
  ) {
    return 'social_video';
  }
  return hasVideo ? 'video' : 'audio';
}

function prettifyFileTitle(fileName: string): string {
  const base = path.basename(
    String(fileName || 'Uploaded Media'),
    path.extname(String(fileName || '')),
  );
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Uploaded Media';
}

function buildStreamUrl(mediaKind: SharedMediaKind, mediaId: string): string {
  if ((mediaKind === 'audio' || mediaKind === 'video') && mediaId) {
    return `/api/sources/media/${encodeURIComponent(mediaId)}`;
  }
  return '';
}

@Injectable()
export class ShadowingService {
  private readonly logger = new Logger(ShadowingService.name);
  private readonly inFlight = new Map<string, Promise<HistoryItem>>();

  constructor(
    private readonly historyRepo: HistoryRepository,
    private readonly transcriptService: TranscriptService,
    private readonly translationService: ShadowingTranslationService,
    private readonly analysisService: ShadowingAnalysisService,
    private readonly coachGlossService: ShadowingCoachGlossService,
    private readonly reviewService: ShadowingReviewService,
    private readonly sharedSources: SharedSourcesService,
    private readonly mediaTranscription: MediaTranscriptionService,
    private readonly aiProviders: AiProvidersService,
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

  checkExisting(url: string, scope?: RequestIdentityScope) {
    const cleanUrl = String(url || '').trim();
    const mediaInfo = classifyMediaUrl(cleanUrl);
    const ytId = mediaInfo?.source === 'youtube' ? extractYouTubeVideoId(cleanUrl) : this.extractYoutubeId(cleanUrl);
    const sourceKey = mediaInfo
      ? buildCanonicalSourceKey({
          sourceUrl: mediaInfo.canonicalUrl,
          videoId: ytId || undefined,
        })
      : '';

    const existing =
      (sourceKey ? this.historyRepo.findBySourceKey(sourceKey, scope) : undefined) ||
      this.historyRepo.findByUrlOrVideoId(cleanUrl, ytId || mediaInfo?.mediaId, scope);
    const transcriptCache = this.transcriptService.hasCache(ytId);

    if (!existing) {
      return {
        exists: transcriptCache.cached,
        id: null,
        title: transcriptCache.cached ? 'Raw YouTube transcript cached on disk' : null,
        transcriptCached: transcriptCache.cached,
        cacheInfo: {
          transcriptCached: transcriptCache.cached,
          transcriptBytes: transcriptCache.bytes,
          aiCoachCached: false,
          aiInsightsCount: 0,
          translationLanguages: [],
          hasNotes: false,
        },
      };
    }

    const aiInsightsCount = existing.aiAnalysis
      ? (existing.aiAnalysis.connectedSpeech?.length || 0) +
        (existing.aiAnalysis.expressions?.length || 0) +
        (existing.aiAnalysis.vocabulary?.length || 0)
      : 0;
    const translationLanguages = Object.keys(existing.translationsCache || {});
    const cacheInfo = {
      transcriptCached: transcriptCache.cached,
      transcriptBytes: transcriptCache.bytes,
      aiCoachCached: existing.analysisStatus === 'ready' && Boolean(existing.aiAnalysis),
      aiInsightsCount,
      translationLanguages,
      hasNotes: Boolean((existing.studyNotes || '').trim()),
    };

    return {
      exists: true,
      id: existing.id,
      title: existing.title,
      creator: existing.creator,
      transcriptCached: transcriptCache.cached,
      cacheInfo,
      item: {
        id: existing.id,
        title: existing.title,
        creator: existing.creator,
        platform: existing.platform || mediaInfo?.platform || 'YouTube',
        reviewStatus: existing.reviewStatus || existing.transcriptData?.reviewStatus || 'pending',
        sentencesCount: existing.sentencesCount || existing.sentences?.length || 0,
        completedDrills: existing.completedDrills || 0,
        analysisStatus: existing.analysisStatus,
        cachedTranslationLangs: translationLanguages,
      },
    };
  }

  /**
   * Stage 1 (Fast Path): Ingests ANY media URL (YouTube, TikTok, Instagram, X,
   * Vimeo, Podcast RSS, Apple Podcasts, SoundCloud, TED, Loom, Direct MP3/MP4)
   * into a millisecond word-timed Shadowing lesson and returns immediately.
   */
  async process(
    url: string,
    force = false,
    scope?: RequestIdentityScope,
    pacingMode?: ShadowingPacingMode,
  ): Promise<HistoryItem> {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl) {
      throw new BadRequestException(
        'Paste a YouTube, podcast, social video, or direct audio/video link.',
      );
    }

    const mediaInfo = classifyMediaUrl(cleanUrl);
    if (!mediaInfo) {
      throw new BadRequestException(
        'Please enter a valid public media link (YouTube, TikTok, Instagram, X, Vimeo, Podcast RSS, or direct audio/video URL).',
      );
    }

    const mode = normalizePacingMode(pacingMode);
    const ytId = mediaInfo.source === 'youtube' ? extractYouTubeVideoId(cleanUrl) : '';
    const sourceKey = buildCanonicalSourceKey({
      sourceUrl: mediaInfo.canonicalUrl,
      videoId: ytId || undefined,
    });

    const existing =
      this.historyRepo.findBySourceKey(sourceKey, scope) ||
      this.historyRepo.findByUrlOrVideoId(mediaInfo.canonicalUrl, ytId || mediaInfo.mediaId, scope);

    if (existing && !force) {
      this.logger.log(`SQLite cache hit for "${existing.title}" (${ytId || mediaInfo.mediaId})`);
      return existing;
    }

    const scopeKey = scope?.userId || 'user';
    const flightKey = `${scopeKey}:${sourceKey}:${force ? 'force' : 'std'}:${mode}`;
    const running = this.inFlight.get(flightKey);
    if (running) return running;

    const promise = this.ingestUrlAndPersist(
      mediaInfo,
      ytId,
      sourceKey,
      existing,
      scope,
      force,
      mode,
    ).finally(() => this.inFlight.delete(flightKey));

    this.inFlight.set(flightKey, promise);
    return promise;
  }

  /**
   * Ingests a local audio or video file upload (up to 120 MB), persists media for
   * HTTP 206 Range playback, extracts millisecond word timings, and saves a Shadowing lesson.
   */
  async processUpload(
    file: { buffer: Buffer; originalname: string; mimetype?: string },
    force = false,
    scope?: RequestIdentityScope,
    pacingMode?: ShadowingPacingMode,
  ): Promise<HistoryItem> {
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

    const mode = normalizePacingMode(pacingMode);
    const sourceKey = buildCanonicalSourceKey({ fileBuffer: file.buffer });
    const existing = this.historyRepo.findBySourceKey(sourceKey, scope);
    if (existing && !force) {
      return existing;
    }

    const persisted = this.sharedSources.persistMediaBuffer(file.buffer, name, mime);
    const title = prettifyFileTitle(name);
    const mediaResult = await this.mediaTranscription.transcribeFile(persisted.filePath, {
      title,
      creator: 'Uploaded Media',
      wordTimestamps: true,
      force,
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
      pacingMode: mode,
    });

    if (rawSnapshot.sentences.length === 0) {
      throw new ServiceUnavailableException('No spoken sentences could be extracted from that file.');
    }

    const sourceType: SharedSourceType = persisted.hasVideo ? 'video' : 'audio';
    const platform = persisted.hasVideo ? 'Uploaded Video' : 'Uploaded Audio';
    const media: ShadowingMediaPlayback = {
      hasAudio: true,
      hasVideo: persisted.hasVideo,
      mediaKind: persisted.mediaKind,
      mediaId: persisted.mediaId,
      streamUrl: buildStreamUrl(persisted.mediaKind, persisted.mediaId),
      mimeType: persisted.mimeType,
      durationSeconds: mediaResult.durationSeconds || 0,
    };

    const item = this.buildShadowingLessonItem({
      title,
      creator: 'Uploaded Media',
      sourceUrl: '',
      sourceKey,
      sourceType,
      platform,
      thumbnailUrl: '',
      durationSeconds: mediaResult.durationSeconds || 0,
      videoId: persisted.mediaId,
      providerEngine: mediaResult.engine || 'faster_whisper',
      media,
      raw: rawSnapshot,
      existing,
      pacingMode: mode,
    });

    const saved = this.historyRepo.create(item, scope);
    this.syncSharedSource(scope?.userId, saved, {
      sourceKey,
      sourceType,
      platform,
      sourceLabel: persisted.hasVideo ? 'Uploaded video' : 'Uploaded audio',
      mimeType: persisted.mimeType,
      fileName: name,
      media,
      raw: rawSnapshot,
      sourceMeta: { fileName: name, mimeType: persisted.mimeType, lessonId: saved.id },
    });

    return this.historyRepo.findById(saved.id, scope) || saved;
  }

  private assertOwnedLesson(historyId: string, scope?: RequestIdentityScope): HistoryItem {
    if (!historyId) {
      throw new BadRequestException('historyId is required');
    }
    const item = this.historyRepo.findById(historyId, scope);
    if (!item) {
      throw new NotFoundException(`Lesson "${historyId}" not found.`);
    }
    return item;
  }

  translateSentences(
    historyId: string,
    language?: string,
    force = false,
    scope?: RequestIdentityScope,
    sentenceIndices?: number[],
  ): Promise<TranslationResponse> {
    this.assertOwnedLesson(historyId, scope);
    return this.translationService.translate(historyId, language, force, sentenceIndices);
  }

  analyzeLesson(historyId: string, force = false, scope?: RequestIdentityScope) {
    this.assertOwnedLesson(historyId, scope);
    return this.analysisService.analyze(historyId, force);
  }

  coachGlosses(historyId: string, force = false, scope?: RequestIdentityScope) {
    this.assertOwnedLesson(historyId, scope);
    return this.coachGlossService.gloss(historyId, force);
  }

  defineWord(
    historyId: string,
    word: string,
    sentenceIndex?: number,
    language?: string,
    lookupScope?: 'word' | 'phrase' | 'sentence',
    identityScope?: RequestIdentityScope,
  ) {
    this.assertOwnedLesson(historyId, identityScope);
    return this.analysisService.defineWordInContext(
      historyId,
      word,
      sentenceIndex,
      language,
      lookupScope,
    );
  }

  reviewLesson(
    historyId: string,
    options: ReviewLessonOptions = {},
    scope?: RequestIdentityScope,
  ): Promise<HistoryItem> {
    this.assertOwnedLesson(historyId, scope);
    return this.reviewService.reviewLesson(historyId, options, scope);
  }

  renameLesson(historyId: string, title: string, scope?: RequestIdentityScope): HistoryItem {
    const clean = String(title || '').trim();
    if (!clean) throw new BadRequestException('Title cannot be empty.');
    const existing = this.assertOwnedLesson(historyId, scope);
    const updated = this.historyRepo.updateTitle(existing.id, clean, scope);
    if (!updated) throw new NotFoundException(`Lesson "${historyId}" not found.`);
    const sourceId = updated.sourceId || updated.transcriptData?.sourceId;
    if (scope?.userId && sourceId) {
      this.sharedSources.updateTitle(scope.userId, sourceId, clean);
    }
    return updated;
  }

  renameSpeakers(
    historyId: string,
    speakers: Record<string, string>,
    scope?: RequestIdentityScope,
  ): HistoryItem {
    this.assertOwnedLesson(historyId, scope);
    return this.reviewService.renameSpeakers(historyId, speakers || {}, scope);
  }

  /**
   * Deterministically regroups a user-owned lesson into the requested pacing mode
   * (`short` | `balanced` | `full`) in memory (< 15ms, zero AI calls, zero re-extraction),
   * re-grounds existing AI Coach annotations, updates Markdown, and persists atomically to SQLite.
   */
  updateLessonPacing(
    historyId: string,
    pacingMode: ShadowingPacingMode,
    scope?: RequestIdentityScope,
  ): HistoryItem {
    const mode = normalizePacingMode(pacingMode);
    const item = this.assertOwnedLesson(historyId, scope);

    regroupShadowingLessonByPacing(item, mode);

    if (item.aiAnalysis) {
      this.analysisService.regroundExistingAnalysisForSentences(item);
    }

    item.noteMarkdown = this.historyRepo.buildCleanMarkdown(
      item.title,
      item.creator,
      item.sourceUrl,
      item.chunks || [],
      item.aiAnalysis,
      item.studyNotes,
    );

    return this.historyRepo.saveItem(item, scope);
  }

  exportLesson(
    historyId: string,
    options: ExportOptions,
    scope?: RequestIdentityScope,
  ): ExportResult {
    const lesson = this.assertOwnedLesson(historyId, scope);
    return exportShadowingLesson(lesson, options);
  }

  private async ingestUrlAndPersist(
    mediaInfo: NonNullable<ReturnType<typeof classifyMediaUrl>>,
    ytId: string,
    sourceKey: string,
    existing: HistoryItem | undefined,
    scope: RequestIdentityScope | undefined,
    force: boolean,
    pacingMode: ShadowingPacingMode = 'short',
  ): Promise<HistoryItem> {
    const startedAt = Date.now();
    try {
      // 1. YouTube Fast Path (~1-2s via JSON3 per-word timedtext, with Whisper fallback on missing captions)
      if (mediaInfo.source === 'youtube' && ytId) {
        try {
          const yt = await this.transcriptService.extract(mediaInfo.canonicalUrl, force);
          const rawSnapshot = buildRawTranscriptSnapshot({
            provider: yt.timed_words?.length ? 'youtube_json3' : 'youtube_captions',
            title: yt.title || 'YouTube Video Lesson',
            creator: yt.creator || 'YouTube Creator',
            url: mediaInfo.canonicalUrl,
            mediaId: ytId,
            durationSeconds: yt.duration_seconds || 0,
            fullText: yt.full_raw_transcript,
            cues: yt.cues,
            timedWords: yt.timed_words,
            pacingMode,
          });

          if (rawSnapshot.sentences.length === 0) {
            throw new Error('No spoken sentences could be built from this video.');
          }

          const thumbnailUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
          const media: ShadowingMediaPlayback = {
            hasAudio: true,
            hasVideo: true,
            mediaKind: 'youtube',
            mediaId: ytId,
            streamUrl: '',
            mimeType: 'video/youtube',
            durationSeconds: yt.duration_seconds || 0,
          };

          const item = this.buildShadowingLessonItem({
            title: yt.title || 'YouTube Video Lesson',
            creator: yt.creator || 'YouTube Creator',
            sourceUrl: mediaInfo.canonicalUrl,
            sourceKey,
            sourceType: 'youtube',
            platform: 'YouTube',
            thumbnailUrl,
            durationSeconds: yt.duration_seconds || 0,
            videoId: ytId,
            providerEngine: rawSnapshot.provider,
            media,
            raw: rawSnapshot,
            existing,
            pacingMode,
          });

          const saved = this.historyRepo.create(item, scope);
          this.syncSharedSource(scope?.userId, saved, {
            sourceKey,
            sourceType: 'youtube',
            platform: 'YouTube',
            sourceLabel: 'YouTube · captions',
            media,
            raw: rawSnapshot,
            sourceMeta: {
              platform: 'YouTube',
              videoId: ytId,
              lessonId: saved.id,
              thumbnailUrl,
            },
          });

          this.logger.log(
            `YouTube lesson ready in ${Date.now() - startedAt}ms ` +
              `(${rawSnapshot.sentences.length} sentences, ${rawSnapshot.words.length} timed words)`,
          );
          return this.historyRepo.findById(saved.id, scope) || saved;
        } catch (ytErr: any) {
          // Immediately preserve 404 video_unavailable and invalid_url contract
          const errStatus = ytErr instanceof HttpException ? ytErr.getStatus() : 0;
          const errCode = (ytErr instanceof HttpException ? (ytErr.getResponse() as any)?.code : '') || '';
          if (errStatus === 404 || errCode === 'video_unavailable' || errCode === 'invalid_url') {
            throw ytErr;
          }
          this.logger.warn(
            `YouTube caption path fell back to speech engine (${errCode || errStatus || 'err'}): ${ytErr?.message}`,
          );
          try {
            return await this.ingestExternalMedia(
              mediaInfo,
              ytId,
              sourceKey,
              existing,
              scope,
              force,
              pacingMode,
            );
          } catch {
            throw ytErr;
          }
        }
      }

      // 2. Universal Media / Podcast / Social Video / Direct Audio-Video Path
      return await this.ingestExternalMedia(
        mediaInfo,
        ytId,
        sourceKey,
        existing,
        scope,
        force,
        pacingMode,
      );
    } catch (error: any) {
      this.logger.warn(
        `Media ingestion failed for ${mediaInfo.canonicalUrl} ` +
          `(${error instanceof HttpException ? error.getStatus() : 503}): ${error?.message || error}`,
      );
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        error?.message || 'Could not extract speech from that media link.',
      );
    }
  }

  private async ingestExternalMedia(
    mediaInfo: NonNullable<ReturnType<typeof classifyMediaUrl>>,
    ytId: string,
    sourceKey: string,
    existing: HistoryItem | undefined,
    scope: RequestIdentityScope | undefined,
    force: boolean,
    pacingMode: ShadowingPacingMode = 'short',
  ): Promise<HistoryItem> {
    const persistedDir = this.sharedSources.getMediaDir();
    const mediaResult = await this.mediaTranscription.transcribeUrl(mediaInfo.canonicalUrl, {
      wordTimestamps: true,
      persistMediaDir: mediaInfo.source === 'youtube' ? undefined : persistedDir,
      mediaId: mediaInfo.mediaId,
      force,
    });

    const isYouTubeFallback = mediaInfo.source === 'youtube' && Boolean(ytId);
    const hasVideo = isYouTubeFallback ? true : Boolean(mediaResult.hasVideo);
    const mediaKind: SharedMediaKind = isYouTubeFallback
      ? 'youtube'
      : mediaResult.mediaFile
        ? hasVideo
          ? 'video'
          : 'audio'
        : 'none';
    const mediaId = isYouTubeFallback ? ytId : mediaResult.mediaFile || '';
    const sourceType = inferSourceType(mediaInfo.platform, hasVideo);
    const title = mediaResult.title || `${mediaInfo.platform} Lesson`;
    const creator = mediaResult.creator || mediaInfo.platform;

    const rawSnapshot = buildRawTranscriptSnapshot({
      provider: mediaResult.engine || 'faster_whisper',
      model: mediaResult.model || '',
      title,
      creator,
      url: mediaInfo.canonicalUrl,
      mediaId: mediaId || mediaInfo.mediaId,
      durationSeconds: mediaResult.durationSeconds || 0,
      fullText: mediaResult.text,
      cues: mediaResult.cues,
      timedWords: mediaResult.timedWords,
      pacingMode,
    });

    if (rawSnapshot.sentences.length === 0) {
      throw new ServiceUnavailableException('No spoken sentences could be built from this media.');
    }

    const thumbnailUrl =
      mediaResult.thumbnailUrl ||
      (isYouTubeFallback ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : '');

    const media: ShadowingMediaPlayback = {
      hasAudio: true,
      hasVideo,
      mediaKind,
      mediaId,
      streamUrl: buildStreamUrl(mediaKind, mediaId),
      mimeType: mediaResult.mimeType || (isYouTubeFallback ? 'video/youtube' : ''),
      durationSeconds: mediaResult.durationSeconds || 0,
    };

    const item = this.buildShadowingLessonItem({
      title,
      creator,
      sourceUrl: mediaInfo.canonicalUrl,
      sourceKey,
      sourceType,
      platform: mediaInfo.platform,
      thumbnailUrl,
      durationSeconds: mediaResult.durationSeconds || 0,
      videoId: mediaId || mediaInfo.mediaId,
      providerEngine: mediaResult.engine || 'faster_whisper',
      media,
      raw: rawSnapshot,
      existing,
      pacingMode,
    });

    const saved = this.historyRepo.create(item, scope);
    this.syncSharedSource(scope?.userId, saved, {
      sourceKey,
      sourceType,
      platform: mediaInfo.platform,
      sourceLabel: `${mediaInfo.platform} · ${mediaResult.engine || 'audio'}`,
      mimeType: media.mimeType,
      media,
      raw: rawSnapshot,
      sourceMeta: {
        platform: mediaInfo.platform,
        thumbnailUrl,
        engine: mediaResult.engine,
        lessonId: saved.id,
      },
    });

    return this.historyRepo.findById(saved.id, scope) || saved;
  }

  private buildShadowingLessonItem(params: {
    title: string;
    creator: string;
    sourceUrl: string;
    sourceKey: string;
    sourceType: SharedSourceType;
    platform: string;
    thumbnailUrl: string;
    durationSeconds: number;
    videoId: string;
    providerEngine: string;
    media: ShadowingMediaPlayback;
    raw: RawTranscriptSnapshot;
    existing?: HistoryItem;
    pacingMode?: ShadowingPacingMode;
  }): HistoryItem {
    const pacingMode = normalizePacingMode(params.pacingMode);
    const sentences: SentenceItem[] = params.raw.sentences.map((s) => ({
      id: `s-${s.index}`,
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
      repaired: false,
      repairNote: '',
      isOverlap: false,
      paragraphIndex: s.paragraphIndex,
      ideaIndex: s.ideaIndex,
      words: s.words,
      highlightedHtml: escapeTranscriptHtml(s.text),
    }));

    const chunks: ChunkItem[] = params.raw.paragraphs.map((p) => ({
      index: p.index,
      timeRange: `${formatTimestampMs(p.startSec)} - ${formatTimestampMs(p.endSec)}`,
      startSec: p.startSec,
      endSec: p.endSec,
      sentenceIndices: p.sentenceIndices,
      speakerId: p.speakerId,
      speaker: p.speaker,
      text: p.text,
      highlightedHtml: escapeTranscriptHtml(p.text),
    }));

    const totalWords =
      params.raw.words.length ||
      sentences.reduce((sum, s) => sum + (s.text || '').split(/\s+/).filter(Boolean).length, 0) ||
      1;

    const durationSeconds = Math.max(
      1,
      Math.round(
        Number(params.durationSeconds) ||
          (sentences.length > 0 ? sentences[sentences.length - 1].endSec : 60),
      ),
    );
    const pacingWpm = Math.max(
      60,
      Math.round(totalWords / Math.max(durationSeconds / 60, 0.25)) || 150,
    );

    const difficulty: HistoryItem['difficulty'] =
      pacingWpm >= 175 || totalWords > 1100
        ? 'Advanced'
        : pacingWpm >= 135 || totalWords > 350
          ? 'Intermediate'
          : 'Beginner';

    const item: HistoryItem = {
      id: params.existing?.id || uuidv4(),
      track: 'shadowing',
      trackTitle: params.platform === 'YouTube' ? 'Video Lesson' : `${params.platform} Lesson`,
      title: params.title,
      creator: params.creator,
      videoId: params.videoId,
      sourceKey: params.sourceKey,
      sourceUrl: params.sourceUrl,
      platform: params.platform,
      media: params.media,
      pacingMode,
      transcriptData: {
        sourceKey: params.sourceKey,
        sourceType: params.sourceType,
        platform: params.platform,
        providerEngine: params.providerEngine,
        pacingMode,
        raw: params.raw,
        reviewed: null,
        reviewStatus: 'pending',
        reviewError: '',
        speakerOverrides: {},
      },
      reviewStatus: 'pending',
      speakerCount: 1,
      repairCount: 0,
      wordCount: totalWords,
      thumbnailUrl: params.thumbnailUrl,
      accentDialect: 'Spoken English',
      durationSeconds,
      pacingWpm,
      difficulty,
      cefrLevel: '',
      sentencesCount: sentences.length,
      chunksCount: chunks.length,
      analysisStatus: 'pending',
      stats: {
        totalWords,
        sentencesCount: sentences.length,
        connectedCount: 0,
        expressionsCount: 0,
        vocabularyCount: 0,
      },
      chunks,
      sentences,
      studyNotes: params.existing?.studyNotes || '',
      noteMarkdown: this.historyRepo.buildCleanMarkdown(
        params.title,
        params.creator,
        params.sourceUrl,
        chunks,
      ),
      translationEngineVersion: 4,
      timingVersion: 2,
      segmentationVersion: 2,
      createdAt: params.existing?.createdAt || new Date().toISOString(),
      completedDrills: params.existing?.completedDrills || 0,
    };

    return item;
  }

  private syncSharedSource(
    userId: string | null | undefined,
    saved: HistoryItem,
    meta: {
      sourceKey: string;
      sourceType: SharedSourceType;
      platform: string;
      sourceLabel: string;
      mimeType?: string;
      fileName?: string;
      media: ShadowingMediaPlayback;
      raw: RawTranscriptSnapshot;
      sourceMeta: Record<string, unknown>;
    },
  ): void {
    if (!userId) return;
    try {
      const segments: SourceSegment[] = meta.raw.sentences.map((s) => ({
        startSec: s.startSec,
        endSec: s.endSec,
        text: s.text,
      }));
      const shared = this.sharedSources.upsert(userId, {
        sourceKey: meta.sourceKey,
        sourceType: meta.sourceType,
        title: saved.title,
        creator: saved.creator,
        sourceUrl: saved.sourceUrl,
        sourceLabel: meta.sourceLabel,
        mimeType: meta.mimeType || meta.media.mimeType || '',
        fileName: meta.fileName || '',
        hasAudio: meta.media.hasAudio,
        hasVideo: meta.media.hasVideo,
        mediaKind: meta.media.mediaKind,
        mediaId: meta.media.mediaId,
        durationSeconds: saved.durationSeconds || 0,
        transcriptText: meta.raw.fullText,
        segments,
        sourceMeta: meta.sourceMeta,
      });
      this.sharedSources.linkLessonToSource(userId, saved.id, shared.id);
      if (saved.transcriptData) {
        saved.sourceId = shared.id;
        saved.transcriptData.sourceId = shared.id;
        this.historyRepo.update(
          saved.id,
          { sourceId: shared.id, transcriptData: saved.transcriptData },
          { userId },
        );
      }
    } catch (syncErr: any) {
      this.logger.warn(`Shared source sync skipped for lesson ${saved.id}: ${syncErr?.message}`);
    }
  }

  private extractYoutubeId(url: string): string {
    if (!url) return '';
    const clean = url.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
    const match =
      clean.match(/(?:v=|\/shorts\/|\/embed\/|\/live\/|\/v\/|youtu\.be\/|\/e\/)([\w-]{11})/) ||
      clean.match(/[?&]v=([\w-]{11})/);
    return match ? match[1] : '';
  }
}
