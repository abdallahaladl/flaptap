import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import { HistoryRepository } from '../../../core/database/history.repository';
import { segmentSentences } from '../../../core/linguistics/segmentation';
import { classifyMediaUrl, detectPlatformLabel } from '../../../core/media/media-url';
import { extractTextFromPdfBuffer } from '../../shared-sources/pdf-text.util';
import {
  buildCanonicalSourceKey,
  extractYouTubeVideoId,
  SharedSourcesService,
} from '../../shared-sources/shared-sources.service';
import { SharedMediaKind, SourceSegment } from '../../shared-sources/shared-sources.types';
import { TranscriptService } from '../../tracks/shadowing/transcript.service';
import { ResolvedSource } from '../american-extractor.types';
import { cleanSourceText, countWords, truncateSource } from '../utils/source-text.util';
import { parseSubtitleSegments } from '../utils/timestamp-anchor.util';
import { ArticleReaderService } from './article-reader.service';
import { MediaTranscriptionService } from './media-transcription.service';
import { VisionOcrService } from './vision-ocr.service';

const MEDIA_EXTENSIONS =
  /\.(mp3|m4a|wav|aac|flac|ogg|opus|mp4|mov|m4v|webm|mkv|avi|mpg|mpeg)(?:$|\?)/i;
const TEXT_EXTENSIONS = /\.(txt|md|markdown|srt|vtt|json|text|log|csv)$/i;
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif)$/i;
const PDF_EXTENSION = /\.pdf$/i;

const MEDIA_FIRST_PLATFORMS = new Set([
  'TikTok',
  'Instagram',
  'Vimeo',
  'Twitch',
  'Loom',
  'Dailymotion',
  'YouTube',
  'Direct Media',
]);

@Injectable()
export class SourceResolverService {
  private readonly logger = new Logger(SourceResolverService.name);

  constructor(
    private readonly transcriptService: TranscriptService,
    private readonly articleReader: ArticleReaderService,
    private readonly mediaTranscription: MediaTranscriptionService,
    private readonly visionOcr: VisionOcrService,
    private readonly historyRepo: HistoryRepository,
    private readonly sharedSources: SharedSourcesService,
  ) {}

  async resolveSharedSource(userId: string, sourceId: string): Promise<ResolvedSource> {
    const id = String(sourceId || '').trim();
    if (!id) throw new BadRequestException('Choose a saved Flaptap source.');

    const record = this.sharedSources.findById(userId, id);
    if (!record) {
      throw new NotFoundException('That saved source was not found in your library.');
    }
    const text = cleanSourceText(record.transcriptText);
    if (text.length < 20) {
      throw new BadRequestException('That saved source has no readable text to extract from.');
    }

    return this.finalize({
      sourceId: record.id,
      sourceKey: record.sourceKey,
      title: record.title || 'Saved Source',
      creator: record.creator || 'Flaptap Library',
      sourceType: record.sourceType,
      sourceUrl: record.sourceUrl || '',
      sourceLabel: record.sourceLabel || 'Reused shared source',
      text,
      hasAudio: record.hasAudio,
      hasVideo: record.hasVideo,
      mediaKind: record.mediaKind,
      mediaId: record.mediaId,
      durationSeconds: record.durationSeconds,
      segments: record.segments,
      sourceMeta: {
        ...(record.sourceMeta || {}),
        sourceId: record.id,
        reusedSharedSource: true,
        wordCount: countWords(text),
      },
      warnings: [],
      truncated: false,
    });
  }

