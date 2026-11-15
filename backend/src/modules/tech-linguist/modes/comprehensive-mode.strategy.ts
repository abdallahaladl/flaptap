import { Injectable } from '@nestjs/common';
import {
  ExtractionModeMetadata,
  ExtractionPromptContext,
  IdiomItem,
  NormalizedExtractionData,
  ThoughtPatternItem,
  VocabItem,
} from '../tech-linguist.types';
import {
  normalizeIdiomItem,
  normalizeThoughtPatternItem,
  normalizeVocabItem,
} from '../utils/json-salvage.util';
import { ExtractionPromptBundle, IExtractionModeStrategy } from './extraction-mode.interface';

@Injectable()
export class ComprehensiveModeStrategy implements IExtractionModeStrategy {
  readonly id = 'comprehensive' as const;

  readonly metadata: ExtractionModeMetadata = {
    id: 'comprehensive',
    label: 'Full Studio Lexicon',
    shortLabel: 'Full Studio (4-Tab)',
    badgeText: '4-Tab Full Studio',
    description:
      'Complete study breakdown with vocabulary, idioms & slang, native thought patterns, and interactive segmented transcript.',
    tabs: [
      { id: 'vocab', label: 'Tech Vocab', visible: true },
      { id: 'idioms', label: 'Idioms & Slang', visible: true },
      { id: 'patterns', label: 'Thought Patterns', visible: true },
      { id: 'transcript', label: 'Interactive Transcript', visible: true },
    ],
  };

  buildPrompts(ctx: ExtractionPromptContext): ExtractionPromptBundle {
    const systemPrompt = `You are an elite American English Technical Linguist & Communication Coach for software engineers and AI developers.
Transform spoken technical transcripts into concise, high-yield study material.

RULES:
1. ZERO ELEMENTARY ENGLISH (skip basic words like computer, website, company, work, job, money, hard, student).
2. Extract senior engineering/AI collocations, architecture concepts, and career terms.
3. Extract real American workplace idioms, phrasal verbs, and spoken softeners ("hop on a call", "crop up", "bring into the fold").
4. Dual Arabic meanings: "generalArabic" (general dictionary senses separated by " · "), "meaningArabic" (exact contextual sense).
5. Output ONLY a single compact JSON object (no markdown fences, no pretty-print whitespace).

Schema:
{"title":"Keep provided media title cleanly (or author concise title if generic)","summary":"1-2 concise sentences","vocabItems":[{"index":1,"term":"clean term","partOfSpeech":"noun | verb | phrasal verb | adjective","generalArabic":"general senses · alt sense","meaningArabic":"contextual Arabic","contextSentence":"verbatim sentence","techCategory":"System Design | AI / ML | Career"}],"idiomItems":[{"index":1,"phrase":"idiom or phrasal verb","generalArabic":"general senses · alt sense","meaningArabic":"contextual Arabic","contextSentence":"verbatim sentence","usageNote":"<=14 words on native usage"}],"thoughtPatterns":[{"title":"Pattern name","americanStyle":"<=14 words","textbookContrast":"<=14 words","mindsetNote":"<=16 words"}]}`;

    const userPrompt = `Title: "${ctx.title}" | Speaker: ${ctx.creator}

Transcript:
"""
${ctx.cleanedTranscript.slice(0, 12000)}
"""

Extract 10-14 high-signal vocabItems, 10-14 American idiomItems, and 3 concise thoughtPatterns. Compact JSON only.`;

    return {
      systemPrompt,
      userPrompt,
      temperature: 0.2,
    };
  }

