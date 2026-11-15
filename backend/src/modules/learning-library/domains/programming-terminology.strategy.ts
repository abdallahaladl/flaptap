import { Injectable } from '@nestjs/common';
import { LearningDomainMetadata, LearningGenerationContext } from '../learning-library.types';
import { BaseLearningDomainStrategy } from './base-learning-domain.strategy';

@Injectable()
export class ProgrammingTerminologyDomainStrategy extends BaseLearningDomainStrategy {
  readonly id = 'programming_terminology';

  readonly metadata: LearningDomainMetadata = {
    id: 'programming_terminology',
    title: 'Programming Terminology',
    subtitle:
      'Core language semantics, concurrency patterns, runtime behavior, compiler concepts, and everyday developer idioms used while pairing and reviewing code.',
    badge: 'Code & Runtime',
    isDefault: false,
    itemNounSingular: 'programming concept',
    itemNounPlural: 'programming concepts',
    supportsSpokenMechanics: true,
    registers: [
      'Code Review',
      'Pair Programming',
      'Systems & Memory',
      'Type Systems',
      'Debugging & Testing',
    ],
    suggestedFocusTopics: [
      'TypeScript generics, narrowing & variance',
      'Async concurrency, locks & race conditions',
      'Memory ownership, closures & garbage collection',
      'Refactoring smells & clean abstractions',
    ],
    categories: [
      {
        id: 'type_systems',
        label: 'Type Systems & Semantics',
        description: 'Static typing, generics, variance, algebraic types, and compiler invariants.',
        promptGuidance:
          'Cover high-leverage concepts like discriminated union, type narrowing, covariance/contravariance, structural typing, nominal branding, monomorphization.',
      },
      {
        id: 'concurrency_async',
        label: 'Concurrency & Async',
        description: 'Execution models, synchronization, race conditions, and async scheduling.',
        promptGuidance:
          'Cover concepts like race condition, deadlock, livelock, mutex contention, event loop starvation, structured concurrency, atomic compare-and-swap.',
      },
      {
        id: 'memory_runtime',
        label: 'Memory & Runtime',
        description: 'Allocation, lifetimes, closures, JIT optimization, and garbage collection.',
        promptGuidance:
          'Cover concepts like closure capture, heap fragmentation, stack unwinding, escape analysis, zero-copy buffer, reference cycle, tail-call optimization.',
      },
      {
        id: 'code_craft_idioms',
        label: 'Code Craft & Idioms',
        description: 'Code review idioms, anti-patterns, testing strategies, and refactoring patterns.',
        promptGuidance:
          'Cover terms like footgun, boilerplate, leaky abstraction, defensive copy, dependency inversion, deterministic replay, flaky test, code smell.',
      },
    ],
    uiLabels: {
      expressionHeading: 'Programming Term',
      spokenHeading: 'Spoken Pronunciation',
      textbookContrastHeading: 'Vague Description vs. Exact Term',
      variationsHeading: 'Aliases & Variants',
      combinationsHeading: 'Codebase Collocations',
      patternsHeading: 'Code Review Usage Patterns',
      examplesHeading: 'Pair Programming & PR Examples',
      mechanicsHeading: 'Spoken Pronunciation & Rhythm',
      nuanceHeading: 'Conceptual Pitfalls & Misconceptions',
    },
  };

  protected getDomainPersonaPrompt(_ctx: LearningGenerationContext): string {
    return [
      'You are a Staff Systems Engineer and Programming Languages Educator.',
      'Teach programming terminology the way senior engineers discuss code during pairing, PR reviews, and debugging sessions.',
    ].join('\n');
  }

  protected getQualityAndDiversityRules(_ctx: LearningGenerationContext): string {
    return [
      'STRICT QUALITY RULES:',
      '1. ZERO INTRO-101 TERMS: Never generate basic terms like "variable", "for loop", "if statement", "array", or "string".',
      '2. CODEBASE REALISM: Every example must sound like real senior developers talking in a PR comment or debugging session.',
      '3. VARIATIONS & PITFALLS: Highlight subtle misconceptions and exact collocations developers pair with the term.',
    ].join('\n');
  }
}
