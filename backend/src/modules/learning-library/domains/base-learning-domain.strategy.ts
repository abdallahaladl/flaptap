import {
  GeneratedLearningCandidate,
  LearningDomainCategorySpec,
  LearningDomainMetadata,
  LearningExampleItem,
  LearningGenerationContext,
  LearningUsagePattern,
} from '../learning-library.types';
import { ILearningDomainStrategy, LearningPromptBundle } from './learning-domain.interface';

/**
 * Shared abstract base class providing common prompt schema formatting,
 * exclusion-list injection, and strict defensive candidate normalization
 * across all Learning Library domains.
 */
export abstract class BaseLearningDomainStrategy implements ILearningDomainStrategy {
  abstract readonly id: string;
  abstract readonly metadata: LearningDomainMetadata;

  protected abstract getDomainPersonaPrompt(ctx: LearningGenerationContext): string;
  protected abstract getQualityAndDiversityRules(ctx: LearningGenerationContext): string;

  buildGenerationPrompts(ctx: LearningGenerationContext): LearningPromptBundle {
    const validCategories = this.metadata.categories;
    const focusedCategory =
      ctx.categoryFilter && ctx.categoryFilter !== 'all'
        ? validCategories.find((c) => c.id === ctx.categoryFilter)
        : null;

    const assignedCategories =
      !focusedCategory && Array.isArray(ctx.targetCategories) && ctx.targetCategories.length > 0
        ? validCategories.filter((c) => ctx.targetCategories!.includes(c.id))
        : [];
    const activeCategories = assignedCategories.length > 0 ? assignedCategories : validCategories;

    // Keep systemPrompt 100% static per domain (no per-chunk category/language interpolation)
    // so parallel workers and consecutive runs maximize provider KV prefix caching.
    const staticCategoryRef = validCategories
      .map((c) => `- ${c.id} (${c.label}): ${c.promptGuidance}`)
      .join('\n');

    const systemPrompt = [
      this.getDomainPersonaPrompt(ctx),
      '',
      'DOMAIN CATEGORIES:',
      staticCategoryRef,
      '',
      this.getQualityAndDiversityRules(ctx),
      '',
      'OUTPUT CONTRACT (CRITICAL — FOLLOW CONCISENESS BUDGETS FOR SPEED & CLARITY):',
      'Return ONLY a single compact JSON object (no markdown fences, no commentary, no emojis, no pretty-print indentation).',
      `Valid "categoryId" values: ${validCategories.map((c) => c.id).join(' | ')}`,
      `Valid "register" values: ${this.metadata.registers.join(' | ')}`,
      'Schema: {"items":[{',
      '  "expression":"canonical phrase or term",',
      '  "categoryId":"exact category id from target list",',
      '  "register":"matching register",',
      '  "tone":"1-word tone",',
      '  "level":"2-3 word fluency level",',
      '  "ipa":"/General American IPA/",',
      '  "spokenForm":"fast spoken sound (3-7 words)",',
      '  "phoneticBreakdown":"<=12 words: Flap-T, schwa, linking, or stress",',
      '  "coreMeaning":"1 crisp English sentence (<=16 words)",',
      '  "localizedMeaning":"real-life meaning in Target Language (idiomatic, not literal; <=14 words)",',
      '  "textbookEquivalent":"stiff ESL contrast (3-7 words)",',
      '  "nativeContext":"<=12 words: who uses it and when",',
      '  "mistakesToAvoid":"<=12 words: common learner error",',
      '  "variations":["variant 1","variant 2"],',
      '  "combinations":["collocation 1","collocation 2"],',
      '  "usagePatterns":[{"pattern":"slot template","meaning":"<=8 words","example":"<=12 word sentence"}],',
      '  "examples":[',
      '    {"speakerContext":"where + when, 3-6 words (e.g. Team standup, Monday)","sentence":"<=16 word everyday first-person line","explanation":"<=8 words"},',
      '    {"speakerContext":"a different real-life where + when","sentence":"<=16 word everyday first-person line","explanation":"<=8 words"}',
      '  ],',
      '  "relatedExpressions":["phrase 1","phrase 2"]',
      '}]}',
    ].join('\n');

    const exclusionSection =
      ctx.excludedExpressions.length > 0
        ? `\nFORBIDDEN_EXISTING (never repeat or trivially inflect):\n${ctx.excludedExpressions.join(', ')}`
        : '';

    const localizedMeaningRule =
      ctx.targetLanguageCode === 'ar'
        ? 'Write "localizedMeaning" as natural everyday Egyptian Arabic a native would actually say — explain the real-life meaning idiomatically, never literal MSA word-for-word.'
        : `Write "localizedMeaning" as natural everyday ${ctx.targetLanguageName} a native speaker would actually say — idiomatic real-life meaning, never a literal word-for-word translation.`;

    const userPrompt = [
      `Generate exactly ${ctx.askCount} unique, non-basic ${this.metadata.itemNounPlural} for "${this.metadata.title}".`,
      `Target Language for "localizedMeaning": ${ctx.targetLanguageName} (${ctx.targetLanguageNative}). ${localizedMeaningRule} All other fields in crisp English.`,
      focusedCategory
        ? `Strict Category Filter: "${focusedCategory.id}" (${focusedCategory.label})`
        : `Distribute evenly across Target Categories ONLY: [${activeCategories.map((c) => c.id).join(', ')}]`,
      ctx.angleHint ? `Creative Angle: ${ctx.angleHint}` : '',
      ctx.focusTopic ? `Topic / Vibe Focus: "${ctx.focusTopic}"` : '',
      ctx.preferredRegister ? `Preferred Register: ${ctx.preferredRegister}` : '',
      'Requirements: exactly 2 examples per item — the two most common real-life moments this learner will actually hit this week (team standup, Slack thread, 1:1, coffee chat, texting a friend), each with a distinct 3-6 word where/when, a natural first-person spoken line, and zero textbook dialogue; >=2 variations, >=2 combinations, >=1 usagePattern; strict word budgets; NEVER copy sample examples from DOMAIN CATEGORIES—invent fresh items matching Topic/Vibe; compact JSON only.',
      exclusionSection,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      systemPrompt,
      userPrompt,
      temperature: 0.55,
    };
  }

