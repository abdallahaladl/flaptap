import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { getPythonBinaryPath, getSkillScriptPath } from '../../../core/config/paths';
import { isBlockedNetworkHost } from '../../../core/media/media-url';
import { TimedWord, TranscriptCue } from '../../tracks/shadowing/transcript.service';
import { assertPublicHttpUrl } from '../utils/url-guard.util';

const execFileAsync = promisify(execFile);
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MEDIA_SECONDS = 1800;

export interface TranscribeMediaOptions {
  title?: string;
  creator?: string;
  wordTimestamps?: boolean;
  persistMediaDir?: string;
  mediaId?: string;
  force?: boolean;
}

export interface MediaTranscript {
  title: string;
  creator: string;
  thumbnailUrl?: string;
  text: string;
  engine: string;
  model: string;
  durationSeconds: number;
  segments: Array<{ start: number; end: number; text: string }>;
  cues?: TranscriptCue[];
  timedWords?: TimedWord[];
  mediaFile?: string;
  hasAudio?: boolean;
  hasVideo?: boolean;
  mimeType?: string;
  truncated: boolean;
  warnings: string[];
  cached: boolean;
}

interface CachedMediaTranscript {
  cachedAt: string;
  data: Omit<MediaTranscript, 'cached'>;
}

/**
 * Audio/video speech-to-text. One helper process, bounded concurrency, and a
 * disk cache keyed by media identity so repeated study of the same clip never
 * pays the transcription cost twice.
 */
@Injectable()
export class MediaTranscriptionService {
  private readonly logger = new Logger(MediaTranscriptionService.name);
  private readonly cacheDir = path.resolve(__dirname, '../../../../../data/extractor-cache/media');
  private queue: Promise<unknown> = Promise.resolve();

  async transcribeUrl(
    url: string,
    options: TranscribeMediaOptions = {},
  ): Promise<MediaTranscript> {
    const parsed = await assertPublicHttpUrl(url);
    if (isBlockedNetworkHost(parsed.hostname)) {
      throw new Error('That media URL is not publicly reachable.');
    }
    const modeTag = options.wordTimestamps ? ':words' : '';
    const persistTag = options.persistMediaDir ? ':persisted' : '';
    return this.transcribeWithCache(
      `url:${parsed.toString()}${modeTag}${persistTag}`,
      parsed.toString(),
      options,
    );
  }

