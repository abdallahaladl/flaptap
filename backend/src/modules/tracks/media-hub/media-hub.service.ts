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
  MediaHubPacingMode,
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
import { MediaHubAnalysisService } from './media-hub.analysis.service';
import { MediaHubCoachGlossService } from './media-hub.coach-gloss.service';
import { ReviewLessonOptions, MediaHubReviewService } from './media-hub.review.service';
import {
  MediaHubTranslationService,
  TranslationResponse,
} from './media-hub.translation.service';
import {
  ExportOptions,
  ExportResult,
  RawTranscriptSnapshot,
  ReadingBookmark,
  MediaHubMediaPlayback,
  TranscriptAvailabilityStatus,
} from './media-hub.types';
import { TranscriptService } from './transcript.service';
import {
  exportMediaHubLesson,
  SUPPORTED_EXPORT_FORMATS,
  SUPPORTED_VIEW_MODES,
} from './utils/transcript-export.util';
import { parseManualTranscriptInput } from './utils/manual-transcript.util';
import { regroupMediaHubLessonByPacing } from './utils/pacing-regroup.util';
import { buildRawTranscriptSnapshot } from './utils/word-alignment.util';

const MEDIA_UPLOAD_EXT = /\.(mp3|m4a|wav|aac|flac|ogg|opus|mp4|mov|m4v|webm|mkv)$/i;

const deletedLessonWatermarks = new Map<string, number>();

/**
 * Records deletion timestamps for a lesson's identifiers so concurrent in-flight
 * ingestion requests cannot resurrect a lesson deleted mid-flight.
 */
export function markMediaHubTargetDeleted(userId: string, keys: Array<string | undefined | null>): void {
  if (!userId) return;
  const now = Date.now();
  // Prune stale watermarks older than 10 minutes
  for (const [k, ts] of deletedLessonWatermarks.entries()) {
    if (now - ts > 10 * 60 * 1000) deletedLessonWatermarks.delete(k);
  }
  for (const raw of keys) {
    const clean = String(raw || '').trim();
    if (clean) {
      deletedLessonWatermarks.set(`${userId}:${clean}`, now);
    }
  }
}

export function wasMediaHubTargetDeletedAfter(
  userId: string | null | undefined,
  keys: Array<string | undefined | null>,
  startedAt: number,
): boolean {
  if (!userId) return false;
  for (const raw of keys) {
    const clean = String(raw || '').trim();
    if (!clean) continue;
    const ts = deletedLessonWatermarks.get(`${userId}:${clean}`);
    if (ts && ts >= startedAt) return true;
  }
  return false;
}

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
export class MediaHubService {
  private readonly logger = new Logger(MediaHubService.name);
  private readonly inFlight = new Map<string, Promise<HistoryItem>>();

  constructor(
    private readonly historyRepo: HistoryRepository,
    private readonly transcriptService: TranscriptService,
    private readonly translationService: MediaHubTranslationService,
    private readonly analysisService: MediaHubAnalysisService,
    private readonly coachGlossService: MediaHubCoachGlossService,
    private readonly reviewService: MediaHubReviewService,
    private readonly sharedSources: SharedSourcesService,
    private readonly mediaTranscription: MediaTranscriptionService,
    private readonly aiProviders: AiProvidersService,
  ) {}

  getCloudSttInfo(_userId?: string | null): {
    available: boolean;
    provider: 'groq' | 'openai' | null;
    model: string;
  } {
    return { available: false, provider: null, model: '' };
  }

