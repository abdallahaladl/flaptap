import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HistoryRepository, RequestIdentityScope } from '../../core/database/history.repository';
import { SqliteService } from '../../core/database/sqlite.service';
import { AiProvidersService } from '../ai-providers/ai-providers.service';
import { ProviderChatMessage, ProviderImageAttachment } from '../ai-providers/ai-providers.types';
import { MediaTranscriptionService } from '../american-extractor/sources/media-transcription.service';
import { AiChatRepository } from './ai-chat.repository';
import {
  AI_CHAT_PERSONAS,
  buildAiChatSystemPrompt,
  buildContextPromptBlock,
  formatClockFromMs,
  generateSmartThreadTitle,
} from './ai-chat.prompts';
import {
  AiChatContextInput,
  AiChatContextType,
  AiChatImageInput,
  AiChatImageMeta,
  AiChatLanguageMode,
  AiChatMessage,
  AiChatPersonaId,
  AiChatPreferences,
  AiChatQuoteAttachment,
  AiChatResponseStyle,
  AiChatThread,
  EditAiChatMessageDto,
  RegenerateAiChatDto,
  SendAiChatMessageDto,
} from './ai-chat.types';

const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': '.webm',
  'video/webm': '.webm',
  'audio/mp4': '.m4a',
  'video/mp4': '.mp4',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/mpeg': '.mp3',
};

const MAX_MESSAGE_CHARS = 8000;
const MAX_IMAGES = 3;
const MAX_IMAGE_BASE64_CHARS = 5_600_000;

export interface StreamHooks {
  signal?: AbortSignal;
  onThread?: (thread: AiChatThread) => void;
  onUserMessage?: (msg: AiChatMessage) => void;
  onDelta?: (delta: string, accumulated: string) => void;
  onReasoningDelta?: (delta: string, accumulated: string) => void;
}

