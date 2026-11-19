import { Injectable } from '@nestjs/common';
import {
  IProviderProtocolAdapter,
  InternalResolvedKey,
  ProviderChatRequest,
  ProviderChatResponse,
  ProviderProtocol,
  RawEndpointModel,
} from '../ai-providers.types';

const NON_CHAT_MODEL_RE =
  /(?:^|\/|-)(?:whisper|tts|dall-e|gpt-image|chatgpt-image|sora|text-embedding|embedding|moderation|omni-moderation|babbage|davinci|realtime|transcribe|audio|imagen|veo|lyria|rerank)/i;

@Injectable()
export class OpenAiCompatibleAdapter implements IProviderProtocolAdapter {
  readonly protocol: ProviderProtocol = 'openai-compatible';
  private readonly sessionSeed = `flaptap-prov-${process.pid}-${Date.now().toString(36)}`;
  private readonly unsupportedTempModels = new Set<string>();
  private readonly unsupportedEffortModels = new Set<string>();

  private buildHeaders(key: InternalResolvedKey): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'flaptap-ai/2.0',
    };
    if (key.apiKey) {
      headers.Authorization = `Bearer ${key.apiKey}`;
    }
    if (key.providerId.startsWith('opencode')) {
      headers['x-opencode-session'] = this.sessionSeed;
    }
    return headers;
  }

  async fetchLiveModels(key: InternalResolvedKey, signal?: AbortSignal): Promise<RawEndpointModel[]> {
    const baseUrl = key.baseUrl.replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: this.buildHeaders(key),
      signal: signal || AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      const err: any = new Error(`${key.providerName} HTTP ${res.status}: ${txt.slice(0, 240)}`);
      err.status = res.status;
      throw err;
    }

    const json: any = await res.json();
    const list: any[] = Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.models)
        ? json.models
        : [];

    const out: RawEndpointModel[] = [];
    for (const m of list) {
      const id = String(m?.id || m?.name || '').trim();
      if (!id) continue;
      if (NON_CHAT_MODEL_RE.test(id)) continue;

      const rawType = String(m?.type || '').toLowerCase();
      if (['embedding', 'transcription', 'tts', 'image', 'audio', 'moderation'].includes(rawType)) {
        continue;
      }

      const capReason = m?.capabilities?.reasoning;
      const openRouterParams: string[] = Array.isArray(m?.supported_parameters)
        ? m.supported_parameters.map((s: any) => String(s).toLowerCase())
        : [];

      const capEfforts: string[] = Array.isArray(capReason?.effort)
        ? capReason.effort.map((e: any) => String(e).trim().toLowerCase()).filter(Boolean)
        : [];

      let reasoningSupported: boolean | undefined =
        typeof capReason?.supported === 'boolean' ? capReason.supported : undefined;
      if (reasoningSupported === undefined && openRouterParams.length > 0) {
        reasoningSupported =
          openRouterParams.includes('reasoning') || openRouterParams.includes('include_reasoning');
      }

      const contextLen =
        Number(m?.limit?.context) ||
        Number(m?.context_length) ||
        Number(m?.context_window) ||
        undefined;
      const maxOut =
        Number(m?.limit?.output) ||
        Number(m?.max_output_tokens) ||
        Number(m?.top_provider?.max_completion_tokens) ||
        undefined;

      out.push({
        id,
        name: m?.name ? String(m.name) : undefined,
        family: m?.family ? String(m.family) : undefined,
        description: m?.description ? String(m.description) : undefined,
        type: rawType || undefined,
        ownedBy: m?.owned_by ? String(m.owned_by) : undefined,
        contextLength: contextLen,
        maxOutputTokens: maxOut,
        reasoningSupported,
        reasoningToggle: Boolean(capReason?.toggle),
        reasoningEfforts: capEfforts.length > 0 ? capEfforts : undefined,
        defaultEffort: capReason?.default?.value ? String(capReason.default.value) : undefined,
        structuredOutput:
          typeof m?.capabilities?.structured_output === 'boolean'
            ? m.capabilities.structured_output
            : openRouterParams.includes('response_format') || openRouterParams.includes('structured_outputs')
              ? true
              : undefined,
        supportsTemperature:
          typeof m?.capabilities?.temperature === 'boolean' ? m.capabilities.temperature : undefined,
      });
    }

    return out;
  }

  private async readStreamingChatCompletion(
    res: Response,
    idleTimeoutMs: number,
    onActivity: () => void,
    onContentDelta?: (delta: string, accumulated: string) => void,
    allowPartialOnTimeout = false,
  ): Promise<{ content: string; finishReason: string; reasoningChars: number }> {
    if (!res.body || !res.body.getReader) {
      const json: any = await res.json();
      const raw = json?.choices?.[0]?.message?.content;
      const full = Array.isArray(raw)
        ? raw.map((part: any) => part?.text || '').join('')
        : String(raw || '');
      if (full && onContentDelta) onContentDelta(full, full);
      return {
        content: full,
        finishReason: String(json?.choices?.[0]?.finish_reason || ''),
        reasoningChars: String(json?.choices?.[0]?.message?.reasoning_content || '').length,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let contentAcc = '';
    let finishReason = '';
    let reasoningChars = 0;

    const readWithIdleGuard = async () => {
      let idleTimer: NodeJS.Timeout | undefined;
      try {
        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          idleTimer = setTimeout(
            () => reject(new Error('Upstream stream stalled (no tokens received).')),
            idleTimeoutMs,
          );
        });
        return await Promise.race([reader.read(), timeoutPromise]);
      } finally {
        if (idleTimer) clearTimeout(idleTimer);
      }
    };

    try {
      while (true) {
        const { value, done } = await readWithIdleGuard();
        if (done) break;
        onActivity();

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payloadStr = trimmed.slice(5).trim();
          if (!payloadStr || payloadStr === '[DONE]') continue;

          try {
            const parsed: any = JSON.parse(payloadStr);
            const choice = parsed?.choices?.[0];
            if (choice?.finish_reason) {
              finishReason = String(choice.finish_reason);
            }
            const delta = choice?.delta;
            if (delta && typeof delta.reasoning_content === 'string') {
              reasoningChars += delta.reasoning_content.length;
            } else if (delta && typeof delta.reasoning === 'string') {
              reasoningChars += delta.reasoning.length;
            }
            let chunk = '';
            if (delta && typeof delta.content === 'string') {
              chunk = delta.content;
            } else if (delta && Array.isArray(delta.content)) {
              for (const part of delta.content) {
                if (typeof part?.text === 'string') chunk += part.text;
              }
            } else if (choice?.message && typeof choice.message.content === 'string') {
              chunk = choice.message.content;
            }
            if (chunk) {
              contentAcc += chunk;
              onContentDelta?.(chunk, contentAcc);
            }
          } catch {
            // Ignore partial keepalive JSON chunks
          }
        }
      }
    } catch (err: any) {
      // A stall mid-stream still carries complete items. Let the caller salvage
      // them instead of discarding minutes of generation.
      if (allowPartialOnTimeout && contentAcc.trim().length > 0) {
        return { content: contentAcc, finishReason: 'partial', reasoningChars };
      }
      throw err;
    } finally {
      reader.cancel().catch(() => {});
    }

    return { content: contentAcc, finishReason, reasoningChars };
  }

  async executeChat(
    key: InternalResolvedKey,
    request: ProviderChatRequest,
  ): Promise<ProviderChatResponse> {
    const baseUrl = key.baseUrl.replace(/\/+$/, '');
    const modelId = String(request.model || '').trim();
    const variant = String(request.variant || '').trim().toLowerCase();
    const cacheModelKey = `${key.providerId}::${modelId}`;
    const isHeavyTier = ['high', 'xhigh', 'max', 'on'].includes(variant);

    if (request.supportsTemperature === false) {
      this.unsupportedTempModels.add(cacheModelKey);
    }

    let includeTemp =
      request.temperature !== undefined && !this.unsupportedTempModels.has(cacheModelKey);
    let includeEffort =
      Boolean(variant && variant !== 'standard' && variant !== 'default') &&
      !this.unsupportedEffortModels.has(cacheModelKey);
    let includeJsonFormat = Boolean(request.json);
    let useStream = true;
    let maxTokensOverride = isHeavyTier
      ? Math.max(request.maxTokens ?? 16384, 16384)
      : request.maxTokens ?? 4096;

    const start = Date.now();

    for (let attempt = 0; attempt < 5; attempt++) {
      if (request.signal?.aborted) {
        throw new Error('Request cancelled.');
      }

      const userContent =
        Array.isArray(request.images) && request.images.length > 0
          ? [
              { type: 'text', text: request.userPrompt },
              ...request.images.map((image) => ({
                type: 'image_url',
                image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
              })),
            ]
          : request.userPrompt;

      const payload: Record<string, any> = {
        model: modelId,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: userContent },
        ],
        max_tokens: Math.max(64, Math.min(maxTokensOverride, 32768)),
        stream: useStream,
      };

      if (includeTemp && request.temperature !== undefined) {
        payload.temperature = request.temperature;
      }
      if (includeEffort) {
        payload.reasoning_effort = variant === 'on' ? 'medium' : variant;
      }
      if (includeJsonFormat) {
        payload.response_format = { type: 'json_object' };
      }

      const controller = new AbortController();
      const totalCeilingMs = request.timeoutMs ?? (isHeavyTier ? 150000 : 45000);
      const idleTimeoutMs = isHeavyTier ? 90000 : 32000;

      const totalTimer = setTimeout(
        () => controller.abort(new Error(`${key.providerName} request timed out.`)),
        totalCeilingMs,
      );
      const onExtAbort = () => controller.abort(request.signal?.reason || new Error('Cancelled'));
      request.signal?.addEventListener('abort', onExtAbort, { once: true });

      try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: this.buildHeaders(key),
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          if (res.status === 400 && includeTemp && /temperature/i.test(body)) {
            this.unsupportedTempModels.add(cacheModelKey);
            includeTemp = false;
            continue;
          }
          if (res.status === 400 && includeEffort && /reasoning|effort/i.test(body)) {
            this.unsupportedEffortModels.add(cacheModelKey);
            includeEffort = false;
            continue;
          }
          if (res.status === 400 && includeJsonFormat && /response_format|json_object/i.test(body)) {
            includeJsonFormat = false;
            continue;
          }
          if (res.status === 400 && useStream && /stream/i.test(body)) {
            useStream = false;
            continue;
          }
          throw new Error(`${key.providerName} HTTP ${res.status}: ${body.slice(0, 300)}`);
        }

        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        let rawText = '';
        let finishReason = '';
        let reasoningChars = 0;

        if (useStream && contentType.includes('text/event-stream')) {
          const streamed = await this.readStreamingChatCompletion(
            res,
            idleTimeoutMs,
            () => {},
            request.onContentDelta,
            Boolean(request.allowPartialOnTimeout),
          );
          rawText = streamed.content;
          finishReason = streamed.finishReason;
          reasoningChars = streamed.reasoningChars;
        } else {
          const data: any = await res.json();
          const raw = data?.choices?.[0]?.message?.content;
          finishReason = String(data?.choices?.[0]?.finish_reason || '');
          reasoningChars = String(
            data?.choices?.[0]?.message?.reasoning_content ||
              data?.choices?.[0]?.message?.reasoning ||
              '',
          ).length;
          rawText = Array.isArray(raw)
            ? raw.map((part: any) => part?.text || '').join('')
            : String(raw || '');
          if (rawText && request.onContentDelta) {
            request.onContentDelta(rawText, rawText);
          }
        }

        const cleaned = rawText.replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '').trim();

        if (!cleaned) {
          // If reasoning consumed the entire token budget, expand max_tokens and retry cleanly.
          if (finishReason === 'length' && maxTokensOverride < 24576) {
            maxTokensOverride = 24576;
            continue;
          }
          // If streaming yielded zero visible content, fall back to non-streaming once.
          if (useStream) {
            useStream = false;
            continue;
          }
          throw new Error(`${key.providerName} (${modelId}) returned an empty response.`);
        }

        return {
          content: cleaned,
          keyId: key.id,
          providerId: key.providerId,
          providerName: key.providerName,
          modelUsed: modelId,
          variantUsed: includeEffort ? variant : 'standard',
          executionTimeMs: Date.now() - start,
          finishReason: finishReason || undefined,
          truncated: finishReason === 'length' || finishReason === 'max_tokens',
          reasoningChars: reasoningChars || undefined,
        };
      } catch (err: any) {
        if (request.signal?.aborted) {
          throw new Error('Request cancelled.');
        }
        if (err?.name === 'AbortError' || /stalled|timed out/i.test(err?.message || '')) {
          throw new Error(`${key.providerName} (${modelId}) request timed out.`);
        }
        throw err;
      } finally {
        clearTimeout(totalTimer);
        request.signal?.removeEventListener('abort', onExtAbort);
      }
    }

    throw new Error(`${key.providerName} request failed after compatibility adjustments.`);
  }
}
