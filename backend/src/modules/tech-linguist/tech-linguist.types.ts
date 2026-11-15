export type ExtractionModeId = 'comprehensive' | 'advanced_native';

export interface VocabItem {
  index: number;
  term: string;
  partOfSpeech: string;
  generalArabic?: string;
  meaningArabic: string;
  contextSentence: string;
  techCategory?: string;
}

export interface IdiomItem {
  index: number;
  phrase: string;
  category?: string;
  generalArabic?: string;
  meaningArabic: string;
  contextSentence: string;
  usageNote: string;
}

export interface ThoughtPatternItem {
  title: string;
  americanStyle: string;
  textbookContrast: string;
  mindsetNote: string;
}

export interface ExtractionModeTabConfig {
  id: 'vocab' | 'idioms' | 'patterns' | 'transcript';
  label: string;
  visible: boolean;
}

export interface ExtractionModeMetadata {
  id: ExtractionModeId;
  label: string;
  shortLabel: string;
  badgeText: string;
  description: string;
  tabs: ExtractionModeTabConfig[];
}

export interface ExtractionPromptContext {
  title: string;
  creator: string;
  sourceUrl: string;
  cleanedTranscript: string;
}

export interface NormalizedExtractionData {
  title: string;
  summary: string;
  vocabItems: VocabItem[];
  idiomItems: IdiomItem[];
  thoughtPatterns: ThoughtPatternItem[];
}

export type TechLexiconCompletionSubject = 'vocab' | 'idioms' | 'patterns' | 'transcript';

export interface TechLexiconCompletionProgress {
  vocab?: number[];
  idioms?: number[];
  patterns?: number[];
  transcript?: number[];
}

export interface ExtractionResultPayload {
  id: string;
  extractionMode: ExtractionModeId;
  title: string;
  summary: string;
  sourceUrl: string;
  creator: string;
  agentUsed: string;
  modelUsed: string;
  reasoningLevel: string;
  executionTimeMs: number;
  fallbackFrom?: string;
  vocabItems: VocabItem[];
  idiomItems: IdiomItem[];
  thoughtPatterns: ThoughtPatternItem[];
  fullTranscript: string;
  isCompleted?: boolean;
  completionProgress?: TechLexiconCompletionProgress;
  createdAt: string;
}

export interface ExtractionHistoryItem {
  id: string;
  extraction_mode: ExtractionModeId;
  title: string;
  creator: string;
  summary: string;
  source_url: string;
  agent_name: string;
  model_name: string;
  reasoning_level: string;
  vocab_count: number;
  idioms_count: number;
  patterns_count: number;
  execution_time_ms: number;
  is_completed?: number | boolean;
  isCompleted?: boolean;
  created_at: string;
}