  async transcribeFile(
    filePath: string,
    options: TranscribeMediaOptions = {},
  ): Promise<MediaTranscript> {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size < 1024) {
        throw new Error('The uploaded media file is empty.');
      }
      const digest = await hashFile(filePath);
      const modeTag = options.wordTimestamps ? ':words' : '';
      return await this.transcribeWithCache(`file:${digest}${modeTag}`, filePath, options);
    } catch (error: any) {
      if (/Media processing|uploaded media|transcrib|speech|download|model/i.test(error?.message || '')) {
        throw error;
      }
      throw new Error(error?.message || 'Could not read the uploaded media file.');
    }
  }

  private async transcribeWithCache(
    cacheKeySource: string,
    sourcePath: string,
    options: TranscribeMediaOptions,
  ): Promise<MediaTranscript> {
    const cacheKey = createHash('sha1').update(cacheKeySource).digest('hex');
    if (!options.force) {
      const cached = this.readCache(cacheKey);
      const mediaStillExists =
        !options.persistMediaDir ||
        !cached?.mediaFile ||
        fs.existsSync(path.join(options.persistMediaDir, path.basename(cached.mediaFile)));
      const hasNeededWords = !options.wordTimestamps || Boolean(cached?.timedWords?.length);
      if (cached && mediaStillExists && hasNeededWords) {
        return {
          ...cached,
          title: options.title || cached.title,
          creator: options.creator || cached.creator,
          cached: true,
        };
      }
    }

    const task = this.queue.then(() => this.runHelper(sourcePath, options));
    this.queue = task.catch(() => undefined);
    const result = await task;

    const payload: MediaTranscript = {
      ...result,
      title: options.title || result.title || 'Media Transcript',
      creator: options.creator || result.creator || 'Spoken Media',
      cached: false,
    };
    this.writeCache(cacheKey, payload);
    return payload;
  }

  private async runHelper(
    sourcePath: string,
    options: TranscribeMediaOptions = {},
  ): Promise<Omit<MediaTranscript, 'cached'>> {
    const scriptPath = this.resolveHelperPath();
    const pythonBin = getPythonBinaryPath();
    const pythonDir = path.dirname(pythonBin);
    const enhancedPath =
      pythonDir && pythonDir !== '.'
        ? `${pythonDir}${path.delimiter}${process.env.PATH || ''}`
        : process.env.PATH || '';

    const cliArgs = [scriptPath, sourcePath, '--max-seconds', String(MAX_MEDIA_SECONDS)];
    if (options.wordTimestamps) {
      cliArgs.push('--word-timestamps');
    }
    if (options.persistMediaDir) {
      cliArgs.push('--persist-media-dir', options.persistMediaDir);
      if (options.mediaId) {
        cliArgs.push('--media-id', options.mediaId);
      }
    }

    const startedAt = Date.now();
    let stdout = '';
    let stderr = '';
    try {
      const result = await execFileAsync(pythonBin, cliArgs, {
        maxBuffer: 64 * 1024 * 1024,
        timeout: 600000,
        env: { ...process.env, PATH: enhancedPath, PYTHONWARNINGS: 'ignore' },
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error: any) {
      const raw = `${error?.stderr || ''}\n${error?.message || ''}`;
      const matched = /FLAPTAP_ERROR:([a-z_]+):([^\r\n]+)/.exec(raw);
      if (matched) {
        throw new Error(this.friendlyError(matched[1], matched[2].trim()));
      }
      if (error?.killed || /timed out/i.test(raw)) {
        throw new Error('Media transcription took too long. Try a shorter clip.');
      }
      this.logger.warn(`Media helper failed: ${raw.slice(0, 400)}`);
      throw new Error('Could not transcribe that media. Check the link or upload a shorter clip.');
    }

    const marker = 'FLAPTAP_RESULT:';
    const markerIndex = stdout.lastIndexOf(marker);
    if (markerIndex < 0) {
      const raw = `${stdout}\n${stderr}`;
      const matched = /FLAPTAP_ERROR:([a-z_]+):([^\r\n]+)/.exec(raw);
      if (matched) {
        throw new Error(this.friendlyError(matched[1], matched[2].trim()));
      }
      throw new Error('Media transcription returned no usable text.');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(stdout.slice(markerIndex + marker.length).trim());
    } catch {
      throw new Error('Media transcription returned invalid data.');
    }

    const text = String(parsed?.text || '').replace(/\s+/g, ' ').trim();
    if (!text) {
      throw new Error('No English speech was detected in that media.');
    }

    const timedWords: TimedWord[] = Array.isArray(parsed?.timed_words) ? parsed.timed_words : [];
    const cues: TranscriptCue[] = Array.isArray(parsed?.cues) ? parsed.cues : [];

    this.logger.log(
      `Media transcribed in ${Date.now() - startedAt}ms via ${parsed?.engine || 'unknown'} ` +
        `(${text.length} chars, ${timedWords.length} timed words)`,
    );

    return {
      title: String(parsed?.title || '').trim(),
      creator: String(parsed?.creator || '').trim(),
      thumbnailUrl: String(parsed?.thumbnail_url || '').trim(),
      text,
      engine: String(parsed?.engine || '').trim(),
      model: String(parsed?.model || '').trim(),
      durationSeconds: Number(parsed?.duration_seconds) || 0,
      segments: Array.isArray(parsed?.segments) ? parsed.segments.slice(0, 4000) : [],
      cues,
      timedWords,
      mediaFile: String(parsed?.media_file || '').trim() || undefined,
      hasAudio: parsed?.has_audio !== undefined ? Boolean(parsed.has_audio) : undefined,
      hasVideo: parsed?.has_video !== undefined ? Boolean(parsed.has_video) : undefined,
      mimeType: String(parsed?.mime_type || '').trim() || undefined,
      truncated: Boolean(parsed?.truncated),
      warnings: Array.isArray(parsed?.warnings)
        ? parsed.warnings.map((value: any) => String(value)).filter(Boolean).slice(0, 4)
        : [],
    };
  }

  private friendlyError(code: string, message: string): string {
    switch (code) {
      case 'download_failed':
        return 'Could not download audio from that link. It may require a login, or it is not a media page.';
      case 'download_timeout':
      case 'timeout':
        return 'Downloading that media took too long. Try a shorter clip.';
      case 'media_too_large':
        return 'That media file is too large to transcribe.';
      case 'no_speech':
        return 'No English speech was detected in that media.';
      case 'transcription_unavailable':
        return 'Local speech transcription is unavailable on this server.';
      case 'model_unavailable':
        return 'The speech model could not be loaded. Please try again shortly.';
      default:
        return message || 'Media transcription failed.';
    }
  }

  private resolveHelperPath(): string {
    const explicit = (process.env.FLAPTAP_MEDIA_HELPER_PATH || '').trim();
    if (explicit && fs.existsSync(explicit)) return explicit;

    const skillScript = getSkillScriptPath();
    const alongside = path.resolve(path.dirname(skillScript), 'transcribe_media.py');
    if (fs.existsSync(alongside)) return alongside;

    const repoRoot = path.resolve(__dirname, '../../../../../');
    const fallback = path.join(
      repoRoot,
      'skills/american-accent-shadowing-skill/scripts/transcribe_media.py',
    );
    return fallback;
  }

  private readCache(key: string): Omit<MediaTranscript, 'cached'> | null {
    try {
      const file = path.join(this.cacheDir, `${key}.json`);
      if (!fs.existsSync(file)) return null;
      const parsed: CachedMediaTranscript = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (!parsed?.data?.text) return null;
      if (Date.now() - new Date(parsed.cachedAt).getTime() > CACHE_TTL_MS) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  private writeCache(key: string, data: MediaTranscript): void {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      const file = path.join(this.cacheDir, `${key}.json`);
      const temporary = `${file}.tmp`;
      const { cached: _cached, ...payload } = data;
      fs.writeFileSync(
        temporary,
        JSON.stringify({ cachedAt: new Date().toISOString(), data: payload }),
        'utf-8',
      );
      fs.renameSync(temporary, file);
    } catch (error: any) {
      this.logger.warn(`Could not cache media transcript: ${error.message}`);
    }
  }
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
