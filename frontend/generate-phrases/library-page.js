/* ==========================================================================
   GENERATE PHRASES — PAGE 2: LIBRARY & STICKY STUDY WORKSPACE
   (generate-phrases/library-page.js)
   Isolated Page 2 (/library/browse):
   - Compact Library Header Card with Botanical Emerald status rim + Domain Switcher
   - Study Language pill + One-Click "Translate missing (N)" batch backfill
   - Shared Sticky Study Progress & Filter Dock (FlaptapStudyDock):
       * Botanical Emerald Progress Ring + Clickable Phrase Pips
       * Remaining only (N) + Recall mode + Favorites toggles
       * Horizontal scrollable Category Filter Rail with arrows & fade masks
       * CEFR + Register + Sort + Search + Reset filters
   - Root-aligned Phrase Cards (List | Cards views) + Pro Apple Pagination
   ========================================================================== */

(function (global) {
  'use strict';

  function create(deps) {
    const store = deps.store;
    const api = deps.api;
    const nav = deps.nav;
    const R = () => global.FlaptapGPCardRenderer;
    const P = global.FlaptapPagination;
    const U = global.FlaptapUtils;
    const escapeHtml = U.escapeHtml;

    const local = {
      mounted: false,
      searchTimer: null,
      loadSeq: 0,
      completionTokenSeq: 0,
      completionChains: new Map(),
      completionLatestTokens: new Map(),
      itemsSelectionTeardown: null,
      batchTranslating: false,
      unsubs: [],
    };

    const skeletonGate = P.createSkeletonGate(190);
    const scrollRestorer = P.createScrollRestorer({
      storageKey: 'flaptap_ll_scroll_v1',
      isActive: () =>
        document.body?.dataset?.activeSection === 'learning-library' &&
        store.state.activeView === 'browse' &&
        !store.state.isLoadingList &&
        store.state.hasLoadedOnce,
      getContainer: () => el('ll-browse-items-container'),
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
      pageSizeOptions: store.PAGE_SIZE_OPTIONS,
      ariaLabel: 'Expressions pagination',
    });

    const stickyDock = global.FlaptapStudyDock?.createController({
      sentinelId: 'll-sticky-sentinel',
      dockId: 'll-sticky-dock',
      rootId: 'll-items-root',
      railWrapId: 'll-filter-rail-wrap',
      railId: 'll-category-filters',
      railPrevId: 'll-filter-scroll-left',
      railNextId: 'll-filter-scroll-right',
      isActive: () =>
        document.body?.dataset?.activeSection === 'learning-library' &&
        store.state.activeView === 'browse' &&
        Boolean(store.currentUser()),
    });

    function el(id) {
      return document.getElementById(id);
    }

    function icon(name, options) {
      return global.FlaptapIcon ? global.FlaptapIcon(name, options) : '';
    }

    function showToast(msg) {
      U.showToast(msg);
    }

    function syncRoute(replace = true) {
      if (store.state.activeView !== 'browse') return;
      const extraQuery = {};
      if (store.state.page > 1) extraQuery.page = store.state.page;
      if (store.state.pageSize !== store.DEFAULT_PAGE_SIZE) {
        extraQuery.limit = store.state.pageSize;
      }
      global.FlaptapRouter?.updateSubroute?.('learning-library', {
        subview: 'browse',
        domainId: store.state.activeDomainId,
        extraQuery,
        replace,
      });
    }

    /* --------------------------------------------------------------------
       DATA LOADING
       -------------------------------------------------------------------- */

    function showSkeletons() {
      store.state.isLoadingList = true;
      const container = el('ll-browse-items-container');
      const emptyEl = el('ll-browse-empty');
      if (emptyEl) emptyEl.hidden = true;
      paginationBar.hide();
      if (container && !container.querySelector('.ll-skeleton-card')) {
        container.classList.remove('ft-items-entering');
        container.innerHTML = R().renderSkeletonsHtml(store.state.viewMode === 'cards');
      }
      skeletonGate.start();
    }

    async function loadLibraryItems(options = {}) {
      const { showSkeleton = true, animate = true } = options;

      if (!store.currentUser()) {
        store.state.isLoadingList = false;
        renderAuthState();
        return;
      }

      const seq = ++local.loadSeq;
      if (showSkeleton) showSkeletons();

      try {
        const res = await api.listItems({
          domainId: store.state.activeDomainId,
          categoryId: store.state.browseCategoryId,
          favoritesOnly: store.state.browseMastery === 'favorites',
          masteryStatus:
            store.state.browseMastery !== 'favorites' ? store.state.browseMastery : 'all',
          register: store.state.browseRegister,
          level: store.state.browseLevel,
          q: store.state.browseSearch,
          sort: store.state.browseSort,
          page: store.state.page,
          limit: store.state.pageSize,
        });
        if (seq !== local.loadSeq) return;

        if (showSkeleton) {
          const stillCurrent = await skeletonGate.waitRemaining(() => seq === local.loadSeq);
          if (!stillCurrent) return;
        }

        store.state.items = Array.isArray(res?.items) ? res.items : [];
        if (!store.hasActiveBrowseFilters() && store.state.page === 1) {
          store.state.recentItems = store.state.items.slice(0, 6);
        }
        if (res?.stats) store.state.stats = res.stats;
        store.state.categoryCounts = res?.categoryCounts || {};
        store.state.registerCounts = res?.registerCounts || {};
        store.state.cefrCounts = res?.cefrCounts || {};
        store.state.filteredCount =
          typeof res?.filteredCount === 'number' ? res.filteredCount : store.state.items.length;
        store.state.filteredCompletedCount =
          typeof res?.filteredCompletedCount === 'number'
            ? res.filteredCompletedCount
            : store.state.items.filter((it) => it.isCompleted).length;
        store.state.page = Math.max(1, Number(res?.page) || store.state.page || 1);
        store.state.totalPages = Math.max(
          1,
          Number(res?.totalPages) ||
            Math.ceil(store.state.filteredCount / (store.state.pageSize || store.DEFAULT_PAGE_SIZE)) ||
            1,
        );
        store.state.hasMore = Boolean(res?.hasMore ?? store.state.page < store.state.totalPages);
        store.state.isLoadingList = false;
        store.state.hasLoadedOnce = true;
        store.state.animateNextRender = Boolean(animate);
        skeletonGate.reset();

        store.emit('stats:changed', store.state.stats);
        renderAll();
        scrollRestorer.finishRestore();
      } catch (err) {
        if (seq !== local.loadSeq) return;
        store.state.isLoadingList = false;
        skeletonGate.reset();
        if (err?.status === 401) {
          renderAuthState();
          return;
        }
        renderItems();
        showToast(err?.message || 'Could not load Generate Phrases library.');
      }
    }

    /* --------------------------------------------------------------------
       RENDERING: HEADER, DOMAIN PILLS, LANGUAGE, STICKY PROGRESS DOCK & LIST
       -------------------------------------------------------------------- */

    function renderAll() {
      renderAuthState();
      renderLibraryHeader();
      populateStudyLanguageSelect();
      renderProgressDock();
      renderFilterRail();
      renderSecondaryFilters();
      syncViewModeButtons();
      renderItems();
      renderBatchBanner();
      if (store.state.activeView === 'browse' && store.currentUser()) {
        stickyDock?.setup();
      } else {
        stickyDock?.disconnect();
      }
    }

    function renderAuthState() {
      const signedIn = Boolean(store.currentUser());
      const gate = el('ll-auth-gate-card');
      const itemsRoot = el('ll-items-root');
      const headerActions = el('ll-library-head-actions');
      const emptyEl = el('ll-browse-empty');

      if (gate) gate.hidden = signedIn;
      if (itemsRoot) itemsRoot.hidden = !signedIn;
      if (headerActions) headerActions.hidden = !signedIn;

      if (!signedIn) {
        stickyDock?.disconnect();
        if (emptyEl) emptyEl.hidden = true;
        paginationBar.hide();
        const container = el('ll-browse-items-container');
        if (container) {
          container.classList.remove('ft-items-entering');
          container.innerHTML = '';
        }
      }
    }

    function renderLibraryHeader() {
      const domain = store.getActiveDomain();
      const plural = store.capitalize(domain?.itemNounPlural || 'Expressions');
      const stats = store.state.stats || {};
      const total = Number(stats.totalItems) || 0;
      const completed = Number(stats.completedCount) || 0;
      const favorites = Number(stats.favoritesCount) || 0;
      const guideState = store.studyState(total, completed);

      const headEl = el('ll-library-heading');
      const countEl = el('ll-library-count-label');
      const subEl = el('ll-library-sub');
      if (headEl) headEl.textContent = `${plural} Library`;
      if (countEl) countEl.textContent = String(total);
      if (subEl) {
        const parts = [
          domain?.title || 'Natural American English',
          `${total} ${total === 1 ? domain?.itemNounSingular || 'phrase' : domain?.itemNounPlural || 'phrases'}`,
          completed ? `${completed} studied` : '',
          favorites ? `${favorites} favorited` : '',
        ].filter(Boolean);
        subEl.textContent = parts.join(' · ');
      }

      // Sync top 4px Botanical Emerald status rim & ambient glow on header card + view wrapper
      const headerCard = el('ll-library-header-card');
      const viewWrap = el('ll-view-library');
      if (headerCard) headerCard.dataset.guideState = guideState.tone;
      if (viewWrap) viewWrap.dataset.guideState = guideState.tone;
      const topFill = el('ll-guide-top-fill');
      if (topFill) topFill.style.width = `${guideState.tone === 'done' ? 100 : guideState.pct}%`;

      // Domain switcher pills inside Library header
      const domainWrap = el('ll-lib-domain-pills');
      if (domainWrap) {
        const domainIcon = (id) =>
          id === 'programming_terminology'
            ? 'file-code'
            : id === 'technical_vocabulary'
              ? 'type'
              : 'graduation-cap';
        domainWrap.innerHTML = store.state.domains
          .map((d) => {
            const active = d.id === store.state.activeDomainId;
            return `<button type="button" class="filter-pill${active ? ' active' : ''}" data-ll-domain="${escapeHtml(
              d.id,
            )}" aria-pressed="${active ? 'true' : 'false'}">${icon(domainIcon(d.id))}<span>${escapeHtml(
              d.title,
            )}</span></button>`;
          })
          .join('');
      }

      syncTranslateMissingButton();
    }

    function populateStudyLanguageSelect() {
      const sel = el('ll-lib-lang-select');
      if (!sel) return;
      const langs = store.languages();
      const preferred = store.getPreferredLanguage();
      sel.innerHTML = langs
        .map(
          (l) =>
            `<option value="${escapeHtml(l.code)}">${escapeHtml(l.name)} (${escapeHtml(
              l.native,
            )})</option>`,
        )
        .join('');
      sel.value = langs.some((l) => l.code === preferred) ? preferred : langs[0]?.code || 'ar';
    }

    function syncTranslateMissingButton() {
      const btn = el('ll-translate-missing-btn');
      const countSpan = el('ll-translate-missing-count');
      if (!btn) return;
      const lang = store.getPreferredLanguage();
      if (!store.currentUser() || lang === 'en') {
        btn.hidden = true;
        return;
      }
      const missing = (store.state.items || []).filter((it) =>
        store.hasMissingSentenceTranslations(it, lang),
      );
      btn.hidden = missing.length === 0;
      btn.disabled = local.batchTranslating;
      if (countSpan) countSpan.textContent = String(missing.length);
      const label = btn.querySelector('.ll-tr-btn-text');
      if (label) {
        label.textContent = local.batchTranslating ? 'Translating…' : 'Translate missing';
      }
    }

    function renderProgressDock() {
      const dock = el('ll-sticky-dock');
      const bar = el('ll-browse-progress-bar');
      if (!dock || !bar) return;

      const s = store.state;
      const total = s.hasLoadedOnce ? Number(s.filteredCount) || 0 : (s.items || []).length;
      const completed = s.hasLoadedOnce
        ? Number(s.filteredCompletedCount) || 0
        : (s.items || []).filter((it) => it.isCompleted).length;
      const overallTotal = Number(s.stats?.totalItems) || 0;
      const overallCompleted = Number(s.stats?.completedCount) || 0;
      const overallRemaining = Math.max(0, overallTotal - overallCompleted);
      const favoritesCount = Number(s.stats?.favoritesCount) || 0;

      // Show dock whenever the user has any items in the domain
      dock.hidden = overallTotal === 0 && !store.hasActiveBrowseFilters();

      const domain = store.getActiveDomain();
      const visibleItems = s.items || [];
      // Show interactive clickable phrase pips for the active page whenever <= 32 items
      const pips =
        visibleItems.length > 0 && visibleItems.length <= 32
          ? visibleItems.map((item) => ({
              id: item.id,
              displayNumber: Number(item.sequenceNumber) > 0 ? item.sequenceNumber : '',
              label: item.expression,
              done: Boolean(item.isCompleted),
            }))
          : [];

      const progressState = store.studyState(total, completed);
      bar.hidden = overallTotal === 0;
      bar.classList.toggle('is-all-done', progressState.tone === 'done');

      if (global.FlaptapStudyDock?.renderProgressDeckHtml) {
        bar.innerHTML = global.FlaptapStudyDock.renderProgressDeckHtml({
          total,
          done: completed,
          singular: domain?.itemNounSingular || 'expression',
          plural: domain?.itemNounPlural || 'expressions',
          doneHeadline: store.hasActiveBrowseFilters() ? 'Filtered set completed' : 'Collection completed',
          readyHeadline: 'Ready to study',
          pipAttr: 'data-ll-jump-id',
          pips,
        });
      }

      // Sync scope toggles inside sticky dock
      const remBtn = el('ll-scope-remaining-btn');
      const remCount = el('ll-remaining-count');
      const isPending = s.browseMastery === 'pending';
      if (remBtn) {
        remBtn.classList.toggle('is-active', isPending);
        remBtn.setAttribute('aria-pressed', isPending ? 'true' : 'false');
      }
      if (remCount) remCount.textContent = String(overallRemaining);

      const favBtn = el('ll-scope-favorites-btn');
      const favCount = el('ll-favorites-count');
      const isFav = s.browseMastery === 'favorites';
      if (favBtn) {
        favBtn.classList.toggle('is-active', isFav);
        favBtn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
      }
      if (favCount) favCount.textContent = String(favoritesCount);

      const recallBtn = el('ll-recall-toggle-btn');
      if (recallBtn) {
        recallBtn.classList.toggle('is-active', s.recallMaskMode);
        recallBtn.classList.toggle('active', s.recallMaskMode);
        recallBtn.setAttribute('aria-pressed', s.recallMaskMode ? 'true' : 'false');
      }

      syncResetFiltersButton();
      global.requestAnimationFrame?.(() => stickyDock?.syncMetrics());
    }

    function renderFilterRail() {
      const wrap = el('ll-category-filters');
      const domain = store.getActiveDomain();
      if (!wrap || !domain) return;

      const total = Number(store.state.stats?.totalItems) || 0;
      const cats = [
        { id: 'all', label: 'All', count: total, tone: '' },
        ...(domain.categories || []).map((c) => ({
          id: c.id,
          label: c.label,
          count: Number(store.state.categoryCounts[c.id]) || 0,
          tone: store.getCategoryTone(c.id),
        })),
      ].filter((c) => c.id === 'all' || c.count > 0 || store.state.browseCategoryId === c.id);

      wrap.innerHTML = cats
        .map(
          (cat) => `
          <button type="button" class="filter-pill${
            store.state.browseCategoryId === cat.id ? ' active' : ''
          }" data-ll-cat-filter="${escapeHtml(cat.id)}" data-cat-tone="${escapeHtml(
            cat.tone,
          )}" aria-pressed="${store.state.browseCategoryId === cat.id ? 'true' : 'false'}">
            ${cat.id === 'all' ? '' : '<span class="ll-rail-dot" aria-hidden="true"></span>'}
            <span>${escapeHtml(cat.label)}</span>
            <span class="ll-filter-count ltr-num">${cat.count}</span>
          </button>`,
        )
        .join('');

      stickyDock?.updateRailFades();
      global.requestAnimationFrame?.(() => stickyDock?.updateRailFades());
    }

    function renderSecondaryFilters() {
      const domain = store.getActiveDomain();

      const levelSel = el('ll-browse-level-select');
      const levelField = el('ll-popover-field-level');
      if (levelSel) {
        const levels = Object.keys(store.state.cefrCounts || {}).sort();
        if (levels.length === 0) {
          levelSel.hidden = true;
          if (levelField) levelField.hidden = true;
          levelSel.value = 'all';
        } else {
          levelSel.hidden = false;
          if (levelField) levelField.hidden = false;
          levelSel.innerHTML =
            '<option value="all">All CEFR</option>' +
            levels
              .map(
                (lv) =>
                  `<option value="${escapeHtml(lv)}">CEFR ${escapeHtml(lv)} (${
                    store.state.cefrCounts[lv] || 0
                  })</option>`,
              )
              .join('');
          levelSel.value = levels.includes(store.state.browseLevel) ? store.state.browseLevel : 'all';
        }
      }

      const regSel = el('ll-browse-register-select');
      const regField = el('ll-popover-field-register');
      if (regSel && domain) {
        const regs = Array.from(
          new Set([...(domain.registers || []), ...Object.keys(store.state.registerCounts || {})]),
        ).filter((r) => (store.state.registerCounts[r] || 0) > 0 || store.state.browseRegister === r);
        regSel.hidden = regs.length === 0;
        if (regField) regField.hidden = regs.length === 0;
        regSel.innerHTML =
          '<option value="all">All Registers</option>' +
          regs
            .map(
              (r) =>
                `<option value="${escapeHtml(r)}">${escapeHtml(r)} (${
                  store.state.registerCounts[r] || 0
                })</option>`,
            )
            .join('');
        regSel.value = store.state.browseRegister || 'all';
      }

      const statusSel = el('ll-browse-status-select');
      if (statusSel) {
        statusSel.value = store.state.browseMastery || 'all';
      }

      const sortSel = el('ll-browse-sort-select');
      if (sortSel) {
        sortSel.value = store.state.browseSort || 'newest';
      }

      const searchEl = el('ll-browse-search-input');
      if (searchEl && searchEl.value !== store.state.browseSearch) {
        searchEl.value = store.state.browseSearch;
      }

      syncResetFiltersButton();
    }

    function syncResetFiltersButton() {
      const btn = el('ll-clear-filters-btn');
      const hasAny = store.hasActiveBrowseFilters();
      if (btn) btn.hidden = !hasAny;

      const s = store.state;
      let popoverActiveCount = 0;
      if (s.browseLevel && s.browseLevel !== 'all') popoverActiveCount += 1;
      if (s.browseRegister && s.browseRegister !== 'all') popoverActiveCount += 1;
      if (s.browseMastery && s.browseMastery !== 'all') popoverActiveCount += 1;
      if (s.browseSort && s.browseSort !== 'newest') popoverActiveCount += 1;

      const trigger = el('ll-filters-popover-btn');
      const badge = el('ll-filters-active-count');
      const popReset = el('ll-popover-reset-btn');
      if (trigger) trigger.classList.toggle('is-active', popoverActiveCount > 0);
      if (badge) {
        badge.textContent = String(popoverActiveCount);
        badge.hidden = popoverActiveCount === 0;
      }
      if (popReset) popReset.hidden = popoverActiveCount === 0;
    }

    function syncViewModeButtons() {
      const cardsBtn = el('ll-view-cards-btn');
      const tableBtn = el('ll-view-table-btn');
      const isTable = store.state.viewMode === 'table';
      tableBtn?.classList.toggle('active', isTable);
      tableBtn?.setAttribute('aria-pressed', isTable ? 'true' : 'false');
      cardsBtn?.classList.toggle('active', !isTable);
      cardsBtn?.setAttribute('aria-pressed', !isTable ? 'true' : 'false');
    }

    function renderBatchBanner() {
      const banner = el('ll-latest-batch-banner');
      const titleEl = el('ll-latest-batch-title');
      const metaEl = el('ll-latest-batch-meta');
      const result = store.state.latestBatchResult;
      if (!banner) return;

      const count = result?.items?.length || result?.fulfilledCount || 0;
      if (!result || count === 0) {
        banner.hidden = true;
        return;
      }

      const requested = Number(result.requestedCount) || count;
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
        if (skipped > 0) parts.push(`${skipped} duplicate${skipped === 1 ? '' : 's'} filtered out`);
        if (shortfall > 0) parts.push(`${shortfall} still missing — generate again to fill the gap`);
        else if (skipped === 0) parts.push('Highlighted at the top of your library below');
        metaEl.textContent = parts.join(' · ');
      }
      banner.hidden = false;
    }

    function renderItems() {
      const container = el('ll-browse-items-container');
      const emptyEl = el('ll-browse-empty');
      if (!container) return;

      if (!store.currentUser() || store.state.isLoadingList) return;

      const items = store.state.items || [];
      items.sort(store.compareLibraryItems);

      if (emptyEl) {
        emptyEl.hidden = items.length > 0;
        if (items.length === 0) {
          const filtered = store.hasActiveBrowseFilters();
          const h3 = el('ll-empty-title');
          const p = el('ll-empty-desc');
          const genBtn = el('ll-empty-new-btn');
          const clearBtn = el('ll-empty-clear-btn');
          if (h3) {
            h3.textContent =
              filtered && store.state.browseMastery === 'pending' && store.state.stats.totalItems > 0
                ? 'All expressions studied!'
                : filtered
                  ? 'No matching expressions'
                  : 'Your Expressions Library is empty';
          }
          if (p) {
            p.textContent =
              filtered && store.state.browseMastery === 'pending' && store.state.stats.totalItems > 0
                ? 'Turn off “Remaining only” to review the expressions you already mastered.'
                : filtered
                  ? 'Try another category, CEFR level, register, or clear your search.'
                  : 'Generate your first batch of authentic American expressions, IPA, and translated examples.';
          }
          if (genBtn) genBtn.hidden = filtered;
          if (clearBtn) clearBtn.hidden = !filtered;
        }
      }

      if (items.length === 0) {
        container.classList.remove('ft-items-entering');
        container.innerHTML = '';
        renderPagination();
        syncTranslateMissingButton();
        return;
      }

      const shouldAnimate = Boolean(store.state.animateNextRender);
      store.state.animateNextRender = false;
      container.classList.remove('ft-items-entering');

      if (store.state.viewMode === 'table') {
        container.innerHTML = R().renderListTableHtml(items);
      } else {
        container.innerHTML = `<div class="ll-cards-grid">${items
          .map((item, idx) => R().renderCardArticleHtml(item, idx))
          .join('')}</div>`;
      }

      if (shouldAnimate) {
        P.triggerEntrance(container);
      }

      bindSelectionLookup(container);
      renderPagination();
      syncTranslateMissingButton();
    }

    function renderPagination() {
      paginationBar.render({
        page: store.state.page,
        pageSize: store.state.pageSize || store.DEFAULT_PAGE_SIZE,
        total: Number(store.state.filteredCount) || 0,
        totalPages: store.state.totalPages,
        itemsCount: store.state.items?.length || 0,
        loading: store.state.isLoadingList,
        visible: Boolean(store.currentUser()),
      });
    }

    /* --------------------------------------------------------------------
       OPTIMISTIC COMPLETION, TRANSLATION, VOCABULARY, DELETE, EXPORT
       -------------------------------------------------------------------- */

    function patchCompletionDom(itemId, checked) {
      if (!itemId) return;
      const id = CSS.escape(String(itemId));
      document.querySelectorAll(`[data-ll-toggle-complete="${id}"]`).forEach((btn) => {
        const isPill = btn.classList.contains('item-check-btn--pill');
        const pillText = isPill ? (checked ? 'Completed' : 'Mark Done') : '';
        if (global.FlaptapCheck?.setState) {
          global.FlaptapCheck.setState(btn, checked, { text: pillText, animate: true });
        } else {
          btn.classList.toggle('is-checked', checked);
          btn.setAttribute('aria-pressed', checked ? 'true' : 'false');
        }
      });

      document.querySelectorAll(`[data-ll-row-id="${id}"], [data-ll-card-id="${id}"]`).forEach((node) => {
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
      if (drawer && store.state.activeStudyItemId === itemId) {
        drawer.classList.toggle('is-item-completed', checked);
        drawer.dataset.guideState = checked ? 'done' : 'progress';
      }
    }

    function applyOptimisticCompletion(itemId, checked) {
      const item = store.findItemAnywhere(itemId);
      const delta = checked ? 1 : -1;
      if (item) {
        store.replaceItemInMemory({
          ...item,
          isCompleted: checked,
          masteryStatus: checked ? 'mastered' : 'new',
        });
      }
      const stats = store.state.stats;
      const total = Number(stats.totalItems) || 0;
      stats.completedCount = Math.max(0, Math.min(total || Number.MAX_SAFE_INTEGER, (Number(stats.completedCount) || 0) + delta));
      const fTotal = Number(store.state.filteredCount) || (store.state.items || []).length;
      store.state.filteredCompletedCount = Math.max(
        0,
        Math.min(fTotal, (Number(store.state.filteredCompletedCount) || 0) + delta),
      );

      patchCompletionDom(itemId, checked);
      renderLibraryHeader();
      renderProgressDock();
    }

    function requestCompletionPatch(itemId, next) {
      const key = String(itemId);
      const token = ++local.completionTokenSeq;
      local.completionLatestTokens.set(key, token);
      const prev = local.completionChains.get(key) || Promise.resolve();
      const run = prev
        .catch(() => {})
        .then(() => api.patchItem(itemId, { isCompleted: next }));
      const settled = run.catch(() => {});
      local.completionChains.set(key, settled);
      settled.then(() => {
        if (local.completionChains.get(key) === settled) local.completionChains.delete(key);
      });
      return { token, run };
    }

    async function handleToggleComplete(itemId, sourceBtn) {
      const item = store.findItemAnywhere(itemId);
      if (!item) return;
      const prev = Boolean(item.isCompleted);
      const next = !prev;
      const prevTotal = Number(store.state.stats?.totalItems) || 0;
      const prevCompleted = Number(store.state.stats?.completedCount) || 0;
      const prevFilteredTotal = Number(store.state.filteredCount) || 0;
      const prevFilteredCompleted = Number(store.state.filteredCompletedCount) || 0;
      const prevMastery = store.state.browseMastery;

      applyOptimisticCompletion(itemId, next);

      const { token, run } = requestCompletionPatch(itemId, next);
      try {
        const res = await run;
        if (local.completionLatestTokens.get(String(itemId)) !== token) return;
        if (res?.item) {
          store.replaceItemInMemory(res.item);
          patchCompletionDom(res.item.id, Boolean(res.item.isCompleted));
        }

        if (next === true) {
          const nextTotal = Number(store.state.stats?.totalItems) || prevTotal;
          const nextCompleted = Number(store.state.stats?.completedCount) || 0;
          const justAllDone = nextTotal > 0 && prevCompleted < nextTotal && nextCompleted >= nextTotal;
          const justFilteredDone =
            prevMastery === 'pending'
              ? prevFilteredTotal === 1
              : prevFilteredTotal > 0 &&
                prevFilteredCompleted < prevFilteredTotal &&
                (Number(store.state.filteredCompletedCount) || 0) >= prevFilteredTotal;

          if (justAllDone) {
            global.FlaptapCelebrate?.trigger?.({
              title: 'Generate Phrases Completed!',
              subtitle: `All ${nextTotal} expression${nextTotal === 1 ? '' : 's'} mastered`,
              originEl: sourceBtn,
            });
          } else if (justFilteredDone) {
            global.FlaptapCelebrate?.trigger?.({
              title: prevMastery === 'pending' ? 'All Remaining Studied!' : 'Collection Completed!',
              subtitle:
                prevMastery === 'pending'
                  ? 'Zero unstudied expressions left in this view'
                  : `All ${prevFilteredTotal} expression${prevFilteredTotal === 1 ? '' : 's'} in this view studied`,
              originEl: sourceBtn,
            });
          }
        }

        // Drop row cleanly if mastery filter now excludes it
        if (
          (store.state.browseMastery === 'pending' && next) ||
          (store.state.browseMastery === 'completed' && !next)
        ) {
          store.state.items = store.state.items.filter((it) => it.id !== itemId);
          store.state.filteredCount = Math.max(0, (store.state.filteredCount || 0) - 1);
          if (next && store.state.browseMastery === 'pending') {
            store.state.filteredCompletedCount = Math.max(0, store.state.filteredCompletedCount - 1);
          }
          if (store.state.activeStudyItemId === itemId) nav.closeStudyDrawer();
          if (
            store.state.filteredCount > store.state.items.length ||
            (store.state.items.length === 0 && store.state.page > 1)
          ) {
            if (store.state.items.length === 0 && store.state.page > 1) {
              store.state.page = Math.max(1, store.state.page - 1);
            }
            void loadLibraryItems({ showSkeleton: false, animate: false });
          } else {
            renderLibraryHeader();
            renderProgressDock();
            renderItems();
          }
        }
      } catch (err) {
        if (local.completionLatestTokens.get(String(itemId)) !== token) return;
        applyOptimisticCompletion(itemId, prev);
        showToast(err?.message || 'Could not update completion.');
      }
    }

    async function handleTranslateSingleItem(itemId, force = false) {
      if (!itemId || store.state.translatingItemIds.has(itemId)) return;
      const lang = store.getPreferredLanguage();
      if (lang === 'en') {
        showToast('Switch translation language from English to translate sentences.');
        return;
      }
      store.state.translatingItemIds.add(itemId);
      renderItems();
      deps.refreshDrawer?.();

      try {
        const res = await api.translateItem(itemId, { targetLanguage: lang, force });
        if (res?.item) {
          store.replaceItemInMemory(res.item);
          showToast('Sentence translations saved.');
        } else {
          showToast('Sentences are already translated.');
        }
      } catch (err) {
        showToast(err?.message || 'Could not translate sentences.');
      } finally {
        store.state.translatingItemIds.delete(itemId);
        renderItems();
        deps.refreshDrawer?.();
      }
    }

    async function handleTranslateVisibleMissing(force = false) {
      if (local.batchTranslating) return;
      const lang = store.getPreferredLanguage();
      if (lang === 'en') return;

      const targets = (store.state.items || [])
        .filter((it) => force || store.hasMissingSentenceTranslations(it, lang))
        .slice(0, 10);

      if (targets.length === 0) {
        showToast('All visible sentences are already translated.');
        return;
      }

      local.batchTranslating = true;
      targets.forEach((it) => store.state.translatingItemIds.add(it.id));
      syncTranslateMissingButton();
      renderItems();

      try {
        const res = await api.translateBatch(
          targets.map((it) => it.id),
          { targetLanguage: lang, force },
        );
        const updated = Array.isArray(res?.items) ? res.items : [];
        updated.forEach((it) => store.replaceItemInMemory(it));
        showToast(`Translated ${res?.translatedCount || updated.length} expression(s) & saved.`);
      } catch (err) {
        showToast(err?.message || 'Batch translation failed.');
      } finally {
        local.batchTranslating = false;
        targets.forEach((it) => store.state.translatingItemIds.delete(it.id));
        syncTranslateMissingButton();
        renderItems();
        deps.refreshDrawer?.();
      }
    }

    async function handleSaveToVocabulary(item) {
      if (!item) return;
      if (store.ws()?.requireAuthBeforeAction) {
        const ok = store.ws().requireAuthBeforeAction({ type: 'section', section: 'learning-library' });
        if (!ok) return;
      }
      try {
        await api.saveVocabularyItem({
          term: item.expression,
          ipa: item.ipa || '',
          partOfSpeech: item.categoryLabel || 'expression',
          definition: item.coreMeaning,
          generalTranslation: item.textbookEquivalent ? `Contrast: ${item.textbookEquivalent}` : '',
          translation: item.localizedMeaning || '',
          contextSentence: item.examples?.[0]?.sentence || '',
          lessonTitle: `${store.getActiveDomain()?.title || 'Generate Phrases'} · ${item.categoryLabel}`,
        });
        await store.ws()?.refreshVocabulary?.();
        document.querySelectorAll(`[data-ll-save-vocab="${CSS.escape(item.id)}"]`).forEach((btn) => {
          btn.classList.add('is-saved');
          const iconOnly = btn.classList.contains('ll-util-btn');
          btn.innerHTML = iconOnly
            ? icon('bookmark-check')
            : `${icon('bookmark-check')}<span>In Flashcards</span>`;
          btn.title = 'In Flashcards';
          btn.setAttribute('aria-label', 'In Flashcards');
        });
        showToast(`Saved “${item.expression}” to Vocabulary Flashcards`);
      } catch (err) {
        showToast(err?.message || 'Failed to save to Vocabulary.');
      }
    }

    async function handleSaveAllVisible() {
      const pending = (store.state.items || []).filter(
        (it) => !(store.ws()?.isVocabularySaved && store.ws().isVocabularySaved(it.expression)),
      );
      if (pending.length === 0) {
        showToast('Every expression on this page is already saved.');
        return;
      }
      let saved = 0;
      for (const item of pending) {
        try {
          await api.saveVocabularyItem({
            term: item.expression,
            ipa: item.ipa || '',
            partOfSpeech: item.categoryLabel || 'expression',
            definition: item.coreMeaning,
            generalTranslation: item.textbookEquivalent ? `Contrast: ${item.textbookEquivalent}` : '',
            translation: item.localizedMeaning || '',
            contextSentence: item.examples?.[0]?.sentence || '',
            lessonTitle: `${store.getActiveDomain()?.title || 'Generate Phrases'} · ${item.categoryLabel}`,
          });
          saved++;
        } catch {}
      }
      await store.ws()?.refreshVocabulary?.();
      renderItems();
      showToast(`Saved ${saved} of ${pending.length} expressions to Vocabulary`);
    }

    async function handleDeleteItem(id) {
      const targetItem = store.findItemAnywhere(id);
      const exprLabel = String(targetItem?.expression || 'Expression').trim();
      if (!global.FlaptapConfirm?.confirmAndUndo) return;

      const snapshot = {
        items: [...store.state.items],
        stats: { ...store.state.stats },
        filteredCount: store.state.filteredCount,
        filteredCompletedCount: store.state.filteredCompletedCount,
        page: store.state.page,
        totalPages: store.state.totalPages,
      };

      await global.FlaptapConfirm.confirmAndUndo({
        title: 'Remove expression?',
        message: 'This expression will be removed from Generate Phrases.',
        detail: exprLabel,
        confirmLabel: 'Remove',
        undoMessage: `Removed "${exprLabel}"`,
        restoredMessage: `Restored "${exprLabel}"`,
        onApply: () => {
          store.state.items = store.state.items.filter((e) => e.id !== id);
          store.state.stats.totalItems = Math.max(0, (Number(store.state.stats.totalItems) || 0) - 1);
          if (targetItem?.isCompleted) {
            store.state.stats.completedCount = Math.max(0, (Number(store.state.stats.completedCount) || 0) - 1);
            store.state.filteredCompletedCount = Math.max(0, (Number(store.state.filteredCompletedCount) || 0) - 1);
          }
          if (targetItem?.isFavorite) {
            store.state.stats.favoritesCount = Math.max(0, (Number(store.state.stats.favoritesCount) || 0) - 1);
          }
          store.state.filteredCount = Math.max(0, (Number(store.state.filteredCount) || 0) - 1);
          if (store.state.activeStudyItemId === id) nav.closeStudyDrawer();
          store.emit('stats:changed', store.state.stats);
          renderAll();
        },
        onUndo: () => {
          store.state.items = snapshot.items;
          store.state.stats = snapshot.stats;
          store.state.filteredCount = snapshot.filteredCount;
          store.state.filteredCompletedCount = snapshot.filteredCompletedCount;
          store.state.page = snapshot.page;
          store.state.totalPages = snapshot.totalPages;
          store.emit('stats:changed', store.state.stats);
          renderAll();
        },
        onCommit: async ({ keepalive = false } = {}) => {
          await api.deleteItem(id, { keepalive });
          if (!keepalive) {
            if (store.state.items.length === 0 && store.state.page > 1) {
              store.state.page = Math.max(1, store.state.page - 1);
              syncRoute(true);
            }
            await loadLibraryItems({ showSkeleton: false, animate: false });
          }
        },
      });
    }

    async function handleClearDomain() {
      const domain = store.getActiveDomain();
      const domainId = store.state.activeDomainId;
      const domainTitle = domain?.title || 'Generate Phrases';
      if (!global.FlaptapConfirm?.confirmAndUndo) return;

      const snapshot = {
        items: [...store.state.items],
        recentItems: [...store.state.recentItems],
        stats: { ...store.state.stats },
        filteredCount: store.state.filteredCount,
        filteredCompletedCount: store.state.filteredCompletedCount,
        page: store.state.page,
        totalPages: store.state.totalPages,
      };

      await global.FlaptapConfirm.confirmAndUndo({
        title: `Clear ${domainTitle}?`,
        message: `All saved expressions in "${domainTitle}" will be removed.`,
        detail: `${Number(snapshot.stats?.totalItems || snapshot.items.length)} saved item(s)`,
        confirmLabel: 'Clear All',
        undoMessage: `Cleared ${domainTitle} expressions`,
        restoredMessage: `Restored ${domainTitle} expressions`,
        onApply: () => {
          store.resetUserData();
          nav.closeStudyDrawer();
          renderAll();
        },
        onUndo: () => {
          store.state.items = snapshot.items;
          store.state.recentItems = snapshot.recentItems;
          store.state.stats = snapshot.stats;
          store.state.filteredCount = snapshot.filteredCount;
          store.state.filteredCompletedCount = snapshot.filteredCompletedCount;
          store.state.page = snapshot.page;
          store.state.totalPages = snapshot.totalPages;
          store.emit('stats:changed', store.state.stats);
          renderAll();
        },
        onCommit: async ({ keepalive = false } = {}) => {
          await api.clearDomain(domainId, { keepalive });
          if (!keepalive) await loadLibraryItems({ showSkeleton: false, animate: false });
        },
      });
    }

    async function handleExportJson() {
      try {
        const data = await api.exportLibrary(store.state.activeDomainId);
        const stamp = new Date().toISOString().slice(0, 10);
        U.downloadBlob(
          JSON.stringify(data, null, 2),
          `flaptap-generate-phrases-${store.state.activeDomainId}-${stamp}.json`,
          'application/json;charset=utf-8',
        );
        showToast('Exported JSON library');
      } catch (err) {
        showToast(err?.message || 'Export failed.');
      }
    }

    function handleExportMarkdown() {
      const domain = store.getActiveDomain();
      const items = store.state.items || [];
      if (items.length === 0) {
        showToast('No items in current view to export.');
        return;
      }
      const lines = [
        `# Flaptap Generate Phrases — ${domain?.title || store.state.activeDomainId}`,
        `Exported: ${new Date().toISOString()} · ${items.length} items`,
        '',
      ];
      items.forEach((it, idx) => {
        lines.push(`## ${idx + 1}. ${it.expression}${it.ipa ? ` \`${it.ipa}\`` : ''}${it.cefr ? ` (${it.cefr})` : ''}`);
        lines.push(`- **Category:** ${it.categoryLabel}${it.register ? ` · **Register:** ${it.register}` : ''}`);
        if (it.spokenForm) lines.push(`- **Spoken Form:** ${it.spokenForm}`);
        lines.push(`- **Meaning:** ${it.coreMeaning}`);
        if (it.localizedMeaning) lines.push(`- **Translation:** ${it.localizedMeaning}`);
        if (it.textbookEquivalent) lines.push(`- **Textbook Contrast:** ${it.textbookEquivalent}`);
        if (it.examples?.length) {
          lines.push('- **Examples:**');
          it.examples.forEach((ex) => {
            lines.push(`  - [${ex.speakerContext}] "${ex.sentence}"`);
            if (ex.translation) lines.push(`    - Translation: ${ex.translation}`);
          });
        }
        lines.push('');
      });
      const stamp = new Date().toISOString().slice(0, 10);
      U.downloadBlob(
        lines.join('\n'),
        `flaptap-generate-phrases-${store.state.activeDomainId}-${stamp}.md`,
        'text/markdown;charset=utf-8',
      );
      showToast('Exported Markdown study guide');
    }

    /* --------------------------------------------------------------------
       SHARED DELEGATED ACTION HANDLER (Cards + List + Study Drawer)
       -------------------------------------------------------------------- */

    async function handleDelegatedAction(e) {
      const completeBtn = e.target.closest('[data-ll-toggle-complete]');
      if (completeBtn) {
        e.stopPropagation();
        await handleToggleComplete(completeBtn.getAttribute('data-ll-toggle-complete'), completeBtn);
        return true;
      }

      const translateBtn = e.target.closest('[data-ll-translate-item]');
      if (translateBtn) {
        e.stopPropagation();
        await handleTranslateSingleItem(translateBtn.getAttribute('data-ll-translate-item'));
        return true;
      }

      const studyBtn = e.target.closest('[data-ll-open-study]');
      if (studyBtn) {
        e.stopPropagation();
        nav.openStudyDrawer(studyBtn.getAttribute('data-ll-open-study'));
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
        const item = store.findItemAnywhere(id);
        if (item) {
          try {
            const res = await api.patchItem(id, { isFavorite: !item.isFavorite });
            if (res?.item) {
              store.replaceItemInMemory(res.item);
              await loadLibraryItems({ showSkeleton: false, animate: false });
              deps.refreshDrawer?.();
            }
          } catch (err) {
            showToast(err?.message || 'Could not update favorite.');
          }
        }
        return true;
      }

      const revealBtn = e.target.closest('[data-ll-reveal]');
      if (revealBtn) {
        e.stopPropagation();
        const id = revealBtn.getAttribute('data-ll-reveal');
        store.state.revealedCardIds.add(id);
        renderItems();
        deps.refreshDrawer?.();
        return true;
      }

      const saveNoteBtn = e.target.closest('[data-ll-save-note]');
      if (saveNoteBtn) {
        const id = saveNoteBtn.getAttribute('data-ll-save-note');
        const input = document.querySelector(`[data-ll-note-input="${CSS.escape(id)}"]`);
        try {
          const res = await api.patchItem(id, { userNotes: input?.value || '' });
          if (res?.item) store.replaceItemInMemory(res.item);
          showToast('Study note saved');
        } catch (err) {
          showToast(err?.message || 'Could not save note.');
        }
        return true;
      }

      const saveVocabBtn = e.target.closest('[data-ll-save-vocab]');
      if (saveVocabBtn) {
        e.stopPropagation();
        const item = store.findItemAnywhere(saveVocabBtn.getAttribute('data-ll-save-vocab'));
        if (item) await handleSaveToVocabulary(item);
        return true;
      }

      const deleteBtn = e.target.closest('[data-ll-delete-item]');
      if (deleteBtn) {
        e.stopPropagation();
        await handleDeleteItem(deleteBtn.getAttribute('data-ll-delete-item'));
        return true;
      }

      return false;
    }

    async function openWordLookup(word, contextSentence, itemId, sourceEl) {
      if (!word || !global.FlaptapWordLookup) return;
      const lang = store.getPreferredLanguage();
      await global.FlaptapWordLookup.open({
        word,
        sourceEl,
        contextSentence: contextSentence || word,
        endpoint: '/api/learning-library/define-word',
        payload: {
          itemId: itemId || undefined,
          word,
          contextSentence: contextSentence || undefined,
          language: lang,
        },
        fetcher: api.apiFetch,
        canPlay: false,
        canSpeak: true,
        canSave: true,
        saveLabel: '+ Save to Vocabulary',
        savedLabel: 'Saved in Vocabulary',
        isSavedFn: (term) => Boolean(store.ws()?.isVocabularySaved && store.ws().isVocabularySaved(term)),
        onSave: async (lookup) => {
          if (!store.currentUser() && store.ws()?.requireAuthBeforeAction) {
            store.ws().requireAuthBeforeAction({ type: 'section', section: 'learning-library' });
            return;
          }
          try {
            await api.saveVocabularyItem({
              term: lookup.term,
              ipa: lookup.ipa || '',
              partOfSpeech: lookup.partOfSpeech || '',
              definition: lookup.definition || '',
              generalTranslation: lookup.generalTranslation || '',
              translation: lookup.translation || '',
              contextSentence: lookup.contextSentence || '',
              lessonTitle: store.getActiveDomain()?.title || 'Generate Phrases',
            });
            await store.ws()?.refreshVocabulary?.();
            global.FlaptapWordLookup.syncSavedButtonDom();
            showToast(`Saved “${lookup.term}” to Vocabulary Flashcards`);
          } catch (err) {
            showToast(err?.message || 'Could not save word.');
          }
        },
      });
    }

    function bindSelectionLookup(container) {
      if (!container || !global.FlaptapWordLookup?.bindSelectionLookup) return;
      if (typeof local.itemsSelectionTeardown === 'function') {
        try {
          local.itemsSelectionTeardown();
        } catch {}
        local.itemsSelectionTeardown = null;
      }
      const td = global.FlaptapWordLookup.bindSelectionLookup(container, {
        maxLength: 320,
        onSelect: (text, meta) => {
          const node = meta?.range?.startContainer;
          const element = node?.nodeType === 1 ? node : node?.parentElement;
          const word = element?.closest('.clickable-word');
          openWordLookup(
            text,
            word?.dataset.contextSentence || text,
            word?.dataset.llItemId || store.state.activeStudyItemId || '',
            meta?.sourceEl || null,
          );
        },
      });
      local.itemsSelectionTeardown = typeof td === 'function' ? td : null;
    }

    function clearAllFilters() {
      store.state.browseCategoryId = 'all';
      store.state.browseMastery = 'all';
      store.state.browseRegister = 'all';
      store.state.browseLevel = 'all';
      store.state.browseSearch = '';
      store.state.browseSort = 'newest';
      store.state.page = 1;
      const searchEl = el('ll-browse-search-input');
      if (searchEl) searchEl.value = '';
      syncRoute(true);
      loadLibraryItems({ showSkeleton: true, animate: true });
    }

    function closeMoreMenu() {
      const menu = el('ll-more-menu');
      const btn = el('ll-more-menu-btn');
      if (menu) menu.hidden = true;
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    /* --------------------------------------------------------------------
       EVENTS & LIFECYCLE
       -------------------------------------------------------------------- */

    function bindEvents() {
      const root = el('ll-view-library');
      if (!root) return;

      stickyDock?.bind();

      // Domain switcher inside Library header
      el('ll-lib-domain-pills')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-ll-domain]');
        if (!btn) return;
        const nextDomain = btn.getAttribute('data-ll-domain');
        if (nextDomain && nextDomain !== store.state.activeDomainId) {
          nav.switchDomain(nextDomain);
        }
      });

      // Header actions
      el('ll-lib-new-btn')?.addEventListener('click', () => nav.goToGenerate({ focusInput: true }));
      el('ll-empty-new-btn')?.addEventListener('click', () => nav.goToGenerate({ focusInput: true }));
      el('ll-empty-clear-btn')?.addEventListener('click', clearAllFilters);
      el('ll-clear-filters-btn')?.addEventListener('click', clearAllFilters);
      el('ll-dismiss-batch-banner')?.addEventListener('click', () => {
        store.state.latestBatchResult = null;
        renderBatchBanner();
      });

      el('ll-lib-lang-select')?.addEventListener('change', (e) => {
        const nextLang = e.target.value || 'ar';
        store.setPreferredLanguage(nextLang);
        syncTranslateMissingButton();
        renderItems();
      });

      el('ll-translate-missing-btn')?.addEventListener('click', () => {
        handleTranslateVisibleMissing(false);
      });

      // Sticky Dock: Remaining only / Favorites / Recall mode
      el('ll-scope-remaining-btn')?.addEventListener('click', () => {
        store.state.browseMastery = store.state.browseMastery === 'pending' ? 'all' : 'pending';
        store.state.page = 1;
        syncRoute(true);
        loadLibraryItems({ showSkeleton: true, animate: true });
      });

      el('ll-scope-favorites-btn')?.addEventListener('click', () => {
        store.state.browseMastery = store.state.browseMastery === 'favorites' ? 'all' : 'favorites';
        store.state.page = 1;
        syncRoute(true);
        loadLibraryItems({ showSkeleton: true, animate: true });
      });

      el('ll-recall-toggle-btn')?.addEventListener('click', () => {
        store.state.recallMaskMode = !store.state.recallMaskMode;
        store.state.revealedCardIds.clear();
        renderProgressDock();
        renderItems();
        deps.refreshDrawer?.();
      });

      // Clickable phrase pips jump directly to card below sticky dock
      el('ll-browse-progress-bar')?.addEventListener('click', (e) => {
        const pip = e.target.closest('[data-ll-jump-id]');
        if (!pip) return;
        const id = pip.getAttribute('data-ll-jump-id');
        if (!id) return;
        const card = document.querySelector(
          `[data-ll-row-id="${CSS.escape(id)}"], [data-ll-card-id="${CSS.escape(id)}"]`,
        );
        if (card) {
          stickyDock?.scrollCardIntoView(card);
        }
      });

      // Category Filter Rail
      el('ll-category-filters')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-ll-cat-filter]');
        if (!btn) return;
        const nextCat = btn.getAttribute('data-ll-cat-filter') || 'all';
        store.state.browseCategoryId = nextCat;
        store.state.page = 1;
        stickyDock?.centerPill(btn);
        syncRoute(true);
        loadLibraryItems({ showSkeleton: true, animate: true });
      });

      // Secondary selects & search + Filters popover toggle
      const setFiltersPopoverOpen = (open) => {
        const pop = el('ll-filters-popover');
        const btn = el('ll-filters-popover-btn');
        if (!pop || !btn) return;
        pop.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      };

      el('ll-filters-popover-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const pop = el('ll-filters-popover');
        setFiltersPopoverOpen(Boolean(pop?.hidden));
      });

      el('ll-popover-reset-btn')?.addEventListener('click', () => {
        store.state.browseLevel = 'all';
        store.state.browseRegister = 'all';
        store.state.browseMastery = 'all';
        store.state.browseSort = 'newest';
        store.state.page = 1;
        syncRoute(true);
        loadLibraryItems({ showSkeleton: true, animate: true });
      });

      document.addEventListener('click', (e) => {
        const pop = el('ll-filters-popover');
        if (!pop || pop.hidden) return;
        if (!e.target.closest('#ll-filters-popover-wrap')) {
          setFiltersPopoverOpen(false);
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          const pop = el('ll-filters-popover');
          if (pop && !pop.hidden) setFiltersPopoverOpen(false);
        }
      });

      el('ll-browse-level-select')?.addEventListener('change', (e) => {
        store.state.browseLevel = e.target.value || 'all';
        store.state.page = 1;
        syncRoute(true);
        loadLibraryItems({ showSkeleton: true, animate: true });
      });

      el('ll-browse-register-select')?.addEventListener('change', (e) => {
        store.state.browseRegister = e.target.value || 'all';
        store.state.page = 1;
        syncRoute(true);
        loadLibraryItems({ showSkeleton: true, animate: true });
      });

      el('ll-browse-status-select')?.addEventListener('change', (e) => {
        store.state.browseMastery = e.target.value || 'all';
        store.state.page = 1;
        syncRoute(true);
        loadLibraryItems({ showSkeleton: true, animate: true });
      });

      el('ll-browse-sort-select')?.addEventListener('change', (e) => {
        store.state.browseSort = e.target.value || 'newest';
        store.state.page = 1;
        syncRoute(true);
        loadLibraryItems({ showSkeleton: true, animate: true });
      });

      el('ll-browse-search-input')?.addEventListener('input', (e) => {
        store.state.browseSearch = e.target.value || '';
        store.state.page = 1;
        syncRoute(true);
        clearTimeout(local.searchTimer);
        local.searchTimer = setTimeout(() => loadLibraryItems({ showSkeleton: true, animate: true }), 180);
      });

      // View mode toggle
      el('ll-view-table-btn')?.addEventListener('click', () => {
        if (store.state.viewMode === 'table') return;
        store.state.viewMode = 'table';
        store.state.animateNextRender = true;
        store.safeLocalSet('flaptap_ll_view_mode', 'table');
        syncViewModeButtons();
        if (store.state.isLoadingList) showSkeletons();
        else renderItems();
      });

      el('ll-view-cards-btn')?.addEventListener('click', () => {
        if (store.state.viewMode === 'cards') return;
        store.state.viewMode = 'cards';
        store.state.animateNextRender = true;
        store.safeLocalSet('flaptap_ll_view_mode', 'cards');
        syncViewModeButtons();
        if (store.state.isLoadingList) showSkeletons();
        else renderItems();
      });

      // Pagination
      paginationBar.bind({
        onPageChange: async (nextPage) => {
          const clamped = Math.max(1, Math.min(store.state.totalPages || 1, Math.floor(Number(nextPage) || 1)));
          if (clamped === store.state.page && !store.state.isLoadingList) return;
          scrollRestorer.clear();
          store.state.page = clamped;
          syncRoute(false);
          stickyDock?.scrollToStart({ force: true });
          await loadLibraryItems({ showSkeleton: true, animate: true });
        },
        onPageSizeChange: async (nextSize) => {
          if (!store.PAGE_SIZE_OPTIONS.includes(nextSize) || nextSize === store.state.pageSize) return;
          scrollRestorer.clear();
          store.state.pageSize = nextSize;
          store.state.page = 1;
          store.safeLocalSet('flaptap_ll_page_size', String(nextSize));
          syncRoute(true);
          stickyDock?.scrollToStart({ force: true });
          await loadLibraryItems({ showSkeleton: true, animate: true });
        },
      });

      // More Menu
      const moreBtn = el('ll-more-menu-btn');
      const moreMenu = el('ll-more-menu');
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
      el('ll-save-all-btn')?.addEventListener('click', () => {
        closeMoreMenu();
        handleSaveAllVisible();
      });
      el('ll-export-md-btn')?.addEventListener('click', () => {
        closeMoreMenu();
        handleExportMarkdown();
      });
      el('ll-export-json-btn')?.addEventListener('click', () => {
        closeMoreMenu();
        handleExportJson();
      });
      el('ll-clear-domain-btn')?.addEventListener('click', () => {
        closeMoreMenu();
        handleClearDomain();
      });

      // Delegated item clicks
      root.addEventListener('click', (e) => {
        handleDelegatedAction(e);
      });
    }

    function mount() {
      if (local.mounted) return;
      local.mounted = true;
      bindEvents();
      scrollRestorer.bindLifecycle();

      local.unsubs.push(
        store.subscribe('domains:loaded', () => {
          renderLibraryHeader();
          renderFilterRail();
          renderSecondaryFilters();
        }),
        store.subscribe('language:changed', () => {
          populateStudyLanguageSelect();
          syncTranslateMissingButton();
        }),
      );
    }

    async function onActivate(options = {}) {
      if (options?.searchParams) {
        const qPage = Number(options.searchParams.get('page'));
        const qLimit = Number(options.searchParams.get('limit'));
        if (Number.isFinite(qPage) && qPage >= 1) store.state.page = Math.floor(qPage);
        if (store.PAGE_SIZE_OPTIONS.includes(qLimit)) store.state.pageSize = qLimit;
      }
      if (!options.skipFetch) {
        await loadLibraryItems({
          showSkeleton: !store.state.hasLoadedOnce || Boolean(options.showSkeleton),
          animate: options.animate !== false,
        });
      } else {
        renderAll();
      }
    }

    function onDeactivate() {
      stickyDock?.disconnect();
      closeMoreMenu();
    }

    return {
      mount,
      onActivate,
      onDeactivate,
      loadLibraryItems,
      renderAll,
      handleDelegatedAction,
      openWordLookup,
      onLanguagesLoaded: populateStudyLanguageSelect,
      mergeFreshGeneration(result) {
        store.state.latestBatchResult = result;
        store.state.browseCategoryId = 'all';
        store.state.browseMastery = 'all';
        store.state.browseRegister = 'all';
        store.state.browseLevel = 'all';
        store.state.browseSearch = '';
        store.state.browseSort = 'newest';
        store.state.page = 1;

        const freshItems = Array.isArray(result?.items) ? result.items : [];
        if (freshItems.length > 0) {
          const freshIds = new Set(freshItems.map((it) => it.id));
          const merged = [
            ...freshItems,
            ...(store.state.items || []).filter((it) => !freshIds.has(it.id)),
          ].sort(store.compareLibraryItems);
          store.state.items = merged.slice(0, store.state.pageSize);
          store.state.recentItems = merged.slice(0, 6);
          if (result.stats) store.state.stats = result.stats;
          if (result.categoryCounts) store.state.categoryCounts = result.categoryCounts;
          if (result.registerCounts) store.state.registerCounts = result.registerCounts;
          if (result.cefrCounts) store.state.cefrCounts = result.cefrCounts;
          store.state.filteredCount = Number(store.state.stats?.totalItems) || merged.length;
          store.state.filteredCompletedCount =
            Number(store.state.stats?.completedCount) || merged.filter((it) => it.isCompleted).length;
          store.state.totalPages = Math.max(1, Math.ceil(store.state.filteredCount / store.state.pageSize));
          store.state.hasMore = store.state.page < store.state.totalPages;
          store.state.isLoadingList = false;
          store.state.hasLoadedOnce = true;
          store.state.animateNextRender = true;
          store.emit('stats:changed', store.state.stats);
          renderAll();
        }
      },
    };
  }

  global.FlaptapGPLibraryPage = { create };
})(window);
