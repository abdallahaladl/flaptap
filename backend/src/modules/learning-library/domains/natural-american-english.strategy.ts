import { Injectable } from '@nestjs/common';
import { LearningDomainMetadata, LearningGenerationContext } from '../learning-library.types';
import { BaseLearningDomainStrategy } from './base-learning-domain.strategy';

@Injectable()
export class NaturalAmericanEnglishDomainStrategy extends BaseLearningDomainStrategy {
  readonly id = 'natural_american_english';

  readonly metadata: LearningDomainMetadata = {
    id: 'natural_american_english',
    title: 'Natural American English',
    subtitle:
      'Authentic fillers, discourse markers, hesitation phrases, connected speech reductions, modern slang, and casual patterns spoken by young Americans, friends, creators, and tech professionals.',
    badge: 'Spoken Fluency',
    isDefault: true,
    itemNounSingular: 'expression',
    itemNounPlural: 'expressions',
    supportsSpokenMechanics: true,
    registers: [
      'Everyday Spoken',
      'Friends & Gen-Z',
      'Ultra-Casual',
      'Creators & Podcasts',
      'Tech Casual',
    ],
    suggestedFocusTopics: [
      'Hanging out with friends & casual banter',
      'Thinking out loud & natural hesitation',
      'Podcasts, YouTube creators & hot takes',
      'Tech standups, Slack & startup banter',
      'Reacting, agreeing & pushing back casually',
      'Fast-speech reductions & connected linking',
    ],
    categories: [
      {
        id: 'fillers_hesitation',
        label: 'Fillers & Hesitation',
        description:
          'Natural American thinking-out-loud phrases, softeners, stallers, and vagueness extenders.',
        promptGuidance:
          'Spoken conversational bridges, softeners, and time-buyers beyond plain "um/like" (style: "off the top of my head", "kind of a thing"). Teach exact pause rhythm.',
      },
      {
        id: 'discourse_markers',
        label: 'Discourse Markers',
        description:
          'Spoken transitions, topic pivots, pushbacks, concessions, and reframing markers.',
        promptGuidance:
          'Spoken pivots natives use to steer, concede, or reframe a point (style: "that being said", "for what it\'s worth").',
      },
      {
        id: 'connected_reductions',
        label: 'Connected Speech & Reductions',
        description:
          'Fast-speech elisions, assimilations, Flap-T linking, and natural spoken contractions.',
        promptGuidance:
          'Authentic multi-word fast-speech reductions, assimilations, and Flap-T linking (style: "whatcha", "outta pocket", "what do you mean /wʌɾəjə miːn/"). Explain tongue/lip mechanics.',
      },
      {
        id: 'modern_slang',
        label: 'Modern Slang & Gen-Z',
        description:
          'Current slang and social expressions used naturally by young Americans and internet-fluent friends.',
        promptGuidance:
          'Current 2025–2026 spoken & internet-fluent slang (no dated 90s slang; style: "locked in", "hits different", "rent-free"). Explain exact social boundaries.',
      },
      {
        id: 'conversational_patterns',
        label: 'Casual Patterns',
        description:
          'Reusable syntactic frames, reaction formulas, and everyday social templates.',
        promptGuidance:
          'Plug-and-play spoken reaction templates and syntactic frames (style: "I\'m down for [X]", "Make it make sense").',
      },
      {
        id: 'creator_podcast',
        label: 'Creators & Podcasts',
        description:
          'Authentic expressions heard on American podcasts, YouTube essays, livestreams, and creator commentary.',
        promptGuidance:
          'Natural host/creator hooks, framing, and commentary turns (style: "rabbit hole", "full disclosure", "plot twist").',
      },
      {
        id: 'tech_startup_casual',
        label: 'Tech & Startup Casual',
        description:
          'Informal conversational expressions American engineers, founders, and PMs use in huddles and Slack.',
        promptGuidance:
          'Casual spoken engineering, startup, and Slack banter—not dry textbook specs (style: "ballpark it", "move the needle", "on my radar").',
      },
      {
        id: 'idioms_phrasal_combos',
        label: 'Idioms & Phrasal Combos',
        description:
          'High-utility modern idioms, figurative phrases, and multi-word phrasal verb combinations.',
        promptGuidance:
          'Impactful everyday idioms and multi-word phrasal verbs Americans drop naturally (style: "read the room", "double down on").',
      },
    ],
    uiLabels: {
      expressionHeading: 'Expression',
      spokenHeading: 'Fast Spoken Sound',
      textbookContrastHeading: 'Textbook vs. Native',
      variationsHeading: 'Variations & Shortcuts',
      combinationsHeading: 'Combinations & Collocations',
      patternsHeading: 'Usage Patterns',
      examplesHeading: 'Natural Real-Life Examples',
      mechanicsHeading: 'Connected Speech & Pronunciation Mechanics',
      nuanceHeading: 'Social Context & Mistakes to Avoid',
    },
  };

  protected getDomainPersonaPrompt(_ctx: LearningGenerationContext): string {
    return 'You are an elite American English sociolinguist and accent coach teaching authentic 2025–2026 spoken American English used by young Americans, creators, podcasts, and tech teams.';
  }

  protected getQualityAndDiversityRules(_ctx: LearningGenerationContext): string {
    return [
      'QUALITY RULES:',
      '- ZERO basic ESL textbook filler (no "good morning", "how are you", "in my opinion", "a lot of", "for example", simple B1 words).',
      '- Deliver genuinely native fillers, reductions, modern slang, discourse pivots, or casual tech/creator idioms.',
      '- Include exact General American IPA + concise physical spoken mechanics (Flap-T /ɾ/, glottal stop /ʔ/, schwa /ə/, linking, or stress).',
      '- Every item ships exactly 2 everyday usage examples with distinct where/when tags from the learner\'s real week (standup, Slack, coffee chat, group chat) — never textbook dialogue.',
    ].join('\n');
  }
}
