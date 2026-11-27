import { Injectable } from '@nestjs/common';
import {
  IProviderProtocolAdapter,
  InternalResolvedKey,
  ProviderChatRequest,
  ProviderChatResponse,
  ProviderProtocol,
  RawEndpointModel,
} from '../ai-providers.types';

@Injectable()
export class AnthropicAdapter implements IProviderProtocolAdapter {
  readonly protocol: ProviderProtocol = 'anthropic';

  private buildHeaders(key: InternalResolvedKey): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-api-key': key.apiKey,
      'anthropic-version': '2023-06-01',
      'User-Agent': 'flaptap-ai/2.0',
    };
  }

  async fetchLiveModels(key: InternalResolvedKey, signal?: AbortSignal): Promise<RawEndpointModel[]> {
    const baseUrl = key.baseUrl.replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}/models?limit=100`, {
      method: 'GET',
      headers: this.buildHeaders(key),
      signal: signal || AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      const err: any = new Error(`Anthropic HTTP ${res.status}: ${txt.slice(0, 240)}`);
      err.status = res.status;
      throw err;
    }

    const json: any = await res.json();
    const list = Array.isArray(json?.data) ? json.data : [];

    return list
      .filter((m: any) => Boolean(m?.id))
      .map((m: any) => {
        const capThinking = m?.capabilities?.thinking;
        const capEffort = m?.capabilities?.effort;
        const efforts: string[] = [];
        if (capEffort?.supported && Array.isArray(capEffort?.values)) {
          efforts.push(...capEffort.values.map((v: any) => String(v).toLowerCase()));
        }

        return {
          id: String(m.id),
          name: m?.display_name ? String(m.display_name) : String(m.id),
          family: 'Claude',
          contextLength: Number(m?.max_input_tokens) || Number(m?.context_length) || undefined,
          maxOutputTokens: Number(m?.max_tokens) || undefined,
          reasoningSupported: typeof capThinking?.supported === 'boolean' ? capThinking.supported : undefined,
          reasoningEfforts: efforts.length > 0 ? efforts : undefined,
        };
      });
  }

  private async readStreamingMessages(
    res: Response,
    onContentDelta?: (delta: string, accumulated: string) => void,
    onReasoningDelta?: (delta: string, accumulated: string) => void,
    allowPartialOnTimeout = false,
  ): Promise<{ text: string; thinking: string; stopReason: string }> {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let textAcc = '';
    let thinkingAcc = '';
    let stopReason = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (!dataStr || dataStr === '[DONE]') continue;
          try {
            const parsed: any = JSON.parse(dataStr);
            if (parsed?.type === 'content_block_delta') {
              const d = parsed?.delta;
              if (d?.type === 'text_delta' && typeof d?.text === 'string') {
                textAcc += d.text;
                onContentDelta?.(d.text, textAcc);
              } else if (d?.type === 'thinking_delta' && typeof d?.thinking === 'string') {
                thinkingAcc += d.thinking;
                onReasoningDelta?.(d.thinking, thinkingAcc);
              }
            } else if (parsed?.type === 'message_delta' && parsed?.delta?.stop_reason) {
              stopReason = String(parsed.delta.stop_reason);
            }
          } catch {
            // Ignore keepalive / partial frames
          }
        }
      }
    } catch (err) {
      if (allowPartialOnTimeout && textAcc.trim().length > 0) {
        return { text: textAcc, thinking: thinkingAcc, stopReason: 'partial' };
      }
      throw err;
    } finally {
      reader.cancel().catch(() => {});
    }

    return { text: textAcc, thinking: thinkingAcc, stopReason };
  }

  async executeChat(
    key: InternalResolvedKey,
    request: ProviderChatRequest,
  ): Promise<ProviderChatResponse> {
    const baseUrl = key.baseUrl.replace(/\/+$/, '');
    const modelId = String(request.model || '').trim();
    const variant = String(request.variant || '').trim().toLowerCase();
    const start = Date.now();

    let includeThinking = ['low', 'medium', 'high', 'xhigh', 'max', 'on'].includes(variant);
    let wantsStream = Boolean(request.onContentDelta || request.onReasoningDelta);

    for (let attempt = 0; attempt < 3; attempt++) {
      if (request.signal?.aborted) {
        throw new Error('Request cancelled.');
      }

      const maxTokens = Math.max(256, Math.min(request.maxTokens ?? 4096, 16384));
      const rawMessages =
        Array.isArray(request.messages) && request.messages.length > 0
          ? request.messages
          : [
              {
                role: 'user' as const,
                content: request.userPrompt || '',
                images: request.images,
              },
            ];

      const apiMessages: Array<{ role: 'user' | 'assistant'; content: any }> = [];
      for (const m of rawMessages) {
        const hasImgs = m.role === 'user' && Array.isArray(m.images) && m.images.length > 0;
        const blocks = hasImgs
          ? [
              { type: 'text', text: m.content },
              ...m.images!.map((image) => ({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: image.mimeType,
                  data: image.base64,
                },
              })),
            ]
          : m.content;
        const prev = apiMessages[apiMessages.length - 1];
        if (prev && prev.role === m.role) {
          if (typeof prev.content === 'string' && typeof blocks === 'string') {
            prev.content = `${prev.content}\n\n${blocks}`;
          } else {
            const prevBlocks = Array.isArray(prev.content)
              ? prev.content
              : [{ type: 'text', text: String(prev.content) }];
            const nextBlocks = Array.isArray(blocks)
              ? blocks
              : [{ type: 'text', text: String(blocks) }];
            prev.content = [...prevBlocks, ...nextBlocks];
          }
        } else {
          apiMessages.push({ role: m.role, content: blocks });
        }
      }

      const payload: Record<string, any> = {
        model: modelId,
        system: request.systemPrompt,
        messages: apiMessages,
        max_tokens: maxTokens,
        ...(wantsStream ? { stream: true } : {}),
      };

      if (includeThinking) {
        const budgetMap: Record<string, number> = {
          low: 1024,
          medium: 4096,
          on: 4096,
          high: 10240,
          xhigh: 16000,
          max: 24000,
        };
        const budget = Math.min(maxTokens - 256, budgetMap[variant] || 1024);
        if (budget >= 1024) {
          payload.thinking = { type: 'enabled', budget_tokens: budget };
        }
      } else if (request.temperature !== undefined) {
        payload.temperature = request.temperature;
      }

      const controller = new AbortController();
      const timeoutMs = request.timeoutMs ?? (variant === 'high' || variant === 'max' ? 90000 : 45000);
      const timer = setTimeout(() => controller.abort(new Error('Anthropic request timed out.')), timeoutMs);
      const onExtAbort = () => controller.abort(request.signal?.reason || new Error('Cancelled'));
      request.signal?.addEventListener('abort', onExtAbort, { once: true });

      try {
        const res = await fetch(`${baseUrl}/messages`, {
          method: 'POST',
          headers: this.buildHeaders(key),
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          if (res.status === 400 && includeThinking && /thinking/i.test(body)) {
            includeThinking = false;
            continue;
          }
          if (res.status === 400 && wantsStream && /stream/i.test(body)) {
            wantsStream = false;
            continue;
          }
          throw new Error(`Anthropic HTTP ${res.status}: ${body.slice(0, 300)}`);
        }

        const ct = (res.headers.get('content-type') || '').toLowerCase();
        let text = '';
        let thinkingText = '';
        let stopReason = '';

        if (wantsStream && ct.includes('text/event-stream') && res.body?.getReader) {
          const streamed = await this.readStreamingMessages(
            res,
            request.onContentDelta,
            request.onReasoningDelta,
            Boolean(request.allowPartialOnTimeout),
          );
          text = streamed.text.trim();
          thinkingText = streamed.thinking.trim();
          stopReason = streamed.stopReason;
        } else {
          const data: any = await res.json();
          const blocks = Array.isArray(data?.content) ? data.content : [];
          thinkingText = blocks
            .filter((b: any) => b?.type === 'thinking' && typeof b?.thinking === 'string')
            .map((b: any) => b.thinking)
            .join('')
            .trim();
          text = blocks
            .filter((b: any) => b?.type === 'text' && typeof b?.text === 'string')
            .map((b: any) => b.text)
            .join('')
            .trim();
          stopReason = String(data?.stop_reason || '');
          if (thinkingText && request.onReasoningDelta) {
            request.onReasoningDelta(thinkingText, thinkingText);
          }
          if (text && request.onContentDelta) {
            request.onContentDelta(text, text);
          }
        }

        if (!text) {
          if (wantsStream) {
            wantsStream = false;
            continue;
          }
          throw new Error(`Anthropic (${modelId}) returned an empty response.`);
        }

        return {
          content: text,
          keyId: key.id,
          providerId: key.providerId,
          providerName: key.providerName,
          modelUsed: modelId,
          variantUsed: includeThinking ? variant : 'standard',
          executionTimeMs: Date.now() - start,
          finishReason: stopReason || undefined,
          truncated: stopReason === 'max_tokens',
          reasoningChars: thinkingText ? thinkingText.length : undefined,
          reasoning: thinkingText || undefined,
        };
      } finally {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', onExtAbort);
      }
    }

    throw new Error('Anthropic request failed.');
  }
}
