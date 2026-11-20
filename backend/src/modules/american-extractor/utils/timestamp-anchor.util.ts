import { SourceSegment } from '../../shared-sources/shared-sources.types';
import { ExtractorItem } from '../american-extractor.types';
import { normalizeTermKey } from './source-text.util';

const TIMESTAMP_LINE_RE =
  /^\s*(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

function parseCueSeconds(
  hoursPart: string | undefined,
  mins: string,
  secs: string,
  ms: string,
): number {
  const h = hoursPart ? parseInt(hoursPart.replace(':', ''), 10) || 0 : 0;
  const m = parseInt(mins, 10) || 0;
  const s = parseInt(secs, 10) || 0;
  const millis = parseInt(ms.padEnd(3, '0').slice(0, 3), 10) || 0;
  return roundMs(h * 3600 + m * 60 + s + millis / 1000);
}

function roundMs(value: number): number {
  return Math.round(Math.max(0, Number(value) || 0) * 1000) / 1000;
}

/**
 * Parses SRT or WebVTT subtitle text into millisecond-accurate segments.
 */
export function parseSubtitleSegments(raw: string): SourceSegment[] {
  const lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n');
  const segments: SourceSegment[] = [];
  let i = 0;

  while (i < lines.length) {
    const match = TIMESTAMP_LINE_RE.exec(lines[i] || '');
    if (!match) {
      i++;
      continue;
    }

    const startSec = parseCueSeconds(match[1], match[2], match[3], match[4]);
    const endSec = parseCueSeconds(match[5], match[6], match[7], match[8]);
    i++;

    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !TIMESTAMP_LINE_RE.test(lines[i])) {
      textLines.push(lines[i].replace(/<[^>]+>/g, '').trim());
      i++;
    }

    const text = textLines.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (text && endSec > startSec) {
      segments.push({ startSec, endSec, text });
    }
  }

  return segments;
}

function tokenizeWords(text: string): string[] {
  return normalizeTermKey(text)
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length >= 2);
}

function tokenOverlapScore(needleTokens: string[], segTokens: Set<string>): number {
  if (needleTokens.length === 0 || segTokens.size === 0) return 0;
  let hits = 0;
  for (const token of needleTokens) {
    if (segTokens.has(token)) hits++;
  }
  return hits / needleTokens.length;
}

/**
 * Deterministically anchors each extracted item to its exact millisecond
 * `[startSec, endSec]` window in the source transcript's timed segments.
 *
 * Uses normalized verbatim context matching first, then 2-segment sliding
 * windows (for sentences split across two Whisper/caption cues), then
 * direct surface/term matching with position proximity tie-breaking.
 */
