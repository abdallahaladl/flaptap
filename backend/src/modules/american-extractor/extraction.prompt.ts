import { getLanguage, LanguageOption } from '../../core/ai/languages';
import {
  buildSentenceTranslationGuidance,
  buildTermTranslationGuidance,
} from '../../core/ai/translation-rules.util';
import {
  ExtractionCategoryMetadata,
  ExtractionFocusOption,
  ExtractorItemCategory,
  ResolvedSource,
} from './american-extractor.types';
import {
  AUDIO_DEPENDENT_CATEGORIES,
  CORE_CATEGORIES,
  isAudioDependentCategory,
  normalizeCategory,
} from './utils/source-text.util';

export type ExtractionFocus = ExtractionFocusOption;

/**
 * Full 20-category American English extraction catalog:
 * - 16 Core Categories (valid for every source: text, PDF, articles, screenshots, audio, video)
 * - 4 Audio-Dependent Categories (strictly unlocked ONLY when real source audio is available)
 */
export const EXTRACTION_CATEGORIES_CATALOG: ExtractionCategoryMetadata[] = [
  { id: 'all', label: 'All categories', hint: 'Balanced mix across every eligible category (default).', group: 'all', audioDependent: false },
  // Core Categories (1-16)
  { id: 'pattern', label: 'Sentence Patterns', hint: 'Reusable American sentence frames and templates.', group: 'core', audioDependent: false },
  { id: 'vocabulary', label: 'Vocabulary', hint: 'High-value words, precise verbs, and expressive adjectives.', group: 'core', audioDependent: false },
  { id: 'idiom', label: 'Idioms', hint: 'Figurative expressions whose meaning goes beyond literal words.', group: 'core', audioDependent: false },
  { id: 'phrasal_verb', label: 'Phrasal Verbs', hint: 'Verb + particle units with shifted or idiomatic meaning.', group: 'core', audioDependent: false },
  { id: 'collocation', label: 'Collocations', hint: 'Natural native American word partnerships.', group: 'core', audioDependent: false },
  { id: 'slang', label: 'Slang & Informal Expressions', hint: 'Street talk, casual vernacular, and informal expressions.', group: 'core', audioDependent: false },
  { id: 'conversational_expression', label: 'Conversational Expressions', hint: 'Everyday spoken turns, openers, softeners, and natural phrasing.', group: 'core', audioDependent: false },
  { id: 'grammar_structure', label: 'Grammar Structures', hint: 'Distinctive grammatical constructions and clause patterns.', group: 'core', audioDependent: false },
  { id: 'discourse_marker', label: 'Discourse Markers', hint: 'Pivots, transitions, hedges, and conversation framers.', group: 'core', audioDependent: false },
  { id: 'filler', label: 'Fillers', hint: 'Natural spoken pause-holders and hesitation markers ("like", "you know").', group: 'core', audioDependent: false },
  { id: 'interjection', label: 'Interjections', hint: 'Spontaneous exclamations and emotional bursts ("whoa", "geez", "man").', group: 'core', audioDependent: false },
  { id: 'contraction_reduction', label: 'Contractions & Reductions', hint: 'Written/spoken contractions and reduced forms ("gonna", "wanna", "kinda").', group: 'core', audioDependent: false },
  { id: 'metaphor_figurative', label: 'Metaphors & Figurative Language', hint: 'Vivid metaphors, analogies, and figurative imagery.', group: 'core', audioDependent: false },
  { id: 'cultural_reference', label: 'American Cultural References', hint: 'US cultural, historical, sports, media, or lifestyle references.', group: 'core', audioDependent: false },
  { id: 'pragmatics_context', label: 'Pragmatics & Social Context', hint: 'Politeness strategies, indirect pushback, subtext, and tone shifts.', group: 'core', audioDependent: false },
  { id: 'native_response', label: 'Native-like Responses & Reactions', hint: 'Authentic American replies, agreements, pushbacks, and reactions.', group: 'core', audioDependent: false },
  // Audio-Dependent Categories (17-20) — ONLY when real audio is available
  { id: 'connected_speech', label: 'Connected Speech', hint: 'Fast-speech blending and spoken connected forms heard in audio.', group: 'audio', audioDependent: true },
  { id: 'pronunciation_phonetics', label: 'Pronunciation & Phonetics', hint: 'Key General American vowel/consonant features (flap-T, dark L, schwa) in audio.', group: 'audio', audioDependent: true },
  { id: 'word_sentence_stress', label: 'Word Stress & Sentence Stress', hint: 'Syllable stress and contrastive sentence prominence in spoken audio.', group: 'audio', audioDependent: true },
  { id: 'linking_sound_changes', label: 'Linking & Sound Changes', hint: 'Consonant-vowel linking, assimilation, elision, and palatalization in audio.', group: 'audio', audioDependent: true },
];

