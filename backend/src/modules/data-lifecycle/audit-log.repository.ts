import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SqliteService } from '../../core/database/sqlite.service';
import {
  AuditEventRecord,
  AuditFeature,
  AuditScope,
  PurgeCounts,
} from './data-lifecycle.types';

function compactCounts(input: PurgeCounts | undefined): PurgeCounts {
  const out: PurgeCounts = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, raw] of Object.entries(input)) {
    const val = Number(raw);
    if (Number.isFinite(val) && val > 0) {
      (out as Record<string, number>)[key] = Math.round(val);
    }
  }
  return out;
}

@Injectable()
export class AuditLogRepository {
  constructor(private readonly sqlite: SqliteService) {}

  record(
    userId: string,
    input: {
      action: string;
      feature: AuditFeature;
      scope: AuditScope;
      targetId?: string;
      targetLabel?: string;
      summary: string;
      purged?: PurgeCounts;
    },
  ): AuditEventRecord {
    const id = `aud_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const createdAt = new Date().toISOString();
    const purged = compactCounts(input.purged);
    const targetId = String(input.targetId || '').slice(0, 120);
    const targetLabel = String(input.targetLabel || '').slice(0, 180);
    const summary = String(input.summary || '').slice(0, 320);

    this.sqlite.db
      .prepare(
        `INSERT INTO audit_events (
          id, user_id, action, feature, scope, target_id, target_label, summary, purged_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        userId,
        String(input.action || 'delete').slice(0, 64),
        input.feature,
        input.scope,
        targetId,
        targetLabel,
        summary,
        JSON.stringify(purged),
        createdAt,
      );

    return {
      id,
      action: String(input.action || 'delete'),
      feature: input.feature,
      scope: input.scope,
      targetId,
      targetLabel,
      summary,
      purged,
      createdAt,
    };
  }

  list(userId: string, opts: { feature?: string; limit?: number } = {}): AuditEventRecord[] {
    const limit = Math.max(1, Math.min(200, Number(opts.limit) || 60));
    const cleanFeature = String(opts.feature || '').trim();
    const rows =
      cleanFeature && cleanFeature !== 'all'
        ? (this.sqlite.db
            .prepare(
              `SELECT * FROM audit_events WHERE user_id = ? AND feature = ? ORDER BY created_at DESC LIMIT ?`,
            )
            .all(userId, cleanFeature, limit) as Array<Record<string, any>>)
        : (this.sqlite.db
            .prepare(
              `SELECT * FROM audit_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
            )
            .all(userId, limit) as Array<Record<string, any>>);

    return rows.map((row) => this.hydrate(row));
  }

  count(userId: string): number {
    const row = this.sqlite.db
      .prepare('SELECT COUNT(*) AS cnt FROM audit_events WHERE user_id = ?')
      .get(userId) as { cnt?: number } | undefined;
    return Number(row?.cnt) || 0;
  }

  deleteById(userId: string, id: string): boolean {
    if (!id) return false;
    const res = this.sqlite.db
      .prepare('DELETE FROM audit_events WHERE id = ? AND user_id = ?')
      .run(id, userId);
    return Number(res.changes) > 0;
  }

  clearAll(userId: string): number {
    const res = this.sqlite.db
      .prepare('DELETE FROM audit_events WHERE user_id = ?')
      .run(userId);
    return Number(res.changes) || 0;
  }

  private hydrate(row: Record<string, any>): AuditEventRecord {
    let purged: PurgeCounts = {};
    try {
      const parsed = JSON.parse(String(row.purged_json || '{}'));
      if (parsed && typeof parsed === 'object') purged = compactCounts(parsed);
    } catch {
      purged = {};
    }
    return {
      id: String(row.id),
      action: String(row.action || ''),
      feature: String(row.feature || 'workspace') as AuditFeature,
      scope: String(row.scope || 'item') as AuditScope,
      targetId: String(row.target_id || ''),
      targetLabel: String(row.target_label || ''),
      summary: String(row.summary || ''),
      purged,
      createdAt: String(row.created_at || ''),
    };
  }
}
