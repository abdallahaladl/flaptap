export type MasteryStatus = 'new' | 'learning' | 'mastered';

export interface LearningUsagePattern {
  pattern: string;
  meaning: string;
  example: string;
}

/** One interchangeable filler inside a reusable expression frame. */
export interface LearningPatternSlot {
  /** Bare slot name without brackets, e.g. "X". */
  slot: string;
  /** What the slot stands for in plain English, e.g. "the thing you break". */
  role: string;
  /** A natural filler showing real usage, e.g. "the deploy". */
  example: string;
}

export interface LearningExampleItem {
  speakerContext: string;
  sentence: string;
  explanation: string;
}

export interface LearningDomainCategorySpec {
  id: string;
  label: string;
  description: string;
  promptGuidance: string;
}

export interface LearningDomainMetadata {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  isDefault: boolean;
  itemNounSingular: string;
  itemNounPlural: string;
  supportsSpokenMechanics: boolean;
  registers: string[];
  suggestedFocusTopics: string[];
  categories: LearningDomainCategorySpec[];
  uiLabels: {
    expressionHeading: string;
    spokenHeading: string;
    textbookContrastHeading: string;
    variationsHeading: string;
    combinationsHeading: string;
    patternsHeading: string;
    patternHeading: string;
    examplesHeading: string;
    mechanicsHeading: string;
    nuanceHeading: string;
  };
}

export interface LearningGenerationContext {
  domainId: string;
  requestedCount: number;
  askCount: number;
  categoryFilter: string;
  /** Optional disjoint category subset for parallel batch sharding without overlap. */
  targetCategories?: string[];
  /** Optional creative angle when parallel batches share one focused category. */
  angleHint?: string;
  focusTopic: string;
  preferredRegister: string;
  targetLanguageCode: string;
  targetLanguageName: string;
  targetLanguageNative: string;
  excludedExpressions: string[];
}

export interface LearningLibraryAiEngineInfo {
  provider: string;
  model: string;
  configured: boolean;
}

export interface GeneratedLearningCandidate {
  expression: string;
  categoryId: string;
  categoryLabel: string;
  register: string;
  tone: string;
  level: string;
  ipa: string;
  spokenForm: string;
  phoneticBreakdown: string;
  coreMeaning: string;
  localizedMeaning: string;
  targetLanguage: string;
  textbookEquivalent: string;
  nativeContext: string;
  mistakesToAvoid: string;
  variations: string[];
  combinations: string[];
  usagePatterns: LearningUsagePattern[];
  /** Slot legend for a reusable `expression` frame (empty for fixed terms). */
  patternSlots: LearningPatternSlot[];
  examples: LearningExampleItem[];
  relatedExpressions: string[];
}

export interface LearningLibraryItem extends GeneratedLearningCandidate {
  id: string;
  batchId: string | null;
  domainId: string;
  canonicalKey: string;
  slugKey: string;
  tokenSignature: string;
  /** Stable 1-based creation index within the user's domain library. */
  sequenceNumber: number;
  isFavorite: boolean;
  isCompleted: boolean;
  masteryStatus: MasteryStatus;
  reviewCount: number;
  userNotes: string;
  agentName: string;
  modelName: string;
  createdAt: string;
  updatedAt: string;
}

export interface LearningLibraryBatch {
  id: string;
  domainId: string;
  categoryFilter: string;
  focusTopic: string;
  requestedCount: number;
  generatedCount: number;
  skippedDuplicatesCount: number;
  agentId: string;
  agentName: string;
  modelName: string;
  variantName: string;
  executionTimeMs: number;
  fallbackFrom: string;
  createdAt: string;
}

export interface LearningLibraryStats {
  totalItems: number;
  newCount: number;
  learningCount: number;
  masteredCount: number;
  completedCount: number;
  favoritesCount: number;
  batchesCount: number;
}

export interface GenerateLibraryItemsDto {
  domainId?: string;
  count?: number;
  categoryId?: string;
  focusTopic?: string;
  register?: string;
  targetLanguage?: string;
  keyId?: string;
  agentId?: string;
  model?: string;
  variant?: string;
  thinking?: string;
  allowFallback?: boolean;
}

export interface ListLibraryItemsQuery {
  domainId?: string;
  categoryId?: string;
  masteryStatus?: string;
  favoritesOnly?: boolean;
  batchId?: string;
  register?: string;
  q?: string;
  sort?: 'newest' | 'alphabetical' | 'mastery' | 'most_reviewed';
  page?: number;
  limit?: number;
}

export interface UpdateLibraryItemDto {
  isFavorite?: boolean;
  isCompleted?: boolean;
  masteryStatus?: MasteryStatus;
  incrementReview?: boolean;
  userNotes?: string;
}
