import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DEFAULT_LANGUAGE, getLanguage } from '../../core/ai/languages';
import {
  buildSentenceTranslationGuidance,
  buildTermTranslationGuidance,
} from '../../core/ai/translation-rules.util';
import { AiProvidersService } from '../ai-providers/ai-providers.service';
import { LearningLibraryRepository } from './learning-library.repository';
import { LearningLibraryItem } from './learning-library.types';
import { extractJsonBlock } from './utils/json-salvage.util';

const MAX_TRANSLATE_BATCH = 10;

export interface TranslateLibraryItemsOptions {
  targetLanguage?: string;
  force?: boolean;
  keyId?: string;
  model?: string;
}

/**
 * Single-responsibility service for translating expression meanings and
 * example / usage-pattern sentences on existing saved Generate Phrases items
 * (backfilling legacy untranslated sentences or switching target language).
 */
@Injectable()
export class LearningLibraryTranslationService {
  private readonly logger = new Logger(LearningLibraryTranslationService.name);

  constructor(
    private readonly repository: LearningLibraryRepository,
    private readonly aiProviders: AiProvidersService,
  ) {}

  hasMissingTranslations(item: LearningLibraryItem, targetLanguageCode: string): boolean {
    const lang = getLanguage(targetLanguageCode || item.targetLanguage || DEFAULT_LANGUAGE);
    if (lang.code === 'en') return false;
    if (String(item.targetLanguage || '').toLowerCase() !== lang.code) return true;
    if (!String(item.localizedMeaning || '').trim()) return true;

    const examples = Array.isArray(item.examples) ? item.examples : [];
    if (examples.some((ex) => ex?.sentence && !String(ex.translation || '').trim())) {
      return true;
    }

    const patterns = Array.isArray(item.usagePatterns) ? item.usagePatterns : [];
    if (patterns.some((p) => p?.example && !String(p.exampleTranslation || '').trim())) {
      return true;
    }

    return false;
  }

