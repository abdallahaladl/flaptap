import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { getPythonBinaryPath, getSkillScriptPath } from '../../../core/config/paths';
import { classifyMediaUrl, EXTERNAL_MEDIA_ID_PATTERN } from '../../../core/media/media-url';
import {
  GuardStatusSnapshot,
  TranscriptProviderGuard,
} from '../../../core/media/transcript-provider-guard.service';

/** Failure codes emitted by the Python helper as `FLAPTAP_ERROR:<code>:<message>`. */
export type TranscriptErrorCode =
  | 'video_unavailable'
  | 'no_captions'
  | 'rate_limited'
  | 'live_fetch_disabled'
  | 'timeout'
  | 'invalid_url'
  | 'media_too_long'
  | 'unknown';

const HELPER_ERROR_PATTERN = /FLAPTAP_ERROR:([a-z_]+):([^\r\n]+)/;

const execFileAsync = promisify(execFile);

export interface TranscriptCue {
  start: string;
  end: string;
  start_sec: number;
  end_sec: number;
  text: string;
}

export interface TimedWord {
  word: string;
  clean: string;
  start_sec: number;
  end_sec: number;
  cue_index?: number;
  cue_end?: boolean;
}

export interface TranscriptChunk {
  time_range: string;
  start: string;
  end: string;
  text: string;
}

export interface TranscriptResult {
  title: string;
  creator: string;
  url: string;
  video_id: string;
  duration_seconds: number;
  total_cues: number;
  chunks: TranscriptChunk[];
  sentences: any[];
  cues: TranscriptCue[];
  timed_words: TimedWord[];
  full_raw_transcript: string;
  /** `youtube` (IFrame player) or `external` (self-hosted HTML5 media). */
  source?: 'youtube' | 'external';
  /** Human-readable platform label (YouTube, TikTok, Instagram, X, Vimeo, ...). */
  platform?: string;
  /** File name of the cached playable media under `data/media/` (external only). */
  media_file?: string;
  thumbnail_url?: string;
}

interface TranscriptCacheFile {
  version: number;
  cachedAt: string;
  videoId: string;
  data: TranscriptResult;
}

/**
 * One job: turn a YouTube URL or any public social/video URL into verbatim,
 * timestamped English speech data.
 *
 * The Python helper is the only external pipeline step. For YouTube it talks
 * to the caption endpoints directly (typically 2-4 seconds). For TikTok,
 * Instagram, X, Vimeo, Facebook, Reddit, TED, Loom, Twitch, Dailymotion and
 * direct media it downloads one compact MP4 into `data/media/` and aligns
 * subtitles or local Whisper word timestamps. It is invoked with execFile
 * (no shell) so URLs can never be interpreted as shell syntax.
 *
 * Successful extractions are cached on disk. This keeps re-processing and
 * timing migrations instant, and gives the app a usable transcript even if
 * a platform temporarily rate-limits a later request.
 */
@Injectable()
export class TranscriptService {
  private readonly logger = new Logger(TranscriptService.name);
  private readonly cacheDir = path.resolve(__dirname, '../../../../../data/transcripts');
  private readonly cacheVersion = 3;
  private readonly cacheTtlMs = 30 * 24 * 60 * 60 * 1000;

  constructor(
    @Optional()
    private readonly guard: TranscriptProviderGuard = new TranscriptProviderGuard(),
  ) {}

  public getGuardStatus(): GuardStatusSnapshot {
    return this.guard.getStatusSnapshot();
  }

  async extract(url: string, force = false): Promise<TranscriptResult> {
    const videoId = this.extractYoutubeId(url);
    const cached = this.readCache(videoId);
    if (!force && cached) {
      this.logger.log(`Transcript cache hit for ${videoId}`);
      return cached;
    }
    if (force && cached && this.guard.shouldSkipForceRefresh('youtube', videoId)) {
      this.logger.log(
        `Skipping redundant force re-extraction for ${videoId} (within guard force cooldown); returning cached transcript.`,
      );
      return cached;
    }

    try {
      return await this.guard.execute({
        provider: 'youtube',
        targetKey: videoId || url,
        force,
        isRateLimitError: (err) => this.extractErrorCode(err) === 'rate_limited',
        classifyPermanentError: (err) => {
          const code = this.extractErrorCode(err);
          if (code === 'no_captions' || code === 'video_unavailable') {
            return { code, message: (err as any)?.message || 'Caption extraction unavailable.' };
          }
          return null;
        },
        run: () => this.runExtractor(url, videoId),
      });
    } catch (error: any) {
      const errCode = this.extractErrorCode(error);
      if (
        !force &&
        errCode !== 'live_fetch_disabled' &&
        errCode !== 'no_captions' &&
        errCode !== 'video_unavailable'
      ) {
        const stale = this.readCache(videoId, true);
        if (stale) {
          this.logger.warn(`Caption extraction failed (${errCode || 'error'}); using stale transcript cache for ${videoId}.`);
          return stale;
        }
      }
      throw error;
    }
  }

