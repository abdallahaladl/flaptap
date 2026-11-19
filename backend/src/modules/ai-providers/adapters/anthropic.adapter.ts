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

  async executeChat(
    key: InternalResolvedKey,
    request: ProviderChatRequest,
  ): Promise<ProviderChatResponse> {
    const baseUrl = key.baseUrl.replace(/\/+$/, '');
    const modelId = String(request.model || '').trim();
    const variant = String(request.variant || '').trim().toLowerCase();
    const start = Date.now();

    let includeThinking = ['low', 'medium', 'high', 'xhigh', 'max', 'on'].includes(variant);

    for (let attempt = 0; attempt < 2; attempt++) {
      if (request.signal?.aborted) {
        throw new Error('Request cancelled.');
      }

      const maxTokens = Math.max(256, Math.min(request.maxTokens ?? 4096, 16384));
      const userContent =
        Array.isArray(request.images) && request.images.length > 0
          ? [
              { type: 'text', text: request.userPrompt },
              ...request.images.map((image) => ({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: image.mimeType,
                  data: image.base64,
                },
              })),
            ]
          : request.userPrompt;

      const payload: Record<string, any> = {
        model: modelId,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        max_tokens: maxTokens,
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
          throw new Error(`Anthropic HTTP ${res.status}: ${body.slice(0, 300)}`);
        }

        const data: any = await res.json();
        const blocks = Array.isArray(data?.content) ? data.content : [];
        const text = blocks
          .filter((b: any) => b?.type === 'text' && typeof b?.text === 'string')
          .map((b: any) => b.text)
          .join('')
          .trim();

        if (!text) {
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
          finishReason: String(data?.stop_reason || '') || undefined,
          truncated: String(data?.stop_reason || '') === 'max_tokens',
        };
      } finally {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', onExtAbort);
      }
    }

    throw new Error('Anthropic request failed.');
  }
}
