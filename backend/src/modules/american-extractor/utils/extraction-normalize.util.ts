import {
  ExtractionItemPreviewEvent,
  ExtractorItem,
  ExtractorItemCategory,
} from '../american-extractor.types';
import {
  ALL_CATEGORIES,
  findContextSentence,
  isAudioDependentCategory,
  isGroundedInText,
  normalizeCategory,
  normalizeTermKey,
  normalizeWhitespace,
  safeList,
  safeText,
} from './source-text.util';

export interface NormalizedExtraction {
  title: string;
  summary: string;
  speakerStyle: string;
  items: ExtractorItem[];
}

const VALID_CEFR = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const VALID_FREQUENCY = new Set(['very common', 'common', 'niche']);
const VALID_REGISTERS = new Set(['neutral', 'casual', 'professional', 'slang', 'formal', 'spoken']);
const STRICT_SINGLE_CATEGORIES = new Set<string>(ALL_CATEGORIES);

const CEFR_RANK: Record<string, number> = {
  C2: 6,
  C1: 5,
  B2: 4,
  B1: 3,
  A2: 2,
  A1: 1,
};

const FREQUENCY_RANK: Record<string, number> = {
  'very common': 3,
  common: 2,
  niche: 1,
};

export function parseModelJson(raw: string): any {
  let text = String(raw || '').trim();
  text = text.replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '').trim();

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  const start = text.indexOf('{');
  if (start > 0) text = text.slice(start);

  let parsed = tryParse(text);
  if (parsed) return parsed;

  const repaired = text
    .replace(/,\s*([\]}])/g, '$1')
    .replace(/[\u0000-\u001F]+/g, (match) =>
      match === '\n' || match === '\r' || match === '\t' ? match : ' ',
    );
  parsed = tryParse(repaired);
  if (parsed) return parsed;

  const salvaged = salvageItems(text);
  if (salvaged) return salvaged;

  throw new Error('The model returned an incomplete study guide. Please retry the extraction.');
}

function tryParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Extracts every complete top-level object inside `"items": [ ... ]` from
 * a partial or truncated JSON stream. Used both for live SSE item previews
 * and truncation salvage.
 */
export function extractCompletedObjectsFromItemsArray(text: string): any[] {
  const match = /"items"\s*:\s*\[/.exec(String(text || ''));
  if (!match) return [];

  const startIndex = match.index + match[0].length;
  const objects: any[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objectStart = -1;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) objectStart = i;
      depth++;
      continue;
    }
    if (char === '}') {
      depth--;
      if (depth === 0 && objectStart >= 0) {
        const rawObj = text.slice(objectStart, i + 1);
        const parsedObj = tryParse(rawObj);
        if (parsedObj && typeof parsedObj === 'object') {
          objects.push(parsedObj);
        }
        objectStart = -1;
      }
      continue;
    }
    if (char === ']' && depth === 0) break;
  }

  return objects;
}

/**
 * Emits newly completed lightweight item previews from an accumulating LLM JSON stream.
 */
export function extractCompletedItemsFromStream(
  accumulated: string,
  emittedKeys: Set<string>,
  sourceText: string,
): ExtractionItemPreviewEvent[] {
  const objects = extractCompletedObjectsFromItemsArray(accumulated);
  const fresh: ExtractionItemPreviewEvent[] = [];

  for (const raw of objects) {
    const term = safeText(raw?.term ?? raw?.expression ?? raw?.phrase ?? raw?.word, 120).replace(
      /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,
      '',
    );
    if (!term || term.length < 2) continue;
    const key = normalizeTermKey(term);
    if (!key || emittedKeys.has(key)) continue;

    const surface = safeText(raw?.surface ?? raw?.exact ?? term, 180) || term;
    if (!isGroundedInText(sourceText, term, surface)) continue;

    emittedKeys.add(key);
    const cefrUpper = String(raw?.cefr || '').trim().toUpperCase();
    fresh.push({
      term,
      category: normalizeCategory(raw?.category ?? raw?.type),
      ipa: safeText(raw?.ipa, 100) || undefined,
      cefr: VALID_CEFR.has(cefrUpper) ? cefrUpper : undefined,
      meaning: safeText(raw?.meaning ?? raw?.definition, 180) || undefined,
      count: emittedKeys.size,
    });
  }

  return fresh;
}