export function anchorItemsToSegments(
  items: ExtractorItem[],
  segments: SourceSegment[],
  sourceText = '',
): ExtractorItem[] {
  if (!Array.isArray(items) || items.length === 0) return items;
  if (!Array.isArray(segments) || segments.length === 0) return items;

  const prepared = segments
    .map((seg, idx) => {
      const startSec = roundMs(Number(seg.startSec) || 0);
      const endSec = roundMs(Math.max(startSec + 0.25, Number(seg.endSec) || startSec + 1));
      const norm = normalizeTermKey(seg.text);
      return {
        idx,
        startSec,
        endSec,
        norm,
        tokens: new Set(tokenizeWords(seg.text)),
      };
    })
    .filter((seg) => seg.norm.length > 0);

  if (prepared.length === 0) return items;

  const normSource = normalizeTermKey(sourceText);
  const totalSourceLen = Math.max(1, normSource.length);
  const lastEnd = prepared[prepared.length - 1].endSec;

  return items.map((item) => {
    const contextKey = normalizeTermKey(item.contextSentence || '');
    const surfaceKey = normalizeTermKey(item.surface || '');
    const termKey = normalizeTermKey(item.term || '');

    // Estimate relative position in transcript to break ties on repeated phrases
    let expectedRatio = -1;
    if (normSource) {
      const pos =
        (contextKey && normSource.indexOf(contextKey.slice(0, 60))) ||
        (surfaceKey && normSource.indexOf(surfaceKey)) ||
        (termKey && normSource.indexOf(termKey));
      if (typeof pos === 'number' && pos >= 0) {
        expectedRatio = pos / totalSourceLen;
      }
    }

    const pickByProximity = <T extends { idx: number; startSec: number; endSec: number }>(
      candidates: T[],
    ): T => {
      if (candidates.length === 1 || expectedRatio < 0) return candidates[0];
      let best = candidates[0];
      let bestDist = Infinity;
      for (const cand of candidates) {
        const ratio = cand.idx / Math.max(1, prepared.length - 1);
        const dist = Math.abs(ratio - expectedRatio);
        if (dist < bestDist) {
          bestDist = dist;
          best = cand;
        }
      }
      return best;
    };

    let matchedStart: number | null = null;
    let matchedEnd: number | null = null;

    // 1. Direct containment of surface or context inside a single segment
    const exactSingle = prepared.filter(
      (seg) =>
        (contextKey && contextKey.length >= 12 && (seg.norm.includes(contextKey) || contextKey.includes(seg.norm))) ||
        (surfaceKey && surfaceKey.length >= 3 && seg.norm.includes(surfaceKey)),
    );
    if (exactSingle.length > 0) {
      // If context matches a segment containing surface, strongly prefer that
      const bothMatch =
        contextKey && surfaceKey
          ? exactSingle.filter((seg) => seg.norm.includes(surfaceKey) && (contextKey.includes(seg.norm) || seg.norm.includes(contextKey.slice(0, 40))))
          : [];
      const chosen = pickByProximity(bothMatch.length > 0 ? bothMatch : exactSingle);
      matchedStart = chosen.startSec;
      matchedEnd = chosen.endSec;
    }

    // 2. Sliding 2-segment window when phrase/sentence straddles a cue boundary
    if (matchedStart === null && prepared.length > 1) {
      const pairCandidates: Array<{ idx: number; startSec: number; endSec: number }> = [];
      for (let i = 0; i < prepared.length - 1; i++) {
        const combined = `${prepared[i].norm} ${prepared[i + 1].norm}`;
        if (
          (surfaceKey && surfaceKey.length >= 3 && combined.includes(surfaceKey)) ||
          (termKey && termKey.length >= 3 && combined.includes(termKey))
        ) {
          pairCandidates.push({
            idx: i,
            startSec: prepared[i].startSec,
            endSec: prepared[i + 1].endSec,
          });
        }
      }
      if (pairCandidates.length > 0) {
        const chosen = pickByProximity(pairCandidates);
        matchedStart = chosen.startSec;
        matchedEnd = chosen.endSec;
      }
    }

    // 3. Direct term containment in single segment
    if (matchedStart === null && termKey && termKey.length >= 3) {
      const termMatches = prepared.filter((seg) => seg.norm.includes(termKey));
      if (termMatches.length > 0) {
        const chosen = pickByProximity(termMatches);
        matchedStart = chosen.startSec;
        matchedEnd = chosen.endSec;
      }
    }

    // 4. Token-overlap fallback against contextSentence (handles minor punctuation/ASR differences)
    if (matchedStart === null) {
      const needleTokens = tokenizeWords(item.contextSentence || item.surface || item.term);
      if (needleTokens.length >= 2) {
        let bestSeg: (typeof prepared)[number] | null = null;
        let bestScore = 0.45;
        for (const seg of prepared) {
          const score = tokenOverlapScore(needleTokens, seg.tokens);
          if (score > bestScore) {
            bestScore = score;
            bestSeg = seg;
          }
        }
        if (bestSeg) {
          matchedStart = bestSeg.startSec;
          matchedEnd = bestSeg.endSec;
        }
      }
    }

    if (matchedStart === null || matchedEnd === null) {
      return item;
    }

    // Add gentle natural release cushion (up to 250ms) bounded strictly within media duration
    const startSec = roundMs(Math.max(0, matchedStart - 0.08));
    const endSec = roundMs(Math.min(lastEnd + 0.25, Math.max(startSec + 0.5, matchedEnd + 0.2)));

    return {
      ...item,
      startSec,
      endSec,
    };
  });
}
