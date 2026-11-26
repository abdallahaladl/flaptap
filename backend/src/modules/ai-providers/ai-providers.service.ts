import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  DiscoveredModelOption,
  IProviderProtocolAdapter,
  InternalResolvedKey,
  LiveModelsResponse,
  ProviderChatRequest,
  ProviderChatResponse,
  ProviderImageAttachment,
  ProviderKeyProfile,
  ProviderProtocol,
} from './ai-providers.types';
import { AiProvidersRepository } from './ai-providers.repository';
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { OpenAiCompatibleAdapter } from './adapters/openai-compatible.adapter';
import { getPresetById, PROVIDER_PRESETS } from './provider-presets';
import { sanitizeAndValidateBaseUrl } from './security/key-vault.util';
import { KeyDiscoveryService } from './services/key-discovery.service';
import { ProviderCatalogService } from './services/provider-catalog.service';

const MODELS_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedKeyModels {
  response: Omit<LiveModelsResponse, 'keyId' | 'cached'>;
  fetchedAt: number;
}

const sharedModelsCache = new Map<string, CachedKeyModels>();

export function clearModelsCacheForFingerprints(fingerprints: string[]): number {
  let cleared = 0;
  for (const fp of fingerprints) {
    if (fp && sharedModelsCache.delete(fp)) cleared++;
  }
  return cleared;
}

export interface AddUserApiKeyDto {
  providerId: string;
  label?: string;
  apiKey: string;
  baseUrl?: string;
  makeDefault?: boolean;
}

@Injectable()
export class AiProvidersService {
  private readonly logger = new Logger(AiProvidersService.name);
  private readonly adapters = new Map<ProviderProtocol, IProviderProtocolAdapter>();
  private readonly modelsCache = sharedModelsCache;

  constructor(
    private readonly keyDiscovery: KeyDiscoveryService,
    private readonly repository: AiProvidersRepository,
    private readonly catalog: ProviderCatalogService,
    openAiAdapter: OpenAiCompatibleAdapter,
    geminiAdapter: GeminiAdapter,
    anthropicAdapter: AnthropicAdapter,
  ) {
    this.adapters.set(openAiAdapter.protocol, openAiAdapter);
    this.adapters.set(geminiAdapter.protocol, geminiAdapter);
    this.adapters.set(anthropicAdapter.protocol, anthropicAdapter);
  }

  getPresets() {
    return PROVIDER_PRESETS;
  }

  listAvailableKeys(userId?: string | null): ProviderKeyProfile[] {
    const includeMask = Boolean(userId);
    return this.keyDiscovery
      .discoverAllKeys(userId)
      .map((k) => this.keyDiscovery.toPublicProfile(k, includeMask));
  }

  hasAnyConfiguredKey(userId?: string | null): boolean {
    return this.keyDiscovery.discoverAllKeys(userId).length > 0;
  }

  getDefaultSummary(userId?: string | null): {
    configured: boolean;
    provider: string;
    model: string;
    keyId: string;
  } {
    const keys = this.keyDiscovery.discoverAllKeys(userId);
    if (keys.length === 0) {
      return {
        configured: false,
        provider: 'Not configured',
        model: '',
        keyId: '',
      };
    }
    const def = keys.find((k) => k.isDefault) || keys[0];
    return {
      configured: true,
      provider: def.providerName,
      model: def.preferredModel || 'auto-discovered',
      keyId: def.id,
    };
  }

  async fetchModelsForKey(
    keyId: string,
    userId?: string | null,
    forceRefresh = false,
  ): Promise<LiveModelsResponse> {
    const resolvedKey = this.keyDiscovery.resolveKeyById(keyId, userId);
    return this.probeAndEnrichKey(resolvedKey, forceRefresh);
  }

