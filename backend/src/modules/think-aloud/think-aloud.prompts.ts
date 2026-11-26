import { getLanguage } from '../../core/ai/languages';
import {
  FOUR_THREE_TWO_PRESETS,
  THINK_ALOUD_DOMAINS,
  THINK_ALOUD_FRAMEWORKS,
} from './think-aloud.catalog';
import {
  EvaluateSessionDto,
  FluencyMetrics,
  GeneratePromptDto,
  GenerateSpinePackDto,
} from './think-aloud.types';

export function buildPromptGenerationPrompts(dto: GeneratePromptDto): {
  systemPrompt: string;
  userPrompt: string;
} {
  const mode = dto.mode || 'four_three_two';
  const domain = dto.domain || 'programming_ai';
  const level = dto.cefrLevel || 'B2';
  const frameworkId = dto.frameworkId || 'what_so_what_now_what';
  const preset = FOUR_THREE_TWO_PRESETS[dto.presetId || 'standard'] || FOUR_THREE_TWO_PRESETS.standard;
  const domainMeta = THINK_ALOUD_DOMAINS.find((d) => d.id === domain) || THINK_ALOUD_DOMAINS[0];
  const frameworkMeta =
    THINK_ALOUD_FRAMEWORKS.find((f) => f.id === frameworkId) || THINK_ALOUD_FRAMEWORKS[0];
  const customTopic = String(dto.customTopic || '').trim();

  const systemPrompt = [
    'You are an applied linguist and Stanford-style spontaneous speaking coach designing a live English thinking-and-speaking drill.',
    'Keep everything strictly in natural American English (never include non-English translations inside prompts).',
    'Never write a full speech script for the user—only crisp scenario framing, beat cues, and short 2-5 word autopilot starter hints.',
    'Output ONLY valid JSON with no markdown fences.',
  ].join('\n');

  const topicInstruction = customTopic
    ? `User custom topic/situation: "${customTopic}" (domain context: ${domainMeta.label}).`
    : `Choose a fresh, concrete, high-engagement scenario in domain "${domainMeta.label}" (${domainMeta.description}).`;

  if (mode === 'circumlocution') {
    const userPrompt = [
      `Design a 5-card Circumlocution (Taboo / Paraphrase-Only) set at ${level} level.`,
      topicInstruction,
      'Each card asks the speaker to explain a concept aloud for 30 seconds WITHOUT using any of its 3-4 forbiddenWords (which block direct L1-to-word shortcuts and force conceptual English description).',
      'Return JSON:',
      JSON.stringify({
        promptTitle: '3-6 word session title',
        promptBody: '1-sentence instruction for the 5-card paraphrase sprint',
        cards: [
          {
            id: 'c1',
            concept: 'Concrete term or concept',
            hint: '1-line angle to describe function/context without naming it',
            forbiddenWords: ['word1', 'word2', 'word3', 'word4'],
          },
        ],
        starterHints: ['It is basically when...', 'You use it whenever...', 'Think of it like...'],
      }),
      'Requirement: Exactly 5 cards in `cards`, each with 3-4 single-word forbiddenWords.',
    ].join('\n');
    return { systemPrompt, userPrompt };
  }

  if (mode === 'camera_qa') {
    const userPrompt = [
      `Design an unscripted Camera & Q&A speaking challenge at ${level} level.`,
      topicInstruction,
      `Use structure "${frameworkMeta.title}" (${frameworkMeta.summary}).`,
      'Also author a realistic mid-session Curveball Follow-Up question that challenges an assumption or asks for a concrete example so the speaker practices paraphrasing and "Yes, and" bridging.',
      'Return JSON:',
      JSON.stringify({
        promptTitle: '4-7 word engaging topic title',
        promptBody: '2-sentence real-world scenario (e.g., recording an unscripted video take or answering a live peer/stakeholder question).',
        openingHookGoal: '1 crisp 8-12 word goal for the first 10 seconds',
        groundingCue: 'Conversation, not performance. Dare to be dull.',
        beatCues: frameworkMeta.beats.map((b) => `${b.label}: ${b.cue}`),
        starterHints: ['3-4 short 2-5 word American starters'],
        curveballQuestion: 'Sharp, realistic follow-up question in 10-18 words',
        curveballTriggerSec: 38,
      }),
    ].join('\n');
    return { systemPrompt, userPrompt };
  }

  if (mode === 'framework') {
    const userPrompt = [
      `Design a Framework Sprint speaking prompt at ${level} level.`,
      topicInstruction,
      `Target speaking framework: "${frameworkMeta.title}" (${frameworkMeta.summary}).`,
      'Return JSON:',
      JSON.stringify({
        promptTitle: '4-7 word prompt title',
        promptBody: '2-sentence concrete speaking situation or question to answer aloud.',
        beatCues: frameworkMeta.beats.map((b) => `${b.label}: concise prompt-specific cue`),
        starterHints: ['3-4 short 2-5 word American starter chunks'],
      }),
    ].join('\n');
    return { systemPrompt, userPrompt };
  }

  // four_three_two
  const userPrompt = [
    `Design a 4/3/2 Fluency Loop prompt (${preset.roundsSec.join('s -> ')}s) at ${level} level.`,
    topicInstruction,
    'The speaker will deliver the same core idea three times under shrinking timers to compress pauses and build automaticity.',
    'Return JSON:',
    JSON.stringify({
      promptTitle: '4-7 word prompt title',
      promptBody: '2-sentence relatable explanation/story prompt suitable for repeating faster across 3 rounds.',
      beatCues: ['Point 1 (Setup)', 'Point 2 (Core Insight/Example)', 'Point 3 (Takeaway)'],
      starterHints: ['3-4 short 2-5 word American starter chunks'],
      roundDurationsSec: preset.roundsSec,
    }),
  ].join('\n');

  return { systemPrompt, userPrompt };
}