  async resolveText(text: string, title?: string, userId?: string): Promise<ResolvedSource> {
    const raw = String(text || '');
    const subtitleSegments = parseSubtitleSegments(raw);
    const cleaned = cleanSourceText(raw);
    if (cleaned.length < 20) {
      throw new BadRequestException('Paste at least a couple of sentences to extract from.');
    }
    const sourceKey = buildCanonicalSourceKey({ sourceType: 'text', text: cleaned });
    let sourceId = '';
    const resolvedTitle = String(title || '').trim() || firstLineTitle(cleaned) || 'Pasted English Text';

    if (userId) {
      const saved = this.sharedSources.upsert(userId, {
        sourceKey,
        sourceType: 'text',
        title: resolvedTitle,
        creator: 'Pasted text',
        sourceLabel: subtitleSegments.length > 0 ? 'Transcript · timed cues' : 'Pasted text',
        hasAudio: false,
        hasVideo: false,
        mediaKind: 'none',
        transcriptText: cleaned,
        segments: subtitleSegments,
        sourceMeta: { wordCount: countWords(cleaned) },
      });
      sourceId = saved.id;
    }

    return this.finalize({
      sourceId,
      sourceKey,
      title: resolvedTitle,
      creator: 'Pasted text',
      sourceType: 'text',
      sourceUrl: '',
      sourceLabel: subtitleSegments.length > 0 ? 'Transcript · timed cues' : 'Pasted text',
      text: cleaned,
      hasAudio: false,
      hasVideo: false,
      mediaKind: 'none',
      mediaId: '',
      segments: subtitleSegments,
      sourceMeta: {
        ...(sourceId ? { sourceId } : {}),
        wordCount: countWords(cleaned),
      },
      warnings: [],
      truncated: false,
    });
  }

  async resolveLesson(userId: string, lessonId: string): Promise<ResolvedSource> {
    const id = String(lessonId || '').trim();
    if (!id) throw new BadRequestException('Choose a saved lesson transcript.');

    const lesson = this.historyRepo.findById(id, { userId });
    if (!lesson) {
      throw new NotFoundException('That saved lesson was not found in your library.');
    }

    const segments: SourceSegment[] = (lesson.sentences || [])
      .map((s) => ({
        startSec: Number(s.startSec) || 0,
        endSec: Number(s.endSec) || 0,
        text: String(s.text || '').trim(),
      }))
      .filter((s) => s.text.length > 0 && s.endSec > s.startSec);

    const sentenceText = (lesson.sentences || [])
      .map((sentence) => String(sentence.text || '').trim())
      .filter(Boolean)
      .join(' ');
    const fallbackText = String(lesson.studyNotes || '').trim();
    const text = cleanSourceText(sentenceText || fallbackText);

    if (text.length < 20) {
      throw new BadRequestException(
        'That lesson has no transcript text to extract from. Open it in the Studio first.',
      );
    }

    const vidId = String(lesson.videoId || extractYouTubeVideoId(lesson.sourceUrl || '') || '').trim();
    const isYouTubeId = /^[a-zA-Z0-9_-]{11}$/.test(vidId);
    const hasAudio = Boolean(vidId);
    const hasVideo = Boolean(vidId);
    const mediaKind: SharedMediaKind = isYouTubeId ? 'youtube' : vidId ? 'video' : 'none';

    const sourceKey = buildCanonicalSourceKey({
      sourceType: isYouTubeId ? 'youtube' : 'lesson',
      sourceUrl: lesson.sourceUrl || '',
      videoId: isYouTubeId ? vidId : undefined,
      lessonId: lesson.id,
    });

    const shared = this.sharedSources.upsert(userId, {
      sourceKey,
      sourceType: isYouTubeId ? 'youtube' : 'lesson',
      title: lesson.title || 'Saved Lesson Transcript',
      creator: lesson.creator || 'Saved lesson',
      sourceUrl: lesson.sourceUrl || '',
      sourceLabel: `${lesson.trackTitle || 'Saved lesson'} · transcript`,
      hasAudio,
      hasVideo,
      mediaKind,
      mediaId: vidId,
      durationSeconds: lesson.durationSeconds || 0,
      transcriptText: text,
      segments,
      sourceMeta: {
        lessonId: lesson.id,
        lessonTrack: lesson.track,
        videoId: vidId || undefined,
        durationSeconds: lesson.durationSeconds || 0,
        thumbnailUrl: lesson.thumbnailUrl || '',
      },
    });
    this.sharedSources.linkLessonToSource(userId, lesson.id, shared.id);

    return this.finalize({
      sourceId: shared.id,
      sourceKey,
      title: lesson.title || 'Saved Lesson Transcript',
      creator: lesson.creator || 'Saved lesson',
      sourceType: isYouTubeId ? 'youtube' : 'lesson',
      sourceUrl: lesson.sourceUrl || '',
      sourceLabel: `${lesson.trackTitle || 'Saved lesson'} · transcript`,
      text,
      hasAudio,
      hasVideo,
      mediaKind,
      mediaId: vidId,
      durationSeconds: lesson.durationSeconds || 0,
      segments,
      sourceMeta: {
        sourceId: shared.id,
        lessonId: lesson.id,
        lessonTrack: lesson.track,
        videoId: vidId || undefined,
        durationSeconds: lesson.durationSeconds || 0,
        wordCount: countWords(text),
        reusedSharedSource: true,
      },
      warnings: [],
      truncated: false,
    });
  }

