/* ==========================================================================
   FLAPTAP LEARNING LIBRARY (learning-library.js)
   Centralized Editorial Generation & Study Workspace (Synced with Lessons UX)
   ========================================================================== */

(function (global) {
  'use strict';

  const PRESET_COUNTS = [3, 5, 8, 12, 20];

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
    // Library State
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
    if (ws()?.renderCheckButtonHtml) {
      return ws().renderCheckButtonHtml({
        checked,
        pillLabel: pillLabel || '',
        attrs: `data-ll-toggle-complete="${escapeHtml(itemId)}"`,
      });
    }
    const cls = `item-check-btn${pillLabel ? ' item-check-btn--pill' : ''}${checked ? ' is-checked' : ''}`;
    return `<button type="button" class="${cls}" data-ll-toggle-complete="${escapeHtml(itemId)}" aria-pressed="${checked ? 'true' : 'false'}" aria-label="Mark expression complete" title="Mark expression complete"><svg class="chk-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line class="chk-dash" x1="6.5" y1="12" x2="17.5" y2="12"></line><polyline class="chk-tick" points="19.5 7 9.5 17 4.5 12"></polyline></svg>${pillLabel ? `<span>${escapeHtml(pillLabel)}</span>` : ''}</button>`;
  }

  function tokenizeExampleSentence(sentence, itemId) {
    if (global.FlaptapWordLookup?.tokenizeClickableWords) {
      return global.FlaptapWordLookup.tokenizeClickableWords(escapeHtml(sentence), {
        contextSentence: sentence,
        llItemId: itemId,
      });
    }
    return escapeHtml(sentence);
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
    return escapeHtml(text).replace(/\[([^[\]]{1,40})\]/g, (_match, name) => {
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

    const tasks = [];
    if (!llState.domainsLoaded) {
      tasks.push(loadDomainsCatalog());
    }
    if (llState.aiSelector) {
      tasks.push(llState.aiSelector.init());
    }
    if (tasks.length > 0) {
      await Promise.all(tasks);
      syncGenerateButtonLabel();
    }

    if (activeRoute) {
      await applyRouteState(activeRoute);
    } else if (getCurrentUser()) {
      await loadLibraryItems();
    } else {
      renderBrowseAuthState();
    }
  }

  async function applyRouteState(routeState) {
    if (!routeState || routeState.section !== 'learning-library') return;

    if (
      routeState.domainId &&
      llState.domains.some((d) => d.id === routeState.domainId) &&
      routeState.domainId !== llState.activeDomainId
    ) {
      llState.activeDomainId = routeState.domainId;
      llState.genCategoryId = 'all';
      llState.genRegister = '';
      llState.browseCategoryId = 'all';
      llState.browseRegister = 'all';
      renderDomainSwitcher();
      renderDomainContext();
    }

    llState.activeView = routeState.subview === 'browse' ? 'browse' : 'generate';

    if (getCurrentUser()) {
      await loadLibraryItems();
    } else {
      renderBrowseAuthState();
    }

    if (llState.activeView === 'browse') {
      const shelf = document.getElementById('ll-library-shelf');
      if (shelf) {
        requestAnimationFrame(() => {
          shelf.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        return `<button type="button" class="filter-pill ${active ? 'active' : ''}" data-ll-domain="${escapeHtml(d.id)}" aria-pressed="${active ? 'true' : 'false'}">${icon(domainIcon(d.id))}<span>${escapeHtml(d.title)}</span></button>`;
      })
      .join('');
  }

  function renderDomainContext() {
    const domain = getActiveDomain();
    if (!domain) return;

    const kickerEl = document.getElementById('ll-domain-kicker');
    const headlineEl = document.getElementById('ll-domain-headline');
    const subcopyEl = document.getElementById('ll-domain-subcopy');
    const focusInput = document.getElementById('ll-focus-topic-input');
    const libHeadingEl = document.getElementById('ll-library-heading');

    if (kickerEl) kickerEl.textContent = `${domain.title} · Learning Library`;
    if (headlineEl) {
      headlineEl.innerHTML =
        domain.id === 'natural_american_english'
          ? 'Build your living <span class="vox-underline">Natural American English</span> library.'
          : `Build your <span class="vox-underline">${escapeHtml(domain.title)}</span> library.`;
    }
    if (subcopyEl) subcopyEl.textContent = domain.subtitle;
    if (libHeadingEl) {
      const plural = capitalize(domain.itemNounPlural || 'Expressions');
      libHeadingEl.textContent = `${plural} Library`;
      const statTotalLabel = document.getElementById('ll-stat-total-label');
      if (statTotalLabel) statTotalLabel.textContent = `Saved ${plural}`;
    }
    if (focusInput && domain.suggestedFocusTopics?.length) {
      focusInput.placeholder = `Optional situation or topic (e.g. ${domain.suggestedFocusTopics.slice(0, 2).join(', ')})...`;
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
        'Sign in or create an account to generate and permanently save expressions to your personal Learning Library.',
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
        // locally instead of paying another roundtrip before showing results.
        const freshItems = Array.isArray(completedResult.items) ? completedResult.items : [];
        if (freshItems.length > 0) {
          const freshIds = new Set(freshItems.map((it) => it.id));
          llState.items = [...freshItems, ...llState.items.filter((it) => !freshIds.has(it.id))];
          if (completedResult.stats) llState.stats = completedResult.stats;
          if (completedResult.categoryCounts) llState.categoryCounts = completedResult.categoryCounts;
          if (completedResult.registerCounts) llState.registerCounts = completedResult.registerCounts;
          renderBrowseAuthState();
          renderBrowseStats();
          renderBrowseFilters();
          renderBrowseItems();
        } else {
          await loadLibraryItems();
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

  async function loadLibraryItems() {
    if (!getCurrentUser()) {
      renderBrowseAuthState();
      return;
    }

    const seq = ++libraryLoadSeq;
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

    try {
      const res = await apiFetch(`/api/learning-library/items?${params.toString()}`, {
        method: 'GET',
      });
      if (seq !== libraryLoadSeq) return;
      llState.items = Array.isArray(res?.items) ? res.items : [];
      if (res?.stats) llState.stats = res.stats;
      llState.categoryCounts = res?.categoryCounts || {};
      llState.registerCounts = res?.registerCounts || {};

      try {
        await hydrateSequenceNumbers(seq);
      } catch {
        // Index is non-critical; render the library even if it can't be hydrated.
      }
      if (seq !== libraryLoadSeq) return;

      renderBrowseAuthState();
      renderBrowseStats();
      renderBrowseFilters();
      renderBrowseItems();
      if (llState.activeStudyItemId) {
        renderStudyDrawer();
      }
    } catch (err) {
      if (seq !== libraryLoadSeq) return;
      if (err.status === 401) {
        renderBrowseAuthState();
        return;
      }
      showToast(err?.message || 'Could not load Learning Library.');
    }
  }

  function syncSidebarLlBadge(total, user) {
    const badge = document.getElementById('nav-ll-badge');
    if (!badge) return;
    badge.textContent = String(total || 0);
    badge.hidden = !user || (total || 0) === 0;
  }

  function renderBrowseAuthState() {
    const user = getCurrentUser();
    const gate = document.getElementById('ll-auth-gate-card');
    const controls = document.getElementById('ll-library-controls');
    const container = document.getElementById('ll-browse-items-container');
    const emptyEl = document.getElementById('ll-browse-empty');
    const progressEl = document.getElementById('ll-browse-progress-bar');

    syncSidebarLlBadge(llState.stats?.totalItems || 0, user);

    if (gate) gate.hidden = Boolean(user);
    if (controls) controls.hidden = !user;

    if (!user) {
      if (container) container.innerHTML = '';
      if (emptyEl) emptyEl.hidden = true;
      if (progressEl) progressEl.hidden = true;
      const countEl = document.getElementById('ll-library-count-label');
      if (countEl) countEl.textContent = '0';
    }
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

    syncSidebarLlBadge(total, getCurrentUser());
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

  function renderBrowseItems() {
    const container = document.getElementById('ll-browse-items-container');
    const emptyEl = document.getElementById('ll-browse-empty');
    const countEl = document.getElementById('ll-library-count-label');
    if (!container) return;

    const items = llState.items || [];
    items.sort(compareLibraryItems);
    if (countEl) countEl.textContent = String(items.length);

    if (!getCurrentUser()) {
      container.innerHTML = '';
      if (emptyEl) emptyEl.hidden = true;
      return;
    }

    ws()?.renderSubjectProgressBar?.('ll-browse-progress-bar', {
      total: items.length,
      completed: items.filter((it) => it.isCompleted).length,
    });

    if (emptyEl) emptyEl.hidden = items.length > 0;
    if (items.length === 0) {
      container.innerHTML = '';
      return;
    }

    if (llState.viewMode === 'table') {
      container.innerHTML = renderCompactTableHtml(items);
      return;
    }

    container.innerHTML = `<div class="ll-cards-grid">${items
      .map((item) => renderItemCardHtml(item))
      .join('')}</div>`;
  }

  function renderExampleBlock(ex, itemId, showNote) {
    return `
      <div class="ll-example-item">
        <div class="ll-example-head">
          <span class="ll-example-ctx" dir="ltr">${escapeHtml(ex.speakerContext || 'Everyday Spoken')}</span>
          <button type="button" class="lex-mini-btn" data-ll-speak="${escapeHtml(ex.sentence)}" title="Listen to example">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            <span>Listen</span>
          </button>
        </div>
        <div class="ll-example-sentence" dir="ltr">“${tokenizeExampleSentence(ex.sentence, itemId)}”</div>
        ${showNote && ex.explanation ? `<div class="ll-example-note">${escapeHtml(ex.explanation)}</div>` : ''}
      </div>
    `;
  }

  function renderItemCardHtml(item) {
    const isDone = Boolean(item.isCompleted);
    const isMasked = Boolean(llState.recallMaskMode && !llState.revealedCardIds.has(item.id));
    const isJustGenerated = llState.justGeneratedIds.has(item.id);
    const isSavedToVocab = Boolean(
      ws()?.isVocabularySaved && ws()?.isVocabularySaved(item.expression),
    );
    const showRegister = isDistinctLabel(item.register, item.categoryLabel);
    const showSpoken = isDistinctLabel(item.spokenForm, item.expression);
    const cardExamples = (Array.isArray(item.examples) ? item.examples : []).slice(0, 2);
    const sequenceNumber = Number(item.sequenceNumber) > 0 ? Number(item.sequenceNumber) : 0;

    return `
      <article class="ll-card${isDone ? ' is-item-completed' : ''}${isJustGenerated ? ' is-just-generated' : ''}" data-ll-card-id="${escapeHtml(item.id)}">
        <div class="ll-card-top">
          <div class="ll-card-lead">
            ${sequenceNumber ? `<span class="ll-item-index" title="Item ${sequenceNumber}" aria-label="Item ${sequenceNumber}">${sequenceNumber}</span>` : ''}
            <div class="ll-card-badges">
              <span class="ll-badge is-category">${escapeHtml(item.categoryLabel)}</span>
              ${showRegister ? `<span class="ll-badge is-register">${escapeHtml(item.register)}</span>` : ''}
            </div>
          </div>
          <div class="ll-card-top-actions">
            ${renderCheckButton(isDone, item.id)}
            ${window.FlaptapCopy ? window.FlaptapCopy.buttonHtml(item.expression, { className: 'll-icon-action' }) : ''}
            <button type="button" class="ll-icon-action" data-ll-speak="${escapeHtml(getSpeakableText(item))}" title="Pronounce expression" aria-label="Pronounce ${escapeHtml(item.expression)}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            </button>
            <button type="button" class="ll-icon-action ${item.isFavorite ? 'is-favorite' : ''}" data-ll-toggle-fav="${escapeHtml(item.id)}" title="Toggle favorite" aria-label="Toggle favorite">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="${item.isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.9"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </button>
            <button type="button" class="ll-icon-action is-delete" data-ll-delete-item="${escapeHtml(item.id)}" title="Delete expression" aria-label="Delete ${escapeHtml(item.expression)}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>

        <div class="ll-expr-head">
          <button type="button" class="ll-expr-title-btn" data-ll-open-study="${escapeHtml(item.id)}">
            <h3 class="ll-expr-title" dir="ltr">${renderSlotizedText(item.expression)}</h3>
          </button>
          ${
            item.ipa || showSpoken
              ? `<div class="ll-expr-meta-line" dir="ltr">
                  ${item.ipa ? `<span class="ll-expr-ipa ltr-num">${escapeHtml(item.ipa)}</span>` : ''}
                  ${showSpoken ? `<span class="ll-spoken-inline">Spoken: <strong>${escapeHtml(item.spokenForm)}</strong></span>` : ''}
                </div>`
              : ''
          }
        </div>

        ${renderPatternGuideHtml(item)}

        <div class="ll-meaning-block ${isMasked ? 'is-masked' : ''}">
          <div class="ll-meaning-body">
            <p class="ll-core-meaning">${escapeHtml(item.coreMeaning)}</p>
            ${
              item.localizedMeaning
                ? `<p class="ll-localized-meaning" dir="auto">${renderSlotizedText(item.localizedMeaning)}</p>`
                : ''
            }
          </div>
          ${
            isMasked
              ? `<button type="button" class="ll-recall-reveal-btn" data-ll-reveal="${escapeHtml(item.id)}">Reveal Meaning</button>`
              : ''
          }
        </div>

        ${
          cardExamples.length
            ? `<div class="ll-examples-list">${cardExamples
                .map((ex) => renderExampleBlock(ex, item.id, false))
                .join('')}</div>`
            : ''
        }

        <div class="ll-card-footer">
          <button type="button" class="lex-mini-btn ${isSavedToVocab ? 'is-saved' : ''}" data-ll-save-vocab="${escapeHtml(item.id)}" title="${isSavedToVocab ? 'In Flashcards' : 'Save to Flashcards'}" aria-label="${isSavedToVocab ? 'In Flashcards' : 'Save to Flashcards'}">
            ${icon(isSavedToVocab ? 'bookmark-check' : 'bookmark-plus')}
            <span>${isSavedToVocab ? 'In Flashcards' : 'Flashcards'}</span>
          </button>
          <button type="button" class="ll-study-link" data-ll-open-study="${escapeHtml(item.id)}" title="Study details" aria-label="Study details">
            <span>Study Details</span>
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
          <thead>
            <tr>
              <th class="ll-col-expression">Expression &amp; natural meaning</th>
              <th class="ll-col-examples">Where &amp; when you'll use it</th>
              <th class="ll-col-actions" aria-label="Row actions"></th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((item) => {
                const examples = (Array.isArray(item.examples) ? item.examples : []).slice(0, 2);
                const isDone = Boolean(item.isCompleted);
                const showSpoken = isDistinctLabel(item.spokenForm, item.expression);
                const isMasked = Boolean(llState.recallMaskMode && !llState.revealedCardIds.has(item.id));
                const isSavedToVocab = Boolean(
                  ws()?.isVocabularySaved && ws().isVocabularySaved(item.expression),
                );
                const sequenceNumber = Number(item.sequenceNumber) > 0 ? Number(item.sequenceNumber) : 0;
                const goalLang = String(item.targetLanguage || 'ar').toLowerCase();
                const isRtl = ['ar', 'fa', 'he', 'ur'].includes(goalLang);
                const copyBtn = window.FlaptapCopy
                  ? window.FlaptapCopy.buttonHtml(item.expression, { className: 'll-row-icon' })
                  : '';
                return `
                  <tr class="${isDone ? 'is-item-completed' : ''}" data-ll-row-id="${escapeHtml(item.id)}">
                    <td class="ll-cell-expression">
                      <div class="ll-row-primary">
                        ${sequenceNumber ? `<span class="ll-item-index" title="Item ${sequenceNumber}" aria-label="Item ${sequenceNumber}">${sequenceNumber}</span>` : ''}
                        ${renderCheckButton(isDone, item.id)}
                        <div class="ll-row-primary-body">
                          <div class="ll-expr-line">
                            <button type="button" class="ll-expr-title-btn" data-ll-open-study="${escapeHtml(item.id)}" title="Open study details" aria-label="Study ${escapeHtml(item.expression)}">
                              <span class="ll-expr-title" dir="ltr">${renderSlotizedText(item.expression)}</span>
                            </button>
                            <div class="ll-expr-inline-tools">
                              ${copyBtn}
                              <button type="button" class="ll-row-icon" data-ll-speak="${escapeHtml(getSpeakableText(item))}" title="Listen" aria-label="Listen to ${escapeHtml(item.expression)}">
                                ${icon('volume-2')}
                              </button>
                            </div>
                          </div>
                          ${
                            item.ipa || showSpoken
                              ? `<div class="ll-expr-meta-line" dir="ltr">
                                  ${item.ipa ? `<span class="ll-expr-ipa ltr-num">${escapeHtml(item.ipa)}</span>` : ''}
                                  ${showSpoken ? `<span class="ll-spoken-inline"><span class="ll-meta-label">Spoken</span> <strong>${escapeHtml(item.spokenForm)}</strong></span>` : ''}
                                </div>`
                              : ''
                          }
                          ${renderPatternGuideHtml(item)}
                          ${
                            item.localizedMeaning
                              ? `<div class="ll-arabic-block ${isMasked ? 'is-masked' : ''}">
                                  <p class="ll-arabic-text" dir="${isRtl ? 'rtl' : 'ltr'}" lang="${escapeHtml(goalLang)}">${renderSlotizedText(item.localizedMeaning)}</p>
                                  ${isMasked ? `<button type="button" class="ll-recall-reveal-btn" data-ll-reveal="${escapeHtml(item.id)}">Reveal Meaning</button>` : ''}
                                </div>`
                              : ''
                          }
                        </div>
                      </div>
                    </td>
                    <td class="ll-cell-examples">
                      ${
                        examples.length
                          ? `<div class="ll-use-list">${examples
                              .map(
                                (ex) => `
                                <div class="ll-use-item">
                                  <span class="ll-use-when" dir="ltr">${escapeHtml(ex.speakerContext || 'Everyday')}</span>
                                  <p class="ll-use-quote" dir="ltr">“${tokenizeExampleSentence(ex.sentence, item.id)}”</p>
                                </div>`,
                              )
                              .join('')}</div>`
                          : '<span class="ll-example-empty" aria-hidden="true">—</span>'
                      }
                    </td>
                    <td class="ll-cell-actions">
                      <div class="ll-row-actions">
                        <button type="button" class="ll-row-icon" data-ll-open-study="${escapeHtml(item.id)}" title="Study details" aria-label="Study details">
                          ${icon('chevron-right')}
                        </button>
                        <button type="button" class="ll-row-icon ${isSavedToVocab ? 'is-saved' : ''}" data-ll-save-vocab="${escapeHtml(item.id)}" title="${isSavedToVocab ? 'In Flashcards' : 'Save to Flashcards'}" aria-label="${isSavedToVocab ? 'In Flashcards' : 'Save to Flashcards'}">
                          ${icon(isSavedToVocab ? 'bookmark-check' : 'bookmark-plus')}
                        </button>
                        <button type="button" class="ll-row-icon is-delete" data-ll-delete-item="${escapeHtml(item.id)}" title="Delete expression" aria-label="Delete ${escapeHtml(item.expression)}">
                          ${icon('x')}
                        </button>
                      </div>
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
     SLIDE-OVER STUDY DETAIL DRAWER
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
    // The expression frame itself is already shown above; only list extra frames.
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
    if (drawerEl) drawerEl.classList.toggle('is-item-completed', isDone);

    body.innerHTML = `
      <div class="ll-card-badges">
        <span class="ll-badge is-category">${escapeHtml(item.categoryLabel)}</span>
        ${showRegister ? `<span class="ll-badge is-register">${escapeHtml(item.register)}</span>` : ''}
        ${item.tone ? `<span class="ll-badge">${escapeHtml(item.tone)}</span>` : ''}
      </div>

      <div class="ll-expr-head">
        <h2 class="ll-study-title" id="ll-study-title">${renderSlotizedText(item.expression)}</h2>
        ${
          item.ipa || showSpoken
            ? `<div class="ll-expr-meta-line">
                ${item.ipa ? `<span class="ll-expr-ipa ltr-num">${escapeHtml(item.ipa)}</span>` : ''}
                ${showSpoken ? `<span class="ll-spoken-inline">${escapeHtml(labels.spokenHeading || 'Spoken')}: <strong>${escapeHtml(item.spokenForm)}</strong></span>` : ''}
              </div>`
            : ''
        }
      </div>

      ${renderPatternGuideHtml(item, { stacked: true, onlySlots: true })}

      <div class="ll-study-actions-bar">
        ${renderCheckButton(isDone, item.id, isDone ? 'Completed' : 'Mark Done')}
        ${window.FlaptapCopy ? window.FlaptapCopy.buttonHtml(item.expression, { className: 'btn-secondary btn-xs' }) : ''}
        <button type="button" class="btn-secondary btn-xs" data-ll-speak="${escapeHtml(getSpeakableText(item))}" title="Pronounce" aria-label="Pronounce">${icon('volume-2')}</button>
        <button type="button" class="btn-secondary btn-xs ${item.isFavorite ? 'is-favorite' : ''}" data-ll-toggle-fav="${escapeHtml(item.id)}" title="${item.isFavorite ? 'Favorited' : 'Favorite'}" aria-label="${item.isFavorite ? 'Favorited' : 'Favorite'}">${icon('star')}</button>
        <button type="button" class="lex-mini-btn ${isSavedToVocab ? 'is-saved' : ''}" data-ll-save-vocab="${escapeHtml(item.id)}" title="${isSavedToVocab ? 'In Flashcards' : 'Save to Flashcards'}" aria-label="${isSavedToVocab ? 'In Flashcards' : 'Save to Flashcards'}">
          ${icon(isSavedToVocab ? 'bookmark-check' : 'bookmark-plus')}
          <span>${isSavedToVocab ? 'In Flashcards' : 'Save to Flashcards'}</span>
        </button>
      </div>

      <div class="ll-meaning-block ${isMasked ? 'is-masked' : ''}">
        <div class="ll-meaning-body">
          <p class="ll-core-meaning">${escapeHtml(item.coreMeaning)}</p>
          ${item.localizedMeaning ? `<p class="ll-localized-meaning" dir="auto">${renderSlotizedText(item.localizedMeaning)}</p>` : ''}
        </div>
        ${isMasked ? `<button type="button" class="ll-recall-reveal-btn" data-ll-reveal="${escapeHtml(item.id)}">Reveal Meaning</button>` : ''}
      </div>

      ${
        item.textbookEquivalent
          ? `<div class="ll-contrast-strip">
              <div class="ll-contrast-col">
                <span class="ll-contrast-label">${escapeHtml(labels.textbookContrastHeading || 'Textbook / Literal')}</span>
                <span class="ll-contrast-textbook">${escapeHtml(item.textbookEquivalent)}</span>
              </div>
              <div class="ll-contrast-col">
                <span class="ll-contrast-label">Natural Native</span>
                <span class="ll-contrast-native">${renderSlotizedText(item.expression)}</span>
              </div>
            </div>`
          : ''
      }

      ${
        examples.length
          ? `<div class="ll-chip-section">
              <span class="ll-sub-label">${escapeHtml(labels.examplesHeading || 'Natural Spoken Examples')}</span>
              <div class="ll-examples-list">
                ${examples.map((ex) => renderExampleBlock(ex, item.id, true)).join('')}
              </div>
            </div>`
          : ''
      }

      ${
        item.variations?.length
          ? `<div class="ll-chip-section">
              <span class="ll-sub-label">${escapeHtml(labels.variationsHeading || 'Variations & Shortcuts')}</span>
              <div class="ll-chips-wrap">${item.variations.map((v) => `<span class="ll-chip">${escapeHtml(v)}</span>`).join('')}</div>
            </div>`
          : ''
      }

      ${
        item.combinations?.length
          ? `<div class="ll-chip-section">
              <span class="ll-sub-label">${escapeHtml(labels.combinationsHeading || 'Combinations & Collocations')}</span>
              <div class="ll-chips-wrap">${item.combinations.map((c) => `<span class="ll-chip is-combo">${escapeHtml(c)}</span>`).join('')}</div>
            </div>`
          : ''
      }

      ${
        extraPatterns.length
          ? `<div class="ll-chip-section">
              <span class="ll-sub-label">${escapeHtml(labels.patternsHeading || 'Usage Patterns')}</span>
              ${extraPatterns
                .map(
                  (p) => `
                  <div class="ll-pattern-item">
                    <span class="ll-pattern-formula">${renderSlotizedText(p.pattern)}</span>
                    ${p.meaning ? `<span class="ll-pattern-meaning">${escapeHtml(p.meaning)}</span>` : ''}
                    ${p.example ? `<span class="ll-pattern-example">“${tokenizeExampleSentence(p.example, item.id)}”</span>` : ''}
                  </div>`,
                )
                .join('')}
            </div>`
          : ''
      }

      ${
        item.phoneticBreakdown
          ? `<div class="ll-detail-callout"><strong>${escapeHtml(labels.mechanicsHeading || 'Spoken Mechanics')}:</strong> ${escapeHtml(item.phoneticBreakdown)}</div>`
          : ''
      }

      ${
        item.nativeContext || item.mistakesToAvoid
          ? `<div class="ll-detail-callout">
              ${item.nativeContext ? `<div><strong>${escapeHtml(labels.nuanceHeading || 'Context & Vibe')}:</strong> ${escapeHtml(item.nativeContext)}</div>` : ''}
              ${item.mistakesToAvoid ? `<div style="margin-top: 6px;"><strong>Avoid:</strong> ${escapeHtml(item.mistakesToAvoid)}</div>` : ''}
            </div>`
          : ''
      }

      ${
        item.relatedExpressions?.length
          ? `<div class="ll-chip-section">
              <span class="ll-sub-label">Related Native Expressions</span>
              <div class="ll-chips-wrap">${item.relatedExpressions.map((r) => `<span class="ll-chip">${escapeHtml(r)}</span>`).join('')}</div>
            </div>`
          : ''
      }

      <div class="ll-chip-section">
        <span class="ll-sub-label">Personal Note</span>
        <div class="ll-notes-row">
          <input type="text" class="ll-notes-input" data-ll-note-input="${escapeHtml(item.id)}" value="${escapeHtml(item.userNotes || '')}" placeholder="Add a personal memory cue or note..." />
          <button type="button" class="icon-action icon-action--sm" data-ll-save-note="${escapeHtml(item.id)}" title="Save note" aria-label="Save note">${icon('check')}</button>
        </div>
      </div>

      <div class="ll-study-drawer-footer">
        <button type="button" class="icon-action icon-action--sm is-danger" data-ll-delete-item="${escapeHtml(item.id)}" title="Delete expression" aria-label="Delete expression">${icon('trash')}</button>
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
      if (syncBtn) {
        syncBtn(btn, checked);
        return;
      }
      btn.classList.toggle('is-checked', checked);
      btn.setAttribute('aria-pressed', checked ? 'true' : 'false');
    });

    document
      .querySelectorAll(`[data-ll-row-id="${id}"], [data-ll-card-id="${id}"]`)
      .forEach((node) => node.classList.toggle('is-item-completed', checked));

    const drawer = document.querySelector('.ll-study-drawer');
    if (drawer && llState.activeStudyItemId === itemId) {
      drawer.classList.toggle('is-item-completed', checked);
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

    syncSidebarLlBadge(total, getCurrentUser());

    const bar = document.getElementById('ll-browse-progress-bar');
    if (!bar) return;
    const items = llState.items || [];
    const listTotal = items.length;
    if (listTotal === 0) return;
    const listCompleted = items.filter((it) => it.isCompleted).length;
    const listPct = Math.round((listCompleted / listTotal) * 100);
    const remaining = Math.max(0, listTotal - listCompleted);
    const setText = (selector, value) => {
      const node = bar.querySelector(selector);
      if (node) node.textContent = String(value);
    };

    bar.hidden = false;
    bar.classList.toggle('is-all-done', remaining === 0);
    setText('[data-sp-total]', listTotal);
    setText('[data-sp-completed]', listCompleted);
    setText('[data-sp-remaining]', remaining);
    const track = bar.querySelector('.subject-progress-track');
    if (track) track.setAttribute('aria-valuenow', String(listCompleted));
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

  /** A mastery filter can hide the row once its state flips; then re-render. */
  function dropRowWhenFilteredOut(itemId) {
    const item = findItemAnywhere(itemId);
    if (!item || matchesBrowseMasteryFilter(item)) return;
    llState.items = llState.items.filter((it) => it.id !== itemId);
    if (llState.activeStudyItemId === itemId) closeStudyDrawer();
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
          lessonTitle: `${getActiveDomain()?.title || 'Learning Library'} · ${item.categoryLabel}`,
        }),
      });
      if (ws()?.refreshVocabulary) {
        await ws().refreshVocabulary();
      }
      document
        .querySelectorAll(`[data-ll-save-vocab="${CSS.escape(item.id)}"]`)
        .forEach((btn) => {
          btn.classList.add('is-saved');
          btn.innerHTML = btn.classList.contains('ll-row-icon')
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
              lessonTitle: getActiveDomain()?.title || 'Learning Library',
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
      showToast('Learning Library exported (.json)');
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
      `# Flaptap Learning Library — ${domain?.title || llState.activeDomainId}`,
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
    showToast('Learning Library exported (.md)');
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

      applyCompletionState(id, next);

      const { token, run } = requestCompletionPatch(id, next);
      try {
        const res = await run;
        if (!isLatestCompletionWrite(id, token)) return true;
        if (res?.item) {
          replaceItemInMemory(res.item);
          patchCompletionDom(res.item.id, Boolean(res.item.isCompleted));
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
      try {
        await apiFetch(`/api/learning-library/items/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (llState.activeStudyItemId === id) {
          closeStudyDrawer();
        }
        await loadLibraryItems();
        showToast('Expression removed from Learning Library');
      } catch (err) {
        showToast(err?.message || 'Delete failed.');
      }
      return true;
    }

    return false;
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
      llState.justGeneratedIds.clear();
      const banner = document.getElementById('ll-latest-batch-banner');
      if (banner) banner.hidden = true;

      router()?.updateSubroute('learning-library', {
        subview: llState.activeView,
        domainId: llState.activeDomainId,
      });

      renderDomainSwitcher();
      renderDomainContext();
      if (getCurrentUser()) {
        await loadLibraryItems();
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
        syncFilterPillsUi();
        loadLibraryItems();
      });
    });

    document.getElementById('ll-browse-category-select')?.addEventListener('change', (e) => {
      llState.browseCategoryId = e.target.value || 'all';
      loadLibraryItems();
    });

    document.getElementById('ll-browse-register-select')?.addEventListener('change', (e) => {
      llState.browseRegister = e.target.value || 'all';
      loadLibraryItems();
    });

    document.getElementById('ll-browse-sort-select')?.addEventListener('change', (e) => {
      llState.browseSort = e.target.value || 'newest';
      loadLibraryItems();
    });

    document.getElementById('ll-browse-search-input')?.addEventListener('input', (e) => {
      llState.browseSearch = e.target.value || '';
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => loadLibraryItems(), 180);
    });

    // Recall Mode & View Mode
    document.getElementById('ll-recall-toggle-btn')?.addEventListener('click', (e) => {
      llState.recallMaskMode = !llState.recallMaskMode;
      llState.revealedCardIds.clear();
      e.currentTarget.classList.toggle('active', llState.recallMaskMode);
      renderBrowseItems();
      if (llState.activeStudyItemId) renderStudyDrawer();
    });

    document.getElementById('ll-view-cards-btn')?.addEventListener('click', () => {
      llState.viewMode = 'cards';
      try {
        localStorage.setItem('flaptap_ll_view_mode', 'cards');
      } catch {}
      syncViewModeButtons();
      renderBrowseItems();
    });

    document.getElementById('ll-view-table-btn')?.addEventListener('click', () => {
      llState.viewMode = 'table';
      try {
        localStorage.setItem('flaptap_ll_view_mode', 'table');
      } catch {}
      syncViewModeButtons();
      renderBrowseItems();
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
      if (!window.confirm(`Permanently delete all saved "${domain?.title || 'Learning Library'}" expressions?`)) {
        return;
      }
      try {
        const res = await apiFetch('/api/learning-library/clear', {
          method: 'POST',
          body: JSON.stringify({ domainId: llState.activeDomainId }),
        });
        llState.justGeneratedIds.clear();
        const banner = document.getElementById('ll-latest-batch-banner');
        if (banner) banner.hidden = true;
        closeStudyDrawer();
        await loadLibraryItems();
        showToast(`Cleared ${res.removedCount || 0} items from ${domain?.title || 'domain'}`);
      } catch (err) {
        showToast(err?.message || 'Could not clear library.');
      }
    });

    // Study Drawer Controls
    const studyBackdrop = document.getElementById('ll-study-drawer-backdrop');
    const studyDrawerBody = document.getElementById('ll-study-drawer-body');
    document.getElementById('ll-study-close-btn')?.addEventListener('click', closeStudyDrawer);
    document.getElementById('ll-study-prev-btn')?.addEventListener('click', () => stepStudyDrawer(-1));
    document.getElementById('ll-study-next-btn')?.addEventListener('click', () => stepStudyDrawer(1));
    studyBackdrop?.addEventListener('click', (e) => {
      if (e.target === studyBackdrop) closeStudyDrawer();
    });
    studyDrawerBody?.addEventListener('click', (e) => {
      handleDelegatedActionClick(e);
    });
    if (studyDrawerBody && global.FlaptapWordLookup?.bindSelectionLookup) {
      global.FlaptapWordLookup.bindSelectionLookup(studyDrawerBody, {
        maxLength: 320,
        onSelect: (text, meta) => {
          const node = meta?.range?.startContainer;
          const element = node?.nodeType === 1 ? node : node?.parentElement;
          const word = element?.closest('.clickable-word');
          handleOpenWordLookup(
            text,
            word?.dataset.contextSentence || text,
            word?.dataset.llItemId || llState.activeStudyItemId || '',
            null,
          );
        },
      });
    }

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
        loadLibraryItems();
      } else {
        llState.items = [];
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