  getConfig(_userId?: string | null) {
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
      aiConfigured: this.aiProviders.hasAnyConfiguredKey(_userId ?? null),
      cloudStt: this.getCloudSttInfo(_userId ?? null),
      strictProviderTranscriptsOnly: true,
      providerGuard: this.transcriptService.getGuardStatus?.() || null,
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
        exists: false,
        id: null,
        title: null,
        transcriptCached: false,
        cacheInfo: {
          transcriptCached: false,
          transcriptBytes: 0,
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
    pacingMode?: MediaHubPacingMode,
    options?: { allowInstantOpen?: boolean },
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

    const requestedMode = pacingMode ? normalizePacingMode(pacingMode) : null;
    const mode = requestedMode || 'short';
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
      const hydrated = this.hydrateLegacyRawFromDiskCache(existing);
      const targetMode = requestedMode || normalizePacingMode(existing.pacingMode);
      if (hydrated || (requestedMode && normalizePacingMode(existing.pacingMode) !== targetMode)) {
        return this.applyPacingAndPersist(existing, targetMode, scope);
      }
      return existing;
    }

    const allowInstantOpen = Boolean(options?.allowInstantOpen);
    const scopeKey = scope?.userId || 'user';
    const flightKey = `${scopeKey}:${sourceKey}:${force ? 'force' : 'std'}:${mode}:${allowInstantOpen ? 'instant' : 'strict'}`;
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
      allowInstantOpen,
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
    pacingMode?: MediaHubPacingMode,
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

    const requestedMode = pacingMode ? normalizePacingMode(pacingMode) : null;
    const mode = requestedMode || 'short';
    const sourceKey = buildCanonicalSourceKey({ fileBuffer: file.buffer });
    const existing = this.historyRepo.findBySourceKey(sourceKey, scope);
    if (existing && !force) {
      const targetMode = requestedMode || normalizePacingMode(existing.pacingMode);
      if (requestedMode && normalizePacingMode(existing.pacingMode) !== targetMode) {
        return this.applyPacingAndPersist(existing, targetMode, scope);
      }
      return existing;
    }

    const opStartedAt = Date.now();
    const persisted = this.sharedSources.persistMediaBuffer(file.buffer, name, mime);
    const title = prettifyFileTitle(name);
    const cloudStt = this.aiProviders.resolvePreferredCloudSttKey(scope?.userId);
    const mediaResult = await this.mediaTranscription.transcribeFile(persisted.filePath, {
      title,
      creator: 'Uploaded Media',
      wordTimestamps: true,
      force,
      cloudStt,
      allowLocalWhisper: false,
    });

    if (
      wasMediaHubTargetDeletedAfter(
        scope?.userId,
        [sourceKey, persisted.mediaId, existing?.id],
        opStartedAt,
      )
    ) {
      throw new BadRequestException('This lesson was deleted while processing.');
    }

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
    const media: MediaHubMediaPlayback = {
      hasAudio: true,
      hasVideo: persisted.hasVideo,
      mediaKind: persisted.mediaKind,
      mediaId: persisted.mediaId,
      streamUrl: buildStreamUrl(persisted.mediaKind, persisted.mediaId),
      mimeType: persisted.mimeType,
      durationSeconds: mediaResult.durationSeconds || 0,
    };

    const item = this.buildMediaHubLessonItem({
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
      preserveProgress: !force,
    });

    const saved = this.historyRepo.create(item, scope, { replaceExisting: force });
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
   * Persists the learner's reading-position bookmark ("where I left off")
   * strictly separate from derived lesson completion (`isCompleted` / `completionProgress`).
   */
  updateReadingBookmark(
    historyId: string,
    bookmark: Partial<ReadingBookmark> | null,
    scope?: RequestIdentityScope,
  ): { readingBookmark: ReadingBookmark | null } {
    const lesson = this.assertOwnedLesson(historyId, scope);
    const td = this.reviewService.ensureTranscriptData(lesson);

    if (bookmark === null) {
      td.readingBookmark = null;
      this.historyRepo.update(lesson.id, { transcriptData: td }, scope);
      return { readingBookmark: null };
    }

    const sentenceIndex = Math.floor(Number(bookmark.sentenceIndex));
    if (!Number.isFinite(sentenceIndex) || sentenceIndex < 1) {
      throw new BadRequestException('bookmark.sentenceIndex must be a positive integer.');
    }

    const startMs = Math.max(0, Math.round(Number(bookmark.startMs) || 0));
    const view: 'reviewed' | 'raw' = bookmark.view === 'raw' ? 'raw' : 'reviewed';
    const excerpt = String(bookmark.excerpt || '').replace(/\s+/g, ' ').trim().slice(0, 180);

    const savedBookmark: ReadingBookmark = {
      sentenceIndex,
      startMs,
      view,
      excerpt,
      updatedAt: new Date().toISOString(),
    };

    td.readingBookmark = savedBookmark;
    this.historyRepo.update(lesson.id, { transcriptData: td }, scope);
    return { readingBookmark: savedBookmark };
  }

  /**
   * Deterministically regroups a user-owned lesson into the requested pacing mode
   * (`short` | `normal`) in memory (< 15ms, zero AI calls, zero re-extraction),
   * re-grounds existing AI Coach annotations, updates Markdown, and persists atomically to SQLite.
   */
  updateLessonPacing(
    historyId: string,
    pacingMode: MediaHubPacingMode,
    scope?: RequestIdentityScope,
  ): HistoryItem {
    const mode = normalizePacingMode(pacingMode);
    const item = this.assertOwnedLesson(historyId, scope);
    this.hydrateLegacyRawFromDiskCache(item);
    return this.applyPacingAndPersist(item, mode, scope);
  }

  private hydrateLegacyRawFromDiskCache(item: HistoryItem): boolean {
    if (!item || !item.videoId) return false;
    if (Array.isArray(item.transcriptData?.raw?.words) && item.transcriptData!.raw!.words!.length > 0) {
      return false;
    }
    const cached = this.transcriptService.getCachedTranscript(item.videoId);
    if (!cached || !Array.isArray(cached.timed_words) || cached.timed_words.length === 0) {
      return false;
    }
    const mode = normalizePacingMode(item.pacingMode);
    const rawSnapshot = buildRawTranscriptSnapshot({
      provider: 'youtube_transcript_api',
      title: item.title || cached.title || 'YouTube Lesson',
      creator: item.creator || cached.creator || 'Speaker 1',
      url: item.sourceUrl || cached.url || '',
      mediaId: item.videoId,
      durationSeconds: item.durationSeconds || cached.duration_seconds || 0,
      fullText: cached.full_raw_transcript || '',
      cues: cached.cues,
      timedWords: cached.timed_words,
      pacingMode: mode,
    });
    if (!item.transcriptData) {
      item.transcriptData = {
        sourceKey: item.sourceKey || `yt:${item.videoId}`,
        sourceType: 'youtube',
        platform: item.platform || 'YouTube',
        providerEngine: 'youtube_transcript_api',
        pacingMode: mode,
        raw: rawSnapshot,
        reviewed: null,
        reviewStatus: item.reviewStatus || 'pending',
        reviewError: '',
        speakerOverrides: {},
      };
    } else {
      item.transcriptData.raw = rawSnapshot;
    }
    item.timingVersion = 2;
    item.segmentationVersion = 2;
    return true;
  }

  private applyPacingAndPersist(
    item: HistoryItem,
    mode: MediaHubPacingMode,
    scope?: RequestIdentityScope,
  ): HistoryItem {
    regroupMediaHubLessonByPacing(item, mode);

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
    return exportMediaHubLesson(lesson, options);
  }

  private async ingestUrlAndPersist(
    mediaInfo: NonNullable<ReturnType<typeof classifyMediaUrl>>,
    ytId: string,
    sourceKey: string,
    existing: HistoryItem | undefined,
    scope: RequestIdentityScope | undefined,
    force: boolean,
    pacingMode: MediaHubPacingMode = 'short',
    allowInstantOpen = false,
  ): Promise<HistoryItem> {
    const startedAt = Date.now();
    try {
      // 0. Reuse SharedSources cache first (0 network, 0 CPU) if user already ingested via Phrase Miner
      if (!force && scope?.userId) {
        const shared = this.sharedSources.findByKey(scope.userId, sourceKey);
        if (
          shared &&
          Array.isArray(shared.segments) &&
          shared.segments.length > 0 &&
          String(shared.transcriptText || '').trim()
        ) {
          const cues = shared.segments.map((seg) => ({
            start: formatTimestampMs(Math.round(seg.startSec * 1000)),
            end: formatTimestampMs(Math.round(seg.endSec * 1000)),
            start_sec: Number(seg.startSec) || 0,
            end_sec: Math.max((Number(seg.startSec) || 0) + 0.25, Number(seg.endSec) || 0),
            text: seg.text,
          }));
          const rawSnapshot = buildRawTranscriptSnapshot({
            provider: 'shared_source_cache',
            title: shared.title || 'Media Lesson',
            creator: shared.creator || mediaInfo.platform || 'Speaker',
            url: mediaInfo.canonicalUrl,
            mediaId: ytId || shared.mediaId || mediaInfo.mediaId,
            durationSeconds: shared.durationSeconds || 0,
            fullText: shared.transcriptText,
            cues,
            pacingMode,
          });
          if (rawSnapshot.sentences.length > 0) {
            const isYt = mediaInfo.source === 'youtube' && Boolean(ytId);
            const mediaKind: SharedMediaKind = isYt
              ? 'youtube'
              : (shared.mediaKind as SharedMediaKind) || 'none';
            const mediaId = isYt ? ytId : shared.mediaId || '';
            const media: MediaHubMediaPlayback = {
              hasAudio: true,
              hasVideo: isYt || Boolean(shared.hasVideo),
              mediaKind,
              mediaId,
              streamUrl: buildStreamUrl(mediaKind, mediaId),
              mimeType: shared.mimeType || (isYt ? 'video/youtube' : ''),
              durationSeconds: shared.durationSeconds || 0,
            };
            const item = this.buildMediaHubLessonItem({
              title: shared.title || 'Media Lesson',
              creator: shared.creator || mediaInfo.platform,
              sourceUrl: mediaInfo.canonicalUrl,
              sourceKey,
              sourceType: inferSourceType(mediaInfo.platform, media.hasVideo),
              platform: mediaInfo.platform,
              thumbnailUrl: isYt ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : '',
              durationSeconds: shared.durationSeconds || 0,
              videoId: ytId || mediaId || mediaInfo.mediaId,
              providerEngine: 'shared_source_cache',
              media,
              raw: rawSnapshot,
              existing,
              pacingMode,
              preserveProgress: !force,
            });
            const saved = this.historyRepo.create(item, scope, { replaceExisting: force });
            this.sharedSources.linkLessonToSource(scope.userId, saved.id, shared.id);
            this.logger.log(`SharedSource cache hit in ${Date.now() - startedAt}ms (${rawSnapshot.sentences.length} lines)`);
            return this.historyRepo.findById(saved.id, scope) || saved;
          }
        }
      }

      // 1. YouTube Fast Path (~1s via native YouTube captions — NEVER auto-runs local Whisper CPU)
      if (mediaInfo.source === 'youtube' && ytId) {
        try {
          const yt = await this.transcriptService.extract(mediaInfo.canonicalUrl, force);
          if (
            wasMediaHubTargetDeletedAfter(
              scope?.userId,
              [sourceKey, ytId, existing?.id],
              startedAt,
            )
          ) {
            throw new BadRequestException('This lesson was deleted while processing.');
          }
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
          const media: MediaHubMediaPlayback = {
            hasAudio: true,
            hasVideo: true,
            mediaKind: 'youtube',
            mediaId: ytId,
            streamUrl: '',
            mimeType: 'video/youtube',
            durationSeconds: yt.duration_seconds || 0,
          };

          const item = this.buildMediaHubLessonItem({
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
            preserveProgress: !force,
          });

          const saved = this.historyRepo.create(item, scope, { replaceExisting: force });
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
          throw ytErr;
        }
      }

      // 2. Universal Media / Podcast / Social Video / Direct Audio-Video Path (strictly native provider subtitles — never Whisper/Groq fallback)
      return await this.ingestExternalMedia(
        mediaInfo,
        ytId,
        sourceKey,
        existing,
        scope,
        force,
        pacingMode,
        false,
        { allowLocalWhisper: false, cloudStt: null },
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

  private normalizeTranscriptStatus(errCode: string): TranscriptAvailabilityStatus {
    if (errCode === 'no_captions') return 'no_captions';
    if (errCode === 'timeout') return 'timeout';
    if (errCode === 'rate_limited') return 'rate_limited';
    return 'pending';
  }

  private async fetchYoutubeOembedQuick(ytId: string): Promise<{ title: string; creator: string }> {
    try {
      const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(ytId)}`;
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
        { signal: AbortSignal.timeout(2500) },
      );
      if (res.ok) {
        const meta: any = await res.json();
        return {
          title: String(meta?.title || '').trim() || 'YouTube Video Lesson',
          creator: String(meta?.author_name || '').trim() || 'YouTube Creator',
        };
      }
    } catch {
      // Non-fatal fallback
    }
    return { title: 'YouTube Video Lesson', creator: 'YouTube Creator' };
  }

  private async createPendingYoutubeLesson(params: {
    mediaInfo: NonNullable<ReturnType<typeof classifyMediaUrl>>;
    ytId: string;
    sourceKey: string;
    existing?: HistoryItem;
    scope?: RequestIdentityScope;
    pacingMode: MediaHubPacingMode;
    status: TranscriptAvailabilityStatus;
    errorMessage: string;
  }): Promise<HistoryItem> {
    const meta = await this.fetchYoutubeOembedQuick(params.ytId);
    const thumbnailUrl = `https://img.youtube.com/vi/${params.ytId}/hqdefault.jpg`;
    const media: MediaHubMediaPlayback = {
      hasAudio: true,
      hasVideo: true,
      mediaKind: 'youtube',
      mediaId: params.ytId,
      streamUrl: '',
      mimeType: 'video/youtube',
      durationSeconds: params.existing?.durationSeconds || 0,
    };

    const emptyRaw: RawTranscriptSnapshot = {
      provider: 'youtube_pending',
      model: '',
      fullText: '',
      cues: [],
      words: [],
      canonicalSentences: [],
      sentences: [],
      paragraphs: [],
      extractedAt: new Date().toISOString(),
    };

    const item: HistoryItem = {
      id: params.existing?.id || uuidv4(),
      track: 'media_hub',
      trackTitle: 'Video Lesson',
      title: meta.title,
      creator: meta.creator,
      videoId: params.ytId,
      sourceKey: params.sourceKey,
      sourceUrl: params.mediaInfo.canonicalUrl,
      platform: 'YouTube',
      media,
      pacingMode: normalizePacingMode(params.pacingMode),
      transcriptData: {
        sourceKey: params.sourceKey,
        sourceType: 'youtube',
        platform: 'YouTube',
        providerEngine: 'youtube_pending',
        pacingMode: normalizePacingMode(params.pacingMode),
        raw: emptyRaw,
        reviewed: null,
        reviewStatus: 'pending',
        reviewError: '',
        transcriptStatus: params.status,
        transcriptError: params.errorMessage,
        speakerOverrides: {},
      },
      transcriptStatus: params.status,
      transcriptError: params.errorMessage,
      reviewStatus: 'pending',
      speakerCount: 1,
      repairCount: 0,
      wordCount: 0,
      thumbnailUrl,
      accentDialect: 'Spoken English',
      durationSeconds: params.existing?.durationSeconds || 0,
      pacingWpm: 145,
      difficulty: 'Intermediate',
      cefrLevel: '',
      sentencesCount: 0,
      chunksCount: 0,
      analysisStatus: 'pending',
      stats: {
        totalWords: 0,
        sentencesCount: 0,
        connectedCount: 0,
        expressionsCount: 0,
        vocabularyCount: 0,
      },
      chunks: [],
      sentences: [],
      studyNotes: params.existing?.studyNotes || '',
      noteMarkdown: `# ${meta.title}\n\n${params.mediaInfo.canonicalUrl}\n`,
      translationEngineVersion: 4,
      timingVersion: 2,
      segmentationVersion: 2,
      createdAt: params.existing?.createdAt || new Date().toISOString(),
      completedDrills: params.existing?.completedDrills || 0,
    };

    const saved = this.historyRepo.create(item, params.scope, { replaceExisting: false });
    return this.historyRepo.findById(saved.id, params.scope) || saved;
  }

  /**
   * Post-open action: retry fetching native YouTube captions (0% local CPU).
   */
  async retryYoutubeCaptions(historyId: string, scope?: RequestIdentityScope): Promise<HistoryItem> {
    const existing = this.assertOwnedLesson(historyId, scope);
    if (!existing.sourceUrl) {
      throw new BadRequestException('This lesson has no source URL to fetch captions from.');
    }
    const yt = await this.transcriptService.extract(existing.sourceUrl, true);
    const mode = normalizePacingMode(existing.pacingMode);
    const ytId = existing.videoId || this.extractYoutubeId(existing.sourceUrl);
    const rawSnapshot = buildRawTranscriptSnapshot({
      provider: yt.timed_words?.length ? 'youtube_json3' : 'youtube_captions',
      title: yt.title || existing.title || 'YouTube Video Lesson',
      creator: yt.creator || existing.creator || 'YouTube Creator',
      url: existing.sourceUrl,
      mediaId: ytId,
      durationSeconds: yt.duration_seconds || existing.durationSeconds || 0,
      fullText: yt.full_raw_transcript,
      cues: yt.cues,
      timedWords: yt.timed_words,
      pacingMode: mode,
    });
    if (rawSnapshot.sentences.length === 0) {
      throw new ServiceUnavailableException('No spoken sentences could be built from these captions.');
    }

    return this.applyNewTranscriptToLesson(
      existing,
      rawSnapshot,
      {
        title: yt.title && yt.title !== 'YouTube Shadowing Session' && yt.title !== 'YouTube Media Hub Session' ? yt.title : existing.title,
        creator: yt.creator && yt.creator !== 'YouTube Creator' ? yt.creator : existing.creator,
        durationSeconds: yt.duration_seconds || existing.durationSeconds || 0,
        providerEngine: rawSnapshot.provider,
        sourceLabel: 'YouTube · captions',
      },
      scope,
    );
  }

  /**
   * Post-open action: deterministically import pasted SRT, WebVTT, timestamped,
   * or plain-text transcript (0% local CPU, instant).
   */
  importManualTranscript(
    historyId: string,
    rawText: string,
    scope?: RequestIdentityScope,
  ): HistoryItem {
    const existing = this.assertOwnedLesson(historyId, scope);
    let parsed: ReturnType<typeof parseManualTranscriptInput>;
    try {
      parsed = parseManualTranscriptInput(rawText, existing.durationSeconds || 0);
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Could not parse transcript text.');
    }

    const mode = normalizePacingMode(existing.pacingMode);
    const rawSnapshot = buildRawTranscriptSnapshot({
      provider: `manual_${parsed.format}`,
      title: existing.title || 'Lesson',
      creator: existing.creator || 'Speaker',
      url: existing.sourceUrl || '',
      mediaId: existing.videoId || existing.media?.mediaId || '',
      durationSeconds: existing.durationSeconds || parsed.estimatedDurationSec || 0,
      fullText: parsed.fullText,
      cues: parsed.cues,
      timedWords: parsed.timedWords,
      pacingMode: mode,
    });
    if (rawSnapshot.sentences.length === 0) {
      throw new BadRequestException('No spoken sentences could be built from that transcript.');
    }

    return this.applyNewTranscriptToLesson(
      existing,
      rawSnapshot,
      {
        durationSeconds: existing.durationSeconds || parsed.estimatedDurationSec || 0,
        providerEngine: `manual_${parsed.format}`,
        sourceLabel: `${existing.platform || 'Lesson'} · imported`,
      },
      scope,
    );
  }

  /**
   * Third-party speech-to-text (Whisper / Groq / OpenAI) is intentionally disabled
   * for Media Hub URL ingestion so learners only receive original transcripts directly from the source provider.
   */
  async transcribeLessonExplicit(
    _historyId: string,
    _options: { allowLocalWhisper?: boolean } = {},
    _scope?: RequestIdentityScope,
  ): Promise<HistoryItem> {
    throw new BadRequestException({
      code: 'third_party_stt_disabled',
      message:
        'Third-party transcription (Whisper / Groq / OpenAI) is disabled. Media Hub only uses original transcripts directly from the source provider.',
    });
  }

  private applyNewTranscriptToLesson(
    existing: HistoryItem,
    rawSnapshot: RawTranscriptSnapshot,
    updates: {
      title?: string;
      creator?: string;
      durationSeconds?: number;
      providerEngine: string;
      sourceLabel: string;
    },
    scope?: RequestIdentityScope,
  ): HistoryItem {
    const mode = normalizePacingMode(existing.pacingMode);
    const rebuilt = this.buildMediaHubLessonItem({
      title: updates.title || existing.title,
      creator: updates.creator || existing.creator,
      sourceUrl: existing.sourceUrl,
      sourceKey: existing.sourceKey || existing.transcriptData?.sourceKey || '',
      sourceType: existing.transcriptData?.sourceType || 'youtube',
      platform: existing.platform || 'YouTube',
      thumbnailUrl: existing.thumbnailUrl || '',
      durationSeconds: updates.durationSeconds || existing.durationSeconds || 0,
      videoId: existing.videoId || existing.media?.mediaId || '',
      providerEngine: updates.providerEngine,
      media: existing.media || {
        hasAudio: true,
        hasVideo: true,
        mediaKind: existing.videoId ? 'youtube' : 'none',
        mediaId: existing.videoId || '',
        streamUrl: '',
        mimeType: existing.videoId ? 'video/youtube' : '',
        durationSeconds: updates.durationSeconds || 0,
      },
      raw: rawSnapshot,
      existing,
      pacingMode: mode,
      preserveProgress: true,
    });

    rebuilt.transcriptStatus = 'ready';
    rebuilt.transcriptError = '';
    if (rebuilt.transcriptData) {
      rebuilt.transcriptData.transcriptStatus = 'ready';
      rebuilt.transcriptData.transcriptError = '';
    }
    if (existing.studyNotes) rebuilt.studyNotes = existing.studyNotes;

    const saved = this.historyRepo.create(rebuilt, scope, { replaceExisting: false });
    this.syncSharedSource(scope?.userId, saved, {
      sourceKey: rebuilt.sourceKey || '',
      sourceType: rebuilt.transcriptData?.sourceType || 'youtube',
      platform: rebuilt.platform || 'YouTube',
      sourceLabel: updates.sourceLabel,
      media: rebuilt.media!,
      raw: rawSnapshot,
      sourceMeta: {
        platform: rebuilt.platform || 'YouTube',
        videoId: rebuilt.videoId,
        lessonId: saved.id,
        thumbnailUrl: rebuilt.thumbnailUrl,
      },
    });
    return this.historyRepo.findById(saved.id, scope) || saved;
  }

  private async ingestExternalMedia(
    mediaInfo: NonNullable<ReturnType<typeof classifyMediaUrl>>,
    ytId: string,
    sourceKey: string,
    existing: HistoryItem | undefined,
    scope: RequestIdentityScope | undefined,
    force: boolean,
    pacingMode: MediaHubPacingMode = 'short',
    skipSubtitles = false,
    sttOptions?: {
      allowLocalWhisper?: boolean;
      cloudStt?: { provider: 'groq' | 'openai'; apiKey: string; baseUrl?: string; model?: string } | null;
    },
  ): Promise<HistoryItem> {
    const opStartedAt = Date.now();
    const persistedDir = this.sharedSources.getMediaDir();
    const mediaResult = await this.mediaTranscription.transcribeUrl(mediaInfo.canonicalUrl, {
      wordTimestamps: true,
      skipSubtitles,
      persistMediaDir: mediaInfo.source === 'youtube' ? undefined : persistedDir,
      mediaId: mediaInfo.mediaId,
      force,
      allowLocalWhisper: Boolean(sttOptions?.allowLocalWhisper),
      cloudStt: sttOptions?.cloudStt ?? null,
    });

    if (
      wasMediaHubTargetDeletedAfter(
        scope?.userId,
        [sourceKey, ytId, mediaInfo.mediaId, existing?.id],
        opStartedAt,
      )
    ) {
      throw new BadRequestException('This lesson was deleted while processing.');
    }

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

    const media: MediaHubMediaPlayback = {
      hasAudio: true,
      hasVideo,
      mediaKind,
      mediaId,
      streamUrl: buildStreamUrl(mediaKind, mediaId),
      mimeType: mediaResult.mimeType || (isYouTubeFallback ? 'video/youtube' : ''),
      durationSeconds: mediaResult.durationSeconds || 0,
    };

    const item = this.buildMediaHubLessonItem({
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
      preserveProgress: !force,
    });

    const saved = this.historyRepo.create(item, scope, { replaceExisting: force });
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

  private buildMediaHubLessonItem(params: {
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
    media: MediaHubMediaPlayback;
    raw: RawTranscriptSnapshot;
    existing?: HistoryItem;
    pacingMode?: MediaHubPacingMode;
    preserveProgress?: boolean;
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
      track: 'media_hub',
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
        transcriptStatus: 'ready',
        transcriptError: '',
        speakerOverrides: {},
      },
      transcriptStatus: 'ready',
      transcriptError: '',
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
      studyNotes: params.preserveProgress !== false ? params.existing?.studyNotes || '' : '',
      noteMarkdown: this.historyRepo.buildCleanMarkdown(
        params.title,
        params.creator,
        params.sourceUrl,
        chunks,
      ),
      translationEngineVersion: 4,
      timingVersion: 2,
      segmentationVersion: 2,
      createdAt:
        params.preserveProgress !== false
          ? params.existing?.createdAt || new Date().toISOString()
          : new Date().toISOString(),
      completedDrills: params.preserveProgress !== false ? params.existing?.completedDrills || 0 : 0,
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
      media: MediaHubMediaPlayback;
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