/**
 * A truncated response can still contain many complete item objects. Recover
 * them instead of discarding an otherwise valuable extraction.
 */
function salvageItems(text: string): any | null {
  const items = extractCompletedObjectsFromItemsArray(text);
  if (items.length === 0) return null;

  const titleMatch = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
  const summaryMatch = /"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
  const styleMatch = /"speakerStyle"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);

  return {
    title: titleMatch ? decodeJsonString(titleMatch[1]) : '',
    summary: summaryMatch ? decodeJsonString(summaryMatch[1]) : '',
    speakerStyle: styleMatch ? decodeJsonString(styleMatch[1]) : '',
    items,
  };
}

function decodeJsonString(escaped: string): string {
  try {
    return JSON.parse(`"${escaped}"`);
  } catch {
    return escaped;
  }
}

export function normalizeExtraction(params: {
  parsed: any;
  sourceText: string;
  fallbackTitle: string;
  targetLanguage: string;
  extractionType?: string;
  selectedCategories?: ExtractorItemCategory[];
  hasAudio?: boolean;
  allowEmpty?: boolean;
}): NormalizedExtraction {
  const { parsed, sourceText, fallbackTitle, targetLanguage } = params;
  const requestedType = String(params.extractionType || 'all').trim().toLowerCase();
  const hasAudio = params.hasAudio !== false;
  const rawItems: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.items)
      ? parsed.items
      : Array.isArray(parsed?.expressions)
        ? parsed.expressions
        : Array.isArray(parsed?.vocabulary)
          ? parsed.vocabulary
          : [];

  if (rawItems.length === 0 && !params.allowEmpty) {
    throw new Error('The model did not return any study items. Please retry.');
  }

  const items: ExtractorItem[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const raw of rawItems) {
    const validated = validateAndNormalizeItem(raw, {
      sourceText,
      targetLanguage,
      hasAudio,
      seen,
      nextIndex: items.length,
    });
    if (!validated) {
      dropped++;
      continue;
    }
    seen.add(normalizeTermKey(validated.term));
    items.push(validated);
  }

  if (items.length === 0 && !params.allowEmpty) {
    throw new Error(
      dropped > 0
        ? 'The model returned expressions that were not grounded in the source. Please retry.'
        : 'No high-value expressions were found in this source. Try a richer source.',
    );
  }

  let finalItems = items;
  const selectedList = Array.isArray(params.selectedCategories)
    ? params.selectedCategories.filter((c) => hasAudio || !isAudioDependentCategory(c))
    : [];

  if (selectedList.length > 0 && selectedList.length < ALL_CATEGORIES.length) {
    const allowedSet = new Set<string>(selectedList);
    const matched = items.filter((item) => allowedSet.has(item.category));
    if (matched.length > 0) {
      finalItems = matched.map((item, idx) => ({ ...item, index: idx }));
    }
  } else if (STRICT_SINGLE_CATEGORIES.has(requestedType)) {
    const matched = items.filter((item) => item.category === requestedType);
    if (matched.length > 0) {
      finalItems = matched.map((item, idx) => ({ ...item, index: idx }));
    }
  } else if (requestedType === 'phrases') {
    const matched = items.filter(
      (item) => /\s/.test(item.term) || item.category !== 'vocabulary',
    );
    if (matched.length > 0) {
      finalItems = matched.map((item, idx) => ({ ...item, index: idx }));
    }
  }

  return {
    title: safeText(parsed?.title, 140) || fallbackTitle,
    summary: safeText(parsed?.summary, 900),
    speakerStyle: safeText(parsed?.speakerStyle ?? parsed?.style, 180),
    items: finalItems,
  };
}

