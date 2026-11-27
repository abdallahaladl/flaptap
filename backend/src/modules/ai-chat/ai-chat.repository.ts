import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SqliteService } from '../../core/database/sqlite.service';
import {
  AiChatContextType,
  AiChatImageMeta,
  AiChatLanguageMode,
  AiChatMessage,
  AiChatPersonaId,
  AiChatPreferences,
  AiChatQuoteAttachment,
  AiChatResponseStyle,
  AiChatThread,
} from './ai-chat.types';

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

@Injectable()
export class AiChatRepository {
  constructor(private readonly sqlite: SqliteService) {}

  private mapThreadRow(row: Record<string, any>): AiChatThread {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      title: String(row.title || 'New Chat'),
      persona: (String(row.persona || 'smart_mentor') as AiChatPersonaId),
      contextType: (String(row.context_type || 'general') as AiChatContextType),
      contextId: String(row.context_id || ''),
      contextLabel: String(row.context_label || ''),
      contextSnapshot: safeJsonParse<Record<string, any>>(row.context_snapshot_json, {}),
      isPinned: Boolean(row.is_pinned),
      modelUsed: String(row.model_used || ''),
      messageCount: Number(row.message_count) || 0,
      lastMessagePreview: String(row.last_message_preview || ''),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapMessageRow(row: Record<string, any>): AiChatMessage {
    const quote = safeJsonParse<AiChatQuoteAttachment | undefined>(row.quote_json, undefined);
    const hasQuote = quote && typeof quote.text === 'string' && quote.text.trim().length > 0;
    const attachments = safeJsonParse<AiChatImageMeta[]>(row.attachments_json, []);
    return {
      id: String(row.id),
      threadId: String(row.thread_id),
      userId: String(row.user_id),
      role: row.role === 'assistant' ? 'assistant' : 'user',
      content: String(row.content || ''),
      ...(row.reasoning ? { reasoning: String(row.reasoning) } : {}),
      ...(hasQuote ? { quote } : {}),
      ...(Array.isArray(attachments) && attachments.length > 0 ? { attachments } : {}),
      ...(row.model_name ? { modelName: String(row.model_name) } : {}),
      ...(row.provider_name ? { providerName: String(row.provider_name) } : {}),
      ...(row.variant_used ? { variantUsed: String(row.variant_used) } : {}),
      ...(Number(row.execution_time_ms) > 0 ? { executionTimeMs: Number(row.execution_time_ms) } : {}),
      ...(row.finish_reason ? { finishReason: String(row.finish_reason) } : {}),
      createdAt: String(row.created_at),
    };
  }

  getPreferences(userId: string): AiChatPreferences {
    const row = this.sqlite.db
      .prepare('SELECT * FROM ai_chat_preferences WHERE user_id = ?')
      .get(userId) as Record<string, any> | undefined;

    if (!row) {
      return {
        userId,
        defaultPersona: 'smart_mentor',
        responseStyle: 'balanced',
        responseLanguage: 'auto',
        temperature: 0.45,
        customInstructions: '',
        usePageContext: true,
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      userId,
      defaultPersona: String(row.default_persona || 'smart_mentor') as AiChatPersonaId,
      responseStyle: String(row.response_style || 'balanced') as AiChatResponseStyle,
      responseLanguage: String(row.response_language || 'auto') as AiChatLanguageMode,
      temperature: Number.isFinite(Number(row.temperature)) ? Number(row.temperature) : 0.45,
      customInstructions: String(row.custom_instructions || ''),
      usePageContext: row.use_page_context !== 0,
      updatedAt: String(row.updated_at || new Date().toISOString()),
    };
  }

  upsertPreferences(
    userId: string,
    patch: Partial<{
      defaultPersona: AiChatPersonaId;
      responseStyle: AiChatResponseStyle;
      responseLanguage: AiChatLanguageMode;
      temperature: number;
      customInstructions: string;
      usePageContext: boolean;
    }>,
  ): AiChatPreferences {
    const current = this.getPreferences(userId);
    const next: AiChatPreferences = {
      userId,
      defaultPersona: patch.defaultPersona ?? current.defaultPersona,
      responseStyle: patch.responseStyle ?? current.responseStyle,
      responseLanguage: patch.responseLanguage ?? current.responseLanguage,
      temperature:
        patch.temperature !== undefined
          ? Math.max(0, Math.min(1.5, Number(patch.temperature) || 0.45))
          : current.temperature,
      customInstructions:
        patch.customInstructions !== undefined
          ? String(patch.customInstructions || '').slice(0, 1500)
          : current.customInstructions,
      usePageContext:
        patch.usePageContext !== undefined ? Boolean(patch.usePageContext) : current.usePageContext,
      updatedAt: new Date().toISOString(),
    };

    this.sqlite.db
      .prepare(
        `INSERT INTO ai_chat_preferences (
          user_id, default_persona, response_style, response_language, temperature,
          custom_instructions, use_page_context, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          default_persona = excluded.default_persona,
          response_style = excluded.response_style,
          response_language = excluded.response_language,
          temperature = excluded.temperature,
          custom_instructions = excluded.custom_instructions,
          use_page_context = excluded.use_page_context,
          updated_at = excluded.updated_at`,
      )
      .run(
        userId,
        next.defaultPersona,
        next.responseStyle,
        next.responseLanguage,
        next.temperature,
        next.customInstructions,
        next.usePageContext ? 1 : 0,
        next.updatedAt,
      );

    return next;
  }

  listThreads(
    userId: string,
    opts?: {
      q?: string;
      contextType?: string;
      contextId?: string;
      limit?: number;
    },
  ): AiChatThread[] {
    const clauses = ['user_id = ?'];
    const params: any[] = [userId];

    if (opts?.contextType && opts.contextType !== 'all') {
      clauses.push('context_type = ?');
      params.push(String(opts.contextType).trim());
    }
    if (opts?.contextId) {
      clauses.push('context_id = ?');
      params.push(String(opts.contextId).trim());
    }
    if (opts?.q && opts.q.trim()) {
      const needle = `%${opts.q.trim().toLowerCase()}%`;
      clauses.push(
        `(LOWER(title) LIKE ? OR LOWER(context_label) LIKE ? OR LOWER(last_message_preview) LIKE ?)`,
      );
      params.push(needle, needle, needle);
    }

    const limit = Math.max(1, Math.min(200, Number(opts?.limit) || 80));
    params.push(limit);

    const rows = this.sqlite.db
      .prepare(
        `SELECT * FROM ai_chat_threads
         WHERE ${clauses.join(' AND ')}
         ORDER BY is_pinned DESC, updated_at DESC
         LIMIT ?`,
      )
      .all(...params) as Array<Record<string, any>>;

    return rows.map((r) => this.mapThreadRow(r));
  }

  findLatestThreadForContext(
    userId: string,
    contextType: string,
    contextId: string,
  ): AiChatThread | null {
    if (!contextType || !contextId) return null;
    const row = this.sqlite.db
      .prepare(
        `SELECT * FROM ai_chat_threads
         WHERE user_id = ? AND context_type = ? AND context_id = ?
         ORDER BY updated_at DESC LIMIT 1`,
      )
      .get(userId, contextType, contextId) as Record<string, any> | undefined;
    return row ? this.mapThreadRow(row) : null;
  }

  findThreadById(
    userId: string,
    threadId: string,
  ): { thread: AiChatThread; messages: AiChatMessage[] } | null {
    const row = this.sqlite.db
      .prepare('SELECT * FROM ai_chat_threads WHERE id = ? AND user_id = ?')
      .get(threadId, userId) as Record<string, any> | undefined;
    if (!row) return null;

    const msgRows = this.sqlite.db
      .prepare(
        `SELECT * FROM ai_chat_messages
         WHERE thread_id = ? AND user_id = ?
         ORDER BY created_at ASC, rowid ASC`,
      )
      .all(threadId, userId) as Array<Record<string, any>>;

    return {
      thread: this.mapThreadRow(row),
      messages: msgRows.map((m) => this.mapMessageRow(m)),
    };
  }

  createThread(
    userId: string,
    params?: {
      title?: string;
      persona?: AiChatPersonaId;
      contextType?: AiChatContextType;
      contextId?: string;
      contextLabel?: string;
      contextSnapshot?: Record<string, any>;
    },
  ): AiChatThread {
    const id = `cht_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    const title = String(params?.title || 'New Chat').trim().slice(0, 120) || 'New Chat';
    const persona = (params?.persona || 'smart_mentor') as AiChatPersonaId;
    const contextType = (params?.contextType || 'general') as AiChatContextType;
    const contextId = String(params?.contextId || '').trim().slice(0, 120);
    const contextLabel = String(params?.contextLabel || '').trim().slice(0, 140);
    const snapshotJson = JSON.stringify(params?.contextSnapshot || {});

    this.sqlite.db
      .prepare(
        `INSERT INTO ai_chat_threads (
          id, user_id, title, persona, context_type, context_id, context_label,
          context_snapshot_json, is_pinned, model_used, message_count, last_message_preview,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, '', 0, '', ?, ?)`,
      )
      .run(id, userId, title, persona, contextType, contextId, contextLabel, snapshotJson, now, now);

    return this.findThreadById(userId, id)!.thread;
  }

  updateThread(
    userId: string,
    threadId: string,
    patch: Partial<{
      title: string;
      persona: AiChatPersonaId;
      isPinned: boolean;
      contextType: AiChatContextType;
      contextId: string;
      contextLabel: string;
      contextSnapshot: Record<string, any>;
      modelUsed: string;
      touchUpdatedAt: boolean;
    }>,
  ): AiChatThread | null {
    const existing = this.findThreadById(userId, threadId)?.thread;
    if (!existing) return null;

    const sets: string[] = [];
    const params: any[] = [];

    if (patch.title !== undefined) {
      sets.push('title = ?');
      params.push(String(patch.title || 'Untitled Chat').trim().slice(0, 120) || 'Untitled Chat');
    }
    if (patch.persona !== undefined) {
      sets.push('persona = ?');
      params.push(patch.persona);
    }
    if (patch.isPinned !== undefined) {
      sets.push('is_pinned = ?');
      params.push(patch.isPinned ? 1 : 0);
    }
    if (patch.contextType !== undefined) {
      sets.push('context_type = ?');
      params.push(patch.contextType);
    }
    if (patch.contextId !== undefined) {
      sets.push('context_id = ?');
      params.push(String(patch.contextId || '').slice(0, 120));
    }
    if (patch.contextLabel !== undefined) {
      sets.push('context_label = ?');
      params.push(String(patch.contextLabel || '').slice(0, 140));
    }
    if (patch.contextSnapshot !== undefined) {
      sets.push('context_snapshot_json = ?');
      params.push(JSON.stringify(patch.contextSnapshot || {}));
    }
    if (patch.modelUsed !== undefined) {
      sets.push('model_used = ?');
      params.push(String(patch.modelUsed || '').slice(0, 120));
    }

    if (sets.length === 0) return existing;

    if (patch.touchUpdatedAt !== false) {
      sets.push('updated_at = ?');
      params.push(new Date().toISOString());
    }

    params.push(threadId, userId);
    this.sqlite.db
      .prepare(`UPDATE ai_chat_threads SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`)
      .run(...params);

    return this.findThreadById(userId, threadId)?.thread || null;
  }

  deleteThread(userId: string, threadId: string): boolean {
    const res = this.sqlite.db
      .prepare('DELETE FROM ai_chat_threads WHERE id = ? AND user_id = ?')
      .run(threadId, userId);
    return Number(res.changes) > 0;
  }

  deleteAllThreads(userId: string): number {
    const res = this.sqlite.db
      .prepare('DELETE FROM ai_chat_threads WHERE user_id = ?')
      .run(userId);
    return Number(res.changes) || 0;
  }

  private refreshThreadAggregates(userId: string, threadId: string, modelUsed?: string): void {
    const countRow = this.sqlite.db
      .prepare('SELECT COUNT(*) AS cnt FROM ai_chat_messages WHERE thread_id = ? AND user_id = ?')
      .get(threadId, userId) as { cnt?: number } | undefined;
    const lastRow = this.sqlite.db
      .prepare(
        `SELECT content, model_name FROM ai_chat_messages
         WHERE thread_id = ? AND user_id = ?
         ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      )
      .get(threadId, userId) as { content?: string; model_name?: string } | undefined;

    const cnt = Number(countRow?.cnt) || 0;
    const preview = String(lastRow?.content || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140);
    const resolvedModel = modelUsed || String(lastRow?.model_name || '');
    const now = new Date().toISOString();

    if (resolvedModel) {
      this.sqlite.db
        .prepare(
          `UPDATE ai_chat_threads
           SET message_count = ?, last_message_preview = ?, model_used = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`,
        )
        .run(cnt, preview, resolvedModel, now, threadId, userId);
    } else {
      this.sqlite.db
        .prepare(
          `UPDATE ai_chat_threads
           SET message_count = ?, last_message_preview = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`,
        )
        .run(cnt, preview, now, threadId, userId);
    }
  }

  appendMessage(
    userId: string,
    threadId: string,
    msg: {
      role: 'user' | 'assistant';
      content: string;
      reasoning?: string;
      quote?: AiChatQuoteAttachment;
      attachments?: AiChatImageMeta[];
      modelName?: string;
      providerName?: string;
      variantUsed?: string;
      executionTimeMs?: number;
      finishReason?: string;
      createdAt?: string;
    },
  ): AiChatMessage {
    const id = `chm_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const createdAt = msg.createdAt || new Date().toISOString();
    const quoteJson = msg.quote?.text ? JSON.stringify(msg.quote) : '{}';
    const attachmentsJson =
      Array.isArray(msg.attachments) && msg.attachments.length > 0
        ? JSON.stringify(msg.attachments)
        : '[]';

    this.sqlite.db
      .prepare(
        `INSERT INTO ai_chat_messages (
          id, thread_id, user_id, role, content, reasoning, quote_json, attachments_json,
          model_name, provider_name, variant_used, execution_time_ms, finish_reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        threadId,
        userId,
        msg.role,
        msg.content,
        msg.reasoning || '',
        quoteJson,
        attachmentsJson,
        msg.modelName || '',
        msg.providerName || '',
        msg.variantUsed || '',
        Math.max(0, Math.round(Number(msg.executionTimeMs) || 0)),
        msg.finishReason || '',
        createdAt,
      );

    this.refreshThreadAggregates(userId, threadId, msg.modelName);

    const inserted = this.sqlite.db
      .prepare('SELECT * FROM ai_chat_messages WHERE id = ? AND user_id = ?')
      .get(id, userId) as Record<string, any>;
    return this.mapMessageRow(inserted);
  }

  updateMessage(
    userId: string,
    threadId: string,
    messageId: string,
    patch: Partial<{
      content: string;
      reasoning: string;
      modelName: string;
      providerName: string;
      variantUsed: string;
      executionTimeMs: number;
      finishReason: string;
    }>,
  ): AiChatMessage | null {
    const sets: string[] = [];
    const params: any[] = [];
    if (patch.content !== undefined) {
      sets.push('content = ?');
      params.push(patch.content);
    }
    if (patch.reasoning !== undefined) {
      sets.push('reasoning = ?');
      params.push(patch.reasoning);
    }
    if (patch.modelName !== undefined) {
      sets.push('model_name = ?');
      params.push(patch.modelName);
    }
    if (patch.providerName !== undefined) {
      sets.push('provider_name = ?');
      params.push(patch.providerName);
    }
    if (patch.variantUsed !== undefined) {
      sets.push('variant_used = ?');
      params.push(patch.variantUsed);
    }
    if (patch.executionTimeMs !== undefined) {
      sets.push('execution_time_ms = ?');
      params.push(Math.max(0, Math.round(Number(patch.executionTimeMs) || 0)));
    }
    if (patch.finishReason !== undefined) {
      sets.push('finish_reason = ?');
      params.push(patch.finishReason);
    }
    if (sets.length === 0) return null;
    params.push(messageId, threadId, userId);

    this.sqlite.db
      .prepare(
        `UPDATE ai_chat_messages SET ${sets.join(', ')} WHERE id = ? AND thread_id = ? AND user_id = ?`,
      )
      .run(...params);

    this.refreshThreadAggregates(userId, threadId, patch.modelName);
    const row = this.sqlite.db
      .prepare('SELECT * FROM ai_chat_messages WHERE id = ? AND user_id = ?')
      .get(messageId, userId) as Record<string, any> | undefined;
    return row ? this.mapMessageRow(row) : null;
  }

  deleteMessage(userId: string, threadId: string, messageId: string): boolean {
    const res = this.sqlite.db
      .prepare('DELETE FROM ai_chat_messages WHERE id = ? AND thread_id = ? AND user_id = ?')
      .run(messageId, threadId, userId);
    const ok = Number(res.changes) > 0;
    if (ok) this.refreshThreadAggregates(userId, threadId);
    return ok;
  }

  /**
   * Removes messages starting from (inclusive=true) or strictly after (inclusive=false) `messageId`
   * ordered by rowid so edit-and-resend and regenerate keep thread history strictly linear.
   */
  deleteMessagesFrom(
    userId: string,
    threadId: string,
    messageId: string,
    inclusive = false,
  ): number {
    const anchor = this.sqlite.db
      .prepare(
        'SELECT rowid FROM ai_chat_messages WHERE id = ? AND thread_id = ? AND user_id = ?',
      )
      .get(messageId, threadId, userId) as { rowid?: number } | undefined;
    if (!anchor || !Number.isFinite(Number(anchor.rowid))) return 0;

    const op = inclusive ? '>=' : '>';
    const res = this.sqlite.db
      .prepare(
        `DELETE FROM ai_chat_messages
         WHERE thread_id = ? AND user_id = ? AND rowid ${op} ?`,
      )
      .run(threadId, userId, Number(anchor.rowid));

    this.refreshThreadAggregates(userId, threadId);
    return Number(res.changes) || 0;
  }
}
