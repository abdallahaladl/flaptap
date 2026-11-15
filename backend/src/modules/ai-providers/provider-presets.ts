import { ProviderPreset } from './ai-providers.types';

export interface EnvMatcherRule {
  providerId: string;
  regex: RegExp;
  baseUrlEnvPrefix?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'opencode-go',
    name: 'OpenCode Go',
    protocol: 'openai-compatible',
    defaultBaseUrl: 'https://opencode.ai/inference/go/openai/v1',
    modelsDevProviderIds: ['opencode-go', 'opencode'],
    keyPlaceholder: 'oc_sk_...',
    notes: 'High-speed unified multi-model inference gateway.',
  },
  {
    id: 'opencode',
    name: 'OpenCode Zen',
    protocol: 'openai-compatible',
    defaultBaseUrl: 'https://opencode.ai/inference/openai/v1',
    modelsDevProviderIds: ['opencode'],
    keyPlaceholder: 'oc_...',
    notes: 'OpenCode inference endpoint.',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    protocol: 'openai-compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    modelsDevProviderIds: ['openai'],
    allowCustomBaseUrl: true,
    keyPlaceholder: 'sk-proj-...',
    notes: 'Official OpenAI API or OpenAI-compatible base URL.',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    protocol: 'gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modelsDevProviderIds: ['google'],
    keyPlaceholder: 'AIza...',
    notes: 'Direct Google Gemini REST API.',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    protocol: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    modelsDevProviderIds: ['anthropic'],
    keyPlaceholder: 'sk-ant-...',
    notes: 'Direct Anthropic Messages API.',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    protocol: 'openai-compatible',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    modelsDevProviderIds: ['openrouter'],
    keyPlaceholder: 'sk-or-v1-...',
    notes: 'Unified router across frontier open & closed models.',
  },
  {
    id: 'groq',
    name: 'Groq',
    protocol: 'openai-compatible',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    modelsDevProviderIds: ['groq'],
    keyPlaceholder: 'gsk_...',
    notes: 'Ultra-low-latency LPU inference.',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    protocol: 'openai-compatible',
    defaultBaseUrl: 'https://api.deepseek.com',
    modelsDevProviderIds: ['deepseek'],
    keyPlaceholder: 'sk-...',
    notes: 'Official DeepSeek direct API.',
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    protocol: 'openai-compatible',
    defaultBaseUrl: 'https://api.x.ai/v1',
    modelsDevProviderIds: ['xai'],
    keyPlaceholder: 'xai-...',
    notes: 'Official xAI Grok API.',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    protocol: 'openai-compatible',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    modelsDevProviderIds: ['mistral'],
    keyPlaceholder: 'mistral-...',
    notes: 'Official Mistral API.',
  },
  {
    id: 'together',
    name: 'Together AI',
    protocol: 'openai-compatible',
    defaultBaseUrl: 'https://api.together.xyz/v1',
    modelsDevProviderIds: ['togetherai', 'together'],
    keyPlaceholder: 'tgp_v1_...',
    notes: 'Together AI open-weights inference.',
  },
  {
    id: 'custom',
    name: 'Custom OpenAI-Compatible',
    protocol: 'openai-compatible',
    defaultBaseUrl: '',
    modelsDevProviderIds: ['openai'],
    allowCustomBaseUrl: true,
    keyPlaceholder: 'sk-... (optional for local)',
    notes: 'Any OpenAI-compatible v1 endpoint (vLLM, LiteLLM, Azure proxy, Ollama).',
  },
];

export const ENV_MATCHER_RULES: EnvMatcherRule[] = [
  { providerId: 'opencode-go', regex: /^OPENCODE_GO_API_KEY(?:_([A-Z0-9_]+))?$/i },
  { providerId: 'opencode', regex: /^OPENCODE(?:_ZEN)?_API_KEY(?:_([A-Z0-9_]+))?$/i },
  { providerId: 'openai', regex: /^OPENAI_API_KEY(?:_([A-Z0-9_]+))?$/i },
  {
    providerId: 'google',
    regex: /^(?:GEMINI_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY|GOOGLE_API_KEY)(?:_([A-Z0-9_]+))?$/i,
  },
  { providerId: 'anthropic', regex: /^(?:ANTHROPIC|CLAUDE)_API_KEY(?:_([A-Z0-9_]+))?$/i },
  { providerId: 'openrouter', regex: /^OPENROUTER_API_KEY(?:_([A-Z0-9_]+))?$/i },
  { providerId: 'groq', regex: /^GROQ_API_KEY(?:_([A-Z0-9_]+))?$/i },
  { providerId: 'deepseek', regex: /^DEEPSEEK_API_KEY(?:_([A-Z0-9_]+))?$/i },
  { providerId: 'xai', regex: /^XAI_API_KEY(?:_([A-Z0-9_]+))?$/i },
  { providerId: 'mistral', regex: /^MISTRAL_API_KEY(?:_([A-Z0-9_]+))?$/i },
  { providerId: 'together', regex: /^TOGETHER_API_KEY(?:_([A-Z0-9_]+))?$/i },
];

export function getPresetById(providerId: string): ProviderPreset {
  const clean = String(providerId || '').trim().toLowerCase();
  return (
    PROVIDER_PRESETS.find((p) => p.id === clean) ||
    PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1]
  );
}
