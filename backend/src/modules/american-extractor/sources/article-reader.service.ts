import { Injectable, Logger } from '@nestjs/common';
import { detectPlatformLabel } from '../../../core/media/media-url';
import { fetchPublicUrl } from '../utils/url-guard.util';
import { cleanSourceText, normalizeWhitespace } from '../utils/source-text.util';

const MAX_ARTICLE_BYTES = 4 * 1024 * 1024;

export interface ReadableUrlResult {
  kind: 'text';
  title: string;
  creator: string;
  text: string;
  contentType: string;
  platform: string;
  finalUrl: string;
  metadata: Record<string, any>;
}

export interface MediaUrlResult {
  kind: 'media';
  contentType: string;
  finalUrl: string;
  platform: string;
  title: string;
}

export type UrlReadResult = ReadableUrlResult | MediaUrlResult;

const MEDIA_CONTENT_TYPE =
  /^(audio|video)\/|^application\/(ogg|mp3|mpeg|mp4|m4a|webm|x-m4a|x-matroska)/i;

const TEXT_CONTENT_TYPE =
  /^(text\/(plain|markdown|md|x-markdown|html|xhtml\+xml|xml|csv)|application\/(xhtml\+xml|json|ld\+json|xml))/i;

@Injectable()
export class ArticleReaderService {
  private readonly logger = new Logger(ArticleReaderService.name);

  async read(url: string): Promise<UrlReadResult> {
    const { response, finalUrl } = await fetchPublicUrl(url, { timeoutMs: 16000 });
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const platform = detectPlatformLabel(new URL(finalUrl).hostname, new URL(finalUrl).pathname.toLowerCase());

    if (MEDIA_CONTENT_TYPE.test(contentType)) {
      response.body?.cancel().catch(() => {});
      return {
        kind: 'media',
        contentType,
        finalUrl,
        platform,
        title: this.fallbackTitle(finalUrl),
      };
    }

    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      throw new Error(`The source URL returned HTTP ${response.status}.`);
    }

    if (contentType && !TEXT_CONTENT_TYPE.test(contentType)) {
      response.body?.cancel().catch(() => {});
      throw new Error(
        `Unsupported remote content type "${contentType.split(';')[0]}". Upload the file instead.`,
      );
    }

    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_ARTICLE_BYTES) {
      response.body?.cancel().catch(() => {});
      throw new Error('That remote document is too large to extract safely.');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_ARTICLE_BYTES) {
      throw new Error('That remote document is too large to extract safely.');
    }

    const payload = this.decodeBuffer(buffer, contentType);

    if (contentType.includes('html') || looksLikeHtml(payload)) {
      const article = extractReadableHtml(payload);
      if (article.text.length < 80) {
        throw new Error(
          'That page did not expose readable article text. If it is a video or social post, transcribe it from the Link tab.',
        );
      }
      return {
        kind: 'text',
        title: article.title || this.fallbackTitle(finalUrl),
        creator: article.creator || platform,
        text: article.text,
        contentType,
        platform,
        finalUrl,
        metadata: {
          wordCount: article.text.split(/\s+/).filter(Boolean).length,
          htmlTitle: article.htmlTitle,
        },
      };
    }

    const text = cleanSourceText(payload);
    if (text.length < 40) {
      throw new Error('That URL returned too little text to study.');
    }

    return {
      kind: 'text',
      title: this.fallbackTitle(finalUrl),
      creator: platform,
      text,
      contentType,
      platform,
      finalUrl,
      metadata: { wordCount: text.split(/\s+/).filter(Boolean).length },
    };
  }

  private decodeBuffer(buffer: Buffer, contentType: string): string {
    const charset = /charset=([a-z0-9_-]+)/i.exec(contentType)?.[1]?.toLowerCase();
    try {
      return new TextDecoder(charset || 'utf-8', { fatal: false }).decode(buffer);
    } catch {
      return buffer.toString('utf8');
    }
  }

  private fallbackTitle(url: string): string {
    try {
      const parsed = new URL(url);
      const last = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
      const cleaned = last
        .replace(/\.(html?|php|aspx?|md|markdown|txt|json)$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim();
      if (cleaned) {
        return cleaned.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 120);
      }
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return 'Web Source';
    }
  }
}

function looksLikeHtml(value: string): boolean {
  return /<(!doctype|html|head|body|article|main|div|p)\b/i.test(value.slice(0, 4000));
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    mdash: '—',
    ndash: '–',
    hellip: '…',
    rsquo: '’',
    lsquo: '‘',
    rdquo: '”',
    ldquo: '“',
    copy: '©',
    reg: '®',
    trade: '™',
    middot: '·',
    bull: '•',
  };
  return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/gi, (match, entity) => {
    const key = String(entity).toLowerCase();
    if (key.startsWith('#x')) {
      const code = parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (key.startsWith('#')) {
      const code = parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[key] ?? match;
  });
}

function metaContent(html: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match && match[1]) return decodeEntities(normalizeWhitespace(match[1]));
  }
  return '';
}

function extractReadableHtml(
  html: string,
): { title: string; creator: string; htmlTitle: string; text: string } {
  const htmlTitle = metaContent(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]);
  const title =
    metaContent(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
      /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    ]) || htmlTitle;

  const creator = metaContent(html, [
    /<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
  ]);

  let working = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|object|embed|form|button|select|textarea)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');

  const articleMatch =
    /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(working) ||
    /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(working) ||
    /<div[^>]+(?:id|class)=["'][^"']*(?:article|post|entry|content|story|markdown)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(
      working,
    );
  if (articleMatch && articleMatch[1] && stripHtmlToText(articleMatch[1]).length > 120) {
    working = articleMatch[1];
  } else {
    const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(working);
    if (bodyMatch) working = bodyMatch[1];
  }

  const text = cleanSourceText(stripHtmlToText(working));

  return {
    title: title || 'Web Article',
    creator,
    htmlTitle,
    text,
  } as any;
}

function stripHtmlToText(html: string): string {
  return decodeEntities(
    String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|main|li|tr|blockquote|h[1-6]|pre|table)>/gi, '\n')
      .replace(/<(p|div|section|article|main|li|tr|blockquote|h[1-6]|pre|table)\b[^>]*>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]{2,}/g, ' '),
  );
}
