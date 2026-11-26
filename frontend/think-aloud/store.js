/* ==========================================================================
   THINK ALOUD — REACTIVE CLIENT STORE (think-aloud/store.js)
   ========================================================================== */

(function (global) {
  'use strict';

  const PREFS_KEY = 'flaptap_think_aloud_prefs_v1';

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  const saved = loadPrefs();
  const listeners = new Map();

  const state = {
    activeView: 'practice', // 'practice' | 'spines' | 'sessions' | 'detail'
    activeSessionId: '',
    configLoaded: false,
    modes: [],
    domains: [],
    frameworks: [],
    presets: [],
    stages: [],

    // Configurator selections
    mode: saved.mode || 'four_three_two',
    domain: saved.domain || 'programming_ai',
    cefrLevel: saved.cefrLevel || 'B2',
    frameworkId: saved.frameworkId || 'what_so_what_now_what',
    presetId: saved.presetId || 'standard',
    inputMode: saved.inputMode || 'mic', // 'mic' | 'camera' | 'text'
    customTopic: '',

    // Active prompt & session runtime
    generatingPrompt: false,
    evaluatingSession: false,
    activePrompt: null,
    lastReportSession: null,

    // Overview & daily ritual
    overview: null,

    // Spines state
    spinesLoaded: false,
    spinePacks: [],
    selectedPackId: '',
    generatingSpine: false,

    // Sessions list state
    sessionsFilterMode: 'all',
    sessionsFilterDomain: 'all',
    sessionsSearch: '',
    sessionsPage: 1,
    sessionsTotalPages: 1,
    sessionsTotal: 0,
    sessionsItems: [],
    activeDetailSession: null,
  };

  function savePrefs() {
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
          mode: state.mode,
          domain: state.domain,
          cefrLevel: state.cefrLevel,
          frameworkId: state.frameworkId,
          presetId: state.presetId,
          inputMode: state.inputMode,
        }),
      );
    } catch {
      // Non-fatal
    }
  }

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    set.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error('ThinkAloud store listener error:', err);
      }
    });
  }

  function subscribe(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event)?.delete(fn);
  }

  function resetUserData() {
    state.overview = null;
    state.lastReportSession = null;
    state.sessionsItems = [];
    state.sessionsTotal = 0;
    state.activeDetailSession = null;
    state.spinePacks = state.spinePacks.filter((p) => p.isBuiltIn);
  }

  global.FlaptapTAStore = {
    state,
    savePrefs,
    emit,
    subscribe,
    resetUserData,
    ws: () => global.FlaptapWorkspace || null,
    currentUser: () => global.FlaptapWorkspace?.getUser?.() || null,
  };
})(window);