  protected resolveCategory(rawCategory: string, fallbackFilter?: string): LearningDomainCategorySpec {
    const clean = String(rawCategory || '').trim().toLowerCase();
    const byId = this.metadata.categories.find((c) => c.id.toLowerCase() === clean);
    if (byId) return byId;

    const byLabel = this.metadata.categories.find(
      (c) => c.label.toLowerCase() === clean || c.label.toLowerCase().includes(clean),
    );
    if (byLabel) return byLabel;

    if (fallbackFilter && fallbackFilter !== 'all') {
      const filterCat = this.metadata.categories.find((c) => c.id === fallbackFilter);
      if (filterCat) return filterCat;
    }

    return this.metadata.categories[0];
  }

  protected normalizeStringList(rawList: unknown, maxItems = 6): string[] {
    if (!Array.isArray(rawList)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of rawList) {
      const clean = String(item || '').replace(/\s+/g, ' ').trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
      if (out.length >= maxItems) break;
    }
    return out;
  }

  protected normalizeUsagePatterns(rawPatterns: unknown): LearningUsagePattern[] {
    if (!Array.isArray(rawPatterns)) return [];
    const out: LearningUsagePattern[] = [];
    for (const entry of rawPatterns) {
      if (!entry || typeof entry !== 'object') continue;
      const pattern = String((entry as any).pattern || '').replace(/\s+/g, ' ').trim();
      const meaning = String((entry as any).meaning || '').replace(/\s+/g, ' ').trim();
      const example = String((entry as any).example || '').replace(/\s+/g, ' ').trim();
      if (!pattern) continue;
      out.push({ pattern, meaning, example });
      if (out.length >= 4) break;
    }
    return out;
  }

  protected normalizeExamples(rawExamples: unknown): LearningExampleItem[] {
    if (!Array.isArray(rawExamples)) return [];
    const out: LearningExampleItem[] = [];
    for (const entry of rawExamples) {
      if (typeof entry === 'string') {
        const sentence = entry.replace(/\s+/g, ' ').trim();
        if (sentence) {
          out.push({ speakerContext: 'Everyday Spoken', sentence, explanation: '' });
        }
        continue;
      }
      if (!entry || typeof entry !== 'object') continue;
      const sentence = String((entry as any).sentence || (entry as any).text || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!sentence) continue;
      out.push({
        speakerContext:
          String((entry as any).speakerContext || (entry as any).context || 'Everyday Spoken')
            .replace(/\s+/g, ' ')
            .trim(),
        sentence,
        explanation: String((entry as any).explanation || (entry as any).note || '')
          .replace(/\s+/g, ' ')
          .trim(),
      });
      if (out.length >= 4) break;
    }
    return out;
  }

  normalizeCandidate(raw: any, ctx: LearningGenerationContext): GeneratedLearningCandidate | null {
    if (!raw || typeof raw !== 'object') return null;
    const expression = String(raw.expression || raw.phrase || raw.term || '')
      .replace(/\s+/g, ' ')
      .trim();
    const coreMeaning = String(raw.coreMeaning || raw.meaning || raw.definition || '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!expression || !coreMeaning) return null;

    const category = this.resolveCategory(
      raw.categoryId || raw.category || '',
      ctx.categoryFilter,
    );

    const rawRegister = String(raw.register || '').replace(/\s+/g, ' ').trim();
    const register =
      rawRegister ||
      ctx.preferredRegister ||
      this.metadata.registers[0] ||
      'Conversational';

    const examples = this.normalizeExamples(raw.examples);
    if (examples.length === 0 && raw.exampleSentence) {
      examples.push({
        speakerContext: 'Everyday Spoken',
        sentence: String(raw.exampleSentence).trim(),
        explanation: '',
      });
    }

    return {
      expression,
      categoryId: category.id,
      categoryLabel: category.label,
      register,
      tone: String(raw.tone || 'conversational').replace(/\s+/g, ' ').trim(),
      level: String(raw.level || 'Native Fluency').replace(/\s+/g, ' ').trim(),
      ipa: String(raw.ipa || '').replace(/\s+/g, ' ').trim(),
      spokenForm: String(raw.spokenForm || raw.spoken_form || '').replace(/\s+/g, ' ').trim(),
      phoneticBreakdown: String(raw.phoneticBreakdown || raw.phonetics || '')
        .replace(/\s+/g, ' ')
        .trim(),
      coreMeaning,
      localizedMeaning: String(raw.localizedMeaning || raw.translation || '')
        .replace(/\s+/g, ' ')
        .trim(),
      targetLanguage: ctx.targetLanguageCode,
      textbookEquivalent: String(raw.textbookEquivalent || raw.textbookContrast || '')
        .replace(/\s+/g, ' ')
        .trim(),
      nativeContext: String(raw.nativeContext || raw.usageNote || '').replace(/\s+/g, ' ').trim(),
      mistakesToAvoid: String(raw.mistakesToAvoid || '').replace(/\s+/g, ' ').trim(),
      variations: this.normalizeStringList(raw.variations, 6),
      combinations: this.normalizeStringList(raw.combinations, 6),
      usagePatterns: this.normalizeUsagePatterns(raw.usagePatterns),
      examples,
      relatedExpressions: this.normalizeStringList(raw.relatedExpressions, 5),
    };
  }
}
