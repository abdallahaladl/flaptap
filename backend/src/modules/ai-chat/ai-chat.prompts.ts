import { formatTimestampMs } from '../../core/linguistics/segmentation';
import {
  AiChatContextType,
  AiChatLanguageMode,
  AiChatPersonaId,
  AiChatPersonaMeta,
  AiChatQuoteAttachment,
  AiChatResponseStyle,
} from './ai-chat.types';

export const AI_CHAT_PERSONAS: AiChatPersonaMeta[] = [
  {
    id: 'smart_mentor',
    label: 'Native Mentor',
    shortLabel: 'Mentor',
    description: 'Context-aware spoken American English coach for nuance, meaning, and natural thinking flow.',
    directive:
      'Act as an elite Native American English Thinking & Speaking Mentor. Explain *why* natives phrase ideas the way they do, unpack nuance/subtext/hedging/discourse markers, and offer 2-4 crisp spoken alternatives when helpful.',
  },
  {
    id: 'accent_coach',
    label: 'Pronunciation & Prosody',
    shortLabel: 'Accent',
    description: 'Deep connected speech, IPA, flap-T, reductions, stress, rhythm, and mouth mechanics.',
    directive:
      'Act as an American English Articulatory & Prosody Coach. Focus on connected speech (linking, elision, assimilation, flap-T, glottal stops), stressed vs. reduced syllables, IPA transcriptions, and exact tongue/lip/jaw mechanics.',
  },
  {
    id: 'natural_rewrite',
    label: 'Natural Rewriter',
    shortLabel: 'Rewrite',
    description: 'Rewrite textbook or stiff sentences into authentic casual, sharp, and executive American speech.',
    directive:
      'Act as a Native American Speech Editor. Compare stiff/textbook wording with how natives actually say it across registers: Casual Everyday, Sharp Conversational, and Polished Professional — explaining the exact vibe shift of each.',
  },
  {
    id: 'grammar_nuance',
    label: 'Grammar & Nuance',
    shortLabel: 'Nuance',
    description: 'Unpack tense choices, modals, phrasal verbs, conditionals, and subtle meaning shifts.',
    directive:
      'Act as a Practical English Nuance & Usage Specialist. Explain the real-world difference behind tense choices, aspect, modals, prepositions, and idioms using vivid spoken examples rather than dry textbook jargon.',
  },
  {
    id: 'roleplay',
    label: 'Roleplay Partner',
    shortLabel: 'Roleplay',
    description: 'Interactive back-and-forth conversational practice with gentle live native upgrades.',
    directive:
      'Act as a realistic American Conversation Partner. Stay in natural dialogue flow, respond concisely like a real person, and include a compact "Native Upgrade" tip at the end only when the learner makes an unnatural phrasing.',
  },
  {
    id: 'general',
    label: 'General Assistant',
    shortLabel: 'General',
    description: 'Full-capability fast AI assistant for any question, brainstorming, writing, or analysis.',
    directive:
      'Act as a sharp, versatile, world-class AI assistant. Answer any topic clearly, accurately, and directly, adapting cleanly to whatever the user asks while staying aware of their active workspace if relevant.',
  },
];

const PERSONA_MAP = new Map<AiChatPersonaId, AiChatPersonaMeta>(
  AI_CHAT_PERSONAS.map((p) => [p.id, p]),
);

export function getPersonaMeta(persona?: string): AiChatPersonaMeta {
  const key = String(persona || 'smart_mentor').trim().toLowerCase() as AiChatPersonaId;
  return PERSONA_MAP.get(key) || AI_CHAT_PERSONAS[0];
}

