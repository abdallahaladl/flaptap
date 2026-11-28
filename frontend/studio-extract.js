/* ==========================================================================
   FLAPTAP STUDIO — INSIGHTS LEXICON WORKBENCH (studio-extract.js)
   Paragraph-first interactive learning + Extraction-list flexible view.
   Renders inside `#mode-panel-extract` inside Media Hub Studio.
   Relies on `FlaptapStudioInsightsEngine` (studio-insights-engine.js).
   ========================================================================== */

(function (global) {
  'use strict';

  const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const CEFR_RANK = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
  const CEFR_PRESETS = [
    { id: 'all', label: 'All', minRank: 0 },
    { id: 'a2_plus', label: 'A2+', minRank: 2 },
    { id: 'b1_plus', label: 'B1+', minRank: 3 },
    { id: 'b2_plus', label: 'B2+', minRank: 4 },
    { id: 'c1_plus', label: 'C1+', minRank: 5 },
    { id: 'c2', label: 'C2', exact: 'C2' },
  ];

  const MACRO_GROUPS = [
    {
      id: 'all',
      label: 'All Types',
      categories: null,
    },
    {
      id: 'words',
      label: 'Words & Verbs',
      categories: new Set(['vocabulary', 'phrasal_verb', 'collocation']),
    },
    {
      id: 'idioms',
      label: 'Phrases & Idioms',
      categories: new Set([
        'idiom',
        'slang',
        'conversational_expression',
        'native_response',
        'filler',
        'interjection',
        'metaphor_figurative',
      ]),
    },
    {
      id: 'structures',
      label: 'Structures & Flow',
      categories: new Set(['pattern', 'grammar_structure', 'discourse_marker', 'key_sentence']),
    },
    {
      id: 'spoken',
      label: 'Spoken & Phonetics',
      categories: new Set([
        'connected_speech',
        'contraction_reduction',
        'pronunciation_phonetics',
        'word_sentence_stress',
        'linking_sound_changes',
      ]),
    },
    {
      id: 'culture',
      label: 'Pragmatics & Culture',
      categories: new Set(['cultural_reference', 'pragmatics_context']),
    },
  ];

  const CATEGORY_LABELS = {
    pattern: 'Sentence Pattern',
    vocabulary: 'Vocabulary',
    idiom: 'Idiom',
    phrasal_verb: 'Phrasal Verb',
    collocation: 'Collocation',
    slang: 'Slang',
    conversational_expression: 'Conversational',
    grammar_structure: 'Grammar Structure',
    discourse_marker: 'Discourse Marker',
    filler: 'Filler',
    interjection: 'Interjection',
    contraction_reduction: 'Reduction',
    metaphor_figurative: 'Figurative',
    cultural_reference: 'Cultural Ref',
    pragmatics_context: 'Pragmatics',
    native_response: 'Native Reaction',
    connected_speech: 'Connected Speech',
    pronunciation_phonetics: 'Phonetics',
    word_sentence_stress: 'Stress & Rhythm',
    linking_sound_changes: 'Linking',
    key_sentence: 'Key Sentence',
  };

  const DEPTH_OPTIONS = [
    { id: 'exhaustive', label: 'Exhaustive (All A1–C2 items across full transcript)' },
    { id: 'comprehensive', label: 'Comprehensive (Deep multi-pass)' },
    { id: 'adaptive', label: 'Adaptive (Balanced)' },
    { id: 'focused', label: 'Focused (10–15 key items)' },
    { id: 'essentials', label: 'Essentials (Top 5–8)' },
  ];

  const FOCUS_OPTIONS = [
    { id: 'balanced', label: 'Balanced (All categories)' },
    { id: 'everyday', label: 'Everyday & social spoken' },
    { id: 'creator', label: 'Creator & podcast fluency' },
    { id: 'professional', label: 'Professional & technical' },
    { id: 'media', label: 'Movies, TV & storytelling' },
  ];

  const FREQUENCY_RANK = { essential: 4, common: 3, moderate: 2, rare: 1 };

  const LEVEL_PREF_KEY = 'flaptap_extract_level_pref';
  const LANG_PREF_KEY = 'flaptap_trans_lang';
  const DEPTH_PREF_KEY = 'flaptap_extract_depth_pref';
  const VIEW_MODE_PREF_KEY = 'flaptap_insights_view_mode';
  const EXTRACTION_PAGE_SIZE = 40;
  const PARAGRAPH_PAGE_SIZE = 16;

  const ICONS = {
    layers:
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 12 12 17 22 12"></polyline><polyline points="2 17 12 22 22 17"></polyline></svg>',
    play:
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>',
    pause:
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>',
    loop:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="17 2 21 6 17 10"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 22 3 18 7 14"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>',
    target:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="4"></circle></svg>',
    mic:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>',
    speaker:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>',
    bookmark:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path></svg>',
    spark:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4"></path><path d="M12 17v4"></path><path d="M3 12h4"></path><path d="M17 12h4"></path><path d="m6.3 6.3 2.8 2.8"></path><path d="m14.9 14.9 2.8 2.8"></path><path d="m17.7 6.3-2.8 2.8"></path><path d="m9.1 14.9-2.8 2.8"></path></svg>',
    sliders:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>',
    download:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
    search:
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
    paragraph:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="14" y2="18"></line></svg>',
    list:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><circle cx="4" cy="6" r="1"></circle><circle cx="4" cy="12" r="1"></circle><circle cx="4" cy="18" r="1"></circle></svg>',
    flow:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>',
    close:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>',
    chevLeft:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>',
    chevRight:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>',
    arrowRight:
      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>',
  };

  function bridge() {
    return global.FlaptapStudioBridge || null;
  }

  function engine() {
    return global.FlaptapStudioInsightsEngine || null;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTs(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  function loadStoredLevelPref() {
    try {
      const raw = localStorage.getItem(LEVEL_PREF_KEY);
      if (!raw) return { preset: 'all', customLevels: [] };
      const parsed = JSON.parse(raw);
      return {
        preset: typeof parsed.preset === 'string' ? parsed.preset : 'all',
        customLevels: Array.isArray(parsed.customLevels) ? parsed.customLevels : [],
      };
    } catch {
      return { preset: 'all', customLevels: [] };
    }
  }

  function saveStoredLevelPref(preset, customLevels) {
    try {
      localStorage.setItem(LEVEL_PREF_KEY, JSON.stringify({ preset, customLevels }));
    } catch {}
  }

  function loadStoredLang() {
    try {
      return localStorage.getItem(LANG_PREF_KEY) || 'ar';
    } catch {
      return 'ar';
    }
  }

  function loadStoredDepth() {
    try {
      return localStorage.getItem(DEPTH_PREF_KEY) || 'exhaustive';
    } catch {
      return 'exhaustive';
    }
  }

  function loadStoredViewMode() {
    try {
      const val = localStorage.getItem(VIEW_MODE_PREF_KEY);
      return val === 'extraction' ? 'extraction' : 'paragraph';
    } catch {
      return 'paragraph';
    }
  }

  function saveStoredViewMode(mode) {
    try {
      localStorage.setItem(VIEW_MODE_PREF_KEY, mode === 'extraction' ? 'extraction' : 'paragraph');
    } catch {}
  }

  const state = {
    lessonId: '',
    loadedLessonId: '',
    loading: false,
    note: null,
    guides: [],
    streaming: false,
    streamStage: '',
    streamError: '',
    streamPreview: [],
    abortController: null,
    settingsOpen: false,
    filtersOpen: false,
    languages: null,
    aiSelector: null,
    // Config options for next extraction
    configLanguage: loadStoredLang(),
    configDepth: loadStoredDepth(),
    configFocus: 'balanced',
    configForce: false,
    // View mode ('paragraph' | 'extraction')
    viewMode: loadStoredViewMode(),
    // Workbench filters
    levelPreset: loadStoredLevelPref().preset,
    customLevels: loadStoredLevelPref().customLevels,
    macroGroup: 'all',
    category: 'all',
    posFilter: 'all',
    registerFilter: 'all',
    statusFilter: 'all',
    sortBy: 'appearance',
    search: '',
    page: 1,
    // Paragraph view state
    activeItemByPara: new Map(),
    lastParagraphs: [],
    syncActiveParaId: null,
    syncHighlightIdx: null,
    // Study helpers
    recallMode: false,
    revealedIndices: new Set(),
    autoSync: true,
    activeLoopKey: '',
    exportMenuOpen: false,
    unsubscribeTick: null,
  };

  function getContainer() {
    return document.getElementById('mode-panel-extract');
  }

  function isRtlLanguage(code) {
    const c = String(code || '').toLowerCase();
    if (Array.isArray(state.languages)) {
      const found = state.languages.find((l) => l.code === c);
      if (found) return Boolean(found.rtl);
    }
    return c === 'ar' || c === 'he' || c === 'fa' || c === 'ur';
  }

  function completedSetForNote(note) {
    const raw = note?.completionProgress?.items;
    return new Set(Array.isArray(raw) ? raw.map((n) => Number(n)) : []);
  }

  function highlightVerbatimTerm(sentence, term, surface) {
    const clean = String(sentence || '');
    if (!clean) return '';
    const candidates = [surface, term]
      .map((v) => String(v || '').trim())
      .filter((v) => v.length >= 2);
    for (const target of candidates) {
      const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(${escaped})`, 'i');
      if (re.test(clean)) {
        const parts = clean.split(re);
        return parts
          .map((part, i) => (i % 2 === 1 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)))
          .join('');
      }
    }
    return escapeHtml(clean);
  }

  function itemMatchesCefr(item, presetId = state.levelPreset, customLevels = state.customLevels) {
    const cefr = String(item?.cefr || '').trim().toUpperCase();
    if (Array.isArray(customLevels) && customLevels.length > 0) {
      return customLevels.includes(cefr);
    }
    if (!presetId || presetId === 'all') return true;
    const preset = CEFR_PRESETS.find((p) => p.id === presetId);
    if (!preset) return true;
    if (preset.exact) return cefr === preset.exact;
    if (preset.minRank > 0) {
      const r = CEFR_RANK[cefr];
      return r ? r >= preset.minRank : true;
    }
    return true;
  }

  function getFilteredItems(ignoreCefr = false) {
    const items = Array.isArray(state.note?.items) ? state.note.items : [];
    const doneSet = completedSetForNote(state.note);
    const query = state.search.trim().toLowerCase();
    const macro = MACRO_GROUPS.find((g) => g.id === state.macroGroup);

    const filtered = items.filter((item) => {
      if (!ignoreCefr && !itemMatchesCefr(item)) return false;
      if (macro?.categories && !macro.categories.has(item.category)) return false;
      if (state.category !== 'all' && item.category !== state.category) return false;
      if (state.posFilter !== 'all' && String(item.partOfSpeech || '').toLowerCase() !== state.posFilter) {
        return false;
      }
      if (state.registerFilter !== 'all' && String(item.register || '').toLowerCase() !== state.registerFilter) {
        return false;
      }
      if (state.statusFilter === 'remaining' && doneSet.has(Number(item.index))) return false;
      if (state.statusFilter === 'studied' && !doneSet.has(Number(item.index))) return false;
      if (query) {
        const haystack = [
          item.term,
          item.surface,
          item.meaning,
          item.localizedMeaning,
          item.contextSentence,
          item.contextTranslation,
          item.usageNote,
          item.spokenNote,
          item.example,
          item.partOfSpeech,
        ]
          .filter(Boolean)
          .join('\n')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    const sorted = filtered.slice();
    if (state.sortBy === 'hardest') {
      sorted.sort((a, b) => (CEFR_RANK[b.cefr] || 0) - (CEFR_RANK[a.cefr] || 0) || a.index - b.index);
    } else if (state.sortBy === 'easiest') {
      sorted.sort((a, b) => (CEFR_RANK[a.cefr] || 99) - (CEFR_RANK[b.cefr] || 99) || a.index - b.index);
    } else if (state.sortBy === 'importance') {
      sorted.sort(
        (a, b) =>
          (FREQUENCY_RANK[String(b.frequency || '').toLowerCase()] || 0) -
            (FREQUENCY_RANK[String(a.frequency || '').toLowerCase()] || 0) ||
          (CEFR_RANK[b.cefr] || 0) - (CEFR_RANK[a.cefr] || 0) ||
          a.index - b.index,
      );
    } else {
      sorted.sort((a, b) => Number(a.index) - Number(b.index));
    }
    return sorted;
  }

  function hasAnyActiveFilters() {
    return (
      state.levelPreset !== 'all' ||
      state.customLevels.length > 0 ||
      state.macroGroup !== 'all' ||
      state.category !== 'all' ||
      state.posFilter !== 'all' ||
      state.registerFilter !== 'all' ||
      state.statusFilter !== 'all' ||
      state.search.trim().length > 0
    );
  }

  async function ensureLanguages() {
    if (Array.isArray(state.languages)) return state.languages;
    try {
      const res = await bridge()?.apiFetch?.('/api/languages', { method: 'GET' });
      if (Array.isArray(res?.languages) && res.languages.length > 0) {
        state.languages = res.languages;
        return state.languages;
      }
    } catch {}
    state.languages = [
      { code: 'ar', name: 'Arabic', native: 'العربية', rtl: true },
      { code: 'en', name: 'English', native: 'English', rtl: false },
      { code: 'es', name: 'Spanish', native: 'Español', rtl: false },
      { code: 'fr', name: 'French', native: 'Français', rtl: false },
      { code: 'de', name: 'German', native: 'Deutsch', rtl: false },
      { code: 'tr', name: 'Turkish', native: 'Türkçe', rtl: false },
    ];
    return state.languages;
  }

  function mountAiSelector() {
    const mount = document.getElementById('stx-ai-selector-mount');
    if (!mount || !global.FlaptapAiSelector) return;
    if (state.aiSelector && mount.children.length > 0) return;
    state.aiSelector = global.FlaptapAiSelector.create({
      container: mount,
      idPrefix: 'stx-aisel',
      persistenceKey: 'media_hub_extract',
      title: 'Extraction Model',
      compact: true,
      showRunButton: false,
      hideMetaChips: true,
      fetcher: (url, opts) => bridge()?.apiFetch?.(url, opts),
    });
    state.aiSelector.init();
  }

  function resolveSelectedAiOptions() {
    const sel = state.aiSelector?.getSelection?.();
    if (sel && (sel.keyId || sel.model)) {
      return {
        keyId: sel.keyId || undefined,
        model: sel.model || undefined,
        variant: sel.variant || undefined,
      };
    }
    try {
      const raw = localStorage.getItem('flaptap_aisel_media_hub_extract');
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          keyId: parsed.keyId || undefined,
          model: parsed.model || undefined,
          variant: parsed.variant || undefined,
        };
      }
    } catch {}
    return {};
  }

  async function fetchExtractionForLesson(lessonId, { forceRender = false } = {}) {
    if (!lessonId || state.loading) return;
    state.loading = true;
    state.streamError = '';
    if (forceRender) render();

    try {
      const [res] = await Promise.all([
        bridge()?.apiFetch?.(`/api/tracks/media-hub/${encodeURIComponent(lessonId)}/extraction`, {
          method: 'GET',
        }),
        ensureLanguages(),
        bridge()?.loadSavedVocabularyTerms?.(),
      ]);
      if (state.lessonId !== lessonId) return;
      state.loadedLessonId = lessonId;
      state.note = res?.data || null;
      state.guides = Array.isArray(res?.guides) ? res.guides : [];
      state.settingsOpen = !state.note;
      state.activeItemByPara.clear();
      bridge()?.setExtractBadge?.(state.note?.items?.length || 0);
    } catch (err) {
      state.streamError = err?.message || 'Could not load extraction state.';
    } finally {
      state.loading = false;
      render();
    }
  }

  async function loadSpecificGuide(noteId) {
    if (!noteId) return;
    try {
      const res = await bridge()?.apiFetch?.(
        `/api/american-extractor/notes/${encodeURIComponent(noteId)}`,
        { method: 'GET' },
      );
      if (res?.data) {
        state.note = res.data;
        state.page = 1;
        state.revealedIndices.clear();
        state.activeItemByPara.clear();
        bridge()?.setExtractBadge?.(state.note?.items?.length || 0);
        render();
      }
    } catch (err) {
      bridge()?.showToast?.(err?.message || 'Could not open selected extraction guide.');
    }
  }

  async function startExtractionStream({ force = false } = {}) {
    const lesson = bridge()?.getItem?.();
    if (!lesson?.id || state.streaming) return;
    if (!Array.isArray(lesson.sentences) || lesson.sentences.length === 0) {
      bridge()?.showToast?.('Load or paste a transcript first before extracting.');
      return;
    }

    state.abortController?.abort();
    const ac = new AbortController();
    state.abortController = ac;
    state.streaming = true;
    state.streamError = '';
    state.streamStage = 'Preparing full transcript for deep extraction...';
    state.streamPreview = [];
    render();

    const aiOpts = resolveSelectedAiOptions();
    const body = {
      language: state.configLanguage || 'ar',
      depth: state.configDepth || 'exhaustive',
      level: 'all',
      focus: state.configFocus || 'balanced',
      studyGoal: 'full',
      order: 'appearance',
      categories: ['all'],
      force: Boolean(force || state.configForce),
      ...aiOpts,
    };

    try {
      const response = await fetch(
        `/api/tracks/media-hub/${encodeURIComponent(lesson.id)}/extract/stream`,
        {
          method: 'POST',
          headers: bridge()?.apiHeaders?.({ 'Content-Type': 'application/json' }) || {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
          body: JSON.stringify(body),
          signal: ac.signal,
        },
      );

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(errPayload.message || `Extraction failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const chunk of events) {
          let eventName = 'message';
          let dataLine = '';
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
          }
          if (!dataLine) continue;
          let payload;
          try {
            payload = JSON.parse(dataLine);
          } catch {
            continue;
          }

          if (eventName === 'stage') {
            state.streamStage = payload.message || payload.stage || 'Extracting...';
            updateStreamDom();
          } else if (eventName === 'item_preview') {
            if (payload.item && state.streamPreview.length < 40) {
              state.streamPreview.push(payload.item);
              updateStreamDom();
            }
          } else if (eventName === 'complete') {
            state.note = payload.data || state.note;
            state.settingsOpen = false;
            state.page = 1;
            state.revealedIndices.clear();
            state.activeItemByPara.clear();
            bridge()?.setExtractBadge?.(state.note?.items?.length || 0);
            if (state.note?.id && !state.guides.some((g) => g.id === state.note.id)) {
              state.guides.unshift({
                id: state.note.id,
                title: state.note.title,
                itemCount: state.note.items?.length || 0,
                depth: state.note.depth,
                targetLanguage: state.note.targetLanguage,
              });
            }
            bridge()?.showToast?.(
              payload.cached
                ? `Loaded cached extraction (${state.note?.items?.length || 0} items)`
                : `Extracted ${state.note?.items?.length || 0} items across all levels`,
            );
          } else if (eventName === 'error') {
            throw new Error(payload.message || 'Extraction stream failed.');
          }
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        state.streamStage = 'Extraction cancelled.';
        bridge()?.showToast?.('Extraction cancelled');
      } else {
        state.streamError = err?.message || 'Could not complete extraction.';
        bridge()?.showToast?.(state.streamError);
      }
    } finally {
      state.streaming = false;
      state.abortController = null;
      render();
    }
  }

  function updateStreamDom() {
    const stageEl = document.getElementById('stx-stream-stage');
    if (stageEl) stageEl.textContent = state.streamStage;
    const strip = document.getElementById('stx-stream-preview');
    if (strip) {
      strip.innerHTML = state.streamPreview
        .slice(-14)
        .map(
          (item) => `<span class="stx-preview-chip">
            <strong>${escapeHtml(item.term || '')}</strong>
            ${item.cefr ? `<span class="stx-badge stx-badge--cefr-${escapeHtml(item.cefr)}">${escapeHtml(item.cefr)}</span>` : ''}
          </span>`,
        )
        .join('');
    }
  }

  function stopLoopOrPlayback() {
    state.activeLoopKey = '';
    bridge()?.pausePlayback?.();
    syncPlaybackDomState();
  }

  function playItemClip(item, { exact = false, loop = false } = {}) {
    const b = bridge();
    if (!b || !item) return;
    const lesson = b.getItem?.();
    const sentIdx = Number(item.sentenceIndex) || null;
    const fallbackSent = sentIdx
      ? (lesson?.sentences || []).find((s) => Number(s.index) === sentIdx)
      : null;

    const s =
      exact && typeof item.phraseStartSec === 'number'
        ? item.phraseStartSec
        : typeof item.startSec === 'number'
          ? item.startSec
          : fallbackSent?.startSec;
    const e =
      exact && typeof item.phraseEndSec === 'number'
        ? item.phraseEndSec
        : typeof item.endSec === 'number'
          ? item.endSec
          : fallbackSent?.endSec;

    const rangeKey = `stx-${exact ? 'exact' : loop ? 'loop' : 'clip'}-${item.index}`;
    const currentPlayback = b.getPlaybackState?.();

    if (currentPlayback?.isPlaying && currentPlayback?.activeRange?.rangeKey === rangeKey) {
      stopLoopOrPlayback();
      return;
    }

    if (typeof s === 'number' && typeof e === 'number' && e > s && currentPlayback?.hasMedia) {
      state.activeLoopKey = loop ? rangeKey : '';
      b.playRange(s, e, {
        label: item.term,
        rangeKey,
        sentIndex: sentIdx || undefined,
        loop,
      });
      syncPlaybackDomState();
      return;
    }

    if (sentIdx && currentPlayback?.hasMedia) {
      state.activeLoopKey = '';
      b.playSentence(sentIdx, { forceMode: 'once' });
      syncPlaybackDomState();
      return;
    }

    speakEnglishText(item.surface || item.term || item.contextSentence || '');
  }

  function playThoughtClip(para) {
    const b = bridge();
    if (!b || !para) return;
    const currentPlayback = b.getPlaybackState?.();
    const rangeKey = `stx-para-${para.id}`;

    if (currentPlayback?.isPlaying && currentPlayback?.activeRange?.rangeKey === rangeKey) {
      stopLoopOrPlayback();
      return;
    }

    if (
      typeof para.startSec === 'number' &&
      typeof para.endSec === 'number' &&
      para.endSec > para.startSec &&
      currentPlayback?.hasMedia
    ) {
      state.activeLoopKey = '';
      b.playRange(para.startSec, para.endSec, {
        label: `Thought #${para.index}`,
        rangeKey,
        sentIndex: para.sentenceIndices?.[0] || undefined,
        loop: false,
      });
      syncPlaybackDomState();
      return;
    }

    if (para.sentenceIndices?.[0] && currentPlayback?.hasMedia) {
      b.playSentence(para.sentenceIndices[0], { forceMode: 'once' });
      syncPlaybackDomState();
      return;
    }

    speakEnglishText(para.text || '');
  }

  function speakEnglishText(text) {
    const clean = String(text || '').trim();
    if (!clean || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = 'en-US';
      utter.rate = 0.94;
      window.speechSynthesis.speak(utter);
    } catch {}
  }

  function syncPlaybackDomState() {
    const pb = bridge()?.getPlaybackState?.();
    const playingKey = pb?.isPlaying ? pb?.activeRange?.rangeKey || '' : '';

    document.querySelectorAll('#mode-panel-extract [data-stx-idx]').forEach((container) => {
      const idx = container.getAttribute('data-stx-idx');
      if (!idx) return;
      const playKey = `stx-clip-${idx}`;
      const exactKey = `stx-exact-${idx}`;
      const loopKey = `stx-loop-${idx}`;
      if (container.classList.contains('stx-card')) {
        container.classList.toggle('is-looping', Boolean(playingKey && playingKey === loopKey));
      }

      const playBtn = container.querySelector('[data-stx-action="play"]');
      if (playBtn) {
        const act = playingKey === playKey;
        playBtn.classList.toggle('is-active', act);
        playBtn.setAttribute('aria-pressed', act ? 'true' : 'false');
      }
      const exactBtn = container.querySelector('[data-stx-action="exact"]');
      if (exactBtn) {
        const act = playingKey === exactKey;
        exactBtn.classList.toggle('is-active', act);
        exactBtn.setAttribute('aria-pressed', act ? 'true' : 'false');
      }
      const loopBtn = container.querySelector('[data-stx-action="loop"]');
      if (loopBtn) {
        const act = playingKey === loopKey;
        loopBtn.classList.toggle('is-active', act);
        loopBtn.setAttribute('aria-pressed', act ? 'true' : 'false');
      }
    });

    document.querySelectorAll('#mode-panel-extract [data-stx-play-para]').forEach((btn) => {
      const paraId = btn.getAttribute('data-stx-play-para');
      const act = Boolean(playingKey && playingKey === `stx-para-${paraId}`);
      btn.classList.toggle('is-playing', act);
      btn.setAttribute('aria-pressed', act ? 'true' : 'false');
      const thoughtEl = btn.closest('.stx-thought');
      if (thoughtEl) thoughtEl.classList.toggle('is-playing-thought', act);
    });
  }

  function handlePlaybackTick(tick) {
    syncPlaybackDomState();
    if (!state.autoSync || !state.note || !tick?.isPlaying) return;
    const panel = getContainer();
    if (!panel || panel.style.display === 'none') return;

    const cur = Number(tick.currentTime || 0);
    const items = Array.isArray(state.note.items) ? state.note.items : [];
    const match =
      items.find(
        (it) =>
          typeof it.phraseStartSec === 'number' &&
          typeof it.phraseEndSec === 'number' &&
          cur >= it.phraseStartSec - 0.1 &&
          cur <= it.phraseEndSec + 0.15,
      ) ||
      items.find(
        (it) =>
          typeof it.startSec === 'number' &&
          typeof it.endSec === 'number' &&
          cur >= it.startSec &&
          cur <= it.endSec,
      );

    const nextIdx = match ? Number(match.index) : null;

    if (state.viewMode === 'paragraph') {
      const paraMatch = (state.lastParagraphs || []).find(
        (p) =>
          typeof p.startSec === 'number' &&
          typeof p.endSec === 'number' &&
          cur >= p.startSec - 0.15 &&
          cur <= p.endSec + 0.25,
      );
      const nextParaId = paraMatch ? paraMatch.id : null;
      if (nextParaId !== state.syncActiveParaId || nextIdx !== state.syncHighlightIdx) {
        state.syncActiveParaId = nextParaId;
        state.syncHighlightIdx = nextIdx;
        panel.querySelectorAll('.stx-thought').forEach((el) => {
          el.classList.toggle('is-sync-active', nextParaId !== null && el.getAttribute('data-stx-para-id') === nextParaId);
        });
        panel.querySelectorAll('.stx-hl').forEach((hl) => {
          hl.classList.toggle('is-sync-playing', nextIdx !== null && Number(hl.getAttribute('data-stx-hl')) === nextIdx);
        });
      }
      return;
    }

    if (nextIdx === state.syncHighlightIdx) return;
    state.syncHighlightIdx = nextIdx;
    panel.querySelectorAll('.stx-card').forEach((card) => {
      const isMatch = nextIdx !== null && Number(card.getAttribute('data-stx-idx')) === nextIdx;
      card.classList.toggle('is-sync-active', isMatch);
    });
  }

  async function toggleItemStudied(itemIndex) {
    const note = state.note;
    if (!note?.id) return;
    const idx = Number(itemIndex);
    const doneSet = completedSetForNote(note);
    const nextCompleted = !doneSet.has(idx);
    if (nextCompleted) doneSet.add(idx);
    else doneSet.delete(idx);

    const nextItems = Array.from(doneSet).sort((a, b) => a - b);
    const prevItems = Array.isArray(note.completionProgress?.items)
      ? note.completionProgress.items.slice()
      : [];
    note.completionProgress = { items: nextItems };
    render();

    try {
      const res = await bridge()?.apiFetch?.(
        `/api/american-extractor/notes/${encodeURIComponent(note.id)}/items/${idx}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ completed: nextCompleted }),
        },
      );
      if (res?.completionProgress) {
        note.completionProgress = res.completionProgress;
      }
      render();
    } catch (err) {
      note.completionProgress = { items: prevItems };
      bridge()?.showToast?.(err?.message || 'Could not update study progress.');
      render();
    }
  }

  async function saveExtractItemToVocab(item) {
    if (!item || !bridge()?.saveVocabulary) return;
    await bridge().saveVocabulary({
      term: item.term,
      ipa: item.ipa || '',
      partOfSpeech: item.partOfSpeech || item.register || '',
      definition: item.meaning || '',
      generalTranslation: item.generalMeaning || '',
      translation: item.localizedMeaning || '',
      contextSentence: item.contextSentence || '',
      sentenceIndex: item.sentenceIndex || undefined,
      timestampSec: item.phraseStartSec ?? item.startSec ?? 0,
    });
    render();
  }

  function exportFilteredItems(format) {
    const note = state.note;
    if (!note) return;
    const items = getFilteredItems();
    const baseName =
      String(note.title || 'media-hub-extract')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'media-hub-extract';

    let content = '';
    let mime = 'text/plain;charset=utf-8';
    if (format === 'json') {
      content = JSON.stringify({ title: note.title, exportedAt: new Date().toISOString(), items }, null, 2);
      mime = 'application/json;charset=utf-8';
    } else if (format === 'csv') {
      const escCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = ['Index', 'Term', 'CEFR', 'Category', 'POS', 'IPA', 'Meaning', 'Translation', 'Timestamp', 'Context', 'Example'];
      const rows = items.map((it) => [
        it.index,
        it.term,
        it.cefr || '',
        CATEGORY_LABELS[it.category] || it.category || '',
        it.partOfSpeech || '',
        it.ipa || '',
        it.meaning || '',
        it.localizedMeaning || '',
        typeof it.startSec === 'number' ? formatTs(it.startSec) : '',
        it.contextSentence || '',
        it.example || '',
      ]);
      content = [header, ...rows].map((r) => r.map(escCsv).join(',')).join('\n');
      mime = 'text/csv;charset=utf-8';
    } else {
      content = [
        `# ${note.title || 'Deep Lexical Extraction'}`,
        note.summary ? `\n${note.summary}\n` : '',
        `Exported ${items.length} filtered items.\n`,
        ...items.map((it) => {
          const ts = typeof it.startSec === 'number' ? ` [${formatTs(it.startSec)}]` : '';
          const meta = [it.cefr, CATEGORY_LABELS[it.category] || it.category, it.partOfSpeech].filter(Boolean).join(' · ');
          return [
            `### ${it.index}. ${it.term}${ts}`,
            meta ? `*${meta}*${it.ipa ? ` · \`${it.ipa}\`` : ''}` : '',
            it.meaning ? `- **Meaning:** ${it.meaning}` : '',
            it.localizedMeaning ? `- **Translation:** ${it.localizedMeaning}` : '',
            it.contextSentence ? `- **Source:** "${it.contextSentence}"` : '',
            it.usageNote ? `- **Usage:** ${it.usageNote}` : '',
            it.example ? `- **Example:** ${it.example}` : '',
            '',
          ]
            .filter(Boolean)
            .join('\n');
        }),
      ].join('\n');
      mime = 'text/markdown;charset=utf-8';
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    state.exportMenuOpen = false;
    render();
    bridge()?.showToast?.(`Exported ${items.length} items as .${format}`);
  }

  function renderLaunchpadHtml(lesson) {
    const sentenceCount = lesson?.sentences?.length || 0;
    const hasNote = Boolean(state.note);
    const langOptions = (state.languages || [])
      .map(
        (l) =>
          `<option value="${escapeHtml(l.code)}"${l.code === state.configLanguage ? ' selected' : ''}>${escapeHtml(
            l.name,
          )}${l.native && l.native !== l.name ? ` (${escapeHtml(l.native)})` : ''}</option>`,
      )
      .join('');
    const depthOptions = DEPTH_OPTIONS.map(
      (d) => `<option value="${d.id}"${d.id === state.configDepth ? ' selected' : ''}>${escapeHtml(d.label)}</option>`,
    ).join('');
    const focusOptions = FOCUS_OPTIONS.map(
      (f) => `<option value="${f.id}"${f.id === state.configFocus ? ' selected' : ''}>${escapeHtml(f.label)}</option>`,
    ).join('');

    return `
      <section class="stx-card-shell">
        <div class="stx-launch-head">
          <div>
            <span class="stx-launch-kicker">${ICONS.layers} Deep Lexical Workbench</span>
            <h3 class="stx-launch-title">${
              hasNote ? 'Configure New Extraction Sweep' : 'Unlock Natural American Insights'
            }</h3>
            <p class="stx-launch-desc">
              Explore every complete thought with inline highlights for idioms, phrasal verbs, sentence structures,
              connected speech, and vocabulary across A1–C2 — anchored to exact playback moments (${sentenceCount} sentences ready).
            </p>
          </div>
        </div>

        <div class="stx-launch-actions">
          <button type="button" class="stx-btn-primary" id="stx-run-exhaustive-btn" ${
            sentenceCount === 0 || state.streaming ? 'disabled' : ''
          }>
            ${ICONS.layers}
            <span>${hasNote ? 'Run Updated Extraction' : 'Extract Everything (A1–C2)'}</span>
          </button>
          <button type="button" class="stx-btn-secondary" id="stx-toggle-settings-btn" aria-expanded="${
            state.settingsOpen ? 'true' : 'false'
          }">
            ${ICONS.sliders}
            <span>${hasNote ? 'Hide Settings' : 'Configure Options'}</span>
          </button>
        </div>

        ${state.streamError ? `<p class="stx-error-note">${escapeHtml(state.streamError)}</p>` : ''}

        <div class="stx-settings-drawer" id="stx-settings-drawer"${state.settingsOpen ? '' : ' hidden'}>
          <div class="stx-settings-grid">
            <div class="stx-field">
              <label for="stx-lang-select">Target Translation Language</label>
              <select class="stx-select" id="stx-lang-select">${langOptions}</select>
            </div>
            <div class="stx-field">
              <label for="stx-depth-select">Extraction Depth</label>
              <select class="stx-select" id="stx-depth-select">${depthOptions}</select>
            </div>
            <div class="stx-field">
              <label for="stx-focus-select">Domain Focus</label>
              <select class="stx-select" id="stx-focus-select">${focusOptions}</select>
            </div>
          </div>
          <div class="stx-ai-mount-wrap">
            <div id="stx-ai-selector-mount"></div>
          </div>
          <label class="stx-checkbox-row">
            <input type="checkbox" id="stx-force-check"${state.configForce ? ' checked' : ''} />
            <span>Bypass cache and run fresh AI extraction (<code>force</code>)</span>
          </label>
        </div>
      </section>
    `;
  }

  function renderStreamingHtml() {
    return `
      <section class="stx-card-shell stx-stream-box">
        <div class="stx-stream-head">
          <div class="stx-stream-status">
            <span class="stx-spinner" aria-hidden="true"></span>
            <span id="stx-stream-stage">${escapeHtml(state.streamStage || 'Running deep extraction...')}</span>
          </div>
          <button type="button" class="stx-btn-secondary" id="stx-cancel-stream-btn">Cancel</button>
        </div>
        <div class="stx-preview-strip" id="stx-stream-preview"></div>
      </section>
    `;
  }

  function renderInspectorHtml(para, item, doneSet, rtl, hasMedia) {
    if (!para || !item) {
      const total = para?.items?.length || 0;
      const firstIdx = para?.items?.[0]?.index;
      return `
        <div class="stx-inspector-hint">
          <span>Click any highlighted phrase above to explore its meaning, native usage, and audio.</span>
          ${
            firstIdx !== undefined
              ? `<button type="button" class="stx-inspector-peek-btn" data-stx-para="${escapeHtml(para.id)}" data-stx-hl="${firstIdx}">Inspect first (1/${total})</button>`
              : ''
          }
        </div>
      `;
    }

    const idx = Number(item.index);
    const completed = doneSet.has(idx);
    const saved = Boolean(bridge()?.isTermSaved?.(item.term));
    const isMasked = state.recallMode && !state.revealedIndices.has(idx);
    const cefr = String(item.cefr || '').trim().toUpperCase();
    const eng = engine();
    const groupId = eng ? eng.getMacroGroupId(item.category) : 'words';
    const catLabel = CATEGORY_LABELS[item.category] || item.category || 'Phrase';
    const roleLabel = eng ? eng.getNativeRoleLabel(item) : catLabel;

    const posInPara = para.items.findIndex((it) => Number(it.index) === idx);
    const totalInPara = para.items.length;

    const hasExactWindow =
      hasMedia &&
      typeof item.phraseStartSec === 'number' &&
      typeof item.phraseEndSec === 'number' &&
      item.phraseEndSec > item.phraseStartSec;
    const hasSentenceWindow =
      hasMedia &&
      ((typeof item.startSec === 'number' && typeof item.endSec === 'number' && item.endSec > item.startSec) ||
        Boolean(item.sentenceIndex));
    const tsSec = typeof item.phraseStartSec === 'number' ? item.phraseStartSec : item.startSec;

    const checkBtn = global.FlaptapCheck?.buttonHtml
      ? global.FlaptapCheck.buttonHtml({
          checked: completed,
          className: 'stx-check-btn',
          attrs: `data-stx-check="${idx}"`,
          label: completed ? 'Studied' : 'Mark studied',
        })
      : `<button type="button" class="item-check-btn${completed ? ' is-checked' : ''}" data-stx-check="${idx}" aria-pressed="${
          completed ? 'true' : 'false'
        }">${completed ? 'Done' : 'Study'}</button>`;

    const copyBtn = global.FlaptapCopy?.buttonHtml
      ? global.FlaptapCopy.buttonHtml(item.term, {
          className: 'stx-act-btn',
          label: `Copy ${item.term}`,
        })
      : '';

    const detailBlocks = [];
    if (item.usageNote) {
      detailBlocks.push(
        `<div class="stx-ins-detail"><span class="stx-ins-detail-label">How Natives Use It</span><p>${escapeHtml(
          item.usageNote,
        )}</p></div>`,
      );
    }
    if (item.spokenNote) {
      detailBlocks.push(
        `<div class="stx-ins-detail"><span class="stx-ins-detail-label">Spoken Rhythm &amp; Mechanics</span><p>${escapeHtml(
          item.spokenNote,
        )}</p></div>`,
      );
    }
    if (item.example) {
      detailBlocks.push(
        `<div class="stx-ins-detail stx-ins-detail--full"><span class="stx-ins-detail-label">Natural Example</span><p>${escapeHtml(
          item.example,
        )}${
          item.exampleTranslation
            ? ` <span class="stx-ins-example-tr" dir="${rtl ? 'rtl' : 'auto'}">— ${escapeHtml(
                item.exampleTranslation,
              )}</span>`
            : ''
        }</p></div>`,
      );
    }

    return `
      <div class="stx-inspector is-entering" data-group="${escapeHtml(groupId)}" data-stx-idx="${idx}">
        <div class="stx-inspector-head">
          <div class="stx-inspector-title-wrap">
            ${checkBtn}
            <div class="stx-inspector-term-row">
              <h4 class="stx-inspector-term">${escapeHtml(item.term)}</h4>
              ${
                item.surface && item.surface.toLowerCase() !== String(item.term || '').toLowerCase()
                  ? `<span class="stx-surface">as “${escapeHtml(item.surface)}”</span>`
                  : ''
              }
              ${item.ipa ? `<span class="stx-ipa">${escapeHtml(item.ipa)}</span>` : ''}
            </div>
          </div>

          <div class="stx-inspector-meta">
            <span class="stx-role-pill stx-role-pill--${escapeHtml(groupId)}">${escapeHtml(roleLabel)}</span>
            ${cefr ? `<span class="stx-badge stx-badge--cefr-${escapeHtml(cefr)}">${escapeHtml(cefr)}</span>` : ''}
            <span class="stx-badge">${escapeHtml(catLabel)}</span>
            ${item.partOfSpeech ? `<span class="stx-badge">${escapeHtml(item.partOfSpeech)}</span>` : ''}
            ${item.register ? `<span class="stx-badge">${escapeHtml(item.register)}</span>` : ''}
            ${
              typeof tsSec === 'number'
                ? `<span class="stx-badge stx-badge--time">${escapeHtml(formatTs(tsSec))}</span>`
                : ''
            }
            <button type="button" class="stx-inspector-close" data-stx-close-inspector="${escapeHtml(
              para.id,
            )}" aria-label="Close insight details" title="Close details">${ICONS.close}</button>
          </div>
        </div>

        <div class="stx-meaning-box${isMasked ? ' is-masked' : ''}" data-stx-reveal="${idx}">
          ${item.meaning ? `<div class="stx-meaning">${escapeHtml(item.meaning)}</div>` : ''}
          ${
            item.localizedMeaning
              ? `<div class="stx-translation" dir="${rtl ? 'rtl' : 'auto'}">${escapeHtml(item.localizedMeaning)}</div>`
              : ''
          }
        </div>

        ${detailBlocks.length > 0 ? `<div class="stx-ins-details-grid">${detailBlocks.join('')}</div>` : ''}

        <div class="stx-inspector-foot">
          <div class="stx-actions">
            ${
              hasExactWindow
                ? `<button type="button" class="stx-act-btn stx-act-btn--play" data-stx-action="exact" data-stx-idx="${idx}" title="Play exact phrase audio">${ICONS.target}<span>Play Phrase</span></button>`
                : hasSentenceWindow
                  ? `<button type="button" class="stx-act-btn stx-act-btn--play" data-stx-action="play" data-stx-idx="${idx}" title="Play containing sentence">${ICONS.play}<span>Play Line</span></button>`
                  : ''
            }
            ${
              hasExactWindow && hasSentenceWindow
                ? `<button type="button" class="stx-act-btn" data-stx-action="play" data-stx-idx="${idx}" title="Play full sentence">${ICONS.play}<span>Sentence</span></button>`
                : ''
            }
            ${
              hasSentenceWindow
                ? `<button type="button" class="stx-act-btn stx-act-btn--loop" data-stx-action="loop" data-stx-idx="${idx}" title="Loop this phrase for shadowing">${ICONS.loop}<span>Loop</span></button>`
                : ''
            }
            <button type="button" class="stx-act-btn" data-stx-action="speak" data-stx-idx="${idx}" title="Hear clean pronunciation">${ICONS.speaker}<span>Speak</span></button>
            ${
              item.sentenceIndex
                ? `<button type="button" class="stx-act-btn" data-stx-action="shadow" data-stx-idx="${idx}" title="Jump to Shadow mode at sentence #${item.sentenceIndex}">${ICONS.mic}<span>Shadow #${item.sentenceIndex}</span></button>`
                : ''
            }
            <button type="button" class="stx-act-btn stx-act-btn--saved${saved ? ' is-active' : ''}" data-stx-action="save" data-stx-idx="${idx}" title="Save to Vocabulary Vault">${ICONS.bookmark}<span>${
              saved ? 'Saved' : 'Save'
            }</span></button>
            <button type="button" class="stx-act-btn" data-stx-action="ask" data-stx-idx="${idx}" title="Ask AI about this item">${ICONS.spark}<span>Ask AI</span></button>
            ${copyBtn}
          </div>

          ${
            totalInPara > 1
              ? `<div class="stx-stepper" role="group" aria-label="Step through paragraph insights">
                  <button type="button" class="stx-step-btn" data-stx-step-para="${escapeHtml(
                    para.id,
                  )}" data-stx-step-dir="-1" aria-label="Previous insight" title="Previous insight">${ICONS.chevLeft}</button>
                  <span class="stx-step-count ltr-num">${posInPara + 1} / ${totalInPara}</span>
                  <button type="button" class="stx-step-btn" data-stx-step-para="${escapeHtml(
                    para.id,
                  )}" data-stx-step-dir="1" aria-label="Next insight" title="Next insight">${ICONS.chevRight}</button>
                </div>`
              : ''
          }
        </div>
      </div>
    `;
  }

  function renderParagraphProseHtml(para, activeIdx, doneSet) {
    const segments = para?.highlights?.segments || [];
    const tokenize = global.FlaptapWordLookup?.tokenizeClickableWords;
    const sentIdx = para?.sentenceIndices?.[0] || undefined;

    if (segments.length === 0) {
      const escaped = escapeHtml(para?.text || '');
      return tokenize ? tokenize(escaped, { contextSentence: para?.text || '', sentenceIndex: sentIdx }) : escaped;
    }

    return segments
      .map((seg) => {
        if (seg.type !== 'highlight' || !seg.item) {
          const escaped = escapeHtml(seg.text);
          return tokenize
            ? tokenize(escaped, { contextSentence: para?.text || '', sentenceIndex: sentIdx })
            : escaped;
        }
        const item = seg.item;
        const idx = Number(item.index);
        const isActive = activeIdx !== null && Number(activeIdx) === idx;
        const isDone = doneSet.has(idx);
        const isSyncing = state.syncHighlightIdx !== null && state.syncHighlightIdx === idx;
        const cefr = String(item.cefr || '').trim().toUpperCase();
        const catLabel = CATEGORY_LABELS[item.category] || item.category || 'Insight';
        const tip = [catLabel, cefr, item.meaning ? item.meaning.slice(0, 72) : ''].filter(Boolean).join(' · ');

        return `<button type="button" class="stx-hl stx-hl--${escapeHtml(seg.groupId)}${
          isActive ? ' is-active' : ''
        }${isDone ? ' is-studied' : ''}${isSyncing ? ' is-sync-playing' : ''}" data-stx-para="${escapeHtml(
          para.id,
        )}" data-stx-hl="${idx}" aria-pressed="${isActive ? 'true' : 'false'}" title="${escapeHtml(
          tip,
        )}">${escapeHtml(seg.text)}</button>`;
      })
      .join('');
  }

  function renderThoughtBlockHtml(para, doneSet, rtl, hasMedia) {
    const eng = engine();
    const stats = eng ? eng.computeParagraphStats(para, doneSet) : null;
    const flow = eng ? eng.analyzeNativeFlow(para) : null;

    const activeIdx = state.activeItemByPara.has(para.id) ? state.activeItemByPara.get(para.id) : null;
    const activeItem =
      activeIdx !== null ? para.items.find((it) => Number(it.index) === Number(activeIdx)) || null : null;

    const hasRange =
      hasMedia &&
      ((typeof para.startSec === 'number' && typeof para.endSec === 'number' && para.endSec > para.startSec) ||
        (para.sentenceIndices && para.sentenceIndices.length > 0));

    const timeText =
      typeof para.startSec === 'number' && typeof para.endSec === 'number' && para.endSec > para.startSec
        ? `${formatTs(para.startSec)}–${formatTs(para.endSec)}`
        : typeof para.startSec === 'number'
          ? formatTs(para.startSec)
          : '';

    const statPills = [];
    if (stats) {
      statPills.push(`<span class="stx-stat-item ltr-num">${stats.wordCount} words</span>`);
      if (stats.wpm) {
        statPills.push(
          `<span class="stx-stat-item ltr-num">${stats.wpm} WPM · ${escapeHtml(stats.paceLabel || '')}</span>`,
        );
      } else if (stats.durationSec) {
        statPills.push(`<span class="stx-stat-item ltr-num">${stats.durationSec}s</span>`);
      }
      if (stats.cefrRange) {
        statPills.push(`<span class="stx-stat-item stx-stat-cefr ltr-num">${escapeHtml(stats.cefrRange)}</span>`);
      }
    }

    const extraItems = para.highlights?.extraItems || [];
    const extraHtml =
      extraItems.length > 0
        ? `<div class="stx-extra-pills">
            <span class="stx-extra-label">Also in this thought:</span>
            ${extraItems
              .map((it) => {
                const idx = Number(it.index);
                const gid = eng ? eng.getMacroGroupId(it.category) : 'words';
                const isAct = activeIdx !== null && Number(activeIdx) === idx;
                const isDone = doneSet.has(idx);
                return `<button type="button" class="stx-hl-chip stx-hl-chip--${escapeHtml(gid)}${
                  isAct ? ' is-active' : ''
                }${isDone ? ' is-studied' : ''}" data-stx-para="${escapeHtml(
                  para.id,
                )}" data-stx-hl="${idx}" aria-pressed="${isAct ? 'true' : 'false'}">
                  <span class="stx-dot stx-dot--${escapeHtml(gid)}" aria-hidden="true"></span>
                  <span>${escapeHtml(it.surface || it.term)}</span>
                </button>`;
              })
              .join('')}
          </div>`
        : '';

    const flowChipsHtml =
      flow && flow.flowChips.length > 0
        ? `<div class="stx-flow-chain" aria-label="Idea connection path">
            ${flow.flowChips
              .map((chip, cIdx) => {
                const isAct = activeIdx !== null && Number(activeIdx) === chip.itemIndex;
                return `${
                  cIdx > 0 ? `<span class="stx-flow-arrow" aria-hidden="true">${ICONS.arrowRight}</span>` : ''
                }<button type="button" class="stx-flow-chip stx-flow-chip--${escapeHtml(chip.groupId)}${
                  isAct ? ' is-active' : ''
                }" data-stx-para="${escapeHtml(para.id)}" data-stx-hl="${
                  chip.itemIndex
                }" title="${escapeHtml(chip.role)}">
                  <span class="stx-flow-chip-text">${escapeHtml(chip.label)}</span>
                  <span class="stx-flow-chip-role">${escapeHtml(chip.role)}</span>
                </button>`;
              })
              .join('')}
          </div>`
        : '';

    const contractionsHtml =
      flow && flow.contractions.length > 0
        ? `<div class="stx-contractions-row">
            <span class="stx-contractions-label">Spoken shortcuts:</span>
            ${flow.contractions.map((c) => `<span class="stx-contraction-pill" dir="ltr">${escapeHtml(c)}</span>`).join('')}
          </div>`
        : '';

    const dnaDotsHtml =
      stats && stats.groupBreakdown.length > 0
        ? `<div class="stx-dna-dots" title="Insight breakdown in this paragraph">
            ${stats.groupBreakdown
              .map(
                (g) => `<span class="stx-dna-item" title="${escapeHtml(g.label)}: ${g.count}">
                  <span class="stx-dot stx-dot--${escapeHtml(g.groupId)}" aria-hidden="true"></span>
                  <span class="ltr-num">${g.count}</span>
                </span>`,
              )
              .join('')}
          </div>`
        : '';

    const isSyncActive = state.syncActiveParaId === para.id;

    return `
      <article class="stx-thought${stats?.isComplete ? ' is-complete' : ''}${
        isSyncActive ? ' is-sync-active' : ''
      }" data-stx-para-id="${escapeHtml(para.id)}">
        <header class="stx-thought-head">
          <div class="stx-thought-id-row">
            <span class="stx-thought-num ltr-num">${String(para.index).padStart(2, '0')}</span>
            ${para.speaker ? `<span class="stx-speaker-tag">${escapeHtml(para.speaker)}</span>` : ''}
            ${
              hasRange || timeText
                ? `<button type="button" class="stx-thought-play-btn" data-stx-play-para="${escapeHtml(
                    para.id,
                  )}" aria-pressed="false" title="Play this complete thought">
                    ${ICONS.play}
                    <span>${timeText || `Play #${para.index}`}</span>
                  </button>`
                : ''
            }
          </div>

          <div class="stx-thought-stats">
            ${statPills.join('<span class="stx-stat-sep" aria-hidden="true">·</span>')}
            ${dnaDotsHtml}
            ${
              stats
                ? `<span class="stx-thought-mastery${stats.isComplete ? ' is-complete' : ''} ltr-num" title="Derived automatically from studied highlights">
                    <span class="stx-mastery-bar" aria-hidden="true"><span class="stx-mastery-fill" style="width:${stats.progressPct}%"></span></span>
                    <span>${stats.studiedInsights}/${stats.totalInsights}</span>
                  </span>`
                : ''
            }
          </div>
        </header>

        <div class="stx-thought-prose" dir="ltr">
          ${renderParagraphProseHtml(para, activeIdx, doneSet)}
        </div>

        ${extraHtml}

        ${
          flow
            ? `<div class="stx-flow-strip">
                <div class="stx-flow-note">
                  <span class="stx-flow-icon" aria-hidden="true">${ICONS.flow}</span>
                  <span class="stx-flow-copy"><strong>Native Flow:</strong> ${escapeHtml(flow.constructionNote)}</span>
                </div>
                ${flowChipsHtml}
                ${contractionsHtml}
              </div>`
            : ''
        }

        <div class="stx-inspector-slot" data-stx-inspector-slot="${escapeHtml(para.id)}">
          ${renderInspectorHtml(para, activeItem, doneSet, rtl, hasMedia)}
        </div>
      </article>
    `;
  }

  function renderWorkbenchHtml(note, lesson) {
    const items = Array.isArray(note.items) ? note.items : [];
    const doneSet = completedSetForNote(note);
    const totalCount = items.length;
    const studiedCount = items.filter((it) => doneSet.has(Number(it.index))).length;
    const pct = totalCount > 0 ? Math.round((studiedCount / totalCount) * 100) : 0;

    // Counts per CEFR preset and exact level
    const presetCounts = new Map(
      CEFR_PRESETS.map((p) => [p.id, items.filter((it) => itemMatchesCefr(it, p.id, [])).length]),
    );
    const exactCounts = new Map(
      CEFR_LEVELS.map((lv) => [lv, items.filter((it) => String(it.cefr || '').toUpperCase() === lv).length]),
    );

    // Macro counts (filtered by active CEFR)
    const cefrFiltered = items.filter((it) => itemMatchesCefr(it));
    const macroCounts = new Map(
      MACRO_GROUPS.map((g) => [
        g.id,
        g.categories ? cefrFiltered.filter((it) => g.categories.has(it.category)).length : cefrFiltered.length,
      ]),
    );

    // Granular category counts inside active CEFR + active Macro group
    const activeMacro = MACRO_GROUPS.find((g) => g.id === state.macroGroup);
    const macroItems = activeMacro?.categories
      ? cefrFiltered.filter((it) => activeMacro.categories.has(it.category))
      : cefrFiltered;
    const catCounts = new Map();
    for (const it of macroItems) {
      catCounts.set(it.category, (catCounts.get(it.category) || 0) + 1);
    }

    const posValues = Array.from(
      new Set(items.map((it) => String(it.partOfSpeech || '').trim().toLowerCase()).filter(Boolean)),
    ).sort();
    const regValues = Array.from(
      new Set(items.map((it) => String(it.register || '').trim().toLowerCase()).filter(Boolean)),
    ).sort();

    const filtered = getFilteredItems();
    const eng = engine();
    const allParagraphs = eng ? eng.buildThoughtParagraphs(lesson, filtered, items) : [];
    state.lastParagraphs = allParagraphs;

    const isParagraphMode = state.viewMode === 'paragraph';
    const pageSize = isParagraphMode ? PARAGRAPH_PAGE_SIZE : EXTRACTION_PAGE_SIZE;
    const activeTotal = isParagraphMode ? allParagraphs.length : filtered.length;
    const totalPages = Math.max(1, Math.ceil(activeTotal / pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const startIdx = (state.page - 1) * pageSize;

    const pageParagraphs = isParagraphMode ? allParagraphs.slice(startIdx, startIdx + pageSize) : [];
    const pageItems = !isParagraphMode ? filtered.slice(startIdx, startIdx + pageSize) : [];

    // Ensure first visible paragraph starts with its first highlight selected unless explicitly interacted/closed
    if (isParagraphMode && pageParagraphs.length > 0) {
      const hasAnyVisibleSelection = pageParagraphs.some((p) => state.activeItemByPara.has(p.id));
      if (!hasAnyVisibleSelection && pageParagraphs[0].items.length > 0) {
        state.activeItemByPara.set(pageParagraphs[0].id, Number(pageParagraphs[0].items[0].index));
      }
    }

    const pb = bridge()?.getPlaybackState?.();
    const hasMedia = Boolean(pb?.hasMedia);
    const rtl = isRtlLanguage(note.targetLanguage);

    const guideSelectHtml =
      state.guides.length > 1
        ? `<select class="stx-select stx-guide-select" id="stx-guide-select" aria-label="Extraction sweep">
            ${state.guides
              .map(
                (g) =>
                  `<option value="${escapeHtml(g.id)}"${g.id === note.id ? ' selected' : ''}>${escapeHtml(
                    `${g.depth || 'extract'} · ${g.targetLanguage || ''} (${g.itemCount || 0})`,
                  )}</option>`,
              )
              .join('')}
          </select>`
        : '';

    const coach = bridge()?.getCoachAnalysis?.();
    const prosodyBannerHtml = coach
      ? `<div class="stx-prosody-strip">
          <div class="stx-prosody-main">
            <span class="stx-prosody-pill">${escapeHtml(coach.overview?.cefrLevel || 'B2')} · ${escapeHtml(
              coach.overview?.speakerStyle || 'Prosody Brief',
            )}</span>
            <span class="stx-prosody-text">${escapeHtml(coach.overview?.summary || '')}</span>
          </div>
          <button type="button" class="stx-mini-btn" id="stx-open-prosody-btn">Prosody &amp; Mouth →</button>
        </div>`
      : '';

    const secondaryFilterCount =
      (state.customLevels.length > 0 ? 1 : 0) +
      (catCounts.size > 1 && state.category !== 'all' ? 1 : 0) +
      (state.posFilter !== 'all' ? 1 : 0) +
      (state.registerFilter !== 'all' ? 1 : 0) +
      (state.statusFilter !== 'all' ? 1 : 0) +
      (state.sortBy !== 'appearance' ? 1 : 0);

    const bodyHtml = isParagraphMode
      ? pageParagraphs.length === 0
        ? renderZeroMatchHtml()
        : `<div class="stx-thoughts-list">${pageParagraphs
            .map((para) => renderThoughtBlockHtml(para, doneSet, rtl, hasMedia))
            .join('')}</div>`
      : pageItems.length === 0
        ? renderZeroMatchHtml()
        : `<div class="stx-items-list">${pageItems
            .map((it) => renderItemCardHtml(it, note, doneSet, rtl, hasMedia))
            .join('')}</div>`;

    return `
      ${prosodyBannerHtml}
      <div class="stx-dock" role="region" aria-label="Insights workbench controls">
        <div class="stx-dock-top">
          <div class="stx-dock-lead">
            <div class="stx-view-switch" role="tablist" aria-label="Insights display mode">
              <button type="button" class="stx-view-tab${isParagraphMode ? ' is-active' : ''}" data-stx-view="paragraph" role="tab" aria-selected="${
                isParagraphMode ? 'true' : 'false'
              }">
                ${ICONS.paragraph}
                <span>Paragraphs</span>
                <span class="stx-view-count ltr-num">${allParagraphs.length}</span>
              </button>
              <button type="button" class="stx-view-tab${!isParagraphMode ? ' is-active' : ''}" data-stx-view="extraction" role="tab" aria-selected="${
                !isParagraphMode ? 'true' : 'false'
              }">
                ${ICONS.list}
                <span>Extractions</span>
                <span class="stx-view-count ltr-num">${filtered.length}</span>
              </button>
            </div>

            <div class="stx-progress-wrap" title="Overall study progress">
              <div class="stx-progress-track" aria-hidden="true">
                <div class="stx-progress-fill" style="width:${pct}%"></div>
              </div>
              <span class="stx-progress-label ltr-num">${studiedCount}/${totalCount} (${pct}%)</span>
              ${guideSelectHtml}
            </div>
          </div>

          <div class="stx-dock-actions">
            ${
              !coach
                ? `<button type="button" class="stx-mini-btn" id="stx-open-prosody-btn" title="Generate Speaker Prosody Brief & Connected Speech Mechanics">+ Prosody</button>`
                : ''
            }
            <button type="button" class="stx-mini-btn${state.recallMode ? ' is-active' : ''}" id="stx-recall-btn" aria-pressed="${
              state.recallMode ? 'true' : 'false'
            }" title="Mask meanings & translations for active recall">Recall</button>
            ${
              hasMedia
                ? `<button type="button" class="stx-mini-btn${state.autoSync ? ' is-active' : ''}" id="stx-autosync-btn" aria-pressed="${
                    state.autoSync ? 'true' : 'false'
                  }" title="Highlight active thought & phrase during playback">Sync</button>`
                : ''
            }
            <div class="stx-export-wrap">
              <button type="button" class="stx-mini-btn" id="stx-export-toggle-btn" aria-expanded="${
                state.exportMenuOpen ? 'true' : 'false'
              }">${ICONS.download}<span>Export</span></button>
              <div class="stx-export-menu" id="stx-export-menu"${state.exportMenuOpen ? '' : ' hidden'}>
                <button type="button" class="stx-export-item" data-stx-export="md">Markdown (.md)</button>
                <button type="button" class="stx-export-item" data-stx-export="csv">Spreadsheet / Anki (.csv)</button>
                <button type="button" class="stx-export-item" data-stx-export="json">Structured JSON (.json)</button>
              </div>
            </div>
            <button type="button" class="stx-mini-btn${state.settingsOpen ? ' is-active' : ''}" id="stx-workbench-config-btn">${ICONS.sliders}<span>Re-extract</span></button>
          </div>
        </div>

        <div class="stx-controls-row">
          <div class="stx-search-box">
            ${ICONS.search}
            <input type="search" class="stx-search-input" id="stx-search-input" placeholder="Search thoughts, phrases, meanings..." value="${escapeHtml(
              state.search,
            )}" />
          </div>

          <div class="stx-pill-group stx-cefr-quick" role="group" aria-label="CEFR difficulty threshold">
            ${CEFR_PRESETS.map((p) => {
              const cnt = presetCounts.get(p.id) || 0;
              const isAct = state.customLevels.length === 0 && state.levelPreset === p.id;
              return `<button type="button" class="stx-pill stx-pill--cefr${isAct ? ' is-active' : ''}" data-stx-preset="${p.id}" aria-pressed="${
                isAct ? 'true' : 'false'
              }">${escapeHtml(p.label)} <span class="stx-pill-count">${cnt}</span></button>`;
            }).join('')}
          </div>

          <button type="button" class="stx-mini-btn${state.filtersOpen || secondaryFilterCount > 0 ? ' is-active' : ''}" id="stx-filters-toggle-btn" aria-expanded="${
            state.filtersOpen ? 'true' : 'false'
          }">
            ${ICONS.sliders}
            <span>Filters${secondaryFilterCount > 0 ? ` (${secondaryFilterCount})` : ''}</span>
          </button>
        </div>

        <div class="stx-rail" role="tablist" aria-label="Insight highlight categories">
          ${MACRO_GROUPS.map((g) => {
            const cnt = macroCounts.get(g.id) || 0;
            const isAct = state.macroGroup === g.id;
            const dotHtml =
              g.id !== 'all' ? `<span class="stx-dot stx-dot--${g.id}" aria-hidden="true"></span>` : '';
            return `<button type="button" class="stx-pill stx-pill--legend${isAct ? ' is-active' : ''}" data-stx-macro="${g.id}" role="tab" aria-selected="${
              isAct ? 'true' : 'false'
            }">${dotHtml}<span>${escapeHtml(g.label)}</span> <span class="stx-pill-count">${cnt}</span></button>`;
          }).join('')}
        </div>

        <div class="stx-secondary-filters" id="stx-secondary-filters"${state.filtersOpen ? '' : ' hidden'}>
          <div class="stx-exact-cefr-wrap" role="group" aria-label="Exact CEFR levels">
            <span class="stx-group-label">Exact CEFR</span>
            ${CEFR_LEVELS.map((lv) => {
              const cnt = exactCounts.get(lv) || 0;
              if (cnt === 0) return '';
              const isAct = state.customLevels.includes(lv);
              return `<button type="button" class="stx-pill stx-pill--exact${isAct ? ' is-active' : ''}" data-stx-exact-cefr="${lv}" aria-pressed="${
                isAct ? 'true' : 'false'
              }">${lv} <span class="stx-pill-count">${cnt}</span></button>`;
            }).join('')}
          </div>
          ${
            catCounts.size > 1
              ? `<select class="stx-select" id="stx-cat-select" aria-label="Specific category">
                  <option value="all"${state.category === 'all' ? ' selected' : ''}>All Categories (${macroItems.length})</option>
                  ${Array.from(catCounts.entries())
                    .map(
                      ([catId, cnt]) =>
                        `<option value="${escapeHtml(catId)}"${state.category === catId ? ' selected' : ''}>${escapeHtml(
                          CATEGORY_LABELS[catId] || catId,
                        )} (${cnt})</option>`,
                    )
                    .join('')}
                </select>`
              : ''
          }
          ${
            posValues.length > 0
              ? `<select class="stx-select" id="stx-pos-select" aria-label="Part of speech">
                  <option value="all">All POS</option>
                  ${posValues
                    .map(
                      (p) =>
                        `<option value="${escapeHtml(p)}"${p === state.posFilter ? ' selected' : ''}>${escapeHtml(p)}</option>`,
                    )
                    .join('')}
                </select>`
              : ''
          }
          ${
            regValues.length > 1
              ? `<select class="stx-select" id="stx-reg-select" aria-label="Register">
                  <option value="all">All Registers</option>
                  ${regValues
                    .map(
                      (r) =>
                        `<option value="${escapeHtml(r)}"${r === state.registerFilter ? ' selected' : ''}>${escapeHtml(r)}</option>`,
                    )
                    .join('')}
                </select>`
              : ''
          }
          <select class="stx-select" id="stx-status-select" aria-label="Study status">
            <option value="all"${state.statusFilter === 'all' ? ' selected' : ''}>All Status</option>
            <option value="remaining"${state.statusFilter === 'remaining' ? ' selected' : ''}>Remaining</option>
            <option value="studied"${state.statusFilter === 'studied' ? ' selected' : ''}>Studied</option>
          </select>
          <select class="stx-select" id="stx-sort-select" aria-label="Sort order">
            <option value="appearance"${state.sortBy === 'appearance' ? ' selected' : ''}>Source Order</option>
            <option value="hardest"${state.sortBy === 'hardest' ? ' selected' : ''}>Hardest (C2→A1)</option>
            <option value="easiest"${state.sortBy === 'easiest' ? ' selected' : ''}>Easiest (A1→C2)</option>
            <option value="importance"${state.sortBy === 'importance' ? ' selected' : ''}>Most Useful</option>
          </select>
        </div>

        <div class="stx-summary-strip">
          <span class="ltr-num">${
            isParagraphMode
              ? `<strong>${allParagraphs.length}</strong> complete thoughts · <strong>${filtered.length}</strong> of <strong>${totalCount}</strong> insights highlighted`
              : `Showing <strong>${filtered.length}</strong> of <strong>${totalCount}</strong> extracted items`
          }</span>
          <div class="stx-summary-right">
            <a class="stx-summary-link" href="/extractor/note/${encodeURIComponent(note.id)}" title="Open guide in Phrase Miner">Full Guide ↗</a>
            ${
              hasAnyActiveFilters()
                ? `<button type="button" class="stx-mini-btn" id="stx-reset-filters-btn">Reset</button>`
                : ''
            }
          </div>
        </div>
      </div>

      ${state.settingsOpen ? renderLaunchpadHtml(lesson) : ''}
      ${bodyHtml}
      ${
        totalPages > 1
          ? `<div class="stx-pagination">
              <button type="button" class="stx-btn-secondary" id="stx-prev-page" ${state.page <= 1 ? 'disabled' : ''}>Previous</button>
              <span class="stx-progress-label ltr-num">Page ${state.page} of ${totalPages}</span>
              <button type="button" class="stx-btn-secondary" id="stx-next-page" ${state.page >= totalPages ? 'disabled' : ''}>Next</button>
            </div>`
          : ''
      }
    `;
  }

  function renderZeroMatchHtml() {
    const allLevelsCount = getFilteredItems(true).length;
    const isLevelFiltered = state.levelPreset !== 'all' || state.customLevels.length > 0;
    return `
      <div class="stx-empty-box">
        <h4>No insights match the current filters</h4>
        <p>${
          isLevelFiltered && allLevelsCount > 0
            ? `${allLevelsCount} matching items are available at lower CEFR levels.`
            : 'Try broadening your level threshold, category group, or search query.'
        }</p>
        <div class="stx-empty-actions">
          ${
            isLevelFiltered
              ? '<button type="button" class="stx-btn-primary" id="stx-show-all-levels-btn">Show All Levels (A1–C2)</button>'
              : ''
          }
          <button type="button" class="stx-btn-secondary" id="stx-empty-reset-btn">Reset All Filters</button>
        </div>
      </div>
    `;
  }

  function renderItemCardHtml(item, note, doneSet, rtl, hasMedia) {
    const idx = Number(item.index);
    const completed = doneSet.has(idx);
    const saved = Boolean(bridge()?.isTermSaved?.(item.term));
    const isMasked = state.recallMode && !state.revealedIndices.has(idx);
    const cefr = String(item.cefr || '').trim().toUpperCase();
    const eng = engine();
    const groupId = eng ? eng.getMacroGroupId(item.category) : 'words';
    const catLabel = CATEGORY_LABELS[item.category] || item.category || 'Phrase';
    const hasExactWindow =
      hasMedia &&
      typeof item.phraseStartSec === 'number' &&
      typeof item.phraseEndSec === 'number' &&
      item.phraseEndSec > item.phraseStartSec;
    const hasSentenceWindow =
      hasMedia &&
      ((typeof item.startSec === 'number' && typeof item.endSec === 'number' && item.endSec > item.startSec) ||
        Boolean(item.sentenceIndex));
    const tsSec = typeof item.phraseStartSec === 'number' ? item.phraseStartSec : item.startSec;

    const highlightedQuote = highlightVerbatimTerm(item.contextSentence || '', item.term, item.surface);
    const clickableQuote = global.FlaptapWordLookup?.tokenizeClickableWords
      ? global.FlaptapWordLookup.tokenizeClickableWords(highlightedQuote, {
          contextSentence: item.contextSentence || '',
          sentenceIndex: item.sentenceIndex || undefined,
        })
      : highlightedQuote;

    const checkBtn = global.FlaptapCheck?.buttonHtml
      ? global.FlaptapCheck.buttonHtml({
          checked: completed,
          className: 'stx-check-btn',
          attrs: `data-stx-check="${idx}"`,
          label: completed ? 'Completed' : 'Mark studied',
        })
      : `<button type="button" class="item-check-btn${completed ? ' is-checked' : ''}" data-stx-check="${idx}" aria-pressed="${
          completed ? 'true' : 'false'
        }">${completed ? 'Done' : 'Study'}</button>`;

    const copyBtn = global.FlaptapCopy?.buttonHtml
      ? global.FlaptapCopy.buttonHtml(item.term, {
          className: 'stx-act-btn',
          label: `Copy ${item.term}`,
        })
      : '';

    return `
      <article class="stx-card stx-card--${escapeHtml(groupId)}${completed ? ' is-completed' : ''}${
        state.syncHighlightIdx === idx ? ' is-sync-active' : ''
      }" data-stx-idx="${idx}">
        <div class="stx-card-rail">
          ${checkBtn}
          <span class="stx-card-idx ltr-num">#${idx}</span>
        </div>

        <div class="stx-card-main">
          <div class="stx-card-head">
            <div class="stx-term-block">
              <span class="stx-dot stx-dot--${escapeHtml(groupId)}" aria-hidden="true"></span>
              <h4 class="stx-term">${escapeHtml(item.term)}</h4>
              ${
                item.surface && item.surface.toLowerCase() !== String(item.term || '').toLowerCase()
                  ? `<span class="stx-surface">(${escapeHtml(item.surface)})</span>`
                  : ''
              }
              ${item.ipa ? `<span class="stx-ipa">${escapeHtml(item.ipa)}</span>` : ''}
            </div>

            <div class="stx-badges">
              ${cefr ? `<span class="stx-badge stx-badge--cefr-${escapeHtml(cefr)}">${escapeHtml(cefr)}</span>` : ''}
              <span class="stx-badge stx-badge--cat">${escapeHtml(catLabel)}</span>
              ${item.partOfSpeech ? `<span class="stx-badge">${escapeHtml(item.partOfSpeech)}</span>` : ''}
              ${item.register ? `<span class="stx-badge">${escapeHtml(item.register)}</span>` : ''}
              ${
                typeof tsSec === 'number'
                  ? `<span class="stx-badge stx-badge--time">${escapeHtml(formatTs(tsSec))}</span>`
                  : ''
              }
            </div>
          </div>

          <div class="stx-meaning-box${isMasked ? ' is-masked' : ''}" data-stx-reveal="${idx}">
            ${item.meaning ? `<div class="stx-meaning">${escapeHtml(item.meaning)}</div>` : ''}
            ${
              item.localizedMeaning
                ? `<div class="stx-translation" dir="${rtl ? 'rtl' : 'auto'}">${escapeHtml(item.localizedMeaning)}</div>`
                : ''
            }
          </div>

          ${
            item.contextSentence
              ? `<div class="stx-quote-line">${clickableQuote}</div>`
              : ''
          }

          ${
            item.usageNote || item.spokenNote || item.example
              ? `<div class="stx-notes-grid">
                  ${
                    item.usageNote
                      ? `<div class="stx-note-line"><strong>Usage:</strong> ${escapeHtml(item.usageNote)}</div>`
                      : ''
                  }
                  ${
                    item.spokenNote
                      ? `<div class="stx-note-line"><strong>Spoken:</strong> ${escapeHtml(item.spokenNote)}</div>`
                      : ''
                  }
                  ${
                    item.example
                      ? `<div class="stx-note-line"><strong>Example:</strong> ${escapeHtml(item.example)}${
                          item.exampleTranslation
                            ? ` — <span dir="${rtl ? 'rtl' : 'auto'}">${escapeHtml(item.exampleTranslation)}</span>`
                            : ''
                        }</div>`
                      : ''
                  }
                </div>`
              : ''
          }

          <div class="stx-actions">
            ${
              hasSentenceWindow
                ? `<button type="button" class="stx-act-btn stx-act-btn--play" data-stx-action="play" data-stx-idx="${idx}" title="Play containing sentence in Studio player">${ICONS.play}<span>Play</span></button>`
                : ''
            }
            ${
              hasExactWindow
                ? `<button type="button" class="stx-act-btn" data-stx-action="exact" data-stx-idx="${idx}" title="Play exact phrase window">${ICONS.target}<span>Exact</span></button>`
                : ''
            }
            ${
              hasSentenceWindow
                ? `<button type="button" class="stx-act-btn stx-act-btn--loop" data-stx-action="loop" data-stx-idx="${idx}" title="Continuously loop this moment for shadowing">${ICONS.loop}<span>Loop</span></button>`
                : ''
            }
            ${
              item.sentenceIndex
                ? `<button type="button" class="stx-act-btn" data-stx-action="shadow" data-stx-idx="${idx}" title="Jump to Shadow mode at sentence #${item.sentenceIndex}">${ICONS.mic}<span>Shadow #${item.sentenceIndex}</span></button>`
                : ''
            }
            <button type="button" class="stx-act-btn" data-stx-action="speak" data-stx-idx="${idx}" title="Hear clean pronunciation">${ICONS.speaker}<span>Speak</span></button>
            <button type="button" class="stx-act-btn stx-act-btn--saved${saved ? ' is-active' : ''}" data-stx-action="save" data-stx-idx="${idx}" title="Save to Vocabulary Vault">${ICONS.bookmark}<span>${
              saved ? 'Saved' : 'Save'
            }</span></button>
            <button type="button" class="stx-act-btn" data-stx-action="ask" data-stx-idx="${idx}" title="Ask AI about this item">${ICONS.spark}<span>Ask AI</span></button>
            ${copyBtn}
          </div>
        </div>
      </article>
    `;
  }

  function bindItemActionEvents(scopeRoot) {
    if (!scopeRoot) return;
    scopeRoot.querySelectorAll('[data-stx-check]').forEach((btn) => {
      btn.addEventListener('click', () => toggleItemStudied(btn.getAttribute('data-stx-check')));
    });

    scopeRoot.querySelectorAll('[data-stx-reveal]').forEach((box) => {
      box.addEventListener('click', () => {
        if (!box.classList.contains('is-masked')) return;
        const idx = Number(box.getAttribute('data-stx-reveal'));
        state.revealedIndices.add(idx);
        box.classList.remove('is-masked');
      });
    });

    const itemByIndex = new Map((state.note?.items || []).map((it) => [Number(it.index), it]));
    scopeRoot.querySelectorAll('[data-stx-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-stx-action');
        const idx = Number(btn.getAttribute('data-stx-idx'));
        const item = itemByIndex.get(idx);
        if (!item) return;

        if (action === 'play') playItemClip(item, { exact: false, loop: false });
        else if (action === 'exact') playItemClip(item, { exact: true, loop: false });
        else if (action === 'loop') playItemClip(item, { exact: Boolean(item.phraseStartSec), loop: true });
        else if (action === 'shadow') bridge()?.jumpToShadowSentence?.(item.sentenceIndex);
        else if (action === 'speak') speakEnglishText(item.surface || item.term);
        else if (action === 'save') saveExtractItemToVocab(item);
        else if (action === 'ask') {
          bridge()?.openAskAi?.(
            `Explain "${item.term}"${item.cefr ? ` (${item.cefr})` : ''} as used in: "${item.contextSentence || ''}"`,
            item.contextSentence
              ? {
                  text: item.term,
                  sentenceIndex: item.sentenceIndex || undefined,
                  startMs: typeof item.startSec === 'number' ? Math.round(item.startSec * 1000) : undefined,
                }
              : undefined,
          );
        }
      });
    });
  }

  function bindInspectorSlotEvents(slot, paraId) {
    if (!slot) return;
    bindItemActionEvents(slot);

    slot.querySelectorAll('[data-stx-close-inspector]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activateParagraphItem(paraId, null, { toggleIfSame: false });
      });
    });

    slot.querySelectorAll('[data-stx-step-para]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dir = Number(btn.getAttribute('data-stx-step-dir')) || 1;
        stepParagraphInsight(paraId, dir);
      });
    });

    slot.querySelectorAll('[data-stx-para][data-stx-hl]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const itemIdx = Number(btn.getAttribute('data-stx-hl'));
        activateParagraphItem(paraId, itemIdx, { toggleIfSame: false });
      });
    });
  }

  function activateParagraphItem(paraId, itemIndex, { toggleIfSame = true } = {}) {
    const para = (state.lastParagraphs || []).find((p) => p.id === paraId);
    if (!para) return;

    const current = state.activeItemByPara.get(paraId);
    let nextIdx = itemIndex === null || itemIndex === undefined ? null : Number(itemIndex);
    if (toggleIfSame && nextIdx !== null && current === nextIdx) {
      nextIdx = null;
    }

    state.activeItemByPara.set(paraId, nextIdx);

    const thoughtEl = document.querySelector(`#mode-panel-extract .stx-thought[data-stx-para-id="${CSS.escape(paraId)}"]`);
    if (!thoughtEl) return;

    thoughtEl.querySelectorAll('[data-stx-para][data-stx-hl]').forEach((el) => {
      const idx = Number(el.getAttribute('data-stx-hl'));
      const isAct = nextIdx !== null && idx === nextIdx;
      el.classList.toggle('is-active', isAct);
      el.setAttribute('aria-pressed', isAct ? 'true' : 'false');
    });

    const slot = thoughtEl.querySelector(`[data-stx-inspector-slot="${CSS.escape(paraId)}"]`);
    if (!slot) return;

    const note = state.note;
    const doneSet = completedSetForNote(note);
    const rtl = isRtlLanguage(note?.targetLanguage);
    const hasMedia = Boolean(bridge()?.getPlaybackState?.()?.hasMedia);
    const activeItem = nextIdx !== null ? para.items.find((it) => Number(it.index) === nextIdx) || null : null;

    slot.innerHTML = renderInspectorHtml(para, activeItem, doneSet, rtl, hasMedia);
    bindInspectorSlotEvents(slot, paraId);
    syncPlaybackDomState();
  }

  function stepParagraphInsight(paraId, delta) {
    const para = (state.lastParagraphs || []).find((p) => p.id === paraId);
    if (!para || !para.items.length) return;
    const cur = state.activeItemByPara.get(paraId);
    let pos = para.items.findIndex((it) => Number(it.index) === Number(cur));
    if (pos < 0) pos = 0;
    else pos = (pos + delta + para.items.length) % para.items.length;
    activateParagraphItem(paraId, Number(para.items[pos].index), { toggleIfSame: false });
  }

  function render() {
    const panel = getContainer();
    if (!panel) return;
    const lesson = bridge()?.getItem?.();

    if (state.streaming) {
      panel.innerHTML = renderStreamingHtml();
      document.getElementById('stx-cancel-stream-btn')?.addEventListener('click', () => {
        state.abortController?.abort();
      });
      updateStreamDom();
      return;
    }

    if (state.loading && !state.note) {
      panel.innerHTML = `
        <section class="stx-card-shell">
          <div class="stx-stream-status">
            <span class="stx-spinner" aria-hidden="true"></span>
            <span>Loading Insights workbench...</span>
          </div>
        </section>
      `;
      return;
    }

    if (!state.note) {
      panel.innerHTML = renderLaunchpadHtml(lesson);
    } else {
      panel.innerHTML = renderWorkbenchHtml(state.note, lesson);
    }

    bindPanelEvents(panel);
    if (state.settingsOpen) {
      mountAiSelector();
    }
    syncPlaybackDomState();
  }

  function bindPanelEvents(panel) {
    document.getElementById('stx-run-exhaustive-btn')?.addEventListener('click', () => {
      startExtractionStream({ force: Boolean(state.note || state.configForce) });
    });

    document.getElementById('stx-toggle-settings-btn')?.addEventListener('click', () => {
      state.settingsOpen = !state.settingsOpen;
      render();
    });

    document.getElementById('stx-workbench-config-btn')?.addEventListener('click', () => {
      state.settingsOpen = !state.settingsOpen;
      render();
    });

    panel.querySelectorAll('[data-stx-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextView = btn.getAttribute('data-stx-view') === 'extraction' ? 'extraction' : 'paragraph';
        if (state.viewMode === nextView) return;
        state.viewMode = nextView;
        state.page = 1;
        saveStoredViewMode(nextView);
        render();
      });
    });

    document.getElementById('stx-lang-select')?.addEventListener('change', (e) => {
      state.configLanguage = e.target.value || 'ar';
      try {
        localStorage.setItem(LANG_PREF_KEY, state.configLanguage);
      } catch {}
    });

    document.getElementById('stx-depth-select')?.addEventListener('change', (e) => {
      state.configDepth = e.target.value || 'exhaustive';
      try {
        localStorage.setItem(DEPTH_PREF_KEY, state.configDepth);
      } catch {}
    });

    document.getElementById('stx-focus-select')?.addEventListener('change', (e) => {
      state.configFocus = e.target.value || 'balanced';
    });

    document.getElementById('stx-force-check')?.addEventListener('change', (e) => {
      state.configForce = Boolean(e.target.checked);
    });

    document.getElementById('stx-guide-select')?.addEventListener('change', (e) => {
      loadSpecificGuide(e.target.value);
    });

    document.getElementById('stx-recall-btn')?.addEventListener('click', () => {
      state.recallMode = !state.recallMode;
      state.revealedIndices.clear();
      render();
    });

    document.getElementById('stx-autosync-btn')?.addEventListener('click', () => {
      state.autoSync = !state.autoSync;
      if (!state.autoSync) {
        state.syncHighlightIdx = null;
        state.syncActiveParaId = null;
      }
      render();
    });

    document.getElementById('stx-export-toggle-btn')?.addEventListener('click', () => {
      state.exportMenuOpen = !state.exportMenuOpen;
      const menu = document.getElementById('stx-export-menu');
      if (menu) menu.hidden = !state.exportMenuOpen;
    });

    panel.querySelectorAll('[data-stx-export]').forEach((btn) => {
      btn.addEventListener('click', () => exportFilteredItems(btn.getAttribute('data-stx-export')));
    });

    panel.querySelectorAll('[data-stx-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.levelPreset = btn.getAttribute('data-stx-preset') || 'all';
        state.customLevels = [];
        state.page = 1;
        state.activeItemByPara.clear();
        saveStoredLevelPref(state.levelPreset, state.customLevels);
        render();
      });
    });

    panel.querySelectorAll('[data-stx-exact-cefr]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lv = btn.getAttribute('data-stx-exact-cefr');
        const next = new Set(state.customLevels);
        if (next.has(lv)) next.delete(lv);
        else next.add(lv);
        state.customLevels = Array.from(next);
        state.page = 1;
        state.activeItemByPara.clear();
        saveStoredLevelPref(state.levelPreset, state.customLevels);
        render();
      });
    });

    panel.querySelectorAll('[data-stx-macro]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.macroGroup = btn.getAttribute('data-stx-macro') || 'all';
        state.category = 'all';
        state.page = 1;
        state.activeItemByPara.clear();
        render();
      });
    });

    document.getElementById('stx-cat-select')?.addEventListener('change', (e) => {
      state.category = e.target.value || 'all';
      state.page = 1;
      state.activeItemByPara.clear();
      render();
    });

    document.getElementById('stx-open-prosody-btn')?.addEventListener('click', () => {
      bridge()?.switchInsightsSubView?.('prosody');
    });

    document.getElementById('stx-filters-toggle-btn')?.addEventListener('click', () => {
      state.filtersOpen = !state.filtersOpen;
      const box = document.getElementById('stx-secondary-filters');
      if (box) box.hidden = !state.filtersOpen;
      document
        .getElementById('stx-filters-toggle-btn')
        ?.setAttribute('aria-expanded', state.filtersOpen ? 'true' : 'false');
    });

    const searchInp = document.getElementById('stx-search-input');
    searchInp?.addEventListener('input', (e) => {
      const selStart = e.target.selectionStart;
      state.search = e.target.value;
      state.page = 1;
      state.activeItemByPara.clear();
      render();
      const refreshed = document.getElementById('stx-search-input');
      if (refreshed) {
        refreshed.focus();
        try {
          refreshed.setSelectionRange(selStart, selStart);
        } catch {}
      }
    });

    document.getElementById('stx-pos-select')?.addEventListener('change', (e) => {
      state.posFilter = e.target.value || 'all';
      state.page = 1;
      state.activeItemByPara.clear();
      render();
    });

    document.getElementById('stx-reg-select')?.addEventListener('change', (e) => {
      state.registerFilter = e.target.value || 'all';
      state.page = 1;
      state.activeItemByPara.clear();
      render();
    });

    document.getElementById('stx-status-select')?.addEventListener('change', (e) => {
      state.statusFilter = e.target.value || 'all';
      state.page = 1;
      state.activeItemByPara.clear();
      render();
    });

    document.getElementById('stx-sort-select')?.addEventListener('change', (e) => {
      state.sortBy = e.target.value || 'appearance';
      state.page = 1;
      render();
    });

    const resetFilters = () => {
      state.levelPreset = 'all';
      state.customLevels = [];
      state.macroGroup = 'all';
      state.category = 'all';
      state.posFilter = 'all';
      state.registerFilter = 'all';
      state.statusFilter = 'all';
      state.search = '';
      state.page = 1;
      state.activeItemByPara.clear();
      saveStoredLevelPref('all', []);
      render();
    };

    document.getElementById('stx-reset-filters-btn')?.addEventListener('click', resetFilters);
    document.getElementById('stx-empty-reset-btn')?.addEventListener('click', resetFilters);
    document.getElementById('stx-show-all-levels-btn')?.addEventListener('click', () => {
      state.levelPreset = 'all';
      state.customLevels = [];
      state.page = 1;
      state.activeItemByPara.clear();
      saveStoredLevelPref('all', []);
      render();
    });

    document.getElementById('stx-prev-page')?.addEventListener('click', () => {
      if (state.page > 1) {
        state.page -= 1;
        render();
      }
    });
    document.getElementById('stx-next-page')?.addEventListener('click', () => {
      state.page += 1;
      render();
    });

    // Paragraph-view highlight & play bindings
    panel.querySelectorAll('[data-stx-play-para]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const paraId = btn.getAttribute('data-stx-play-para');
        const para = (state.lastParagraphs || []).find((p) => p.id === paraId);
        if (para) playThoughtClip(para);
      });
    });

    panel.querySelectorAll('[data-stx-para][data-stx-hl]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const paraId = el.getAttribute('data-stx-para');
        const itemIdx = Number(el.getAttribute('data-stx-hl'));
        const isFlowOrPeek =
          el.classList.contains('stx-flow-chip') || el.classList.contains('stx-inspector-peek-btn');
        activateParagraphItem(paraId, itemIdx, { toggleIfSame: !isFlowOrPeek });
      });
    });

    panel.querySelectorAll('[data-stx-close-inspector]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const paraId = btn.getAttribute('data-stx-close-inspector');
        activateParagraphItem(paraId, null, { toggleIfSame: false });
      });
    });

    panel.querySelectorAll('[data-stx-step-para]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const paraId = btn.getAttribute('data-stx-step-para');
        const dir = Number(btn.getAttribute('data-stx-step-dir')) || 1;
        stepParagraphInsight(paraId, dir);
      });
    });

    bindItemActionEvents(panel);
  }

  function ensureTickSubscription() {
    if (state.unsubscribeTick || !bridge()?.onPlaybackTick) return;
    state.unsubscribeTick = bridge().onPlaybackTick(handlePlaybackTick);
  }

  function onLessonLoaded(item) {
    const nextId = item?.id || '';
    if (!nextId) return;
    if (state.lessonId !== nextId) {
      state.lessonId = nextId;
      state.loadedLessonId = '';
      state.note = null;
      state.guides = [];
      state.page = 1;
      state.revealedIndices.clear();
      state.activeItemByPara.clear();
      state.lastParagraphs = [];
      state.syncHighlightIdx = null;
      state.syncActiveParaId = null;
      state.activeLoopKey = '';
      bridge()?.setExtractBadge?.(0);
    }
    ensureTickSubscription();
  }

  function onActivate() {
    ensureTickSubscription();
    const lesson = bridge()?.getItem?.();
    if (lesson?.id && state.loadedLessonId !== lesson.id && !state.loading) {
      state.lessonId = lesson.id;
      fetchExtractionForLesson(lesson.id, { forceRender: true });
      return;
    }
    render();
  }

  global.FlaptapStudioExtract = {
    onLessonLoaded,
    onActivate,
    render,
  };
})(window);
