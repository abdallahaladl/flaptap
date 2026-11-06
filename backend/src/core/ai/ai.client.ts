import { Injectable, Logger } from '@nestjs/common';

export interface AiChatOptions {
  /** Maximum tokens the model may generate (reasoning is disabled). */
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Ask for an OpenAI-compatible JSON object response. */
  json?: boolean;
}

/**
 * Single, direct AI transport for the whole platform.
 *
 * There is no agent layer, adapter registry, CLI subprocess, or model routing
 * cascade anymore. Every cognitive feature talks to OpenCode Go through one
 * OpenAI-compatible endpoint and one configured model.
 *
 * Configuration (root `.env` wins, real process env always wins):
 *   OPENCODE_GO_API_KEY   oc_sk_...
 *   OPENCODE_GO_MODEL     deepseek-v4.1-flash
 *   OPENCODE_GO_BASE_URL  https://opencode.ai/inference/go/openai/v1
 */
@Injectable()
export class AiClient {
  private readonly logger = new Logger(AiClient.name);
  private readonly baseUrl = (
    process.env.OPENCODE_GO_BASE_URL || 'https://opencode.ai/inference/go/openai/v1'
  ).replace(/\/+$/, '');
  private readonly model = (process.env.OPENCODE_GO_MODEL || 'deepseek-v4.1-flash').trim();
  private readonly sessionId = `flaptap-${process.pid}-${Date.now().toString(36)}`;

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

  /** Whether the model is reachable/configured; used by health responses. */
  status() {
    return {
      configured: this.isConfigured(),
      provider: 'OpenCode Go',
      model: this.model,
    };
  }

  async chat(systemPrompt: string, userPrompt: string, options: AiChatOptions = {}): Promise<string> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new Error('OPENCODE_GO_API_KEY is not configured.');
    }

    const maxTokens = Math.max(64, Math.min(options.maxTokens ?? 2048, 8192));
    const payload: Record<string, any> = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: options.temperature ?? 0.2,
      max_tokens: maxTokens,
      // DeepSeek V4.1 Flash is a reasoning model by default. Without this the
      // model can burn thousands of reasoning tokens before writing any output,
      // which is far too slow for an interactive studio.
      reasoning_effort: 'none',
    };
    if (options.json) {
      payload.response_format = { type: 'json_object' };
    }

    let lastError: Error | null = null;

    // One retry only: enough to survive a transient edge failure without
    // doubling the worst-case wait for the user.
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 45000);
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'flaptap-ai/2.0',
            'x-opencode-session': this.sessionId,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`AI request failed (${response.status}): ${body.slice(0, 300)}`);
        }

        const data: any = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
          throw new Error('AI returned an empty response.');
        }
        return content;
      } catch (error: any) {
        lastError = error?.name === 'AbortError'
          ? new Error('AI request timed out.')
          : error;
        this.logger.warn(`AI attempt ${attempt + 1} failed: ${lastError?.message}`);
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
    }

    throw lastError || new Error('AI request failed.');
  }

  async chatJson<T>(systemPrompt: string, userPrompt: string, options: AiChatOptions = {}): Promise<T> {
    const firstRaw = await this.chat(systemPrompt, userPrompt, { ...options, json: true });
    try {
      return this.parseJson<T>(firstRaw);
    } catch (firstErr: any) {
      this.logger.warn(`Initial JSON parse failed (${firstErr?.message}); retrying with expanded token budget.`);
      const expandedMax = Math.min(8192, Math.max((options.maxTokens ?? 2048) + 2048, 4096));
      const secondRaw = await this.chat(systemPrompt, userPrompt, {
        ...options,
        maxTokens: expandedMax,
        json: true,
      });
      return this.parseJson<T>(secondRaw);
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
    } catch (error: any) {
      throw new Error(`AI returned invalid JSON: ${error.message}`);
    }
  }
}
