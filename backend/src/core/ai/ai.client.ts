import { Injectable, Logger } from '@nestjs/common';

export type AiReasoningEffort = 'none' | 'low' | 'medium' | 'high';

export interface AiChatOptions {
  /** Maximum tokens the model may generate (reasoning is disabled/minimal by default). */
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Ask for an OpenAI-compatible JSON object response. */
  json?: boolean;
  /** Optional explicit OpenCode Go model override. */
  model?: string;
  /** Optional reasoning effort ('none' default for fast interactive latency). */
  reasoningEffort?: AiReasoningEffort;
  /** Optional backup OpenCode Go model list override on transient overload/timeout. */
  fallbackModels?: string[];
  /** Optional cancellation signal (e.g. client stream disconnect). */
  signal?: AbortSignal;
}

export interface AiChatMetaResult {
  content: string;
  modelUsed: string;
  executionTimeMs: number;
}

const DEFAULT_FAST_FALLBACK_MODELS = [
  'gpt-5.6-luna',
  'claude-haiku-5-5',
  'glm-5.3-flash',
  'gpt-6-luna',
];

const MODELS_REQUIRING_LOW_MIN_EFFORT = new Set([
  'claude-haiku-5-5',
  'glm-5.3-flash',
  'gemini-4-argon',
  'qwen3.8-flash',
]);

/**
 * Single, direct AI transport for the whole platform.
 *
 * Every cognitive feature talks directly to OpenCode Go through one
 * OpenAI-compatible HTTP endpoint using OPENCODE_GO_API_KEY, with instant
 * direct model failover on transient overload or timeout and zero CLI overhead.
 */
@Injectable()
export class AiClient {
  private readonly logger = new Logger(AiClient.name);
  private readonly baseUrl = (
    process.env.OPENCODE_GO_BASE_URL || 'https://opencode.ai/inference/go/openai/v1'
  ).replace(/\/+$/, '');
  private readonly model = (process.env.OPENCODE_GO_MODEL || 'gpt-5.6-luna').trim();
  private readonly sessionId = `flaptap-${process.pid}-${Date.now().toString(36)}`;
  private readonly unsupportedTemperatureModels = new Set<string>([
    'gpt-5.6-luna',
    'gpt-6-luna',
  ]);
  private readonly unsupportedEffortModels = new Set<string>();

