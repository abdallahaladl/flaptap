import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  DiscoveredModelOption,
  DiscoveredVariantOption,
  RawEndpointModel,
} from '../ai-providers.types';
import { getPresetById } from '../provider-presets';

const MODELS_DEV_URL = 'https://models.dev/api.json';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const EFFORT_LABELS: Record<string, { label: string; desc: string }> = {
  standard: {
    label: 'Standard (Default)',
    desc: 'Uses the provider default without forcing extra thinking tokens.',
  },
  none: {
    label: 'None (Instant)',
    desc: 'Zero reasoning overhead — fastest latency (~1–4s).',
  },
  minimal: {
    label: 'Minimal Effort',
    desc: 'Tiny reasoning touch while preserving near-instant speed.',
  },
  low: {
    label: 'Low Effort (Fast)',
    desc: 'Light reasoning pass with strong structured accuracy.',
  },
  medium: {
    label: 'Medium Effort (Balanced)',
    desc: 'Balanced analytical depth and speed.',
  },
  high: {
    label: 'High Effort (Deep)',
    desc: 'Extended chain-of-thought reasoning before answering.',
  },
  xhigh: {
    label: 'Extra High Effort',
    desc: 'Near-maximum deep reasoning budget.',
  },
  max: {
    label: 'Max Effort',
    desc: 'Maximum reasoning token budget.',
  },
  on: {
    label: 'Thinking Enabled',
    desc: 'Turns on explicit model thinking before output.',
  },
};

const EFFORT_ORDER = ['none', 'minimal', 'standard', 'low', 'medium', 'high', 'xhigh', 'max', 'on'];

export interface CatalogModelMeta {
  id: string;
  name?: string;
  family?: string;
  description?: string;
  type?: string;
  reasoning?: boolean;
  reasoningEfforts?: string[];
  reasoningToggle?: boolean;
  structuredOutput?: boolean;
  supportsTemperature?: boolean;
  contextLength?: number;
  maxOutputTokens?: number;
  modalities?: { input?: string[]; output?: string[] };
  status?: string;
}

@Injectable()
export class ProviderCatalogService implements OnModuleInit {
  private readonly logger = new Logger(ProviderCatalogService.name);
  private catalogByProvider = new Map<string, Map<string, CatalogModelMeta>>();
  private lastSyncedAt = 0;
  private inflightSync: Promise<boolean> | null = null;
  private readonly cacheFilePath: string;

  constructor() {
    const dataDir = path.resolve(__dirname, '../../../../../data');
    this.cacheFilePath = path.join(dataDir, 'models-dev-cache.json');
  }

  onModuleInit(): void {
    this.loadDiskCache();
    void this.ensureSynced(false);
  }

  isSynced(): boolean {
    return this.catalogByProvider.size > 0;
  }

  private loadDiskCache(): void {
    try {
      if (!fs.existsSync(this.cacheFilePath)) return;
      const raw = JSON.parse(fs.readFileSync(this.cacheFilePath, 'utf8'));
      if (raw && typeof raw === 'object' && raw.data) {
        this.ingestModelsDevJson(raw.data);
        this.lastSyncedAt = Number(raw.syncedAt) || 0;
      }
    } catch {
      // Ignore corrupt optional cache file
    }
  }

