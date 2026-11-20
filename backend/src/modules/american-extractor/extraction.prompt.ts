import { getLanguage, LanguageOption } from '../../core/ai/languages';
import { ExtractionFocusOption, ResolvedSource } from './american-extractor.types';

export type ExtractionFocus = ExtractionFocusOption;

export const EXTRACTION_TYPES: ExtractionFocusOption[] = [
  {
    id: 'all',
    label: 'All types · balanced mix (Default)',
    shortLabel: 'All types',
    prompt:
      'Extract a high-ROI mix across idioms, phrasal verbs, collocations, slang, discourse markers, sentence patterns, connected speech, and standout vocabulary.',
  },
  {
    id: 'vocabulary',
    label: 'Vocabulary & hard words only',
    shortLabel: 'Vocabulary',
    prompt:
      'STRICT TYPE FILTER: Extract ONLY single words and tight lexical vocabulary items (precise verbs, expressive adjectives, nuanced nouns). Every item MUST have "category": "vocabulary".',
  },
  {
    id: 'idiom',
    label: 'Idioms & expressions only',
    shortLabel: 'Idioms',
    prompt:
      'STRICT TYPE FILTER: Extract ONLY figurative idioms and colorful multi-word expressions whose meaning goes beyond literal word-by-word reading. Every item MUST have "category": "idiom".',
  },
  {
    id: 'slang',
    label: 'Slang & street talk only',
    shortLabel: 'Slang',
    prompt:
      'STRICT TYPE FILTER: Extract ONLY informal American slang, street talk, pop-culture, and casual internet-native expressions. Every item MUST have "category": "slang".',
  },
  {
    id: 'phrasal_verb',
    label: 'Phrasal verbs only',
    shortLabel: 'Phrasal verbs',
    prompt:
      'STRICT TYPE FILTER: Extract ONLY phrasal verbs (verb + particle/preposition units with shifted or idiomatic meaning, e.g., "double down on", "iron out"). Every item MUST have "category": "phrasal_verb".',
  },
  {
    id: 'collocation',
    label: 'Collocations only',
    shortLabel: 'Collocations',
    prompt:
      'STRICT TYPE FILTER: Extract ONLY natural native American word partnerships and collocations (verb+noun, adjective+noun, adverb+adjective pairs). Every item MUST have "category": "collocation".',
  },
  {
    id: 'connected_speech',
    label: 'Connected speech & reductions only',
    shortLabel: 'Connected speech',
    prompt:
      'STRICT TYPE FILTER: Extract ONLY spoken connected-speech items, contractions, reductions, linking, flap-T, and fast-speech forms evidenced in the source (with General American IPA and physical mouth mechanics in "spokenNote"). Every item MUST have "category": "connected_speech".',
  },
  {
    id: 'discourse_marker',
    label: 'Discourse markers & transitions only',
    shortLabel: 'Discourse markers',
    prompt:
      'STRICT TYPE FILTER: Extract ONLY spoken or written discourse markers, conversational pivots, hedging moves, and framing phrases (e.g., "that being said", "at the end of the day"). Every item MUST have "category": "discourse_marker".',
  },
  {
    id: 'pattern',
    label: 'Sentence patterns & frames only',
    shortLabel: 'Patterns',
    prompt:
      'STRICT TYPE FILTER: Extract ONLY reusable sentence patterns, grammatical frames, and conversational templates grounded in the source. Every item MUST have "category": "pattern".',
  },
  {
    id: 'phrases',
    label: 'Multi-word phrases (Idioms + Phrasal + Slang)',
    shortLabel: 'Phrases only',
    prompt:
      'STRICT TYPE FILTER: Extract ONLY multi-word expressions (idioms, phrasal verbs, slang phrases, collocations, discourse markers, and sentence patterns). Every item MUST contain 2 or more words; skip isolated single vocabulary words.',
  },
];

