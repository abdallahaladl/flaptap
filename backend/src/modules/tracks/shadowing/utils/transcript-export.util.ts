import { HistoryItem } from '../../../../core/database/history.repository';
import {
  ExportOptions,
  ExportResult,
  TranscriptExportFormat,
  TranscriptSentence,
  TranscriptViewMode,
} from '../shadowing.types';
import { formatMsClock } from './word-alignment.util';

const FORMAT_META: Record<TranscriptExportFormat, { mimeType: string; extension: string }> = {
  txt: { mimeType: 'text/plain; charset=utf-8', extension: 'txt' },
  md: { mimeType: 'text/markdown; charset=utf-8', extension: 'md' },
  srt: { mimeType: 'application/x-subrip; charset=utf-8', extension: 'srt' },
  vtt: { mimeType: 'text/vtt; charset=utf-8', extension: 'vtt' },
  json: { mimeType: 'application/json; charset=utf-8', extension: 'json' },
  csv: { mimeType: 'text/csv; charset=utf-8', extension: 'csv' },
  html: { mimeType: 'text/html; charset=utf-8', extension: 'html' },
};

export const SUPPORTED_EXPORT_FORMATS: TranscriptExportFormat[] = [
  'txt',
  'md',
  'srt',
  'vtt',
  'json',
  'csv',
  'html',
];

export const SUPPORTED_VIEW_MODES: TranscriptViewMode[] = [
  'sentences',
  'paragraphs',
  'ideas',
  'speakers',
  'raw',
];

function slugifyFilename(title: string): string {
  const base = String(title || 'shadowing-lesson')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'shadowing-lesson';
}

