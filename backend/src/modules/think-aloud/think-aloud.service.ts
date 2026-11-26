import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { AiClient } from '../../core/ai/ai.client';
import { AiProvidersService } from '../ai-providers/ai-providers.service';
import { MediaTranscriptionService } from '../american-extractor/sources/media-transcription.service';
import {
  AUTOMATICITY_STAGES,
  BUILT_IN_SPINE_PACKS,
  FOUR_THREE_TWO_PRESETS,
  THINK_ALOUD_DOMAINS,
  THINK_ALOUD_FRAMEWORKS,
  THINK_ALOUD_MODES,
  computeFluencyMetrics,
  normalizeCoachingReport,
} from './think-aloud.catalog';
import {
  buildEvaluationPrompts,
  buildPromptGenerationPrompts,
  buildSpinePackPrompts,
} from './think-aloud.prompts';
import { ThinkAloudRepository } from './think-aloud.repository';
import {
  EvaluateSessionDto,
  GeneratePromptDto,
  GenerateSpinePackDto,
  SpineChunkItem,
  ThinkAloudDomain,
  ThinkAloudLevel,
  ThinkAloudMode,
  ThinkAloudPromptPayload,
  ThinkAloudSessionRecord,
  ThinkAloudSpinePack,
} from './think-aloud.types';

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

@Injectable()
export class ThinkAloudService {
  private readonly logger = new Logger(ThinkAloudService.name);

  constructor(
    private readonly repository: ThinkAloudRepository,
    private readonly aiProviders: AiProvidersService,
    private readonly aiClient: AiClient,
    private readonly mediaTranscription: MediaTranscriptionService,
  ) {}

  getConfig() {
    const summary = this.aiProviders.getDefaultSummary();
    return {
      modes: THINK_ALOUD_MODES,
      domains: THINK_ALOUD_DOMAINS,
      frameworks: THINK_ALOUD_FRAMEWORKS,
      presets: Object.values(FOUR_THREE_TWO_PRESETS),
      stages: AUTOMATICITY_STAGES,
      builtInSpinesCount: BUILT_IN_SPINE_PACKS.length,
      aiEngine: summary,
    };
  }

  getOverview(userId: string) {
    return this.repository.getOverviewMetrics(userId);
  }

  private async runAiJson<T>(
    userId: string,
    opts: {
      systemPrompt: string;
      userPrompt: string;
      keyId?: string;
      model?: string;
      variant?: string;
      temperature?: number;
      maxTokens?: number;
      timeoutMs?: number;
    },
  ): Promise<{ data: T; modelUsed: string }> {
    const hasProviderKey = this.aiProviders.hasAnyConfiguredKey(userId);
    if (hasProviderKey) {
      const res = await this.aiProviders.executeChat(userId, {
        keyId: opts.keyId,
        model: opts.model,
        variant: opts.variant,
        systemPrompt: opts.systemPrompt,
        userPrompt: opts.userPrompt,
        temperature: opts.temperature ?? 0.35,
        maxTokens: opts.maxTokens ?? 2600,
        json: true,
        timeoutMs: opts.timeoutMs ?? 45000,
      });
      return {
        data: this.aiClient.parseJson<T>(res.content),
        modelUsed: res.modelUsed || opts.model || 'ai-provider',
      };
    }

    if (this.aiClient.isConfigured()) {
      const res = await this.aiClient.chatJsonWithMeta<T>(
        opts.systemPrompt,
        opts.userPrompt,
        {
          temperature: opts.temperature ?? 0.35,
          maxTokens: opts.maxTokens ?? 2600,
          timeoutMs: opts.timeoutMs ?? 45000,
          json: true,
        },
      );
      return {
        data: res.data,
        modelUsed: res.modelUsed,
      };
    }

    throw new ServiceUnavailableException(
      'No AI provider key is configured. Add an API key under AI Models to run Think Aloud coaching.',
    );
  }

