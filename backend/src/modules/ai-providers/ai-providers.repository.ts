import { Injectable } from '@nestjs/common';
import { SqliteService } from '../../core/database/sqlite.service';
import { InternalResolvedKey } from './ai-providers.types';
import { getPresetById } from './provider-presets';
import { decryptApiKey, encryptApiKey, fingerprintApiKey, maskApiKey } from './security/key-vault.util';

export interface StoredUserAiKeyInput {
  id: string;
  userId: string;
  providerId: string;
  label: string;
  apiKey: string;
  baseUrl: string;
  isDefault?: boolean;
}

@Injectable()
export class AiProvidersRepository {
  constructor(private readonly sqlite: SqliteService) {}

  private rowToInternalKey(row: Record<string, any>): InternalResolvedKey | null {
    try {
      const apiKey = decryptApiKey(String(row.encrypted_key || ''), this.sqlite.dbPath);
      const providerId = String(row.provider_id || 'custom');
      const preset = getPresetById(providerId);
      const label = String(row.label || '').trim() || 'Saved Key';
      const baseUrl = String(row.base_url || preset.defaultBaseUrl || '').trim();

      return {
        id: `vault:${row.id}`,
        providerId,
        providerName: preset.name,
        protocol: preset.protocol,
        label,
        displayName: `${preset.name} · ${label}`,
        source: 'vault',
        maskedKey: String(row.key_mask || maskApiKey(apiKey)),
        baseUrl,
        isDefault: Boolean(row.is_default),
        deletable: true,
        apiKey,
        fingerprint: String(row.key_fingerprint || fingerprintApiKey(apiKey, providerId, baseUrl)),
      };
    } catch {
      return null;
    }
  }

  listUserKeys(userId: string): InternalResolvedKey[] {
    const rows = this.sqlite.db
      .prepare('SELECT * FROM user_ai_keys WHERE user_id = ? ORDER BY is_default DESC, created_at DESC')
      .all(userId) as Array<Record<string, any>>;

    return rows
      .map((r) => this.rowToInternalKey(r))
      .filter((k): k is InternalResolvedKey => Boolean(k));
  }

  findUserKey(userId: string, rawOrPrefixedId: string): InternalResolvedKey | null {
    const cleanId = String(rawOrPrefixedId || '').replace(/^vault:/, '');
    if (!cleanId) return null;
    const row = this.sqlite.db
      .prepare('SELECT * FROM user_ai_keys WHERE id = ? AND user_id = ?')
      .get(cleanId, userId) as Record<string, any> | undefined;
    return row ? this.rowToInternalKey(row) : null;
  }

  saveUserKey(input: StoredUserAiKeyInput): InternalResolvedKey {
    const encrypted = encryptApiKey(input.apiKey, this.sqlite.dbPath);
    const mask = maskApiKey(input.apiKey);
    const fingerprint = fingerprintApiKey(input.apiKey, input.providerId, input.baseUrl);
    const now = new Date().toISOString();

    this.sqlite.db.exec('BEGIN IMMEDIATE');
    try {
      const existingByFp = this.sqlite.db
        .prepare('SELECT id FROM user_ai_keys WHERE user_id = ? AND key_fingerprint = ?')
        .get(input.userId, fingerprint) as { id?: string } | undefined;

      if (input.isDefault) {
        this.sqlite.db
          .prepare('UPDATE user_ai_keys SET is_default = 0 WHERE user_id = ?')
          .run(input.userId);
      }

      if (existingByFp?.id) {
        this.sqlite.db
          .prepare(
            `UPDATE user_ai_keys
             SET provider_id = ?, label = ?, encrypted_key = ?, key_mask = ?, base_url = ?, is_default = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`,
          )
          .run(
            input.providerId,
            input.label,
            encrypted,
            mask,
            input.baseUrl,
            input.isDefault ? 1 : 0,
            now,
            existingByFp.id,
            input.userId,
          );
        this.sqlite.db.exec('COMMIT');
        return this.findUserKey(input.userId, existingByFp.id)!;
      }

      this.sqlite.db
        .prepare(
          `INSERT INTO user_ai_keys (
            id, user_id, provider_id, label, encrypted_key, key_mask,
            key_fingerprint, base_url, is_default, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.id,
          input.userId,
          input.providerId,
          input.label,
          encrypted,
          mask,
          fingerprint,
          input.baseUrl,
          input.isDefault ? 1 : 0,
          now,
          now,
        );

      this.sqlite.db.exec('COMMIT');
      return this.findUserKey(input.userId, input.id)!;
    } catch (err) {
      try {
        this.sqlite.db.exec('ROLLBACK');
      } catch {
        // Ignore rollback failure
      }
      throw err;
    }
  }

  deleteUserKey(userId: string, rawOrPrefixedId: string): boolean {
    const cleanId = String(rawOrPrefixedId || '').replace(/^vault:/, '');
    const res = this.sqlite.db
      .prepare('DELETE FROM user_ai_keys WHERE id = ? AND user_id = ?')
      .run(cleanId, userId);
    return Number(res.changes) > 0;
  }
}
