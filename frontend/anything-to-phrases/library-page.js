/* ==========================================================================
   ANYTHING TO PHRASES — LIBRARY PAGE (library-page.js)
   Isolated Page 2 (/extractor/library):
   - Full list of every previously extracted study guide
   - Instant search, source-type filter, study-status filter, sort
   - Inline Rename (accessible keyboard Enter/Escape + PATCH)
   - Two-step safe Delete
   - Pagination (12 per page) + loading skeletons + tailored empty states
   Zero cross-imports with Extract or Detail pages.
   ========================================================================== */

(function (global) {
  'use strict';

  const DEFAULT_PAGE_SIZE = global.FlaptapPagination?.DEFAULT_PAGE_SIZE || 10;
  const PAGE_SIZE_OPTIONS = [10, 20, 50];

  const SOURCE_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'video', label: 'Video' },
    { id: 'article', label: 'Articles' },
    { id: 'text', label: 'Text' },
    { id: 'file', label: 'Files' },
    { id: 'lesson', label: 'Lessons' },
  ];

  function create(deps) {
    const store = deps.store;
    const api = deps.api;
    const nav = deps.nav;
    const P = global.FlaptapPagination;
    const U = global.FlaptapUtils;
    const escapeHtml = U.escapeHtml;

    const local = {
      mounted: false,
      loading: false,
      error: '',
      items: [],
      total: 0,
      filteredTotal: 0,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: 1,
      hasMore: false,
      hasLoadedOnce: false,
      animateNextRender: false,
      stats: { totalGuides: 0, totalItems: 0, completedGuides: 0, inProgressGuides: 0 },
      q: '',
      sourceType: 'all',
      status: 'all',
      sort: 'newest',
      renamingId: '',
      selectedIds: new Set(),
      searchTimer: null,
      fetchSeq: 0,
      unsubs: [],
    };

    const pager = P.createBar({
      barId: 'aex-library-pagination',
      infoId: 'aex-lib-page-info',
      numbersId: 'aex-lib-page-numbers',
      prevId: 'aex-lib-prev-btn',
      nextId: 'aex-lib-next-btn',
      pageSizePillsId: 'aex-lib-page-size-pills',
      pageSizeOptions: PAGE_SIZE_OPTIONS,
      ariaLabel: 'Phrase Library pagination',
    });

    const skeletonGate = P.createSkeletonGate(190);
    const scrollRestorer = P.createScrollRestorer({
      storageKey: 'flaptap:aex-library-scroll:v1',
      isActive: () => store.state.activeView === 'library',
      getContainer: () => el('aex-library-grid'),
    });

    function el(id) {
      return document.getElementById(id);
    }

    function showToast(msg) {
      U.showToast(msg);
    }

    function hasActiveFilters() {
      return Boolean(local.q.trim() || local.sourceType !== 'all' || local.status !== 'all');
    }

    function buildRouteQuery() {
      const extraQuery = {};
      if (local.page > 1) extraQuery.page = local.page;
      if (local.pageSize !== DEFAULT_PAGE_SIZE) extraQuery.limit = local.pageSize;
      return extraQuery;
    }

    function syncLibraryRoute(replace = true) {
      if (store.state.activeView !== 'library') return;
      global.FlaptapRouter?.updateSubroute?.('american-extractor', {
        subview: 'library',
        extraQuery: buildRouteQuery(),
        replace,
      });
    }

    /* --------------------------------------------------------------------
       DATA LOADING
       -------------------------------------------------------------------- */

    async function loadPage(pageNum = local.page, options = {}) {
      if (!store.currentUser()) {
        skeletonGate.reset();
        local.items = [];
        local.total = 0;
        local.filteredTotal = 0;
        local.totalPages = 1;
        local.hasMore = false;
        local.loading = false;
        local.error = '';
        render();
        return;
      }

      const seq = ++local.fetchSeq;
      local.page = Math.max(1, Math.floor(Number(pageNum) || 1));
      local.loading = true;
      local.error = '';
      if (options.scrollToTop) {
        P.scrollToTop('#aex-library-grid', { offset: 96 });
      }
      skeletonGate.start();
      render();

      let loadedOk = false;
      try {
        const res = await api.listHistory({
          q: local.q.trim(),
          sourceType: local.sourceType,
          status: local.status,
          sort: local.sort,
          page: local.page,
          limit: local.pageSize,
        });
        if (seq !== local.fetchSeq) return;
        const stillCurrent = await skeletonGate.waitRemaining(() => seq === local.fetchSeq);
        if (!stillCurrent) return;

        local.items = Array.isArray(res.items) ? res.items : [];
        local.total = Number(res.total) || 0;
        local.filteredTotal = Number(res.filteredTotal ?? local.items.length);
        local.page = Math.max(1, Number(res.page) || local.page);
        local.pageSize = Math.max(1, Number(res.pageSize) || local.pageSize);
        local.totalPages = Math.max(
          1,
          Number(res.totalPages) || Math.ceil(local.filteredTotal / local.pageSize) || 1,
        );
        local.hasMore = Boolean(res.hasMore);
        if (res.stats) local.stats = res.stats;
        local.hasLoadedOnce = true;
        local.animateNextRender = Boolean(options.animate);
        loadedOk = true;

        // Keep global store count synced when unfiltered
        if (!hasActiveFilters() && local.page === 1) {
          store.setHistorySnapshot(res);
        }
        if (options.syncRoute || local.page > 1 || local.pageSize !== DEFAULT_PAGE_SIZE) {
          syncLibraryRoute(true);
        }
      } catch (err) {
        if (seq !== local.fetchSeq) return;
        if (err?.status !== 401) {
          local.error = err?.message || 'Could not load your Library.';
        }
      } finally {
        if (seq === local.fetchSeq) {
          skeletonGate.reset();
          local.loading = false;
          render();
          if (loadedOk) {
            scrollRestorer.finishRestore();
          }
        }
      }
    }

    /* --------------------------------------------------------------------
       RENDERING
       -------------------------------------------------------------------- */

    function renderSourceFilters() {
      const wrap = el('aex-lib-source-filters');
      if (!wrap) return;
      wrap.innerHTML = SOURCE_FILTERS.map(
        (f) => `
        <button type="button" class="filter-pill${local.sourceType === f.id ? ' active' : ''}" data-aex-lib-source="${escapeHtml(
          f.id,
        )}" aria-pressed="${local.sourceType === f.id ? 'true' : 'false'}">
          ${escapeHtml(f.label)}
        </button>`,
      ).join('');
    }

    function renderSkeletons() {
      const count = Math.min(local.pageSize, 6);
      return Array.from({ length: count }, (_, idx) => `
          <div class="aex-library-card-item aex-lib-skel ft-skeleton-item" style="--ft-stagger:${idx}" aria-hidden="true">
            <div class="aex-skel-bar aex-skel-bar--sm ft-skel-shimmer"></div>
            <div class="aex-skel-bar aex-skel-bar--title ft-skel-shimmer"></div>
            <div class="aex-skel-bar aex-skel-bar--body ft-skel-shimmer"></div>
            <div class="aex-skel-bar aex-skel-bar--meta ft-skel-shimmer"></div>
          </div>`).join('');
    }

    function renderCard(item, idx = 0) {
      const renaming = local.renamingId === item.id;
      const stats = store.historyStudyState(item);
      const deleteLabel = `Delete ${item.title || 'study guide'}`;
      const selected = local.selectedIds.has(item.id);

      const titleBlock = renaming
        ? `<form class="aex-rename-form" data-aex-rename-form="${escapeHtml(item.id)}">
             <input type="text" class="aex-rename-input" value="${escapeHtml(
               item.title || '',
             )}" maxlength="140" aria-label="New guide title" required />
             <div class="aex-rename-actions">
               <button type="submit" class="btn-vox btn-xs">Save</button>
               <button type="button" class="btn-secondary btn-xs" data-aex-rename-cancel="1">Cancel</button>
             </div>
           </form>`
        : `<h3 class="aex-library-card-title">
             <button type="button" class="aex-title-open-btn" data-aex-open="${escapeHtml(item.id)}">${escapeHtml(
               item.title || 'Untitled study guide',
             )}</button>
           </h3>`;

      return `
        <article class="aex-library-card-item ft-item-surface" style="--ft-stagger:${idx}" data-state="${stats.tone}" data-aex-library-id="${escapeHtml(item.id)}">
          <div class="aex-recent-top">
            <label class="ft-item-select-label" style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" data-aex-select="${escapeHtml(item.id)}" ${selected ? 'checked' : ''} aria-label="Select ${escapeHtml(item.title || 'study guide')}" />
              ${store.sourceBadgeHtml(item.source_type)}
            </label>
            <span class="aex-recent-meta">${escapeHtml(store.formatDate(item.created_at))}</span>
          </div>
          ${titleBlock}
          <p class="aex-library-card-summary">${escapeHtml(item.summary || item.source_label || '')}</p>
          <div class="aex-card-progress">
            <div class="aex-card-progress-head">
              ${store.studyStateChipHtml(stats)}
              <span class="aex-card-progress-count ltr-num">${store.studyStateCount(stats)}</span>
            </div>
            ${store.studyStateTrackHtml(stats)}
          </div>
          <div class="aex-library-card-meta">
            <span>${escapeHtml(item.creator || 'Source')}</span>
            <span class="ltr-num">${Number(item.item_count) || 0} phrases</span>
          </div>
          <div class="aex-library-card-actions">
            <button type="button" class="btn-secondary aex-lib-open-btn" data-aex-open="${escapeHtml(item.id)}">${
              stats.tone === 'done' ? 'Review' : stats.tone === 'progress' ? 'Continue' : 'Study'
            }</button>
            <button type="button" class="aex-lib-icon-btn" data-aex-rename="${escapeHtml(
              item.id,
            )}" aria-label="Rename ${escapeHtml(item.title || 'study guide')}" title="Rename">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button type="button" class="aex-recent-delete" data-aex-delete="${escapeHtml(
              item.id,
            )}" aria-label="${escapeHtml(deleteLabel)}" title="Delete study guide">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>
            </button>
          </div>
        </article>
      `;
    }

    function render() {
      const grid = el('aex-library-grid');
      const empty = el('aex-library-empty');
      const authGate = el('aex-library-auth-gate');
      const errBox = el('aex-library-error');
      const totalEl = el('aex-library-total');
      const pagination = el('aex-library-pagination');
      if (!grid) return;

      renderSourceFilters();

      const signedIn = Boolean(store.currentUser());
      const clearAllBtn = el('aex-lib-clear-all-btn');
      const bulkBar = el('aex-library-bulk-bar');
      if (authGate) authGate.hidden = signedIn;
      if (!signedIn) {
        grid.removeAttribute('aria-busy');
        grid.classList.remove('ft-items-entering');
        grid.innerHTML = '';
        if (empty) empty.hidden = true;
        if (errBox) errBox.hidden = true;
        if (clearAllBtn) clearAllBtn.hidden = true;
        if (bulkBar) bulkBar.hidden = true;
        pager.hide();
        if (totalEl) totalEl.textContent = 'Sign in to view your saved guides';
        return;
      }

      const validIds = new Set(local.items.map((it) => it.id));
      for (const id of Array.from(local.selectedIds)) {
        if (!validIds.has(id)) local.selectedIds.delete(id);
      }
      if (clearAllBtn) clearAllBtn.hidden = local.total === 0;
      if (bulkBar) bulkBar.hidden = local.items.length === 0;
      const selCountEl = el('aex-lib-selected-count');
      if (selCountEl) selCountEl.textContent = `(${local.selectedIds.size} selected)`;
      const selectAllCb = el('aex-lib-select-all');
      if (selectAllCb) {
        selectAllCb.checked = local.items.length > 0 && local.items.every((it) => local.selectedIds.has(it.id));
      }
      const bulkDelBtn = el('aex-lib-bulk-delete-btn');
      if (bulkDelBtn) bulkDelBtn.disabled = local.selectedIds.size === 0;

      if (totalEl) {
        const s = local.stats;
        const parts = [
          `${local.total} guide${local.total === 1 ? '' : 's'}`,
          s.totalItems ? `${s.totalItems} phrases` : '',
          s.completedGuides ? `${s.completedGuides} completed` : '',
        ].filter(Boolean);
        totalEl.textContent = parts.join(' · ') || '0 guides';
      }

      if (errBox) {
        errBox.hidden = !local.error;
        const msg = el('aex-library-error-msg');
        if (msg) msg.textContent = local.error;
      }

      if (local.loading) {
        grid.setAttribute('aria-busy', 'true');
        grid.classList.remove('ft-items-entering');
        grid.innerHTML = renderSkeletons();
        if (empty) empty.hidden = true;
        pager.hide();
        return;
      }

      grid.removeAttribute('aria-busy');
      grid.innerHTML = local.items.map((item, idx) => renderCard(item, idx)).join('');
      if (local.animateNextRender) {
        local.animateNextRender = false;
        P.triggerEntrance(grid);
      }

      if (local.renamingId) {
        const input = grid.querySelector(`[data-aex-rename-form="${CSS.escape(local.renamingId)}"] .aex-rename-input`);
        if (input) {
          input.focus();
          input.select();
        }
      }

      const isEmpty = local.items.length === 0 && !local.error;
      if (empty) {
        empty.hidden = !isEmpty;
        if (isEmpty) {
          const filtered = hasActiveFilters();
          const h3 = el('aex-library-empty-title');
          const p = el('aex-library-empty-desc');
          const newBtn = el('aex-library-new-btn');
          const clearBtn = el('aex-library-clear-filters-btn');
          if (h3) h3.textContent = filtered ? 'No matching guides' : 'Your Library is empty';
          if (p) {
            p.textContent = filtered
              ? 'No saved guides match your current search or filter settings.'
              : 'Extract phrases from any video, article, audio, screenshot, or text to build your personal American English library.';
          }
          if (newBtn) newBtn.hidden = filtered;
          if (clearBtn) clearBtn.hidden = !filtered;
        }
      }

      pager.render({
        page: local.page,
        pageSize: local.pageSize,
        total: local.filteredTotal,
        totalPages: local.totalPages,
        itemsCount: local.items.length,
        loading: local.loading,
        visible: signedIn && !local.error,
      });
    }

    /* --------------------------------------------------------------------
       ACTIONS (RENAME & TWO-STEP DELETE)
       -------------------------------------------------------------------- */

    function startRename(id) {
      local.renamingId = id;
      render();
    }

    function cancelRename() {
      local.renamingId = '';
      render();
    }

    async function submitRename(id, rawTitle) {
      const title = String(rawTitle || '').trim();
      if (!title) {
        showToast('Title cannot be empty.');
        return;
      }
      try {
        const res = await api.renameNote(id, title);
        const nextTitle = res.title || title;
        const entry = local.items.find((i) => i.id === id);
        if (entry) entry.title = nextTitle;
        store.updateCachedNoteMeta(id, { title: nextTitle });
        local.renamingId = '';
        render();
        showToast('Guide renamed.');
      } catch (err) {
        showToast(err?.message || 'Could not rename guide.');
      }
    }

    async function handleDelete(id) {
      const target = local.items.find((entry) => entry.id === id);
      const guideTitle = String(target?.title || 'Study guide').trim();
      if (!global.FlaptapConfirm?.confirmAndUndo) return;

      const snapshot = {
        items: [...local.items],
        total: local.total,
        filteredTotal: local.filteredTotal,
        totalPages: local.totalPages,
        hasMore: local.hasMore,
        page: local.page,
        localStats: { ...local.stats },
        cachedNote: store.getCachedNote(id),
        recentHistory: [...(store.state.recentHistory || [])],
        historyTotal: store.state.historyTotal,
        stats: { ...(store.state.stats || {}) },
      };

      await global.FlaptapConfirm.confirmAndUndo({
        title: 'Delete study guide?',
        message: 'This study guide, its extracted phrases, and orphaned source caches will be removed.',
        detail: guideTitle,
        confirmLabel: 'Delete',
        undoMessage: `Deleted "${guideTitle}"`,
        restoredMessage: `Restored "${guideTitle}"`,
        onApply: () => {
          local.items = local.items.filter((entry) => entry.id !== id);
          local.selectedIds.delete(id);
          local.total = Math.max(0, (Number(local.total) || 0) - 1);
          local.filteredTotal = Math.max(0, (Number(local.filteredTotal) || 0) - 1);
          local.totalPages = Math.max(1, Math.ceil(local.filteredTotal / local.pageSize) || 1);
          local.hasMore = local.page < local.totalPages;
          local.stats = {
            ...local.stats,
            totalGuides: Math.max(0, (Number(local.stats.totalGuides) || 0) - 1),
            totalItems: Math.max(0, (Number(local.stats.totalItems) || 0) - (Number(target?.item_count) || 0)),
          };
          store.removeNoteFromCache(id);
          render();
        },
        onUndo: () => {
          local.items = snapshot.items;
          local.total = snapshot.total;
          local.filteredTotal = snapshot.filteredTotal;
          local.totalPages = snapshot.totalPages;
          local.hasMore = snapshot.hasMore;
          local.page = snapshot.page;
          local.stats = snapshot.localStats;
          if (snapshot.cachedNote) store.cacheNote(snapshot.cachedNote);
          store.restoreHistorySnapshot(snapshot);
          render();
        },
        onCommit: async ({ keepalive = false } = {}) => {
          await api.deleteNote(id, { keepalive });
          if (!keepalive) {
            const targetPage = local.items.length === 0 && local.page > 1 ? local.page - 1 : local.page;
            await loadPage(targetPage, { animate: false, syncRoute: true });
            deps.reloadHistory?.().catch(() => {});
          }
        },
        onError: (err) => {
          showToast(err?.message || 'Could not delete that study guide.');
          render();
        },
      });
    }

    async function handleBulkDelete() {
      const ids = Array.from(local.selectedIds);
      if (!ids.length || !global.FlaptapConfirm?.confirmAction) return;
      await global.FlaptapConfirm.confirmAction({
        title: 'Delete selected study guides?',
        message: `Permanently delete ${ids.length} study guide(s) and clean up orphaned source caches.`,
        detail: `${ids.length} guide(s) selected`,
        confirmLabel: 'Delete Selected',
        tone: 'danger',
        onConfirm: async () => {
          await api.bulkDeleteNotes(ids);
          local.selectedIds.clear();
          ids.forEach((id) => store.removeNoteFromCache(id));
          await loadPage(1, { animate: false, syncRoute: true });
          deps.reloadHistory?.().catch(() => {});
          showToast(`Deleted ${ids.length} study guide(s)`);
        },
        onError: (err) => {
          showToast(err?.message || 'Bulk delete failed.');
        },
      });
    }

    async function handleClearAll() {
      if (!global.FlaptapConfirm?.confirmAction) return;
      await global.FlaptapConfirm.confirmAction({
        title: 'Clear all Phrase Miner guides?',
        message: 'Permanently removes every saved study guide and cleans up orphaned source caches and OCR caches.',
        detail: `${local.total} study guide(s)`,
        confirmLabel: 'Clear All Guides',
        tone: 'danger',
        onConfirm: async () => {
          const res = await api.clearAllNotes();
          local.selectedIds.clear();
          store.resetUserData();
          await loadPage(1, { animate: false, syncRoute: true });
          deps.reloadHistory?.().catch(() => {});
          showToast(`Cleared ${res.removedCount || 0} study guide(s)`);
        },
        onError: (err) => {
          showToast(err?.message || 'Could not clear study guides.');
        },
      });
    }

    function clearAllFilters() {
      local.q = '';
      local.sourceType = 'all';
      local.status = 'all';
      local.sort = 'newest';
      local.page = 1;
      if (el('aex-library-search')) el('aex-library-search').value = '';
      if (el('aex-lib-status-select')) el('aex-lib-status-select').value = 'all';
      if (el('aex-lib-sort-select')) el('aex-lib-sort-select').value = 'newest';
      loadPage(1, { animate: true, syncRoute: true });
    }

    /* --------------------------------------------------------------------
       EVENTS & LIFECYCLE
       -------------------------------------------------------------------- */

    function bindEvents() {
      const root = el('aex-view-library');
      if (!root) return;

      el('aex-library-search')?.addEventListener('input', (e) => {
        local.q = String(e.target.value || '');
        clearTimeout(local.searchTimer);
        local.searchTimer = setTimeout(() => loadPage(1, { animate: true, syncRoute: true }), 180);
      });

      el('aex-lib-status-select')?.addEventListener('change', (e) => {
        local.status = e.target.value || 'all';
        loadPage(1, { animate: true, syncRoute: true });
      });

      el('aex-lib-sort-select')?.addEventListener('change', (e) => {
        local.sort = e.target.value || 'newest';
        loadPage(1, { animate: true, syncRoute: true });
      });

      el('aex-library-new-btn')?.addEventListener('click', () => nav.goToExtract({ focusInput: true }));
      el('aex-lib-header-new-btn')?.addEventListener('click', () => nav.goToExtract({ focusInput: true }));
      el('aex-library-clear-filters-btn')?.addEventListener('click', clearAllFilters);
      el('aex-library-retry-btn')?.addEventListener('click', () => loadPage(local.page));
      el('aex-lib-clear-all-btn')?.addEventListener('click', handleClearAll);
      el('aex-lib-bulk-delete-btn')?.addEventListener('click', handleBulkDelete);
      el('aex-lib-select-all')?.addEventListener('change', (e) => {
        if (e.target.checked) local.items.forEach((it) => local.selectedIds.add(it.id));
        else local.selectedIds.clear();
        render();
      });
      root.addEventListener('change', (e) => {
        const cb = e.target.closest('[data-aex-select]');
        if (!cb) return;
        const id = cb.getAttribute('data-aex-select');
        if (cb.checked) local.selectedIds.add(id);
        else local.selectedIds.delete(id);
        render();
      });

      pager.bind({
        onPageChange: (nextPage) => {
          loadPage(nextPage, { animate: true, scrollToTop: true, syncRoute: true });
        },
        onPageSizeChange: (nextSize) => {
          local.pageSize = nextSize;
          loadPage(1, { animate: true, scrollToTop: true, syncRoute: true });
        },
      });

      root.addEventListener('click', (e) => {
        const sourceBtn = e.target.closest('[data-aex-lib-source]');
        if (sourceBtn) {
          local.sourceType = sourceBtn.dataset.aexLibSource || 'all';
          loadPage(1, { animate: true, syncRoute: true });
          return;
        }

        const openBtn = e.target.closest('[data-aex-open]');
        if (openBtn) {
          e.preventDefault();
          nav.goToDetail(openBtn.dataset.aexOpen);
          return;
        }

        const renameBtn = e.target.closest('[data-aex-rename]');
        if (renameBtn) {
          e.preventDefault();
          startRename(renameBtn.dataset.aexRename);
          return;
        }

        const cancelBtn = e.target.closest('[data-aex-rename-cancel]');
        if (cancelBtn) {
          e.preventDefault();
          cancelRename();
          return;
        }

        const deleteBtn = e.target.closest('[data-aex-delete]');
        if (deleteBtn) {
          e.preventDefault();
          handleDelete(deleteBtn.dataset.aexDelete, deleteBtn);
        }
      });

      root.addEventListener('submit', (e) => {
        const form = e.target.closest('[data-aex-rename-form]');
        if (!form) return;
        e.preventDefault();
        const id = form.dataset.aexRenameForm;
        const val = form.querySelector('.aex-rename-input')?.value || '';
        submitRename(id, val);
      });

      root.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && local.renamingId) {
          cancelRename();
        }
      });
    }

    function mount() {
      if (local.mounted) return;
      local.mounted = true;
      bindEvents();
      scrollRestorer.bindLifecycle();

      local.unsubs.push(
        store.subscribe('note:updated', ({ id, patch }) => {
          const entry = local.items.find((i) => i.id === id);
          if (!entry) return;
          if (typeof patch.title === 'string') entry.title = patch.title;
          if (typeof patch.isCompleted === 'boolean') entry.is_completed = patch.isCompleted ? 1 : 0;
          if (typeof patch.completedCount === 'number') entry.completed_count = patch.completedCount;
          if (store.state.activeView === 'library') render();
        }),
        store.subscribe('note:deleted', ({ id }) => {
          local.items = local.items.filter((i) => i.id !== id);
          if (store.state.activeView === 'library') render();
        }),
      );
    }

    async function onActivate(routeState) {
      if (routeState?.searchParams) {
        const qPage = Number(routeState.searchParams.get('page'));
        const qLimit = Number(routeState.searchParams.get('limit'));
        local.page = Number.isFinite(qPage) && qPage >= 1 ? Math.floor(qPage) : 1;
        local.pageSize = PAGE_SIZE_OPTIONS.includes(qLimit) ? qLimit : DEFAULT_PAGE_SIZE;
      }
      if (!local.hasLoadedOnce) {
        scrollRestorer.prepareFromNavigation();
      }
      await loadPage(local.page, {
        animate: local.hasLoadedOnce,
        syncRoute: true,
      });
    }

    return {
      mount,
      onActivate,
      resetToFirstPage: () => {
        local.page = 1;
      },
      refresh: () => loadPage(1, { animate: true, syncRoute: true }),
    };
  }

  global.FlaptapA2PLibraryPage = { create };
})(window);