  get modelName(): string {
    return this.model;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private get apiKey(): string | undefined {
    const key = (process.env.OPENCODE_GO_API_KEY || '').trim();
    return key || undefined;
  }

  private getConfiguredFallbackModels(): string[] {
    const envRaw = (process.env.OPENCODE_GO_FALLBACK_MODELS || '').trim();
    if (!envRaw) return DEFAULT_FAST_FALLBACK_MODELS;
    return envRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private buildCandidateModels(options: AiChatOptions): string[] {
    const primary = (options.model || this.model).trim() || 'gpt-5.6-luna';
    const configured = Array.isArray(options.fallbackModels)
      ? options.fallbackModels
      : this.getConfiguredFallbackModels();

    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const m of [primary, ...configured]) {
      const clean = String(m || '').trim();
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      ordered.push(clean);
    }
    return ordered.slice(0, 3);
  }

  private resolveEffortForModel(modelId: string, requested?: AiReasoningEffort): AiReasoningEffort | undefined {
    if (this.unsupportedEffortModels.has(modelId)) return undefined;
    const eff = requested || 'none';
    if (eff === 'none' && MODELS_REQUIRING_LOW_MIN_EFFORT.has(modelId)) {
      return 'low';
    }
    return eff;
  }

  /** Whether the model is reachable/configured; used by health responses. */
  status() {
    return {
      configured: this.isConfigured(),
      provider: 'OpenCode Go',
      model: this.model,
    };
  }

  private createAttemptSignal(
    timeoutMs: number,
    externalSignal?: AbortSignal,
  ): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('AI request timed out.')), timeoutMs);

    const onExternalAbort = () => {
      controller.abort(externalSignal?.reason || new Error('Request cancelled.'));
    };
    if (externalSignal) {
      if (externalSignal.aborted) {
        onExternalAbort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timer);
        externalSignal?.removeEventListener('abort', onExternalAbort);
      },
    };
  }

  private buildPayload(
    modelId: string,
    systemPrompt: string,
    userPrompt: string,
    options: AiChatOptions,
    includeTemp: boolean,
    includeEffort: boolean,
  ): Record<string, any> {
    const maxTokens = Math.max(64, Math.min(options.maxTokens ?? 2048, 8192));
    const payload: Record<string, any> = {
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
    };

    if (includeTemp && !this.unsupportedTemperatureModels.has(modelId)) {
      payload.temperature = options.temperature ?? 0.2;
    }

    if (includeEffort) {
      const resolvedEffort = this.resolveEffortForModel(modelId, options.reasoningEffort);
      if (resolvedEffort) {
        payload.reasoning_effort = resolvedEffort;
      }
    }

    if (options.json) {
      payload.response_format = { type: 'json_object' };
    }

    return payload;
  }

  async chatWithMeta(
    systemPrompt: string,
    userPrompt: string,
    options: AiChatOptions = {},
  ): Promise<AiChatMetaResult> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new Error('OPENCODE_GO_API_KEY is not configured.');
    }

    if (options.signal?.aborted) {
      throw new Error('AI request cancelled.');
    }

    const candidates = this.buildCandidateModels(options);
    const timeoutMs = options.timeoutMs ?? 30000;
    const totalStart = Date.now();
    let lastError: Error | null = null;

    for (let idx = 0; idx < candidates.length; idx++) {
      if (options.signal?.aborted) {
        throw new Error('AI request cancelled.');
      }

      const modelId = candidates[idx];
      let includeTemp = !this.unsupportedTemperatureModels.has(modelId);
      let includeEffort = !this.unsupportedEffortModels.has(modelId);

      // Up to 2 lightweight tries on the same model if parameter rejection happens;
      // otherwise immediately fail over to next fast OpenCode Go model.
      for (let paramTry = 0; paramTry < 2; paramTry++) {
        const { signal, cleanup } = this.createAttemptSignal(timeoutMs, options.signal);
        try {
          const payload = this.buildPayload(
            modelId,
            systemPrompt,
            userPrompt,
            options,
            includeTemp,
            includeEffort,
          );

          const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'User-Agent': 'flaptap-ai/2.0',
              'x-opencode-session': this.sessionId,
            },
            body: JSON.stringify(payload),
            signal,
          });

          if (!response.ok) {
            const body = await response.text().catch(() => '');
            if (response.status === 400 && includeTemp && /temperature/i.test(body)) {
              this.unsupportedTemperatureModels.add(modelId);
              includeTemp = false;
              continue;
            }
            if (response.status === 400 && includeEffort && /reasoning/i.test(body)) {
              this.unsupportedEffortModels.add(modelId);
              includeEffort = false;
              continue;
            }
            throw new Error(`AI request failed (${response.status}): ${body.slice(0, 300)}`);
          }

          const data: any = await response.json();
          const rawContent = data?.choices?.[0]?.message?.content;
          const cleaned = String(rawContent || '')
            .replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '')
            .trim();
          if (!cleaned) {
            throw new Error('AI returned an empty response.');
          }

          return {
            content: cleaned,
            modelUsed: modelId,
            executionTimeMs: Date.now() - totalStart,
          };
        } catch (error: any) {
          if (options.signal?.aborted) {
            throw new Error('AI request cancelled.');
          }
          lastError =
            error?.name === 'AbortError' || /timed out/i.test(error?.message || '')
              ? new Error('AI request timed out.')
              : error;
          this.logger.warn(
            `OpenCode Go attempt (${modelId}) failed: ${lastError?.message}`,
          );
          break;
        } finally {
          cleanup();
        }
      }

      if (idx < candidates.length - 1 && !options.signal?.aborted) {
        const isRateLimit = /429|overloaded|rate/i.test(lastError?.message || '');
        await new Promise((resolve) => setTimeout(resolve, isRateLimit ? 350 : 120));
      }
    }

    throw lastError || new Error('AI request failed.');
  }

  async chat(systemPrompt: string, userPrompt: string, options: AiChatOptions = {}): Promise<string> {
    const res = await this.chatWithMeta(systemPrompt, userPrompt, options);
    return res.content;
  }

  async chatJson<T>(systemPrompt: string, userPrompt: string, options: AiChatOptions = {}): Promise<T> {
    const { data } = await this.chatJsonWithMeta<T>(systemPrompt, userPrompt, options);
    return data;
  }

  async chatJsonWithMeta<T>(
    systemPrompt: string,
    userPrompt: string,
    options: AiChatOptions = {},
  ): Promise<{ data: T; modelUsed: string; executionTimeMs: number }> {
    const first = await this.chatWithMeta(systemPrompt, userPrompt, { ...options, json: true });
    try {
      return {
        data: this.parseJson<T>(first.content),
        modelUsed: first.modelUsed,
        executionTimeMs: first.executionTimeMs,
      };
    } catch (firstErr: any) {
      if (options.signal?.aborted) {
        throw firstErr;
      }
      this.logger.warn(`Initial JSON parse failed (${firstErr?.message}); retrying with expanded token budget.`);
      const expandedMax = Math.min(8192, Math.max((options.maxTokens ?? 2048) + 2048, 4096));
      const second = await this.chatWithMeta(systemPrompt, userPrompt, {
        ...options,
        maxTokens: expandedMax,
        json: true,
      });
      return {
        data: this.parseJson<T>(second.content),
        modelUsed: second.modelUsed,
        executionTimeMs: first.executionTimeMs + second.executionTimeMs,
      };
    }
  }

  parseJson<T>(raw: string): T {
    let text = (raw || '').trim();

    // Tolerate fenced or chatty model output without accepting prose as data.
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();

    if (!text.startsWith('{') && !text.startsWith('[')) {
      const objStart = text.indexOf('{');
      const arrStart = text.indexOf('[');
      const start = objStart === -1 ? arrStart : (arrStart === -1 ? objStart : Math.min(objStart, arrStart));
      if (start > 0) text = text.slice(start);
    }
    const objEnd = text.lastIndexOf('}');
    const arrEnd = text.lastIndexOf(']');
    const end = Math.max(objEnd, arrEnd);
    if (end >= 0) text = text.slice(0, end + 1);

    try {
      return JSON.parse(text) as T;
    } catch {
      // Lightweight JSON repair (trailing commas, control chars, unclosed braces/brackets)
      // avoids an expensive full second LLM roundtrip on minor formatting hiccups.
      let repaired = text
        .replace(/,\s*([\]}])/g, '$1')
        .replace(/[\u0000-\u001F]+/g, (m) => (m === '\n' || m === '\r' || m === '\t' ? m : ' '));

      const openBrackets = (repaired.match(/\[/g) || []).length;
      const closeBrackets = (repaired.match(/\]/g) || []).length;
      const openBraces = (repaired.match(/\{/g) || []).length;
      const closeBraces = (repaired.match(/\}/g) || []).length;
      if (openBrackets > closeBrackets) repaired += ']'.repeat(openBrackets - closeBrackets);
      if (openBraces > closeBraces) repaired += '}'.repeat(openBraces - closeBraces);

      try {
        return JSON.parse(repaired) as T;
      } catch (error: any) {
        throw new Error(`AI returned invalid JSON: ${error.message}`);
      }
    }
  }
}