  async resolveUrl(
    url: string,
    options: { keyId?: string; model?: string; variant?: string; userId?: string; force?: boolean } = {},
  ): Promise<ResolvedSource> {
    const raw = String(url || '').trim();
    if (!raw) throw new BadRequestException('Enter a video, social, audio, or article URL.');

    const mediaInfo = classifyMediaUrl(raw);
    const hostname = safeHostname(raw);
    const platform = mediaInfo?.platform || detectPlatformLabel(hostname);
    const ytId = mediaInfo?.source === 'youtube' ? extractYouTubeVideoId(raw) : '';

    // Zero-duplication shared source cache check before any network / subprocess call
    if (options.userId && !options.force) {
      const key = buildCanonicalSourceKey({ sourceUrl: raw, videoId: ytId || undefined });
      const cached = this.sharedSources.findByKey(options.userId, key);
      if (cached && cached.transcriptText.trim().length >= 20) {
        this.logger.log(`Shared source cache hit ${cached.id} (${cached.sourceKey})`);
        return this.resolveSharedSource(options.userId, cached.id);
      }
    }

    if (mediaInfo?.source === 'youtube') {
      try {
        return await this.resolveYouTube(raw, options.userId);
      } catch (error: any) {
        this.logger.warn(`YouTube captions unavailable, falling back to speech: ${error?.message}`);
        try {
          const media = await this.mediaTranscription.transcribeUrl(raw);
          return this.fromMediaTranscript(media, raw, 'youtube', 'YouTube', { videoId: ytId }, options.userId, {
            hasAudio: true,
            hasVideo: true,
            mediaKind: ytId ? 'youtube' : 'none',
            mediaId: ytId,
          });
        } catch (speechError: any) {
          throw new BadRequestException(
            `Could not read that YouTube video. ${error?.message || ''} ${speechError?.message || ''}`.trim(),
          );
        }
      }
    }

    const mediaFirst = MEDIA_FIRST_PLATFORMS.has(platform) || MEDIA_EXTENSIONS.test(raw);
    const textFirst = !mediaFirst;

    if (textFirst) {
      try {
        const article = await this.articleReader.read(raw);
        if (article.kind === 'text') {
          return this.fromArticle(article, options.userId);
        }
        const media = await this.mediaTranscription.transcribeUrl(raw);
        return this.fromMediaTranscript(
          media,
          raw,
          mediaKindFor(article.platform),
          article.platform,
          {},
          options.userId,
          { hasAudio: true, hasVideo: mediaKindFor(article.platform) !== 'audio', mediaKind: 'none', mediaId: '' },
        );
      } catch (articleError: any) {
        try {
          const media = await this.mediaTranscription.transcribeUrl(raw);
          return this.fromMediaTranscript(
            media,
            raw,
            mediaKindFor(platform),
            platform,
            {},
            options.userId,
            { hasAudio: true, hasVideo: mediaKindFor(platform) !== 'audio', mediaKind: 'none', mediaId: '' },
          );
        } catch (mediaError: any) {
          throw new BadRequestException(
            `Could not extract readable text from that URL. ${articleError?.message || mediaError?.message || ''}`.trim(),
          );
        }
      }
    }

    try {
      const media = await this.mediaTranscription.transcribeUrl(raw);
      return this.fromMediaTranscript(
        media,
        raw,
        mediaKindFor(platform),
        platform,
        {},
        options.userId,
        { hasAudio: true, hasVideo: mediaKindFor(platform) !== 'audio', mediaKind: 'none', mediaId: '' },
      );
    } catch (mediaError: any) {
      try {
        const article = await this.articleReader.read(raw);
        if (article.kind === 'text') return this.fromArticle(article, options.userId);
      } catch {
        // Surface the media failure: it is the expected path for these platforms.
      }
      throw new BadRequestException(mediaError?.message || 'Could not extract that media URL.');
    }
  }