export const EXTRACTION_STYLES: ExtractionFocusOption[] = [
  {
    id: 'auto',
    label: 'Auto · match source style (Default)',
    shortLabel: 'Auto style',
    prompt:
      'Match the source register naturally—capture whatever authentic American slang, casual, standard, or professional language genuinely stands out.',
  },
  {
    id: 'american_slang',
    label: 'American slang & street English',
    shortLabel: 'American slang',
    prompt:
      'Prioritize authentic American slang, street talk, vernacular, and informal colloquial expressions (casual/slang register). Skip stiff textbook phrasing.',
  },
  {
    id: 'standard_american',
    label: 'Standard American English (General US)',
    shortLabel: 'Standard English',
    prompt:
      'Prioritize clean, widely understood General American English suitable for everyday educated conversation and clear communication.',
  },
  {
    id: 'casual_spoken',
    label: 'Casual & conversational spoken',
    shortLabel: 'Casual spoken',
    prompt:
      'Prioritize relaxed, natural everyday spoken American English—friendly banter, contractions, softeners, and conversational habits among friends or coworkers.',
  },
  {
    id: 'professional_workplace',
    label: 'Professional, tech & business',
    shortLabel: 'Professional',
    prompt:
      'Prioritize workplace, corporate, startup, engineering, and leadership American English—diplomatic phrasing, meeting idioms, precise action verbs, and business collocations.',
  },
  {
    id: 'academic_formal',
    label: 'Academic, literary & formal',
    shortLabel: 'Formal & academic',
    prompt:
      'Prioritize elevated, analytical, journalistic, literary, and formal American English—sophisticated register, rhetorical transitions, and precise formal vocabulary.',
  },
  {
    id: 'modern_internet',
    label: 'Internet, creator & Gen-Z culture',
    shortLabel: 'Internet & creator',
    prompt:
      'Prioritize contemporary creator, social-media, livestream, and Gen-Z/millennial American English expressions.',
  },
];

export const EXTRACTION_LEVELS: ExtractionFocusOption[] = [
  {
    id: 'all',
    label: 'All levels · adaptive to source (Default)',
    shortLabel: 'All levels',
    prompt:
      'Calibrate adaptively across CEFR A1–C2 to surface the highest-value, most teachable American English items naturally present in this source.',
  },
  {
    id: 'a1',
    label: 'A1 · Beginner (Foundational)',
    shortLabel: 'A1 Beginner',
    prompt:
      'Target CEFR A1 (Beginner): Focus on foundational high-frequency words, basic daily phrases, simple connectors, and core building blocks a beginner needs to understand this source.',
  },
  {
    id: 'a2',
    label: 'A2 · Elementary (Daily basics)',
    shortLabel: 'A2 Elementary',
    prompt:
      'Target CEFR A2 (Elementary): Focus on practical everyday expressions, common basic phrasal verbs, routine social phrasing, and useful daily vocabulary.',
  },
  {
    id: 'b1',
    label: 'B1 · Intermediate (Core fluency)',
    shortLabel: 'B1 Intermediate',
    prompt:
      'Target CEFR B1 (Intermediate): Focus on common everyday idioms, practical phrasal verbs, natural conversational connectors, and solid intermediate vocabulary.',
  },
  {
    id: 'b2',
    label: 'B2 · Upper-Intermediate (Natural expression)',
    shortLabel: 'B2 Upper-Int',
    prompt:
      'Target CEFR B2 (Upper-Intermediate): Focus on natural fluency builders, expressive idioms, nuanced verbs, and everyday/workplace collocations.',
  },
  {
    id: 'c1',
    label: 'C1 · Advanced (Nuanced & idiomatic)',
    shortLabel: 'C1 Advanced',
    prompt:
      'Target CEFR C1 (Advanced): Skip basic A1–B1 words; extract sophisticated vocabulary, nuanced idioms, subtle tone shifts, and native-level collocations.',
  },
  {
    id: 'c2',
    label: 'C2 · Mastery (Rare & native-like)',
    shortLabel: 'C2 Mastery',
    prompt:
      'Target CEFR C2 (Mastery): Skip routine B1–B2 items; hunt strictly for rare, vivid, culturally rich, literary, or razor-sharp native expressions even fluent speakers miss.',
  },
  {
    id: 'a1_a2',
    label: 'A1–A2 · Foundational essentials',
    shortLabel: 'A1–A2',
    prompt:
      'Target CEFR A1–A2 (Foundational): Extract high-frequency everyday words and simple practical phrases accessible to beginner and elementary learners.',
  },
  {
    id: 'b1_b2',
    label: 'B1–B2 · Intermediate bridge',
    shortLabel: 'B1–B2',
    prompt:
      'Target CEFR B1–B2 (Intermediate bridge): Focus on practical spoken phrases, core phrasal verbs, and high-frequency idioms that move learners from textbook English to natural speech.',
  },
  {
    id: 'b2_c2',
    label: 'B2–C2 · Advanced fluency',
    shortLabel: 'B2–C2',
    prompt:
      'Target CEFR B2–C2 (Advanced): Skip elementary A1–B1 words, textbook filler, and basic nouns unless inside an idiom or fresh collocation.',
  },
];

