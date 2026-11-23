import { LanguageOption } from './languages';

/**
 * Shared linguistic & translation prompt contracts consumed by both
 * Anything to Phrases (american-extractor) and Generate Phrases (learning-library).
 *
 * Single source of truth for:
 * - Natural living Egyptian Arabic (عامية مصرية مهذبة وطبيعية) vs. 170+ world languages
 * - Standalone expression/term translation rules (with or without reusable [X] slots)
 * - Idiomatic full-sentence translation rules (never literal word-for-word)
 * - CEFR level catalog & normalization
 * - Study goal catalog
 */

export interface LinguisticOptionSpec {
  id: string;
  label: string;
  shortLabel: string;
  prompt: string;
}

export const SHARED_CEFR_LEVELS: LinguisticOptionSpec[] = [
  {
    id: 'all',
    label: 'Adaptive (All levels)',
    shortLabel: 'All levels',
    prompt:
      'Calibrate adaptively across CEFR A1–C2 to surface the highest-value, most teachable American English items.',
  },
  {
    id: 'a1_a2',
    label: 'A1–A2 · Foundational',
    shortLabel: 'A1–A2',
    prompt:
      'Target CEFR A1–A2: Focus on practical foundational everyday expressions, high-frequency spoken phrases, and clear building blocks.',
  },
  {
    id: 'b1_b2',
    label: 'B1–B2 · Intermediate fluency',
    shortLabel: 'B1–B2',
    prompt:
      'Target CEFR B1–B2: Focus on natural everyday fluency builders, practical idioms, conversational pivots, and everyday/workplace collocations.',
  },
  {
    id: 'b2_c2',
    label: 'B2–C2 · Advanced native',
    shortLabel: 'B2–C2',
    prompt:
      'Target CEFR B2–C2: Skip basic A1–B1 phrasing; focus on nuanced native idioms, subtle tone shifts, rapid reductions, and high-register or street-native expressions.',
  },
  {
    id: 'a1',
    label: 'A1 · Beginner',
    shortLabel: 'A1',
    prompt: 'Target CEFR A1 (Beginner): Foundational high-frequency phrases and core spoken building blocks.',
  },
  {
    id: 'a2',
    label: 'A2 · Elementary',
    shortLabel: 'A2',
    prompt: 'Target CEFR A2 (Elementary): Everyday practical expressions, routine social phrasing, and basic phrasal verbs.',
  },
  {
    id: 'b1',
    label: 'B1 · Intermediate',
    shortLabel: 'B1',
    prompt: 'Target CEFR B1 (Intermediate): Everyday idioms, practical phrasal verbs, and natural conversational connectors.',
  },
  {
    id: 'b2',
    label: 'B2 · Upper-Intermediate',
    shortLabel: 'B2',
    prompt: 'Target CEFR B2 (Upper-Intermediate): Expressive idioms, nuanced verbs, and natural everyday/workplace collocations.',
  },
  {
    id: 'c1',
    label: 'C1 · Advanced',
    shortLabel: 'C1',
    prompt: 'Target CEFR C1 (Advanced): Sophisticated vocabulary, nuanced idioms, subtle tone shifts, and native-level collocations.',
  },
  {
    id: 'c2',
    label: 'C2 · Mastery',
    shortLabel: 'C2',
    prompt: 'Target CEFR C2 (Mastery): Rare, culturally rich, ultra-idiomatic, native-level American English expressions.',
  },
];

export const SHARED_STUDY_GOALS: LinguisticOptionSpec[] = [
  {
    id: 'full',
    label: 'Full study guide (Default)',
    shortLabel: 'Full study',
    prompt: 'Provide a balanced, thorough breakdown covering meaning, social context, pronunciation, and natural examples.',
  },
  {
    id: 'speaking',
    label: 'Speaking & pronunciation',
    shortLabel: 'Speaking',
    prompt: 'Prioritize spoken delivery, General American rhythm, Flap-T /ɾ/, reductions, linking, and natural conversational cadence.',
  },
  {
    id: 'workplace',
    label: 'Workplace & tech meetings',
    shortLabel: 'Workplace',
    prompt: 'Tailor examples and social context toward US standups, Slack threads, design reviews, and professional diplomacy.',
  },
  {
    id: 'active_recall',
    label: 'Pitfalls & active recall',
    shortLabel: 'Recall & pitfalls',
    prompt: 'Highlight crisp contrasts with stiff textbook English and call out the exact non-native traps learners should avoid.',
  },
];