  async resolveUpload(params: {
    userId: string;
    buffer: Buffer;
    originalName: string;
    mimeType?: string;
    keyId?: string;
    model?: string;
    variant?: string;
    force?: boolean;
  }): Promise<ResolvedSource> {
    const buffer = params.buffer;
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('The uploaded file is empty.');
    }

    const originalName = String(params.originalName || 'upload').trim();
    const extension = path.extname(originalName).toLowerCase();
    const mimeType = String(params.mimeType || '').toLowerCase();
    const displayName = prettifyFileName(originalName);
    const fileKey = buildCanonicalSourceKey({ fileBuffer: buffer });

    // Reuse previously processed uploaded file (avoid duplicate upload, transcription, OCR, or parsing)
    if (params.userId && !params.force) {
      const cached = this.sharedSources.findByKey(params.userId, fileKey);
      if (cached && cached.transcriptText.trim().length >= 12) {
        this.logger.log(`Reused uploaded shared source ${cached.id} (${originalName})`);
        return this.resolveSharedSource(params.userId, cached.id);
      }
    }

    // 1. PDF Documents
    if (mimeType === 'application/pdf' || PDF_EXTENSION.test(extension)) {
      let pdfResult: { text: string; pageCount: number };
      try {
        pdfResult = extractTextFromPdfBuffer(buffer);
      } catch (err: any) {
        throw new BadRequestException(err?.message || 'Could not read that PDF document.');
      }
      const cleaned = cleanSourceText(pdfResult.text);
      if (cleaned.length < 20) {
        throw new BadRequestException(
          'No selectable text was found in this PDF (it may be a scanned image PDF). Take a screenshot of the page and upload the image for OCR instead.',
        );
      }
      const saved = this.sharedSources.upsert(params.userId, {
        sourceKey: fileKey,
        sourceType: 'pdf',
        title: displayName || 'PDF Document',
        creator: 'PDF document',
        sourceLabel: `PDF · ${pdfResult.pageCount} page${pdfResult.pageCount === 1 ? '' : 's'}`,
        mimeType: 'application/pdf',
        fileName: originalName,
        hasAudio: false,
        hasVideo: false,
        mediaKind: 'none',
        transcriptText: cleaned,
        sourceMeta: {
          fileName: originalName,
          mimeType: 'application/pdf',
          pageCount: pdfResult.pageCount,
          wordCount: countWords(cleaned),
        },
      });
      return this.finalize({
        sourceId: saved.id,
        sourceKey: fileKey,
        title: saved.title,
        creator: saved.creator,
        sourceType: 'pdf',
        sourceUrl: '',
        sourceLabel: saved.sourceLabel,
        text: cleaned,
        hasAudio: false,
        hasVideo: false,
        mediaKind: 'none',
        mediaId: '',
        segments: [],
        sourceMeta: {
          sourceId: saved.id,
          fileName: originalName,
          mimeType: 'application/pdf',
          pageCount: pdfResult.pageCount,
          wordCount: countWords(cleaned),
        },
        warnings: [],
        truncated: false,
      });
    }

