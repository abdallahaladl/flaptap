import {
  ChunkItem,
  HistoryItem,
  LessonCompletionProgress,
  SentenceItem,
} from '../../../../core/database/history.repository';
import { escapeTranscriptHtml } from '../../../../core/linguistics/highlights';
import {
  formatTimestampMs,
  normalizePacingMode,
  roundMs,
  segmentParagraphs,
  MediaHubPacingMode,
  splitTimedWordsForShadowing,
} from '../../../../core/linguistics/segmentation';
import {
  TimedWordMs,
  TranscriptParagraph,
  TranscriptSentence,
} from '../media-hub.types';
import {
  applyPlaybackBoundaryLaw,
  applySpeakerOverridesToReviewed,
  buildIdeasFromSentences,
  buildParagraphsFromSentences,
  buildRawSentencesAndParagraphsFromWords,
  buildSpeakerViews,
  coalesceToCanonicalSentences,
  DraftReviewedIdea,
  enforceNonOverlappingWordTimings,
  normalizeAlignToken,
  tokenizeDisplayWords,
} from './word-alignment.util';

export function normalizeTranslationKey(text: string): string {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export interface CompletedCoverageSnapshot {
  wordIds: Set<number>;
  hasWordIds: boolean;
  intervals: Array<{ startMs: number; endMs: number }>;
}

function getSentenceSpanMs(s: SentenceItem): { startMs: number; endMs: number } {
  const words = Array.isArray(s.words) ? s.words : [];
  if (words.length > 0) {
    const startMs = Math.max(0, Math.round(words[0].startMs));
    const endMs = Math.max(startMs + 60, Math.round(words[words.length - 1].endMs));
    return { startMs, endMs };
  }
  const startMs = Math.max(
    0,
    Math.round(typeof s.startMs === 'number' ? s.startMs : (Number(s.startSec) || 0) * 1000),
  );
  const endMs = Math.max(
    startMs + 60,
    Math.round(typeof s.endMs === 'number' ? s.endMs : (Number(s.endSec) || 0) * 1000),
  );
  return { startMs, endMs };
}

/**
 * Captures completed word index sets AND merged contiguous time intervals
 * from an existing sentence list prior to regrouping or review replacement.
 */
export function captureCompletedCoverage(
  oldSentences: SentenceItem[] | undefined,
  completedIndices: number[] | undefined,
): CompletedCoverageSnapshot {
  const wordIds = new Set<number>();
  const intervals: Array<{ startMs: number; endMs: number }> = [];
  if (!Array.isArray(oldSentences) || oldSentences.length === 0) {
    return { wordIds, hasWordIds: false, intervals };
  }
  const completedSet = new Set<number>(
    Array.isArray(completedIndices)
      ? completedIndices.map(Number).filter((n) => Number.isInteger(n) && n >= 0)
      : [],
  );
  if (completedSet.size === 0) {
    return { wordIds, hasWordIds: false, intervals };
  }

  let allCompletedHaveWords = true;
  let prevWasCompleted = false;

  for (const s of oldSentences) {
    const isDone = completedSet.has(Number(s.index));
    if (!isDone) {
      prevWasCompleted = false;
      continue;
    }

    const words = Array.isArray(s.words) ? s.words : [];
    if (words.length > 0 && words.every((w) => typeof w.i === 'number' && Number.isFinite(w.i))) {
      for (const w of words) wordIds.add(w.i);
    } else {
      allCompletedHaveWords = false;
    }

    const span = getSentenceSpanMs(s);
    if (prevWasCompleted && intervals.length > 0) {
      // Consecutive completed sentences bridge the inter-sentence silence between them
      const prev = intervals[intervals.length - 1];
      prev.endMs = Math.max(prev.endMs, span.endMs);
    } else if (intervals.length > 0 && span.startMs <= intervals[intervals.length - 1].endMs + 20) {
      const prev = intervals[intervals.length - 1];
      prev.endMs = Math.max(prev.endMs, span.endMs);
    } else {
      intervals.push({ startMs: span.startMs, endMs: span.endMs });
    }
    prevWasCompleted = true;
  }

  return {
    wordIds,
    hasWordIds: allCompletedHaveWords && wordIds.size > 0,
    intervals,
  };
}

/**
 * Real Derived Completion Law preservation:
 * Marks a new sentence completed iff ALL of its words were completed before
 * (or >= 90% of its unpadded span is covered when word indices are unavailable).
 */
export function remapCompletedIndices(
  coverage: CompletedCoverageSnapshot,
  nextSentences: SentenceItem[],
): number[] {
  if (!Array.isArray(nextSentences) || nextSentences.length === 0) return [];
  if (!coverage.hasWordIds && coverage.intervals.length === 0) return [];

  const result: number[] = [];

  for (const ns of nextSentences) {
    const words = Array.isArray(ns.words) ? ns.words : [];
    if (
      coverage.hasWordIds &&
      words.length > 0 &&
      words.every((w) => typeof w.i === 'number' && Number.isFinite(w.i))
    ) {
      if (words.every((w) => coverage.wordIds.has(w.i))) {
        result.push(ns.index);
      }
      continue;
    }

    const span = getSentenceSpanMs(ns);
    const totalMs = Math.max(1, span.endMs - span.startMs);
    let coveredMs = 0;
    for (const iv of coverage.intervals) {
      const overlapStart = Math.max(span.startMs, iv.startMs);
      const overlapEnd = Math.min(span.endMs, iv.endMs);
      if (overlapEnd > overlapStart) {
        coveredMs += overlapEnd - overlapStart;
      }
    }
    if (coveredMs / totalMs >= 0.9) {
      result.push(ns.index);
    }
  }

  return result;
}

/**
 * Snapshots all known sentence translations (both from `translationsCache` and
 * per-sentence `translations`) into a normalized-text lookup table so toggling
 * pacing modes restores matching translations in 0ms without AI calls or collisions.
 */
export function snapshotTranslationsByText(
  item: HistoryItem,
): Record<string, Record<string, string>> {
  const byText: Record<string, Record<string, string>> = {};

  if (item.translationsByText && typeof item.translationsByText === 'object') {
    for (const [lang, map] of Object.entries(item.translationsByText)) {
      if (!map || typeof map !== 'object') continue;
      byText[lang] = { ...map };
    }
  }

  const oldSentences = Array.isArray(item.sentences) ? item.sentences : [];
  const textByIndex = new Map<number, string>();
  for (const s of oldSentences) {
    if (s && Number.isFinite(Number(s.index)) && s.text) {
      textByIndex.set(Number(s.index), s.text);
    }
    if (s?.translations && typeof s.translations === 'object') {
      const norm = normalizeTranslationKey(s.text);
      if (!norm) continue;
      for (const [lang, val] of Object.entries(s.translations)) {
        if (typeof val === 'string' && val.trim()) {
          if (!byText[lang]) byText[lang] = {};
          byText[lang][norm] = val;
        }
      }
    }
  }

  if (item.translationsCache && typeof item.translationsCache === 'object') {
    for (const [lang, map] of Object.entries(item.translationsCache)) {
      if (!map || typeof map !== 'object') continue;
      for (const [idxKey, val] of Object.entries(map)) {
        if (typeof val !== 'string' || !val.trim()) continue;
        const sentText = textByIndex.get(Number(idxKey));
        if (!sentText) continue;
        const norm = normalizeTranslationKey(sentText);
        if (!norm) continue;
        if (!byText[lang]) byText[lang] = {};
        byText[lang][norm] = val;
      }
    }
  }

  return byText;
}

/**
 * Rebuilds `translationsCache` and per-sentence `translations` strictly for
 * exact normalized text matches in `translationsByText`.
 */
export function restoreExactTranslations(
  nextSentences: SentenceItem[],
  translationsByText: Record<string, Record<string, string>>,
): Record<string, Record<number, string>> {
  const nextCache: Record<string, Record<number, string>> = {};
  const langs = Object.keys(translationsByText || {});
  if (langs.length === 0) return nextCache;

  for (const lang of langs) {
    const dict = translationsByText[lang];
    if (!dict || typeof dict !== 'object') continue;
    const langCache: Record<number, string> = {};
    for (const s of nextSentences) {
      const norm = normalizeTranslationKey(s.text);
      const hit = norm ? dict[norm] : undefined;
      if (typeof hit === 'string' && hit.trim()) {
        langCache[s.index] = hit;
        if (!s.translations) s.translations = {};
        s.translations[lang] = hit;
      }
    }
    if (Object.keys(langCache).length > 0) {
      nextCache[lang] = langCache;
    }
  }

  return nextCache;
}

/**
 * Splits complete canonical grammatical sentences into `pacingMode` slices while
 * preserving exact word timestamps and zero mid-word cuts.
 */
function splitCanonicalSentencesByPacing(
  canonicalSentences: TranscriptSentence[],
  pacingMode: MediaHubPacingMode,
): TranscriptSentence[] {
  // Normalize flat canonical word intervals first so legacy cached lessons heal any historical overlaps
  const canonicalWordCounts = canonicalSentences.map((c) => (Array.isArray(c.words) ? c.words.length : 0));
  const flatCleanWords = enforceNonOverlappingWordTimings(
    canonicalSentences.flatMap((c) => (Array.isArray(c.words) ? c.words : [])),
  );
  let flatOffset = 0;

  const nextSentences: TranscriptSentence[] = [];

  for (let cIdx = 0; cIdx < canonicalSentences.length; cIdx++) {
    const canon = canonicalSentences[cIdx];
    const count = canonicalWordCounts[cIdx];
    const words = count > 0 ? flatCleanWords.slice(flatOffset, flatOffset + count) : [];
    flatOffset += count;
    const wordSlices = words.length > 0 ? splitTimedWordsForShadowing(words, pacingMode) : [words];

    for (let sliceIdx = 0; sliceIdx < wordSlices.length; sliceIdx++) {
      const sliceWords = wordSlices[sliceIdx];
      const startMs =
        sliceWords.length > 0
          ? sliceWords[0].startMs
          : nextSentences[nextSentences.length - 1]?.endMs || canon.startMs || 0;
      const rawEndMs =
        sliceWords.length > 0
          ? sliceWords[sliceWords.length - 1].endMs
          : Math.max(startMs + 120, canon.endMs || startMs + 350);

      const sliceText =
        wordSlices.length === 1
          ? canon.text
          : sliceWords.map((w) => w.word).join(' ').replace(/\s+/g, ' ').trim();
      const rawWordsForSentence = sliceWords
        .map((w) => (w.repaired ? w.rawWord || '' : w.word))
        .filter(Boolean)
        .join(' ')
        .trim();
      const hasWordRepair = sliceWords.some((w) => w.repaired);
      const substantiveRepair = hasWordRepair || Boolean(canon.isOverlap);

      const nextIndex = nextSentences.length + 1;
      nextSentences.push({
        id: `s-${nextIndex}`,
        index: nextIndex,
        text: sliceText || canon.text,
        rawText: rawWordsForSentence || sliceText || canon.rawText || canon.text,
        speakerId: canon.speakerId || 'spk_1',
        speaker: canon.speaker || 'Speaker 1',
        repaired: substantiveRepair,
        repairNote: substantiveRepair
          ? canon.repairNote ||
            (canon.isOverlap
              ? 'Separated overlapping speaker turn'
              : 'Corrected ASR transcription wording')
          : '',
        isOverlap: Boolean(canon.isOverlap),
        isInterrupted: Boolean(canon.isInterrupted),
        paragraphIndex: canon.paragraphIndex || 0,
        ideaIndex: canon.ideaIndex || 0,
        startMs,
        endMs: Math.max(startMs + 80, rawEndMs),
        startSec: roundMs(startMs / 1000),
        endSec: roundMs(Math.max(startMs + 80, rawEndMs) / 1000),
        words: sliceWords,
      });
    }
  }

  applyPlaybackBoundaryLaw(nextSentences);
  return nextSentences;
}

function buildLegacyTimedWordsForSentence(s: SentenceItem, startWordIndex: number): TimedWordMs[] {
  if (Array.isArray(s.words) && s.words.length > 0) {
    return s.words.map((w, offset) => ({
      ...w,
      i: typeof w.i === 'number' && Number.isFinite(w.i) ? w.i : startWordIndex + offset,
      clean: w.clean || normalizeAlignToken(w.word),
      startMs: Math.max(0, Math.round(w.startMs)),
      endMs: Math.max(Math.round(w.startMs) + 60, Math.round(w.endMs)),
    }));
  }

  const tokens = tokenizeDisplayWords(s.text);
  if (tokens.length === 0) return [];
  const startMs = Math.max(
    0,
    Math.round(typeof s.startMs === 'number' ? s.startMs : (Number(s.startSec) || 0) * 1000),
  );
  const endMs = Math.max(
    startMs + tokens.length * 80,
    Math.round(typeof s.endMs === 'number' ? s.endMs : (Number(s.endSec) || 0) * 1000),
  );
  const spanMs = Math.max(120, endMs - startMs);
  const weights = tokens.map((t) => Math.max(2, normalizeAlignToken(t).length || 2));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let cursor = startMs;
  return tokens.map((tok, idx) => {
    const share = Math.max(40, Math.round((weights[idx] / totalWeight) * spanMs));
    const wordEnd = idx === tokens.length - 1 ? Math.max(cursor + 40, endMs) : cursor + share;
    const item: TimedWordMs = {
      i: startWordIndex + idx,
      word: tok,
      clean: normalizeAlignToken(tok),
      startMs: cursor,
      endMs: wordEnd,
    };
    cursor = wordEnd;
    return item;
  });
}

function mapTranscriptSentencesToItems(sentences: TranscriptSentence[]): SentenceItem[] {
  return sentences.map((s) => ({
    id: `s-${s.index}`,
    index: s.index,
    timeRange: `${formatTimestampMs(s.startSec)} - ${formatTimestampMs(s.endSec)}`,
    startSec: s.startSec,
    endSec: s.endSec,
    startMs: s.startMs,
    endMs: s.endMs,
    durationSec: Math.max(0.1, Number((s.endSec - s.startSec).toFixed(3))),
    text: s.text,
    rawText: s.rawText,
    speakerId: s.speakerId,
    speaker: s.speaker,
    repaired: s.repaired,
    repairNote: s.repairNote,
    isOverlap: s.isOverlap,
    paragraphIndex: s.paragraphIndex,
    ideaIndex: s.ideaIndex,
    words: s.words,
    highlightedHtml: escapeTranscriptHtml(s.text),
  }));
}

function mapTranscriptParagraphsToChunks(paragraphs: TranscriptParagraph[]): ChunkItem[] {
  return paragraphs.map((p) => ({
    index: p.index,
    timeRange: `${formatTimestampMs(p.startSec)} - ${formatTimestampMs(p.endSec)}`,
    startSec: p.startSec,
    endSec: p.endSec,
    sentenceIndices: p.sentenceIndices,
    speakerId: p.speakerId,
    speaker: p.speaker,
    text: p.text,
    highlightedHtml: escapeTranscriptHtml(p.text),
  }));
}

/**
 * Deterministically re-segments any Media Hub lesson in-memory (< 15ms, ZERO AI calls,
 * ZERO media re-extraction) into the requested `pacingMode` (`short` | `normal`).
 *
 * Handles all 4 lesson states seamlessly:
 * 1. AI-reviewed with `reviewed.canonicalSentences`
 * 2. Cached AI-reviewed without `canonicalSentences` (reconstructs & caches canonical sentences)
 * 3. Raw lesson with `transcriptData.raw.words` (keeps `raw.words` untouched)
 * 4. Legacy lesson without `transcriptData`
 */
export function regroupMediaHubLessonByPacing(
  item: HistoryItem,
  requestedPacingMode: MediaHubPacingMode,
): HistoryItem {
  const mode = normalizePacingMode(requestedPacingMode);
  const oldSentences = Array.isArray(item.sentences) ? item.sentences : [];

  // 1. Snapshot translations & completion coverage before mutating sentences
  const translationsByText = snapshotTranslationsByText(item);
  const oldProgress: LessonCompletionProgress =
    item.completionProgress && typeof item.completionProgress === 'object'
      ? item.completionProgress
      : {};
  const shadowCoverage = captureCompletedCoverage(oldSentences, oldProgress.sentences);
  const listenCoverage = captureCompletedCoverage(oldSentences, oldProgress.listen);

  const td = item.transcriptData;
  let nextSentenceItems: SentenceItem[] = [];
  let nextChunks: ChunkItem[] = [];

  if (td?.reviewed && Array.isArray(td.reviewed.sentences) && td.reviewed.sentences.length > 0) {
    // Path 1 & 2: AI-reviewed lesson
    const reviewed = td.reviewed;
    const canonical =
      Array.isArray(reviewed.canonicalSentences) && reviewed.canonicalSentences.length > 0
        ? reviewed.canonicalSentences
        : coalesceToCanonicalSentences(reviewed.sentences, td.raw?.words);
    reviewed.canonicalSentences = canonical;

    const nextReviewedSentences = splitCanonicalSentencesByPacing(canonical, mode);
    const nextParagraphs = buildParagraphsFromSentences(nextReviewedSentences, mode);

    const draftIdeas: DraftReviewedIdea[] = (reviewed.ideas || []).map((idea) => ({
      index: idea.index,
      title: idea.title,
      summary: idea.summary,
      keyTakeaway: idea.keyTakeaway,
    }));
    const nextIdeas = buildIdeasFromSentences(nextReviewedSentences, draftIdeas);

    const originalById = new Map<string, string>();
    const colorById = new Map<string, number>();
    (reviewed.speakers || []).forEach((sp, idx) => {
      originalById.set(sp.id, sp.originalLabel || sp.name);
      colorById.set(sp.id, typeof sp.colorIndex === 'number' ? sp.colorIndex : idx % 6);
    });
    const { speakers, speakerTurns } = buildSpeakerViews(
      nextReviewedSentences,
      originalById,
      colorById,
    );

    reviewed.sentences = nextReviewedSentences;
    reviewed.paragraphs = nextParagraphs;
    reviewed.ideas = nextIdeas;
    reviewed.speakers = speakers;
    reviewed.speakerTurns = speakerTurns;
    if (reviewed.quality) {
      reviewed.quality.repairedSentences = nextReviewedSentences.filter((s) => s.repaired).length;
      reviewed.quality.overlapsResolved = nextReviewedSentences.filter((s) => s.isOverlap).length;
      reviewed.quality.multiSpeaker = speakers.length > 1;
    }

    if (td.speakerOverrides && Object.keys(td.speakerOverrides).length > 0) {
      applySpeakerOverridesToReviewed(reviewed, td.speakerOverrides);
    }

    nextSentenceItems = mapTranscriptSentencesToItems(reviewed.sentences);
    nextChunks = mapTranscriptParagraphsToChunks(reviewed.paragraphs);
  } else if (td?.raw && Array.isArray(td.raw.words) && td.raw.words.length > 0) {
    // Path 3: Raw lesson with untouched `raw.words` (reuses unified canonical-first segmentation)
    const raw = td.raw;
    const {
      canonicalSentences: rawCanon,
      sentences: rawSentences,
      paragraphs: rawParagraphs,
    } = buildRawSentencesAndParagraphsFromWords({
      rawWords: raw.words,
      creator: item.creator,
      pacingMode: mode,
    });

    raw.canonicalSentences = rawCanon;
    raw.sentences = rawSentences;
    raw.paragraphs = rawParagraphs;

    nextSentenceItems = mapTranscriptSentencesToItems(rawSentences);
    nextChunks = mapTranscriptParagraphsToChunks(rawParagraphs);
  } else {
    // Path 4: Legacy lesson without `transcriptData` (or empty `raw.words`)
    let wordCounter = 0;
    const legacyTranscriptSentences: TranscriptSentence[] = oldSentences.map((s, idx) => {
      const words = buildLegacyTimedWordsForSentence(s, wordCounter);
      wordCounter += words.length;
      const startMs =
        words.length > 0
          ? words[0].startMs
          : Math.max(0, Math.round(typeof s.startMs === 'number' ? s.startMs : (Number(s.startSec) || 0) * 1000));
      const endMs =
        words.length > 0
          ? Math.max(startMs + 80, words[words.length - 1].endMs)
          : Math.max(startMs + 80, Math.round(typeof s.endMs === 'number' ? s.endMs : (Number(s.endSec) || 0) * 1000));
      return {
        id: s.id || `legacy-s-${idx + 1}`,
        index: idx + 1,
        text: s.text,
        rawText: s.rawText || s.text,
        speakerId: s.speakerId || 'spk_1',
        speaker: s.speaker || item.creator || 'Speaker 1',
        repaired: Boolean(s.repaired),
        repairNote: s.repairNote || '',
        isOverlap: Boolean(s.isOverlap),
        paragraphIndex: Number(s.paragraphIndex) > 0 ? Math.floor(Number(s.paragraphIndex)) : 0,
        ideaIndex: Number(s.ideaIndex) > 0 ? Math.floor(Number(s.ideaIndex)) : 1,
        startMs,
        endMs,
        startSec: roundMs(startMs / 1000),
        endSec: roundMs(endMs / 1000),
        words,
      };
    });

    const canonical = coalesceToCanonicalSentences(legacyTranscriptSentences);
    const nextLegacySentences = splitCanonicalSentencesByPacing(canonical, mode);
    const hasExplicitParas = nextLegacySentences.some((s) => s.paragraphIndex > 0);

    if (hasExplicitParas) {
      const nextParas = buildParagraphsFromSentences(nextLegacySentences, mode);
      nextSentenceItems = mapTranscriptSentencesToItems(nextLegacySentences);
      nextChunks = mapTranscriptParagraphsToChunks(nextParas);
    } else {
      nextSentenceItems = mapTranscriptSentencesToItems(nextLegacySentences);
      nextChunks = segmentParagraphs(nextSentenceItems);
      const paraBySent = new Map<number, number>();
      nextChunks.forEach((c, cIdx) => {
        (c.sentenceIndices || []).forEach((sIdx) => paraBySent.set(sIdx, cIdx + 1));
      });
      nextSentenceItems.forEach((s) => {
        s.paragraphIndex = paraBySent.get(s.index) || 1;
      });
    }
  }

  // 2. Restore exact-text translations with zero wrong-sentence collisions
  const nextTranslationsCache = restoreExactTranslations(nextSentenceItems, translationsByText);

  // 3. Remap completion progress strictly under Real Derived Completion Law
  const nextCompletionProgress: LessonCompletionProgress = {
    ...oldProgress,
    sentences: remapCompletedIndices(shadowCoverage, nextSentenceItems),
    listen: remapCompletedIndices(listenCoverage, nextSentenceItems),
  };

  // 4. Commit updated state onto item
  item.sentences = nextSentenceItems;
  item.chunks = nextChunks;
  item.sentencesCount = nextSentenceItems.length;
  item.chunksCount = nextChunks.length;
  item.pacingMode = mode;
  item.translationsByText = translationsByText;
  item.translationsCache = nextTranslationsCache;
  item.completionProgress = nextCompletionProgress;
  if (item.transcriptData) {
    item.transcriptData.pacingMode = mode;
  }
  if (item.stats) {
    item.stats.sentencesCount = nextSentenceItems.length;
  }

  return item;
}
