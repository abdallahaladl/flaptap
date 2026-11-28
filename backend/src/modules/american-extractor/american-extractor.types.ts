import {
  SharedMediaKind,
  SharedSourceType,
  SourceSegment,
} from '../shared-sources/shared-sources.types';

/**
 * Anything to Phrases (American English Extractor) — shared backend contracts.
 *
 * One extraction guide is a resolved source (YouTube, video, audio, podcast,
 * social clip, article, PDF, text/Markdown, image OCR, saved lesson, or shared
 * Flaptap source) plus the source-grounded American English items extracted and
 * validated for it.
 */

export type ExtractorSourceType = SharedSourceType;

export type ExtractorInputKind = 'url' | 'text' | 'upload' | 'lesson' | 'source';

export type CoreExtractorCategory =
  | 'pattern'
  | 'vocabulary'
  | 'idiom'
  | 'phrasal_verb'
  | 'collocation'
  | 'slang'
  | 'conversational_expression'
  | 'grammar_structure'
  | 'discourse_marker'
  | 'filler'
  | 'interjection'
  | 'contraction_reduction'
  | 'metaphor_figurative'
  | 'cultural_reference'
  | 'pragmatics_context'
  | 'native_response'
  | 'key_sentence';

export type AudioExtractorCategory =
  | 'connected_speech'
  | 'pronunciation_phonetics'
  | 'word_sentence_stress'
  | 'linking_sound_changes';

export type ExtractorItemCategory = CoreExtractorCategory | AudioExtractorCategory;

export type ExtractionTypeId = 'all' | 'phrases' | ExtractorItemCategory;

export type ExtractionStageId =
  | 'detecting'
  | 'resolving'
  | 'cleaning'
  | 'chunking'
  | 'extracting'
  | 'grounding'
  | 'saving';

export interface ExtractionStageEvent {
  stage: ExtractionStageId;
  label: string;
  detail?: string;
  progress: number;
  chunkIndex?: number;
  totalChunks?: number;
}

export interface ExtractionSourceReadyEvent {
  title: string;
  creator: string;
  sourceType: ExtractorSourceType;
  sourceLabel: string;
  wordCount: number;
  truncated: boolean;
  chunkCount: number;
  cached?: boolean;
  hasAudio?: boolean;
  hasVideo?: boolean;
}

export interface ExtractionItemPreviewEvent {
  term: string;
  category: ExtractorItemCategory;
  ipa?: string;
  cefr?: string;
  meaning?: string;
  count: number;
}

export interface ExtractionProgressHooks {
  signal?: AbortSignal;
  onStage?: (event: ExtractionStageEvent) => void;
  onSourceReady?: (event: ExtractionSourceReadyEvent) => void;
  onItemPreview?: (event: ExtractionItemPreviewEvent) => void;
}

export interface ExtractorItem {
  index: number;
  term: string;
  surface: string;
  category: ExtractorItemCategory;
  partOfSpeech?: string;
  register: string;
  ipa: string;
  cefr?: string;
  frequency?: string;
  meaning: string;
  localizedMeaning: string;
  generalMeaning?: string;
  contextSentence: string;
  contextTranslation?: string;
  usageNote: string;
  spokenNote: string;
  example: string;
  exampleTranslation?: string;
  techNote?: string;
  tags?: string[];
  /** 1-based Media Hub Studio sentence index when grounded in a lesson transcript. */
  sentenceIndex?: number;
  /** Exact millisecond-accurate playback boundaries in source audio/video when available. */
  startSec?: number;
  endSec?: number;
  /** Exact word-level millisecond boundaries for the phrase/word itself inside the sentence. */
  phraseStartSec?: number;
  phraseEndSec?: number;
  grounded: boolean;
}

export interface ExtractorCompletionProgress {
  items?: number[];
}

export interface ExtractionMediaInfo {
  hasAudio: boolean;
  hasVideo: boolean;
  mediaKind: SharedMediaKind;
  mediaId: string;
  durationSeconds: number;
  streamUrl?: string;
}

