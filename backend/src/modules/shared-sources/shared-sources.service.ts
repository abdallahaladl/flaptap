import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { SqliteService } from '../../core/database/sqlite.service';
import { SharedSourcesRepository } from './shared-sources.repository';
import {
  SharedMediaKind,
  SharedSourceLinks,
  SharedSourceRecord,
  SharedSourceSummary,
  UpsertSharedSourceInput,
} from './shared-sources.types';

const SAFE_MEDIA_ID_RE = /^[a-zA-Z0-9_-]{4,64}(?:\.[a-z0-9]{2,6})?$/;

const MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
};

const EXT_BY_MIME: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/aac': '.aac',
  'audio/flac': '.flac',
  'audio/ogg': '.ogg',
  'audio/opus': '.opus',
  'audio/webm': '.webm',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
};

export function extractYouTubeVideoId(url: string): string {
  const clean = String(url || '').trim();
  if (!clean) return '';
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
  const match =
    clean.match(/(?:v=|\/shorts\/|\/embed\/|\/live\/|\/v\/|youtu\.be\/|\/e\/)([\w-]{11})/) ||
    clean.match(/[?&]v=([\w-]{11})/);
  return match ? match[1] : '';
}

export function buildCanonicalSourceKey(params: {
  sourceType?: string;
  sourceUrl?: string;
  videoId?: string;
  fileBuffer?: Buffer;
  fileDigest?: string;
  lessonId?: string;
  text?: string;
}): string {
  const ytId = params.videoId || extractYouTubeVideoId(params.sourceUrl || '');
  if (ytId) return `youtube:${ytId}`;

  if (params.fileDigest) return `file:${params.fileDigest}`;
  if (params.fileBuffer && params.fileBuffer.length > 0) {
    const hash = createHash('sha256').update(params.fileBuffer).digest('hex').slice(0, 32);
    return `file:${hash}`;
  }

  if (params.sourceUrl && /^https?:\/\//i.test(params.sourceUrl.trim())) {
    const norm = params.sourceUrl.trim().replace(/#.*$/, '');
    const hash = createHash('sha256').update(norm.toLowerCase()).digest('hex').slice(0, 32);
    return `url:${hash}`;
  }

  if (params.lessonId) return `lesson:${params.lessonId}`;

  const normText = String(params.text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const hash = createHash('sha256').update(normText).digest('hex').slice(0, 32);
  return `text:${hash}`;
}

@Injectable()
export class SharedSourcesService {
  private readonly logger = new Logger(SharedSourcesService.name);
  private readonly mediaDir = path.resolve(__dirname, '../../../../data/media');

  constructor(
    private readonly repository: SharedSourcesRepository,
    private readonly sqlite: SqliteService,
  ) {}

  getMediaDir(): string {
    fs.mkdirSync(this.mediaDir, { recursive: true });
    return this.mediaDir;
  }

  findById(userId: string, id: string): SharedSourceRecord | null {
    return this.repository.findById(userId, id);
  }

  findByKey(userId: string, sourceKey: string): SharedSourceRecord | null {
    return this.repository.findByKey(userId, sourceKey);
  }

  upsert(userId: string, input: UpsertSharedSourceInput): SharedSourceRecord {
    return this.repository.upsert(userId, input);
  }

  updateTitle(userId: string, id: string, title: string): void {
    this.repository.updateTitle(userId, id, title);
  }

  listForUser(userId: string, limit = 50): SharedSourceSummary[] {
    return this.repository.listSummaries(userId, limit);
  }

  linkLessonToSource(userId: string, lessonId: string, sourceId: string): void {
    this.repository.linkLessonToSource(userId, lessonId, sourceId);
  }

  /**
   * Persists an uploaded audio/video file once under `data/media/` using a
   * content-addressed filename so re-uploads never duplicate storage and
   * playback remains fast and reliable.
   */
  persistMediaBuffer(
    buffer: Buffer,
    originalName: string,
    mimeType = '',
  ): {
    mediaId: string;
    filePath: string;
    mimeType: string;
    hasAudio: boolean;
    hasVideo: boolean;
    mediaKind: SharedMediaKind;
  } {
    const cleanMime = String(mimeType || '').split(';')[0].trim().toLowerCase();
    const rawExt = path.extname(String(originalName || '')).toLowerCase();
    const ext =
      (rawExt && MIME_BY_EXT[rawExt] ? rawExt : EXT_BY_MIME[cleanMime]) || '.mp4';
    const isVideo =
      cleanMime.startsWith('video/') ||
      ['.mp4', '.m4v', '.mov', '.mkv'].includes(ext) ||
      (ext === '.webm' && !cleanMime.startsWith('audio/'));

    const digest = createHash('sha1').update(buffer).digest('hex').slice(0, 16);
    const mediaId = `src_${digest}${ext}`;
    fs.mkdirSync(this.mediaDir, { recursive: true });
    const filePath = path.join(this.mediaDir, mediaId);

    if (!fs.existsSync(filePath)) {
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, buffer);
      fs.renameSync(tmp, filePath);
      this.logger.log(`Persisted shared media ${mediaId} (${(buffer.length / (1024 * 1024)).toFixed(2)} MB)`);
    }

    const resolvedMime =
      cleanMime && (cleanMime.startsWith('audio/') || cleanMime.startsWith('video/'))
        ? cleanMime
        : isVideo
          ? MIME_BY_EXT[ext] || 'video/mp4'
          : ext === '.webm'
            ? 'audio/webm'
            : MIME_BY_EXT[ext] || 'audio/mpeg';

    return {
      mediaId,
      filePath,
      mimeType: resolvedMime,
      hasAudio: true,
      hasVideo: isVideo,
      mediaKind: isVideo ? 'video' : 'audio',
    };
  }

  /**
   * Resolves a persisted media file strictly for an authenticated owner.
   */
  resolveMediaFileForUser(
    userId: string,
    mediaId: string,
  ): { filePath: string; mimeType: string; size: number } | null {
    const clean = path.basename(String(mediaId || '').trim());
    if (!clean || !SAFE_MEDIA_ID_RE.test(clean)) return null;

    const record = this.repository.findByMediaId(userId, clean);
    const ownedByLesson = !record && this.repository.hasLessonWithVideoId(userId, clean);
    if (!record && !ownedByLesson) return null;

    const directPath = path.join(this.mediaDir, clean);
    const mp4Fallback = path.join(this.mediaDir, `${clean}.mp4`);
    const filePath = fs.existsSync(directPath)
      ? directPath
      : fs.existsSync(mp4Fallback)
        ? mp4Fallback
        : '';
    if (!filePath) return null;

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;

    const ext = path.extname(filePath).toLowerCase();
    const mimeType =
      (record?.mimeType && (record.mimeType.startsWith('audio/') || record.mimeType.startsWith('video/'))
        ? record.mimeType
        : '') ||
      MIME_BY_EXT[ext] ||
      'application/octet-stream';

    return { filePath, mimeType, size: stat.size };
  }

  /**
   * Resolves all cross-feature artifacts (Lessons, Anything to Phrases guides,
   * Tech Lexicon notes) linked to the same underlying source.
   */
  resolveLinks(
    userId: string,
    query: { sourceId?: string; noteId?: string; lessonId?: string; url?: string },
  ): SharedSourceLinks {
    let sourceId = String(query.sourceId || '').trim();
    let lessonId = String(query.lessonId || '').trim();
    let sourceUrl = String(query.url || '').trim();
    let videoId = extractYouTubeVideoId(sourceUrl);

    // Resolve hints from an Extractor Note
    if (query.noteId) {
      const noteRow = this.sqlite.db
        .prepare(
          `SELECT source_id, source_url, source_meta_json FROM american_extractor_notes WHERE id = ? AND user_id = ?`,
        )
        .get(query.noteId, userId) as Record<string, any> | undefined;
      if (noteRow) {
        if (!sourceId && noteRow.source_id) sourceId = String(noteRow.source_id);
        if (!sourceUrl && noteRow.source_url) sourceUrl = String(noteRow.source_url);
        try {
          const meta = JSON.parse(String(noteRow.source_meta_json || '{}'));
          if (!lessonId && meta?.lessonId) lessonId = String(meta.lessonId);
          if (!videoId && meta?.videoId) videoId = String(meta.videoId);
        } catch {}
      }
    }

    // Resolve hints from a Lesson
    if (lessonId) {
      const lessonRow = this.sqlite.db
        .prepare(`SELECT source_id, source_url, video_id FROM lessons WHERE id = ? AND user_id = ?`)
        .get(lessonId, userId) as Record<string, any> | undefined;
      if (lessonRow) {
        if (!sourceId && lessonRow.source_id) sourceId = String(lessonRow.source_id);
        if (!sourceUrl && lessonRow.source_url) sourceUrl = String(lessonRow.source_url);
        if (!videoId && lessonRow.video_id) videoId = String(lessonRow.video_id);
      }
    }

    if (!videoId && sourceUrl) {
      videoId = extractYouTubeVideoId(sourceUrl);
    }

    let sourceRecord: SharedSourceRecord | null = sourceId
      ? this.repository.findById(userId, sourceId)
      : null;

    if (!sourceRecord && videoId) {
      sourceRecord = this.repository.findByKey(userId, `youtube:${videoId}`);
    }
    if (!sourceRecord && sourceUrl) {
      sourceRecord = this.repository.findByKey(
        userId,
        buildCanonicalSourceKey({ sourceUrl }),
      );
    }
    if (!sourceRecord && lessonId) {
      sourceRecord = this.repository.findByKey(userId, `lesson:${lessonId}`);
    }

    if (sourceRecord) {
      sourceId = sourceRecord.id;
      if (!sourceUrl && sourceRecord.sourceUrl) sourceUrl = sourceRecord.sourceUrl;
      if (!videoId && sourceRecord.mediaKind === 'youtube' && sourceRecord.mediaId) {
        videoId = sourceRecord.mediaId;
      }
    }

    const lookup = { sourceId, videoId, sourceUrl, lessonId };
    const lesson = this.repository.findLinkedLesson(userId, lookup);
    if (lesson && !lessonId) lookup.lessonId = lesson.id;

    const extractorNotes = this.repository.findLinkedExtractorNotes(userId, lookup);

    return {
      source: sourceRecord ? this.repository.toSummary(sourceRecord) : null,
      lesson,
      extractorNotes,
    };
  }
}