export const EXTRACTION_TYPES: ExtractionFocusOption[] = [
  {
    id: 'all',
    label: 'All categories · balanced mix (Default)',
    shortLabel: 'All categories',
    group: 'all',
    audioDependent: false,
    prompt:
      'Extract a high-ROI, non-overlapping mix across all eligible categories that genuinely stand out in this source.',
  },
  {
    id: 'pattern',
    label: 'Sentence Patterns',
    shortLabel: 'Sentence Patterns',
    group: 'core',
    audioDependent: false,
    prompt:
      'STRICT CATEGORY: Extract ONLY reusable American sentence patterns and grammatical frames grounded in the source. Every item MUST use "category": "pattern".',
  },
  {
    id: 'vocabulary',
    label: 'Vocabulary',
    shortLabel: 'Vocabulary',
    group: 'core',
    audioDependent: false,
    prompt:
      'STRICT CATEGORY: Extract ONLY high-value vocabulary words (precise verbs, expressive adjectives, nuanced nouns). Every item MUST use "category": "vocabulary".',
  },
  {
    id: 'idiom',
    label: 'Idioms',
    shortLabel: 'Idioms',
    group: 'core',
    audioDependent: false,
    prompt:
      'STRICT CATEGORY: Extract ONLY figurative idioms whose meaning goes beyond literal word-by-word reading. Every item MUST use "category": "idiom".',
  },
  {
    id: 'phrasal_verb',
    label: 'Phrasal Verbs',
    shortLabel: 'Phrasal Verbs',
    group: 'core',
    audioDependent: false,
    prompt:
      'STRICT CATEGORY: Extract ONLY phrasal verbs (verb + particle/preposition units with shifted or idiomatic meaning). Every item MUST use "category": "phrasal_verb".',
  },
  {
    id: 'collocation',
    label: 'Collocations',
    shortLabel: 'Collocations',
    group: 'core',
    audioDependent: false,
    prompt:
      'STRICT CATEGORY: Extract ONLY natural native American word partnerships and collocations (verb+noun, adj+noun, adv+adj). Every item MUST use "category": "collocation".',
  },
  {
    id: 'slang',
    label: 'Slang & Informal Expressions',
    shortLabel: 'Slang & Informal',
    group: 'core',
    audioDependent: false,
    prompt:
      'STRICT CATEGORY: Extract ONLY American slang, street talk, and casual informal expressions. Every item MUST use "category": "slang".',
  },
  {
    id: 'conversational_expression',
    label: 'Conversational Expressions',
    shortLabel: 'Conversational',
    group: 'core',
    audioDependent: false,
    prompt:
      'STRICT CATEGORY: Extract ONLY natural everyday spoken conversational expressions, openers, closers, and phrasing Americans use in real talk. Every item MUST use "category": "conversational_expression".',
  },
  {
    id: 'grammar_structure',
    label: 'Grammar Structures',
    shortLabel: 'Grammar Structures',
    group: 'core',
    audioDependent: false,
    prompt:
      'STRICT CATEGORY: Extract ONLY notable grammatical structures (clefts, conditionals, inversion, modal nuances, aspect contrasts) grounded in the source. Every item MUST use "category": "grammar_structure".',
  },
  {
    id: 'discourse_marker',
    label: 'Discourse Markers',
    shortLabel: 'Discourse Markers',
    group: 'core',
    audioDependent: false,
    prompt:
      'STRICT CATEGORY: Extract ONLY discourse markers, conversational pivots, hedges, and transition phrases (e.g., "that being said", "at the end of the day"). Every item MUST use "category": "discourse_marker".',
  },
  {
    id: 'filler',
    label: 'Fillers',
    shortLabel: 'Fillers',
    group: 'core',
    audioDependent: false,
    prompt:
      'STRICT CATEGORY: Extract ONLY natural spoken fillers and hesitation/thinking markers actually present in the source (e.g., "I mean", "you know", "kind of"). Every item MUST use "category": "filler".',
  },
  {
    id: 'interjection',
    label: 'Interjections',
    shortLabel: 'Interjections',
    group: 'core',
    audioDependent: false,
    prompt:
      'STRICT CATEGORY: Extract ONLY interjections and emotional exclamations actually present in the source (e.g., "whoa", "geez", "no way"). Every item MUST use "category": "interjection".',
  },
  {
    id: 'contraction_reduction',
    label: 'Contractions & Reductions',
    shortLabel: 'Contractions & Reductions',
    group: 'core',
    audioDependent: false,
    prompt:
      'STRICT CATEGORY: Extract ONLY explicit contractions and textual reduced forms actually appearing in the source (e.g., "gonna", "wanna", "kinda", "would\'ve", "ain\'t"). Every item MUST use "category": "contraction_reduction".',
  },
  {
    id: 'metaphor_figurative',
    label: 'Metaphors & Figurative Language',
    shortLabel: 'Metaphors & Figurative',
    group: 'core',
    audioDependent: false,
    prompt:
      'STRICT CATEGORY: Extract ONLY vivid metaphors, analogies, and figurative language actually present in the source. Every item MUST use "category": "metaphor_figurative".',
  },
  {
    id: 'cultural_reference',
    label: 'American Cultural References',
    shortLabel: 'Cultural References',
    group: 'core',
    audioDependent: false,
    prompt:
      'STRICT CATEGORY: Extract ONLY American cultural, sports, pop-culture, institutional, or everyday US lifestyle references present in the source, explaining the cultural background clearly. Every item MUST use "category": "cultural_reference".',
  },
  {
    id: 'pragmatics_context',
    label: 'Pragmatics & Social Context',
    shortLabel: 'Pragmatics & Context',
    group: 'core',
    audioDependent: false,
    prompt:
      'STRICT CATEGORY: Extract ONLY phrases where social subtext, politeness, diplomacy, sarcasm, hedging, or indirect intent carries the real meaning. Every item MUST use "category": "pragmatics_context".',
  },
  {
    id: 'native_response',
    label: 'Native-like Responses & Reactions',
    shortLabel: 'Native Responses',
    group: 'core',
    audioDependent: false,
    prompt:
      'STRICT CATEGORY: Extract ONLY authentic American conversational responses, agreements, pushbacks, empathy cues, and reactions present in the source. Every item MUST use "category": "native_response".',
  },
  // Audio-Dependent Categories (strictly when real source audio is available)
  {
    id: 'connected_speech',
    label: 'Connected Speech (Audio)',
    shortLabel: 'Connected Speech',
    group: 'audio',
    audioDependent: true,
    prompt:
      'STRICT AUDIO CATEGORY: Extract ONLY connected-speech phrases evidenced in this spoken audio source, explaining exact General American IPA and articulatory blending in "spokenNote". Every item MUST use "category": "connected_speech".',
  },
  {
    id: 'pronunciation_phonetics',
    label: 'Pronunciation & Phonetics (Audio)',
    shortLabel: 'Pronunciation & Phonetics',
    group: 'audio',
    audioDependent: true,
    prompt:
      'STRICT AUDIO CATEGORY: Extract ONLY words/phrases from this spoken audio source with high-value General American phonetic features (flap-T /ɾ/, glottal stop, dark L, r-colored vowels, schwa) detailed in "ipa" and "spokenNote". Every item MUST use "category": "pronunciation_phonetics".',
  },
  {
    id: 'word_sentence_stress',
    label: 'Word Stress & Sentence Stress (Audio)',
    shortLabel: 'Word & Sentence Stress',
    group: 'audio',
    audioDependent: true,
    prompt:
      'STRICT AUDIO CATEGORY: Extract ONLY words/phrases from this spoken audio source illustrating notable word stress, compound stress, or contrastive sentence stress, marked clearly in "ipa" and "spokenNote". Every item MUST use "category": "word_sentence_stress".',
  },
  {
    id: 'linking_sound_changes',
    label: 'Linking & Sound Changes (Audio)',
    shortLabel: 'Linking & Sound Changes',
    group: 'audio',
    audioDependent: true,
    prompt:
      'STRICT AUDIO CATEGORY: Extract ONLY multi-word sequences from this spoken audio source demonstrating consonant-vowel linking, assimilation, elision, or palatalization (e.g., /d+j/ -> /dʒ/), explained in "spokenNote". Every item MUST use "category": "linking_sound_changes".',
  },
  {
    id: 'phrases',
    label: 'Multi-word phrases only',
    shortLabel: 'Phrases only',
    group: 'core',
    audioDependent: false,
    prompt:
      'STRICT TYPE FILTER: Extract ONLY multi-word expressions (2 or more words). Skip isolated single vocabulary words.',
  },
];

