export type AuditFeature =
  | 'media_hub'
  | 'street_talk'
  | 'phonetics'
  | 'think_aloud'
  | 'american_extractor'
  | 'learning_library'
  | 'vocabulary'
  | 'shared_sources'
  | 'activity'
  | 'workspace';

export type AuditScope =
  | 'item'
  | 'sub_item'
  | 'bulk'
  | 'feature'
  | 'cache'
  | 'progress'
  | 'workspace';

export interface PurgeCounts {
  lessons?: number;
  practiceLogs?: number;
  sharedSources?: number;
  transcriptCaches?: number;
  mediaCaches?: number;
  mediaFiles?: number;
  vocabulary?: number;
  extractorNotes?: number;
  extractorItems?: number;
  libraryItems?: number;
  libraryBatches?: number;
  thinkAloudSessions?: number;
  thinkAloudSpines?: number;
  aiKeys?: number;
  auditEvents?: number;
  bytesFreed?: number;
}

export interface AuditEventRecord {
  id: string;
  action: string;
  feature: AuditFeature;
  scope: AuditScope;
  targetId: string;
  targetLabel: string;
  summary: string;
  purged: PurgeCounts;
  createdAt: string;
}

export interface LifecycleSummary {
  counts: {
    mediaHub: number;
    street_talk: number;
    phonetics: number;
    lessonsTotal: number;
    thinkAloudSessions: number;
    thinkAloudCustomSpines: number;
    americanExtractorNotes: number;
    learningLibraryItems: number;
    learningLibraryBatches: number;
    vocabulary: number;
    sharedSources: number;
    practiceLogs: number;
    auditEvents: number;
    aiKeys: number;
  };
  storage: {
    lessonsBytes: number;
    transcriptCacheBytes: number;
    mediaFilesCount: number;
    mediaBytes: number;
    totalBytes: number;
  };
}

export interface WorkspaceResetOptions {
  confirmPhrase?: string;
  includeLessons?: boolean;
  includeThinkAloud?: boolean;
  includePhraseMiner?: boolean;
  includePhraseBuilder?: boolean;
  includeVocabulary?: boolean;
  includeSharedSources?: boolean;
  includePracticeAndStreak?: boolean;
  includeAuditLog?: boolean;
  includeAiKeys?: boolean;
  resetPreferences?: boolean;
}
