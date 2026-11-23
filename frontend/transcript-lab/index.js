/* ==========================================================================
   TRANSCRIPT LAB — FEATURE SHELL & 3-PAGE COORDINATOR (transcript-lab/index.js)
   Manages the 3 clean decoupled pages under /transcripts:
     1. Extract   (/transcripts)           — Paste any link or upload media
     2. Library   (/transcripts/library)   — Saved transcripts, filters & pagination
     3. Workbench (/transcripts/:id)       — Interactive 5-view millisecond player
   Reuses FlaptapAiSelector, FlaptapPagination, FlaptapConfirmUndo, FlaptapWorkspace.
   ========================================================================== */

(function (global) {
  'use strict';

  const api = global.FlaptapTranscriptApi;

  const state = {
    initialized: false,
    eventsBound: false,
    activePage: 'extract', // 'extract' | 'library' | 'view'
    inputTab: 'link', // 'link' | 'upload'
    selectedFile: null,
    ingesting: false,
    aiSelector: null,
    workbench: null,
    docs: [],
    total: 0,
    page: 1,
    totalPages: 1,
    stats: { totalDocs: 0, reviewedDocs: 0, completedDocs: 0, totalWords: 0 },
    filters: { q: '', platform: 'all', status: 'all' },
    currentDocId: '',
  };

  function ws() {
    return global.FlaptapWorkspace || null;
  }

  function router() {
    return global.FlaptapRouter || null;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return global.FlaptapUtils?.escapeHtml ? global.FlaptapUtils.escapeHtml(s) : String(s ?? '');
  }

  function toast(msg) {
    if (ws()?.showToast) ws().showToast(msg);
    else if (global.FlaptapUtils?.showToast) global.FlaptapUtils.showToast(msg);
  }

  function detectClientPlatform(url) {
    const clean = String(url || '').trim().toLowerCase();
    if (!clean) return '';
    if (clean.includes('youtube.com') || clean.includes('youtu.be') || /^[a-z0-9_-]{11}$/i.test(clean)) return 'YouTube · Instant millisecond JSON3 captions';
    if (clean.includes('tiktok.com')) return 'TikTok · Video + word-timed speech';
    if (clean.includes('instagram.com')) return 'Instagram · Reel / Video + word-timed speech';
    if (clean.includes('x.com') || clean.includes('twitter.com')) return 'X / Twitter · Video + word-timed speech';
    if (clean.includes('vimeo.com')) return 'Vimeo · Video + captions / speech';
    if (clean.includes('podcasts.apple.com') || clean.includes('soundcloud.com') || clean.includes('transistor.fm') || clean.includes('buzzsprout.com') || clean.includes('rss') || clean.endsWith('.xml')) return 'Podcast · Audio + word-timed speech';
    if (/\.(mp3|m4a|wav|ogg|opus|mp4|webm|mov)(\?|$)/i.test(clean)) return 'Direct Media · Fast download + word-timed speech';
    if (/^https?:\/\//.test(clean)) return 'Web Media · Universal extractor + word-timed speech';
    return '';
  }

  function activatePage(page, options = {}) {
    const next = page === 'library' ? 'library' : page === 'view' ? 'view' : 'extract';
    if (state.activePage === 'view' && next !== 'view') {
      state.workbench?.deactivate?.();
    }
    state.activePage = next;

    const map = {
      extract: 'tlab-page-extract',
      library: 'tlab-page-library',
      view: 'tlab-page-workbench',
    };
    Object.entries(map).forEach(([name, id]) => {
      const panel = el(id);
      if (panel) panel.hidden = name !== next;
    });

    const desk = document.querySelector('#section-transcript-lab .tlab-desk');
    if (desk) desk.dataset.tlabActive = next;

    const tabExtract = el('tlab-tab-extract');
    const tabLibrary = el('tlab-tab-library');
    if (tabExtract) {
      const active = next === 'extract';
      tabExtract.classList.toggle('active', active);
      tabExtract.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if (tabLibrary) {
      const active = next === 'library' || next === 'view';
      tabLibrary.classList.toggle('active', active);
      tabLibrary.setAttribute('aria-selected', active ? 'true' : 'false');
    }

    if (!options.skipRoute && router()) {
      if (next === 'library') {
        router().navigate('transcript-lab', { subview: 'library', replace: Boolean(options.replace) });
      } else if (next === 'view' && options.docId) {
        router().navigate('transcript-lab', {
          subview: 'view',
          docId: options.docId,
          view: options.view || 'sentences',
          replace: Boolean(options.replace),
        });
      } else {
        router().navigate('transcript-lab', { replace: Boolean(options.replace) });
      }
    }
  }

  const nav = {
    goToExtract(opts = {}) {
      activatePage('extract', opts);
    },
    async goToLibrary(opts = {}) {
      activatePage('library', opts);
      await loadLibrary(state.page);
    },
    async openDoc(docOrId, opts = {}) {
      const user = ws()?.getUser?.();
      if (!user) {
        activatePage('extract', { replace: true });
        return;
      }
      const docId = typeof docOrId === 'string' ? docOrId : docOrId?.id;
      if (!docId) {
        nav.goToLibrary({ replace: true });
        return;
      }
      state.currentDocId = docId;
      activatePage('view', { ...opts, docId });

      const wbHost = el('tlab-workbench-root');
      if (typeof docOrId === 'object' && docOrId?.raw) {
        state.workbench.openDoc(docOrId, opts);
        return;
      }

      if (wbHost) {
        wbHost.innerHTML = `<div class="tlab-loading-box">Loading transcript &amp; millisecond word timings…</div>`;
      }
      try {
        const res = await api.getDoc(docId);
        state.workbench.openDoc(res.data, opts);
      } catch (err) {
        toast(err?.message || 'Transcript could not be loaded.');
        nav.goToLibrary({ replace: true });
      }
    },
  };

  /* ========================================================================
     INGESTION (STAGE 1 INSTANT EXTRACT -> OPEN WORKBENCH -> STAGE 2 AI REVIEW)
     ======================================================================== */

  async function executeIngestUrl(url, opts = {}) {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl) {
      toast('Paste a YouTube, podcast, social video, or audio/video URL first.');
      el('tlab-url-input')?.focus();
      return;
    }

    if (ws()?.requireAuthBeforeAction) {
      const ok = ws().requireAuthBeforeAction(
        {
          type: 'tlab_ingest_url',
          payload: { url: cleanUrl, force: Boolean(opts.force), autoReview: opts.autoReview !== false },
        },
        'Sign in to extract millisecond-synced transcripts and run AI review.',
      );
      if (!ok) return;
    }

    if (state.ingesting) return;
    state.ingesting = true;
    setExtractBusy(true, 'Extracting verbatim transcript & millisecond word timings…');

    try {
      const res = await api.ingestUrl(cleanUrl, Boolean(opts.force));
      const doc = res.data;
      await loadLibrary(1, { silent: true });
      const autoReview = opts.autoReview !== false && el('tlab-auto-review')?.checked !== false;
      toast(res.cached ? 'Opened instantly from library cache.' : 'Raw transcript ready! Every word is clickable.');
      await nav.openDoc(doc, {
        view: 'sentences',
        autoReview: autoReview && (doc.reviewStatus !== 'ready' || Boolean(opts.force)),
      });
    } catch (err) {
      toast(err?.message || 'Could not extract transcript from that URL.');
    } finally {
      state.ingesting = false;
      setExtractBusy(false);
    }
  }

  async function executeIngestUpload(file, opts = {}) {
    if (!file) {
      toast('Choose an audio or video file first.');
      return;
    }
    if (ws()?.requireAuthBeforeAction) {
      const ok = ws().requireAuthBeforeAction(
        { type: 'section', section: 'transcript-lab' },
        'Sign in to transcribe uploaded audio or video files.',
      );
      if (!ok) return;
    }
    if (state.ingesting) return;
    state.ingesting = true;
    setExtractBusy(true, `Transcribing "${file.name}" with millisecond word timestamps…`);

    try {
      const res = await api.ingestUpload(file, Boolean(opts.force));
      const doc = res.data;
      state.selectedFile = null;
      syncSelectedFileUi();
      await loadLibrary(1, { silent: true });
      const autoReview = el('tlab-auto-review')?.checked !== false;
      toast('Audio transcribed! Every word is clickable.');
      await nav.openDoc(doc, {
        view: 'sentences',
        autoReview: autoReview && doc.reviewStatus !== 'ready',
      });
    } catch (err) {
      toast(err?.message || 'Could not transcribe that file.');
    } finally {
      state.ingesting = false;
      setExtractBusy(false);
    }
  }

  function setExtractBusy(busy, message = '') {
    const btn = el('tlab-extract-submit');
    const status = el('tlab-ingest-status');
    if (btn) {
      btn.disabled = busy;
      btn.classList.toggle('is-loading', busy);
      const span = btn.querySelector('span');
      if (span) span.textContent = busy ? 'Extracting…' : 'Extract Transcript';
    }
    if (status) {
      status.hidden = !busy;
      if (busy) status.textContent = message || 'Working…';
    }
  }

  function syncSelectedFileUi() {
    const label = el('tlab-file-selected-name');
    if (!label) return;
    if (state.selectedFile) {
      const mb = (state.selectedFile.size / (1024 * 1024)).toFixed(1);
      label.textContent = `${state.selectedFile.name} (${mb} MB)`;
      label.hidden = false;
    } else {
      label.textContent = '';
      label.hidden = true;
    }
  }

  /* ========================================================================
     LIBRARY & RECENT STRIP
     ======================================================================== */

  async function loadLibrary(page = 1, opts = {}) {
    const user = ws()?.getUser?.();
    if (!user) {
      state.docs = [];
      state.total = 0;
      state.stats = { totalDocs: 0, reviewedDocs: 0, completedDocs: 0, totalWords: 0 };
      syncBadgesAndLists();
      return;
    }

    try {
      const res = await api.listDocs({
        q: state.filters.q,
        platform: state.filters.platform,
        status: state.filters.status,
        page,
        limit: global.FlaptapPagination?.DEFAULT_PAGE_SIZE || 10,
      });
      state.docs = Array.isArray(res.items) ? res.items : [];
      state.total = Number(res.total) || 0;
      state.page = Number(res.page) || 1;
      state.totalPages = Number(res.totalPages) || 1;
      state.stats = res.stats || state.stats;
      syncBadgesAndLists();
    } catch (err) {
      if (!opts.silent && err?.status !== 401) {
        toast(err?.message || 'Could not load transcripts.');
      }
    }
  }

  function syncBadgesAndLists() {
    const badge = el('tlab-library-count');
    if (badge) badge.textContent = String(state.stats.totalDocs || 0);
    renderRecentStrip();
    renderLibraryList();
  }

  function renderRecentStrip() {
    const wrap = el('tlab-recent-strip');
    if (!wrap) return;
    const recent = state.docs.slice(0, 4);
    if (!recent.length) {
      wrap.hidden = true;
      wrap.innerHTML = '';
      return;
    }
    wrap.hidden = false;
    wrap.innerHTML = `
      <div class="tlab-recent-head">
        <span>Recent Transcripts</span>
        <button type="button" class="tlab-link-btn" id="tlab-see-all-recent">View Library (${state.stats.totalDocs})</button>
      </div>
      <div class="tlab-recent-grid">
        ${recent
          .map(
            (item) => `
          <button type="button" class="tlab-recent-card" data-open-doc="${escapeHtml(item.id)}">
            <div class="tlab-recent-meta">
              <span class="tlab-platform-badge">${escapeHtml(item.platform)}</span>
              <span class="tlab-meta-chip ltr-num">${item.wordCount.toLocaleString()} words</span>
            </div>
            <div class="tlab-recent-title">${escapeHtml(item.title)}</div>
            <div class="tlab-recent-foot">
              <span>${item.reviewStatus === 'ready' ? `AI Reviewed · ${item.speakerCount} spk` : 'Raw Ready'}</span>
              <span class="ltr-num">${item.completedCount}/${item.sentenceCount}</span>
            </div>
          </button>`,
          )
          .join('')}
      </div>
    `;
  }

  function renderLibraryList() {
    const listEl = el('tlab-library-list');
    const emptyEl = el('tlab-library-empty');
    const pagEl = el('tlab-library-pagination');
    const statsEl = el('tlab-library-stats');
    if (!listEl) return;

    const user = ws()?.getUser?.();
    if (statsEl) {
      statsEl.innerHTML = `
        <span><strong>${state.stats.totalDocs}</strong> Transcripts</span>
        <span><strong>${state.stats.reviewedDocs}</strong> AI Reviewed</span>
        <span><strong>${state.stats.completedDocs}</strong> Mastered</span>
        <span><strong>${state.stats.totalWords.toLocaleString()}</strong> Words</span>
      `;
    }

    if (!user) {
      listEl.innerHTML = '';
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.innerHTML = `<h3>Sign in to view your saved transcripts</h3><p>Every media link you transcribe is saved with both raw original and AI-reviewed millisecond-aligned versions.</p>`;
      }
      if (pagEl) pagEl.innerHTML = '';
      return;
    }

    if (!state.docs.length) {
      listEl.innerHTML = '';
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.innerHTML = `<h3>No transcripts found</h3><p>Paste any YouTube, podcast, social video, or audio link in Extract to create your first word-clickable transcript.</p>`;
      }
      if (pagEl) pagEl.innerHTML = '';
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    listEl.innerHTML = state.docs
      .map((item) => {
        const pct = item.sentenceCount > 0 ? Math.round((item.completedCount / item.sentenceCount) * 100) : 0;
        const dur = item.durationSeconds > 0 ? global.FlaptapMediaEngine.formatShort(item.durationSeconds * 1000) : '';
        return `
        <article class="tlab-lib-card ${item.isCompleted ? 'is-completed' : ''}" data-doc-id="${escapeHtml(item.id)}">
          <div class="tlab-lib-main" data-open-doc="${escapeHtml(item.id)}" role="button" tabindex="0">
            <div class="tlab-lib-top">
              <span class="tlab-platform-badge">${escapeHtml(item.platform)}</span>
              ${dur ? `<span class="tlab-meta-chip ltr-num">${dur}</span>` : ''}
              <span class="tlab-meta-chip ltr-num">${item.wordCount.toLocaleString()} words</span>
              <span class="tlab-meta-chip ltr-num">${item.speakerCount} speaker${item.speakerCount === 1 ? '' : 's'}</span>
              <span class="tlab-status-pill ${item.reviewStatus === 'ready' ? 'is-ready' : ''}">${item.reviewStatus === 'ready' ? 'AI Reviewed' : 'Raw Ready'}</span>
            </div>
            <h3 class="tlab-lib-title">${escapeHtml(item.title)}</h3>
            <div class="tlab-lib-sub">
              <span>${escapeHtml(item.creator || item.platform)}</span>
              <span class="ltr-num">${item.completedCount} / ${item.sentenceCount} sentences (${pct}%)</span>
            </div>
          </div>
          <div class="tlab-lib-actions">
            <button type="button" class="btn-primary btn-xs" data-open-doc="${escapeHtml(item.id)}">Open</button>
            <button type="button" class="btn-secondary btn-xs is-danger" data-delete-doc="${escapeHtml(item.id)}" title="Delete transcript">Delete</button>
          </div>
        </article>`;
      })
      .join('');

    if (pagEl) {
      if (state.totalPages > 1) {
        const tokens = global.FlaptapPagination?.buildRange
          ? global.FlaptapPagination.buildRange(state.page, state.totalPages)
          : Array.from({ length: state.totalPages }, (_, i) => i + 1);
        pagEl.innerHTML = `
          <div class="ft-pagination-bar">
            <button type="button" class="ft-page-nav-btn" data-tlab-page="${Math.max(1, state.page - 1)}" ${state.page <= 1 ? 'disabled' : ''}>Prev</button>
            <div class="ft-page-numbers">
              ${tokens
                .map((t) =>
                  typeof t === 'number'
                    ? `<button type="button" class="ft-page-num-btn${t === state.page ? ' active' : ''}" data-tlab-page="${t}">${t}</button>`
                    : `<span class="ft-page-ellipsis">…</span>`,
                )
                .join('')}
            </div>
            <button type="button" class="ft-page-nav-btn" data-tlab-page="${Math.min(state.totalPages, state.page + 1)}" ${state.page >= state.totalPages ? 'disabled' : ''}>Next</button>
          </div>`;
        pagEl.querySelectorAll('[data-tlab-page]').forEach((b) => {
          b.addEventListener('click', () => loadLibrary(Number(b.dataset.tlabPage) || 1));
        });
      } else {
        pagEl.innerHTML = '';
      }
    }
  }

  /* ========================================================================
     EVENTS & INITIALIZATION
     ======================================================================== */

  function bindEvents() {
    if (state.eventsBound) return;
    state.eventsBound = true;

    el('tlab-tab-extract')?.addEventListener('click', () => nav.goToExtract());
    el('tlab-tab-library')?.addEventListener('click', () => nav.goToLibrary());

    // Source input tabs (Link | Upload)
    document.querySelectorAll('[data-tlab-input]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.inputTab = btn.dataset.tlabInput === 'upload' ? 'upload' : 'link';
        document.querySelectorAll('[data-tlab-input]').forEach((b) => {
          const active = b.dataset.tlabInput === state.inputTab;
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        document.querySelectorAll('[data-tlab-input-panel]').forEach((p) => {
          p.hidden = p.dataset.tlabInputPanel !== state.inputTab;
        });
      });
    });

    // URL input platform live detection + clear + paste
    const urlInput = el('tlab-url-input');
    const detectEl = el('tlab-url-detect');
    const clearBtn = el('tlab-url-clear');

    const syncUrlHints = () => {
      const val = urlInput?.value || '';
      if (clearBtn) clearBtn.hidden = !val.trim();
      const hint = detectClientPlatform(val);
      if (detectEl) {
        detectEl.hidden = !hint;
        detectEl.textContent = hint;
      }
    };

    urlInput?.addEventListener('input', syncUrlHints);
    urlInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        executeIngestUrl(urlInput.value, { force: Boolean(el('tlab-force-cache')?.checked) });
      }
    });
    clearBtn?.addEventListener('click', () => {
      if (urlInput) urlInput.value = '';
      syncUrlHints();
      urlInput?.focus();
    });
    el('tlab-paste-btn')?.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && urlInput) {
          urlInput.value = text.trim();
          syncUrlHints();
          urlInput.focus();
        }
      } catch {
        toast('Clipboard permission unavailable — paste directly with Cmd/Ctrl+V.');
      }
    });

    // File input & drag-drop
    const fileInput = el('tlab-file-input');
    const dropzone = el('tlab-dropzone');
    fileInput?.addEventListener('change', () => {
      state.selectedFile = fileInput.files?.[0] || null;
      syncSelectedFileUi();
    });
    dropzone?.addEventListener('click', () => fileInput?.click());
    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      const f = e.dataTransfer?.files?.[0];
      if (f) {
        state.selectedFile = f;
        syncSelectedFileUi();
      }
    });

    // Submit button
    el('tlab-extract-submit')?.addEventListener('click', () => {
      const force = Boolean(el('tlab-force-cache')?.checked);
      if (state.inputTab === 'upload') {
        executeIngestUpload(state.selectedFile, { force });
      } else {
        executeIngestUrl(urlInput?.value || '', { force });
      }
    });

    // Recent strip & Library clicks
    el('tlab-recent-strip')?.addEventListener('click', (e) => {
      if (e.target.closest('#tlab-see-all-recent')) {
        nav.goToLibrary();
        return;
      }
      const openBtn = e.target.closest('[data-open-doc]');
      if (openBtn) nav.openDoc(openBtn.dataset.openDoc);
    });

    el('tlab-library-list')?.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('[data-delete-doc]');
      if (delBtn) {
        e.stopPropagation();
        const id = delBtn.dataset.deleteDoc;
        if (!id) return;
        const doDelete = async () => {
          await api.deleteDoc(id);
          await loadLibrary(state.page);
          toast('Transcript deleted.');
        };
        if (global.FlaptapConfirm?.ask) {
          const ok = await global.FlaptapConfirm.ask({
            title: 'Delete transcript?',
            message: 'This removes both the raw and AI-reviewed transcript from your library.',
            confirmLabel: 'Delete',
          });
          if (ok) await doDelete();
        } else {
          await doDelete();
        }
        return;
      }
      const openEl = e.target.closest('[data-open-doc]');
      if (openEl) nav.openDoc(openEl.dataset.openDoc);
    });

    // Library search & filters
    let searchTimer = null;
    el('tlab-lib-search')?.addEventListener('input', (e) => {
      state.filters.q = e.target.value || '';
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadLibrary(1), 220);
    });
    el('tlab-lib-platform')?.addEventListener('change', (e) => {
      state.filters.platform = e.target.value || 'all';
      loadLibrary(1);
    });
    el('tlab-lib-status')?.addEventListener('change', (e) => {
      state.filters.status = e.target.value || 'all';
      loadLibrary(1);
    });

    global.addEventListener('flaptap:auth-changed', async (ev) => {
      if (ev?.detail?.user) {
        await loadLibrary(1, { silent: true });
      } else {
        state.docs = [];
        state.total = 0;
        syncBadgesAndLists();
        if (state.activePage === 'view') nav.goToExtract({ replace: true });
      }
    });
  }

  async function applyRouteState(routeState) {
    if (!routeState || routeState.section !== 'transcript-lab') return;
    const subview = routeState.subview || 'extract';

    if (subview === 'view' && routeState.docId) {
      const view = routeState.searchParams?.get('view') || 'sentences';
      await nav.openDoc(routeState.docId, { skipRoute: true, view });
      return;
    }

    if (subview === 'library') {
      activatePage('library', { skipRoute: true });
      await loadLibrary(1);
      return;
    }

    activatePage('extract', { skipRoute: true });
    const urlParam = routeState.searchParams?.get('url');
    if (urlParam && el('tlab-url-input')) {
      el('tlab-url-input').value = urlParam;
    }
  }

  async function init(routeState) {
    if (!state.initialized) {
      state.initialized = true;

      // Mount the ONE shared FlaptapAiSelector (Constitutional Law!)
      const aiMount = el('tlab-ai-selector-mount');
      if (aiMount && global.FlaptapAiSelector?.create) {
        state.aiSelector = global.FlaptapAiSelector.create({
          container: aiMount,
          idPrefix: 'tlab-aisel',
          persistenceKey: 'transcript_lab',
          title: 'AI Review Model',
          compact: true,
          showRunButton: false,
          hideMetaChips: true,
          fetcher: ws()?.apiFetch,
          onToast: toast,
        });
      }

      state.workbench = global.FlaptapTranscriptWorkbench.create({
        api,
        nav,
        getAiSelection: () => state.aiSelector?.getSelection?.() || {},
        onDocUpdated: () => loadLibrary(state.page, { silent: true }),
      });
      state.workbench.mount(el('tlab-workbench-root'));

      bindEvents();
      await loadLibrary(1, { silent: true });
    }

    if (routeState) {
      await applyRouteState(routeState);
    }
  }

  async function resumePending(payload) {
    if (!state.initialized) {
      await init({ section: 'transcript-lab', searchParams: new URLSearchParams() });
    }
    activatePage('extract', { skipRoute: true });
    if (payload?.url) {
      if (el('tlab-url-input')) el('tlab-url-input').value = payload.url;
      await executeIngestUrl(payload.url, payload);
    }
  }

  global.FlaptapTranscriptLab = {
    init,
    resumePending,
    reloadLibrary: () => loadLibrary(state.page),
    getState: () => ({ ...state, currentDoc: state.workbench?.getCurrentDoc?.() || null }),
  };
})(window);
