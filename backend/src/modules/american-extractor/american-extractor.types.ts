/**
 * American English Extractor — shared contracts.
 *
 * One extraction note is a source (video, social post, audio, article, file,
 * image, or saved lesson transcript) plus the high-value American English
 * items a model grounded in that source.
 */

export type ExtractorSourceType =
  | 'youtube'
  | 'social_video'
  | 'audio'
  | 'video'
  | 'article'
  | 'text'
  | 'markdown'
  | 'image'
  | 'lesson';

export type ExtractorInputKind = 'url' | 'text' | 'upload' | 'lesson';

export type ExtractorItemCategory =
  | 'idiom'
  | 'slang'
  | 'phrasal_verb'
  | 'vocabulary'
  | 'collocation'
  | 'connected_speech'
  | 'discourse_marker'
  | 'pattern';

export type ExtractionTypeId = 'all' | 'phrases' | ExtractorItemCategory;

export interface ExtractorItem {
  index: number;
  term: string;
  surface: string;
  category: ExtractorItemCategory;
  register: string;
  ipa: string;
  cefr?: string;
  frequency?: string;
  meaning: string;
  localizedMeaning: string;
  generalMeaning?: string;
  contextSentence: string;
  usageNote: string;
  spokenNote: string;
  example: string;
  techNote?: string;
  tags?: string[];
  grounded: boolean;
}

export interface ExtractorCompletionProgress {
  items?: number[];
}

export interface ExtractionResult {
  id: string;
  title: string;
  creator: string;
  summary: string;
  speakerStyle: string;
  sourceType: ExtractorSourceType;
  sourceUrl: string;
  sourceLabel: string;
  sourceMeta: Record<string, any>;
  targetLanguage: string;
  targetLanguageName: string;
  rtl: boolean;
  agentUsed: string;
  modelUsed: string;
  reasoningLevel: string;
  executionTimeMs: number;
  fallbackFrom?: string;
  itemCount: number;
  items: ExtractorItem[];
  sourceText: string;
  isCompleted: boolean;
  completionProgress: ExtractorCompletionProgress;
  createdAt: string;
}

export interface ExtractionHistoryItem {
  id: string;
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
}

export interface ResolvedSource {
  title: string;
  creator: string;
  sourceType: ExtractorSourceType;
  sourceUrl: string;
  sourceLabel: string;
  text: string;
  sourceMeta: Record<string, any>;
  warnings: string[];
  truncated: boolean;
}

export interface ExtractionCategoryMetadata {
  id: ExtractorItemCategory | 'all';
  label: string;
  hint: string;
}

export interface ExtractionFocusOption {
  id: string;
  label: string;
  shortLabel?: string;
  prompt: string;
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
  acceptedUploadTypes: string[];
  aiConfigured: boolean;
}
