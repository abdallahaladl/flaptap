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

export interface ProviderChatRequest {
  model: string;
  variant?: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  supportsTemperature?: boolean;
  maxTokens?: number;
  json?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  onContentDelta?: (delta: string, accumulated: string) => void;
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
}

export interface IProviderProtocolAdapter {
  readonly protocol: ProviderProtocol;
  fetchLiveModels(key: InternalResolvedKey, signal?: AbortSignal): Promise<RawEndpointModel[]>;
  executeChat(key: InternalResolvedKey, request: ProviderChatRequest): Promise<ProviderChatResponse>;
}
