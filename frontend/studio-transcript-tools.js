/* ==========================================================================
   FLAPTAP SHADOWING STUDIO — INTEGRATED TRANSCRIPT TOOLS ENGINE
   Powers millisecond word-timed rendering, 60fps O(log N) karaoke tracking,
   interactive scrub timeline, AI Verbatim Review SSE streaming, 4 Read views
   (Paragraphs | Ideas | Speakers | Raw Original), inline repair/overlap diff
   popovers, multi-speaker filter & persistent rename, inline title rename,
   live in-transcript search, and 7-format × 5-view export.
   ========================================================================== */

(function (global) {
  'use strict';

  const SPEAKER_PALETTE = [
    '#0071E3',
    '#AF52DE',
    '#34C759',
    '#FF9500',
    '#FF2D55',
    '#5AC8FA',
  ];

  const PLATFORM_LABELS = {
    youtube: 'YouTube',
    tiktok: 'TikTok',
    instagram: 'Instagram',
    twitter: 'X / Twitter',
    apple_podcasts: 'Apple Podcasts',
    podcast_rss: 'Podcast RSS',
    vimeo: 'Vimeo',
    soundcloud: 'SoundCloud',
    ted: 'TED',
    loom: 'Loom',
    direct_audio: 'Audio URL',
    direct_video: 'Video URL',
    uploaded_audio: 'Uploaded Audio',
    uploaded_video: 'Uploaded Video',
    other: 'Web Media',
  };

  function escapeHtml(val) {
    if (global.FlaptapUtils?.escapeHtml) return global.FlaptapUtils.escapeHtml(val);
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatClockMs(ms) {
    const safe = Math.max(0, Math.round(Number(ms) || 0));
    const hours = Math.floor(safe / 3600000);
    const mins = Math.floor((safe % 3600000) / 60000);
    const secs = Math.floor((safe % 60000) / 1000);
    const remMs = safe % 1000;
    const base = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(remMs).padStart(3, '0')}`;
    return hours > 0 ? `${String(hours).padStart(2, '0')}:${base}` : base;
  }

  function formatRangeMs(startMs, endMs) {
    return `${formatClockMs(startMs)} – ${formatClockMs(endMs)}`;
  }

  function formatPlatformLabel(platform) {
    return PLATFORM_LABELS[String(platform || '').toLowerCase()] || '';
  }

  function getSpeakersList(item) {
    const rev = item?.transcriptData?.reviewed;
    if (Array.isArray(rev?.speakers) && rev.speakers.length > 0) return rev.speakers;
    const seen = new Map();
    for (const s of item?.sentences || []) {
      if (s.speakerId) {
        const cur = seen.get(s.speakerId) || {
          id: s.speakerId,
          name: s.speaker || s.speakerName || s.speakerId,
          colorIndex: seen.size % SPEAKER_PALETTE.length,
          sentenceCount: 0,
        };
        cur.sentenceCount += 1;
        seen.set(s.speakerId, cur);
      }
    }
    return Array.from(seen.values());
  }

  function speakerColor(item, speakerId) {
    if (!speakerId) return SPEAKER_PALETTE[0];
    const speakers = getSpeakersList(item);
    const found = speakers.find((sp) => sp.id === speakerId);
    const idx = found && Number.isFinite(found.colorIndex) ? found.colorIndex : 0;
    return SPEAKER_PALETTE[Math.abs(idx) % SPEAKER_PALETTE.length];
  }

  function speakerName(item, speakerId, fallback) {
    if (!speakerId) return fallback || '';
    const speakers = getSpeakersList(item);
    const found = speakers.find((sp) => sp.id === speakerId);
    return found?.name || fallback || speakerId;
  }

  function decodeMinimalEntities(str) {
    if (!str || !str.includes('&')) return str;
    return str
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&');
  }

  /**
   * Decorates verbatim HTML (preserving `<mark class="hl-...">` AND exact `textContent`)
   * with millisecond word spans (`.clickable-word.studio-word`), repair underlines,
   * and live search highlight classes using a zero-DOM string pass.
   */
  function decorateTimedWordsHtml(verbatimHtml, sentence, opts = {}) {
    const words = Array.isArray(sentence?.words) ? sentence.words : [];
    const sentIndex = Number(sentence?.index) || 1;
    const showRepairs = opts.showRepairs !== false;
    const searchQuery = String(opts.searchQuery || '').trim().toLowerCase();

    let cursor = 0;
    const normWord = (s) =>
      String(s || '')
        .replace(/[\u2018\u2019]/g, "'")
        .toLowerCase()
        .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

    function splitTextPreservingLexicalTokens(rawText) {
      const out = [];
      const chunks = String(rawText || '').split(/(\s+)/);
      for (const chunk of chunks) {
        if (!chunk) continue;
        if (/^\s+$/.test(chunk)) {
          out.push(chunk);
          continue;
        }
        const m = chunk.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}](?:.*[\p{L}\p{N}])?)([^\p{L}\p{N}]*)$/u);
        if (m) {
          if (m[1]) out.push(m[1]);
          out.push(m[2]);
          if (m[3]) out.push(m[3]);
        } else {
          out.push(chunk);
        }
      }
      return out;
    }

    function matchTimedWord(token) {
      if (!words.length) return null;
      const nTok = normWord(token);
      if (!nTok) return null;
      // Advance past non-lexical symbol tokens (e.g., >>, [, ], --) that have empty normWord
      const maxAhead = Math.min(words.length, cursor + 8);
      for (let i = cursor; i < maxAhead; i++) {
        if (normWord(words[i].word) === nTok) {
          cursor = i + 1;
          return words[i];
        }
      }
      while (cursor < words.length && !normWord(words[cursor].word)) {
        cursor += 1;
      }
      if (cursor < words.length) {
        const w = words[cursor];
        cursor += 1;
        return w;
      }
      return null;
    }

    const sourceHtml = verbatimHtml || escapeHtml(sentence?.text || '');
    if (!sourceHtml) return '';

    const segments = sourceHtml.split(/(<[^>]+>)/g);
    let out = '';
    for (let sIdx = 0; sIdx < segments.length; sIdx++) {
      const seg = segments[sIdx];
      if (!seg) continue;
      if (seg.charCodeAt(0) === 60 && seg.charCodeAt(seg.length - 1) === 62) {
        out += seg;
        continue;
      }
      const text = decodeMinimalEntities(seg);
      if (!text.trim()) {
        out += escapeHtml(text);
        continue;
      }
      const parts = splitTextPreservingLexicalTokens(text);
      for (let pIdx = 0; pIdx < parts.length; pIdx++) {
        const part = parts[pIdx];
        if (!part) continue;
        if (/^[\p{L}\p{N}]/u.test(part)) {
          const matched = matchTimedWord(part);
          const rawOrig = matched?.rawWord || matched?.repairedFrom || '';
          const isRepaired = Boolean(showRepairs && (matched?.repaired || rawOrig));
          const isSearchHit = Boolean(searchQuery && part.toLowerCase().includes(searchQuery));
          let cls = 'clickable-word studio-word';
          if (matched) cls += ' has-word-timing';
          if (isRepaired) cls += ' is-repaired';
          if (isSearchHit) cls += ' is-search-hit';
          const escPart = escapeHtml(part);
          let attrs = `class="${cls}" data-word="${escPart}" data-sent-index="${sentIndex}"`;
          if (matched) {
            attrs += ` data-word-i="${matched.i}" data-start-ms="${Math.round(matched.startMs)}" data-end-ms="${Math.round(matched.endMs)}"`;
            if (rawOrig) {
              attrs += ` data-repaired-from="${escapeHtml(rawOrig)}"`;
            }
          }
          out += `<span ${attrs}>${escPart}</span>`;
        } else {
          out += escapeHtml(part);
        }
      }
    }
    return out;
  }

  /**
   * Renders plain timed words directly from a `TimedWordMs[]` array (used in Raw Original & Turns).
   */
  function renderWordTokensHtml(words, sentIndex, opts = {}) {
    const showRepairs = opts.showRepairs !== false;
    const searchQuery = String(opts.searchQuery || '').trim().toLowerCase();
    return (words || [])
      .map((w) => {
        const text = String(w.word || '');
        const rawOrig = w.rawWord || w.repairedFrom || '';
        const isRepaired = Boolean(showRepairs && (w.repaired || rawOrig));
        const isSearchHit = Boolean(searchQuery && text.toLowerCase().includes(searchQuery));
        const cls = ['clickable-word', 'studio-word', 'has-word-timing'];
        if (isRepaired) cls.push('is-repaired');
        if (isSearchHit) cls.push('is-search-hit');
        const repAttr = rawOrig ? ` data-repaired-from="${escapeHtml(rawOrig)}"` : '';
        return `<span class="${cls.join(' ')}" data-word="${escapeHtml(text)}" data-sent-index="${sentIndex}" data-word-i="${w.i}" data-start-ms="${Math.round(w.startMs)}" data-end-ms="${Math.round(w.endMs)}"${repAttr}>${escapeHtml(text)}</span>`;
      })
      .join(' ');
  }

  /** Binary search O(log N) for active millisecond word */
  function findWordAtTimeMs(words, timeMs) {
    if (!Array.isArray(words) || !words.length) return -1;
    let lo = 0;
    let hi = words.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const w = words[mid];
      if (timeMs < w.startMs) {
        hi = mid - 1;
      } else if (timeMs > w.endMs) {
        best = mid;
        lo = mid + 1;
      } else {
        // Only advance past an exact boundary tie once timeMs reaches/passes words[mid].endMs
        if (
          mid + 1 < words.length &&
          timeMs >= words[mid + 1].startMs &&
          words[mid].endMs <= timeMs
        ) {
          lo = mid + 1;
          best = mid;
          continue;
        }
        return mid;
      }
    }
    if (best >= 0) {
      const next = best + 1 < words.length ? words[best + 1] : null;
      const holdBudget = next ? Math.min(180, Math.max(0, next.startMs - words[best].endMs - 1)) : 200;
      if (timeMs - words[best].endMs <= holdBudget) {
        return best;
      }
    }
    return -1;
  }

  function getActiveWordStream(item, readView, mode) {
    if (!item) return [];
    if (mode === 'read' && readView === 'raw') {
      return item.transcriptData?.raw?.words || [];
    }
    const list = [];
    for (const s of item.sentences || []) {
      if (Array.isArray(s.words)) {
        for (const w of s.words) list.push(w);
      }
    }
    return list;
  }

  /* ========================================================================
     RENDERERS FOR READ SUB-VIEWS: IDEAS · SPEAKERS · RAW ORIGINAL
     ======================================================================== */

  function renderCopyBtn(text, cls = '') {
    if (global.FlaptapCopy?.buttonHtml) {
      return global.FlaptapCopy.buttonHtml(text, cls ? { className: cls } : undefined);
    }
    return `<button type="button" class="btn-secondary btn-xs ${cls}" data-copy-text="${escapeHtml(text)}">Copy</button>`;
  }

  function renderIdeasView(item, opts = {}) {
    const rev = item?.transcriptData?.reviewed;
    const ideas = Array.isArray(rev?.ideas) ? rev.ideas : [];
    const speakerFilter = opts.speakerFilter || 'all';
    const showRepairs = opts.showRepairs !== false;
    const searchQuery = opts.searchQuery || '';

    if (!rev || ideas.length === 0) {
      return `
        <div class="studio-review-prompt-card">
          <h3>Key Ideas &amp; Speaking Structure</h3>
          <p>Run <strong>AI Verbatim Review</strong> to group this transcript into thematic Ideas with takeaways, repair ASR typos while keeping wording verbatim, and separate speakers.</p>
          <button type="button" class="btn-vox btn-sm" data-trigger-ai-review>Run AI Verbatim Review</button>
        </div>
      `;
    }

    const sentByIdx = new Map((item.sentences || []).map((s) => [Number(s.index), s]));
    const cards = ideas
      .map((idea) => {
        const sents = (idea.sentenceIndices || [])
          .map((idx) => sentByIdx.get(Number(idx)))
          .filter(Boolean)
          .filter((s) => speakerFilter === 'all' || s.speakerId === speakerFilter);
        if (speakerFilter !== 'all' && sents.length === 0) return '';

        const copyPayload = [
          `${idea.title} (${formatRangeMs(idea.startMs, idea.endMs)})`,
          idea.summary || '',
          idea.keyTakeaway ? `Takeaway: ${idea.keyTakeaway}` : '',
          '',
          ...sents.map((s) => s.text),
        ]
          .filter(Boolean)
          .join('\n');

        const sentsHtml = sents
          .map((s) => {
            const spkHtml = s.speakerId
              ? `<span class="studio-spk-chip is-mini" style="--spk-color:${speakerColor(item, s.speakerId)}">${escapeHtml(speakerName(item, s.speakerId, s.speaker || s.speakerName))}</span>`
              : '';
            const wordsHtml = decorateTimedWordsHtml(s.highlightedHtml || escapeHtml(s.text), s, {
              showRepairs,
              searchQuery,
            });
            return `
              <div class="studio-idea-sent-row" data-sentence-index="${s.index}">
                <button type="button" class="sent-action-btn sent-icon-btn" data-play-sent="${s.index}" aria-label="Play sentence #${s.index}" title="Play sentence">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                </button>
                <div class="studio-idea-sent-body">${spkHtml}<span class="studio-idea-sent-text">${wordsHtml}</span></div>
              </div>
            `;
          })
          .join('');

        const ideaRangeKey = `${(idea.startMs / 1000).toFixed(3)}-${(idea.endMs / 1000).toFixed(3)}`;
        return `
          <article class="studio-idea-card" data-idea-index="${idea.index}" data-idea-sent-range="${ideaRangeKey}">
            <div class="studio-idea-head">
              <div class="studio-idea-title-group">
                <span class="studio-idea-num ltr-num">Idea ${idea.index}</span>
                <h3 class="studio-idea-title">${escapeHtml(idea.title)}</h3>
                <span class="sent-time-badge ltr-num">${escapeHtml(formatRangeMs(idea.startMs, idea.endMs))}</span>
              </div>
              <div class="studio-section-actions">
                <button type="button" class="btn-secondary btn-xs" data-play-range-start="${(idea.startMs / 1000).toFixed(3)}" data-play-range-end="${(idea.endMs / 1000).toFixed(3)}" data-play-range-key="${ideaRangeKey}" data-idle-label="Play Idea" data-play-range-label="Idea ${idea.index}">Play Idea</button>
                ${renderCopyBtn(copyPayload, 'sent-action-btn sent-icon-btn')}
              </div>
            </div>
            ${idea.summary ? `<p class="studio-idea-summary">${escapeHtml(idea.summary)}</p>` : ''}
            ${idea.keyTakeaway ? `<div class="studio-idea-takeaway"><strong>Takeaway:</strong> ${escapeHtml(idea.keyTakeaway)}</div>` : ''}
            <div class="studio-idea-sents">${sentsHtml}</div>
          </article>
        `;
      })
      .filter(Boolean)
      .join('');

    return cards || '<div class="studio-review-prompt-card"><p>No ideas match the active speaker filter.</p></div>';
  }

  function renderSpeakersView(item, opts = {}) {
    const rev = item?.transcriptData?.reviewed;
    const turns = Array.isArray(rev?.speakerTurns) ? rev.speakerTurns : [];
    const speakerFilter = opts.speakerFilter || 'all';
    const showRepairs = opts.showRepairs !== false;
    const searchQuery = opts.searchQuery || '';

    if (!rev || turns.length === 0) {
      return `
        <div class="studio-review-prompt-card">
          <h3>Speaker Dialogue Turns</h3>
          <p>Run <strong>AI Verbatim Review</strong> to detect speakers, separate simultaneous overlapping speech into distinct turns, and enable persistent speaker renaming.</p>
          <button type="button" class="btn-vox btn-sm" data-trigger-ai-review>Run AI Verbatim Review</button>
        </div>
      `;
    }

    const sentByIdx = new Map((item.sentences || []).map((s) => [Number(s.index), s]));
    const cards = turns
      .filter((t) => speakerFilter === 'all' || t.speakerId === speakerFilter)
      .map((turn) => {
        const color = speakerColor(item, turn.speakerId);
        const name = speakerName(item, turn.speakerId, turn.speaker || turn.speakerName);
        const sents = (turn.sentenceIndices || [])
          .map((idx) => sentByIdx.get(Number(idx)))
          .filter(Boolean);
        const bodyHtml = sents.length
          ? sents
              .map((s) =>
                decorateTimedWordsHtml(s.highlightedHtml || escapeHtml(s.text), s, {
                  showRepairs,
                  searchQuery,
                }),
              )
              .join(' ')
          : escapeHtml(turn.text || '');

        const overlapBadge = turn.isOverlap || turn.hasOverlap
          ? `<span class="studio-overlap-pill" data-info-kind="overlap" data-sent-idx="${sents[0]?.index || 0}" tabindex="0" title="Overlapping speech separated">Overlap</span>`
          : '';

        const copyPayload = `[${formatClockMs(turn.startMs)}] ${name}: ${turn.text || sents.map((s) => s.text).join(' ')}`;

        const turnRangeKey = `${(turn.startMs / 1000).toFixed(3)}-${(turn.endMs / 1000).toFixed(3)}`;
        const turnSentsAttr = Array.isArray(turn.sentenceIndices) ? turn.sentenceIndices.join(',') : '';
        return `
          <article class="studio-turn-card" style="--spk-color:${color}" data-turn-index="${turn.index}" data-turn-sents="${escapeHtml(turnSentsAttr)}">
            <div class="studio-turn-head">
              <div class="studio-turn-meta">
                <span class="studio-spk-chip" style="--spk-color:${color}">${escapeHtml(name)}</span>
                <span class="sent-time-badge ltr-num">${escapeHtml(formatRangeMs(turn.startMs, turn.endMs))}</span>
                ${overlapBadge}
              </div>
              <div class="studio-section-actions">
                <button type="button" class="btn-secondary btn-xs" data-play-range-start="${(turn.startMs / 1000).toFixed(3)}" data-play-range-end="${(turn.endMs / 1000).toFixed(3)}" data-play-range-key="${turnRangeKey}" data-idle-label="Play Turn" data-play-range-label="${escapeHtml(name)}">Play Turn</button>
                ${renderCopyBtn(copyPayload, 'sent-action-btn sent-icon-btn')}
              </div>
            </div>
            <p class="studio-turn-prose">${bodyHtml}</p>
          </article>
        `;
      })
      .join('');

    return cards || '<div class="studio-review-prompt-card"><p>No speaker turns match the active filter.</p></div>';
  }

  function renderRawView(item, opts = {}) {
    const raw = item?.transcriptData?.raw;
    const searchQuery = opts.searchQuery || '';

    if (!raw || !Array.isArray(raw.sentences) || raw.sentences.length === 0) {
      const fallbackSents = item?.sentences || [];
      if (!fallbackSents.length) {
        return '<div class="studio-review-prompt-card"><p>No raw transcript snapshot is available for this lesson.</p></div>';
      }
      return `
        <div class="studio-raw-banner">
          <div><strong>Verbatim Transcript</strong> · ${fallbackSents.length} lines</div>
        </div>
        ${fallbackSents
          .map(
            (s) => `
          <div class="studio-raw-row" data-sentence-index="${s.index}">
            <div class="studio-raw-row-head">
              <span class="sent-time-badge ltr-num">${escapeHtml(s.timeRange || formatRangeMs(s.startSec * 1000, s.endSec * 1000))}</span>
              <div class="studio-section-actions">
                <button type="button" class="btn-secondary btn-xs" data-play-sent="${s.index}">Play</button>
                ${renderCopyBtn(s.text, 'sent-action-btn sent-icon-btn')}
              </div>
            </div>
            <p class="studio-raw-text">${decorateTimedWordsHtml(escapeHtml(s.text), s, { showRepairs: false, searchQuery })}</p>
          </div>
        `,
          )
          .join('')}
      `;
    }

    const totalWords = Array.isArray(raw.words) ? raw.words.length : 0;
    const provider = raw.provider || raw.sourceProvider || 'asr';

    const rowsHtml = raw.sentences
      .map((s) => {
        const textHtml = Array.isArray(s.words) && s.words.length
          ? renderWordTokensHtml(s.words, s.index, { showRepairs: false, searchQuery })
          : escapeHtml(s.text || '');
        return `
          <div class="studio-raw-row" data-raw-index="${s.index}">
            <div class="studio-raw-row-head">
              <span class="sent-index-num ltr-num">#${String(s.index).padStart(2, '0')}</span>
              <span class="sent-time-badge ltr-num">${escapeHtml(formatRangeMs(s.startMs, s.endMs))}</span>
              <div class="studio-section-actions">
                <button type="button" class="btn-secondary btn-xs" data-play-range-start="${(s.startMs / 1000).toFixed(3)}" data-play-range-end="${(s.endMs / 1000).toFixed(3)}" data-play-range-label="Raw #${s.index}">Play</button>
                ${renderCopyBtn(s.text, 'sent-action-btn sent-icon-btn')}
              </div>
            </div>
            <p class="studio-raw-text">${textHtml}</p>
          </div>
        `;
      })
      .join('');

    return `
      <div class="studio-raw-banner">
        <div>
          <strong>Untouched Raw Original</strong>
          <span class="studio-raw-meta">Source: ${escapeHtml(provider)} · ${totalWords.toLocaleString()} words · Preserved verbatim without AI edits</span>
        </div>
        ${renderCopyBtn(raw.fullText || raw.sentences.map((s) => s.text).join(' '), 'btn-secondary btn-xs')}
      </div>
      <div class="studio-raw-list">${rowsHtml}</div>
    `;
  }

  /* ========================================================================
     SPEAKER FILTER & PERSISTENT INLINE SPEAKER RENAME BAR
     ======================================================================== */

  function renderSpeakerBarHtml(item, state) {
    const speakers = getSpeakersList(item);
    const hasMulti = speakers.length > 1;
    if (!hasMulti && !state.speakerEditorOpen) return '';

    const chips = speakers
      .map((sp) => {
        const active = state.speakerFilter === sp.id;
        const color = SPEAKER_PALETTE[Math.abs(sp.colorIndex || 0) % SPEAKER_PALETTE.length];
        return `
          <button type="button" class="studio-spk-filter-pill${active ? ' active' : ''}" data-spk-filter="${escapeHtml(sp.id)}" style="--spk-color:${color}" aria-pressed="${active ? 'true' : 'false'}">
            <span class="spk-dot" aria-hidden="true"></span>
            <span>${escapeHtml(sp.name)}</span>
            <span class="spk-cnt ltr-num">${sp.sentenceCount || 0}</span>
          </button>
        `;
      })
      .join('');

    const editorHtml = state.speakerEditorOpen
      ? `
        <form id="studio-speaker-rename-form" class="studio-spk-rename-form">
          ${speakers
            .map((sp) => {
              const color = SPEAKER_PALETTE[Math.abs(sp.colorIndex || 0) % SPEAKER_PALETTE.length];
              return `
                <label class="studio-spk-rename-row" style="--spk-color:${color}">
                  <span class="spk-dot" aria-hidden="true"></span>
                  <input type="text" class="studio-spk-rename-input" data-spk-rename-id="${escapeHtml(sp.id)}" value="${escapeHtml(sp.name)}" maxlength="48" aria-label="Rename ${escapeHtml(sp.name)}" />
                </label>
              `;
            })
            .join('')}
          <div class="studio-spk-rename-actions">
            <button type="submit" class="btn-vox btn-xs">Save Names</button>
            <button type="button" class="btn-secondary btn-xs" id="studio-spk-rename-cancel">Cancel</button>
          </div>
        </form>
      `
      : '';

    return `
      <div class="studio-spk-chips-row">
        ${
          hasMulti
            ? `<button type="button" class="studio-spk-filter-pill${state.speakerFilter === 'all' ? ' active' : ''}" data-spk-filter="all" aria-pressed="${state.speakerFilter === 'all' ? 'true' : 'false'}">All Speakers</button>${chips}`
            : ''
        }
        <button type="button" class="studio-tool-pill" id="studio-spk-rename-toggle">${state.speakerEditorOpen ? 'Close Rename' : 'Rename Speakers'}</button>
      </div>
      ${editorHtml}
    `;
  }

  /* ========================================================================
     REPAIR & OVERLAP RICH DIFF POPOVER
     ======================================================================== */

  function buildInfoPopoverHtml(item, kind, sentIdx, wordObj) {
    const sent = (item?.sentences || []).find((s) => Number(s.index) === Number(sentIdx));
    if (kind === 'word-repair' && wordObj) {
      const reason = sent?.repairNote || 'Corrected ASR recognition error while preserving verbatim speech.';
      return `
        <div class="info-pop-kicker">ASR Word Repair</div>
        <div class="info-pop-diff">
          <span class="diff-old">${escapeHtml(wordObj.repairedFrom)}</span>
          <span class="diff-arrow" aria-hidden="true">→</span>
          <span class="diff-new">${escapeHtml(wordObj.word)}</span>
        </div>
        <p class="info-pop-reason">${escapeHtml(reason)}</p>
      `;
    }

    if (kind === 'overlap') {
      return `
        <div class="info-pop-kicker">Simultaneous Overlapping Speech</div>
        <p class="info-pop-reason">Two speakers talked at the same time in this interval. AI Verbatim Review separated each speaker into their own millisecond-aligned turn.</p>
      `;
    }

    if (kind === 'interrupted') {
      return `
        <div class="info-pop-kicker">Interrupted / Cut-Off Utterance</div>
        <p class="info-pop-reason">This speaker was interrupted mid-sentence in real conversation. It is kept verbatim as a cut-off turn (—) rather than pretending it is a complete grammatical sentence.</p>
      `;
    }

    const repairedWords = (sent?.words || []).filter((w) => w.repaired || w.rawWord);
    if (repairedWords.length > 0) {
      return `
        <div class="info-pop-kicker">${repairedWords.length} ASR Repair${repairedWords.length === 1 ? '' : 's'} in Line #${sentIdx}</div>
        <div class="info-pop-list">
          ${repairedWords
            .map(
              (w) => `
            <div class="info-pop-item">
              <div class="info-pop-diff">
                <span class="diff-old">${escapeHtml(w.rawWord || '')}</span>
                <span class="diff-arrow" aria-hidden="true">→</span>
                <span class="diff-new">${escapeHtml(w.word)}</span>
              </div>
            </div>
          `,
            )
            .join('')}
        </div>
        ${sent?.repairNote ? `<p class="info-pop-reason" style="margin-top:6px;">${escapeHtml(sent.repairNote)}</p>` : ''}
      `;
    }
    if (sent?.rawText && sent.rawText !== sent.text) {
      return `
        <div class="info-pop-kicker">ASR Line Repair (#${sentIdx})</div>
        <div class="info-pop-diff">
          <span class="diff-old">${escapeHtml(sent.rawText)}</span>
          <span class="diff-arrow" aria-hidden="true">→</span>
          <span class="diff-new">${escapeHtml(sent.text)}</span>
        </div>
        ${sent.repairNote ? `<p class="info-pop-reason">${escapeHtml(sent.repairNote)}</p>` : ''}
      `;
    }
    return '<div class="info-pop-kicker">AI Verbatim Review</div><p class="info-pop-reason">Punctuation and speaker timing verified.</p>';
  }

  /* ========================================================================
     SSE STREAMING AI VERBATIM REVIEW
     ======================================================================== */

  async function streamReviewLesson({ lessonId, opts = {}, headers = {}, signal, onProgress }) {
    const res = await fetch(`/api/tracks/media-hub/${encodeURIComponent(lessonId)}/review/stream`, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      body: JSON.stringify({
        keyId: opts.keyId || undefined,
        model: opts.model || undefined,
        variant: opts.variant || undefined,
        force: Boolean(opts.force),
      }),
      credentials: 'same-origin',
      signal,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || errData.error || `Review failed (${res.status})`);
    }

    const reader = res.body?.getReader?.();
    if (!reader) {
      throw new Error('Streaming response body unavailable.');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let finalLesson = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) {
        const lines = frame.split('\n');
        let evName = 'message';
        let dataLine = '';
        for (const line of lines) {
          if (line.startsWith('event:')) evName = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
        }
        if (!dataLine) continue;
        let parsed = null;
        try {
          parsed = JSON.parse(dataLine);
        } catch {
          continue;
        }
        if (evName === 'progress') {
          if (typeof onProgress === 'function') onProgress(parsed);
        } else if (evName === 'done') {
          finalLesson = parsed?.data || null;
        } else if (evName === 'error') {
          throw new Error(parsed?.message || 'AI Verbatim Review failed.');
        }
      }
    }

    if (!finalLesson) {
      throw new Error('Review stream closed before returning the updated lesson.');
    }
    return finalLesson;
  }

  /* ========================================================================
     ACTIVE VIEW TEXT BUILDER (FOR CLIPBOARD COPY)
     ======================================================================== */

  function buildActiveViewPlainText(item, mode, readView) {
    if (!item) return '';
    if (mode === 'read' && readView === 'raw') {
      return item.transcriptData?.raw?.fullText || (item.sentences || []).map((s) => s.text).join(' ');
    }
    if (mode === 'read' && readView === 'ideas' && item.transcriptData?.reviewed?.ideas?.length) {
      const sentMap = new Map((item.sentences || []).map((s) => [Number(s.index), s]));
      return item.transcriptData.reviewed.ideas
        .map((idea) => {
          const body = (idea.sentenceIndices || [])
            .map((i) => sentMap.get(Number(i))?.text)
            .filter(Boolean)
            .join(' ');
          return `## ${idea.index}. ${idea.title} (${formatRangeMs(idea.startMs, idea.endMs)})\n${idea.summary || ''}\n${body}`;
        })
        .join('\n\n');
    }
    if (mode === 'read' && readView === 'speakers' && item.transcriptData?.reviewed?.speakerTurns?.length) {
      return item.transcriptData.reviewed.speakerTurns
        .map((t) => `[${formatClockMs(t.startMs)}] ${speakerName(item, t.speakerId, t.speaker || t.speakerName)}: ${t.text}`)
        .join('\n\n');
    }
    if (mode === 'read') {
      const flowParas = global.FlaptapStudioReaderFlow?.getParagraphs?.(item, { source: 'reviewed' });
      if (Array.isArray(flowParas) && flowParas.length) {
        return flowParas.map((p) => `[${p.timeRange || ''}] ${p.text}`).join('\n\n');
      }
      if (Array.isArray(item.chunks) && item.chunks.length) {
        return item.chunks.map((c) => `[${c.timeRange || ''}] ${c.text}`).join('\n\n');
      }
    }
    return (item.sentences || [])
      .map((s) => {
        const spk = s.speakerId ? `${speakerName(item, s.speakerId, s.speaker || s.speakerName)}: ` : '';
        return `[${s.timeRange || ''}] ${spk}${s.text}`;
      })
      .join('\n');
  }

  global.FlaptapStudioTranscriptTools = {
    SPEAKER_PALETTE,
    formatClockMs,
    formatRangeMs,
    formatPlatformLabel,
    getSpeakersList,
    speakerColor,
    speakerName,
    decorateTimedWordsHtml,
    renderWordTokensHtml,
    findWordAtTimeMs,
    getActiveWordStream,
    renderIdeasView,
    renderSpeakersView,
    renderRawView,
    renderSpeakerBarHtml,
    buildInfoPopoverHtml,
    streamReviewLesson,
    buildActiveViewPlainText,
  };
})(window);
