import {
  AutomaticityStageInfo,
  CoachingReport,
  FluencyMetrics,
  FourThreeTwoPresetId,
  SpeakingRoundInput,
  SpeakingRoundMetrics,
  ThinkAloudDomain,
  ThinkAloudMode,
  ThinkAloudPromptMeta,
  ThinkAloudSpinePack,
} from './think-aloud.types';

export interface ModeDefinition {
  id: ThinkAloudMode;
  title: string;
  shortLabel: string;
  tagline: string;
  scienceBasis: string;
  defaultDurationSec: number;
}

export interface DomainDefinition {
  id: ThinkAloudDomain;
  label: string;
  description: string;
  sampleTopics: string[];
}

export interface FrameworkDefinition {
  id: string;
  title: string;
  badge: string;
  summary: string;
  beats: Array<{ id: string; label: string; cue: string; targetPct: number }>;
}

export const THINK_ALOUD_MODES: ModeDefinition[] = [
  {
    id: 'four_three_two',
    title: '4/3/2 Fluency Loop',
    shortLabel: '4/3/2 Loop',
    tagline: 'Retell the exact same idea across 3 shrinking timers to outrun mental translation.',
    scienceBasis: 'Paul Nation 4/3/2 + Levelt Formulator Priming',
    defaultDurationSec: 90,
  },
  {
    id: 'framework',
    title: 'Framework Sprint',
    shortLabel: 'Framework',
    tagline: 'Offload structure onto a proven speaking spine so working memory stays free.',
    scienceBasis: 'Stanford GSB Cognitive Offloading + Formulaic Sequences',
    defaultDurationSec: 75,
  },
  {
    id: 'circumlocution',
    title: 'Circumlocution',
    shortLabel: 'Taboo Reflex',
    tagline: 'Explain 5 concepts in pure English without touching forbidden anchor words or L1.',
    scienceBasis: 'Kroll RHM Direct Conceptual Mediation + Strategic Competence',
    defaultDurationSec: 150,
  },
  {
    id: 'camera_qa',
    title: 'Camera & Q&A',
    shortLabel: 'Camera & Q&A',
    tagline: 'Unscripted talking-head or meeting turn with a mid-flight follow-up curveball.',
    scienceBasis: 'Affective Reframing + Paraphrase Buffer + Pushed Output',
    defaultDurationSec: 90,
  },
];

export const THINK_ALOUD_DOMAINS: DomainDefinition[] = [
  {
    id: 'programming_ai',
    label: 'Programming & AI',
    description: 'Architecture trade-offs, LLM agents, debugging stories, code reviews.',
    sampleTopics: [
      'Why simple SQLite beats premature distributed complexity',
      'Evaluating when an AI agent should ask vs act autonomously',
      'Explaining latency vs accuracy trade-offs to a product lead',
    ],
  },
  {
    id: 'tech_systems',
    label: 'Tech & Product',
    description: 'Product strategy, UX friction, engineering prioritization, demos.',
    sampleTopics: [
      'Pitching why onboarding friction matters more than new features',
      'Walking through a post-mortem after a production outage',
    ],
  },
  {
    id: 'business_econ',
    label: 'Business & Economics',
    description: 'Incentives, pricing power, unit economics, market shifts.',
    sampleTopics: [
      'Why freemium pricing fails when marginal AI compute is high',
      'How interest rates reshape early-stage hiring decisions',
    ],
  },
  {
    id: 'camera_creator',
    label: 'Unscripted Camera',
    description: 'YouTube intros, devlogs, concise hot takes, clear storytelling on lens.',
    sampleTopics: [
      'Opening a 60-second devlog without sounding rehearsed',
      'Sharing one contrarian lesson from building software solo',
    ],
  },
  {
    id: 'everyday',
    label: 'Everyday Life',
    description: 'Cafes, opinions, plans, stories, and spontaneous small talk.',
    sampleTopics: [
      'Why morning routines fail when they ignore energy levels',
      'Recommending a neighborhood spot to a visiting friend',
    ],
  },
  {
    id: 'custom',
    label: 'Custom Topic',
    description: 'Bring your own scenario, standup update, or camera prompt.',
    sampleTopics: [],
  },
];