  async generatePrompt(
    userId: string,
    dto: GeneratePromptDto,
  ): Promise<ThinkAloudPromptPayload> {
    const mode: ThinkAloudMode = dto.mode || 'four_three_two';
    const domain: ThinkAloudDomain = dto.domain || 'programming_ai';
    const cefrLevel: ThinkAloudLevel = dto.cefrLevel || 'B2';
    const frameworkId = dto.frameworkId || 'what_so_what_now_what';
    const preset =
      FOUR_THREE_TWO_PRESETS[dto.presetId || 'standard'] ||
      FOUR_THREE_TWO_PRESETS.standard;

    const { systemPrompt, userPrompt } = buildPromptGenerationPrompts({
      ...dto,
      mode,
      domain,
      cefrLevel,
      frameworkId,
    });

    const { data, modelUsed } = await this.runAiJson<any>(userId, {
      systemPrompt,
      userPrompt,
      keyId: dto.keyId,
      model: dto.model,
      variant: dto.variant,
      temperature: 0.55,
      maxTokens: 1600,
    });

    const promptTitle = String(data?.promptTitle || '').trim() || 'Spontaneous Speaking Challenge';
    const promptBody =
      String(data?.promptBody || '').trim() ||
      'Explain your perspective clearly in natural spoken American English without translating.';

    const starterHints = (Array.isArray(data?.starterHints) ? data.starterHints : [])
      .map((s: any) => String(s || '').trim())
      .filter(Boolean)
      .slice(0, 4);

    const beatCues = (Array.isArray(data?.beatCues) ? data.beatCues : [])
      .map((s: any) => String(s || '').trim())
      .filter(Boolean)
      .slice(0, 5);

    const cards =
      mode === 'circumlocution'
        ? (Array.isArray(data?.cards) ? data.cards : [])
            .slice(0, 5)
            .map((c: any, idx: number) => ({
              id: String(c?.id || `c${idx + 1}`),
              concept: String(c?.concept || `Concept ${idx + 1}`).trim(),
              hint: String(c?.hint || 'Describe what it does or when you use it.').trim(),
              forbiddenWords: (Array.isArray(c?.forbiddenWords) ? c.forbiddenWords : [])
                .map((w: any) => String(w || '').trim())
                .filter(Boolean)
                .slice(0, 5),
            }))
            .filter((c: any) => c.concept)
        : undefined;

    return {
      mode,
      domain,
      cefrLevel,
      frameworkId,
      promptTitle,
      promptBody,
      modelUsed,
      promptMeta: {
        beatCues,
        starterHints,
        roundDurationsSec: mode === 'four_three_two' ? preset.roundsSec : undefined,
        presetId: mode === 'four_three_two' ? preset.id : undefined,
        cards,
        openingHookGoal: data?.openingHookGoal ? String(data.openingHookGoal).trim() : undefined,
        curveballQuestion: data?.curveballQuestion ? String(data.curveballQuestion).trim() : undefined,
        curveballTriggerSec:
          mode === 'camera_qa'
            ? Math.max(20, Math.min(75, Number(data?.curveballTriggerSec) || 38))
            : undefined,
        groundingCue:
          mode === 'camera_qa'
            ? String(data?.groundingCue || 'Conversation, not performance. Dare to be dull.').trim()
            : undefined,
      },
    };
  }

