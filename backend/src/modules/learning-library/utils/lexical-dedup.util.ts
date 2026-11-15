/**
 * Multi-layer lexical normalization and deduplication helpers for the Learning Library.
 * Ensures zero duplicate expressions across all past and future AI generations.
 */

const PLACEHOLDER_TOKENS = new Set([
  'someone',
  "someone's",
  'somebody',
  "somebody's",
  'something',
  'anyone',
  'anybody',
  'anything',
  'some',
  'my',
  'your',
  'his',
  'her',
  'their',
  'our',
  "one's",
  'ones',
  'a',
  'an',
  'the',
]);

const SHORT_FUNCTION_WORDS = new Set([
  'to', 'in', 'on', 'at', 'by', 'of', 'up', 'or', 'so', 'it', 'is', 'be', 'do', 'go', 'no',
  'my', 'we', 'he', 'me', 'us', 'as', 'if', 'an',
]);

/**
 * Normalizes spacing, quotes, hyphens, and outer punctuation to produce a canonical key.
 * Example: "Low-Key!" -> "low key", "What's the move?" -> "what's the move".
 */
export function normalizeCanonicalKey(text: string): string {
  return String(text || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[-–—/]+/g, ' ')
    .replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Collapses spaces and apostrophes to catch merged/split spelling variants
 * such as "low-key" vs "lowkey" vs "low key", or "my bad" vs "mybad".
 */
export function normalizeSlugKey(text: string): string {
  return normalizeCanonicalKey(text).replace(/[^a-z0-9]/g, '');
}

/**
 * Generates conservative inflection variants for a single English token without
 * collapsing distinct words (e.g. "biting" -> {"biting","bit","bite"}, while
 * "bit" -> {"bit"} so "bit" and "bite" never collide).
 */
export function buildTokenVariants(token: string): Set<string> {
  const t = token.replace(/^'+|'+$/g, '').toLowerCase();
  const out = new Set<string>();
  if (!t) return out;
  out.add(t);

  if (t.endsWith("'s") && t.length >= 4) {
    out.add(t.slice(0, -2));
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
    out.add(t.slice(0, -1)); // leveraged -> leverage
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      out.add(stem.slice(0, -1));
    }
  }
  if (t.length >= 6 && t.endsWith('ing')) {
    const stem = t.slice(0, -3);
    out.add(stem);
    out.add(`${stem}e`); // biting -> bite, doubling -> double
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      out.add(stem.slice(0, -1)); // cutting -> cut
    }
  }

  return out;
}

export function tokensShareInflection(a: string, b: string): boolean {
  const normA = a.toLowerCase().trim();
  const normB = b.toLowerCase().trim();
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  const variantsA = buildTokenVariants(normA);
  const variantsB = buildTokenVariants(normB);
  for (const va of variantsA) {
    if (variantsB.has(va)) return true;
  }
  return false;
}

/**
 * Extracts meaningful ordered tokens (preserving prepositions/particles such as
 * "in", "out", "on", "up" so phrasal verbs remain distinct, while ignoring
 * interchangeable placeholder pronouns and determiners).
 */
export function extractSignatureTokens(text: string): string[] {
  const cleaned = String(text || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[\u2018\u2019]/g, "'");
  const canonical = normalizeCanonicalKey(cleaned);
  if (!canonical) return [];

  return canonical
    .split(/\s+/)
    .map((tok) => tok.trim())
    .filter((tok) => Boolean(tok) && !PLACEHOLDER_TOKENS.has(tok));
}

export function computeTokenSignature(text: string): string {
  const tokens = extractSignatureTokens(text);
  return tokens
    .map((tok) => {
      const variants = Array.from(buildTokenVariants(tok));
      return variants.sort((x, y) => x.length - y.length)[0] || tok;
    })
    .join(' ');
}

export interface ExistingDedupRecord {
  expression: string;
  canonicalKey?: string;
  slugKey?: string;
  tokenSignature?: string;
  variations?: string[];
}

export class LearningDeduplicationIndex {
  private readonly canonicalKeys = new Set<string>();
  private readonly slugKeys = new Set<string>();
  private readonly tokenArraysByLength = new Map<number, string[][]>();
  private readonly aliasKeys = new Set<string>();

  constructor(existingRecords: ExistingDedupRecord[] = []) {
    for (const rec of existingRecords) {
      this.add(rec);
    }
  }

  get size(): number {
    return this.canonicalKeys.size;
  }

  /**
   * Checks whether a candidate expression duplicates anything already stored
   * or accepted in the current batch across canonical, slug, alias, and
   * inflectional token levels.
   */
  isDuplicate(expression: string, _variations: string[] = []): boolean {
    const canonical = normalizeCanonicalKey(expression);
    if (!canonical) return true;

    const slug = normalizeSlugKey(expression);
    if (this.canonicalKeys.has(canonical)) return true;
    if (slug && slug.length >= 3 && this.slugKeys.has(slug)) return true;
    if (this.aliasKeys.has(canonical)) return true;

    const candidateTokens = extractSignatureTokens(expression);
    if (candidateTokens.length > 0) {
      const sameLengthExisting = this.tokenArraysByLength.get(candidateTokens.length) || [];
      for (const existingTokens of sameLengthExisting) {
        if (existingTokens.every((tok, idx) => tokensShareInflection(tok, candidateTokens[idx]))) {
          return true;
        }
      }
    }

    return false;
  }

  add(record: ExistingDedupRecord): void {
    const canonical = record.canonicalKey || normalizeCanonicalKey(record.expression);
    if (!canonical) return;

    const slug = record.slugKey || normalizeSlugKey(record.expression);
    const tokens = extractSignatureTokens(record.expression);

    this.canonicalKeys.add(canonical);
    if (slug) this.slugKeys.add(slug);

    if (tokens.length > 0) {
      const bucket = this.tokenArraysByLength.get(tokens.length) || [];
      bucket.push(tokens);
      this.tokenArraysByLength.set(tokens.length, bucket);
    }

    if (Array.isArray(record.variations)) {
      for (const variant of record.variations) {
        const vCanon = normalizeCanonicalKey(variant);
        if (vCanon && vCanon.length >= 2 && !SHORT_FUNCTION_WORDS.has(vCanon)) {
          this.aliasKeys.add(vCanon);
        }
      }
    }
  }
}