export interface StreamResult {
  thread: AiChatThread;
  userMessage?: AiChatMessage;
  assistantMessage: AiChatMessage;
  providerName: string;
  modelUsed: string;
  variantUsed: string;
  executionTimeMs: number;
  fallbackFrom?: string;
}

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private readonly repo: AiChatRepository,
    private readonly sqlite: SqliteService,
    private readonly historyRepo: HistoryRepository,
    private readonly aiProviders: AiProvidersService,
    private readonly mediaTranscription: MediaTranscriptionService,
  ) {}

  getPublicConfig() {
    return {
      personas: AI_CHAT_PERSONAS.map(({ id, label, shortLabel, description }) => ({
        id,
        label,
        shortLabel,
        description,
      })),
      responseStyles: [
        { id: 'concise', label: 'Concise' },
        { id: 'balanced', label: 'Balanced' },
        { id: 'deep', label: 'Deep Dive' },
      ],
      languageModes: [
        { id: 'auto', label: 'Match My Language' },
        { id: 'en', label: 'English' },
        { id: 'ar_en', label: 'Arabic + EN Examples' },
        { id: 'bilingual', label: 'Bilingual' },
      ],
    };
  }

  getPreferences(userId: string): AiChatPreferences {
    return this.repo.getPreferences(userId);
  }

  updatePreferences(
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
    return this.repo.upsertPreferences(userId, patch);
  }

  listThreads(
    userId: string,
    opts?: { q?: string; contextType?: string; contextId?: string; limit?: number },
  ): AiChatThread[] {
    return this.repo.listThreads(userId, opts);
  }

  getThread(userId: string, threadId: string) {
    const found = this.repo.findThreadById(userId, threadId);
    if (!found) {
      throw new NotFoundException(`Conversation "${threadId}" not found.`);
    }
    return found;
  }

  findContextThread(userId: string, contextType: string, contextId: string) {
    const thread = this.repo.findLatestThreadForContext(userId, contextType, contextId);
    if (!thread) return null;
    return this.repo.findThreadById(userId, thread.id);
  }

  createThread(
    userId: string,
    body?: {
      title?: string;
      persona?: AiChatPersonaId;
      context?: AiChatContextInput;
    },
  ): AiChatThread {
    const prefs = this.repo.getPreferences(userId);
    const ctx = body?.context;
    return this.repo.createThread(userId, {
      title: body?.title || 'New Chat',
      persona: body?.persona || prefs.defaultPersona,
      contextType: ctx?.type || 'general',
      contextId: ctx?.id || '',
      contextLabel: ctx?.label || '',
      contextSnapshot: ctx?.payload || {},
    });
  }

  updateThread(
    userId: string,
    threadId: string,
    patch: Partial<{ title: string; persona: AiChatPersonaId; isPinned: boolean }>,
  ): AiChatThread {
    const updated = this.repo.updateThread(userId, threadId, patch);
    if (!updated) {
      throw new NotFoundException(`Conversation "${threadId}" not found.`);
    }
    return updated;
  }

  deleteThread(userId: string, threadId: string): { success: boolean } {
    const ok = this.repo.deleteThread(userId, threadId);
    if (!ok) {
      throw new NotFoundException(`Conversation "${threadId}" not found.`);
    }
    return { success: true };
  }

  deleteAllThreads(userId: string): { success: boolean; deleted: number } {
    const deleted = this.repo.deleteAllThreads(userId);
    return { success: true, deleted };
  }

  deleteMessage(userId: string, threadId: string, messageId: string): { success: boolean } {
    const ok = this.repo.deleteMessage(userId, threadId, messageId);
    if (!ok) {
      throw new NotFoundException(`Message "${messageId}" not found.`);
    }
    return { success: true };
  }

  exportThread(userId: string, threadId: string, format: 'md' | 'json' = 'md') {
    const { thread, messages } = this.getThread(userId, threadId);
    if (format === 'json') {
      return {
        filename: `flaptap-chat-${thread.id}.json`,
        mimeType: 'application/json; charset=utf-8',
        content: JSON.stringify({ thread, messages }, null, 2),
      };
    }

    const lines: string[] = [
      `# ${thread.title}`,
      ``,
      `- **Persona:** ${thread.persona}`,
      `- **Context:** ${thread.contextType}${thread.contextLabel ? ` · ${thread.contextLabel}` : ''}`,
      `- **Updated:** ${thread.updatedAt}`,
      ``,
      `---`,
      ``,
    ];

    for (const m of messages) {
      lines.push(m.role === 'user' ? `## You` : `## Flaptap AI${m.modelName ? ` (${m.modelName})` : ''}`);
      if (m.quote?.text) {
        lines.push(`> "${m.quote.text}"`);
      }
      lines.push('');
      lines.push(m.content);
      lines.push('');
    }

    return {
      filename: `flaptap-chat-${thread.id}.md`,
      mimeType: 'text/markdown; charset=utf-8',
      content: lines.join('\n'),
    };
  }

  private sanitizeImages(images?: AiChatImageInput[]): {
    apiImages: ProviderImageAttachment[];
    meta: AiChatImageMeta[];
  } {
    if (!Array.isArray(images) || images.length === 0) {
      return { apiImages: [], meta: [] };
    }
    const apiImages: ProviderImageAttachment[] = [];
    const meta: AiChatImageMeta[] = [];

    for (const img of images.slice(0, MAX_IMAGES)) {
      const mimeType = String(img?.mimeType || 'image/png').trim().toLowerCase();
      if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(mimeType)) {
        throw new BadRequestException(`Unsupported image format "${mimeType}".`);
      }
      const rawB64 = String(img?.base64 || '')
        .replace(/^data:[^;]+;base64,/i, '')
        .trim();
      if (!rawB64) continue;
      if (rawB64.length > MAX_IMAGE_BASE64_CHARS) {
        throw new BadRequestException('Image attachment is too large (max ~4 MB each).');
      }
      apiImages.push({ mimeType, base64: rawB64 });
      meta.push({
        mimeType,
        name: img?.name ? String(img.name).slice(0, 80) : undefined,
        previewDataUrl:
          rawB64.length <= 240_000 ? `data:${mimeType};base64,${rawB64}` : undefined,
      });
    }

    return { apiImages, meta };
  }

  /**
   * Deep server-side context hydration from SQLite so the AI always sees rich,
   * authoritative study material regardless of how little the client passed.
   */
  private hydrateServerContext(
    userId: string,
    context?: AiChatContextInput,
    quote?: AiChatQuoteAttachment,
  ): { contextType: AiChatContextType; contextLabel: string; sections: string[] } {
    const rawType = (context?.type || 'general') as string;
    const type: AiChatContextType = (rawType === 'shadowing' ? 'media_hub' : rawType) as AiChatContextType;
    let label = String(context?.label || '').trim();
    const sections: string[] = [];

    if (context?.subtitle) {
      sections.push(`Subtitle / Scope: ${String(context.subtitle).trim()}`);
    }

    if ((type === 'media_hub' || type === 'dialogue' || type === 'phonetics') && context?.id) {
      const lesson = this.historyRepo.findById(context.id, { userId });
      if (lesson) {
        label = label || lesson.title || 'Studio Lesson';
        const view: 'reviewed' | 'raw' =
          quote?.view === 'raw' || context.view === 'raw' ? 'raw' : 'reviewed';
        const td = lesson.transcriptData;
        const rawCanon = td?.raw?.canonicalSentences;
        const revCanon = td?.reviewed?.canonicalSentences;
        const sentences =
          view === 'raw'
            ? Array.isArray(rawCanon) && rawCanon.length > 0
              ? rawCanon
              : lesson.sentences || []
            : Array.isArray(revCanon) && revCanon.length > 0
              ? revCanon
              : Array.isArray(rawCanon) && rawCanon.length > 0
                ? rawCanon
                : lesson.sentences || [];

        const metaLines = [
          `Title: ${lesson.title || 'Untitled'}`,
          `Track: ${lesson.track}`,
          `Creator: ${lesson.creator || 'Unknown'}`,
          `Transcript View: ${view === 'raw' ? 'Original Raw Transcript' : 'AI Reviewed Verbatim'}`,
        ];
        if (lesson.cefrLevel || lesson.aiAnalysis?.overview?.cefrLevel) {
          metaLines.push(`CEFR Level: ${lesson.cefrLevel || lesson.aiAnalysis?.overview?.cefrLevel}`);
        }
        if (lesson.aiAnalysis?.overview?.speakerStyle) {
          metaLines.push(`Speaker Style: ${lesson.aiAnalysis.overview.speakerStyle}`);
        }
        if (lesson.aiAnalysis?.overview?.summary) {
          metaLines.push(`Summary: ${lesson.aiAnalysis.overview.summary}`);
        }
        sections.push(metaLines.join('\n'));

        const ideas = td?.reviewed?.ideas;
        if (Array.isArray(ideas) && ideas.length > 0) {
          sections.push(
            `Ideas Arc:\n${ideas
              .slice(0, 14)
              .map(
                (id) =>
                  `${id.index}. ${id.title} [${formatClockFromMs(id.startMs)}–${formatClockFromMs(id.endMs)}]: ${id.summary || ''}`,
              )
              .join('\n')}`,
          );
        }

        if (sentences.length > 0) {
          let anchorPos = 0;
          const targetIdx = Number(quote?.sentenceIndex ?? context.payload?.sentenceIndex);
          const targetStart = Number(quote?.startMs ?? context.payload?.startMs);
          if (Number.isFinite(targetIdx) && targetIdx > 0) {
            const idx = sentences.findIndex((s: any) => Number(s.index) === targetIdx);
            if (idx >= 0) anchorPos = idx;
          } else if (Number.isFinite(targetStart) && targetStart >= 0) {
            let best = Infinity;
            sentences.forEach((s: any, idx: number) => {
              const sMs = Number.isFinite(s.startMs) ? Number(s.startMs) : Math.round((Number(s.startSec) || 0) * 1000);
              const d = Math.abs(targetStart - sMs);
              if (d < best) {
                best = d;
                anchorPos = idx;
              }
            });
          } else if (quote?.text) {
            const needle = quote.text.trim().toLowerCase().slice(0, 50);
            const idx = sentences.findIndex((s: any) => String(s.text || '').toLowerCase().includes(needle));
            if (idx >= 0) anchorPos = idx;
          }

          const winStart = Math.max(0, anchorPos - 5);
          const winEnd = Math.min(sentences.length, anchorPos + 6);
          const surrounding = sentences.slice(winStart, winEnd).map((s: any, i: number) => {
            const sMs = Number.isFinite(s.startMs) ? Number(s.startMs) : Math.round((Number(s.startSec) || 0) * 1000);
            const prefix = winStart + i === anchorPos ? '>>> ' : '    ';
            const spk = s.speaker ? `${s.speaker}: ` : '';
            return `${prefix}#${s.index} [${formatClockFromMs(sMs)}] ${spk}${s.text}`;
          });
          sections.push(`Surrounding Lines (±5):\n${surrounding.join('\n')}`);

          // Broader window up to 4800 chars
          let chars = 0;
          const windowLines: string[] = [];
          for (let i = Math.max(0, anchorPos - 18); i < sentences.length; i++) {
            const s: any = sentences[i];
            const sMs = Number.isFinite(s.startMs) ? Number(s.startMs) : Math.round((Number(s.startSec) || 0) * 1000);
            const spk = s.speaker ? `${s.speaker}: ` : '';
            const line = `[${formatClockFromMs(sMs)}] ${spk}${s.text}`;
            if (chars + line.length + 1 > 4800) break;
            chars += line.length + 1;
            windowLines.push(line);
          }
          if (windowLines.length > 0) {
            sections.push(`Transcript Excerpt:\n${windowLines.join('\n')}`);
          }
        }
      }
    } else if (type === 'phrase_miner' && context?.id) {
      const note = this.sqlite.db
        .prepare('SELECT * FROM american_extractor_notes WHERE id = ? AND user_id = ?')
        .get(context.id, userId) as Record<string, any> | undefined;
      if (note) {
        label = label || String(note.title || 'Phrase Miner Guide');
        const items = safeJsonParse<any[]>(note.items_json, []);
        const lines = [
          `Guide Title: ${note.title}`,
          `Source Type: ${note.source_type || 'text'}`,
          note.summary ? `Summary: ${note.summary}` : '',
          note.speaker_style ? `Speaker Style: ${note.speaker_style}` : '',
          `Extracted Phrases Count: ${items.length}`,
        ].filter(Boolean);
        if (items.length > 0) {
          lines.push(
            `Key Extracted Phrases:\n${items
              .slice(0, 14)
              .map(
                (it: any, idx: number) =>
                  `${idx + 1}. "${it.phrase || it.expression || ''}" (${it.category || ''} · ${it.cefr || ''}) — ${it.meaning || it.coreMeaning || ''}${it.context ? ` | Context: "${it.context}"` : ''}`,
              )
              .join('\n')}`,
          );
        }
        if (note.source_text) {
          lines.push(`Source Text Sample:\n${String(note.source_text).slice(0, 2200)}`);
        }
        sections.push(lines.join('\n\n'));
      }
    } else if (type === 'phrase_builder' && context?.id) {
      const item = this.sqlite.db
        .prepare('SELECT * FROM learning_library_items WHERE id = ? AND user_id = ?')
        .get(context.id, userId) as Record<string, any> | undefined;
      if (item) {
        label = label || String(item.expression || 'Phrase Builder Item');
        const examples = safeJsonParse<any[]>(item.examples_json, []);
        const patterns = safeJsonParse<any[]>(item.usage_patterns_json, []);
        const variations = safeJsonParse<any[]>(item.variations_json, []);
        const lines = [
          `Expression: ${item.expression}`,
          item.ipa ? `IPA: ${item.ipa}` : '',
          item.spoken_form ? `Spoken Form: ${item.spoken_form}` : '',
          item.category_label ? `Category: ${item.category_label}` : '',
          item.register || item.tone ? `Register / Tone: ${item.register || ''} ${item.tone || ''}`.trim() : '',
          `Core Meaning: ${item.core_meaning}`,
          item.localized_meaning ? `Translation: ${item.localized_meaning}` : '',
          item.textbook_equivalent ? `Textbook Equivalent: ${item.textbook_equivalent}` : '',
          item.native_context ? `Native Context: ${item.native_context}` : '',
          item.mistakes_to_avoid ? `Mistakes to Avoid: ${item.mistakes_to_avoid}` : '',
          patterns.length
            ? `Usage Patterns:\n${patterns.slice(0, 4).map((p: any) => `- ${p.pattern || p.slot || JSON.stringify(p)}`).join('\n')}`
            : '',
          examples.length
            ? `Examples:\n${examples.slice(0, 4).map((e: any) => `- ${e.en || e.sentence || e}`).join('\n')}`
            : '',
          variations.length
            ? `Variations: ${variations.slice(0, 6).map((v: any) => v.phrase || v).join(', ')}`
            : '',
        ].filter(Boolean);
        sections.push(lines.join('\n'));
      }
    } else if (type === 'think_aloud') {
      if (context?.id) {
        const session = this.sqlite.db
          .prepare('SELECT * FROM think_aloud_sessions WHERE id = ? AND user_id = ?')
          .get(context.id, userId) as Record<string, any> | undefined;
        if (session) {
          label = label || String(session.prompt_title || 'Think Aloud Session');
          const rounds = safeJsonParse<any[]>(session.rounds_json, []);
          const coaching = safeJsonParse<Record<string, any>>(session.coaching_json, {});
          const lines = [
            `Mode: ${session.mode} · Domain: ${session.domain} · CEFR: ${session.cefr_level}`,
            `Prompt: ${session.prompt_title}\n${session.prompt_body}`,
            `Scores: Overall ${session.overall_score}/100 | Directness ${session.directness_score} | Flow ${session.flow_score} | Structure ${session.structure_score} | Naturalness ${session.naturalness_score}`,
          ];
          if (rounds.length > 0) {
            lines.push(
              `Learner Spoken Rounds:\n${rounds
                .slice(0, 5)
                .map((r: any, i: number) => `Round ${i + 1}: "${r.transcript || ''}"`)
                .join('\n')}`,
            );
          }
          if (coaching?.summary || coaching?.overallVerdict) {
            lines.push(`Coach Verdict: ${coaching.overallVerdict || coaching.summary}`);
          }
          if (Array.isArray(coaching?.nativeUpgrades) && coaching.nativeUpgrades.length > 0) {
            lines.push(
              `Coach Upgrades:\n${coaching.nativeUpgrades
                .slice(0, 6)
                .map((u: any) => `- "${u.original || u.whatYouSaid}" -> "${u.native || u.nativeVersion}" (${u.why || ''})`)
                .join('\n')}`,
            );
          }
          sections.push(lines.join('\n\n'));
        } else {
          const spine = this.sqlite.db
            .prepare('SELECT * FROM think_aloud_spine_packs WHERE id = ? AND user_id = ?')
            .get(context.id, userId) as Record<string, any> | undefined;
          if (spine) {
            label = label || String(spine.title || 'Think Aloud Spine Pack');
            const starters = safeJsonParse<any[]>(spine.starters_json, []);
            const engines = safeJsonParse<any[]>(spine.engines_json, []);
            const tails = safeJsonParse<any[]>(spine.tails_json, []);
            sections.push(
              [
                `Spine Pack: ${spine.title} (${spine.domain})`,
                starters.length ? `Starters: ${starters.slice(0, 6).map((x: any) => x.phrase || x).join(' | ')}` : '',
                engines.length ? `Engines: ${engines.slice(0, 6).map((x: any) => x.phrase || x).join(' | ')}` : '',
                tails.length ? `Tails: ${tails.slice(0, 6).map((x: any) => x.phrase || x).join(' | ')}` : '',
              ]
                .filter(Boolean)
                .join('\n'),
            );
          }
        }
      }
    } else if (type === 'vocabulary' && context?.id) {
      const vocab = this.sqlite.db
        .prepare('SELECT * FROM vocabulary_items WHERE id = ? AND user_id = ?')
        .get(context.id, userId) as Record<string, any> | undefined;
      if (vocab) {
        label = label || String(vocab.term || 'Vocabulary Card');
        sections.push(
          [
            `Term: ${vocab.term}`,
            vocab.ipa ? `IPA: ${vocab.ipa}` : '',
            vocab.part_of_speech ? `Part of Speech: ${vocab.part_of_speech}` : '',
            `Definition: ${vocab.definition}`,
            vocab.translation ? `Context Translation: ${vocab.translation}` : '',
            vocab.context_sentence ? `Context Sentence: "${vocab.context_sentence}"` : '',
            `Mastery Level: ${vocab.mastery_level}/4`,
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }
    }

    if (context?.payload && typeof context.payload === 'object') {
      const compactPayload = Object.entries(context.payload)
        .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
        .slice(0, 14)
        .map(([k, v]) => {
          const valStr = typeof v === 'string' ? v : JSON.stringify(v);
          return `${k}: ${valStr.slice(0, 900)}`;
        });
      if (compactPayload.length > 0) {
        sections.push(`Client Surface Details:\n${compactPayload.join('\n')}`);
      }
    }

    return {
      contextType: type,
      contextLabel: label,
      sections,
    };
  }

  private buildProviderMessages(
    priorMessages: AiChatMessage[],
    latestUserContent: string,
    latestQuote?: AiChatQuoteAttachment,
    latestImages?: ProviderImageAttachment[],
    hydrated?: { contextType: AiChatContextType; contextLabel: string; sections: string[] },
    usePageContext = true,
  ): ProviderChatMessage[] {
    const windowMsgs = priorMessages.slice(-16);
    const out: ProviderChatMessage[] = [];

    for (const m of windowMsgs) {
      let text = m.content;
      if (m.role === 'user' && m.quote?.text) {
        text = `[Excerpt: "${m.quote.text}"]\n${text}`;
      }
      out.push({ role: m.role, content: text });
    }

    const contextBlock = usePageContext && hydrated
      ? buildContextPromptBlock({
          contextType: hydrated.contextType,
          contextLabel: hydrated.contextLabel,
          serverSections: hydrated.sections,
          quote: latestQuote,
        })
      : buildContextPromptBlock({
          contextType: 'general',
          quote: latestQuote,
        });

    const finalUserText = contextBlock
      ? `${contextBlock}\n\n<learner_message>\n${latestUserContent}\n</learner_message>`
      : latestUserContent;

    out.push({
      role: 'user',
      content: finalUserText,
      ...(latestImages && latestImages.length > 0 ? { images: latestImages } : {}),
    });

    return out;
  }

  private syncLegacyMediaHubAsk(
    userId: string,
    contextType: AiChatContextType,
    contextId: string,
    userMsg: AiChatMessage,
    asstMsg: AiChatMessage,
  ): void {
    if (contextType !== 'media_hub' || !contextId) return;
    try {
      const lesson = this.historyRepo.findById(contextId, { userId });
      if (!lesson || !lesson.transcriptData) return;
      const td = { ...lesson.transcriptData };
      const existing = Array.isArray(td.askHistory) ? td.askHistory : [];
      td.askHistory = [
        ...existing,
        {
          id: userMsg.id,
          role: 'user' as const,
          content: userMsg.content,
          ...(userMsg.quote?.text ? { selectedText: userMsg.quote.text.slice(0, 400) } : {}),
          ...(Number.isFinite(Number(userMsg.quote?.startMs)) ? { startMs: Number(userMsg.quote!.startMs) } : {}),
          ...(Number.isFinite(Number(userMsg.quote?.endMs)) ? { endMs: Number(userMsg.quote!.endMs) } : {}),
          ...(userMsg.quote?.speaker ? { speaker: userMsg.quote.speaker } : {}),
          createdAt: userMsg.createdAt,
        },
        {
          id: asstMsg.id,
          role: 'assistant' as const,
          content: asstMsg.content,
          modelName: asstMsg.modelName || '',
          createdAt: asstMsg.createdAt,
        },
      ].slice(-40);
      this.historyRepo.update(lesson.id, { transcriptData: td }, { userId });
    } catch {
      // Non-critical bridge sync
    }
  }

  async sendMessageStream(
    userId: string,
    dto: SendAiChatMessageDto,
    nativeLanguage = 'ar',
    hooks?: StreamHooks,
  ): Promise<StreamResult> {
    const content = String(dto?.content || '').trim();
    if (!content) {
      throw new BadRequestException('Please type or speak a message first.');
    }
    if (content.length > MAX_MESSAGE_CHARS) {
      throw new BadRequestException(`Message is too long (max ${MAX_MESSAGE_CHARS} characters).`);
    }
    if (!this.aiProviders.hasAnyConfiguredKey(userId)) {
      throw new BadRequestException(
        'No AI provider key is configured. Add an API key in AI Models to start chatting.',
      );
    }

    const prefs = this.repo.getPreferences(userId);
    const { apiImages, meta: imageMeta } = this.sanitizeImages(dto?.images);
    const usePageContext =
      dto.usePageContext !== undefined ? Boolean(dto.usePageContext) : prefs.usePageContext;

    let thread: AiChatThread | null = null;
    let priorMessages: AiChatMessage[] = [];

    if (dto.threadId) {
      const found = this.repo.findThreadById(userId, dto.threadId);
      if (!found) {
        throw new NotFoundException(`Conversation "${dto.threadId}" not found.`);
      }
      thread = found.thread;
      priorMessages = found.messages;
    }

    const effectiveContext: AiChatContextInput = dto.context || {
      type: thread?.contextType || 'general',
      id: thread?.contextId || '',
      label: thread?.contextLabel || '',
      payload: thread?.contextSnapshot || {},
    };

    const hydrated = usePageContext
      ? this.hydrateServerContext(userId, effectiveContext, dto.quote)
      : {
          contextType: (effectiveContext.type || 'general') as AiChatContextType,
          contextLabel: effectiveContext.label || '',
          sections: [],
        };

    const persona = dto.persona || thread?.persona || prefs.defaultPersona;

    if (!thread) {
      thread = this.repo.createThread(userId, {
        title: generateSmartThreadTitle(content, hydrated.contextLabel),
        persona,
        contextType: hydrated.contextType,
        contextId: effectiveContext.id || '',
        contextLabel: hydrated.contextLabel,
        contextSnapshot: effectiveContext.payload || {},
      });
    } else if (thread.messageCount === 0 && (thread.title === 'New Chat' || !thread.title)) {
      thread =
        this.repo.updateThread(userId, thread.id, {
          title: generateSmartThreadTitle(content, hydrated.contextLabel),
          persona,
          contextType: hydrated.contextType,
          contextId: effectiveContext.id || thread.contextId,
          contextLabel: hydrated.contextLabel || thread.contextLabel,
          contextSnapshot: effectiveContext.payload || thread.contextSnapshot,
        }) || thread;
    } else if (dto.persona && dto.persona !== thread.persona) {
      thread = this.repo.updateThread(userId, thread.id, { persona: dto.persona }) || thread;
    }

    hooks?.onThread?.(thread);

    const userMessage = this.repo.appendMessage(userId, thread.id, {
      role: 'user',
      content,
      quote: dto.quote,
      attachments: imageMeta,
    });
    hooks?.onUserMessage?.(userMessage);

    const systemPrompt = buildAiChatSystemPrompt({
      persona,
      responseStyle: dto.responseStyle || prefs.responseStyle,
      responseLanguage: dto.responseLanguage || prefs.responseLanguage,
      customInstructions: prefs.customInstructions,
      nativeLanguage,
      contextType: hydrated.contextType,
    });

    const messages = this.buildProviderMessages(
      priorMessages,
      content,
      dto.quote,
      apiImages,
      hydrated,
      usePageContext,
    );

    const startedAt = Date.now();
    const response = await this.aiProviders.executeChat(userId, {
      keyId: dto.keyId,
      model: dto.model,
      variant: dto.variant || 'none',
      systemPrompt,
      userPrompt: content,
      messages,
      temperature: dto.temperature !== undefined ? Number(dto.temperature) : prefs.temperature,
      maxTokens: 3200,
      json: false,
      timeoutMs: 90000,
      signal: hooks?.signal,
      allowIntraKeyFailover: true,
      allowPartialOnTimeout: true,
      onContentDelta: hooks?.onDelta,
      onReasoningDelta: hooks?.onReasoningDelta,
    });

    const answer = String(response.content || '').trim();
    if (!answer) {
      throw new Error('The AI model returned an empty response.');
    }

    const executionTimeMs = response.executionTimeMs || Date.now() - startedAt;
    const assistantMessage = this.repo.appendMessage(userId, thread.id, {
      role: 'assistant',
      content: answer,
      reasoning: response.reasoning,
      modelName: response.modelUsed || '',
      providerName: response.providerName || '',
      variantUsed: response.variantUsed || '',
      executionTimeMs,
      finishReason: response.finishReason,
    });

    const refreshedThread = this.repo.findThreadById(userId, thread.id)?.thread || thread;
    this.syncLegacyMediaHubAsk(
      userId,
      hydrated.contextType,
      effectiveContext.id || '',
      userMessage,
      assistantMessage,
    );

    return {
      thread: refreshedThread,
      userMessage,
      assistantMessage,
      providerName: response.providerName,
      modelUsed: response.modelUsed,
      variantUsed: response.variantUsed,
      executionTimeMs,
      fallbackFrom: response.fallbackFrom,
    };
  }

  async regenerateMessageStream(
    userId: string,
    threadId: string,
    assistantMsgId: string,
    dto: RegenerateAiChatDto,
    nativeLanguage = 'ar',
    hooks?: StreamHooks,
  ): Promise<StreamResult> {
    if (!this.aiProviders.hasAnyConfiguredKey(userId)) {
      throw new BadRequestException('No AI provider key is configured.');
    }
    const found = this.repo.findThreadById(userId, threadId);
    if (!found) {
      throw new NotFoundException(`Conversation "${threadId}" not found.`);
    }

    const idx = found.messages.findIndex((m) => m.id === assistantMsgId);
    if (idx === -1) {
      throw new NotFoundException(`Message "${assistantMsgId}" not found.`);
    }

    // Find preceding user message
    let targetUserIdx = -1;
    for (let i = idx; i >= 0; i--) {
      if (found.messages[i].role === 'user') {
        targetUserIdx = i;
        break;
      }
    }
    if (targetUserIdx === -1) {
      throw new BadRequestException('No preceding user message found to regenerate from.');
    }

    const targetUser = found.messages[targetUserIdx];
    const priorMessages = found.messages.slice(0, targetUserIdx);
    this.repo.deleteMessagesFrom(userId, threadId, targetUser.id, false);

    const prefs = this.repo.getPreferences(userId);
    const usePageContext =
      dto.usePageContext !== undefined ? Boolean(dto.usePageContext) : prefs.usePageContext;
    const effectiveContext: AiChatContextInput = dto.context || {
      type: found.thread.contextType,
      id: found.thread.contextId,
      label: found.thread.contextLabel,
      payload: found.thread.contextSnapshot,
    };
    const hydrated = usePageContext
      ? this.hydrateServerContext(userId, effectiveContext, targetUser.quote)
      : { contextType: found.thread.contextType, contextLabel: found.thread.contextLabel, sections: [] };

    const persona = dto.persona || found.thread.persona || prefs.defaultPersona;
    const systemPrompt = buildAiChatSystemPrompt({
      persona,
      responseStyle: dto.responseStyle || prefs.responseStyle,
      responseLanguage: dto.responseLanguage || prefs.responseLanguage,
      customInstructions: prefs.customInstructions,
      nativeLanguage,
      contextType: hydrated.contextType,
    });

    const messages = this.buildProviderMessages(
      priorMessages,
      targetUser.content,
      targetUser.quote,
      undefined,
      hydrated,
      usePageContext,
    );

    const startedAt = Date.now();
    const response = await this.aiProviders.executeChat(userId, {
      keyId: dto.keyId,
      model: dto.model,
      variant: dto.variant || 'none',
      systemPrompt,
      userPrompt: targetUser.content,
      messages,
      temperature: dto.temperature !== undefined ? Number(dto.temperature) : prefs.temperature,
      maxTokens: 3200,
      json: false,
      timeoutMs: 90000,
      signal: hooks?.signal,
      allowIntraKeyFailover: true,
      allowPartialOnTimeout: true,
      onContentDelta: hooks?.onDelta,
      onReasoningDelta: hooks?.onReasoningDelta,
    });

    const answer = String(response.content || '').trim();
    if (!answer) {
      throw new Error('The AI model returned an empty response.');
    }

    const executionTimeMs = response.executionTimeMs || Date.now() - startedAt;
    const assistantMessage = this.repo.appendMessage(userId, threadId, {
      role: 'assistant',
      content: answer,
      reasoning: response.reasoning,
      modelName: response.modelUsed || '',
      providerName: response.providerName || '',
      variantUsed: response.variantUsed || '',
      executionTimeMs,
      finishReason: response.finishReason,
    });

    const refreshedThread = this.repo.findThreadById(userId, threadId)?.thread || found.thread;
    return {
      thread: refreshedThread,
      assistantMessage,
      providerName: response.providerName,
      modelUsed: response.modelUsed,
      variantUsed: response.variantUsed,
      executionTimeMs,
      fallbackFrom: response.fallbackFrom,
    };
  }

  async editAndResendStream(
    userId: string,
    threadId: string,
    userMsgId: string,
    dto: EditAiChatMessageDto,
    nativeLanguage = 'ar',
    hooks?: StreamHooks,
  ): Promise<StreamResult> {
    const newContent = String(dto?.content || '').trim();
    if (!newContent) {
      throw new BadRequestException('Edited message cannot be empty.');
    }
    if (newContent.length > MAX_MESSAGE_CHARS) {
      throw new BadRequestException(`Message is too long (max ${MAX_MESSAGE_CHARS} characters).`);
    }

    const found = this.repo.findThreadById(userId, threadId);
    if (!found) {
      throw new NotFoundException(`Conversation "${threadId}" not found.`);
    }
    const idx = found.messages.findIndex((m) => m.id === userMsgId && m.role === 'user');
    if (idx === -1) {
      throw new NotFoundException(`User message "${userMsgId}" not found.`);
    }

    const oldUserMsg = found.messages[idx];
    const priorMessages = found.messages.slice(0, idx);
    this.repo.deleteMessagesFrom(userId, threadId, userMsgId, false);
    const updatedUserMsg =
      this.repo.updateMessage(userId, threadId, userMsgId, { content: newContent }) || {
        ...oldUserMsg,
        content: newContent,
      };
    hooks?.onUserMessage?.(updatedUserMsg);

    const prefs = this.repo.getPreferences(userId);
    const usePageContext =
      dto.usePageContext !== undefined ? Boolean(dto.usePageContext) : prefs.usePageContext;
    const effectiveContext: AiChatContextInput = dto.context || {
      type: found.thread.contextType,
      id: found.thread.contextId,
      label: found.thread.contextLabel,
      payload: found.thread.contextSnapshot,
    };
    const quote = dto.quote || updatedUserMsg.quote;
    const hydrated = usePageContext
      ? this.hydrateServerContext(userId, effectiveContext, quote)
      : { contextType: found.thread.contextType, contextLabel: found.thread.contextLabel, sections: [] };

    const persona = dto.persona || found.thread.persona || prefs.defaultPersona;
    const systemPrompt = buildAiChatSystemPrompt({
      persona,
      responseStyle: dto.responseStyle || prefs.responseStyle,
      responseLanguage: dto.responseLanguage || prefs.responseLanguage,
      customInstructions: prefs.customInstructions,
      nativeLanguage,
      contextType: hydrated.contextType,
    });

    const messages = this.buildProviderMessages(
      priorMessages,
      newContent,
      quote,
      undefined,
      hydrated,
      usePageContext,
    );

    const startedAt = Date.now();
    const response = await this.aiProviders.executeChat(userId, {
      keyId: dto.keyId,
      model: dto.model,
      variant: dto.variant || 'none',
      systemPrompt,
      userPrompt: newContent,
      messages,
      temperature: dto.temperature !== undefined ? Number(dto.temperature) : prefs.temperature,
      maxTokens: 3200,
      json: false,
      timeoutMs: 90000,
      signal: hooks?.signal,
      allowIntraKeyFailover: true,
      allowPartialOnTimeout: true,
      onContentDelta: hooks?.onDelta,
      onReasoningDelta: hooks?.onReasoningDelta,
    });

    const answer = String(response.content || '').trim();
    if (!answer) {
      throw new Error('The AI model returned an empty response.');
    }

    const executionTimeMs = response.executionTimeMs || Date.now() - startedAt;
    const assistantMessage = this.repo.appendMessage(userId, threadId, {
      role: 'assistant',
      content: answer,
      reasoning: response.reasoning,
      modelName: response.modelUsed || '',
      providerName: response.providerName || '',
      variantUsed: response.variantUsed || '',
      executionTimeMs,
      finishReason: response.finishReason,
    });

    const refreshedThread = this.repo.findThreadById(userId, threadId)?.thread || found.thread;
    return {
      thread: refreshedThread,
      userMessage: updatedUserMsg,
      assistantMessage,
      providerName: response.providerName,
      modelUsed: response.modelUsed,
      variantUsed: response.variantUsed,
      executionTimeMs,
      fallbackFrom: response.fallbackFrom,
    };
  }

  async continueMessageStream(
    userId: string,
    threadId: string,
    assistantMsgId: string,
    dto: RegenerateAiChatDto,
    nativeLanguage = 'ar',
    hooks?: StreamHooks,
  ): Promise<StreamResult> {
    const found = this.repo.findThreadById(userId, threadId);
    if (!found) {
      throw new NotFoundException(`Conversation "${threadId}" not found.`);
    }
    const targetMsg = found.messages.find((m) => m.id === assistantMsgId && m.role === 'assistant');
    if (!targetMsg) {
      throw new NotFoundException(`Assistant message "${assistantMsgId}" not found.`);
    }

    const prefs = this.repo.getPreferences(userId);
    const persona = dto.persona || found.thread.persona || prefs.defaultPersona;
    const systemPrompt = buildAiChatSystemPrompt({
      persona,
      responseStyle: dto.responseStyle || prefs.responseStyle,
      responseLanguage: dto.responseLanguage || prefs.responseLanguage,
      customInstructions: prefs.customInstructions,
      nativeLanguage,
      contextType: found.thread.contextType,
    });

    const idx = found.messages.findIndex((m) => m.id === assistantMsgId);
    const slice = found.messages.slice(Math.max(0, idx - 12), idx + 1);
    const messages: ProviderChatMessage[] = [
      ...slice.map((m) => ({ role: m.role, content: m.content })),
      {
        role: 'user',
        content:
          'Continue smoothly right from where your previous answer stopped without repeating anything you already wrote.',
      },
    ];

    const startedAt = Date.now();
    const response = await this.aiProviders.executeChat(userId, {
      keyId: dto.keyId,
      model: dto.model,
      variant: dto.variant || 'none',
      systemPrompt,
      userPrompt: 'Continue your previous response.',
      messages,
      temperature: dto.temperature !== undefined ? Number(dto.temperature) : prefs.temperature,
      maxTokens: 2400,
      json: false,
      timeoutMs: 75000,
      signal: hooks?.signal,
      allowIntraKeyFailover: true,
      allowPartialOnTimeout: true,
      onContentDelta: hooks?.onDelta,
      onReasoningDelta: hooks?.onReasoningDelta,
    });

    const addition = String(response.content || '').trim();
    if (!addition) {
      throw new Error('The AI model returned an empty continuation.');
    }

    const mergedContent = `${targetMsg.content.trimEnd()}\n\n${addition}`;
    const executionTimeMs = response.executionTimeMs || Date.now() - startedAt;
    const updated =
      this.repo.updateMessage(userId, threadId, assistantMsgId, {
        content: mergedContent,
        modelName: response.modelUsed || targetMsg.modelName,
        providerName: response.providerName || targetMsg.providerName,
        variantUsed: response.variantUsed || targetMsg.variantUsed,
        executionTimeMs: (targetMsg.executionTimeMs || 0) + executionTimeMs,
        finishReason: response.finishReason || '',
      }) || { ...targetMsg, content: mergedContent };

    const refreshedThread = this.repo.findThreadById(userId, threadId)?.thread || found.thread;
    return {
      thread: refreshedThread,
      assistantMessage: updated,
      providerName: response.providerName,
      modelUsed: response.modelUsed,
      variantUsed: response.variantUsed,
      executionTimeMs,
      fallbackFrom: response.fallbackFrom,
    };
  }

  async transcribeAudio(
    file: { buffer: Buffer; mimetype?: string; originalname?: string },
    userId?: string | null,
  ): Promise<{ text: string; engine: string }> {
    if (!file || !file.buffer || file.buffer.length < 512) {
      throw new BadRequestException('Audio recording is empty.');
    }
    const mime = String(file.mimetype || '').split(';')[0].trim().toLowerCase();
    const ext = EXT_BY_MIME[mime] || path.extname(file.originalname || '').toLowerCase() || '.webm';
    const tmpPath = path.join(os.tmpdir(), `flaptap-aichat-${randomUUID()}${ext}`);

    try {
      fs.writeFileSync(tmpPath, file.buffer);
      const cloudStt = this.aiProviders.resolvePreferredCloudSttKey(userId);
      const result = await this.mediaTranscription.transcribeFile(tmpPath, {
        force: true,
        skipCache: true,
        wordTimestamps: false,
        cloudStt,
        allowLocalWhisper: false,
      });
      return {
        text: String(result.text || '').trim(),
        engine: result.engine || 'faster_whisper',
      };
    } finally {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {}
    }
  }
}