export const THINK_ALOUD_FRAMEWORKS: FrameworkDefinition[] = [
  {
    id: 'what_so_what_now_what',
    title: 'What -> So What -> Now What',
    badge: 'Stanford GSB Core',
    summary: 'Name the core point, explain why it matters, and end with one concrete action.',
    beats: [
      { id: 'what', label: 'What?', cue: 'State the concrete thing, change, or claim in one crisp sentence.', targetPct: 30 },
      { id: 'so_what', label: 'So What?', cue: 'Explain the impact, risk, or why your listener should care.', targetPct: 40 },
      { id: 'now_what', label: 'Now What?', cue: 'Close with the immediate next step, decision, or takeaway.', targetPct: 30 },
    ],
  },
  {
    id: 'problem_solution_benefit',
    title: 'Problem -> Solution -> Benefit',
    badge: 'Pitch & Engineering',
    summary: 'Frame the friction clearly, propose your fix, and land the measurable payoff.',
    beats: [
      { id: 'problem', label: 'Problem', cue: 'Describe the specific bottleneck or pain point.', targetPct: 30 },
      { id: 'solution', label: 'Solution', cue: 'Explain your approach cleanly without over-detailing.', targetPct: 40 },
      { id: 'benefit', label: 'Benefit', cue: 'Spell out the concrete win for users, revenue, or speed.', targetPct: 30 },
    ],
  },
  {
    id: 'claim_tradeoff_takeaway',
    title: 'Claim -> Trade-Off -> Takeaway',
    badge: 'Tech & Economics',
    summary: 'Take a direct stance, acknowledge the real downside, and land your conclusion.',
    beats: [
      { id: 'claim', label: 'Direct Claim', cue: 'Lead with your stance right away—no throat-clearing.', targetPct: 28 },
      { id: 'tradeoff', label: 'Trade-Off', cue: 'Show nuance: what cost or edge case comes with it?', targetPct: 44 },
      { id: 'takeaway', label: 'Takeaway', cue: 'Synthesize when this rule holds and where it stops.', targetPct: 28 },
    ],
  },
  {
    id: 'starter_engine_tail',
    title: 'Starter -> Engine -> Tail',
    badge: 'Autopilot Spine',
    summary: 'Buy thinking time with a natural starter, deliver the core opinion, and extend with a tail.',
    beats: [
      { id: 'starter', label: 'Starter', cue: 'Open on autopilot ("Honestly, the thing is...") while your brain loads.', targetPct: 20 },
      { id: 'engine', label: 'Engine', cue: 'Deliver your core stance or reaction clearly.', targetPct: 45 },
      { id: 'tail', label: 'Tail', cue: 'Extend smoothly with "because...", "especially when...", or "which means...".', targetPct: 35 },
    ],
  },
  {
    id: 'five_ws_story',
    title: '5 Ws Snapshot Story',
    badge: 'Camera & Routine',
    summary: 'Anchor any real-life or work story across Who, What, When/Where, and Why it mattered.',
    beats: [
      { id: 'who_where', label: 'Scene (Who/Where)', cue: 'Drop the listener straight into the moment.', targetPct: 30 },
      { id: 'what_happened', label: 'Turn (What)', cue: 'Tell the main action or unexpected snag.', targetPct: 40 },
      { id: 'why_takeaway', label: 'Payoff (Why)', cue: 'Land what changed or what you took away from it.', targetPct: 30 },
    ],
  },
];

export const FOUR_THREE_TWO_PRESETS: Record<
  FourThreeTwoPresetId,
  { id: FourThreeTwoPresetId; label: string; roundsSec: number[]; description: string }
> = {
  sprint: {
    id: 'sprint',
    label: 'Quick Sprint (60 / 40 / 25s)',
    roundsSec: [60, 40, 25],
    description: 'Fast daily warm-up to kill hesitation fast.',
  },
  standard: {
    id: 'standard',
    label: 'Standard 4/3/2 (90 / 60 / 45s)',
    roundsSec: [90, 60, 45],
    description: 'Balanced compression for rich thoughts and clear speed gain.',
  },
  deep: {
    id: 'deep',
    label: 'Deep Talk (120 / 90 / 60s)',
    roundsSec: [120, 90, 60],
    description: 'Full-length unscripted explanation for tech, business, or camera.',
  },
};

export const AUTOMATICITY_STAGES: Array<{
  stage: number;
  label: string;
  description: string;
  minSessions: number;
  minWpm: number;
  minDirectness: number;
}> = [
  {
    stage: 1,
    label: 'Direct Anchoring',
    description: 'Breaking the L1 word-for-word loop via circumlocution and short daily turns.',
    minSessions: 0,
    minWpm: 0,
    minDirectness: 0,
  },
  {
    stage: 2,
    label: 'Chunked Flow',
    description: 'Opening with autopilot Starters and pre-compiled multi-word chunks.',
    minSessions: 3,
    minWpm: 85,
    minDirectness: 55,
  },
  {
    stage: 3,
    label: 'Compressed Automaticity',
    description: 'Driving down mid-clause pauses and fillers under 4/3/2 time pressure.',
    minSessions: 8,
    minWpm: 105,
    minDirectness: 68,
  },
  {
    stage: 4,
    label: 'Structured Spontaneity',
    description: 'Thinking in clean frameworks across tech, business, and Q&A curveballs.',
    minSessions: 15,
    minWpm: 120,
    minDirectness: 78,
  },
  {
    stage: 5,
    label: 'Unscripted Mastery',
    description: 'Sustained 135+ WPM natural American delivery with near-zero translation drag.',
    minSessions: 25,
    minWpm: 135,
    minDirectness: 86,
  },
];