  async translateItems(
    userId: string,
    itemIds: string[],
    options: TranslateLibraryItemsOptions = {},
  ): Promise<{
    items: LearningLibraryItem[];
    translatedCount: number;
    targetLanguage: string;
  }> {
    const cleanIds = Array.from(
      new Set((Array.isArray(itemIds) ? itemIds : []).map((id) => String(id || '').trim()).filter(Boolean)),
    ).slice(0, MAX_TRANSLATE_BATCH);

    if (cleanIds.length === 0) {
      throw new BadRequestException('At least one expression ID is required.');
    }

    const lang = getLanguage(options.targetLanguage || DEFAULT_LANGUAGE);
    const existing = this.repository.getItemsByIds(userId, cleanIds);
    if (existing.length === 0) {
      return { items: [], translatedCount: 0, targetLanguage: lang.code };
    }

    if (lang.code === 'en') {
      return { items: existing, translatedCount: 0, targetLanguage: lang.code };
    }

    const force = Boolean(options.force);
    const pending = existing.filter((it) => force || this.hasMissingTranslations(it, lang.code));
    if (pending.length === 0) {
      return { items: existing, translatedCount: 0, targetLanguage: lang.code };
    }

    if (!this.aiProviders.hasAnyConfiguredKey(userId)) {
      throw new ServiceUnavailableException(
        'No AI provider API key is configured. Add one in API Keys manager or .env.',
      );
    }

    const selection = await this.aiProviders.resolveExecutionSelection({
      userId,
      keyId: options.keyId,
      model: options.model,
    });

    const variants = (selection.modelOption?.variants || []).map((v) => String(v.id).toLowerCase());
    const fastVariant =
      ['none', 'minimal', 'low', 'standard'].find((v) => variants.includes(v)) ||
      selection.variantId;

    const termRule = buildTermTranslationGuidance(lang, {
      preserveSlots: true,
      multiSense: false,
    });
    const sentenceRule = buildSentenceTranslationGuidance(lang, [
      'exampleTranslations[]',
      'patternExampleTranslations[]',
    ]);

    const systemPrompt = [
      'You are an elite bilingual American English translator.',
      `Target language: ${lang.name} (${lang.native}).`,
      termRule,
      sentenceRule,
      'Return ONLY valid minified JSON with no markdown fences and no commentary:',
      '{"items":[{"id":"exact input id","localizedMeaning":"...","exampleTranslations":["translation for example 0","translation for example 1"],"patternExampleTranslations":["translation for pattern 0 example"]}]}',
      'Keep array lengths and item IDs matched 1:1 with the input. Never leave a non-empty input sentence untranslated.',
    ].join('\n');

    const payloadItems = pending.map((it) => ({
      id: it.id,
      expression: it.expression,
      coreMeaning: it.coreMeaning,
      examples: (it.examples || []).map((ex) => ex.sentence || ''),
      patternExamples: (it.usagePatterns || []).map((p) => p.example || ''),
    }));

    const userPrompt = [
      `Translate these ${pending.length} American English item(s) and their example sentences into ${lang.name} (${lang.native}):`,
      JSON.stringify(payloadItems),
      'Return minified JSON only.',
    ].join('\n');

    const maxTokens = Math.min(8192, Math.max(1800, pending.length * 420));
    const res = await this.aiProviders.executeChat(userId, {
      keyId: selection.key.id,
      model: selection.modelId,
      variant: fastVariant,
      systemPrompt,
      userPrompt,
      temperature: 0.25,
      maxTokens,
      json: true,
      timeoutMs: 45000,
      allowIntraKeyFailover: true,
    });

    const parsed = this.parseTranslationResponse(res.content);
    const byId = new Map(parsed.map((entry) => [entry.id, entry]));

    let translatedCount = 0;
    const updatedMap = new Map<string, LearningLibraryItem>();

    for (const item of pending) {
      const tr = byId.get(item.id);
      if (!tr) continue;

      const langChanged = String(item.targetLanguage || '').toLowerCase() !== lang.code;
      const nextLocalized =
        tr.localizedMeaning && (force || langChanged || !String(item.localizedMeaning || '').trim())
          ? tr.localizedMeaning
          : item.localizedMeaning;

      const nextExamples = (item.examples || []).map((ex, idx) => {
        const translated = String(tr.exampleTranslations[idx] || '').replace(/\s+/g, ' ').trim();
        const shouldApply =
          Boolean(translated) &&
          translated !== ex.sentence &&
          (force || langChanged || !String(ex.translation || '').trim());
        return shouldApply
          ? { ...ex, translation: translated }
          : langChanged && !translated
            ? { ...ex, translation: '' }
            : ex;
      });

      const nextPatterns = (item.usagePatterns || []).map((p, idx) => {
        const translated = String(tr.patternExampleTranslations[idx] || '')
          .replace(/\s+/g, ' ')
          .trim();
        const shouldApply =
          Boolean(translated) &&
          translated !== p.example &&
          (force || langChanged || !String(p.exampleTranslation || '').trim());
        return shouldApply
          ? { ...p, exampleTranslation: translated }
          : langChanged && !translated
            ? { ...p, exampleTranslation: '' }
            : p;
      });

      const saved = this.repository.updateItemTranslations(userId, item.id, {
        targetLanguage: lang.code,
        localizedMeaning: nextLocalized,
        examples: nextExamples,
        usagePatterns: nextPatterns,
      });

      if (saved) {
        updatedMap.set(saved.id, saved);
        translatedCount++;
      }
    }

    this.logger.log(
      `Translated ${translatedCount}/${pending.length} Learning Library item(s) to "${lang.code}" via ${res.modelUsed}`,
    );

    return {
      items: existing.map((it) => updatedMap.get(it.id) || it),
      translatedCount,
      targetLanguage: lang.code,
    };
  }

  private parseTranslationResponse(raw: string): Array<{
    id: string;
    localizedMeaning: string;
    exampleTranslations: string[];
    patternExampleTranslations: string[];
  }> {
    const block = extractJsonBlock(raw);
    let parsed: any;
    try {
      parsed = JSON.parse(block);
    } catch {
      return [];
    }

    const list = Array.isArray(parsed?.items)
      ? parsed.items
      : Array.isArray(parsed)
        ? parsed
        : [];

    return list
      .filter((entry: any) => entry && typeof entry === 'object' && entry.id)
      .map((entry: any) => ({
        id: String(entry.id).trim(),
        localizedMeaning: String(entry.localizedMeaning || entry.translation || '')
          .replace(/\s+/g, ' ')
          .trim(),
        exampleTranslations: Array.isArray(entry.exampleTranslations)
          ? entry.exampleTranslations.map((s: any) => String(s || '').trim())
          : [],
        patternExampleTranslations: Array.isArray(entry.patternExampleTranslations)
          ? entry.patternExampleTranslations.map((s: any) => String(s || '').trim())
          : [],
      }));
  }
}
