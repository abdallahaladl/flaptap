import { extractJsonBlock, repairAndParseJson } from '../../learning-library/utils/json-salvage.util';
import { TranscriptSentence } from './shadowing.types';
import { DraftReviewedIdea, DraftReviewedSentence } from './utils/word-alignment.util';

export interface TranscriptReviewChunk {
  chunkIndex: number;
  totalChunks: number;
  startSentenceIndex: number;
  endSentenceIndex: number;
  textWithTimestamps: string;
}

export interface ParsedReviewChunkOutput {
  sentences: DraftReviewedSentence[];
  ideas: DraftReviewedIdea[];
}

/**
 * Splits baseline sentences into bounded chunks (~1,100 words max per chunk)
 * so even 60-minute podcasts review rapidly without hitting token truncation.
 */
export function buildReviewChunks(
  rawSentences: TranscriptSentence[],
  maxWordsPerChunk = 1100,
): TranscriptReviewChunk[] {
  if (!rawSentences.length) return [];

  const groups: TranscriptSentence[][] = [];
  let current: TranscriptSentence[] = [];
  let currentWords = 0;

  for (const s of rawSentences) {
    const wc = Math.max(1, s.words.length || s.text.split(/\s+/).length);
    if (current.length > 0 && currentWords + wc > maxWordsPerChunk) {
      groups.push(current);
      current = [];
      currentWords = 0;
    }
    current.push(s);
    currentWords += wc;
  }
  if (current.length) groups.push(current);

  return groups.map((group, idx) => ({
    chunkIndex: idx + 1,
    totalChunks: groups.length,
    startSentenceIndex: group[0].index,
    endSentenceIndex: group[group.length - 1].index,
    textWithTimestamps: group
      .map((s) => `[${s.startSec.toFixed(2)}s] ${s.text}`)
      .join('\n'),
  }));
}

export function buildTranscriptReviewSystemPrompt(): string {
  return `You are an elite American English Broadcast Transcript Proofreader and Diarization Editor for a language learner training to think and speak spontaneously in natural American English.

CRITICAL VERBATIM LAW (PRIORITY #1):
1. PRESERVE THE SPEAKER'S EXACT VOICE, PHRASING & SPONTANEOUS THOUGHT FLOW. Keep natural spoken American English intact — contractions ("gonna", "wanna", "kinda", "y'all", "ain't"), conversational idioms, discourse markers ("like", "you know", "I mean", "right?"), slang, authentic syntax, AND authentic spoken self-corrections or false starts (use an em-dash "—", e.g., "I was gonna—actually, wait, let me back up" or "That's not—well, maybe it is"). NEVER formalize, sanitize into academic prose, paraphrase, summarize, or rewrite how the speaker naturally talks.
2. REPAIR ONLY REAL PROBLEMS:
   - Fix obvious ASR/auto-caption mishearings (especially technical/AI/programming terms, proper nouns, homophones like "pie torch" -> "PyTorch", "clod" -> "Claude", "their" -> "there" when clearly wrong).
   - Fix missing/broken punctuation, capitalization, and sentence boundaries.
   - COMPLETE GRAMMATICAL SENTENCES (CRITICAL): Output each entry in "sentences" as a clean, complete grammatical spoken sentence with authentic punctuation (commas, periods, question marks, exclamation marks, em-dashes). Do NOT artificially chop a grammatical sentence into fragments with fake periods — Flaptap's deterministic pacing engine dynamically groups your canonical sentences into Short, Balanced, and Full shadowing lines while preserving your exact punctuation, speakers, overlaps, interruptions, repairs, "paragraphIndex", and "ideaIndex".
   - RESOLVE MULTI-SPEAKER OVERLAPS & INTERRUPTIONS: If 2, 3, 4, or 5+ speakers are talking or interrupting each other and raw captions mashed their words together mid-sentence, separate each speaker's utterance into its own clean sentence entry in chronological order, mark "isOverlap": true on interrupted/overlapping interjections, and assign consistent speaker labels. Whenever a speaker was cut off mid-thought/mid-sentence by another speaker, end that cut-off line with an em-dash ("—") instead of a fake period and set "isInterrupted": true so learners never mistake broken crosstalk fragments for complete grammatical sentences.
   - IF A SENTENCE HAS NO ERROR, LEAVE EVERY WORD 100% IDENTICAL TO THE RAW INPUT (only fixing punctuation/capitalization if missing) and set "repaired": false.
3. SPEAKER ATTRIBUTION:
   - If solo creator/monologue: use the creator's real name (if clear from metadata) or "Speaker 1" consistently for every sentence.
   - If multi-speaker conversation/podcast/interview: identify each speaker consistently using real names if introduced/known from title/context (e.g., "Lex", "Sam"), otherwise "Host" / "Guest" or "Speaker 1" / "Speaker 2" / "Speaker 3".
4. STRUCTURING FOR ALL VIEWS:
   - Assign sequential "paragraphIndex" (1, 2, 3...) grouping 2-5 contiguous sentences that form one cohesive thought or speaker turn.
   - Group contiguous sentences into clear "ideas" (narrative beats / talking points) with concise title, 1-sentence summary, and 1-line practical keyTakeaway.
   - Every word from the raw transcript must be accounted for in order — NEVER drop sections or skip ahead.

OUTPUT FORMAT:
Return ONLY valid JSON with no markdown fences or extra prose:
{
  "sentences": [
    {
      "text": "Clean verbatim or minimally repaired single sentence.",
      "speaker": "Speaker Name",
      "repaired": false,
      "repairNote": "",
      "isOverlap": false,
      "isInterrupted": false,
      "paragraphIndex": 1,
      "ideaIndex": 1
    }
  ],
  "ideas": [
    {
      "index": 1,
      "title": "Short clear topic title (3-7 words)",
      "summary": "One concise sentence describing this talking point.",
      "keyTakeaway": "Key phrase or thought pattern to internalize."
    }
  ]
}`;
}

