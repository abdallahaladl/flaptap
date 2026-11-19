import {
  GeneratedLearningCandidate,
  LearningDomainCategorySpec,
  LearningDomainMetadata,
  LearningExampleItem,
  LearningGenerationContext,
  LearningPatternSlot,
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

    const categoryLines = activeCategories
      .map((c) => `- ${c.id} | ${c.label} | ${c.promptGuidance}`)
      .join('\n');

    // Static per domain: identical system prompt across chunks/runs keeps the
    // provider prefix cache warm and keeps the contract unambiguous.
    const systemPrompt = [
      this.getDomainPersonaPrompt(ctx),
      '',
      this.getQualityAndDiversityRules(ctx),
      '',
      'COUNT CONTRACT (non-negotiable):',
      '- The user asks for N items. Return EXACTLY N complete objects in the "items" array — count them before you finish.',
      '- Never return fewer than N and never emit prose, notes, or a partial array. If you run out of ideas inside the assigned categories, widen to other angles of the same domain instead of shortening the array.',
      '- Every object in the batch must be a different expression from a different idea family: no repeats, no trivial inflections, no same phrase re-categorized.',
      '',
      'REUSABLE PATTERN LAW (highest priority):',
      '- "expression" is always the reusable frame the learner will say again — never a one-off sentence about a single event ("Could you run it against staging?" is forbidden).',
      '- Put a square-bracket slot wherever a filler can change: "run [X] against [Y]", "not me [doing X]", "for what it\'s worth, [X]". Use abstract slot names only (X, Y, Z, [doing X]); never bracket literal phrase words.',
      '- "patternSlots" explains every slot in expression order: {"slot":"X","role":"what X stands for (<=10 words)","example":"real filler (1-4 words)"}. No invented slots, no omissions.',
      '- Every example sentence fills the slots with concrete natural fillers.',
      '- A genuinely fixed single term or reduction (e.g. "deadlock", "whatcha") may omit slots; every other item must include them.',
      '- Slot markers map 1:1 between "expression" and "localizedMeaning": never add or drop a slot in the translation.',
      '- "spokenForm" is one filled natural spoken line (3-7 words, no brackets or bare slot letters), never the expression repeated.',
      '',
      'LANGUAGE & SHAPE:',
      '- "localizedMeaning" is the expression\'s own equivalent in the target language named by the user, same register, same slots; never the explanation, never an example, never a literal word-for-word rendering.',
      '- Everything else is crisp native English; zero ESL textbook basics ("good morning", "how are you", "in my opinion", "a lot of").',
      '- ACCENT SOURCE OF TRUTH: General American only (rhotic /ɹ/, Flap-T /ɾ/, schwa /ə/, linking, stress). Never British IPA, British vocabulary, or spelling.',
      '- ipa is required on every item: transcribe the pronounced expression or spokenForm exactly, marking primary stress (ˈ) on the stressed syllable.',
      '- phoneticBreakdown <=12 words (Flap-T /ɾ/, schwa /ə/, linking, stress).',
      '- coreMeaning <=16 words. textbookEquivalent = stiff ESL contrast (3-7 words). nativeContext <=12 words (who/when). mistakesToAvoid <=12 words.',
      '- Exactly 2 examples with distinct 3-6 word where/when contexts; exactly 2 variations (never restate the expression itself); exactly 2 combinations; 1-2 usagePatterns; exactly 2 relatedExpressions.',
      '',
      'OUTPUT (minified JSON only — no markdown, no commentary, no emojis):',
      '{"items":[{',
      '"expression":"reusable [X]/[Y] frame or fixed canonical term",',
      '"patternSlots":[{"slot":"X","role":"what X stands for","example":"real filler"}],',
      '"localizedMeaning":"expression\'s own Target Language equivalent, slots kept",',
      '"categoryId":"exact id from the user\'s list","register":"exact register",',
      '"tone":"1 word","level":"2-3 words","ipa":"/General American IPA/",',
      '"spokenForm":"one filled spoken line, no brackets","phoneticBreakdown":"<=12 words",',
      '"coreMeaning":"<=16 words","textbookEquivalent":"3-7 words",',
      '"nativeContext":"<=12 words","mistakesToAvoid":"<=12 words",',
      '"variations":["..."],"combinations":["..."],',
      '"usagePatterns":[{"pattern":"...","meaning":"<=8 words","example":"<=12 words"}],',
      '"examples":[{"speakerContext":"where, when","sentence":"<=16 words, fills slots","explanation":"<=8 words"},{...}],',
      '"relatedExpressions":["...","..."]',
      '}]}',
    ].join('\n');

    const localizedMeaningRule =
      ctx.targetLanguageCode === 'ar'
        ? [
            'Write "localizedMeaning" as the expression\'s own equivalent in living Egyptian Arabic (عامية مصرية), same spoken register and the same slots.',
            'Translate ONLY the expression itself: never "coreMeaning", never an example, never "spokenForm", never a past-tense event.',
            'Use Egyptian words and grammar (بقى، كده، عشان، اللي، مش، خلّي، في الصورة، على طول) and everyday tech talk (شغّال، عطّل، بلوكر); no MSA (سوف، ليس، الذي، يجب أن), no word-for-word phrasing.',
            'Calibration: "off the top of my head, [X]" -> "من دماغي كده، [X]" (never "على راسي"); "pull the receipts on [X]" -> "هات الأدلة على [X]"; "fat-finger [X]" -> "تدوس على [X] بالغلط".',
          ].join(' ')
        : [
            `Write "localizedMeaning" as the expression's own equivalent in living ${ctx.targetLanguageName}, same spoken register and the same slots.`,
            'Translate ONLY the expression itself: never "coreMeaning", never an example, never "spokenForm", never a past-tense event; no literal word-for-word phrasing.',
          ].join(' ');

    const exclusionSection =
      ctx.excludedExpressions.length > 0
        ? `Do not repeat or trivially inflect: ${ctx.excludedExpressions.join(', ')}`
        : '';

    const userPrompt = [
      `Generate exactly ${ctx.askCount} unique ${this.metadata.itemNounPlural} for "${this.metadata.title}".`,
      `Return exactly ${ctx.askCount} complete objects in "items" (array length ${ctx.askCount}) — no fewer, no placeholders.`,
      `Target language for "localizedMeaning": ${ctx.targetLanguageName} (${ctx.targetLanguageNative}). ${localizedMeaningRule}`,
      focusedCategory
        ? `Category: ${focusedCategory.id} | ${focusedCategory.label} | ${focusedCategory.promptGuidance}`
        : `Categories (use only these ids, distribute evenly):\n${categoryLines}`,
      `Registers: ${this.metadata.registers.join(' | ')}`,
      ctx.angleHint ? `Angle: ${ctx.angleHint}` : '',
      ctx.focusTopic ? `Topic / vibe: "${ctx.focusTopic}"` : '',
      ctx.preferredRegister ? `Preferred register: ${ctx.preferredRegister}` : '',
      exclusionSection,
      'Return minified JSON only.',
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

  /** Slot names in order of appearance, e.g. "[X] against [Y]" -> ["X", "Y"]. */
  protected extractExpressionSlots(expression: string): string[] {
    const out: string[] = [];
    const re = /\[([^[\]]{1,40})\]/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(String(expression || '')))) {
      const slot = match[1].replace(/\s+/g, ' ').trim();
      if (!slot) continue;
      if (out.some((s) => s.toLowerCase() === slot.toLowerCase())) continue;
      out.push(slot);
      if (out.length >= 4) break;
    }
    return out;
  }

  /** "[doing X]" and "X" are the same slot; "[X]" and "[Y]" are not. */
  protected slotNamesMatch(a: string, b: string): boolean {
    const normalize = (value: string) =>
      String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const left = normalize(a);
    const right = normalize(b);
    if (!left || !right) return false;
    if (left === right) return true;
    const leftTokens = left.split(' ');
    const rightTokens = right.split(' ');
    if (leftTokens.length === 1 || rightTokens.length === 1) {
      return leftTokens[leftTokens.length - 1] === rightTokens[rightTokens.length - 1];
    }
    return left.includes(right) || right.includes(left);
  }

  /**
   * Keep only slots that actually exist in the expression, and guarantee that
   * every expression slot gets a legend entry even when the model omits one.
   */
  protected normalizePatternSlots(rawSlots: unknown, expression: string): LearningPatternSlot[] {
    const expressionSlots = this.extractExpressionSlots(expression);
    if (expressionSlots.length === 0) return [];

    const provided = new Map<string, LearningPatternSlot>();
    if (Array.isArray(rawSlots)) {
      for (const entry of rawSlots) {
        if (!entry || typeof entry !== 'object') continue;
        const rawSlot = String(
          (entry as any).slot || (entry as any).token || (entry as any).name || '',
        )
          .replace(/[[\]]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (!rawSlot) continue;
        const matched = expressionSlots.find((slot) => this.slotNamesMatch(slot, rawSlot));
        if (!matched || provided.has(matched)) continue;
        provided.set(matched, {
          slot: matched,
          role: String((entry as any).role || (entry as any).meaning || (entry as any).represents || '')
            .replace(/\s+/g, ' ')
            .trim(),
          example: String((entry as any).example || (entry as any).filler || (entry as any).sample || '')
            .replace(/\s+/g, ' ')
            .trim(),
        });
        if (provided.size >= 4) break;
      }
    }

    return expressionSlots.map(
      (slot) => provided.get(slot) || { slot, role: '', example: '' },
    );
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

    // Slots must be abstract placeholders ([X], [Y], [doing X]). A bracketed
    // literal word ("off the top of my [head]") is not a reusable slot: unwrap
    // it so the title stays canonical and no bogus legend is shown.
    const isValidSlotName = (name: string) =>
      /(^|[^A-Za-z0-9])[XYZ]([^A-Za-z0-9]|$)/i.test(String(name || ''));
    const rawSlotNames = this.extractExpressionSlots(expression);
    const validSlotNames = rawSlotNames.filter(isValidSlotName);
    const cleanedExpression =
      rawSlotNames.length === validSlotNames.length
        ? expression
        : expression.replace(/\[([^[\]]{1,40})\]/g, (match, name) =>
            isValidSlotName(name) ? match : String(name),
          );
    const expressionSlots = this.extractExpressionSlots(cleanedExpression);

    let localizedMeaning = String(raw.localizedMeaning || raw.translation || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (expressionSlots.length === 0) {
      localizedMeaning = localizedMeaning
        .replace(/\[([^[\]]{1,40})\]/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // A slot template is not a spoken line. Keep only filled, bracket-free forms.
    let spokenForm = String(raw.spokenForm || raw.spoken_form || '')
      .replace(/\s+/g, ' ')
      .trim();
    const hasBareSlotLetter = expressionSlots.some(
      (slot) =>
        /^[A-Z]$/.test(slot) &&
        new RegExp(`(^|[^A-Za-z])${slot}([^A-Za-z]|$)`).test(spokenForm),
    );
    if (/[[\]]/.test(spokenForm) || hasBareSlotLetter) {
      spokenForm = '';
    } else if (
      expressionSlots.length > 0 &&
      spokenForm.replace(/[[\]]/g, '').toLowerCase() ===
        cleanedExpression.replace(/[[\]]/g, '').toLowerCase()
    ) {
      spokenForm = '';
    }

    return {
      expression: cleanedExpression,
      categoryId: category.id,
      categoryLabel: category.label,
      register,
      tone: String(raw.tone || 'conversational').replace(/\s+/g, ' ').trim(),
      level: String(raw.level || 'Native Fluency').replace(/\s+/g, ' ').trim(),
      ipa: String(raw.ipa || '').replace(/\s+/g, ' ').trim(),
      spokenForm,
      phoneticBreakdown: String(raw.phoneticBreakdown || raw.phonetics || '')
        .replace(/\s+/g, ' ')
        .trim(),
      coreMeaning,
      localizedMeaning,
      targetLanguage: ctx.targetLanguageCode,
      textbookEquivalent: String(raw.textbookEquivalent || raw.textbookContrast || '')
        .replace(/\s+/g, ' ')
        .trim(),
      nativeContext: String(raw.nativeContext || raw.usageNote || '').replace(/\s+/g, ' ').trim(),
      mistakesToAvoid: String(raw.mistakesToAvoid || '').replace(/\s+/g, ' ').trim(),
      variations: this.normalizeStringList(raw.variations, 6),
      combinations: this.normalizeStringList(raw.combinations, 6),
      usagePatterns: this.normalizeUsagePatterns(raw.usagePatterns),
      patternSlots: this.normalizePatternSlots(
        raw.patternSlots || raw.slots || raw.pattern_slots,
        cleanedExpression,
      ),
      examples,
      relatedExpressions: this.normalizeStringList(raw.relatedExpressions, 5),
    };
  }
}
