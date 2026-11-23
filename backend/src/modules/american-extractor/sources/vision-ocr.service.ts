import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { AiProvidersService } from '../../ai-providers/ai-providers.service';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGES_PER_EXTRACTION = 10;
const OCR_CONCURRENCY = 3;
const NO_TEXT_SENTINEL = 'NO_READABLE_TEXT';

export interface MultiImageOcrInput {
  buffer: Buffer;
  mimeType?: string;
  originalName?: string;
}

export interface MultiImageOcrResult {
  text: string;
  imageCount: number;
  readableCount: number;
  skippedCount: number;
  warnings: string[];
  modelUsed: string;
  providerName: string;
  cached: boolean;
}

const SYSTEM_PROMPT = [
  'You are Flaptap OCR: a precise document and screenshot transcription engine.',
  'Transcribe every visible English word exactly as written, in natural reading order.',
  'Preserve headings, line breaks, lists, code, and punctuation. Do not summarize, translate, explain, or invent.',
  'Ignore browser chrome, timestamps, watermarks, and UI icons unless they contain meaningful study text.',
  `If the image contains no readable text at all, return exactly ${NO_TEXT_SENTINEL}.`,
].join('\n');

const USER_PROMPT = [
  'Transcribe all readable text in this image into clean plain text.',
  'Keep the author’s spelling and punctuation. Separate paragraphs with a blank line.',
  'Return only the transcription.',
].join('\n');

/**
 * Image OCR through the user's configured multimodal model. No native OCR
 * binary is required, so the same path works on macOS, Linux containers, and
 * every provider protocol the AI selector supports.
 */
@Injectable()
export class VisionOcrService {
  private readonly logger = new Logger(VisionOcrService.name);
  private readonly memoryCache = new Map<string, string>();

  constructor(private readonly aiProviders: AiProvidersService) {}