  private async probeAndEnrichKey(
    resolvedKey: InternalResolvedKey,
    forceRefresh: boolean,
  ): Promise<LiveModelsResponse> {
    if (!forceRefresh) {
      const cached = this.modelsCache.get(resolvedKey.fingerprint);
      if (cached && Date.now() - cached.fetchedAt < MODELS_CACHE_TTL_MS) {
        return {
          keyId: resolvedKey.id,
          cached: true,
          ...cached.response,
        };
      }
    }

    const adapter = this.adapters.get(resolvedKey.protocol);
    if (!adapter) {
      throw new Error(`Unsupported protocol "${resolvedKey.protocol}".`);
    }

    const start = Date.now();
    try {
      const [rawModels, catalogSynced] = await Promise.all([
        adapter.fetchLiveModels(resolvedKey),
        this.catalog.ensureSynced(false),
      ]);

      const { models, defaultModel } = this.catalog.enrichDiscoveredModels(
        resolvedKey.providerId,
        rawModels,
        resolvedKey.preferredModel,
      );

      const responseBody: Omit<LiveModelsResponse, 'keyId' | 'cached'> = {
        providerId: resolvedKey.providerId,
        providerName: resolvedKey.providerName,
        protocol: resolvedKey.protocol,
        fetchedLive: true,
        liveStatus: 'ok',
        latencyMs: Date.now() - start,
        catalogSynced,
        defaultModel,
        models,
      };

      if (models.length > 0) {
        this.modelsCache.set(resolvedKey.fingerprint, {
          response: responseBody,
          fetchedAt: Date.now(),
        });
      }

      return {
        keyId: resolvedKey.id,
        cached: false,
        ...responseBody,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      const status = Number(err?.status) || 0;
      const isAuth =
        status === 401 ||
        status === 403 ||
        /unauthorized|invalid.*api.*key|authentication|forbidden|incorrect api key/i.test(
          err?.message || '',
        );

      return {
        keyId: resolvedKey.id,
        providerId: resolvedKey.providerId,
        providerName: resolvedKey.providerName,
        protocol: resolvedKey.protocol,
        fetchedLive: false,
        liveStatus: isAuth ? 'auth_error' : 'network_error',
        error: err?.message || 'Failed to query provider /models endpoint.',
        latencyMs,
        cached: false,
        catalogSynced: this.catalog.isSynced(),
        defaultModel: '',
        models: [],
      };
    }
  }

  async addUserKey(
    userId: string,
    dto: AddUserApiKeyDto,
  ): Promise<{ profile: ProviderKeyProfile; discovery: LiveModelsResponse }> {
    const providerId = String(dto?.providerId || '').trim().toLowerCase();
    const preset = getPresetById(providerId);
    const apiKey = String(dto?.apiKey || '').trim();

    if (!apiKey && preset.id !== 'custom') {
      throw new BadRequestException('Please enter a valid API key.');
    }

    let baseUrl = preset.defaultBaseUrl;
    if (dto?.baseUrl && String(dto.baseUrl).trim()) {
      try {
        baseUrl = sanitizeAndValidateBaseUrl(dto.baseUrl, {
          allowLocalhost: preset.id === 'custom' || preset.id === 'ollama',
        });
      } catch (urlErr: any) {
        throw new BadRequestException(urlErr?.message || 'Invalid custom Base URL.');
      }
    }

    if (!baseUrl) {
      throw new BadRequestException('A valid HTTPS Base URL is required for custom endpoints.');
    }

    const label =
      String(dto?.label || '').trim().slice(0, 48) ||
      `${preset.name} Key`;

    const probeKey: InternalResolvedKey = {
      id: `vault:probe`,
      providerId: preset.id,
      providerName: preset.name,
      protocol: preset.protocol,
      label,
      displayName: `${preset.name} · ${label}`,
      source: 'vault',
      baseUrl,
      isDefault: Boolean(dto?.makeDefault),
      deletable: true,
      apiKey,
      fingerprint: `probe-${Date.now()}`,
    };

    const probeResult = await this.probeAndEnrichKey(probeKey, true);
    if (!probeResult.fetchedLive || probeResult.models.length === 0) {
      throw new BadRequestException(
        probeResult.error
          ? `Key validation failed: ${probeResult.error}`
          : `Connected to ${preset.name}, but no text-generation models were returned for this API key.`,
      );
    }

    const id = `aik_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const saved = this.repository.saveUserKey({
      id,
      userId,
      providerId: preset.id,
      label,
      apiKey,
      baseUrl,
      isDefault: Boolean(dto?.makeDefault),
    });

    // Seed cache for saved fingerprint cleanly so subsequent GET /models is instant
    this.modelsCache.set(saved.fingerprint, {
      response: {
        providerId: probeResult.providerId,
        providerName: probeResult.providerName,
        protocol: probeResult.protocol,
        fetchedLive: true,
        liveStatus: 'ok',
        latencyMs: probeResult.latencyMs,
        catalogSynced: probeResult.catalogSynced,
        defaultModel: probeResult.defaultModel,
        models: probeResult.models,
      },
      fetchedAt: Date.now(),
    });

    return {
      profile: this.keyDiscovery.toPublicProfile(saved, true),
      discovery: {
        ...probeResult,
        keyId: saved.id,
      },
    };
  }

  deleteUserKey(userId: string, keyId: string): boolean {
    const existing = this.repository.findUserKey(userId, keyId);
    if (existing) {
      this.modelsCache.delete(existing.fingerprint);
    }
    return this.repository.deleteUserKey(userId, keyId);
  }

  clearUserModelsCache(userId: string): number {
    const keys = this.repository.listUserKeys(userId);
    return clearModelsCacheForFingerprints(keys.map((k) => k.fingerprint));
  }

  deleteAllUserKeys(userId: string): number {
    this.clearUserModelsCache(userId);
    return this.repository.deleteAllUserKeys(userId);
  }

  async resolveExecutionSelection(params: {
    userId?: string | null;
    keyId?: string;
    model?: string;
    variant?: string;
  }): Promise<{
    key: InternalResolvedKey;
    modelId: string;
    variantId: string;
    modelOption?: DiscoveredModelOption;
  }> {
    const key = this.keyDiscovery.resolveKeyById(params.keyId, params.userId);
    let modelId = String(params.model || '').trim();
    let variantId = String(params.variant || '').trim();
    let modelOption: DiscoveredModelOption | undefined;

    if (!modelId) {
      const live = await this.probeAndEnrichKey(key, false);
      if (live.fetchedLive && live.models.length > 0) {
        modelId = live.defaultModel || live.models[0].id;
        modelOption = live.models.find((m) => m.id === modelId) || live.models[0];
      } else if (key.preferredModel) {
        modelId = key.preferredModel;
      } else {
        throw new Error(live.error || `Could not discover a live model for "${key.displayName}".`);
      }
    } else {
      // Look up cached live list if available to inspect defaultVariant cleanly without extra HTTP latency
      const cached = this.modelsCache.get(key.fingerprint);
      modelOption = cached?.response?.models?.find((m) => m.id === modelId);
    }

    if (!variantId) {
      variantId = modelOption?.defaultVariant || 'none';
    }

    return { key, modelId, variantId, modelOption };
  }

  private pickIntraKeyFallbackCandidates(
    key: InternalResolvedKey,
    failedModelId: string,
    failedVariantId?: string,
  ): Array<{ modelId: string; variantId: string }> {
    const candidates: Array<{ modelId: string; variantId: string }> = [];
    const seen = new Set<string>();
    const pushUnique = (modelId: string, variantId: string) => {
      const k = `${modelId}::${variantId}`;
      if (seen.has(k)) return;
      seen.add(k);
      candidates.push({ modelId, variantId });
    };

    const isHeavy = ['high', 'xhigh', 'max', 'on'].includes(
      String(failedVariantId || '').toLowerCase(),
    );

    // If a model stalled or returned empty on a heavy reasoning tier, first try the same model
    // at a lighter reasoning tier (e.g. 'low' / 'none') before jumping models.
    const cached = this.modelsCache.get(key.fingerprint);
    const liveModels = cached?.response?.models || [];
    if (isHeavy) {
      const selfMeta = liveModels.find((m) => m.id === failedModelId);
      const lighter =
        selfMeta?.variants?.find((v) => v.id === 'low')?.id ||
        selfMeta?.variants?.find((v) => v.id === 'none')?.id ||
        selfMeta?.defaultVariant ||
        (failedModelId.includes('luna') ? 'none' : 'low');
      if (lighter && lighter !== failedVariantId) {
        pushUnique(failedModelId, lighter);
      }
    }

    if (!['opencode-go', 'opencode', 'openrouter'].includes(key.providerId)) {
      return candidates;
    }

    const preferredFastOrder = [
      'gpt-5.6-luna',
      'glm-5.3-flash',
      'deepseek-v4.1-flash',
      'claude-haiku-5-5',
      'gpt-6-luna',
    ];

    for (const candidateId of preferredFastOrder) {
      if (candidateId === failedModelId) continue;
      const found = liveModels.find((m) => m.id === candidateId);
      if (found) {
        pushUnique(found.id, found.defaultVariant || 'standard');
      } else if (key.providerId === 'opencode-go' && liveModels.length === 0) {
        pushUnique(candidateId, candidateId.includes('luna') ? 'none' : 'low');
      }
      if (candidates.length >= 3) break;
    }

    if (candidates.length === 0) {
      const alternate = liveModels.find((m) => m.id !== failedModelId);
      if (alternate) {
        pushUnique(alternate.id, alternate.defaultVariant || 'standard');
      }
    }

    return candidates.slice(0, 3);
  }

  async executeChat(
    userId: string | null | undefined,
    params: {
      keyId?: string;
      model?: string;
      variant?: string;
      systemPrompt: string;
      userPrompt: string;
      images?: ProviderImageAttachment[];
      temperature?: number;
      maxTokens?: number;
      json?: boolean;
      timeoutMs?: number;
      signal?: AbortSignal;
      allowIntraKeyFailover?: boolean;
      /** Never wait a second full ceiling after a timeout (streamed work is kept). */
      retryOnTimeout?: boolean;
      /** Ask the adapter to return streamed text that arrived before a stall. */
      allowPartialOnTimeout?: boolean;
      onContentDelta?: (delta: string, accumulated: string) => void;
    },
  ): Promise<ProviderChatResponse> {
    const resolved = await this.resolveExecutionSelection({
      userId,
      keyId: params.keyId,
      model: params.model,
      variant: params.variant,
    });

    const adapter = this.adapters.get(resolved.key.protocol);
    if (!adapter) {
      throw new Error(`Unsupported protocol "${resolved.key.protocol}".`);
    }

    const catalogMeta =
      resolved.modelOption ||
      this.catalog.lookupCatalogEntry(resolved.key.providerId, resolved.modelId);

    const req: ProviderChatRequest = {
      model: resolved.modelId,
      variant: resolved.variantId,
      systemPrompt: params.systemPrompt,
      userPrompt: params.userPrompt,
      images: params.images,
      temperature: params.temperature,
      supportsTemperature: catalogMeta?.supportsTemperature,
      maxTokens: params.maxTokens,
      json: params.json,
      timeoutMs: params.timeoutMs,
      signal: params.signal,
      allowPartialOnTimeout: params.allowPartialOnTimeout,
      onContentDelta: params.onContentDelta,
    };

    let primaryError: Error | null = null;
    try {
      return await adapter.executeChat(resolved.key, req);
    } catch (firstErr: any) {
      if (params.signal?.aborted) throw firstErr;
      primaryError = firstErr;

      const msg = firstErr?.message || '';
      const isTimeoutError = /timed out|stalled/i.test(msg);
      if (isTimeoutError && params.retryOnTimeout === false) {
        throw firstErr;
      }
      const isTransient = /429|overloaded|502|503|504|rate|timed out|stalled|empty response/i.test(
        msg,
      );
      if (isTransient) {
        this.logger.warn(
          `${resolved.key.providerName} (${resolved.modelId}/${resolved.variantId}) failed (${msg}); checking retry/failover.`,
        );

        const fallbackCandidates =
          params.allowIntraKeyFailover !== false
            ? this.pickIntraKeyFallbackCandidates(
                resolved.key,
                resolved.modelId,
                resolved.variantId,
              )
            : [];

        const isTimeoutOrEmptyOrRate = /timed out|stalled|429|overloaded|rate|empty response/i.test(
          msg,
        );
        if (!isTimeoutOrEmptyOrRate || fallbackCandidates.length === 0) {
          await new Promise((r) => setTimeout(r, 350));
          if (params.signal?.aborted) throw firstErr;
          try {
            return await adapter.executeChat(resolved.key, req);
          } catch (retryErr: any) {
            primaryError = retryErr;
            if (params.signal?.aborted) throw retryErr;
          }
        }

        // Try up to 2 fast intra-key fallback candidates sequentially until one succeeds cleanly
        for (const fb of fallbackCandidates.slice(0, 2)) {
          if (params.signal?.aborted) break;
          this.logger.warn(
            `Intra-key failover on ${resolved.key.providerName}: ${resolved.modelId}/${resolved.variantId} -> ${fb.modelId}/${fb.variantId}`,
          );
          const fallbackMeta = this.catalog.lookupCatalogEntry(
            resolved.key.providerId,
            fb.modelId,
          );
          try {
            const fallbackRes = await adapter.executeChat(resolved.key, {
              ...req,
              model: fb.modelId,
              variant: fb.variantId,
              supportsTemperature: fallbackMeta?.supportsTemperature,
              timeoutMs: 45000,
            });
            return {
              ...fallbackRes,
              fallbackFrom: `${resolved.modelId} (${resolved.variantId}): ${primaryError?.message || 'overloaded'}`,
            };
          } catch (fbErr: any) {
            primaryError = fbErr;
            this.logger.warn(
              `Intra-key failover candidate ${fb.modelId}/${fb.variantId} also failed: ${fbErr?.message}`,
            );
          }
        }
      }

      throw primaryError || firstErr;
    }
  }

  /**
   * Resolves a configured Cloud Speech-to-Text key (`groq` free-tier first, then `openai`)
   * so audio/video transcription can run with zero local CPU usage when available.
   */
  resolvePreferredCloudSttKey(userId?: string | null): {
    provider: 'groq' | 'openai';
    apiKey: string;
    baseUrl: string;
    model: string;
  } | null {
    const keys = this.keyDiscovery.discoverAllKeys(userId);
    const groqKey = keys.find((k) => k.providerId === 'groq' && k.apiKey);
    if (groqKey) {
      return {
        provider: 'groq',
        apiKey: groqKey.apiKey,
        baseUrl: groqKey.baseUrl || 'https://api.groq.com/openai/v1',
        model: 'whisper-large-v3-turbo',
      };
    }

    const openaiKey = keys.find((k) => k.providerId === 'openai' && k.apiKey);
    if (openaiKey) {
      return {
        provider: 'openai',
        apiKey: openaiKey.apiKey,
        baseUrl: openaiKey.baseUrl || 'https://api.openai.com/v1',
        model: 'whisper-1',
      };
    }

    return null;
  }
}
