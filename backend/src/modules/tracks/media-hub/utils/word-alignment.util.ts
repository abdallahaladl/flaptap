import {
  isTrueSentenceTerminal,
  normalizePacingMode,
  roundMs,
  segmentWordStreamWithCanonical,
  SegWord,
  MediaHubPacingMode,
  splitTimedWordsForShadowing,
} from '../../../../core/linguistics/segmentation';
import { TimedWord, TranscriptCue, TranscriptResult } from '../transcript.service';
import {
  RawCueMs,
  RawTranscriptSnapshot,
  TimedWordMs,
  TranscriptIdea,
  TranscriptParagraph,
  TranscriptQualityReport,
  TranscriptSentence,
  TranscriptSpeakerInfo,
  TranscriptSpeakerTurn,
} from '../media-hub.types';

/**
 * Clean alphanumeric + apostrophe core for alignment & search.
 */
export function normalizeAlignToken(token: string): string {
  return String(token || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');
}

/**
 * Tokenizes a sentence into display words preserving punctuation and contractions.
 */
export function tokenizeDisplayWords(text: string): string[] {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Converts provider `TimedWord[]` / `TranscriptCue[]` into strict monotonic
 * integer-millisecond `TimedWordMs[]` with zero missing gaps or negative spans.
 */
export function normalizeRawTimedWords(
  rawWords: TimedWord[] | undefined,
  rawCues: TranscriptCue[] | undefined,
  fallbackText = '',
  durationSeconds = 0,
): { words: TimedWordMs[]; cues: RawCueMs[] } {
  const cues: RawCueMs[] = (rawCues || [])
    .map((c, idx) => {
      const startMs = Math.max(0, Math.round((Number(c.start_sec) || 0) * 1000));
      const endMs = Math.max(startMs + 80, Math.round((Number(c.end_sec) || 0) * 1000));
      return {
        index: idx + 1,
        startMs,
        endMs,
        startSec: roundMs(startMs / 1000),
        endSec: roundMs(endMs / 1000),
        text: String(c.text || '').replace(/\s+/g, ' ').trim(),
      };
    })
    .filter((c) => c.text.length > 0);

  let source: TimedWord[] = Array.isArray(rawWords) && rawWords.length > 0 ? rawWords : [];

  // Fallback interpolation when only cues exist
  if (source.length === 0 && cues.length > 0) {
    source = [];
    cues.forEach((cue, cueIndex) => {
      const tokens = tokenizeDisplayWords(cue.text);
      if (!tokens.length) return;
      const spanMs = Math.max(120, cue.endMs - cue.startMs);
      const weights = tokens.map((t) => Math.max(2, normalizeAlignToken(t).length || 2));
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let cursor = cue.startMs;
      tokens.forEach((tok, idx) => {
        const share = Math.max(40, Math.round((weights[idx] / totalWeight) * spanMs));
        const end = idx === tokens.length - 1 ? Math.max(cursor + 40, cue.endMs) : cursor + share;
        source.push({
          word: tok,
          clean: normalizeAlignToken(tok),
          start_sec: roundMs(cursor / 1000),
          end_sec: roundMs(end / 1000),
          cue_index: cueIndex,
          cue_end: idx === tokens.length - 1,
        });
        cursor = end;
      });
    });
  }

  // Last-resort interpolation if only raw text + duration exist
  if (source.length === 0 && fallbackText.trim()) {
    const tokens = tokenizeDisplayWords(fallbackText);
    const totalMs = Math.max(tokens.length * 260, Math.round((Number(durationSeconds) || 0) * 1000));
    const step = totalMs / Math.max(1, tokens.length);
    source = tokens.map((tok, idx) => ({
      word: tok,
      clean: normalizeAlignToken(tok),
      start_sec: roundMs((idx * step) / 1000),
      end_sec: roundMs(((idx + 1) * step) / 1000),
    }));
  }

  const out: TimedWordMs[] = [];
  let prevStartMs = 0;

  for (const w of source) {
    const display = String(w?.word || '').replace(/\u00a0/g, ' ').trim();
    if (!display) continue;
    let startMs = Math.max(0, Math.round((Number(w.start_sec) || 0) * 1000));
    if (startMs < prevStartMs) startMs = prevStartMs;
    let endMs = Math.round((Number(w.end_sec) || 0) * 1000);
    if (endMs <= startMs) endMs = startMs + 90;
    prevStartMs = startMs;
    out.push({
      i: out.length,
      word: display,
      clean: w.clean ? normalizeAlignToken(w.clean) : normalizeAlignToken(display),
      startMs,
      endMs,
    });
  }

  const clamped = enforceNonOverlappingWordTimings(out);
  return { words: clamped, cues };
}

const MIN_WORD_SLICE_MS = 25;

/**
 * Guarantees strictly monotonic, non-overlapping millisecond intervals across
 * all words (`0 <= w[i].startMs < w[i].endMs <= w[i+1].startMs`) while leaving
 * already non-overlapping raw timestamps untouched down to the millisecond.
 */
export function enforceNonOverlappingWordTimings(words: TimedWordMs[]): TimedWordMs[] {
  if (!Array.isArray(words) || words.length === 0) return [];
  const n = words.length;
  const arr: TimedWordMs[] = new Array(n);

  let prevStart = 0;
  for (let i = 0; i < n; i++) {
    const raw = words[i];
    const startMs = Math.max(prevStart, Math.max(0, Math.round(Number(raw.startMs) || 0)));
    const endMs = Math.max(startMs + 1, Math.round(Number(raw.endMs) || startMs + 60));
    prevStart = startMs;
    arr[i] = { ...raw, i, startMs, endMs };
  }

  // Pass 1: Partition crowded or equal-start clusters cleanly inside their available window.
  let g = 0;
  while (g < n) {
    let h = g;
    let maxEndInCluster = arr[g].endMs;
    while (h + 1 < n) {
      const countIfAdded = h - g + 2;
      const nxtStart = arr[h + 1].startMs;
      const sameOnset = nxtStart <= arr[h].startMs;
      const tooTightWithOverlap =
        nxtStart - arr[g].startMs < countIfAdded * MIN_WORD_SLICE_MS &&
        (sameOnset || arr[h].endMs > nxtStart);
      if (!sameOnset && !tooTightWithOverlap) break;
      h += 1;
      if (arr[h].endMs > maxEndInCluster) maxEndInCluster = arr[h].endMs;
    }

    if (h > g) {
      const count = h - g + 1;
      const spanStart = arr[g].startMs;
      const nextWordStart = h + 1 < n ? arr[h + 1].startMs : Math.max(spanStart + count * 80, maxEndInCluster);
      const targetCeiling = Math.max(maxEndInCluster, nextWordStart);
      const spanEnd = Math.max(
        spanStart + count * MIN_WORD_SLICE_MS,
        h + 1 < n ? Math.min(nextWordStart, targetCeiling) : targetCeiling,
      );
      const totalSpan = Math.max(count * MIN_WORD_SLICE_MS, spanEnd - spanStart);
      const slack = Math.max(0, totalSpan - count * MIN_WORD_SLICE_MS);
      const weights = [];
      let weightSum = 0;
      for (let k = g; k <= h; k++) {
        const w = Math.min(12, Math.max(1, (arr[k].clean || arr[k].word || '').length)) + 1;
        weights.push(w);
        weightSum += w;
      }
      let cursor = spanStart;
      for (let k = g; k <= h; k++) {
        const idxInCluster = k - g;
        const extra = weightSum > 0 ? Math.round((slack * weights[idxInCluster]) / weightSum) : 0;
        const dur = MIN_WORD_SLICE_MS + extra;
        const nextBoundary = k === h ? spanStart + totalSpan : Math.min(spanStart + totalSpan - (h - k) * MIN_WORD_SLICE_MS, cursor + dur);
        arr[k].startMs = cursor;
        arr[k].endMs = Math.max(cursor + MIN_WORD_SLICE_MS, nextBoundary);
        cursor = arr[k].endMs;
      }
      g = h + 1;
    } else {
      g += 1;
    }
  }

  // Pass 2: Enforce zero overlap for adjacent distinct-onset words (`w[i].endMs <= w[i+1].startMs`).
  for (let i = 0; i < n - 1; i++) {
    const curr = arr[i];
    const nxt = arr[i + 1];
    if (nxt.startMs < curr.startMs + MIN_WORD_SLICE_MS) {
      curr.endMs = curr.startMs + MIN_WORD_SLICE_MS;
      nxt.startMs = curr.endMs;
      nxt.endMs = Math.max(nxt.startMs + MIN_WORD_SLICE_MS, nxt.endMs);
    } else if (curr.endMs > nxt.startMs) {
      curr.endMs = nxt.startMs;
    }
    if (curr.endMs <= curr.startMs) {
      curr.endMs = curr.startMs + MIN_WORD_SLICE_MS;
      if (nxt.startMs < curr.endMs) {
        nxt.startMs = curr.endMs;
      }
    }
  }

  const last = arr[n - 1];
  if (last.endMs <= last.startMs) {
    last.endMs = last.startMs + MIN_WORD_SLICE_MS;
  }

  return arr;
}

function buildRawSentenceObjects(
  groups: SegWord[][],
  rawWords: TimedWordMs[],
  idPrefix: string,
  defaultSpeaker: string,
): TranscriptSentence[] {
  const sentences: TranscriptSentence[] = [];
  let fallbackWordCursor = 0;

  for (let idx = 0; idx < groups.length; idx++) {
    const seg = groups[idx];
    if (seg.length === 0) continue;

    const slice: TimedWordMs[] = [];
    for (let k = 0; k < seg.length; k++) {
      const sw = seg[k];
      const rw =
        typeof sw.srcIndex === 'number' && rawWords[sw.srcIndex]
          ? rawWords[sw.srcIndex]
          : rawWords[fallbackWordCursor];
      fallbackWordCursor++;
      if (rw) {
        slice.push({
          ...rw,
          word: sw.text,
          clean: normalizeAlignToken(sw.text) || rw.clean,
        });
      } else {
        const sMs = Math.max(0, Math.round(sw.start * 1000));
        const eMs = Math.max(sMs + 40, Math.round(sw.end * 1000));
        slice.push({
          i: fallbackWordCursor - 1,
          word: sw.text,
          clean: normalizeAlignToken(sw.text) || sw.clean,
          startMs: sMs,
          endMs: eMs,
          rawWord: sw.text,
        });
      }
    }

    const startMs = slice.length > 0 ? slice[0].startMs : Math.round(seg[0].start * 1000);
    const endMs =
      slice.length > 0
        ? slice[slice.length - 1].endMs
        : Math.round(seg[seg.length - 1].end * 1000);
    const text = slice.map((w) => w.word).join(' ').replace(/\s+/g, ' ').trim();

    sentences.push({
      id: `${idPrefix}-${sentences.length + 1}`,
      index: sentences.length + 1,
      text,
      rawText: text,
      speakerId: 'spk_1',
      speaker: defaultSpeaker,
      repaired: false,
      repairNote: '',
      isOverlap: false,
      paragraphIndex: 1,
      ideaIndex: 1,
      startMs,
      endMs: Math.max(startMs + 80, endMs),
      startSec: roundMs(startMs / 1000),
      endSec: roundMs(Math.max(startMs + 80, endMs) / 1000),
      words: slice,
    });
  }

  return sentences;
}

/**
 * Unified raw word segmentation builder producing BOTH complete grammatical
 * `canonicalSentences` AND mode-paced `sentences` + contiguous `paragraphs`
 * directly from normalized `rawWords` without cursor drift or fake periods.
 */
export function buildRawSentencesAndParagraphsFromWords(params: {
  rawWords: TimedWordMs[];
  creator?: string;
  pacingMode?: MediaHubPacingMode;
}): {
  canonicalSentences: TranscriptSentence[];
  sentences: TranscriptSentence[];
  paragraphs: TranscriptParagraph[];
} {
  const mode = normalizePacingMode(params.pacingMode);
  const rawWords = Array.isArray(params.rawWords) ? params.rawWords : [];
  if (rawWords.length === 0) {
    return { canonicalSentences: [], sentences: [], paragraphs: [] };
  }

  const defaultSpeaker = params.creator?.trim() || 'Speaker 1';
  const segWords: SegWord[] = rawWords.map((w, idx) => ({
    start: w.startMs / 1000,
    end: w.endMs / 1000,
    text: w.word,
    clean: w.clean || normalizeAlignToken(w.word),
    srcIndex: idx,
  }));

  const { canonicalGroups, pacedGroups } = segmentWordStreamWithCanonical(segWords, mode);
  const canonicalSentences = buildRawSentenceObjects(canonicalGroups, rawWords, 'raw-canon-s', defaultSpeaker);
  const sentences = buildRawSentenceObjects(pacedGroups, rawWords, 'raw-s', defaultSpeaker);

  applyPlaybackBoundaryLaw(canonicalSentences);
  applyPlaybackBoundaryLaw(sentences);

  const paragraphs = buildParagraphsFromSentences(sentences, mode);
  return { canonicalSentences, sentences, paragraphs };
}

function findMatchedRawWordIndex(
  rawWords: TimedWordMs[],
  searchStart: number,
  targetWord: TimedWordMs | undefined,
): number {
  if (!targetWord || !rawWords.length) return -1;
  const targetClean = normalizeAlignToken(targetWord.word);
  const lo = Math.max(0, searchStart - 3);
  const hi = Math.min(rawWords.length - 1, searchStart + 140);

  let bestExactIdx = -1;
  let bestExactDist = Infinity;
  let bestTimeIdx = -1;
  let bestTimeDist = Infinity;

  for (let i = lo; i <= hi; i++) {
    const rw = rawWords[i];
    const dist = Math.abs(rw.startMs - targetWord.startMs);
    if (dist <= 1500 && targetClean && normalizeAlignToken(rw.word) === targetClean) {
      if (dist < bestExactDist) {
        bestExactDist = dist;
        bestExactIdx = i;
      }
    }
    if (dist <= 180 && dist < bestTimeDist) {
      bestTimeDist = dist;
      bestTimeIdx = i;
    }
  }

  return bestExactIdx >= 0 ? bestExactIdx : bestTimeIdx;
}

function stripSyntheticTrailingPeriod(text: string, replacementPunct: string): string {
  const trimmed = String(text || '').trim();
  const replaced = trimmed.replace(/\.([)"'\u201d\u2019]*)$/, `${replacementPunct}$1`);
  return replaced;
}

function lowercaseSentenceInitial(wordText: string): string {
  return String(wordText || '').replace(/^(\s*["'(\[]*)([A-Z])/, (_m, p, ch) => p + ch.toLowerCase());
}

/**
 * Coalesces adjacent fragments back into complete canonical grammatical sentences,
 * including recovering legacy cached lessons whose mid-sentence commas/clauses were
 * corrupted by synthetic `.` characters when grounded against `rawWords`.
 */
export function coalesceToCanonicalSentences(
  sentences: TranscriptSentence[],
  rawWords?: TimedWordMs[],
): TranscriptSentence[] {
  const out: TranscriptSentence[] = [];
  let rawTermCount = 0;
  const hasRaw = Array.isArray(rawWords) && rawWords.length > 0;
  if (hasRaw) {
    for (let i = 0; i < rawWords!.length; i++) {
      if (isTrueSentenceTerminal(rawWords![i].word, rawWords![i + 1]?.word)) rawTermCount++;
    }
  }
  const rawHasPunct = Boolean(
    hasRaw &&
      (rawTermCount >= Math.max(2, Math.floor(rawWords!.length / 55)) ||
        (rawWords!.length <= 80 && rawTermCount >= 1)),
  );
  let rawSearchCursor = 0;

  for (const s of sentences) {
    const words = Array.isArray(s.words) ? s.words.map((w) => ({ ...w })) : [];
    const prev = out.length > 0 ? out[out.length - 1] : null;
    const prevLastWordObj =
      prev && prev.words.length > 0 ? prev.words[prev.words.length - 1] : undefined;
    const currFirstWordObj = words.length > 0 ? words[0] : undefined;

    const prevLastWord = prevLastWordObj
      ? prevLastWordObj.word
      : prev?.text.trim().split(/\s+/).pop() || '';
    const currFirstWord = currFirstWordObj
      ? currFirstWordObj.word
      : s.text.trim().split(/\s+/)[0] || '';

    const sameSpeakerAndIdea =
      Boolean(prev) &&
      prev!.speakerId === s.speakerId &&
      prev!.ideaIndex === s.ideaIndex &&
      !prev!.isOverlap &&
      !s.isOverlap &&
      !prev!.isInterrupted &&
      !s.isInterrupted;

    let canMerge = false;
    let recoveredPunct: string | null = null;
    let shouldLowercaseCurr = false;

    if (sameSpeakerAndIdea && prev) {
      if (!isTrueSentenceTerminal(prevLastWord, currFirstWord)) {
        if (prev.paragraphIndex === s.paragraphIndex || rawHasPunct) {
          canMerge = true;
        }
      } else if (rawHasPunct && rawWords) {
        const strippedPrev = prevLastWord.replace(/[)"'\u201d\u2019]+$/g, '');
        if (strippedPrev.endsWith('.') && !/[?!]$/.test(strippedPrev)) {
          const pRawIdx = findMatchedRawWordIndex(rawWords, rawSearchCursor, prevLastWordObj);
          const cRawIdx = findMatchedRawWordIndex(
            rawWords,
            pRawIdx >= 0 ? pRawIdx + 1 : rawSearchCursor,
            currFirstWordObj,
          );
          if (pRawIdx >= 0 && cRawIdx > pRawIdx && cRawIdx - pRawIdx <= 10) {
            let sawRawTerminal = false;
            for (let r = pRawIdx; r < cRawIdx; r++) {
              if (isTrueSentenceTerminal(rawWords[r].word, rawWords[r + 1]?.word)) {
                sawRawTerminal = true;
                break;
              }
            }
            const rawPrevWord = rawWords[pRawIdx].word;
            const rawCurrWord = rawWords[cRawIdx].word;
            const rawPrevEndedNonTermPunct = /[,;:]$/.test(
              rawPrevWord.replace(/[)"'\u201d\u2019]+$/g, ''),
            );
            const rawCurrStartsLower = /^[a-z]/.test(
              rawCurrWord.replace(/^["'(\[]+/, ''),
            );
            if (
              !sawRawTerminal &&
              !/[.?!][)"'\u201d\u2019]*$/.test(rawPrevWord) &&
              (rawPrevEndedNonTermPunct || rawCurrStartsLower)
            ) {
              canMerge = true;
              const punctMatch = rawPrevWord.replace(/[)"'\u201d\u2019]+$/g, '').match(/([,;:])$/);
              recoveredPunct = punctMatch ? punctMatch[1] : '';
              shouldLowercaseCurr =
                rawCurrStartsLower && !/^(I|I'm|I've|I'll|I'd)\b/.test(currFirstWord);
            }
          }
          if (cRawIdx >= 0) {
            rawSearchCursor = cRawIdx;
          } else if (pRawIdx >= 0) {
            rawSearchCursor = pRawIdx + 1;
          }
        }
      }
    }

    if (canMerge && prev) {
      let nextCurrText = s.text;
      if (recoveredPunct !== null) {
        prev.text = stripSyntheticTrailingPeriod(prev.text, recoveredPunct);
        if (prev.rawText) {
          prev.rawText = stripSyntheticTrailingPeriod(prev.rawText, recoveredPunct);
        }
        if (prev.words.length > 0) {
          const lastW = prev.words[prev.words.length - 1];
          lastW.word = stripSyntheticTrailingPeriod(lastW.word, recoveredPunct);
        }
      }
      if (shouldLowercaseCurr) {
        nextCurrText = lowercaseSentenceInitial(nextCurrText);
        if (words.length > 0) {
          words[0].word = lowercaseSentenceInitial(words[0].word);
        }
      }

      prev.words = [...prev.words, ...words];
      prev.text = `${prev.text} ${nextCurrText}`.replace(/\s+/g, ' ').trim();
      prev.rawText = `${prev.rawText || prev.text} ${s.rawText || nextCurrText}`
        .replace(/\s+/g, ' ')
        .trim();
      prev.repaired = Boolean(prev.repaired || s.repaired);
      if (!prev.repairNote && s.repairNote) prev.repairNote = s.repairNote;
      if (prev.words.length > 0) {
        prev.startMs = prev.words[0].startMs;
        prev.endMs = Math.max(prev.startMs + 80, prev.words[prev.words.length - 1].endMs);
      } else {
        prev.endMs = Math.max(prev.endMs, s.endMs);
      }
      prev.startSec = roundMs(prev.startMs / 1000);
      prev.endSec = roundMs(prev.endMs / 1000);
    } else {
      if (rawHasPunct && rawWords && currFirstWordObj) {
        const synced = findMatchedRawWordIndex(rawWords, rawSearchCursor, words[words.length - 1] || currFirstWordObj);
        if (synced >= 0) rawSearchCursor = synced;
      }
      const idx = out.length + 1;
      const startMs = words.length > 0 ? words[0].startMs : s.startMs;
      const endMs =
        words.length > 0 ? Math.max(startMs + 80, words[words.length - 1].endMs) : s.endMs;
      out.push({
        ...s,
        id: `canon-s-${idx}`,
        index: idx,
        words,
        startMs,
        endMs,
        startSec: roundMs(startMs / 1000),
        endSec: roundMs(endMs / 1000),
      });
    }
  }

  return out;
}

/**
 * Builds the deterministic untouched raw baseline snapshot reusing Flaptap's
 * shared canonical-first word segmentation (`buildRawSentencesAndParagraphsFromWords`).
 */
export function buildRawTranscriptSnapshot(params: {
  provider: string;
  model?: string;
  title: string;
  creator: string;
  url: string;
  mediaId: string;
  durationSeconds: number;
  fullText: string;
  cues?: TranscriptCue[];
  timedWords?: TimedWord[];
  pacingMode?: MediaHubPacingMode;
}): RawTranscriptSnapshot {
  const pacingMode = normalizePacingMode(params.pacingMode);
  const { words, cues } = normalizeRawTimedWords(
    params.timedWords,
    params.cues,
    params.fullText,
    params.durationSeconds,
  );

  const { canonicalSentences, sentences, paragraphs } = buildRawSentencesAndParagraphsFromWords({
    rawWords: words,
    creator: params.creator,
    pacingMode,
  });

  return {
    provider: params.provider || 'provider',
    model: params.model || '',
    fullText: (params.fullText || words.map((w) => w.word).join(' ')).trim(),
    cues,
    words,
    canonicalSentences,
    sentences,
    paragraphs,
    extractedAt: new Date().toISOString(),
  };
}

function charSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > Math.max(m, n) * 0.65) return 0;

  const prev = new Int32Array(n + 1);
  const curr = new Int32Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev.set(curr);
  }
  return 1 - prev[n] / Math.max(m, n);
}

interface AlignSpanResult {
  words: TimedWordMs[];
  repairedCount: number;
  exactCount: number;
}

function alignLocalSlice(
  rawSlice: TimedWordMs[],
  revTokens: string[],
  prevBoundaryMs: number,
  nextBoundaryMs: number,
): AlignSpanResult {
  const m = rawSlice.length;
  const n = revTokens.length;

  if (n === 0) return { words: [], repairedCount: 0, exactCount: 0 };

  if (m === 0) {
    const startBase = Math.max(0, prevBoundaryMs);
    const endBase = Math.max(startBase + n * 120, nextBoundaryMs);
    const span = endBase - startBase;
    const step = span / n;
    const out: TimedWordMs[] = revTokens.map((tok, idx) => {
      const s = Math.round(startBase + idx * step);
      const e = Math.max(s + 70, Math.round(startBase + (idx + 1) * step));
      return {
        i: 0,
        word: tok,
        clean: normalizeAlignToken(tok),
        startMs: s,
        endMs: e,
        repaired: true,
        rawWord: '',
      };
    });
    return { words: out, repairedCount: n, exactCount: 0 };
  }

  if (m * n > 90000) {
    const startMs = rawSlice[0].startMs;
    const endMs = rawSlice[m - 1].endMs;
    const span = Math.max(n * 80, endMs - startMs);
    const out: TimedWordMs[] = revTokens.map((tok, idx) => {
      const s = Math.round(startMs + (idx / n) * span);
      const e = Math.max(s + 70, Math.round(startMs + ((idx + 1) / n) * span));
      const approxRaw = rawSlice[Math.min(m - 1, Math.floor((idx / n) * m))];
      const clean = normalizeAlignToken(tok);
      const exact = clean === approxRaw.clean;
      return {
        i: 0,
        word: tok,
        clean,
        startMs: s,
        endMs: e,
        ...(exact ? {} : { repaired: true, rawWord: approxRaw.word }),
      };
    });
    const exactCount = out.filter((w) => !w.repaired).length;
    return { words: out, repairedCount: out.length - exactCount, exactCount };
  }

  const rawNorm = rawSlice.map((w) => w.clean || normalizeAlignToken(w.word));
  const revNorm = revTokens.map((t) => normalizeAlignToken(t));

  let lead = 0;
  const maxLead = Math.min(m, n);
  while (lead < maxLead && rawNorm[lead] === revNorm[lead]) lead++;

  let trail = 0;
  const maxTrail = Math.min(m - lead, n - lead);
  while (trail < maxTrail && rawNorm[m - 1 - trail] === revNorm[n - 1 - trail]) trail++;

  if (lead > 0 || trail > 0) {
    const prefixWords: TimedWordMs[] = [];
    for (let k = 0; k < lead; k++) {
      prefixWords.push({
        i: 0,
        word: revTokens[k],
        clean: revNorm[k],
        startMs: rawSlice[k].startMs,
        endMs: rawSlice[k].endMs,
      });
    }

    const midRaw = rawSlice.slice(lead, m - trail);
    const midRev = revTokens.slice(lead, n - trail);
    const midPrev = lead > 0 ? rawSlice[lead - 1].endMs : prevBoundaryMs;
    const midNext = trail > 0 ? rawSlice[m - trail].startMs : nextBoundaryMs;
    const midRes =
      midRaw.length === 0 && midRev.length === 0
        ? { words: [], repairedCount: 0, exactCount: 0 }
        : alignLocalSlice(midRaw, midRev, midPrev, midNext);

    const suffixWords: TimedWordMs[] = [];
    for (let k = 0; k < trail; k++) {
      const rIdx = m - trail + k;
      const cIdx = n - trail + k;
      suffixWords.push({
        i: 0,
        word: revTokens[cIdx],
        clean: revNorm[cIdx],
        startMs: rawSlice[rIdx].startMs,
        endMs: rawSlice[rIdx].endMs,
      });
    }

    return {
      words: [...prefixWords, ...midRes.words, ...suffixWords],
      repairedCount: midRes.repairedCount,
      exactCount: lead + midRes.exactCount + trail,
    };
  }

  const stride = n + 1;
  const dp = new Float32Array((m + 1) * stride);
  const op = new Uint8Array((m + 1) * stride);

  for (let i = 1; i <= m; i++) {
    dp[i * stride] = i * 1.15;
    op[i * stride] = 2;
  }
  for (let j = 1; j <= n; j++) {
    dp[j] = j * 1.15;
    op[j] = 3;
  }

  for (let i = 1; i <= m; i++) {
    const r = rawNorm[i - 1];
    for (let j = 1; j <= n; j++) {
      const c = revNorm[j - 1];
      const idx = i * stride + j;
      const nearDiag = Math.abs(i - j) <= 10;

      let bestCost = Infinity;
      let bestOp = 1;

      let subCost: number;
      if (r === c) {
        subCost = 0;
      } else if (nearDiag) {
        const sim = charSimilarity(r, c);
        subCost = sim >= 0.65 ? 0.35 * (1 - sim) + 0.15 : 1.0;
      } else {
        subCost = 1.0;
      }
      const c1 = dp[(i - 1) * stride + (j - 1)] + subCost;
      if (c1 < bestCost) {
        bestCost = c1;
        bestOp = 1;
      }

      const c2 = dp[(i - 1) * stride + j] + 1.15;
      if (c2 < bestCost) {
        bestCost = c2;
        bestOp = 2;
      }

      const c3 = dp[i * stride + (j - 1)] + 1.15;
      if (c3 < bestCost) {
        bestCost = c3;
        bestOp = 3;
      }

      if (i >= 2 && nearDiag) {
        const merged = rawNorm[i - 2] + rawNorm[i - 1];
        const simMerge = merged === c ? 1 : charSimilarity(merged, c);
        if (simMerge >= 0.72) {
          const c4 = dp[(i - 2) * stride + (j - 1)] + (1 - simMerge) * 0.4 + 0.12;
          if (c4 < bestCost) {
            bestCost = c4;
            bestOp = 4;
          }
        }
      }

      if (j >= 2 && nearDiag) {
        const joined = revNorm[j - 2] + revNorm[j - 1];
        const simSplit = joined === r ? 1 : charSimilarity(r, joined);
        if (simSplit >= 0.72) {
          const c5 = dp[(i - 1) * stride + (j - 2)] + (1 - simSplit) * 0.4 + 0.12;
          if (c5 < bestCost) {
            bestCost = c5;
            bestOp = 5;
          }
        }
      }

      dp[idx] = bestCost;
      op[idx] = bestOp;
    }
  }

  type Step =
    | { type: '1:1'; r: number; c: number }
    | { type: '2:1'; r1: number; r2: number; c: number }
    | { type: '1:2'; r: number; c1: number; c2: number }
    | { type: 'ins'; c: number; rawAnchor: number }
    | { type: 'del'; r: number };

  const steps: Step[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    const code = op[i * stride + j];
    if (i > 0 && j > 0 && code === 1) {
      steps.push({ type: '1:1', r: i - 1, c: j - 1 });
      i -= 1;
      j -= 1;
    } else if (i >= 2 && j > 0 && code === 4) {
      steps.push({ type: '2:1', r1: i - 2, r2: i - 1, c: j - 1 });
      i -= 2;
      j -= 1;
    } else if (i > 0 && j >= 2 && code === 5) {
      steps.push({ type: '1:2', r: i - 1, c1: j - 2, c2: j - 1 });
      i -= 1;
      j -= 2;
    } else if (i > 0 && (j === 0 || code === 2)) {
      steps.push({ type: 'del', r: i - 1 });
      i -= 1;
    } else {
      steps.push({ type: 'ins', c: j - 1, rawAnchor: i });
      j -= 1;
    }
  }
  steps.reverse();

  const out: TimedWordMs[] = [];
  let repairedCount = 0;
  let exactCount = 0;

  for (let sIdx = 0; sIdx < steps.length; sIdx++) {
    const step = steps[sIdx];
    if (step.type === 'del') continue;

    if (step.type === '1:1') {
      const rw = rawSlice[step.r];
      const tok = revTokens[step.c];
      const norm = revNorm[step.c];
      const isExact = norm === rawNorm[step.r];
      if (isExact) exactCount++;
      else repairedCount++;
      out.push({
        i: 0,
        word: tok,
        clean: norm,
        startMs: rw.startMs,
        endMs: rw.endMs,
        ...(isExact ? {} : { repaired: true, rawWord: rw.word }),
      });
    } else if (step.type === '2:1') {
      const rw1 = rawSlice[step.r1];
      const rw2 = rawSlice[step.r2];
      const tok = revTokens[step.c];
      repairedCount++;
      out.push({
        i: 0,
        word: tok,
        clean: revNorm[step.c],
        startMs: rw1.startMs,
        endMs: Math.max(rw1.startMs + 80, rw2.endMs),
        repaired: true,
        rawWord: `${rw1.word} ${rw2.word}`,
      });
    } else if (step.type === '1:2') {
      const rw = rawSlice[step.r];
      const t1 = revTokens[step.c1];
      const t2 = revTokens[step.c2];
      const w1 = Math.max(2, revNorm[step.c1].length || 2);
      const w2 = Math.max(2, revNorm[step.c2].length || 2);
      const span = Math.max(120, rw.endMs - rw.startMs);
      const mid = rw.startMs + Math.round((w1 / (w1 + w2)) * span);
      repairedCount += 2;
      out.push({
        i: 0,
        word: t1,
        clean: revNorm[step.c1],
        startMs: rw.startMs,
        endMs: Math.max(rw.startMs + 60, mid),
        repaired: true,
        rawWord: rw.word,
      });
      out.push({
        i: 0,
        word: t2,
        clean: revNorm[step.c2],
        startMs: Math.max(rw.startMs + 60, mid),
        endMs: Math.max(rw.startMs + 120, rw.endMs),
        repaired: true,
        rawWord: rw.word,
      });
    } else if (step.type === 'ins') {
      const prevEnd = out.length > 0 ? out[out.length - 1].endMs : prevBoundaryMs;
      const nextRaw = step.rawAnchor < m ? rawSlice[step.rawAnchor] : null;
      const nextStart = nextRaw ? nextRaw.startMs : nextBoundaryMs;
      const gap = Math.max(0, nextStart - prevEnd);
      const startMs = prevEnd;
      // Fit cleanly inside available gap; if tight, finalizer will partition non-overlapping slices cleanly
      const endMs = gap >= 40 ? Math.min(nextStart, startMs + Math.min(gap, 220)) : startMs + 50;
      repairedCount++;
      out.push({
        i: 0,
        word: revTokens[step.c],
        clean: revNorm[step.c],
        startMs,
        endMs,
        repaired: true,
        rawWord: '',
      });
    }
  }

  return { words: out, repairedCount, exactCount };
}

export function alignReviewedWordsToRawTiming(
  rawWords: TimedWordMs[],
  reviewedTokens: string[],
): {
  words: TimedWordMs[];
  repairedWords: number;
  exactWords: number;
  verbatimScore: number;
} {
  if (reviewedTokens.length === 0) {
    return { words: [], repairedWords: 0, exactWords: 0, verbatimScore: 100 };
  }
  if (rawWords.length === 0) {
    const synthetic = alignLocalSlice([], reviewedTokens, 0, reviewedTokens.length * 260);
    synthetic.words.forEach((w, idx) => (w.i = idx));
    return { words: synthetic.words, repairedWords: 0, exactWords: reviewedTokens.length, verbatimScore: 100 };
  }

  if (rawWords.length <= 220 && reviewedTokens.length <= 220) {
    const res = alignLocalSlice(
      rawWords,
      reviewedTokens,
      rawWords[0].startMs,
      rawWords[rawWords.length - 1].endMs,
    );
    const finalized = finalizeMonotonicWords(res.words);
    const verbatimScore = computeVerbatimScore(res.exactCount, finalized.length);
    return {
      words: finalized,
      repairedWords: res.repairedCount,
      exactWords: res.exactCount,
      verbatimScore,
    };
  }

  const rawNorm = rawWords.map((w) => w.clean || normalizeAlignToken(w.word));
  const revNorm = reviewedTokens.map((t) => normalizeAlignToken(t));

  const bigramPositions = new Map<string, number[]>();
  for (let i = 0; i < rawNorm.length - 1; i++) {
    const key = `${rawNorm[i]}|${rawNorm[i + 1]}`;
    const list = bigramPositions.get(key);
    if (list) list.push(i);
    else bigramPositions.set(key, [i]);
  }

  const anchors: Array<{ rawIdx: number; revIdx: number }> = [{ rawIdx: 0, revIdx: 0 }];
  let lastRaw = 0;
  let lastRev = 0;
  const ratio = rawNorm.length / Math.max(1, revNorm.length);

  for (let j = 45; j < revNorm.length - 20; j += 1) {
    if (j - lastRev < 55) continue;
    const key = `${revNorm[j]}|${revNorm[j + 1]}`;
    const candidates = bigramPositions.get(key);
    if (!candidates || candidates.length === 0) continue;

    const expectedRaw = lastRaw + Math.round((j - lastRev) * ratio);
    let lo = 0;
    let hi = candidates.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (candidates[mid] < expectedRaw) lo = mid + 1;
      else hi = mid;
    }
    let bestCand = -1;
    let bestDist = Infinity;
    for (let k = Math.max(0, lo - 2); k <= Math.min(candidates.length - 1, lo + 2); k++) {
      const c = candidates[k];
      if (c <= lastRaw + 15 || c - lastRaw > 240) continue;
      const dist = Math.abs(c - expectedRaw);
      if (dist < bestDist && dist <= 90) {
        bestDist = dist;
        bestCand = c;
      }
    }

    if (bestCand !== -1) {
      anchors.push({ rawIdx: bestCand, revIdx: j });
      lastRaw = bestCand;
      lastRev = j;
    }
  }

  anchors.push({ rawIdx: rawWords.length, revIdx: reviewedTokens.length });

  const allWords: TimedWordMs[] = [];
  let totalRepaired = 0;
  let totalExact = 0;

  for (let a = 0; a < anchors.length - 1; a++) {
    const startRaw = anchors[a].rawIdx;
    const endRaw = anchors[a + 1].rawIdx;
    const startRev = anchors[a].revIdx;
    const endRev = anchors[a + 1].revIdx;

    const prevBoundaryMs =
      allWords.length > 0
        ? allWords[allWords.length - 1].endMs
        : rawWords[Math.min(startRaw, rawWords.length - 1)].startMs;
    const nextBoundaryMs =
      endRaw < rawWords.length
        ? rawWords[endRaw].startMs
        : rawWords[rawWords.length - 1].endMs;

    const res = alignLocalSlice(
      rawWords.slice(startRaw, endRaw),
      reviewedTokens.slice(startRev, endRev),
      prevBoundaryMs,
      nextBoundaryMs,
    );
    allWords.push(...res.words);
    totalRepaired += res.repairedCount;
    totalExact += res.exactCount;
  }

  const finalized = finalizeMonotonicWords(allWords);
  return {
    words: finalized,
    repairedWords: totalRepaired,
    exactWords: totalExact,
    verbatimScore: computeVerbatimScore(totalExact, finalized.length),
  };
}

function finalizeMonotonicWords(words: TimedWordMs[]): TimedWordMs[] {
  return enforceNonOverlappingWordTimings(words);
}

function computeVerbatimScore(exactWords: number, totalWords: number): number {
  if (totalWords <= 0) return 100;
  return Math.round(Math.max(0, Math.min(100, (exactWords / totalWords) * 100)) * 10) / 10;
}

export interface DraftReviewedSentence {
  text: string;
  speaker?: string;
  repaired?: boolean;
  repairNote?: string;
  isOverlap?: boolean;
  isInterrupted?: boolean;
  paragraphIndex?: number;
  ideaIndex?: number;
}

export interface DraftReviewedIdea {
  index?: number;
  title: string;
  summary?: string;
  keyTakeaway?: string;
  sentenceIndices?: number[];
}

/**
 * Unified 50ms Playback Boundary Law:
 * Always computes every output sentence's `startMs`/`endMs` from its unpadded
 * `words[0].startMs` .. `words[last].endMs`, absorbs natural acoustic release tail
 * up to +320ms (`min(320, round(gap * 0.5))`), and strictly caps `endMs <= next.startMs - 50`.
 */
export function applyPlaybackBoundaryLaw(sentences: TranscriptSentence[]): void {
  for (let i = 0; i < sentences.length; i++) {
    const curr = sentences[i];
    const words = Array.isArray(curr.words) ? curr.words : [];
    const fallbackStart = i > 0 ? sentences[i - 1].endMs : 0;
    const startMs =
      words.length > 0
        ? Math.max(0, Math.round(words[0].startMs))
        : Math.max(0, Math.round(Number(curr.startMs) || fallbackStart));
    const rawEndMs =
      words.length > 0
        ? Math.max(startMs + 80, Math.round(words[words.length - 1].endMs))
        : Math.max(startMs + 80, Math.round(Number(curr.endMs) || startMs + 350));

    curr.startMs = startMs;
    curr.endMs = rawEndMs;
  }

  for (let i = 0; i < sentences.length; i++) {
    const curr = sentences[i];
    const next = sentences[i + 1];
    if (next) {
      const gap = next.startMs - curr.endMs;
      if (gap > 60) {
        const tail = Math.min(320, Math.round(gap * 0.5));
        curr.endMs = Math.min(curr.endMs + tail, next.startMs - 50);
      } else if (curr.endMs > next.startMs - 50 && next.startMs - 50 > curr.startMs + 80) {
        curr.endMs = next.startMs - 50;
      }
      if (Array.isArray(curr.words) && curr.words.length > 0) {
        for (const w of curr.words) {
          if (w.endMs > curr.endMs && w.startMs < curr.endMs) {
            w.endMs = curr.endMs;
          }
        }
      }
    } else {
      curr.endMs = curr.endMs + 280;
    }

    if (curr.endMs <= curr.startMs) {
      curr.endMs = curr.startMs + 80;
    }
    curr.startSec = roundMs(curr.startMs / 1000);
    curr.endSec = roundMs(curr.endMs / 1000);
  }
}

export function assembleAlignedReviewedViews(params: {
  rawWords: TimedWordMs[];
  draftSentences: DraftReviewedSentence[];
  draftIdeas: DraftReviewedIdea[];
  defaultSpeaker: string;
  speakerOverrides?: Record<string, string>;
  pacingMode?: MediaHubPacingMode;
}): {
  canonicalSentences: TranscriptSentence[];
  sentences: TranscriptSentence[];
  paragraphs: TranscriptParagraph[];
  ideas: TranscriptIdea[];
  speakers: TranscriptSpeakerInfo[];
  speakerTurns: TranscriptSpeakerTurn[];
  quality: TranscriptQualityReport;
} {
  const pacingMode = normalizePacingMode(params.pacingMode);
  const cleanDrafts = params.draftSentences
    .map((s) => ({
      text: String(s?.text || '').replace(/\s+/g, ' ').trim(),
      speaker: String(s?.speaker || '').replace(/\s+/g, ' ').trim() || params.defaultSpeaker || 'Speaker 1',
      repaired: Boolean(s?.repaired),
      repairNote: String(s?.repairNote || '').trim(),
      isOverlap: Boolean(s?.isOverlap),
      isInterrupted: Boolean(s?.isInterrupted),
      paragraphIndex: Number(s?.paragraphIndex) > 0 ? Math.floor(Number(s.paragraphIndex)) : 0,
      ideaIndex: Number(s?.ideaIndex) > 0 ? Math.floor(Number(s.ideaIndex)) : 0,
    }))
    .filter((s) => s.text.length > 0);

  const sentenceTokens = cleanDrafts.map((s) => tokenizeDisplayWords(s.text));
  const flatTokens = sentenceTokens.flat();
  const aligned = alignReviewedWordsToRawTiming(params.rawWords, flatTokens);

  const speakerNameToId = new Map<string, string>();
  const speakerOriginalById = new Map<string, string>();
  const speakerColorById = new Map<string, number>();
  let nextSpkNum = 1;

  const resolveSpeaker = (rawLabel: string): { id: string; name: string; colorIndex: number } => {
    const clean = rawLabel.trim() || params.defaultSpeaker || 'Speaker 1';
    const key = clean.toLowerCase();
    let id = speakerNameToId.get(key);
    if (!id) {
      id = `spk_${nextSpkNum}`;
      speakerNameToId.set(key, id);
      speakerOriginalById.set(id, clean);
      speakerColorById.set(id, (nextSpkNum - 1) % 6);
      nextSpkNum++;
    }
    const override = params.speakerOverrides?.[id]?.trim();
    return {
      id,
      name: override || speakerOriginalById.get(id) || clean,
      colorIndex: speakerColorById.get(id) ?? 0,
    };
  };

  const canonicalSentences: TranscriptSentence[] = [];
  const sentences: TranscriptSentence[] = [];
  const activeIndicesByCanonicalIdx = new Map<number, number[]>();
  let cursor = 0;

  for (let i = 0; i < cleanDrafts.length; i++) {
    const draft = cleanDrafts[i];
    const tokCount = sentenceTokens[i].length;
    const words = aligned.words.slice(cursor, cursor + tokCount);
    cursor += tokCount;

    const spk = resolveSpeaker(draft.speaker);
    const canonStartMs =
      words.length > 0 ? words[0].startMs : canonicalSentences[canonicalSentences.length - 1]?.endMs || 0;
    const canonEndMs =
      words.length > 0 ? Math.max(canonStartMs + 80, words[words.length - 1].endMs) : canonStartMs + 350;
    const canonRawText = words
      .map((w) => (w.repaired ? w.rawWord || '' : w.word))
      .filter(Boolean)
      .join(' ')
      .trim();
    const canonRepaired = words.some((w) => w.repaired) || draft.isOverlap || draft.isInterrupted;
    const canonRepairNote = canonRepaired
      ? draft.repairNote ||
        (draft.isInterrupted
          ? 'Cut-off speaker interruption preserved accurately'
          : draft.isOverlap
            ? 'Separated overlapping speaker turn'
            : 'Corrected ASR transcription wording')
      : '';

    const canonIndex = canonicalSentences.length + 1;
    canonicalSentences.push({
      id: `canon-s-${canonIndex}`,
      index: canonIndex,
      text: draft.text,
      rawText: canonRawText || draft.text,
      speakerId: spk.id,
      speaker: spk.name,
      repaired: canonRepaired,
      repairNote: canonRepairNote,
      isOverlap: draft.isOverlap,
      isInterrupted: draft.isInterrupted,
      paragraphIndex: draft.paragraphIndex || 0,
      ideaIndex: draft.ideaIndex || 0,
      startMs: canonStartMs,
      endMs: canonEndMs,
      startSec: roundMs(canonStartMs / 1000),
      endSec: roundMs(canonEndMs / 1000),
      words,
    });

    const wordSlices = words.length > 0 ? splitTimedWordsForShadowing(words, pacingMode) : [words];
    const mappedActiveIndices: number[] = [];

    for (let sliceIdx = 0; sliceIdx < wordSlices.length; sliceIdx++) {
      const sliceWords = wordSlices[sliceIdx];
      const startMs =
        sliceWords.length > 0 ? sliceWords[0].startMs : sentences[sentences.length - 1]?.endMs || 0;
      const rawEndMs =
        sliceWords.length > 0 ? sliceWords[sliceWords.length - 1].endMs : startMs + 350;

      const sliceText =
        wordSlices.length === 1
          ? draft.text
          : sliceWords.map((w) => w.word).join(' ').replace(/\s+/g, ' ').trim();
      const rawWordsForSentence = sliceWords
        .map((w) => (w.repaired ? w.rawWord || '' : w.word))
        .filter(Boolean)
        .join(' ')
        .trim();
      const hasWordRepair = sliceWords.some((w) => w.repaired);
      const substantiveRepair = hasWordRepair || draft.isOverlap || draft.isInterrupted;

      const nextIndex = sentences.length + 1;
      mappedActiveIndices.push(nextIndex);
      sentences.push({
        id: `s-${nextIndex}`,
        index: nextIndex,
        text: sliceText || draft.text,
        rawText: rawWordsForSentence || sliceText || draft.text,
        speakerId: spk.id,
        speaker: spk.name,
        repaired: substantiveRepair,
        repairNote:
          substantiveRepair
            ? draft.repairNote ||
              (draft.isInterrupted
                ? 'Cut-off speaker interruption preserved accurately'
                : draft.isOverlap
                  ? 'Separated overlapping speaker turn'
                  : 'Corrected ASR transcription wording')
            : '',
        isOverlap: draft.isOverlap,
        isInterrupted: draft.isInterrupted,
        paragraphIndex: draft.paragraphIndex || 0,
        ideaIndex: draft.ideaIndex || 0,
        startMs,
        endMs: Math.max(startMs + 80, rawEndMs),
        startSec: roundMs(startMs / 1000),
        endSec: roundMs(Math.max(startMs + 80, rawEndMs) / 1000),
        words: sliceWords,
      });
    }
    activeIndicesByCanonicalIdx.set(canonIndex, mappedActiveIndices);
  }

  // Unified 50ms Playback Boundary Law
  applyPlaybackBoundaryLaw(sentences);

  // Remap draftIdeas.sentenceIndices from canonical indices to active split indices
  const remappedDraftIdeas: DraftReviewedIdea[] = (params.draftIdeas || []).map((idea) => {
    if (!Array.isArray(idea.sentenceIndices) || idea.sentenceIndices.length === 0) {
      return idea;
    }
    const expanded: number[] = [];
    for (const cIdx of idea.sentenceIndices) {
      const mapped = activeIndicesByCanonicalIdx.get(Math.floor(Number(cIdx)));
      if (mapped?.length) expanded.push(...mapped);
    }
    return {
      ...idea,
      sentenceIndices: expanded.length > 0 ? expanded : undefined,
    };
  });

  const paragraphs = buildParagraphsFromSentences(sentences, pacingMode);
  const ideas = buildIdeasFromSentences(sentences, remappedDraftIdeas);
  const { speakers, speakerTurns } = buildSpeakerViews(sentences, speakerOriginalById, speakerColorById);

  // Sync resolved ideaIndex (and missing paragraphIndex) back to canonicalSentences for future lossless pacing toggles
  const sentByIndex = new Map<number, TranscriptSentence>(sentences.map((s) => [s.index, s]));
  for (const canon of canonicalSentences) {
    const childIndices = activeIndicesByCanonicalIdx.get(canon.index);
    const firstChild = childIndices?.length ? sentByIndex.get(childIndices[0]) : undefined;
    if (firstChild) {
      canon.ideaIndex = firstChild.ideaIndex;
      if (!canon.paragraphIndex || canon.paragraphIndex <= 0) {
        canon.paragraphIndex = firstChild.paragraphIndex;
      }
    }
  }

  const repairedSentences = sentences.filter((s) => s.repaired).length;
  const overlapsResolved = sentences.filter((s) => s.isOverlap).length;
  const multiSpeaker = speakers.length > 1;

  const summaryParts: string[] = [];
  if (repairedSentences === 0 && overlapsResolved === 0) {
    summaryParts.push('Transcript matched source verbatim with clean punctuation.');
  } else {
    if (repairedSentences > 0) {
      summaryParts.push(
        `Repaired ${repairedSentences} sentence${repairedSentences === 1 ? '' : 's'} while preserving speaker style.`,
      );
    }
    if (overlapsResolved > 0) {
      summaryParts.push(
        `Clarified ${overlapsResolved} multi-speaker overlap${overlapsResolved === 1 ? '' : 's'}.`,
      );
    }
  }

  return {
    canonicalSentences,
    sentences,
    paragraphs,
    ideas,
    speakers,
    speakerTurns,
    quality: {
      totalWords: aligned.words.length,
      repairedWords: aligned.repairedWords,
      repairedSentences,
      overlapsResolved,
      verbatimScore: aligned.verbatimScore,
      multiSpeaker,
      summary: summaryParts.join(' '),
    },
  };
}

export function buildParagraphsFromSentences(
  sentences: TranscriptSentence[],
  pacingMode: MediaHubPacingMode = 'short',
): TranscriptParagraph[] {
  if (sentences.length === 0) return [];
  const mode = normalizePacingMode(pacingMode);
  const explicitCap = mode === 'short' ? 12 : 6;
  const implicitCap = mode === 'short' ? 8 : 4;

  const hasExplicitParas = sentences.some((s) => s.paragraphIndex > 0);
  const groups: TranscriptSentence[][] = [];

  if (hasExplicitParas) {
    let curr: TranscriptSentence[] = [];
    let currKey = '';
    for (const s of sentences) {
      const pIdx = s.paragraphIndex || 1;
      const key = `${pIdx}::${s.speakerId}`;
      if (curr.length > 0 && (key !== currKey || curr.length >= explicitCap)) {
        groups.push(curr);
        curr = [];
      }
      curr.push(s);
      currKey = key;
    }
    if (curr.length) groups.push(curr);
  } else {
    let curr: TranscriptSentence[] = [];
    let wordsInCurr = 0;
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      const prev = curr[curr.length - 1];
      const speakerChanged = prev && prev.speakerId !== s.speakerId;
      const gapMs = prev ? s.startMs - prev.endMs : 0;

      if (
        curr.length > 0 &&
        (speakerChanged ||
          (curr.length >= 3 && (wordsInCurr >= 55 || gapMs >= 700)) ||
          curr.length >= implicitCap)
      ) {
        groups.push(curr);
        curr = [];
        wordsInCurr = 0;
      }
      curr.push(s);
      wordsInCurr += s.words.length;
    }
    if (curr.length) groups.push(curr);
  }

  return groups.map((group, idx) => {
    const pIndex = idx + 1;
    group.forEach((s) => {
      s.paragraphIndex = pIndex;
    });
    const startMs = group[0].startMs;
    const endMs = group[group.length - 1].endMs;
    return {
      index: pIndex,
      speakerId: group[0].speakerId,
      speaker: group[0].speaker,
      sentenceIndices: group.map((s) => s.index),
      text: group.map((s) => s.text).join(' '),
      startMs,
      endMs,
      startSec: roundMs(startMs / 1000),
      endSec: roundMs(endMs / 1000),
    };
  });
}

export function buildIdeasFromSentences(
  sentences: TranscriptSentence[],
  draftIdeas: DraftReviewedIdea[],
): TranscriptIdea[] {
  if (sentences.length === 0) return [];
  const sentByIndex = new Map<number, TranscriptSentence>();
  sentences.forEach((s) => sentByIndex.set(s.index, s));

  const ideas: TranscriptIdea[] = [];
  const covered = new Set<number>();

  if (Array.isArray(draftIdeas) && draftIdeas.length > 0) {
    draftIdeas.forEach((draft, idx) => {
      let indices: number[] = [];
      if (Array.isArray(draft.sentenceIndices) && draft.sentenceIndices.length > 0) {
        indices = draft.sentenceIndices
          .map((n) => Math.floor(Number(n)))
          .filter((n) => sentByIndex.has(n) && !covered.has(n));
      }
      if (indices.length === 0) {
        const ideaId = draft.index || idx + 1;
        indices = sentences
          .filter((s) => s.ideaIndex === ideaId && !covered.has(s.index))
          .map((s) => s.index);
      }
      if (indices.length === 0) return;

      indices.sort((a, b) => a - b);
      indices.forEach((n) => covered.add(n));
      const group = indices.map((n) => sentByIndex.get(n)!);
      const speakers = Array.from(new Set(group.map((s) => s.speaker)));
      const startMs = group[0].startMs;
      const endMs = group[group.length - 1].endMs;

      ideas.push({
        index: ideas.length + 1,
        title: String(draft.title || `Idea ${ideas.length + 1}`).trim(),
        summary: String(draft.summary || '').trim(),
        keyTakeaway: String(draft.keyTakeaway || '').trim(),
        speakers,
        sentenceIndices: indices,
        startMs,
        endMs,
        startSec: roundMs(startMs / 1000),
        endSec: roundMs(endMs / 1000),
      });
    });
  }

  const uncovered = sentences.filter((s) => !covered.has(s.index));
  if (uncovered.length > 0) {
    if (ideas.length === 0) {
      const blockSize = Math.max(5, Math.min(12, Math.ceil(uncovered.length / Math.max(1, Math.round(uncovered.length / 8)))));
      for (let i = 0; i < uncovered.length; i += blockSize) {
        const group = uncovered.slice(i, i + blockSize);
        const startMs = group[0].startMs;
        const endMs = group[group.length - 1].endMs;
        const leadWords = group[0].text.split(/\s+/).slice(0, 7).join(' ').replace(/[,:;]+$/, '');
        ideas.push({
          index: ideas.length + 1,
          title: leadWords ? `${leadWords}…` : `Key Point ${ideas.length + 1}`,
          summary: group[0].text,
          keyTakeaway: '',
          speakers: Array.from(new Set(group.map((s) => s.speaker))),
          sentenceIndices: group.map((s) => s.index),
          startMs,
          endMs,
          startSec: roundMs(startMs / 1000),
          endSec: roundMs(endMs / 1000),
        });
      }
    } else {
      for (const s of uncovered) {
        let bestIdea = ideas[ideas.length - 1];
        for (const idea of ideas) {
          const firstIdx = idea.sentenceIndices[0] ?? 1;
          const lastIdx = idea.sentenceIndices[idea.sentenceIndices.length - 1] ?? 1;
          if (s.index >= firstIdx && s.index <= lastIdx) {
            bestIdea = idea;
            break;
          }
          if (s.index < firstIdx) {
            bestIdea = idea;
            break;
          }
        }
        bestIdea.sentenceIndices.push(s.index);
        bestIdea.sentenceIndices.sort((a, b) => a - b);
        const firstSent = sentByIndex.get(bestIdea.sentenceIndices[0])!;
        const lastSent = sentByIndex.get(bestIdea.sentenceIndices[bestIdea.sentenceIndices.length - 1])!;
        bestIdea.startMs = firstSent.startMs;
        bestIdea.endMs = lastSent.endMs;
        bestIdea.startSec = firstSent.startSec;
        bestIdea.endSec = lastSent.endSec;
        if (!bestIdea.speakers.includes(s.speaker)) bestIdea.speakers.push(s.speaker);
      }
    }
  }

  ideas.sort((a, b) => a.startMs - b.startMs);
  ideas.forEach((idea, idx) => {
    idea.index = idx + 1;
    idea.sentenceIndices.forEach((sIdx) => {
      const s = sentByIndex.get(sIdx);
      if (s) s.ideaIndex = idea.index;
    });
  });

  return ideas;
}

export function buildSpeakerViews(
  sentences: TranscriptSentence[],
  originalById: Map<string, string>,
  colorById: Map<string, number>,
): { speakers: TranscriptSpeakerInfo[]; speakerTurns: TranscriptSpeakerTurn[] } {
  const statsMap = new Map<string, TranscriptSpeakerInfo>();
  const turns: TranscriptSpeakerTurn[] = [];

  for (const s of sentences) {
    const colorIndex = colorById.get(s.speakerId) ?? 0;
    let info = statsMap.get(s.speakerId);
    if (!info) {
      info = {
        id: s.speakerId,
        name: s.speaker,
        originalLabel: originalById.get(s.speakerId) || s.speaker,
        colorIndex,
        sentenceCount: 0,
        wordCount: 0,
        talkTimeMs: 0,
      };
      statsMap.set(s.speakerId, info);
    }
    info.sentenceCount += 1;
    info.wordCount += s.words.length;
    info.talkTimeMs += Math.max(0, s.endMs - s.startMs);

    const prevTurn = turns[turns.length - 1];
    if (prevTurn && prevTurn.speakerId === s.speakerId && !s.isOverlap) {
      prevTurn.sentenceIndices.push(s.index);
      prevTurn.text = `${prevTurn.text} ${s.text}`.trim();
      prevTurn.endMs = s.endMs;
      prevTurn.endSec = s.endSec;
    } else {
      turns.push({
        index: turns.length + 1,
        speakerId: s.speakerId,
        speaker: s.speaker,
        colorIndex,
        sentenceIndices: [s.index],
        text: s.text,
        isOverlap: s.isOverlap,
        startMs: s.startMs,
        endMs: s.endMs,
        startSec: s.startSec,
        endSec: s.endSec,
      });
    }
  }

  return {
    speakers: Array.from(statsMap.values()),
    speakerTurns: turns,
  };
}

export function applySpeakerOverridesToReviewed(
  reviewed: {
    canonicalSentences?: TranscriptSentence[];
    sentences: TranscriptSentence[];
    paragraphs: TranscriptParagraph[];
    ideas: TranscriptIdea[];
    speakers: TranscriptSpeakerInfo[];
    speakerTurns: TranscriptSpeakerTurn[];
  },
  overrides: Record<string, string>,
): void {
  const nameById = new Map<string, string>();
  reviewed.speakers.forEach((sp) => {
    const custom = overrides?.[sp.id]?.trim();
    sp.name = custom || sp.originalLabel || sp.name;
    nameById.set(sp.id, sp.name);
  });

  if (Array.isArray(reviewed.canonicalSentences)) {
    reviewed.canonicalSentences.forEach((s) => {
      const mapped = nameById.get(s.speakerId);
      if (mapped) s.speaker = mapped;
    });
  }
  reviewed.sentences.forEach((s) => {
    const mapped = nameById.get(s.speakerId);
    if (mapped) s.speaker = mapped;
  });
  reviewed.paragraphs.forEach((p) => {
    const mapped = nameById.get(p.speakerId);
    if (mapped) p.speaker = mapped;
  });
  reviewed.speakerTurns.forEach((t) => {
    const mapped = nameById.get(t.speakerId);
    if (mapped) t.speaker = mapped;
  });
  const sentByIndex = new Map<number, TranscriptSentence>();
  reviewed.sentences.forEach((s) => sentByIndex.set(s.index, s));
  reviewed.ideas.forEach((idea) => {
    idea.speakers = Array.from(
      new Set(
        idea.sentenceIndices
          .map((idx) => sentByIndex.get(idx)?.speaker)
          .filter((v): v is string => Boolean(v)),
      ),
    );
  });
}

export function formatMsClock(ms: number): string {
  const safe = Math.max(0, Math.round(Number(ms) || 0));
  const h = Math.floor(safe / 3600000);
  const m = Math.floor((safe % 3600000) / 60000);
  const s = Math.floor((safe % 60000) / 1000);
  const rem = safe % 1000;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(rem).padStart(3, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(rem).padStart(3, '0')}`;
}

export {
  captureCompletedCoverage,
  normalizeTranslationKey,
  regroupMediaHubLessonByPacing,
  remapCompletedIndices,
  restoreExactTranslations,
  snapshotTranslationsByText,
} from './pacing-regroup.util';
