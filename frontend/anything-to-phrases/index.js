/* ==========================================================================
   ANYTHING TO PHRASES — FEATURE LAYOUT SHELL & ROUTER COORDINATOR (index.js)
   Single responsibility:
   - Manages the shared feature navigation bar (Extract | Library)
   - Routes cleanly between the 3 decoupled pages:
       1. Extract  (/extractor)
       2. Library  (/extractor/library)
       3. Detail   (/extractor/library/:id, alias /extractor/note/:id)
   - Coordinates auth changes, initial config/history bootstrap, and pending
     action resume without leaking page internals across pages.
   ========================================================================== */

(function (global) {
  'use strict';

  const store = global.FlaptapA2PStore;
  const api = global.FlaptapA2PApi;

  const shellState = {
    initialized: false,
    eventsBound: false,
    extractPage: null,
    libraryPage: null,
    detailPage: null,
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

  /* ========================================================================
     FEATURE-LEVEL NAVIGATION (EXTRACT | LIBRARY | DETAIL)
     ======================================================================== */

  function activateView(view, options = {}) {
    const next = view === 'library' ? 'library' : view === 'detail' ? 'detail' : 'extract';
    const prev = store.state.activeView;
    store.state.activeView = next;

    if (prev === 'detail' && next !== 'detail') {
      shellState.detailPage?.onDeactivate?.();
    }

    const panelMap = {
      extract: 'aex-view-extract',
      library: 'aex-view-library',
      detail: 'aex-view-note',
    };
    Object.entries(panelMap).forEach(([name, id]) => {
      const panel = el(id);
      if (panel) panel.hidden = name !== next;
    });

    const desk = document.querySelector('#section-american-extractor .aex-desk');
    if (desk) desk.dataset.aexActive = next;

    // Update top feature tabs (Detail highlights Library as its parent!)
    const extractTab = el('aex-tab-extract');
    const libraryTab = el('aex-tab-library');
    if (extractTab) {
      const active = next === 'extract';
      extractTab.classList.toggle('active', active);
      extractTab.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if (libraryTab) {
      const active = next === 'library' || next === 'detail';
      libraryTab.classList.toggle('active', active);
      libraryTab.setAttribute('aria-selected', active ? 'true' : 'false');
    }

    if (!options.skipRoute && router()) {
      if (next === 'library') {
        router().navigate('american-extractor', {
          subview: 'library',
          replace: Boolean(options.replace),
        });
      } else if (next === 'detail' && options.noteId) {
        router().navigate('american-extractor', {
          subview: 'detail',
          noteId: options.noteId,
          replace: Boolean(options.replace),
        });
      } else {
        router().navigate('american-extractor', { replace: Boolean(options.replace) });
      }
    }
  }

  const navigation = {
    goToExtract(options = {}) {
      activateView('extract', options);
      shellState.extractPage?.onActivate?.(options);
    },
    goToLibrary(options = {}) {
      activateView('library', options);
      shellState.libraryPage?.onActivate?.(options);
    },
    goToDetail(noteId, options = {}) {
      if (!noteId) {
        navigation.goToLibrary({ replace: true });
        return;
      }
      activateView('detail', { ...options, noteId });
      shellState.detailPage?.openNote?.(noteId, options);
    },
    async onExtractionComplete(note) {
      shellState.libraryPage?.resetToFirstPage?.();
      await loadHistorySnapshot();
      navigation.goToDetail(note.id);
    },
    async reextractNote(note) {
      activateView('extract');
      await shellState.extractPage?.reextractFromNote?.(note);
    },
  };

  /* ========================================================================
     SHARED DATA LOADERS
     ======================================================================== */

  async function loadConfig() {
    try {
      const cfg = await api.getConfig();
      store.setConfig(cfg);
    } catch {
      store.setConfig(null);
    }
  }

  async function loadHistorySnapshot() {
    if (!store.currentUser()) {
      store.resetUserData();
      syncLibraryBadge();
      return;
    }
    try {
      const res = await api.listHistory({
        page: 1,
        limit: global.FlaptapPagination?.DEFAULT_PAGE_SIZE || 10,
      });
      store.setHistorySnapshot(res);
      syncLibraryBadge();
    } catch (err) {
      if (err?.status !== 401) {
        global.FlaptapUtils.showToast(err?.message || 'Could not load extraction history.');
      }
    }
  }

  async function loadLessonSources() {
    if (!store.currentUser()) {
      store.setLessonSources([]);
      return;
    }
    try {
      const res = await api.getTranscriptSources();
      store.setLessonSources(Array.isArray(res?.items) ? res.items : []);
    } catch {
      store.setLessonSources([]);
    }
  }

  function syncLibraryBadge() {
    const count = el('aex-library-count');
    if (count) count.textContent = String(store.state.historyTotal || 0);
  }

  /* ========================================================================
     SHELL EVENTS & LIFECYCLE
     ======================================================================== */

  function bindShellEvents() {
    if (shellState.eventsBound) return;
    shellState.eventsBound = true;

    el('aex-tab-extract')?.addEventListener('click', () => navigation.goToExtract());
    el('aex-tab-library')?.addEventListener('click', () => navigation.goToLibrary());
    el('aex-shell-brand-btn')?.addEventListener('click', () => navigation.goToExtract());

    store.subscribe('history:changed', syncLibraryBadge);

    global.addEventListener('flaptap:languages-loaded', () => {
      shellState.extractPage?.onLanguagesLoaded?.();
      shellState.detailPage?.onLanguagesLoaded?.();
    });

    global.addEventListener('flaptap:data-purged', async (event) => {
      const detail = event?.detail || {};
      const f = String(detail.feature || '').toLowerCase();
      if (detail.resetAll || f === 'american_extractor') {
        store.resetUserData();
        shellState.detailPage?.clearCurrent?.();
        syncLibraryBadge();
        if (store.state.activeView === 'detail') {
          navigation.goToExtract({ replace: true });
        } else if (store.state.activeView === 'library') {
          await shellState.libraryPage?.onActivate?.();
        }
      }
      if (detail.resetAll || f === 'lessons' || f === 'media_hub' || f === 'media-hub' || f === 'shadowing' || f === 'street_talk' || f === 'phonetics' || f === 'shared_sources') {
        await loadLessonSources();
      }
      if (detail.resetAll || f === 'vocabulary') {
        store.state.savedTerms.clear();
        shellState.detailPage?.syncVocabularyState?.();
      }
    });

    global.addEventListener('flaptap:auth-changed', async (event) => {
      const user = event?.detail?.user;
      if (user) {
        await Promise.all([
          loadHistorySnapshot(),
          loadLessonSources(),
          ws()?.refreshVocabulary ? ws().refreshVocabulary() : Promise.resolve(),
        ]);
        shellState.detailPage?.syncVocabularyState?.();
        if (store.state.activeView === 'library') {
          shellState.libraryPage?.onActivate?.();
        }
      } else {
        store.resetUserData();
        shellState.detailPage?.clearCurrent?.();
        syncLibraryBadge();
        if (store.state.activeView === 'detail') {
          navigation.goToExtract({ replace: true });
        } else if (store.state.activeView === 'library') {
          shellState.libraryPage?.onActivate?.();
        }
      }
    });
  }

  async function applyRouteState(routeState) {
    if (!routeState || routeState.section !== 'american-extractor') return;
    const subview = routeState.subview || 'extract';

    if ((subview === 'detail' || subview === 'note') && routeState.noteId) {
      activateView('detail', { skipRoute: true, noteId: routeState.noteId });
      await shellState.detailPage?.openNote?.(routeState.noteId, {
        searchParams: routeState.searchParams,
      });
      return;
    }

    if (subview === 'library') {
      activateView('library', { skipRoute: true });
      await shellState.libraryPage?.onActivate?.(routeState);
      return;
    }

    activateView('extract', { skipRoute: true });
    const params = routeState.searchParams || new URLSearchParams(global.location.search || '');
    shellState.extractPage?.onActivate?.({
      lessonId: params.get('lessonId') || '',
      url: params.get('url') || '',
    });
  }

  async function init(routeState) {
    if (!shellState.initialized) {
      shellState.initialized = true;
      store.state.preferredLanguage = store.getPreferredLanguage();

      // Create the 3 strictly isolated pages
      shellState.extractPage = global.FlaptapA2PExtractPage.create({
        store,
        api,
        nav: navigation,
        refreshLessonSources: loadLessonSources,
      });
      shellState.libraryPage = global.FlaptapA2PLibraryPage.create({
        store,
        api,
        nav: navigation,
        reloadHistory: loadHistorySnapshot,
      });
      shellState.detailPage = global.FlaptapA2PDetailPage.create({
        store,
        api,
        nav: navigation,
      });

      bindShellEvents();

      // Pre-switch view before async data so there's no flash of Extract on deep links
      if (routeState?.subview === 'library') {
        activateView('library', { skipRoute: true });
      } else if ((routeState?.subview === 'detail' || routeState?.subview === 'note') && routeState?.noteId) {
        activateView('detail', { skipRoute: true, noteId: routeState.noteId });
      }

      shellState.libraryPage.mount();
      shellState.detailPage.mount();
      await Promise.all([
        shellState.extractPage.mount(),
        loadConfig(),
        loadHistorySnapshot(),
        loadLessonSources(),
        ws()?.refreshVocabulary ? ws().refreshVocabulary() : Promise.resolve(),
      ]);
    }

    if (routeState) {
      await applyRouteState(routeState);
    }
  }

  async function resumePending(payload) {
    if (!shellState.initialized) {
      await init({ section: 'american-extractor', searchParams: new URLSearchParams() });
    }
    activateView('extract', { skipRoute: true });
    await shellState.extractPage?.resumePending?.(payload);
  }

  const publicApi = {
    init,
    resumePending,
    reloadHistory: loadHistorySnapshot,
    reloadLessonSources: loadLessonSources,
    getState: () => ({
      ...store.state,
      currentNote: shellState.detailPage?.getCurrentNote?.() || null,
    }),
    focusUrl: () => shellState.extractPage?.focusUrl?.(),
  };

  global.FlaptapAmericanExtractor = publicApi;
  global.FlaptapAnythingToPhrases = publicApi;
})(window);