export interface ExtractionResult {
  id: string;
  sourceId?: string;
  title: string;
  creator: string;
  summary: string;
  speakerStyle: string;
  sourceType: ExtractorSourceType;
  sourceUrl: string;
  sourceLabel: string;
  sourceMeta: Record<string, any>;
  media?: ExtractionMediaInfo;
  targetLanguage: string;
  targetLanguageName: string;
  rtl: boolean;
  agentUsed: string;
  modelUsed: string;
  reasoningLevel: string;
  executionTimeMs: number;
  fallbackFrom?: string;
  cached?: boolean;
  itemCount: number;
  items: ExtractorItem[];
  sourceText: string;
  isCompleted: boolean;
  completionProgress: ExtractorCompletionProgress;
  createdAt: string;
  updatedAt?: string;
}

export interface ExtractionHistoryItem {
  id: string;
  source_id?: string;
  title: string;
  creator: string;
  summary: string;
  source_type: ExtractorSourceType;
  source_url: string;
  source_label: string;
  target_language: string;
  agent_name: string;
  model_name: string;
  reasoning_level: string;
  item_count: number;
  execution_time_ms: number;
  is_completed: number;
  /** How many extracted items the user has marked studied. */
  completed_count: number;
  created_at: string;
  updated_at?: string;
}

export type HistoryStatusFilter = 'all' | 'new' | 'progress' | 'done';
export type HistorySortBy = 'newest' | 'oldest' | 'title' | 'items' | 'progress';

export interface ListHistoryQuery {
  q?: string;
  sourceType?: string;
  status?: HistoryStatusFilter;
  sort?: HistorySortBy;
  page?: number;
  limit?: number;
}

export interface UploadedFileInput {
  buffer: Buffer;
  originalName: string;
  mimeType?: string;
}

export interface PaginatedHistoryResult {
  items: ExtractionHistoryItem[];
  total: number;
  filteredTotal: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
  stats: {
    totalGuides: number;
    totalItems: number;
    completedGuides: number;
    inProgressGuides: number;
  };
}

export interface TimedSentenceWord {
  word: string;
  clean: string;
  startMs: number;
  endMs: number;
}

export interface TimedSentenceAnchor {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
  words?: TimedSentenceWord[];
}

export interface ResolvedSource {
  sourceId?: string;
  sourceKey?: string;
  title: string;
  creator: string;
  sourceType: ExtractorSourceType;
  sourceUrl: string;
  sourceLabel: string;
  text: string;
  hasAudio?: boolean;
  hasVideo?: boolean;
  mediaKind?: SharedMediaKind;
  mediaId?: string;
  durationSeconds?: number;
  segments?: SourceSegment[];
  timedSentences?: TimedSentenceAnchor[];
  needsContextualTitle?: boolean;
  submittedFileNames?: string[];
  sourceMeta: Record<string, any>;
  warnings: string[];
  truncated: boolean;
}

export interface ExtractionCategoryMetadata {
  id: ExtractorItemCategory | 'all';
  label: string;
  hint: string;
  group?: 'all' | 'core' | 'audio';
  audioDependent?: boolean;
}

export interface ExtractionFocusOption {
  id: string;
  label: string;
  shortLabel?: string;
  prompt: string;
  group?: 'all' | 'core' | 'audio';
  audioDependent?: boolean;
}

export interface ExtractorConfig {
  categories: ExtractionCategoryMetadata[];
  focuses: ExtractionFocusOption[];
  extractionTypes: ExtractionFocusOption[];
  styles: ExtractionFocusOption[];
  levels: ExtractionFocusOption[];
  depths: ExtractionFocusOption[];
  studyGoals: ExtractionFocusOption[];
  orders: ExtractionFocusOption[];
  defaultModel: string;
  defaultVariant: string;
  maxUploadMb: number;
  maxImagesPerUpload: number;
  maxImageMb: number;
  acceptedUploadTypes: string[];
  aiConfigured: boolean;
}
