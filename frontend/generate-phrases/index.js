/* ==========================================================================
   GENERATE PHRASES — FEATURE SHELL & ROUTER COORDINATOR
   (generate-phrases/index.js)
   Single responsibility:
   - Manages unified header & Generate | Library (N) top segmented switcher
     (1:1 visual & architectural parity with Anything to Phrases)
   - Routes cleanly between:
       1. Generate (/library)
       2. Library  (/library/browse)
       3. Item study drawer (/library/browse or deep link)
   - Coordinates domain catalog loading, auth sync, and pending-action resume
   ========================================================================== */

(function (global) {
  'use strict';

  const store = global.FlaptapGPStore;
  const api = global.FlaptapGPApi;

  const shell = {
    initialized: false,
    eventsBound: false,
    inflightDomains: null,
    lastAuthUserId: null,
    generatePage: null,
    libraryPage: null,
    studyDrawer: null,
  };

  function router() {
    return global.FlaptapRouter || null;
  }

  function el(id) {
    return document.getElementById(id);
  }

  /* ========================================================================
     FEATURE-LEVEL NAVIGATION (GENERATE | LIBRARY)
     ======================================================================== */

  function activateView(view, options = {}) {
    const next = view === 'browse' ? 'browse' : 'generate';
    const prev = store.state.activeView;
    store.state.activeView = next;

    if (prev === 'browse' && next !== 'browse') {
      shell.libraryPage?.onDeactivate?.();
    }

    const genPanel = el('ll-view-generate');
    const libPanel = el('ll-view-library');
    if (genPanel) genPanel.hidden = next !== 'generate';
    if (libPanel) libPanel.hidden = next !== 'browse';

    const desk = document.querySelector('#section-learning-library .ll-desk');
    if (desk) desk.dataset.llActive = next;

    const genTab = el('ll-tab-generate');
    const libTab = el('ll-tab-library');
    if (genTab) {
      const active = next === 'generate';
      genTab.classList.toggle('active', active);
      genTab.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if (libTab) {
      const active = next === 'browse';
      libTab.classList.toggle('active', active);
      libTab.setAttribute('aria-selected', active ? 'true' : 'false');
    }

    if (!options.skipRoute && router()) {
      router().navigate('learning-library', {
        subview: next,
        domainId: store.state.activeDomainId,
        replace: Boolean(options.replace),
      });
    }
  }

  function syncLibraryCountBadge() {
    const badge = el('ll-nav-library-count');
    if (badge) {
      badge.textContent = String(Number(store.state.stats?.totalItems) || 0);
    }
  }

  async function loadDomainsCatalog() {
    if (store.state.domainsLoaded) return;
    if (shell.inflightDomains) return shell.inflightDomains;
    shell.inflightDomains = (async () => {
      try {
        const res = await api.listDomains();
        store.state.domains = Array.isArray(res?.domains) ? res.domains : [];
        if (Array.isArray(res?.levels) && res.levels.length > 0) {
          store.state.levels = res.levels;
        }
        if (Array.isArray(res?.studyGoals) && res.studyGoals.length > 0) {
          store.state.studyGoals = res.studyGoals;
        }
        if (
          res?.defaultDomainId &&
          !store.state.domains.some((d) => d.id === store.state.activeDomainId)
        ) {
          store.state.activeDomainId = res.defaultDomainId;
        }
        store.state.domainsLoaded = true;
        store.emit('domains:loaded', store.state.domains);
      } catch (err) {
        console.error('Failed to load Generate Phrases domains:', err);
      } finally {
        shell.inflightDomains = null;
      }
    })();
    return shell.inflightDomains;
  }

  async function loadSnapshotForHeaderAndRecent() {
    if (!store.currentUser()) {
      store.resetUserData();
      syncLibraryCountBadge();
      return;
    }
    try {
      const res = await api.listItems({
        domainId: store.state.activeDomainId,
        sort: 'newest',
        page: 1,
        limit: Math.max(6, store.state.pageSize || 10),
      });
      store.state.recentItems = Array.isArray(res?.items) ? res.items.slice(0, 6) : [];
      if (res?.stats) store.state.stats = res.stats;
      store.state.categoryCounts = res?.categoryCounts || {};
      store.state.registerCounts = res?.registerCounts || {};
      store.state.cefrCounts = res?.cefrCounts || {};
      store.emit('stats:changed', store.state.stats);
      syncLibraryCountBadge();
    } catch {
      // Non-blocking snapshot
    }
  }

  const navigation = {
    goToGenerate(options = {}) {
      activateView('generate', options);
      shell.generatePage?.onActivate?.(options);
    },
    goToLibrary(options = {}) {
      activateView('browse', options);
      shell.libraryPage?.onActivate?.(options);
    },
    async switchDomain(nextDomainId) {
      if (!nextDomainId || nextDomainId === store.state.activeDomainId) return;
      store.state.activeDomainId = nextDomainId;
      store.state.genCategoryId = 'all';
      store.state.genRegister = '';
      store.state.browseCategoryId = 'all';
      store.state.browseRegister = 'all';
      store.state.browseLevel = 'all';
      store.state.page = 1;
      store.state.justGeneratedIds.clear();
      store.state.latestBatchResult = null;
      store.emit('domain:changed', nextDomainId);

      router()?.updateSubroute?.('learning-library', {
        subview: store.state.activeView,
        domainId: store.state.activeDomainId,
        replace: true,
      });

      if (store.currentUser()) {
        if (store.state.activeView === 'browse') {
          await shell.libraryPage?.loadLibraryItems({ showSkeleton: true, animate: true });
        } else {
          await loadSnapshotForHeaderAndRecent();
        }
      }
    },
    async onGenerationComplete(result) {
      shell.libraryPage?.mergeFreshGeneration?.(result);
      activateView('browse', { replace: false });
      shell.libraryPage?.onActivate?.({ skipFetch: true });

      const fulfilled = Number(result?.fulfilledCount) || 0;
      const requested = Number(result?.requestedCount) || fulfilled;
      const missing = Math.max(0, requested - fulfilled);
      global.FlaptapUtils.showToast(
        missing > 0
          ? `Added ${fulfilled} of ${requested} expressions — ${missing} still missing`
          : `Added ${fulfilled} new expression${fulfilled === 1 ? '' : 's'} to your library`,
      );
    },
    openStudyDrawer(itemId) {
      shell.studyDrawer?.open?.(itemId);
    },
    closeStudyDrawer() {
      shell.studyDrawer?.close?.();
    },
  };

  /* ========================================================================
     SHELL EVENTS & ROUTE HYDRATION
     ======================================================================== */

  function bindShellEvents() {
    if (shell.eventsBound) return;
    shell.eventsBound = true;

    el('ll-tab-generate')?.addEventListener('click', () => navigation.goToGenerate());
    el('ll-tab-library')?.addEventListener('click', () => navigation.goToLibrary());

    store.subscribe('stats:changed', syncLibraryCountBadge);

    global.addEventListener('flaptap:languages-loaded', () => {
      shell.generatePage?.onLanguagesLoaded?.();
      shell.libraryPage?.onLanguagesLoaded?.();
    });

    global.addEventListener('flaptap:auth-changed', async (e) => {
      const nextUser = e?.detail?.user || store.currentUser();
      const nextUserId = nextUser?.id || null;
      const changed = nextUserId !== shell.lastAuthUserId;
      shell.lastAuthUserId = nextUserId;
      shell.generatePage?.onLanguagesLoaded?.();
      shell.libraryPage?.onLanguagesLoaded?.();
      if (!changed) return;

      if (nextUser) {
        store.state.page = 1;
        if (store.state.activeView === 'browse') {
          await shell.libraryPage?.loadLibraryItems({ showSkeleton: true, animate: true });
        } else {
          await loadSnapshotForHeaderAndRecent();
        }
      } else {
        store.resetUserData();
        shell.studyDrawer?.close?.();
        syncLibraryCountBadge();
        shell.generatePage?.renderRecentShelf?.();
        shell.libraryPage?.renderAll?.();
      }
    });
  }

  async function applyRouteState(routeState) {
    if (!routeState || routeState.section !== 'learning-library') return;

    if (
      routeState.domainId &&
      routeState.domainId !== store.state.activeDomainId &&
      (!store.state.domainsLoaded || store.state.domains.some((d) => d.id === routeState.domainId))
    ) {
      store.state.activeDomainId = routeState.domainId;
      store.state.genCategoryId = 'all';
      store.state.genRegister = '';
      store.state.browseCategoryId = 'all';
      store.state.browseRegister = 'all';
      store.state.browseLevel = 'all';
      store.emit('domain:changed', store.state.activeDomainId);
    }

    const subview = routeState.subview === 'browse' ? 'browse' : 'generate';
    activateView(subview, { skipRoute: true });

    if (subview === 'browse') {
      await shell.libraryPage?.onActivate?.(routeState);
    } else {
      shell.generatePage?.onActivate?.(routeState);
      if (store.currentUser()) {
        await loadSnapshotForHeaderAndRecent();
      }
    }

    if (routeState.noteId) {
      await shell.studyDrawer?.open?.(routeState.noteId);
    }
  }

  async function init(routeState) {
    if (!shell.initialized) {
      shell.initialized = true;
      shell.lastAuthUserId = store.currentUser()?.id || null;

      shell.generatePage = global.FlaptapGPGeneratePage.create({
        store,
        api,
        nav: navigation,
        reloadSnapshot: loadSnapshotForHeaderAndRecent,
      });

      shell.libraryPage = global.FlaptapGPLibraryPage.create({
        store,
        api,
        nav: navigation,
        refreshDrawer: () => shell.studyDrawer?.renderIfOpen?.(),
      });

      shell.studyDrawer = global.FlaptapGPStudyDrawer.create({
        store,
        api,
        onAction: (e) => shell.libraryPage?.handleDelegatedAction?.(e),
        onWordLookup: (w, ctx, id, elNode) => shell.libraryPage?.openWordLookup?.(w, ctx, id, elNode),
      });

      bindShellEvents();

      const initialView = routeState?.subview === 'browse' ? 'browse' : 'generate';
      activateView(initialView, { skipRoute: true });

      shell.libraryPage.mount();
      shell.studyDrawer.mount();

      await Promise.all([
        shell.generatePage.mount(),
        loadDomainsCatalog(),
        store.currentUser() && store.ws()?.refreshVocabulary
          ? store.ws().refreshVocabulary()
          : Promise.resolve(),
      ]);
    }

    const activeRoute = routeState || router()?.getCurrentRoute?.();
    if (activeRoute && activeRoute.section === 'learning-library') {
      await applyRouteState(activeRoute);
    } else if (store.currentUser()) {
      await loadSnapshotForHeaderAndRecent();
    }
  }

  async function resumeGeneration(payload) {
    if (!shell.initialized) {
      await init({ section: 'learning-library', subview: 'generate', searchParams: new URLSearchParams() });
    }
    activateView('generate', { skipRoute: true });
    await shell.generatePage?.resumePending?.(payload);
  }

  const publicApi = {
    init,
    applyRouteState,
    switchView: (v, opts) => (v === 'browse' ? navigation.goToLibrary(opts) : navigation.goToGenerate(opts)),
    resumeGeneration,
    loadLibraryItems: (opts) => shell.libraryPage?.loadLibraryItems?.(opts),
    openStudyDrawer: (id) => navigation.openStudyDrawer(id),
    closeStudyDrawer: () => navigation.closeStudyDrawer(),
    getState: () => store.state,
  };

  global.FlaptapLearningLibrary = publicApi;
  global.FlaptapGeneratePhrases = publicApi;
})(window);