    // 2. Images (Vision OCR)
    if (mimeType.startsWith('image/') || IMAGE_EXTENSIONS.test(extension)) {
      const ocr = await this.visionOcr.transcribeImage({
        userId: params.userId,
        buffer,
        mimeType,
        keyId: params.keyId,
        model: params.model,
        variant: params.variant,
        title: displayName,
      });
      const cleaned = cleanSourceText(ocr.text);
      if (cleaned.length < 12) {
        throw new BadRequestException('The image OCR result was too short to study.');
      }
      const saved = this.sharedSources.upsert(params.userId, {
        sourceKey: fileKey,
        sourceType: 'image',
        title: displayName || 'Screenshot',
        creator: 'Image OCR',
        sourceLabel: `Image OCR · ${ocr.modelUsed}`,
        mimeType,
        fileName: originalName,
        hasAudio: false,
        hasVideo: false,
        mediaKind: 'none',
        transcriptText: cleaned,
        sourceMeta: { mimeType, fileName: originalName, wordCount: countWords(cleaned), ocrModel: ocr.modelUsed },
      });
      return this.finalize({
        sourceId: saved.id,
        sourceKey: fileKey,
        title: displayName || 'Screenshot',
        creator: 'Image OCR',
        sourceType: 'image',
        sourceUrl: '',
        sourceLabel: `Image OCR · ${ocr.modelUsed}`,
        text: cleaned,
        hasAudio: false,
        hasVideo: false,
        mediaKind: 'none',
        mediaId: '',
        segments: [],
        sourceMeta: {
          sourceId: saved.id,
          mimeType,
          fileName: originalName,
          wordCount: countWords(cleaned),
          ocrModel: ocr.modelUsed,
        },
        warnings: [],
        truncated: false,
      });
    }

    // 3. Audio / Video Uploads (persisted once under data/media/ for original segment playback!)
    const mediaExtension = MEDIA_EXTENSIONS.test(extension);
    const mediaMime =
      mimeType.startsWith('audio/') ||
      mimeType.startsWith('video/') ||
      mimeType === 'application/ogg' ||
      (mimeType === 'application/octet-stream' && mediaExtension);

    if (mediaMime || mediaExtension) {
      const persisted = this.sharedSources.persistMediaBuffer(buffer, originalName, mimeType);
      const media = await this.mediaTranscription.transcribeFile(persisted.filePath, {
        title: displayName,
        creator: 'Uploaded media',
      });
      return this.fromMediaTranscript(
        media,
        '',
        persisted.hasVideo ? 'video' : 'audio',
        'Uploaded file',
        {
          fileName: originalName,
          mimeType: persisted.mimeType,
        },
        params.userId,
        {
          sourceKey: fileKey,
          hasAudio: persisted.hasAudio,
          hasVideo: persisted.hasVideo,
          mediaKind: persisted.mediaKind,
          mediaId: persisted.mediaId,
          mimeType: persisted.mimeType,
          fileName: originalName,
        },
      );
    }