  async transcribeImage(params: {
    userId: string;
    buffer: Buffer;
    mimeType?: string;
    keyId?: string;
    model?: string;
    variant?: string;
    signal?: AbortSignal;
  }): Promise<{ text: string; modelUsed: string; providerName: string; cached: boolean }> {
    const buffer = params.buffer;
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('The uploaded image is empty.');
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Images must be 8 MB or smaller.');
    }
    if (params.signal?.aborted) {
      const abortErr = new Error('Extraction cancelled.');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    const mimeType = detectImageMime(buffer, params.mimeType);
    if (!mimeType) {
      throw new BadRequestException('Upload a PNG, JPEG, WebP, or GIF image.');
    }

    const cacheKey = createHash('sha256').update(buffer).digest('hex');
    const cached = this.memoryCache.get(cacheKey);
    if (cached) {
      return { text: cached, modelUsed: 'cache', providerName: 'OCR cache', cached: true };
    }

    const response = await this.aiProviders.executeChat(params.userId, {
      keyId: params.keyId,
      model: params.model,
      variant: params.variant || 'none',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: USER_PROMPT,
      images: [{ mimeType, base64: buffer.toString('base64') }],
      temperature: 0,
      maxTokens: 4096,
      timeoutMs: 120000,
      signal: params.signal,
    });

    const text = String(response.content || '').trim();
    if (!text || text.replace(/[`*_]/g, '').trim() === NO_TEXT_SENTINEL) {
      throw new BadRequestException(
        'No readable text was found in that image. Try a sharper screenshot or a larger crop.',
      );
    }

    const cleaned = text
      .replace(/^```(?:text)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .replace(new RegExp(`^${NO_TEXT_SENTINEL}\\s*`, 'i'), '')
      .trim();

    if (!cleaned) {
      throw new BadRequestException('No readable text was found in that image.');
    }

    this.cache(cacheKey, cleaned);
    this.logger.log(`OCR transcribed ${cleaned.length} chars via ${response.modelUsed}`);
    return {
      text: cleaned,
      modelUsed: response.modelUsed,
      providerName: response.providerName,
      cached: false,
    };
  }

  async transcribeImages(params: {
    userId: string;
    images: MultiImageOcrInput[];
    keyId?: string;
    model?: string;
    variant?: string;
    signal?: AbortSignal;
    onProgress?: (completed: number, total: number) => void;
  }): Promise<MultiImageOcrResult> {
    const images = Array.isArray(params.images) ? params.images : [];
    if (images.length === 0) {
      throw new BadRequestException('Choose at least one image to upload.');
    }
    if (images.length > MAX_IMAGES_PER_EXTRACTION) {
      throw new BadRequestException(
        `Upload up to ${MAX_IMAGES_PER_EXTRACTION} images per extraction.`,
      );
    }

    // Fail fast on empty, oversized, or invalid images before dispatching any OCR calls.
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (!img?.buffer || img.buffer.length === 0) {
        throw new BadRequestException('One of the selected images is empty.');
      }
      if (img.buffer.length > MAX_IMAGE_BYTES) {
        throw new BadRequestException('Each image must be 8 MB or smaller.');
      }
      if (!detectImageMime(img.buffer, img.mimeType)) {
        throw new BadRequestException('All selected images must be PNG, JPEG, WebP, or GIF files.');
      }
    }

    const perImageResults: Array<{ text: string; modelUsed: string; providerName: string; cached: boolean } | null> =
      new Array(images.length).fill(null);
    let skippedCount = 0;
    let completedCount = 0;
    let cursor = 0;

    const workerCount = Math.min(OCR_CONCURRENCY, images.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (cursor < images.length) {
          if (params.signal?.aborted) {
            const abortErr = new Error('Extraction cancelled.');
            abortErr.name = 'AbortError';
            throw abortErr;
          }
          const idx = cursor++;
          const img = images[idx];
          try {
            perImageResults[idx] = await this.transcribeImage({
              userId: params.userId,
              buffer: img.buffer,
              mimeType: img.mimeType,
              keyId: params.keyId,
              model: params.model,
              variant: params.variant,
              signal: params.signal,
            });
          } catch (err: any) {
            if (params.signal?.aborted || err?.name === 'AbortError') {
              throw err;
            }
            // In multi-image batches, skip an image with no readable text while still failing on provider/auth errors.
            if (
              images.length > 1 &&
              err instanceof BadRequestException &&
              /no readable text/i.test(String(err.message || ''))
            ) {
              skippedCount++;
              perImageResults[idx] = null;
            } else {
              throw err;
            }
          } finally {
            completedCount++;
            params.onProgress?.(completedCount, images.length);
          }
        }
      }),
    );

    const readable = perImageResults.filter(
      (res): res is { text: string; modelUsed: string; providerName: string; cached: boolean } =>
        Boolean(res && res.text),
    );

    if (readable.length === 0) {
      throw new BadRequestException(
        images.length > 1
          ? 'No readable text was found in the uploaded images. Try sharper screenshots or larger crops.'
          : 'No readable text was found in that image. Try a sharper screenshot or a larger crop.',
      );
    }

    const combinedText = readable.map((r) => r.text).join('\n\n');
    const models = Array.from(
      new Set(readable.map((r) => r.modelUsed).filter((m) => m && m !== 'cache')),
    );
    const firstProvider = readable.find((r) => r.providerName && r.providerName !== 'OCR cache')?.providerName;
    const allCached = readable.every((r) => r.cached);
    const warnings =
      skippedCount > 0
        ? [
            `${skippedCount} uploaded image${skippedCount === 1 ? '' : 's'} had no readable text and ${
              skippedCount === 1 ? 'was' : 'were'
            } skipped.`,
          ]
        : [];

    return {
      text: combinedText,
      imageCount: images.length,
      readableCount: readable.length,
      skippedCount,
      warnings,
      modelUsed: models.length > 0 ? models.join(', ') : 'cache',
      providerName: firstProvider || (allCached ? 'OCR cache' : 'Vision OCR'),
      cached: allCached,
    };
  }

  private cache(key: string, text: string): void {
    if (this.memoryCache.size >= 80) {
      const oldest = this.memoryCache.keys().next().value;
      if (oldest) this.memoryCache.delete(oldest);
    }
    this.memoryCache.set(key, text);
  }
}

export function detectImageMime(buffer: Buffer, declared?: string): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString('ascii'))) {
    return 'image/gif';
  }

  const clean = String(declared || '').toLowerCase();
  if (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(clean) && buffer.length > 24) {
    return clean;
  }
  return null;
}
