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
export class GeminiAdapter implements IProviderProtocolAdapter {
  readonly protocol: ProviderProtocol = 'gemini';

  async fetchLiveModels(key: InternalResolvedKey, signal?: AbortSignal): Promise<RawEndpointModel[]> {
    const baseUrl = key.baseUrl.replace(/\/+$/, '');
    const allModels: RawEndpointModel[] = [];
    let pageToken = '';

    for (let page = 0; page < 4; page++) {
      const url = new URL(`${baseUrl}/models`);
      url.searchParams.set('pageSize', '200');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-goog-api-key': key.apiKey,
          'User-Agent': 'flaptap-ai/2.0',
        },
        signal: signal || AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        const err: any = new Error(`Google Gemini HTTP ${res.status}: ${txt.slice(0, 240)}`);
        err.status = res.status;
        throw err;
      }

      const data: any = await res.json();
      const models = Array.isArray(data?.models) ? data.models : [];
      for (const m of models) {
        const methods: string[] = Array.isArray(m?.supportedGenerationMethods)
          ? m.supportedGenerationMethods
          : [];
        if (!methods.includes('generateContent')) continue;

        const id = String(m?.name || '').replace(/^models\//i, '').trim();
        if (!id || /(?:embedding|imagen|veo|lyria|aqa|tts)/i.test(id)) continue;

        const isGemini3OrNewer = /^gemini-[3-9]/i.test(id);
        const isGemini25 = /^gemini-2\.5/i.test(id);
        const supportsThinking = Boolean(m?.thinking) || isGemini25 || isGemini3OrNewer;

        allModels.push({
          id,
          name: m?.displayName ? String(m.displayName) : id,
          family: 'Gemini',
          description: m?.description ? String(m.description) : undefined,
          contextLength: Number(m?.inputTokenLimit) || undefined,
          maxOutputTokens: Number(m?.outputTokenLimit) || undefined,
          reasoningSupported: supportsThinking,
          reasoningEfforts: supportsThinking
            ? isGemini3OrNewer
              ? ['minimal', 'low', 'medium', 'high']
              : id.includes('pro')
                ? ['low', 'medium', 'high']
                : ['none', 'low', 'medium', 'high']
            : [],
          supportsTemperature: true,
          structuredOutput: true,
        });
      }

      pageToken = String(data?.nextPageToken || '').trim();
      if (!pageToken) break;
    }

    return allModels;
  }

  async executeChat(
    key: InternalResolvedKey,
    request: ProviderChatRequest,
  ): Promise<ProviderChatResponse> {
    const baseUrl = key.baseUrl.replace(/\/+$/, '');
    const modelId = String(request.model || '').replace(/^models\//i, '').trim();
    const variant = String(request.variant || '').trim().toLowerCase();
    const start = Date.now();

    let includeThinking = Boolean(variant && variant !== 'standard' && variant !== 'default');
    let includeJsonMime = Boolean(request.json);

    for (let attempt = 0; attempt < 2; attempt++) {
      if (request.signal?.aborted) {
        throw new Error('Request cancelled.');
      }

      const generationConfig: Record<string, any> = {
        maxOutputTokens: Math.max(64, Math.min(request.maxTokens ?? 8192, 65536)),
      };
      if (request.temperature !== undefined) {
        generationConfig.temperature = request.temperature;
      }
      if (includeJsonMime) {
        generationConfig.responseMimeType = 'application/json';
      }
      if (includeThinking) {
        if (/^gemini-[3-9]/i.test(modelId)) {
          generationConfig.thinkingConfig = { thinkingLevel: variant.toUpperCase() };
        } else {
          const budgetMap: Record<string, number> = {
            none: 0,
            minimal: 0,
            low: 1024,
            medium: 4096,
            high: 12288,
            max: 24576,
          };
          generationConfig.thinkingConfig = {
            thinkingBudget: budgetMap[variant] ?? 1024,
          };
        }
      }

      const payload: Record<string, any> = {
        systemInstruction: { parts: [{ text: request.systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: request.userPrompt }] }],
        generationConfig,
      };

      const controller = new AbortController();
      const timeoutMs = request.timeoutMs ?? (variant === 'high' || variant === 'max' ? 90000 : 45000);
      const timer = setTimeout(() => controller.abort(new Error('Google Gemini request timed out.')), timeoutMs);
      const onExtAbort = () => controller.abort(request.signal?.reason || new Error('Cancelled'));
      request.signal?.addEventListener('abort', onExtAbort, { once: true });

      try {
        const res = await fetch(
          `${baseUrl}/models/${encodeURIComponent(modelId)}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': key.apiKey,
              'User-Agent': 'flaptap-ai/2.0',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          },
        );

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          if (res.status === 400 && includeThinking && /thinking/i.test(body)) {
            includeThinking = false;
            continue;
          }
          if (res.status === 400 && includeJsonMime && /responseMimeType|json/i.test(body)) {
            includeJsonMime = false;
            continue;
          }
          throw new Error(`Google Gemini HTTP ${res.status}: ${body.slice(0, 300)}`);
        }

        const data: any = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const text = parts
          .filter((p: any) => !p?.thought && typeof p?.text === 'string')
          .map((p: any) => p.text)
          .join('')
          .trim();

        if (!text) {
          throw new Error(`Google Gemini (${modelId}) returned an empty response.`);
        }

        return {
          content: text,
          keyId: key.id,
          providerId: key.providerId,
          providerName: key.providerName,
          modelUsed: modelId,
          variantUsed: includeThinking ? variant : 'standard',
          executionTimeMs: Date.now() - start,
        };
      } finally {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', onExtAbort);
      }
    }

    throw new Error('Google Gemini request failed.');
  }
}