    // 4. Text / Markdown / Subtitles (.srt/.vtt) / JSON transcripts
    if (
      mimeType.startsWith('text/') ||
      TEXT_EXTENSIONS.test(extension) ||
      mimeType === 'application/json' ||
      mimeType === ''
    ) {
      const decoded = decodeTextBuffer(buffer);
      const subtitleSegments = parseSubtitleSegments(decoded);
      const extracted = extension === '.json' ? extractTextFromJson(decoded) : '';
      const text = cleanSourceText(extracted || decoded);
      if (text.length < 20) {
        throw new BadRequestException('That file did not contain enough readable text.');
      }
      const sourceType = extension === '.md' || extension === '.markdown' ? 'markdown' : 'text';
      const sourceLabel =
        subtitleSegments.length > 0
          ? 'Subtitle transcript'
          : `${extension === '.md' ? 'Markdown' : 'Text'} upload`;

      const saved = this.sharedSources.upsert(params.userId, {
        sourceKey: fileKey,
        sourceType,
        title: displayName || 'Uploaded notes',
        creator: 'Uploaded file',
        sourceLabel,
        mimeType,
        fileName: originalName,
        hasAudio: false,
        hasVideo: false,
        mediaKind: 'none',
        transcriptText: text,
        segments: subtitleSegments,
        sourceMeta: { fileName: originalName, mimeType, wordCount: countWords(text) },
      });

      return this.finalize({
        sourceId: saved.id,
        sourceKey: fileKey,
        title: displayName || 'Uploaded notes',
        creator: 'Uploaded file',
        sourceType,
        sourceUrl: '',
        sourceLabel,
        text,
        hasAudio: false,
        hasVideo: false,
        mediaKind: 'none',
        mediaId: '',
        segments: subtitleSegments,
        sourceMeta: { sourceId: saved.id, fileName: originalName, mimeType, wordCount: countWords(text) },
        warnings: [],
        truncated: false,
      });
    }

