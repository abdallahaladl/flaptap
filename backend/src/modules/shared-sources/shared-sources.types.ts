export type SharedSourceType =
  | 'youtube'
  | 'social_video'
  | 'audio'
  | 'video'
  | 'article'
  | 'pdf'
  | 'text'
  | 'markdown'
  | 'image'
  | 'lesson';

export type SharedMediaKind = 'none' | 'youtube' | 'audio' | 'video';

export interface SourceSegment {
  startSec: number;
  endSec: number;
  text: string;
}

export interface SharedSourceRecord {
  id: string;
  userId: string;
  sourceKey: string;
  sourceType: SharedSourceType;
  title: string;
  creator: string;
  sourceUrl: string;
  sourceLabel: string;
  mimeType: string;
  fileName: string;
  hasAudio: boolean;
  hasVideo: boolean;
  mediaKind: SharedMediaKind;
  mediaId: string;
  durationSeconds: number;
  transcriptText: string;
  segments: SourceSegment[];
  sourceMeta: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface SharedSourceSummary {
  id: string;
  sourceKey: string;
  sourceType: SharedSourceType;
  title: string;
  creator: string;
  sourceUrl: string;
  sourceLabel: string;
  hasAudio: boolean;
  hasVideo: boolean;
  mediaKind: SharedMediaKind;
  mediaId: string;
  durationSeconds: number;
  segmentCount: number;
  wordCount: number;
  updatedAt: string;
}

export interface LinkedLessonSummary {
  id: string;
  title: string;
  track: string;
  videoId?: string;
  sentencesCount: number;
  isCompleted: boolean;
}

export interface LinkedExtractorNoteSummary {
  id: string;
  title: string;
  itemCount: number;
  completedCount: number;
  isCompleted: boolean;
  targetLanguage: string;
  createdAt: string;
}

export interface LinkedTechLexiconSummary {
  id: string;
  title: string;
  extractionMode: string;
  vocabCount: number;
  idiomsCount: number;
  createdAt: string;
}

export interface SharedSourceLinks {
  source: SharedSourceSummary | null;
  lesson: LinkedLessonSummary | null;
  extractorNotes: LinkedExtractorNoteSummary[];
  techLexiconNotes: LinkedTechLexiconSummary[];
}

export interface UpsertSharedSourceInput {
  sourceKey: string;
  sourceType: SharedSourceType;
  title: string;
  creator?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  mimeType?: string;
  fileName?: string;
  hasAudio?: boolean;
  hasVideo?: boolean;
  mediaKind?: SharedMediaKind;
  mediaId?: string;
  durationSeconds?: number;
  transcriptText?: string;
  segments?: SourceSegment[];
  sourceMeta?: Record<string, any>;
}