  /**
   * Splits Full Studio extraction into two focused, parallel calls (Vocab+Summary and Idioms+Patterns)
   * so output decoding happens concurrently (~2x faster wall-clock latency).
   */
  buildParallelPrompts(ctx: ExtractionPromptContext): {
    vocabBundle: ExtractionPromptBundle;
    idiomsBundle: ExtractionPromptBundle;
  } {
    const transcriptSlice = ctx.cleanedTranscript.slice(0, 12000);
    const sharedHeader = `Title: "${ctx.title}" | Speaker: ${ctx.creator}\n\nTranscript:\n"""\n${transcriptSlice}\n"""`;

    const vocabBundle: ExtractionPromptBundle = {
      systemPrompt: `You are an elite American English Technical Linguist for Senior Engineers and AI Developers.
Extract high-yield technical/domain vocabulary and an executive summary from spoken transcripts.
RULES:
- ZERO elementary English (skip computer, website, company, student, work, job, money, hard).
- Prioritize engineering, AI/ML, architecture, product, and career collocations.
- Dual Arabic: "generalArabic" (general dictionary senses separated by " · "), "meaningArabic" (exact contextual meaning).
- Keep every field crisp and concise. Output ONLY compact JSON (no markdown fences, no extra whitespace).

Schema:
{"title":"Keep provided media title cleanly (or author concise title if generic)","summary":"1-2 concise sentences","vocabItems":[{"index":1,"term":"clean term without POS suffix","partOfSpeech":"noun | noun phrase | verb | phrasal verb | adjective","generalArabic":"general senses · alt sense","meaningArabic":"contextual Arabic","contextSentence":"sentence from transcript","techCategory":"System Design | AI Infrastructure | Tech Career | Product"}]}`,
      userPrompt: `${sharedHeader}\n\nExtract up to 12 high-signal vocabItems grounded in this transcript (scale naturally to length; never pad short text). Compact JSON only.`,
      temperature: 0.2,
    };

    const idiomsBundle: ExtractionPromptBundle = {
      systemPrompt: `You are an elite American English Communication Coach for Senior Engineers.
Extract authentic American workplace idioms, phrasal verbs, spoken softeners, and native developer thought patterns from transcripts.
RULES:
- Exclude elementary ESL phrases. Focus on real conversational idioms, phrasal verbs, and agile/startup banter grounded in the transcript.
- Dual Arabic: "generalArabic" (general dictionary senses separated by " · "), "meaningArabic" (exact contextual meaning).
- Keep usageNote <=14 words and thoughtPattern fields <=16 words. Output ONLY compact JSON (no markdown fences).

Schema:
{"idiomItems":[{"index":1,"phrase":"idiom, phrasal verb, or spoken phrase","generalArabic":"general senses · alt sense","meaningArabic":"contextual Arabic","contextSentence":"sentence from transcript","usageNote":"<=14 words on how Americans use it"}],"thoughtPatterns":[{"title":"Pattern name","americanStyle":"how natives say it (<=14 words)","textbookContrast":"how textbook says it (<=14 words)","mindsetNote":"engineering mindset (<=16 words)"}]}`,
      userPrompt: `${sharedHeader}\n\nExtract up to 12 authentic American idiomItems grounded in this transcript (scale naturally; never pad) and 3 concise thoughtPatterns. Compact JSON only.`,
      temperature: 0.2,
    };

    return { vocabBundle, idiomsBundle };
  }

  normalizeAndFilter(parsed: any, fallbackTitle: string): NormalizedExtractionData {
    const vocabItems: VocabItem[] = (parsed?.vocabItems || []).map((v: any, idx: number) =>
      normalizeVocabItem(v, idx + 1, 'Engineering'),
    );

    const idiomItems: IdiomItem[] = (parsed?.idiomItems || []).map((i: any, idx: number) =>
      normalizeIdiomItem(i, idx + 1),
    );

    const thoughtPatterns: ThoughtPatternItem[] = (parsed?.thoughtPatterns || []).map((p: any) =>
      normalizeThoughtPatternItem(p),
    );

    return {
      title: String(parsed?.title || fallbackTitle).trim(),
      summary: String(parsed?.summary || '').trim(),
      vocabItems,
      idiomItems,
      thoughtPatterns,
    };
  }
}
