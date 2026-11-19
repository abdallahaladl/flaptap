import { ExtractorItem, ExtractorItemCategory } from '../american-extractor.types';
import {
  findContextSentence,
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
const STRICT_SINGLE_CATEGORIES = new Set<string>([
  'idiom',
  'slang',
  'phrasal_verb',
  'vocabulary',
  'collocation',
  'connected_speech',
  'discourse_marker',
  'pattern',
]);

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
    .replace(/[\u0000-\u001F]+/g, (match) => (match === '\n' || match === '\r' || match === '\t' ? match : ' '));
  parsed = tryParse(repaired);
  if (parsed) return parsed;

  const salvaged = salvageItems(text);
  if (salvaged) return salvaged;

  throw new Error('The model returned an incomplete study map. Please retry the extraction.');
}

function tryParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * A truncated response can still contain many complete item objects. Recover
 * them instead of discarding an otherwise valuable extraction.
 */
function salvageItems(text: string): any | null {
  const match = /"items"\s*:\s*\[/.exec(text);
  if (!match) return null;

  const startIndex = match.index + match[0].length;
  const objects: string[] = [];
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
        objects.push(text.slice(objectStart, i + 1));
        objectStart = -1;
      }
      continue;
    }
    if (char === ']' && depth === 0) break;
  }

  if (objects.length === 0) return null;
  const items: any[] = [];
  for (const object of objects) {
    try {
      items.push(JSON.parse(object));
    } catch {
      // Ignore a single broken object; later complete items still count.
    }
  }
  if (items.length === 0) return null;
  return { items };
}

export function normalizeExtraction(params: {
  parsed: any;
  sourceText: string;
  fallbackTitle: string;
  targetLanguage: string;
  extractionType?: string;
}): NormalizedExtraction {
  const { parsed, sourceText, fallbackTitle, targetLanguage } = params;
  const requestedType = String(params.extractionType || 'all').trim().toLowerCase();
  const rawItems: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.items)
      ? parsed.items
      : Array.isArray(parsed?.expressions)
        ? parsed.expressions
        : Array.isArray(parsed?.vocabulary)
          ? parsed.vocabulary
          : [];

  if (rawItems.length === 0) {
    throw new Error('The model did not return any study items. Please retry.');
  }

  const items: ExtractorItem[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const raw of rawItems) {
    const term = safeText(raw?.term ?? raw?.expression ?? raw?.phrase ?? raw?.word, 120)
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (!term || term.length < 2) continue;

    const key = normalizeTermKey(term);
    if (!key || seen.has(key)) continue;

    const surface =
      safeText(raw?.surface ?? raw?.exact ?? raw?.quote ?? term, 180)
        .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') || term;
    const contextFromSource = findContextSentence(sourceText, term, surface);
    const modelContext = safeText(raw?.contextSentence ?? raw?.context ?? raw?.sentence, 420);
    const contextSentence = contextFromSource || modelContext;

    const grounded = isGroundedInText(sourceText, term, surface);
    if (!grounded) {
      dropped++;
      continue;
    }

    const meaning = safeText(
      raw?.meaning ?? raw?.definition ?? raw?.contextualMeaning ?? raw?.localizedMeaning,
      520,
    );
    if (!meaning) {
      dropped++;
      continue;
    }

    const localizedRaw = safeText(
      raw?.localizedMeaning ?? raw?.translation ?? raw?.nativeMeaning ?? raw?.meaning,
      520,
    );
    const localizedMeaning =
      targetLanguage === 'en' ? meaning : localizedRaw || meaning;

    const category = normalizeCategory(raw?.category ?? raw?.type);
    const cefrUpper = String(raw?.cefr || '').toUpperCase();
    const cefr = VALID_CEFR.has(cefrUpper) ? cefrUpper : '';
    const frequencyRaw = safeText(raw?.frequency, 24).toLowerCase();
    const frequency = VALID_FREQUENCY.has(frequencyRaw) ? frequencyRaw : '';
    const generalMeaning = safeText(raw?.generalMeaning ?? raw?.generalSense, 420);
    const techNote = safeText(raw?.techNote ?? raw?.workplaceNote, 360);
    const tags = safeList(raw?.tags, 5, 36);

    seen.add(key);
    items.push({
      index: items.length,
      term,
      surface,
      category,
      register: safeText(raw?.register, 40) || registerForCategory(category),
      ipa: safeText(raw?.ipa, 120),
      ...(cefr ? { cefr } : {}),
      ...(frequency ? { frequency } : {}),
      meaning,
      localizedMeaning,
      ...(generalMeaning ? { generalMeaning } : {}),
      contextSentence,
      usageNote: safeText(raw?.usageNote ?? raw?.usage, 420),
      spokenNote: safeText(raw?.spokenNote ?? raw?.pronunciation ?? raw?.mechanics, 420),
      example: safeText(raw?.example ?? raw?.exampleSentence, 420),
      ...(techNote ? { techNote } : {}),
      ...(tags.length > 0 ? { tags } : {}),
      grounded: true,
    });
  }

  if (items.length === 0) {
    throw new Error(
      dropped > 0
        ? 'The model returned expressions that were not grounded in the source. Please retry.'
        : 'No high-value expressions were found in this source. Try a richer source.',
    );
  }

  let finalItems = items;
  if (STRICT_SINGLE_CATEGORIES.has(requestedType)) {
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

function registerForCategory(category: ExtractorItemCategory): string {
  if (category === 'slang') return 'casual';
  if (category === 'idiom' || category === 'phrasal_verb') return 'neutral';
  if (category === 'connected_speech') return 'spoken';
  return 'neutral';
}

/** Normalizes a model title for logs / defensive display. */
export function cleanModelTitle(value: unknown): string {
  return normalizeWhitespace(String(value ?? '')).slice(0, 140);
}
