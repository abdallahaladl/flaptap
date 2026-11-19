import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HistoryRepository } from '../../../core/database/history.repository';
import { classifyMediaUrl, detectPlatformLabel } from '../../../core/media/media-url';
import { TranscriptService } from '../../tracks/shadowing/transcript.service';
import { ResolvedSource } from '../american-extractor.types';
import { cleanSourceText, countWords, truncateSource } from '../utils/source-text.util';
import { ArticleReaderService } from './article-reader.service';
import { MediaTranscriptionService } from './media-transcription.service';
import { VisionOcrService } from './vision-ocr.service';

const MEDIA_EXTENSIONS =
  /\.(mp3|m4a|wav|aac|flac|ogg|opus|mp4|mov|m4v|webm|mkv|avi|mpg|mpeg)(?:$|\?)/i;
const TEXT_EXTENSIONS = /\.(txt|md|markdown|srt|vtt|json|text|log|csv)$/i;
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif)$/i;

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
  ) {}

  async resolveText(text: string, title?: string): Promise<ResolvedSource> {
    const cleaned = cleanSourceText(text);
    if (cleaned.length < 20) {
      throw new BadRequestException('Paste at least a couple of sentences to extract from.');
    }
    return this.finalize({
      title: String(title || '').trim() || firstLineTitle(cleaned) || 'Pasted English Text',
      creator: 'Pasted text',
      sourceType: 'text',
      sourceUrl: '',
      sourceLabel: 'Pasted text',
      text: cleaned,
      sourceMeta: { wordCount: countWords(cleaned) },
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

    return this.finalize({
      title: lesson.title || 'Saved Lesson Transcript',
      creator: lesson.creator || 'Saved lesson',
      sourceType: 'lesson',
      sourceUrl: lesson.sourceUrl || '',
      sourceLabel: `${lesson.trackTitle || 'Saved lesson'} · transcript`,
      text,
      sourceMeta: {
        lessonId: lesson.id,
        lessonTrack: lesson.track,
        durationSeconds: lesson.durationSeconds || 0,
        wordCount: countWords(text),
      },
      warnings: [],
      truncated: false,
    });
  }

  async resolveUrl(
    url: string,
    options: { keyId?: string; model?: string; variant?: string; userId?: string } = {},
  ): Promise<ResolvedSource> {
    const raw = String(url || '').trim();
    if (!raw) throw new BadRequestException('Enter a video, social, audio, or article URL.');

    const mediaInfo = classifyMediaUrl(raw);
    const hostname = safeHostname(raw);
    const platform = mediaInfo?.platform || detectPlatformLabel(hostname);

    if (mediaInfo?.source === 'youtube') {
      try {
        return await this.resolveYouTube(raw);
      } catch (error: any) {
        this.logger.warn(`YouTube captions unavailable, falling back to speech: ${error?.message}`);
        try {
          const media = await this.mediaTranscription.transcribeUrl(raw);
          return this.fromMediaTranscript(media, raw, 'youtube', 'YouTube');
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
          return this.fromArticle(article);
        }
        const media = await this.mediaTranscription.transcribeUrl(raw);
        return this.fromMediaTranscript(media, raw, mediaKindFor(article.platform), article.platform);
      } catch (articleError: any) {
        try {
          const media = await this.mediaTranscription.transcribeUrl(raw);
          return this.fromMediaTranscript(media, raw, mediaKindFor(platform), platform);
        } catch (mediaError: any) {
          throw new BadRequestException(
            `Could not extract readable text from that URL. ${articleError?.message || mediaError?.message || ''}`.trim(),
          );
        }
      }
    }

    try {
      const media = await this.mediaTranscription.transcribeUrl(raw);
      return this.fromMediaTranscript(media, raw, mediaKindFor(platform), platform);
    } catch (mediaError: any) {
      try {
        const article = await this.articleReader.read(raw);
        if (article.kind === 'text') return this.fromArticle(article);
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
  }): Promise<ResolvedSource> {
    const buffer = params.buffer;
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('The uploaded file is empty.');
    }

    const originalName = String(params.originalName || 'upload').trim();
    const extension = path.extname(originalName).toLowerCase();
    const mimeType = String(params.mimeType || '').toLowerCase();
    const displayName = prettifyFileName(originalName);

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
      return this.finalize({
        title: displayName || 'Screenshot',
        creator: 'Image OCR',
        sourceType: 'image',
        sourceUrl: '',
        sourceLabel: `Image OCR · ${ocr.modelUsed}`,
        text: cleaned,
        sourceMeta: { mimeType, fileName: originalName, wordCount: countWords(cleaned), ocrModel: ocr.modelUsed },
        warnings: ocr.cached ? [] : [],
        truncated: false,
      });
    }

    const mediaExtension = MEDIA_EXTENSIONS.test(extension);
    const mediaMime =
      mimeType.startsWith('audio/') ||
      mimeType.startsWith('video/') ||
      mimeType === 'application/ogg' ||
      (mimeType === 'application/octet-stream' && mediaExtension);

    if (mediaMime || mediaExtension) {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flaptap-extractor-'));
      const safeExtension = extension || mimeExtension(mimeType) || '.bin';
      const filePath = path.join(tempDir, `upload${safeExtension}`);
      try {
        await fs.writeFile(filePath, buffer);
        const media = await this.mediaTranscription.transcribeFile(filePath, {
          title: displayName,
          creator: 'Uploaded media',
        });
        return this.fromMediaTranscript(media, '', mediaKindForFile(mimeType, extension), 'Uploaded file', {
          fileName: originalName,
          mimeType,
        });
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }

    if (
      mimeType.startsWith('text/') ||
      TEXT_EXTENSIONS.test(extension) ||
      mimeType === 'application/json' ||
      mimeType === ''
    ) {
      const decoded = decodeTextBuffer(buffer);
      const extracted = extension === '.json' ? extractTextFromJson(decoded) : '';
      const text = cleanSourceText(extracted || decoded);
      if (text.length < 20) {
        throw new BadRequestException('That file did not contain enough readable text.');
      }
      return this.finalize({
        title: displayName || 'Uploaded notes',
        creator: 'Uploaded file',
        sourceType: extension === '.md' || extension === '.markdown' ? 'markdown' : 'text',
        sourceUrl: '',
        sourceLabel: `${extension === '.md' ? 'Markdown' : 'Text'} upload`,
        text,
        sourceMeta: { fileName: originalName, mimeType, wordCount: countWords(text) },
        warnings: [],
        truncated: false,
      });
    }

    throw new BadRequestException(
      'Unsupported file type. Upload text, Markdown, subtitles, JSON, an image, or audio/video.',
    );
  }

  private async resolveYouTube(url: string): Promise<ResolvedSource> {
    const transcript = await this.transcriptService.extract(url);
    const text = cleanSourceText(
      transcript.full_raw_transcript ||
        (transcript.sentences || []).map((sentence: any) => sentence.text).join(' '),
    );
    if (text.length < 20) {
      throw new Error('That video returned no usable transcript.');
    }
    return this.finalize({
      title: transcript.title || 'YouTube Video',
      creator: transcript.creator || 'YouTube creator',
      sourceType: 'youtube',
      sourceUrl: transcript.url || url,
      sourceLabel: 'YouTube · captions',
      text,
      sourceMeta: {
        platform: 'YouTube',
        engine: 'captions',
        videoId: transcript.video_id,
        durationSeconds: transcript.duration_seconds || 0,
        wordCount: countWords(text),
        thumbnailUrl: transcript.thumbnail_url || '',
      },
      warnings: [],
      truncated: false,
    });
  }

  private fromArticle(article: any): ResolvedSource {
    const labelPlatform =
      article.platform && article.platform !== 'Web Video' ? article.platform : 'Web';
    return this.finalize({
      title: article.title || 'Web Article',
      creator: article.creator || labelPlatform,
      sourceType: 'article',
      sourceUrl: article.finalUrl || '',
      sourceLabel: `${labelPlatform} · article`,
      text: cleanSourceText(article.text),
      sourceMeta: {
        platform: article.platform === 'Web Video' ? 'Web' : article.platform,
        contentType: article.contentType,
        wordCount: countWords(article.text),
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
  ): ResolvedSource {
    const text = cleanSourceText(media.text);
    if (text.length < 20) {
      throw new Error('No usable speech text was found in that media.');
    }
    const warnings = [...(media.warnings || [])];
    return this.finalize({
      title: media.title || `${platform || 'Media'} Transcript`,
      creator: media.creator || platform || 'Spoken media',
      sourceType,
      sourceUrl: url,
      sourceLabel: `${platform || 'Media'} · ${
        media.engine === 'platform_subtitles' ? 'captions' : 'speech-to-text'
      }`,
      text,
      sourceMeta: {
        platform,
        engine: media.engine,
        model: media.model,
        durationSeconds: media.durationSeconds || 0,
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
      sourceMeta: {
        ...(source.sourceMeta || {}),
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

function mediaKindForFile(mimeType: string, extension: string): ResolvedSource['sourceType'] {
  if (mimeType.startsWith('audio/') || /\.(mp3|m4a|wav|aac|flac|ogg|opus)$/i.test(extension)) {
    return 'audio';
  }
  return 'video';
}

function mimeExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/x-m4a': '.m4a',
    'audio/wav': '.wav',
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  };
  return map[mimeType.split(';')[0]] || '';
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

/**
 * Accepts the JSON transcripts learners commonly save: YouTube json3, subtitle
 * exports, or simple `{ text }` / `{ sentences: [] }` shapes.
 */
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
    if (parts.length > 0) return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  const direct =
    parsed?.full_raw_transcript ||
    parsed?.transcript ||
    parsed?.text ||
    parsed?.content ||
    parsed?.body ||
    '';
  if (typeof direct === 'string' && direct.trim()) return direct;

  const collections = [parsed?.sentences, parsed?.segments, parsed?.cues, parsed?.chunks, parsed?.data];
  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;
    const parts = collection
      .map((entry: any) =>
        typeof entry === 'string'
          ? entry
          : String(entry?.text ?? entry?.content ?? entry?.utf8 ?? '').trim(),
      )
      .filter(Boolean);
    if (parts.length > 0) return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  return '';
}
