import { escapeTranscriptHtml } from './highlights';
import { TimedWord, TranscriptResult } from '../../modules/tracks/media-hub/transcript.service';
import { ChunkItem, SentenceItem } from '../database/history.repository';

export type MediaHubPacingMode = 'short' | 'normal';

/**
 * Legacy pacing labels fold into the current two-mode model:
 * - `balanced` was the old "Medium" mode; it only split sentences longer than
 *   ~13 words, so it rendered identically to the old Full mode.
 * - `full` was the old complete-sentence mode; it allowed 45-word walls.
 * Both now resolve to `normal`, the smart complete-sentence mode.
 */
const LEGACY_PACING_ALIASES: Record<string, MediaHubPacingMode> = {
  balanced: 'normal',
  full: 'normal',
};

export function isValidPacingMode(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const clean = raw.trim().toLowerCase();
  return clean === 'short' || clean === 'normal' || Boolean(LEGACY_PACING_ALIASES[clean]);
}

export function normalizePacingMode(raw?: unknown): MediaHubPacingMode {
  if (typeof raw === 'string') {
    const clean = raw.trim().toLowerCase();
    if (clean === 'short') return 'short';
    if (clean === 'normal') return 'normal';
    if (LEGACY_PACING_ALIASES[clean]) return LEGACY_PACING_ALIASES[clean];
  }
  return 'short';
}

export interface SegWord {
  text: string;
  clean: string;
  start: number;
  end: number;
  srcIndex?: number;
}

const ABBREVIATIONS = new Set([
  'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'sr.', 'jr.', 'st.', 'ave.', 'blvd.',
  'vs.', 'v.', 'etc.', 'e.g.', 'i.e.', 'cf.', 'al.', 'inc.', 'ltd.', 'co.', 'corp.',
  'fig.', 'no.', 'vol.', 'ch.', 'sec.', 'est.', 'approx.', 'dept.', 'univ.',
  'jan.', 'feb.', 'mar.', 'apr.', 'jun.', 'jul.', 'aug.', 'sep.', 'sept.', 'oct.', 'nov.', 'dec.',
  'u.s.', 'u.k.', 'e.u.', 'p.s.', 'a.m.', 'p.m.', 'ph.d.', 'm.d.',
]);

/**
 * Words that can NEVER conclude a grammatical English sentence in unpunctuated
 * speech. Prevents mid-phrase splits like "meant | for companies" or "two different | rules".
 */
const NON_TERMINAL_WORDS = new Set([
  // Articles & determiners
  'the', 'a', 'an', 'this', 'these', 'those', 'every', 'each', 'either', 'neither', 'another', 'some', 'any',
  // Possessives
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
  // Prepositions
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'upon',
  'towards', 'toward', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'under', 'over', 'without', 'within', 'against', 'among', 'around', 'about', 'like', 'than',
  // Conjunctions & complementizers
  'and', 'or', 'but', 'so', 'because', 'nor', 'yet', 'although', 'though', 'while', 'since', 'if', 'unless', 'whether',
  'that', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how', 'what',
  // Subject pronouns & contractions
  'i', 'we', 'he', 'she', 'they',
  "i'm", "you're", "we're", "they're", "he's", "she's", "it's", "that's", "there's", "here's", "what's", "who's", "let's",
  "i've", "you've", "we've", "they've", "i'll", "you'll", "we'll", "they'll", "i'd", "you'd", "we'd", "they'd",
  // Auxiliaries, modals & negations
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having', 'do', 'does', 'did',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  'not', 'no', "don't", "doesn't", "didn't", "won't", "wouldn't", "can't", "couldn't", "shouldn't", "isn't", "aren't", "wasn't", "weren't", "haven't", "hasn't", "hadn't",
  // Degree adverbs & common pre-nominal modifiers
  'very', 'really', 'too', 'quite', 'rather', 'pretty', 'extremely', 'completely', 'totally', 'absolutely',
  'just', 'only', 'even', 'still', 'also', 'almost', 'nearly', 'drastically', 'significantly',
  'more', 'most', 'less', 'least', 'many', 'much', 'few', 'several',
  'first', 'second', 'third', 'next', 'last', 'new', 'old', 'good', 'bad', 'big', 'small', 'different', 'same', 'other',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
]);

/**
 * Words that continue a tight noun/prepositional/infinitive phrase from the
 * preceding word and should not be detached in unpunctuated ASR streams unless
 * a strong acoustic silence occurred.
 */
const PHRASE_CONTINUATION_NEXT = new Set([
  'of', 'for', 'to', 'in', 'on', 'with', 'at', 'by', 'from', 'into', 'about',
  'between', 'through', 'during', 'without', 'within', 'than', 'as', 'or',
]);

/** Words that commonly open a fresh independent clause in spoken English. */
const CLAUSE_STARTERS = new Set([
  'i', "i'm", "i've", "i'll", 'you', "you're", 'we', "we're", 'they', "they're",
  'he', 'she', 'it', "it's", 'this', 'that', "that's", 'these', 'those',
  'there', "there's", 'here', "here's", 'the',
  'so', 'but', 'now', 'well', 'instead', 'however', 'unfortunately', 'fortunately',
  'actually', 'honestly', 'basically', 'first', 'second', 'third', 'finally',
  'let', "let's", 'when', 'if', 'what', 'why', 'how', 'no', 'don\'t', 'never',
]);

