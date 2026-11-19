import { ExtractorItemCategory } from '../american-extractor.types';

/** Hard ceiling for model input. Keeps one extraction inside a single call. */
export const MAX_SOURCE_CHARS = 48000;
export const MAX_SOURCE_WORDS = 9000;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const SRT_INDEX_LINE = /^\s*\d{1,4}\s*$/;
const SRT_TIMESTAMP_LINE =
  /^\s*-?\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}\s*-->\s*-?\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}.*$/;
const VTT_HEADER = /^\s*WEBVTT\b.*$/i;

export function normalizeWhitespace(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Convert a subtitle, markdown, HTML-stripped article, or pasted transcript
 * into clean study prose while preserving sentence punctuation and paragraph
 * breaks. Plain text passes through untouched.
 */
export function cleanSourceText(raw: string): string {
  let text = String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');

  const looksLikeSubtitle =
    VTT_HEADER.test(text) || SRT_TIMESTAMP_LINE.test(text.split('\n')[0] || '') ||
    /\d{1,2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(text);

  const lines: string[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
      continue;
    }
    if (looksLikeSubtitle) {
      if (VTT_HEADER.test(trimmed)) continue;
      if (SRT_TIMESTAMP_LINE.test(trimmed)) continue;
      if (SRT_INDEX_LINE.test(trimmed)) continue;
    }
    lines.push(trimmed);
  }
  text = lines.join('\n');

  if (looksLikeSubtitle) {
    text = text.replace(/\s+/g, ' ');
  }

  text = stripMarkdownSyntax(text)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

/** Removes presentation syntax, never prose. */
export function stripMarkdownSyntax(text: string): string {
  return String(text || '')
    .replace(/```[a-zA-Z0-9_+-]*\n?/g, '')
    .replace(/```/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(?!\s)(.*?)(?<!\s)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*([-*_])\1{2,}\s*$/gm, '')
    .replace(/<[^>]+>/g, ' ');
}

export function countWords(text: string): number {
  const matches = String(text || '').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

export function truncateSource(text: string): { text: string; truncated: boolean } {
  const value = String(text || '');
  if (value.length <= MAX_SOURCE_CHARS) {
    return { text: value, truncated: false };
  }
  const slice = value.slice(0, MAX_SOURCE_CHARS);
  const boundary = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('\n'));
  const clean = boundary > MAX_SOURCE_CHARS * 0.75 ? slice.slice(0, boundary + 1) : slice;
  return { text: `${clean.trim()}\n\n[Source truncated for extraction.]`, truncated: true };
}

/** Case/diacritic-insensitive key used for deduplication and grounding. */
export function normalizeTermKey(term: string): string {
  return String(term || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** Loose containment check that tolerates inflected forms. */
export function isGroundedInText(text: string, term: string, surface: string): boolean {
  const haystack = normalizeTermKey(text);
  if (!haystack) return false;

  const candidates = [surface, term]
    .map((value) => normalizeTermKey(value))
    .filter((value) => value.length >= 2);

  for (const candidate of candidates) {
    if (haystack.includes(candidate)) return true;
  }

  const words = normalizeTermKey(term).split(/[^a-z0-9']+/).filter((w) => w.length >= 3);
  if (words.length === 0) return false;
  if (haystack.includes(words[0]) && words.length === 1) return true;

  // Multi-word terms may appear with inflection ("doubled down on").
  const stem = words[0].replace(/(ing|ed|es|s)$/, '');
  const second = words.length > 1 ? words[1] : '';
  if (stem.length >= 3 && haystack.includes(stem) && (!second || haystack.includes(second))) {
    return true;
  }
  return false;
}

/**
 * Locate the verbatim sentence that contains a term so every context quote is
 * real source text, never a model paraphrase.
 */
export function findContextSentence(sourceText: string, term: string, surface: string): string {
  const text = String(sourceText || '');
  if (!text) return '';

  const wanted = [surface, term]
    .map((value) => normalizeTermKey(value))
    .filter(Boolean);

  const segments = text
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const wantedKey of wanted) {
    const exact = segments.find((segment) => normalizeTermKey(segment).includes(wantedKey));
    if (exact) return capSentence(exact, wantedKey);
  }

  const words = normalizeTermKey(term)
    .split(/[^a-z0-9']+/)
    .filter((word) => word.length >= 4 && !CONTEXT_STOPWORDS.has(word));
  for (const word of words) {
    const found = segments.find((segment) => normalizeTermKey(segment).includes(word));
    if (found) return capSentence(found, word);
  }

  return '';
}

const CONTEXT_STOPWORDS = new Set([
  'about', 'after', 'again', 'also', 'another', 'because', 'been', 'before', 'being',
  'between', 'could', 'does', 'doing', 'down', 'each', 'even', 'ever', 'every', 'from',
  'have', 'having', 'here', 'into', 'just', 'like', 'made', 'make', 'many', 'more',
  'most', 'much', 'must', 'only', 'other', 'over', 'same', 'should', 'some', 'something',
  'someone', 'still', 'such', 'than', 'that', 'their', 'them', 'then', 'there', 'these',
  'they', 'thing', 'think', 'this', 'those', 'through', 'under', 'very', 'want', 'were',
  'what', 'when', 'where', 'which', 'while', 'will', 'with', 'would', 'your',
]);

function capSentence(sentence: string, matchKey = ''): string {
  const clean = normalizeWhitespace(sentence);
  if (clean.length <= 420) return clean;

  // For long unpunctuated transcripts, slice a verbatim window around the matched expression.
  const lower = clean.toLowerCase();
  const idx = matchKey ? lower.indexOf(matchKey.toLowerCase()) : -1;
  if (idx >= 0) {
    const half = 180;
    let start = Math.max(0, idx - half);
    let end = Math.min(clean.length, idx + matchKey.length + half);
    if (start > 0) {
      const nextSpace = clean.indexOf(' ', start);
      if (nextSpace > start && nextSpace < idx) start = nextSpace + 1;
    }
    if (end < clean.length) {
      const prevSpace = clean.lastIndexOf(' ', end);
      if (prevSpace > idx + matchKey.length) end = prevSpace;
    }
    return clean.slice(start, end).trim();
  }

  const cut = clean.lastIndexOf(' ', 417);
  return clean.slice(0, cut > 200 ? cut : 417).trim();
}

const VALID_CATEGORIES = new Set<ExtractorItemCategory>([
  'idiom',
  'slang',
  'phrasal_verb',
  'vocabulary',
  'collocation',
  'connected_speech',
  'discourse_marker',
  'pattern',
]);

export function normalizeCategory(value: unknown): ExtractorItemCategory {
  const clean = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, ExtractorItemCategory> = {
    idiom: 'idiom',
    idioms: 'idiom',
    expression: 'idiom',
    expressions: 'idiom',
    slang: 'slang',
    phrasal: 'phrasal_verb',
    phrasal_verb: 'phrasal_verb',
    phrasal_verbs: 'phrasal_verb',
    vocabulary: 'vocabulary',
    word: 'vocabulary',
    collocation: 'collocation',
    collocations: 'collocation',
    connected_speech: 'connected_speech',
    connected_speech_reduction: 'connected_speech',
    reduction: 'connected_speech',
    discourse_marker: 'discourse_marker',
    discourse: 'discourse_marker',
    pattern: 'pattern',
    sentence_pattern: 'pattern',
    pattern_frame: 'pattern',
  };
  if (aliases[clean]) return aliases[clean];
  return VALID_CATEGORIES.has(clean as ExtractorItemCategory)
    ? (clean as ExtractorItemCategory)
    : 'vocabulary';
}

export function safeText(value: unknown, max = 600): string {
  return normalizeWhitespace(String(value ?? '')).slice(0, max);
}

export function safeList(value: unknown, maxItems = 5, maxLength = 40): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const clean = normalizeWhitespace(String(entry ?? '')).slice(0, maxLength);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}
