export type ProviderProtocol = 'openai-compatible' | 'gemini' | 'anthropic';

export interface ProviderPreset {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  defaultBaseUrl: string;
  modelsDevProviderIds: string[];
  allowCustomBaseUrl?: boolean;
  keyPlaceholder: string;
  notes: string;
}

export interface ProviderKeyProfile {
  id: string;
  providerId: string;
  providerName: string;
  protocol: ProviderProtocol;
  label: string;
  displayName: string;
  source: 'env' | 'opencode-auth' | 'vault' | 'local';
  envVarName?: string;
  maskedKey?: string;
  baseUrl: string;
  isDefault: boolean;
  deletable: boolean;
}

export interface InternalResolvedKey extends ProviderKeyProfile {
  apiKey: string;
  fingerprint: string;
  preferredModel?: string;
}

export interface DiscoveredVariantOption {
  id: string;
  label: string;
  effort?: string;
  default?: boolean;
  description: string;
}

export interface DiscoveredModelOption {
  id: string;
  name: string;
  providerId: string;
  family?: string;
  description?: string;
  contextLength?: number;
  maxOutputTokens?: number;
  reasoningSupported: boolean;
  reasoningMode: 'none' | 'effort' | 'toggle';
  variants: DiscoveredVariantOption[];
  defaultVariant: string;
  structuredOutput?: boolean;
  supportsTemperature?: boolean;
  default?: boolean;
  source: 'live-api' | 'live-api+models.dev';
}

export interface RawEndpointModel {
  id: string;
  name?: string;
  family?: string;
  description?: string;
  type?: string;
  ownedBy?: string;
  contextLength?: number;
  maxOutputTokens?: number;
  reasoningSupported?: boolean;
  reasoningToggle?: boolean;
  reasoningEfforts?: string[];
  defaultEffort?: string;
  structuredOutput?: boolean;
  supportsTemperature?: boolean;
}

export interface LiveModelsResponse {
  keyId: string;
  providerId: string;
  providerName: string;
  protocol: ProviderProtocol;
  fetchedLive: boolean;
  liveStatus: 'ok' | 'auth_error' | 'network_error';
  error?: string;
  latencyMs: number;
  cached: boolean;
  catalogSynced: boolean;
  defaultModel: string;
  models: DiscoveredModelOption[];
}

export interface ProviderImageAttachment {
  mimeType: string;
  /** Base64 payload without the `data:` prefix. */
  base64: string;
}

export interface ProviderChatRequest {
  model: string;
  variant?: string;
  systemPrompt: string;
  userPrompt: string;
  /** Optional multimodal attachments (OCR, screenshot understanding). */
  images?: ProviderImageAttachment[];
  temperature?: number;
  supportsTemperature?: boolean;
  maxTokens?: number;
  json?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  onContentDelta?: (delta: string, accumulated: string) => void;
  /** Return whatever streamed before a stall/timeout instead of throwing. */
  allowPartialOnTimeout?: boolean;
}

export interface ProviderChatResponse {
  content: string;
  keyId: string;
  providerId: string;
  providerName: string;
  modelUsed: string;
  variantUsed: string;
  executionTimeMs: number;
  fallbackFrom?: string;
  /** Upstream stop reason (e.g. "length", "max_tokens", "MAX_TOKENS", "stop"). */
  finishReason?: string;
  /** True when the provider stopped at the token ceiling, so JSON may be cut off. */
  truncated?: boolean;
  /** Characters of reasoning emitted before the visible answer, for diagnostics. */
  reasoningChars?: number;
}

export interface IProviderProtocolAdapter {
  readonly protocol: ProviderProtocol;
  fetchLiveModels(key: InternalResolvedKey, signal?: AbortSignal): Promise<RawEndpointModel[]>;
  executeChat(key: InternalResolvedKey, request: ProviderChatRequest): Promise<ProviderChatResponse>;
}
