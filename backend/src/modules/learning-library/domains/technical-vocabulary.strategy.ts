import { Injectable } from '@nestjs/common';
import { LearningDomainMetadata, LearningGenerationContext } from '../learning-library.types';
import { BaseLearningDomainStrategy } from './base-learning-domain.strategy';

@Injectable()
export class TechnicalVocabularyDomainStrategy extends BaseLearningDomainStrategy {
  readonly id = 'technical_vocabulary';

  readonly metadata: LearningDomainMetadata = {
    id: 'technical_vocabulary',
    title: 'Technical Vocabulary',
    subtitle:
      'High-signal engineering, distributed systems, AI/ML, product strategy, and senior architecture vocabulary used in RFCs, incidents, and design reviews.',
    badge: 'Engineering Fluency',
    isDefault: false,
    itemNounSingular: 'technical term',
    itemNounPlural: 'technical terms',
    supportsSpokenMechanics: true,
    registers: [
      'Architecture Review',
      'Incident & Postmortem',
      'Product & Growth',
      'AI / ML Research',
      'Executive / RFC',
    ],
    suggestedFocusTopics: [
      'Distributed systems reliability & backpressure',
      'AI inference latency & quantization',
      'Observability, telemetry & incident triage',
      'Product-market fit & growth attribution',
    ],
    categories: [
      {
        id: 'distributed_systems',
        label: 'Distributed Systems',
        description: 'Consistency, fault tolerance, queues, consensus, and reliability concepts.',
        promptGuidance:
          'Focus on high-signal terms like idempotency, backpressure, split-brain, quorum, eventual consistency, circuit breaker, thundering herd, tail latency.',
      },
      {
        id: 'ai_ml_systems',
        label: 'AI & ML Engineering',
        description: 'Inference optimization, training dynamics, evals, and model deployment terminology.',
        promptGuidance:
          'Focus on practical engineering terms like quantization, KV-cache, speculative decoding, catastrophic forgetting, semantic drift, hallucination guardrail, embedding space.',
      },
      {
        id: 'observability_ops',
        label: 'Observability & Ops',
        description: 'Production diagnostics, SLOs, telemetry, performance profiling, and postmortems.',
        promptGuidance:
          'Focus on terms like p99 tail latency, flame graph, blast radius, error budget, distributed trace, canary rollout, cardinality explosion.',
      },
      {
        id: 'product_architecture',
        label: 'Product & Tradeoffs',
        description: 'Technical decision-making, debt management, and engineering leadership language.',
        promptGuidance:
          'Focus on terms like blast radius, two-way door decision, accidental complexity, tech debt service, convergence, north-star metric.',
      },
    ],
    uiLabels: {
      expressionHeading: 'Technical Term',
      spokenHeading: 'Spoken Pronunciation',
      textbookContrastHeading: 'Plain English vs. Engineering Precision',
      variationsHeading: 'Acronyms & Related Forms',
      combinationsHeading: 'Engineering Collocations',
      patternsHeading: 'Design Review & RFC Patterns',
      patternHeading: 'Reusable Engineering Frame',
      examplesHeading: 'Real Engineering Usage Examples',
      mechanicsHeading: 'Spoken Delivery & Stress Cues',
      nuanceHeading: 'Architecture Nuance & Pitfalls',
    },
  };

  protected getDomainPersonaPrompt(_ctx: LearningGenerationContext): string {
    return [
      'You are a Principal Software Architect and Technical Communication Coach at a top US tech company.',
      'Teach high-impact technical vocabulary with crisp conceptual clarity, authentic American spoken pronunciation, real architecture collocations, and RFC/standup usage patterns.',
    ].join('\n');
  }

  protected getQualityAndDiversityRules(_ctx: LearningGenerationContext): string {
    return [
      'STRICT QUALITY RULES:',
      '1. ZERO TRIVIAL TERMS: Never include beginner words like "database", "server", "bug", "website", "function", or "password".',
      '2. ACTIONABLE ENGINEERING PRECISION: Explain the exact tradeoff or mechanism, common collocations, and how staff engineers actually phrase it in code reviews and incident calls.',
      '3. SPOKEN ACCURACY: Include IPA and syllable stress cues for tricky technical words and acronyms.',
    ].join('\n');
  }
}