  async transcribeRecording(
    file: { buffer: Buffer; mimetype?: string; originalname?: string },
  ): Promise<{ text: string; durationSeconds: number; engine: string }> {
    if (!file || !file.buffer || file.buffer.length < 512) {
      throw new BadRequestException('Audio recording is empty.');
    }

    const mime = String(file.mimetype || '').split(';')[0].trim().toLowerCase();
    const ext =
      EXT_BY_MIME[mime] ||
      path.extname(file.originalname || '').toLowerCase() ||
      '.webm';

    const tmpPath = path.join(os.tmpdir(), `flaptap-ta-${randomUUID()}${ext}`);
    try {
      fs.writeFileSync(tmpPath, file.buffer);
      const result = await this.mediaTranscription.transcribeFile(tmpPath, {
        force: true,
        skipCache: true,
        allowLocalWhisper: true,
      });
      return {
        text: result.text,
        durationSeconds: result.durationSeconds,
        engine: result.engine || 'faster-whisper',
      };
    } finally {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        // Ignore cleanup failure
      }
    }
  }

  async evaluateAndSaveSession(
    userId: string,
    dto: EvaluateSessionDto,
    defaultNativeLanguage = 'ar',
  ): Promise<ThinkAloudSessionRecord> {
    if (!Array.isArray(dto.rounds) || dto.rounds.length === 0) {
      throw new BadRequestException('At least one spoken or typed round is required.');
    }

    const hasText = dto.rounds.some((r) => String(r.transcript || '').trim().length > 0);
    if (!hasText) {
      throw new BadRequestException(
        'No transcript text was captured. Speak clearly or switch to Fast-Type mode.',
      );
    }

    const metrics = computeFluencyMetrics(dto.mode, dto.rounds, dto.promptMeta || {});
    const nativeLanguage = String(dto.nativeLanguage || defaultNativeLanguage || 'ar').trim();
    const fallbackTranscript = metrics.rounds.map((r) => r.transcript).filter(Boolean).join(' ');

    const { systemPrompt, userPrompt } = buildEvaluationPrompts({
      dto,
      metrics,
      nativeLanguage,
    });

    const { data, modelUsed } = await this.runAiJson<any>(userId, {
      systemPrompt,
      userPrompt,
      keyId: dto.keyId,
      model: dto.model,
      variant: dto.variant,
      temperature: 0.3,
      maxTokens: 2800,
      timeoutMs: 60000,
    });

    const coaching = normalizeCoachingReport(data, fallbackTranscript);

    return this.repository.saveSession({
      userId,
      mode: dto.mode,
      domain: dto.domain,
      cefrLevel: dto.cefrLevel || 'B2',
      frameworkId: dto.frameworkId || '',
      promptTitle: String(dto.promptTitle || 'Spontaneous Session').trim(),
      promptBody: String(dto.promptBody || '').trim(),
      promptMeta: dto.promptMeta || {},
      inputMode: dto.inputMode || 'mic',
      rounds: metrics.rounds,
      metrics,
      coaching,
      modelUsed,
      nativeLanguage,
    });
  }

  listSessions(
    userId: string,
    query: { mode?: string; domain?: string; q?: string; page?: number; limit?: number },
  ) {
    return this.repository.listSessions(userId, query);
  }

  getSession(userId: string, id: string): ThinkAloudSessionRecord {
    const found = this.repository.getSessionById(userId, id);
    if (!found) {
      throw new NotFoundException('Think Aloud session not found.');
    }
    return found;
  }

  deleteSession(userId: string, id: string): boolean {
    const deleted = this.repository.deleteSession(userId, id);
    if (!deleted) {
      throw new NotFoundException('Think Aloud session not found.');
    }
    return true;
  }

  listSpines(userId?: string | null): ThinkAloudSpinePack[] {
    return this.repository.listSpinePacks(userId);
  }

  async generateSpinePack(
    userId: string,
    dto: GenerateSpinePackDto,
  ): Promise<ThinkAloudSpinePack> {
    const topic = String(dto.topic || '').trim();
    if (!topic) {
      throw new BadRequestException('Please provide a topic for your custom Spine Pack.');
    }
    const domain: ThinkAloudDomain = dto.domain || 'programming_ai';

    const { systemPrompt, userPrompt } = buildSpinePackPrompts({ ...dto, domain, topic });
    const { data, modelUsed } = await this.runAiJson<any>(userId, {
      systemPrompt,
      userPrompt,
      keyId: dto.keyId,
      model: dto.model,
      variant: dto.variant,
      temperature: 0.45,
      maxTokens: 2000,
    });

    const normalizeItems = (arr: any[], prefix: string): SpineChunkItem[] =>
      (Array.isArray(arr) ? arr : [])
        .slice(0, 6)
        .map((item: any, i: number) => ({
          id: `${prefix}_${Date.now().toString(36)}_${i + 1}`,
          text: String(item?.text || '').trim(),
          ipa: String(item?.ipa || '').trim(),
          note: String(item?.note || '').trim(),
          example: String(item?.example || '').trim(),
        }))
        .filter((x) => x.text);

    const starters = normalizeItems(data?.starters, 's');
    const engines = normalizeItems(data?.engines, 'e');
    const tails = normalizeItems(data?.tails, 't');
    const chunks = normalizeItems(data?.chunks, 'c');

    if (starters.length === 0 || engines.length === 0 || tails.length === 0) {
      throw new ServiceUnavailableException('AI returned an incomplete Spine Pack. Please try again.');
    }

    return this.repository.saveSpinePack({
      userId,
      title: String(data?.title || topic).trim().slice(0, 80),
      domain,
      topic,
      starters,
      engines,
      tails,
      chunks,
      modelUsed,
    });
  }

  toggleSpinePracticed(userId: string, packId: string, itemId: string): ThinkAloudSpinePack {
    const updated = this.repository.toggleSpineItemPracticed(userId, packId, itemId);
    if (!updated) {
      throw new NotFoundException('Spine pack or item not found.');
    }
    return updated;
  }

  deleteSpinePack(userId: string, packId: string): boolean {
    const deleted = this.repository.deleteSpinePack(userId, packId);
    if (!deleted) {
      throw new NotFoundException('Custom spine pack not found.');
    }
    return true;
  }
}
