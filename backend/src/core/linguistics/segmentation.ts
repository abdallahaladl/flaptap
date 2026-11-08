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

/**
 * Builds complete, natural spoken sentences from word-level timings.
 *
 * Guarantee:
 * - On punctuated transcripts: cuts strictly at real sentence endings (`.`, `?`, `!`).
 *   NEVER cuts mid-sentence on caption cue boundaries, commas, or 11-word limits.
 * - On unpunctuated ASR auto-captions: combines acoustic phrase-final pause
 *   detection with syntactic completeness checks so sentences end cleanly at
 *   clause boundaries without dangling function words.
 * - Every word is preserved verbatim in exact contiguous order with 3-decimal
 *   millisecond timestamps.
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
    const text = seg.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;

    let startSec = seg[0].start;
    if (startSec < previousEnd) startSec = previousEnd;

    const lastWordEnd = seg[seg.length - 1].end;

    // Look ahead to find the earliest onset of the subsequent sentence segment
    let nextStartSec: number | null = null;
    for (let j = i + 1; j < rawSegments.length; j++) {
      if (rawSegments[j].length > 0) {
        nextStartSec = rawSegments[j][0].start;
        break;
      }
    }

    let endSec = lastWordEnd;
    if (nextStartSec !== null && nextStartSec > lastWordEnd) {
      const gap = nextStartSec - lastWordEnd;
      // Acoustic decay absorption with strict lead-out silence margin:
      // Leave at least 100ms - 180ms of dead silence before nextStartSec so that
      // asynchronous player pause latency (60-100ms) NEVER leaks the initial letter
      // or sound of the subsequent sentence.
      if (gap >= 0.36) {
        // Generous inter-sentence pause: allow natural spoken decay (up to 420ms)
        // while guaranteeing >= 180ms silence cushion before the next sentence.
        const safeTail = Math.min(0.42, gap - 0.18);
        endSec = lastWordEnd + safeTail;
      } else if (gap >= 0.22) {
        // Medium pause: guarantee >= 160ms silence cushion
        const safeTail = Math.max(0, gap - 0.16);
        endSec = lastWordEnd + safeTail;
      } else if (gap >= 0.12) {
        // Tight pause: guarantee >= 100ms silence cushion
        const safeTail = Math.max(0, gap - 0.10);
        endSec = lastWordEnd + safeTail;
      } else {
        // Direct spoken continuation (gap < 120ms): clamp strictly to last word boundary
        endSec = lastWordEnd;
      }
      // Absolute mathematical guarantee: never closer than 100ms to nextStartSec
      endSec = Math.min(endSec, nextStartSec - 0.10);
    } else if (nextStartSec === null) {
      // Final sentence in the transcript: allow 0.30s natural decay
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

    if (isTrueSentenceTerminal(word.text, next.text)) {
      flush();
      continue;
    }

    // Break across long dramatic silences or musical interludes (>= 2.5s gap)
    if (next.start - word.end >= 2.5 && !NON_TERMINAL_WORDS.has(word.clean)) {
      flush();
      continue;
    }

    // Safety valve ONLY for rare unpunctuated run-on passages (> 42 words without a period)
    if (current.length >= 42) {
      const endsMajorClause = /[;:\u2014\u2013]$/.test(word.text) ||
        (/,$/.test(word.text) && /^(and|but|so|because|however|while|whereas)$/i.test(next.clean));
      if (endsMajorClause && !NON_TERMINAL_WORDS.has(word.clean)) {
        flush();
      } else if (current.length >= 58 && !NON_TERMINAL_WORDS.has(word.clean)) {
        flush();
      }
    }
  }

  flush();

  // Only merge a 1-word isolated interjection (e.g. "Right." or "Yeah.") if it
  // naturally attaches to a short adjacent sentence; keep genuine 2+ word sentences
  // ("I know it." / "It's not worth it.") intact as complete sentences.
  const refined: SegWord[][] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prev = refined.length > 0 ? refined[refined.length - 1] : null;
    const gapFromPrev = prev ? seg[0].start - prev[prev.length - 1].end : Infinity;
    if (seg.length === 1 && prev && prev.length <= 10 && gapFromPrev < 1.0) {
      prev.push(...seg);
    } else {
      refined.push(seg);
    }
  }

  return refined;
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
    if (count < 7 || remaining < 4) continue;

    // Never end a sentence on a dangling function/modifier word
    if (NON_TERMINAL_WORDS.has(word.clean)) continue;
    // Never split a repeated word ("really really")
    if (next.clean === word.clean) continue;

    const pause = estimatePauseAfter(words, i);
    const nextStartsClause = CLAUSE_STARTERS.has(next.clean);
    const nextContinuesPhrase = PHRASE_CONTINUATION_NEXT.has(next.clean);

    // Avoid detaching a trailing prepositional modifier ("rules | for the next 2 minutes")
    // unless there is a very clear silence gap (>= 0.55s).
    if (nextContinuesPhrase && pause < 0.55 && count < 24) {
      continue;
    }

    let shouldCut = false;

    if (pause >= 0.42 && nextStartsClause && count >= 7) {
      shouldCut = true;
    } else if (pause >= 0.52 && count >= 8) {
      shouldCut = true;
    } else if (pause >= 0.24 && nextStartsClause && count >= 11) {
      shouldCut = true;
    } else if (count >= 16 && nextStartsClause && pause >= 0.12) {
      shouldCut = true;
    } else if (count >= 22 && nextStartsClause) {
      shouldCut = true;
    } else if (count >= 28 && !nextContinuesPhrase) {
      shouldCut = true;
    } else if (count >= 34) {
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
