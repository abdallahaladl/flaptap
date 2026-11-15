import {
  GeneratedLearningCandidate,
  LearningDomainMetadata,
  LearningGenerationContext,
} from '../learning-library.types';

export interface LearningPromptBundle {
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
}

/**
 * Pluggable Domain Strategy contract for the scalable Learning Library.
 * Any future learning domain (e.g. technical vocabulary, programming terminology,
 * medical English, sales negotiation) only needs to implement this interface
 * and register itself in LearningDomainRegistry.
 */
export interface ILearningDomainStrategy {
  readonly id: string;
  readonly metadata: LearningDomainMetadata;

  buildGenerationPrompts(ctx: LearningGenerationContext): LearningPromptBundle;
  normalizeCandidate(raw: any, ctx: LearningGenerationContext): GeneratedLearningCandidate | null;
}
