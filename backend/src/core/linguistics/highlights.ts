/**
 * Presentation-only verbatim highlighting for transcript sentences and paragraphs.
 *
 * There are ZERO hardcoded regex wordlists here. All linguistic annotations
 * come dynamically from the configured AI model (OpenCode Go) and are applied
 * strictly onto exact verbatim substrings without altering a single character
 * of spoken text.
 */

export type HighlightCategory = 'connected' | 'expression' | 'vocab' | 'stress';

export interface HighlightAnnotation {
  phrase: string;
  category: HighlightCategory;
}

const ALLOWED_MARK_CLASSES = new Set([
  'hl-connected',
  'hl-expression',
  'hl-vocab',
  'hl-stress',
  // Legacy compatibility classes for AI-generated dialogue/phonetics payloads
  'shadow-reduction',
  'shadow-idiom',
  'shadow-slang',
  'shadow-filler',
  'shadow-stress',
]);

const LEGACY_CLASS_MAP: Record<string, string> = {
  'shadow-reduction': 'hl-connected',
  'shadow-idiom': 'hl-expression',
  'shadow-slang': 'hl-expression',
  'shadow-filler': 'hl-connected',
  'shadow-stress': 'hl-stress',
};

export function escapeTranscriptHtml(text: string): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function decodeTranscriptHtml(html: string): string {
  return (html || '')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

/** True when the visible text of stored HTML matches the source text character-for-character. */
export function highlightsAreVerbatim(html: string, text: string): boolean {
  if (!html) return false;
  const visible = decodeTranscriptHtml(html.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
  const source = (text || '').replace(/\s+/g, ' ').trim();
  return visible === source;
}

/**
 * Sanitizes model-authored `<mark>` HTML (used by Dialogue & Pronunciation
 * generators) and guarantees exact verbatim parity with `sourceText`.
 */
export function sanitizeVerbatimHtml(rawHtml: string | undefined, sourceText: string): string {
  const cleanSource = (sourceText || '').replace(/\s+/g, ' ').trim();
  if (!rawHtml || typeof rawHtml !== 'string') {
    return escapeTranscriptHtml(cleanSource);
  }

  let html = rawHtml.replace(/<(?!\/?mark(?:\s|>))[^>]*>/gi, '');
  html = html.replace(/<mark\b([^>]*)>/gi, (_match, attributes) => {
    const classMatch = /class\s*=\s*["']([^"']*)["']/i.exec(attributes);
    const rawClass = (classMatch ? classMatch[1] : '').trim();
    if (!ALLOWED_MARK_CLASSES.has(rawClass)) {
      return '<mark class="hl-expression">';
    }
    const normalized = LEGACY_CLASS_MAP[rawClass] || rawClass;
    return `<mark class="${normalized}">`;
  });

  if (!highlightsAreVerbatim(html, cleanSource)) {
    return escapeTranscriptHtml(cleanSource);
  }
  return html;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Applies AI-discovered phrase highlights onto verbatim text without ever
 * changing, reordering, adding, or dropping a character.
 */
export function applyDynamicHighlights(
  rawText: string,
  annotations: HighlightAnnotation[] = [],
): string {
  const cleanText = (rawText || '').replace(/\s+/g, ' ').trim();
  if (!cleanText || !Array.isArray(annotations) || annotations.length === 0) {
    return escapeTranscriptHtml(cleanText);
  }

  // Normalize and sort longest phrases first so multi-word idioms win over single words.
  const valid = annotations
    .map((a) => ({
      phrase: (a?.phrase || '').replace(/\s+/g, ' ').trim(),
      category: a?.category || 'expression',
    }))
    .filter((a) => a.phrase.length >= 2)
    .sort((a, b) => b.phrase.length - a.phrase.length);

  if (valid.length === 0) {
    return escapeTranscriptHtml(cleanText);
  }

  interface Span {
    start: number;
    end: number;
    category: HighlightCategory;
  }

  const occupied = new Uint8Array(cleanText.length);
  const spans: Span[] = [];

  for (const item of valid) {
    const flexiblePattern = item.phrase
      .split(/\s+/)
      .map((token) => escapeRegExp(token))
      .join('\\s+');
    const startsWord = /[\p{L}\p{N}]/u.test(item.phrase[0]);
    const endsWord = /[\p{L}\p{N}]/u.test(item.phrase[item.phrase.length - 1]);
    const prefix = startsWord ? '(?<![\\p{L}\\p{N}])' : '';
    const suffix = endsWord ? '(?![\\p{L}\\p{N}])' : '';
    const regex = new RegExp(`${prefix}(${flexiblePattern})${suffix}`, 'giu');

    let match: RegExpExecArray | null;
    while ((match = regex.exec(cleanText)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (end <= start) break;

      let overlaps = false;
      for (let i = start; i < end; i++) {
        if (occupied[i]) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        for (let i = start; i < end; i++) occupied[i] = 1;
        spans.push({ start, end, category: item.category });
      }
    }
  }

  if (spans.length === 0) {
    return escapeTranscriptHtml(cleanText);
  }

  spans.sort((a, b) => a.start - b.start);

  const parts: string[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      parts.push(escapeTranscriptHtml(cleanText.slice(cursor, span.start)));
    }
    const slice = escapeTranscriptHtml(cleanText.slice(span.start, span.end));
    parts.push(`<mark class="hl-${span.category}">${slice}</mark>`);
    cursor = span.end;
  }
  if (cursor < cleanText.length) {
    parts.push(escapeTranscriptHtml(cleanText.slice(cursor)));
  }

  const html = parts.join('');
  return highlightsAreVerbatim(html, cleanText) ? html : escapeTranscriptHtml(cleanText);
}