export const EXTRACTION_FOCUSES: ExtractionFocusOption[] = [
  {
    id: 'balanced',
    label: 'Balanced · any topic (Default)',
    shortLabel: 'Any topic',
    prompt:
      'Keep a balanced mix across everyday conversation, professional speech, idioms, collocations, and connected speech.',
  },
  {
    id: 'professional',
    label: 'Professional & engineering',
    shortLabel: 'Tech & work',
    prompt:
      'Weight toward professional American English used by experienced engineers, founders, and product leaders: precise verbs, meeting phrasing, diplomatic pushback, and technical collocations.',
  },
  {
    id: 'everyday',
    label: 'Everyday & social',
    shortLabel: 'Everyday',
    prompt:
      'Weight toward casual conversation, social nuance, reactions, humor, and fast-speech reductions.',
  },
  {
    id: 'creator',
    label: 'Creator & podcast English',
    shortLabel: 'Creator & podcast',
    prompt:
      'Weight toward podcast, YouTube, and livestream hosting language: framing, storytelling pivots, audience address, commentary, and natural filler management.',
  },
  {
    id: 'media',
    label: 'Movies, TV & storytelling',
    shortLabel: 'Movies & TV',
    prompt:
      'Weight toward cinematic dialogue, emotional subtext, witty banter, dramatic turns, and expressive spoken lines.',
  },
  {
    id: 'news_tech',
    label: 'News, essays & commentary',
    shortLabel: 'News & essays',
    prompt:
      'Weight toward journalism, opinion essays, analytical framing, persuasive rhetoric, and current-affairs phrasing.',
  },
];

export const EXTRACTION_DEPTHS: ExtractionFocusOption[] = [
  {
    id: 'adaptive',
    label: 'Balanced · adaptive to source (Default)',
    shortLabel: 'Adaptive count',
    prompt:
      'Adaptive count: Let source richness decide (short excerpt 6–12; medium clip 12–20; dense section 18–26). Never pad with weak filler.',
  },
  {
    id: 'essentials',
    label: 'Essentials · top 5–8 gems only',
    shortLabel: 'Top 5–8',
    prompt:
      'Strict curation: Return ONLY the top 5–8 highest-ROI, most memorable items from this excerpt (fewer if the source is tiny).',
  },
  {
    id: 'focused',
    label: 'Focused · 10–15 key items',
    shortLabel: '10–15 items',
    prompt:
      'Curated count: Target 10–15 high-utility items (or fewer if the source is short). Prioritize practical fluency over exhaustiveness.',
  },
  {
    id: 'comprehensive',
    label: 'Comprehensive · deep sweep (every gem)',
    shortLabel: 'Deep sweep',
    prompt:
      'Exhaustive sweep: Extract every distinct, source-grounded, study-worthy item matching the filters across the entire excerpt (up to 35 per chunk) without duplicating.',
  },
];

export const EXTRACTION_GOALS: ExtractionFocusOption[] = [
  {
    id: 'full',
    label: 'Full study · meaning, usage & speaking (Default)',
    shortLabel: 'Full study',
    prompt:
      'Give crisp contextual meanings, practical American tone/usage guidance, natural spoken examples, and General American pronunciation tips.',
  },
  {
    id: 'speaking',
    label: 'Speaking & shadowing · pronunciation & flow',
    shortLabel: 'Speaking & flow',
    prompt:
      'Prioritize spoken delivery: make "spokenNote" concrete and actionable (flap-T /ɾ/, schwa /ə/, consonant-vowel linking, primary stress, rhythm) on every item, and craft "example" as rhythmic out-loud American speech.',
  },
  {
    id: 'active_recall',
    label: 'Deep mastery · pitfalls & memory hooks',
    shortLabel: 'Pitfalls & recall',
    prompt:
      'Prioritize retention: use "usageNote" to contrast natural American usage against textbook phrasing, flag common learner pitfalls, and provide memorable spoken examples.',
  },
  {
    id: 'workplace',
    label: 'Workplace · tone, diplomacy & swaps',
    shortLabel: 'Workplace tone',
    prompt:
      'Prioritize professional calibration: use "usageNote" to clarify exact appropriateness (standup vs executive email vs casual chat) and safe neutral swaps.',
  },
  {
    id: 'flashcards',
    label: 'Quick flashcards · ultra-crisp & concise',
    shortLabel: 'Flashcards',
    prompt:
      'Keep "meaning", "usageNote", and "example" ultra-crisp, punchy, and compact for fast active-recall flashcard review.',
  },
];