export function buildTranscriptReviewUserPrompt(params: {
  title: string;
  creator: string;
  platform: string;
  chunk: TranscriptReviewChunk;
  knownSpeakers?: string[];
  previousTail?: string;
}): string {
  const speakerHint = params.knownSpeakers?.length
    ? `Previously identified speakers in earlier part (reuse exact names for consistency): ${params.knownSpeakers.join(', ')}`
    : `Creator / Channel metadata: ${params.creator || 'Unknown'}`;

  const continuity = params.previousTail
    ? `\nContext from immediately preceding lines (DO NOT repeat these in output, only use for speaker/topic continuity):\n${params.previousTail}\n`
    : '';

  return `Media Title: ${params.title || 'Untitled Media'}
Platform: ${params.platform || 'Media'}
${speakerHint}
Chunk: ${params.chunk.chunkIndex} of ${params.chunk.totalChunks}${continuity}

Review the following raw timestamped transcript lines. Keep every clean spoken word verbatim, repair only genuine ASR errors / broken sentence boundaries / multi-speaker overlaps, and return strict JSON:

<raw_transcript>
${params.chunk.textWithTimestamps}
</raw_transcript>`;
}

export function parseTranscriptReviewResponse(rawOutput: string): ParsedReviewChunkOutput {
  const extracted = extractJsonBlock(rawOutput);
  let parsed: any = null;
  try {
    parsed = JSON.parse(extracted);
  } catch {
    parsed = repairAndParseJson(extracted);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI transcript review returned malformed JSON.');
  }

  const rawSentences = Array.isArray(parsed.sentences)
    ? parsed.sentences
    : Array.isArray(parsed)
      ? parsed
      : [];

  const sentences: DraftReviewedSentence[] = rawSentences
    .map((item: any) => ({
      text: String(item?.text || '').replace(/\s+/g, ' ').trim(),
      speaker: String(item?.speaker || '').replace(/\s+/g, ' ').trim(),
      repaired: Boolean(item?.repaired),
      repairNote: String(item?.repairNote || '').trim().slice(0, 140),
      isOverlap: Boolean(item?.isOverlap),
      isInterrupted: Boolean(item?.isInterrupted),
      paragraphIndex: Number(item?.paragraphIndex) > 0 ? Math.floor(Number(item.paragraphIndex)) : 0,
      ideaIndex: Number(item?.ideaIndex) > 0 ? Math.floor(Number(item.ideaIndex)) : 0,
    }))
    .filter((s: DraftReviewedSentence) => s.text.length > 0);

  if (sentences.length === 0) {
    throw new Error('AI transcript review returned zero sentences.');
  }

  const rawIdeas = Array.isArray(parsed.ideas) ? parsed.ideas : [];
  const ideas: DraftReviewedIdea[] = rawIdeas
    .map((idea: any, idx: number) => ({
      index: Number(idea?.index) > 0 ? Math.floor(Number(idea.index)) : idx + 1,
      title: String(idea?.title || '').trim().slice(0, 110),
      summary: String(idea?.summary || '').trim().slice(0, 260),
      keyTakeaway: String(idea?.keyTakeaway || '').trim().slice(0, 200),
      sentenceIndices: Array.isArray(idea?.sentenceIndices)
        ? idea.sentenceIndices.map((n: any) => Math.floor(Number(n))).filter((n: number) => n > 0)
        : undefined,
    }))
    .filter((idea: DraftReviewedIdea) => idea.title.length > 0);

  return { sentences, ideas };
}
