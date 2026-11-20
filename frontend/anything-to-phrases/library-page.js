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

  const PAGE_SIZE = 12;

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
      hasMore: false,
      stats: { totalGuides: 0, totalItems: 0, completedGuides: 0, inProgressGuides: 0 },
      q: '',
      sourceType: 'all',
      status: 'all',
      sort: 'newest',
      renamingId: '',
      armedDeleteId: '',
      searchTimer: null,
      fetchSeq: 0,
      unsubs: [],
    };

    function el(id) {
      return document.getElementById(id);
    }

    function showToast(msg) {
      U.showToast(msg);
    }

    function hasActiveFilters() {
      return Boolean(local.q.trim() || local.sourceType !== 'all' || local.status !== 'all');
    }

    /* --------------------------------------------------------------------
       DATA LOADING
       -------------------------------------------------------------------- */

    async function loadPage(pageNum = local.page) {
      if (!store.currentUser()) {
        local.items = [];
        local.total = 0;
        local.filteredTotal = 0;
        local.loading = false;
        local.error = '';
        render();
        return;
      }

      const seq = ++local.fetchSeq;
      local.page = Math.max(1, Number(pageNum) || 1);
      local.loading = true;
      local.error = '';
      render();

      try {
        const res = await api.listHistory({
          q: local.q.trim(),
          sourceType: local.sourceType,
          status: local.status,
          sort: local.sort,
          page: local.page,
          limit: PAGE_SIZE,
        });
        if (seq !== local.fetchSeq) return;

        local.items = Array.isArray(res.items) ? res.items : [];
        local.total = Number(res.total) || 0;
        local.filteredTotal = Number(res.filteredTotal ?? local.items.length);
        local.hasMore = Boolean(res.hasMore);
        if (res.stats) local.stats = res.stats;

        // Keep global store count synced when unfiltered
        if (!hasActiveFilters() && local.page === 1) {
          store.setHistorySnapshot(res);
        }
      } catch (err) {
        if (seq !== local.fetchSeq) return;
        if (err?.status !== 401) {
          local.error = err?.message || 'Could not load your Library.';
        }
      } finally {
        if (seq === local.fetchSeq) {
          local.loading = false;
          render();
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
      return [0, 1, 2, 3, 4, 5]
        .map(
          () => `
          <div class="aex-library-card-item aex-lib-skel" aria-hidden="true">
            <div class="aex-skel-bar aex-skel-bar--sm"></div>
            <div class="aex-skel-bar aex-skel-bar--title"></div>
            <div class="aex-skel-bar aex-skel-bar--body"></div>
            <div class="aex-skel-bar aex-skel-bar--meta"></div>
          </div>`,
        )
        .join('');
    }

    function renderCard(item) {
      const armed = local.armedDeleteId === item.id;
      const renaming = local.renamingId === item.id;
      const stats = store.historyStudyState(item);
      const deleteLabel = `Delete ${item.title || 'study guide'}`;

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
        <article class="aex-library-card-item" data-state="${stats.tone}" data-aex-library-id="${escapeHtml(item.id)}">
          <div class="aex-recent-top">
            ${store.sourceBadgeHtml(item.source_type)}
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
            <button type="button" class="aex-recent-delete${armed ? ' is-armed' : ''}" data-aex-delete="${escapeHtml(
              item.id,
            )}" data-armed="${armed ? '1' : ''}" data-armed-label="${escapeHtml(deleteLabel)}" aria-label="${
              armed ? 'Click again to confirm delete' : escapeHtml(deleteLabel)
            }" title="${armed ? 'Click again to confirm delete' : 'Delete study guide'}">
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
      if (authGate) authGate.hidden = signedIn;
      if (!signedIn) {
        grid.innerHTML = '';
        if (empty) empty.hidden = true;
        if (errBox) errBox.hidden = true;
        if (pagination) pagination.hidden = true;
        if (totalEl) totalEl.textContent = 'Sign in to view your saved guides';
        return;
      }

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
        grid.innerHTML = renderSkeletons();
        if (empty) empty.hidden = true;
        if (pagination) pagination.hidden = true;
        return;
      }

      grid.innerHTML = local.items.map(renderCard).join('');

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

      // Pagination bar
      if (pagination) {
        const totalPages = Math.max(1, Math.ceil(local.filteredTotal / PAGE_SIZE));
        const showPager = local.filteredTotal > PAGE_SIZE;
        pagination.hidden = !showPager;
        if (showPager) {
          const from = (local.page - 1) * PAGE_SIZE + 1;
          const to = Math.min(local.filteredTotal, from + local.items.length - 1);
          const info = el('aex-lib-page-info');
          if (info) info.textContent = `Showing ${from}–${to} of ${local.filteredTotal} · Page ${local.page} of ${totalPages}`;
          const prevBtn = el('aex-lib-prev-btn');
          const nextBtn = el('aex-lib-next-btn');
          if (prevBtn) prevBtn.disabled = local.page <= 1;
          if (nextBtn) nextBtn.disabled = !local.hasMore;
        }
      }
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

    async function handleDelete(id, button) {
      const armed = button.dataset.armed === '1' && local.armedDeleteId === id;
      if (!armed) {
        local.armedDeleteId = id;
        render();
        showToast('Click delete again to confirm.');
        setTimeout(() => {
          if (local.armedDeleteId === id) {
            local.armedDeleteId = '';
            render();
          }
        }, 3500);
        return;
      }

      local.armedDeleteId = '';
      try {
        await api.deleteNote(id);
        store.removeNoteFromCache(id);
        showToast('Study guide deleted.');
        // Reload current page (step back a page if we deleted the last item on page > 1)
        const targetPage = local.items.length <= 1 && local.page > 1 ? local.page - 1 : local.page;
        await loadPage(targetPage);
      } catch (err) {
        showToast(err?.message || 'Could not delete that study guide.');
        render();
      }
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
      loadPage(1);
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
        local.searchTimer = setTimeout(() => loadPage(1), 180);
      });

      el('aex-lib-status-select')?.addEventListener('change', (e) => {
        local.status = e.target.value || 'all';
        loadPage(1);
      });

      el('aex-lib-sort-select')?.addEventListener('change', (e) => {
        local.sort = e.target.value || 'newest';
        loadPage(1);
      });

      el('aex-library-new-btn')?.addEventListener('click', () => nav.goToExtract({ focusInput: true }));
      el('aex-lib-header-new-btn')?.addEventListener('click', () => nav.goToExtract({ focusInput: true }));
      el('aex-library-clear-filters-btn')?.addEventListener('click', clearAllFilters);
      el('aex-library-retry-btn')?.addEventListener('click', () => loadPage(local.page));

      el('aex-lib-prev-btn')?.addEventListener('click', () => {
        if (local.page > 1) loadPage(local.page - 1);
      });
      el('aex-lib-next-btn')?.addEventListener('click', () => {
        if (local.hasMore) loadPage(local.page + 1);
      });

      root.addEventListener('click', (e) => {
        const sourceBtn = e.target.closest('[data-aex-lib-source]');
        if (sourceBtn) {
          local.sourceType = sourceBtn.dataset.aexLibSource || 'all';
          loadPage(1);
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

    async function onActivate() {
      await loadPage(local.page);
    }

    return {
      mount,
      onActivate,
      refresh: () => loadPage(1),
    };
  }

  global.FlaptapA2PLibraryPage = { create };
})(window);
