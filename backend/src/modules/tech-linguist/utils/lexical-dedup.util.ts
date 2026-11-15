import { IdiomItem, VocabItem } from '../tech-linguist.types';

const FUNCTION_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'in', 'on', 'at', 'to', 'for',
  'by', 'with', 'from', 'up', 'out', 'off', 'over', 'under', 'into', 'onto', 'as',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could', 'may',
  'might', 'must', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'this',
  'that', 'these', 'those', 'it', 'you', 'we', 'they', 'he', 'she', 'i', 'me',
  'him', 'them', 'us', 'who', 'what', 'which', 'when', 'where', 'why', 'how',
  'no', 'not', 'so', 'too', 'very', 'just', 'all', 'any', 'some', 'one', 'two',
  'someone', 'something', 'somebody', 'anyone', 'anything',
]);

export function normalizeLexicalKey(text: string): string {
  return String(text || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function stripLeadingInfinitiveTo(term: string): string {
  return String(term || '')
    .trim()
    .replace(/^to\s+([a-zA-Z-]+)$/i, '$1')
    .trim();
}

export function tokenizeLexicalWords(text: string): string[] {
  const norm = normalizeLexicalKey(text);
  if (!norm) return [];
  return norm.match(/[a-z0-9]+(?:'[a-z0-9]+)?/gi) || [];
}

/**
 * Generates safe conservative English inflection variants for a single token
 * without destructive stemming that could cause false positives.
 */
export function buildTokenVariants(token: string): Set<string> {
  const t = normalizeLexicalKey(token);
  const out = new Set<string>();
  if (!t) return out;
  out.add(t);

  const withoutPossessive = t.replace(/'s$/i, '');
  if (withoutPossessive && withoutPossessive !== t) {
    out.add(withoutPossessive);
  }

  if (t.length >= 4 && t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us') && !t.endsWith('is')) {
    out.add(t.slice(0, -1));
  }
  if (t.length >= 5 && t.endsWith('es')) {
    out.add(t.slice(0, -2));
  }
  if (t.length >= 5 && t.endsWith('ies')) {
    out.add(`${t.slice(0, -3)}y`);
  }
  if (t.length >= 5 && t.endsWith('ed')) {
    const stem = t.slice(0, -2);
    out.add(stem);
    out.add(t.slice(0, -1)); // e.g. leveraged -> leverage
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      out.add(stem.slice(0, -1));
    }
  }
  if (t.length >= 6 && t.endsWith('ing')) {
    const stem = t.slice(0, -3);
    out.add(stem);
    out.add(`${stem}e`); // e.g. doubling -> double
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      out.add(stem.slice(0, -1)); // e.g. cutting -> cut, spilling -> spill
    }
  }

  return out;
}

export function tokensShareInflection(a: string, b: string): boolean {
  const normA = normalizeLexicalKey(a);
  const normB = normalizeLexicalKey(b);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  const variantsA = buildTokenVariants(normA);
  const variantsB = buildTokenVariants(normB);
  for (const va of variantsA) {
    if (variantsB.has(va)) return true;
  }
  return false;
}

export function phrasesAreDuplicate(phraseA: string, phraseB: string): boolean {
  const normA = normalizeLexicalKey(phraseA);
  const normB = normalizeLexicalKey(phraseB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  const tokensA = tokenizeLexicalWords(normA);
  const tokensB = tokenizeLexicalWords(normB);
  if (tokensA.length === 0 || tokensA.length !== tokensB.length) return false;

  return tokensA.every((tokA, idx) => tokensShareInflection(tokA, tokensB[idx]));
}

export function isWordCoveredByIdiom(word: string, idiomPhrase: string): boolean {
  const normWord = normalizeLexicalKey(word);
  const normIdiom = normalizeLexicalKey(idiomPhrase);
  if (!normWord || !normIdiom) return false;

  if (normWord === normIdiom || tokensShareInflection(normWord, normIdiom)) {
    return true;
  }

  // Only inspect meaningful content words (>= 3 chars, non-stopword) inside multi-word idioms
  if (normWord.length < 3 || FUNCTION_STOPWORDS.has(normWord)) {
    return false;
  }

  const idiomTokens = tokenizeLexicalWords(normIdiom).filter(
    (tok) => tok.length >= 3 && !FUNCTION_STOPWORDS.has(tok),
  );

  return idiomTokens.some((tok) => tokensShareInflection(normWord, tok));
}

export function deduplicateIdiomItems(items: IdiomItem[]): IdiomItem[] {
  const kept: IdiomItem[] = [];
  for (const item of items) {
    const cleanPhrase = String(item.phrase || '').trim();
    if (!cleanPhrase) continue;
    const isDup = kept.some((existing) => phrasesAreDuplicate(existing.phrase, cleanPhrase));
    if (!isDup) {
      kept.push({ ...item, phrase: cleanPhrase });
    }
  }
  return kept.map((item, idx) => ({ ...item, index: idx + 1 }));
}

export function deduplicateVocabItems(items: VocabItem[]): VocabItem[] {
  const kept: VocabItem[] = [];
  for (const item of items) {
    const cleanTerm = stripLeadingInfinitiveTo(item.term);
    if (!cleanTerm) continue;
    const isDup = kept.some((existing) => phrasesAreDuplicate(existing.term, cleanTerm));
    if (!isDup) {
      kept.push({ ...item, term: cleanTerm });
    }
  }
  return kept.map((item, idx) => ({ ...item, index: idx + 1 }));
}

/**
 * Enforces strict Mode 2 invariant:
 * - Tab 2 (`idiomItems`) is deduplicated cleanly.
 * - Tab 1 (`vocabItems`) contains ONLY single words / single verbs (no multi-word phrases),
 *   is internally deduplicated, and drops ANY word already present in or covered by Tab 2 idioms.
 */
export function enforceStrictTwoListSeparation(
  vocabItems: VocabItem[],
  idiomItems: IdiomItem[],
): { vocabItems: VocabItem[]; idiomItems: IdiomItem[] } {
  const uniqueIdioms = deduplicateIdiomItems(idiomItems);

  const singleWordCandidates = vocabItems
    .map((item) => ({
      ...item,
      term: stripLeadingInfinitiveTo(item.term),
    }))
    .filter((item) => {
      if (!item.term) return false;
      // Strict Tab 1 law: single words & single verbs only (no multi-word combinations or phrasal-verb fragments)
      if (/\s/.test(item.term)) return false;
      if (/\bphrasal\b|\bidiom\b/i.test(`${item.partOfSpeech} ${item.techCategory || ''}`)) {
        return false;
      }
      // Never duplicate or overlap with any Tab 2 idiom/expression/slang/abbreviation
      const overlapsIdiom = uniqueIdioms.some((idiom) => isWordCoveredByIdiom(item.term, idiom.phrase));
      return !overlapsIdiom;
    });

  const uniqueVocab = deduplicateVocabItems(singleWordCandidates);

  return {
    vocabItems: uniqueVocab,
    idiomItems: uniqueIdioms,
  };
}