export function buildEvaluationPrompts(params: {
  dto: EvaluateSessionDto;
  metrics: FluencyMetrics;
  nativeLanguage: string;
}): { systemPrompt: string; userPrompt: string } {
  const { dto, metrics, nativeLanguage } = params;
  const langObj = getLanguage(nativeLanguage || 'ar');

  const systemPrompt = [
    'You are an elite American English spontaneous speaking coach and applied linguist (combining SLA automaticity science, Stanford GSB clarity, and natural spoken American English).',
    'Your job is to evaluate a learner’s real verbatim unscripted speech—never robotic textbook grammar policing.',
    'Rules:',
    '1. Preserve the user’s exact ideas and intent when writing `shadowableRecast`. Make it sound like an articulate, natural American speaker talking off the cuff (contractions, crisp transitions, zero corporate fluff).',
    '2. In `calquesAndUpgrades`, identify up to 5 real phrases from the user’s transcript that sound literally translated from another language (calques), stiff/textbook, wordy, or hesitant—and pair each with a natural spoken American upgrade + accurate IPA.',
    '3. In `extractedChunks`, provide 3-5 reusable multi-word `[slot]` chunks inspired by what the user tried to say, including `localizedMeaning` in ' +
      `${langObj.name} (${langObj.code}). Keep all other fields strictly in English.`,
    '4. Give 1 specific, concrete `microMission` for tomorrow.',
    '5. Output ONLY valid JSON matching the exact schema, no markdown fences.',
  ].join('\n');

  const roundsSummary = metrics.rounds
    .map(
      (r) =>
        `[Round ${r.roundIndex} · ${r.label} · ${r.actualDurationSec}s · ${r.wordCount} words · ${r.wpm} WPM · ${r.fillerCount} fillers${
          r.conceptLabel ? ` · Concept: "${r.conceptLabel}"` : ''
        }${r.forbiddenHits.length > 0 ? ` · Forbidden hits: ${r.forbiddenHits.join(', ')}` : ''}]\n"${r.transcript}"`,
    )
    .join('\n\n');

  const userPrompt = [
    `Mode: ${dto.mode} | Domain: ${dto.domain} | Level: ${dto.cefrLevel || 'B2'} | Framework: ${dto.frameworkId || 'none'}`,
    `Prompt Title: ${dto.promptTitle}`,
    `Prompt Body: ${dto.promptBody}`,
    dto.promptMeta?.curveballQuestion
      ? `Curveball Asked Mid-Session: "${dto.promptMeta.curveballQuestion}"`
      : '',
    `Deterministic Metrics: Total Words=${metrics.totalWords}, Avg WPM=${metrics.avgWpm}, 4/3/2 Speed Gain=${metrics.wpmGainPct}%, Filler Rate=${metrics.fillerRatePer100}/100w, Unique Word Ratio=${metrics.uniqueWordRatio}`,
    '',
    'User Verbatim Transcript(s):',
    roundsSummary,
    '',
    'Return strict JSON:',
    JSON.stringify({
      directnessScore: 78,
      flowScore: 74,
      structureScore: 81,
      naturalnessScore: 75,
      overallScore: 77,
      headlineVerdict: '1 crisp 10-18 word diagnosis of their spontaneous English performance',
      strengths: ['Specific win 1 from their transcript', 'Specific win 2'],
      calquesAndUpgrades: [
        {
          original: 'exact substring from user transcript',
          issueType: 'calque | translation_pause | stiff_textbook | wordiness | vague',
          whyUnnatural: '1 short sentence explaining why it slows flow or feels translated',
          naturalUpgrade: 'natural American spoken equivalent',
          spokenIpa: '/IPA/',
          exampleSentence: 'Short natural sentence using the upgrade',
        },
      ],
      shadowableRecast:
        'A natural, crisp 45-90 word American spoken version of the user’s exact message ready to shadow aloud.',
      extractedChunks: [
        {
          phrase: 'natural chunk',
          patternSlot: 'chunk + [X]',
          ipa: '/IPA/',
          meaning: 'concise English meaning',
          localizedMeaning: `concise meaning in ${langObj.name}`,
          whenToUse: '1 short usage trigger',
          example: 'Realistic spoken sentence',
        },
      ],
      microMission: '1 concrete drill target for the next 2-minute session',
      curveballFeedback: dto.promptMeta?.curveballQuestion
        ? '1-2 sentences evaluating how well they handled the mid-session curveball'
        : '',
    }),
  ]
    .filter(Boolean)
    .join('\n');

  return { systemPrompt, userPrompt };
}