const CATEGORY_PROMPT_MAP = new Map(EXTRACTION_TYPES.map((t) => [t.id, t]));

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
      'Keep a balanced mix across everyday conversation, professional speech, idioms, collocations, and authentic American phrasing.',
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
      'Weight toward casual conversation, social nuance, reactions, humor, and everyday spoken phrasing.',
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
      'Give crisp contextual meanings, practical American tone/usage guidance, natural spoken examples, and accurate General American IPA.',
  },
  {
    id: 'speaking',
    label: 'Speaking & shadowing · pronunciation & flow',
    shortLabel: 'Speaking & flow',
    prompt:
      'Prioritize spoken delivery: craft "example" as rhythmic out-loud American speech and provide concrete pronunciation guidance grounded in the source.',
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
  const clean = String(id || '').trim().toLowerCase();
  if (!clean || clean === 'all' || clean === 'phrases') {
    return findOption(EXTRACTION_TYPES, clean);
  }
  const direct = EXTRACTION_TYPES.find((option) => option.id === clean);
  if (direct) return direct;
  const canonical = normalizeCategory(clean);
  if (canonical === 'vocabulary' && !/^(vocab|vocabulary|word|words)$/.test(clean)) {
    return EXTRACTION_TYPES[0];
  }
  return findOption(EXTRACTION_TYPES, canonical);
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

/**
 * Resolves the exact list of eligible categories for a run, strictly enforcing
 * the audio-dependent gate when the source has no real audio.
 */
export function resolveEffectiveCategories(params: {
  categories?: string[];
  extractionType?: string;
  hasAudio: boolean;
}): {
  selectedCategories: ExtractorItemCategory[];
  isAll: boolean;
  rejectedAudioOnly: boolean;
} {
  const hasAudio = Boolean(params.hasAudio);
  const rawList = Array.isArray(params.categories)
    ? params.categories.map((c) => String(c || '').trim().toLowerCase()).filter(Boolean)
    : [];

  if (rawList.length > 0 && !rawList.includes('all')) {
    const normalized = Array.from(new Set(rawList.map((c) => normalizeCategory(c))));
    const eligible = normalized.filter((c) => hasAudio || !isAudioDependentCategory(c));
    return {
      selectedCategories: eligible,
      isAll: false,
      rejectedAudioOnly: normalized.length > 0 && eligible.length === 0,
    };
  }

  const typeOpt = normalizeExtractionType(params.extractionType);
  if (typeOpt.id !== 'all' && typeOpt.id !== 'phrases') {
    const cat = typeOpt.id as ExtractorItemCategory;
    if (!hasAudio && isAudioDependentCategory(cat)) {
      return { selectedCategories: [], isAll: false, rejectedAudioOnly: true };
    }
    return { selectedCategories: [cat], isAll: false, rejectedAudioOnly: false };
  }

  const allEligible: ExtractorItemCategory[] = hasAudio
    ? [...CORE_CATEGORIES, ...AUDIO_DEPENDENT_CATEGORIES]
    : [...CORE_CATEGORIES];

  return { selectedCategories: allEligible, isAll: true, rejectedAudioOnly: false };
}

export function buildExtractionPrompts(params: {
  source: ResolvedSource;
  chunkText?: string;
  chunkIndex?: number;
  totalChunks?: number;
  excludeTerms?: string[];
  targetLanguage?: string;
  extractionType?: string;
  categories?: string[];
  hasAudio?: boolean;
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
  selectedCategories: ExtractorItemCategory[];
  style: ExtractionFocusOption;
  level: ExtractionFocusOption;
  focus: ExtractionFocusOption;
  depth: ExtractionFocusOption;
  studyGoal: ExtractionFocusOption;
  order: ExtractionFocusOption;
} {
  const language = getLanguage(params.targetLanguage);
  const hasAudio =
    typeof params.hasAudio === 'boolean' ? params.hasAudio : Boolean(params.source?.hasAudio);
  const extractionType = normalizeExtractionType(params.extractionType);
  const { selectedCategories, isAll } = resolveEffectiveCategories({
    categories: params.categories,
    extractionType: extractionType.id,
    hasAudio,
  });

  const style = normalizeStyle(params.style);
  const level = normalizeLevel(params.level);
  const focus = normalizeFocus(params.focus);
  const depth = normalizeDepth(params.depth);
  const studyGoal = normalizeStudyGoal(params.studyGoal);
  const order = normalizeOrder(params.order);
  const isEnglishTarget = language.code === 'en';
  const isArabicTarget = language.code === 'ar';
  const totalChunks = Math.max(1, Number(params.totalChunks) || 1);
  const chunkIndex = Math.max(0, Number(params.chunkIndex) || 0);
  const textBody = params.chunkText ?? params.source.text;
  const excludeTerms = Array.isArray(params.excludeTerms)
    ? params.excludeTerms.filter(Boolean).slice(0, 80)
    : [];

  const categoryEnum =
    selectedCategories.length === 1
      ? selectedCategories[0]
      : selectedCategories.join('|');

  const categoryDirective =
    !isAll && selectedCategories.length === 1
      ? CATEGORY_PROMPT_MAP.get(selectedCategories[0])?.prompt ||
        `STRICT CATEGORY: Extract ONLY items in "${selectedCategories[0]}".`
      : !isAll && selectedCategories.length > 1
        ? `STRICT CATEGORY SUBSET: Extract ONLY items belonging to these selected categories: ${selectedCategories
            .map((id) => `${id} (${CATEGORY_PROMPT_MAP.get(id)?.shortLabel || id})`)
            .join(', ')}. Every item MUST use one of these exact category keys.`
        : extractionType.prompt;

  const itemShape: Record<string, unknown> = {
    term: 'canonical citation form (base verb, singular noun, "one\'s" for possessives)',
    surface: 'exact verbatim substring copied directly from SOURCE TEXT',
    category: categoryEnum,
    register: 'neutral|casual|professional|slang|formal|spoken',
    cefr: 'A1|A2|B1|B2|C1|C2',
    frequency: 'very common|common|niche',
    ipa: '/General American IPA with primary stress ˈ/',
    meaning: 'crisp, learner-friendly English meaning in this exact context',
    ...(isEnglishTarget
      ? {}
      : isArabicTarget
        ? {
            localizedMeaning:
              'standalone general Egyptian Arabic (عامية مصرية طبيعية وواضحة) meaning(s) of ONLY the term itself across all its common uses, separated by Arabic commas (،) when multiple meanings exist — NO sentence, NO example, NO context commentary',
            contextTranslation:
              'natural, idiomatic Egyptian Arabic (عامية مصرية طبيعية وواضحة) translation of the exact SOURCE TEXT sentence containing "surface", conveying its true intended meaning (never literal word-for-word)',
          }
        : {
            localizedMeaning: `standalone general ${language.name} meaning(s) of ONLY the term itself across all its common uses, separated by commas (,) when multiple meanings exist — NO sentence, NO example, NO context commentary`,
            contextTranslation: `natural, idiomatic ${language.name} translation of the exact SOURCE TEXT sentence containing "surface", conveying its true intended meaning (never literal word-for-word)`,
          }),
    usageNote: 'when/where Americans use it + tone, social context, collocation partner, or pitfall (1 crisp sentence)',
    spokenNote: hasAudio
      ? 'concrete General American spoken mechanics grounded in this audio (linking, flap-T, stress, reduction), or "" if plain'
      : 'optional brief pronunciation tip ONLY if standard dictionary phonology is tricky, otherwise "" (never claim acoustic audio cues from text)',
    example: '1 natural, practical spoken American English sentence using the term',
    ...(isEnglishTarget
      ? {}
      : isArabicTarget
        ? {
            exampleTranslation:
              'natural, idiomatic Egyptian Arabic (عامية مصرية طبيعية وواضحة) translation of "example", conveying its true intended meaning (never literal word-for-word)',
          }
        : {
            exampleTranslation: `natural, idiomatic ${language.name} translation of "example", conveying its true intended meaning (never literal word-for-word)`,
          }),
  };

  const levelPersona =
    level.id === 'all'
      ? 'high-ROI American English expressions calibrated adaptively to this source'
      : `American English expressions tailored specifically for a ${level.shortLabel || level.label} learner`;

  const audioContractLine = hasAudio
    ? '- Audio IS available for this source: audio-dependent categories (connected_speech, pronunciation_phonetics, word_sentence_stress, linking_sound_changes) are eligible when included above. Ground every observation in real General American spoken realization of the actual words in the source — never fabricate words not spoken.'
    : '- NO AUDIO IS AVAILABLE (text-only source): You are STRICTLY FORBIDDEN from outputting any audio-dependent category (connected_speech, pronunciation_phonetics, word_sentence_stress, linking_sound_changes) and FORBIDDEN from claiming to hear acoustic speaker stress, pitch, or audio reductions. Extract strictly from the eligible text categories above.';

  const translationLine = isEnglishTarget
    ? '- Target language: English only (no translation fields needed).'
    : [
        `- Standalone term meanings ("localizedMeaning"): ${buildTermTranslationGuidance(language, {
          preserveSlots: false,
          multiSense: true,
        })}`,
        `- True intended sentence translations ("contextTranslation" & "exampleTranslation"): ${buildSentenceTranslationGuidance(
          language,
          ['contextTranslation', 'exampleTranslation'],
        )}`,
      ].join('\n');

  const needsContextualTitle = Boolean(
    params.source.needsContextualTitle || params.source.sourceType === 'image',
  );
  const imageCount = Number(
    params.source.sourceMeta?.imageCount || params.source.sourceMeta?.readableCount || 0,
  );
  const contextualTitleLine = needsContextualTitle
    ? `- Title rule: Author ONE crisp, descriptive 3-8 word English study-guide title capturing the core topic or theme across the entire SOURCE TEXT${imageCount > 1 ? ` (synthesizing all ${imageCount} uploaded images together)` : ''}. NEVER use a filename, file extension (.png, .jpg, .webp), camera/OS code (IMG_..., PXL_...), or generic label like "Screenshot", "Image", or "Untitled".`
    : '';

  const systemPrompt = [
    `You are an elite American English linguist and General American coach ("Anything to Phrases") extracting ${levelPersona}.`,
    '',
    'NON-NEGOTIABLE GROUNDING & ANTI-FABRICATION CONTRACT:',
    '- Every extracted item MUST actually occur in the provided SOURCE TEXT. Never invent, extrapolate, or supply phrases that are not present in the source.',
    '- "surface" MUST be an exact verbatim substring copied character-for-character from SOURCE TEXT (do not paraphrase or alter spelling).',
    '- "term" is the clean canonical form learners should memorize (e.g., surface "doubled down on" -> term "double down on"; surface "chasing our tail" -> term "chase one\'s tail").',
    '- Skip proper nouns alone (unless genuine American cultural references when cultural_reference is active), bare numbers, and irrelevant generic filler. Never return duplicate terms.',
    audioContractLine,
    contextualTitleLine,
    '',
    'PEDAGOGICAL & AMERICAN ENGLISH STANDARDS:',
    `- Category scope: ${categoryDirective}`,
    `- Eligible category keys: ${selectedCategories.join(', ')}`,
    `- Style & variety: ${style.prompt}`,
    `- Proficiency level: ${level.prompt}`,
    `- Domain focus: ${focus.prompt}`,
    `- ${depth.prompt}`,
    `- ${studyGoal.prompt}`,
    `- ${order.prompt}`,
    '- Pronunciation: Provide accurate General American IPA wrapped in slashes (e.g. /ˈdʌbəl daʊn ɑn/) with primary stress ˈ and rhotic /r/.',
    '- Level & frequency: Tag each item honestly with its CEFR level (A1–C2) and everyday US frequency ("very common", "common", or "niche").',
    '- Practical usage & examples: In "usageNote", explain real American tone/social context/usage; in "example", write one fresh, natural, practical American English sentence learners can immediately reuse.',
    translationLine,
    totalChunks > 1
      ? `- Multi-part source: You are analyzing part ${chunkIndex + 1} of ${totalChunks}. Extract ONLY items grounded in THIS part, and do NOT repeat any already-extracted terms listed below.`
      : '',
    '',
    'STRICT OUTPUT FORMAT: Return ONLY one valid compact JSON object (no markdown fences, no commentary, no trailing commas):',
    JSON.stringify({
      title: needsContextualTitle
        ? 'descriptive 3-8 word content title across all images (never a filename)'
        : 'concise descriptive title (3-8 words)',
      summary: '1-2 crisp sentences summarizing the source topic and its standout American English style',
      speakerStyle: '3-6 word register/delivery tag (e.g. "Candid Silicon Valley engineering standup")',
      items: [itemShape],
    }),
  ]
    .filter(Boolean)
    .join('\n');

  const metaLines = [
    !needsContextualTitle && params.source.title ? `Title: ${params.source.title}` : '',
    needsContextualTitle
      ? imageCount > 1
        ? `Image batch: ${imageCount} uploaded images combined (author one unified contextual title from their combined content)`
        : 'Image upload: single image OCR (author a contextual title from its content, never a filename)'
      : '',
    params.source.creator ? `Creator / author: ${params.source.creator}` : '',
    `Source type: ${params.source.sourceType} (audio=${hasAudio ? 'available' : 'unavailable'})`,
    params.source.sourceUrl ? `Source URL: ${params.source.sourceUrl}` : '',
    `Target language: ${language.name} (${language.native})`,
    `Profile: categories=${isAll ? 'all' : selectedCategories.join(',')}, style=${style.id}, level=${level.id}, focus=${focus.id}, depth=${depth.id}, goal=${studyGoal.id}, order=${order.id}`,
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
    selectedCategories,
    style,
    level,
    focus,
    depth,
    studyGoal,
    order,
  };
}