  private extractErrorCode(error: unknown): string {
    const resp = (error as any)?.getResponse?.();
    if (resp && typeof resp === 'object' && resp.code) return String(resp.code);
    if ((error as any)?.code) return String((error as any).code);
    return '';
  }

  private async runExtractor(url: string, videoId: string): Promise<TranscriptResult> {
    const scriptPath = getSkillScriptPath();
    const pythonBin = getPythonBinaryPath();
    const pythonDir = path.dirname(pythonBin);
    const enhancedPath =
      pythonDir && pythonDir !== '.'
        ? `${pythonDir}${path.delimiter}${process.env.PATH || ''}`
        : process.env.PATH || '';
    const startedAt = Date.now();

    let stdout = '';
    let stderr = '';
    try {
      const result = await execFileAsync(
        pythonBin,
        [scriptPath, url, '--interval', '35'],
        {
          maxBuffer: 32 * 1024 * 1024,
          timeout: 45000,
          env: {
            ...process.env,
            PATH: enhancedPath,
            PYTHONWARNINGS: 'ignore',
          },
        },
      );
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error: any) {
      const raw = `${error?.stderr || ''}\n${error?.message || ''}`;
      const helperError = raw.match(HELPER_ERROR_PATTERN);
      if (helperError) {
        throw this.toHttpException(
          helperError[1] as TranscriptErrorCode,
          helperError[2].trim(),
        );
      }

      if (error?.killed || /timed out/i.test(raw)) {
        throw new ServiceUnavailableException({
          message: 'YouTube took too long to respond. Please try again.',
          code: 'timeout',
        });
      }
      const friendly = raw.match(/Error:\s*(.+)/)?.[1]?.trim();
      throw new ServiceUnavailableException(
        friendly || 'Could not extract captions from this video.',
      );
    }

    const jsonStart = stdout.indexOf('{');
    const jsonEnd = stdout.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd <= jsonStart) {
      throw new Error(stderr?.trim() || 'Caption extraction returned no data.');
    }

    let data: TranscriptResult;
    try {
      data = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
    } catch (error: any) {
      throw new Error(`Caption extraction returned invalid JSON: ${error.message}`);
    }

    if (!data?.cues?.length) {
      throw new UnprocessableEntityException({
        message: 'This video has no English captions available to shadow.',
        code: 'no_captions',
      });
    }

    data.source = 'youtube';
    data.platform = 'YouTube';

