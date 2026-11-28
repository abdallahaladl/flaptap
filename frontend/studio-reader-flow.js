/* ==========================================================================
   FLAPTAP SHADOWING STUDIO — CONTINUOUS READER FLOW & READING BOOKMARK ENGINE
   Renders unbroken canonical sentences as natural book-like prose in Read mode
   (AI Cleaned & Original Raw), manages SQLite-persisted "Where I Left Off"
   reading bookmarks, and resolves exact millisecond spans for text selections.
   ========================================================================== */

(function (global) {
  'use strict';

  const BOOKMARK_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path></svg>';
  const BOOKMARK_FILLED_SVG =
    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path></svg>';

  const state = {
    lessonId: '',
    bookmark: null,
    savingBookmark: false,
    apiFetch: null,
    showToast: null,
    switchReadView: null,
    autoScrolledLessonId: '',
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

  function configure(handlers = {}) {
    if (typeof handlers.apiFetch === 'function') state.apiFetch = handlers.apiFetch;
    if (typeof handlers.showToast === 'function') state.showToast = handlers.showToast;
    if (typeof handlers.switchReadView === 'function') state.switchReadView = handlers.switchReadView;
  }

  function storageKey(lessonId) {
    return `flaptap_read_bookmark_${lessonId}`;
  }

  function loadLocalBookmark(lessonId) {
    if (!lessonId) return null;
    try {
      const raw = localStorage.getItem(storageKey(lessonId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && Number.isFinite(Number(parsed.sentenceIndex)) && Number(parsed.sentenceIndex) >= 1) {
        return {
          sentenceIndex: Math.floor(Number(parsed.sentenceIndex)),
          startMs: Math.max(0, Math.round(Number(parsed.startMs) || 0)),
          view: parsed.view === 'raw' ? 'raw' : 'reviewed',
          excerpt: String(parsed.excerpt || ''),
          updatedAt: String(parsed.updatedAt || ''),
        };
      }
    } catch {}
    return null;
  }

  function saveLocalBookmark(lessonId, bookmark) {
    if (!lessonId) return;
    try {
      if (!bookmark) localStorage.removeItem(storageKey(lessonId));
      else localStorage.setItem(storageKey(lessonId), JSON.stringify(bookmark));
    } catch {}
  }

  function getCanonicalSentences(item, source = 'reviewed') {
    if (!item) return [];
    const td = item.transcriptData;
    if (source === 'raw') {
      const rawCanon = td?.raw?.canonicalSentences;
      if (Array.isArray(rawCanon) && rawCanon.length > 0) return rawCanon;
      const rawSents = td?.raw?.sentences;
      if (Array.isArray(rawSents) && rawSents.length > 0) return rawSents;
      return Array.isArray(item.sentences) ? item.sentences : [];
    }

    const revCanon = td?.reviewed?.canonicalSentences;
    if (Array.isArray(revCanon) && revCanon.length > 0) return revCanon;
    const revSents = td?.reviewed?.sentences;
    if (Array.isArray(revSents) && revSents.length > 0) return revSents;
    const rawCanon = td?.raw?.canonicalSentences;
    if (Array.isArray(rawCanon) && rawCanon.length > 0) return rawCanon;
    return Array.isArray(item.sentences) ? item.sentences : [];
  }

  function sentenceStartMs(s) {
    if (Number.isFinite(Number(s?.startMs))) return Math.max(0, Math.round(Number(s.startMs)));
    if (Array.isArray(s?.words) && s.words.length > 0 && Number.isFinite(Number(s.words[0].startMs))) {
      return Math.max(0, Math.round(Number(s.words[0].startMs)));
    }
    return Math.max(0, Math.round((Number(s?.startSec) || 0) * 1000));
  }

  function sentenceEndMs(s) {
    const start = sentenceStartMs(s);
    if (Number.isFinite(Number(s?.endMs))) return Math.max(start + 80, Math.round(Number(s.endMs)));
    if (Array.isArray(s?.words) && s.words.length > 0) {
      const last = s.words[s.words.length - 1];
      if (Number.isFinite(Number(last?.endMs))) return Math.max(start + 80, Math.round(Number(last.endMs)));
    }
    return Math.max(start + 80, Math.round((Number(s?.endSec) || 0) * 1000));
  }

  function wordCountOf(s) {
    if (Array.isArray(s?.words) && s.words.length > 0) return s.words.length;
    return String(s?.text || '').trim().split(/\s+/).filter(Boolean).length;
  }

  /**
   * Groups canonical sentences into natural, readable book-like paragraphs.
   * Respects speaker switches and AI paragraph boundaries while preventing
   * overly dense walls of text or tiny single-line fragments.
   */
  function groupCanonicalParagraphs(sentences, item, source = 'reviewed') {
    const list = Array.isArray(sentences) ? sentences : [];
    if (list.length === 0) return [];

    const hasExplicitParas =
      source === 'reviewed' &&
      Boolean(item?.transcriptData?.reviewed) &&
      list.some((s) => Number(s.paragraphIndex) > 0);

    const groups = [];
    let curr = [];
    let currWords = 0;
    let currKey = '';

    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const prev = curr[curr.length - 1];
      const wc = wordCountOf(s);
      const spkId = s.speakerId || 'spk_1';

      if (hasExplicitParas) {
        const key = `${s.paragraphIndex || 1}::${spkId}`;
        const tooLong = curr.length >= 6 || (curr.length >= 3 && currWords + wc > 130);
        if (curr.length > 0 && (key !== currKey || tooLong)) {
          groups.push(curr);
          curr = [];
          currWords = 0;
        }
        currKey = key;
      } else {
        const speakerChanged = prev && (prev.speakerId || 'spk_1') !== spkId;
        const gapMs = prev ? sentenceStartMs(s) - sentenceEndMs(prev) : 0;
        const pauseBreak = curr.length >= 2 && gapMs >= 950;
        const lengthBreak = curr.length >= 5 || (curr.length >= 3 && currWords + wc > 95);
        if (curr.length > 0 && (speakerChanged || pauseBreak || lengthBreak)) {
          groups.push(curr);
          curr = [];
          currWords = 0;
        }
      }

      curr.push(s);
      currWords += wc;
    }
    if (curr.length > 0) groups.push(curr);

    const TT = global.FlaptapStudioTranscriptTools;
    return groups.map((group, idx) => {
      const startMs = sentenceStartMs(group[0]);
      const endMs = sentenceEndMs(group[group.length - 1]);
      const startSec = startMs / 1000;
      const endSec = endMs / 1000;
      const rangeStr = TT?.formatRangeMs
        ? TT.formatRangeMs(startMs, endMs)
        : `${startSec.toFixed(1)}s – ${endSec.toFixed(1)}s`;
      return {
        index: idx + 1,
        speakerId: group[0].speakerId || 'spk_1',
        speaker: group[0].speaker || '',
        sentences: group,
        startMs,
        endMs,
        startSec,
        endSec,
        timeRange: rangeStr,
        text: group.map((s) => s.text).join(' '),
      };
    });
  }

  const paragraphsCache = new WeakMap();

  function getParagraphs(item, opts = {}) {
    if (!item) return [];
    const source = opts.source === 'raw' ? 'raw' : 'reviewed';
    const speakerFilter = opts.speakerFilter || 'all';
    const canonical = getCanonicalSentences(item, source);
    const filtered =
      speakerFilter === 'all'
        ? canonical
        : canonical.filter((s) => (s.speakerId || 'spk_1') === speakerFilter);

    const reviewStamp = `${item.reviewStatus || ''}:${item.transcriptData?.reviewed?.reviewedAt || ''}:${canonical.length}`;
    const cacheKey = `${source}:${speakerFilter}:${reviewStamp}`;
    let itemCache = paragraphsCache.get(item);
    if (!itemCache) {
      itemCache = new Map();
      paragraphsCache.set(item, itemCache);
    }
    if (itemCache.has(cacheKey)) {
      return itemCache.get(cacheKey);
    }
    const paragraphs = groupCanonicalParagraphs(filtered, item, source);
    itemCache.set(cacheKey, paragraphs);
    return paragraphs;
  }

  /**
   * Maps a canonical sentence back to the nearest active `item.sentences` index
   * so existing playback/active-sentence highlighting works smoothly even when
   * `shadow` pacing mode splits sentences into shorter drill chunks.
   */
  function resolveActiveSentenceIndex(item, canonSentence) {
    const activeList = item?.sentences || [];
    if (!activeList.length) return Number(canonSentence?.index) || 1;
    const cStart = sentenceStartMs(canonSentence);
    const cEnd = sentenceEndMs(canonSentence);
    const mid = (cStart + cEnd) / 2;

    for (const s of activeList) {
      const sStart = sentenceStartMs(s);
      const sEnd = sentenceEndMs(s);
      if (mid >= sStart - 40 && mid <= sEnd + 40) return Number(s.index);
    }
    let bestIdx = Number(activeList[0].index) || 1;
    let bestDist = Infinity;
    for (const s of activeList) {
      const dist = Math.abs(sentenceStartMs(s) - cStart);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = Number(s.index);
      }
    }
    return bestIdx;
  }

  function buildCanonSentenceHtml(s, opts = {}) {
    const TT = global.FlaptapStudioTranscriptTools;
    const item = opts.item;
    const viewKind = opts.viewKind === 'raw' ? 'raw' : 'reviewed';
    const sentIndex = Number(s.index) || 1;
    const startMs = sentenceStartMs(s);
    const endMs = sentenceEndMs(s);
    const activeIdx = Number(opts.activeSentenceIndex) || 0;
    const mappedSentIdx = opts.mappedSentIdx || sentIndex;

    const bm = state.bookmark;
    const isBookmarked =
      bm && bm.view === viewKind && Number(bm.sentenceIndex) === sentIndex;
    const isPassed =
      bm && bm.view === viewKind && sentIndex < Number(bm.sentenceIndex);

    let wordsHtml = '';
    if (viewKind === 'raw' && Array.isArray(s.words) && s.words.length > 0 && TT?.renderWordTokensHtml) {
      wordsHtml = TT.renderWordTokensHtml(s.words, sentIndex, {
        showRepairs: false,
        searchQuery: opts.searchQuery || '',
      });
    } else if (TT?.decorateTimedWordsHtml) {
      wordsHtml = TT.decorateTimedWordsHtml(s.highlightedHtml || escapeHtml(s.text), s, {
        showRepairs: viewKind !== 'raw' && opts.showRepairs !== false,
        searchQuery: opts.searchQuery || '',
      });
    } else {
      wordsHtml = escapeHtml(s.text || '');
    }

    const flags = [];
    if (s.isInterrupted) {
      flags.push(
        `<span class="reader-flow-flag is-interrupted" data-info-kind="interrupted" data-sent-idx="${sentIndex}" tabindex="0" title="Speaker was cut off mid-thought by another speaker">cut off</span>`,
      );
    } else if (s.isOverlap) {
      flags.push(
        `<span class="reader-flow-flag is-overlap" data-info-kind="overlap" data-sent-idx="${sentIndex}" tabindex="0" title="Simultaneous overlapping speech separated">overlap</span>`,
      );
    }

    const cls = ['read-sentence', 'reader-flow-sent'];
    if (activeIdx && activeIdx === mappedSentIdx) cls.push('active-reading');
    if (isBookmarked) cls.push('is-bookmarked');
    if (isPassed) cls.push('is-read-passed');

    const bmLabel = isBookmarked ? 'Reading bookmark set here (click to clear)' : 'Bookmark reading position here';
    const bmBtn = `<button type="button" class="reader-bm-btn${isBookmarked ? ' active' : ''}" data-bookmark-sent="${sentIndex}" data-bookmark-ms="${startMs}" data-bookmark-view="${viewKind}" aria-pressed="${isBookmarked ? 'true' : 'false'}" aria-label="${bmLabel}" title="${bmLabel}">${isBookmarked ? BOOKMARK_FILLED_SVG : BOOKMARK_ICON_SVG}</button>`;

    return `<span class="${cls.join(' ')}" data-read-sent="${mappedSentIdx}" data-canon-index="${sentIndex}" data-start-ms="${startMs}" data-end-ms="${endMs}" data-speaker="${escapeHtml(s.speaker || '')}">${wordsHtml}${flags.join('')}${bmBtn}</span>`;
  }

  function renderContinuousParagraphsView(item, opts = {}) {
    if (!item) return '';
    const TT = global.FlaptapStudioTranscriptTools;
    const spkFilter = opts.speakerFilter || 'all';
    const hasReviewed = Boolean(item.transcriptData?.reviewed);
    const hasTranscript = Boolean((item.track === 'media_hub' || item.track === 'shadowing') && item.transcriptData);
    const paragraphs = getParagraphs(item, { source: 'reviewed', speakerFilter: spkFilter });

    if (paragraphs.length === 0) {
      return '<div class="studio-review-prompt-card"><p>No sentences match the active speaker filter.</p></div>';
    }

    const speakersList = TT?.getSpeakersList ? TT.getSpeakersList(item) : [];
    const showSpkChip = speakersList.length > 1;
    const paraDoneSet = opts.paraDoneSet instanceof Set ? opts.paraDoneSet : new Set();

    const statusBanner =
      hasReviewed || !hasTranscript
        ? ''
        : `
        <div class="reader-clean-callout">
          <div class="reader-clean-callout-copy">
            <span class="reader-clean-dot" aria-hidden="true"></span>
            <span>Showing original captions as unbroken sentences. Run <strong>AI Cleaning</strong> to fix speech-to-text typos &amp; separate overlapping speakers while keeping natural American speech intact.</span>
          </div>
          <button type="button" class="btn-vox btn-xs" data-trigger-ai-review>Clean with AI</button>
        </div>
      `;

    const bodyHtml = paragraphs
      .map((para) => {
        const isDone = paraDoneSet.has(para.index);
        const spkChipHtml =
          showSpkChip && para.speakerId && TT
            ? `<span class="studio-spk-chip is-mini" style="--spk-color:${TT.speakerColor(item, para.speakerId)}">${escapeHtml(TT.speakerName(item, para.speakerId, para.speaker))}</span>`
            : '';

        const proseHtml = para.sentences
          .map((s) =>
            buildCanonSentenceHtml(s, {
              item,
              viewKind: 'reviewed',
              activeSentenceIndex: opts.activeSentenceIndex,
              mappedSentIdx: resolveActiveSentenceIndex(item, s),
              showRepairs: opts.showRepairs,
              searchQuery: opts.searchQuery,
            }),
          )
          .join(' ');

        const copyBtnHtml = opts.renderCopyBtnHtml
          ? opts.renderCopyBtnHtml(para.text, 'paragraph-copy-btn')
          : '';
        const checkBtnHtml = opts.renderCheckBtnHtml
          ? opts.renderCheckBtnHtml({ checked: isDone, subject: 'paragraphs', index: para.index })
          : '';
        const rangeKey = `${para.startSec.toFixed(3)}-${para.endSec.toFixed(3)}`;

        return `
          <section class="editorial-paragraph-block reader-flow-para${isDone ? ' is-item-completed' : ''}" data-paragraph-index="${para.index}">
            <div class="editorial-paragraph-head">
              <div class="paragraph-head-left">
                ${spkChipHtml}
                <span class="paragraph-time-margin ltr-num">${escapeHtml(para.timeRange)}</span>
              </div>
              <div class="paragraph-head-actions">
                <button type="button" class="btn-secondary btn-xs paragraph-play-btn" data-play-range-start="${para.startSec.toFixed(3)}" data-play-range-end="${para.endSec.toFixed(3)}" data-play-range-key="${rangeKey}" data-idle-label="Play" data-play-range-label="Paragraph ${para.index}">Play</button>
                ${copyBtnHtml}
                ${checkBtnHtml}
              </div>
            </div>
            <p class="paragraph-prose reader-flow-prose">${proseHtml}</p>
          </section>
        `;
      })
      .join('');

    return `${statusBanner}<div class="reader-flow-document">${bodyHtml}</div>`;
  }

  function renderContinuousRawView(item, opts = {}) {
    if (!item) return '';
    const TT = global.FlaptapStudioTranscriptTools;
    const raw = item.transcriptData?.raw;
    const rawCanonical = getCanonicalSentences(item, 'raw');

    if (rawCanonical.length === 0) {
      return '<div class="studio-review-prompt-card"><p>No raw transcript snapshot is available for this lesson.</p></div>';
    }

    const totalWords = Array.isArray(raw?.words)
      ? raw.words.length
      : rawCanonical.reduce((sum, s) => sum + wordCountOf(s), 0);
    const provider = raw?.provider || item.transcriptData?.providerEngine || 'provider';
    const fullText = raw?.fullText || rawCanonical.map((s) => s.text).join(' ');
    const paragraphs = getParagraphs(item, { source: 'raw' });

    const copyAllHtml = TT
      ? `<button type="button" class="btn-secondary btn-xs" data-copy-text="${escapeHtml(fullText)}">Copy Raw</button>`
      : '';

    const parasHtml = paragraphs
      .map((para) => {
        const proseHtml = para.sentences
          .map((s) =>
            buildCanonSentenceHtml(s, {
              item,
              viewKind: 'raw',
              activeSentenceIndex: opts.activeSentenceIndex,
              mappedSentIdx: Number(s.index) || 1,
              showRepairs: false,
              searchQuery: opts.searchQuery,
            }),
          )
          .join(' ');
        const rangeKey = `${para.startSec.toFixed(3)}-${para.endSec.toFixed(3)}`;

        return `
          <section class="editorial-paragraph-block reader-flow-para reader-flow-para--raw" data-raw-para-index="${para.index}">
            <div class="editorial-paragraph-head">
              <div class="paragraph-head-left">
                <span class="paragraph-time-margin ltr-num">${escapeHtml(para.timeRange)}</span>
              </div>
              <div class="paragraph-head-actions">
                <button type="button" class="btn-secondary btn-xs paragraph-play-btn" data-play-range-start="${para.startSec.toFixed(3)}" data-play-range-end="${para.endSec.toFixed(3)}" data-play-range-key="${rangeKey}" data-idle-label="Play" data-play-range-label="Raw #${para.index}">Play</button>
              </div>
            </div>
            <p class="paragraph-prose reader-flow-prose">${proseHtml}</p>
          </section>
        `;
      })
      .join('');

    return `
      <div class="studio-raw-banner">
        <div>
          <strong>Untouched Raw Original</strong>
          <span class="studio-raw-meta">Source: ${escapeHtml(provider)} · ${totalWords.toLocaleString()} words · Original provider text in continuous flow</span>
        </div>
        ${copyAllHtml}
      </div>
      <div class="reader-flow-document">${parasHtml}</div>
    `;
  }

  /* ========================================================================
     READING BOOKMARK ("WHERE I LEFT OFF") — STRICTLY SEPARATE FROM COMPLETION
     ======================================================================== */

  function syncBookmarkDom(item) {
    const bm = state.bookmark;
    const totalCanon = getCanonicalSentences(item, bm?.view === 'raw' ? 'raw' : 'reviewed').length;

    const pill = document.getElementById('reader-bookmark-pill');
    const labelEl = document.getElementById('reader-bookmark-label');
    if (pill && labelEl) {
      const mode = global.studioState?.mode || 'shadow';
      const rView = global.studioState?.readView || 'paragraphs';
      const allowPill = mode === 'read' && (rView === 'paragraphs' || rView === 'raw');
      if (bm && bm.sentenceIndex >= 1) {
        const pct = totalCanon > 0 ? Math.round((bm.sentenceIndex / totalCanon) * 100) : 0;
        labelEl.textContent = `#${bm.sentenceIndex}${totalCanon ? ` / ${totalCanon}` : ''} (${pct}%)`;
        pill.hidden = !allowPill;
      } else {
        pill.hidden = true;
      }
    }

    document.querySelectorAll('.reader-flow-sent[data-canon-index]').forEach((el) => {
      const idx = Number(el.getAttribute('data-canon-index'));
      const panelRaw = Boolean(el.closest('#subview-raw-list'));
      const elView = panelRaw ? 'raw' : 'reviewed';
      const matchView = Boolean(bm && bm.view === elView);
      const isHere = matchView && idx === Number(bm.sentenceIndex);
      const isPassed = matchView && idx < Number(bm.sentenceIndex);
      el.classList.toggle('is-bookmarked', isHere);
      el.classList.toggle('is-read-passed', isPassed);
      const btn = el.querySelector('.reader-bm-btn');
      if (btn) {
        btn.classList.toggle('active', isHere);
        btn.setAttribute('aria-pressed', isHere ? 'true' : 'false');
        btn.innerHTML = isHere ? BOOKMARK_FILLED_SVG : BOOKMARK_ICON_SVG;
        btn.title = isHere ? 'Reading bookmark set here (click to clear)' : 'Bookmark reading position here';
      }
    });
  }

  function hydrate(item) {
    if (!item?.id) return;
    state.lessonId = item.id;
    const serverBm = item.transcriptData?.readingBookmark || null;
    const localBm = loadLocalBookmark(item.id);
    if (serverBm && Number.isFinite(Number(serverBm.sentenceIndex))) {
      state.bookmark = serverBm;
      saveLocalBookmark(item.id, serverBm);
    } else if (localBm) {
      state.bookmark = localBm;
    } else {
      state.bookmark = null;
    }
    syncBookmarkDom(item);
    syncReaderToolbar(item);
  }

  async function setBookmark(payload, item) {
    if (!state.lessonId) return null;
    const current = state.bookmark;
    const toggleClear =
      payload === null ||
      (current &&
        Number(current.sentenceIndex) === Number(payload.sentenceIndex) &&
        current.view === (payload.view === 'raw' ? 'raw' : 'reviewed'));

    const next = toggleClear
      ? null
      : {
          sentenceIndex: Math.max(1, Math.floor(Number(payload.sentenceIndex) || 1)),
          startMs: Math.max(0, Math.round(Number(payload.startMs) || 0)),
          view: payload.view === 'raw' ? 'raw' : 'reviewed',
          excerpt: String(payload.excerpt || '').replace(/\s+/g, ' ').trim().slice(0, 180),
          updatedAt: new Date().toISOString(),
        };

    state.bookmark = next;
    saveLocalBookmark(state.lessonId, next);
    if (item?.transcriptData) {
      item.transcriptData.readingBookmark = next;
    }
    syncBookmarkDom(item || global.studioState?.item);

    if (typeof state.showToast === 'function') {
      state.showToast(
        next ? `Bookmarked reading position at #${next.sentenceIndex}` : 'Reading bookmark cleared',
      );
    }

    if (typeof state.apiFetch === 'function') {
      state.savingBookmark = true;
      try {
        const res = await state.apiFetch(
          `/api/tracks/media-hub/${encodeURIComponent(state.lessonId)}/reading-progress`,
          {
            method: 'PATCH',
            body: JSON.stringify({ bookmark: next }),
          },
        );
        if (res && 'readingBookmark' in res) {
          state.bookmark = res.readingBookmark;
          saveLocalBookmark(state.lessonId, res.readingBookmark);
          if (item?.transcriptData) item.transcriptData.readingBookmark = res.readingBookmark;
          syncBookmarkDom(item || global.studioState?.item);
        }
      } catch {
        // Keep local bookmark intact; offline/transient errors won't discard user mark
      } finally {
        state.savingBookmark = false;
      }
    }
    return state.bookmark;
  }

  function jumpToBookmark() {
    const bm = state.bookmark;
    if (!bm) return false;
    const targetView = bm.view === 'raw' ? 'raw' : 'paragraphs';
    if (typeof state.switchReadView === 'function' && global.studioState?.readView !== targetView) {
      state.switchReadView(targetView);
    }
    const scopeSel = targetView === 'raw' ? '#subview-raw-list' : '#subview-chunks-list';
    const targetEl = document.querySelector(
      `${scopeSel} .reader-flow-sent[data-canon-index="${bm.sentenceIndex}"]`,
    );
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.classList.remove('is-bm-pulse');
      void targetEl.offsetWidth;
      targetEl.classList.add('is-bm-pulse');
      setTimeout(() => targetEl.classList.remove('is-bm-pulse'), 1400);
      return true;
    }
    return false;
  }

  function syncSourceToggle(readView) {
    void readView;
  }

  function syncReaderToolbar(item) {
    const hasReviewed = Boolean(item?.transcriptData?.reviewed);
    const statusDot = document.getElementById('read-paragraphs-status-dot');
    if (statusDot) {
      statusDot.hidden = !hasReviewed;
      statusDot.title = hasReviewed
        ? 'AI Cleaned natural American transcript'
        : '';
    }
    syncBookmarkDom(item);
  }

  /**
   * Resolves exact millisecond `[startMs, endMs]` boundaries for ANY DOM Range
   * inside the transcript (single word, partial phrase, or multi-sentence span).
   */
  function resolveSelectionTimeRange(range, fallbackSentenceIndex) {
    if (!range) return null;
    const ancestor =
      range.commonAncestorContainer.nodeType === 1
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    if (!ancestor) return null;

    const inRaw = Boolean(ancestor.closest('#subview-raw-list'));
    const view = inRaw ? 'raw' : 'reviewed';

    let words = [];
    const directWord = ancestor.closest?.('.studio-word[data-start-ms][data-end-ms]');
    if (directWord) {
      words = [directWord];
    } else if (typeof ancestor.querySelectorAll === 'function') {
      const all = Array.from(ancestor.querySelectorAll('.studio-word[data-start-ms][data-end-ms]'));
      words = all.filter((el) => {
        try {
          return range.intersectsNode(el);
        } catch {
          return false;
        }
      });
    }

    if (words.length > 0) {
      let minStart = Infinity;
      let maxEnd = 0;
      for (const w of words) {
        const s = Number(w.dataset.startMs);
        const e = Number(w.dataset.endMs);
        if (Number.isFinite(s) && s < minStart) minStart = s;
        if (Number.isFinite(e) && e > maxEnd) maxEnd = e;
      }
      if (Number.isFinite(minStart) && maxEnd > minStart) {
        const firstSentEl = words[0].closest('[data-canon-index], [data-sentence-index], [data-read-sent]');
        const sentenceIndex =
          Number(firstSentEl?.getAttribute('data-canon-index')) ||
          Number(words[0].dataset.sentIndex) ||
          Number(firstSentEl?.getAttribute('data-sentence-index')) ||
          Number(firstSentEl?.getAttribute('data-read-sent')) ||
          Number(fallbackSentenceIndex) ||
          1;
        const speaker = firstSentEl?.getAttribute('data-speaker') || '';
        return {
          startMs: Math.round(minStart),
          endMs: Math.round(maxEnd),
          startSec: minStart / 1000,
          endSec: maxEnd / 1000,
          sentenceIndex,
          speaker,
          view,
          wordCount: words.length,
        };
      }
    }

    const sentEl = ancestor.closest?.('[data-start-ms][data-end-ms]');
    if (sentEl) {
      const s = Number(sentEl.getAttribute('data-start-ms'));
      const e = Number(sentEl.getAttribute('data-end-ms'));
      if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
        return {
          startMs: Math.round(s),
          endMs: Math.round(e),
          startSec: s / 1000,
          endSec: e / 1000,
          sentenceIndex:
            Number(sentEl.getAttribute('data-canon-index')) ||
            Number(sentEl.getAttribute('data-read-sent')) ||
            Number(fallbackSentenceIndex) ||
            1,
          speaker: sentEl.getAttribute('data-speaker') || '',
          view,
          wordCount: 0,
        };
      }
    }

    const item = global.studioState?.item;
    const fallbackSent = (item?.sentences || []).find(
      (s) => Number(s.index) === Number(fallbackSentenceIndex),
    );
    if (fallbackSent) {
      const s = sentenceStartMs(fallbackSent);
      const e = sentenceEndMs(fallbackSent);
      return {
        startMs: s,
        endMs: e,
        startSec: s / 1000,
        endSec: e / 1000,
        sentenceIndex: Number(fallbackSent.index) || 1,
        speaker: fallbackSent.speaker || '',
        view,
        wordCount: 0,
      };
    }

    return null;
  }

  global.FlaptapStudioReaderFlow = {
    configure,
    getCanonicalSentences,
    groupCanonicalParagraphs,
    getParagraphs,
    renderContinuousParagraphsView,
    renderContinuousRawView,
    hydrate,
    setBookmark,
    jumpToBookmark,
    syncBookmarkDom,
    syncSourceToggle,
    syncReaderToolbar,
    resolveSelectionTimeRange,
    getBookmark: () => state.bookmark,
  };
})(window);
