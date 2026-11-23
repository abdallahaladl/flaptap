/* ==========================================================================
   FLAPTAP SHARED PHRASE & LINGUISTIC UTILITIES (phrase-utils.js)
   Single source of truth consumed by BOTH Anything to Phrases & Generate Phrases:
   - RTL language detection & bidi-safe slot/translation formatting
   - Verbatim-safe sentence highlighting (<mark class="lexicon-highlight">)
   - Reusable study progress state calculation
   - Shared SSE streaming consumer
   ========================================================================== */

(function (global) {
  'use strict';

  const RTL_LANG_CODES = new Set(['ar', 'fa', 'he', 'ur', 'ps', 'sd', 'ug', 'yi', 'ckb', 'dv']);

  const STUDY_STATE_LABELS = {
    new: 'Not started',
    progress: 'In progress',
    done: 'Completed',
  };

  function escapeHtml(value) {
    return global.FlaptapUtils
      ? global.FlaptapUtils.escapeHtml(value)
      : String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
  }

  function isRtlLanguage(code, languageList) {
    const clean = String(code || '').trim().toLowerCase().split(/[-_]/)[0];
    if (!clean) return false;
    if (Array.isArray(languageList)) {
      const found = languageList.find((l) => String(l?.code || '').toLowerCase() === clean);
      if (found && typeof found.rtl === 'boolean') return found.rtl;
    }
    return RTL_LANG_CODES.has(clean);
  }

  function computeStudyState({ total, done }) {
    const safeTotal = Math.max(0, Number(total) || 0);
    const safeDone = Math.max(0, Math.min(safeTotal, Number(done) || 0));
    const tone =
      safeTotal > 0 && safeDone >= safeTotal
        ? 'done'
        : safeDone > 0
          ? 'progress'
          : 'new';
    return {
      total: safeTotal,
      done: safeDone,
      remaining: Math.max(0, safeTotal - safeDone),
      tone,
      label: STUDY_STATE_LABELS[tone],
      pct: safeTotal > 0 ? Math.round((safeDone / safeTotal) * 100) : 0,
    };
  }

  /** Extract reusable [slot] names in appearance order (max 4). */
  function extractSlotNames(text) {
    const names = [];
    const source = String(text || '');
    const re = /\[([^[\]]{1,40})\]/g;
    let match;
    while ((match = re.exec(source))) {
      const name = match[1].replace(/\s+/g, ' ').trim();
      if (!name) continue;
      if (names.some((n) => n.toLowerCase() === name.toLowerCase())) continue;
      names.push(name);
      if (names.length >= 4) break;
    }
    return names;
  }

  /** "[doing X]" and "X" are the same slot; "[X]" and "[Y]" are not. */
  function slotNamesMatch(a, b) {
    const normalize = (value) =>
      String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const left = normalize(a);
    const right = normalize(b);
    if (!left || !right) return false;
    if (left === right) return true;
    const leftTokens = left.split(' ');
    const rightTokens = right.split(' ');
    if (leftTokens.length === 1 || rightTokens.length === 1) {
      return leftTokens[leftTokens.length - 1] === rightTokens[rightTokens.length - 1];
    }
    return left.includes(right) || right.includes(left);
  }

  /**
   * Render text wrapping reusable [slots] in bidi-isolated <bdi dir="ltr"> spans
   * so RTL Arabic sentences containing [X] / [Y] never scramble visual word order.
   */
  function formatSlotizedText(text, slotClass = 'll-slot') {
    const normalized = String(text || '').replace(/(\[[^[\]]{1,40}\])\s+([?!.,;:])/g, '$1$2');
    return escapeHtml(normalized).replace(/\[([^[\]]{1,40})\]/g, (_match, name) => {
      return `<bdi class="${escapeHtml(slotClass)}" dir="ltr">[${name}]</bdi>`;
    });
  }

  /**
   * Verbatim-safe sentence highlighter: wraps the first matching candidate
   * expression/surface in `<mark class="lexicon-highlight">`.
   */
  function highlightTermInSentence(sentence, candidates) {
    const text = String(sentence || '');
    if (!text) return '';
    const list = (Array.isArray(candidates) ? candidates : [candidates])
      .map((s) =>
        String(s || '')
          .replace(/\[[^[\]]*\]/g, ' ')
          .replace(/[?.!,;:]+$/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter((s) => s.length >= 2);

    for (const candidate of list) {
      const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]");
      let regex;
      try {
        regex = new RegExp(
          `(?<![\\p{L}\\p{N}_])(${escaped}(?:['’]?s|es|ed|d|ing|er|ers)?)(?![\\p{L}\\p{N}_])`,
          'giu',
        );
      } catch {
        continue;
      }
      const matches = Array.from(text.matchAll(regex));
      if (matches.length === 0) continue;

      let output = '';
      let lastIndex = 0;
      for (const match of matches) {
        const index = match.index ?? 0;
        output += escapeHtml(text.slice(lastIndex, index));
        output += `<mark class="lexicon-highlight">${escapeHtml(match[1])}</mark>`;
        lastIndex = index + match[0].length;
      }
      output += escapeHtml(text.slice(lastIndex));
      return output;
    }

    return escapeHtml(text);
  }

  /**
   * Render a clean RTL/LTR idiomatic sentence translation paragraph.
   * Preserves proper right-alignment for RTL languages and clean bidi isolation.
   */
  function renderQuoteTranslationHtml(translation, langCode, rtl, options = {}) {
    const clean = String(translation || '').trim();
    const className = options.className || 'ft-quote-translation';
    if (!clean) return '';
    const langAttr = escapeHtml(langCode || 'en');
    const dirAttr = rtl ? 'rtl' : 'ltr';
    const content = options.slotize ? formatSlotizedText(clean) : escapeHtml(clean);
    return `<p class="${escapeHtml(className)}" dir="${dirAttr}" lang="${langAttr}">${content}</p>`;
  }

  /**
   * Shared SSE stream reader used by both Anything to Phrases and Generate Phrases.
   * Parses `event:` / `data:` blocks incrementally and falls back cleanly if streaming
   * is unavailable.
   */
  async function consumeSseStream(url, options, onEvent) {
    const fetchOpts = Object.assign({ credentials: 'same-origin' }, options || {});
    const res = await fetch(url, fetchOpts);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const err = new Error(errBody?.message || `Request failed (${res.status})`);
      err.status = res.status;
      err.code = errBody?.code;
      throw err;
    }

    if (!res.body || !res.body.getReader) {
      const json = await res.json().catch(() => ({}));
      onEvent?.('complete', json);
      return json;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastComplete = null;

    const dispatchBlock = (block) => {
      const trimmed = block.trim();
      if (!trimmed) return;
      let eventName = 'message';
      const dataLines = [];
      for (const line of trimmed.split(/\r?\n/)) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }
      if (dataLines.length === 0) return;
      try {
        const parsed = JSON.parse(dataLines.join('\n'));
        if (eventName === 'complete') lastComplete = parsed;
        onEvent?.(eventName, parsed);
      } catch {
        // Ignore keepalive/comment frames
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';
      for (const block of blocks) {
        dispatchBlock(block);
      }
    }
    if (buffer.trim()) {
      dispatchBlock(buffer);
    }
    return lastComplete;
  }

  global.FlaptapPhraseUtils = {
    STUDY_STATE_LABELS,
    isRtlLanguage,
    computeStudyState,
    extractSlotNames,
    slotNamesMatch,
    formatSlotizedText,
    highlightTermInSentence,
    renderQuoteTranslationHtml,
    consumeSseStream,
  };
})(window);
