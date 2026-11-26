/* ==========================================================================
   THINK ALOUD — FEATURE SHELL & ROUTER COORDINATOR (think-aloud/index.js)
   Manages Practice | Spines | Sessions | Detail subviews, config loading,
   pending-action resume after Sign-In, and media cleanup on section exit.
   ========================================================================== */

(function (global) {
  'use strict';

  const store = global.FlaptapTAStore;
  const api = global.FlaptapTAApi;

  const shell = {
    initialized: false,
    eventsBound: false,
    inflightConfig: null,
    lastAuthUserId: null,
    recorder: null,
    practicePage: null,
    spinesPage: null,
    sessionsPage: null,
  };

  function router() {
    return global.FlaptapRouter || null;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function activateView(view, options = {}) {
    const next = ['spines', 'sessions', 'detail'].includes(view) ? view : 'practice';
    const prev = store.state.activeView;
    store.state.activeView = next;

    if (prev === 'practice' && next !== 'practice') {
      shell.practicePage?.onDeactivate?.();
    }

    const pPractice = el('ta-view-practice');
    const pSpines = el('ta-view-spines');
    const pSessions = el('ta-view-sessions');
    const pDetail = el('ta-view-detail');

    if (pPractice) pPractice.hidden = next !== 'practice';
    if (pSpines) pSpines.hidden = next !== 'spines';
    if (pSessions) pSessions.hidden = next !== 'sessions';
    if (pDetail) pDetail.hidden = next !== 'detail';

    const tabMap = {
      practice: el('ta-tab-practice'),
      spines: el('ta-tab-spines'),
      sessions: el('ta-tab-sessions'),
    };
    Object.entries(tabMap).forEach(([k, btn]) => {
      if (!btn) return;
      const isAct = next === k || (next === 'detail' && k === 'sessions');
      btn.classList.toggle('active', isAct);
      btn.setAttribute('aria-selected', isAct ? 'true' : 'false');
    });

    if (!options.skipRoute && router()) {
      router().navigate('think-aloud', {
        subview: next,
        noteId: options.sessionId || store.state.activeSessionId || '',
        replace: Boolean(options.replace),
      });
    }
  }

  async function loadConfig() {
    if (store.state.configLoaded) return;
    if (shell.inflightConfig) return shell.inflightConfig;
    shell.inflightConfig = (async () => {
      try {
        const res = await api.getConfig();
        store.state.modes = Array.isArray(res?.modes) ? res.modes : [];
        store.state.domains = Array.isArray(res?.domains) ? res.domains : [];
        store.state.frameworks = Array.isArray(res?.frameworks) ? res.frameworks : [];
        store.state.presets = Array.isArray(res?.presets) ? res.presets : [];
        store.state.stages = Array.isArray(res?.stages) ? res.stages : [];
        store.state.configLoaded = true;
      } catch (err) {
        console.error('Failed to load Think Aloud config:', err);
      } finally {
        shell.inflightConfig = null;
      }
    })();
    return shell.inflightConfig;
  }

  function syncSessionsBadge() {
    const badge = el('ta-nav-sessions-count');
    if (!badge) return;
    const count = Number(store.state.overview?.totalSessions ?? store.state.sessionsTotal) || 0;
    badge.textContent = String(count);
  }

  const navigation = {
    goToPractice(options = {}) {
      activateView('practice', options);
      shell.practicePage?.onActivate?.(options);
    },
    goToPracticeWithTopic(params = {}) {
      activateView('practice', { replace: false });
      shell.practicePage?.startWithTopic?.(params);
    },
    goToSpines(options = {}) {
      activateView('spines', options);
      shell.spinesPage?.onActivate?.(options);
    },
    goToSessions(options = {}) {
      activateView('sessions', options);
      shell.sessionsPage?.onActivate?.(options);
    },
    goToDetail(sessionId, options = {}) {
      store.state.activeSessionId = sessionId;
      activateView('detail', { ...options, sessionId });
      shell.sessionsPage?.openDetail?.(sessionId);
    },
  };

  function bindShellEvents() {
    if (shell.eventsBound) return;
    shell.eventsBound = true;

    el('ta-tab-practice')?.addEventListener('click', () => navigation.goToPractice());
    el('ta-tab-spines')?.addEventListener('click', () => navigation.goToSpines());
    el('ta-tab-sessions')?.addEventListener('click', () => navigation.goToSessions());

    store.subscribe('overview:updated', syncSessionsBadge);

    global.addEventListener('flaptap:data-purged', async (e) => {
      const detail = e?.detail || {};
      const f = String(detail.feature || '').toLowerCase();
      if (detail.resetAll || f === 'think_aloud' || f === 'think_aloud_sessions' || f === 'think_aloud_spines') {
        store.resetUserData();
        store.state.activeDetailSession = null;
        store.state.lastReportSession = null;
        syncSessionsBadge();
        shell.practicePage?.renderOverviewStrip?.();
        shell.practicePage?.renderReport?.();
        await shell.spinesPage?.loadSpines?.();
        if (store.state.activeView === 'sessions' || store.state.activeView === 'detail') {
          await shell.sessionsPage?.loadSessions?.();
          if (store.state.activeView === 'detail') navigation.goToSessions({ replace: true });
        }
      }
    });

    global.addEventListener('flaptap:auth-changed', async (e) => {
      const nextUser = e?.detail?.user || store.currentUser();
      const nextUserId = nextUser?.id || null;
      const changed = nextUserId !== shell.lastAuthUserId;
      shell.lastAuthUserId = nextUserId;
      if (!changed) return;

      if (nextUser) {
        await shell.practicePage?.refreshOverview?.();
        syncSessionsBadge();
        if (store.state.activeView === 'spines') await shell.spinesPage?.loadSpines?.();
        if (store.state.activeView === 'sessions') await shell.sessionsPage?.loadSessions?.();
        if (store.state.activeView === 'detail' && store.state.activeSessionId) {
          await shell.sessionsPage?.openDetail?.(store.state.activeSessionId);
        }
      } else {
        store.resetUserData();
        syncSessionsBadge();
        shell.practicePage?.renderOverviewStrip?.();
        shell.practicePage?.renderReport?.();
        shell.spinesPage?.renderAll?.();
        shell.sessionsPage?.renderList?.();
      }
    });
  }

  async function applyRouteState(routeState) {
    if (!routeState || routeState.section !== 'think-aloud') return;
    const subview = routeState.subview || 'practice';
    if (subview === 'detail' && routeState.noteId) {
      store.state.activeSessionId = routeState.noteId;
      activateView('detail', { skipRoute: true });
      await shell.sessionsPage?.openDetail?.(routeState.noteId);
    } else if (subview === 'spines') {
      activateView('spines', { skipRoute: true });
      await shell.spinesPage?.onActivate?.(routeState);
    } else if (subview === 'sessions') {
      activateView('sessions', { skipRoute: true });
      await shell.sessionsPage?.onActivate?.(routeState);
    } else {
      activateView('practice', { skipRoute: true });
      await shell.practicePage?.onActivate?.(routeState);
    }
    syncSessionsBadge();
  }

  async function init(routeState) {
    if (!shell.initialized) {
      shell.initialized = true;
      shell.lastAuthUserId = store.currentUser()?.id || null;
      shell.recorder = global.FlaptapTARecorder.create();

      shell.practicePage = global.FlaptapTAPracticePage.create({
        store,
        api,
        nav: navigation,
        recorder: shell.recorder,
      });
      shell.spinesPage = global.FlaptapTASpinesPage.create({
        store,
        api,
        nav: navigation,
      });
      shell.sessionsPage = global.FlaptapTASessionsPage.create({
        store,
        api,
        nav: navigation,
        practicePage: shell.practicePage,
      });

      bindShellEvents();
      await loadConfig();

      shell.practicePage.mount();
      shell.spinesPage.mount();
      shell.sessionsPage.mount();
    }

    const activeRoute = routeState || router()?.getCurrentRoute?.();
    if (activeRoute && activeRoute.section === 'think-aloud') {
      await applyRouteState(activeRoute);
    }
  }

  async function resumePending(action) {
    if (!shell.initialized) {
      await init({ section: 'think-aloud', subview: 'practice', searchParams: new URLSearchParams() });
    }
    if (action?.type === 'think_aloud_prompt') {
      activateView('practice', { skipRoute: true });
      await shell.practicePage?.resumePendingPrompt?.(action.payload);
    } else if (action?.type === 'think_aloud_evaluate') {
      activateView('practice', { skipRoute: true });
      await shell.practicePage?.resumePendingEvaluate?.(action.payload);
    } else if (action?.type === 'think_aloud_spine') {
      activateView('spines', { skipRoute: true });
      await shell.spinesPage?.resumePendingSpine?.(action.payload);
    }
  }

  global.FlaptapThinkAloud = {
    init,
    applyRouteState,
    onDeactivate: () => shell.practicePage?.onDeactivate?.(),
    resumePending,
    getState: () => store.state,
  };
})(window);
