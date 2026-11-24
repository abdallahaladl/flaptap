/* ==========================================================================
   TRANSCRIPT LAB — INTERACTIVE MILLISECOND WORKBENCH (transcript-lab/workbench.js)
   Renders and operates a loaded TranscriptLabDoc:
   - 5 instant top views: Sentences | Paragraphs | Ideas | Speakers | Raw Original
   - Millisecond word-click playback via shared FlaptapMediaEngine
   - Live 60fps O(log N) karaoke word highlight + smart auto-scroll
   - Shadow Pause speaking gaps, Word/Sentence loops, Speed 0.6x–1.5x, Audio/Video toggle
   - Inline repair diffs, multi-speaker filter & rename, live in-transcript search
   - Universal 7-format exporter (.txt/.md/.srt/.vtt/.json/.csv/.html) + clipboard
   - Real Derived Completion via shared FlaptapCheckButton (zero fake container toggle)
   - Contextual word lookup & Vocabulary save via shared FlaptapWordLookup
   ========================================================================== */

(function (global) {
  'use strict';

  const VIEW_DEFS = [
    { id: 'sentences', label: 'Sentences', shortcut: '1' },
    { id: 'paragraphs', label: 'Paragraphs', shortcut: '2' },
    { id: 'ideas', label: 'Ideas', shortcut: '3' },
    { id: 'speakers', label: 'Speakers', shortcut: '4' },
    { id: 'raw', label: 'Raw Original', shortcut: '5' },
  ];

  const EXPORT_FORMATS = [
    { id: 'txt', label: 'Plain Text (.txt)', desc: 'Clean readable text' },
    { id: 'md', label: 'Markdown (.md)', desc: 'Obsidian & notes ready' },
    { id: 'srt', label: 'SubRip (.srt)', desc: 'Standard video subtitles' },
    { id: 'vtt', label: 'WebVTT (.vtt)', desc: 'Web captions + speakers' },
    { id: 'json', label: 'JSON (.json)', desc: 'Full millisecond word data' },
    { id: 'csv', label: 'CSV (.csv)', desc: 'Anki / spreadsheet table' },
    { id: 'html', label: 'Study Sheet (.html)', desc: 'Printable styled page' },
  ];

  function escapeHtml(val) {
    return global.FlaptapUtils?.escapeHtml
      ? global.FlaptapUtils.escapeHtml(val)
      : String(val ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
  }

  function toast(msg) {
    if (global.FlaptapWorkspace?.showToast) global.FlaptapWorkspace.showToast(msg);
    else if (global.FlaptapUtils?.showToast) global.FlaptapUtils.showToast(msg);
  }

  function create(deps = {}) {
    const api = deps.api || global.FlaptapTranscriptApi;
    const nav = deps.nav || {};
    const getAiSelection = typeof deps.getAiSelection === 'function' ? deps.getAiSelection : () => ({});
    const onDocUpdated = typeof deps.onDocUpdated === 'function' ? deps.onDocUpdated : () => {};
    const onShellRendered = typeof deps.onShellRendered === 'function' ? deps.onShellRendered : () => {};

    const state = {
      rootEl: null,
      doc: null,
      activeView: 'sentences',
      clickMode: 'word', // 'word' | 'from-here'
      showRepairs: true,
      speakerFilter: 'all',
      searchQuery: '',
      searchMatches: [],
      searchMatchIdx: 0,
      videoExpanded: false,
      exportMenuOpen: false,
      exportViewChoice: 'active',
      exportIncludeTs: true,
      exportIncludeSpeakers: true,
      speakerEditorOpen: false,
      reviewing: false,
      reviewProgress: { percent: 0, message: '' },
      reviewAbort: null,
      activeWordIndex: -1,
      activeSentenceIndex: -1,
      selectedWord: null, // { word, sentenceText, sentenceIndex, startMs, endMs }
      autoScrollPaused: false,
      lastProgrammaticScrollAt: 0,
      engine: null,
      wordLookupReady: false,
      keydownHandler: null,
      docClickHandler: null,
      scrollHandler: null,
      deckObserver: null,
      deckScrollHandler: null,
      isStuck: false,
      topCollapsed: false,
      stuckExpanded: false,
      scrubbing: false,
      infoCloseTimer: null,
      infoPopoverState: { open: false, pinned: false, kind: '', sentIdx: 0, anchorEl: null },
      editingTitle: false,
    };

    function activeSentences() {
      if (!state.doc) return [];
      if (state.activeView === 'raw' || !state.doc.reviewed) {
        return state.doc.raw?.sentences || [];
      }
      return state.doc.reviewed.sentences || [];
    }

    function activeWordStream() {
      if (!state.doc) return [];
      if (state.activeView === 'raw' || !state.doc.reviewed) {
        return state.doc.raw?.words || [];
      }
      const list = [];
      (state.doc.reviewed.sentences || []).forEach((s) => {
        (s.words || []).forEach((w) => list.push({ ...w, sentenceIndex: s.index }));
      });
      return list;
    }

    /** Binary search O(log N) for active millisecond word */
    function findWordAtTimeMs(words, timeMs) {
      if (!words.length) return -1;
      let lo = 0;
      let hi = words.length - 1;
      let candidate = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (words[mid].startMs <= timeMs) {
          candidate = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (candidate >= 0 && timeMs <= words[candidate].endMs + 90) {
        return candidate;
      }
      return candidate;
    }

    function triggerWordLookup(wordText, sentenceText, sentenceIndex, startMs, anchorEl) {
      if (!global.FlaptapWordLookup?.open || !state.doc) return;
      const ws = global.FlaptapWorkspace;
      const user = ws?.getUser?.();
      const lang = user?.nativeLanguage || 'ar';
      const endMs = state.selectedWord?.endMs || (Number(startMs) || 0) + 320;

      global.FlaptapWordLookup.open({
        word: wordText,
        sourceEl: anchorEl || undefined,
        contextSentence: sentenceText || wordText,
        sentenceIndex: sentenceIndex || 1,
        endpoint: '/api/transcript-lab/lookup-word',
        payload: {
          docId: state.doc.id,
          word: wordText,
          contextSentence: sentenceText || wordText,
          language: lang,
          lookupScope: 'word',
        },
        fetcher: ws?.apiFetch || ((url, opts) => api.lookupWord(JSON.parse(opts.body))),
        canPlay: Boolean(state.doc.media?.hasAudio),
        playLabel: 'Hear word',
        onPlay: () => {
          state.engine?.playWord(
            { word: wordText, startMs: Number(startMs) || 0, endMs },
            { sentenceIndex: sentenceIndex || 1 },
          );
        },
        canSpeak: true,
        canSave: true,
        isSaved: (term) => (ws?.isVocabularySaved ? ws.isVocabularySaved(term) : false),
        onSave: async (def) => {
          await ws.apiFetch('/api/vocabulary', {
            method: 'POST',
            body: JSON.stringify({
              term: def.term,
              ipa: def.ipa || '',
              partOfSpeech: def.partOfSpeech || '',
              definition: def.definition || '',
              generalTranslation: def.generalTranslation || '',
              translation: def.translation || '',
              contextSentence: sentenceText || def.contextSentence || '',
              lessonTitle: state.doc?.title || 'Transcript Lab',
              timestampSec: (Number(startMs) || 0) / 1000,
            }),
          });
          if (ws?.refreshVocabulary) await ws.refreshVocabulary();
          toast(`Saved "${def.term}" to Vocabulary Vault.`);
        },
      });
    }

    /* ======================================================================
       PLAYBACK ENGINE COORDINATION
       ====================================================================== */

    function initMediaEngine() {
      if (state.engine) state.engine.destroy();
      state.engine = global.FlaptapMediaEngine.create({
        onStateChange: (pState) => syncPlayerDock(pState),
        onTimeUpdate: (nowMs, activeRange) => handlePlaybackTick(nowMs, activeRange),
        onShadowPause: (info) => renderShadowPauseBar(info),
        onRangeEnd: (range, info) => {
          if (info?.shadowPauseComplete && range?.kind === 'sentence') {
            // Replay current sentence cleanly in shadow mode
            state.engine?.playRange(range.startMs, range.endMs, {
              kind: 'sentence',
              label: range.label,
              meta: range.meta,
            });
          }
        },
      });
    }

    function handlePlaybackTick(nowMs, activeRange) {
      if (!state.rootEl || !state.doc) return;
      if (!state.scrubbing) {
        const clockEl = state.rootEl.querySelector('#tlab-clock-now');
        if (clockEl) clockEl.textContent = global.FlaptapMediaEngine.formatMs(nowMs);

        const durMs = state.engine?.getState?.().durationMs || (state.doc.durationSeconds || 0) * 1000;
        if (durMs > 0) {
          const pct = Math.max(0, Math.min(100, (nowMs / durMs) * 100));
          updateScrubVisuals(pct);
        }
      }

      const words = activeWordStream();
      let idx = -1;
      if (activeRange?.kind === 'word' && activeRange.meta?.word) {
        idx = Number(activeRange.meta.word.i);
      } else {
        idx = findWordAtTimeMs(words, nowMs);
      }

      if (idx !== state.activeWordIndex) {
        highlightActiveWord(idx, words[idx]?.sentenceIndex || -1);
      }
    }

    function updateScrubVisuals(pct) {
      const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
      const progFill = state.rootEl?.querySelector('#tlab-player-progress-fill');
      const thumb = state.rootEl?.querySelector('#tlab-scrub-thumb');
      if (progFill) progFill.style.width = `${clamped.toFixed(2)}%`;
      if (thumb) thumb.style.left = `${clamped.toFixed(2)}%`;
    }

    function highlightActiveWord(wordIdx, sentIdx) {
      if (!state.rootEl) return;
      if (state.activeWordIndex >= 0) {
        state.rootEl
          .querySelectorAll(`.tlab-word.is-speaking`)
          .forEach((el) => el.classList.remove('is-speaking'));
      }
      state.activeWordIndex = wordIdx;

      if (wordIdx >= 0) {
        const wordEl = state.rootEl.querySelector(`.tlab-word[data-word-i="${wordIdx}"]`);
        if (wordEl) {
          wordEl.classList.add('is-speaking');
          const resolvedSent = Number(wordEl.dataset.sentIdx) || sentIdx;
          if (resolvedSent > 0 && resolvedSent !== state.activeSentenceIndex) {
            setActiveSentenceHighlight(resolvedSent, wordEl);
          }
        }
      }
    }

    function setActiveSentenceHighlight(sentIdx, scrollTargetEl) {
      if (!state.rootEl) return;
      state.rootEl
        .querySelectorAll('.tlab-sentence-row.is-active, .tlab-turn-card.is-active')
        .forEach((el) => el.classList.remove('is-active'));
      state.activeSentenceIndex = sentIdx;

      const row = state.rootEl.querySelector(`.tlab-sentence-row[data-sent-idx="${sentIdx}"]`);
      if (row) row.classList.add('is-active');

      const target = row || scrollTargetEl;
      if (target && !state.autoScrollPaused) {
        const rect = target.getBoundingClientRect();
        const vh = global.innerHeight || 800;
        if (rect.top < 140 || rect.bottom > vh - 160) {
          state.lastProgrammaticScrollAt = Date.now();
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }

    function renderShadowPauseBar(info) {
      const bar = state.rootEl?.querySelector('#tlab-shadow-pause-bar');
      if (!bar) return;
      if (!info?.active) {
        bar.hidden = true;
        return;
      }
      bar.hidden = false;
      const fill = bar.querySelector('.tlab-shadow-fill');
      const label = bar.querySelector('.tlab-shadow-countdown');
      const pct = Math.max(0, Math.min(100, ((info.totalMs - info.remainingMs) / Math.max(1, info.totalMs)) * 100));
      if (fill) fill.style.width = `${pct.toFixed(1)}%`;
      if (label) label.textContent = `Speak now… ${(info.remainingMs / 1000).toFixed(1)}s`;
    }

    function syncPlayerDock(pState) {
      if (!state.rootEl) return;
      const playBtn = state.rootEl.querySelector('#tlab-play-toggle');
      const playIco = state.rootEl.querySelector('.tlab-ico-play');
      const pauseIco = state.rootEl.querySelector('.tlab-ico-pause');
      const activeLabel = state.rootEl.querySelector('#tlab-active-clip-label');
      const clockTotal = state.rootEl.querySelector('#tlab-clock-total');
      const errEl = state.rootEl.querySelector('#tlab-media-error');
      const defineBtn = state.rootEl.querySelector('#tlab-define-active-btn');

      if (playBtn) {
        playBtn.classList.toggle('is-playing', pState.playing);
        playBtn.setAttribute('aria-pressed', pState.playing ? 'true' : 'false');
      }
      if (playIco) playIco.toggleAttribute('hidden', pState.playing);
      if (pauseIco) pauseIco.toggleAttribute('hidden', !pState.playing);

      if (activeLabel) {
        if (pState.loading) {
          activeLabel.textContent = 'Loading original media…';
        } else if (pState.activeRange) {
          const r = pState.activeRange;
          const prefix =
            r.kind === 'word'
              ? 'Word'
              : r.kind === 'sentence'
                ? 'Sentence'
                : r.kind === 'continuous'
                  ? 'Playing'
                  : 'Clip';
          const rangeText =
            Number.isFinite(r.rawEndMs)
              ? `${global.FlaptapMediaEngine.formatMs(r.rawStartMs)} – ${global.FlaptapMediaEngine.formatMs(r.rawEndMs)}`
              : global.FlaptapMediaEngine.formatMs(r.rawStartMs);
          activeLabel.textContent = `${prefix}: "${r.label}" · ${rangeText}`;
        } else {
          activeLabel.textContent = 'Click any word to hear exact millisecond pronunciation';
        }
      }

      if (clockTotal && pState.durationMs > 0) {
        clockTotal.textContent = global.FlaptapMediaEngine.formatMs(pState.durationMs);
      }

      if (errEl) {
        errEl.hidden = !pState.error;
        errEl.textContent = pState.error || '';
      }

      if (defineBtn) {
        defineBtn.hidden = !state.selectedWord;
        if (state.selectedWord) {
          defineBtn.title = `Define "${state.selectedWord.word}"`;
          defineBtn.setAttribute('aria-label', `Define "${state.selectedWord.word}"`);
          const span = defineBtn.querySelector('span');
          if (span) span.textContent = state.selectedWord.word;
        }
      }

      const compactSpeed = state.rootEl.querySelector('#tlab-compact-speed');
      if (compactSpeed) {
        compactSpeed.textContent = `${pState.speed}x`;
        compactSpeed.classList.toggle('is-modified', Math.abs(pState.speed - 1) > 0.01);
      }

      const followBtn = state.rootEl.querySelector('#tlab-follow-toggle');
      if (followBtn) {
        const following = !state.autoScrollPaused;
        followBtn.classList.toggle('is-active', following);
        followBtn.setAttribute('aria-pressed', following ? 'true' : 'false');
      }

      state.rootEl.querySelectorAll('[data-tlab-speed]').forEach((b) => {
        const active = Math.abs(Number(b.dataset.tlabSpeed) - pState.speed) < 0.01;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      state.rootEl.querySelectorAll('[data-tlab-loop]').forEach((b) => {
        const active = b.dataset.tlabLoop === pState.loopMode;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      const padBtn = state.rootEl.querySelector('#tlab-pad-toggle');
      if (padBtn) {
        const isExact = pState.wordPadMode === 'exact';
        const padLabel = padBtn.querySelector('.tlab-pad-label');
        if (padLabel) padLabel.textContent = isExact ? 'Exact' : 'Natural';
        padBtn.title = isExact
          ? 'Exact 0ms bounds (click for natural -25ms/+55ms cushion)'
          : 'Natural consonant cushion -25ms/+55ms (click for exact 0ms)';
        padBtn.classList.toggle('is-active', isExact);
        padBtn.setAttribute('aria-pressed', isExact ? 'true' : 'false');
      }
    }

    function stepSentence(delta) {
      const list = activeSentences();
      if (!list.length) return;
      const curIdx = state.activeSentenceIndex > 0 ? state.activeSentenceIndex : 1;
      const nextIdx = Math.max(1, Math.min(list.length, curIdx + delta));
      const target = list.find((s) => s.index === nextIdx) || list[0];
      if (!target) return;
      setActiveSentenceHighlight(target.index);
      state.engine?.playRange(target.startMs, target.endMs, {
        kind: 'sentence',
        label: `#${target.index} ${target.text.slice(0, 42)}`,
        meta: { sentenceIndex: target.index },
      });
    }

    /* ======================================================================
       RENDERING: WORD TOKENS & 5 VIEW MODES
       ====================================================================== */

    function renderWordTokensHtml(words, sentenceIndex) {
      if (!Array.isArray(words) || !words.length) return '';
      const q = state.searchQuery.trim().toLowerCase();

      return words
        .map((w) => {
          const isRepaired = Boolean(w.repaired && state.showRepairs);
          const isMatch = q && (w.word.toLowerCase().includes(q) || (w.clean || '').includes(q));
          const classes = ['tlab-word'];
          if (isRepaired) classes.push('is-repaired');
          if (isMatch) classes.push('is-search-hit');
          if (w.i === state.activeWordIndex) classes.push('is-speaking');

          const tip = w.repaired
            ? `Raw: "${w.rawWord || '(inserted)'}" → Fixed: "${w.word}" · ${global.FlaptapMediaEngine.formatMs(w.startMs)}`
            : `${global.FlaptapMediaEngine.formatMs(w.startMs)} – ${global.FlaptapMediaEngine.formatMs(w.endMs)} · Click to hear`;

          return `<span class="${classes.join(' ')}" data-word-i="${w.i}" data-start-ms="${w.startMs}" data-end-ms="${w.endMs}" data-sent-idx="${sentenceIndex}" title="${escapeHtml(tip)}">${escapeHtml(w.word)}</span>`;
        })
        .join(' ');
    }

    function speakerBadgeHtml(name, colorIndex = 0) {
      return `<span class="tlab-speaker-pill tlab-spk-c${Number(colorIndex) % 6}">${escapeHtml(name)}</span>`;
    }

    function getSpeakerColor(speakerId) {
      const spk = state.doc?.reviewed?.speakers?.find((s) => s.id === speakerId);
      return spk ? spk.colorIndex : 0;
    }

    function renderViewContent() {
      const container = state.rootEl?.querySelector('#tlab-transcript-canvas');
      if (!container || !state.doc) return;

      const doc = state.doc;
      const reviewed = doc.reviewed;
      const view = state.activeView;
      const completedSet = new Set(doc.completion?.items || []);
      const multiSpeaker = Boolean(reviewed && reviewed.speakers.length > 1);
      const spkFilter = state.speakerFilter;

      // Sync speaker filter bar visibility: only show bar for multi-speaker docs or when editing speaker names
      const spkBar = state.rootEl.querySelector('#tlab-speaker-bar');
      if (spkBar) {
        if (reviewed && reviewed.speakers.length > 0 && view !== 'raw' && (reviewed.speakers.length > 1 || state.speakerEditorOpen)) {
          spkBar.hidden = false;
          renderSpeakerBar(spkBar, reviewed.speakers);
        } else {
          spkBar.hidden = true;
        }
      }

      if (view === 'raw') {
        const raw = doc.raw;
        const sentences = raw.sentences || [];
        container.innerHTML = `
          <div class="tlab-raw-banner">
            <div>
              <strong>Original Provider Transcript (Untouched)</strong>
              <span>Extracted via <code>${escapeHtml(raw.provider || doc.providerEngine || 'provider')}</code> · ${raw.words.length} millisecond-timed words · Zero edits applied.</span>
            </div>
            <button type="button" class="btn-secondary btn-xs" id="tlab-copy-raw-btn">Copy Raw Text</button>
          </div>
          <div class="tlab-sentences-list">
            ${sentences
              .map(
                (s) => `
              <article class="tlab-sentence-row is-raw" data-sent-idx="${s.index}">
                <div class="tlab-sent-rail">
                  <button type="button" class="tlab-sent-play-btn" data-play-sent="${s.index}" title="Play from ${global.FlaptapMediaEngine.formatMs(s.startMs)}" aria-label="Play raw cue ${s.index}">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 4.8v14.4a.9.9 0 0 0 1.38.76l11.2-7.2a.9.9 0 0 0 0-1.52l-11.2-7.2a.9.9 0 0 0-1.38.76Z"></path></svg>
                  </button>
                  <span class="tlab-sent-num ltr-num">#${s.index}</span>
                  <span class="tlab-sent-ts ltr-num">${global.FlaptapMediaEngine.formatShort(s.startMs)}</span>
                </div>
                <div class="tlab-sent-body">
                  <p class="tlab-sent-text">${renderWordTokensHtml(s.words, s.index)}</p>
                </div>
                <div class="tlab-sent-actions">
                  <button type="button" class="tlab-mini-icon-btn" data-copy-sent="${s.index}" title="Copy cue" aria-label="Copy raw cue ${s.index}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  </button>
                </div>
              </article>`,
              )
              .join('')}
          </div>
        `;
        return;
      }

      const sentences = reviewed ? reviewed.sentences : doc.raw.sentences;
      const filteredSentences =
        spkFilter && spkFilter !== 'all'
          ? sentences.filter((s) => s.speakerId === spkFilter)
          : sentences;

      if (view === 'sentences') {
        if (!filteredSentences.length) {
          container.innerHTML = `<div class="tlab-empty-inline">No sentences match the active speaker filter.</div>`;
          return;
        }
        container.innerHTML = `
          <div class="tlab-sentences-list">
            ${filteredSentences
              .map((s) => {
                const isDone = completedSet.has(s.index);
                const checkHtml = global.FlaptapCheck?.buttonHtml
                  ? global.FlaptapCheck.buttonHtml({
                      checked: isDone,
                      label: `Mark sentence ${s.index} mastered`,
                      attrs: `data-tlab-check="${s.index}"`,
                      size: 'sm',
                    })
                  : `<input type="checkbox" data-tlab-check="${s.index}" ${isDone ? 'checked' : ''} />`;
                const repairIconBtn =
                  state.showRepairs && s.repaired
                    ? `<button type="button" class="tlab-mini-icon-btn tlab-indicator-btn is-repair" data-tlab-info="repair" data-sent-idx="${s.index}" aria-label="ASR caption repaired — hover or click for details">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z"></path><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"></path></svg>
                      </button>`
                    : '';
                const overlapIconBtn =
                  state.showRepairs && s.isOverlap
                    ? `<button type="button" class="tlab-mini-icon-btn tlab-indicator-btn is-overlap" data-tlab-info="overlap" data-sent-idx="${s.index}" aria-label="Overlapping speech separated — hover or click for details">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"></path><path d="M4 20L21 3"></path><path d="M21 16v5h-5"></path><path d="M15 15l6 6"></path><path d="M4 4l5 5"></path></svg>
                      </button>`
                    : '';
                const inlineSpeaker = multiSpeaker
                  ? `<span class="tlab-speaker-pill tlab-spk-c${getSpeakerColor(s.speakerId) % 6} tlab-sent-speaker-inline">${escapeHtml(s.speaker)}</span> `
                  : '';
                return `
              <article class="tlab-sentence-row ${isDone ? 'is-completed' : ''} ${s.index === state.activeSentenceIndex ? 'is-active' : ''}" data-sent-idx="${s.index}">
                <div class="tlab-sent-rail">
                  <button type="button" class="tlab-sent-play-btn" data-play-sent="${s.index}" title="Play sentence (${global.FlaptapMediaEngine.formatMs(s.startMs)} – ${global.FlaptapMediaEngine.formatMs(s.endMs)})" aria-label="Play sentence ${s.index}">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 4.8v14.4a.9.9 0 0 0 1.38.76l11.2-7.2a.9.9 0 0 0 0-1.52l-11.2-7.2a.9.9 0 0 0-1.38.76Z"></path></svg>
                  </button>
                  <span class="tlab-sent-num ltr-num">#${s.index}</span>
                  <span class="tlab-sent-ts ltr-num">${global.FlaptapMediaEngine.formatShort(s.startMs)}</span>
                </div>
                <div class="tlab-sent-body">
                  <p class="tlab-sent-text">${inlineSpeaker}${renderWordTokensHtml(s.words, s.index)}</p>
                </div>
                <div class="tlab-sent-actions">
                  ${overlapIconBtn}
                  ${repairIconBtn}
                  <button type="button" class="tlab-mini-icon-btn" data-copy-sent="${s.index}" title="Copy sentence" aria-label="Copy sentence ${s.index}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  </button>
                  ${checkHtml}
                </div>
              </article>`;
              })
              .join('')}
          </div>
        `;
        return;
      }

      if (view === 'paragraphs') {
        const paragraphs = reviewed ? reviewed.paragraphs : doc.raw.paragraphs;
        const sentByIdx = new Map(sentences.map((s) => [s.index, s]));
        const visibleParas =
          spkFilter && spkFilter !== 'all'
            ? paragraphs.filter((p) => p.speakerId === spkFilter)
            : paragraphs;

        container.innerHTML = `
          <div class="tlab-paragraphs-list">
            ${visibleParas
              .map((p) => {
                const pSents = p.sentenceIndices.map((i) => sentByIdx.get(i)).filter(Boolean);
                const htmlWords = pSents
                  .map((s) => renderWordTokensHtml(s.words, s.index))
                  .join(' ');
                return `
              <article class="tlab-para-card">
                <header class="tlab-card-head">
                  <div class="tlab-card-head-left">
                    <button type="button" class="tlab-sent-play-btn" data-play-range="${p.startMs}:${p.endMs}" data-range-label="Paragraph ${p.index}" title="Play paragraph">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 4.8v14.4a.9.9 0 0 0 1.38.76l11.2-7.2a.9.9 0 0 0 0-1.52l-11.2-7.2a.9.9 0 0 0-1.38.76Z"></path></svg>
                    </button>
                    <span class="tlab-card-kicker ltr-num">Paragraph ${p.index}</span>
                    ${multiSpeaker ? speakerBadgeHtml(p.speaker, getSpeakerColor(p.speakerId)) : ''}
                    <span class="tlab-sent-ts ltr-num">${global.FlaptapMediaEngine.formatShort(p.startMs)} – ${global.FlaptapMediaEngine.formatShort(p.endMs)}</span>
                  </div>
                  <button type="button" class="tlab-mini-icon-btn" data-copy-text="${escapeHtml(p.text)}" title="Copy paragraph">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  </button>
                </header>
                <p class="tlab-para-text">${htmlWords}</p>
              </article>`;
              })
              .join('')}
          </div>
        `;
        return;
      }

      if (view === 'ideas') {
        if (!reviewed || !reviewed.ideas.length) {
          container.innerHTML = `
            <div class="tlab-review-prompt-box">
              <h3>Ideas &amp; Key Points unlock after AI Review</h3>
              <p>Run the AI Review pass above to organize this transcript into structured talking points, repair ASR errors, and identify speakers.</p>
              <button type="button" class="btn-primary btn-sm" id="tlab-trigger-review-inline">Run AI Review Now</button>
            </div>`;
          return;
        }
        const sentByIdx = new Map(reviewed.sentences.map((s) => [s.index, s]));
        container.innerHTML = `
          <div class="tlab-ideas-list">
            ${reviewed.ideas
              .map((idea) => {
                const group = idea.sentenceIndices
                  .map((i) => sentByIdx.get(i))
                  .filter((s) => s && (spkFilter === 'all' || s.speakerId === spkFilter));
                if (!group.length) return '';
                const plainIdea = group.map((s) => s.text).join(' ');
                return `
              <article class="tlab-idea-card">
                <header class="tlab-idea-head">
                  <div class="tlab-idea-title-wrap">
                    <button type="button" class="tlab-sent-play-btn" data-play-range="${idea.startMs}:${idea.endMs}" data-range-label="Idea ${idea.index}: ${escapeHtml(idea.title)}" title="Play entire idea">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 4.8v14.4a.9.9 0 0 0 1.38.76l11.2-7.2a.9.9 0 0 0 0-1.52l-11.2-7.2a.9.9 0 0 0-1.38.76Z"></path></svg>
                    </button>
                    <div>
                      <div class="tlab-idea-kicker">
                        <span class="ltr-num">Idea ${idea.index}</span>
                        <span class="ltr-num">${global.FlaptapMediaEngine.formatShort(idea.startMs)} – ${global.FlaptapMediaEngine.formatShort(idea.endMs)}</span>
                        <span>${group.length} sentence${group.length === 1 ? '' : 's'}</span>
                      </div>
                      <h3 class="tlab-idea-title">${escapeHtml(idea.title)}</h3>
                    </div>
                  </div>
                  <button type="button" class="tlab-mini-icon-btn" data-copy-text="${escapeHtml(`${idea.title}\n${idea.summary ? idea.summary + '\n' : ''}${plainIdea}`)}" title="Copy idea">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  </button>
                </header>
                ${idea.summary ? `<p class="tlab-idea-summary">${escapeHtml(idea.summary)}</p>` : ''}
                ${idea.keyTakeaway ? `<div class="tlab-idea-takeaway"><strong>Speaking Pattern:</strong> ${escapeHtml(idea.keyTakeaway)}</div>` : ''}
                <div class="tlab-idea-sentences">
                  ${group
                    .map(
                      (s) => `
                    <div class="tlab-idea-sent-line" data-sent-idx="${s.index}">
                      <button type="button" class="tlab-idea-play-btn" data-play-sent="${s.index}" title="Play sentence #${s.index}" aria-label="Play sentence ${s.index}">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 4.8v14.4a.9.9 0 0 0 1.38.76l11.2-7.2a.9.9 0 0 0 0-1.52l-11.2-7.2a.9.9 0 0 0-1.38.76Z"></path></svg>
                      </button>
                      <span class="tlab-sent-ts ltr-num">${global.FlaptapMediaEngine.formatShort(s.startMs)}</span>
                      ${multiSpeaker ? speakerBadgeHtml(s.speaker, getSpeakerColor(s.speakerId)) : ''}
                      <span class="tlab-sent-text">${renderWordTokensHtml(s.words, s.index)}</span>
                    </div>`,
                    )
                    .join('')}
                </div>
              </article>`;
              })
              .join('')}
          </div>
        `;
        return;
      }

      if (view === 'speakers') {
        if (!reviewed || !reviewed.speakerTurns.length) {
          container.innerHTML = `
            <div class="tlab-review-prompt-box">
              <h3>Speaker Attribution unlocks after AI Review</h3>
              <p>Run the AI Review pass to separate multiple speakers, resolve overlapping interruptions, and name each speaker.</p>
              <button type="button" class="btn-primary btn-sm" id="tlab-trigger-review-inline">Run AI Review Now</button>
            </div>`;
          return;
        }
        const sentByIdx = new Map(reviewed.sentences.map((s) => [s.index, s]));
        const visibleTurns =
          spkFilter && spkFilter !== 'all'
            ? reviewed.speakerTurns.filter((t) => t.speakerId === spkFilter)
            : reviewed.speakerTurns;

        container.innerHTML = `
          <div class="tlab-speakers-list">
            ${visibleTurns
              .map((turn) => {
                const turnSents = turn.sentenceIndices.map((i) => sentByIdx.get(i)).filter(Boolean);
                const htmlWords = turnSents
                  .map((s) => renderWordTokensHtml(s.words, s.index))
                  .join(' ');
                return `
              <article class="tlab-turn-card tlab-spk-border-${turn.colorIndex % 6} ${turn.isOverlap ? 'is-overlap' : ''}">
                <header class="tlab-card-head">
                  <div class="tlab-card-head-left">
                    <button type="button" class="tlab-sent-play-btn" data-play-range="${turn.startMs}:${turn.endMs}" data-range-label="${escapeHtml(turn.speaker)}" title="Play speaker turn">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 4.8v14.4a.9.9 0 0 0 1.38.76l11.2-7.2a.9.9 0 0 0 0-1.52l-11.2-7.2a.9.9 0 0 0-1.38.76Z"></path></svg>
                    </button>
                    ${speakerBadgeHtml(turn.speaker, turn.colorIndex)}
                    ${turn.isOverlap ? `<span class="tlab-tag tlab-tag-overlap">Interruption / Overlap</span>` : ''}
                    <span class="tlab-sent-ts ltr-num">${global.FlaptapMediaEngine.formatShort(turn.startMs)} – ${global.FlaptapMediaEngine.formatShort(turn.endMs)}</span>
                  </div>
                  <button type="button" class="tlab-mini-icon-btn" data-copy-text="${escapeHtml(`${turn.speaker}: ${turn.text}`)}" title="Copy turn">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  </button>
                </header>
                <p class="tlab-turn-text">${htmlWords}</p>
              </article>`;
              })
              .join('')}
          </div>
        `;
      }
    }

    function renderSpeakerBar(barEl, speakers) {
      const chips = [
        `<button type="button" class="tlab-spk-filter-btn ${state.speakerFilter === 'all' ? 'is-active' : ''}" data-spk-filter="all">All Speakers (${speakers.length})</button>`,
        ...speakers.map(
          (sp) => `
          <button type="button" class="tlab-spk-filter-btn tlab-spk-c${sp.colorIndex % 6} ${state.speakerFilter === sp.id ? 'is-active' : ''}" data-spk-filter="${escapeHtml(sp.id)}">
            <span>${escapeHtml(sp.name)}</span>
            <span class="tlab-spk-count ltr-num">${sp.sentenceCount}</span>
          </button>`,
        ),
      ];

      const editorHtml = state.speakerEditorOpen
        ? `<div class="tlab-spk-editor">
            ${speakers
              .map(
                (sp) => `
              <label class="tlab-spk-edit-row">
                <span class="tlab-speaker-pill tlab-spk-c${sp.colorIndex % 6}">${escapeHtml(sp.originalLabel)}</span>
                <input type="text" class="tlab-spk-input" data-spk-rename="${escapeHtml(sp.id)}" value="${escapeHtml(sp.name)}" placeholder="Speaker name…" maxlength="64" />
              </label>`,
              )
              .join('')}
            <div class="tlab-spk-edit-actions">
              <button type="button" class="btn-primary btn-xs" id="tlab-save-speakers-btn">Save Names</button>
              <button type="button" class="btn-secondary btn-xs" id="tlab-cancel-speakers-btn">Cancel</button>
            </div>
          </div>`
        : '';

      barEl.innerHTML = `
        <div class="tlab-spk-row">
          <div class="tlab-spk-chips">${chips.join('')}</div>
          <button type="button" class="btn-secondary btn-xs" id="tlab-toggle-spk-edit">Rename Speakers</button>
        </div>
        ${editorHtml}
      `;
    }

    function syncProgressBar() {
      const bar = state.rootEl?.querySelector('#tlab-doc-progress');
      if (!state.doc) return;
      const total = state.doc.sentenceCount || 0;
      const done = state.doc.completedCount || 0;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const isDone = Boolean(state.doc.isCompleted);
      const tone = total > 0 && done >= total ? 'done' : done > 0 ? 'progress' : 'new';
      const completedSet = new Set(state.doc.completion?.items || []);
      const sents = activeSentences();

      if (bar) {
        if (global.FlaptapStudyDock?.renderProgressDeckHtml) {
          bar.innerHTML = global.FlaptapStudyDock.renderProgressDeckHtml({
            total,
            done,
            singular: 'sentence',
            plural: 'sentences',
            doneHeadline: 'Transcript mastered',
            readyHeadline: 'Ready to master',
            pipAttr: 'data-tlab-jump-sent',
            pips: sents.map((s) => ({
              id: s.index,
              displayNumber: s.index,
              label: (s.text || '').slice(0, 48),
              done: completedSet.has(s.index),
            })),
          });
        } else {
          bar.innerHTML = `
            <div class="tlab-progress-meta">
              <span>Mastered <strong>${done} / ${total}</strong> sentences</span>
              <span class="ltr-num">${pct}%${isDone ? ' · Completed' : ''}</span>
            </div>
            <div class="tlab-progress-track"><div class="tlab-progress-fill" style="width:${pct}%"></div></div>
          `;
        }
        bar.classList.toggle('is-done', isDone);
        bar.classList.toggle('is-all-done', isDone);
        bar.setAttribute('data-guide-state', isDone ? 'done' : done > 0 ? 'progress' : 'new');
      }

      // Sync compact always-visible progress capsule in the Core Bar
      const compactProg = state.rootEl?.querySelector('#tlab-compact-progress');
      if (compactProg) {
        compactProg.dataset.tone = tone;
        const r = 11;
        const c = 2 * Math.PI * r;
        const offset = c * (1 - (tone === 'done' ? 100 : pct) / 100);
        const ringEl = compactProg.querySelector('#tlab-compact-ring-slot');
        if (ringEl) {
          ringEl.innerHTML =
            tone === 'done'
              ? `<span class="tlab-mini-ring is-done" aria-hidden="true">
                   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5.2 12.75 L9.55 17.1 Q10.1 17.65 10.65 17.05 L18.9 7.35"></path></svg>
                 </span>`
              : `<span class="tlab-mini-ring is-${tone}" aria-hidden="true">
                   <svg width="26" height="26" viewBox="0 0 28 28">
                     <circle class="tlab-mini-ring-bg" cx="14" cy="14" r="${r}"></circle>
                     <circle class="tlab-mini-ring-fg" cx="14" cy="14" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"></circle>
                   </svg>
                   <span class="tlab-mini-ring-pct ltr-num">${pct}</span>
                 </span>`;
        }
        const fracEl = compactProg.querySelector('#tlab-compact-prog-frac');
        if (fracEl) fracEl.textContent = `${done}/${total}`;
        const fillEl = compactProg.querySelector('#tlab-compact-prog-fill');
        if (fillEl) fillEl.style.width = `${tone === 'done' ? 100 : pct}%`;
        const jumpBtn = compactProg.querySelector('#tlab-jump-next-btn');
        if (jumpBtn) jumpBtn.hidden = total === 0 || done >= total;
        compactProg.title = `${done} of ${total} sentences mastered (${pct}%) — click to expand/collapse details`;
      }
      if (state.isStuck) syncDeckCollapseState();
    }

    function renderExportMenu() {
      const pop = state.rootEl?.querySelector('#tlab-export-popover');
      if (!pop) return;
      pop.hidden = !state.exportMenuOpen;
      if (!state.exportMenuOpen) return;

      const resolvedView = state.exportViewChoice === 'active' ? state.activeView : state.exportViewChoice;
      pop.innerHTML = `
        <div class="tlab-export-head">
          <strong>Download Transcript</strong>
          <span class="tlab-export-sub">Export any view in your preferred format</span>
        </div>
        <div class="tlab-export-section">
          <label class="tlab-export-label">Which version?</label>
          <div class="tlab-export-view-pills">
            ${[
              { id: 'active', label: `Current (${VIEW_DEFS.find((v) => v.id === state.activeView)?.label || 'Sentences'})` },
              ...VIEW_DEFS,
            ]
              .map(
                (v) =>
                  `<button type="button" class="tlab-pill-xs ${state.exportViewChoice === v.id ? 'is-active' : ''}" data-exp-view="${v.id}">${escapeHtml(v.label)}</button>`,
              )
              .join('')}
          </div>
        </div>
        <div class="tlab-export-toggles">
          <label><input type="checkbox" id="tlab-exp-ts" ${state.exportIncludeTs ? 'checked' : ''} /> Include timestamps</label>
          <label><input type="checkbox" id="tlab-exp-spk" ${state.exportIncludeSpeakers ? 'checked' : ''} /> Include speaker names</label>
        </div>
        <div class="tlab-export-formats">
          ${EXPORT_FORMATS.map(
            (f) => `
            <button type="button" class="tlab-export-fmt-btn" data-exp-format="${f.id}" data-resolved-view="${resolvedView}">
              <span class="tlab-exp-fmt-name">${escapeHtml(f.label)}</span>
              <span class="tlab-exp-fmt-desc">${escapeHtml(f.desc)}</span>
            </button>`,
          ).join('')}
        </div>
      `;
    }

    function syncDeckCollapseState() {
      const deck = state.rootEl?.querySelector('#tlab-command-deck');
      const spacer = state.rootEl?.querySelector('#tlab-deck-spacer');
      const drawerInner = state.rootEl?.querySelector('.tlab-deck-drawer-inner');
      const btn = state.rootEl?.querySelector('#tlab-deck-collapse-btn');
      if (!deck) return;
      const collapsed = state.isStuck ? !state.stuckExpanded : state.topCollapsed;
      if (spacer) {
        if (collapsed && drawerInner) {
          const h = Math.max(0, Math.round(drawerInner.scrollHeight));
          spacer.style.height = `${h}px`;
        } else {
          spacer.style.height = '0px';
        }
      }
      deck.classList.toggle('is-stuck', state.isStuck);
      deck.classList.toggle('is-collapsed', collapsed);
      if (btn) {
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        btn.title = collapsed ? 'Expand controls, speed & views' : 'Collapse secondary controls';
        btn.setAttribute('aria-label', btn.title);
      }
    }

    function teardownDeckObserver() {
      if (state.deckObserver) {
        try { state.deckObserver.disconnect(); } catch {}
        state.deckObserver = null;
      }
      if (state.deckScrollHandler) {
        global.removeEventListener('scroll', state.deckScrollHandler);
        global.removeEventListener('resize', state.deckScrollHandler);
        state.deckScrollHandler = null;
      }
    }

    function setupDeckObserver() {
      teardownDeckObserver();
      const sentinel = state.rootEl?.querySelector('#tlab-deck-sentinel');
      const deck = state.rootEl?.querySelector('#tlab-command-deck');
      if (!sentinel || !deck) return;

      const measureTop = () => {
        const topbar = document.querySelector('.workspace-topbar');
        const h = topbar?.getBoundingClientRect()?.height;
        return h && h > 0 ? Math.round(h) : 56;
      };

      const syncStickyOffset = () => {
        const offset = measureTop();
        deck.style.setProperty('--tlab-sticky-top', `${offset}px`);
        return offset;
      };

      const updateStuck = () => {
        const offset = syncStickyOffset();
        const top = sentinel.getBoundingClientRect().top;
        // 28px hysteresis deadband prevents boundary flicker while scrolling
        const nextStuck = state.isStuck ? top <= offset + 28 : top <= offset;
        if (nextStuck !== state.isStuck) {
          state.isStuck = nextStuck;
          if (!nextStuck) state.stuckExpanded = false;
          syncDeckCollapseState();
        }
      };

      syncStickyOffset();
      updateStuck();

      let raf = 0;
      state.deckScrollHandler = () => {
        if (raf) return;
        raf = global.requestAnimationFrame(() => {
          raf = 0;
          updateStuck();
        });
      };
      global.addEventListener('scroll', state.deckScrollHandler, { passive: true });
      global.addEventListener('resize', state.deckScrollHandler, { passive: true });
    }

    function renderShell() {
      if (!state.rootEl || !state.doc) return;

      // Preserve the shared top nav pill before replacing workbench DOM
      const viewNav = document.getElementById('tlab-view-nav');
      const shellBar = document.getElementById('tlab-shell-bar');
      if (viewNav && state.rootEl.contains(viewNav) && shellBar) {
        shellBar.appendChild(viewNav);
      }

      const doc = state.doc;
      const reviewed = doc.reviewed;
      const quality = reviewed?.quality;
      const canVideo = Boolean(doc.media?.hasVideo);
      const speakers = reviewed?.speakers || [];
      const singleSpeaker = speakers.length === 1 ? speakers[0] : null;
      const repairedCount = reviewed
        ? (reviewed.sentences || []).filter((s) => s.repaired).length
        : 0;

      const viewIcons = {
        sentences: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>',
        paragraphs: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 4v16"></path><path d="M17 4v16"></path><path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13"></path></svg>',
        ideas: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path></svg>',
        speakers: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
        raw: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
      };

      const statusBadge =
        state.reviewing
          ? `<span class="tlab-status-pill is-working">AI Reviewing… ${state.reviewProgress.percent || 10}%</span>`
          : doc.reviewStatus === 'ready' && quality
            ? `<span class="tlab-status-pill is-ready" title="${escapeHtml(quality.summary)}">${quality.verbatimScore}% Verbatim · ${quality.repairedSentences} fix${quality.repairedSentences === 1 ? '' : 'es'}${quality.overlapsResolved ? ` · ${quality.overlapsResolved} overlap${quality.overlapsResolved === 1 ? '' : 's'}` : ''}</span>`
            : doc.reviewStatus === 'failed'
              ? `<span class="tlab-status-pill is-warn" title="${escapeHtml(doc.reviewError || '')}">Raw Ready · AI Review Paused</span>`
              : `<span class="tlab-status-pill">Raw Ready · Pending AI Review</span>`;

      const metaParts = [];
      if (doc.creator) metaParts.push(`<span>${escapeHtml(doc.creator)}</span>`);
      if (doc.durationSeconds > 0) {
        metaParts.push(`<span class="ltr-num">${global.FlaptapMediaEngine.formatShort(doc.durationSeconds * 1000)}</span>`);
      }
      metaParts.push(`<span class="ltr-num">${doc.wordCount.toLocaleString()} words</span>`);
      if (reviewed?.modelName) {
        metaParts.push(`<span class="tlab-meta-model">${escapeHtml(reviewed.modelName)}</span>`);
      }

      const speeds = global.FlaptapMediaEngine?.SPEED_OPTIONS || [0.5, 0.75, 0.85, 1, 1.25, 1.5];

      state.rootEl.innerHTML = `
        <div class="tlab-workbench">
          <!-- COMPACT DOCUMENT HEADER (scrolls out smoothly while Command Deck pins) -->
          <header class="tlab-wb-header">
            <div class="tlab-wb-nav-row">
              <div class="tlab-wb-nav-left">
                <div class="tlab-wb-nav-slot" id="tlab-wb-nav-slot"></div>
                <span class="tlab-platform-badge">${escapeHtml(doc.platform)}</span>
                ${statusBadge}
              </div>
              <div class="tlab-wb-head-actions">
                ${
                  doc.sourceUrl
                    ? `<button type="button" class="tlab-icon-action-btn" id="tlab-send-phrases" title="Extract American idioms & phrases from this source" aria-label="Extract Phrases">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z"></path><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"></path></svg>
                      </button>`
                    : ''
                }
                <button type="button" class="tlab-icon-action-btn ${state.reviewing ? 'is-spinning' : ''}" id="tlab-rerun-review-btn" ${state.reviewing ? 'disabled' : ''} title="${state.reviewing ? 'AI Review running…' : reviewed ? 'Re-Run AI Verbatim Review' : 'Run AI Verbatim Review'}" aria-label="${reviewed ? 'Re-Review AI' : 'Run AI Review'}">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                </button>
                <div class="tlab-export-anchor">
                  <button type="button" class="btn-primary tlab-export-icon-btn" id="tlab-export-btn" aria-expanded="false" title="Download / Export transcript (7 formats)" aria-label="Download transcript">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    <svg class="tlab-export-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </button>
                  <div class="tlab-export-popover" id="tlab-export-popover" hidden></div>
                </div>
              </div>
            </div>

            <div class="tlab-wb-title-row">
              <h2 class="tlab-wb-title" id="tlab-doc-title">${escapeHtml(doc.title)}</h2>
              <div class="tlab-title-edit-wrap" id="tlab-title-edit-wrap" hidden>
                <input type="text" class="tlab-title-input" id="tlab-title-input" value="${escapeHtml(doc.title)}" maxlength="160" aria-label="Transcript title" />
                <button type="button" class="btn-primary btn-xs" id="tlab-title-save-btn" title="Save title" aria-label="Save title">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </button>
                <button type="button" class="btn-secondary btn-xs" id="tlab-title-cancel-btn" title="Cancel rename" aria-label="Cancel rename">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
              <button type="button" class="tlab-mini-icon-btn" id="tlab-rename-btn" title="Rename transcript" aria-label="Rename transcript">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </button>
            </div>

            <div class="tlab-wb-meta-line">
              ${metaParts.join('<span class="tlab-meta-sep" aria-hidden="true">·</span>')}
              ${
                singleSpeaker
                  ? `<span class="tlab-meta-sep" aria-hidden="true">·</span>
                     <button type="button" class="tlab-inline-spk-btn" id="tlab-single-spk-btn" title="Rename speaker">
                       <span class="tlab-spk-dot tlab-spk-c${singleSpeaker.colorIndex % 6}"></span>
                       <span>${escapeHtml(singleSpeaker.name)}</span>
                       <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                     </button>`
                  : ''
              }
            </div>
          </header>

          <!-- LIVE AI REVIEW PROGRESS RIBBON -->
          <div class="tlab-review-banner" id="tlab-review-banner" ${state.reviewing ? '' : 'hidden'}>
            <div class="tlab-review-banner-copy">
              <strong id="tlab-review-msg">${escapeHtml(state.reviewProgress.message || 'Reviewing transcript…')}</strong>
              <span class="ltr-num" id="tlab-review-pct">${state.reviewProgress.percent || 0}%</span>
            </div>
            <div class="tlab-review-track"><div class="tlab-review-fill" id="tlab-review-fill" style="width:${state.reviewProgress.percent || 5}%"></div></div>
          </div>

          <!-- STICKY SENTINEL -->
          <div class="tlab-deck-sentinel" id="tlab-deck-sentinel" aria-hidden="true"></div>

          <!-- UNIFIED STICKY COMMAND DECK (Always-visible Core Bar + Scrub Track + Collapsible Drawer) -->
          <section class="tlab-command-deck" id="tlab-command-deck" aria-label="Transcript playback, progress and view controls">
            <div class="tlab-video-stage ${state.videoExpanded && canVideo ? 'is-open' : 'is-audio-hidden'}" id="tlab-video-stage" ${doc.media?.hasAudio ? '' : 'hidden'}>
              <div class="tlab-media-slot" id="tlab-media-slot"></div>
            </div>

            <div class="tlab-shadow-pause-bar" id="tlab-shadow-pause-bar" hidden>
              <div class="tlab-shadow-meta">
                <span class="tlab-shadow-countdown">Speak now…</span>
                <button type="button" class="tlab-pill-xs" id="tlab-skip-pause" title="Skip speaking pause and replay now">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
                  <span>Skip</span>
                </button>
              </div>
              <div class="tlab-shadow-track"><div class="tlab-shadow-fill" style="width:0%"></div></div>
            </div>

            <!-- CORE ALWAYS-VISIBLE BAR (stays compact ~52px when stuck & collapsed) -->
            <div class="tlab-core-bar">
              <div class="tlab-core-transport" ${doc.media?.hasAudio ? '' : 'hidden'}>
                <button type="button" class="tlab-play-btn" id="tlab-play-toggle" aria-label="Play or pause" title="Play / Pause (Space)">
                  <svg class="tlab-ico-play" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 4.8v14.4a.9.9 0 0 0 1.38.76l11.2-7.2a.9.9 0 0 0 0-1.52l-11.2-7.2a.9.9 0 0 0-1.38.76Z"></path></svg>
                  <svg class="tlab-ico-pause" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" hidden><rect x="6" y="4.5" width="4" height="15" rx="1.2"></rect><rect x="14" y="4.5" width="4" height="15" rx="1.2"></rect></svg>
                </button>
                <div class="tlab-transport-step-group">
                  <button type="button" class="tlab-mini-icon-btn" id="tlab-prev-sent" title="Previous sentence (J)" aria-label="Previous sentence">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>
                  </button>
                  <button type="button" class="tlab-mini-icon-btn" id="tlab-replay-btn" title="Replay active word or sentence (R)" aria-label="Replay">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                  </button>
                  <button type="button" class="tlab-mini-icon-btn" id="tlab-next-sent" title="Next sentence (K)" aria-label="Next sentence">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
                  </button>
                </div>
                <div class="tlab-player-readout">
                  <div class="tlab-active-clip-label" id="tlab-active-clip-label">Click any word to hear exact millisecond pronunciation</div>
                  <div class="tlab-clock-row ltr-num">
                    <span id="tlab-clock-now">00:00.000</span>
                    <span>/</span>
                    <span id="tlab-clock-total">${global.FlaptapMediaEngine.formatMs((doc.durationSeconds || 0) * 1000)}</span>
                  </div>
                </div>
                <button type="button" class="tlab-pill-xs tlab-define-pill" id="tlab-define-active-btn" title="Define selected word" hidden>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                  <span>Define</span>
                </button>
              </div>

              <div class="tlab-core-right">
                <div class="tlab-compact-progress" id="tlab-compact-progress" role="button" tabindex="0" aria-label="Mastery progress summary">
                  <span id="tlab-compact-ring-slot"></span>
                  <div class="tlab-compact-prog-meta">
                    <span class="tlab-compact-prog-frac ltr-num" id="tlab-compact-prog-frac">0/0</span>
                    <div class="tlab-compact-prog-track"><div class="tlab-compact-prog-fill" id="tlab-compact-prog-fill"></div></div>
                  </div>
                  <button type="button" class="tlab-jump-next-btn" id="tlab-jump-next-btn" title="Jump to next unstudied sentence" aria-label="Jump to next unstudied sentence" hidden>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </button>
                </div>

                ${
                  doc.media?.hasAudio
                    ? `<button type="button" class="tlab-pill-xs tlab-compact-speed ltr-num" id="tlab-compact-speed" title="Playback speed (click to open speed controls)" aria-label="Playback speed">1x</button>`
                    : ''
                }

                ${
                  canVideo
                    ? `<button type="button" class="tlab-icon-action-btn tlab-video-btn ${state.videoExpanded ? 'is-active' : ''}" id="tlab-video-toggle" title="${state.videoExpanded ? 'Hide original video' : 'Show original video'}" aria-label="Toggle original video preview" aria-pressed="${state.videoExpanded ? 'true' : 'false'}">
                         <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                       </button>`
                    : ''
                }

                <button type="button" class="tlab-icon-action-btn tlab-deck-collapse-btn" id="tlab-deck-collapse-btn" aria-expanded="true" title="Collapse secondary controls" aria-label="Toggle controls drawer">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                </button>
              </div>
            </div>

            <!-- INTERACTIVE SCRUBBABLE TIMELINE (Always visible, click or drag) -->
            <div class="tlab-player-progress-track" id="tlab-player-progress-track" title="Click or drag to seek" role="slider" aria-label="Playback timeline" ${doc.media?.hasAudio ? '' : 'hidden'}>
              <div class="tlab-player-progress-fill" id="tlab-player-progress-fill"></div>
              <div class="tlab-scrub-thumb" id="tlab-scrub-thumb" aria-hidden="true"></div>
              <div class="tlab-scrub-tooltip ltr-num" id="tlab-scrub-tooltip" hidden>00:00.000</div>
            </div>

            <div class="tlab-media-error" id="tlab-media-error" hidden></div>

            <!-- COLLAPSIBLE SECONDARY DRAWER (Progress Map + Speed/Loop/Pad/Follow + View Tabs & Search) -->
            <div class="tlab-deck-drawer" id="tlab-deck-drawer">
              <div class="tlab-deck-drawer-inner">
                <div class="tlab-doc-progress" id="tlab-doc-progress"></div>

                <div class="tlab-controls-strip" ${doc.media?.hasAudio ? '' : 'hidden'}>
                  <div class="tlab-control-group">
                    <span class="tlab-ctrl-icon-label" title="Playback speed">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14l4-4"></path><path d="M3.34 19a10 10 0 1 1 17.32 0"></path></svg>
                    </span>
                    <div class="tlab-seg-group" role="group" aria-label="Playback speed">
                      ${speeds
                        .map(
                          (sp) =>
                            `<button type="button" class="tlab-pill-xs ltr-num ${sp === 1 ? 'is-active' : ''}" data-tlab-speed="${sp}" title="Play at ${sp}x speed">${sp}x</button>`,
                        )
                        .join('')}
                    </div>
                  </div>

                  <div class="tlab-control-group">
                    <div class="tlab-seg-group" role="group" aria-label="Loop and shadow mode">
                      <button type="button" class="tlab-pill-xs is-active" data-tlab-loop="off" title="Play once and pause">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                        <span>Once</span>
                      </button>
                      <button type="button" class="tlab-pill-xs" data-tlab-loop="word" title="Loop clicked word continuously">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                        <span>Word</span>
                      </button>
                      <button type="button" class="tlab-pill-xs" data-tlab-loop="sentence" title="Loop active sentence continuously">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"></path><path d="M3 11v-1a4 4 0 0 1 4-4h14"></path><path d="M7 22l-4-4 4-4"></path><path d="M21 13v1a4 4 0 0 1-4 4H3"></path></svg>
                        <span>Sent</span>
                      </button>
                      <button type="button" class="tlab-pill-xs" data-tlab-loop="shadow" title="Shadow Gap: Play sentence, pause for you to speak, then repeat">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg>
                        <span>Shadow</span>
                      </button>
                    </div>

                    <button type="button" class="tlab-pill-xs" id="tlab-pad-toggle" title="Natural consonant cushion (-25ms/+55ms) vs Exact 0ms bounds">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"></path><path d="M16 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"></path></svg>
                      <span class="tlab-pad-label">Natural</span>
                    </button>

                    <button type="button" class="tlab-icon-action-btn is-active" id="tlab-follow-toggle" title="Auto-follow active sentence while playing" aria-label="Toggle live auto-scroll tracking" aria-pressed="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3"></path><path d="M12 19v3"></path><path d="M2 12h3"></path><path d="M19 12h3"></path></svg>
                    </button>
                  </div>
                </div>

                <div class="tlab-toolbar">
                  <nav class="tlab-view-tabs" role="tablist" aria-label="Transcript display views">
                    ${VIEW_DEFS.map(
                      (v) => `
                      <button type="button" class="tlab-view-tab ${state.activeView === v.id ? 'is-active' : ''}" data-tlab-view="${v.id}" role="tab" aria-selected="${state.activeView === v.id ? 'true' : 'false'}" title="${escapeHtml(v.label)} (Shortcut ${v.shortcut})">
                        ${viewIcons[v.id] || ''}
                        <span>${escapeHtml(v.label)}</span>
                      </button>`,
                    ).join('')}
                  </nav>

                  <div class="tlab-toolbar-right">
                    <div class="tlab-click-mode-switch" role="group" aria-label="Word click behavior">
                      <button type="button" class="tlab-pill-xs ${state.clickMode === 'word' ? 'is-active' : ''}" data-click-mode="word" title="Clicking a word plays only that exact word">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V4h16v3"></path><path d="M9 20h6"></path><path d="M12 4v16"></path></svg>
                        <span>Word</span>
                      </button>
                      <button type="button" class="tlab-pill-xs ${state.clickMode === 'from-here' ? 'is-active' : ''}" data-click-mode="from-here" title="Clicking a word plays continuously from that word">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon><line x1="20" y1="4" x2="20" y2="20"></line></svg>
                        <span>From Here</span>
                      </button>
                    </div>
                    <button type="button" class="tlab-pill-xs tlab-repairs-toggle ${state.showRepairs ? 'is-active' : ''}" id="tlab-toggle-repairs" title="Highlight words and sentences repaired from raw captions">
                      <span class="tlab-repair-dot" aria-hidden="true"></span>
                      <span>${repairedCount > 0 ? repairedCount : 'Repairs'}</span>
                    </button>
                    <div class="tlab-search-box">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                      <input type="search" id="tlab-search-input" placeholder="Search…" value="${escapeHtml(state.searchQuery)}" aria-label="Search transcript words" />
                      <span class="tlab-search-count ltr-num" id="tlab-search-count" hidden></span>
                      <button type="button" class="tlab-search-nav-btn" id="tlab-search-prev" title="Previous match (Shift+Enter)" aria-label="Previous match" hidden>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="18 15 12 9 6 15"></polyline></svg>
                      </button>
                      <button type="button" class="tlab-search-nav-btn" id="tlab-search-next" title="Next match (Enter)" aria-label="Next match" hidden>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="6 9 12 15 18 9"></polyline></svg>
                      </button>
                      <button type="button" class="tlab-search-nav-btn" id="tlab-search-clear" title="Clear search" aria-label="Clear search" hidden>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    </div>
                    <button type="button" class="tlab-icon-action-btn tlab-copy-icon-btn" id="tlab-copy-view-btn" title="Copy active view text" aria-label="Copy active view text">
                      <svg class="tlab-ico-copy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                      <svg class="tlab-ico-copied" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <div class="tlab-deck-spacer" id="tlab-deck-spacer" aria-hidden="true"></div>

          <!-- SPEAKER FILTER & RENAME BAR -->
          <div class="tlab-speaker-bar" id="tlab-speaker-bar" hidden></div>

          <!-- RESUME AUTO-SCROLL PILL -->
          <button type="button" class="tlab-resume-scroll-btn" id="tlab-resume-scroll" hidden>Resume live tracking</button>

          <!-- MAIN TRANSCRIPT CANVAS -->
          <div class="tlab-transcript-canvas" id="tlab-transcript-canvas"></div>

          <!-- FLOATING HOVER / CLICK DETAIL POPOVER -->
          <div class="tlab-info-popover" id="tlab-info-popover" role="tooltip" hidden></div>
        </div>
      `;

      // Mount media engine into slot
      const slot = state.rootEl.querySelector('#tlab-media-slot');
      initMediaEngine();
      if (slot && doc.media?.hasAudio) {
        state.engine.mount(slot, doc.media);
      }

      onShellRendered();
      bindWorkbenchEvents();
      syncProgressBar();
      setupDeckObserver();
      syncDeckCollapseState();
      renderViewContent();
      renderExportMenu();
    }

    function bindWorkbenchEvents() {
      if (!state.rootEl) return;

      // Progress pip click -> jump & highlight sentence
      state.rootEl.querySelector('#tlab-doc-progress')?.addEventListener('click', (e) => {
        const pip = e.target.closest('[data-tlab-jump-sent]');
        if (!pip) return;
        const idx = Number(pip.getAttribute('data-tlab-jump-sent'));
        if (!Number.isFinite(idx)) return;
        const row = state.rootEl.querySelector(`.tlab-sentence-row[data-sent-idx="${idx}"]`);
        if (row) {
          setActiveSentenceHighlight(idx);
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });

      // View switcher
      state.rootEl.querySelectorAll('[data-tlab-view]').forEach((btn) => {
        btn.addEventListener('click', () => setView(btn.dataset.tlabView));
      });

      // Click behavior toggle
      state.rootEl.querySelectorAll('[data-click-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.clickMode = btn.dataset.clickMode === 'from-here' ? 'from-here' : 'word';
          state.rootEl.querySelectorAll('[data-click-mode]').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.clickMode === state.clickMode);
          });
          toast(
            state.clickMode === 'word'
              ? 'Word Click: Plays exact single word.'
              : 'Word Click: Plays continuously from clicked word.',
          );
        });
      });

      state.rootEl.querySelector('#tlab-toggle-repairs')?.addEventListener('click', (e) => {
        state.showRepairs = !state.showRepairs;
        e.currentTarget.classList.toggle('is-active', state.showRepairs);
        renderViewContent();
      });

      state.rootEl.querySelector('#tlab-back-library')?.addEventListener('click', () => {
        nav.goToLibrary?.();
      });

      state.rootEl.querySelector('#tlab-send-phrases')?.addEventListener('click', () => {
        if (!state.doc?.sourceUrl) return;
        global.FlaptapRouter?.navigate('american-extractor', {
          extraQuery: { url: state.doc.sourceUrl },
        });
      });

      state.rootEl.querySelector('#tlab-rerun-review-btn')?.addEventListener('click', () => {
        runReview({ force: true });
      });

      // Rename document inline (zero window.prompt)
      const titleEl = state.rootEl.querySelector('#tlab-doc-title');
      const editWrap = state.rootEl.querySelector('#tlab-title-edit-wrap');
      const titleInput = state.rootEl.querySelector('#tlab-title-input');
      const renameBtn = state.rootEl.querySelector('#tlab-rename-btn');

      const setTitleEditMode = (editing) => {
        state.editingTitle = editing;
        if (titleEl) titleEl.hidden = editing;
        if (renameBtn) renameBtn.hidden = editing;
        if (editWrap) editWrap.hidden = !editing;
        if (editing && titleInput && state.doc) {
          titleInput.value = state.doc.title;
          titleInput.focus();
          titleInput.select();
        }
      };

      const saveInlineTitle = async () => {
        if (!state.doc || !titleInput) return setTitleEditMode(false);
        const nextTitle = titleInput.value.trim();
        if (!nextTitle || nextTitle === state.doc.title) {
          setTitleEditMode(false);
          return;
        }
        try {
          const res = await api.renameDoc(state.doc.id, nextTitle);
          state.doc = res.data;
          if (titleEl) titleEl.textContent = state.doc.title;
          onDocUpdated(state.doc);
          setTitleEditMode(false);
          toast('Transcript renamed.');
        } catch (err) {
          toast(err?.message || 'Could not rename transcript.');
        }
      };

      renameBtn?.addEventListener('click', () => setTitleEditMode(true));
      state.rootEl.querySelector('#tlab-title-save-btn')?.addEventListener('click', saveInlineTitle);
      state.rootEl.querySelector('#tlab-title-cancel-btn')?.addEventListener('click', () => setTitleEditMode(false));
      titleInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveInlineTitle();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setTitleEditMode(false);
        }
      });

      // Single-speaker rename button in header meta line
      state.rootEl.querySelector('#tlab-single-spk-btn')?.addEventListener('click', () => {
        state.speakerEditorOpen = !state.speakerEditorOpen;
        renderViewContent();
        if (state.speakerEditorOpen) {
          state.rootEl.querySelector('.tlab-spk-input')?.focus();
        }
      });

      // Export popover
      state.rootEl.querySelector('#tlab-export-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        state.exportMenuOpen = !state.exportMenuOpen;
        e.currentTarget.setAttribute('aria-expanded', state.exportMenuOpen ? 'true' : 'false');
        renderExportMenu();
      });

      state.rootEl.querySelector('#tlab-export-popover')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const viewBtn = e.target.closest('[data-exp-view]');
        if (viewBtn) {
          state.exportViewChoice = viewBtn.dataset.expView;
          renderExportMenu();
          return;
        }
        if (e.target.id === 'tlab-exp-ts') {
          state.exportIncludeTs = e.target.checked;
          return;
        }
        if (e.target.id === 'tlab-exp-spk') {
          state.exportIncludeSpeakers = e.target.checked;
          return;
        }
        const fmtBtn = e.target.closest('[data-exp-format]');
        if (fmtBtn && state.doc) {
          const view = state.exportViewChoice === 'active' ? state.activeView : state.exportViewChoice;
          const format = fmtBtn.dataset.expFormat;
          try {
            const filename = await api.downloadExport(state.doc.id, {
              view,
              format,
              includeTimestamps: state.exportIncludeTs,
              includeSpeakers: state.exportIncludeSpeakers,
            });
            state.exportMenuOpen = false;
            renderExportMenu();
            toast(`Downloaded ${filename}`);
          } catch (err) {
            toast(err?.message || 'Export failed.');
          }
        }
      });

      // Copy entire active view
      state.rootEl.querySelector('#tlab-copy-view-btn')?.addEventListener('click', (e) => {
        copyActiveViewText();
        flashCopiedBtn(e.currentTarget);
      });

      // Click or drag interactive scrub timeline
      const scrubTrack = state.rootEl.querySelector('#tlab-player-progress-track');
      const scrubTip = state.rootEl.querySelector('#tlab-scrub-tooltip');
      if (scrubTrack) {
        const calcScrub = (clientX) => {
          const durMs = state.engine?.getState?.().durationMs || (state.doc?.durationSeconds || 0) * 1000;
          if (!durMs) return null;
          const rect = scrubTrack.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
          return { ratio, ms: Math.round(ratio * durMs), durMs };
        };

        const showScrubHover = (clientX) => {
          const info = calcScrub(clientX);
          if (!info || !scrubTip) return;
          scrubTip.hidden = false;
          scrubTip.textContent = global.FlaptapMediaEngine.formatMs(info.ms);
          scrubTip.style.left = `${(info.ratio * 100).toFixed(2)}%`;
        };

        scrubTrack.addEventListener('pointermove', (e) => {
          showScrubHover(e.clientX);
          if (state.scrubbing) {
            const info = calcScrub(e.clientX);
            if (info) {
              updateScrubVisuals(info.ratio * 100);
              const clockEl = state.rootEl.querySelector('#tlab-clock-now');
              if (clockEl) clockEl.textContent = global.FlaptapMediaEngine.formatMs(info.ms);
            }
          }
        });

        scrubTrack.addEventListener('pointerleave', () => {
          if (!state.scrubbing && scrubTip) scrubTip.hidden = true;
        });

        scrubTrack.addEventListener('pointerdown', (e) => {
          const info = calcScrub(e.clientX);
          if (!info) return;
          state.scrubbing = true;
          scrubTrack.classList.add('is-scrubbing');
          try { scrubTrack.setPointerCapture(e.pointerId); } catch {}
          updateScrubVisuals(info.ratio * 100);
          showScrubHover(e.clientX);
        });

        const finishScrub = (e) => {
          if (!state.scrubbing) return;
          state.scrubbing = false;
          scrubTrack.classList.remove('is-scrubbing');
          if (scrubTip) scrubTip.hidden = true;
          const info = calcScrub(e.clientX);
          if (info) {
            if (state.engine?.getState?.().playing) {
              state.engine.seek(info.ms);
            } else {
              state.engine?.playContinuousFrom?.(info.ms, global.FlaptapMediaEngine.formatShort(info.ms));
            }
          }
        };

        scrubTrack.addEventListener('pointerup', finishScrub);
        scrubTrack.addEventListener('pointercancel', () => {
          state.scrubbing = false;
          scrubTrack.classList.remove('is-scrubbing');
          if (scrubTip) scrubTip.hidden = true;
        });
      }

      // Search input + Prev / Next match navigation + Clear
      const searchInput = state.rootEl.querySelector('#tlab-search-input');
      const searchCountEl = state.rootEl.querySelector('#tlab-search-count');
      const searchPrevBtn = state.rootEl.querySelector('#tlab-search-prev');
      const searchNextBtn = state.rootEl.querySelector('#tlab-search-next');
      const searchClearBtn = state.rootEl.querySelector('#tlab-search-clear');

      const focusSearchHit = (idx) => {
        const hits = Array.from(state.rootEl.querySelectorAll('.tlab-word.is-search-hit'));
        hits.forEach((h) => h.classList.remove('is-search-current'));
        if (!hits.length) {
          state.searchMatchIdx = 0;
          if (searchCountEl && state.searchQuery.trim()) searchCountEl.textContent = '0';
          return;
        }
        const safeIdx = ((idx % hits.length) + hits.length) % hits.length;
        state.searchMatchIdx = safeIdx;
        hits[safeIdx].classList.add('is-search-current');
        if (searchCountEl) searchCountEl.textContent = `${safeIdx + 1}/${hits.length}`;
        hits[safeIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
      };

      const syncSearchUi = () => {
        const hasQuery = Boolean(state.searchQuery.trim());
        const hits = state.rootEl.querySelectorAll('.tlab-word.is-search-hit');
        if (searchCountEl) searchCountEl.hidden = !hasQuery;
        if (searchPrevBtn) searchPrevBtn.hidden = !hasQuery || hits.length === 0;
        if (searchNextBtn) searchNextBtn.hidden = !hasQuery || hits.length === 0;
        if (searchClearBtn) searchClearBtn.hidden = !hasQuery;
        if (hasQuery) {
          focusSearchHit(0);
        }
      };

      searchInput?.addEventListener('input', () => {
        state.searchQuery = searchInput.value || '';
        renderViewContent();
        syncSearchUi();
      });
      searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          focusSearchHit(state.searchMatchIdx + (e.shiftKey ? -1 : 1));
        } else if (e.key === 'Escape' && state.searchQuery) {
          e.preventDefault();
          state.searchQuery = '';
          searchInput.value = '';
          renderViewContent();
          syncSearchUi();
        }
      });
      searchPrevBtn?.addEventListener('click', () => focusSearchHit(state.searchMatchIdx - 1));
      searchNextBtn?.addEventListener('click', () => focusSearchHit(state.searchMatchIdx + 1));
      searchClearBtn?.addEventListener('click', () => {
        state.searchQuery = '';
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        renderViewContent();
        syncSearchUi();
      });

      // Player controls
      state.rootEl.querySelector('#tlab-play-toggle')?.addEventListener('click', () => state.engine?.togglePlay());
      state.rootEl.querySelector('#tlab-prev-sent')?.addEventListener('click', () => stepSentence(-1));
      state.rootEl.querySelector('#tlab-next-sent')?.addEventListener('click', () => stepSentence(1));
      state.rootEl.querySelector('#tlab-replay-btn')?.addEventListener('click', () => state.engine?.replayActive());
      state.rootEl.querySelector('#tlab-skip-pause')?.addEventListener('click', () => state.engine?.replayActive());

      state.rootEl.querySelectorAll('[data-tlab-speed]').forEach((btn) => {
        btn.addEventListener('click', () => state.engine?.setSpeed(Number(btn.dataset.tlabSpeed)));
      });
      state.rootEl.querySelectorAll('[data-tlab-loop]').forEach((btn) => {
        btn.addEventListener('click', () => state.engine?.setLoopMode(btn.dataset.tlabLoop));
      });
      state.rootEl.querySelector('#tlab-pad-toggle')?.addEventListener('click', () => {
        const cur = state.engine?.getState()?.wordPadMode || 'natural';
        state.engine?.setWordPadMode(cur === 'exact' ? 'natural' : 'exact');
      });
      state.rootEl.querySelector('#tlab-video-toggle')?.addEventListener('click', (e) => {
        state.videoExpanded = !state.videoExpanded;
        const stage = state.rootEl.querySelector('#tlab-video-stage');
        if (stage) {
          stage.classList.toggle('is-open', state.videoExpanded);
          stage.classList.toggle('is-audio-hidden', !state.videoExpanded);
        }
        e.currentTarget.classList.toggle('is-active', state.videoExpanded);
        e.currentTarget.setAttribute('aria-pressed', state.videoExpanded ? 'true' : 'false');
        e.currentTarget.title = state.videoExpanded ? 'Hide original video' : 'Show original video';
        if (state.videoExpanded) state.engine?.ensureReady?.().catch(() => {});
      });

      // Collapse / expand sticky Command Deck secondary drawer
      const toggleDeckCollapse = () => {
        if (state.isStuck) {
          state.stuckExpanded = !state.stuckExpanded;
        } else {
          state.topCollapsed = !state.topCollapsed;
        }
        syncDeckCollapseState();
      };

      state.rootEl.querySelector('#tlab-deck-collapse-btn')?.addEventListener('click', toggleDeckCollapse);

      state.rootEl.querySelector('#tlab-compact-speed')?.addEventListener('click', () => {
        if (state.isStuck && !state.stuckExpanded) {
          state.stuckExpanded = true;
          syncDeckCollapseState();
        } else if (!state.isStuck && state.topCollapsed) {
          state.topCollapsed = false;
          syncDeckCollapseState();
        } else {
          toggleDeckCollapse();
        }
      });

      state.rootEl.querySelector('#tlab-compact-progress')?.addEventListener('click', (e) => {
        const jumpBtn = e.target.closest('#tlab-jump-next-btn');
        if (jumpBtn && state.doc) {
          e.stopPropagation();
          const completedSet = new Set(state.doc.completion?.items || []);
          const nextSent = activeSentences().find((s) => !completedSet.has(s.index));
          if (nextSent) {
            const row = state.rootEl.querySelector(`.tlab-sentence-row[data-sent-idx="${nextSent.index}"]`);
            if (row) {
              setActiveSentenceHighlight(nextSent.index);
              row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
          return;
        }
        toggleDeckCollapse();
      });

      state.rootEl.querySelector('#tlab-follow-toggle')?.addEventListener('click', (e) => {
        state.autoScrollPaused = !state.autoScrollPaused;
        const following = !state.autoScrollPaused;
        e.currentTarget.classList.toggle('is-active', following);
        e.currentTarget.setAttribute('aria-pressed', following ? 'true' : 'false');
        const resumeBtn = state.rootEl?.querySelector('#tlab-resume-scroll');
        if (resumeBtn) resumeBtn.hidden = following;
        toast(following ? 'Auto-follow enabled.' : 'Auto-follow paused.');
      });

      state.rootEl.querySelector('#tlab-define-active-btn')?.addEventListener('click', (e) => {
        if (!state.selectedWord) return;
        triggerWordLookup(
          state.selectedWord.word,
          state.selectedWord.sentenceText,
          state.selectedWord.sentenceIndex,
          state.selectedWord.startMs,
          e.currentTarget,
        );
      });

      // Speaker filter & rename bar delegation
      state.rootEl.querySelector('#tlab-speaker-bar')?.addEventListener('click', async (e) => {
        const filterBtn = e.target.closest('[data-spk-filter]');
        if (filterBtn) {
          state.speakerFilter = filterBtn.dataset.spkFilter || 'all';
          renderViewContent();
          return;
        }
        if (e.target.closest('#tlab-toggle-spk-edit')) {
          state.speakerEditorOpen = !state.speakerEditorOpen;
          renderViewContent();
          return;
        }
        if (e.target.closest('#tlab-cancel-speakers-btn')) {
          state.speakerEditorOpen = false;
          renderViewContent();
          return;
        }
        if (e.target.closest('#tlab-save-speakers-btn') && state.doc) {
          const overrides = {};
          state.rootEl.querySelectorAll('[data-spk-rename]').forEach((inp) => {
            const id = inp.dataset.spkRename;
            if (id) overrides[id] = inp.value.trim();
          });
          try {
            const res = await api.renameSpeakers(state.doc.id, overrides);
            state.doc = res.data;
            state.speakerEditorOpen = false;
            onDocUpdated(state.doc);
            renderViewContent();
            toast('Speaker names updated.');
          } catch (err) {
            toast(err?.message || 'Could not update speaker names.');
          }
        }
      });

      // Main Transcript Canvas event delegation (Word click, Right-click define, Sentence play, Check, Copy)
      const canvas = state.rootEl.querySelector('#tlab-transcript-canvas');
      canvas?.addEventListener('click', async (e) => {
        if (e.target.closest('#tlab-trigger-review-inline')) {
          runReview({ force: true });
          return;
        }
        if (e.target.closest('#tlab-copy-raw-btn') && state.doc) {
          copyToClipboard(state.doc.raw.fullText, 'Copied raw original transcript.');
          return;
        }

        // 1. Word Click -> Instant Millisecond Playback!
        const wordEl = e.target.closest('.tlab-word');
        if (wordEl) {
          const wordI = Number(wordEl.dataset.wordI);
          const startMs = Number(wordEl.dataset.startMs);
          const endMs = Number(wordEl.dataset.endMs);
          const sentIdx = Number(wordEl.dataset.sentIdx) || 1;
          const wordText = wordEl.textContent || '';
          const sentObj = activeSentences().find((s) => s.index === sentIdx);

          state.selectedWord = {
            word: wordText,
            sentenceText: sentObj?.text || wordText,
            sentenceIndex: sentIdx,
            startMs,
            endMs,
          };

          if (e.altKey) {
            triggerWordLookup(wordText, sentObj?.text || wordText, sentIdx, startMs, wordEl);
            return;
          }

          highlightActiveWord(wordI, sentIdx);
          if (e.shiftKey || state.clickMode === 'from-here') {
            state.engine?.playContinuousFrom(startMs, wordText);
          } else {
            state.engine?.playWord(
              { i: wordI, word: wordText, startMs, endMs },
              { sentenceIndex: sentIdx },
            );
          }
          return;
        }

        // 2. Sentence Play Button
        const playSentBtn = e.target.closest('[data-play-sent]');
        if (playSentBtn) {
          const sIdx = Number(playSentBtn.dataset.playSent);
          const sObj = activeSentences().find((s) => s.index === sIdx);
          if (sObj) {
            setActiveSentenceHighlight(sObj.index);
            state.engine?.playRange(sObj.startMs, sObj.endMs, {
              kind: 'sentence',
              label: `#${sObj.index} ${sObj.text.slice(0, 40)}`,
              meta: { sentenceIndex: sObj.index },
            });
          }
          return;
        }

        // 3. Paragraph / Idea / Speaker Turn Play Button
        const playRangeBtn = e.target.closest('[data-play-range]');
        if (playRangeBtn) {
          const [sMs, eMs] = String(playRangeBtn.dataset.playRange || '').split(':').map(Number);
          if (Number.isFinite(sMs) && Number.isFinite(eMs)) {
            state.engine?.playRange(sMs, eMs, {
              kind: 'range',
              label: playRangeBtn.dataset.rangeLabel || 'Section',
            });
          }
          return;
        }

        // 4. Sentence Check Button (Real Derived Completion!)
        const checkBtn = e.target.closest('[data-tlab-check]');
        if (checkBtn && state.doc) {
          const sIdx = Number(checkBtn.dataset.tlabCheck);
          const completedSet = new Set(state.doc.completion?.items || []);
          const nextDone = !completedSet.has(sIdx);
          try {
            const res = await api.toggleCompletion(state.doc.id, sIdx, nextDone);
            state.doc.completion = res.completion;
            state.doc.completedCount = res.completedCount;
            state.doc.isCompleted = res.isCompleted;
            syncProgressBar();
            onDocUpdated(state.doc);
            if (global.FlaptapCheck?.setState) {
              global.FlaptapCheck.setState(checkBtn, nextDone);
            }
            const row = checkBtn.closest('.tlab-sentence-row');
            if (row) row.classList.toggle('is-completed', nextDone);
            if (res.isCompleted && global.FlaptapCelebrate?.trigger) {
              global.FlaptapCelebrate.trigger({ title: 'Transcript mastered!' });
            }
          } catch (err) {
            toast(err?.message || 'Could not update progress.');
          }
          return;
        }

        // 5. Copy Sentence / Section
        const copySentBtn = e.target.closest('[data-copy-sent]');
        if (copySentBtn) {
          const sIdx = Number(copySentBtn.dataset.copySent);
          const sObj = activeSentences().find((s) => s.index === sIdx);
          if (sObj) {
            copyToClipboard(sObj.text, `Copied sentence #${sObj.index}.`);
            flashCopiedBtn(copySentBtn);
          }
          return;
        }
        const copyTextBtn = e.target.closest('[data-copy-text]');
        if (copyTextBtn) {
          copyToClipboard(copyTextBtn.dataset.copyText || '', 'Copied to clipboard.');
          flashCopiedBtn(copyTextBtn);
        }
      });

      // Repair / Overlap icon-only indicator hover & click rich popover
      const infoPop = state.rootEl.querySelector('#tlab-info-popover');

      const hideInfoPopover = (force = false) => {
        if (state.infoCloseTimer) {
          clearTimeout(state.infoCloseTimer);
          state.infoCloseTimer = null;
        }
        if (!force && state.infoPopoverState.pinned) return;
        state.infoPopoverState.open = false;
        state.infoPopoverState.pinned = false;
        state.infoPopoverState.anchorEl?.classList.remove('is-popover-open');
        state.infoPopoverState.anchorEl = null;
        if (infoPop) infoPop.hidden = true;
      };

      const scheduleHideInfoPopover = () => {
        if (state.infoPopoverState.pinned) return;
        if (state.infoCloseTimer) clearTimeout(state.infoCloseTimer);
        state.infoCloseTimer = setTimeout(() => hideInfoPopover(false), 160);
      };

      const showInfoPopover = (btnEl, kind, sentIdx, pinned = false) => {
        if (!infoPop || !btnEl || !state.doc) return;
        if (state.infoCloseTimer) {
          clearTimeout(state.infoCloseTimer);
          state.infoCloseTimer = null;
        }

        const sent = activeSentences().find((s) => s.index === sentIdx);
        if (!sent) return;

        let html = '';
        if (kind === 'repair') {
          const diffs = (sent.words || []).filter((w) => w.repaired);
          const diffRows = diffs.slice(0, 6)
            .map(
              (w) => `
              <div class="tlab-info-diff-item">
                <span class="tlab-diff-old">${escapeHtml(w.rawWord || '(inserted)')}</span>
                <span class="tlab-diff-arrow" aria-hidden="true">→</span>
                <span class="tlab-diff-new">${escapeHtml(w.word)}</span>
              </div>`,
            )
            .join('');
          html = `
            <div class="tlab-info-pop-head is-repair">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z"></path></svg>
              <strong>ASR Caption Repaired</strong>
              <span class="tlab-info-badge">${diffs.length || 1} fix${diffs.length === 1 ? '' : 'es'}</span>
            </div>
            ${diffRows ? `<div class="tlab-info-diff-list">${diffRows}</div>` : ''}
            ${sent.repairNote ? `<p class="tlab-info-pop-note">${escapeHtml(sent.repairNote)}</p>` : ''}
            <p class="tlab-info-pop-foot">AI fixed misheard caption text while preserving exact millisecond timing.</p>
          `;
        } else {
          html = `
            <div class="tlab-info-pop-head is-overlap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"></path><path d="M4 20L21 3"></path><path d="M21 16v5h-5"></path><path d="M15 15l6 6"></path><path d="M4 4l5 5"></path></svg>
              <strong>Overlapping Speech Separated</strong>
            </div>
            <p class="tlab-info-pop-foot">AI separated simultaneous speakers into clean turns while preserving millisecond boundaries.</p>
          `;
        }

        state.infoPopoverState.anchorEl?.classList.remove('is-popover-open');
        state.infoPopoverState = { open: true, pinned, kind, sentIdx, anchorEl: btnEl };
        btnEl.classList.add('is-popover-open');

        infoPop.innerHTML = html;
        infoPop.hidden = false;

        // Position anchored to button with viewport clamping
        const rect = btnEl.getBoundingClientRect();
        const popRect = infoPop.getBoundingClientRect();
        const margin = 12;
        const left = Math.max(
          margin,
          Math.min(global.innerWidth - popRect.width - margin, rect.right - popRect.width),
        );
        const fitsBelow = rect.bottom + 8 + popRect.height <= global.innerHeight - margin;
        const top = fitsBelow ? rect.bottom + 8 : Math.max(margin, rect.top - popRect.height - 8);
        infoPop.style.left = `${Math.round(left)}px`;
        infoPop.style.top = `${Math.round(top)}px`;
      };

      canvas?.addEventListener('mouseover', (e) => {
        const btn = e.target.closest('[data-tlab-info]');
        if (!btn || state.infoPopoverState.pinned) return;
        showInfoPopover(btn, btn.dataset.tlabInfo, Number(btn.dataset.sentIdx), false);
      });
      canvas?.addEventListener('mouseout', (e) => {
        const btn = e.target.closest('[data-tlab-info]');
        if (btn && !btn.contains(e.relatedTarget)) {
          scheduleHideInfoPopover();
        }
      });
      canvas?.addEventListener('focusin', (e) => {
        const btn = e.target.closest('[data-tlab-info]');
        if (btn && !state.infoPopoverState.pinned) {
          showInfoPopover(btn, btn.dataset.tlabInfo, Number(btn.dataset.sentIdx), false);
        }
      });
      canvas?.addEventListener('focusout', (e) => {
        const btn = e.target.closest('[data-tlab-info]');
        if (btn && !state.infoPopoverState.pinned) {
          scheduleHideInfoPopover();
        }
      });
      canvas?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-tlab-info]');
        if (!btn) return;
        e.stopPropagation();
        const sentIdx = Number(btn.dataset.sentIdx);
        const kind = btn.dataset.tlabInfo;
        const sameTarget =
          state.infoPopoverState.open &&
          state.infoPopoverState.pinned &&
          state.infoPopoverState.sentIdx === sentIdx &&
          state.infoPopoverState.kind === kind;
        if (sameTarget) {
          hideInfoPopover(true);
        } else {
          showInfoPopover(btn, kind, sentIdx, true);
        }
      });
      infoPop?.addEventListener('mouseenter', () => {
        if (state.infoCloseTimer) {
          clearTimeout(state.infoCloseTimer);
          state.infoCloseTimer = null;
        }
      });
      infoPop?.addEventListener('mouseleave', () => scheduleHideInfoPopover());
      infoPop?.addEventListener('click', (e) => e.stopPropagation());

      // Right-click any word -> Instant Contextual Dictionary & Vocabulary Save!
      canvas?.addEventListener('contextmenu', (e) => {
        const wordEl = e.target.closest('.tlab-word');
        if (!wordEl) return;
        e.preventDefault();
        const sentIdx = Number(wordEl.dataset.sentIdx) || 1;
        const startMs = Number(wordEl.dataset.startMs) || 0;
        const wordText = wordEl.textContent || '';
        const sentObj = activeSentences().find((s) => s.index === sentIdx);
        triggerWordLookup(wordText, sentObj?.text || wordText, sentIdx, startMs, wordEl);
      });

      // Manual scroll pauses live auto-scroll tracking and shows floating Resume pill
      if (state.scrollHandler) global.removeEventListener('scroll', state.scrollHandler);
      state.scrollHandler = () => {
        if (!state.doc || !state.engine?.getState?.().playing) return;
        if (Date.now() - state.lastProgrammaticScrollAt < 650) return;
        if (!state.autoScrollPaused) {
          state.autoScrollPaused = true;
          const resumeBtn = state.rootEl?.querySelector('#tlab-resume-scroll');
          if (resumeBtn) resumeBtn.hidden = false;
          const followBtn = state.rootEl?.querySelector('#tlab-follow-toggle');
          if (followBtn) {
            followBtn.classList.remove('is-active');
            followBtn.setAttribute('aria-pressed', 'false');
          }
        }
      };
      global.addEventListener('scroll', state.scrollHandler, { passive: true });

      // Resume auto-scroll pill
      state.rootEl.querySelector('#tlab-resume-scroll')?.addEventListener('click', (e) => {
        state.autoScrollPaused = false;
        e.currentTarget.hidden = true;
        const followBtn = state.rootEl?.querySelector('#tlab-follow-toggle');
        if (followBtn) {
          followBtn.classList.add('is-active');
          followBtn.setAttribute('aria-pressed', 'true');
        }
      });

      // Close export menu & info popover on outside click / Escape
      if (state.docClickHandler) document.removeEventListener('click', state.docClickHandler);
      state.docClickHandler = () => {
        if (state.exportMenuOpen) {
          state.exportMenuOpen = false;
          renderExportMenu();
        }
        if (state.infoPopoverState.open) {
          hideInfoPopover(true);
        }
      };
      document.addEventListener('click', state.docClickHandler);

      // Keyboard shortcuts (Space, R, J/K, 1-5, Escape)
      if (state.keydownHandler) document.removeEventListener('keydown', state.keydownHandler);
      state.keydownHandler = (e) => {
        if (!state.doc || !state.rootEl || state.rootEl.closest('[hidden]')) return;
        if (e.key === 'Escape' && state.infoPopoverState.open) {
          hideInfoPopover(true);
          return;
        }
        const tag = (e.target?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;

        if (e.key === ' ') {
          e.preventDefault();
          state.engine?.togglePlay();
        } else if (e.key.toLowerCase() === 'r') {
          e.preventDefault();
          state.engine?.replayActive();
        } else if (e.key.toLowerCase() === 'j') {
          e.preventDefault();
          stepSentence(-1);
        } else if (e.key.toLowerCase() === 'k') {
          e.preventDefault();
          stepSentence(1);
        } else if (['1', '2', '3', '4', '5'].includes(e.key)) {
          const def = VIEW_DEFS[Number(e.key) - 1];
          if (def) setView(def.id);
        }
      };
      document.addEventListener('keydown', state.keydownHandler);
    }

    function flashCopiedBtn(btn) {
      if (!btn) return;
      btn.classList.add('is-copied');
      clearTimeout(btn._copyFlashTimer);
      btn._copyFlashTimer = setTimeout(() => btn.classList.remove('is-copied'), 1200);
    }

    function copyToClipboard(text, message) {
      if (global.FlaptapCopy?.writeClipboard) {
        global.FlaptapCopy.writeClipboard(text).then(() => toast(message)).catch(() => toast(message));
      } else if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => toast(message)).catch(() => {});
      }
    }

    function copyActiveViewText() {
      if (!state.doc) return;
      const view = state.activeView;
      const reviewed = state.doc.reviewed;
      let text = '';
      if (view === 'raw' || !reviewed) {
        text = state.doc.raw.fullText;
      } else if (view === 'paragraphs') {
        text = reviewed.paragraphs.map((p) => p.text).join('\n\n');
      } else if (view === 'ideas') {
        text = reviewed.ideas
          .map((idea) => `${idea.index}. ${idea.title}\n${idea.summary ? idea.summary + '\n' : ''}`)
          .join('\n');
      } else if (view === 'speakers') {
        text = reviewed.speakerTurns.map((t) => `${t.speaker}: ${t.text}`).join('\n\n');
      } else {
        text = reviewed.sentences.map((s) => s.text).join('\n');
      }
      copyToClipboard(text, `Copied ${view} view to clipboard.`);
    }

    function setView(viewId, opts = {}) {
      const valid = VIEW_DEFS.some((v) => v.id === viewId) ? viewId : 'sentences';
      state.activeView = valid;
      state.activeWordIndex = -1;

      state.rootEl?.querySelectorAll('[data-tlab-view]').forEach((b) => {
        const active = b.dataset.tlabView === valid;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      if (!opts.skipRoute && state.doc && global.FlaptapRouter) {
        global.FlaptapRouter.updateSubroute('transcript-lab', {
          subview: 'view',
          docId: state.doc.id,
          view: valid,
          replace: true,
        });
      }

      renderViewContent();
      renderExportMenu();
    }

    async function runReview(opts = {}) {
      if (!state.doc || state.reviewing) return;
      state.reviewing = true;
      state.reviewProgress = { percent: 8, message: 'Starting AI verbatim review…' };
      const banner = state.rootEl?.querySelector('#tlab-review-banner');
      if (banner) banner.hidden = false;
      const btn = state.rootEl?.querySelector('#tlab-rerun-review-btn');
      if (btn) {
        btn.disabled = true;
        btn.classList.add('is-spinning');
        btn.title = 'AI Review running…';
      }

      if (state.reviewAbort) state.reviewAbort.abort();
      state.reviewAbort = new AbortController();

      const aiSel = getAiSelection() || {};
      try {
        const updatedDoc = await api.reviewDocStream(
          state.doc.id,
          {
            keyId: aiSel.keyId || undefined,
            model: aiSel.model || undefined,
            variant: aiSel.variant || 'none',
            force: Boolean(opts.force),
          },
          {
            signal: state.reviewAbort.signal,
            onProgress: (ev) => {
              state.reviewProgress = ev;
              const msgEl = state.rootEl?.querySelector('#tlab-review-msg');
              const pctEl = state.rootEl?.querySelector('#tlab-review-pct');
              const fillEl = state.rootEl?.querySelector('#tlab-review-fill');
              if (msgEl && ev.message) msgEl.textContent = ev.message;
              if (pctEl && Number.isFinite(ev.percent)) pctEl.textContent = `${ev.percent}%`;
              if (fillEl && Number.isFinite(ev.percent)) fillEl.style.width = `${ev.percent}%`;
            },
          },
        );
        state.doc = updatedDoc;
        state.reviewing = false;
        onDocUpdated(updatedDoc);
        renderShell();
        toast('AI review complete — every word aligned to milliseconds.');
      } catch (err) {
        state.reviewing = false;
        if (err?.name !== 'AbortError') {
          toast(err?.message || 'AI review could not complete. Raw transcript remains fully playable.');
          renderShell();
        }
      }
    }

    function mount(rootEl) {
      state.rootEl = rootEl;
    }

    function openDoc(doc, opts = {}) {
      state.doc = doc;
      state.speakerFilter = 'all';
      state.speakerEditorOpen = false;
      state.exportMenuOpen = false;
      state.searchQuery = '';
      state.selectedWord = null;
      state.activeWordIndex = -1;
      state.activeSentenceIndex = -1;
      state.autoScrollPaused = false;
      state.isStuck = false;
      state.topCollapsed = false;
      state.stuckExpanded = false;
      state.scrubbing = false;
      const initialView = opts.view && VIEW_DEFS.some((v) => v.id === opts.view) ? opts.view : 'sentences';
      state.activeView = initialView;
      renderShell();

      // Auto-trigger Stage 2 AI Review seamlessly right after fresh ingest if requested
      if (opts.autoReview && doc.reviewStatus !== 'ready') {
        runReview({ force: false });
      }
    }

    function deactivate() {
      teardownDeckObserver();
      state.engine?.pause?.();
      if (state.reviewAbort) {
        state.reviewAbort.abort();
        state.reviewAbort = null;
      }
      const viewNav = document.getElementById('tlab-view-nav');
      const shellBar = document.getElementById('tlab-shell-bar');
      if (viewNav && state.rootEl?.contains(viewNav) && shellBar) {
        shellBar.appendChild(viewNav);
        viewNav.classList.remove('is-docked-in-wb');
      }
    }

    function destroy() {
      deactivate();
      state.engine?.destroy?.();
      if (state.keydownHandler) document.removeEventListener('keydown', state.keydownHandler);
      if (state.docClickHandler) document.removeEventListener('click', state.docClickHandler);
      if (state.scrollHandler) global.removeEventListener('scroll', state.scrollHandler);
      state.doc = null;
    }

    return {
      mount,
      openDoc,
      setView,
      runReview,
      deactivate,
      destroy,
      getCurrentDoc: () => state.doc,
    };
  }

  global.FlaptapTranscriptWorkbench = { create, VIEW_DEFS, EXPORT_FORMATS };
})(window);
