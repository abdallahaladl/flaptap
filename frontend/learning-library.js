/* ==========================================================================
   FLAPTAP LEARNING LIBRARY (learning-library.js)
   Centralized Editorial Generation & Study Workspace (Synced with Lessons UX)
   ========================================================================== */

(function (global) {
  'use strict';

  const P = global.FlaptapPagination;
  const PRESET_COUNTS = [3, 5, 8, 12, 20];
  const PAGE_SIZE_OPTIONS = [10, 20, 50];
  const DEFAULT_PAGE_SIZE = P?.DEFAULT_PAGE_SIZE || 10;

  function readSavedPageSize() {
    try {
      const n = Number(localStorage.getItem('flaptap_ll_page_size'));
      return PAGE_SIZE_OPTIONS.includes(n) ? n : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  }

  const llState = {
    initialized: false,
    domainsLoaded: false,
    domains: [],
    aiSelector: null,
    activeDomainId: 'natural_american_english',
    activeView: 'generate', // 'generate' | 'browse' (used for /library vs /library/browse deep-link)
    requestedCount: 8,
    genCategoryId: 'all',
    genRegister: '',
    focusTopic: '',
    targetLanguage: localStorage.getItem('flaptap_trans_lang') || 'ar',
    isGenerating: false,
    abortController: null,
    elapsedTimer: null,
    streamingItems: [],
    justGeneratedIds: new Set(),
    // Library & Pagination State
    items: [],
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
    browseCategoryId: 'all',
    browseMastery: 'all', // 'all' | 'pending' | 'completed' | 'favorites'
    browseRegister: 'all',
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
      localStorage.getItem('flaptap_ll_view_mode') || (window.innerWidth < 720 ? 'cards' : 'table'),
    recallMaskMode: false,
    revealedCardIds: new Set(),
    activeStudyItemId: null,
  };

  let searchDebounceTimer = null;
  let inflightDomainsPromise = null;
  let libraryLoadSeq = 0;
  let lastAuthUserId = null;

  const skeletonGate = P.createSkeletonGate(190);
  const scrollRestorer = P.createScrollRestorer({
    storageKey: 'flaptap_ll_scroll_v1',
    isActive: () =>
      document.body?.dataset?.activeSection === 'learning-library' &&
      !llState.isLoadingList &&
      llState.hasLoadedOnce,
    getContainer: () => document.getElementById('ll-browse-items-container'),
  });
  const paginationBar = P.createBar({
    barId: 'll-browse-pagination',
    infoId: 'll-page-info',
    numbersId: 'll-page-numbers',
    prevId: 'll-page-prev-btn',
    nextId: 'll-page-next-btn',
    pageSizePillsId: 'll-page-size-pills',
    pageAttr: 'data-ll-page',
    pageSizeAttr: 'data-ll-page-size',
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  });

  function ws() {
    return global.FlaptapWorkspace || null;
  }

  function router() {
    return global.FlaptapRouter || null;
  }

  const U = global.FlaptapUtils;
  const escapeHtml = U.escapeHtml;

  function icon(name, options) {
    return global.FlaptapIcon ? global.FlaptapIcon(name, options) : '';
  }

  function getActiveDomain() {
    return (
      llState.domains.find((d) => d.id === llState.activeDomainId) ||
      llState.domains[0] ||
      null
    );
  }

  function capitalize(str) {
    const s = String(str || '');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  function showToast(msg) {
    U.showToast(msg);
  }

  async function apiFetch(url, options) {
    return U.apiFetch(url, options);
  }

  function getCurrentUser() {
    return ws()?.getUser?.() || null;
  }

  function isDistinctLabel(a, b) {
    const x = String(a || '').trim().toLowerCase();
    const y = String(b || '').trim().toLowerCase();
    return Boolean(x && x !== y);
  }

  function renderCheckButton(checked, itemId, pillLabel) {
    if (global.FlaptapCheck?.buttonHtml) {
      return global.FlaptapCheck.buttonHtml({
        checked,
        pillLabel: pillLabel || '',
        attrs: `data-ll-toggle-complete="${escapeHtml(itemId)}"`,
      });
    }
    if (ws()?.renderCheckButtonHtml) {
      return ws().renderCheckButtonHtml({
        checked,
        pillLabel: pillLabel || '',
        attrs: `data-ll-toggle-complete="${escapeHtml(itemId)}"`,
      });
    }
    const cls = `item-check-btn${pillLabel ? ' item-check-btn--pill' : ''}${checked ? ' is-checked' : ''}`;
    return `<button type="button" class="${cls}" data-ll-toggle-complete="${escapeHtml(itemId)}" aria-pressed="${checked ? 'true' : 'false'}" aria-label="Mark expression complete" title="Mark expression complete"><svg class="ft-check-svg chk-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path class="ft-check-tick chk-tick" d="M5.2 12.75 L9.55 17.1 Q10.1 17.65 10.65 17.05 L18.9 7.35" pathLength="1" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>${pillLabel ? `<span>${escapeHtml(pillLabel)}</span>` : ''}</button>`;
  }

  const CATEGORY_TONE_MAP = {
    fillers_hesitation: 'orange',
    modern_slang: 'orange',
    casual_reactions_banter: 'orange',
    connected_speech_reductions: 'teal',
    everyday_phrasal_expressions: 'teal',
    concurrency_async: 'teal',
    networking_distributed: 'teal',
    sentence_starters_frames: 'indigo',
    architecture_systems: 'indigo',
    data_structures_algorithms: 'indigo',
    testing_reliability: 'green',
    security_auth: 'green',
    devops_cloud: 'green',
    discourse_markers: 'blue',
    softeners_hedges: 'blue',
    storytelling_transitions: 'blue',
  };

  function getCategoryTone(categoryId) {
    const key = String(categoryId || '').trim().toLowerCase();
    return CATEGORY_TONE_MAP[key] || 'blue';
  }

  function highlightExpressionInSentence(sentence, expression, spokenForm) {
    const text = String(sentence || '');
    if (!text) return '';

    const rawCandidates = [spokenForm, expression]
      .map((s) =>
        String(s || '')
          .replace(/\[[^[\]]*\]/g, ' ')
          .replace(/[?.!,;:]+$/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter((s) => s.length >= 3);

    for (const candidate of rawCandidates) {
      const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]");
      let regex;
      try {
        regex = new RegExp(
          `(?<![\\p{L}\\p{N}_])(${escaped}(?:['’]?s|es|ed|d|ing|er|ers)?)(?![\\p{L}\\p{N}_])`,
          'giu',
        );
      } catch {
        continue;
      }
      const matches = Array.from(text.matchAll(regex));
      if (matches.length === 0) continue;

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

    return escapeHtml(text);
  }

  function tokenizeExampleSentence(sentence, itemId, expression, spokenForm) {
    const highlightedHtml = highlightExpressionInSentence(sentence, expression, spokenForm);
    if (global.FlaptapWordLookup?.tokenizeClickableWords) {
      return global.FlaptapWordLookup.tokenizeClickableWords(highlightedHtml, {
        contextSentence: sentence,
        llItemId: itemId,
      });
    }
    return highlightedHtml;
  }

  /** Slot names in order of appearance, e.g. "run [X] against [Y]" -> ["X", "Y"]. */
  function extractSlotNames(text) {
    const names = [];
    const source = String(text || '');
    const re = /\[([^[\]]{1,40})\]/g;
    let match;
    while ((match = re.exec(source))) {
      const name = match[1].replace(/\s+/g, ' ').trim();
      if (!name) continue;
      if (names.some((n) => n.toLowerCase() === name.toLowerCase())) continue;
      names.push(name);
      if (names.length >= 4) break;
    }
    return names;
  }

  /** Render an expression/translation, wrapping reusable [slots] as tokens. */
  function renderSlotizedText(text) {
    const normalized = String(text || '').replace(/(\[[^[\]]{1,40}\])\s+([?!.,;:])/g, '$1$2');
    return escapeHtml(normalized).replace(/\[([^[\]]{1,40})\]/g, (_match, name) => {
      return `<span class="ll-slot" dir="ltr">[${name}]</span>`;
    });
  }

  /** "[doing X]" and "X" are the same slot; "[X]" and "[Y]" are not. */
  function slotNamesMatch(a, b) {
    const normalize = (value) =>
      String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const left = normalize(a);
    const right = normalize(b);
    if (!left || !right) return false;
    if (left === right) return true;
    const leftTokens = left.split(' ');
    const rightTokens = right.split(' ');
    if (leftTokens.length === 1 || rightTokens.length === 1) {
      return leftTokens[leftTokens.length - 1] === rightTokens[rightTokens.length - 1];
    }
    return left.includes(right) || right.includes(left);
  }

  function patternHeadingLabel() {
    return getActiveDomain()?.uiLabels?.patternHeading || 'Reusable Pattern';
  }

  /** Speak the filled natural line when the title is a slot template. */
  function getSpeakableText(item) {
    if (!item) return '';
    const expression = String(item.expression || '');
    if (extractSlotNames(expression).length > 0 && item.spokenForm) {
      return String(item.spokenForm);
    }
    return expression;
  }

  /**
   * One reusable frame per item: expression slots with their roles, or (for
   * items generated before slots existed) the first stored usage pattern.
   */
  function getPatternGuide(item) {
    if (!item) return null;
    const expressionSlots = extractSlotNames(item.expression);
    if (expressionSlots.length > 0) {
      const stored = (Array.isArray(item.patternSlots) ? item.patternSlots : [])
        .filter((slot) => slot && String(slot.slot || '').trim())
        .map((slot) => ({
          slot: String(slot.slot).replace(/[[\]]/g, '').trim(),
          role: String(slot.role || '').trim(),
          example: String(slot.example || '').trim(),
        }));
      return {
        kind: 'slots',
        slots: expressionSlots.map((name) => {
          const match = stored.find((s) => slotNamesMatch(s.slot, name));
          return {
            slot: name,
            role: match?.role || '',
            example: match?.example || '',
          };
        }),
      };
    }

    const usage = (Array.isArray(item.usagePatterns) ? item.usagePatterns : []).find(
      (pattern) =>
        pattern &&
        String(pattern.pattern || '').trim() &&
        String(pattern.pattern).replace(/\s+/g, ' ').trim().toLowerCase() !==
          String(item.expression || '').replace(/\s+/g, ' ').trim().toLowerCase(),
    );
    if (!usage) return null;
    return {
      kind: 'usage',
      pattern: String(usage.pattern).trim(),
      note: String(usage.meaning || '').trim(),
    };
  }

  function renderPatternGuideHtml(item, { stacked = false, onlySlots = false } = {}) {
    const guide = getPatternGuide(item);
    if (!guide) return '';
    if (guide.kind === 'usage' && onlySlots) return '';
    const classes = `ll-pattern-guide${stacked ? ' is-stacked' : ''}${guide.kind === 'usage' ? ' is-usage' : ''}`;
    const label = `<span class="ll-pattern-guide-label">${escapeHtml(patternHeadingLabel())}</span>`;

    if (guide.kind === 'usage') {
      return `<div class="${classes}" dir="ltr">
        ${label}
        <span class="ll-pattern-guide-formula">${renderSlotizedText(guide.pattern)}</span>
        ${guide.note ? `<span class="ll-pattern-guide-note">${escapeHtml(guide.note)}</span>` : ''}
      </div>`;
    }

    const chips = guide.slots
      .map(
        (slot) => `<span class="ll-slot-chip">
          <span class="ll-slot-chip-token" dir="ltr">[${escapeHtml(slot.slot)}]</span>
          ${slot.role ? `<span class="ll-slot-chip-role">${escapeHtml(slot.role)}</span>` : ''}
          ${slot.example ? `<span class="ll-slot-chip-example" dir="ltr">e.g. ${escapeHtml(slot.example)}</span>` : ''}
        </span>`,
      )
      .join('');
    return `<div class="${classes}" dir="ltr">
      ${label}
      <div class="ll-pattern-chips">${chips}</div>
    </div>`;
  }

  /* ========================================================================
     INITIALIZATION & DOMAIN LOADING
     ======================================================================== */

  function readRoutePage(routeState) {
    const raw = Number(routeState?.searchParams?.get?.('page'));
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  }

  function syncLibraryRoute(replace = true) {
    const r = router();
    if (!r?.updateSubroute) return;
    const opts = {
      subview: llState.activeView,
      domainId: llState.activeDomainId,
      replace,
    };
    if (llState.page > 1) {
      opts.extraQuery = { page: llState.page };
    }
    r.updateSubroute('learning-library', opts);
  }

  async function init(routeState) {
    if (!llState.initialized) {
      llState.initialized = true;
      bindEvents();
      mountAiSelector();
      populateLanguagesSelect();
      syncGenerateButtonLabel();
      syncViewModeButtons();
    }

    if (getCurrentUser()) {
      lastAuthUserId = getCurrentUser()?.id || null;
    }

    const activeRoute = routeState || router()?.getCurrentRoute?.();
    if (activeRoute?.domainId) {
      llState.activeDomainId = activeRoute.domainId;
    }
    const routePage = readRoutePage(activeRoute);
    if (routePage !== llState.page) {
      llState.page = routePage;
    }

    // Launch domain catalog + AI model discovery in parallel so list fetch
    // never stalls behind model probing on entry.
    const prereqTasks = [];
    if (!llState.domainsLoaded) {
      prereqTasks.push(loadDomainsCatalog());
    }
    if (llState.aiSelector) {
      prereqTasks.push(llState.aiSelector.init());
    }

    const wasPendingRestore = scrollRestorer.hasPending();

    if (activeRoute) {
      await applyRouteState(activeRoute, { deferScrollReset: wasPendingRestore });
    } else if (getCurrentUser()) {
      await loadLibraryItems({ showSkeleton: true, animate: !wasPendingRestore });
    } else {
      llState.isLoadingList = false;
      renderBrowseAuthState();
    }

    if (prereqTasks.length > 0) {
      await Promise.all(prereqTasks);
      syncGenerateButtonLabel();
      if (getCurrentUser()) renderBrowseFilters();
    }

    scrollRestorer.finishRestore();
  }

  async function applyRouteState(routeState, options = {}) {
    if (!routeState || routeState.section !== 'learning-library') return;

    if (
      routeState.domainId &&
      routeState.domainId !== llState.activeDomainId &&
      (!llState.domainsLoaded || llState.domains.some((d) => d.id === routeState.domainId))
    ) {
      llState.activeDomainId = routeState.domainId;
      llState.genCategoryId = 'all';
      llState.genRegister = '';
      llState.browseCategoryId = 'all';
      llState.browseRegister = 'all';
      renderDomainSwitcher();
      renderDomainContext();
    }

    llState.page = readRoutePage(routeState);
    llState.activeView = routeState.subview === 'browse' ? 'browse' : 'generate';

    const skipEntranceAnim = Boolean(options.deferScrollReset || scrollRestorer.hasPending());
    if (getCurrentUser()) {
      await loadLibraryItems({ showSkeleton: true, animate: !skipEntranceAnim });
    } else {
      llState.isLoadingList = false;
      renderBrowseAuthState();
    }

    if (llState.activeView === 'browse' && !options.deferScrollReset && !scrollRestorer.hasPending()) {
      const shelf = document.getElementById('ll-library-shelf');
      if (shelf) {
        requestAnimationFrame(() => {
          P.scrollToTop(shelf, { force: true });
        });
      }
    }
  }

  async function loadDomainsCatalog() {
    if (llState.domainsLoaded) return;
    if (inflightDomainsPromise) return inflightDomainsPromise;
    inflightDomainsPromise = (async () => {
      try {
        const res = await apiFetch('/api/learning-library/domains', { method: 'GET' });
        llState.domains = Array.isArray(res?.domains) ? res.domains : [];
        if (res?.defaultDomainId && !llState.domains.some((d) => d.id === llState.activeDomainId)) {
          llState.activeDomainId = res.defaultDomainId;
        }
        llState.domainsLoaded = true;
        renderDomainSwitcher();
        renderDomainContext();
        syncGenerateButtonLabel();
      } catch (err) {
        console.error('Failed to load Learning Library domains:', err);
      } finally {
        inflightDomainsPromise = null;
      }
    })();
    return inflightDomainsPromise;
  }

  function populateLanguagesSelect() {
    const sel = document.getElementById('ll-target-lang-select');
    if (!sel) return;
    const langs = ws()?.getLanguages?.() || [];
    const userLang = getCurrentUser()?.nativeLanguage || localStorage.getItem('flaptap_trans_lang') || 'ar';
    llState.targetLanguage = userLang;

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
    if (llState.aiSelector || !global.FlaptapAiSelector) return;
    const mount = document.getElementById('ll-ai-selector-mount');
    if (!mount) return;

    llState.aiSelector = global.FlaptapAiSelector.create({
      container: mount,
      idPrefix: 'll-aisel',
      persistenceKey: 'learning_library',
      title: 'AI Model',
      compact: true,
      showRunButton: false,
      hideMetaChips: true,
      fetcher: apiFetch,
      onToast: showToast,
    });
  }

  function buildGenerateBtnLabel() {
    const domain = getActiveDomain();
    const noun =
      llState.requestedCount === 1
        ? domain?.itemNounSingular || 'expression'
        : domain?.itemNounPlural || 'expressions';
    return `Generate ${llState.requestedCount} ${capitalize(noun)}`;
  }

  function syncGenerateButtonLabel() {
    const lbl = document.getElementById('ll-generate-btn-label');
    if (lbl) lbl.textContent = buildGenerateBtnLabel();
  }

  function syncViewModeButtons() {
    const cardsBtn = document.getElementById('ll-view-cards-btn');
    const tableBtn = document.getElementById('ll-view-table-btn');
    const isTable = llState.viewMode === 'table';
    tableBtn?.classList.toggle('active', isTable);
    tableBtn?.setAttribute('aria-pressed', isTable ? 'true' : 'false');
    cardsBtn?.classList.toggle('active', !isTable);
    cardsBtn?.setAttribute('aria-pressed', !isTable ? 'true' : 'false');
  }

  /* ========================================================================
     DOMAIN & COMMAND DESK RENDERING
     ======================================================================== */

  function renderDomainSwitcher() {
    const container = document.getElementById('ll-domain-pills');
    if (!container) return;

    const domainIcon = (id) =>
      id === 'programming_terminology' ? 'file-code' : id === 'technical_vocabulary' ? 'type' : 'graduation-cap';

    container.innerHTML = llState.domains
      .map((d) => {
        const active = d.id === llState.activeDomainId;
        return `<button type="button" class="lexicon-view-tab filter-pill ${active ? 'active' : ''}" data-ll-domain="${escapeHtml(d.id)}" aria-pressed="${active ? 'true' : 'false'}">${icon(domainIcon(d.id))}<span>${escapeHtml(d.title)}</span></button>`;
      })
      .join('');
  }

  function renderDomainContext() {
    const domain = getActiveDomain();
    if (!domain) return;

    const kickerEl = document.getElementById('ll-domain-kicker');
    const headlineEl = document.getElementById('ll-domain-headline');
    const subcopyEl = document.getElementById('ll-domain-subcopy');
    const capHintEl = document.getElementById('ll-source-cap-hint');
    const focusInput = document.getElementById('ll-focus-topic-input');
    const libHeadingEl = document.getElementById('ll-library-heading');
    const libSubEl = document.getElementById('ll-library-sub');

    if (kickerEl) kickerEl.textContent = domain.title;
    if (headlineEl) {
      headlineEl.textContent = domain.title;
    }
    if (subcopyEl) subcopyEl.textContent = domain.subtitle;
    if (capHintEl) {
      const catCount = Array.isArray(domain.categories) ? domain.categories.length : 8;
      const regCount = Array.isArray(domain.registers) ? domain.registers.length : 5;
      capHintEl.textContent = `${catCount} categories · ${regCount} spoken registers · IPA & reusable [X] patterns`;
    }
    if (libHeadingEl) {
      const plural = capitalize(domain.itemNounPlural || 'Expressions');
      libHeadingEl.textContent = `${plural} Library`;
      const statTotalLabel = document.getElementById('ll-stat-total-label');
      if (statTotalLabel) statTotalLabel.textContent = `Saved ${plural}`;
    }
    if (libSubEl) {
      libSubEl.textContent = `${domain.title} · Source-grounded usage, IPA, spoken reductions, and reusable patterns`;
    }
    if (focusInput && domain.suggestedFocusTopics?.length) {
      focusInput.placeholder = `Optional focus (e.g. ${domain.suggestedFocusTopics[0]})`;
    }

    renderCountControls();
    renderGenCategorySelect();
    renderGenRegisters();
    syncGenerateButtonLabel();
  }

  function renderCountControls() {
    const pillsWrap = document.getElementById('ll-count-pills');
    const inputEl = document.getElementById('ll-count-input');
    if (pillsWrap) {
      pillsWrap.innerHTML = PRESET_COUNTS.map((num) => {
        const active = Number(llState.requestedCount) === num;
        return `<button type="button" class="ll-count-pill ${active ? 'active' : ''}" data-ll-count="${num}">${num}</button>`;
      }).join('');
    }
    if (inputEl) {
      inputEl.value = String(llState.requestedCount);
    }
  }

  function renderGenCategorySelect() {
    const sel = document.getElementById('ll-gen-category-select');
    const domain = getActiveDomain();
    if (!sel || !domain) return;

    sel.innerHTML =
      `<option value="all">All Categories</option>` +
      domain.categories
        .map((cat) => `<option value="${escapeHtml(cat.id)}">${escapeHtml(cat.label)}</option>`)
        .join('');
    sel.value = llState.genCategoryId || 'all';
  }

  function renderGenRegisters() {
    const sel = document.getElementById('ll-register-select');
    const domain = getActiveDomain();
    if (!sel || !domain) return;
    sel.innerHTML =
      `<option value="">Any Register</option>` +
      domain.registers
        .map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`)
        .join('');
    sel.value = llState.genRegister || '';
  }

  function switchView(viewName, opts = {}) {
    llState.activeView = viewName === 'browse' ? 'browse' : 'generate';

    if (!opts.skipUrlSync) {
      router()?.updateSubroute('learning-library', {
        subview: llState.activeView,
        domainId: llState.activeDomainId,
        replace: Boolean(opts.replace),
      });
    }

    if (llState.activeView === 'browse') {
      document.getElementById('ll-library-shelf')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /* ========================================================================
     GENERATION FLOW & AUTH GATE RESUME
     ======================================================================== */

  function collectGenerationPayload() {
    const focusInput = document.getElementById('ll-focus-topic-input');
    const langSelect = document.getElementById('ll-target-lang-select');
    const regSelect = document.getElementById('ll-register-select');
    const catSelect = document.getElementById('ll-gen-category-select');
    const aiSel = llState.aiSelector
      ? llState.aiSelector.getSelection()
      : { keyId: '', model: '', variant: '' };

    return {
      domainId: llState.activeDomainId,
      count: llState.requestedCount,
      categoryId: catSelect?.value || llState.genCategoryId || 'all',
      focusTopic: (focusInput?.value || llState.focusTopic || '').trim(),
      register: (regSelect?.value || llState.genRegister || '').trim(),
      targetLanguage: langSelect?.value || llState.targetLanguage || 'ar',
      keyId: aiSel.keyId || undefined,
      model: aiSel.model || undefined,
      variant: aiSel.variant || undefined,
    };
  }

  function showGenError(title, msg, canRetry) {
    const box = document.getElementById('ll-inline-error');
    const tEl = document.getElementById('ll-inline-err-title');
    const mEl = document.getElementById('ll-inline-err-msg');
    const retryBtn = document.getElementById('ll-btn-err-retry');
    if (box && tEl && mEl) {
      tEl.textContent = title || 'Generation Error';
      mEl.textContent = msg || 'Unable to generate expressions.';
      if (retryBtn) retryBtn.hidden = !canRetry;
      box.hidden = false;
    }
  }

  function hideGenError() {
    const box = document.getElementById('ll-inline-error');
    if (box) box.hidden = true;
  }

  async function handleGenerateClick() {
    const payload = collectGenerationPayload();

    if (ws()?.requireAuthBeforeAction) {
      const ok = ws().requireAuthBeforeAction(
        { type: 'learning_library_generate', payload },
        'Sign in or create an account to generate and permanently save expressions in Generate Phrases.',
      );
      if (!ok) return;
    }

    await executeGeneration(payload);
  }

  async function resumeGeneration(payload) {
    if (!payload) return;
    await init();

    if (payload.domainId && llState.domains.some((d) => d.id === payload.domainId)) {
      llState.activeDomainId = payload.domainId;
      renderDomainSwitcher();
      renderDomainContext();
    }
    if (payload.count) {
      llState.requestedCount = Math.max(1, Math.min(25, Number(payload.count) || 8));
      renderCountControls();
    }
    if (payload.categoryId) {
      llState.genCategoryId = payload.categoryId;
      renderGenCategorySelect();
    }
    const focusInput = document.getElementById('ll-focus-topic-input');
    if (focusInput && typeof payload.focusTopic === 'string') {
      focusInput.value = payload.focusTopic;
    }
    const langSelect = document.getElementById('ll-target-lang-select');
    if (langSelect && payload.targetLanguage) {
      langSelect.value = payload.targetLanguage;
    }
    if (llState.aiSelector && (payload.keyId || payload.model || payload.variant)) {
      await llState.aiSelector.setSelection({
        keyId: payload.keyId,
        model: payload.model,
        variant: payload.variant,
      });
    }
    syncGenerateButtonLabel();
    await executeGeneration(payload);
  }

  function setProgressUi(pct, counterText, titleText, subText) {
    const fill = document.getElementById('ll-progress-fill');
    const roleEl = document.getElementById('ll-progress-bar-role');
    const counterEl = document.getElementById('ll-progress-counter');
    const titleEl = document.getElementById('ll-progress-title');
    const subEl = document.getElementById('ll-progress-sub');

    const safePct = Math.max(4, Math.min(100, Math.round(pct)));
    if (fill) fill.style.width = `${safePct}%`;
    if (roleEl) roleEl.setAttribute('aria-valuenow', String(safePct));
    if (counterEl && counterText !== undefined) counterEl.textContent = counterText;
    if (titleEl && titleText !== undefined) titleEl.textContent = titleText;
    if (subEl && subText !== undefined) subEl.textContent = subText;
  }

  function cancelGeneration() {
    if (llState.abortController) {
      llState.abortController.abort();
    }
  }

  async function consumeSseGeneration(payload, signal, onEvent) {
    const headers = ws()?.getAuthHeaders
      ? ws().getAuthHeaders()
      : { 'Content-Type': 'application/json' };

    const res = await fetch('/api/learning-library/generate/stream', {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify(payload),
      signal,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const err = new Error(errBody?.message || `Generation failed (${res.status})`);
      err.status = res.status;
      err.code = errBody?.code;
      throw err;
    }

    if (!res.body || !res.body.getReader) {
      const fallbackJson = await apiFetch('/api/learning-library/generate', {
        method: 'POST',
        body: JSON.stringify(payload),
        signal,
      });
      onEvent('complete', fallbackJson);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const dispatchBlock = (block) => {
      const trimmed = block.trim();
      if (!trimmed) return;
      let eventName = 'message';
      const dataLines = [];
      for (const line of trimmed.split(/\r?\n/)) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }
      if (dataLines.length === 0) return;
      try {
        const parsed = JSON.parse(dataLines.join('\n'));
        onEvent(eventName, parsed);
      } catch {
        // Ignore malformed SSE comment/ping blocks
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';
      for (const block of blocks) {
        dispatchBlock(block);
      }
    }
    if (buffer.trim()) {
      dispatchBlock(buffer);
    }
  }

  function showLatestBatchBanner(result) {
    const banner = document.getElementById('ll-latest-batch-banner');
    const titleEl = document.getElementById('ll-latest-batch-title');
    const metaEl = document.getElementById('ll-latest-batch-meta');
    if (!banner) return;

    const count = result?.items?.length || result?.fulfilledCount || 0;
    if (count === 0) {
      banner.hidden = true;
      return;
    }
    const requested = Number(result?.requestedCount) || count;
    const shortfall = Math.max(0, requested - count);
    const sec = ((result?.batch?.executionTimeMs || 1000) / 1000).toFixed(1);
    const skipped = result?.skippedDuplicatesCount || 0;
    if (titleEl) {
      titleEl.textContent =
        shortfall > 0
          ? `Added ${count} of ${requested} requested expression${requested === 1 ? '' : 's'}`
          : `Added ${count} new expression${count === 1 ? '' : 's'} to your library`;
    }
    if (metaEl) {
      const parts = [`Completed in ${sec}s`];
      if (skipped > 0) {
        parts.push(`${skipped} duplicate${skipped === 1 ? '' : 's'} filtered out`);
      }
      if (shortfall > 0) {
        parts.push(`${shortfall} still missing — generate again to fill the gap`);
      } else if (skipped === 0) {
        parts.push('Highlighted at the top of your library below');
      }
      metaEl.textContent = parts.join(' · ');
    }
    banner.hidden = false;
  }

  async function executeGeneration(payload) {
    if (llState.isGenerating) return;
    hideGenError();

    const countVal = Number(payload.count) || llState.requestedCount;
    if (countVal < 1 || countVal > 25) {
      showGenError('Invalid Item Count', 'Choose between 1 and 25 items per generation.', false);
      return;
    }

    llState.isGenerating = true;
    llState.streamingItems = [];
    llState.justGeneratedIds.clear();
    const ac = new AbortController();
    llState.abortController = ac;

    const progressCard = document.getElementById('ll-progress-card');
    const elapsedEl = document.getElementById('ll-progress-elapsed');
    const liveEl = document.getElementById('ll-progress-live');
    const genBtn = document.getElementById('ll-generate-btn');
    const banner = document.getElementById('ll-latest-batch-banner');
    let liveCount = 0;

    const resetLiveStrip = () => {
      liveCount = 0;
      if (liveEl) {
        liveEl.innerHTML = '';
        liveEl.hidden = true;
      }
    };

    const appendLiveChip = (item) => {
      if (!liveEl || !item) return;
      liveCount += 1;
      const shown = liveEl.querySelectorAll('.ll-progress-live-chip').length;
      if (shown >= 10) {
        let more = liveEl.querySelector('.ll-progress-live-more');
        if (!more) {
          more = document.createElement('span');
          more.className = 'll-progress-live-chip ll-progress-live-more';
          liveEl.appendChild(more);
        }
        more.textContent = `+${liveCount - 10} more`;
        return;
      }
      const chip = document.createElement('span');
      chip.className = 'll-progress-live-chip';
      const index = document.createElement('span');
      index.className = 'll-live-index ltr-num';
      index.textContent = String(liveCount);
      chip.appendChild(index);
      chip.appendChild(document.createTextNode(item.expression || ''));
      liveEl.appendChild(chip);
      liveEl.hidden = false;
    };

    resetLiveStrip();

    const startTime = Date.now();
    clearInterval(llState.elapsedTimer);
    llState.elapsedTimer = setInterval(() => {
      if (elapsedEl) {
        elapsedEl.textContent = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
      }
    }, 100);

    if (progressCard) progressCard.hidden = false;
    if (banner) banner.hidden = true;
    if (genBtn) genBtn.disabled = true;
    llState.aiSelector?.setDisabled(true);
    if (elapsedEl) elapsedEl.textContent = '0.0s';

    const sel = llState.aiSelector?.getSelection() || {};
    const providerName = sel.providerName || 'AI Provider';
    const modelName = payload.model || sel.model || 'auto';
    setProgressUi(
      8,
      `0 / ${countVal} saved`,
      `Generating ${countVal} unique items via ${providerName}...`,
      `Checking against ${llState.stats.totalItems || 0} saved items to prevent duplicates.`,
    );

    let completedResult = null;
    let streamError = null;

    try {
      await consumeSseGeneration(payload, ac.signal, (eventName, ev) => {
        if (eventName === 'started') {
          resetLiveStrip();
          setProgressUi(
            12,
            `0 / ${ev.requestedCount || countVal} saved`,
            `Generating with ${ev.provider || providerName} (${ev.model || modelName})...`,
            `Direct API call · duplicate protection against your saved library.`,
          );
          return;
        }

        if (eventName === 'chunk') {
          const fresh = Array.isArray(ev.newItems) ? ev.newItems : [];
          for (const item of fresh) {
            llState.justGeneratedIds.add(item.id);
            llState.streamingItems.push(item);
            appendLiveChip(item);
          }

          const pct = Math.max(
            15,
            Math.min(96, Math.round((ev.totalSavedCount / (ev.requestedCount || countVal)) * 100)),
          );
          const targetCount = ev.requestedCount || countVal;
          setProgressUi(
            pct,
            `${ev.totalSavedCount} / ${targetCount} saved`,
            `Saved ${ev.totalSavedCount} of ${targetCount} expressions...`,
            ev.totalSavedCount >= targetCount
              ? 'All passes complete — finalizing your library.'
              : 'Direct API · each item is saved the moment it arrives.',
          );
          return;
        }

        if (eventName === 'complete') {
          completedResult = ev;
          return;
        }

        if (eventName === 'error') {
          streamError = new Error(ev?.message || 'Generation stream failed.');
        }
      });

      if (streamError) {
        throw streamError;
      }

      if (completedResult) {
        const fulfilled = Number(completedResult.fulfilledCount) || 0;
        const requested = Number(completedResult.requestedCount) || countVal;
        const completionPct =
          requested > 0 ? Math.round((Math.min(fulfilled, requested) / requested) * 100) : 100;
        setProgressUi(completionPct, `${fulfilled} / ${requested} saved`);
        for (const item of completedResult.items || []) {
          llState.justGeneratedIds.add(item.id);
        }

        // Reset browse filters to show the newest generated items immediately
        llState.browseCategoryId = 'all';
        llState.browseMastery = 'all';
        llState.browseRegister = 'all';
        llState.browseSearch = '';
        llState.browseSort = 'newest';
        const searchEl = document.getElementById('ll-browse-search-input');
        if (searchEl) searchEl.value = '';
        syncFilterPillsUi();

        // The stream already returned every saved item plus fresh stats: merge
        // locally into Page 1 instead of paying another roundtrip before showing results.
        const freshItems = Array.isArray(completedResult.items) ? completedResult.items : [];
        if (freshItems.length > 0) {
          llState.page = 1;
          const freshIds = new Set(freshItems.map((it) => it.id));
          const merged = [...freshItems, ...llState.items.filter((it) => !freshIds.has(it.id))].sort(
            compareLibraryItems,
          );
          llState.items = merged.slice(0, llState.pageSize);
          if (completedResult.stats) llState.stats = completedResult.stats;
          if (completedResult.categoryCounts) llState.categoryCounts = completedResult.categoryCounts;
          if (completedResult.registerCounts) llState.registerCounts = completedResult.registerCounts;
          llState.filteredCount = Number(llState.stats?.totalItems) || merged.length;
          llState.filteredCompletedCount =
            Number(llState.stats?.completedCount) || merged.filter((it) => it.isCompleted).length;
          llState.totalPages = Math.max(1, Math.ceil(llState.filteredCount / llState.pageSize));
          llState.hasMore = llState.page < llState.totalPages;
          llState.isLoadingList = false;
          llState.hasLoadedOnce = true;
          llState.animateNextRender = true;
          syncLibraryRoute(true);
          renderBrowseAuthState();
          renderBrowseStats();
          renderBrowseFilters();
          renderBrowseItems();
        } else {
          llState.page = 1;
          await loadLibraryItems({ showSkeleton: false, animate: true });
        }

        showLatestBatchBanner(completedResult);

        const missing = Math.max(0, requested - fulfilled);
        showToast(
          missing > 0
            ? `Added ${fulfilled} of ${requested} expressions — ${missing} still missing, generate again to fill the gap`
            : `Added ${fulfilled} new expression${fulfilled === 1 ? '' : 's'} to your library`,
        );
      }
    } catch (err) {
      if (err?.name === 'AbortError' || ac.signal.aborted) {
        if (llState.streamingItems.length > 0) {
          await loadLibraryItems();
          showToast(`Stopped · ${llState.streamingItems.length} generated items saved.`);
        } else {
          showToast('Generation cancelled.');
        }
        return;
      }
      if (err.status === 401 && ws()?.requireAuthBeforeAction) {
        ws().requireAuthBeforeAction({ type: 'learning_library_generate', payload });
        return;
      }
      showGenError(
        `${providerName} Generation Error`,
        err?.message || 'Unexpected error while generating expressions.',
        true,
      );
    } finally {
      clearInterval(llState.elapsedTimer);
      llState.elapsedTimer = null;
      llState.abortController = null;
      llState.isGenerating = false;
      resetLiveStrip();
      if (progressCard) progressCard.hidden = true;
      if (genBtn) genBtn.disabled = false;
      llState.aiSelector?.setDisabled(false);
    }
  }

  /* ========================================================================
     CENTRALIZED LIBRARY DATA & RENDERING
     ======================================================================== */

  /**
   * Sequence numbers come from the API (oldest = 1). While an older backend is
   * still running without `sequenceNumber`, derive the same order client-side:
   * the unfiltered domain list is newest-first, so reversing it yields
   * oldest-first (created_at ASC, rowid ASC) exactly like the server.
   */
  async function hydrateSequenceNumbers(loadToken) {
    if (!llState.items.some((it) => !(Number(it.sequenceNumber) > 0))) return;

    const params = new URLSearchParams();
    params.set('domainId', llState.activeDomainId);
    params.set('sort', 'newest');
    const res = await apiFetch(`/api/learning-library/items?${params.toString()}`, {
      method: 'GET',
    });
    if (loadToken !== libraryLoadSeq) return;

    const allItems = Array.isArray(res?.items) ? res.items : [];
    const sequenceMap = new Map();
    allItems
      .slice()
      .reverse()
      .forEach((it, idx) => sequenceMap.set(String(it.id), idx + 1));

    llState.items.forEach((it) => {
      if (!(Number(it.sequenceNumber) > 0)) {
        it.sequenceNumber = sequenceMap.get(String(it.id)) || 0;
      }
    });
  }

  function renderSkeletonCardHtml(idx, isCardsMode) {
    const bottomCount = isCardsMode ? 2 : 3;
    const bottomBoxes = Array.from({ length: bottomCount }, () => `
      <div class="ll-skel-box">
        <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--kicker"></span>
        <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--line"></span>
        <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--line-short"></span>
      </div>
    `).join('');

    return `
      <div class="ll-skeleton-card ft-skeleton-item" aria-hidden="true" style="--ft-stagger: ${Math.min(idx, 4)}">
        <div class="ll-skel-head">
          <div class="ll-skel-head-left">
            <div class="ll-skel-title-row">
              <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--index"></span>
              <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--title"></span>
            </div>
            <div class="ll-skel-pills-row">
              <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--pill"></span>
              <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--pill-sm"></span>
              <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--pill"></span>
            </div>
          </div>
          <div class="ll-skel-actions">
            <span class="ll-skel-circle ft-skel-shimmer"></span>
            <span class="ll-skel-circle ft-skel-shimmer"></span>
            <span class="ll-skel-circle ft-skel-shimmer"></span>
            <span class="ll-skel-circle ft-skel-shimmer"></span>
          </div>
        </div>
        <div class="ll-skel-bento-top">
          <div class="ll-skel-box">
            <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--kicker"></span>
            <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--line"></span>
            <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--line-short"></span>
          </div>
          <div class="ll-skel-box">
            <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--kicker"></span>
            <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--line"></span>
            <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--line-short"></span>
          </div>
        </div>
        <div class="ll-skel-bento-bottom">${bottomBoxes}</div>
      </div>
    `;
  }

  function renderSkeletonsHtml() {
    const isCardsMode = llState.viewMode === 'cards';
    const count = isCardsMode ? 4 : 3;
    const cards = Array.from({ length: count }, (_, idx) => renderSkeletonCardHtml(idx, isCardsMode)).join('');
    return isCardsMode
      ? `<div class="ll-cards-grid">${cards}</div>`
      : `<div class="ll-skeleton-list">${cards}</div>`;
  }

  function showSkeletonLoadingState() {
    llState.isLoadingList = true;
    const container = document.getElementById('ll-browse-items-container');
    const emptyEl = document.getElementById('ll-browse-empty');
    const telemetryStrip = document.querySelector('#section-learning-library .ll-telemetry-strip');

    if (emptyEl) emptyEl.hidden = true;
    paginationBar.hide();
    if (telemetryStrip && !llState.hasLoadedOnce) {
      telemetryStrip.classList.add('is-loading');
    }
    if (container && !container.querySelector('.ll-skeleton-card')) {
      container.classList.remove('ft-items-entering');
      container.innerHTML = renderSkeletonsHtml();
      skeletonGate.start();
    } else {
      skeletonGate.start();
    }
  }

  function clearTelemetryLoadingState() {
    document
      .querySelector('#section-learning-library .ll-telemetry-strip')
      ?.classList.remove('is-loading');
  }

  async function loadLibraryItems(options = {}) {
    const { showSkeleton = true, animate = true } = options;

    if (!getCurrentUser()) {
      llState.isLoadingList = false;
      clearTelemetryLoadingState();
      renderBrowseAuthState();
      return;
    }

    const seq = ++libraryLoadSeq;
    if (showSkeleton) {
      showSkeletonLoadingState();
    }

    const params = new URLSearchParams();
    params.set('domainId', llState.activeDomainId);
    if (llState.browseCategoryId !== 'all') params.set('categoryId', llState.browseCategoryId);
    if (llState.browseMastery === 'favorites') {
      params.set('favoritesOnly', '1');
    } else if (llState.browseMastery !== 'all') {
      params.set('masteryStatus', llState.browseMastery);
    }
    if (llState.browseRegister !== 'all') params.set('register', llState.browseRegister);
    if (llState.browseSearch.trim()) params.set('q', llState.browseSearch.trim());
    params.set('sort', llState.browseSort || 'newest');
    params.set('page', String(Math.max(1, llState.page || 1)));
    params.set('limit', String(llState.pageSize || DEFAULT_PAGE_SIZE));

    try {
      const res = await apiFetch(`/api/learning-library/items?${params.toString()}`, {
        method: 'GET',
      });
      if (seq !== libraryLoadSeq) return;

      if (showSkeleton) {
        const stillCurrent = await skeletonGate.waitRemaining(() => seq === libraryLoadSeq);
        if (!stillCurrent) return;
      }

      llState.items = Array.isArray(res?.items) ? res.items : [];
      if (res?.stats) llState.stats = res.stats;
      llState.categoryCounts = res?.categoryCounts || {};
      llState.registerCounts = res?.registerCounts || {};
      llState.filteredCount =
        typeof res?.filteredCount === 'number' ? res.filteredCount : llState.items.length;
      llState.filteredCompletedCount =
        typeof res?.filteredCompletedCount === 'number'
          ? res.filteredCompletedCount
          : llState.items.filter((it) => it.isCompleted).length;
      llState.page = Math.max(1, Number(res?.page) || llState.page || 1);
      llState.totalPages = Math.max(
        1,
        Number(res?.totalPages) || Math.ceil(llState.filteredCount / (llState.pageSize || DEFAULT_PAGE_SIZE)) || 1,
      );
      llState.hasMore = Boolean(res?.hasMore ?? llState.page < llState.totalPages);

      try {
        await hydrateSequenceNumbers(seq);
      } catch {
        // Index is non-critical; render the library even if it can't be hydrated.
      }
      if (seq !== libraryLoadSeq) return;

      llState.isLoadingList = false;
      llState.hasLoadedOnce = true;
      llState.animateNextRender = Boolean(animate);
      skeletonGate.reset();
      clearTelemetryLoadingState();

      renderBrowseAuthState();
      renderBrowseStats();
      renderBrowseFilters();
      renderBrowseItems();
      if (llState.activeStudyItemId) {
        renderStudyDrawer();
      }
    } catch (err) {
      if (seq !== libraryLoadSeq) return;
      llState.isLoadingList = false;
      skeletonGate.reset();
      clearTelemetryLoadingState();
      if (err.status === 401) {
        renderBrowseAuthState();
        return;
      }
      renderBrowseItems();
      showToast(err?.message || 'Could not load Generate Phrases.');
    }
  }

  function renderBrowseAuthState() {
    const user = getCurrentUser();
    const gate = document.getElementById('ll-auth-gate-card');
    const controls = document.getElementById('ll-library-controls');
    const container = document.getElementById('ll-browse-items-container');
    const emptyEl = document.getElementById('ll-browse-empty');
    const progressEl = document.getElementById('ll-browse-progress-bar');

    if (gate) gate.hidden = Boolean(user);
    if (controls) controls.hidden = !user;

    if (!user) {
      clearTelemetryLoadingState();
      if (container) {
        container.classList.remove('ft-items-entering');
        container.innerHTML = '';
      }
      if (emptyEl) emptyEl.hidden = true;
      if (progressEl) progressEl.hidden = true;
      paginationBar.hide();
      const countEl = document.getElementById('ll-library-count-label');
      if (countEl) countEl.textContent = '0';
    }
  }

  function syncLibraryTopRail(total, completed) {
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const tone = total > 0 && completed === total ? 'done' : completed > 0 ? 'progress' : 'new';
    const card = document.getElementById('ll-library-header-card');
    if (card) card.dataset.guideState = tone;
    const topFill = document.getElementById('ll-guide-top-fill');
    if (topFill) topFill.style.width = `${tone === 'done' ? 100 : pct}%`;
  }

  function renderBrowseStats() {
    const s = llState.stats || {};
    const total = Number(s.totalItems) || 0;
    const completed = Number(s.completedCount) || 0;
    const favorites = Number(s.favoritesCount) || 0;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };
    set('ll-stat-total', total);
    set('ll-stat-completed', completed);
    set('ll-stat-favorites', favorites);
    set('ll-stat-progress', `${pct}%`);

    syncLibraryTopRail(total, completed);
  }

  function syncFilterPillsUi() {
    document.querySelectorAll('[data-ll-mastery-filter]').forEach((pill) => {
      const act = pill.getAttribute('data-ll-mastery-filter') === llState.browseMastery;
      pill.classList.toggle('active', act);
      pill.setAttribute('aria-selected', act ? 'true' : 'false');
    });
    const sortSel = document.getElementById('ll-browse-sort-select');
    if (sortSel) sortSel.value = llState.browseSort || 'newest';
  }

  function renderBrowseFilters() {
    const domain = getActiveDomain();
    const catSel = document.getElementById('ll-browse-category-select');
    if (catSel && domain) {
      const total = llState.stats?.totalItems || 0;
      catSel.innerHTML =
        `<option value="all">All Categories (${total})</option>` +
        domain.categories
          .map((c) => {
            const cnt = llState.categoryCounts[c.id] || 0;
            return `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)} (${cnt})</option>`;
          })
          .join('');
      catSel.value = llState.browseCategoryId;
    }

    const regSel = document.getElementById('ll-browse-register-select');
    if (regSel && domain) {
      const regs = Array.from(
        new Set([...(domain.registers || []), ...Object.keys(llState.registerCounts || {})]),
      );
      regSel.innerHTML =
        `<option value="all">All Registers</option>` +
        regs
          .map((r) => {
            const cnt = llState.registerCounts[r] || 0;
            return `<option value="${escapeHtml(r)}">${escapeHtml(r)} (${cnt})</option>`;
          })
          .join('');
      regSel.value = llState.browseRegister;
    }

    syncFilterPillsUi();
  }

  /**
   * Client-side mirror of the server ordering. The server sorts each fetch, but
   * a finished generation merges its new items in streaming (oldest-first)
   * order, so the merged list must be re-sorted or the newest batch appears
   * upside down and the rest of the library falls out of order after it.
   */
  function compareLibraryItems(a, b) {
    const sort = llState.browseSort || 'newest';

    if (sort === 'alphabetical') {
      return String(a.expression || '').localeCompare(String(b.expression || ''), 'en', {
        sensitivity: 'base',
      });
    }

    if (sort === 'mastery') {
      const completedDiff = Number(Boolean(a.isCompleted)) - Number(Boolean(b.isCompleted));
      if (completedDiff !== 0) return completedDiff;
      const rank = (item) =>
        item.masteryStatus === 'mastered' ? 2 : item.masteryStatus === 'learning' ? 1 : 0;
      const rankDiff = rank(a) - rank(b);
      if (rankDiff !== 0) return rankDiff;
    }

    if (sort === 'most_reviewed') {
      const reviewDiff = (Number(b.reviewCount) || 0) - (Number(a.reviewCount) || 0);
      if (reviewDiff !== 0) return reviewDiff;
    }

    // "newest" and the final tiebreak for every other mode.
    const seqA = Number(a.sequenceNumber) || 0;
    const seqB = Number(b.sequenceNumber) || 0;
    if (seqA !== seqB) return seqB - seqA;
    const createdA = String(a.createdAt || '');
    const createdB = String(b.createdAt || '');
    if (createdA !== createdB) return createdB.localeCompare(createdA);
    return String(b.id || '').localeCompare(String(a.id || ''));
  }

  function renderBrowsePagination() {
    paginationBar.render({
      page: llState.page,
      pageSize: llState.pageSize || DEFAULT_PAGE_SIZE,
      total: Number(llState.filteredCount) || 0,
      totalPages: llState.totalPages,
      itemsCount: llState.items?.length || 0,
      loading: llState.isLoadingList,
      visible: Boolean(getCurrentUser()),
    });
  }

  async function goToPage(nextPage) {
    const clamped = Math.max(1, Math.min(llState.totalPages || 1, Math.floor(Number(nextPage) || 1)));
    if (clamped === llState.page && !llState.isLoadingList) return;
    scrollRestorer.clear();
    llState.page = clamped;
    syncLibraryRoute(false);
    P.scrollToTop(document.getElementById('ll-library-shelf'));
    await loadLibraryItems({ showSkeleton: true, animate: true });
  }

  async function setPageSize(nextSize) {
    if (!PAGE_SIZE_OPTIONS.includes(nextSize) || nextSize === llState.pageSize) return;
    scrollRestorer.clear();
    llState.pageSize = nextSize;
    llState.page = 1;
    try {
      localStorage.setItem('flaptap_ll_page_size', String(nextSize));
    } catch {}
    syncLibraryRoute(true);
    P.scrollToTop(document.getElementById('ll-library-shelf'));
    await loadLibraryItems({ showSkeleton: true, animate: true });
  }

  function renderBrowseItems() {
    const container = document.getElementById('ll-browse-items-container');
    const emptyEl = document.getElementById('ll-browse-empty');
    const countEl = document.getElementById('ll-library-count-label');
    if (!container) return;

    const items = llState.items || [];
    items.sort(compareLibraryItems);
    const filteredTotal =
      llState.hasLoadedOnce && typeof llState.filteredCount === 'number'
        ? llState.filteredCount
        : items.length;
    const filteredCompleted =
      llState.hasLoadedOnce && typeof llState.filteredCompletedCount === 'number'
        ? llState.filteredCompletedCount
        : items.filter((it) => it.isCompleted).length;

    if (countEl) countEl.textContent = String(filteredTotal);

    if (!getCurrentUser()) {
      container.classList.remove('ft-items-entering');
      container.innerHTML = '';
      if (emptyEl) emptyEl.hidden = true;
      paginationBar.hide();
      return;
    }

    if (llState.isLoadingList) {
      return;
    }

    ws()?.renderSubjectProgressBar?.('ll-browse-progress-bar', {
      total: filteredTotal,
      completed: filteredCompleted,
    });

    if (emptyEl) emptyEl.hidden = items.length > 0;
    if (items.length === 0) {
      container.classList.remove('ft-items-entering');
      container.innerHTML = '';
      renderBrowsePagination();
      return;
    }

    const shouldAnimate = Boolean(llState.animateNextRender);
    llState.animateNextRender = false;
    container.classList.remove('ft-items-entering');

    if (llState.viewMode === 'table') {
      container.innerHTML = renderCompactTableHtml(items);
    } else {
      container.innerHTML = `<div class="ll-cards-grid">${items
        .map((item, idx) => renderItemCardHtml(item, idx))
        .join('')}</div>`;
    }

    if (shouldAnimate) {
      P.triggerEntrance(container);
    }

    renderBrowsePagination();
  }

  function renderExampleBlock(ex, item, index = 0, showNote = true) {
    const itemId = typeof item === 'object' ? item?.id : item;
    const expr = typeof item === 'object' ? item?.expression : '';
    const spoken = typeof item === 'object' ? item?.spokenForm : '';
    const boxTypeClass = index === 0 ? 'll-box-context' : 'll-box-example';
    const prefixLabel = index === 0 ? 'In context' : 'Example';
    const ctxText = ex.speakerContext ? `${prefixLabel} · ${ex.speakerContext}` : prefixLabel;

    return `
      <div class="ll-card-box ${boxTypeClass}">
        <div class="ll-box-head">
          <span class="ll-sense-label" dir="ltr">${escapeHtml(ctxText)}</span>
          <button type="button" class="ll-mini-speak-btn" data-ll-speak="${escapeHtml(ex.sentence)}" title="Listen to example" aria-label="Listen to example">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            <span>Listen</span>
          </button>
        </div>
        <blockquote class="ll-context-quote" dir="ltr">“${tokenizeExampleSentence(ex.sentence, itemId, expr, spoken)}”</blockquote>
        ${showNote && ex.explanation ? `<p class="ll-example-note">${escapeHtml(ex.explanation)}</p>` : ''}
      </div>
    `;
  }

  function renderItemHeaderHtml(item, { sequenceNumber, isDone, isMasked, isSavedToVocab }) {
    const showRegister = isDistinctLabel(item.register, item.categoryLabel);
    const showSpoken = isDistinctLabel(item.spokenForm, item.expression);
    const catTone = getCategoryTone(item.categoryId);
    const goalLang = String(item.targetLanguage || 'ar').toLowerCase();
    const isRtl = ['ar', 'fa', 'he', 'ur'].includes(goalLang);

    const copyBtn = window.FlaptapCopy
      ? window.FlaptapCopy.buttonHtml(item.expression, {
          className: 'icon-action icon-action--sm ll-util-btn',
          label: `Copy ${item.expression}`,
        })
      : '';

    return `
      <div class="ll-item-head">
        <span class="ll-item-index ltr-num" title="Item ${sequenceNumber || 1}" aria-label="Item ${sequenceNumber || 1}">
          <span class="ll-index-hash">#</span>${sequenceNumber || '•'}
        </span>

        <div class="ll-item-heading">
          <div class="ll-item-line-1">
            <button type="button" class="ll-expr-title-btn" data-ll-open-study="${escapeHtml(item.id)}" title="Open item study page" aria-label="Study ${escapeHtml(item.expression)}">
              <h3 class="ll-expr-title" dir="ltr"><span class="ll-term-mark"><span class="ll-term-text">${renderSlotizedText(item.expression)}</span></span></h3>
            </button>
            ${item.ipa ? `<span class="ll-expr-ipa ltr-num" dir="ltr">${escapeHtml(item.ipa)}</span>` : ''}
            <span class="ll-badge is-category" data-cat-tone="${escapeHtml(catTone)}">${escapeHtml(item.categoryLabel)}</span>
            ${item.level ? `<span class="ll-badge is-level ltr-num">${escapeHtml(item.level)}</span>` : ''}
            ${showRegister ? `<span class="ll-badge is-register">${escapeHtml(item.register)}</span>` : ''}
            ${showSpoken ? `<span class="ll-badge is-spoken" dir="ltr"><span class="ll-meta-label">Spoken</span> <strong>${escapeHtml(item.spokenForm)}</strong></span>` : ''}
            ${isDone ? '<span class="ll-item-done-tag">Studied</span>' : ''}
          </div>

          ${
            item.localizedMeaning
              ? `<div class="ll-item-line-2${isMasked ? ' is-masked' : ''}"${
                  isMasked
                    ? ` data-ll-reveal="${escapeHtml(item.id)}" role="button" tabindex="0" aria-label="Reveal translation for ${escapeHtml(item.expression)}"`
                    : ''
                }>
                  <p class="ll-head-translation" dir="${isRtl ? 'rtl' : 'ltr'}" lang="${escapeHtml(goalLang)}">${renderSlotizedText(item.localizedMeaning)}</p>
                  ${isMasked ? '<span class="ll-recall-inline-hint">Click to reveal</span>' : ''}
                </div>`
              : ''
          }
        </div>

        <div class="ll-item-actions">
          <div class="ll-action-utils">
            <button type="button" class="icon-action icon-action--sm ll-util-btn" data-ll-speak="${escapeHtml(getSpeakableText(item))}" title="Pronounce (TTS)" aria-label="Pronounce ${escapeHtml(item.expression)}">
              ${icon('volume-2')}
            </button>
            ${copyBtn}
            <button type="button" class="icon-action icon-action--sm ll-util-btn${item.isFavorite ? ' is-favorite' : ''}" data-ll-toggle-fav="${escapeHtml(item.id)}" title="${item.isFavorite ? 'Favorited' : 'Favorite'}" aria-label="Toggle favorite">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="${item.isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </button>
            <button type="button" class="icon-action icon-action--sm ll-util-btn${isSavedToVocab ? ' is-saved' : ''}" data-ll-save-vocab="${escapeHtml(item.id)}" title="${isSavedToVocab ? 'In Flashcards' : 'Save to Flashcards'}" aria-label="${isSavedToVocab ? 'In Flashcards' : 'Save to Flashcards'}">
              ${icon(isSavedToVocab ? 'bookmark-check' : 'bookmark-plus')}
            </button>
            <button type="button" class="icon-action icon-action--sm ll-util-btn" data-ll-open-study="${escapeHtml(item.id)}" title="Open study page" aria-label="Open study page for ${escapeHtml(item.expression)}">
              ${icon('arrow-up-right')}
            </button>
            <button type="button" class="icon-action icon-action--sm ll-util-btn is-delete" data-ll-delete-item="${escapeHtml(item.id)}" title="Delete expression" aria-label="Delete ${escapeHtml(item.expression)}">
              ${icon('trash')}
            </button>
          </div>
          <span class="ll-action-divider" aria-hidden="true"></span>
          ${renderCheckButton(isDone, item.id)}
        </div>
      </div>
    `;
  }

  function renderItemBodyBoxesHtml(item, isMasked, { compact = false } = {}) {
    const examples = (Array.isArray(item.examples) ? item.examples : []).slice(0, 2);
    const patternHtml = renderPatternGuideHtml(item);

    // Row 1: Separate boxes for In Context + Example
    const row1Boxes = examples.map((ex, idx) => renderExampleBlock(ex, item, idx, !compact));

    // Row 2: Meaning + Usage (+ Spoken tip in full list view)
    const meaningBox = `
      <div class="ll-card-box ll-box-meaning ll-meaning-block${isMasked ? ' is-masked' : ''}"${
        isMasked
          ? ` data-ll-reveal="${escapeHtml(item.id)}" role="button" tabindex="0" aria-label="Reveal meaning for ${escapeHtml(item.expression)}"`
          : ''
      }>
        ${
          isMasked
            ? `<button type="button" class="ll-recall-veil ll-recall-reveal-btn" data-ll-reveal="${escapeHtml(item.id)}"><span>Click to reveal meaning</span></button>`
            : ''
        }
        <span class="ll-sense-label">Meaning</span>
        <div class="ll-meaning-body">
          <p class="ll-core-meaning">${escapeHtml(item.coreMeaning)}</p>
          ${
            item.textbookEquivalent
              ? `<p class="ll-general-sense"><span class="ll-inline-label">Instead of</span><span class="ll-textbook-inline">${escapeHtml(item.textbookEquivalent)}</span></p>`
              : ''
          }
        </div>
      </div>
    `;

    const usageCopy = item.nativeContext || item.mistakesToAvoid || (!compact ? '' : item.phoneticBreakdown) || '';
    const usageBox =
      patternHtml || usageCopy
        ? `<div class="ll-card-box ll-box-usage">
             <span class="ll-sense-label">Usage</span>
             ${patternHtml}
             ${usageCopy ? `<p class="ll-note-copy">${escapeHtml(usageCopy)}</p>` : ''}
           </div>`
        : '';

    const spokenBox =
      !compact && item.phoneticBreakdown
        ? `<div class="ll-card-box ll-box-spoken">
             <span class="ll-sense-label">Spoken tip</span>
             <p class="ll-note-copy">${escapeHtml(item.phoneticBreakdown)}</p>
           </div>`
        : '';

    const row2Boxes = [meaningBox, usageBox, spokenBox].filter(Boolean);

    return `
      <div class="ll-item-body">
        ${
          row1Boxes.length
            ? `<div class="ll-box-row ll-row-quotes" data-cols="${compact ? 1 : row1Boxes.length}">${row1Boxes.join('')}</div>`
            : ''
        }
        ${
          row2Boxes.length
            ? `<div class="ll-box-row ll-row-insights" data-cols="${compact ? 1 : row2Boxes.length}">${row2Boxes.join('')}</div>`
            : ''
        }
      </div>
    `;
  }

  function renderItemCardHtml(item, idx = 0) {
    const isDone = Boolean(item.isCompleted);
    const isMasked = Boolean(llState.recallMaskMode && !llState.revealedCardIds.has(item.id));
    const isJustGenerated = llState.justGeneratedIds.has(item.id);
    const isSavedToVocab = Boolean(
      ws()?.isVocabularySaved && ws()?.isVocabularySaved(item.expression),
    );
    const sequenceNumber = Number(item.sequenceNumber) > 0 ? Number(item.sequenceNumber) : 0;
    const catTone = getCategoryTone(item.categoryId);

    return `
      <article class="ll-card ll-item-surface ft-item-surface${isDone ? ' is-item-completed' : ''}${isJustGenerated ? ' is-just-generated' : ''}" data-ll-card-id="${escapeHtml(item.id)}" data-cat-tone="${escapeHtml(catTone)}" style="--ft-stagger: ${Math.min(idx, 7)}">
        ${renderItemHeaderHtml(item, { sequenceNumber, isDone, isMasked, isSavedToVocab })}
        ${renderItemBodyBoxesHtml(item, isMasked, { compact: true })}
        <div class="ll-card-footer">
          <button type="button" class="btn-secondary btn-sm ll-card-open-btn" data-ll-open-study="${escapeHtml(item.id)}" title="Open full item study page" aria-label="Study ${escapeHtml(item.expression)}">
            <span>${isDone ? 'Review Item' : 'Study Item'}</span>
            ${icon('arrow-up-right')}
          </button>
        </div>
      </article>
    `;
  }

  function renderCompactTableHtml(items) {
    return `
      <div class="ll-table-wrap">
        <table class="ll-table">
          <thead class="visually-hidden">
            <tr>
              <th class="ll-col-expression">Expression, meaning &amp; examples</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((item, idx) => {
                const isDone = Boolean(item.isCompleted);
                const isMasked = Boolean(llState.recallMaskMode && !llState.revealedCardIds.has(item.id));
                const isJustGenerated = llState.justGeneratedIds.has(item.id);
                const isSavedToVocab = Boolean(
                  ws()?.isVocabularySaved && ws().isVocabularySaved(item.expression),
                );
                const sequenceNumber = Number(item.sequenceNumber) > 0 ? Number(item.sequenceNumber) : 0;
                const catTone = getCategoryTone(item.categoryId);

                return `
                  <tr class="ll-item-row ll-item-surface ft-item-surface${isDone ? ' is-item-completed' : ''}${isJustGenerated ? ' is-just-generated' : ''}" data-ll-row-id="${escapeHtml(item.id)}" data-cat-tone="${escapeHtml(catTone)}" style="--ft-stagger: ${Math.min(idx, 7)}">
                    <td class="ll-cell-bento">
                      ${renderItemHeaderHtml(item, { sequenceNumber, isDone, isMasked, isSavedToVocab })}
                      ${renderItemBodyBoxesHtml(item, isMasked, { compact: false })}
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /* ========================================================================
     ITEM STUDY DETAIL PAGE / SHEET (#ll-study-drawer-backdrop)
     ======================================================================== */

  function openStudyDrawer(itemId) {
    const item = findItemAnywhere(itemId);
    if (!item) return;
    llState.activeStudyItemId = item.id;
    renderStudyDrawer();
    const backdrop = document.getElementById('ll-study-drawer-backdrop');
    if (backdrop) backdrop.hidden = false;
  }

  function closeStudyDrawer() {
    llState.activeStudyItemId = null;
    const backdrop = document.getElementById('ll-study-drawer-backdrop');
    if (backdrop) backdrop.hidden = true;
  }

  function stepStudyDrawer(delta) {
    const items = llState.items || [];
    if (items.length === 0 || !llState.activeStudyItemId) return;
    const idx = items.findIndex((it) => it.id === llState.activeStudyItemId);
    if (idx === -1) return;
    const nextIdx = (idx + delta + items.length) % items.length;
    llState.activeStudyItemId = items[nextIdx].id;
    renderStudyDrawer();
  }

  function renderStudyDrawer() {
    const body = document.getElementById('ll-study-drawer-body');
    const counter = document.getElementById('ll-study-counter');
    const prevBtn = document.getElementById('ll-study-prev-btn');
    const nextBtn = document.getElementById('ll-study-next-btn');
    const crumbDomain = document.getElementById('ll-study-crumb-domain');
    if (!body) return;

    const item = findItemAnywhere(llState.activeStudyItemId);
    if (!item) {
      closeStudyDrawer();
      return;
    }

    const items = llState.items || [];
    const idx = items.findIndex((it) => it.id === item.id);
    if (counter) {
      counter.textContent = idx >= 0 ? `${idx + 1} / ${items.length}` : '1 / 1';
    }
    if (prevBtn) prevBtn.disabled = items.length <= 1;
    if (nextBtn) nextBtn.disabled = items.length <= 1;

    const domain = getActiveDomain();
    const labels = domain?.uiLabels || {};
    const isDone = Boolean(item.isCompleted);
    const isMasked = Boolean(llState.recallMaskMode && !llState.revealedCardIds.has(item.id));
    const showRegister = isDistinctLabel(item.register, item.categoryLabel);
    const showSpoken = isDistinctLabel(item.spokenForm, item.expression);
    const isSavedToVocab = Boolean(
      ws()?.isVocabularySaved && ws().isVocabularySaved(item.expression),
    );
    const examples = Array.isArray(item.examples) ? item.examples : [];
    const sequenceNumber = Number(item.sequenceNumber) > 0 ? Number(item.sequenceNumber) : idx + 1;
    const catTone = getCategoryTone(item.categoryId);
    const goalLang = String(item.targetLanguage || 'ar').toLowerCase();
    const isRtl = ['ar', 'fa', 'he', 'ur'].includes(goalLang);

    if (crumbDomain) {
      crumbDomain.textContent = `${domain?.title || 'Generate Phrases'} · ${item.categoryLabel || 'Expression'}`;
    }

    const patternKey = (value) =>
      String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    const extraPatterns = (Array.isArray(item.usagePatterns) ? item.usagePatterns : []).filter(
      (pattern) =>
        pattern &&
        String(pattern.pattern || '').trim() &&
        patternKey(pattern.pattern) !== patternKey(item.expression),
    );

    const drawerEl = document.querySelector('.ll-study-drawer');
    if (drawerEl) {
      drawerEl.classList.toggle('is-item-completed', isDone);
      drawerEl.dataset.guideState = isDone ? 'done' : 'progress';
    }

    const contrastAndMechanicsRow = [
      item.textbookEquivalent
        ? `<div class="ll-card-box ll-box-contrast">
             <span class="ll-sense-label">${escapeHtml(labels.textbookContrastHeading || 'Textbook vs. Natural Native')}</span>
             <div class="ll-contrast-strip">
               <div class="ll-contrast-col">
                 <span class="ll-contrast-label">Textbook / Literal</span>
                 <span class="ll-contrast-textbook">${escapeHtml(item.textbookEquivalent)}</span>
               </div>
               <div class="ll-contrast-col">
                 <span class="ll-contrast-label">Natural American</span>
                 <span class="ll-contrast-native" dir="ltr">${renderSlotizedText(item.expression)}</span>
               </div>
             </div>
           </div>`
        : '',
      item.phoneticBreakdown || showSpoken
        ? `<div class="ll-card-box ll-box-spoken">
             <span class="ll-sense-label">${escapeHtml(labels.mechanicsHeading || 'Spoken Mechanics & Delivery')}</span>
             ${showSpoken ? `<p class="ll-spoken-callout" dir="ltr"><span class="ll-inline-label">Spoken reduction</span><strong>${escapeHtml(item.spokenForm)}</strong></p>` : ''}
             ${item.phoneticBreakdown ? `<p class="ll-note-copy">${escapeHtml(item.phoneticBreakdown)}</p>` : ''}
           </div>`
        : '',
    ].filter(Boolean);

    const nuanceHeadingText = String(labels.nuanceHeading || 'Context & Native Vibe')
      .replace(/\s*&\s*mistakes to avoid/i, '')
      .trim();

    const nuanceAndMistakesRow = [
      item.nativeContext
        ? `<div class="ll-card-box ll-box-usage">
             <span class="ll-sense-label">${escapeHtml(nuanceHeadingText || 'Context & Native Vibe')}</span>
             <p class="ll-note-copy">${escapeHtml(item.nativeContext)}</p>
           </div>`
        : '',
      item.mistakesToAvoid
        ? `<div class="ll-card-box ll-box-avoid">
             <span class="ll-sense-label">Mistakes to Avoid</span>
             <p class="ll-note-copy">${escapeHtml(item.mistakesToAvoid)}</p>
           </div>`
        : '',
    ].filter(Boolean);

    const variationsAndPatternsRow = [
      item.variations?.length || item.combinations?.length
        ? `<div class="ll-card-box ll-box-variations">
             ${
               item.variations?.length
                 ? `<div class="ll-chip-section">
                      <span class="ll-sense-label">${escapeHtml(labels.variationsHeading || 'Variations & Shortcuts')}</span>
                      <div class="ll-chips-wrap">${item.variations
                        .map(
                          (v) =>
                            `<button type="button" class="ll-chip" data-ll-speak="${escapeHtml(v)}" title="Listen to variation" dir="ltr">${escapeHtml(v)}</button>`,
                        )
                        .join('')}</div>
                    </div>`
                 : ''
             }
             ${
               item.combinations?.length
                 ? `<div class="ll-chip-section">
                      <span class="ll-sense-label">${escapeHtml(labels.combinationsHeading || 'Combinations & Collocations')}</span>
                      <div class="ll-chips-wrap">${item.combinations
                        .map(
                          (c) =>
                            `<button type="button" class="ll-chip is-combo" data-ll-speak="${escapeHtml(c)}" title="Listen to collocation" dir="ltr">${renderSlotizedText(c)}</button>`,
                        )
                        .join('')}</div>
                    </div>`
                 : ''
             }
           </div>`
        : '',
      extraPatterns.length || item.relatedExpressions?.length || getPatternGuide(item)
        ? `<div class="ll-card-box ll-box-patterns">
             <span class="ll-sense-label">${escapeHtml(labels.patternsHeading || 'Usage Patterns & Related')}</span>
             ${renderPatternGuideHtml(item, { stacked: true })}
             ${
               extraPatterns.length
                 ? `<div class="ll-patterns-stack">
                      ${extraPatterns
                        .map(
                          (p) => `
                          <div class="ll-pattern-item">
                            <span class="ll-pattern-formula" dir="ltr">${renderSlotizedText(p.pattern)}</span>
                            ${p.meaning ? `<span class="ll-pattern-meaning">${escapeHtml(p.meaning)}</span>` : ''}
                            ${p.example ? `<span class="ll-pattern-example" dir="ltr">“${tokenizeExampleSentence(p.example, item.id, item.expression, item.spokenForm)}”</span>` : ''}
                          </div>`,
                        )
                        .join('')}
                    </div>`
                 : ''
             }
             ${
               item.relatedExpressions?.length
                 ? `<div class="ll-chip-section">
                      <span class="ll-sense-label">Related Native Expressions</span>
                      <div class="ll-chips-wrap">${item.relatedExpressions
                        .map(
                          (r) =>
                            `<button type="button" class="ll-chip" data-ll-speak="${escapeHtml(r)}" title="Listen" dir="ltr">${escapeHtml(r)}</button>`,
                        )
                        .join('')}</div>
                    </div>`
                 : ''
             }
           </div>`
        : '',
    ].filter(Boolean);

    body.innerHTML = `
      <div class="ll-detail-hero">
        <div class="ll-study-actions-bar">
          ${renderCheckButton(isDone, item.id, isDone ? 'Completed' : 'Mark Done')}
          <button type="button" class="btn-secondary btn-sm" data-ll-speak="${escapeHtml(getSpeakableText(item))}" title="Pronounce" aria-label="Pronounce">
            ${icon('volume-2')}
            <span>Pronounce</span>
          </button>
          ${window.FlaptapCopy ? window.FlaptapCopy.buttonHtml(item.expression, { className: 'btn-secondary btn-sm' }) : ''}
          <button type="button" class="btn-secondary btn-sm ${item.isFavorite ? 'is-favorite' : ''}" data-ll-toggle-fav="${escapeHtml(item.id)}" title="${item.isFavorite ? 'Favorited' : 'Favorite'}" aria-label="${item.isFavorite ? 'Favorited' : 'Favorite'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="${item.isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            <span>${item.isFavorite ? 'Favorited' : 'Favorite'}</span>
          </button>
          <button type="button" class="btn-vox btn-sm ${isSavedToVocab ? 'is-saved' : ''}" data-ll-save-vocab="${escapeHtml(item.id)}" title="${isSavedToVocab ? 'In Flashcards' : 'Save to Flashcards'}" aria-label="${isSavedToVocab ? 'In Flashcards' : 'Save to Flashcards'}">
            ${icon(isSavedToVocab ? 'bookmark-check' : 'bookmark-plus')}
            <span>${isSavedToVocab ? 'In Flashcards' : 'Save to Flashcards'}</span>
          </button>
          <button type="button" class="btn-secondary btn-sm is-danger-ghost" data-ll-delete-item="${escapeHtml(item.id)}" title="Delete expression" aria-label="Delete expression">
            ${icon('trash')}
          </button>
        </div>

        <div class="ll-detail-title-row">
          <span class="ll-item-index ll-detail-index ltr-num"><span class="ll-index-hash">#</span>${sequenceNumber}</span>
          <h2 class="ll-study-title" id="ll-study-title" dir="ltr"><span class="ll-term-text">${renderSlotizedText(item.expression)}</span></h2>
        </div>

        <div class="ll-card-badges ll-detail-meta">
          ${item.ipa ? `<span class="ll-expr-ipa ltr-num" dir="ltr">${escapeHtml(item.ipa)}</span>` : ''}
          <span class="ll-badge is-category" data-cat-tone="${escapeHtml(catTone)}">${escapeHtml(item.categoryLabel)}</span>
          ${item.level ? `<span class="ll-badge is-level ltr-num">${escapeHtml(item.level)}</span>` : ''}
          ${showRegister ? `<span class="ll-badge is-register">${escapeHtml(item.register)}</span>` : ''}
          ${item.tone ? `<span class="ll-badge">${escapeHtml(item.tone)}</span>` : ''}
          ${showSpoken ? `<span class="ll-badge is-spoken" dir="ltr"><span class="ll-meta-label">${escapeHtml(labels.spokenHeading || 'Spoken')}</span> <strong>${escapeHtml(item.spokenForm)}</strong></span>` : ''}
          ${item.modelName ? `<span class="ll-badge is-model">${escapeHtml(item.agentName || 'AI')} · ${escapeHtml(item.modelName)}</span>` : ''}
          ${isDone ? '<span class="ll-item-done-tag">Studied</span>' : ''}
        </div>
      </div>

      <!-- Takeaway / Core Meaning Callout Banner (Matches Anything to Phrases .aex-summary-banner) -->
      <div class="ll-summary-banner ll-meaning-block ${isMasked ? 'is-masked' : ''}">
        ${
          isMasked
            ? `<button type="button" class="ll-recall-veil ll-recall-reveal-btn" data-ll-reveal="${escapeHtml(item.id)}"><span>Click to reveal meaning</span></button>`
            : ''
        }
        <div class="ll-summary-head">
          <span class="ll-summary-kicker">Core Meaning &amp; Takeaway</span>
          <span class="ll-summary-style">${escapeHtml(item.register || item.categoryLabel || '')}</span>
        </div>
        <div class="ll-meaning-body">
          <p class="ll-summary-body ll-core-meaning">${escapeHtml(item.coreMeaning)}</p>
          ${
            item.localizedMeaning
              ? `<p class="ll-localized-meaning" dir="${isRtl ? 'rtl' : 'ltr'}" lang="${escapeHtml(goalLang)}">${renderSlotizedText(item.localizedMeaning)}</p>`
              : ''
          }
        </div>
      </div>

      ${
        examples.length
          ? `<div class="ll-box-row ll-row-quotes" data-cols="${Math.min(2, examples.length)}">
               ${examples.map((ex, exIdx) => renderExampleBlock(ex, item, exIdx, true)).join('')}
             </div>`
          : ''
      }

      ${
        contrastAndMechanicsRow.length
          ? `<div class="ll-box-row ll-row-insights" data-cols="${contrastAndMechanicsRow.length}">${contrastAndMechanicsRow.join('')}</div>`
          : ''
      }

      ${
        nuanceAndMistakesRow.length
          ? `<div class="ll-box-row ll-row-insights" data-cols="${nuanceAndMistakesRow.length}">${nuanceAndMistakesRow.join('')}</div>`
          : ''
      }

      ${
        variationsAndPatternsRow.length
          ? `<div class="ll-box-row ll-row-insights" data-cols="${variationsAndPatternsRow.length}">${variationsAndPatternsRow.join('')}</div>`
          : ''
      }

      <div class="ll-card-box ll-box-notes">
        <span class="ll-sense-label">Personal Memory Note</span>
        <div class="ll-notes-row">
          <input type="text" class="ll-notes-input" data-ll-note-input="${escapeHtml(item.id)}" value="${escapeHtml(item.userNotes || '')}" placeholder="Add a personal memory cue or example sentence..." />
          <button type="button" class="btn-vox btn-sm" data-ll-save-note="${escapeHtml(item.id)}" title="Save note" aria-label="Save note">
            ${icon('check')}
            <span>Save Note</span>
          </button>
        </div>
      </div>
    `;
  }

  /* ========================================================================
     ITEM ACTIONS, WORD LOOKUP & EXPORTS
     ======================================================================== */

  function findItemAnywhere(id) {
    return llState.items.find((i) => i.id === id) || null;
  }

  function replaceItemInMemory(updated) {
    if (!updated) return;
    llState.items = llState.items.map((it) => (it.id === updated.id ? updated : it));
  }

  function matchesBrowseMasteryFilter(item) {
    if (!item) return false;
    switch (llState.browseMastery) {
      case 'completed':
        return Boolean(item.isCompleted);
      case 'pending':
        return !item.isCompleted;
      case 'favorites':
        return Boolean(item.isFavorite);
      default:
        return true;
    }
  }

  /**
   * Check/uncheck must never rebuild the library. A full `innerHTML` refresh
   * destroyed every card/row right after the click, so colors snapped instead
   * of transitioning and the grid visibly flashed. Patch the touched nodes.
   */
  function patchCompletionDom(itemId, checked) {
    if (!itemId) return;
    const id = CSS.escape(String(itemId));
    const syncBtn = ws()?.setCheckButtonState;

    document.querySelectorAll(`[data-ll-toggle-complete="${id}"]`).forEach((btn) => {
      const isPill = btn.classList.contains('item-check-btn--pill');
      const pillText = isPill ? (checked ? 'Completed' : 'Mark Done') : '';
      if (global.FlaptapCheck?.setState) {
        global.FlaptapCheck.setState(btn, checked, { text: pillText, animate: true });
        return;
      }
      if (syncBtn) {
        syncBtn(btn, checked);
        return;
      }
      btn.classList.toggle('is-checked', checked);
      btn.setAttribute('aria-pressed', checked ? 'true' : 'false');
    });

    document
      .querySelectorAll(`[data-ll-row-id="${id}"], [data-ll-card-id="${id}"]`)
      .forEach((node) => {
        node.classList.toggle('is-item-completed', checked);
        const line1 = node.querySelector('.ll-item-line-1');
        const existingTag = line1?.querySelector('.ll-item-done-tag');
        if (checked && line1 && !existingTag) {
          const tag = document.createElement('span');
          tag.className = 'll-item-done-tag';
          tag.textContent = 'Studied';
          line1.appendChild(tag);
        } else if (!checked && existingTag) {
          existingTag.remove();
        }
      });

    const drawer = document.querySelector('.ll-study-drawer');
    if (drawer && llState.activeStudyItemId === itemId) {
      drawer.classList.toggle('is-item-completed', checked);
      drawer.dataset.guideState = checked ? 'done' : 'progress';
    }
  }

  /** Keep the in-place completion counters in sync without rebuilding markup. */
  function patchCompletionCounters(delta) {
    if (!delta) return;
    const stats = llState.stats || (llState.stats = {});
    const total = Number(stats.totalItems) || 0;
    const completed = Math.max(
      0,
      Math.min(total || Number.MAX_SAFE_INTEGER, (Number(stats.completedCount) || 0) + delta),
    );
    stats.completedCount = completed;

    const completedEl = document.getElementById('ll-stat-completed');
    if (completedEl) completedEl.textContent = String(completed);
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const pctEl = document.getElementById('ll-stat-progress');
    if (pctEl) pctEl.textContent = `${pct}%`;

    syncLibraryTopRail(total, completed);

    const items = llState.items || [];
    const listTotal =
      llState.hasLoadedOnce && typeof llState.filteredCount === 'number'
        ? llState.filteredCount
        : items.length;
    if (listTotal === 0) return;

    const nextFilteredCompleted = Math.max(
      0,
      Math.min(
        listTotal,
        (llState.hasLoadedOnce && typeof llState.filteredCompletedCount === 'number'
          ? llState.filteredCompletedCount
          : items.filter((it) => it.isCompleted).length) + delta,
      ),
    );
    llState.filteredCompletedCount = nextFilteredCompleted;

    const bar = document.getElementById('ll-browse-progress-bar');
    if (!bar) return;
    const listPct = Math.round((nextFilteredCompleted / listTotal) * 100);
    const remaining = Math.max(0, listTotal - nextFilteredCompleted);
    const setText = (selector, value) => {
      const node = bar.querySelector(selector);
      if (node) node.textContent = String(value);
    };

    bar.hidden = false;
    bar.classList.toggle('is-all-done', remaining === 0);
    setText('[data-sp-total]', listTotal);
    setText('[data-sp-completed]', nextFilteredCompleted);
    setText('[data-sp-remaining]', remaining);
    const track = bar.querySelector('.subject-progress-track');
    if (track) track.setAttribute('aria-valuenow', String(nextFilteredCompleted));
    const fill = bar.querySelector('.subject-progress-fill');
    if (fill) fill.style.width = `${listPct}%`;
    const pctNode = bar.querySelector('.subject-progress-pct');
    if (pctNode) pctNode.textContent = `${listPct}%`;
  }

  /** Optimistic apply/rollback of one item's completion, DOM-only. */
  function applyCompletionState(itemId, checked) {
    const item = findItemAnywhere(itemId);
    if (item) {
      replaceItemInMemory({
        ...item,
        isCompleted: checked,
        masteryStatus: checked ? 'mastered' : 'new',
      });
    }
    patchCompletionDom(itemId, checked);
    patchCompletionCounters(checked ? 1 : -1);
  }

  /** A mastery filter can hide the row once its state flips; then re-render/refetch. */
  function dropRowWhenFilteredOut(itemId) {
    const item = findItemAnywhere(itemId);
    if (!item || matchesBrowseMasteryFilter(item)) return;
    llState.items = llState.items.filter((it) => it.id !== itemId);
    llState.filteredCount = Math.max(0, (llState.filteredCount || 0) - 1);
    if (item.isCompleted && llState.browseMastery === 'pending') {
      llState.filteredCompletedCount = Math.max(0, llState.filteredCompletedCount - 1);
    }
    if (llState.activeStudyItemId === itemId) closeStudyDrawer();
    if (llState.filteredCount > llState.items.length || (llState.items.length === 0 && llState.page > 1)) {
      if (llState.items.length === 0 && llState.page > 1) {
        llState.page = Math.max(1, llState.page - 1);
      }
      void loadLibraryItems({ showSkeleton: false, animate: false });
      return;
    }
    renderBrowseStats();
    renderBrowseItems();
  }

  /**
   * Completion writes are serialized per item so a fast double-click cannot
   * land out of order, and only the newest click may patch/roll back the UI.
   */
  let completionTokenSeq = 0;
  const completionPatchChains = new Map();
  const completionLatestTokens = new Map();

  function requestCompletionPatch(itemId, next) {
    const key = String(itemId);
    const token = ++completionTokenSeq;
    completionLatestTokens.set(key, token);
    const previous = completionPatchChains.get(key) || Promise.resolve();
    const run = previous
      .catch(() => {})
      .then(() =>
        apiFetch(`/api/learning-library/items/${encodeURIComponent(itemId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ isCompleted: next }),
        }),
      );
    const settled = run.catch(() => {});
    completionPatchChains.set(key, settled);
    settled.then(() => {
      if (completionPatchChains.get(key) === settled) completionPatchChains.delete(key);
    });
    return { token, run };
  }

  function isLatestCompletionWrite(itemId, token) {
    return completionLatestTokens.get(String(itemId)) === token;
  }

  async function handleItemPatch(id, patch) {
    try {
      const res = await apiFetch(`/api/learning-library/items/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (res?.item) {
        replaceItemInMemory(res.item);
        await loadLibraryItems();
      }
    } catch (err) {
      showToast(err?.message || 'Could not update item.');
    }
  }

  async function handleSaveToVocabulary(item) {
    if (!item) return;
    if (ws()?.requireAuthBeforeAction) {
      const ok = ws().requireAuthBeforeAction({ type: 'section', section: 'learning-library' });
      if (!ok) return;
    }

    try {
      await apiFetch('/api/vocabulary', {
        method: 'POST',
        body: JSON.stringify({
          term: item.expression,
          ipa: item.ipa || '',
          partOfSpeech: item.categoryLabel || 'expression',
          definition: item.coreMeaning,
          generalTranslation: item.textbookEquivalent ? `Contrast: ${item.textbookEquivalent}` : '',
          translation: item.localizedMeaning || '',
          contextSentence: item.examples?.[0]?.sentence || '',
          lessonTitle: `${getActiveDomain()?.title || 'Generate Phrases'} · ${item.categoryLabel}`,
        }),
      });
      if (ws()?.refreshVocabulary) {
        await ws().refreshVocabulary();
      }
      document
        .querySelectorAll(`[data-ll-save-vocab="${CSS.escape(item.id)}"]`)
        .forEach((btn) => {
          btn.classList.add('is-saved');
          const iconOnly =
            btn.classList.contains('ll-row-icon') || btn.classList.contains('ll-util-btn');
          btn.innerHTML = iconOnly
            ? icon('bookmark-check')
            : `${icon('bookmark-check')}<span>In Flashcards</span>`;
          btn.title = 'In Flashcards';
          btn.setAttribute('aria-label', 'In Flashcards');
        });
      showToast(`Saved "${item.expression}" to Vocabulary Flashcards`);
    } catch (err) {
      showToast(err?.message || 'Failed to save to Vocabulary.');
    }
  }

  async function handleOpenWordLookup(word, contextSentence, itemId, sourceSpan) {
    if (!word || !global.FlaptapWordLookup) return;
    const lang =
      document.getElementById('ll-target-lang-select')?.value ||
      llState.targetLanguage ||
      getCurrentUser()?.nativeLanguage ||
      'ar';

    await global.FlaptapWordLookup.open({
      word,
      sourceEl: sourceSpan,
      contextSentence: contextSentence || word,
      endpoint: '/api/learning-library/define-word',
      payload: {
        itemId: itemId || undefined,
        word,
        contextSentence: contextSentence || undefined,
        language: lang,
      },
      fetcher: apiFetch,
      canPlay: false,
      canSpeak: true,
      canSave: true,
      saveLabel: '+ Save to Vocabulary',
      savedLabel: 'Saved in Vocabulary',
      isSavedFn: (term) => Boolean(ws()?.isVocabularySaved && ws().isVocabularySaved(term)),
      onSave: async (lookup) => {
        if (!getCurrentUser() && ws()?.requireAuthBeforeAction) {
          ws().requireAuthBeforeAction({ type: 'section', section: 'learning-library' });
          return;
        }
        try {
          await apiFetch('/api/vocabulary', {
            method: 'POST',
            body: JSON.stringify({
              term: lookup.term,
              ipa: lookup.ipa || '',
              partOfSpeech: lookup.partOfSpeech || '',
              definition: lookup.definition || '',
              generalTranslation: lookup.generalTranslation || '',
              translation: lookup.translation || '',
              contextSentence: lookup.contextSentence || '',
              lessonTitle: getActiveDomain()?.title || 'Generate Phrases',
            }),
          });
          if (ws()?.refreshVocabulary) await ws().refreshVocabulary();
          global.FlaptapWordLookup.syncSavedButtonDom();
          showToast(`Saved "${lookup.term}" to Vocabulary Flashcards`);
        } catch (err) {
          showToast(err?.message || 'Could not save word.');
        }
      },
    });
  }

  function downloadFile(filename, content, mimeType) {
    U.downloadBlob(content, filename, mimeType);
  }

  async function handleExportJson() {
    try {
      const data = await apiFetch(
        `/api/learning-library/export?domainId=${encodeURIComponent(llState.activeDomainId)}`,
        { method: 'GET' },
      );
      const stamp = new Date().toISOString().slice(0, 10);
      downloadFile(
        `flaptap-learning-library-${llState.activeDomainId}-${stamp}.json`,
        JSON.stringify(data, null, 2),
        'application/json;charset=utf-8',
      );
      showToast('Generate Phrases exported (.json)');
    } catch (err) {
      showToast(err?.message || 'Export failed.');
    }
  }

  function handleExportMarkdown() {
    const domain = getActiveDomain();
    const items = llState.items || [];
    if (items.length === 0) {
      showToast('No items in current view to export.');
      return;
    }

    const lines = [
      `# Flaptap Generate Phrases — ${domain?.title || llState.activeDomainId}`,
      `Exported: ${new Date().toISOString()} · ${items.length} items`,
      '',
    ];

    items.forEach((it, idx) => {
      lines.push(`## ${idx + 1}. ${it.expression} ${it.ipa ? `\`${it.ipa}\`` : ''}`);
      lines.push(`- **Category:** ${it.categoryLabel}${it.register ? ` · **Register:** ${it.register}` : ''}`);
      if (it.spokenForm) lines.push(`- **Spoken Form:** ${it.spokenForm}`);
      lines.push(`- **Meaning:** ${it.coreMeaning}`);
      if (it.localizedMeaning) lines.push(`- **Translation:** ${it.localizedMeaning}`);
      if (it.patternSlots?.length) {
        const slotLegend = it.patternSlots
          .filter((slot) => slot?.slot)
          .map(
            (slot) =>
              `[${slot.slot}] ${slot.role || 'slot'}${slot.example ? ` (e.g. ${slot.example})` : ''}`,
          )
          .join(' · ');
        if (slotLegend) lines.push(`- **Pattern Slots:** ${slotLegend}`);
      }
      if (it.textbookEquivalent) lines.push(`- **Textbook Contrast:** ${it.textbookEquivalent}`);
      if (it.variations?.length) lines.push(`- **Variations:** ${it.variations.join(', ')}`);
      if (it.combinations?.length) lines.push(`- **Combinations:** ${it.combinations.join(', ')}`);
      if (it.usagePatterns?.length) {
        lines.push('- **Usage Patterns:**');
        it.usagePatterns.forEach((p) => {
          lines.push(`  - \`${p.pattern}\` — ${p.meaning}${p.example ? ` ("${p.example}")` : ''}`);
        });
      }
      if (it.examples?.length) {
        lines.push('- **Examples:**');
        it.examples.forEach((ex) => {
          lines.push(`  - [${ex.speakerContext}] "${ex.sentence}"`);
        });
      }
      lines.push('');
    });

    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(
      `flaptap-learning-library-${llState.activeDomainId}-${stamp}.md`,
      lines.join('\n'),
      'text/markdown;charset=utf-8',
    );
    showToast('Generate Phrases exported (.md)');
  }

  /* ========================================================================
     SHARED ITEM ACTION DELEGATION (CARDS + TABLE + STUDY DRAWER)
     ======================================================================== */

  async function handleDelegatedActionClick(e) {
    const completeBtn = e.target.closest('[data-ll-toggle-complete]');
    if (completeBtn) {
      e.stopPropagation();
      const id = completeBtn.getAttribute('data-ll-toggle-complete');
      const item = findItemAnywhere(id);
      if (!item) return;
      const prev = Boolean(item.isCompleted);
      const next = !prev;

      const prevTotal = Number(llState.stats?.totalItems) || 0;
      const prevCompleted = Number(llState.stats?.completedCount) || 0;
      const prevFilteredTotal =
        llState.hasLoadedOnce && typeof llState.filteredCount === 'number'
          ? llState.filteredCount
          : (llState.items || []).length;
      const prevFilteredCompleted =
        llState.hasLoadedOnce && typeof llState.filteredCompletedCount === 'number'
          ? llState.filteredCompletedCount
          : (llState.items || []).filter((it) => it.isCompleted).length;
      const prevBrowseMastery = llState.browseMastery;

      applyCompletionState(id, next);

      const { token, run } = requestCompletionPatch(id, next);
      try {
        const res = await run;
        if (!isLatestCompletionWrite(id, token)) return true;
        if (res?.item) {
          replaceItemInMemory(res.item);
          patchCompletionDom(res.item.id, Boolean(res.item.isCompleted));
        }

        if (next === true) {
          const nextTotal = Number(llState.stats?.totalItems) || prevTotal;
          const nextCompleted = Number(llState.stats?.completedCount) || 0;
          const justCompletedAll =
            nextTotal > 0 && prevCompleted < nextTotal && nextCompleted >= nextTotal;
          const justCompletedFiltered =
            prevBrowseMastery === 'pending'
              ? prevFilteredTotal === 1
              : prevFilteredTotal > 0 &&
                prevFilteredCompleted < prevFilteredTotal &&
                (Number(llState.filteredCompletedCount) || 0) >= prevFilteredTotal;

          if (justCompletedAll) {
            global.FlaptapCelebrate?.trigger?.({
              title: 'Generate Phrases Completed!',
              subtitle: `All ${nextTotal} expression${nextTotal === 1 ? '' : 's'} mastered`,
              originEl: completeBtn,
            });
          } else if (justCompletedFiltered) {
            global.FlaptapCelebrate?.trigger?.({
              title:
                prevBrowseMastery === 'pending'
                  ? 'All Remaining Studied!'
                  : 'Collection Completed!',
              subtitle:
                prevBrowseMastery === 'pending'
                  ? 'Zero unstudied expressions left in this view'
                  : `All ${prevFilteredTotal} expression${prevFilteredTotal === 1 ? '' : 's'} in this view studied`,
              originEl: completeBtn,
            });
          }
        }

        dropRowWhenFilteredOut(id);
      } catch (err) {
        if (!isLatestCompletionWrite(id, token)) return true;
        applyCompletionState(id, prev);
        showToast(err?.message || 'Could not update completion.');
      }
      return true;
    }

    const studyBtn = e.target.closest('[data-ll-open-study]');
    if (studyBtn) {
      e.stopPropagation();
      openStudyDrawer(studyBtn.getAttribute('data-ll-open-study'));
      return true;
    }

    const speakBtn = e.target.closest('[data-ll-speak]');
    if (speakBtn) {
      e.stopPropagation();
      const text = speakBtn.getAttribute('data-ll-speak');
      if (text && global.FlaptapWordLookup?.speakText) {
        global.FlaptapWordLookup.speakText(text);
      }
      return true;
    }

    const favBtn = e.target.closest('[data-ll-toggle-fav]');
    if (favBtn) {
      e.stopPropagation();
      const id = favBtn.getAttribute('data-ll-toggle-fav');
      const item = findItemAnywhere(id);
      if (item) {
        await handleItemPatch(id, { isFavorite: !item.isFavorite });
      }
      return true;
    }

    const revealBtn = e.target.closest('[data-ll-reveal]');
    if (revealBtn) {
      e.stopPropagation();
      const id = revealBtn.getAttribute('data-ll-reveal');
      llState.revealedCardIds.add(id);
      renderBrowseItems();
      if (llState.activeStudyItemId === id) renderStudyDrawer();
      return true;
    }

    const saveNoteBtn = e.target.closest('[data-ll-save-note]');
    if (saveNoteBtn) {
      const id = saveNoteBtn.getAttribute('data-ll-save-note');
      const input = document.querySelector(`[data-ll-note-input="${CSS.escape(id)}"]`);
      await handleItemPatch(id, { userNotes: input?.value || '' });
      showToast('Study note saved');
      return true;
    }

    const saveVocabBtn = e.target.closest('[data-ll-save-vocab]');
    if (saveVocabBtn) {
      e.stopPropagation();
      const id = saveVocabBtn.getAttribute('data-ll-save-vocab');
      const item = findItemAnywhere(id);
      if (item) await handleSaveToVocabulary(item);
      return true;
    }

    const deleteBtn = e.target.closest('[data-ll-delete-item]');
    if (deleteBtn) {
      e.stopPropagation();
      const id = deleteBtn.getAttribute('data-ll-delete-item');
      const targetItem = llState.items.find((entry) => entry.id === id);
      const exprLabel = String(targetItem?.expression || 'Expression').trim();

      const snapshot = {
        items: [...llState.items],
        stats: { ...(llState.stats || {}) },
        filteredCount: llState.filteredCount,
        filteredCompletedCount: llState.filteredCompletedCount,
        page: llState.page,
        totalPages: llState.totalPages,
        activeStudyItemId: llState.activeStudyItemId,
      };

      const renderCurrentSnapshot = () => {
        renderBrowseStats();
        renderBrowseFilters();
        renderBrowseItems();
        renderBrowsePagination();
      };

      const applyOptimisticDelete = () => {
        llState.items = llState.items.filter((entry) => entry.id !== id);
        if (llState.stats) {
          llState.stats.totalItems = Math.max(0, (Number(llState.stats.totalItems) || 0) - 1);
          if (targetItem?.isCompleted) {
            llState.stats.completedCount = Math.max(0, (Number(llState.stats.completedCount) || 0) - 1);
          }
          if (targetItem?.isFavorite) {
            llState.stats.favoritesCount = Math.max(0, (Number(llState.stats.favoritesCount) || 0) - 1);
          }
        }
        llState.filteredCount = Math.max(0, (Number(llState.filteredCount) || 0) - 1);
        if (targetItem?.isCompleted) {
          llState.filteredCompletedCount = Math.max(0, (Number(llState.filteredCompletedCount) || 0) - 1);
        }
        if (llState.activeStudyItemId === id) {
          closeStudyDrawer();
        }
        renderCurrentSnapshot();
      };

      const restoreSnapshot = () => {
        llState.items = snapshot.items;
        llState.stats = snapshot.stats;
        llState.filteredCount = snapshot.filteredCount;
        llState.filteredCompletedCount = snapshot.filteredCompletedCount;
        llState.page = snapshot.page;
        llState.totalPages = snapshot.totalPages;
        renderCurrentSnapshot();
      };

      const commitDelete = async ({ keepalive = false } = {}) => {
        await apiFetch(`/api/learning-library/items/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          keepalive,
        });
        if (!keepalive) {
          if (llState.items.length === 0 && llState.page > 1) {
            llState.page = Math.max(1, llState.page - 1);
            syncLibraryRoute(true);
          }
          await loadLibraryItems({ showSkeleton: false, animate: false });
        }
      };

      if (global.FlaptapConfirm?.confirmAndUndo) {
        await global.FlaptapConfirm.confirmAndUndo({
          title: 'Remove expression?',
          message: 'This expression will be removed from Generate Phrases.',
          detail: exprLabel,
          confirmLabel: 'Remove',
          undoMessage: `Removed "${exprLabel}"`,
          restoredMessage: `Restored "${exprLabel}"`,
          onApply: applyOptimisticDelete,
          onUndo: restoreSnapshot,
          onCommit: commitDelete,
        });
      }
      return true;
    }

    return false;
  }

  function bindLibrarySelectionLookup(container) {
    if (!container || !global.FlaptapWordLookup?.bindSelectionLookup) return;
    global.FlaptapWordLookup.bindSelectionLookup(container, {
      maxLength: 320,
      onSelect: (text, meta) => {
        const node = meta?.range?.startContainer;
        const element = node?.nodeType === 1 ? node : node?.parentElement;
        const word = element?.closest('.clickable-word');
        handleOpenWordLookup(
          text,
          word?.dataset.contextSentence || text,
          word?.dataset.llItemId || llState.activeStudyItemId || '',
          meta?.sourceEl || null,
        );
      },
    });
  }

  /* ========================================================================
     EVENT BINDING
     ======================================================================== */

  function closeMoreMenu() {
    const menu = document.getElementById('ll-more-menu');
    const btn = document.getElementById('ll-more-menu-btn');
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function bindEvents() {
    const section = document.getElementById('section-learning-library');
    if (!section) return;

    // Generate Form Submit
    document.getElementById('ll-generate-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      handleGenerateClick();
    });

    // Domain Switcher
    document.getElementById('ll-domain-pills')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-ll-domain]');
      if (!btn) return;
      const nextDomain = btn.getAttribute('data-ll-domain');
      if (!nextDomain || nextDomain === llState.activeDomainId) return;

      llState.activeDomainId = nextDomain;
      llState.genCategoryId = 'all';
      llState.genRegister = '';
      llState.browseCategoryId = 'all';
      llState.browseRegister = 'all';
      llState.page = 1;
      llState.justGeneratedIds.clear();
      const banner = document.getElementById('ll-latest-batch-banner');
      if (banner) banner.hidden = true;

      syncLibraryRoute(true);

      renderDomainSwitcher();
      renderDomainContext();
      if (getCurrentUser()) {
        await loadLibraryItems({ showSkeleton: true, animate: true });
      }
    });

    // Item Count Preset Pills + Custom Input
    document.getElementById('ll-count-pills')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ll-count]');
      if (!btn) return;
      const num = Math.max(1, Math.min(25, Number(btn.getAttribute('data-ll-count')) || 8));
      llState.requestedCount = num;
      renderCountControls();
      syncGenerateButtonLabel();
    });

    const countInputEl = document.getElementById('ll-count-input');
    countInputEl?.addEventListener('input', (e) => {
      const raw = Number(e.target.value);
      if (Number.isFinite(raw) && raw >= 1 && raw <= 25) {
        llState.requestedCount = Math.round(raw);
        document.querySelectorAll('.ll-count-pill').forEach((p) => {
          p.classList.toggle('active', Number(p.dataset.llCount) === llState.requestedCount);
        });
        syncGenerateButtonLabel();
      }
    });
    countInputEl?.addEventListener('change', (e) => {
      const clamped = Math.max(1, Math.min(25, Math.round(Number(e.target.value) || 8)));
      llState.requestedCount = clamped;
      renderCountControls();
      syncGenerateButtonLabel();
    });

    // Generator Selects
    document.getElementById('ll-gen-category-select')?.addEventListener('change', (e) => {
      llState.genCategoryId = e.target.value || 'all';
    });
    document.getElementById('ll-register-select')?.addEventListener('change', (e) => {
      llState.genRegister = e.target.value || '';
    });
    document.getElementById('ll-target-lang-select')?.addEventListener('change', (e) => {
      llState.targetLanguage = e.target.value || 'ar';
      localStorage.setItem('flaptap_trans_lang', llState.targetLanguage);
    });
    document.getElementById('ll-focus-topic-input')?.addEventListener('input', (e) => {
      llState.focusTopic = e.target.value || '';
    });

    document.getElementById('ll-cancel-btn')?.addEventListener('click', () => cancelGeneration());
    document.getElementById('ll-dismiss-batch-banner')?.addEventListener('click', () => {
      const banner = document.getElementById('ll-latest-batch-banner');
      if (banner) banner.hidden = true;
    });

    // Inline error controls
    document.getElementById('ll-btn-err-dismiss')?.addEventListener('click', () => hideGenError());
    document.getElementById('ll-btn-err-retry')?.addEventListener('click', () => {
      hideGenError();
      handleGenerateClick();
    });

    // Library Filters
    document.querySelectorAll('[data-ll-mastery-filter]').forEach((pill) => {
      pill.addEventListener('click', () => {
        llState.browseMastery = pill.getAttribute('data-ll-mastery-filter') || 'all';
        llState.page = 1;
        syncLibraryRoute(true);
        syncFilterPillsUi();
        loadLibraryItems({ showSkeleton: true, animate: true });
      });
    });

    document.getElementById('ll-browse-category-select')?.addEventListener('change', (e) => {
      llState.browseCategoryId = e.target.value || 'all';
      llState.page = 1;
      syncLibraryRoute(true);
      loadLibraryItems({ showSkeleton: true, animate: true });
    });

    document.getElementById('ll-browse-register-select')?.addEventListener('change', (e) => {
      llState.browseRegister = e.target.value || 'all';
      llState.page = 1;
      syncLibraryRoute(true);
      loadLibraryItems({ showSkeleton: true, animate: true });
    });

    document.getElementById('ll-browse-sort-select')?.addEventListener('change', (e) => {
      llState.browseSort = e.target.value || 'newest';
      llState.page = 1;
      syncLibraryRoute(true);
      loadLibraryItems({ showSkeleton: true, animate: true });
    });

    document.getElementById('ll-browse-search-input')?.addEventListener('input', (e) => {
      llState.browseSearch = e.target.value || '';
      llState.page = 1;
      syncLibraryRoute(true);
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => loadLibraryItems({ showSkeleton: true, animate: true }), 180);
    });

    // Pagination Controls (delegated to shared FlaptapPagination)
    paginationBar.bind({
      onPageChange: goToPage,
      onPageSizeChange: setPageSize,
    });

    // Recall Mode & View Mode
    document.getElementById('ll-recall-toggle-btn')?.addEventListener('click', (e) => {
      llState.recallMaskMode = !llState.recallMaskMode;
      llState.revealedCardIds.clear();
      e.currentTarget.classList.toggle('active', llState.recallMaskMode);
      e.currentTarget.setAttribute('aria-pressed', llState.recallMaskMode ? 'true' : 'false');
      renderBrowseItems();
      if (llState.activeStudyItemId) renderStudyDrawer();
    });

    document.getElementById('ll-shell-brand-btn')?.addEventListener('click', () => {
      scrollRestorer.clear();
      switchView('generate');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.getElementById('ll-view-cards-btn')?.addEventListener('click', () => {
      if (llState.viewMode === 'cards') return;
      llState.viewMode = 'cards';
      llState.animateNextRender = true;
      try {
        localStorage.setItem('flaptap_ll_view_mode', 'cards');
      } catch {}
      syncViewModeButtons();
      if (llState.isLoadingList) {
        showSkeletonLoadingState();
      } else {
        renderBrowseItems();
      }
    });

    document.getElementById('ll-view-table-btn')?.addEventListener('click', () => {
      if (llState.viewMode === 'table') return;
      llState.viewMode = 'table';
      llState.animateNextRender = true;
      try {
        localStorage.setItem('flaptap_ll_view_mode', 'table');
      } catch {}
      syncViewModeButtons();
      if (llState.isLoadingList) {
        showSkeletonLoadingState();
      } else {
        renderBrowseItems();
      }
    });

    // More Menu (Export & Clear)
    const moreBtn = document.getElementById('ll-more-menu-btn');
    const moreMenu = document.getElementById('ll-more-menu');
    moreBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!moreMenu) return;
      const nextHidden = !moreMenu.hidden;
      moreMenu.hidden = nextHidden;
      moreBtn.setAttribute('aria-expanded', nextHidden ? 'false' : 'true');
    });

    document.addEventListener('click', (e) => {
      if (moreMenu && !moreMenu.hidden && !e.target.closest('#ll-more-menu-wrap')) {
        closeMoreMenu();
      }
    });

    document.getElementById('ll-export-json-btn')?.addEventListener('click', () => {
      closeMoreMenu();
      handleExportJson();
    });
    document.getElementById('ll-export-md-btn')?.addEventListener('click', () => {
      closeMoreMenu();
      handleExportMarkdown();
    });

    document.getElementById('ll-clear-domain-btn')?.addEventListener('click', async () => {
      closeMoreMenu();
      const domain = getActiveDomain();
      const domainId = llState.activeDomainId;
      const domainTitle = domain?.title || 'Generate Phrases';
      if (!global.FlaptapConfirm?.confirmAndUndo) return;

      const snapshot = {
        items: [...llState.items],
        stats: { ...(llState.stats || {}) },
        filteredCount: llState.filteredCount,
        filteredCompletedCount: llState.filteredCompletedCount,
        page: llState.page,
        totalPages: llState.totalPages,
      };
      const renderSnapshot = () => {
        renderBrowseStats();
        renderBrowseFilters();
        renderBrowseItems();
        renderBrowsePagination();
      };

      await global.FlaptapConfirm.confirmAndUndo({
        title: `Clear ${domainTitle}?`,
        message: `All saved expressions in "${domainTitle}" will be removed.`,
        detail: `${Number(snapshot.stats?.totalItems || snapshot.items.length)} saved item(s)`,
        confirmLabel: 'Clear All',
        undoMessage: `Cleared ${domainTitle} expressions`,
        restoredMessage: `Restored ${domainTitle} expressions`,
        onApply: () => {
          llState.items = [];
          llState.stats = { ...(llState.stats || {}), totalItems: 0, completedCount: 0, favoritesCount: 0 };
          llState.filteredCount = 0;
          llState.filteredCompletedCount = 0;
          llState.page = 1;
          llState.totalPages = 1;
          llState.justGeneratedIds.clear();
          const banner = document.getElementById('ll-latest-batch-banner');
          if (banner) banner.hidden = true;
          closeStudyDrawer();
          renderSnapshot();
        },
        onUndo: () => {
          llState.items = snapshot.items;
          llState.stats = snapshot.stats;
          llState.filteredCount = snapshot.filteredCount;
          llState.filteredCompletedCount = snapshot.filteredCompletedCount;
          llState.page = snapshot.page;
          llState.totalPages = snapshot.totalPages;
          renderSnapshot();
        },
        onCommit: async ({ keepalive = false } = {}) => {
          await apiFetch('/api/learning-library/clear', {
            method: 'POST',
            keepalive,
            body: JSON.stringify({ domainId }),
          });
          if (!keepalive) await loadLibraryItems({ showSkeleton: false, animate: false });
        },
      });
    });

    // Study Drawer Controls
    const studyBackdrop = document.getElementById('ll-study-drawer-backdrop');
    const studyDrawerBody = document.getElementById('ll-study-drawer-body');
    const browseItemsContainer = document.getElementById('ll-browse-items-container');
    document.getElementById('ll-study-close-btn')?.addEventListener('click', closeStudyDrawer);
    document.getElementById('ll-study-back-btn')?.addEventListener('click', closeStudyDrawer);
    document.getElementById('ll-study-prev-btn')?.addEventListener('click', () => stepStudyDrawer(-1));
    document.getElementById('ll-study-next-btn')?.addEventListener('click', () => stepStudyDrawer(1));
    studyBackdrop?.addEventListener('click', (e) => {
      if (e.target === studyBackdrop) closeStudyDrawer();
    });
    studyDrawerBody?.addEventListener('click', (e) => {
      handleDelegatedActionClick(e);
    });
    bindLibrarySelectionLookup(browseItemsContainer);
    bindLibrarySelectionLookup(studyDrawerBody);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMoreMenu();
        if (studyBackdrop && !studyBackdrop.hidden) {
          closeStudyDrawer();
        }
      } else if (studyBackdrop && !studyBackdrop.hidden && !e.target.matches('input, textarea, select')) {
        if (e.key === 'ArrowLeft') stepStudyDrawer(-1);
        if (e.key === 'ArrowRight') stepStudyDrawer(1);
      }
    });

    // Delegated card/table interactions
    section.addEventListener('click', (e) => {
      handleDelegatedActionClick(e);
    });

    // Listen for auth/language changes emitted by workspace
    global.addEventListener('flaptap:auth-changed', (e) => {
      const nextUser = e?.detail?.user || getCurrentUser();
      const nextUserId = nextUser?.id || null;
      const changed = nextUserId !== lastAuthUserId;
      lastAuthUserId = nextUserId;
      populateLanguagesSelect();
      if (!changed) return;
      if (nextUser) {
        llState.page = 1;
        loadLibraryItems({ showSkeleton: true, animate: true });
      } else {
        llState.items = [];
        llState.page = 1;
        llState.totalPages = 1;
        llState.filteredCount = 0;
        llState.filteredCompletedCount = 0;
        llState.hasMore = false;
        llState.hasLoadedOnce = false;
        llState.isLoadingList = false;
        llState.justGeneratedIds.clear();
        llState.stats = {
          totalItems: 0,
          newCount: 0,
          learningCount: 0,
          masteredCount: 0,
          completedCount: 0,
          favoritesCount: 0,
          batchesCount: 0,
        };
        const banner = document.getElementById('ll-latest-batch-banner');
        if (banner) banner.hidden = true;
        closeStudyDrawer();
        renderBrowseAuthState();
        renderBrowseStats();
      }
    });

    global.addEventListener('flaptap:languages-loaded', () => {
      populateLanguagesSelect();
    });

    // Save exact scroll position so page refresh restores pixel-for-pixel
    scrollRestorer.bindLifecycle();
  }

  // Paint Apple skeleton placeholders on frame 0 when entering /library so the
  // user sees calm visual feedback immediately while auth & data hydrate.
  const bootPath = (global.location?.pathname || '').toLowerCase().replace(/\/+$/, '') || '/';
  if (
    bootPath === '/library' ||
    bootPath === '/learning-library' ||
    bootPath === '/library/browse' ||
    bootPath === '/learning-library/browse'
  ) {
    const authGate = document.getElementById('ll-auth-gate-card');
    if (authGate) authGate.hidden = true;
    scrollRestorer.prepareFromNavigation();
    showSkeletonLoadingState();
  }

  global.FlaptapLearningLibrary = {
    init,
    applyRouteState,
    switchView,
    resumeGeneration,
    loadLibraryItems,
    openStudyDrawer,
    closeStudyDrawer,
    getState: () => llState,
  };
})(window);
