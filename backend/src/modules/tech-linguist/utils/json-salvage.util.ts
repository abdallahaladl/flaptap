import { IdiomItem, ThoughtPatternItem, VocabItem } from '../tech-linguist.types';

/**
 * Isolates a JSON object block from markdown code fences or prose wrapping.
 */
export function extractJsonBlock(raw: string): string {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match && match[1]) {
    return match[1].trim();
  }
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }
  return raw.trim();
}

export function repairAndParseJson(rawJson: string): any {
  try {
    return JSON.parse(rawJson);
  } catch {
    // Attempt lightweight repair below
  }

  let cleaned = rawJson
    .replace(/,\s*([\]}])/g, '$1')
    .replace(/[\u0000-\u001F]+/g, (match) =>
      match === '\n' || match === '\r' || match === '\t' ? match : ' ',
    );

  const openBraces = (cleaned.match(/\{/g) || []).length;
  const closeBraces = (cleaned.match(/\}/g) || []).length;
  const openBrackets = (cleaned.match(/\[/g) || []).length;
  const closeBrackets = (cleaned.match(/\]/g) || []).length;

  if (openBrackets > closeBrackets) {
    cleaned += ']'.repeat(openBrackets - closeBrackets);
  }
  if (openBraces > closeBraces) {
    cleaned += '}'.repeat(openBraces - closeBraces);
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export function salvagePartialJson(raw: string, fallbackTitle: string): any {
  const repaired = repairAndParseJson(extractJsonBlock(raw));
  if (repaired && (Array.isArray(repaired.vocabItems) || Array.isArray(repaired.idiomItems))) {
    return repaired;
  }

  const vocabItems: any[] = [];
  const idiomItems: any[] = [];
  const thoughtPatterns: any[] = [];

  const titleMatch = raw.match(/"title"\s*:\s*"([^"]+)"/);
  const parsedTitle = titleMatch ? titleMatch[1] : fallbackTitle;

  const flatObjRegex = /\{[^{}]+\}/g;
  let objMatch: RegExpExecArray | null;
  while ((objMatch = flatObjRegex.exec(raw)) !== null) {
    let item: any = null;
    try {
      item = JSON.parse(objMatch[0].replace(/,\s*}$/, '}'));
    } catch {
      continue;
    }
    if (!item || typeof item !== 'object') continue;

    if (item.term && item.meaningArabic) {
      vocabItems.push(normalizeVocabItem(item, vocabItems.length + 1));
    } else if (item.phrase && item.meaningArabic) {
      idiomItems.push(normalizeIdiomItem(item, idiomItems.length + 1));
    } else if (item.title && item.americanStyle && item.mindsetNote) {
      thoughtPatterns.push(normalizeThoughtPatternItem(item));
    }
  }

  if (vocabItems.length > 0 || idiomItems.length > 0) {
    return {
      title: parsedTitle,
      vocabItems,
      idiomItems,
      thoughtPatterns,
    };
  }

  throw new Error(
    'The AI model returned an unstructured response that could not be parsed as a valid study note.',
  );
}

export function parseExtractionResponse(rawText: string, fallbackTitle: string): any {
  try {
    const cleanJsonStr = extractJsonBlock(rawText);
    return JSON.parse(cleanJsonStr);
  } catch {
    return salvagePartialJson(rawText, fallbackTitle);
  }
}

export function normalizeVocabItem(raw: any, index: number, defaultCategory = 'Engineering'): VocabItem {
  let term = String(raw?.term || '').trim();
  let pos = String(raw?.partOfSpeech || '').trim();
  if (!pos) {
    const parenMatch = term.match(/^(.+?)\s*\(([^)]{2,30})\)\s*$/);
    if (parenMatch) {
      term = parenMatch[1].trim();
      pos = parenMatch[2].trim();
    }
  }
  return {
    index,
    term,
    partOfSpeech: pos,
    generalArabic: String(raw?.generalArabic || '').trim(),
    meaningArabic: String(raw?.meaningArabic || '').trim(),
    contextSentence: String(raw?.contextSentence || '').trim(),
    techCategory: String(raw?.techCategory || defaultCategory).trim(),
  };
}

export function normalizeIdiomItem(raw: any, index: number): IdiomItem {
  let phrase = String(raw?.phrase || '').trim();
  let category = String(raw?.category || '').trim();
  const parenMatch = phrase.match(/^(.+?)\s*\(([^)]{2,30})\)\s*$/);
  if (parenMatch && !category) {
    phrase = parenMatch[1].trim();
    category = parenMatch[2].trim();
  }
  return {
    index,
    phrase,
    ...(category ? { category } : {}),
    generalArabic: String(raw?.generalArabic || '').trim(),
    meaningArabic: String(raw?.meaningArabic || '').trim(),
    contextSentence: String(raw?.contextSentence || '').trim(),
    usageNote: String(raw?.usageNote || '').trim(),
  };
}

export function normalizeThoughtPatternItem(raw: any): ThoughtPatternItem {
  return {
    title: String(raw?.title || '').trim(),
    americanStyle: String(raw?.americanStyle || '').trim(),
    textbookContrast: String(raw?.textbookContrast || '').trim(),
    mindsetNote: String(raw?.mindsetNote || '').trim(),
  };
}
