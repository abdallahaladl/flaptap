import { createHash } from 'crypto';
import {
  AudioExtractorCategory,
  CoreExtractorCategory,
  ExtractorItemCategory,
} from '../american-extractor.types';

export const CORE_CATEGORIES: readonly CoreExtractorCategory[] = [
  'pattern',
  'vocabulary',
  'idiom',
  'phrasal_verb',
  'collocation',
  'slang',
  'conversational_expression',
  'grammar_structure',
  'discourse_marker',
  'filler',
  'interjection',
  'contraction_reduction',
  'metaphor_figurative',
  'cultural_reference',
  'pragmatics_context',
  'native_response',
] as const;

export const AUDIO_DEPENDENT_CATEGORIES: readonly AudioExtractorCategory[] = [
  'connected_speech',
  'pronunciation_phonetics',
  'word_sentence_stress',
  'linking_sound_changes',
] as const;

export const ALL_CATEGORIES: readonly ExtractorItemCategory[] = [
  ...CORE_CATEGORIES,
  ...AUDIO_DEPENDENT_CATEGORIES,
] as const;

const AUDIO_CATEGORY_SET = new Set<string>(AUDIO_DEPENDENT_CATEGORIES);

export function isAudioDependentCategory(category: string): boolean {
  return AUDIO_CATEGORY_SET.has(String(category || '').trim().toLowerCase());
}

/** Hard ceiling for stored/processed source text (~13k words / ~85 min of speech). */
export const MAX_SOURCE_CHARS = 72000;
export const MAX_SOURCE_WORDS = 13500;
/** Threshold above which long sources are split into coherent chunks for multi-pass extraction. */
export const DEFAULT_CHUNK_CHARS = 14000;
export const MAX_CHUNKS = 6;

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
    VTT_HEADER.test(text) ||
    SRT_TIMESTAMP_LINE.test(text.split('\n')[0] || '') ||
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

/**
 * Splits long cleaned text into coherent chunks along paragraph or sentence
 * boundaries so multi-pass extraction never loses the second half of a long
 * podcast, talk, or essay.
 */
export function splitSourceIntoChunks(
  text: string,
  options: { maxChunkChars?: number; maxChunks?: number } = {},
): string[] {
  const clean = String(text || '').trim();
  if (!clean) return [];
  const maxChars = Math.max(2000, Number(options.maxChunkChars) || DEFAULT_CHUNK_CHARS);
  const maxChunks = Math.max(1, Math.min(12, Number(options.maxChunks) || MAX_CHUNKS));

  if (clean.length <= maxChars) {
    return [clean];
  }

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < clean.length && chunks.length < maxChunks) {
    const remaining = clean.length - cursor;
    if (remaining <= maxChars) {
      const tail = clean.slice(cursor).trim();
      if (tail) chunks.push(tail);
      break;
    }

    const windowEnd = cursor + maxChars;
    const slice = clean.slice(cursor, windowEnd);
    const minCut = Math.floor(maxChars * 0.6);

    const paraBreak = slice.lastIndexOf('\n\n');
    const lineBreak = slice.lastIndexOf('\n');
    const sentenceBreak = Math.max(
      slice.lastIndexOf('. '),
      slice.lastIndexOf('? '),
      slice.lastIndexOf('! '),
    );
    const spaceBreak = slice.lastIndexOf(' ');

    let cutOffset = maxChars;
    if (paraBreak >= minCut) {
      cutOffset = paraBreak + 2;
    } else if (sentenceBreak >= minCut) {
      cutOffset = sentenceBreak + 2;
    } else if (lineBreak >= minCut) {
      cutOffset = lineBreak + 1;
    } else if (spaceBreak >= minCut) {
      cutOffset = spaceBreak + 1;
    }

    const piece = clean.slice(cursor, cursor + cutOffset).trim();
    if (piece) chunks.push(piece);
    cursor += cutOffset;
  }

  return chunks;
}

/**
 * Deterministic fingerprint for caching & deduplicating identical extractions
 * for the same user and option profile.
 */