    throw new BadRequestException(
      'Unsupported file type. Upload PDF, text, Markdown, subtitles (.srt/.vtt), JSON, an image, or audio/video.',
    );
  }

  private async resolveYouTube(url: string, userId?: string): Promise<ResolvedSource> {
    const transcript = await this.transcriptService.extract(url);
    const segmented = segmentSentences(transcript);
    const segments: SourceSegment[] =
      segmented.length > 0
        ? segmented.map((s) => ({
            startSec: Number(s.startSec) || 0,
            endSec: Number(s.endSec) || 0,
            text: String(s.text || '').trim(),
          }))
        : (transcript.cues || []).map((c) => ({
            startSec: Number(c.start_sec) || 0,
            endSec: Number(c.end_sec) || 0,
            text: String(c.text || '').trim(),
          }));

    const text = cleanSourceText(
      segmented.length > 0
        ? segmented.map((s) => s.text).join(' ')
        : transcript.full_raw_transcript ||
            (transcript.sentences || []).map((sentence: any) => sentence.text).join(' '),
    );
    if (text.length < 20) {
      throw new Error('That video returned no usable transcript.');
    }

    const videoId = String(transcript.video_id || extractYouTubeVideoId(url) || '');
    const sourceKey = buildCanonicalSourceKey({ sourceType: 'youtube', sourceUrl: transcript.url || url, videoId });
    let sourceId = '';

    if (userId) {
      const saved = this.sharedSources.upsert(userId, {
        sourceKey,
        sourceType: 'youtube',
        title: transcript.title || 'YouTube Video',
        creator: transcript.creator || 'YouTube creator',
        sourceUrl: transcript.url || url,
        sourceLabel: 'YouTube · captions',
        hasAudio: true,
        hasVideo: true,
        mediaKind: videoId ? 'youtube' : 'none',
        mediaId: videoId,
        durationSeconds: transcript.duration_seconds || 0,
        transcriptText: text,
        segments,
        sourceMeta: {
          platform: 'YouTube',
          engine: 'captions',
          videoId,
          durationSeconds: transcript.duration_seconds || 0,
          thumbnailUrl: transcript.thumbnail_url || '',
        },
      });
      sourceId = saved.id;
    }

    return this.finalize({
      sourceId,
      sourceKey,
      title: transcript.title || 'YouTube Video',
      creator: transcript.creator || 'YouTube creator',
      sourceType: 'youtube',
      sourceUrl: transcript.url || url,
      sourceLabel: 'YouTube · captions',
      text,
      hasAudio: true,
      hasVideo: true,
      mediaKind: videoId ? 'youtube' : 'none',
      mediaId: videoId,
      durationSeconds: transcript.duration_seconds || 0,
      segments,
      sourceMeta: {
        ...(sourceId ? { sourceId } : {}),
        platform: 'YouTube',
        engine: 'captions',
        videoId,
        durationSeconds: transcript.duration_seconds || 0,
        wordCount: countWords(text),
        thumbnailUrl: transcript.thumbnail_url || '',
      },
      warnings: [],
      truncated: false,
    });
  }

  private fromArticle(article: any, userId?: string): ResolvedSource {
    const labelPlatform =
      article.platform && article.platform !== 'Web Video' ? article.platform : 'Web';
    const text = cleanSourceText(article.text);
    const sourceUrl = article.finalUrl || '';
    const sourceKey = buildCanonicalSourceKey({ sourceType: 'article', sourceUrl, text });
    let sourceId = '';

    if (userId) {
      const saved = this.sharedSources.upsert(userId, {
        sourceKey,
        sourceType: 'article',
        title: article.title || 'Web Article',
        creator: article.creator || labelPlatform,
        sourceUrl,
        sourceLabel: `${labelPlatform} · article`,
        mimeType: article.contentType || '',
        hasAudio: false,
        hasVideo: false,
        mediaKind: 'none',
        transcriptText: text,
        sourceMeta: {
          platform: article.platform === 'Web Video' ? 'Web' : article.platform,
          contentType: article.contentType,
          ...(article.metadata || {}),
        },
      });
      sourceId = saved.id;
    }

    return this.finalize({
      sourceId,
      sourceKey,
      title: article.title || 'Web Article',
      creator: article.creator || labelPlatform,
      sourceType: 'article',
      sourceUrl,
      sourceLabel: `${labelPlatform} · article`,
      text,
      hasAudio: false,
      hasVideo: false,
      mediaKind: 'none',
      mediaId: '',
      segments: [],
      sourceMeta: {
        ...(sourceId ? { sourceId } : {}),
        platform: article.platform === 'Web Video' ? 'Web' : article.platform,
        contentType: article.contentType,
        wordCount: countWords(text),
        ...(article.metadata || {}),
      },
      warnings: [],
      truncated: false,
    });
  }

  private fromMediaTranscript(
    media: any,
    url: string,
    sourceType: ResolvedSource['sourceType'],
    platform: string,
    extraMeta: Record<string, any> = {},
    userId?: string,
    mediaOpts: {
      sourceKey?: string;
      hasAudio?: boolean;
      hasVideo?: boolean;
      mediaKind?: SharedMediaKind;
      mediaId?: string;
      mimeType?: string;
      fileName?: string;
    } = {},
  ): ResolvedSource {
    const text = cleanSourceText(media.text);
    if (text.length < 20) {
      throw new Error('No usable speech text was found in that media.');
    }
    const segments: SourceSegment[] = Array.isArray(media.segments)
      ? media.segments
          .map((seg: any) => ({
            startSec: Number(seg?.start ?? seg?.startSec ?? 0),
            endSec: Number(seg?.end ?? seg?.endSec ?? 0),
            text: String(seg?.text || '').trim(),
          }))
          .filter((seg: SourceSegment) => seg.text.length > 0 && seg.endSec > seg.startSec)
      : [];

    const hasAudio = mediaOpts.hasAudio !== false;
    const hasVideo = Boolean(mediaOpts.hasVideo);
    const mediaKind: SharedMediaKind = mediaOpts.mediaKind || 'none';
    const mediaId = String(mediaOpts.mediaId || '');
    const sourceKey =
      mediaOpts.sourceKey ||
      buildCanonicalSourceKey({ sourceType, sourceUrl: url, videoId: mediaKind === 'youtube' ? mediaId : undefined, text });
    const title = media.title || `${platform || 'Media'} Transcript`;
    const creator = media.creator || platform || 'Spoken media';
    const sourceLabel = `${platform || 'Media'} · ${
      media.engine === 'platform_subtitles' ? 'captions' : 'speech-to-text'
    }`;

    let sourceId = '';
    if (userId) {
      const saved = this.sharedSources.upsert(userId, {
        sourceKey,
        sourceType,
        title,
        creator,
        sourceUrl: url,
        sourceLabel,
        mimeType: mediaOpts.mimeType || '',
        fileName: mediaOpts.fileName || '',
        hasAudio,
        hasVideo,
        mediaKind,
        mediaId,
        durationSeconds: Number(media.durationSeconds) || 0,
        transcriptText: text,
        segments,
        sourceMeta: {
          platform,
          engine: media.engine,
          model: media.model,
          durationSeconds: Number(media.durationSeconds) || 0,
          cached: Boolean(media.cached),
          ...(extraMeta || {}),
        },
      });
      sourceId = saved.id;
    }

    const warnings = [...(media.warnings || [])];
    return this.finalize({
      sourceId,
      sourceKey,
      title,
      creator,
      sourceType,
      sourceUrl: url,
      sourceLabel,
      text,
      hasAudio,
      hasVideo,
      mediaKind,
      mediaId,
      durationSeconds: Number(media.durationSeconds) || 0,
      segments,
      sourceMeta: {
        ...(sourceId ? { sourceId } : {}),
        platform,
        engine: media.engine,
        model: media.model,
        durationSeconds: Number(media.durationSeconds) || 0,
        wordCount: countWords(text),
        cached: Boolean(media.cached),
        ...(extraMeta || {}),
      },
      warnings,
      truncated: Boolean(media.truncated),
    });
  }

  private finalize(source: ResolvedSource): ResolvedSource {
    const { text, truncated } = truncateSource(source.text);
    const warnings = [...(source.warnings || [])];
    if (truncated && !source.truncated) {
      warnings.push('Only the first part of this source was sent to the model.');
    }
    return {
      ...source,
      text,
      truncated,
      warnings,
      hasAudio: Boolean(source.hasAudio),
      hasVideo: Boolean(source.hasVideo),
      mediaKind: source.mediaKind || 'none',
      mediaId: source.mediaId || '',
      durationSeconds: Number(source.durationSeconds) || 0,
      segments: Array.isArray(source.segments) ? source.segments : [],
      sourceMeta: {
        ...(source.sourceMeta || {}),
        hasAudio: Boolean(source.hasAudio),
        hasVideo: Boolean(source.hasVideo),
        mediaKind: source.mediaKind || 'none',
        ...(source.mediaId ? { mediaId: source.mediaId } : {}),
        wordCount: countWords(text),
      },
    };
  }
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function mediaKindFor(platform: string): ResolvedSource['sourceType'] {
  if (platform === 'YouTube') return 'youtube';
  if (['TikTok', 'Instagram', 'X', 'Threads', 'Bluesky', 'LinkedIn', 'Reddit', 'Facebook'].includes(platform)) {
    return 'social_video';
  }
  if (platform === 'Direct Media') return 'audio';
  return 'video';
}

