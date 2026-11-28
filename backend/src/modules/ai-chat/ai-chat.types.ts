export type AiChatPersonaId =
  | 'smart_mentor'
  | 'accent_coach'
  | 'natural_rewrite'
  | 'grammar_nuance'
  | 'roleplay'
  | 'general';

export type AiChatResponseStyle = 'concise' | 'balanced' | 'deep';

export type AiChatLanguageMode = 'auto' | 'en' | 'ar_en' | 'bilingual';

export type AiChatContextType =
  | 'general'
  | 'media_hub'
  | 'dialogue'
  | 'phonetics'
  | 'think_aloud'
  | 'phrase_miner'
  | 'phrase_builder'
  | 'vocabulary'
  | 'word_lookup';

export interface AiChatQuoteAttachment {
  text: string;
  speaker?: string;
  startMs?: number;
  endMs?: number;
  sentenceIndex?: number;
  view?: 'reviewed' | 'raw';
  sourceLabel?: string;
}

export interface AiChatImageInput {
  mimeType: string;
  base64: string;
  name?: string;
}

export interface AiChatImageMeta {
  mimeType: string;
  name?: string;
  previewDataUrl?: string;
}

export interface AiChatContextInput {
  type: AiChatContextType;
  id?: string;
  label?: string;
  subtitle?: string;
  route?: string;
  view?: string;
  payload?: Record<string, any>;
}

export interface AiChatThread {
  id: string;
  userId: string;
  title: string;
  persona: AiChatPersonaId;
  contextType: AiChatContextType;
  contextId: string;
  contextLabel: string;
  contextSnapshot: Record<string, any>;
  isPinned: boolean;
  modelUsed: string;
  messageCount: number;
  lastMessagePreview: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiChatMessage {
  id: string;
  threadId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  quote?: AiChatQuoteAttachment;
  attachments?: AiChatImageMeta[];
  modelName?: string;
  providerName?: string;
  variantUsed?: string;
  executionTimeMs?: number;
  finishReason?: string;
  createdAt: string;
}

export interface AiChatPreferences {
  userId: string;
  defaultPersona: AiChatPersonaId;
  responseStyle: AiChatResponseStyle;
  responseLanguage: AiChatLanguageMode;
  temperature: number;
  customInstructions: string;
  usePageContext: boolean;
  updatedAt: string;
}

export interface AiChatPersonaMeta {
  id: AiChatPersonaId;
  label: string;
  shortLabel: string;
  description: string;
  directive: string;
}

export interface SendAiChatMessageDto {
  threadId?: string;
  content: string;
  persona?: AiChatPersonaId;
  responseStyle?: AiChatResponseStyle;
  responseLanguage?: AiChatLanguageMode;
  temperature?: number;
  usePageContext?: boolean;
  context?: AiChatContextInput;
  quote?: AiChatQuoteAttachment;
  images?: AiChatImageInput[];
  keyId?: string;
  model?: string;
  variant?: string;
}

export interface EditAiChatMessageDto {
  content: string;
  persona?: AiChatPersonaId;
  responseStyle?: AiChatResponseStyle;
  responseLanguage?: AiChatLanguageMode;
  temperature?: number;
  usePageContext?: boolean;
  context?: AiChatContextInput;
  quote?: AiChatQuoteAttachment;
  keyId?: string;
  model?: string;
  variant?: string;
}

export interface RegenerateAiChatDto {
  persona?: AiChatPersonaId;
  responseStyle?: AiChatResponseStyle;
  responseLanguage?: AiChatLanguageMode;
  temperature?: number;
  usePageContext?: boolean;
  context?: AiChatContextInput;
  keyId?: string;
  model?: string;
  variant?: string;
}
