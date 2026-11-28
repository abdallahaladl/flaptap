import { TimedWord, TranscriptCue } from '../transcript.service';

export interface ParsedManualTranscript {
  format: 'srt' | 'vtt' | 'timestamped' | 'plain';
  fullText: string;
  cues: TranscriptCue[];
  timedWords: TimedWord[];
  estimatedDurationSec: number;
}

function cleanToken(word: string): string {
  return String(word || '').replace(/^[^\w']+|[^\w']+$/g, '').toLowerCase();
}

function formatClock(sec: number): string {
  const safe = Math.max(0, Number(sec) || 0);
  const mins = Math.floor(safe / 60);
  const rem = safe - mins * 60;
  return `${String(mins).padStart(2, '0')}:${rem.toFixed(3).padStart(6, '0')}`;
}

function parseTimestampToken(raw: string): number {
  const clean = String(raw || '').trim().replace(',', '.');
  const parts = clean.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

function stripTagsAndSpaces(raw: string): string {
  return String(raw || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u200b|\ufeff/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitIntoSpeechChunks(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const blocks = normalized
    .split(/\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const block of blocks) {
    const sentences = block.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    for (const sent of sentences) {
      chunks.push(sent);
    }
  }
  return chunks;
}

function interpolateWordsForCues(cues: TranscriptCue[]): TimedWord[] {
  const timedWords: TimedWord[] = [];
  for (let cIdx = 0; cIdx < cues.length; cIdx++) {
    const cue = cues[cIdx];
    const tokens = cue.text.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const startSec = Number(cue.start_sec) || 0;
    const endSec = Math.max(startSec + 0.2, Number(cue.end_sec) || startSec + tokens.length * 0.36);
    const totalWeight = tokens.reduce((sum, tok) => sum + Math.max(2, tok.length), 0);
    let cursor = startSec;
    const span = endSec - startSec;

    for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
      const tok = tokens[tIdx];
      const weight = Math.max(2, tok.length) / Math.max(1, totalWeight);
      const wStart = Number(cursor.toFixed(3));
      cursor += span * weight;
      const wEnd = tIdx === tokens.length - 1 ? Number(endSec.toFixed(3)) : Number(cursor.toFixed(3));
      timedWords.push({
        word: tok,
        clean: cleanToken(tok),
        start_sec: wStart,
        end_sec: Math.max(wStart + 0.06, wEnd),
        cue_index: cIdx,
        cue_end: tIdx === tokens.length - 1,
      });
    }
  }
  return timedWords;
}

/**
 * Deterministically parses pasted SRT, WebVTT, `[mm:ss]` timestamped notes, or
 * plain English transcript text into millisecond-ready cues & timed words (0ms AI, 0% CPU).
 */
export function parseManualTranscriptInput(
  rawText: string,
  fallbackDurationSeconds = 0,
): ParsedManualTranscript {
  const raw = String(rawText || '').replace(/\r\n?/g, '\n').trim();
  if (!raw) {
    throw new Error('Paste transcript text, SRT, or WebVTT content first.');
  }

  const rangeRe =
    /((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})/;

  // 1. Detect SRT / WebVTT cue blocks
  if (rangeRe.test(raw)) {
    const isVtt = /^WEBVTT\b/i.test(raw);
    const lines = raw.split('\n');
    const cues: TranscriptCue[] = [];
    let currentRange: { startSec: number; endSec: number } | null = null;
    let buf: string[] = [];

    const flush = () => {
      if (!currentRange || buf.length === 0) return;
      const text = stripTagsAndSpaces(buf.join(' '));
      if (text) {
        const startSec = Number(currentRange.startSec.toFixed(3));
        const endSec = Number(Math.max(startSec + 0.25, currentRange.endSec).toFixed(3));
        cues.push({
          start: formatClock(startSec),
          end: formatClock(endSec),
          start_sec: startSec,
          end_sec: endSec,
          text,
        });
      }
      buf = [];
    };

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        flush();
        currentRange = null;
        continue;
      }
      if (/^(WEBVTT|Kind:|Language:|NOTE\b|STYLE\b)/i.test(trimmed)) {
        continue;
      }
      const m = trimmed.match(rangeRe);
      if (m) {
        flush();
        currentRange = {
          startSec: parseTimestampToken(m[1]),
          endSec: parseTimestampToken(m[2]),
        };
        continue;
      }
      if (!currentRange && /^\d+$/.test(trimmed)) {
        continue;
      }
      if (currentRange) {
        buf.push(trimmed);
      }
    }
    flush();

    if (cues.length > 0) {
      const fullText = cues.map((c) => c.text).join(' ').replace(/\s+/g, ' ').trim();
      return {
        format: isVtt ? 'vtt' : 'srt',
        fullText,
        cues,
        timedWords: interpolateWordsForCues(cues),
        estimatedDurationSec: Math.ceil(cues[cues.length - 1].end_sec),
      };
    }
  }

  // 2. Detect line-leading timestamps: `[00:12] text` or `0:12 text`
  const lineTsRe = /^[\[(]?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)[\])]?\s+(.+)$/;
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const tsEntries = lines
    .map((l) => {
      const m = l.match(lineTsRe);
      if (!m) return null;
      return { startSec: parseTimestampToken(m[1]), text: stripTagsAndSpaces(m[2]) };
    })
    .filter((entry): entry is { startSec: number; text: string } => Boolean(entry && entry.text));

  if (tsEntries.length >= 2 && tsEntries.length >= Math.floor(lines.length * 0.5)) {
    const cues: TranscriptCue[] = tsEntries.map((entry, idx) => {
      const startSec = Number(entry.startSec.toFixed(3));
      const wordCount = Math.max(1, entry.text.split(/\s+/).filter(Boolean).length);
      const nextStart = idx + 1 < tsEntries.length ? tsEntries[idx + 1].startSec : 0;
      const estimatedEnd = startSec + Math.max(1.2, wordCount * 0.42);
      const endSec = Number(
        (nextStart > startSec + 0.15 ? Math.min(nextStart, estimatedEnd) : estimatedEnd).toFixed(3),
      );
      return {
        start: formatClock(startSec),
        end: formatClock(endSec),
        start_sec: startSec,
        end_sec: endSec,
        text: entry.text,
      };
    });

    const fullText = cues.map((c) => c.text).join(' ').replace(/\s+/g, ' ').trim();
    return {
      format: 'timestamped',
      fullText,
      cues,
      timedWords: interpolateWordsForCues(cues),
      estimatedDurationSec: Math.ceil(cues[cues.length - 1].end_sec),
    };
  }

  // 3. Plain text transcript -> sequential conversational pacing (~145 WPM, or scaled to video duration)
  const speechChunks = splitIntoSpeechChunks(stripTagsAndSpaces(raw.replace(/\n+/g, '\n')));
  const wordsTotal = speechChunks.reduce(
    (sum, c) => sum + c.split(/\s+/).filter(Boolean).length,
    0,
  );
  if (wordsTotal === 0) {
    throw new Error('Could not find any spoken English words in the pasted transcript.');
  }

  const defaultRateSecPerWord = 60 / 145; // ~0.414s per word
  const rawTotalDuration = wordsTotal * defaultRateSecPerWord;
  const targetTotalSec =
    fallbackDurationSeconds > 5 && rawTotalDuration > 1
      ? Math.max(10, fallbackDurationSeconds)
      : Math.max(3, rawTotalDuration);
  const secPerWord = targetTotalSec / wordsTotal;

  const cues: TranscriptCue[] = [];
  let cursorSec = 0;
  for (const chunk of speechChunks) {
    const wCount = Math.max(1, chunk.split(/\s+/).filter(Boolean).length);
    const startSec = Number(cursorSec.toFixed(3));
    const duration = Math.max(0.45, wCount * secPerWord);
    cursorSec += duration;
    const endSec = Number(cursorSec.toFixed(3));
    cues.push({
      start: formatClock(startSec),
      end: formatClock(endSec),
      start_sec: startSec,
      end_sec: endSec,
      text: chunk,
    });
  }

  const fullText = cues.map((c) => c.text).join(' ').replace(/\s+/g, ' ').trim();
  return {
    format: 'plain',
    fullText,
    cues,
    timedWords: interpolateWordsForCues(cues),
    estimatedDurationSec: Math.ceil(cursorSec),
  };
}