export const EXTRACTION_ORDERS: ExtractionFocusOption[] = [
  {
    id: 'appearance',
    label: 'Source order · follow along (Default)',
    shortLabel: 'Source order',
    prompt:
      'Order "items" in the exact sequence they first appear in the source so the learner can follow along.',
  },
  {
    id: 'importance',
    label: 'Most useful first · high-ROI at top',
    shortLabel: 'Most useful first',
    prompt:
      'Order "items" from highest practical usefulness and everyday American frequency at the top to niche at the bottom.',
  },
  {
    id: 'difficulty',
    label: 'Hardest first · most challenging at top',
    shortLabel: 'Hardest first',
    prompt:
      'Order "items" from most challenging, nuanced, or advanced (C2/C1) at the top to simpler (B1/A2) at the bottom.',
  },
];

function findOption(list: ExtractionFocusOption[], id?: string): ExtractionFocusOption {
  const clean = String(id || '').trim().toLowerCase();
  return list.find((option) => option.id === clean) || list[0];
}

export function normalizeExtractionType(id?: string): ExtractionFocusOption {
  return findOption(EXTRACTION_TYPES, id);
}

export function normalizeStyle(id?: string): ExtractionFocusOption {
  return findOption(EXTRACTION_STYLES, id);
}

export function normalizeLevel(id?: string): ExtractionFocusOption {
  return findOption(EXTRACTION_LEVELS, id);
}

export function normalizeFocus(focusId?: string): ExtractionFocusOption {
  return findOption(EXTRACTION_FOCUSES, focusId);
}

export function normalizeDepth(id?: string): ExtractionFocusOption {
  return findOption(EXTRACTION_DEPTHS, id);
}

export function normalizeStudyGoal(id?: string): ExtractionFocusOption {
  return findOption(EXTRACTION_GOALS, id);
}

export function normalizeOrder(id?: string): ExtractionFocusOption {
  return findOption(EXTRACTION_ORDERS, id);
}

