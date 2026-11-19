/* ==========================================================================
   FLAPTAP TECH LEXICON STUDIO (tech-lexicon.js)
   Modular Feature Controller for Software & AI Spoken Engineering Lexicon
   Dedicated Routes: /lexicon · /lexicon/library · /lexicon/note/:id
   Unified AI Selector (FlaptapAiSelector) · Interactive WordLookup · Modes
   ========================================================================== */

(function (global) {
  'use strict';

  const techState = {
    initialized: false,
    eventsBound: false,
    activeView: 'extract', // 'extract' | 'note' | 'library'
    activeSourceTab: 'url',
    activeResultTab: 'vocab',
    selectedExtractionMode: 'comprehensive', // 'comprehensive' | 'advanced_native'
    aiSelector: null,
    currentResult: null,
    historyItems: [],
    tableSearchQuery: '',
    activeCategoryFilter: 'all',
    activeIdiomCategoryFilter: 'all',
    librarySearchQuery: '',
  };

  function ws() {
    return global.FlaptapWorkspace || null;
  }

  function router() {
    return global.FlaptapRouter || null;
  }

  function getModesApi() {
    return global.FlaptapTechLexiconModes || null;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name, options) {
    return global.FlaptapIcon ? global.FlaptapIcon(name, options) : '';
  }

  function showToast(msg) {
    ws()?.showToast?.(msg);
  }

  async function apiFetch(url, options) {
    if (ws()?.apiFetch) {
      return ws().apiFetch(url, options);
    }
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.message || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /* ========================================================================
     INITIALIZATION & ROUTE SYNCHRONIZATION
     ======================================================================== */

  function populateLookupLanguageSelect() {
    const sel = document.getElementById('lexicon-lookup-lang');
    if (!sel) return;
    const langs = ws()?.getLanguages?.() || [];
    const userLang =
      ws()?.getUser?.()?.nativeLanguage || localStorage.getItem('flaptap_trans_lang') || 'ar';

    if (langs.length > 0) {
      sel.innerHTML = langs
        .map(
          (l) =>
            `<option value="${escapeHtml(l.code)}">${escapeHtml(l.name)} (${escapeHtml(l.native)})</option>`,
        )
        .join('');
    }
    sel.value = userLang;
  }

  function mountAiSelector() {
    if (techState.aiSelector || !global.FlaptapAiSelector) return;
    const mountEl = document.getElementById('linguist-ai-selector-mount');
    if (!mountEl) return;

    const Modes = getModesApi();
    const modeCfg = Modes ? Modes.getModeConfig(techState.selectedExtractionMode) : null;

    techState.aiSelector = global.FlaptapAiSelector.create({
      container: mountEl,
      idPrefix: 'linguist-aisel',
      persistenceKey: 'tech_lexicon',
      title: 'Dynamic API Provider, Live Model & Thinking Selector',
      actionLabel: modeCfg?.runButtonLabel || 'Extract Tech Lexicon',
      extraSummaryItems: [
        {
          id: 'mode',
          label: 'Mode',
          value: modeCfg?.shortLabel || 'Full Studio (4-Tab)',
        },
        {
          id: 'workspace',
          label: 'Output',
          value: 'Interactive Study Studio',
        },
      ],
      fetcher: apiFetch,
      onToast: showToast,
      onRun: () => handleRunExtraction(),
    });
  }

  async function init(routeState) {
    if (!techState.initialized) {
      techState.initialized = true;
      mountAiSelector();
      setupEvents();
      populateLookupLanguageSelect();
      if (techState.aiSelector) {
        await techState.aiSelector.init();
      }
      await loadHistory();
    }

    if (routeState) {
      await applyRouteState(routeState);
    }
  }

  async function applyRouteState(routeState) {
    if (!routeState || routeState.section !== 'tech-linguist') return;
    const subview = routeState.subview || 'extract';
    if (subview === 'note' && routeState.noteId) {
      if (techState.currentResult?.id === routeState.noteId) {
        switchLexiconView('note', { skipUrlSync: true });
      } else {
        await openExtractionNote(routeState.noteId, { replace: true });
      }
      return;
    }
    if (subview === 'library') {
      switchLexiconView('library', { skipUrlSync: true });
      return;
    }
    switchLexiconView('extract', { skipUrlSync: true });
  }

  function selectExtractionMode(modeId) {
    const Modes = getModesApi();
    const normalized = Modes ? Modes.normalizeModeId(modeId) : 'comprehensive';
    techState.selectedExtractionMode = normalized;

    document.querySelectorAll('.lexicon-mode-card[data-extraction-mode]').forEach((card) => {
      const isSelected = card.dataset.extractionMode === normalized;
      card.classList.toggle('active', isSelected);
      card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    });

    const cfg = Modes ? Modes.getModeConfig(normalized) : null;
    if (cfg && techState.aiSelector) {
      techState.aiSelector.setRunLabel(cfg.runButtonLabel);
      techState.aiSelector.setSummaryValue('mode', cfg.shortLabel);
    }
  }

  function switchLexiconView(viewName, opts = {}) {
    let target = viewName === 'library' || viewName === 'note' ? viewName : 'extract';
    if (target === 'note' && !techState.currentResult?.id) {
      target = 'extract';
    }
    techState.activeView = target;

    const viewExtract = document.getElementById('lexicon-view-extract');
    const viewNote = document.getElementById('lexicon-view-note');
    const viewLibrary = document.getElementById('lexicon-view-library');

    if (viewExtract) viewExtract.hidden = target !== 'extract';
    if (viewNote) viewNote.hidden = target !== 'note';
    if (viewLibrary) viewLibrary.hidden = target !== 'library';

    const tabExtract = document.getElementById('view-tab-extract');
    const tabNote = document.getElementById('view-tab-note');
    const tabLibrary = document.getElementById('view-tab-library');

    if (tabExtract) {
      tabExtract.classList.toggle('active', target === 'extract');
      tabExtract.setAttribute('aria-selected', target === 'extract' ? 'true' : 'false');
    }
    if (tabNote) {
      tabNote.classList.toggle('active', target === 'note');
      tabNote.setAttribute('aria-selected', target === 'note' ? 'true' : 'false');
    }
    if (tabLibrary) {
      tabLibrary.classList.toggle('active', target === 'library');
      tabLibrary.setAttribute('aria-selected', target === 'library' ? 'true' : 'false');
    }

    if (!opts.skipUrlSync) {
      router()?.updateSubroute('tech-linguist', {
        subview: target,
        noteId: target === 'note' ? techState.currentResult?.id || '' : '',
        replace: Boolean(opts.replace),
      });
    }

    const desk = document.querySelector('.lexicon-desk');
    if (desk && !opts.skipUrlSync) {
      desk.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /* ========================================================================
     EXTRACTION PIPELINE (UNIFIED DIRECT API)
     ======================================================================== */

  function showLexiconError(title, msg, opts = {}) {
    const box = document.getElementById('linguist-inline-error');
    const titleEl = document.getElementById('inline-err-title');
    const msgEl = document.getElementById('inline-err-msg');
    const retryBtn = document.getElementById('btn-err-retry-fallback');
    if (box && titleEl && msgEl) {
      titleEl.textContent = title || 'Extraction Error';
      msgEl.textContent = msg || 'An unexpected error occurred.';
      if (retryBtn) retryBtn.hidden = !opts.canRetryFallback;
      box.hidden = false;
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function hideLexiconError() {
    const box = document.getElementById('linguist-inline-error');
    if (box) box.hidden = true;
  }

  async function handleRunExtraction() {
    hideLexiconError();

    const isUrl = techState.activeSourceTab === 'url';
    const urlInput = document.getElementById('linguist-url-input');
    const textInput = document.getElementById('linguist-raw-text-input');

    const url = isUrl && urlInput ? urlInput.value.trim() : '';
    const transcriptText = !isUrl && textInput ? textInput.value.trim() : '';

    if (!url && !transcriptText) {
      showLexiconError(
        'Missing Input Source',
        isUrl
          ? 'Please enter a valid YouTube or media URL above (or click Quick Sample to try a preset).'
          : 'Please paste transcript text or interview notes above before extracting.',
        { canRetryFallback: false },
      );
      return;
    }

    const sel = techState.aiSelector
      ? techState.aiSelector.getSelection()
      : { keyId: '', providerName: 'AI Provider', model: '', variant: 'none' };

    const mode = techState.selectedExtractionMode || 'comprehensive';
    const Modes = getModesApi();
    const modeCfg = Modes ? Modes.getModeConfig(mode) : null;

    const progressCard = document.getElementById('linguist-progress');
    const progressStatus = document.getElementById('linguist-progress-status');
    const resultsCard = document.getElementById('linguist-results-card');

    if (resultsCard) resultsCard.hidden = true;
    if (progressCard) progressCard.hidden = false;
    techState.aiSelector?.setDisabled(true);

    const pstep3Text = document.querySelector('#pstep-3 span:last-child');
    if (pstep3Text && modeCfg) {
      pstep3Text.textContent = modeCfg.step3Label;
    }

    const setStep = (stepNum, text) => {
      if (progressStatus) progressStatus.textContent = text;
      for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`pstep-${i}`);
        if (el) {
          el.classList.toggle('done', i < stepNum);
          el.classList.toggle('active', i === stepNum);
        }
      }
    };

    const progressTimers = [];
    setStep(1, 'Connecting to source media and fetching caption stream...');

    progressTimers.push(
      setTimeout(() => {
        setStep(2, 'Running autonomous ASR punctuation repair and audio audit...');
      }, 1500),
    );

    progressTimers.push(
      setTimeout(() => {
        setStep(
          3,
          `Executing ${sel.providerName || 'AI Provider'} (${sel.model || 'auto'} · ${sel.variant || 'none'})...`,
        );
      }, 3200),
    );

    try {
      const response = await apiFetch('/api/tech-linguist/extract', {
        method: 'POST',
        body: JSON.stringify({
          url,
          transcriptText,
          mode,
          keyId: sel.keyId || undefined,
          model: sel.model || undefined,
          variant: sel.variant || undefined,
        }),
      });

      setStep(4, 'Building interactive web study studio & saving to your library...');

      if (response && response.data) {
        techState.currentResult = response.data;
        renderExtractionResult(response.data);
        await loadHistory();
        if (response.data.fallbackFrom) {
          showToast(`Rescued seamlessly from ${response.data.fallbackFrom} via ${response.data.modelUsed}`);
        } else {
          showToast(modeCfg ? `${modeCfg.shortLabel} study note ready` : 'Tech Lexicon study note ready');
        }
      }
    } catch (err) {
      showLexiconError(
        `Execution Failed (${sel.providerName || 'AI Provider'})`,
        err.message || 'Unknown failure while extracting.',
        { canRetryFallback: true },
      );
    } finally {
      progressTimers.forEach((t) => clearTimeout(t));
      if (progressCard) progressCard.hidden = true;
      techState.aiSelector?.setDisabled(false);
    }
  }

  /* ========================================================================
     WORD LOOKUP & VOCABULARY SAVE
     ======================================================================== */

  function isLexiconTermSaved(term) {
    return Boolean(ws()?.isVocabularySaved?.(term));
  }

  function decorateLexiconWords(verbatimHtml, contextSentence) {
    if (global.FlaptapWordLookup) {
      return global.FlaptapWordLookup.tokenizeClickableWords(verbatimHtml, {
        contextSentence: contextSentence || '',
      });
    }
    return verbatimHtml || '';
  }

  function getActiveLookupLanguage() {
    const sel = document.getElementById('lexicon-lookup-lang');
    return (
      sel?.value ||
      ws()?.getUser?.()?.nativeLanguage ||
      localStorage.getItem('flaptap_trans_lang') ||
      'ar'
    );
  }

  async function openLexiconWordLookup(word, contextSentence, sourceSpan) {
    if (!word || !global.FlaptapWordLookup) return;
    const cur = techState.currentResult;
    const lang = getActiveLookupLanguage();

    await global.FlaptapWordLookup.open({
      word,
      sourceEl: sourceSpan,
      contextSentence: contextSentence || word,
      endpoint: '/api/tech-linguist/define-word',
      payload: {
        extractionId: cur?.id || undefined,
        word,
        contextSentence: contextSentence || undefined,
        title: cur?.title || undefined,
        language: lang,
      },
      fetcher: apiFetch,
      canPlay: false,
      canSpeak: true,
      canSave: true,
      isSaved: (term) => isLexiconTermSaved(term),
      onSave: async (lookup) => {
        if (
          ws()?.requireAuthBeforeAction &&
          !ws().requireAuthBeforeAction({ type: 'section', section: 'tech-linguist' })
        ) {
          return;
        }
        try {
          const saved = await apiFetch('/api/vocabulary', {
            method: 'POST',
            body: JSON.stringify({
              term: lookup.term,
              ipa: lookup.ipa,
              partOfSpeech: lookup.partOfSpeech,
              definition: lookup.contextualDefinition,
              generalTranslation: lookup.generalTranslation || '',
              translation: lookup.nativeTranslation,
              contextSentence: lookup.contextSentence,
              lessonTitle: cur?.title || 'Tech Lexicon Study',
            }),
          });
          if (saved && saved.id) {
            await ws()?.refreshVocabulary?.();
            updateLexiconSaveButtons();
            global.FlaptapWordLookup.syncSavedButtonDom();
          }
          showToast(`Saved "${lookup.term}" to Vocabulary Flashcards`);
        } catch (err) {
          showToast(err.message);
        }
      },
    });
  }

  async function saveLexiconItemToVocabulary(item, kind) {
    if (
      ws()?.requireAuthBeforeAction &&
      !ws().requireAuthBeforeAction({ type: 'section', section: 'tech-linguist' })
    ) {
      return;
    }
    const cur = techState.currentResult;
    const term = kind === 'vocab' ? item.term : item.phrase;
    const def =
      kind === 'vocab'
        ? item.techCategory
          ? `${item.techCategory}: ${item.meaningArabic}`
          : item.meaningArabic
        : item.usageNote || item.meaningArabic;

    try {
      await apiFetch('/api/vocabulary', {
        method: 'POST',
        body: JSON.stringify({
          term,
          partOfSpeech: item.partOfSpeech || (kind === 'idiom' ? 'idiom' : ''),
          definition: def || term,
          generalTranslation: item.generalArabic || '',
          translation: item.meaningArabic || '',
          contextSentence: item.contextSentence || '',
          lessonTitle: cur?.title || 'Tech Lexicon Study',
        }),
      });
      await ws()?.refreshVocabulary?.();
      updateLexiconSaveButtons();
      showToast(`Saved "${term}" to Vocabulary Flashcards`);
    } catch (err) {
      showToast(err.message);
    }
  }

  async function handleSaveAllToFlashcards() {
    if (
      ws()?.requireAuthBeforeAction &&
      !ws().requireAuthBeforeAction({ type: 'section', section: 'tech-linguist' })
    ) {
      return;
    }
    const cur = techState.currentResult;
    if (!cur) return;

    const btn = document.getElementById('res-save-all-vocab-btn');
    const itemsToSave = [
      ...(cur.vocabItems || []).map((v) => ({
        term: v.term,
        partOfSpeech: v.partOfSpeech || '',
        definition: v.techCategory ? `${v.techCategory}: ${v.meaningArabic}` : v.meaningArabic,
        generalTranslation: v.generalArabic || '',
        translation: v.meaningArabic || '',
        contextSentence: v.contextSentence || '',
      })),
      ...(cur.idiomItems || []).map((i) => ({
        term: i.phrase,
        partOfSpeech: 'idiom',
        definition: i.usageNote || i.meaningArabic,
        generalTranslation: i.generalArabic || '',
        translation: i.meaningArabic || '',
        contextSentence: i.contextSentence || '',
      })),
    ].filter((it) => it.term && !isLexiconTermSaved(it.term));

    if (itemsToSave.length === 0) {
      showToast('All extracted items are already saved in your Vocabulary Flashcards');
      return;
    }

    const withLoading = ws()?.withButtonLoading;
    const task = async () => {
      let savedCount = 0;
      for (const entry of itemsToSave) {
        try {
          await apiFetch('/api/vocabulary', {
            method: 'POST',
            body: JSON.stringify({
              ...entry,
              lessonTitle: cur.title || 'Tech Lexicon Study',
            }),
          });
          savedCount++;
        } catch {}
      }
      await ws()?.refreshVocabulary?.();
      updateLexiconSaveButtons();
      showToast(`Added ${savedCount} terms to your Vocabulary Flashcards`);
    };

    if (typeof withLoading === 'function') {
      await withLoading(btn, `Saving ${itemsToSave.length}...`, task);
    } else {
      await task();
    }
  }

  function updateLexiconSaveButtons() {
    const cur = techState.currentResult;
    if (!cur) return;
    document.querySelectorAll('[data-lex-save-kind]').forEach((btn) => {
      const kind = btn.dataset.lexSaveKind;
      const idx = Number(btn.dataset.lexSaveIndex);
      const item =
        kind === 'vocab'
          ? (cur.vocabItems || []).find((v) => v.index === idx)
          : (cur.idiomItems || []).find((i) => i.index === idx);
      const term = kind === 'vocab' ? item?.term : item?.phrase;
      const saved = Boolean(term && isLexiconTermSaved(term));
      btn.classList.toggle('is-saved', saved);
      btn.innerHTML = icon(saved ? 'bookmark-check' : 'bookmark-plus');
      const label = saved ? 'Saved in Flashcards' : 'Save to Vocabulary Flashcards';
      btn.title = label;
      btn.setAttribute('aria-label', label);
    });
  }

  /* ========================================================================
     RENDERING ACTIVE STUDY NOTE & LIBRARY
     ======================================================================== */

  function renderExtractionResult(data, opts = {}) {
    if (!data) return;

    const Modes = getModesApi();
    const modeId = Modes
      ? Modes.normalizeModeId(data.extractionMode || data.extraction_mode)
      : 'comprehensive';
    const modeCfg = Modes ? Modes.getModeConfig(modeId) : null;

    const resultsCard = document.getElementById('linguist-results-card');
    if (resultsCard) {
      resultsCard.hidden = false;
      resultsCard.dataset.extractionMode = modeId;
    }

    const tabNote = document.getElementById('view-tab-note');
    const noteNavLabel = document.getElementById('lexicon-nav-note-label');
    if (tabNote) {
      tabNote.hidden = false;
      if (noteNavLabel) {
        const shortTitle = data.title.length > 22 ? `${data.title.slice(0, 22)}…` : data.title;
        noteNavLabel.textContent = `Note: ${shortTitle}`;
      }
    }

    switchLexiconView('note', opts);

    const titleEl = document.getElementById('res-title');
    const channelBadge = document.getElementById('res-channel-badge');
    const modeBadge = document.getElementById('res-mode-badge');
    const agentBadge = document.getElementById('res-agent-badge');
    const modelBadge = document.getElementById('res-model-badge');
    const timeBadge = document.getElementById('res-time-badge');
    const countBadge = document.getElementById('res-count-badge');

    if (titleEl) titleEl.textContent = data.title;
    if (channelBadge) channelBadge.textContent = data.creator || 'Tech Media';
    if (modeBadge && modeCfg) {
      modeBadge.textContent = modeCfg.badgeLabel;
      modeBadge.classList.toggle('is-elite', modeId === 'advanced_native');
    }
    if (agentBadge) agentBadge.textContent = `Provider: ${data.agentUsed || data.agent_name || 'AI'}`;
    if (modelBadge) {
      const mName = data.modelUsed || data.model_name || 'default';
      const varLevel = data.reasoningLevel || data.reasoning_level || '';
      modelBadge.textContent = varLevel ? `Model: ${mName} (${varLevel})` : `Model: ${mName}`;
    }
    if (timeBadge) {
      timeBadge.textContent = `Time: ${((data.executionTimeMs || data.execution_time_ms || 1200) / 1000).toFixed(1)}s`;
    }

    const totalCount = (data.vocabItems?.length || 0) + (data.idiomItems?.length || 0);
    if (countBadge) {
      const unitLabel = modeCfg ? modeCfg.countUnitLabel : 'High-Yield Items Extracted';
      countBadge.textContent = `${totalCount} ${unitLabel}`;
    }

    const openVideoBtn = document.getElementById('btn-open-video-lesson');
    if (openVideoBtn) {
      openVideoBtn.hidden = !(data.sourceUrl && /^https?:\/\//i.test(data.sourceUrl));
    }

    const summaryCard = document.getElementById('res-summary-card');
    const summaryText = document.getElementById('res-summary-text');
    if (summaryCard && summaryText) {
      if (data.summary && data.summary.trim()) {
        summaryCard.hidden = false;
        summaryText.innerHTML = decorateLexiconWords(escapeHtml(data.summary), data.summary);
      } else {
        summaryCard.hidden = true;
      }
    }

    const hintTextEl = document.getElementById('res-interaction-hint-text');
    if (hintTextEl && modeCfg) {
      hintTextEl.innerHTML = modeCfg.interactionHintHtml;
    }

    const vocabLabelEl = document.getElementById('res-vocab-label');
    const idiomsLabelEl = document.getElementById('res-idioms-label');
    const vocabColHeader = document.getElementById('res-vocab-col-header');
    const idiomsColHeader = document.getElementById('res-idioms-col-header');

    if (modeCfg) {
      if (vocabLabelEl) vocabLabelEl.textContent = modeCfg.tabs.vocab.label;
      if (idiomsLabelEl) idiomsLabelEl.textContent = modeCfg.tabs.idioms.label;
      if (vocabColHeader) vocabColHeader.textContent = modeCfg.tabs.vocab.colHeader;
      if (idiomsColHeader) idiomsColHeader.textContent = modeCfg.tabs.idioms.colHeader;
    }

    document.querySelectorAll('.res-tab-btn[data-tab]').forEach((btn) => {
      const tabName = btn.dataset.tab;
      const visible = Modes ? Modes.isTabVisible(modeId, tabName) : true;
      btn.hidden = !visible;
    });

    const vocabNum = document.getElementById('res-vocab-num');
    const idiomsNum = document.getElementById('res-idioms-num');
    const patternsNum = document.getElementById('res-patterns-num');
    const transcriptNum = document.getElementById('res-transcript-num');

    const showTranscript = !Modes || Modes.isTabVisible(modeId, 'transcript');
    const showPatterns = !Modes || Modes.isTabVisible(modeId, 'patterns');

    const transcriptSentences = showTranscript
      ? segmentTranscriptSentences(data.fullTranscript || data.full_transcript || '')
      : [];
    if (vocabNum) vocabNum.textContent = String(data.vocabItems?.length || 0);
    if (idiomsNum) idiomsNum.textContent = String(data.idiomItems?.length || 0);
    if (patternsNum) patternsNum.textContent = String(data.thoughtPatterns?.length || 0);
    if (transcriptNum) transcriptNum.textContent = String(transcriptSentences.length);

    const tableSearch = document.getElementById('lexicon-table-search');
    if (tableSearch) tableSearch.value = '';
    techState.tableSearchQuery = '';
    techState.activeCategoryFilter = 'all';
    techState.activeIdiomCategoryFilter = 'all';

    renderCategoryFilters(data.vocabItems || []);
    renderIdiomCategoryFilters(data.idiomItems || []);
    renderVocabTable(data.vocabItems || []);
    renderIdiomsTable(data.idiomItems || []);

    if (showPatterns) {
      renderPatterns(data.thoughtPatterns || []);
    } else {
      const pPanel = document.getElementById('res-panel-patterns');
      if (pPanel) pPanel.hidden = true;
    }

    if (showTranscript) {
      renderInteractiveTranscript(data.fullTranscript || data.full_transcript || '');
    } else {
      const tPanel = document.getElementById('res-panel-transcript');
      if (tPanel) tPanel.hidden = true;
    }

    switchResultsTab('vocab');
  }

  function renderFilterPillsShared(wrapId, items, fieldName, activeCategory) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    const Modes = getModesApi();
    if (Modes) {
      const res = Modes.renderFilterPillsHtml(items, fieldName, activeCategory, escapeHtml);
      wrap.innerHTML = res.html;
      wrap.hidden = !res.visible;
      return;
    }
    wrap.innerHTML = '';
    wrap.hidden = true;
  }

  function renderCategoryFilters(items) {
    renderFilterPillsShared('lexicon-category-filters', items, 'techCategory', techState.activeCategoryFilter);
  }

  function renderIdiomCategoryFilters(items) {
    renderFilterPillsShared(
      'lexicon-idiom-category-filters',
      items,
      'category',
      techState.activeIdiomCategoryFilter,
    );
  }

  function highlightTermInSentence(sentence, term, allowPartial = false) {
    const Modes = getModesApi();
    if (Modes) {
      return Modes.highlightTermInSentence(sentence, term, escapeHtml, allowPartial);
    }
    return escapeHtml(sentence || '');
  }

  function renderDualArabicCellHtml(generalArabic, contextualArabic) {
    const Modes = getModesApi();
    if (Modes) {
      return Modes.renderDualArabicCellHtml(generalArabic, contextualArabic, escapeHtml);
    }
    return `<div class="arabic-val"><span class="arabic-bold" dir="rtl">${escapeHtml(contextualArabic || '')}</span></div>`;
  }

  function renderLexCheckBtn(checked, attrs, label) {
    if (ws()?.renderCheckButtonHtml) {
      return ws().renderCheckButtonHtml({ checked, attrs, label });
    }
    const titleText = label || (checked ? 'Completed' : 'Mark complete');
    return `<button type="button" class="item-check-btn${checked ? ' is-checked' : ''}" ${attrs} aria-pressed="${checked ? 'true' : 'false'}" aria-label="${escapeHtml(titleText)}" title="${escapeHtml(titleText)}"><svg class="chk-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line class="chk-dash" x1="6.5" y1="12" x2="17.5" y2="12"></line><polyline class="chk-tick" points="19.5 7 9.5 17 4.5 12"></polyline></svg></button>`;
  }

  function getSubjectCompletedSet(result, subject) {
    const arr = result?.completionProgress?.[subject];
    return new Set(Array.isArray(arr) ? arr.map(Number) : []);
  }

  function renderActiveNoteSubjectBars(result) {
    if (!result) return;
    const Modes = getModesApi();
    const query = techState.tableSearchQuery;

    const vocabItems = result.vocabItems || [];
    const vocabFiltered = Modes
      ? Modes.filterVocabItems(vocabItems, query, techState.activeCategoryFilter || 'all')
      : vocabItems;
    const vocabDone = getSubjectCompletedSet(result, 'vocab');
    ws()?.renderSubjectProgressBar?.('lex-vocab-progress-bar', {
      total: vocabFiltered.length,
      completed: vocabFiltered.filter((v, idx) => vocabDone.has(Number(v.index ?? idx + 1))).length,
    });

    const idiomItems = result.idiomItems || [];
    const idiomsFiltered = Modes
      ? Modes.filterIdiomItems(idiomItems, query, techState.activeIdiomCategoryFilter || 'all')
      : idiomItems;
    const idiomsDone = getSubjectCompletedSet(result, 'idioms');
    ws()?.renderSubjectProgressBar?.('lex-idioms-progress-bar', {
      total: idiomsFiltered.length,
      completed: idiomsFiltered.filter((i, idx) => idiomsDone.has(Number(i.index ?? idx + 1))).length,
    });

    const patterns = result.thoughtPatterns || [];
    const patternsDone = getSubjectCompletedSet(result, 'patterns');
    ws()?.renderSubjectProgressBar?.('lex-patterns-progress-bar', {
      total: patterns.length,
      completed: patterns.filter((_, idx) => patternsDone.has(idx)).length,
    });

    const sentences = segmentTranscriptSentences(result.fullTranscript || result.full_transcript || '');
    const filteredSents = query
      ? sentences.map((text, idx) => ({ text, num: idx + 1 })).filter((s) => s.text.toLowerCase().includes(query))
      : sentences.map((text, idx) => ({ text, num: idx + 1 }));
    const transDone = getSubjectCompletedSet(result, 'transcript');
    ws()?.renderSubjectProgressBar?.('lex-transcript-progress-bar', {
      total: filteredSents.length,
      completed: filteredSents.filter((s) => transDone.has(s.num)).length,
    });
  }

  async function toggleLexiconItemCompletion(subject, index) {
    const cur = techState.currentResult;
    if (!cur?.id) return;
    const progress = { ...(cur.completionProgress || {}) };
    const existing = Array.isArray(progress[subject]) ? [...progress[subject].map(Number)] : [];
    const set = new Set(existing);
    const nextCompleted = !set.has(index);
    if (nextCompleted) set.add(index);
    else set.delete(index);
    progress[subject] = Array.from(set).sort((a, b) => a - b);
    cur.completionProgress = progress;

    if (subject === 'vocab') renderVocabTable(cur.vocabItems || []);
    else if (subject === 'idioms') renderIdiomsTable(cur.idiomItems || []);
    else if (subject === 'patterns') renderPatterns(cur.thoughtPatterns || []);
    else if (subject === 'transcript') renderInteractiveTranscript(cur.fullTranscript || cur.full_transcript || '');

    try {
      await apiFetch(`/api/tech-linguist/extractions/${encodeURIComponent(cur.id)}/item-completion`, {
        method: 'PATCH',
        body: JSON.stringify({ subject, index, completed: nextCompleted }),
      });
    } catch (err) {
      progress[subject] = existing;
      cur.completionProgress = progress;
      if (subject === 'vocab') renderVocabTable(cur.vocabItems || []);
      else if (subject === 'idioms') renderIdiomsTable(cur.idiomItems || []);
      else if (subject === 'patterns') renderPatterns(cur.thoughtPatterns || []);
      else if (subject === 'transcript') renderInteractiveTranscript(cur.fullTranscript || cur.full_transcript || '');
      showToast(err?.message || 'Could not save progress.');
    }
  }

  async function toggleLexiconNoteCompletion(id) {
    const histItem = techState.historyItems.find((it) => it.id === id);
    const prev = histItem
      ? Boolean(histItem.isCompleted ?? histItem.is_completed)
      : Boolean(techState.currentResult?.id === id && techState.currentResult.isCompleted);
    const next = !prev;

    if (histItem) {
      histItem.isCompleted = next;
      histItem.is_completed = next ? 1 : 0;
    }
    if (techState.currentResult?.id === id) {
      techState.currentResult.isCompleted = next;
    }
    renderRecentShelf(techState.historyItems.slice(0, 3));
    renderLibraryGrid();

    try {
      await apiFetch(`/api/tech-linguist/extractions/${encodeURIComponent(id)}/complete`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: next }),
      });
    } catch (err) {
      if (histItem) {
        histItem.isCompleted = prev;
        histItem.is_completed = prev ? 1 : 0;
      }
      if (techState.currentResult?.id === id) {
        techState.currentResult.isCompleted = prev;
      }
      renderRecentShelf(techState.historyItems.slice(0, 3));
      renderLibraryGrid();
      showToast(err?.message || 'Could not update note completion.');
    }
  }

  function renderVocabTable(items) {
    const tbody = document.getElementById('res-vocab-tbody');
    if (!tbody) return;

    const Modes = getModesApi();
    const curMode = techState.currentResult?.extractionMode || 'comprehensive';
    const modeCfg = Modes ? Modes.getModeConfig(curMode) : null;
    const query = techState.tableSearchQuery;
    const catFilter = techState.activeCategoryFilter || 'all';

    const filtered = Modes ? Modes.filterVocabItems(items, query, catFilter) : items || [];
    const doneSet = getSubjectCompletedSet(techState.currentResult, 'vocab');
    ws()?.renderSubjectProgressBar?.('lex-vocab-progress-bar', {
      total: filtered.length,
      completed: filtered.filter((v, idx) => doneSet.has(Number(v.index ?? idx + 1))).length,
    });

    if (filtered.length === 0) {
      const emptyMsg =
        modeCfg?.tabs?.vocab?.emptyFilterText || 'No vocabulary terms match your current filter.';
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 24px; color: var(--ink-muted);">${escapeHtml(emptyMsg)}</td></tr>`;
      return;
    }

    const speakSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;

    tbody.innerHTML = filtered
      .map((v, idx) => {
        const itemIdx = Number(v.index ?? idx + 1);
        const isDone = doneSet.has(itemIdx);
        const ctxForWord = v.contextSentence || v.term;
        const termHtml = decorateLexiconWords(escapeHtml(v.term), ctxForWord);
        const rawHighlightHtml = highlightTermInSentence(v.contextSentence, v.term);
        const clickableCtxHtml = decorateLexiconWords(rawHighlightHtml, ctxForWord);
        const saved = isLexiconTermSaved(v.term);

        return `
          <tr class="${isDone ? 'is-item-completed' : ''}">
            <td class="table-idx">
              <div class="lex-table-index-cell">
                ${renderLexCheckBtn(isDone, `data-lex-check-subject="vocab" data-lex-check-index="${itemIdx}"`)}
                <span class="ltr-num">${itemIdx}</span>
              </div>
            </td>
            <td>
              <div class="term-head">
                ${termHtml}
                ${v.partOfSpeech ? `<span class="term-pos">${escapeHtml(v.partOfSpeech)}</span>` : ''}
                ${v.techCategory ? `<span class="term-cat">${escapeHtml(v.techCategory)}</span>` : ''}
              </div>
              ${v.contextSentence ? `<div class="term-ctx">"${clickableCtxHtml}"</div>` : ''}
            </td>
            <td>${renderDualArabicCellHtml(v.generalArabic, v.meaningArabic)}</td>
            <td style="text-align: right;">
              <div class="lexicon-row-actions">
                ${window.FlaptapCopy ? window.FlaptapCopy.buttonHtml(v.term, { className: 'lex-mini-btn' }) : ''}
                <button type="button" class="lex-mini-btn" data-lex-speak="${escapeHtml(v.term)}" title="Listen pronunciation">${speakSvg}</button>
                <button type="button" class="lex-mini-btn ${saved ? 'is-saved' : ''}" data-lex-save-kind="vocab" data-lex-save-index="${v.index}" title="${saved ? 'Saved in Flashcards' : 'Save to Vocabulary Flashcards'}" aria-label="${saved ? 'Saved in Flashcards' : 'Save to Vocabulary Flashcards'}">${icon(saved ? 'bookmark-check' : 'bookmark-plus')}</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  function renderIdiomsTable(items) {
    const tbody = document.getElementById('res-idioms-tbody');
    if (!tbody) return;

    const Modes = getModesApi();
    const curMode = techState.currentResult?.extractionMode || 'comprehensive';
    const modeCfg = Modes ? Modes.getModeConfig(curMode) : null;
    const query = techState.tableSearchQuery;
    const catFilter = techState.activeIdiomCategoryFilter || 'all';

    const filtered = Modes ? Modes.filterIdiomItems(items, query, catFilter) : items || [];
    const doneSet = getSubjectCompletedSet(techState.currentResult, 'idioms');
    ws()?.renderSubjectProgressBar?.('lex-idioms-progress-bar', {
      total: filtered.length,
      completed: filtered.filter((i, idx) => doneSet.has(Number(i.index ?? idx + 1))).length,
    });

    if (filtered.length === 0) {
      const emptyMsg = query
        ? `No idioms match "${query}".`
        : modeCfg?.tabs?.idioms?.emptyFilterText || 'No idioms match your current filter.';
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 24px; color: var(--ink-muted);">${escapeHtml(emptyMsg)}</td></tr>`;
      return;
    }

    const speakSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;

    tbody.innerHTML = filtered
      .map((i, idx) => {
        const itemIdx = Number(i.index ?? idx + 1);
        const isDone = doneSet.has(itemIdx);
        const ctxForWord = i.contextSentence || i.phrase;
        const phraseHtml = decorateLexiconWords(escapeHtml(i.phrase), ctxForWord);
        const usageHtml = i.usageNote ? decorateLexiconWords(escapeHtml(i.usageNote), i.usageNote) : '';
        const clickableCtxHtml = i.contextSentence
          ? decorateLexiconWords(highlightTermInSentence(i.contextSentence, i.phrase), ctxForWord)
          : '';
        const saved = isLexiconTermSaved(i.phrase);

        return `
          <tr class="${isDone ? 'is-item-completed' : ''}">
            <td class="table-idx">
              <div class="lex-table-index-cell">
                ${renderLexCheckBtn(isDone, `data-lex-check-subject="idioms" data-lex-check-index="${itemIdx}"`)}
                <span class="ltr-num">${itemIdx}</span>
              </div>
            </td>
            <td>
              <div class="term-head">
                ${phraseHtml}
                ${i.category ? `<span class="term-cat">${escapeHtml(i.category)}</span>` : ''}
              </div>
              ${i.usageNote ? `<div class="term-ctx" style="font-style: normal; color: var(--ink-muted);">Note: ${usageHtml}</div>` : ''}
              ${i.contextSentence ? `<div class="term-ctx">"${clickableCtxHtml}"</div>` : ''}
            </td>
            <td>${renderDualArabicCellHtml(i.generalArabic, i.meaningArabic)}</td>
            <td style="text-align: right;">
              <div class="lexicon-row-actions">
                ${window.FlaptapCopy ? window.FlaptapCopy.buttonHtml(i.phrase, { className: 'lex-mini-btn' }) : ''}
                <button type="button" class="lex-mini-btn" data-lex-speak="${escapeHtml(i.phrase)}" title="Listen pronunciation">${speakSvg}</button>
                <button type="button" class="lex-mini-btn ${saved ? 'is-saved' : ''}" data-lex-save-kind="idiom" data-lex-save-index="${i.index}" title="${saved ? 'Saved in Flashcards' : 'Save to Vocabulary Flashcards'}" aria-label="${saved ? 'Saved in Flashcards' : 'Save to Vocabulary Flashcards'}">${icon(saved ? 'bookmark-check' : 'bookmark-plus')}</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  function renderPatterns(patterns) {
    const container = document.getElementById('res-patterns-container');
    if (!container) return;

    const list = Array.isArray(patterns) ? patterns : [];
    const doneSet = getSubjectCompletedSet(techState.currentResult, 'patterns');
    ws()?.renderSubjectProgressBar?.('lex-patterns-progress-bar', {
      total: list.length,
      completed: list.filter((_, idx) => doneSet.has(idx)).length,
    });

    if (list.length === 0) {
      container.innerHTML = `<div style="padding: 24px; color: var(--ink-muted);">No specific thought patterns highlighted for this video.</div>`;
      return;
    }

    const speakSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;

    container.innerHTML = list
      .map((p, idx) => {
        const isDone = doneSet.has(idx);
        const americanHtml = decorateLexiconWords(escapeHtml(p.americanStyle), p.americanStyle);
        const textbookHtml = decorateLexiconWords(escapeHtml(p.textbookContrast), p.textbookContrast);
        const mindsetHtml = decorateLexiconWords(escapeHtml(p.mindsetNote), p.mindsetNote);

        return `
          <div class="pattern-card${isDone ? ' is-item-completed' : ''}">
            <div class="lex-pattern-head-row">
              <h3 class="pattern-title">${idx + 1}. ${escapeHtml(p.title)}</h3>
              <div style="display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;">
                ${renderLexCheckBtn(isDone, `data-lex-check-subject="patterns" data-lex-check-index="${idx}"`)}
                <button type="button" class="lex-mini-btn" data-lex-speak="${escapeHtml(p.americanStyle)}" title="Hear American phrasing">
                  ${speakSvg}
                  <span>Listen</span>
                </button>
              </div>
            </div>
            <div class="pattern-phrasing-block">
              <span class="pattern-phrasing-label">Native American Phrasing</span>
              <strong>"${americanHtml}"</strong>
            </div>
            <div class="pattern-contrast-block">
              <span class="pattern-contrast-label">Textbook / Non-Native Phrasing</span>
              <span>"${textbookHtml}"</span>
            </div>
            <div class="pattern-mindset">
              <strong>Mindset:</strong> ${mindsetHtml}
            </div>
          </div>
        `;
      })
      .join('');
  }

  function segmentTranscriptSentences(rawText) {
    if (!rawText) return [];
    return String(rawText)
      .replace(/\s+/g, ' ')
      .trim()
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function renderInteractiveTranscript(rawTranscript) {
    const container = document.getElementById('res-full-transcript');
    if (!container) return;

    const sentences = segmentTranscriptSentences(rawTranscript);
    if (sentences.length === 0) {
      ws()?.renderSubjectProgressBar?.('lex-transcript-progress-bar', { total: 0, completed: 0 });
      container.innerHTML = `<div style="padding: 18px; color: var(--ink-muted);">No transcript available.</div>`;
      return;
    }

    const query = techState.tableSearchQuery;
    const filtered = query
      ? sentences.map((text, idx) => ({ text, num: idx + 1 })).filter((s) => s.text.toLowerCase().includes(query))
      : sentences.map((text, idx) => ({ text, num: idx + 1 }));

    const doneSet = getSubjectCompletedSet(techState.currentResult, 'transcript');
    ws()?.renderSubjectProgressBar?.('lex-transcript-progress-bar', {
      total: filtered.length,
      completed: filtered.filter((s) => doneSet.has(s.num)).length,
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div style="padding: 18px; color: var(--ink-muted);">No transcript sentences match "${escapeHtml(query)}".</div>`;
      return;
    }

    const speakSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;

    container.innerHTML = filtered
      .map((s) => {
        const isDone = doneSet.has(s.num);
        const innerHtml = query ? highlightTermInSentence(s.text, query, true) : escapeHtml(s.text);
        const clickableSentence = decorateLexiconWords(innerHtml, s.text);
        return `
          <div class="lex-sent-card${isDone ? ' is-item-completed' : ''}">
            <div class="lex-sent-left">
              ${renderLexCheckBtn(isDone, `data-lex-check-subject="transcript" data-lex-check-index="${s.num}"`)}
              <span class="lex-sent-num ltr-num">#${String(s.num).padStart(2, '0')}</span>
              <span class="lex-sent-text">${clickableSentence}</span>
            </div>
            <div class="lex-sent-actions">
              ${window.FlaptapCopy ? window.FlaptapCopy.buttonHtml(s.text, { className: 'lex-mini-btn' }) : ''}
              <button type="button" class="lex-mini-btn" data-lex-speak="${escapeHtml(s.text)}" title="Pronounce sentence">${speakSvg}</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function switchResultsTab(tabName) {
    const Modes = getModesApi();
    const curMode =
      techState.currentResult?.extractionMode || techState.currentResult?.extraction_mode || 'comprehensive';
    const targetTab = Modes && !Modes.isTabVisible(curMode, tabName) ? 'vocab' : tabName;
    techState.activeResultTab = targetTab;

    document.querySelectorAll('.res-tab-btn').forEach((b) => {
      const isActive = b.dataset.tab === targetTab;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    ['vocab', 'idioms', 'patterns', 'transcript'].forEach((name) => {
      const panel = document.getElementById(`res-panel-${name}`);
      const allowed = !Modes || Modes.isTabVisible(curMode, name);
      if (panel) panel.hidden = !allowed || name !== targetTab;
    });

    const searchContainer = document.getElementById('note-search-container');
    if (searchContainer) {
      searchContainer.hidden = targetTab === 'patterns';
    }
  }

  async function handleCopyStudyNotes() {
    const cur = techState.currentResult;
    if (!cur) return;

    const Modes = getModesApi();
    const lines = Modes ? Modes.buildStudyNotesClipboardText(cur) : `${cur.title}`;

    try {
      await navigator.clipboard.writeText(lines);
      const btn = document.getElementById('res-copy-md-btn');
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '<span>✓ Copied!</span>';
        setTimeout(() => {
          btn.innerHTML = orig;
        }, 2000);
      }
      showToast('Study notes copied to clipboard');
    } catch {
      showToast('Could not copy to clipboard.');
    }
  }

  async function loadHistory() {
    try {
      const res = await apiFetch('/api/tech-linguist/history', { method: 'GET' });
      const items = (res && res.items) || [];
      techState.historyItems = items;

      const countEl = document.getElementById('lexicon-library-count');
      const recentTotalEl = document.getElementById('recent-total-count');
      const statNotes = document.getElementById('lib-stat-notes');
      const statTerms = document.getElementById('lib-stat-terms');
      const statIdioms = document.getElementById('lib-stat-idioms');

      const totalTerms = items.reduce((acc, it) => acc + (it.vocab_count || 0), 0);
      const totalIdioms = items.reduce((acc, it) => acc + (it.idioms_count || 0), 0);

      if (countEl) countEl.textContent = String(items.length);
      if (recentTotalEl) recentTotalEl.textContent = String(items.length);
      if (statNotes) statNotes.textContent = String(items.length);
      if (statTerms) statTerms.textContent = String(totalTerms);
      if (statIdioms) statIdioms.textContent = String(totalIdioms);

      renderRecentShelf(items.slice(0, 3));
      renderLibraryGrid();
    } catch (e) {
      console.debug('Tech Lexicon history fetch failed:', e);
    }
  }

  function renderRecentShelf(recentItems) {
    const row = document.getElementById('lexicon-recent-row');
    if (!row) return;

    const list = Array.isArray(recentItems) ? recentItems : [];
    ws()?.renderSubjectProgressBar?.('lex-recent-progress-bar', {
      total: list.length,
      completed: list.filter((it) => Boolean(it.isCompleted ?? it.is_completed)).length,
    });

    if (list.length === 0) {
      row.innerHTML = `<div style="grid-column: 1 / -1; font-size: 0.82rem; color: var(--ink-muted); padding: 8px 0;">No notes extracted yet. Paste a video link above to extract your first note!</div>`;
      return;
    }

    const Modes = getModesApi();
    row.innerHTML = list
      .map((item) => {
        const dateStr = item.created_at ? item.created_at.split('T')[0] : '';
        const modeId = Modes ? Modes.normalizeModeId(item.extraction_mode) : 'comprehensive';
        const modeCfg = Modes ? Modes.getModeConfig(modeId) : null;
        const isDone = Boolean(item.isCompleted ?? item.is_completed);
        return `
          <div class="recent-note-mini${isDone ? ' is-item-completed' : ''}" data-id="${escapeHtml(item.id)}">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
              <div class="recent-note-title">${escapeHtml(item.title)}</div>
              ${renderLexCheckBtn(isDone, `data-lex-note-complete="${escapeHtml(item.id)}"`)}
            </div>
            <div class="recent-note-meta">
              <span>${item.vocab_count || 0} ${modeId === 'advanced_native' ? 'words' : 'terms'} · ${item.idioms_count || 0} idioms${modeCfg ? ` · ${escapeHtml(modeCfg.badgeLabel)}` : ''}</span>
              <span>${dateStr}</span>
            </div>
          </div>
        `;
      })
      .join('');

    row.querySelectorAll('.recent-note-mini').forEach((card) => {
      card.addEventListener('click', (e) => {
        const checkBtn = e.target.closest('[data-lex-note-complete]');
        if (checkBtn) {
          e.stopPropagation();
          toggleLexiconNoteCompletion(checkBtn.getAttribute('data-lex-note-complete'));
          return;
        }
        openExtractionNote(card.dataset.id);
      });
    });
  }

  function renderLibraryGrid() {
    const grid = document.getElementById('lexicon-library-grid');
    const emptyState = document.getElementById('lexicon-library-empty');
    if (!grid) return;

    const query = techState.librarySearchQuery;
    const items = techState.historyItems;

    const filtered = query
      ? items.filter(
          (it) =>
            (it.title && it.title.toLowerCase().includes(query)) ||
            (it.source_url && it.source_url.toLowerCase().includes(query)) ||
            (it.agent_name && it.agent_name.toLowerCase().includes(query)) ||
            (it.model_name && it.model_name.toLowerCase().includes(query)),
        )
      : items;

    ws()?.renderSubjectProgressBar?.('lex-library-progress-bar', {
      total: filtered.length,
      completed: filtered.filter((it) => Boolean(it.isCompleted ?? it.is_completed)).length,
    });

    if (emptyState) emptyState.hidden = filtered.length > 0;
    if (filtered.length === 0) {
      grid.innerHTML = '';
      return;
    }

    const Modes = getModesApi();
    grid.innerHTML = filtered
      .map((item) => {
        const dateStr = item.created_at ? item.created_at.split('T')[0] : '';
        const timeSec = item.execution_time_ms ? `${(item.execution_time_ms / 1000).toFixed(1)}s` : '';
        const modeId = Modes ? Modes.normalizeModeId(item.extraction_mode) : 'comprehensive';
        const modeCfg = Modes ? Modes.getModeConfig(modeId) : null;
        const isElite = modeId === 'advanced_native';
        const isDone = Boolean(item.isCompleted ?? item.is_completed);
        return `
          <div class="library-note-card${isDone ? ' is-item-completed' : ''}" data-id="${escapeHtml(item.id)}">
            <div class="card-top">
              <div class="card-title-row">
                <h4 class="lib-card-title" data-action="open">${escapeHtml(item.title)}</h4>
              </div>
              ${item.source_url ? `<div class="lib-card-source" title="${escapeHtml(item.source_url)}">${escapeHtml(item.source_url)}</div>` : ''}
              <div class="card-badges-row">
                ${modeCfg ? `<span class="card-badge ${isElite ? 'elite' : ''}">${escapeHtml(modeCfg.badgeLabel)}</span>` : ''}
                <span class="card-badge gold">${item.vocab_count || 0} ${isElite ? 'Words & Verbs' : 'Tech Terms'}</span>
                <span class="card-badge">${item.idioms_count || 0} Idioms</span>
                ${!isElite && item.patterns_count ? `<span class="card-badge">${item.patterns_count} Patterns</span>` : ''}
                <span class="card-badge">${escapeHtml(item.model_name || 'default')}</span>
                ${timeSec ? `<span class="card-badge">${timeSec}</span>` : ''}
              </div>
            </div>

            <div class="card-actions-row">
              <span style="font-size: 0.74rem; color: var(--ink-muted);">${dateStr}</span>
              <div class="card-actions-right">
                ${renderLexCheckBtn(isDone, `data-lex-note-complete="${escapeHtml(item.id)}"`)}
                <button type="button" class="btn-vox btn-sm" data-action="open">Study Note</button>
                <button type="button" class="btn-card-del" data-action="delete" title="Delete from history">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    grid.querySelectorAll('.library-note-card').forEach((card) => {
      const id = card.dataset.id;
      const title = card.querySelector('.lib-card-title')?.textContent || '';

      const checkBtn = card.querySelector('[data-lex-note-complete]');
      if (checkBtn) {
        checkBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleLexiconNoteCompletion(id);
        });
      }

      card.querySelectorAll('[data-action="open"]').forEach((el) => {
        el.addEventListener('click', () => openExtractionNote(id));
      });

      const delBtn = card.querySelector('[data-action="delete"]');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleDeleteExtraction(id, title);
        });
      }
    });
  }

  async function openExtractionNote(id, opts = {}) {
    if (!id) return;
    try {
      const full = await apiFetch(`/api/tech-linguist/extractions/${encodeURIComponent(id)}`, {
        method: 'GET',
      });
      if (full && full.data) {
        techState.currentResult = full.data;
        renderExtractionResult(full.data, opts);
      }
    } catch (err) {
      console.error('Failed to load extraction:', err);
      showToast(`Could not open note: ${err.message}`);
      if (opts.replace) {
        switchLexiconView('extract', { replace: true });
      }
    }
  }

  async function handleDeleteExtraction(id, title) {
    if (!global.confirm(`Are you sure you want to remove "${title}" from your saved extractions?`)) {
      return;
    }

    try {
      await apiFetch(`/api/tech-linguist/extractions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (techState.currentResult && techState.currentResult.id === id) {
        techState.currentResult = null;
        const tabNote = document.getElementById('view-tab-note');
        if (tabNote) tabNote.hidden = true;
        switchLexiconView('library');
      }

      await loadHistory();
      showToast(`Deleted "${title}"`);
    } catch (err) {
      showToast(`Failed to delete note: ${err.message}`);
    }
  }

  /* ========================================================================
     EVENT WIRING
     ======================================================================== */

  function setupEvents() {
    if (techState.eventsBound) return;
    techState.eventsBound = true;

    document.getElementById('view-tab-extract')?.addEventListener('click', () => switchLexiconView('extract'));
    document.getElementById('view-tab-note')?.addEventListener('click', () => switchLexiconView('note'));
    document.getElementById('view-tab-library')?.addEventListener('click', () => switchLexiconView('library'));

    document.getElementById('btn-back-to-extract')?.addEventListener('click', () => switchLexiconView('extract'));
    document.getElementById('btn-note-new-extract')?.addEventListener('click', () => switchLexiconView('extract'));
    document.getElementById('btn-jump-to-library')?.addEventListener('click', () => switchLexiconView('library'));
    document.getElementById('btn-empty-extract')?.addEventListener('click', () => switchLexiconView('extract'));

    const tabUrl = document.getElementById('tab-src-url');
    const tabText = document.getElementById('tab-src-text');
    const panelUrl = document.getElementById('linguist-input-url-panel');
    const panelText = document.getElementById('linguist-input-text-panel');

    if (tabUrl && tabText) {
      tabUrl.addEventListener('click', () => {
        tabUrl.classList.add('active');
        tabText.classList.remove('active');
        if (panelUrl) panelUrl.hidden = false;
        if (panelText) panelText.hidden = true;
        techState.activeSourceTab = 'url';
      });

      tabText.addEventListener('click', () => {
        tabText.classList.add('active');
        tabUrl.classList.remove('active');
        if (panelText) panelText.hidden = false;
        if (panelUrl) panelUrl.hidden = true;
        techState.activeSourceTab = 'text';
      });
    }

    const urlInput = document.getElementById('linguist-url-input');
    document.getElementById('linguist-paste-btn')?.addEventListener('click', async () => {
      if (!urlInput) return;
      try {
        const text = await navigator.clipboard.readText();
        if (text) urlInput.value = text.trim();
      } catch {
        urlInput.focus();
      }
    });

    document.getElementById('demo-chip-nyc-tech')?.addEventListener('click', () => {
      if (!urlInput) return;
      urlInput.value = 'https://www.youtube.com/watch?v=C89c0fsHYIQ';
      urlInput.focus();
    });

    document.getElementById('demo-chip-grok-tech')?.addEventListener('click', () => {
      if (!urlInput) return;
      urlInput.value = 'https://www.youtube.com/shorts/eVkg_U_beZo';
      urlInput.focus();
    });

    document.getElementById('btn-err-dismiss')?.addEventListener('click', () => hideLexiconError());
    document.getElementById('btn-err-retry-fallback')?.addEventListener('click', () => {
      hideLexiconError();
      handleRunExtraction();
    });

    document.getElementById('lexicon-mode-selector')?.addEventListener('click', (e) => {
      const card = e.target.closest('.lexicon-mode-card[data-extraction-mode]');
      if (!card) return;
      selectExtractionMode(card.dataset.extractionMode);
    });

    document.querySelectorAll('.res-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchResultsTab(btn.dataset.tab));
    });

    document.getElementById('lexicon-table-search')?.addEventListener('input', (e) => {
      techState.tableSearchQuery = e.target.value.trim().toLowerCase();
      if (techState.currentResult) {
        renderVocabTable(techState.currentResult.vocabItems || []);
        renderIdiomsTable(techState.currentResult.idiomItems || []);
        const Modes = getModesApi();
        const curMode = techState.currentResult.extractionMode || 'comprehensive';
        if (!Modes || Modes.isTabVisible(curMode, 'transcript')) {
          renderInteractiveTranscript(techState.currentResult.fullTranscript || '');
        }
      }
    });

    document.getElementById('lexicon-category-filters')?.addEventListener('click', (e) => {
      const pill = e.target.closest('.lex-cat-pill[data-category]');
      if (!pill) return;
      techState.activeCategoryFilter = pill.dataset.category || 'all';
      renderCategoryFilters(techState.currentResult?.vocabItems || []);
      renderVocabTable(techState.currentResult?.vocabItems || []);
    });

    document.getElementById('lexicon-idiom-category-filters')?.addEventListener('click', (e) => {
      const pill = e.target.closest('.lex-cat-pill[data-category]');
      if (!pill) return;
      techState.activeIdiomCategoryFilter = pill.dataset.category || 'all';
      renderIdiomCategoryFilters(techState.currentResult?.idiomItems || []);
      renderIdiomsTable(techState.currentResult?.idiomItems || []);
    });

    document.getElementById('lexicon-lookup-lang')?.addEventListener('change', (e) => {
      const val = e.target.value || 'ar';
      localStorage.setItem('flaptap_trans_lang', val);
      showToast('Word lookup language switched');
    });

    document.getElementById('lexicon-library-search')?.addEventListener('input', (e) => {
      techState.librarySearchQuery = e.target.value.trim().toLowerCase();
      renderLibraryGrid();
    });

    document.getElementById('linguist-results-card')?.addEventListener('click', (e) => {
      const checkBtn = e.target.closest('[data-lex-check-subject]');
      if (checkBtn) {
        e.stopPropagation();
        const subject = checkBtn.getAttribute('data-lex-check-subject');
        const index = Number(checkBtn.getAttribute('data-lex-check-index'));
        if (subject && Number.isInteger(index)) {
          toggleLexiconItemCompletion(subject, index);
        }
        return;
      }

      const speakBtn = e.target.closest('[data-lex-speak]');
      if (speakBtn) {
        e.stopPropagation();
        const text = speakBtn.dataset.lexSpeak || '';
        if (text && global.FlaptapWordLookup) {
          global.FlaptapWordLookup.speakText(text);
        }
        return;
      }

      const saveBtn = e.target.closest('[data-lex-save-kind]');
      if (saveBtn) {
        e.stopPropagation();
        const kind = saveBtn.dataset.lexSaveKind;
        const idx = Number(saveBtn.dataset.lexSaveIndex);
        const cur = techState.currentResult;
        if (!cur) return;
        const item =
          kind === 'vocab'
            ? (cur.vocabItems || []).find((v) => v.index === idx)
            : (cur.idiomItems || []).find((i) => i.index === idx);
        if (item) {
          saveLexiconItemToVocabulary(item, kind);
        }
        return;
      }

    });

    const resultsCard = document.getElementById('linguist-results-card');
    if (resultsCard && global.FlaptapWordLookup?.bindSelectionLookup) {
      global.FlaptapWordLookup.bindSelectionLookup(resultsCard, {
        maxLength: 320,
        onSelect: (text, meta) => {
          const node = meta?.range?.startContainer;
          const element = node?.nodeType === 1 ? node : node?.parentElement;
          const word = element?.closest('.clickable-word');
          openLexiconWordLookup(text, word?.dataset.contextSentence || text, null);
        },
      });
    }

    document.getElementById('res-save-all-vocab-btn')?.addEventListener('click', () => handleSaveAllToFlashcards());

    document.getElementById('btn-open-video-lesson')?.addEventListener('click', () => {
      const srcUrl = techState.currentResult?.sourceUrl;
      if (!srcUrl) return;
      router()?.navigate('lessons');
      const lessonInput = document.getElementById('youtube-url-input');
      if (lessonInput) {
        lessonInput.value = srcUrl;
        lessonInput.dispatchEvent(new Event('input', { bubbles: true }));
        lessonInput.focus();
      }
    });

    document.getElementById('res-copy-md-btn')?.addEventListener('click', () => handleCopyStudyNotes());
    document.getElementById('linguist-refresh-history-btn')?.addEventListener('click', () => loadHistory());

    global.addEventListener('flaptap:languages-loaded', populateLookupLanguageSelect);
    global.addEventListener('flaptap:auth-changed', () => {
      populateLookupLanguageSelect();
      if (techState.initialized) loadHistory();
    });
  }

  global.FlaptapTechLexicon = {
    init,
    applyRouteState,
    switchView: switchLexiconView,
    openExtractionNote,
    loadHistory,
    updateSaveButtons: updateLexiconSaveButtons,
    getState: () => techState,
  };
})(window);
