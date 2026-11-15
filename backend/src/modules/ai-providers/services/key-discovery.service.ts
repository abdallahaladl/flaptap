import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { InternalResolvedKey, ProviderKeyProfile } from '../ai-providers.types';
import { AiProvidersRepository } from '../ai-providers.repository';
import { ENV_MATCHER_RULES, getPresetById } from '../provider-presets';
import { fingerprintApiKey, maskApiKey } from '../security/key-vault.util';

@Injectable()
export class KeyDiscoveryService {
  private readonly logger = new Logger(KeyDiscoveryService.name);

  constructor(private readonly repository: AiProvidersRepository) {}

  private formatEnvSuffixLabel(rawSuffix?: string): string {
    if (!rawSuffix) return 'System Env';
    return rawSuffix
      .split('_')
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(' ');
  }

  private resolveEnvBaseUrl(providerId: string, suffix?: string): string {
    const preset = getPresetById(providerId);
    const upperPrefix = providerId.toUpperCase().replace(/[^A-Z0-9]+/g, '_');

    if (suffix) {
      const suffixedUrl = process.env[`${upperPrefix}_BASE_URL_${suffix.toUpperCase()}`];
      if (suffixedUrl && suffixedUrl.trim()) return suffixedUrl.trim().replace(/\/+$/, '');
    }

    const specificUrl = process.env[`${upperPrefix}_BASE_URL`];
    if (specificUrl && specificUrl.trim()) return specificUrl.trim().replace(/\/+$/, '');

    return preset.defaultBaseUrl;
  }

  private scanEnvironmentKeys(): InternalResolvedKey[] {
    const discovered: InternalResolvedKey[] = [];
    const seenFingerprints = new Set<string>();
    const envEntries = Object.entries(process.env).sort(([a], [b]) => a.localeCompare(b));

    for (const [envName, rawValue] of envEntries) {
      const apiKey = String(rawValue || '').trim();
      if (!apiKey) continue;

      let matchedProvider = '';
      let label = '';
      let customBaseUrl = '';
      let customName = '';

      // Pattern A: Known provider keys (supports multiple keys per provider via _WORK, _2, etc.)
      for (const rule of ENV_MATCHER_RULES) {
        const m = envName.match(rule.regex);
        if (m) {
          matchedProvider = rule.providerId;
          label = this.formatEnvSuffixLabel(m[1]);
          break;
        }
      }

      // Pattern B: Custom env-defined OpenAI-compatible provider: AI_CUSTOM_<TAG>_API_KEY + _BASE_URL
      if (!matchedProvider) {
        const customMatch = envName.match(/^AI_CUSTOM_([A-Z0-9_]+)_API_KEY$/i);
        if (customMatch) {
          const tag = customMatch[1].toUpperCase();
          const urlVal = String(process.env[`AI_CUSTOM_${tag}_BASE_URL`] || '').trim();
          if (urlVal) {
            matchedProvider = 'custom';
            customBaseUrl = urlVal.replace(/\/+$/, '');
            customName =
              String(process.env[`AI_CUSTOM_${tag}_NAME`] || '').trim() ||
              this.formatEnvSuffixLabel(tag);
            label = customName;
          }
        }
      }

      if (!matchedProvider) continue;

      const preset = getPresetById(matchedProvider);
      const baseUrl = customBaseUrl || this.resolveEnvBaseUrl(matchedProvider, label === 'System Env' ? undefined : label);
      if (!baseUrl) continue;

      const fingerprint = fingerprintApiKey(apiKey, matchedProvider, baseUrl);
      if (seenFingerprints.has(fingerprint)) continue;
      seenFingerprints.add(fingerprint);

      const preferredModel =
        matchedProvider === 'opencode-go' && envName === 'OPENCODE_GO_API_KEY'
          ? (process.env.OPENCODE_GO_MODEL || 'gpt-5.6-luna').trim()
          : undefined;

      const providerTitle = customName || preset.name;
      discovered.push({
        id: `env:${envName}`,
        providerId: matchedProvider,
        providerName: providerTitle,
        protocol: preset.protocol,
        label,
        displayName: `${providerTitle} · ${label}`,
        source: 'env',
        envVarName: envName,
        maskedKey: maskApiKey(apiKey),
        baseUrl,
        isDefault: matchedProvider === 'opencode-go' && envName === 'OPENCODE_GO_API_KEY',
        deletable: false,
        apiKey,
        fingerprint,
        preferredModel,
      });
    }

    // Optional read-only scan of OpenCode local auth store for any extra credentials not already in .env
    if (process.env.FLAPTAP_DISABLE_EXTERNAL_KEY_SCAN !== '1') {
      try {
        const dbFile = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
        if (fs.existsSync(dbFile)) {
          const extDb = new DatabaseSync(dbFile, { readOnly: true });
          try {
            const rows = extDb
              .prepare('SELECT id, integration_id, label, value, active FROM credential WHERE active = 1')
              .all() as Array<Record<string, any>>;

            for (const row of rows) {
              const integrationId = String(row.integration_id || '').trim().toLowerCase();
              const preset = getPresetById(integrationId);
              if (preset.id === 'custom') continue;

              const parsed = JSON.parse(String(row.value || '{}'));
              const apiKey = String(parsed?.key || parsed?.apiKey || parsed?.token || '').trim();
              if (!apiKey || !preset.defaultBaseUrl) continue;

              const fp = fingerprintApiKey(apiKey, integrationId, preset.defaultBaseUrl);
              if (seenFingerprints.has(fp)) continue;
              seenFingerprints.add(fp);

              const labelText = `${String(row.label || preset.name).trim()} (Local Store)`;
              discovered.push({
                id: `opencode-auth:${row.id}`,
                providerId: integrationId,
                providerName: preset.name,
                protocol: preset.protocol,
                label: labelText,
                displayName: `${preset.name} · ${labelText}`,
                source: 'opencode-auth',
                maskedKey: maskApiKey(apiKey),
                baseUrl: preset.defaultBaseUrl,
                isDefault: false,
                deletable: false,
                apiKey,
                fingerprint: fp,
              });
            }
          } finally {
            extDb.close();
          }
        }
      } catch (err: any) {
        this.logger.debug(`Skipped external OpenCode auth scan: ${err?.message}`);
      }
    }

    return discovered;
  }