function decodeTextBuffer(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    return buffer.toString('utf8');
  }
}

function prettifyFileName(name: string): string {
  const base = path.basename(name || 'upload');
  const withoutExtension = base.replace(/\.[a-z0-9]{1,8}$/i, '');
  const cleaned = withoutExtension.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Uploaded source';
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase()).slice(0, 120);
}

function firstLineTitle(text: string): string {
  const first = String(text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && line.length < 120);
  return first || '';
}

function extractTextFromJson(raw: string): string {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return '';
  }

  if (Array.isArray(parsed?.events)) {
    const parts: string[] = [];
    for (const event of parsed.events) {
      for (const segment of event?.segs || []) {
        if (typeof segment?.utf8 === 'string') parts.push(segment.utf8);
      }
    }
    return parts.join('');
  }

  if (typeof parsed?.text === 'string') return parsed.text;
  if (typeof parsed?.transcript === 'string') return parsed.transcript;
  if (Array.isArray(parsed?.sentences)) {
    return parsed.sentences
      .map((s: any) => (typeof s === 'string' ? s : s?.text || ''))
      .filter(Boolean)
      .join(' ');
  }
  if (Array.isArray(parsed?.segments)) {
    return parsed.segments
      .map((s: any) => (typeof s === 'string' ? s : s?.text || ''))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}