export function buildExtractionPrompts(params: {
  source: ResolvedSource;
  chunkText?: string;
  chunkIndex?: number;
  totalChunks?: number;
  excludeTerms?: string[];
  targetLanguage?: string;
  extractionType?: string;
  style?: string;
  level?: string;
  focus?: string;
  depth?: string;
  studyGoal?: string;
  order?: string;
}): {
  systemPrompt: string;
  userPrompt: string;
  language: LanguageOption;
  extractionType: ExtractionFocusOption;
  style: ExtractionFocusOption;
  level: ExtractionFocusOption;
  focus: ExtractionFocusOption;
  depth: ExtractionFocusOption;
  studyGoal: ExtractionFocusOption;
  order: ExtractionFocusOption;
} {
  const language = getLanguage(params.targetLanguage);
  const extractionType = normalizeExtractionType(params.extractionType);
  const style = normalizeStyle(params.style);
  const level = normalizeLevel(params.level);
  const focus = normalizeFocus(params.focus);
  const depth = normalizeDepth(params.depth);
  const studyGoal = normalizeStudyGoal(params.studyGoal);
  const order = normalizeOrder(params.order);
  const isEnglishTarget = language.code === 'en';
  const totalChunks = Math.max(1, Number(params.totalChunks) || 1);
  const chunkIndex = Math.max(0, Number(params.chunkIndex) || 0);
  const textBody = params.chunkText ?? params.source.text;
  const excludeTerms = Array.isArray(params.excludeTerms)
    ? params.excludeTerms.filter(Boolean).slice(0, 80)
    : [];

  const singleCategory =
    extractionType.id !== 'all' && extractionType.id !== 'phrases' ? extractionType.id : null;

  const itemShape: Record<string, unknown> = {
    term: 'canonical citation form (base verb, singular noun, "one\'s" for possessives)',
    surface: 'exact verbatim substring copied directly from SOURCE TEXT',
    category:
      singleCategory ||
      'idiom|slang|phrasal_verb|vocabulary|collocation|connected_speech|discourse_marker|pattern',
    register: 'neutral|casual|professional|slang',
    cefr: 'A1|A2|B1|B2|C1|C2',
    frequency: 'very common|common|niche',
    ipa: '/General American IPA with primary stress ˈ/',
    meaning: 'crisp, learner-friendly English meaning in this exact context',
    ...(isEnglishTarget ? {} : { localizedMeaning: `natural ${language.name} contextual meaning` }),
    usageNote: 'when/where Americans use it + tone, collocation partner, or pitfall (1 crisp sentence)',
    spokenNote: 'concrete General American pronunciation/linking/flap-T/reduction cue, or "" if plain',
    example: '1 natural, fresh spoken American English sentence using the term',
  };

  const levelPersona =
    level.id === 'all'
      ? 'high-ROI American English phrases calibrated adaptively to this source'
      : `American English phrases tailored specifically for a ${level.shortLabel || level.label} learner`;

  const systemPrompt = [
    `You are an elite American English linguist and General American accent coach ("Anything to Phrases") extracting ${levelPersona}.`,
    '',
    'NON-NEGOTIABLE GROUNDING & ANTI-FABRICATION CONTRACT:',
    '- Every extracted item MUST actually occur in the provided SOURCE TEXT. Never invent, extrapolate, or supply phrases that are not present in the source.',
    '- "surface" MUST be an exact verbatim substring copied character-for-character from SOURCE TEXT (do not paraphrase or alter spelling).',
    '- "term" is the clean canonical form learners should memorize (e.g., surface "doubled down on" -> term "double down on"; surface "chasing our tail" -> term "chase one\'s tail").',
    '- Skip proper nouns, brand/product names alone, bare numbers, and generic function words. Never return duplicate terms.',
    '',
    'PEDAGOGICAL & AMERICAN ENGLISH STANDARDS:',
    `- Extraction type: ${extractionType.prompt}`,
    `- Style & variety: ${style.prompt}`,
    `- Proficiency level: ${level.prompt}`,
    `- Domain focus: ${focus.prompt}`,
    `- ${depth.prompt}`,
    `- ${studyGoal.prompt}`,
    `- ${order.prompt}`,
    '- Pronunciation: Always provide accurate General American IPA wrapped in slashes (e.g. /ˈdʌbəl daʊn ɑn/) with primary stress ˈ, rhotic /r/, and flap /ɾ/ where natural. In "spokenNote", describe real spoken mechanics (linking, schwa reduction, dropped /t/ or /d/, stress shift) — leave "" only if pronunciation is completely transparent.',
    '- Level & frequency: Tag each item honestly with its CEFR level (A1–C2) and everyday US frequency ("very common", "common", or "niche").',
    '- Collocations & usage: In "usageNote", tell the learner *how* Americans actually deploy it (register, tone, typical preposition/collocation, or mistake to avoid).',
    isEnglishTarget
      ? '- Target language: English only (no translation field needed).'
      : `- Translation: "localizedMeaning" MUST be natural, idiomatic ${language.name} (${language.native}) matching the exact context in the source. Keep proper names and English technical terms in Latin script.`,
    totalChunks > 1
      ? `- Multi-part source: You are analyzing part ${chunkIndex + 1} of ${totalChunks}. Extract ONLY items grounded in THIS part, and do NOT repeat any already-extracted terms listed below.`
      : '',
    '',
    'STRICT OUTPUT FORMAT: Return ONLY one valid compact JSON object (no markdown fences, no commentary, no trailing commas):',
    JSON.stringify({
      title: 'concise descriptive title (3-8 words)',
      summary: '1-2 crisp sentences summarizing the source topic and its standout American English style',
      speakerStyle: '3-6 word register/delivery tag (e.g. "Candid Silicon Valley engineering standup")',
      items: [itemShape],
    }),
  ]
    .filter(Boolean)
    .join('\n');

  const metaLines = [
    `Title: ${params.source.title || 'Untitled source'}`,
    params.source.creator ? `Creator / author: ${params.source.creator}` : '',
    `Source type: ${params.source.sourceType}`,
    params.source.sourceUrl ? `Source URL: ${params.source.sourceUrl}` : '',
    `Target language: ${language.name} (${language.native})`,
    `Profile: type=${extractionType.id}, style=${style.id}, level=${level.id}, focus=${focus.id}, depth=${depth.id}, goal=${studyGoal.id}, order=${order.id}`,
    totalChunks > 1 ? `Chunk: ${chunkIndex + 1} of ${totalChunks}` : '',
    excludeTerms.length > 0 ? `Already extracted (skip these): ${excludeTerms.join(', ')}` : '',
    '',
    'SOURCE TEXT (extract strictly from this text; copy "surface" verbatim):',
    '"""',
    textBody,
    '"""',
  ].filter(Boolean);

  return {
    systemPrompt,
    userPrompt: metaLines.join('\n'),
    language,
    extractionType,
    style,
    level,
    focus,
    depth,
    studyGoal,
    order,
  };
}
