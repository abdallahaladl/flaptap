import { Injectable } from '@nestjs/common';
import {
  ExtractionModeMetadata,
  ExtractionPromptContext,
  IdiomItem,
  NormalizedExtractionData,
  VocabItem,
} from '../tech-linguist.types';
import { normalizeIdiomItem, normalizeVocabItem } from '../utils/json-salvage.util';
import { enforceStrictTwoListSeparation } from '../utils/lexical-dedup.util';
import { ExtractionPromptBundle, IExtractionModeStrategy } from './extraction-mode.interface';

@Injectable()
export class AdvancedNativeModeStrategy implements IExtractionModeStrategy {
  readonly id = 'advanced_native' as const;

  readonly metadata: ExtractionModeMetadata = {
    id: 'advanced_native',
    label: 'Native Elite (Strict 2-Tab)',
    shortLabel: 'Native Elite (2-Tab)',
    badgeText: '2-Tab Strict · Zero Duplicates',
    description:
      'High-signal only: hard & advanced single words/verbs in Tab 1, and advanced American idioms, street slang, abbreviations & domain combinations in Tab 2—with strict zero duplication.',
    tabs: [
      { id: 'vocab', label: 'Words & Verbs', visible: true },
      { id: 'idioms', label: 'Idioms, Expressions & Slang', visible: true },
      { id: 'patterns', label: 'Thought Patterns', visible: false },
      { id: 'transcript', label: 'Interactive Transcript', visible: false },
    ],
  };

  buildPrompts(ctx: ExtractionPromptContext): ExtractionPromptBundle {
    const systemPrompt = `You are an elite American English Acquisition Coach taking advanced speakers to native-level American fluency across everyday speech, street slang, and specialized domains (Software/AI, Marketing, Finance, Fitness).

MISSION: Extract high-value study items ONLY into TWO strictly separated, non-overlapping lists (never pad with easy words).

=== LIST 1: "vocabItems" — SINGLE WORDS & SINGLE VERBS ONLY ===
- Strictly ONE standalone word or single non-phrasal verb (zero spaces; never put phrasal verbs or fragments like "cropping").
- Only hard/uncommon/nuanced C1–C2 words ("obfuscate", "complacent", "scathing", "candor", "leverage") OR specialized single-word domain terms (Dev/AI: "idempotent", "quantization", "telemetry"; Marketing: "attribution", "churn"; Fitness: "hypertrophy", "deload").
- ZERO basic/intermediate B1–B2 words.
- ZERO DUPLICATION with "idiomItems".

=== LIST 2: "idiomItems" — IDIOMS, COMBINATIONS, PHRASAL VERBS & STREET SLANG ===
- Only impactful American idioms ("cut corners", "move the needle", "read the room"), complete phrasal verbs ("crop up", "double down", "zero in on"), modern slang/contractions present in the transcript ("low-key", "no cap", "deadass", "cooked", "outta pocket", "gotta", "tryna", "NGL"), or multi-word domain combos ("catastrophic forgetting", "product-market fit", "progressive overload").
- ZERO basic literal phrases ("bought a house", "for example", "a lot of").
- ZERO DUPLICATION within list or with "vocabItems".

DUAL ARABIC: "generalArabic" (general dictionary senses separated by " · "), "meaningArabic" (exact contextual sense).
OUTPUT: Compact single-line JSON only (no markdown fences, no commentary, keep "usageNote" <=14 words in English only).
{"title":"Keep provided media title cleanly (or author concise title if generic)","summary":"1-2 concise sentences","vocabItems":[{"index":1,"term":"single word/verb","partOfSpeech":"verb | noun | adjective | adverb","generalArabic":"senses · alt","meaningArabic":"contextual Arabic","contextSentence":"verbatim sentence","techCategory":"field/register tag"}],"idiomItems":[{"index":1,"phrase":"idiom/phrasal/slang/combo","category":"Street Slang | Idiom | Phrasal Verb | Abbreviation | Fast Speech | AI / Dev Combo | Marketing Combo | Fitness Combo | Domain Combo","generalArabic":"senses · alt","meaningArabic":"contextual Arabic","contextSentence":"verbatim sentence","usageNote":"<=14 words ENGLISH-ONLY usage/pronunciation tip"}],"thoughtPatterns":[]}`;

    const userPrompt = `Title: "${ctx.title}" | Speaker: ${ctx.creator}

Transcript:
"""
${ctx.cleanedTranscript.slice(0, 12000)}
"""

Apply strict Native Elite filtering (quality over quantity, zero padding, zero overlap, thoughtPatterns=[]). Compact JSON only.`;

    return {
      systemPrompt,
      userPrompt,
      temperature: 0.15,
    };
  }

  normalizeAndFilter(parsed: any, fallbackTitle: string): NormalizedExtractionData {
    const rawVocab: VocabItem[] = (parsed?.vocabItems || []).map((v: any, idx: number) =>
      normalizeVocabItem(v, idx + 1, 'Advanced Vocab'),
    );

    const rawIdioms: IdiomItem[] = (parsed?.idiomItems || []).map((i: any, idx: number) =>
      normalizeIdiomItem(i, idx + 1),
    );

    const { vocabItems, idiomItems } = enforceStrictTwoListSeparation(rawVocab, rawIdioms);

    return {
      title: String(parsed?.title || fallbackTitle).trim(),
      summary: String(parsed?.summary || '').trim(),
      vocabItems,
      idiomItems,
      thoughtPatterns: [],
    };
  }
}
