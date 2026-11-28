import { SharedMediaKind, SharedSourceType } from '../../shared-sources/shared-sources.types';
import type { MediaHubPacingMode } from '../../../core/linguistics/segmentation';

export type { MediaHubPacingMode };

export type TranscriptViewMode = 'sentences' | 'paragraphs' | 'ideas' | 'speakers' | 'raw';

export type TranscriptExportFormat = 'txt' | 'md' | 'srt' | 'vtt' | 'json' | 'csv' | 'html';

export type TranscriptReviewStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type TranscriptAvailabilityStatus =
  | 'ready'
  | 'rate_limited'
  | 'no_captions'
  | 'timeout'
  | 'pending';

export interface TimedWordMs {
  /** Global 0-based index within the active transcript word stream. */
  i: number;
  /** Display token preserving exact casing and punctuation. */
  word: string;
  /** Lowercased alphanumeric/apostrophe core for matching & search. */
  clean: string;
  /** Exact onset in integer milliseconds. */
  startMs: number;
  /** Exact offset in integer milliseconds. */
  endMs: number;
  /** True when the AI review layer repaired an ASR error on this token. */
  repaired?: boolean;
  /** Original raw ASR token before repair (when repaired === true). */
  rawWord?: string;
}

export interface RawCueMs {
  index: number;
  startMs: number;
  endMs: number;
  startSec: number;
  endSec: number;
  text: string;
}

export interface ReadingBookmark {
  sentenceIndex: number;
  startMs: number;
  view: 'reviewed' | 'raw';
  excerpt: string;
  updatedAt: string;
}

export interface MediaHubAskMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  selectedText?: string;
  startMs?: number;
  endMs?: number;
  speaker?: string;
  modelName?: string;
  createdAt: string;
}

export interface TranscriptSentence {
  id: string;
  /** 1-based sequential sentence index. */
  index: number;
  text: string;
  rawText: string;
  speakerId: string;
  speaker: string;
  repaired: boolean;
  repairNote: string;
  isOverlap: boolean;
  isInterrupted?: boolean;
  paragraphIndex: number;
  ideaIndex: number;
  startMs: number;
  endMs: number;
  startSec: number;
  endSec: number;
  words: TimedWordMs[];
}

export interface TranscriptParagraph {
  index: number;
  speakerId: string;
  speaker: string;
  sentenceIndices: number[];
  text: string;
  startMs: number;
  endMs: number;
  startSec: number;
  endSec: number;
}

export interface TranscriptIdea {
  index: number;
  title: string;
  summary: string;
  keyTakeaway: string;
  speakers: string[];
  sentenceIndices: number[];
  startMs: number;
  endMs: number;
  startSec: number;
  endSec: number;
}

export interface TranscriptSpeakerInfo {
  id: string;
  name: string;
  originalLabel: string;
  colorIndex: number;
  sentenceCount: number;
  wordCount: number;
  talkTimeMs: number;
}

export interface TranscriptSpeakerTurn {
  index: number;
  speakerId: string;
  speaker: string;
  colorIndex: number;
  sentenceIndices: number[];
  text: string;
  isOverlap: boolean;
  startMs: number;
  endMs: number;
  startSec: number;
  endSec: number;
}

export interface RawTranscriptSnapshot {
  provider: string;
  model: string;
  fullText: string;
  cues: RawCueMs[];
  words: TimedWordMs[];
  canonicalSentences?: TranscriptSentence[];
  sentences: TranscriptSentence[];
  paragraphs: TranscriptParagraph[];
  extractedAt: string;
}

export interface TranscriptQualityReport {
  totalWords: number;
  repairedWords: number;
  repairedSentences: number;
  overlapsResolved: number;
  verbatimScore: number;
  multiSpeaker: boolean;
  summary: string;
}

export interface ReviewedTranscriptSnapshot {
  /** Pre-split canonical grammatical sentences aligned to millisecond raw words. */
  canonicalSentences?: TranscriptSentence[];
  sentences: TranscriptSentence[];
  paragraphs: TranscriptParagraph[];
  ideas: TranscriptIdea[];
  speakers: TranscriptSpeakerInfo[];
  speakerTurns: TranscriptSpeakerTurn[];
  quality: TranscriptQualityReport;
  providerName: string;
  modelName: string;
  reasoningLevel: string;
  executionTimeMs: number;
  fallbackFrom?: string;
  reviewedAt: string;
}

export interface MediaHubMediaPlayback {
  hasAudio: boolean;
  hasVideo: boolean;
  mediaKind: SharedMediaKind;
  mediaId: string;
  streamUrl: string;
  mimeType: string;
  durationSeconds: number;
}

export interface MediaHubTranscriptData {
  sourceId?: string;
  sourceKey?: string;
  sourceType: SharedSourceType;
  platform: string;
  providerEngine: string;
  pacingMode?: MediaHubPacingMode;
  raw: RawTranscriptSnapshot;
  reviewed: ReviewedTranscriptSnapshot | null;
  reviewStatus: TranscriptReviewStatus;
  reviewError: string;
  transcriptStatus?: TranscriptAvailabilityStatus;
  transcriptError?: string;
  speakerOverrides: Record<string, string>;
  readingBookmark?: ReadingBookmark | null;
  askHistory?: MediaHubAskMessage[];
}

export interface ReviewProgressEvent {
  stage: 'preparing' | 'chunk' | 'aligning' | 'saving' | 'complete';
  percent: number;
  message: string;
  chunkIndex?: number;
  totalChunks?: number;
}

export interface ExportOptions {
  view: TranscriptViewMode;
  format: TranscriptExportFormat;
  includeTimestamps?: boolean;
  includeSpeakers?: boolean;
  includeRepairs?: boolean;
}

export interface ExportResult {
  content: string;
  mimeType: string;
  extension: string;
  filename: string;
}