export function buildAiChatSystemPrompt(opts: {
  persona?: AiChatPersonaId | string;
  responseStyle?: AiChatResponseStyle | string;
  responseLanguage?: AiChatLanguageMode | string;
  customInstructions?: string;
  nativeLanguage?: string;
  contextType?: AiChatContextType | string;
}): string {
  const personaMeta = getPersonaMeta(opts.persona);
  const style = String(opts.responseStyle || 'balanced').toLowerCase();
  const langMode = String(opts.responseLanguage || 'auto').toLowerCase();
  const nativeLang = String(opts.nativeLanguage || 'ar').trim() || 'ar';
  const custom = String(opts.customInstructions || '').trim().slice(0, 1500);

  let styleRule =
    'LENGTH & STRUCTURE: Balanced, crisp, and scannable. Use short paragraphs, clean bullet points, and Markdown tables when comparing alternatives or nuances.';
  if (style === 'concise') {
    styleRule =
      'LENGTH & STRUCTURE: Ultra-concise and high-signal. Get straight to the punchline in 2-5 tight lines or bullets. Zero filler.';
  } else if (style === 'deep') {
    styleRule =
      'LENGTH & STRUCTURE: Comprehensive deep-dive. Cover nuance, real spoken reductions/IPA, register contrasts, common pitfalls, and memorable examples with clean headings.';
  }

  let languageRule = `LANGUAGE MATCHING: Answer in the exact language the user writes in. If they ask in Arabic (including Egyptian/colloquial Arabic or mixed Arabic + English), explain naturally in clear Arabic while keeping all English examples, IPA, and technical terms in Latin script. If they ask in English, respond in crisp natural English. (Reference native language: "${nativeLang}".)`;
  if (langMode === 'en') {
    languageRule =
      'LANGUAGE MODE: Respond strictly in natural, crisp English unless the user explicitly asks for a translation.';
  } else if (langMode === 'ar_en') {
    languageRule =
      'LANGUAGE MODE: Explain in clear, natural Arabic (or Egyptian Arabic if the user uses it), keeping all English phrases, examples, IPA, and technical terms in Latin script.';
  } else if (langMode === 'bilingual') {
    languageRule =
      'LANGUAGE MODE: Provide crisp English explanation alongside natural Arabic nuance/translation highlights so the learner gets both full immersion and crystal-clear meaning.';
  }

  const lines: string[] = [
    `You are Flaptap AI — an elite intelligence embedded across the learner's workspace.`,
    `PERSONA DIRECTIVE: ${personaMeta.directive}`,
    styleRule,
    languageRule,
    `ZERO FLUFF: Never open with robotic filler like "Great question!" or "Sure, I can help with that!". Start immediately with high-value substance.`,
    `CONTEXT GROUNDING: When <active_workspace_context> or <selected_excerpt> is attached to the user's message, ground your answer precisely in that material (quoting exact lines, timestamps like [01:24], speakers, or study items when helpful). If the user asks a general question unrelated to the page, answer it cleanly without forcing artificial ties.`,
  ];

  if (opts.contextType && opts.contextType !== 'general') {
    lines.push(`ACTIVE SURFACE: The user is currently inside Flaptap's "${opts.contextType}" workspace.`);
  }

  if (custom) {
    lines.push(`USER CUSTOM INSTRUCTIONS (ALWAYS HONOR):\n${custom}`);
  }

  return lines.join('\n\n');
}

export function formatClockFromMs(ms: number): string {
  const safe = Math.max(0, Math.round(Number(ms) || 0));
  return formatTimestampMs(safe / 1000);
}

export function buildContextPromptBlock(opts: {
  contextType: AiChatContextType;
  contextLabel?: string;
  serverSections?: string[];
  quote?: AiChatQuoteAttachment;
}): string {
  const blocks: string[] = [];

  if (opts.serverSections && opts.serverSections.length > 0) {
    blocks.push(
      `<active_workspace_context type="${opts.contextType}" label="${String(opts.contextLabel || '').replace(/"/g, "'")}">\n${opts.serverSections.join('\n\n')}\n</active_workspace_context>`,
    );
  }

  if (opts.quote?.text && opts.quote.text.trim()) {
    const q = opts.quote;
    const hasMs = Number.isFinite(Number(q.startMs)) && Number.isFinite(Number(q.endMs));
    const meta: string[] = [];
    if (q.speaker) meta.push(`Speaker: ${q.speaker}`);
    if (hasMs) meta.push(`Timestamp: [${formatClockFromMs(Number(q.startMs))} – ${formatClockFromMs(Number(q.endMs))}]`);
    if (q.sourceLabel) meta.push(`Source: ${q.sourceLabel}`);
    blocks.push(
      `<selected_excerpt>\n${meta.length ? `${meta.join('\n')}\n` : ''}Quote: "${q.text.trim()}"\n</selected_excerpt>`,
    );
  }

  return blocks.join('\n\n');
}

export function generateSmartThreadTitle(firstQuestion: string, contextLabel?: string): string {
  const cleanQ = String(firstQuestion || '')
    .replace(/\s+/g, ' ')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim();

  if (!cleanQ) {
    return contextLabel ? String(contextLabel).slice(0, 56) : 'New Chat';
  }

  const clipped = cleanQ.length > 52 ? `${cleanQ.slice(0, 49).trim()}…` : cleanQ;
  return clipped;
}
