import { escapeTranscriptHtml } from './highlights';
import { TimedWord, TranscriptResult } from '../../modules/tracks/shadowing/transcript.service';
import { ChunkItem, SentenceItem } from '../database/history.repository';

interface SegWord {
  text: string;
  clean: string;
  start: number;
  end: number;
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

/** Subject pronouns and deictics that begin a clause when following a comma or pause. */
const PRONOUN_CLAUSE_STARTERS = new Set([
  'i', "i'm", "i've", "i'll", 'you', "you're", 'we', "we're", 'they', "they're",
  'he', 'she', 'it', "it's", 'there', "there's", 'here', "here's",
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

/**
 * Splits a long grammatical sentence into short, bite-sized, rhythmically cohesive
 * units optimized for active shadowing & verbal repetition (4–7 words ideal, <= 8 words max,
 * ~1.2–3.2s per line) using globally optimal dynamic programming over linguistic boundaries.
 *
 * Guarantees:
 * - Short sentences (<= 7 words and <= 3.2s) are NEVER split.
 * - Long sentences are partitioned so every shadowing line is 3–8 words (no 1–2 word stubs
 *   and no 15–25 word walls of text).
 * - Globally prefers natural junctures: commas/semicolons/dashes > acoustic breath pauses >
 *   conjunctions/clause starters > pronouns & prepositional/predicate boundaries, while
 *   strongly avoiding cuts after NON_TERMINAL_WORDS, semi-modal "going to", or repeated words.
 * - Preserves exact word order and millisecond timestamps without mutating any word timing.
 */
function splitLongSentence(words: SegWord[]): SegWord[][] {
  const n = words.length;
  if (n === 0) return [];
  const totalDur = words[n - 1].end - words[0].start;
  if (n < 6 || (n <= 7 && totalDur <= 3.2)) {
    return [words];
  }

  const MIN_WORDS = 3;
  const MAX_WORDS = 8;
  const SPLIT_BASE_COST = 2.0;

  // Precompute boundary quality cost for cutting right after words[k - 1] (before words[k])
  const boundaryCost = new Array<number>(n + 1).fill(0);
  for (let k = 1; k < n; k++) {
    const prev = words[k - 1];
    const next = words[k];
    let cost = 0;

    const pause = Math.max(0, next.start - prev.end);
    const hasPunctuation = /[,;:\u2014\u2013]$/.test(prev.text);
    const isIndepClause = INDEPENDENT_CLAUSE_STARTERS.has(next.clean);
    const isPronounClause = PRONOUN_CLAUSE_STARTERS.has(next.clean);
    const isSemiModalTo = next.clean === 'to' && SEMI_MODAL_BEFORE_TO.has(prev.clean);
    const isSoftStarter = !isSemiModalTo && SOFT_BOUNDARY_STARTERS.has(next.clean);

    if (prev.clean === next.clean) {
      cost += 28; // Never cut between identical repeated words ("really really")
    }
    if (!hasPunctuation && NON_TERMINAL_WORDS.has(prev.clean)) {
      cost += 20; // Strongly avoid stranding articles/prepositions/possessives at line end
    }
    if (isSemiModalTo && !hasPunctuation) {
      cost += 14; // Keep "going to", "want to", "have to", "need to" glued together
    }

    if (hasPunctuation) {
      cost -= 11; // Strongest preference: natural comma/semicolon/dash pause
    } else if (pause >= 0.22) {
      cost -= 7; // Clear acoustic breath pause
    }

    if (isIndepClause) {
      cost -= 5.5;
    } else if (isPronounClause) {
      cost -= 3.2;
    } else if (isSoftStarter) {
      cost -= 2.4;
    } else if (!hasPunctuation && pause < 0.22) {
      cost += 2.2; // Discourage arbitrary mid-phrase cuts when a real boundary exists nearby
    }

    if (PHRASE_CONTINUATION_NEXT.has(next.clean) && !hasPunctuation && pause < 0.22) {
      cost += 4.5;
    }

    boundaryCost[k] = cost;
  }

  // DP: dp[i] = minimum total cost to segment words[0..i-1]
  const INF = 1e9;
  const dp = new Array<number>(n + 1).fill(INF);
  const back = new Array<number>(n + 1).fill(-1);
  dp[0] = 0;

  for (let end = MIN_WORDS; end <= n; end++) {
    const minStart = Math.max(0, end - MAX_WORDS);
    const maxStart = end - MIN_WORDS;
    for (let start = minStart; start <= maxStart; start++) {
      if (dp[start] >= INF) continue;
      const len = end - start;
      const dur = Math.max(0, words[end - 1].end - words[start].start);

      let chunkCost = 0;
      if (len === 3) chunkCost += 2.4;
      else if (len === 8) chunkCost += 1.5;
      // 4–7 words is the zero-penalty sweet spot for effortless active shadowing

      if (dur > 3.2) chunkCost += (dur - 3.2) * 5;
      else if (dur < 0.85) chunkCost += (0.85 - dur) * 4;

      const splitPenalty = start === 0 ? 0 : SPLIT_BASE_COST + boundaryCost[start];
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
 * Reusable short-shadowing splitter for millisecond-timed word arrays (e.g. AI-reviewed
 * sentences in `word-alignment.util.ts`). Preserves exact word objects & timestamps.
 */
export function splitTimedWordsForShadowing<
  T extends { word: string; clean?: string; startMs: number; endMs: number },
>(words: T[]): T[][] {
  if (!Array.isArray(words) || words.length === 0) return [];
  const segWords: SegWord[] = words.map((w) => ({
    text: w.word,
    clean: w.clean || cleanToken(w.word),
    start: (Number(w.startMs) || 0) / 1000,
    end: (Number(w.endMs) || 0) / 1000,
  }));

  const splitGroups = splitLongSentence(segWords);
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
 *   run-ons into rhythmically bite-sized shadowing units (1.5–5.0s) at natural clause,
 *   list, or breath boundaries.
 * - On unpunctuated ASR auto-captions: combines acoustic phrase-final pause
 *   detection with syntactic completeness checks so sentences end cleanly at
 *   clause boundaries without dangling function words.
 * - Every word is preserved verbatim in exact contiguous order with 3-decimal
 *   millisecond timestamps and proper sentence punctuation.
 */
export function segmentSentences(data: TranscriptResult): SentenceItem[] {
  const words = normalizeWords(data);
  if (words.length === 0) return [];

  let terminalCount = 0;
  for (let i = 0; i < words.length; i++) {
    if (isTrueSentenceTerminal(words[i].text, words[i + 1]?.text)) {
      terminalCount++;
    }
  }

  // A transcript is genuinely punctuated if it averages at least 1 terminal mark per 55 words
  const hasRealPunctuation = terminalCount >= Math.max(2, Math.floor(words.length / 55));

  const rawSegments: SegWord[][] = hasRealPunctuation
    ? segmentPunctuatedStream(words)
    : segmentUnpunctuatedStream(words);

  const sentences: SentenceItem[] = [];
  let previousEnd = 0;

  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i];
    if (seg.length === 0) continue;
    const rawText = seg.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
    if (!rawText) continue;
    const text = formatSentenceText(rawText);

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

function segmentPunctuatedStream(words: SegWord[]): SegWord[][] {
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

  // Split any long sentences into bite-sized, rhythmically cohesive shadowing units
  const finalSegments: SegWord[][] = [];
  for (const sentenceWords of merged) {
    const subSegments = splitLongSentence(sentenceWords);
    finalSegments.push(...subSegments);
  }

  return finalSegments;
}

function segmentUnpunctuatedStream(words: SegWord[]): SegWord[][] {
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
    if (count < 3 || remaining < 3) continue;

    // Never end a sentence on a dangling function/modifier word
    if (NON_TERMINAL_WORDS.has(word.clean)) continue;
    // Never split a repeated word ("really really")
    if (next.clean === word.clean) continue;

    const pause = estimatePauseAfter(words, i);
    const nextStartsClause = CLAUSE_STARTERS.has(next.clean) || INDEPENDENT_CLAUSE_STARTERS.has(next.clean);
    const nextContinuesPhrase = PHRASE_CONTINUATION_NEXT.has(next.clean);

    if (nextContinuesPhrase && pause < 0.26 && count < 8 && curDur < 3.2) {
      continue;
    }

    let shouldCut = false;

    if (pause >= 0.28 && nextStartsClause && count >= 4) {
      shouldCut = true;
    } else if (pause >= 0.35 && count >= 4) {
      shouldCut = true;
    } else if (pause >= 0.15 && nextStartsClause && count >= 6) {
      shouldCut = true;
    } else if (count >= 7 && (nextStartsClause || pause >= 0.08)) {
      shouldCut = true;
    } else if (count >= 9 && !nextContinuesPhrase) {
      shouldCut = true;
    } else if (count >= 11 || curDur >= 4.0) {
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