export const BUILT_IN_SPINE_PACKS: ThinkAloudSpinePack[] = [
  {
    id: 'builtin_opinions_nuance',
    userId: 'system',
    isBuiltIn: true,
    title: 'Everyday Opinions & Nuance',
    domain: 'everyday',
    topic: 'Replacing repetitive "I think" with natural American stance spines',
    starters: [
      { id: 'op_s1', text: 'To be honest,', ipa: '/tə bi ˈɑːnɪst/', note: 'Buys 0.5s cleanly without sounding evasive' },
      { id: 'op_s2', text: 'The thing is,', ipa: '/ðə ˈθɪŋ ɪz/', note: 'Signals a practical core insight' },
      { id: 'op_s3', text: 'If you ask me,', ipa: '/ɪf jʊ ˈæsk mi/', note: 'Conversational opinion marker' },
      { id: 'op_s4', text: 'As far as I can tell,', ipa: '/əz ˈfɑːr əz aɪ kən ˈtɛl/', note: 'Epistemic hedge from observed evidence' },
      { id: 'op_s5', text: 'Honestly, I would say', ipa: '/ˈɑːnəstli aɪ wʊd ˈseɪ/', note: 'Softens direct claims naturally' },
    ],
    engines: [
      { id: 'op_e1', text: 'it comes down to [core factor]', ipa: '/ɪt kʌmz ˈdaʊn tə/', note: 'Cuts straight to the root driver' },
      { id: 'op_e2', text: 'it makes way more sense to [action]', ipa: '/ɪt meɪks ˈweɪ mɔːr ˈsɛns tə/', note: 'Practical recommendation' },
      { id: 'op_e3', text: 'I totally get why [person/group] feels that way', ipa: '/aɪ ˈtoʊtəli ɡɛt waɪ/', note: 'Validates before pivoting' },
      { id: 'op_e4', text: "I'm not convinced that [claim] holds up", ipa: '/aɪm nɑːt kənˈvɪnst ðæt/', note: 'Polite analytical pushback' },
      { id: 'op_e5', text: 'it really depends on [variable]', ipa: '/ɪt ˈrɪli dɪˈpɛndz ɑːn/', note: 'Balanced conditional framing' },
    ],
    tails: [
      { id: 'op_t1', text: 'especially when [specific condition].', ipa: '/ɪˈspɛʃəli wɛn/', note: 'Grounds abstract ideas in reality' },
      { id: 'op_t2', text: 'which basically means [consequence].', ipa: '/wɪtʃ ˈbeɪsɪkli minz/', note: 'Translates cause into outcome' },
      { id: 'op_t3', text: 'even though [counterpoint] on paper.', ipa: '/ˈivən ðoʊ/', note: 'Adds crisp contrast' },
      { id: 'op_t4', text: 'so I guess the real takeaway is [point].', ipa: '/soʊ aɪ ˈɡɛs/', note: 'Wraps the turn cleanly' },
      { id: 'op_t5', text: 'because otherwise you end up [downside].', ipa: '/bɪˈkəz ˈʌðərwaɪz/', note: 'Shows practical stakes' },
    ],
    chunks: [
      { id: 'op_c1', text: 'at the end of the day', ipa: '/æt ði ˈɛnd əv ðə ˈdeɪ/', example: 'At the end of the day, consistency beats intensity.' },
      { id: 'op_c2', text: 'hit the nail on the head', ipa: '/hɪt ðə ˈneɪl ɑːn ðə ˈhɛd/', example: 'You hit the nail on the head with that timing point.' },
      { id: 'op_c3', text: 'play it by ear', ipa: '/ˈpleɪ ɪt baɪ ˈɪr/', example: 'Let’s see how the morning goes and play it by ear.' },
      { id: 'op_c4', text: 'on the flip side', ipa: '/ɑːn ðə ˈflɪp saɪd/', example: 'On the flip side, moving too fast creates rework.' },
    ],
    practicedIds: [],
    totalItems: 19,
    practicedCount: 0,
    isCompleted: false,
    modelUsed: 'research-curated',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin_programming_ai',
    userId: 'system',
    isBuiltIn: true,
    title: 'Programming, AI & Architecture',
    domain: 'programming_ai',
    topic: 'Explaining technical decisions, trade-offs, and debugging cleanly',
    starters: [
      { id: 'ai_s1', text: 'From an architecture standpoint,', ipa: '/frʌm ən ˈɑːrkɪtɛktʃər ˈstændpɔɪnt/', note: 'Frames engineering trade-offs' },
      { id: 'ai_s2', text: 'What caught us off guard was', ipa: '/wʌt kɑːt əs ɔːf ˈɡɑːrd/', note: 'Great for post-mortems & bugs' },
      { id: 'ai_s3', text: 'Zooming out for a second,', ipa: '/ˈzumɪŋ ˈaʊt fər ə ˈsɛkənd/', note: 'Pulls listeners out of code weeds' },
      { id: 'ai_s4', text: 'The mental model I use here is', ipa: '/ðə ˈmɛntəl ˈmɑːdəl/', note: 'Signals a clean conceptual explanation' },
    ],
    engines: [
      { id: 'ai_e1', text: 'the bottleneck isn’t [X], it’s actually [Y]', ipa: '/ðə ˈbɑːtəlnɛk ˈɪzənt/', note: 'Reframes root cause crisply' },
      { id: 'ai_e2', text: 'we traded [short-term speed] for [long-term reliability]', ipa: '/wi ˈtreɪdɪd/', note: 'Articulates design trade-offs' },
      { id: 'ai_e3', text: 'this breaks down as soon as [edge case] scales', ipa: '/ðɪs breɪks ˈdaʊn/', note: 'Explains failure modes' },
      { id: 'ai_e4', text: 'keeping it deterministic up front lets the model focus on [task]', ipa: '/ˈkipɪŋ ɪt dɪˈtɜːrmɪnɪstɪk/', note: 'AI engineering framing' },
    ],
    tails: [
      { id: 'ai_t1', text: 'without adding extra moving parts.', ipa: '/wɪˈðaʊt ˈædɪŋ ˈɛkstrə ˈmuvɪŋ ˈpɑːrts/', note: 'Values simplicity' },
      { id: 'ai_t2', text: 'which cuts latency in half under load.', ipa: '/wɪtʃ kʌts ˈleɪtənsi/', note: 'Lands measurable impact' },
      { id: 'ai_t3', text: 'so we can iterate without rewriting the core.', ipa: '/soʊ wi kən ˈɪtəreɪt/', note: 'Shows maintainability' },
      { id: 'ai_t4', text: 'before it turns into silent tech debt.', ipa: '/bɪˈfɔːr ɪt ˈtɜːrnz ˈɪntə/', note: 'Actionable warning' },
    ],
    chunks: [
      { id: 'ai_c1', text: 'sanity check', ipa: '/ˈsænəti tʃɛk/', example: 'Let’s run a quick sanity check on the schema.' },
      { id: 'ai_c2', text: 'spin up', ipa: '/ˈspɪn ʌp/', example: 'We can spin up a fresh worker in seconds.' },
      { id: 'ai_c3', text: 'under the hood', ipa: '/ˈʌndər ðə ˈhʊd/', example: 'Under the hood, it streams tokens straight into SQLite.' },
      { id: 'ai_c4', text: 'diminishing returns', ipa: '/dɪˈmɪnɪʃɪŋ rɪˈtɜːrnz/', example: 'Past a certain prompt length, you hit diminishing returns.' },
    ],
    practicedIds: [],
    totalItems: 16,
    practicedCount: 0,
    isCompleted: false,
    modelUsed: 'research-curated',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin_business_econ',
    userId: 'system',
    isBuiltIn: true,
    title: 'Business, Strategy & Economics',
    domain: 'business_econ',
    topic: 'Discussing incentives, unit economics, pricing, and market trade-offs',
    starters: [
      { id: 'bz_s1', text: 'If you follow the incentives,', ipa: '/ɪf jʊ ˈfɑːloʊ ði ɪnˈsɛntɪvz/', note: 'Classic economics lens' },
      { id: 'bz_s2', text: 'On the unit-economics side,', ipa: '/ɑːn ðə ˈjunɪt ˌɛkəˈnɑːmɪks saɪd/', note: 'Grounds product talk in margins' },
      { id: 'bz_s3', text: 'At first glance it looks like [X], yet', ipa: '/æt ˈfɜːrst ˈɡlæns/', note: 'Sets up sharp contrast' },
      { id: 'bz_s4', text: 'In a tight market,', ipa: '/ɪn ə ˈtaɪt ˈmɑːrkɪt/', note: 'Sets macro context fast' },
    ],
    engines: [
      { id: 'bz_e1', text: 'the real lever isn’t [price], it’s [retention/distribution]', ipa: '/ðə ˈrɪl ˈlɛvər/', note: 'Identifies high-leverage variable' },
      { id: 'bz_e2', text: 'customers aren’t paying for [feature], they’re buying [outcome]', ipa: '/ˈkʌstəmərz ˈɑːrənt ˈpeɪɪŋ fər/', note: 'Jobs-to-be-done framing' },
      { id: 'bz_e3', text: 'that shifts the switching cost dramatically', ipa: '/ðæt ʃɪfts ðə ˈswɪtʃɪŋ kɑːst/', note: 'Strategic moat phrasing' },
      { id: 'bz_e4', text: 'supply catches up way slower than demand expects', ipa: '/səˈplaɪ ˈkætʃɪz ʌp/', note: 'Macro/market dynamics' },
    ],
    tails: [
      { id: 'bz_t1', text: 'which compounds over a 12-month cycle.', ipa: '/wɪtʃ kəmˈpaʊndz/', note: 'Long-horizon payoff' },
      { id: 'bz_t2', text: 'and that shows up straight in gross margin.', ipa: '/ˈɡroʊs ˈmɑːrdʒɪn/', note: 'Ties back to P&L' },
      { id: 'bz_t3', text: 'until competitors copy the baseline.', ipa: '/ənˈtɪl kəmˈpɛtɪtərz/', note: 'Dynamic competitive view' },
      { id: 'bz_t4', text: 'so timing matters just as much as execution.', ipa: '/soʊ ˈtaɪmɪŋ ˈmætərz/', note: 'Crisp synthesis' },
    ],
    chunks: [
      { id: 'bz_c1', text: 'move the needle', ipa: '/ˈmuv ðə ˈnidəl/', example: 'Will that feature actually move the needle on retention?' },
      { id: 'bz_c2', text: 'baked into the price', ipa: '/ˈbeɪkt ˈɪntə ðə ˈpraɪs/', example: 'Support overhead has to be baked into the price.' },
      { id: 'bz_c3', text: 'runway vs burn', ipa: '/ˈrʌnweɪ vɜːrsəs ˈbɜːrn/', example: 'They cut non-core experiments to protect runway.' },
      { id: 'bz_c4', text: 'second-order effect', ipa: '/ˈsɛkənd ˈɔːrdər ɪˈfɛkt/', example: 'The second-order effect was higher churn among small teams.' },
    ],
    practicedIds: [],
    totalItems: 16,
    practicedCount: 0,
    isCompleted: false,
    modelUsed: 'research-curated',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin_camera_hooks',
    userId: 'system',
    isBuiltIn: true,
    title: 'Unscripted Camera Hooks & Bridges',
    domain: 'camera_creator',
    topic: 'Speaking cleanly to a lens without reading a teleprompter',
    starters: [
      { id: 'cm_s1', text: 'Here’s something nobody tells you about [topic]:', ipa: '/hɪrz ˈsʌmθɪŋ ˈnoʊbɑːdi/', note: 'Instant curiosity hook' },
      { id: 'cm_s2', text: 'I used to think [myth], until', ipa: '/aɪ ˈjustə θɪŋk/', note: 'Relatable transformation arc' },
      { id: 'cm_s3', text: 'Let’s break this down in plain English:', ipa: '/lɛts breɪk ðɪs ˈdaʊn/', note: 'Signals clarity on camera' },
      { id: 'cm_s4', text: 'Quick story—so earlier today,', ipa: '/kwɪk ˈstɔːri/', note: 'Natural unscripted segue' },
    ],
    engines: [
      { id: 'cm_e1', text: 'I ran into this exact problem when I tried to [action]', ipa: '/aɪ ræn ˈɪntə/', note: 'Personal proof beats theory' },
      { id: 'cm_e2', text: 'most people focus on [surface detail], when the real fix is [X]', ipa: '/ˈmoʊst ˈpipəl ˈfoʊkəs ɑːn/', note: 'Contrastive value hook' },
      { id: 'cm_e3', text: 'if I had to strip this down to one rule, it’s [rule]', ipa: '/strɪp ðɪs ˈdaʊn/', note: 'Memorable camera takeaway' },
    ],
    tails: [
      { id: 'cm_t1', text: 'and honestly, that changed how I approach [X].', ipa: '/ənd ˈɑːnəstli/', note: 'Warm conversational wrap' },
      { id: 'cm_t2', text: 'so try that on your next [project/session] and see.', ipa: '/soʊ ˈtraɪ ðæt/', note: 'Direct conversational CTA' },
      { id: 'cm_t3', text: 'which brings us right back to [main point].', ipa: '/wɪtʃ brɪŋz əs/', note: 'Smoothly closes loops on camera' },
    ],
    chunks: [
      { id: 'cm_c1', text: 'long story short', ipa: '/ˈlɔːŋ ˈstɔːri ˈʃɔːrt/', example: 'Long story short, we shipped the fix before noon.' },
      { id: 'cm_c2', text: 'bear with me here', ipa: '/ˈbɛr wɪθ mi hɪr/', example: 'Bear with me here—this sounds counterintuitive at first.' },
      { id: 'cm_c3', text: 'off the top of my head', ipa: '/ɔːf ðə ˈtɑːp əv maɪ ˈhɛd/', example: 'Off the top of my head, there are two ways to handle that.' },
      { id: 'cm_c4', text: 'to put it simply', ipa: '/tə ˈpʊt ɪt ˈsɪmpli/', example: 'To put it simply, speed kills hesitation.' },
    ],
    practicedIds: [],
    totalItems: 14,
    practicedCount: 0,
    isCompleted: false,
    modelUsed: 'research-curated',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin_qa_buffers',
    userId: 'system',
    isBuiltIn: true,
    title: 'Buying Time & Q&A Paraphrase Buffers',
    domain: 'tech_systems',
    topic: 'Matt Abrahams paraphrase buffers & "Yes, and" bridges under pressure',
    starters: [
      { id: 'qa_s1', text: 'So if I’m hearing you right, you’re asking about [topic]—', ipa: '/soʊ ɪf aɪm ˈhɪrɪŋ jʊ ˈraɪt/', note: 'Paraphrase buffer buys 3s & confirms alignment' },
      { id: 'qa_s2', text: 'That’s a fair pushback, and', ipa: '/ðæts ə ˈfɛr ˈpʊʃbæk/', note: 'Acknowledges emotion without defensiveness' },
      { id: 'qa_s3', text: 'Yes, and to build on that point,', ipa: '/jɛs ənd tə ˈbɪld ɑːn/', note: 'Collaborative improv bridge' },
      { id: 'qa_s4', text: 'Let me take a step back on that—', ipa: '/lɛt mi ˈteɪk ə ˈstɛp bæk/', note: 'Buys time to organize 2–3 beats' },
    ],
    engines: [
      { id: 'qa_e1', text: 'there are two pieces to unpack here: [A] and [B]', ipa: '/ðɛr ɑːr ˈtu ˈpisəz/', note: 'Chunks answer so listeners track easily' },
      { id: 'qa_e2', text: 'where that assumption holds is [X], while [Y] needs [Z]', ipa: '/wɛr ðæt əˈsʌmpʃən ˈhoʊldz/', note: 'Nuanced Q&A defense' },
      { id: 'qa_e3', text: 'the short answer is [stance], and here’s why:', ipa: '/ðə ˈʃɔːrt ˈænsər ɪz/', note: 'Bottom-line-up-front clarity' },
    ],
    tails: [
      { id: 'qa_t1', text: '—does that address what you had in mind?', ipa: '/dəz ðæt əˈdrɛs/', note: 'Reframes Q&A as conversation' },
      { id: 'qa_t2', text: 'and I’m happy to dig deeper into [detail] if helpful.', ipa: '/tə dɪɡ ˈdipər/', note: 'Controls depth cleanly' },
      { id: 'qa_t3', text: 'so that’s the trade-off we’re optimizing for.', ipa: '/ˈɑːptəmaɪzɪŋ fɔːr/', note: 'Crisp closing anchor' },
    ],
    chunks: [
      { id: 'qa_c1', text: 'bottom line up front', ipa: '/ˈbɑːtəm laɪn ʌp ˈfrʌnt/', example: 'Bottom line up front: we can ship Tuesday if we cut scope.' },
      { id: 'qa_c2', text: 'meet halfway', ipa: '/ˈmit hæfˈweɪ/', example: 'Here’s how we can meet halfway on latency.' },
      { id: 'qa_c3', text: 'on the same page', ipa: '/ɑːn ðə ˈseɪm ˈpeɪdʒ/', example: 'Just to make sure we’re on the same page on priorities...' },
    ],
    practicedIds: [],
    totalItems: 13,
    practicedCount: 0,
    isCompleted: false,
    modelUsed: 'research-curated',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin_inner_monologue',
    userId: 'system',
    isBuiltIn: true,
    title: '5 Modes of Inner Monologue (Keith V19)',
    domain: 'everyday',
    topic: 'Planning, self-commands, problem-solving, ideas & reflection in English',
    starters: [
      { id: 'im_s1', text: 'Alright, what I actually need to do right now is', ipa: '/ɔːlˈraɪt wʌt aɪ ˈæktʃəli/', note: 'Self-command & focus shift' },
      { id: 'im_s2', text: 'Wait—why didn’t I notice that', ipa: '/weɪt waɪ ˈdɪdənt aɪ/', note: 'Natural reflective thought' },
      { id: 'im_s3', text: 'Why don’t I just', ipa: '/waɪ ˈdoʊnt aɪ dʒʌst/', note: 'Spontaneous idea generation' },
      { id: 'im_s4', text: 'Looking back, I probably should have', ipa: '/ˈlʊkɪŋ ˈbæk/', note: 'Counterfactual reflection' },
    ],
    engines: [
      { id: 'im_e1', text: 'knock out [small task] before [larger block]', ipa: '/ˈnɑːk aʊt/', note: 'Action planning' },
      { id: 'im_e2', text: 'figure out why [thing] feels off today', ipa: '/ˈfɪɡjər aʊt waɪ/', note: 'Internal problem-solving' },
      { id: 'im_e3', text: 'keep it simple instead of overthinking [X]', ipa: '/ˈkip ɪt ˈsɪmpəl/', note: 'Anti-perfectionism cue' },
    ],
    tails: [
      { id: 'im_t1', text: 'and then see how much time is left.', ipa: '/ənd ðɛn ˈsi/', note: 'Natural day pacing' },
      { id: 'im_t2', text: 'so I don’t burn an hour on the wrong thing.', ipa: '/soʊ aɪ doʊnt ˈbɜːrn/', note: 'Practical self-talk' },
      { id: 'im_t3', text: '—okay, let’s just get moving.', ipa: '/lɛts dʒʌst ɡɛt ˈmuvɪŋ/', note: 'Action trigger' },
    ],
    chunks: [
      { id: 'im_c1', text: 'wrap my head around', ipa: '/ˈræp maɪ ˈhɛd əˈraʊnd/', example: 'Give me a second to wrap my head around this bug.' },
      { id: 'im_c2', text: 'call it a day', ipa: '/ˈkɑːl ɪt ə ˈdeɪ/', example: 'Let’s finish this test and call it a day.' },
      { id: 'im_c3', text: 'get the ball rolling', ipa: '/ɡɛt ðə ˈbɑːl ˈroʊlɪŋ/', example: 'I’ll draft the outline first just to get the ball rolling.' },
    ],
    practicedIds: [],
    totalItems: 13,
    practicedCount: 0,
    isCompleted: false,
    modelUsed: 'research-curated',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const SINGLE_FILLERS = ['um', 'uh', 'er', 'ah', 'erm', 'hmm'];
const MULTI_FILLERS = ['you know', 'i mean', 'sort of', 'kind of', 'basically', 'actually'];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function detectFillers(text: string): string[] {
  const lower = String(text || '').toLowerCase();
  if (!lower.trim()) return [];
  const found: string[] = [];

  for (const w of SINGLE_FILLERS) {
    const matches = lower.match(new RegExp(`\\b${escapeRegExp(w)}\\b`, 'g'));
    if (matches) {
      for (const m of matches) found.push(m);
    }
  }

  for (const phrase of MULTI_FILLERS) {
    const matches = lower.match(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'g'));
    if (matches) {
      for (const m of matches) found.push(m);
    }
  }

  // Detect hedging "like" (e.g. ", like," or "like um" or repeated "like like") without penalizing "I like coffee"
  const likeHedges = lower.match(/(?:,\s*like\b|\blike\s*,|\blike\s+(?:um|uh|you know)\b)/g);
  if (likeHedges) {
    for (const _ of likeHedges) found.push('like');
  }

  return found;
}

export function detectForbiddenWords(transcript: string, forbiddenWords: string[] = []): string[] {
  const lower = String(transcript || '').toLowerCase();
  if (!lower.trim() || !Array.isArray(forbiddenWords) || forbiddenWords.length === 0) return [];
  const hits: string[] = [];
  for (const raw of forbiddenWords) {
    const w = String(raw || '').trim().toLowerCase();
    if (!w) continue;
    const re = new RegExp(`\\b${escapeRegExp(w)}(?:s|es|ed|ing)?\\b`, 'i');
    if (re.test(lower)) {
      hits.push(raw);
    }
  }
  return hits;
}

export function computeFluencyMetrics(
  mode: ThinkAloudMode,
  rounds: SpeakingRoundInput[],
  promptMeta: ThinkAloudPromptMeta = {},
): FluencyMetrics {
  const safeRounds = Array.isArray(rounds) ? rounds : [];
  const cardById = new Map<string, string[]>(
    (promptMeta.cards || []).map((c) => [c.id, c.forbiddenWords || []]),
  );

  const computedRounds: SpeakingRoundMetrics[] = safeRounds.map((r, idx) => {
    const transcript = String(r.transcript || '').replace(/\s+/g, ' ').trim();
    const tokens = transcript ? transcript.split(/\s+/).filter(Boolean) : [];
    const wordCount = tokens.length;
    const actualDurationSec = Math.max(1, Math.round(Number(r.actualDurationSec) || Number(r.targetDurationSec) || 1));
    const wpm = wordCount > 0 ? Math.round((wordCount / actualDurationSec) * 600) / 10 : 0;
    const fillersFound = detectFillers(transcript);
    const fillerCount = fillersFound.length;
    const fillerRatePer100 = wordCount > 0 ? Math.round((fillerCount / wordCount) * 1000) / 10 : 0;

    const normalizedWords = tokens
      .map((t) => t.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, ''))
      .filter(Boolean);
    const uniqueWordRatio =
      normalizedWords.length > 0
        ? Math.round((new Set(normalizedWords).size / normalizedWords.length) * 100) / 100
        : 0;

    const forbiddenList =
      Array.isArray(r.forbiddenWords) && r.forbiddenWords.length > 0
        ? r.forbiddenWords
        : (r.conceptId ? cardById.get(r.conceptId) : []) || [];
    const forbiddenHits = detectForbiddenWords(transcript, forbiddenList);

    return {
      roundIndex: Number(r.roundIndex) || idx + 1,
      label: String(r.label || `Round ${idx + 1}`).trim(),
      targetDurationSec: Math.max(1, Math.round(Number(r.targetDurationSec) || actualDurationSec)),
      actualDurationSec,
      transcript,
      wordCount,
      wpm,
      fillerCount,
      fillersFound,
      fillerRatePer100,
      uniqueWordRatio,
      forbiddenHits,
      conceptId: r.conceptId,
      conceptLabel: r.conceptLabel,
      curveballTriggered: Boolean(r.curveballTriggered),
    };
  });

  const totalWords = computedRounds.reduce((s, r) => s + r.wordCount, 0);
  const totalDurationSec = computedRounds.reduce((s, r) => s + r.actualDurationSec, 0);
  const avgWpm = totalDurationSec > 0 ? Math.round((totalWords / totalDurationSec) * 600) / 10 : 0;
  const totalFillers = computedRounds.reduce((s, r) => s + r.fillerCount, 0);
  const fillerRatePer100 = totalWords > 0 ? Math.round((totalFillers / totalWords) * 1000) / 10 : 0;

  const allTokens = computedRounds
    .flatMap((r) => r.transcript.split(/\s+/))
    .map((t) => t.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, ''))
    .filter(Boolean);
  const uniqueWordRatio =
    allTokens.length > 0 ? Math.round((new Set(allTokens).size / allTokens.length) * 100) / 100 : 0;

  let wpmGainPct = 0;
  if (mode === 'four_three_two' && computedRounds.length >= 2) {
    const firstWpm = computedRounds[0].wpm;
    const lastWpm = computedRounds[computedRounds.length - 1].wpm;
    if (firstWpm > 0) {
      wpmGainPct = Math.round(((lastWpm - firstWpm) / firstWpm) * 1000) / 10;
    }
  }

  const forbiddenHitsTotal = computedRounds.reduce((s, r) => s + r.forbiddenHits.length, 0);

  return {
    totalWords,
    totalDurationSec,
    avgWpm,
    totalFillers,
    fillerRatePer100,
    uniqueWordRatio,
    wpmGainPct,
    forbiddenHitsTotal,
    rounds: computedRounds,
  };
}

