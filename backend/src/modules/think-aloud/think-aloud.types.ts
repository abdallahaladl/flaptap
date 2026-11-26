export type ThinkAloudMode =
  | 'four_three_two'
  | 'framework'
  | 'circumlocution'
  | 'camera_qa';

export type ThinkAloudDomain =
  | 'everyday'
  | 'programming_ai'
  | 'tech_systems'
  | 'business_econ'
  | 'camera_creator'
  | 'custom';

export type ThinkAloudInputMode = 'mic' | 'camera' | 'text';
export type ThinkAloudLevel = 'B1' | 'B2' | 'C1';
export type FourThreeTwoPresetId = 'sprint' | 'standard' | 'deep';

export interface CircumlocutionCard {
  id: string;
  concept: string;
  hint: string;
  forbiddenWords: string[];
}

export interface ThinkAloudPromptMeta {
  beatCues?: string[];
  starterHints?: string[];
  roundDurationsSec?: number[];
  presetId?: FourThreeTwoPresetId;
  cards?: CircumlocutionCard[];
  openingHookGoal?: string;
  curveballQuestion?: string;
  curveballTriggerSec?: number;
  groundingCue?: string;
}

export interface ThinkAloudPromptPayload {
  mode: ThinkAloudMode;
  domain: ThinkAloudDomain;
  cefrLevel: ThinkAloudLevel;
  frameworkId: string;
  promptTitle: string;
  promptBody: string;
  promptMeta: ThinkAloudPromptMeta;
  modelUsed?: string;
}

export interface SpeakingRoundInput {
  roundIndex: number;
  label?: string;
  targetDurationSec: number;
  actualDurationSec: number;
  transcript: string;
  conceptId?: string;
  conceptLabel?: string;
  forbiddenWords?: string[];
  curveballTriggered?: boolean;
}

export interface SpeakingRoundMetrics {
  roundIndex: number;
  label: string;
  targetDurationSec: number;
  actualDurationSec: number;
  transcript: string;
  wordCount: number;
  wpm: number;
  fillerCount: number;
  fillersFound: string[];
  fillerRatePer100: number;
  uniqueWordRatio: number;
  forbiddenHits: string[];
  conceptId?: string;
  conceptLabel?: string;
  curveballTriggered?: boolean;
}

export interface FluencyMetrics {
  totalWords: number;
  totalDurationSec: number;
  avgWpm: number;
  totalFillers: number;
  fillerRatePer100: number;
  uniqueWordRatio: number;
  wpmGainPct: number;
  forbiddenHitsTotal: number;
  rounds: SpeakingRoundMetrics[];
}

export interface CalqueUpgrade {
  original: string;
  issueType: 'calque' | 'translation_pause' | 'stiff_textbook' | 'wordiness' | 'vague';
  whyUnnatural: string;
  naturalUpgrade: string;
  spokenIpa: string;
  exampleSentence: string;
}

export interface ExtractedChunk {
  phrase: string;
  patternSlot: string;
  ipa: string;
  meaning: string;
  localizedMeaning: string;
  whenToUse: string;
  example: string;
}

export interface CoachingReport {
  directnessScore: number;
  flowScore: number;
  structureScore: number;
  naturalnessScore: number;
  overallScore: number;
  headlineVerdict: string;
  strengths: string[];
  calquesAndUpgrades: CalqueUpgrade[];
  shadowableRecast: string;
  extractedChunks: ExtractedChunk[];
  microMission: string;
  curveballFeedback?: string;
}

export interface ThinkAloudSessionRecord {
  id: string;
  userId: string;
  mode: ThinkAloudMode;
  domain: ThinkAloudDomain;
  cefrLevel: ThinkAloudLevel;
  frameworkId: string;
  promptTitle: string;
  promptBody: string;
  promptMeta: ThinkAloudPromptMeta;
  inputMode: ThinkAloudInputMode;
  rounds: SpeakingRoundMetrics[];
  metrics: FluencyMetrics;
  coaching: CoachingReport;
  directnessScore: number;
  flowScore: number;
  structureScore: number;
  naturalnessScore: number;
  overallScore: number;
  avgWpm: number;
  totalDurationSec: number;
  mediaId: string;
  modelUsed: string;
  nativeLanguage: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpineChunkItem {
  id: string;
  text: string;
  ipa?: string;
  note?: string;
  example?: string;
  register?: string;
}

export interface ThinkAloudSpinePack {
  id: string;
  userId: string;
  isBuiltIn: boolean;
  title: string;
  domain: ThinkAloudDomain;
  topic: string;
  starters: SpineChunkItem[];
  engines: SpineChunkItem[];
  tails: SpineChunkItem[];
  chunks: SpineChunkItem[];
  practicedIds: string[];
  totalItems: number;
  practicedCount: number;
  isCompleted: boolean;
  modelUsed: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyRitualStep {
  id: 'warmup_reflex' | 'core_compression' | 'real_transfer';
  title: string;
  subtitle: string;
  targetModes: ThinkAloudMode[];
  completed: boolean;
  completedSessionId?: string;
}

export interface AutomaticityStageInfo {
  stage: number;
  label: string;
  description: string;
  nextStageLabel: string;
  progressPct: number;
}

export interface AutomaticityOverview {
  totalSessions: number;
  totalSpeakingMinutes: number;
  avgWpm: number;
  wpmDeltaRecent: number;
  avgDirectness: number;
  avgOverallScore: number;
  avgFourThreeTwoGainPct: number;
  stage: AutomaticityStageInfo;
  dailyRitual: {
    date: string;
    completedCount: number;
    totalCount: number;
    isComplete: boolean;
    steps: DailyRitualStep[];
  };
  recentSessions: ThinkAloudSessionRecord[];
}

export interface GeneratePromptDto {
  mode?: ThinkAloudMode;
  domain?: ThinkAloudDomain;
  cefrLevel?: ThinkAloudLevel;
  frameworkId?: string;
  presetId?: FourThreeTwoPresetId;
  customTopic?: string;
  keyId?: string;
  model?: string;
  variant?: string;
}

export interface EvaluateSessionDto {
  mode: ThinkAloudMode;
  domain: ThinkAloudDomain;
  cefrLevel?: ThinkAloudLevel;
  frameworkId?: string;
  promptTitle: string;
  promptBody: string;
  promptMeta?: ThinkAloudPromptMeta;
  inputMode?: ThinkAloudInputMode;
  rounds: SpeakingRoundInput[];
  nativeLanguage?: string;
  keyId?: string;
  model?: string;
  variant?: string;
}

export interface GenerateSpinePackDto {
  domain?: ThinkAloudDomain;
  topic: string;
  keyId?: string;
  model?: string;
  variant?: string;
}