  discoverAllKeys(userId?: string | null): InternalResolvedKey[] {
    const sysKeys = this.scanEnvironmentKeys();
    const userKeys = userId ? this.repository.listUserKeys(userId) : [];

    const seenFp = new Set<string>(sysKeys.map((k) => k.fingerprint));
    const combined: InternalResolvedKey[] = [...sysKeys];

    for (const uk of userKeys) {
      if (seenFp.has(uk.fingerprint)) {
        // User vault copy duplicates a system key: still allow showing user's label if not hidden, or skip dup
        continue;
      }
      seenFp.add(uk.fingerprint);
      combined.push(uk);
    }

    // Ensure at most one default, prioritizing user's explicit default, then OpenCode Go
    const explicitUserDefault = combined.find((k) => k.source === 'vault' && k.isDefault);
    if (explicitUserDefault) {
      for (const k of combined) {
        k.isDefault = k.id === explicitUserDefault.id;
      }
    } else if (!combined.some((k) => k.isDefault) && combined.length > 0) {
      combined[0].isDefault = true;
    }

    combined.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.displayName.localeCompare(b.displayName);
    });

    return combined;
  }

  resolveKeyById(keyId?: string | null, userId?: string | null): InternalResolvedKey {
    const keys = this.discoverAllKeys(userId);
    if (keys.length === 0) {
      throw new Error(
        'No AI provider API keys are configured on this system. Add a key in settings or .env.',
      );
    }

    const requested = String(keyId || '').trim();
    if (!requested) {
      return keys.find((k) => k.isDefault) || keys[0];
    }

    const found = keys.find((k) => k.id === requested);
    if (!found) {
      throw new Error(`API key profile "${requested}" was not found or is not accessible.`);
    }
    return found;
  }

  toPublicProfile(key: InternalResolvedKey, includeMask: boolean): ProviderKeyProfile {
    return {
      id: key.id,
      providerId: key.providerId,
      providerName: key.providerName,
      protocol: key.protocol,
      label: key.label,
      displayName:
        includeMask && key.maskedKey ? `${key.displayName} (${key.maskedKey})` : key.displayName,
      source: key.source,
      envVarName: includeMask ? key.envVarName : undefined,
      maskedKey: includeMask ? key.maskedKey : undefined,
      baseUrl: key.source === 'vault' ? key.baseUrl : '',
      isDefault: key.isDefault,
      deletable: key.deletable,
    };
  }
}