export function computeAutomaticityStage(stats: {
  totalSessions: number;
  avgWpm: number;
  avgDirectness: number;
}): AutomaticityStageInfo {
  const totalSessions = Math.max(0, Number(stats.totalSessions) || 0);
  const avgWpm = Math.max(0, Number(stats.avgWpm) || 0);
  const avgDirectness = Math.max(0, Number(stats.avgDirectness) || 0);

  let current = AUTOMATICITY_STAGES[0];
  for (const tier of AUTOMATICITY_STAGES) {
    if (
      totalSessions >= tier.minSessions &&
      avgWpm >= tier.minWpm &&
      avgDirectness >= tier.minDirectness
    ) {
      current = tier;
    }
  }

  const next = AUTOMATICITY_STAGES.find((t) => t.stage === current.stage + 1);
  if (!next) {
    return {
      stage: current.stage,
      label: current.label,
      description: current.description,
      nextStageLabel: 'Mastery Maintained',
      progressPct: 100,
    };
  }

  const sessRatio = Math.min(1, totalSessions / Math.max(1, next.minSessions));
  const wpmRatio = next.minWpm > 0 ? Math.min(1, avgWpm / next.minWpm) : 1;
  const dirRatio = next.minDirectness > 0 ? Math.min(1, avgDirectness / next.minDirectness) : 1;
  const progressPct = Math.max(5, Math.min(99, Math.round(((sessRatio + wpmRatio + dirRatio) / 3) * 100)));

  return {
    stage: current.stage,
    label: current.label,
    description: current.description,
    nextStageLabel: `Stage ${next.stage}: ${next.label}`,
    progressPct,
  };
}

