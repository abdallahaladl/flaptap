/* ==========================================================================
   FLAPTAP AI CHAT — XSS-PROOF MARKDOWN RENDERER (frontend/ai-chat/markdown.js)
   Renders headings, fenced code blocks with copy button, tables, lists,
   blockquotes, inline formatting, RTL/LTR auto-direction, and clickable
   Studio timestamps like [01:24] or [01:24.300].
   ========================================================================== */

(function (global) {
  'use strict';

  function escapeHtml(val) {
    if (global.FlaptapUtils?.escapeHtml) return global.FlaptapUtils.escapeHtml(val);
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatInline(raw, options = {}) {
    const codeTokens = [];
    let text = String(raw || '').replace(/`([^`]+)`/g, (_m, code) => {
      const idx = codeTokens.length;
      codeTokens.push(`<code>${escapeHtml(code)}</code>`);
      return `\u0000CODE${idx}\u0000`;
    });

    text = escapeHtml(text);

    // Markdown links [label](https://...)
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });

    // Clickable timestamps like [01:24] or [01:24.350] when Studio timestamp seeking is supported
    if (options.enableTimestampPills) {
      text = text.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)\]/g, (_m, ts) => {
        return `<button type="button" class="ft-ai-ts-pill ltr-num" data-ai-seek-ts="${ts}" title="Jump to ${ts}">${ts}</button>`;
      });
    }

    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    text = text.replace(/(^|[\s(>])\*([^*\n]+)\*(?=[\s).,!?:;<]|$)/g, '$1<em>$2</em>');

    text = text.replace(/\u0000CODE(\d+)\u0000/g, (_m, idx) => codeTokens[Number(idx)] || '');
    return text;
  }

  function splitTableRow(line) {
    return line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
  }

  function isTableSeparator(line) {
    const clean = line.trim();
    if (!clean.includes('|')) return false;
    return /^\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/.test(clean);
  }

  function renderMarkdown(raw, options = {}) {
    const src = String(raw || '').replace(/\r\n/g, '\n').trim();
    if (!src) return '';

    const lines = src.split('\n');
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        i++;
        continue;
      }

      // Fenced code block ```lang
      const fenceMatch = trimmed.match(/^```([a-zA-Z0-9_-]*)\s*$/);
      if (fenceMatch) {
        const lang = (fenceMatch[1] || 'text').toLowerCase();
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length && lines[i].trim().startsWith('```')) i++;
        const codeText = codeLines.join('\n');
        blocks.push(`
          <div class="ft-ai-code-block" dir="ltr">
            <div class="ft-ai-code-head">
              <span class="ft-ai-code-lang">${escapeHtml(lang || 'code')}</span>
              <button type="button" class="ft-ai-code-copy" data-ai-copy-code="1" title="Copy code">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <span>Copy</span>
              </button>
            </div>
            <pre><code>${escapeHtml(codeText)}</code></pre>
          </div>
        `);
        continue;
      }

      // Markdown table
      if (
        trimmed.includes('|') &&
        i + 1 < lines.length &&
        isTableSeparator(lines[i + 1])
      ) {
        const headers = splitTableRow(trimmed);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim().includes('|') && !isTableSeparator(lines[i])) {
          rows.push(splitTableRow(lines[i]));
          i++;
        }
        const thHtml = headers.map((h) => `<th dir="auto">${formatInline(h, options)}</th>`).join('');
        const bodyHtml = rows
          .map(
            (row) =>
              `<tr>${headers
                .map((_, colIdx) => `<td dir="auto">${formatInline(row[colIdx] || '', options)}</td>`)
                .join('')}</tr>`,
          )
          .join('');
        blocks.push(
          `<div class="ft-ai-table-wrap"><table><thead><tr>${thHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`,
        );
        continue;
      }

      // Horizontal rule
      if (/^([-*_])\1{2,}$/.test(trimmed)) {
        blocks.push('<hr class="ft-ai-hr" />');
        i++;
        continue;
      }

      // Headings
      const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (hMatch) {
        const level = Math.min(4, Math.max(2, hMatch[1].length + 1));
        blocks.push(`<h${level} dir="auto">${formatInline(hMatch[2], options)}</h${level}>`);
        i++;
        continue;
      }

      // Blockquote
      if (/^>\s?/.test(trimmed)) {
        const quoteLines = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        blocks.push(
          `<blockquote dir="auto">${quoteLines.map((q) => formatInline(q, options)).join('<br/>')}</blockquote>`,
        );
        continue;
      }

      // Unordered list
      if (/^[-*•]\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
          items.push(
            `<li dir="auto">${formatInline(lines[i].trim().replace(/^[-*•]\s+/, ''), options)}</li>`,
          );
          i++;
        }
        blocks.push(`<ul dir="auto">${items.join('')}</ul>`);
        continue;
      }

      // Ordered list
      if (/^\d+[.)]\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
          items.push(
            `<li dir="auto">${formatInline(lines[i].trim().replace(/^\d+[.)]\s+/, ''), options)}</li>`,
          );
          i++;
        }
        blocks.push(`<ol dir="auto">${items.join('')}</ol>`);
        continue;
      }

      // Paragraph (coalesce contiguous plain lines)
      const paraLines = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^(#{1,4}\s+|>\s?|[-*•]\s+|\d+[.)]\s+|```|([-*_])\1{2,}$)/.test(lines[i].trim()) &&
        !(lines[i].trim().includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
      ) {
        paraLines.push(lines[i].trim());
        i++;
      }
      if (paraLines.length > 0) {
        blocks.push(`<p dir="auto">${paraLines.map((p) => formatInline(p, options)).join('<br/>')}</p>`);
      }
    }

    return blocks.join('');
  }

  global.FlaptapAiChatMarkdown = {
    render: renderMarkdown,
    escapeHtml,
  };
})(window);