export function computeExtractionHash(params: {
  sourceText: string;
  targetLanguage: string;
  extractionType: string;
  categories?: string[];
  hasAudio?: boolean;
  style: string;
  level: string;
  focus: string;
  depth: string;
  studyGoal: string;
  order: string;
}): string {
  const normalizedText = normalizeWhitespace(params.sourceText).toLowerCase();
  const sortedCats =
    Array.isArray(params.categories) && params.categories.length > 0
      ? Array.from(new Set(params.categories.map((c) => String(c).trim().toLowerCase()))).sort().join(',')
      : '';
  const payload = [
    'v4',
    normalizedText,
    params.targetLanguage || 'ar',
    params.extractionType || 'all',
    sortedCats,
    params.hasAudio ? 'audio:1' : 'audio:0',
    params.style || 'auto',
    params.level || 'all',
    params.focus || 'balanced',
    params.depth || 'adaptive',
    params.studyGoal || 'full',
    params.order || 'appearance',
  ].join('\u001f');
  return createHash('sha256').update(payload).digest('hex');
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

/** Loose containment check that tolerates inflected forms while blocking fabrications. */
export function isGroundedInText(text: string, term: string, surface: string): boolean {
  const haystack = normalizeTermKey(text);
  if (!haystack) return false;

  const candidates = [surface, term]
    .map((value) => normalizeTermKey(value))
    .filter((value) => value.length >= 2);

  for (const candidate of candidates) {
    if (haystack.includes(candidate)) return true;
  }

  const words = normalizeTermKey(term)
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length >= 3);
  if (words.length === 0) return false;
  if (words.length === 1 && haystack.includes(words[0])) return true;

  // Multi-word terms may appear with inflection ("doubled down on", "chasing our tail").
  const significant = words.filter((w) => !GROUNDING_PLACEHOLDERS.has(w));
  if (significant.length === 0) return false;
  const stem = significant[0].replace(/(ing|ed|es|s)$/, '');
  const second = significant.length > 1 ? significant[1].replace(/(ing|ed|es|s)$/, '') : '';
  if (
    stem.length >= 3 &&
    haystack.includes(stem) &&
    (!second || (second.length >= 2 && haystack.includes(second)))
  ) {
    return true;
  }
  return false;
}

const GROUNDING_PLACEHOLDERS = new Set([
  'one',
  "one's",
  'someone',
  "someone's",
  'somebody',
  "somebody's",
  'something',
]);

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

const VALID_CATEGORIES = new Set<ExtractorItemCategory>(ALL_CATEGORIES);

export function normalizeCategory(value: unknown): ExtractorItemCategory {
  const clean = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[&/]+/g, '_')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  const aliases: Record<string, ExtractorItemCategory> = {
    pattern: 'pattern',
    patterns: 'pattern',
    sentence_pattern: 'pattern',
    sentence_patterns: 'pattern',
    pattern_frame: 'pattern',
    vocabulary: 'vocabulary',
    vocab: 'vocabulary',
    word: 'vocabulary',
    words: 'vocabulary',
    idiom: 'idiom',
    idioms: 'idiom',
    expression: 'idiom',
    expressions: 'idiom',
    phrasal: 'phrasal_verb',
    phrasal_verb: 'phrasal_verb',
    phrasal_verbs: 'phrasal_verb',
    collocation: 'collocation',
    collocations: 'collocation',
    slang: 'slang',
    slang_informal: 'slang',
    slang_informal_expressions: 'slang',
    informal: 'slang',
    informal_expression: 'slang',
    conversational: 'conversational_expression',
    conversational_expression: 'conversational_expression',
    conversational_expressions: 'conversational_expression',
    grammar: 'grammar_structure',
    grammar_structure: 'grammar_structure',
    grammar_structures: 'grammar_structure',
    discourse: 'discourse_marker',
    discourse_marker: 'discourse_marker',
    discourse_markers: 'discourse_marker',
    filler: 'filler',
    fillers: 'filler',
    interjection: 'interjection',
    interjections: 'interjection',
    contraction: 'contraction_reduction',
    contractions: 'contraction_reduction',
    reduction: 'contraction_reduction',
    reductions: 'contraction_reduction',
    contraction_reduction: 'contraction_reduction',
    contractions_reductions: 'contraction_reduction',
    metaphor: 'metaphor_figurative',
    metaphors: 'metaphor_figurative',
    figurative: 'metaphor_figurative',
    figurative_language: 'metaphor_figurative',
    metaphor_figurative: 'metaphor_figurative',
    metaphors_figurative_language: 'metaphor_figurative',
    cultural: 'cultural_reference',
    cultural_reference: 'cultural_reference',
    cultural_references: 'cultural_reference',
    american_cultural_reference: 'cultural_reference',
    american_cultural_references: 'cultural_reference',
    pragmatics: 'pragmatics_context',
    social_context: 'pragmatics_context',
    pragmatics_context: 'pragmatics_context',
    pragmatics_social_context: 'pragmatics_context',
    native_response: 'native_response',
    native_responses: 'native_response',
    native_like_response: 'native_response',
    native_like_responses: 'native_response',
    native_like_responses_reactions: 'native_response',
    reaction: 'native_response',
    reactions: 'native_response',
    response: 'native_response',
    connected_speech: 'connected_speech',
    connected_speech_reduction: 'connected_speech',
    pronunciation: 'pronunciation_phonetics',
    phonetics: 'pronunciation_phonetics',
    pronunciation_phonetics: 'pronunciation_phonetics',
    stress: 'word_sentence_stress',
    word_stress: 'word_sentence_stress',
    sentence_stress: 'word_sentence_stress',
    word_sentence_stress: 'word_sentence_stress',
    word_stress_sentence_stress: 'word_sentence_stress',
    linking: 'linking_sound_changes',
    sound_changes: 'linking_sound_changes',
    linking_sound_changes: 'linking_sound_changes',
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
