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

    function ensureWordLookupConfigured() {
      if (state.wordLookupReady || !global.FlaptapWordLookup) return;
      state.wordLookupReady = true;
    }

    function triggerWordLookup(wordText, sentenceText, sentenceIndex, startMs, anchorEl) {
      ensureWordLookupConfigured();
      if (!global.FlaptapWordLookup || !state.doc) return;
      const ws = global.FlaptapWorkspace;
      const user = ws?.getUser?.();
      const lang = user?.nativeLanguage || 'ar';
      global.FlaptapWordLookup.configure({
        getLanguage: () => lang,
        fetchDefinition: async ({ word, sentenceIndex: sIdx, lookupScope }) => {
          const res = await api.lookupWord({
            docId: state.doc.id,
            word,
            contextSentence: sentenceText || word,
            language: lang,
            lookupScope,
          });
          return { ...res, sentenceIndex: sIdx || sentenceIndex, timestampSec: (startMs || 0) / 1000 };
        },
        isSaved: (term) => (ws?.isVocabularySaved ? ws.isVocabularySaved(term) : false),
        onSaveWord: async (def) => {
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
              timestampSec: (startMs || 0) / 1000,
            }),
          });
          if (ws?.refreshVocabulary) await ws.refreshVocabulary();
          toast(`Saved "${def.term}" to Vocabulary Vault.`);
        },
      });
      global.FlaptapWordLookup.openForElement(anchorEl, {
        word: wordText,
        sentenceIndex: sentenceIndex || 1,
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
      const clockEl = state.rootEl.querySelector('#tlab-clock-now');
      if (clockEl) clockEl.textContent = global.FlaptapMediaEngine.formatMs(nowMs);

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
          defineBtn.querySelector('span').textContent = `Define "${state.selectedWord.word}"`;
        }
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
        padBtn.textContent = isExact ? 'Pad: Exact ms' : 'Pad: Natural';
        padBtn.classList.toggle('is-active', isExact);
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

      // Sync speaker filter bar visibility
      const spkBar = state.rootEl.querySelector('#tlab-speaker-bar');
      if (spkBar) {
        if (reviewed && reviewed.speakers.length > 0 && view !== 'raw') {
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
                  ${
                    multiSpeaker || (state.showRepairs && (s.isOverlap || s.repaired))
                      ? `<div class="tlab-sent-meta">
                          ${multiSpeaker ? speakerBadgeHtml(s.speaker, getSpeakerColor(s.speakerId)) : ''}
                          ${state.showRepairs && s.isOverlap ? `<span class="tlab-tag tlab-tag-overlap">Overlap separated</span>` : ''}
                          ${state.showRepairs && s.repaired ? `<span class="tlab-tag tlab-tag-repair" title="${escapeHtml(s.repairNote || 'ASR repaired')}">Repaired</span>` : ''}
                        </div>`
                      : ''
                  }
                  <p class="tlab-sent-text">${renderWordTokensHtml(s.words, s.index)}</p>
                </div>
                <div class="tlab-sent-actions">
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
      if (!bar || !state.doc) return;
      const total = state.doc.sentenceCount || 0;
      const done = state.doc.completedCount || 0;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      bar.innerHTML = `
        <div class="tlab-progress-meta">
          <span>Mastered <strong>${done} / ${total}</strong> sentences</span>
          <span class="ltr-num">${pct}%${state.doc.isCompleted ? ' · Completed' : ''}</span>
        </div>
        <div class="tlab-progress-track"><div class="tlab-progress-fill" style="width:${pct}%"></div></div>
      `;
      bar.classList.toggle('is-done', Boolean(state.doc.isCompleted));
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

    function renderShell() {
      if (!state.rootEl || !state.doc) return;
      const doc = state.doc;
      const reviewed = doc.reviewed;
      const quality = reviewed?.quality;
      const canVideo = Boolean(doc.media?.hasVideo);

      const statusBadge =
        state.reviewing
          ? `<span class="tlab-status-pill is-working">AI Reviewing… ${state.reviewProgress.percent || 10}%</span>`
          : doc.reviewStatus === 'ready' && quality
            ? `<span class="tlab-status-pill is-ready" title="${escapeHtml(quality.summary)}">${quality.verbatimScore}% Verbatim · ${quality.repairedSentences} fix${quality.repairedSentences === 1 ? '' : 'es'}${quality.overlapsResolved ? ` · ${quality.overlapsResolved} overlap${quality.overlapsResolved === 1 ? '' : 's'}` : ''}</span>`
            : doc.reviewStatus === 'failed'
              ? `<span class="tlab-status-pill is-warn" title="${escapeHtml(doc.reviewError || '')}">Raw Ready · AI Review Paused</span>`
              : `<span class="tlab-status-pill">Raw Ready · Pending AI Review</span>`;

      state.rootEl.innerHTML = `
        <div class="tlab-workbench">
          <!-- TOP HEADER -->
          <header class="tlab-wb-header">
            <div class="tlab-wb-nav-row">
              <button type="button" class="btn-secondary btn-xs" id="tlab-back-library">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                <span>Library</span>
              </button>
              <div class="tlab-wb-meta-badges">
                <span class="tlab-platform-badge">${escapeHtml(doc.platform)}</span>
                ${doc.durationSeconds > 0 ? `<span class="tlab-meta-chip ltr-num">${global.FlaptapMediaEngine.formatShort(doc.durationSeconds * 1000)}</span>` : ''}
                <span class="tlab-meta-chip ltr-num">${doc.wordCount.toLocaleString()} words</span>
                ${statusBadge}
              </div>
              <div class="tlab-wb-head-actions">
                ${
                  doc.sourceUrl
                    ? `<button type="button" class="btn-secondary btn-xs" id="tlab-send-phrases" title="Extract American idioms & phrases from this source">Extract Phrases</button>`
                    : ''
                }
                <button type="button" class="btn-secondary btn-xs" id="tlab-rerun-review-btn" ${state.reviewing ? 'disabled' : ''}>
                  ${state.reviewing ? 'Reviewing…' : reviewed ? 'Re-Review AI' : 'Run AI Review'}
                </button>
                <div class="tlab-export-anchor">
                  <button type="button" class="btn-primary btn-xs" id="tlab-export-btn" aria-expanded="false">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    <span>Download</span>
                  </button>
                  <div class="tlab-export-popover" id="tlab-export-popover" hidden></div>
                </div>
              </div>
            </div>

            <div class="tlab-wb-title-row">
              <h2 class="tlab-wb-title" id="tlab-doc-title" contenteditable="false" title="Click Edit to rename">${escapeHtml(doc.title)}</h2>
              <button type="button" class="tlab-mini-icon-btn" id="tlab-rename-btn" title="Rename transcript" aria-label="Rename transcript">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </button>
            </div>
            ${doc.creator ? `<div class="tlab-wb-creator">${escapeHtml(doc.creator)}${reviewed?.modelName ? ` · Reviewed with <code>${escapeHtml(reviewed.modelName)}</code>` : ''}</div>` : ''}
            <div class="tlab-doc-progress" id="tlab-doc-progress"></div>
          </header>

          <!-- LIVE AI REVIEW PROGRESS RIBBON -->
          <div class="tlab-review-banner" id="tlab-review-banner" ${state.reviewing ? '' : 'hidden'}>
            <div class="tlab-review-banner-copy">
              <strong id="tlab-review-msg">${escapeHtml(state.reviewProgress.message || 'Reviewing transcript…')}</strong>
              <span class="ltr-num" id="tlab-review-pct">${state.reviewProgress.percent || 0}%</span>
            </div>
            <div class="tlab-review-track"><div class="tlab-review-fill" id="tlab-review-fill" style="width:${state.reviewProgress.percent || 5}%"></div></div>
          </div>

          <!-- STICKY PRECISION PLAYER DOCK -->
          <section class="tlab-player-dock" id="tlab-player-dock" ${doc.media?.hasAudio ? '' : 'hidden'}>
            <div class="tlab-video-stage ${state.videoExpanded && canVideo ? 'is-open' : 'is-audio-hidden'}" id="tlab-video-stage">
              <div class="tlab-media-slot" id="tlab-media-slot"></div>
            </div>
            <div class="tlab-shadow-pause-bar" id="tlab-shadow-pause-bar" hidden>
              <div class="tlab-shadow-meta">
                <span class="tlab-shadow-countdown">Speak now…</span>
                <button type="button" class="tlab-pill-xs" id="tlab-skip-pause">Skip Pause</button>
              </div>
              <div class="tlab-shadow-track"><div class="tlab-shadow-fill" style="width:0%"></div></div>
            </div>
            <div class="tlab-player-bar">
              <div class="tlab-player-transport">
                <button type="button" class="tlab-play-btn" id="tlab-play-toggle" aria-label="Play or pause" title="Play / Pause (Space)">
                  <svg class="tlab-ico-play" width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 4.8v14.4a.9.9 0 0 0 1.38.76l11.2-7.2a.9.9 0 0 0 0-1.52l-11.2-7.2a.9.9 0 0 0-1.38.76Z"></path></svg>
                  <svg class="tlab-ico-pause" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" hidden><rect x="6" y="4.5" width="4" height="15" rx="1.2"></rect><rect x="14" y="4.5" width="4" height="15" rx="1.2"></rect></svg>
                </button>
                <button type="button" class="tlab-mini-icon-btn" id="tlab-prev-sent" title="Previous sentence (J)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>
                </button>
                <button type="button" class="tlab-mini-icon-btn" id="tlab-replay-btn" title="Replay active word or sentence (R)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                </button>
                <button type="button" class="tlab-mini-icon-btn" id="tlab-next-sent" title="Next sentence (K)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
                </button>
                <div class="tlab-player-readout">
                  <div class="tlab-active-clip-label" id="tlab-active-clip-label">Click any word to hear exact millisecond pronunciation</div>
                  <div class="tlab-clock-row ltr-num">
                    <span id="tlab-clock-now">00:00.000</span>
                    <span>/</span>
                    <span id="tlab-clock-total">${global.FlaptapMediaEngine.formatMs((doc.durationSeconds || 0) * 1000)}</span>
                  </div>
                </div>
              </div>

              <div class="tlab-player-controls">
                <button type="button" class="tlab-pill-xs tlab-define-pill" id="tlab-define-active-btn" hidden>
                  <span>Define word</span>
                </button>
                <div class="tlab-seg-group" role="group" aria-label="Playback speed">
                  ${[0.75, 0.85, 1, 1.25]
                    .map(
                      (sp) =>
                        `<button type="button" class="tlab-pill-xs ${sp === 1 ? 'is-active' : ''}" data-tlab-speed="${sp}">${sp}x</button>`,
                    )
                    .join('')}
                </div>
                <div class="tlab-seg-group" role="group" aria-label="Loop and shadow mode">
                  <button type="button" class="tlab-pill-xs is-active" data-tlab-loop="off" title="No loop">Once</button>
                  <button type="button" class="tlab-pill-xs" data-tlab-loop="word" title="Loop clicked word">Word ∞</button>
                  <button type="button" class="tlab-pill-xs" data-tlab-loop="sentence" title="Loop active sentence">Sent ∞</button>
                  <button type="button" class="tlab-pill-xs" data-tlab-loop="shadow" title="Play sentence, pause for you to speak, then repeat">Shadow Gap</button>
                </div>
                <button type="button" class="tlab-pill-xs" id="tlab-pad-toggle" title="Toggle natural consonant cushion (-25ms/+55ms) vs exact 0ms bounds">Pad: Natural</button>
                ${
                  canVideo
                    ? `<button type="button" class="tlab-pill-xs ${state.videoExpanded ? 'is-active' : ''}" id="tlab-video-toggle">
                         <span>${state.videoExpanded ? 'Hide Video' : 'Show Video'}</span>
                       </button>`
                    : ''
                }
              </div>
            </div>
            <div class="tlab-media-error" id="tlab-media-error" hidden></div>
          </section>

          <!-- TOP VIEW MODE SWITCHER & TOOLBAR -->
          <div class="tlab-toolbar">
            <nav class="tlab-view-tabs" role="tablist" aria-label="Transcript display views">
              ${VIEW_DEFS.map(
                (v) => `
                <button type="button" class="tlab-view-tab ${state.activeView === v.id ? 'is-active' : ''}" data-tlab-view="${v.id}" role="tab" aria-selected="${state.activeView === v.id ? 'true' : 'false'}">
                  <span>${escapeHtml(v.label)}</span>
                </button>`,
              ).join('')}
            </nav>

            <div class="tlab-toolbar-right">
              <div class="tlab-click-mode-switch" role="group" aria-label="Word click behavior">
                <button type="button" class="tlab-pill-xs ${state.clickMode === 'word' ? 'is-active' : ''}" data-click-mode="word" title="Clicking a word plays only that exact word">Click: Word</button>
                <button type="button" class="tlab-pill-xs ${state.clickMode === 'from-here' ? 'is-active' : ''}" data-click-mode="from-here" title="Clicking a word plays continuously from that word">Click: From Here</button>
              </div>
              <button type="button" class="tlab-pill-xs ${state.showRepairs ? 'is-active' : ''}" id="tlab-toggle-repairs" title="Highlight words repaired from raw captions">Repairs</button>
              <label class="tlab-search-box">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input type="search" id="tlab-search-input" placeholder="Search words…" value="${escapeHtml(state.searchQuery)}" />
                <span class="tlab-search-count ltr-num" id="tlab-search-count" hidden></span>
              </label>
              <button type="button" class="btn-secondary btn-xs" id="tlab-copy-view-btn" title="Copy active view text">Copy</button>
            </div>
          </div>

          <!-- SPEAKER FILTER & RENAME BAR -->
          <div class="tlab-speaker-bar" id="tlab-speaker-bar" hidden></div>

          <!-- RESUME AUTO-SCROLL PILL -->
          <button type="button" class="tlab-resume-scroll-btn" id="tlab-resume-scroll" hidden>Resume live tracking</button>

          <!-- MAIN TRANSCRIPT CANVAS -->
          <div class="tlab-transcript-canvas" id="tlab-transcript-canvas"></div>
        </div>
      `;

      // Mount media engine into slot
      const slot = state.rootEl.querySelector('#tlab-media-slot');
      initMediaEngine();
      if (slot && doc.media?.hasAudio) {
        state.engine.mount(slot, doc.media);
      }

      bindWorkbenchEvents();
      syncProgressBar();
      renderViewContent();
      renderExportMenu();
    }

    function bindWorkbenchEvents() {
      if (!state.rootEl) return;

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

      // Rename document inline
      state.rootEl.querySelector('#tlab-rename-btn')?.addEventListener('click', async () => {
        if (!state.doc) return;
        const nextTitle = global.prompt('Rename transcript title:', state.doc.title);
        if (!nextTitle || nextTitle.trim() === state.doc.title) return;
        try {
          const res = await api.renameDoc(state.doc.id, nextTitle.trim());
          state.doc = res.data;
          const titleEl = state.rootEl.querySelector('#tlab-doc-title');
          if (titleEl) titleEl.textContent = state.doc.title;
          onDocUpdated(state.doc);
          toast('Transcript renamed.');
        } catch (err) {
          toast(err?.message || 'Could not rename transcript.');
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
      state.rootEl.querySelector('#tlab-copy-view-btn')?.addEventListener('click', () => {
        copyActiveViewText();
      });

      // Search input
      const searchInput = state.rootEl.querySelector('#tlab-search-input');
      searchInput?.addEventListener('input', () => {
        state.searchQuery = searchInput.value || '';
        renderViewContent();
        const hits = state.rootEl.querySelectorAll('.tlab-word.is-search-hit');
        const countEl = state.rootEl.querySelector('#tlab-search-count');
        if (countEl) {
          if (state.searchQuery.trim()) {
            countEl.hidden = false;
            countEl.textContent = String(hits.length);
            if (hits[0]) hits[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            countEl.hidden = true;
          }
        }
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
        e.currentTarget.querySelector('span').textContent = state.videoExpanded ? 'Hide Video' : 'Show Video';
        if (state.videoExpanded) state.engine?.ensureReady?.().catch(() => {});
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
          if (sObj) copyToClipboard(sObj.text, `Copied sentence #${sObj.index}.`);
          return;
        }
        const copyTextBtn = e.target.closest('[data-copy-text]');
        if (copyTextBtn) {
          copyToClipboard(copyTextBtn.dataset.copyText || '', 'Copied to clipboard.');
        }
      });

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

      // Resume auto-scroll pill
      state.rootEl.querySelector('#tlab-resume-scroll')?.addEventListener('click', (e) => {
        state.autoScrollPaused = false;
        e.currentTarget.hidden = true;
      });

      // Close export menu on outside click
      if (state.docClickHandler) document.removeEventListener('click', state.docClickHandler);
      state.docClickHandler = () => {
        if (state.exportMenuOpen) {
          state.exportMenuOpen = false;
          renderExportMenu();
        }
      };
      document.addEventListener('click', state.docClickHandler);

      // Keyboard shortcuts (Space, R, J/K, 1-5, L)
      if (state.keydownHandler) document.removeEventListener('keydown', state.keydownHandler);
      state.keydownHandler = (e) => {
        if (!state.doc || !state.rootEl || state.rootEl.closest('[hidden]')) return;
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

    function copyToClipboard(text, message) {
      if (global.FlaptapCopy?.write) {
        global.FlaptapCopy.write(text).then(() => toast(message)).catch(() => toast(message));
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
        btn.textContent = 'Reviewing…';
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
      const initialView = opts.view && VIEW_DEFS.some((v) => v.id === opts.view) ? opts.view : 'sentences';
      state.activeView = initialView;
      renderShell();

      // Auto-trigger Stage 2 AI Review seamlessly right after fresh ingest if requested
      if (opts.autoReview && doc.reviewStatus !== 'ready') {
        runReview({ force: false });
      }
    }

    function deactivate() {
      state.engine?.pause?.();
      if (state.reviewAbort) {
        state.reviewAbort.abort();
        state.reviewAbort = null;
      }
    }

    function destroy() {
      deactivate();
      state.engine?.destroy?.();
      if (state.keydownHandler) document.removeEventListener('keydown', state.keydownHandler);
      if (state.docClickHandler) document.removeEventListener('click', state.docClickHandler);
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