/**
 * Coordinating conjunctions, subordinating conjunctions, and discourse connectors
 * that can initiate an independent or subordinate clause in spoken English.
 */
const INDEPENDENT_CLAUSE_STARTERS = new Set([
  'and', 'but', 'so', 'yet', 'or', 'nor',
  'because', 'although', 'though', 'while', 'whereas', 'since',
  'meaning', 'when', 'if', 'where', 'after', 'before',
  'however', 'instead', 'unfortunately', 'fortunately', 'actually', 'basically', 'now', 'well', 'let\'s',
]);

/** Unambiguous subject-form pronouns/deictics that frequently start a fresh spoken clause. */
const STRICT_SUBJECT_CLAUSE_STARTERS = new Set([
  'i', "i'm", "i've", "i'll", "i'd", "you're", "you've", "you'll", "we're", "they're",
  'he', 'she', 'we', 'they', 'there', "there's", 'here', "here's", "that's", "it's",
]);

/** Pronouns that can serve as direct objects ("guide you", "need it") unless preceded by pause/comma. */
const AMBIGUOUS_OBJECT_PRONOUNS = new Set(['you', 'it', 'this', 'that']);

/** Verbs/participles that should stay attached to their immediate object or complement. */
const OBJECT_TAKING_VERBS = new Set([
  'guide', 'help', 'tell', 'give', 'show', 'ask', 'find', 'get', 'got', 'make', 'made',
  'take', 'took', 'keep', 'kept', 'bring', 'brought', 'send', 'sent', 'teach', 'let',
  'want', 'need', 'like', 'love', 'use', 'used', 'learn', 'stay', 'feel', 'see', 'saw',
  'know', 'knew', 'understand', 'meet', 'join', 'watch', 'hear', 'read', 'write',
  'hold', 'put', 'set', 'start', 'stop', 'try', 'call', 'build', 'create', 'buy',
  'accumulate', 'accumulating', 'checking', 'doing', 'getting', 'making', 'taking',
  'telling', 'giving', 'showing', 'helping', 'guiding', 'finding', 'learning',
]);

/** Pronouns that, when left at the end of a mid-sentence slice, strand a verb/preposition. */
const CHUNK_TAIL_PRONOUNS = new Set(['me', 'you', 'him', 'her', 'us', 'them', 'it']);

/** Object pronouns, articles, determiners, and verb particles bound to an immediately preceding verb. */
const OBJECT_OR_COMPLEMENT_NEXT = new Set([
  'you', 'it', 'me', 'him', 'her', 'them', 'us',
  'yourself', 'myself', 'himself', 'herself', 'themselves', 'ourselves',
  'the', 'a', 'an', 'this', 'that', 'these', 'those',
  'my', 'your', 'his', 'her', 'our', 'their', 'its',
  'some', 'any', 'more', 'tuned', 'out', 'off', 'up', 'down', 'away', 'back', 'over', 'into', 'onto',
]);

/** Prepositional phrase starters that make clean rhythmic phrase breaks when not bound to a noun/verb head. */
const ADVERBIAL_PP_STARTERS = new Set([
  'without', 'unless', 'instead', 'before', 'after', 'until', 'during', 'despite', 'except', 'through',
]);

/** Attributive modifiers/compound heads that shouldn't split right before the following noun. */
const PRE_NOMINAL_MODIFIERS = new Set([
  'new', 'old', 'good', 'great', 'best', 'real', 'whole', 'first', 'second', 'third',
  'last', 'next', 'other', 'another', 'same', 'different', 'complete', 'huge', 'tiny',
  'little', 'big', 'small', 'long', 'short', 'programming', 'random', 'mental', 'useful',
  'basic', 'entire', 'specific', 'actual', 'dramatically', 'completely', 'especially',
  'all', 'both', 'many', 'most', 'several', 'few', 'exponential', 'modern', 'natural',
  'computer', 'social', 'human', 'public', 'private', 'total', 'average', 'main', 'major',
]);

/** Auxiliaries/copulas that must stay attached to their subject unless a comma/pause precedes them. */
const AUX_VERBS_AFTER_SUBJECT = new Set([
  'is', 'are', 'was', 'were', 'am', 'be', 'been', 'will', 'would', 'can', 'could', 'should',
  'must', 'may', 'might', 'has', 'have', 'had', 'does', 'did', 'means', 'makes', 'gets',
]);