const CEFR_RE = /\b(A1|A2|B1|B2|C1|C2)\b/i;

export function normalizeCefrTag(raw: unknown): string {
  const match = String(raw || '').match(CEFR_RE);
  return match ? match[1].toUpperCase() : '';
}

export function findLinguisticOption(
  catalog: LinguisticOptionSpec[],
  id?: string,
): LinguisticOptionSpec {
  const clean = String(id || '').trim().toLowerCase();
  return catalog.find((item) => item.id === clean) || catalog[0];
}

export function buildTermTranslationGuidance(
  language: LanguageOption,
  options: { preserveSlots?: boolean; multiSense?: boolean } = {},
): string {
  if (language.code === 'en') {
    return 'Target language is English only (no translation fields needed).';
  }

  const slotClause = options.preserveSlots
    ? ' Keep every square-bracket slot ([X], [Y], etc.) mapped 1:1 — never add or drop a slot.'
    : '';
  const multiSenseClause = options.multiSense
    ? language.code === 'ar'
      ? ' When the item has multiple common meanings/senses in English, list ALL of its core general meanings separated by commas (،) — e.g. for "sound": "صوت، سليم، موثوق، متين، يبدو"; for "put the onus on someone": "يحمّل المسؤولية لحد، يرمي العبء على حد".'
      : ' When the item has multiple common meanings/senses in English, list ALL of its core general meanings separated by commas (,).'
    : '';

  if (language.code === 'ar') {
    return (
      'Write "localizedMeaning" as the standalone equivalent of ONLY the expression/term itself in living, polite Egyptian Arabic (عامية مصرية مهذبة وطبيعية) matching the spoken register.' +
      slotClause +
      ' NEVER explain the sentence, NEVER add an example, and NEVER write commentary like "هنا معناها..." or "في السياق ده...".' +
      ' Use natural Egyptian words and grammar (بقى، كده، عشان، اللي، مش، خلّي، في الصورة، على طول) and everyday tech talk (شغّال، عطّل، بلوكر); NO stiff MSA (سوف، ليس، الذي، يجب أن), NO literal word-for-word rendering.' +
      (options.preserveSlots
        ? ' Calibration: "off the top of my head, [X]" -> "من دماغي كده، [X]" (never "على راسي"); "pull the receipts on [X]" -> "هات الأدلة على [X]"; "fat-finger [X]" -> "تدوس على [X] بالغلط".'
        : '') +
      multiSenseClause
    );
  }

  return (
    `Write "localizedMeaning" as the standalone equivalent of ONLY the expression/term itself in living ${language.name} (${language.native}), matching the spoken register.` +
    slotClause +
    ' NEVER explain the sentence, NEVER add an example, and NEVER write meta-commentary; no literal word-for-word rendering.' +
    multiSenseClause
  );
}

export function buildSentenceTranslationGuidance(
  language: LanguageOption,
  fieldNames: string[],
): string {
  if (language.code === 'en') {
    return 'Target language is English only (leave sentence translation fields empty or omitted).';
  }

  const fieldsLabel = fieldNames.map((f) => `"${f}"`).join(' & ');
  if (language.code === 'ar') {
    return (
      `Translate every English example/context sentence into ${fieldsLabel} using natural, idiomatic Egyptian Arabic (عامية مصرية مهذبة وطبيعية) that conveys the true intended meaning and tone of the full sentence — NEVER stiff MSA and NEVER robotic literal word-for-word translation. Keep proper names and English technical terms in Latin script.`
    );
  }

  return (
    `Translate every English example/context sentence into ${fieldsLabel} using natural, idiomatic ${language.name} (${language.native}) that conveys the true intended meaning and tone of the full sentence — NEVER robotic literal word-for-word translation. Keep proper names and English technical terms in Latin script.`
  );
}