    // The Python helper already asks YouTube oEmbed for metadata, but a
    // transient throttle can leave it on the generic fallback. A single fast
    // retry from Node keeps the studio header accurate without delaying the
    // caption pipeline.
    if (!data.title || data.title === 'YouTube Shadowing Session') {
      try {
        const oembed = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${data.video_id}`)}&format=json`,
          { signal: AbortSignal.timeout(4000) },
        );
        if (oembed.ok) {
          const meta: any = await oembed.json();
          data.title = meta.title || data.title;
          data.creator = meta.author_name || data.creator;
        }
      } catch {
        // Keep the generic title; the transcript itself is still usable.
      }
    }

    this.writeCache(videoId, data);
    this.logger.log(
      `Captions ready in ${Date.now() - startedAt}ms: "${data.title}" ` +
      `(${data.total_cues} cues, ${data.timed_words?.length || 0} timed words)`,
    );

    return data;
  }

  /**
   * Map a helper failure code to an HTTP response the studio can explain.
   * The numeric status matters for clients; the `code` keeps the UI copy
   * stable even when the human-readable message is translated.
   */
  private toHttpException(code: TranscriptErrorCode, message: string): HttpException {
    const body = { message, code };
    switch (code) {
      case 'video_unavailable':
        return new NotFoundException(body);
      case 'no_captions':
        return new UnprocessableEntityException(body);
      case 'invalid_url':
        return new UnprocessableEntityException(body);
      case 'rate_limited':
      case 'live_fetch_disabled':
        return new ServiceUnavailableException(body);
      case 'timeout':
        return new ServiceUnavailableException(body);
      default:
        return new ServiceUnavailableException(body);
    }
  }

  public extractYoutubeId(url: string): string {
    if (!url) return '';
    const clean = url.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
    const match = clean.match(/(?:v=|\/shorts\/|\/embed\/|\/live\/|\/v\/|youtu\.be\/|\/e\/)([\w-]{11})/) ||
      clean.match(/[?&]v=([\w-]{11})/);
    return match ? match[1] : '';
  }

  public hasCache(videoId?: string): { cached: boolean; bytes: number } {
    if (!videoId) return { cached: false, bytes: 0 };
    try {
      const file = this.cachePath(videoId);
      if (!fs.existsSync(file)) return { cached: false, bytes: 0 };
      const st = fs.statSync(file);
      return { cached: true, bytes: st.size };
    } catch {
      return { cached: false, bytes: 0 };
    }
  }

  public deleteCache(videoId?: string): boolean {
    return this.deleteCacheWithBytes(videoId).removed;
  }

  public deleteCacheWithBytes(videoId?: string): { removed: boolean; bytesFreed: number } {
    if (!videoId) return { removed: false, bytesFreed: 0 };
    try {
      const file = this.cachePath(videoId);
      if (!fs.existsSync(file)) return { removed: false, bytesFreed: 0 };
      const bytesFreed = fs.statSync(file).size || 0;
      fs.unlinkSync(file);
      return { removed: true, bytesFreed };
    } catch {
      return { removed: false, bytesFreed: 0 };
    }
  }

  public clearAllCacheFiles(): { filesRemoved: number; bytesFreed: number } {
    let filesRemoved = 0;
    let bytesFreed = 0;
    try {
      if (!fs.existsSync(this.cacheDir)) return { filesRemoved, bytesFreed };
      for (const entry of fs.readdirSync(this.cacheDir)) {
        if (!entry.endsWith('.json')) continue;
        const full = path.join(this.cacheDir, entry);
        try {
          const st = fs.statSync(full);
          if (!st.isFile()) continue;
          fs.unlinkSync(full);
          filesRemoved++;
          bytesFreed += st.size || 0;
        } catch {
          // Ignore individual file error
        }
      }
    } catch {
      // Ignore directory error
    }
    return { filesRemoved, bytesFreed };
  }

  private cachePath(videoId: string): string {
    return path.join(this.cacheDir, `${videoId}.json`);
  }

  /**
   * Synchronous read-only lookup of a cached disk transcript (accepting older cache
   * entries cleanly so legacy lessons can hydrate true millisecond word timings offline).
   */
  public getCachedTranscript(videoId: string): TranscriptResult | null {
    return this.readCache(videoId, true);
  }

  private readCache(videoId: string, allowStale = false): TranscriptResult | null {
    if (!videoId) return null;
    try {
      const file = this.cachePath(videoId);
      if (!fs.existsSync(file)) return null;
      const parsed: TranscriptCacheFile = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (parsed.version !== this.cacheVersion || !parsed.data?.timed_words?.length) return null;
      if (!allowStale) {
        const age = Date.now() - new Date(parsed.cachedAt).getTime();
        if (!Number.isFinite(age) || age > this.cacheTtlMs) return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  }

  private writeCache(videoId: string, data: TranscriptResult): void {
    if (!videoId) return;
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      const file = this.cachePath(videoId);
      const temporary = `${file}.tmp`;
      const payload: TranscriptCacheFile = {
        version: this.cacheVersion,
        cachedAt: new Date().toISOString(),
        videoId,
        data,
      };
      fs.writeFileSync(temporary, JSON.stringify(payload), 'utf-8');
      fs.renameSync(temporary, file);
    } catch (error: any) {
      this.logger.warn(`Could not write transcript cache for ${videoId}: ${error.message}`);
    }
  }
}