function validateAndNormalizeItem(
  raw: any,
  ctx: {
    sourceText: string;
    targetLanguage: string;
    hasAudio: boolean;
    seen: Set<string>;
    nextIndex: number;
  },
): ExtractorItem | null {
  if (!raw || typeof raw !== 'object') return null;

  const term = safeText(raw?.term ?? raw?.expression ?? raw?.phrase ?? raw?.word, 120).replace(
    /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,
    '',
  );
  if (!term || term.length < 2) return null;

  const key = normalizeTermKey(term);
  if (!key || ctx.seen.has(key)) return null;

  const surface =
    safeText(raw?.surface ?? raw?.exact ?? raw?.quote ?? term, 180).replace(
      /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,
      '',
    ) || term;

  if (!isGroundedInText(ctx.sourceText, term, surface)) {
    return null;
  }

  const category = normalizeCategory(raw?.category ?? raw?.type);
  // Strict anti-fabrication gate: never allow audio-dependent items on text-only sources
  if (!ctx.hasAudio && isAudioDependentCategory(category)) {
    return null;
  }

  const meaning = safeText(
    raw?.meaning ?? raw?.definition ?? raw?.contextualMeaning ?? raw?.localizedMeaning,
    520,
  );
  if (!meaning) return null;

  const localizedSource = raw?.localizedMeaning ?? raw?.translation ?? raw?.nativeMeaning;
  const localizedRaw = Array.isArray(localizedSource)
    ? localizedSource
        .map((entry) => safeText(entry, 140))
        .filter(Boolean)
        .join(ctx.targetLanguage === 'ar' ? '، ' : ', ')
        .slice(0, 520)
    : safeText(localizedSource ?? raw?.meaning, 520);
  const localizedMeaning = ctx.targetLanguage === 'en' ? meaning : localizedRaw || meaning;

  const contextFromSource = findContextSentence(ctx.sourceText, term, surface);
  const modelContext = safeText(raw?.contextSentence ?? raw?.context ?? raw?.sentence, 420);
  // Prefer verbatim source sentence; only use model context if it is genuinely grounded in sourceText.
  const contextSentence =
    contextFromSource ||
    (modelContext && isGroundedInText(ctx.sourceText, modelContext.slice(0, 60), modelContext.slice(0, 60))
      ? modelContext
      : '');

  const rawContextTranslation =
    ctx.targetLanguage === 'en'
      ? ''
      : safeText(
          raw?.contextTranslation ??
            raw?.contextSentenceTranslation ??
            raw?.inContextTranslation,
          520,
        );
  const contextTranslation =
    contextSentence && rawContextTranslation && rawContextTranslation !== contextSentence
      ? rawContextTranslation
      : '';

  const rawPos = safeText(raw?.partOfSpeech ?? raw?.pos, 32)
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const rawRegister = safeText(raw?.register, 40).toLowerCase();
  const register = VALID_REGISTERS.has(rawRegister) ? rawRegister : registerForCategory(category);
  const cefrUpper = String(raw?.cefr || '').trim().toUpperCase();
  const cefr = VALID_CEFR.has(cefrUpper) ? cefrUpper : '';
  const frequencyRaw = safeText(raw?.frequency, 24).toLowerCase();
  const frequency = VALID_FREQUENCY.has(frequencyRaw) ? frequencyRaw : '';
  const generalMeaning = safeText(raw?.generalMeaning ?? raw?.generalSense, 420);
  const techNote = safeText(raw?.techNote ?? raw?.workplaceNote, 360);
  const tags = safeList(raw?.tags, 5, 36);
  const example = safeText(raw?.example ?? raw?.exampleSentence, 420);
  const rawExampleTranslation =
    ctx.targetLanguage === 'en'
      ? ''
      : safeText(raw?.exampleTranslation ?? raw?.exampleSentenceTranslation, 520);
  const exampleTranslation =
    example && rawExampleTranslation && rawExampleTranslation !== example
      ? rawExampleTranslation
      : '';

  return {
    index: ctx.nextIndex,
    term,
    surface,
    category,
    ...(rawPos ? { partOfSpeech: rawPos } : {}),
    register,
    ipa: normalizeIpa(safeText(raw?.ipa, 120)),
    ...(cefr ? { cefr } : {}),
    ...(frequency ? { frequency } : {}),
    meaning,
    localizedMeaning,
    ...(generalMeaning ? { generalMeaning } : {}),
    contextSentence,
    ...(contextTranslation ? { contextTranslation } : {}),
    usageNote: safeText(raw?.usageNote ?? raw?.usage, 420),
    spokenNote: safeText(raw?.spokenNote ?? raw?.pronunciation ?? raw?.mechanics, 420),
    example,
    ...(exampleTranslation ? { exampleTranslation } : {}),
    ...(techNote ? { techNote } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    grounded: true,
  };
}

/**
 * Merges multiple chunk extractions into one cohesive, deduplicated,
 * source-grounded, properly ordered study guide.
 */
export function mergeChunkExtractions(params: {
  chunks: NormalizedExtraction[];
  sourceText: string;
  fallbackTitle: string;
  order?: string;
}): NormalizedExtraction {
  const valid = params.chunks.filter(Boolean);
  const title = valid.find((c) => c.title)?.title || params.fallbackTitle;
  const summary = valid.find((c) => c.summary)?.summary || '';
  const speakerStyle = valid.find((c) => c.speakerStyle)?.speakerStyle || '';

  const merged: ExtractorItem[] = [];
  const seen = new Set<string>();
  const haystack = normalizeTermKey(params.sourceText);

  for (const chunk of valid) {
    for (const item of chunk.items || []) {
      const key = normalizeTermKey(item.term);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      // Re-anchor context sentence against full sourceText if missing
      const contextSentence =
        item.contextSentence || findContextSentence(params.sourceText, item.term, item.surface);
      merged.push({
        ...item,
        contextSentence,
        grounded: true,
      });
    }
  }

  if (merged.length === 0) {
    throw new Error('No source-grounded expressions were found across this source. Please retry.');
  }

  const order = String(params.order || 'appearance').trim().toLowerCase();
  if (order === 'appearance') {
    merged.sort((a, b) => {
      const posA = firstOccurrenceIndex(haystack, a.surface, a.term);
      const posB = firstOccurrenceIndex(haystack, b.surface, b.term);
      return posA - posB;
    });
  } else if (order === 'importance') {
    merged.sort((a, b) => {
      const freqDiff = (FREQUENCY_RANK[b.frequency || ''] || 0) - (FREQUENCY_RANK[a.frequency || ''] || 0);
      if (freqDiff !== 0) return freqDiff;
      return firstOccurrenceIndex(haystack, a.surface, a.term) - firstOccurrenceIndex(haystack, b.surface, b.term);
    });
  } else if (order === 'difficulty') {
    merged.sort((a, b) => {
      const cefrDiff = (CEFR_RANK[b.cefr || ''] || 0) - (CEFR_RANK[a.cefr || ''] || 0);
      if (cefrDiff !== 0) return cefrDiff;
      return firstOccurrenceIndex(haystack, a.surface, a.term) - firstOccurrenceIndex(haystack, b.surface, b.term);
    });
  }

  return {
    title,
    summary,
    speakerStyle,
    items: merged.map((item, idx) => ({ ...item, index: idx })),
  };
}

function firstOccurrenceIndex(haystack: string, surface: string, term: string): number {
  const sKey = normalizeTermKey(surface);
  if (sKey) {
    const idx = haystack.indexOf(sKey);
    if (idx >= 0) return idx;
  }
  const tKey = normalizeTermKey(term);
  if (tKey) {
    const idx = haystack.indexOf(tKey);
    if (idx >= 0) return idx;
  }
  return Number.MAX_SAFE_INTEGER;
}

function normalizeIpa(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if ((trimmed.startsWith('/') && trimmed.endsWith('/')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return trimmed;
  }
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
}

function registerForCategory(category: ExtractorItemCategory): string {
  if (category === 'slang' || category === 'filler' || category === 'interjection') return 'casual';
  if (
    category === 'connected_speech' ||
    category === 'pronunciation_phonetics' ||
    category === 'word_sentence_stress' ||
    category === 'linking_sound_changes' ||
    category === 'contraction_reduction'
  ) {
    return 'spoken';
  }
  return 'neutral';
}

/** Normalizes a model title for logs / defensive display. */
export function cleanModelTitle(value: unknown): string {
  return normalizeWhitespace(String(value ?? '')).slice(0, 140);
}

const GENERIC_TITLES = new Set([
  'untitled',
  'untitled source',
  'untitled study guide',
  'screenshot',
  'screenshots',
  'screen shot',
  'screen shots',
  'image',
  'images',
  'photo',
  'photos',
  'picture',
  'pictures',
  'image ocr',
  'multi image ocr',
  'multi-image ocr',
  'uploaded source',
  'image collection',
  'image study source',
  'pasted english text',
  'scan',
  'scanned document',
  'document',
  'notes',
  'uploaded notes',
]);

const IMAGE_EXTENSION_RE = /\.(?:png|jpe?g|webp|gif|heic|bmp|tiff?)(?:\b|$)/i;
const CAMERA_OR_RAW_FILENAME_RE =
  /^(?:img|dsc|pxl|mvimg|vid|scr|screenshot|screen[\s_-]?shot|photo|pic|image|capture|snip|whatsapp[\s_-]?image|telegram|signal|scan)[_-]?\d[\w\s._-]*$/i;
const UUID_OR_HEX_RE =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{10,}|[\d\s._-]+)$/i;

function normalizeTitleCompare(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns true if `title` is blank, a generic placeholder, looks like a raw
 * camera/OS filename or extension, or matches any submitted image filename.
 */
export function isGenericOrFilenameTitle(title: string, submittedFileNames: string[] = []): boolean {
  const clean = cleanModelTitle(title);
  if (!clean || clean.length < 3) return true;

  const norm = normalizeTitleCompare(clean);
  if (GENERIC_TITLES.has(norm)) return true;
  if (IMAGE_EXTENSION_RE.test(clean)) return true;
  if (CAMERA_OR_RAW_FILENAME_RE.test(clean)) return true;
  if (UUID_OR_HEX_RE.test(clean)) return true;

  for (const rawName of submittedFileNames || []) {
    const base = String(rawName || '').split(/[\\/]/).pop()?.trim() || '';
    if (!base) continue;
    const rawLower = base.toLowerCase();
    const stem = base.replace(/\.[a-z0-9]{1,8}$/i, '');
    const normStem = normalizeTitleCompare(stem);
    if (norm === rawLower || (normStem && norm === normStem)) {
      return true;
    }
    if (rawLower.length >= 4 && clean.toLowerCase().includes(rawLower)) {
      return true;
    }
    if (
      normStem.length >= 6 &&
      (norm.startsWith(`${normStem} `) || norm.endsWith(` ${normStem}`))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Derives a clean 3–8 word content-based fallback title strictly from extracted
 * summary or source prose — never from filenames.
 */
export function deriveContextualFallbackTitle(summary: string, sourceText: string): string {
  const candidates = [String(summary || ''), String(sourceText || '')];

  for (const raw of candidates) {
    const cleaned = normalizeWhitespace(raw)
      .replace(/^["'“”`]+|["'“”`]+$/g, '')
      .trim();
    if (!cleaned) continue;

    const segments = cleaned
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.replace(/^[\s\-*•#>]+/, '').replace(/[.!?,;:]+$/g, '').trim())
      .filter((s) => s.split(/\s+/).length >= 3);

    for (const seg of segments) {
      const words = seg.split(/\s+/).filter(Boolean);
      const picked = words.slice(0, 7).join(' ').slice(0, 80).trim();
      const titled = picked ? picked.charAt(0).toUpperCase() + picked.slice(1) : '';
      if (titled && !isGenericOrFilenameTitle(titled)) {
        return titled;
      }
    }
  }

  return 'Spoken English Study Notes';
}
