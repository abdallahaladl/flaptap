import {
  ExtractionModeId,
  ExtractionModeMetadata,
  ExtractionPromptContext,
  NormalizedExtractionData,
} from '../tech-linguist.types';

export interface ExtractionPromptBundle {
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
}

/**
 * Strategy contract for Tech Lexicon extraction modes.
 * Keeps shared ingestion, AI dispatch, JSON salvage, and SQLite persistence
 * cleanly decoupled from mode-specific prompting and filtering rules.
 */
export interface IExtractionModeStrategy {
  readonly id: ExtractionModeId;
  readonly metadata: ExtractionModeMetadata;

  buildPrompts(ctx: ExtractionPromptContext): ExtractionPromptBundle;
  normalizeAndFilter(parsed: any, fallbackTitle: string): NormalizedExtractionData;
}