  async ensureSynced(force = false): Promise<boolean> {
    if (!force && this.catalogByProvider.size > 0 && Date.now() - this.lastSyncedAt < CACHE_TTL_MS) {
      return true;
    }
    if (this.inflightSync) {
      return this.inflightSync;
    }

    this.inflightSync = (async () => {
      try {
        const res = await fetch(MODELS_DEV_URL, {
          headers: { Accept: 'application/json', 'User-Agent': 'flaptap-ai/2.0' },
          signal: AbortSignal.timeout(7000),
        });
        if (!res.ok) return this.isSynced();
        const json = await res.json();
        if (!json || typeof json !== 'object') return this.isSynced();

        this.ingestModelsDevJson(json);
        this.lastSyncedAt = Date.now();

        try {
          const dir = path.dirname(this.cacheFilePath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(
            this.cacheFilePath,
            JSON.stringify({ syncedAt: this.lastSyncedAt, data: json }),
          );
        } catch {
          // Non-fatal disk cache failure
        }
        return true;
      } catch (err: any) {
        this.logger.warn(`Could not refresh models.dev catalog: ${err?.message}`);
        return this.isSynced();
      } finally {
        this.inflightSync = null;
      }
    })();

    return this.inflightSync;
  }

  private ingestModelsDevJson(root: Record<string, any>): void {
    const next = new Map<string, Map<string, CatalogModelMeta>>();

    for (const [providerKey, providerObj] of Object.entries(root)) {
      if (!providerObj || typeof providerObj !== 'object' || !providerObj.models) continue;
      const modelMap = new Map<string, CatalogModelMeta>();

      for (const [mKey, mObj] of Object.entries<any>(providerObj.models)) {
        if (!mObj || typeof mObj !== 'object') continue;
        const id = String(mObj.id || mKey).trim();
        const efforts: string[] = [];
        let toggle = false;

        if (Array.isArray(mObj.reasoning_options)) {
          for (const opt of mObj.reasoning_options) {
            if (opt?.type === 'effort' && Array.isArray(opt.values)) {
              for (const v of opt.values) {
                const s = String(v).trim().toLowerCase();
                if (s && !efforts.includes(s)) efforts.push(s);
              }
            } else if (opt?.type === 'toggle') {
              toggle = true;
            }
          }
        }

        const capEfforts = mObj.capabilities?.reasoning?.effort;
        if (Array.isArray(capEfforts)) {
          for (const v of capEfforts) {
            const s = String(v).trim().toLowerCase();
            if (s && !efforts.includes(s)) efforts.push(s);
          }
        }

        modelMap.set(id.toLowerCase(), {
          id,
          name: mObj.name ? String(mObj.name) : undefined,
          family: mObj.family ? String(mObj.family) : undefined,
          description: mObj.description ? String(mObj.description) : undefined,
          type: mObj.type ? String(mObj.type) : undefined,
          reasoning: Boolean(mObj.reasoning ?? mObj.capabilities?.reasoning?.supported),
          reasoningEfforts: efforts,
          reasoningToggle: toggle || Boolean(mObj.capabilities?.reasoning?.toggle),
          structuredOutput: typeof mObj.structured_output === 'boolean' ? mObj.structured_output : undefined,
          supportsTemperature: typeof mObj.temperature === 'boolean' ? mObj.temperature : undefined,
          contextLength: Number(mObj.limit?.context) || undefined,
          maxOutputTokens: Number(mObj.limit?.output) || undefined,
          modalities: mObj.modalities,
          status: mObj.status ? String(mObj.status) : undefined,
        });
      }

      next.set(providerKey.toLowerCase(), modelMap);
    }

    this.catalogByProvider = next;
  }

  lookupCatalogEntry(providerId: string, modelId: string): CatalogModelMeta | undefined {
    const cleanModel = String(modelId || '')
      .trim()
      .replace(/^models\//i, '')
      .toLowerCase();

    const preset = getPresetById(providerId);
    const candidatesToCheck = [
      ...preset.modelsDevProviderIds,
      providerId.toLowerCase(),
    ];

    // If model ID uses vendor prefix like "openai/gpt-4.1-mini" (OpenRouter style), check both full & vendor map
    const slashIdx = cleanModel.indexOf('/');
    const unprefixed = slashIdx > 0 ? cleanModel.slice(slashIdx + 1) : cleanModel;
    const inferredVendor = slashIdx > 0 ? cleanModel.slice(0, slashIdx) : '';
    if (inferredVendor) {
      candidatesToCheck.push(inferredVendor);
    }

    for (const pKey of candidatesToCheck) {
      const pMap = this.catalogByProvider.get(pKey.toLowerCase());
      if (!pMap) continue;
      if (pMap.has(cleanModel)) return pMap.get(cleanModel);
      if (pMap.has(unprefixed)) return pMap.get(unprefixed);

      // Strip trailing date snapshot suffixes like -20250514 or -2025-04-14
      const stripped = unprefixed
        .replace(/-\d{4}-\d{2}-\d{2}$/, '')
        .replace(/-\d{8}$/, '')
        .replace(/-(?:latest|preview)$/, '');
      if (stripped !== unprefixed && pMap.has(stripped)) {
        return pMap.get(stripped);
      }
    }
    return undefined;
  }

  enrichDiscoveredModels(
    providerId: string,
    rawModels: RawEndpointModel[],
    preferredModelId?: string,
  ): { models: DiscoveredModelOption[]; defaultModel: string } {
    const enriched: DiscoveredModelOption[] = [];

    for (const raw of rawModels) {
      const cleanId = String(raw.id || '').trim();
      if (!cleanId) continue;

      const meta = this.lookupCatalogEntry(providerId, cleanId);

      // Skip explicit non-text-generation types revealed by either live endpoint or models.dev
      const effectiveType = raw.type || meta?.type || '';
      if (['embedding', 'transcription', 'tts', 'image', 'audio', 'moderation'].includes(effectiveType.toLowerCase())) {
        continue;
      }
      if (meta?.modalities?.output && !meta.modalities.output.includes('text')) {
        continue;
      }

      const rawEfforts =
        raw.reasoningEfforts && raw.reasoningEfforts.length > 0
          ? raw.reasoningEfforts
          : meta?.reasoningEfforts || [];
      const toggle = Boolean(raw.reasoningToggle ?? meta?.reasoningToggle);
      const reasoningSupported = Boolean(
        raw.reasoningSupported ?? meta?.reasoning ?? (rawEfforts.length > 0 || toggle),
      );

      const { variants, defaultVariant, reasoningMode } = this.buildVariants(
        reasoningSupported,
        rawEfforts,
        toggle,
        raw.defaultEffort,
      );

      enriched.push({
        id: cleanId,
        name: raw.name || meta?.name || cleanId,
        providerId,
        family: raw.family || meta?.family || raw.ownedBy,
        description: raw.description || meta?.description,
        contextLength: raw.contextLength || meta?.contextLength,
        maxOutputTokens: raw.maxOutputTokens || meta?.maxOutputTokens,
        reasoningSupported,
        reasoningMode,
        variants,
        defaultVariant,
        structuredOutput: raw.structuredOutput ?? meta?.structuredOutput,
        supportsTemperature: raw.supportsTemperature ?? meta?.supportsTemperature,
        source: meta ? 'live-api+models.dev' : 'live-api',
      });
    }

    // Score & sort so fast capable non-deprecated models appear cleanly first
    const scored = enriched.map((m, idx) => ({
      model: m,
      score: this.scoreModelForDefault(m, idx, preferredModelId),
    }));
    scored.sort((a, b) => b.score - a.score);

    const sortedModels = scored.map((s, i) => ({
      ...s.model,
      default: i === 0,
    }));

    return {
      models: sortedModels,
      defaultModel: sortedModels[0]?.id || '',
    };
  }

  private buildVariants(
    reasoningSupported: boolean,
    effortsInput: string[],
    toggle: boolean,
    explicitDefault?: string,
  ): {
    variants: DiscoveredVariantOption[];
    defaultVariant: string;
    reasoningMode: 'none' | 'effort' | 'toggle';
  } {
    const cleanEfforts = Array.from(
      new Set(effortsInput.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean)),
    ).sort((a, b) => {
      const ia = EFFORT_ORDER.indexOf(a);
      const ib = EFFORT_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    if (cleanEfforts.length > 0) {
      const variants: DiscoveredVariantOption[] = [];
      if (!cleanEfforts.includes('none')) {
        variants.push({
          id: 'standard',
          label: EFFORT_LABELS.standard.label,
          description: EFFORT_LABELS.standard.desc,
        });
      }
      for (const eff of cleanEfforts) {
        const meta = EFFORT_LABELS[eff];
        variants.push({
          id: eff,
          effort: eff,
          label: meta?.label || eff.charAt(0).toUpperCase() + eff.slice(1),
          description: meta?.desc || `Reasoning effort level "${eff}".`,
        });
      }

      const preferredFast =
        (explicitDefault && variants.find((v) => v.id === explicitDefault)) ||
        variants.find((v) => v.id === 'none') ||
        variants.find((v) => v.id === 'minimal') ||
        variants.find((v) => v.id === 'standard') ||
        variants.find((v) => v.id === 'low') ||
        variants[0];

      for (const v of variants) {
        v.default = v.id === preferredFast.id;
      }

      return {
        variants,
        defaultVariant: preferredFast.id,
        reasoningMode: 'effort',
      };
    }

    if (reasoningSupported && toggle) {
      return {
        variants: [
          {
            id: 'standard',
            label: 'Standard (Thinking Off)',
            default: true,
            description: 'Direct fast output with thinking disabled/default.',
          },
          {
            id: 'on',
            effort: 'on',
            label: 'Thinking Enabled',
            description: 'Enables extended model thinking.',
          },
        ],
        defaultVariant: 'standard',
        reasoningMode: 'toggle',
      };
    }

    if (reasoningSupported) {
      return {
        variants: [
          {
            id: 'standard',
            label: 'Standard (Model Default)',
            default: true,
            description: 'Built-in model reasoning behavior.',
          },
          {
            id: 'low',
            effort: 'low',
            label: EFFORT_LABELS.low.label,
            description: EFFORT_LABELS.low.desc,
          },
          {
            id: 'high',
            effort: 'high',
            label: EFFORT_LABELS.high.label,
            description: EFFORT_LABELS.high.desc,
          },
        ],
        defaultVariant: 'standard',
        reasoningMode: 'effort',
      };
    }

    return {
      variants: [
        {
          id: 'standard',
          label: 'Standard (Direct Model)',
          default: true,
          description: 'Non-reasoning model — runs at full direct speed.',
        },
      ],
      defaultVariant: 'standard',
      reasoningMode: 'none',
    };
  }

  private scoreModelForDefault(
    m: DiscoveredModelOption,
    originalIdx: number,
    preferredModelId?: string,
  ): number {
    if (preferredModelId && m.id === preferredModelId) return 10000;
    const id = m.id.toLowerCase();
    let score = 100 - originalIdx * 0.01;
    if (/gpt-5\.6-luna|gpt-4\.1-mini|gpt-4o-mini|gemini-2\.5-flash|claude-haiku|claude-sonnet|glm-5\.3-flash/.test(id)) {
      score += 400;
    }
    if (/flash|mini|haiku|luna/.test(id)) score += 120;
    if (/legacy|preview|deprecated|0301|0613|instruct/.test(id)) score -= 80;
    return score;
  }
}
