/* ==========================================================================
   FLAPTAP AMERICAN ENGLISH EXTRACTOR (american-extractor.js)
   Dedicated feature controller for /extractor, /extractor/library and
   /extractor/note/:id. Reuses the workspace shell, AI selector, shared
   word lookup, vocabulary vault, completion controls, and route router.
   ========================================================================== */

(function (global) {
  'use strict';

  const FALLBACK_LANGUAGES = [
    { code: 'ar', name: 'Arabic', native: 'العربية', rtl: true },
    { code: 'en', name: 'English', native: 'English' },
    { code: 'es', name: 'Spanish', native: 'Español' },
    { code: 'fr', name: 'French', native: 'Français' },
    { code: 'de', name: 'German', native: 'Deutsch' },
    { code: 'tr', name: 'Turkish', native: 'Türkçe' },
  ];

  const OPTIONS_STORAGE_KEY = 'flaptap_aex_options';

  const DEFAULT_OPTIONS = {
    extractionType: 'all',
    style: 'auto',
    level: 'all',
    focus: 'balanced',
    depth: 'adaptive',
    studyGoal: 'full',
    order: 'appearance',
  };

  const OPTION_SPECS = [
    {
      key: 'extractionType',
      selectId: 'aex-type-select',
      configKey: 'extractionTypes',
      fallback: [
        { id: 'all', label: 'All types', shortLabel: 'All types' },
        { id: 'vocabulary', label: 'Vocabulary & words', shortLabel: 'Vocabulary' },
        { id: 'idiom', label: 'Idioms & expressions', shortLabel: 'Idioms' },
        { id: 'slang', label: 'Slang & street talk', shortLabel: 'Slang' },
        { id: 'phrasal_verb', label: 'Phrasal verbs', shortLabel: 'Phrasal verbs' },
        { id: 'collocation', label: 'Collocations', shortLabel: 'Collocations' },
        { id: 'connected_speech', label: 'Connected speech', shortLabel: 'Connected speech' },
        { id: 'discourse_marker', label: 'Discourse markers', shortLabel: 'Discourse markers' },
        { id: 'pattern', label: 'Sentence patterns', shortLabel: 'Patterns' },
        { id: 'phrases', label: 'Multi-word phrases', shortLabel: 'Phrases only' },
      ],
    },
    {
      key: 'style',
      selectId: 'aex-style-select',
      configKey: 'styles',
      fallback: [
        { id: 'auto', label: 'Auto style', shortLabel: 'Auto style' },
        { id: 'american_slang', label: 'American slang', shortLabel: 'American slang' },
        { id: 'standard_american', label: 'Standard American', shortLabel: 'Standard English' },
        { id: 'casual_spoken', label: 'Casual spoken', shortLabel: 'Casual spoken' },
        { id: 'professional_workplace', label: 'Professional & tech', shortLabel: 'Professional' },
        { id: 'academic_formal', label: 'Formal & academic', shortLabel: 'Formal & academic' },
        { id: 'modern_internet', label: 'Internet & creator', shortLabel: 'Internet & creator' },
      ],
    },
    {
      key: 'level',
      selectId: 'aex-level-select',
      configKey: 'levels',
      fallback: [
        { id: 'all', label: 'All levels', shortLabel: 'All levels' },
        { id: 'a1', label: 'A1 · Beginner (Foundational)', shortLabel: 'A1 Beginner' },
        { id: 'a2', label: 'A2 · Elementary (Daily basics)', shortLabel: 'A2 Elementary' },
        { id: 'b1', label: 'B1 · Intermediate', shortLabel: 'B1 Intermediate' },
        { id: 'b2', label: 'B2 · Upper-Intermediate', shortLabel: 'B2 Upper-Int' },
        { id: 'c1', label: 'C1 · Advanced', shortLabel: 'C1 Advanced' },
        { id: 'c2', label: 'C2 · Mastery', shortLabel: 'C2 Mastery' },
        { id: 'a1_a2', label: 'A1–A2 · Essentials', shortLabel: 'A1–A2' },
        { id: 'b1_b2', label: 'B1–B2 · Bridge', shortLabel: 'B1–B2' },
        { id: 'b2_c2', label: 'B2–C2 · Advanced', shortLabel: 'B2–C2' },
      ],
    },
    {
      key: 'focus',
      selectId: 'aex-focus-select',
      configKey: 'focuses',
      fallback: [
        { id: 'balanced', label: 'Any topic', shortLabel: 'Any topic' },
        { id: 'professional', label: 'Tech & work', shortLabel: 'Tech & work' },
        { id: 'everyday', label: 'Everyday & social', shortLabel: 'Everyday' },
        { id: 'creator', label: 'Creator & podcast', shortLabel: 'Creator & podcast' },
        { id: 'media', label: 'Movies & TV', shortLabel: 'Movies & TV' },
        { id: 'news_tech', label: 'News & essays', shortLabel: 'News & essays' },
      ],
    },
    {
      key: 'depth',
      selectId: 'aex-depth-select',
      configKey: 'depths',
      fallback: [
        { id: 'adaptive', label: 'Adaptive', shortLabel: 'Adaptive count' },
        { id: 'essentials', label: 'Essentials (5–8 items)', shortLabel: 'Top 5–8' },
        { id: 'focused', label: 'Focused (10–15 items)', shortLabel: '10–15 items' },
        { id: 'comprehensive', label: 'Comprehensive (Deep)', shortLabel: 'Deep sweep' },
      ],
    },
    {
      key: 'studyGoal',
      selectId: 'aex-goal-select',
      configKey: 'studyGoals',
      fallback: [
        { id: 'full', label: 'Full study guide', shortLabel: 'Full study' },
        { id: 'speaking', label: 'Speaking & flow', shortLabel: 'Speaking & flow' },
        { id: 'active_recall', label: 'Pitfalls & recall', shortLabel: 'Pitfalls & recall' },
        { id: 'workplace', label: 'Workplace tone', shortLabel: 'Workplace tone' },
        { id: 'flashcards', label: 'Quick flashcards', shortLabel: 'Flashcards' },
      ],
    },
    {
      key: 'order',
      selectId: 'aex-order-select',
      configKey: 'orders',
      fallback: [
        { id: 'appearance', label: 'Source order', shortLabel: 'Source order' },
        { id: 'importance', label: 'Most useful first', shortLabel: 'Most useful first' },
        { id: 'difficulty', label: 'Hardest first', shortLabel: 'Hardest first' },
      ],
    },
  ];

  const CATEGORY_LABELS = {
    idiom: 'Idiom',
    slang: 'Slang',
    phrasal_verb: 'Phrasal verb',
    vocabulary: 'Vocabulary',
    collocation: 'Collocation',
    connected_speech: 'Connected speech',
    discourse_marker: 'Discourse marker',
    pattern: 'Pattern',
  };

  const SOURCE_TYPE_LABELS = {
    youtube: 'YouTube',
    social_video: 'Social video',
    audio: 'Audio',
    video: 'Video',
    article: 'Article',
    text: 'Text',
    markdown: 'Markdown',
    image: 'Image OCR',
    lesson: 'Saved transcript',
  };

  const state = {
    initialized: false,
    eventsBound: false,
    activeView: 'extract',
    sourceTab: 'link',
    config: null,
    aiSelector: null,
    currentNote: null,
    history: [],
    historyTotal: 0,
    selectedFile: null,
    noteFilter: 'all',
    noteScope: 'all',
    noteSearch: '',
    librarySearch: '',
    noteLanguage: '',
    savedTerms: new Set(),
    teardowns: [],
    itemsTeardown: null,
    listAnimTimer: null,
    progressTimer: null,
    progressStartedAt: 0,
    lastRunPayload: null,
    loadingNoteId: '',
    lessonSourcesLoaded: false,
    armedDeleteId: '',
  };

  function ws() {
    return global.FlaptapWorkspace || null;
  }

  function router() {
    return global.FlaptapRouter || null;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name, options) {
    return global.FlaptapIcon ? global.FlaptapIcon(name, options) : '';
  }

  function showToast(message) {
    ws()?.showToast?.(message);
  }

  async function apiFetch(url, options) {
    if (ws()?.apiFetch) return ws().apiFetch(url, options);
    const res = await fetch(url, Object.assign({ credentials: 'same-origin' }, options || {}));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data?.message || `Request failed (${res.status})`);
      error.status = res.status;
      error.code = data?.code;
      throw error;
    }
    return data;
  }

  async function uploadFetch(url, formData) {
    const headers = ws()?.getAuthHeaders ? { ...ws().getAuthHeaders() } : {};
    delete headers['Content-Type'];
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data?.message || `Upload failed (${res.status})`);
      error.status = res.status;
      error.code = data?.code;
      throw error;
    }
    return data;
  }

  function currentUser() {
    return ws()?.getUser?.() || null;
  }

  function requireAuth(payload, message) {
    if (currentUser()) return true;
    if (ws()?.requireAuthBeforeAction) {
      return ws().requireAuthBeforeAction({ type: 'aex_extract', payload }, message);
    }
    showToast('Sign in to run an extraction.');
    return false;
  }

  function requireNoteAuth() {
    if (currentUser()) return true;
    if (ws()?.requireAuthBeforeAction) {
      return ws().requireAuthBeforeAction({
        type: 'navigate',
        href: `${global.location.pathname}${global.location.search || ''}`,
      });
    }
    showToast('Sign in to open saved study maps.');
    return false;
  }

  function languages() {
    const list = ws()?.getLanguages?.() || [];
    return list.length > 0 ? list : FALLBACK_LANGUAGES;
  }

  function languageByCode(code) {
    return languages().find((language) => language.code === code) || null;
  }

  function preferredLanguage() {
    return (
      state.noteLanguage ||
      currentUser()?.nativeLanguage ||
      localStorage.getItem('flaptap_trans_lang') ||
      'ar'
    );
  }

  function rememberLanguage(code) {
    const clean = String(code || '').trim();
    if (!clean) return;
    state.noteLanguage = clean;
    try {
      localStorage.setItem('flaptap_trans_lang', clean);
    } catch {}
  }

  /* ========================================================================
     INITIALIZATION & ROUTING
     ======================================================================== */

  async function init(routeState) {
    if (!state.initialized) {
      state.initialized = true;
      state.noteLanguage = preferredLanguage();
      if (routeState?.subview === 'library') {
        switchView('library', { skipRoute: true });
      }
      bindEvents();
      mountAiSelector();
      populateLanguageSelects();
      populateExtractionOptions(loadSavedOptions());
      await loadConfig();
      await prepareUserData();
      if (state.aiSelector) {
        await state.aiSelector.init();
      }
    }

    if (routeState) {
      await applyRouteState(routeState);
    }
  }

  async function loadConfig() {
    try {
      const data = await apiFetch('/api/american-extractor/config', { method: 'GET' });
      state.config = data;
      populateExtractionOptions();
      const fileInput = document.getElementById('aex-file-input');
      if (fileInput && Array.isArray(data.acceptedUploadTypes)) {
        fileInput.setAttribute('accept', data.acceptedUploadTypes.join(','));
      }
    } catch (error) {
      // Capability config is public and cached by the shell; defaults keep the UI usable.
      state.config = null;
    }
  }

  async function prepareUserData() {
    if (!currentUser()) {
      state.history = [];
      state.historyTotal = 0;
      renderRecent();
      renderLibrary();
      populateLessonSelect([]);
      return;
    }
    await Promise.all([
      loadHistory(),
      loadLessonSources(),
      ws()?.refreshVocabulary ? ws().refreshVocabulary() : Promise.resolve(),
    ]);
    if (state.currentNote) updateSaveButtons();
  }

  async function applyRouteState(routeState) {
    if (!routeState || routeState.section !== 'american-extractor') return;
    const subview = routeState.subview || 'extract';

    if (subview === 'note' && routeState.noteId) {
      if (state.currentNote?.id === routeState.noteId) {
        switchView('note', { skipRoute: true });
        return;
      }
      await openNote(routeState.noteId, { skipRoute: true, silent: true });
      return;
    }

    if (subview === 'library') {
      switchView('library', { skipRoute: true });
      return;
    }

    switchView('extract', { skipRoute: true });
  }

  function switchView(view, options = {}) {
    const next = view === 'note' && !state.currentNote ? 'extract' : view;
    state.activeView = next;

    ['extract', 'note', 'library'].forEach((name) => {
      const panel = document.getElementById(`aex-view-${name}`);
      if (panel) panel.hidden = name !== next;
    });

    ['extract', 'library'].forEach((name) => {
      const tab = document.getElementById(`aex-tab-${name}`);
      if (!tab) return;
      const active = name === next;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    if (!options.skipRoute && router()) {
      if (next === 'library') {
        router().navigate('american-extractor', { subview: 'library', replace: Boolean(options.replace) });
      } else if (next === 'note' && state.currentNote) {
        router().navigate('american-extractor', {
          subview: 'note',
          noteId: state.currentNote.id,
          replace: Boolean(options.replace),
        });
      } else {
        router().navigate('american-extractor', { replace: Boolean(options.replace) });
      }
    }
  }

  /* ========================================================================
     AI SELECTOR
     ======================================================================== */

  function mountAiSelector() {
    if (state.aiSelector || !global.FlaptapAiSelector) return;
    const mount = document.getElementById('aex-ai-selector-mount');
    if (!mount) return;

    state.aiSelector = global.FlaptapAiSelector.create({
      container: mount,
      idPrefix: 'aex-aisel',
      persistenceKey: 'american_extractor_v2',
      preferredModels: ['gpt-6-luna', 'gpt-5.6-luna'],
      preferredVariants: ['medium', 'low', 'standard'],
      title: 'AI Model',
      actionLabel: 'Extract Phrases',
      extraSummaryItems: [
        { id: 'source', label: 'Source', value: 'Link' },
        { id: 'type', label: 'Extract', value: 'All types' },
        { id: 'style', label: 'Style', value: 'Auto style' },
        { id: 'level', label: 'Level', value: 'All levels' },
        { id: 'language', label: 'Meaning', value: 'Arabic' },
      ],
      fetcher: apiFetch,
      onToast: showToast,
      onRun: () => handleRun(),
    });
  }

  function optionShortLabel(spec, value) {
    const list =
      Array.isArray(state.config?.[spec.configKey]) && state.config[spec.configKey].length > 0
        ? state.config[spec.configKey]
        : spec.fallback;
    const match = list.find((item) => item.id === value);
    return match?.shortLabel || match?.label || value;
  }

  function syncAiSummary() {
    if (!state.aiSelector) return;
    const sourceLabels = { link: 'Link', text: 'Text', upload: 'File' };
    const language = languageByCode(document.getElementById('aex-language-select')?.value);
    state.aiSelector.setSummaryValue('source', sourceLabels[state.sourceTab] || 'Source');
    for (const key of ['extractionType', 'style', 'level']) {
      const spec = OPTION_SPECS.find((entry) => entry.key === key);
      if (!spec) continue;
      const val = document.getElementById(spec.selectId)?.value || DEFAULT_OPTIONS[key];
      const summaryId = key === 'extractionType' ? 'type' : key;
      state.aiSelector.setSummaryValue(summaryId, optionShortLabel(spec, val));
    }
    state.aiSelector.setSummaryValue(
      'language',
      language ? language.name : 'Target language',
    );
  }

  /* ========================================================================
     SOURCE FORM
     ======================================================================== */

  function setSourceTab(tab) {
    const next = ['link', 'text', 'upload'].includes(tab) ? tab : 'link';
    state.sourceTab = next;
    document.querySelectorAll('[data-aex-source]').forEach((button) => {
      const active = button.dataset.aexSource === next;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-aex-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.aexPanel !== next;
    });
    syncAiSummary();
  }

  function populateLanguageSelects() {
    const selects = [
      document.getElementById('aex-language-select'),
      document.getElementById('aex-note-lang-select'),
    ].filter(Boolean);
    const items = languages();
    const preferred = preferredLanguage();

    for (const select of selects) {
      const previous = select.value || preferred;
      select.innerHTML = items
        .map(
          (language) =>
            `<option value="${escapeHtml(language.code)}">${escapeHtml(language.name)} (${escapeHtml(
              language.native,
            )})</option>`,
        )
        .join('');
      const match = items.some((language) => language.code === previous)
        ? previous
        : items.some((language) => language.code === 'ar')
          ? 'ar'
          : items[0]?.code || 'en';
      select.value = match;
    }
    syncAiSummary();
  }

  function loadSavedOptions() {
    try {
      const raw = localStorage.getItem(OPTIONS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveOptions() {
    const out = {};
    for (const spec of OPTION_SPECS) {
      const select = document.getElementById(spec.selectId);
      out[spec.key] = select?.value || DEFAULT_OPTIONS[spec.key];
    }
    try {
      localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(out));
    } catch {}
  }

  function syncOptionIndicators() {
    let anyCustom = false;
    let advancedCustomCount = 0;
    const advancedKeys = new Set(['style', 'focus', 'depth', 'studyGoal', 'order']);
    for (const spec of OPTION_SPECS) {
      const select = document.getElementById(spec.selectId);
      if (!select) continue;
      const isCustom = (select.value || DEFAULT_OPTIONS[spec.key]) !== DEFAULT_OPTIONS[spec.key];
      if (isCustom) {
        anyCustom = true;
        if (advancedKeys.has(spec.key)) advancedCustomCount += 1;
      }
      select.closest('.aex-option')?.classList.toggle('is-customized', isCustom);
    }
    const resetBtn = document.getElementById('aex-reset-options-btn');
    if (resetBtn) resetBtn.hidden = !anyCustom;
    const countBadge = document.getElementById('aex-custom-count');
    if (countBadge) {
      countBadge.textContent = String(advancedCustomCount);
      countBadge.hidden = advancedCustomCount === 0;
    }
    document.getElementById('aex-options-toggle')?.classList.toggle('has-custom', advancedCustomCount > 0);
  }

  function resetOptionsToDefault() {
    for (const spec of OPTION_SPECS) {
      const select = document.getElementById(spec.selectId);
      if (select) select.value = DEFAULT_OPTIONS[spec.key];
    }
    saveOptions();
    syncOptionIndicators();
    syncAiSummary();
    showToast('Options reset to defaults.');
  }

  function populateExtractionOptions(savedOverrides) {
    const saved = savedOverrides || loadSavedOptions();
    for (const spec of OPTION_SPECS) {
      const select = document.getElementById(spec.selectId);
      if (!select) continue;
      const items =
        Array.isArray(state.config?.[spec.configKey]) && state.config[spec.configKey].length > 0
          ? state.config[spec.configKey]
          : spec.fallback;
      const fallbackById = new Map((spec.fallback || []).map((entry) => [entry.id, entry]));
      const fallbackDefault = DEFAULT_OPTIONS[spec.key];
      const preferred = select.value || saved[spec.key] || fallbackDefault;
      select.innerHTML = items
        .map((item) => {
          const fb = fallbackById.get(item.id);
          const cleanLabel =
            fb?.label ||
            item.shortLabel ||
            String(item.label || item.id).replace(/\s*\(Default\)\s*/i, '').trim();
          return `<option value="${escapeHtml(item.id)}">${escapeHtml(cleanLabel)}</option>`;
        })
        .join('');
      select.value = items.some((item) => item.id === preferred)
        ? preferred
        : items.some((item) => item.id === fallbackDefault)
          ? fallbackDefault
          : items[0]?.id || fallbackDefault;
    }
    syncOptionIndicators();
    syncAiSummary();
  }

  function collectRunPayload() {
    const payload = {
      tab: state.sourceTab,
      url: String(document.getElementById('aex-url-input')?.value || '').trim(),
      text: String(document.getElementById('aex-text-input')?.value || '').trim(),
      title: String(document.getElementById('aex-text-title')?.value || '').trim(),
      lessonId: String(document.getElementById('aex-lesson-select')?.value || '').trim(),
      language: document.getElementById('aex-language-select')?.value || preferredLanguage(),
    };
    for (const spec of OPTION_SPECS) {
      payload[spec.key] = document.getElementById(spec.selectId)?.value || DEFAULT_OPTIONS[spec.key];
    }
    return payload;
  }

  function restoreRunPayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    setSourceTab(payload.tab || 'link');
    const urlInput = document.getElementById('aex-url-input');
    const textInput = document.getElementById('aex-text-input');
    const titleInput = document.getElementById('aex-text-title');
    const lessonSelect = document.getElementById('aex-lesson-select');
    const languageSelect = document.getElementById('aex-language-select');
    if (urlInput) urlInput.value = payload.url || '';
    if (textInput) textInput.value = payload.text || '';
    if (titleInput) titleInput.value = payload.title || '';
    if (lessonSelect && payload.lessonId) lessonSelect.value = payload.lessonId;
    if (languageSelect && payload.language) languageSelect.value = payload.language;
    for (const spec of OPTION_SPECS) {
      const select = document.getElementById(spec.selectId);
      if (select && payload[spec.key]) select.value = payload[spec.key];
    }
    updateTextWordCount();
    syncOptionIndicators();
    syncAiSummary();
  }

  function updateTextWordCount() {
    const value = String(document.getElementById('aex-text-input')?.value || '');
    const count = (value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;
    const target = document.getElementById('aex-text-word-count');
    if (target) target.textContent = String(count);
  }

  function setSelectedFile(file) {
    const maxMb = Number(state.config?.maxUploadMb) || 50;
    if (!file) {
      state.selectedFile = null;
      const chip = document.getElementById('aex-file-chip');
      if (chip) chip.hidden = true;
      const input = document.getElementById('aex-file-input');
      if (input) input.value = '';
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      showInlineError('File too large', `Choose a file smaller than ${maxMb} MB.`);
      setSelectedFile(null);
      return;
    }
    state.selectedFile = file;
    const chip = document.getElementById('aex-file-chip');
    const nameEl = document.getElementById('aex-file-name');
    if (nameEl) nameEl.textContent = file.name;
    if (chip) chip.hidden = false;
    hideInlineError();
  }

  /* ========================================================================
     EXTRACTION RUN
     ======================================================================== */

  async function handleRun() {
    hideInlineError();
    const payload = collectRunPayload();

    if (payload.tab === 'link' && !payload.url) {
      showInlineError('Add a source link', 'Paste a video, social, audio, or article URL first.');
      return;
    }
    if (payload.tab === 'text' && !payload.text && !payload.lessonId) {
      showInlineError(
        'Add some text',
        'Paste a transcript or Markdown, or choose a saved lesson transcript below.',
      );
      return;
    }
    if (payload.tab === 'upload' && !state.selectedFile) {
      showInlineError('Choose a file', 'Drop a file or use the file picker first.');
      return;
    }
    if (!requireAuth(payload)) return;

    const selection = state.aiSelector?.getSelection?.() || {
      keyId: '',
      model: 'gpt-6-luna',
      variant: 'medium',
      providerName: 'AI provider',
    };

    state.lastRunPayload = payload;
    startProgress(payload);
    state.aiSelector?.setDisabled?.(true);

    try {
      let response;
      if (payload.tab === 'upload') {
        const form = new FormData();
        form.append('file', state.selectedFile);
        form.append('language', payload.language);
        for (const spec of OPTION_SPECS) {
          form.append(spec.key, payload[spec.key]);
        }
        if (selection.keyId) form.append('keyId', selection.keyId);
        if (selection.model) form.append('model', selection.model);
        if (selection.variant) form.append('variant', selection.variant);
        response = await uploadFetch('/api/american-extractor/extract/upload', form);
      } else {
        response = await apiFetch('/api/american-extractor/extract', {
          method: 'POST',
          body: JSON.stringify({
            inputKind: payload.tab === 'link' ? 'url' : payload.lessonId ? 'lesson' : 'text',
            url: payload.url || undefined,
            text: payload.text || undefined,
            title: payload.title || undefined,
            lessonId: payload.lessonId || undefined,
            language: payload.language,
            extractionType: payload.extractionType,
            style: payload.style,
            level: payload.level,
            focus: payload.focus,
            depth: payload.depth,
            studyGoal: payload.studyGoal,
            order: payload.order,
            keyId: selection.keyId || undefined,
            model: selection.model || undefined,
            variant: selection.variant || undefined,
          }),
        });
      }

      if (!response?.data) {
        throw new Error('The extraction returned no study map.');
      }

      setProgressStep(4, 'Study map saved. Opening it now...');
      rememberLanguage(payload.language);
      await onExtractionReady(response.data);
    } catch (error) {
      if (error?.status === 401 || error?.code === 'auth_required') {
        requireAuth(payload);
      } else {
        showInlineError('Extraction failed', error?.message || 'Something went wrong.');
      }
    } finally {
      stopProgress();
      state.aiSelector?.setDisabled?.(false);
    }
  }

  async function onExtractionReady(note) {
    state.currentNote = note;
    state.noteFilter = 'all';
    state.noteScope = 'all';
    state.noteSearch = '';
    state.savedTerms.clear();
    state.lastRunPayload = null;
    renderNote(note);
    switchView('note');
    await loadHistory();
    if (note.fallbackFrom) {
      showToast(`Model failover used: ${note.fallbackFrom}`);
    } else {
      showToast(`${note.itemCount} American English items extracted`);
    }
  }

  async function resumePending(payload) {
    if (!state.initialized) {
      await init({ section: 'american-extractor', searchParams: new URLSearchParams() });
    }
    restoreRunPayload(payload);
    await handleRun();
  }

  /* ========================================================================
     PROGRESS & ERROR UI
     ======================================================================== */

  function startProgress(payload) {
    const card = document.getElementById('aex-progress');
    if (card) card.hidden = false;
    state.progressStartedAt = Date.now();
    const elapsed = document.getElementById('aex-progress-elapsed');
    if (elapsed) elapsed.textContent = '0.0s';
    clearInterval(state.progressTimer);
    state.progressTimer = setInterval(() => {
      const target = document.getElementById('aex-progress-elapsed');
      if (target) {
        target.textContent = `${((Date.now() - state.progressStartedAt) / 1000).toFixed(1)}s`;
      }
    }, 100);

    const source =
      payload.tab === 'link'
        ? 'Resolving source (captions, article, or speech)...'
        : payload.tab === 'upload'
          ? 'Reading the uploaded file (OCR or speech-to-text)...'
          : payload.lessonId
            ? 'Loading the saved lesson transcript...'
            : 'Reading the pasted English text...';
    setProgressStep(1, source);
  }

  function setProgressStep(step, message) {
    const status = document.getElementById('aex-progress-status');
    if (status && message) status.textContent = message;
    for (let index = 1; index <= 4; index++) {
      const el = document.getElementById(`aex-step-${index}`);
      if (!el) continue;
      el.classList.toggle('done', index < step);
      el.classList.toggle('active', index === step);
    }
  }

  function stopProgress() {
    clearInterval(state.progressTimer);
    state.progressTimer = null;
    const card = document.getElementById('aex-progress');
    if (card) card.hidden = true;
  }

  function showInlineError(title, message) {
    const wrap = document.getElementById('aex-inline-error');
    const titleEl = document.getElementById('aex-err-title');
    const messageEl = document.getElementById('aex-err-msg');
    if (titleEl) titleEl.textContent = title || 'Extraction failed';
    if (messageEl) messageEl.textContent = message || 'Something went wrong.';
    if (wrap) wrap.hidden = false;
    const retry = document.getElementById('aex-err-retry');
    if (retry) retry.hidden = !state.lastRunPayload;
  }

  function hideInlineError() {
    const wrap = document.getElementById('aex-inline-error');
    if (wrap) wrap.hidden = true;
  }

  /* ========================================================================
     HISTORY & LIBRARY
     ======================================================================== */

  async function loadHistory() {
    if (!currentUser()) {
      state.history = [];
      state.historyTotal = 0;
      renderRecent();
      renderLibrary();
      const count = document.getElementById('aex-library-count');
      if (count) count.textContent = '0';
      return;
    }
    try {
      const data = await apiFetch('/api/american-extractor/history', { method: 'GET' });
      state.history = Array.isArray(data.items) ? data.items : [];
      state.historyTotal = Number(data.total) || state.history.length;
      renderRecent();
      renderLibrary();
      const count = document.getElementById('aex-library-count');
      if (count) count.textContent = String(state.historyTotal);
      const total = document.getElementById('aex-recent-total');
      if (total) total.textContent = String(state.historyTotal);
    } catch (error) {
      if (error?.status !== 401) {
        showToast(error?.message || 'Could not load extraction history.');
      }
    }
  }

  async function loadLessonSources() {
    if (!currentUser()) {
      populateLessonSelect([]);
      return;
    }
    try {
      const data = await apiFetch('/api/american-extractor/transcript-sources', { method: 'GET' });
      populateLessonSelect(Array.isArray(data.items) ? data.items : []);
      state.lessonSourcesLoaded = true;
    } catch {
      populateLessonSelect([]);
    }
  }

  function populateLessonSelect(items) {
    const select = document.getElementById('aex-lesson-select');
    if (!select) return;
    const previous = select.value;
    const options = [
      '<option value="">Choose a saved lesson…</option>',
      ...items.map(
        (item) =>
          `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)} · ${escapeHtml(
            String(item.sentencesCount || 0),
          )} sentences</option>`,
      ),
    ];
    select.innerHTML = options.join('');
    if (items.some((item) => item.id === previous)) select.value = previous;
  }

  function renderRecent() {
    const row = document.getElementById('aex-recent-row');
    const empty = document.getElementById('aex-empty-recent');
    if (!row) return;
    const items = state.history.slice(0, 3);
    row.innerHTML = items.map(renderRecentCard).join('');
    if (empty) empty.hidden = items.length > 0;
  }

  function renderRecentCard(item) {
    const stats = historyStudyState(item);
    return `
      <button type="button" class="aex-recent-mini" data-state="${stats.tone}" data-aex-open="${escapeHtml(item.id)}" aria-label="Open ${escapeHtml(
        item.title || 'study map',
      )} — ${escapeHtml(stats.label)}">
        <span class="aex-recent-top">
          ${sourceBadge(item.source_type)}
          <span class="aex-recent-meta">${escapeHtml(formatDate(item.created_at))}</span>
        </span>
        <span class="aex-recent-title">${escapeHtml(item.title || 'Untitled study map')}</span>
        <span class="aex-recent-progress">
          ${studyStateChip(stats)}
          ${studyStateTrack(stats, { decorative: true })}
          <span class="aex-card-progress-count ltr-num">${studyStateCount(stats)}</span>
        </span>
        <span class="aex-recent-meta">
          <span>${escapeHtml(item.creator || 'Source')}</span>
          <span class="ltr-num">${Number(item.item_count) || 0} items</span>
        </span>
      </button>
    `;
  }

  function renderLibrary() {
    const grid = document.getElementById('aex-library-grid');
    const empty = document.getElementById('aex-library-empty');
    const total = document.getElementById('aex-library-total');
    if (!grid) return;

    const query = state.librarySearch.trim().toLowerCase();
    const items = state.history.filter((item) => {
      if (!query) return true;
      return [item.title, item.creator, item.summary, item.source_label, item.source_type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });

    if (total) {
      const completedCount = state.history.filter((item) => historyStudyState(item).tone === 'done').length;
      const base = `${state.historyTotal} saved study map${state.historyTotal === 1 ? '' : 's'}`;
      total.textContent =
        completedCount > 0
          ? `${base} · ${completedCount} completed · ${Math.max(0, state.historyTotal - completedCount)} in review`
          : base;
    }
    grid.innerHTML = items.map(renderLibraryCard).join('');
    if (empty) empty.hidden = items.length > 0;
  }

  function renderLibraryCard(item) {
    const armed = state.armedDeleteId === item.id;
    const deleteLabel = `Delete ${item.title || 'study map'}`;
    const stats = historyStudyState(item);
    return `
      <article class="aex-library-card-item" data-state="${stats.tone}" data-aex-library-id="${escapeHtml(item.id)}">
        <div class="aex-recent-top">
          ${sourceBadge(item.source_type)}
          <span class="aex-recent-meta">${escapeHtml(formatDate(item.created_at))}</span>
        </div>
        <h3 class="aex-library-card-title">${escapeHtml(item.title || 'Untitled study map')}</h3>
        <p class="aex-library-card-summary">${escapeHtml(item.summary || item.source_label || '')}</p>
        <div class="aex-card-progress">
          <div class="aex-card-progress-head">
            ${studyStateChip(stats)}
            <span class="aex-card-progress-count ltr-num">${studyStateCount(stats)}</span>
          </div>
          ${studyStateTrack(stats)}
        </div>
        <div class="aex-library-card-meta">
          <span>${escapeHtml(item.creator || 'Source')}</span>
          <span class="ltr-num">${Number(item.item_count) || 0} items</span>
        </div>
        <div class="aex-library-card-actions">
          <button type="button" class="btn-secondary" data-aex-open="${escapeHtml(item.id)}">${
            stats.tone === 'done' ? 'Review' : stats.tone === 'progress' ? 'Continue' : 'Open'
          }</button>
          <button type="button" class="aex-recent-delete${armed ? ' is-armed' : ''}" data-aex-delete="${escapeHtml(
            item.id,
          )}" data-armed="${armed ? '1' : ''}" data-armed-label="${escapeHtml(
            deleteLabel,
          )}" aria-label="${
            armed ? 'Click again to confirm delete' : escapeHtml(deleteLabel)
          }" title="${armed ? 'Click again to confirm delete' : 'Delete study map'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>
          </button>
        </div>
      </article>
    `;
  }

  function sourceBadge(sourceType) {
    const label = SOURCE_TYPE_LABELS[sourceType] || 'Source';
    const modifier =
      sourceType === 'youtube' || sourceType === 'video'
        ? ' is-video'
        : sourceType === 'social_video'
          ? ' is-social'
          : sourceType === 'image'
            ? ' is-image'
            : sourceType === 'audio'
              ? ' is-audio'
              : '';
    return `<span class="aex-source-badge${modifier}">${escapeHtml(label)}</span>`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function formatTime(ms) {
    const seconds = Number(ms) / 1000;
    if (!Number.isFinite(seconds) || seconds <= 0) return '—';
    return `${seconds.toFixed(1)}s`;
  }

  /* ========================================================================
     STUDY STATE (not started · in progress · completed)
     ======================================================================== */

  const STUDY_STATE_LABELS = {
    new: 'Not started',
    progress: 'In progress',
    done: 'Completed',
  };

  function completedIndexSet(note) {
    return new Set(
      Array.isArray(note?.completionProgress?.items)
        ? note.completionProgress.items.map(Number)
        : [],
    );
  }

  /** One status vocabulary for both the study map and its library card. */
  function studyState({ total, done, isCompleted }) {
    const safeTotal = Math.max(0, Number(total) || 0);
    const safeDone = Math.max(0, Math.min(safeTotal, Number(done) || 0));
    const tone =
      isCompleted || (safeTotal > 0 && safeDone >= safeTotal)
        ? 'done'
        : safeDone > 0
          ? 'progress'
          : 'new';
    return {
      total: safeTotal,
      done: safeDone,
      tone,
      label: STUDY_STATE_LABELS[tone],
      pct: safeTotal > 0 ? Math.round((safeDone / safeTotal) * 100) : 0,
    };
  }

  function noteStudyState(note) {
    return studyState({
      total: Array.isArray(note?.items) ? note.items.length : 0,
      done: completedIndexSet(note).size,
      isCompleted: Boolean(note?.isCompleted),
    });
  }

  function historyStudyState(item) {
    return studyState({
      total: Number(item?.item_count) || 0,
      done: Number(item?.completed_count) || 0,
      isCompleted: Number(item?.is_completed) === 1,
    });
  }

  /** Keeps the shelf + library cards honest without a round trip. */
  function syncHistoryStudyState(note) {
    const entry = state.history.find((row) => row.id === note?.id);
    if (!entry) return;
    const stats = noteStudyState(note);
    entry.completed_count = stats.done;
    entry.is_completed = note.isCompleted ? 1 : 0;
    renderRecent();
    renderLibrary();
  }

  function studyStateChip(stats) {
    return `<span class="sp-state sp-state--${stats.tone}">${escapeHtml(stats.label)}</span>`;
  }

  function studyStateTrack(stats, options = {}) {
    const label = `${stats.done} of ${stats.total} studied`;
    return `
      <span class="aex-card-track"${options.decorative ? ' aria-hidden="true"' : ` role="progressbar" aria-valuemin="0" aria-valuemax="${stats.total}" aria-valuenow="${stats.done}" aria-label="${escapeHtml(label)}"`}>
        <span class="aex-card-track-fill" style="width:${stats.pct}%"></span>
      </span>
    `;
  }

  function studyStateCount(stats) {
    if (stats.total === 0) return 'No items';
    return `${stats.done} / ${stats.total}`;
  }

  /* ========================================================================
     OPEN & RENDER STUDY MAP
     ======================================================================== */

  async function openNote(id, options = {}) {
    if (!id || !currentUser()) {
      if (!currentUser()) requireNoteAuth();
      return;
    }
    if (state.loadingNoteId === id) return;
    state.loadingNoteId = id;
    try {
      const data = await apiFetch(`/api/american-extractor/notes/${encodeURIComponent(id)}`, {
        method: 'GET',
      });
      if (!data?.data) throw new Error('That study map could not be opened.');
      state.currentNote = data.data;
      state.noteFilter = 'all';
      state.noteScope = 'all';
      state.noteSearch = '';
      state.noteLanguage = data.data.targetLanguage || preferredLanguage();
      renderNote(data.data);
      healCompletionState(data.data);
      switchView('note', { skipRoute: Boolean(options.skipRoute) });
    } catch (error) {
      if (error?.status === 404) {
        showToast('That study map was deleted.');
        state.history = state.history.filter((item) => item.id !== id);
        renderRecent();
        renderLibrary();
        switchView('library');
      } else if (error?.status === 401) {
        requireNoteAuth();
      } else if (!options.silent) {
        showToast(error?.message || 'Could not open that study map.');
      }
    } finally {
      state.loadingNoteId = '';
    }
  }

  /**
   * A map whose items are all studied is already complete in the UI; persist
   * that so the header button, the library card, and other devices agree.
   */
  async function healCompletionState(note) {
    if (!note || note.isCompleted) return;
    const stats = noteStudyState(note);
    if (stats.total === 0 || stats.done < stats.total) return;
    try {
      const data = await apiFetch(`/api/american-extractor/notes/${encodeURIComponent(note.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: true }),
      });
      note.isCompleted = Boolean(data.isCompleted);
      renderNoteProgress(note);
    } catch {
      // The chip still reflects the item counts even if the flag cannot persist.
    }
  }

  function renderNote(note) {
    if (!note) return;

    teardownBindings();
    setSourcePanelOpen(false);
    setSourceInfoOpen(false);

    setText('aex-note-title', note.title || 'American English study map');
    setText('aex-note-creator', note.creator || SOURCE_TYPE_LABELS[note.sourceType] || 'Source');
    const sourceTypeLabel = SOURCE_TYPE_LABELS[note.sourceType] || 'Source';
    const sourceLabel = String(note.sourceLabel || '').trim();
    setText(
      'aex-note-source-label',
      sourceLabel && !sourceLabel.toLowerCase().startsWith(sourceTypeLabel.toLowerCase())
        ? `${sourceTypeLabel} · ${sourceLabel}`
        : sourceLabel || sourceTypeLabel,
    );
    setText(
      'aex-note-model',
      note.modelUsed ? `${note.agentUsed || 'AI'} · ${note.modelUsed}` : 'AI extraction',
    );
    setText('aex-note-time', `Extracted in ${formatTime(note.executionTimeMs)}`);
    setText('aex-note-count', `${note.itemCount || note.items?.length || 0} items`);

    const summaryWrap = document.getElementById('aex-note-summary-wrap');
    if (summaryWrap) summaryWrap.hidden = !note.summary;
    setText('aex-note-summary', note.summary || '');
    const styleEl = document.getElementById('aex-note-style');
    if (styleEl) {
      styleEl.textContent = note.speakerStyle || '';
      styleEl.hidden = !note.speakerStyle;
    }

    const openSourceBtn = document.getElementById('aex-open-source-btn');
    if (openSourceBtn) {
      openSourceBtn.hidden = !/^https?:\/\//i.test(note.sourceUrl || '');
    }

    const studioBtn = document.getElementById('aex-studio-btn');
    if (studioBtn) {
      const lessonId = String(note.sourceMeta?.lessonId || '').trim();
      const isYouTube = /youtube\.com|youtu\.be/i.test(note.sourceUrl || '');
      studioBtn.hidden = !(lessonId || isYouTube);
      studioBtn.dataset.aexStudio = lessonId
        ? `/studio?id=${encodeURIComponent(lessonId)}`
        : `/studio?url=${encodeURIComponent(note.sourceUrl)}`;
    }

    populateLanguageSelects();
    const noteLangSelect = document.getElementById('aex-note-lang-select');
    if (noteLangSelect) noteLangSelect.value = note.targetLanguage || state.noteLanguage;

    renderCategoryFilters(note);
    renderItems(note, { animate: true });
    renderSourceReader(note);
    renderSourceMeta(note);
    renderNoteProgress(note);
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value == null ? '' : String(value);
  }

  function renderCategoryFilters(note) {
    const wrap = document.getElementById('aex-category-filters');
    if (!wrap) return;
    const counts = new Map();
    for (const item of note.items || []) {
      counts.set(item.category, (counts.get(item.category) || 0) + 1);
    }
    const categories = [
      { id: 'all', label: 'All', count: note.items?.length || 0 },
      ...Array.from(counts.entries()).map(([id, count]) => ({
        id,
        label: CATEGORY_LABELS[id] || id,
        count,
      })),
    ];
    wrap.innerHTML = categories
      .map(
        (category) => `
        <button type="button" class="filter-pill${state.noteFilter === category.id ? ' active' : ''}" data-aex-filter="${escapeHtml(
          category.id,
        )}" aria-selected="${state.noteFilter === category.id ? 'true' : 'false'}">
          ${category.id === 'all' ? '' : '<span class="aex-filter-dot" aria-hidden="true"></span>'}
          ${escapeHtml(category.label)}
          <span class="aex-filter-count">${category.count}</span>
        </button>`,
      )
      .join('');
  }

  function renderItems(note, options = {}) {
    const list = document.getElementById('aex-items-list');
    const empty = document.getElementById('aex-empty-filter');
    if (!list) return;

    list.classList.toggle('is-entering', Boolean(options.animate));
    if (options.animate) {
      clearTimeout(state.listAnimTimer);
      state.listAnimTimer = setTimeout(() => list.classList.remove('is-entering'), 700);
    }

    const completedSet = new Set(
      Array.isArray(note.completionProgress?.items) ? note.completionProgress.items.map(Number) : [],
    );
    const query = state.noteSearch.trim().toLowerCase();
    const items = (note.items || []).filter((item) => {
      if (state.noteScope === 'unstudied' && completedSet.has(Number(item.index))) return false;
      if (state.noteFilter !== 'all' && item.category !== state.noteFilter) return false;
      if (!query) return true;
      return [item.term, item.meaning, item.localizedMeaning, item.contextSentence, item.usageNote, item.example]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });

    list.innerHTML = items
      .map((item, position) => renderItemCard(note, item, position, completedSet))
      .join('');

    if (empty) {
      empty.hidden = items.length > 0;
      if (items.length === 0) {
        const allStudied = state.noteScope === 'unstudied' && !query && (note.items || []).length > 0;
        const title = document.getElementById('aex-empty-title');
        const copy = document.getElementById('aex-empty-copy');
        if (title) title.textContent = allStudied ? 'Everything here is studied' : 'No items match this filter';
        if (copy) {
          copy.textContent = allStudied
            ? 'Turn off “Hide studied” to revisit the items you already marked.'
            : 'Try another category, clear the search, or turn off “Hide studied”.';
        }
      }
    }

    bindItemsSelection(note);
    syncMultilineTermScribbles();
  }

  function syncMultilineTermScribbles() {
    // Styled natively via CSS without SVG path overlays.
  }

  function renderItemCard(note, item, position, completedSet) {
    const completed = (completedSet || new Set()).has(Number(item.index));
    const saved = isTermSaved(item.term);
    const language = languageByCode(note.targetLanguage);
    const isEnglishTarget = (note.targetLanguage || 'en') === 'en';
    const rtl = Boolean(language?.rtl);
    const category = String(item.category || 'vocabulary');
    const categoryLabel = CATEGORY_LABELS[item.category] || item.category || 'Item';
    const registerValue = String(item.register || '').trim();
    const showRegister =
      registerValue &&
      registerValue.toLowerCase() !== 'neutral' &&
      registerValue.toLowerCase() !== 'spoken' &&
      registerValue.toLowerCase() !== categoryLabel.toLowerCase();

    const notes = [
      item.usageNote ? ['Usage', item.usageNote] : null,
      item.spokenNote ? ['Spoken tip', item.spokenNote] : null,
      item.techNote ? ['In US tech', item.techNote] : null,
    ].filter(Boolean);

    const contextHtml = highlightTerm(item.contextSentence || '', item.term);
    const decoratedContext = global.FlaptapWordLookup
      ? global.FlaptapWordLookup.tokenizeClickableWords(contextHtml, {
          contextSentence: item.contextSentence || '',
        })
      : contextHtml;

    const general =
      item.generalMeaning && item.generalMeaning !== item.meaning ? item.generalMeaning : '';

    const checkButton = `<button type="button" class="item-check-btn aex-check-btn${
      completed ? ' is-checked' : ''
    }" data-aex-check="${escapeHtml(item.index)}" aria-pressed="${
      completed ? 'true' : 'false'
    }" aria-label="${completed ? 'Completed' : 'Mark item complete'}" title="${
      completed ? 'Completed' : 'Mark item complete'
    }"><svg class="aex-check-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg></button>`;

    const showTranslation = !isEnglishTarget && Boolean(item.localizedMeaning);
    const markerVariant = Math.abs(Number(item.index) || 0) % 6;

    return `
      <article class="aex-item${completed ? ' is-completed' : ''}" data-aex-index="${escapeHtml(
        item.index,
      )}" data-category="${escapeHtml(category)}" data-marker="${markerVariant}" data-context="${escapeHtml(
        item.contextSentence || '',
      )}" style="--aex-order:${Math.min(Number(position) || 0, 12)}">
        <div class="aex-item-head">
          <span class="aex-item-index ltr-num" aria-hidden="true">${Number(item.index) + 1}</span>
          <div class="aex-item-heading">
            <div class="aex-item-term-line">
              <h3 class="aex-item-term"><span class="aex-term-mark"><span class="aex-term-text">${escapeHtml(
                item.term,
              )}</span></span></h3>
              ${item.ipa ? `<span class="aex-item-ipa" dir="ltr">${escapeHtml(item.ipa)}</span>` : ''}
            </div>
            <div class="aex-item-meta">
              <span class="aex-item-chip"><span class="aex-chip-dot" aria-hidden="true"></span>${escapeHtml(
                categoryLabel,
              )}</span>
              ${
                showRegister
                  ? `<span class="aex-item-register">${escapeHtml(registerValue)}</span>`
                  : ''
              }
            </div>
          </div>
          <div class="aex-item-actions">
            <div class="aex-action-utils">
              <button type="button" class="icon-action icon-action--sm aex-util-btn" data-aex-speak="${escapeHtml(
                item.term,
              )}" aria-label="Pronounce ${escapeHtml(item.term)}" title="Pronounce">
                ${icon('volume-2')}
              </button>
              <button type="button" class="icon-action icon-action--sm aex-util-btn${
                saved ? ' is-saved' : ''
              }" data-aex-save-index="${escapeHtml(item.index)}" aria-label="${
                saved ? 'Saved in Vocabulary' : 'Save to Vocabulary'
              }" title="${saved ? 'Saved in Vocabulary' : 'Save to Vocabulary'}">
                ${icon(saved ? 'bookmark-check' : 'bookmark-plus')}
              </button>
            </div>
            <span class="aex-action-divider" aria-hidden="true"></span>
            ${checkButton}
          </div>
        </div>
        <div class="aex-item-body">
          <div class="aex-sense-grid${showTranslation ? ' has-translation' : ''}">
            <div class="aex-sense">
              <span class="aex-sense-label">Meaning</span>
              <p class="aex-meaning">${escapeHtml(item.meaning)}</p>
              ${
                general
                  ? `<p class="aex-general-sense"><span class="aex-inline-label">Broadly</span>${escapeHtml(
                      general,
                    )}</p>`
                  : ''
              }
            </div>
            ${
              showTranslation
                ? `<div class="aex-translation" dir="${rtl ? 'rtl' : 'ltr'}" lang="${escapeHtml(
                    note.targetLanguage || 'en',
                  )}">
                    <span class="aex-sense-label">${escapeHtml(
                      language ? language.name : 'Translation',
                    )}</span>
                    <p class="aex-localized" dir="${rtl ? 'rtl' : 'ltr'}" lang="${escapeHtml(
                      note.targetLanguage || 'en',
                    )}">${escapeHtml(item.localizedMeaning)}</p>
                  </div>`
                : ''
            }
          </div>
          ${
            item.contextSentence || item.example
              ? `<div class="aex-context-band${
                  item.contextSentence && item.example ? ' has-both' : ''
                }">
                  ${
                    item.contextSentence
                      ? `<div class="aex-context-block">
                          <span class="aex-sense-label">In context</span>
                          <blockquote class="aex-context-quote">${decoratedContext}</blockquote>
                        </div>`
                      : ''
                  }
                  ${
                    item.example
                      ? `<div class="aex-example-block">
                          <span class="aex-sense-label">Example</span>
                          <p class="aex-example">“${escapeHtml(item.example)}”</p>
                        </div>`
                      : ''
                  }
                </div>`
              : ''
          }
          ${
            notes.length
              ? `<div class="aex-study-footer">
                  <div class="aex-item-notes" data-cols="${Math.min(notes.length, 3)}">${notes
                    .map(
                      ([label, copy]) =>
                        `<div class="aex-note-block"><span class="aex-note-label">${escapeHtml(
                          label,
                        )}</span><p class="aex-note-copy">${escapeHtml(copy)}</p></div>`,
                    )
                    .join('')}</div>
                </div>`
              : ''
          }
        </div>
      </article>
    `;
  }

  function highlightTerm(sentence, term) {
    const text = String(sentence || '');
    if (!text) return '';
    const cleanTerm = String(term || '').trim();
    if (!cleanTerm) return escapeHtml(text);

    const escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]");
    let regex;
    try {
      regex = new RegExp(
        `(?<![\\p{L}\\p{N}_])(${escaped}(?:['’]?s|es|ed|d|ing|er|ers)?)(?![\\p{L}\\p{N}_])`,
        'giu',
      );
    } catch {
      return escapeHtml(text);
    }

    const matches = Array.from(text.matchAll(regex));
    if (matches.length === 0) return escapeHtml(text);

    let output = '';
    let lastIndex = 0;
    for (const match of matches) {
      const index = match.index ?? 0;
      output += escapeHtml(text.slice(lastIndex, index));
      output += `<mark class="lexicon-highlight">${escapeHtml(match[1])}</mark>`;
      lastIndex = index + match[0].length;
    }
    output += escapeHtml(text.slice(lastIndex));
    return output;
  }

  function renderSourceReader(note) {
    const container = document.getElementById('aex-source-content');
    if (!container) return;
    const text = String(note.sourceText || '').trim();
    const html = global.FlaptapWordLookup
      ? global.FlaptapWordLookup.tokenizeClickableWords(escapeHtml(text), {})
      : escapeHtml(text);
    container.innerHTML = html;

    const teardown = global.FlaptapWordLookup?.bindSelectionLookup?.(container, {
      maxLength: 320,
      onSelect: (selectedText, meta) => {
        const context = sentenceAroundRange(meta.range, container) || selectedText;
        openLookup(selectedText, context, null);
      },
    });
    if (teardown) state.teardowns.push(teardown);
  }

  function setSourcePanelOpen(open) {
    const panel = document.getElementById('aex-source-panel');
    const toggle = document.getElementById('aex-source-toggle');
    if (!panel) return;
    panel.hidden = !open;
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function setSourceInfoOpen(open) {
    const popover = document.getElementById('aex-source-meta');
    const toggle = document.getElementById('aex-info-toggle');
    if (!popover) return;
    popover.hidden = !open;
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function renderSourceMeta(note) {
    const container = document.getElementById('aex-source-meta');
    if (!container) return;
    const language = languageByCode(note.targetLanguage);
    const meta = note.sourceMeta || {};
    const opts = meta.extractionOptions || {};
    const rows = [
      ['Source type', SOURCE_TYPE_LABELS[note.sourceType] || note.sourceType],
      ['Pipeline', note.sourceLabel || '—'],
      ['Meaning language', language ? `${language.name} (${language.native})` : note.targetLanguage],
      ['Extract type', opts.extractionTypeLabel || ''],
      ['English style', opts.styleLabel || ''],
      ['Target level', opts.levelLabel || ''],
      ['Learning focus', opts.focusLabel || ''],
      ['Depth', opts.depthLabel || ''],
      ['Study goal', opts.studyGoalLabel || ''],
      ['Order', opts.orderLabel || ''],
      ['Source words', meta.wordCount ? String(meta.wordCount) : '—'],
      ['Duration', meta.durationSeconds ? formatDuration(meta.durationSeconds) : ''],
      ['Platform', meta.platform || ''],
      ['Engine', meta.engine || meta.ocrModel || ''],
      ['Model', note.modelUsed || ''],
    ].filter(([, value]) => Boolean(value));

    const warnings = Array.isArray(meta.warnings) ? meta.warnings.filter(Boolean) : [];
    const warningHtml = warnings.length
      ? `<div class="aex-source-warning">${warnings
          .map((warning) => `<p>${escapeHtml(warning)}</p>`)
          .join('')}</div>`
      : '';

    container.innerHTML = `
      ${rows
        .map(
          ([key, value]) => `
        <div class="aex-source-meta-row">
          <span class="aex-source-meta-key">${escapeHtml(key)}</span>
          <span class="aex-source-meta-value">${escapeHtml(value)}</span>
        </div>`,
        )
        .join('')}
      ${warningHtml}
    `;
  }

  function formatDuration(seconds) {
    const total = Math.round(Number(seconds) || 0);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
  }

  function renderNoteProgress(note) {
    const stats = noteStudyState(note);
    const total = stats.total;
    const completed = stats.done;

    const bar = document.getElementById('aex-note-progress');
    if (bar) {
      bar.hidden = total === 0;
      if (ws()?.renderSubjectProgressBar) {
        ws().renderSubjectProgressBar(bar, {
          total,
          completed,
          state: { label: stats.label, tone: stats.tone },
        });
      } else {
        bar.textContent = `${completed} / ${total} studied`;
      }
    }

    const btn = document.getElementById('aex-complete-note-btn');
    if (btn) {
      btn.classList.toggle('is-checked', Boolean(note.isCompleted));
      btn.setAttribute('aria-pressed', note.isCompleted ? 'true' : 'false');
      const label = btn.querySelector('span');
      if (label) label.textContent = note.isCompleted ? 'Completed' : 'Mark Complete';
    }

    const remaining = Math.max(0, total - completed);
    const scopeBtn = document.getElementById('aex-note-scope');
    if (scopeBtn) {
      const scopeActive = state.noteScope === 'unstudied';
      scopeBtn.hidden = total === 0;
      scopeBtn.classList.toggle('is-active', scopeActive);
      scopeBtn.setAttribute('aria-pressed', scopeActive ? 'true' : 'false');
    }
    setText('aex-study-count', String(remaining));

    syncHistoryStudyState(note);
  }

  function toggleNoteScope() {
    state.noteScope = state.noteScope === 'unstudied' ? 'all' : 'unstudied';
    if (state.currentNote) {
      renderNoteProgress(state.currentNote);
      renderItems(state.currentNote);
    }
  }

  function teardownBindings() {
    for (const teardown of state.teardowns) {
      try {
        teardown();
      } catch {}
    }
    state.teardowns = [];
    if (typeof state.itemsTeardown === 'function') {
      try {
        state.itemsTeardown();
      } catch {}
      state.itemsTeardown = null;
    }
  }

  /* ========================================================================
     CONTEXTUAL LOOKUP & SAVING
     ======================================================================== */

  function bindItemsSelection(note) {
    const list = document.getElementById('aex-items-list');
    if (!list || !global.FlaptapWordLookup?.bindSelectionLookup) return;
    if (typeof state.itemsTeardown === 'function') {
      try {
        state.itemsTeardown();
      } catch {}
      state.itemsTeardown = null;
    }
    const teardown = global.FlaptapWordLookup.bindSelectionLookup(list, {
      maxLength: 320,
      onSelect: (text, meta) => {
        const itemEl = meta.range.commonAncestorContainer?.parentElement?.closest?.('.aex-item');
        const context = itemEl?.dataset?.context || text;
        openLookup(text, context, null);
      },
    });
    state.itemsTeardown = typeof teardown === 'function' ? teardown : null;
  }

  function sentenceAroundRange(range, container) {
    try {
      const full = container.textContent || '';
      if (!full) return '';
      const before = document.createRange();
      before.selectNodeContents(container);
      before.setEnd(range.startContainer, range.startOffset);
      const start = before.toString().length;
      const end = start + String(range.toString() || '').length;

      let left = start;
      while (left > 0 && !/[.!?\n]/.test(full[left - 1])) left--;
      let right = end;
      while (right < full.length && !/[.!?\n]/.test(full[right])) right++;
      if (right < full.length) right++;

      const sentence = full.slice(left, right).replace(/\s+/g, ' ').trim();
      return sentence.slice(0, 500);
    } catch {
      return '';
    }
  }

  async function openLookup(word, contextSentence, sourceEl) {
    if (!word || !global.FlaptapWordLookup) return;
    const note = state.currentNote;
    const language = document.getElementById('aex-note-lang-select')?.value || preferredLanguage();
    rememberLanguage(language);

    await global.FlaptapWordLookup.open({
      word,
      sourceEl: sourceEl || undefined,
      contextSentence: contextSentence || word,
      endpoint: '/api/american-extractor/define-word',
      payload: {
        noteId: note?.id,
        word,
        contextSentence: contextSentence || undefined,
        title: note?.title,
        language,
      },
      fetcher: apiFetch,
      canPlay: false,
      canSpeak: true,
      canSave: true,
      isSaved: (term) => isTermSaved(term),
      onSave: async (lookup) => {
        if (!currentUser()) {
          requireAuth({ tab: 'link' });
          return;
        }
        try {
          await apiFetch('/api/vocabulary', {
            method: 'POST',
            body: JSON.stringify({
              term: lookup.term,
              ipa: lookup.ipa,
              partOfSpeech: lookup.partOfSpeech,
              definition: lookup.definition,
              generalTranslation: lookup.generalTranslation || '',
              translation: lookup.translation || '',
              contextSentence: lookup.contextSentence,
              lessonTitle: note?.title || 'American English Extractor',
            }),
          });
          rememberSaved(lookup.term);
          await ws()?.refreshVocabulary?.();
          updateSaveButtons();
          global.FlaptapWordLookup.syncSavedButtonDom();
          showToast(`Saved “${lookup.term}” to Vocabulary`);
        } catch (error) {
          showToast(error?.message || 'Could not save that word.');
        }
      },
    });
  }

  function normalizeTerm(term) {
    return String(term || '')
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  const LEMMA_STOPWORDS = new Set([
    'a', 'an', 'the', 'to', 'one', "one's", 'somebody', "somebody's", 'someone', "someone's",
    'your', 'our', 'their', 'my', 'his', 'her', 'its', 'it', 'this', 'that', 'these', 'those',
  ]);

  /**
   * Loose lemma signature used only to reflect "already saved" state. Exact
   * matches always win; this catches "chasing our tail" vs "chase one's tail".
   */
  function termSignature(term) {
    return String(term || '')
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/[^\p{L}\p{N}'\s-]+/gu, ' ')
      .split(/\s+/)
      .map((token) => token.replace(/^['-]+|['-]+$/g, ''))
      .filter((token) => token && !LEMMA_STOPWORDS.has(token))
      .map((token) => {
        let stem = token.replace(/['’]s$/, '');
        if (stem.length > 4 && /ies$/.test(stem)) stem = `${stem.slice(0, -3)}y`;
        else if (stem.length > 4 && /ing$/.test(stem)) stem = stem.slice(0, -3);
        else if (stem.length > 4 && /ed$/.test(stem)) stem = stem.slice(0, -2);
        else if (stem.length > 4 && /es$/.test(stem)) stem = stem.slice(0, -2);
        else if (stem.length > 3 && /s$/.test(stem)) stem = stem.slice(0, -1);
        if (stem.length > 3 && /e$/.test(stem)) stem = stem.slice(0, -1);
        return stem;
      })
      .filter(Boolean)
      .join(' ');
  }

  function isTermSaved(term) {
    const key = normalizeTerm(term);
    if (!key) return false;
    if (state.savedTerms.has(key)) return true;

    const signature = termSignature(term);
    if (signature && state.savedTerms.has(`sig:${signature}`)) return true;

    if (ws()?.isVocabularySaved?.(term)) return true;

    const vocabulary = global.flaptapState?.vocabItems;
    if (Array.isArray(vocabulary) && signature) {
      return vocabulary.some((entry) => termSignature(entry?.term) === signature);
    }
    return false;
  }

  function rememberSaved(term) {
    const key = normalizeTerm(term);
    if (key) state.savedTerms.add(key);
    const signature = termSignature(term);
    if (signature) state.savedTerms.add(`sig:${signature}`);
  }

  function updateSaveButtons() {
    document.querySelectorAll('[data-aex-save-index]').forEach((button) => {
      const index = Number(button.dataset.aexSaveIndex);
      const item = state.currentNote?.items?.find((entry) => Number(entry.index) === index);
      if (!item) return;
      const saved = isTermSaved(item.term);
      button.classList.toggle('is-saved', saved);
      button.innerHTML = icon(saved ? 'bookmark-check' : 'bookmark-plus');
      const label = saved ? 'Saved in Vocabulary' : 'Save to Vocabulary';
      button.setAttribute('aria-label', label);
      button.title = label;
    });
    if (global.FlaptapWordLookup?.syncSavedButtonDom) {
      global.FlaptapWordLookup.syncSavedButtonDom();
    }
  }

  async function saveItem(index) {
    const note = state.currentNote;
    const item = note?.items?.find((entry) => Number(entry.index) === Number(index));
    if (!item) return;
    if (!currentUser()) {
      requireAuth({ tab: 'link' });
      return;
    }
    if (isTermSaved(item.term)) {
      showToast('That item is already in your Vocabulary.');
      return;
    }
    try {
      await apiFetch('/api/vocabulary', {
        method: 'POST',
        body: JSON.stringify({
          term: item.term,
          ipa: item.ipa,
          partOfSpeech: CATEGORY_LABELS[item.category] || '',
          definition: item.meaning,
          generalTranslation: item.generalMeaning || '',
          translation: item.localizedMeaning || '',
          contextSentence: item.contextSentence || '',
          lessonTitle: note.title || 'American English Extractor',
        }),
      });
      rememberSaved(item.term);
      await ws()?.refreshVocabulary?.();
      updateSaveButtons();
      showToast(`Saved “${item.term}” to Vocabulary`);
    } catch (error) {
      showToast(error?.message || 'Could not save that item.');
    }
  }

  async function saveAllItems() {
    const note = state.currentNote;
    if (!note) return;
    if (!currentUser()) {
      requireAuth({ tab: 'link' });
      return;
    }
    const pending = (note.items || []).filter((item) => !isTermSaved(item.term));
    if (pending.length === 0) {
      showToast('Every item in this study map is already saved.');
      return;
    }

    const button = document.getElementById('aex-save-all-btn');
    const original = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.textContent = `Saving ${pending.length}…`;
    }
    let saved = 0;
    for (const item of pending) {
      try {
        await apiFetch('/api/vocabulary', {
          method: 'POST',
          body: JSON.stringify({
            term: item.term,
            ipa: item.ipa,
            partOfSpeech: CATEGORY_LABELS[item.category] || '',
            definition: item.meaning,
            generalTranslation: item.generalMeaning || '',
            translation: item.localizedMeaning || '',
            contextSentence: item.contextSentence || '',
            lessonTitle: note.title || 'American English Extractor',
          }),
        });
        rememberSaved(item.term);
        saved++;
      } catch {}
    }
    if (button) {
      button.disabled = false;
      button.innerHTML = original;
    }
    await ws()?.refreshVocabulary?.();
    updateSaveButtons();
    showToast(`Saved ${saved} of ${pending.length} items to Vocabulary`);
  }

  async function toggleItemCompletion(index, sourceButton) {
    const note = state.currentNote;
    if (!note) return;
    const item = note.items?.find((entry) => Number(entry.index) === Number(index));
    if (!item) return;
    const current = new Set(
      Array.isArray(note.completionProgress?.items) ? note.completionProgress.items.map(Number) : [],
    );
    const total = Array.isArray(note.items) ? note.items.length : 0;
    const wasAllDone = total > 0 && current.size >= total;
    const next = !current.has(Number(index));
    try {
      const data = await apiFetch(
        `/api/american-extractor/notes/${encodeURIComponent(note.id)}/items/${Number(index)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ completed: next }),
        },
      );
      note.completionProgress = data.completionProgress || note.completionProgress;
      const nowAllDone = total > 0 && completedIndexSet(note).size >= total;
      if (!note.isCompleted && nowAllDone) {
        note.isCompleted = await setNoteCompletedFlag(true);
        showToast('Every item is studied — study map marked complete');
      } else if (note.isCompleted && wasAllDone && !nowAllDone) {
        note.isCompleted = await setNoteCompletedFlag(false);
      }
      if (state.noteScope === 'unstudied') {
        const visibleCards = Array.from(document.querySelectorAll('#aex-items-list .aex-item'));
        const position = visibleCards.indexOf(sourceButton?.closest('.aex-item'));
        renderCategoryFilters(note);
        renderItems(note);
        const nextChecks = document.querySelectorAll('#aex-items-list .aex-item .item-check-btn');
        if (nextChecks.length > 0) {
          const target = nextChecks[Math.min(Math.max(position, 0), nextChecks.length - 1)];
          target.focus({ preventScroll: true });
        }
      } else {
        const card = sourceButton?.closest('.aex-item');
        if (card) {
          card.classList.toggle('is-completed', next);
          syncMultilineTermScribbles();
        }
        if (sourceButton && ws()?.setCheckButtonState) {
          ws().setCheckButtonState(sourceButton, next);
        } else if (sourceButton) {
          sourceButton.classList.toggle('is-checked', next);
          sourceButton.setAttribute('aria-pressed', next ? 'true' : 'false');
        }
      }
      renderNoteProgress(note);
    } catch (error) {
      showToast(error?.message || 'Could not update that item.');
    }
  }

  async function setNoteCompletedFlag(completed) {
    const note = state.currentNote;
    if (!note) return false;
    const data = await apiFetch(`/api/american-extractor/notes/${encodeURIComponent(note.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed }),
    });
    return Boolean(data.isCompleted);
  }

  async function toggleNoteCompletion() {
    const note = state.currentNote;
    if (!note) return;
    const next = !note.isCompleted;
    try {
      note.isCompleted = await setNoteCompletedFlag(next);
      renderNoteProgress(note);
      showToast(note.isCompleted ? 'Study map marked complete' : 'Study map reopened');
      await loadHistory();
    } catch (error) {
      showToast(error?.message || 'Could not update the study map.');
    }
  }

  function resetDeleteButton(button) {
    if (!button) return;
    button.dataset.armed = '';
    button.classList.remove('is-armed');
    const label = button.dataset.armedLabel || 'Delete study map';
    button.setAttribute('aria-label', label);
    button.title = 'Delete study map';
  }

  async function deleteNote(id, button) {
    const armed = button.dataset.armed === '1' && state.armedDeleteId === id;
    if (!armed) {
      document.querySelectorAll('[data-aex-delete][data-armed="1"]').forEach((el) => {
        if (el !== button) resetDeleteButton(el);
      });
      state.armedDeleteId = id;
      button.dataset.armed = '1';
      button.dataset.armedLabel = button.getAttribute('aria-label') || 'Delete study map';
      button.classList.add('is-armed');
      button.setAttribute('aria-label', 'Click again to confirm delete');
      button.title = 'Click again to confirm delete';
      showToast('Click delete again to confirm.');
      setTimeout(() => {
        if (state.armedDeleteId !== id) return;
        state.armedDeleteId = '';
        document.querySelectorAll('[data-aex-delete][data-armed="1"]').forEach(resetDeleteButton);
      }, 3500);
      return;
    }
    state.armedDeleteId = '';
    try {
      await apiFetch(`/api/american-extractor/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      state.history = state.history.filter((item) => item.id !== id);
      state.historyTotal = Math.max(0, state.historyTotal - 1);
      if (state.currentNote?.id === id) {
        state.currentNote = null;
      }
      renderRecent();
      renderLibrary();
      setText('aex-library-count', String(state.historyTotal));
      setText('aex-recent-total', String(state.historyTotal));
      showToast('Study map deleted.');
    } catch (error) {
      resetDeleteButton(button);
      showToast(error?.message || 'Could not delete that study map.');
    }
  }

  async function copyStudyNotes() {
    const note = state.currentNote;
    if (!note) return;
    const language = languageByCode(note.targetLanguage);
    const lines = [
      `# ${note.title}`,
      '',
      `Source: ${note.sourceLabel || SOURCE_TYPE_LABELS[note.sourceType] || ''}`,
      note.sourceUrl ? `URL: ${note.sourceUrl}` : '',
      note.creator ? `Creator: ${note.creator}` : '',
      `Meaning language: ${language?.name || note.targetLanguage}`,
      '',
      note.summary ? `## Summary\n${note.summary}` : '',
      '',
      '## American English items',
      '',
    ].filter(Boolean);

    for (const item of note.items || []) {
      lines.push(
        `### ${Number(item.index) + 1}. ${item.term}${item.ipa ? ` ${item.ipa}` : ''}`,
        `- Category: ${CATEGORY_LABELS[item.category] || item.category}${
          item.register && item.register !== 'neutral' ? ` (${item.register})` : ''
        }`,
        `- Meaning: ${item.meaning}`,
      );
      if (item.localizedMeaning && item.localizedMeaning !== item.meaning) {
        lines.push(`- Translation: ${item.localizedMeaning}`);
      }
      if (item.contextSentence) lines.push(`- Context: "${item.contextSentence}"`);
      if (item.usageNote) lines.push(`- Usage: ${item.usageNote}`);
      if (item.spokenNote) lines.push(`- Spoken tip: ${item.spokenNote}`);
      if (item.example) lines.push(`- Example: ${item.example}`);
      lines.push('');
    }

    const content = lines.join('\n');
    try {
      await navigator.clipboard.writeText(content);
      showToast('Study notes copied to clipboard');
    } catch {
      const area = document.createElement('textarea');
      area.value = content;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      showToast('Study notes copied to clipboard');
    }
  }

  /* ========================================================================
     EVENTS
     ======================================================================== */

  function bindEvents() {
    if (state.eventsBound) return;
    state.eventsBound = true;

    const section = document.getElementById('section-american-extractor');
    if (section) {
      section.addEventListener('click', handleSectionClick);
    }

    document.querySelectorAll('[data-aex-source]').forEach((button) => {
      button.addEventListener('click', () => setSourceTab(button.dataset.aexSource));
    });

    document.querySelectorAll('[data-aex-view]').forEach((button) => {
      button.addEventListener('click', () => switchView(button.dataset.aexView));
    });

    document.getElementById('aex-language-select')?.addEventListener('change', (event) => {
      rememberLanguage(event.target.value);
      syncAiSummary();
    });

    for (const spec of OPTION_SPECS) {
      document.getElementById(spec.selectId)?.addEventListener('change', () => {
        saveOptions();
        syncOptionIndicators();
        syncAiSummary();
      });
    }

    document.getElementById('aex-reset-options-btn')?.addEventListener('click', resetOptionsToDefault);

    document.getElementById('aex-options-toggle')?.addEventListener('click', () => {
      const btn = document.getElementById('aex-options-toggle');
      const drawer = document.getElementById('aex-advanced-options');
      if (!btn || !drawer) return;
      const isOpen = drawer.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    document.getElementById('aex-note-lang-select')?.addEventListener('change', (event) => {
      rememberLanguage(event.target.value);
    });

    document.getElementById('aex-text-input')?.addEventListener('input', updateTextWordCount);

    document.getElementById('aex-paste-btn')?.addEventListener('click', async () => {
      const input = document.getElementById('aex-url-input');
      try {
        const text = await navigator.clipboard.readText();
        if (input && text) {
          input.value = text.trim();
          input.focus();
        }
      } catch {
        input?.focus();
        showToast('Press Cmd+V (or Ctrl+V) to paste the link.');
      }
    });

    document.getElementById('aex-refresh-lessons-btn')?.addEventListener('click', async () => {
      await loadLessonSources();
      showToast(state.lessonSourcesLoaded ? 'Saved lesson transcripts refreshed.' : 'No saved transcripts found.');
    });

    const fileInput = document.getElementById('aex-file-input');
    fileInput?.addEventListener('change', () => setSelectedFile(fileInput.files?.[0] || null));
    document.getElementById('aex-file-clear')?.addEventListener('click', (event) => {
      event.preventDefault();
      setSelectedFile(null);
    });

    const dropzone = document.getElementById('aex-file-drop');
    if (dropzone) {
      ['dragenter', 'dragover'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (event) => {
          event.preventDefault();
          dropzone.classList.add('is-dragover');
        });
      });
      ['dragleave', 'drop'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (event) => {
          event.preventDefault();
          dropzone.classList.remove('is-dragover');
        });
      });
      dropzone.addEventListener('drop', (event) => {
        const file = event.dataTransfer?.files?.[0];
        if (file) setSelectedFile(file);
      });
      dropzone.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          fileInput?.click();
        }
      });
    }

    document.getElementById('aex-err-retry')?.addEventListener('click', () => {
      if (state.lastRunPayload) {
        restoreRunPayload(state.lastRunPayload);
        handleRun();
      }
    });
    document.getElementById('aex-err-dismiss')?.addEventListener('click', hideInlineError);

    document.getElementById('aex-jump-library')?.addEventListener('click', () => switchView('library'));
    document.getElementById('aex-library-new-btn')?.addEventListener('click', () => {
      switchView('extract');
      document.getElementById('aex-url-input')?.focus();
    });

    document.getElementById('aex-back-to-extract')?.addEventListener('click', () => switchView('extract'));
    document.getElementById('aex-new-btn')?.addEventListener('click', () => {
      switchView('extract');
      if (state.sourceTab === 'text') document.getElementById('aex-text-input')?.focus();
      else if (state.sourceTab === 'upload') document.getElementById('aex-file-input')?.click();
      else document.getElementById('aex-url-input')?.focus();
    });
    document.getElementById('aex-copy-btn')?.addEventListener('click', copyStudyNotes);
    document.getElementById('aex-save-all-btn')?.addEventListener('click', saveAllItems);
    document.getElementById('aex-complete-note-btn')?.addEventListener('click', toggleNoteCompletion);
    document.getElementById('aex-open-source-btn')?.addEventListener('click', () => {
      const url = state.currentNote?.sourceUrl;
      if (url && /^https?:\/\//i.test(url)) {
        global.open(url, '_blank', 'noopener,noreferrer');
      }
    });
    document.getElementById('aex-studio-btn')?.addEventListener('click', (event) => {
      const target = event.currentTarget?.dataset?.aexStudio;
      if (target) global.location.href = target;
    });

    document.getElementById('aex-source-toggle')?.addEventListener('click', () => {
      const panel = document.getElementById('aex-source-panel');
      if (!panel) return;
      setSourcePanelOpen(panel.hidden);
    });
    document.getElementById('aex-source-close')?.addEventListener('click', () => setSourcePanelOpen(false));
    document.getElementById('aex-info-toggle')?.addEventListener('click', (event) => {
      event.stopPropagation();
      const popover = document.getElementById('aex-source-meta');
      if (!popover) return;
      setSourceInfoOpen(popover.hidden);
    });
    document.addEventListener('click', (event) => {
      const popover = document.getElementById('aex-source-meta');
      if (!popover || popover.hidden) return;
      if (popover.contains(event.target) || event.target.closest?.('#aex-info-toggle')) return;
      setSourceInfoOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const popover = document.getElementById('aex-source-meta');
      if (popover && !popover.hidden) {
        setSourceInfoOpen(false);
        return;
      }
      const panel = document.getElementById('aex-source-panel');
      if (panel && !panel.hidden) setSourcePanelOpen(false);
    });

    document.getElementById('aex-note-search')?.addEventListener('input', (event) => {
      state.noteSearch = String(event.target.value || '');
      if (state.currentNote) {
        renderItems(state.currentNote);
        renderCategoryFilters(state.currentNote);
      }
    });

    document.getElementById('aex-library-search')?.addEventListener('input', (event) => {
      state.librarySearch = String(event.target.value || '');
      renderLibrary();
    });

    global.addEventListener('flaptap:languages-loaded', () => populateLanguageSelects());
    global.addEventListener('flaptap:auth-changed', async (event) => {
      const user = event?.detail?.user;
      if (user) {
        await Promise.all([
          loadHistory(),
          loadLessonSources(),
          ws()?.refreshVocabulary ? ws().refreshVocabulary() : Promise.resolve(),
        ]);
        if (state.currentNote) updateSaveButtons();
      } else {
        state.history = [];
        state.historyTotal = 0;
        state.currentNote = null;
        teardownBindings();
        renderRecent();
        renderLibrary();
        setText('aex-library-count', '0');
        setText('aex-recent-total', '0');
        if (state.activeView !== 'extract') switchView('extract');
      }
    });

    global.addEventListener('flaptap:ui-lang-changed', () => {
      // The feature copy is authored in English; only the nav label is localized by the shell.
    });
  }

  function handleSectionClick(event) {
    const openButton = event.target.closest('[data-aex-open]');
    if (openButton) {
      event.preventDefault();
      openNote(openButton.dataset.aexOpen);
      return;
    }

    const deleteButton = event.target.closest('[data-aex-delete]');
    if (deleteButton) {
      event.preventDefault();
      deleteNote(deleteButton.dataset.aexDelete, deleteButton);
      return;
    }

    const checkButton = event.target.closest('[data-aex-check]');
    if (checkButton) {
      event.preventDefault();
      toggleItemCompletion(checkButton.dataset.aexCheck, checkButton);
      return;
    }

    const saveButton = event.target.closest('[data-aex-save-index]');
    if (saveButton) {
      event.preventDefault();
      saveItem(saveButton.dataset.aexSaveIndex);
      return;
    }

    const speakButton = event.target.closest('[data-aex-speak]');
    if (speakButton) {
      event.preventDefault();
      global.FlaptapWordLookup?.speakText?.(speakButton.dataset.aexSpeak);
      return;
    }

    const filterButton = event.target.closest('[data-aex-filter]');
    if (filterButton) {
      event.preventDefault();
      state.noteFilter = filterButton.dataset.aexFilter || 'all';
      if (state.currentNote) {
        renderCategoryFilters(state.currentNote);
        renderItems(state.currentNote);
      }
      return;
    }

    const scopeButton = event.target.closest('[data-aex-scope]');
    if (scopeButton) {
      event.preventDefault();
      toggleNoteScope();
      return;
    }

  }

  function focusUrl() {
    document.getElementById('aex-url-input')?.focus();
  }

  /* ========================================================================
     PUBLIC API
     ======================================================================== */

  global.FlaptapAmericanExtractor = {
    init,
    resumePending,
    reloadHistory: loadHistory,
    reloadLessonSources: loadLessonSources,
    getState: () => state,
    focusUrl,
  };
})(window);