function clampScore(v: any, fallback = 72): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function normalizeCoachingReport(raw: any, fallbackTranscript: string): CoachingReport {
  const directnessScore = clampScore(raw?.directnessScore, 70);
  const flowScore = clampScore(raw?.flowScore, 70);
  const structureScore = clampScore(raw?.structureScore, 70);
  const naturalnessScore = clampScore(raw?.naturalnessScore, 70);
  const overallScore = clampScore(
    raw?.overallScore,
    Math.round((directnessScore + flowScore + structureScore + naturalnessScore) / 4),
  );

  const validIssues = new Set([
    'calque',
    'translation_pause',
    'stiff_textbook',
    'wordiness',
    'vague',
  ]);

  const calquesAndUpgrades = (Array.isArray(raw?.calquesAndUpgrades) ? raw.calquesAndUpgrades : [])
    .slice(0, 8)
    .map((c: any) => ({
      original: String(c?.original || '').trim(),
      issueType: (validIssues.has(String(c?.issueType)) ? c.issueType : 'stiff_textbook') as any,
      whyUnnatural: String(c?.whyUnnatural || '').trim(),
      naturalUpgrade: String(c?.naturalUpgrade || '').trim(),
      spokenIpa: String(c?.spokenIpa || '').trim(),
      exampleSentence: String(c?.exampleSentence || '').trim(),
    }))
    .filter((c: any) => c.original && c.naturalUpgrade);

  const extractedChunks = (Array.isArray(raw?.extractedChunks) ? raw.extractedChunks : [])
    .slice(0, 6)
    .map((ch: any) => ({
      phrase: String(ch?.phrase || '').trim(),
      patternSlot: String(ch?.patternSlot || ch?.phrase || '').trim(),
      ipa: String(ch?.ipa || '').trim(),
      meaning: String(ch?.meaning || '').trim(),
      localizedMeaning: String(ch?.localizedMeaning || '').trim(),
      whenToUse: String(ch?.whenToUse || '').trim(),
      example: String(ch?.example || '').trim(),
    }))
    .filter((ch: any) => ch.phrase);

  const strengths = (Array.isArray(raw?.strengths) ? raw.strengths : [])
    .map((s: any) => String(s || '').trim())
    .filter(Boolean)
    .slice(0, 4);

  return {
    directnessScore,
    flowScore,
    structureScore,
    naturalnessScore,
    overallScore,
    headlineVerdict:
      String(raw?.headlineVerdict || '').trim() ||
      'Solid spontaneous turn — keep compressing setup phrases into crisp chunks.',
    strengths:
      strengths.length > 0
        ? strengths
        : ['You stayed in English and pushed your idea through to completion.'],
    calquesAndUpgrades,
    shadowableRecast:
      String(raw?.shadowableRecast || '').trim() || fallbackTranscript || 'Great effort—keep speaking directly.',
    extractedChunks,
    microMission:
      String(raw?.microMission || '').trim() ||
      'Run one 60-second sprint tomorrow starting directly with your main point in the first 5 seconds.',
    curveballFeedback: raw?.curveballFeedback ? String(raw.curveballFeedback).trim() : undefined,
  };
}
