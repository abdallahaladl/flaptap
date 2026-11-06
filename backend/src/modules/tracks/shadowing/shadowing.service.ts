import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  ChunkItem,
  HistoryItem,
  HistoryRepository,
  RequestIdentityScope,
  SentenceItem,
} from '../../../core/database/history.repository';
import { TranscriptResult, TranscriptService } from './transcript.service';
import {
  ShadowingTranslationService,
  TranslationResponse,
} from './shadowing.translation.service';
import { ShadowingAnalysisService } from './shadowing.analysis.service';
import { segmentParagraphs, segmentSentences } from '../../../core/linguistics/segmentation';
import { classifyMediaUrl, EXTERNAL_MEDIA_ID_PATTERN } from '../../../core/media/media-url';

@Injectable()
export class ShadowingService {
  private readonly logger = new Logger(ShadowingService.name);
  private readonly inFlight = new Map<string, Promise<HistoryItem>>();

  constructor(
    private readonly historyRepo: HistoryRepository,
    private readonly transcriptService: TranscriptService,
    private readonly translationService: ShadowingTranslationService,
    private readonly analysisService: ShadowingAnalysisService,
  ) {}

  checkExisting(url: string, scope?: RequestIdentityScope) {
    const info = classifyMediaUrl(url);
    const videoId = info?.mediaId || '';
    const existing = this.historyRepo.findByUrlOrVideoId(url, videoId, scope);
    const transcriptCache = this.transcriptService.hasCache(videoId);
    if (!existing) {
      return {
        exists: transcriptCache.cached,
        id: null,
        title: transcriptCache.cached ? 'Raw transcript cached on disk' : null,
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
        sentencesCount: existing.sentencesCount || existing.sentences?.length || 0,
        completedDrills: existing.completedDrills || 0,
        analysisStatus: existing.analysisStatus,
        cachedTranslationLangs: translationLanguages,
      },
    };
  }

  /**
   * Extract captions, segment complete sentences and cohesive paragraphs,
   * persist to SQLite, and return immediately.
   *
   * Zero AI latency in the critical video-open path: dynamic AI Coach analysis
   * runs asynchronously on demand (`/api/tracks/shadowing/analyze`) and caches
   * permanently in SQLite.
   */
  async process(
    url: string,
    force = false,
    scope?: RequestIdentityScope,
  ): Promise<HistoryItem> {
    const cleanUrl = (url || '').trim();
    if (!cleanUrl) {
      throw new BadRequestException('A video or social media link is required.');
    }

    const info = classifyMediaUrl(cleanUrl);
    if (!info) {
      throw new BadRequestException('Please enter a valid video link (YouTube, TikTok, Instagram, X, Vimeo, TED, Loom, or direct media).');
    }
    const videoId = info.mediaId;

    const existing = this.historyRepo.findByUrlOrVideoId(cleanUrl, videoId, scope);
    const hasMedia = info.source !== 'external' || Boolean(this.transcriptService.resolveMediaFile(videoId));
    if (existing && !force && hasMedia) {
      this.logger.log(`SQLite cache hit for "${existing.title}" (${videoId})`);
      return existing;
    }

    const scopeKey = scope?.userId || 'user';
    const flightKey = `${scopeKey}:${videoId}:${force ? 'force' : 'std'}`;
    const running = this.inFlight.get(flightKey);
    if (running) return running;

    const promise = this.buildAndPersist(cleanUrl, existing, scope, force).finally(() =>
      this.inFlight.delete(flightKey),
    );

    this.inFlight.set(flightKey, promise);
    return promise;
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

  defineWord(
    historyId: string,
    word: string,
    sentenceIndex?: number,
    language?: string,
    scope?: RequestIdentityScope,
  ) {
    this.assertOwnedLesson(historyId, scope);
    return this.analysisService.defineWordInContext(historyId, word, sentenceIndex, language);
  }

  private async buildAndPersist(
    url: string,
    existing?: HistoryItem,
    scope?: RequestIdentityScope,
    force = false,
  ): Promise<HistoryItem> {
    const startedAt = Date.now();
    try {
      const data = await this.transcriptService.extract(url, force);
      const extractedAt = Date.now();

      const sentences = segmentSentences(data);
      if (sentences.length === 0) {
        throw new Error('No spoken sentences could be built from this video.');
      }
      const chunks = segmentParagraphs(sentences);

      const item = this.buildHistoryItem(data, chunks, sentences, url);
      if (existing) {
        item.id = existing.id;
        item.createdAt = existing.createdAt;
        item.completedDrills = existing.completedDrills || 0;
        item.studyNotes = existing.studyNotes || '';
      }

      const saved = this.historyRepo.create(item, scope);
      this.logger.log(
        `Lesson ready in ${Date.now() - startedAt}ms ` +
          `(captions ${extractedAt - startedAt}ms, ${sentences.length} sentences, ${chunks.length} paragraphs)`,
      );

      return saved;
    } catch (error: any) {
      this.logger.warn(
        `Caption pipeline failed for ${url} ` +
          `(${error instanceof HttpException ? error.getStatus() : 503}): ${error?.message || error}`,
      );
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        error?.message || 'Could not extract captions from this video.',
      );
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

  private buildHistoryItem(
    data: TranscriptResult,
    chunks: ChunkItem[],
    sentences: SentenceItem[],
    url: string,
  ): HistoryItem {
    const info = classifyMediaUrl(url);
    const videoId = data.video_id || info?.mediaId || this.extractYoutubeId(url);
    const isExternal =
      data.source === 'external' ||
      info?.source === 'external' ||
      EXTERNAL_MEDIA_ID_PATTERN.test(videoId);
    const platform = data.platform || info?.platform || (isExternal ? 'Web Video' : 'YouTube');

    let thumbnailUrl = data.thumbnail_url || '';
    if (!thumbnailUrl && !isExternal && videoId) {
      thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }

    const totalWords =
      sentences.reduce(
        (sum, s) => sum + (s.text || '').split(/\s+/).filter(Boolean).length,
        0,
      ) || 1;

    const durationSeconds = Math.max(
      1,
      Math.round(
        Number(data.duration_seconds) ||
          (sentences.length > 0 ? sentences[sentences.length - 1].endSec : 60),
      ),
    );
    const pacingWpm = Math.max(60, Math.round(totalWords / Math.max(durationSeconds / 60, 0.25)) || 150);

    const difficulty: HistoryItem['difficulty'] =
      pacingWpm >= 175 || totalWords > 1100
        ? 'Advanced'
        : pacingWpm >= 135 || totalWords > 350
          ? 'Intermediate'
          : 'Beginner';

    return {
      id: uuidv4(),
      track: 'shadowing',
      trackTitle: isExternal ? `${platform} Lesson` : 'Video Lesson',
      title: data.title || (isExternal ? `${platform} Video Lesson` : 'YouTube Video Lesson'),
      creator: data.creator || (isExternal ? platform : 'YouTube Creator'),
      videoId,
      sourceUrl: url,
      thumbnailUrl,
      accentDialect: isExternal ? `${platform} Spoken English` : 'Spoken English',
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
      studyNotes: '',
      noteMarkdown: this.historyRepo.buildCleanMarkdown(
        data.title || (isExternal ? `${platform} Video Lesson` : 'YouTube Video Lesson'),
        data.creator || (isExternal ? platform : 'YouTube Creator'),
        url,
        chunks,
      ),
      translationEngineVersion: 4,
      timingVersion: 2,
      segmentationVersion: 2,
      createdAt: new Date().toISOString(),
      completedDrills: 0,
    };
  }
}