export function formatSentenceText(rawText: string): string {
  let text = (rawText || '').trim();
  if (!text) return '';
  text = text.replace(/[,;:]+$/, '.');
  if (!/[.?!][)"'\u201d\u2019]*$/.test(text)) {
    text = text + '.';
  }
  text = text.replace(/^(\s*(?:\[[^\]]+\]\s*|["'(\[])*\s*)([a-z])/, (_m, p, l) => p + l.toUpperCase());
  return text;
}

const PARAGRAPH_TRANSITION_PATTERNS = [
  /^(now|so|but|however|meanwhile|ultimately|finally|first|second|third|next|instead|unfortunately|fortunately|in fact|for example|on the other hand)\b/i,
  /^(here's|here is|let's|the problem is|the truth is|the first|the second|the third|another|one of the)\b/i,
];

export function roundMs(value: number): number {
  return Math.round(Number(value) * 1000) / 1000;
}

export function formatTimestampMs(sec: number): string {
  const totalMs = Math.max(0, Math.round(Number(sec) * 1000));
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function cleanToken(word: string): string {
  return (word || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');
}

function normalizeWords(data: TranscriptResult): SegWord[] {
  const source: TimedWord[] = data.timed_words?.length
    ? data.timed_words
    : interpolateFromCues(data);

  const out: SegWord[] = [];
  for (const w of source) {
    if (!w || typeof w.word !== 'string' || !w.word.trim()) continue;
    const text = w.word.replace(/\u00a0/g, ' ').trim();
    out.push({
      text,
      clean: w.clean || cleanToken(text),
      start: Number(w.start_sec) || 0,
      end: Number(w.end_sec) || 0,
    });
  }
  return out;
}

function interpolateFromCues(data: TranscriptResult): TimedWord[] {
  const timed: TimedWord[] = [];
  (data.cues || []).forEach((cue, cueIndex) => {
    const tokens = (cue.text || '').replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return;
    const start = Number(cue.start_sec) || 0;
    const end = Math.max(Number(cue.end_sec) || start + 1, start + 0.2);
    const step = (end - start) / tokens.length;
    tokens.forEach((word, idx) => {
      timed.push({
        word,
        clean: cleanToken(word),
        start_sec: roundMs(start + idx * step),
        end_sec: roundMs(start + (idx + 1) * step),
        cue_index: cueIndex,
        cue_end: idx === tokens.length - 1,
      });
    });
  });
  return timed;
}

/**
 * Determines whether a token genuinely ends a grammatical sentence (`?`, `!`, `.`).
 * Excludes ellipses (`...`), abbreviations (`Dr.`, `vs.`, `U.S.`, `P.S.`), and
 * single uppercase initials (`J.`).
 */
export function isTrueSentenceTerminal(rawWord: string, nextRawWord?: string): boolean {
  const trimmed = (rawWord || '').trim();
  if (!trimmed) return false;
  if (/(\.\.\.|…)[)"'\]]*$/.test(trimmed)) return false;

  const strippedQuotes = trimmed.replace(/[)"'\]\u201d\u2019]+$/g, '');
  if (!/[.?!]$/.test(strippedQuotes)) return false;

  // Question marks and exclamation points always terminate a sentence unless mid-token.
  if (/[?!]$/.test(strippedQuotes)) return true;

  // Period checks:
  // "No." is an abbreviation for "Number" only before digits ("No. 5");
  // before words ("No. I can't...") it is a complete spoken sentence.
  const lower = strippedQuotes.toLowerCase();
  if (lower === 'no.') {
    return !(nextRawWord && /^\d/.test(nextRawWord.trim()));
  }
  if (ABBREVIATIONS.has(lower)) return false;

  // Single-letter initial like "A." or "J." followed by a capitalized surname
  if (/^[A-Z]\.$/.test(strippedQuotes)) return false;

  // Multi-dot acronym like "U.S.A." unless the next word clearly starts a new capitalized sentence
  if (/^(?:[a-zA-Z]\.){2,}$/.test(strippedQuotes)) {
    if (nextRawWord && /^[a-z]/.test(nextRawWord.trim())) return false;
  }

  return true;
}

/**
 * Estimates the acoustic pause after `words[i]` in seconds.
 * In YouTube JSON3 auto-captions, inter-word silence is absorbed into the
 * sentence-final word's duration (`end - start`), so we measure both explicit
 * gap and excess duration above normal articulation length.
 */
function estimatePauseAfter(words: SegWord[], i: number): number {
  const curr = words[i];
  const next = words[i + 1];
  if (!curr) return 0;
  const explicitGap = next ? Math.max(0, next.start - curr.end) : 0.6;
  const wordDur = Math.max(0, curr.end - curr.start);
  const expectedDur = 0.13 + 0.038 * Math.min(Math.max(curr.clean.length, 2), 14);
  const absorbedPause = Math.max(0, wordDur - expectedDur);
  return roundMs(explicitGap + absorbedPause);
}

const SOFT_BOUNDARY_STARTERS = new Set([
  'what',
  'which',
  'who',
  'whom',
  'whose',
  'that',
  'with',
  'without',
  'for',
  'to',
  'in',
  'into',
  'about',
  'from',
  'through',
  'after',
  'before',
  'during',
  'over',
  'under',
  'between',
  'is',
  'are',
  'was',
  'were',
  'have',
  'has',
  'had',
  'will',
  'would',
  'can',
  'could',
  'should',
]);

const SEMI_MODAL_BEFORE_TO = new Set([
  'going',
  'want',
  'wants',
  'wanted',
  'need',
  'needs',
  'needed',
  'have',
  'has',
  'had',
  'try',
  'tries',
  'trying',
  'tried',
  'used',
  'ought',
  'able',
  'supposed',
  'about',
  'ready',
  'happy',
  'glad',
  'listen',
  'talk',
  'talking',
]);

const RIGHT_ATTACHING_MODIFIERS = new Set([
  'very',
  'really',
  'so',
  'too',
  'quite',
  'completely',
  'actually',
  'literally',
  'constantly',
  'always',
  'never',
  'just',
  'only',
  'even',
  'still',
  'pretty',
  'super',
  'kind',
  'sort',
]);

const BARE_SUBJECT_PRONOUNS = new Set([
  'i',
  'you',
  'we',
  'they',
  'he',
  'she',
  'it',
]);

const BINOMIAL_CLAUSE_BREAKERS = new Set([
  'not',
  'never',
  'no',
  'i',
  'you',
  'we',
  'they',
  'he',
  'she',
  'it',
  "i'm",
  "you're",
  "we're",
  "they're",
  "he's",
  "she's",
  "it's",
  "that's",
  "there's",
  'there',
  'then',
  'so',
  'when',
  'if',
  'because',
  'that',
  'just',
  'also',
  'still',
  'even',
  "don't",
  "doesn't",
  "didn't",
  "won't",
  "can't",
  "couldn't",
  "wouldn't",
  "shouldn't",
]);

const KNOWN_BINOMIAL_PAIRS = new Set([
  'fight or flight',
  'back and forth',
  'more or less',
  'day and night',
  'up and down',
  'black and white',
  'pros and cons',
  'sooner or later',
  'now and then',
  'here and there',
  'in and out',
  'on and off',
  'give and take',
  'trial and error',
  'peace and quiet',
  'short and sweet',
  'loud and clear',
  'safe and sound',
  'over and over',
  'again and again',
]);

interface PacingProfile {
  /** Sentences at or below this many words never split, regardless of pace. */
  wholeAlwaysWords: number;
  /** Sentences within this word + duration budget stay as one complete line. */
  wholeMaxWords: number;
  wholeMaxDurSec: number;
  minWords: number;
  maxWords: number;
  idealDurSec: number;
  minDurSec: number;
  splitBaseCost: number;
  anchorTwoWordChunks: boolean;
  /** Length penalty for a slice; zero inside the mode's sweet spot. */
  chunkCost: (length: number) => number;
}

const PACING_PROFILES: Record<MediaHubPacingMode, PacingProfile> = {
  short: {
    // Never cut a complete short thought. Up to 11 words stays whole (or 4.5s
    // for slow speech); longer sentences break into 4–9 word drill units.
    wholeAlwaysWords: 6,
    wholeMaxWords: 11,
    wholeMaxDurSec: 4.5,
    minWords: 2,
    maxWords: 9,
    idealDurSec: 2.6,
    minDurSec: 0.8,
    splitBaseCost: 2.8,
    anchorTwoWordChunks: true,
    // 4–8 words is the zero-penalty sweet spot for effortless active shadowing.
    chunkCost: (len) => (len === 2 ? 3.2 : len === 3 ? 2.2 : len === 9 ? 1.4 : 0),
  },
  normal: {
    wholeAlwaysWords: 0,
    // Complete-sentence budget: one normal spoken sentence fits on one line.
    // A 40-word run-on is not a "normal" line, so only genuinely long
    // sentences are broken — at their strongest clause boundary.
    wholeMaxWords: 20,
    wholeMaxDurSec: 9.5,
    minWords: 6,
    maxWords: 18,
    idealDurSec: 5.5,
    minDurSec: 2.0,
    splitBaseCost: 6.5,
    anchorTwoWordChunks: false,
    // 9–15 words per line: two balanced clauses, never a 3-word fragment.
    chunkCost: (len) => (len < 9 ? (9 - len) * 0.9 : len > 15 ? (len - 15) * 1.0 : 0),
  },
};

/**
 * Splits a grammatical sentence into shadowing units using one shared DP over
 * linguistic & acoustic boundaries. The profile only tunes the goals; the
 * boundary intelligence (punctuation, clause starters, pauses, verb-object
 * integrity) is shared by both modes, so there is no duplicated splitter.
 *
 * Guarantees:
 * - `short`: 4–9 word drill units (4–8 sweet spot); complete thoughts up to 11 words stay intact.
 * - `normal`: a complete sentence of up to ~20 words / 9.5s stays intact;
 *   longer sentences split only at their strongest clause boundary into
 *   balanced 9–15 word halves instead of arbitrary word-count chunks.
 * - Preserves exact word order and millisecond timestamps without mutating any word timing.
 */
function splitLongSentence(
  words: SegWord[],
  pacingMode: MediaHubPacingMode = 'short',
): SegWord[][] {
  const n = words.length;
  if (n === 0) return [];
  const mode = normalizePacingMode(pacingMode);
  const profile = PACING_PROFILES[mode];
  const totalDur = Math.max(0, words[n - 1].end - words[0].start);

  if (n <= profile.wholeAlwaysWords) return [words];
  if (n <= profile.wholeMaxWords && totalDur <= profile.wholeMaxDurSec) return [words];
  if (n < profile.minWords) return [words];

  // Precompute boundary quality cost for cutting right after words[k - 1] (before words[k])
  const boundaryCost = new Array<number>(n + 1).fill(0);
  const boundaryHasBreak = new Array<boolean>(n + 1).fill(false);
  for (let k = 1; k < n; k++) {
    const prev = words[k - 1];
    const next = words[k];
    let cost = 0;

    const pause = Math.max(0, next.start - prev.end);
    const effectivePause = Math.max(pause, estimatePauseAfter(words, k - 1) * 0.72);
    const hasPunctuation = /[,;:\u2014\u2013]$/.test(prev.text);
    boundaryHasBreak[k] = hasPunctuation || effectivePause >= 0.25;

    const isIndepClause = INDEPENDENT_CLAUSE_STARTERS.has(next.clean);
    const isStrictSubject = STRICT_SUBJECT_CLAUSE_STARTERS.has(next.clean);
    const isAmbiguousPronoun = AMBIGUOUS_OBJECT_PRONOUNS.has(next.clean);
    const isPronounClause = isStrictSubject || (isAmbiguousPronoun && (hasPunctuation || effectivePause >= 0.22));
    const isSemiModalTo = next.clean === 'to' && SEMI_MODAL_BEFORE_TO.has(prev.clean);
    const isSoftStarter = !isSemiModalTo && SOFT_BOUNDARY_STARTERS.has(next.clean);
    const isAdverbialPP = ADVERBIAL_PP_STARTERS.has(next.clean) && !NON_TERMINAL_WORDS.has(prev.clean);

    const isVerbObjectCut =
      !hasPunctuation &&
      effectivePause < 0.28 &&
      OBJECT_TAKING_VERBS.has(prev.clean) &&
      OBJECT_OR_COMPLEMENT_NEXT.has(next.clean);

    const isModifierNounCut =
      !hasPunctuation &&
      effectivePause < 0.22 &&
      !isIndepClause &&
      !isPronounClause &&
      !isSoftStarter &&
      !isAdverbialPP &&
      PRE_NOMINAL_MODIFIERS.has(prev.clean);

    const isShortBinomialPair =
      !hasPunctuation &&
      effectivePause < 0.22 &&
      (next.clean === 'or' || next.clean === 'and') &&
      k + 1 < n &&
      !BINOMIAL_CLAUSE_BREAKERS.has(words[k + 1].clean) &&
      ((k >= 2 && NON_TERMINAL_WORDS.has(words[k - 2].clean)) ||
        KNOWN_BINOMIAL_PAIRS.has(`${prev.clean} ${next.clean} ${words[k + 1].clean}`));

    if (prev.clean === next.clean) {
      cost += 28; // Never cut between identical repeated words ("really really")
    }
    if (!hasPunctuation && NON_TERMINAL_WORDS.has(prev.clean)) {
      cost += 20; // Strongly avoid stranding articles/prepositions/possessives at line end
    }
    if (isSemiModalTo && !hasPunctuation) {
      cost += 14; // Keep "going to", "want to", "have to", "need to" glued together
    }
    if (isVerbObjectCut) {
      cost += 14; // Never split transitive verb from its object ("guide | you", "get | the", "stay | tuned")
    }
    if (isModifierNounCut) {
      cost += 11; // Keep attributive modifier + noun ("new programming | language", "mental | model") together
    }
    if (
      !hasPunctuation &&
      effectivePause < 0.28 &&
      AUX_VERBS_AFTER_SUBJECT.has(next.clean) &&
      !NON_TERMINAL_WORDS.has(prev.clean)
    ) {
      cost += 9; // Keep subject + auxiliary together ("all encryption | is broken")
    }
    if (!hasPunctuation && effectivePause < 0.22 && RIGHT_ATTACHING_MODIFIERS.has(prev.clean)) {
      cost += 8; // Keep right-attaching modifiers glued to the word they modify
    }
    if (!hasPunctuation && effectivePause < 0.22 && BARE_SUBJECT_PRONOUNS.has(prev.clean)) {
      cost += 10; // Never strand bare subject pronouns ("where I | envision")
    }
    if (!hasPunctuation && CHUNK_TAIL_PRONOUNS.has(prev.clean)) {
      cost += 14; // Never end a slice on an object/subject pronoun ("help you | out", "if you | want")
    }

    if (hasPunctuation) {
      cost -= 11; // Strongest preference: natural comma/semicolon/dash pause
    } else if (effectivePause >= 0.22) {
      cost -= 7; // Clear acoustic breath pause (explicit or absorbed)
    }

    if (isShortBinomialPair) {
      cost += 6; // Keep tight binomial phrases ("fight or flight", "back and forth") intact
    } else if (isIndepClause && !isVerbObjectCut) {
      cost -= 5.5;
    } else if (isPronounClause && !isVerbObjectCut) {
      cost -= 3.2;
    } else if (isAdverbialPP && !isVerbObjectCut) {
      cost -= 4.2;
    } else if (isSoftStarter && !isVerbObjectCut) {
      cost -= 2.4;
    } else if (!hasPunctuation && effectivePause < 0.22) {
      cost += 2.2; // Discourage arbitrary mid-phrase cuts when a real boundary exists nearby
    }

    if (PHRASE_CONTINUATION_NEXT.has(next.clean) && !hasPunctuation && effectivePause < 0.22) {
      cost += 4.5;
    }

    boundaryCost[k] = cost;
  }

  // DP: dp[i] = minimum total cost to segment words[0..i-1]
  const INF = 1e9;
  const dp = new Array<number>(n + 1).fill(INF);
  const back = new Array<number>(n + 1).fill(-1);
  dp[0] = 0;

  for (let end = profile.minWords; end <= n; end++) {
    const minStart = Math.max(0, end - profile.maxWords);
    const maxStart = end - profile.minWords;
    for (let start = minStart; start <= maxStart; start++) {
      if (dp[start] >= INF) continue;
      const len = end - start;
      // Short mode may only use a 2-word slice when anchored on both edges by a
      // comma/pause/sentence boundary.
      if (
        len === 2 &&
        profile.anchorTwoWordChunks &&
        (!(start === 0 || boundaryHasBreak[start]) || !(end === n || boundaryHasBreak[end]))
      ) {
        continue;
      }
      const dur = Math.max(0, words[end - 1].end - words[start].start);

      let chunkCost = profile.chunkCost(len);
      if (dur > profile.idealDurSec) chunkCost += (dur - profile.idealDurSec) * 5;
      else if (dur < profile.minDurSec) chunkCost += (profile.minDurSec - dur) * 4;

      const splitPenalty = start === 0 ? 0 : profile.splitBaseCost + boundaryCost[start];
      const total = dp[start] + splitPenalty + chunkCost;
      if (total < dp[end]) {
        dp[end] = total;
        back[end] = start;
      }
    }
  }

  if (back[n] === -1) {
    return [words];
  }

  const chunks: SegWord[][] = [];
  let cursor = n;
  while (cursor > 0) {
    const prev = back[cursor];
    if (prev < 0 || prev >= cursor) break;
    chunks.push(words.slice(prev, cursor));
    cursor = prev;
  }
  chunks.reverse();
  return chunks.length > 0 ? chunks : [words];
}

/**
 * Reusable shadowing splitter for millisecond-timed word arrays (e.g. AI-reviewed
 * sentences in `word-alignment.util.ts`). Preserves exact word objects & timestamps.
 */
export function splitTimedWordsForShadowing<
  T extends { word: string; clean?: string; startMs: number; endMs: number },
>(words: T[], pacingMode: MediaHubPacingMode = 'short'): T[][] {
  if (!Array.isArray(words) || words.length === 0) return [];
  const segWords: SegWord[] = words.map((w) => ({
    text: w.word,
    clean: w.clean || cleanToken(w.word),
    start: (Number(w.startMs) || 0) / 1000,
    end: (Number(w.endMs) || 0) / 1000,
  }));

  const splitGroups = splitLongSentence(segWords, pacingMode);
  if (splitGroups.length <= 1) return [words];

  const out: T[][] = [];
  let cursor = 0;
  for (const grp of splitGroups) {
    const slice = words.slice(cursor, cursor + grp.length);
    cursor += grp.length;
    if (slice.length > 0) out.push(slice);
  }
  if (cursor < words.length) {
    if (out.length > 0) out[out.length - 1].push(...words.slice(cursor));
    else out.push(words.slice(cursor));
  }
  return out;
}

/**
 * Builds complete, natural spoken sentences from word-level timings.
 *
 * Guarantee:
 * - On punctuated transcripts: extracts true sentences and divides long multi-clause
 *   run-ons according to `pacingMode` (`short` | `normal`) at natural clause,
 *   list, or breath boundaries.
 * - On unpunctuated ASR auto-captions: combines acoustic phrase-final pause
 *   detection with syntactic completeness checks scaled to `pacingMode`.
 * - Every word is preserved verbatim in exact contiguous order with 3-decimal
 *   millisecond timestamps and proper sentence punctuation.
 */
export function segmentSentences(
  data: TranscriptResult,
  pacingMode: MediaHubPacingMode = 'short',
): SentenceItem[] {
  const words = normalizeWords(data);
  if (words.length === 0) return [];
  const mode = normalizePacingMode(pacingMode);

  const { pacedGroups: rawSegments } = segmentWordStreamWithCanonical(words, mode);

  const sentences: SentenceItem[] = [];
  let previousEnd = 0;

  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i];
    if (seg.length === 0) continue;
    const rawText = seg.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
    if (!rawText) continue;
    // Preserve verbatim punctuation & casing across split slices (zero synthetic mid-sentence periods)
    const text = rawText;

    let startSec = seg[0].start;
    if (startSec < previousEnd) startSec = previousEnd;

    const lastWord = seg[seg.length - 1];
    const lastWordStart = lastWord.start;
    const lastWordEnd = lastWord.end;

    // Look ahead to find the earliest onset of the subsequent sentence segment
    let nextStartSec: number | null = null;
    for (let j = i + 1; j < rawSegments.length; j++) {
      if (rawSegments[j].length > 0) {
        nextStartSec = rawSegments[j][0].start;
        break;
      }
    }

    let endSec = lastWordEnd;
    if (nextStartSec !== null) {
      const cleanLen = lastWord.clean ? lastWord.clean.length : 4;
      // Acoustic articulation duration for the final word phonemes + natural release tail
      const minArticDur = 0.12 + 0.035 * Math.min(Math.max(cleanLen, 2), 12);
      const naturalWordEnd = roundMs(lastWordStart + minArticDur + 0.06);
      const baseWordEnd = Math.max(lastWordEnd, naturalWordEnd);

      if (nextStartSec > baseWordEnd) {
        const availablePause = nextStartSec - baseWordEnd;
        // Allow natural spoken acoustic release decay (up to 350ms) into inter-sentence silence
        const safeTail = Math.min(0.35, availablePause * 0.5);
        endSec = baseWordEnd + safeTail;
      } else {
        endSec = baseWordEnd;
      }

      // Absolute Playback Boundary Law guarantee: strictly bound at least 50ms before next sentence onset
      endSec = Math.min(endSec, nextStartSec - 0.05);
    } else {
      // Final sentence in the transcript: allow 0.30s natural acoustic decay
      endSec = lastWordEnd + 0.30;
    }

    if (endSec <= startSec) endSec = startSec + 0.5;

    startSec = roundMs(startSec);
    endSec = roundMs(endSec);
    previousEnd = endSec;

    sentences.push({
      id: `sent-${sentences.length + 1}`,
      index: sentences.length + 1,
      timeRange: `[${formatTimestampMs(startSec)} - ${formatTimestampMs(endSec)}]`,
      startSec,
      endSec,
      durationSec: Math.max(roundMs(endSec - startSec), 0.5),
      text,
      highlightedHtml: escapeTranscriptHtml(text),
    });
  }

  return sentences;
}

export interface SegmentedWordStreamResult {
  hasRealPunctuation: boolean;
  canonicalGroups: SegWord[][];
  pacedGroups: SegWord[][];
  pacedToCanonIndex: number[];
}

function formatCanonicalBoundaryWords(canonWords: SegWord[]): SegWord[] {
  if (canonWords.length === 0) return [];
  const cloned = canonWords.map((w) => ({ ...w }));
  // Capitalize first alphabetic token (skipping leading bracketed cue tags like [music])
  for (let i = 0; i < cloned.length; i++) {
    if (/^\[[^\]]+\]$/.test(cloned[i].text.trim())) continue;
    cloned[i].text = cloned[i].text.replace(/^(\s*["'(\[]*)([a-z])/, (_m, p, l) => p + l.toUpperCase());
    break;
  }
  const last = cloned[cloned.length - 1];
  let endText = last.text.trim().replace(/[,;:]+$/, '');
  if (!/[.?!][)"'\u201d\u2019]*$/.test(endText)) {
    endText = endText + '.';
  }
  last.text = endText;
  return cloned;
}

/**
 * Unified two-stage segmentation pipeline (`canonical sentences -> pacing splits`)
 * shared across `segmentSentences`, `buildRawTranscriptSnapshot`, and pacing regrouping.
 */
export function segmentWordStreamWithCanonical(
  words: SegWord[],
  pacingMode: MediaHubPacingMode = 'short',
): SegmentedWordStreamResult {
  if (!Array.isArray(words) || words.length === 0) {
    return {
      hasRealPunctuation: false,
      canonicalGroups: [],
      pacedGroups: [],
      pacedToCanonIndex: [],
    };
  }
  const mode = normalizePacingMode(pacingMode);

  let terminalCount = 0;
  for (let i = 0; i < words.length; i++) {
    if (isTrueSentenceTerminal(words[i].text, words[i + 1]?.text)) {
      terminalCount++;
    }
  }
  const hasRealPunctuation = terminalCount >= Math.max(2, Math.floor(words.length / 55));

  const rawCanonicalGroups = hasRealPunctuation
    ? segmentPunctuatedCanonical(words)
    : segmentUnpunctuatedCanonical(words);

  const canonicalGroups = hasRealPunctuation
    ? rawCanonicalGroups
    : rawCanonicalGroups.map((g) => formatCanonicalBoundaryWords(g));

  const pacedGroups: SegWord[][] = [];
  const pacedToCanonIndex: number[] = [];

  for (let cIdx = 0; cIdx < canonicalGroups.length; cIdx++) {
    const canonWords = canonicalGroups[cIdx];
    const subSegments = splitLongSentence(canonWords, mode);
    for (const sub of subSegments) {
      if (sub.length === 0) continue;
      pacedGroups.push(sub);
      pacedToCanonIndex.push(cIdx);
    }
  }

  return {
    hasRealPunctuation,
    canonicalGroups,
    pacedGroups,
    pacedToCanonIndex,
  };
}

function segmentPunctuatedCanonical(words: SegWord[]): SegWord[][] {
  const preliminary: SegWord[][] = [];
  let current: SegWord[] = [];

  const flush = () => {
    if (current.length > 0) {
      preliminary.push(current);
      current = [];
    }
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const next = words[i + 1];
    current.push(word);

    if (!next) {
      flush();
      break;
    }

    if (isTrueSentenceTerminal(word.text, next.text)) {
      flush();
      continue;
    }

    // Break across long dramatic silences or musical interludes (>= 2.5s gap)
    if (next.start - word.end >= 2.5 && !NON_TERMINAL_WORDS.has(word.clean)) {
      flush();
      continue;
    }
  }

  flush();

  // Merge 1-word isolated interjections (e.g. "Right." or "Yeah.") if adjacent to short sentence
  const merged: SegWord[][] = [];
  for (let i = 0; i < preliminary.length; i++) {
    const seg = preliminary[i];
    const prev = merged.length > 0 ? merged[merged.length - 1] : null;
    const gapFromPrev = prev ? seg[0].start - prev[prev.length - 1].end : Infinity;
    if (seg.length === 1 && prev && prev.length <= 10 && gapFromPrev < 1.0) {
      prev.push(...seg);
    } else {
      merged.push(seg);
    }
  }

  return merged;
}

function segmentUnpunctuatedCanonical(words: SegWord[]): SegWord[][] {
  const cfg = { min: 8, soft: 16, max: 26, dur: 10.5, minTail: 5 };

  const segments: SegWord[][] = [];
  let current: SegWord[] = [];

  const flush = () => {
    if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const next = words[i + 1];
    current.push(word);

    if (!next) {
      flush();
      break;
    }

    const count = current.length;
    const remaining = words.length - (i + 1);
    const curDur = word.end - current[0].start;
    if (count < cfg.min - 1 || remaining < cfg.minTail) continue;

    if (NON_TERMINAL_WORDS.has(word.clean)) continue;
    if (next.clean === word.clean) continue;

    const pause = estimatePauseAfter(words, i);
    if (RIGHT_ATTACHING_MODIFIERS.has(word.clean) && pause < 0.25) continue;
    if (BARE_SUBJECT_PRONOUNS.has(word.clean) && pause < 0.25) continue;
    if (next.clean === 'to' && SEMI_MODAL_BEFORE_TO.has(word.clean) && pause < 0.25) continue;
    if (
      pause < 0.28 &&
      OBJECT_TAKING_VERBS.has(word.clean) &&
      OBJECT_OR_COMPLEMENT_NEXT.has(next.clean)
    ) {
      continue;
    }

    const nextIsStrictStarter =
      STRICT_SUBJECT_CLAUSE_STARTERS.has(next.clean) ||
      INDEPENDENT_CLAUSE_STARTERS.has(next.clean);
    const nextIsContextualStarter =
      nextIsStrictStarter ||
      (AMBIGUOUS_OBJECT_PRONOUNS.has(next.clean) && pause >= 0.22) ||
      CLAUSE_STARTERS.has(next.clean);
    const nextContinuesPhrase = PHRASE_CONTINUATION_NEXT.has(next.clean);

    const isShortBinomial =
      pause < 0.25 &&
      (next.clean === 'or' || next.clean === 'and') &&
      i + 2 < words.length &&
      !BINOMIAL_CLAUSE_BREAKERS.has(words[i + 2].clean) &&
      ((i >= 1 && NON_TERMINAL_WORDS.has(words[i - 1].clean)) ||
        KNOWN_BINOMIAL_PAIRS.has(`${word.clean} ${next.clean} ${words[i + 2].clean}`));
    if (isShortBinomial && count < cfg.max) continue;

    if (nextContinuesPhrase && pause < 0.28 && count < cfg.soft + 2 && curDur < cfg.dur * 0.85) {
      continue;
    }

    let shouldCut = false;

    if (pause >= 0.48 && count >= Math.max(5, cfg.min - 2)) {
      shouldCut = true;
    } else if (pause >= 0.28 && nextIsStrictStarter && count >= cfg.min) {
      shouldCut = true;
    } else if (pause >= 0.16 && nextIsStrictStarter && count >= cfg.soft - 2) {
      shouldCut = true;
    } else if (count >= cfg.soft && (nextIsContextualStarter || pause >= 0.10)) {
      shouldCut = true;
    } else if (count >= cfg.max - 1 && !nextContinuesPhrase) {
      shouldCut = true;
    } else if (count >= cfg.max || curDur >= cfg.dur) {
      shouldCut = true;
    }

    if (shouldCut) {
      flush();
    }
  }

  flush();
  return segments;
}

/**
 * Groups complete `SentenceItem[]` units into cohesive, logical editorial
 * paragraphs (`ChunkItem[]`).
 *
 * Guarantee:
 * - Paragraphs are ALWAYS exact unions of contiguous complete sentences —
 *   a paragraph NEVER cuts a sentence in half.
 * - Paragraphs break at natural topic transitions, prosodic silence gaps,
 *   and readable editorial lengths (typically 3–5 sentences / 55–110 words).
 */
export function segmentParagraphs(sentences: SentenceItem[]): ChunkItem[] {
  if (!Array.isArray(sentences) || sentences.length === 0) return [];

  const groups: SentenceItem[][] = [];
  let current: SentenceItem[] = [];
  let currentWords = 0;

  const flush = () => {
    if (current.length > 0) {
      groups.push(current);
      current = [];
      currentWords = 0;
    }
  };

  for (let i = 0; i < sentences.length; i++) {
    const sent = sentences[i];
    const next = sentences[i + 1];
    const wordCount = (sent.text || '').split(/\s+/).filter(Boolean).length;

    current.push(sent);
    currentWords += wordCount;

    if (!next) {
      flush();
      break;
    }

    const sentCount = current.length;
    const interSentenceGap = Math.max(0, next.startSec - sent.endSec);
    const nextText = (next.text || '').trim();
    const isDiscourseShift = PARAGRAPH_TRANSITION_PATTERNS.some((rx) => rx.test(nextText));

    let closeParagraph = false;

    if (sentCount >= 2 && currentWords >= 42 && (interSentenceGap >= 0.55 || isDiscourseShift)) {
      closeParagraph = true;
    } else if (sentCount >= 3 && currentWords >= 55 && (interSentenceGap >= 0.25 || isDiscourseShift)) {
      closeParagraph = true;
    } else if (sentCount >= 5 || currentWords >= 95) {
      closeParagraph = true;
    }

    if (closeParagraph) {
      flush();
    }
  }

  flush();

  // Prevent an orphan 1-sentence stub at the very end of an article
  if (groups.length > 1) {
    const last = groups[groups.length - 1];
    const prev = groups[groups.length - 2];
    const lastWords = last.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
    if (last.length === 1 && lastWords < 22 && prev.length <= 5) {
      prev.push(...last);
      groups.pop();
    }
  }

  return groups.map((group, idx) => {
    const startSec = roundMs(group[0].startSec);
    const endSec = roundMs(group[group.length - 1].endSec);
    const text = group.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();
    const highlightedHtml = group
      .map((s) => s.highlightedHtml || escapeTranscriptHtml(s.text))
      .join(' ');

    return {
      index: idx + 1,
      timeRange: `[${formatTimestampMs(startSec)} - ${formatTimestampMs(endSec)}]`,
      time_range: `[${formatTimestampMs(startSec)} - ${formatTimestampMs(endSec)}]`,
      start: formatTimestampMs(startSec),
      end: formatTimestampMs(endSec),
      startSec,
      endSec,
      sentenceIndices: group.map((s) => s.index),
      text,
      highlightedHtml,
    };
  });
}