function formatSrtTime(ms: number): string {
  const safe = Math.max(0, Math.round(Number(ms) || 0));
  const h = Math.floor(safe / 3600000);
  const m = Math.floor((safe % 3600000) / 60000);
  const s = Math.floor((safe % 60000) / 1000);
  const rem = safe % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(rem).padStart(3, '0')}`;
}

function formatVttTime(ms: number): string {
  return formatSrtTime(ms).replace(',', '.');
}

function escapeCsv(val: unknown): string {
  const str = String(val ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapeHtml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface ExportBlock {
  index: number;
  heading?: string;
  summary?: string;
  speaker?: string;
  startMs: number;
  endMs: number;
  text: string;
  rawText?: string;
  repaired?: boolean;
  repairNote?: string;
}

function resolveViewBlocks(lesson: HistoryItem, view: TranscriptViewMode): ExportBlock[] {
  const td = lesson.transcriptData;
  const raw = td?.raw;
  const reviewed = td?.reviewed;

  if (view === 'raw') {
    if (raw?.cues?.length) {
      return raw.cues.map((c, idx) => ({
        index: idx + 1,
        startMs: c.startMs,
        endMs: c.endMs,
        text: c.text,
        rawText: c.text,
        repaired: false,
      }));
    }
    if (raw?.sentences?.length) {
      return raw.sentences.map((s) => ({
        index: s.index,
        speaker: s.speaker,
        startMs: s.startMs,
        endMs: s.endMs,
        text: s.text,
        rawText: s.rawText,
        repaired: false,
      }));
    }
  }

  if (view === 'paragraphs') {
    if (reviewed?.paragraphs?.length) {
      return reviewed.paragraphs.map((p) => ({
        index: p.index,
        speaker: p.speaker,
        startMs: p.startMs,
        endMs: p.endMs,
        text: p.text,
      }));
    }
    if (raw?.paragraphs?.length) {
      return raw.paragraphs.map((p) => ({
        index: p.index,
        speaker: p.speaker,
        startMs: p.startMs,
        endMs: p.endMs,
        text: p.text,
      }));
    }
    return (lesson.chunks || []).map((c, idx) => ({
      index: idx + 1,
      speaker: c.speaker || lesson.creator || '',
      startMs: Math.round((Number(c.startSec) || 0) * 1000),
      endMs: Math.round((Number(c.endSec) || 0) * 1000),
      text: c.text,
    }));
  }

  if (view === 'ideas' && reviewed?.ideas?.length) {
    const byIndex = new Map<number, TranscriptSentence>();
    reviewed.sentences.forEach((s) => byIndex.set(s.index, s));
    return reviewed.ideas.map((idea) => ({
      index: idea.index,
      heading: idea.title,
      summary: idea.summary || idea.keyTakeaway || '',
      speaker: idea.speakers.join(', '),
      startMs: idea.startMs,
      endMs: idea.endMs,
      text: idea.sentenceIndices
        .map((i) => byIndex.get(i)?.text)
        .filter(Boolean)
        .join(' '),
    }));
  }

  if (view === 'speakers' && reviewed?.speakerTurns?.length) {
    return reviewed.speakerTurns.map((turn) => ({
      index: turn.index,
      speaker: turn.speaker,
      startMs: turn.startMs,
      endMs: turn.endMs,
      text: turn.text,
    }));
  }

  if (reviewed?.sentences?.length) {
    return reviewed.sentences.map((s) => ({
      index: s.index,
      speaker: s.speaker,
      startMs: s.startMs,
      endMs: s.endMs,
      text: s.text,
      rawText: s.rawText,
      repaired: s.repaired,
      repairNote: s.repairNote,
    }));
  }

  if (raw?.sentences?.length) {
    return raw.sentences.map((s) => ({
      index: s.index,
      speaker: s.speaker,
      startMs: s.startMs,
      endMs: s.endMs,
      text: s.text,
      rawText: s.rawText,
      repaired: false,
    }));
  }

  return (lesson.sentences || []).map((s) => ({
    index: s.index,
    speaker: s.speaker || lesson.creator || '',
    startMs: Number.isFinite(s.startMs) ? Number(s.startMs) : Math.round((Number(s.startSec) || 0) * 1000),
    endMs: Number.isFinite(s.endMs) ? Number(s.endMs) : Math.round((Number(s.endSec) || 0) * 1000),
    text: s.text,
    rawText: s.rawText || s.text,
    repaired: Boolean(s.repaired),
    repairNote: s.repairNote || '',
  }));
}

export function exportShadowingLesson(
  lesson: HistoryItem,
  options: ExportOptions,
): ExportResult {
  const view: TranscriptViewMode = SUPPORTED_VIEW_MODES.includes(options.view)
    ? options.view
    : 'sentences';
  const format: TranscriptExportFormat = SUPPORTED_EXPORT_FORMATS.includes(options.format)
    ? options.format
    : 'txt';
  const includeTimestamps = options.includeTimestamps !== false;
  const includeSpeakers = options.includeSpeakers !== false && view !== 'raw';
  const blocks = resolveViewBlocks(lesson, view);
  const meta = FORMAT_META[format];
  const filename = `${slugifyFilename(lesson.title)}-${view}.${meta.extension}`;
  const platform = lesson.platform || lesson.transcriptData?.platform || 'YouTube';
  const wordCount =
    lesson.transcriptData?.reviewed?.quality?.totalWords ||
    lesson.transcriptData?.raw?.words?.length ||
    lesson.stats?.totalWords ||
    0;

  let content = '';

  switch (format) {
    case 'json': {
      const payload =
        view === 'raw'
          ? {
              id: lesson.id,
              title: lesson.title,
              creator: lesson.creator,
              platform,
              sourceUrl: lesson.sourceUrl,
              durationSeconds: lesson.durationSeconds,
              view: 'raw',
              raw: lesson.transcriptData?.raw || { fullText: (lesson.sentences || []).map((s) => s.text).join(' '), sentences: blocks },
            }
          : {
              id: lesson.id,
              title: lesson.title,
              creator: lesson.creator,
              platform,
              sourceUrl: lesson.sourceUrl,
              durationSeconds: lesson.durationSeconds,
              view,
              reviewed: lesson.transcriptData?.reviewed || null,
              raw: lesson.transcriptData?.raw || null,
              sentences: lesson.sentences || [],
              chunks: lesson.chunks || [],
            };
      content = JSON.stringify(payload, null, 2);
      break;
    }

    case 'srt': {
      content =
        blocks
          .map((b, idx) => {
            const line =
              includeSpeakers && b.speaker && view === 'speakers'
                ? `${b.speaker}: ${b.text}`
                : b.text;
            return `${idx + 1}\n${formatSrtTime(b.startMs)} --> ${formatSrtTime(b.endMs)}\n${line}`;
          })
          .join('\n\n') + '\n';
      break;
    }

    case 'vtt': {
      const multiSpeaker = (lesson.transcriptData?.reviewed?.speakers?.length || 0) > 1;
      const body = blocks
        .map((b) => {
          const voiceTag =
            includeSpeakers && b.speaker && (view === 'speakers' || multiSpeaker)
              ? `<v ${b.speaker}>${b.text}`
              : b.text;
          return `${formatVttTime(b.startMs)} --> ${formatVttTime(b.endMs)}\n${voiceTag}`;
        })
        .join('\n\n');
      content = `WEBVTT\nKind: captions\nLanguage: en\n\n${body}\n`;
      break;
    }

    case 'csv': {
      const headers = ['Index', 'Speaker', 'Start', 'End', 'StartMs', 'EndMs', 'Heading', 'Text', 'RawText', 'Repaired'];
      const rows = blocks.map((b) =>
        [
          b.index,
          b.speaker || '',
          formatMsClock(b.startMs),
          formatMsClock(b.endMs),
          b.startMs,
          b.endMs,
          b.heading || '',
          b.text,
          b.rawText || '',
          b.repaired ? 'true' : 'false',
        ]
          .map(escapeCsv)
          .join(','),
      );
      content = [headers.join(','), ...rows].join('\n') + '\n';
      break;
    }

    case 'md': {
      const frontmatter = [
        '---',
        `title: "${String(lesson.title || '').replace(/"/g, '\\"')}"`,
        `creator: "${String(lesson.creator || '').replace(/"/g, '\\"')}"`,
        `platform: "${platform}"`,
        `source_url: "${lesson.sourceUrl || ''}"`,
        `view: "${view}"`,
        `words: ${wordCount}`,
        '---',
        '',
        `# ${lesson.title}`,
        '',
        `> **Creator:** ${lesson.creator || 'Unknown'} · **Platform:** ${platform} · **View:** ${view}`,
        '',
      ];
      const body = blocks.map((b) => {
        const ts = includeTimestamps ? `\`[${formatMsClock(b.startMs)}]\` ` : '';
        const spk = includeSpeakers && b.speaker ? `**${b.speaker}:** ` : '';
        if (view === 'ideas') {
          const lines = [`## ${b.index}. ${b.heading || `Idea ${b.index}`}`];
          if (includeTimestamps) lines.push(`*${formatMsClock(b.startMs)} – ${formatMsClock(b.endMs)}*`);
          if (b.summary) lines.push('', `> ${b.summary}`);
          lines.push('', b.text);
          return lines.join('\n');
        }
        return `${ts}${spk}${b.text}`;
      });
      content = frontmatter.join('\n') + body.join('\n\n') + '\n';
      break;
    }

    case 'html': {
      const itemsHtml = blocks
        .map((b) => {
          const ts = includeTimestamps
            ? `<span class="ts">${escapeHtml(formatMsClock(b.startMs))}</span>`
            : '';
          const spk =
            includeSpeakers && b.speaker
              ? `<span class="spk">${escapeHtml(b.speaker)}</span>`
              : '';
          const heading = b.heading ? `<h2>${b.index}. ${escapeHtml(b.heading)}</h2>` : '';
          const summary = b.summary ? `<p class="sum">${escapeHtml(b.summary)}</p>` : '';
          return `<article class="blk">${heading}${summary}<div class="meta">${ts}${spk}</div><p>${escapeHtml(b.text)}</p></article>`;
        })
        .join('\n');
      content = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(lesson.title)} (${escapeHtml(view)})</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif; max-width: 780px; margin: 40px auto; padding: 0 20px; background: #F5F5F7; color: #1D1D1F; line-height: 1.65; }
    header { border-bottom: 1.5px solid #D2D2D7; padding-bottom: 16px; margin-bottom: 28px; }
    h1 { margin: 0 0 6px; font-size: 26px; letter-spacing: -0.02em; }
    .sub { font-size: 13px; color: #6E6E73; }
    .blk { background: #FFFFFF; border: 1px solid #E5E5EA; border-radius: 12px; padding: 14px 18px; margin-bottom: 12px; }
    .meta { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; font-family: ui-monospace, "SF Mono", monospace; font-size: 12px; }
    .ts { color: #6E6E73; }
    .spk { font-family: -apple-system, sans-serif; font-weight: 600; background: #E8F2FF; color: #0071E3; padding: 1px 8px; border-radius: 99px; }
    .sum { font-style: italic; color: #48484A; margin: 4px 0 8px; }
    h2 { margin: 0 0 6px; font-size: 18px; }
    p { margin: 0; font-size: 16px; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(lesson.title)}</h1>
    <div class="sub">${escapeHtml(lesson.creator || platform)} · View: ${escapeHtml(view)} · ${wordCount} words</div>
  </header>
  ${itemsHtml}
</body>
</html>`;
      break;
    }

    case 'txt':
    default: {
      if (view === 'raw' && !includeTimestamps && lesson.transcriptData?.raw?.fullText) {
        content = `${lesson.transcriptData.raw.fullText}\n`;
        break;
      }
      const header = `${lesson.title}\n${lesson.creator ? `By ${lesson.creator} · ` : ''}${platform} · View: ${view}\n${'='.repeat(48)}\n\n`;
      const sep = view === 'sentences' ? '\n' : '\n\n';
      const lines = blocks.map((b) => {
        const ts = includeTimestamps ? `[${formatMsClock(b.startMs)}] ` : '';
        const spk = includeSpeakers && b.speaker ? `${b.speaker}: ` : '';
        if (view === 'ideas') {
          return `${b.index}. ${b.heading || `Idea ${b.index}`} ${includeTimestamps ? `[${formatMsClock(b.startMs)} - ${formatMsClock(b.endMs)}]` : ''}\n${b.summary ? `Summary: ${b.summary}\n` : ''}${b.text}`;
        }
        return `${ts}${spk}${b.text}`;
      });
      content = header + lines.join(sep) + '\n';
      break;
    }
  }

  return {
    content,
    mimeType: meta.mimeType,
    extension: meta.extension,
    filename,
  };
}
