/* ==========================================================================
   GENERATE PHRASES — SHARED STORE & DOMAIN LOGIC (generate-phrases/store.js)
   Single responsibility: centralized state, pub-sub events, domain metadata,
   CEFR/study-goal preferences, sequence sorting, and translation checks.
   ========================================================================== */

(function (global) {
  'use strict';

  const PAGE_SIZE_OPTIONS = [10, 20, 50];
  const PRESET_COUNTS = [3, 5, 8, 12, 20];
  const DEFAULT_PAGE_SIZE = global.FlaptapPagination?.DEFAULT_PAGE_SIZE || 10;
  const PREFS_STORAGE_KEY = 'flaptap_gp_prefs_v1';
  const LANG_STORAGE_KEY = 'flaptap_trans_lang';

  const FALLBACK_LEVELS = [
    { id: 'all', label: 'Adaptive (All levels)', shortLabel: 'All levels' },
    { id: 'a1_a2', label: 'A1–A2 · Foundational', shortLabel: 'A1–A2' },
    { id: 'b1_b2', label: 'B1–B2 · Intermediate fluency', shortLabel: 'B1–B2' },
    { id: 'b2_c2', label: 'B2–C2 · Advanced native', shortLabel: 'B2–C2' },
    { id: 'a1', label: 'A1 · Beginner', shortLabel: 'A1' },
    { id: 'a2', label: 'A2 · Elementary', shortLabel: 'A2' },
    { id: 'b1', label: 'B1 · Intermediate', shortLabel: 'B1' },
    { id: 'b2', label: 'B2 · Upper-Intermediate', shortLabel: 'B2' },
    { id: 'c1', label: 'C1 · Advanced', shortLabel: 'C1' },
    { id: 'c2', label: 'C2 · Mastery', shortLabel: 'C2' },
  ];

  const FALLBACK_GOALS = [
    { id: 'full', label: 'Full study guide (Default)', shortLabel: 'Full study' },
    { id: 'speaking', label: 'Speaking & pronunciation', shortLabel: 'Speaking' },
    { id: 'workplace', label: 'Workplace & tech meetings', shortLabel: 'Workplace' },
    { id: 'active_recall', label: 'Pitfalls & active recall', shortLabel: 'Recall & pitfalls' },
  ];

  const FALLBACK_LANGUAGES = [
    { code: 'ar', name: 'Arabic', native: 'العربية', rtl: true },
    { code: 'en', name: 'English', native: 'English', rtl: false },
    { code: 'es', name: 'Spanish', native: 'Español', rtl: false },
    { code: 'fr', name: 'French', native: 'Français', rtl: false },
    { code: 'de', name: 'German', native: 'Deutsch', rtl: false },
    { code: 'tr', name: 'Turkish', native: 'Türkçe', rtl: false },
  ];

  const CATEGORY_TONE_MAP = {
    fillers_hesitation: 'orange',
    modern_slang: 'orange',
    creator_podcast: 'orange',
    connected_reductions: 'teal',
    idioms_phrasal_combos: 'teal',
    concurrency_async: 'teal',
    distributed_systems: 'teal',
    conversational_patterns: 'indigo',
    type_systems: 'indigo',
    ai_ml_systems: 'indigo',
    tech_startup_casual: 'green',
    code_craft_idioms: 'green',
    observability_ops: 'green',
    discourse_markers: 'blue',
    memory_runtime: 'blue',
    product_architecture: 'blue',
  };

  function safeLocalGet(key) {
    try {
      return localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  }

  function safeLocalSet(key, val) {
    try {
      localStorage.setItem(key, val);
    } catch {}
  }

  function readSavedPageSize() {
    const n = Number(safeLocalGet('flaptap_ll_page_size'));
    return PAGE_SIZE_OPTIONS.includes(n) ? n : DEFAULT_PAGE_SIZE;
  }

  function readSavedPrefs() {
    try {
      const raw = safeLocalGet(PREFS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        level: parsed?.level || 'all',
        studyGoal: parsed?.studyGoal || 'full',
      };
    } catch {
      return { level: 'all', studyGoal: 'full' };
    }
  }

  const savedPrefs = readSavedPrefs();
  const listeners = new Map();

  const state = {
    domainsLoaded: false,
    domains: [],
    levels: FALLBACK_LEVELS,
    studyGoals: FALLBACK_GOALS,
    activeDomainId: 'natural_american_english',
    activeView: 'generate', // 'generate' | 'browse'
    // Generator preferences
    requestedCount: 8,
    genCategoryId: 'all',
    genRegister: '',
    genLevel: savedPrefs.level,
    genStudyGoal: savedPrefs.studyGoal,
    focusTopic: '',
    targetLanguage: safeLocalGet(LANG_STORAGE_KEY) || 'ar',
    isGenerating: false,
    justGeneratedIds: new Set(),
    latestBatchResult: null,
    // Library data & filters
    items: [],
    recentItems: [],
    stats: {
      totalItems: 0,
      newCount: 0,
      learningCount: 0,
      masteredCount: 0,
      completedCount: 0,
      favoritesCount: 0,
      batchesCount: 0,
    },
    categoryCounts: {},
    registerCounts: {},
    cefrCounts: {},
    browseCategoryId: 'all',
    browseMastery: 'all', // 'all' | 'pending' | 'completed' | 'favorites'
    browseRegister: 'all',
    browseLevel: 'all',
    browseSearch: '',
    browseSort: 'newest',
    page: 1,
    pageSize: readSavedPageSize(),
    totalPages: 1,
    filteredCount: 0,
    filteredCompletedCount: 0,
    hasMore: false,
    hasLoadedOnce: false,
    isLoadingList: false,
    animateNextRender: false,
    viewMode:
      safeLocalGet('flaptap_ll_view_mode') || (global.innerWidth < 720 ? 'cards' : 'table'),
    recallMaskMode: false,
    revealedCardIds: new Set(),
    translatingItemIds: new Set(),
    selectedIds: new Set(),
    activeStudyItemId: null,
  };

  function subscribe(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event)?.delete(fn);
  }

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`FlaptapGPStore [${event}] error:`, err);
      }
    }
  }

  function ws() {
    return global.FlaptapWorkspace || null;
  }

  function currentUser() {
    return ws()?.getUser?.() || null;
  }

  function languages() {
    const list = ws()?.getLanguages?.() || [];
    return list.length > 0 ? list : FALLBACK_LANGUAGES;
  }

  function isRtl(code) {
    return global.FlaptapPhraseUtils
      ? global.FlaptapPhraseUtils.isRtlLanguage(code, languages())
      : ['ar', 'fa', 'he', 'ur'].includes(String(code || '').toLowerCase());
  }

  function getPreferredLanguage() {
    return (
      state.targetLanguage ||
      currentUser()?.nativeLanguage ||
      safeLocalGet(LANG_STORAGE_KEY) ||
      'ar'
    );
  }

  function setPreferredLanguage(code) {
    const clean = String(code || '').trim();
    if (!clean) return;
    state.targetLanguage = clean;
    safeLocalSet(LANG_STORAGE_KEY, clean);
    emit('language:changed', clean);
  }

  function saveGenPrefs() {
    safeLocalSet(
      PREFS_STORAGE_KEY,
      JSON.stringify({
        level: state.genLevel || 'all',
        studyGoal: state.genStudyGoal || 'full',
      }),
    );
  }

  function getActiveDomain() {
    return (
      state.domains.find((d) => d.id === state.activeDomainId) ||
      state.domains[0] ||
      null
    );
  }

  function getCategoryTone(categoryId) {
    const key = String(categoryId || '').trim().toLowerCase();
    return CATEGORY_TONE_MAP[key] || 'blue';
  }

  function capitalize(str) {
    const s = String(str || '');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  function isDistinctLabel(a, b) {
    const x = String(a || '').trim().toLowerCase();
    const y = String(b || '').trim().toLowerCase();
    return Boolean(x && x !== y);
  }

  function studyState(total, done) {
    return global.FlaptapPhraseUtils
      ? global.FlaptapPhraseUtils.computeStudyState({ total, done })
      : {
          total: Number(total) || 0,
          done: Number(done) || 0,
          remaining: Math.max(0, (Number(total) || 0) - (Number(done) || 0)),
          tone: total > 0 && done >= total ? 'done' : done > 0 ? 'progress' : 'new',
          label: total > 0 && done >= total ? 'Completed' : done > 0 ? 'In progress' : 'Not started',
          pct: total > 0 ? Math.round((done / total) * 100) : 0,
        };
  }

  function hasMissingSentenceTranslations(item, langCode = getPreferredLanguage()) {
    const cleanLang = String(langCode || 'ar').trim().toLowerCase();
    if (!item || cleanLang === 'en') return false;
    const itemLang = String(item.targetLanguage || '').trim().toLowerCase();
    if (itemLang && itemLang !== cleanLang) return true;
    if (!String(item.localizedMeaning || '').trim()) return true;
    const examples = Array.isArray(item.examples) ? item.examples : [];
    if (examples.some((ex) => ex?.sentence && !String(ex.translation || '').trim())) return true;
    return false;
  }

  function findItemAnywhere(id) {
    if (!id) return null;
    return (
      state.items.find((i) => i.id === id) ||
      state.recentItems.find((i) => i.id === id) ||
      null
    );
  }

  function replaceItemInMemory(updated) {
    if (!updated?.id) return;
    state.items = state.items.map((it) => (it.id === updated.id ? updated : it));
    state.recentItems = state.recentItems.map((it) => (it.id === updated.id ? updated : it));
    emit('item:updated', updated);
  }

  function compareLibraryItems(a, b) {
    const sort = state.browseSort || 'newest';
    if (sort === 'alphabetical') {
      return String(a.expression || '').localeCompare(String(b.expression || ''), 'en', {
        sensitivity: 'base',
      });
    }
    if (sort === 'mastery') {
      const completedDiff = Number(Boolean(a.isCompleted)) - Number(Boolean(b.isCompleted));
      if (completedDiff !== 0) return completedDiff;
      const rank = (it) => (it.masteryStatus === 'mastered' ? 2 : it.masteryStatus === 'learning' ? 1 : 0);
      const rankDiff = rank(a) - rank(b);
      if (rankDiff !== 0) return rankDiff;
    }
    if (sort === 'most_reviewed') {
      const reviewDiff = (Number(b.reviewCount) || 0) - (Number(a.reviewCount) || 0);
      if (reviewDiff !== 0) return reviewDiff;
    }
    const seqA = Number(a.sequenceNumber) || 0;
    const seqB = Number(b.sequenceNumber) || 0;
    if (seqA !== seqB) return seqB - seqA;
    const createdA = String(a.createdAt || '');
    const createdB = String(b.createdAt || '');
    if (createdA !== createdB) return createdB.localeCompare(createdA);
    return String(b.id || '').localeCompare(String(a.id || ''));
  }

  function resetUserData() {
    state.items = [];
    state.recentItems = [];
    state.page = 1;
    state.totalPages = 1;
    state.filteredCount = 0;
    state.filteredCompletedCount = 0;
    state.hasMore = false;
    state.hasLoadedOnce = false;
    state.isLoadingList = false;
    state.justGeneratedIds.clear();
    state.revealedCardIds.clear();
    state.selectedIds.clear();
    state.latestBatchResult = null;
    state.categoryCounts = {};
    state.registerCounts = {};
    state.cefrCounts = {};
    state.stats = {
      totalItems: 0,
      newCount: 0,
      learningCount: 0,
      masteredCount: 0,
      completedCount: 0,
      favoritesCount: 0,
      batchesCount: 0,
    };
    emit('stats:changed', state.stats);
  }

  function hasActiveBrowseFilters() {
    return Boolean(
      state.browseCategoryId !== 'all' ||
        state.browseMastery !== 'all' ||
        state.browseRegister !== 'all' ||
        state.browseLevel !== 'all' ||
        state.browseSearch.trim().length > 0,
    );
  }

  global.FlaptapGPStore = {
    PAGE_SIZE_OPTIONS,
    PRESET_COUNTS,
    DEFAULT_PAGE_SIZE,
    state,
    subscribe,
    emit,
    ws,
    currentUser,
    languages,
    isRtl,
    getPreferredLanguage,
    setPreferredLanguage,
    saveGenPrefs,
    getActiveDomain,
    getCategoryTone,
    capitalize,
    isDistinctLabel,
    studyState,
    hasMissingSentenceTranslations,
    findItemAnywhere,
    replaceItemInMemory,
    compareLibraryItems,
    resetUserData,
    hasActiveBrowseFilters,
    safeLocalSet,
  };
})(window);