export function buildSpinePackPrompts(dto: GenerateSpinePackDto): {
  systemPrompt: string;
  userPrompt: string;
} {
  const domainMeta =
    THINK_ALOUD_DOMAINS.find((d) => d.id === (dto.domain || 'programming_ai')) ||
    THINK_ALOUD_DOMAINS[0];

  const systemPrompt = [
    'You are an applied linguist authoring a combinatorial "Starter + Engine + Tail" Thinking Spine Pack for spontaneous spoken American English.',
    'Starters buy 0.5s on autopilot; Engines carry the core stance/explanation with [X] slots; Tails extend the thought with cause, contrast, or payoff.',
    'Every item must sound genuinely conversational—never stiff essay templates.',
    'Output ONLY valid JSON with no markdown fences.',
  ].join('\n');

  const userPrompt = [
    `Topic: "${dto.topic.trim()}" | Domain: ${domainMeta.label}`,
    'Author 4 Starters, 4 Engines (with [X] placeholders where helpful), 4 Tails, and 4 high-frequency spoken Chunks tailored to this exact topic.',
    'Return strict JSON:',
    JSON.stringify({
      title: '3-6 word pack title',
      starters: [{ id: 's1', text: 'Starter phrase,', ipa: '/IPA/', note: '<=10 words usage note' }],
      engines: [{ id: 'e1', text: 'core engine with [X]', ipa: '/IPA/', note: '<=10 words usage note' }],
      tails: [{ id: 't1', text: 'tail extension [Y].', ipa: '/IPA/', note: '<=10 words usage note' }],
      chunks: [{ id: 'c1', text: 'collocation/chunk', ipa: '/IPA/', example: 'Natural 8-14 word spoken sentence.' }],
    }),
  ].join('\n');

  return { systemPrompt, userPrompt };
}
