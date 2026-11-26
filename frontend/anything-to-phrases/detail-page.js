/* ==========================================================================
   ANYTHING TO PHRASES — ITEM DETAIL PAGE (detail-page.js)
   Isolated Page 3 (/extractor/library/:id):
   - Full details of one extracted study guide + interactive study actions
   - Loading skeleton for direct deep links & hard refreshes
   - Graceful 404 / error states
   - Inline Rename, Remaining-only filter, Active Recall quiz mode,
     Category + CEFR + Search filters, TTS pronunciation, Copy, Export,
     Save to Vocabulary Vault, Selectable Source Text reader + Word Lookup
   Zero cross-imports with Extract or Library pages.
   ========================================================================== */

(function (global) {
  'use strict';

  function create(deps) {
    const store = deps.store;
    const api = deps.api;
    const nav = deps.nav;
    const P = global.FlaptapPagination;
    const DEFAULT_PAGE_SIZE = P?.DEFAULT_PAGE_SIZE || 10;
    const PAGE_SIZE_OPTIONS = [10, 20, 50];
    const U = global.FlaptapUtils;
    const escapeHtml = U.escapeHtml;

    const local = {
      mounted: false,
      currentNote: null,
      loadingNoteId: '',
      error: '',
      filterCategory: 'all',
      filterLevel: 'all',
      scopeRemaining: false,
      recallMode: false,
      revealedIndices: new Set(),
      search: '',
      renaming: false,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      pageTimer: null,
      pageSeq: 0,
      mediaPlayer: null,
      linksReqSeq: 0,
      stickyObserver: null,
      stickyResizeObserver: null,
      stickyScrollRaf: 0,
      stickyTopOffset: 55,
      teardowns: [],
      itemsTeardown: null,
      unsubs: [],
    };

    const pager = P.createBar({
      barId: 'aex-items-pagination',
      infoId: 'aex-items-page-info',
      numbersId: 'aex-items-page-numbers',
      prevId: 'aex-items-prev-btn',
      nextId: 'aex-items-next-btn',
      pageSizePillsId: 'aex-items-page-size-pills',
      pageSizeOptions: PAGE_SIZE_OPTIONS,
      ariaLabel: 'Study guide phrases pagination',
    });

    const scrollRestorer = P.createScrollRestorer({
      storageKey: 'flaptap:aex-detail-scroll:v1',
      isActive: () => store.state.activeView === 'detail',
      getContainer: () => el('aex-items-list'),
    });

    function ws() {
      return global.FlaptapWorkspace || null;
    }

    function el(id) {
      return document.getElementById(id);
    }

    function setText(id, val) {
      const node = el(id);
      if (node) node.textContent = val == null ? '' : String(val);
    }

    function icon(name, options) {
      return global.FlaptapIcon ? global.FlaptapIcon(name, options) : '';
    }

    function showToast(msg) {
      U.showToast(msg);
    }

    function requireNoteAuth() {
      if (store.currentUser()) return true;
      if (ws()?.requireAuthBeforeAction) {
        return ws().requireAuthBeforeAction({
          type: 'navigate',
          href: `${global.location.pathname}${global.location.search || ''}`,
        });
      }
      showToast('Sign in to open saved study guides.');
      return false;
    }

    /* --------------------------------------------------------------------
       STICKY STUDY DOCK, FILTER RAIL FADES & PRECISION SCROLLING
       -------------------------------------------------------------------- */

    function measureTopbarHeight() {
      const topbar = document.querySelector('.workspace-topbar');
      const rect = topbar?.getBoundingClientRect();
      return rect && rect.height > 0 ? Math.max(0, Math.round(rect.height)) : 55;
    }

    function syncStickyMetrics() {
      const dock = el('aex-sticky-dock');
      const root = el('aex-items-root');
      const nextTop = measureTopbarHeight();
      local.stickyTopOffset = nextTop;
      if (dock) {
        dock.style.setProperty('--aex-sticky-top', `${nextTop}px`);
      }
      const dockHeight = dock?.getBoundingClientRect()?.height || 110;
      if (root) {
        root.style.setProperty('--aex-scroll-clearance', `${Math.round(nextTop + dockHeight + 16)}px`);
      }
      return nextTop;
    }

    function updateStickyState() {
      const sentinel = el('aex-sticky-sentinel');
      const dock = el('aex-sticky-dock');
      if (
        !sentinel ||
        !dock ||
        dock.hidden ||
        store.state.activeView !== 'detail' ||
        el('aex-detail-ready')?.hidden
      ) {
        dock?.classList.remove('is-stuck');
        return;
      }
      const stuck = sentinel.getBoundingClientRect().top <= local.stickyTopOffset + 2;
      dock.classList.toggle('is-stuck', stuck);
    }

    function scheduleStickyUpdate() {
      if (local.stickyScrollRaf || store.state.activeView !== 'detail') return;
      local.stickyScrollRaf = global.requestAnimationFrame(() => {
        local.stickyScrollRaf = 0;
        updateStickyState();
      });
    }

    function disconnectStickyDock() {
      if (local.stickyScrollRaf) {
        global.cancelAnimationFrame?.(local.stickyScrollRaf);
        local.stickyScrollRaf = 0;
      }
      if (local.stickyObserver) {
        try {
          local.stickyObserver.disconnect();
        } catch {}
        local.stickyObserver = null;
      }
      el('aex-sticky-dock')?.classList.remove('is-stuck');
    }

    function setupStickyDock() {
      disconnectStickyDock();
      const sentinel = el('aex-sticky-sentinel');
      const dock = el('aex-sticky-dock');
      if (!sentinel || !dock || dock.hidden) return;

      const topOffset = syncStickyMetrics();
      updateStickyState();
      if (typeof global.IntersectionObserver !== 'function') return;

      local.stickyObserver = new global.IntersectionObserver(
        () => {
          updateStickyState();
        },
        {
          root: null,
          rootMargin: `-${topOffset + 1}px 0px 0px 0px`,
          threshold: [0, 1],
        },
      );
      local.stickyObserver.observe(sentinel);
    }

    function updateFilterRailFades() {
      const wrap = el('aex-filter-rail-wrap');
      const rail = el('aex-category-filters');
      if (!wrap || !rail) return;
      const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
      if (maxScroll <= 2) {
        wrap.classList.remove('can-scroll-left', 'can-scroll-right');
        return;
      }
      const isRtl = global.getComputedStyle?.(rail)?.direction === 'rtl';
      if (isRtl) {
        const pos = Math.abs(rail.scrollLeft);
        wrap.classList.toggle('can-scroll-right', pos > 4);
        wrap.classList.toggle('can-scroll-left', pos < maxScroll - 4);
      } else {
        wrap.classList.toggle('can-scroll-left', rail.scrollLeft > 4);
        wrap.classList.toggle('can-scroll-right', rail.scrollLeft < maxScroll - 4);
      }
    }

    function centerFilterPillHorizontally(pillBtn) {
      const rail = el('aex-category-filters');
      if (!rail || !pillBtn) return;
      const targetLeft =
        pillBtn.offsetLeft - rail.clientWidth / 2 + pillBtn.offsetWidth / 2;
      const reduced = Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
      rail.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: reduced ? 'instant' : 'smooth',
      });
    }

    function syncClearFiltersButton() {
      const btn = el('aex-clear-filters-btn');
      if (!btn) return;
      const hasActive =
        local.filterCategory !== 'all' ||
        local.filterLevel !== 'all' ||
        local.scopeRemaining ||
        local.search.trim().length > 0;
      btn.hidden = !hasActive;
    }

    function scrollToItemsStart({ onlyIfStuck = false, force = false } = {}) {
      const dock = el('aex-sticky-dock');
      if (onlyIfStuck && !dock?.classList.contains('is-stuck')) return;
      const topOffset = local.stickyTopOffset || measureTopbarHeight();
      P.scrollToTop('#aex-sticky-sentinel', {
        offset: topOffset,
        minTopThreshold: topOffset + 4,
        force,
      });
    }

    function scrollCardIntoViewBelowDock(targetCard) {
      if (!targetCard || typeof targetCard.getBoundingClientRect !== 'function') return;
      const topOffset = local.stickyTopOffset || measureTopbarHeight();
      const dockHeight = el('aex-sticky-dock')?.getBoundingClientRect()?.height || 110;
      const targetTop = targetCard.getBoundingClientRect().top + global.scrollY - (topOffset + dockHeight + 16);
      const reduced = Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
      global.scrollTo({
        top: Math.max(0, targetTop),
        behavior: reduced ? 'instant' : 'smooth',
      });
    }

    /* --------------------------------------------------------------------
       OPEN & HYDRATE
       -------------------------------------------------------------------- */

    function setViewMode(mode) {
      // mode: 'loading' | 'error' | 'ready'
      const skel = el('aex-detail-skeleton');
      const errBox = el('aex-detail-error');
      const readyWrap = el('aex-detail-ready');
      if (skel) skel.hidden = mode !== 'loading';
      if (errBox) errBox.hidden = mode !== 'error';
      if (readyWrap) readyWrap.hidden = mode !== 'ready';
      if (mode === 'ready') {
        setupStickyDock();
      } else {
        disconnectStickyDock();
        clearTimeout(local.pageTimer);
        pager.hide();
      }
    }

    async function loadNote(id, options = {}) {
      if (!id) {
        nav.goToLibrary({ replace: true });
        return;
      }
      if (!store.currentUser()) {
        requireNoteAuth();
        return;
      }
      if (local.loadingNoteId === id) return;

      if (options?.searchParams) {
        scrollRestorer.prepareFromNavigation();
      }

      // Instant render from memory cache if already loaded
      const cached = store.getCachedNote(id);
      if (cached && !options.forceFetch) {
        hydrateNote(cached, options);
        setViewMode('ready');
        scrollRestorer.finishRestore();
        return;
      }

      local.loadingNoteId = id;
      local.error = '';
      setViewMode('loading');

      try {
        const res = await api.getNote(id);
        if (!res?.data) throw new Error('That study guide could not be opened.');
        store.cacheNote(res.data);
        hydrateNote(res.data, options);
        setViewMode('ready');
        scrollRestorer.finishRestore();
      } catch (err) {
        if (err?.status === 401) {
          requireNoteAuth();
        } else {
          local.error =
            err?.status === 404
              ? 'This study guide no longer exists or was deleted.'
              : err?.message || 'Could not load this study guide.';
          setText('aex-detail-error-title', err?.status === 404 ? 'Study guide not found' : 'Could not load guide');
          setText('aex-detail-error-msg', local.error);
          setViewMode('error');
          if (err?.status === 404) {
            store.removeNoteFromCache(id);
          }
        }
      } finally {
        local.loadingNoteId = '';
      }
    }

    function hydrateNote(note, options = {}) {
      clearTimeout(local.pageTimer);
      local.pageSeq += 1;
      local.currentNote = note;
      local.filterCategory = 'all';
      local.filterLevel = 'all';
      local.scopeRemaining = false;
      local.recallMode = false;
      local.revealedIndices.clear();
      local.search = '';
      local.renaming = false;

      const qLimit = Number(options?.searchParams?.get('limit'));
      local.pageSize = PAGE_SIZE_OPTIONS.includes(qLimit) ? qLimit : DEFAULT_PAGE_SIZE;

      const rawPage = options?.searchParams?.get('page');
      const hasExplicitPage =
        rawPage !== null && rawPage !== undefined && String(rawPage).trim() !== '';
      const qPage = Number(rawPage);
      let didAutoResume = false;
      if (hasExplicitPage && Number.isFinite(qPage) && qPage >= 1) {
        local.page = Math.floor(qPage);
      } else {
        const resumePage =
          typeof store.getNextUncompletedPage === 'function'
            ? store.getNextUncompletedPage(note, local.pageSize)
            : 1;
        local.page = resumePage;
        didAutoResume = resumePage > 1;
      }

      if (el('aex-note-search')) el('aex-note-search').value = '';
      el('aex-sticky-dock')?.classList.remove('is-stuck');
      if (note.targetLanguage) store.setPreferredLanguage(note.targetLanguage);
      renderNote(note);
      syncClearFiltersButton();
      if (didAutoResume) {
        syncDetailRoute(true);
      }
    }

    /* --------------------------------------------------------------------
       RENDERING
       -------------------------------------------------------------------- */

    function populateLanguageSelect() {
      const select = el('aex-note-lang-select');
      if (!select) return;
      const items = store.languages();
      const preferred = local.currentNote?.targetLanguage || store.getPreferredLanguage();
      select.innerHTML = items
        .map(
          (l) =>
            `<option value="${escapeHtml(l.code)}">${escapeHtml(l.name)} (${escapeHtml(
              l.native,
            )})</option>`,
        )
        .join('');
      select.value = items.some((l) => l.code === preferred) ? preferred : items[0]?.code || 'en';
    }

    function renderTitleArea(note) {
      const wrap = el('aex-note-title-wrap');
      if (!wrap) return;
      if (local.renaming) {
        wrap.innerHTML = `
          <form class="aex-detail-rename-form" id="aex-detail-rename-form">
            <input type="text" class="aex-rename-input aex-detail-rename-input" id="aex-detail-rename-input" value="${escapeHtml(
              note.title || '',
            )}" maxlength="140" aria-label="Rename study guide" required />
            <button type="submit" class="btn-vox btn-xs">Save</button>
            <button type="button" class="btn-secondary btn-xs" id="aex-detail-rename-cancel">Cancel</button>
          </form>
        `;
        const input = el('aex-detail-rename-input');
        input?.focus();
        input?.select();
      } else {
        wrap.innerHTML = `
          <div class="aex-note-title-row">
            <h2 class="aex-note-title" id="aex-note-title">${escapeHtml(note.title || 'Study guide')}</h2>
            <button type="button" class="aex-icon-btn aex-title-edit-btn" id="aex-detail-rename-btn" title="Rename guide" aria-label="Rename guide">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
          </div>
        `;
      }
    }

    function renderNote(note) {
      if (!note) return;

      teardownBindings();
      setSourcePanelOpen(false);
      setSourceInfoOpen(false);

      renderTitleArea(note);
      setText('aex-note-creator', note.creator || store.SOURCE_TYPE_LABELS[note.sourceType] || 'Source');

      const sourceTypeLabel = store.SOURCE_TYPE_LABELS[note.sourceType] || 'Source';
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
      setText('aex-note-time', `Extracted in ${store.formatTime(note.executionTimeMs)}`);
      setText('aex-note-count', `${note.itemCount || note.items?.length || 0} phrases`);

      const cacheBadge = el('aex-note-cached-badge');
      const reextractBtn = el('aex-reextract-btn');
      if (cacheBadge) cacheBadge.hidden = !note.cached;
      if (reextractBtn) {
        reextractBtn.hidden = !(note.sourceUrl || note.sourceText);
      }

      const summaryWrap = el('aex-note-summary-wrap');
      if (summaryWrap) summaryWrap.hidden = !note.summary;
      setText('aex-note-summary', note.summary || '');
      const styleEl = el('aex-note-style');
      if (styleEl) {
        styleEl.textContent = note.speakerStyle || '';
        styleEl.hidden = !note.speakerStyle;
      }

      const openSourceBtn = el('aex-open-source-btn');
      if (openSourceBtn) {
        openSourceBtn.hidden = !/^https?:\/\//i.test(note.sourceUrl || '');
      }

      const studioBtn = el('aex-studio-btn');
      const studioLabel = el('aex-studio-btn-label');
      if (studioBtn) {
        const lessonId = String(note.sourceMeta?.lessonId || '').trim();
        const isYouTube = /youtube\.com|youtu\.be/i.test(note.sourceUrl || '');
        studioBtn.hidden = !(lessonId || isYouTube);
        studioBtn.dataset.aexStudio = lessonId
          ? `/studio?id=${encodeURIComponent(lessonId)}`
          : `/studio?url=${encodeURIComponent(note.sourceUrl)}`;
        if (studioLabel) studioLabel.textContent = lessonId ? 'Open Lesson' : 'Open in Studio';
      }

      if (global.FlaptapA2PMediaPlayer) {
        if (!local.mediaPlayer) {
          local.mediaPlayer = global.FlaptapA2PMediaPlayer.create({
            onStateChange: syncClipButtonsState,
          });
        }
        local.mediaPlayer.mount(el('aex-media-dock'), note.media || null);
      }

      populateLanguageSelect();
      renderLevelFilter(note);
      renderCategoryFilters(note);
      renderItems(note, { animate: true });
      renderSourceReader(note);
      renderSourceMeta(note);
      renderNoteProgress(note);
      loadCrossFeatureLinks(note);
    }

    async function loadCrossFeatureLinks(note) {
      if (!note?.id || !store.currentUser() || !api.resolveSourceLinks) return;
      const seq = ++local.linksReqSeq;
      try {
        const res = await api.resolveSourceLinks({
          noteId: note.id,
          sourceId: note.sourceId || note.sourceMeta?.sourceId || '',
          url: note.sourceUrl || '',
        });
        if (seq !== local.linksReqSeq || local.currentNote?.id !== note.id) return;

        const studioBtn = el('aex-studio-btn');
        const studioLabel = el('aex-studio-btn-label');
        if (studioBtn && res?.lesson?.id) {
          studioBtn.hidden = false;
          studioBtn.dataset.aexStudio = `/studio?id=${encodeURIComponent(res.lesson.id)}`;
          studioBtn.title = `Open synced Studio lesson (${res.lesson.sentencesCount} sentences · zero re-fetch)`;
          if (studioLabel) studioLabel.textContent = 'Open Lesson';
        }
      } catch {
        // Non-blocking sync enhancement
      }
    }

    function syncClipButtonsState() {
      document.querySelectorAll('#aex-items-list [data-aex-play-clip]').forEach((btn) => {
        const idx = Number(btn.dataset.aexPlayClip);
        const playing = Boolean(local.mediaPlayer?.isPlayingItem?.(idx));
        btn.classList.toggle('is-playing', playing);
        btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
        const playSvg = btn.querySelector('.aex-clip-ico-play');
        const pauseSvg = btn.querySelector('.aex-clip-ico-pause');
        if (playSvg) playSvg.toggleAttribute('hidden', playing);
        if (pauseSvg) pauseSvg.toggleAttribute('hidden', !playing);
      });
    }

    function renderLevelFilter(note) {
      const select = el('aex-note-level-filter');
      if (!select) return;
      const levels = Array.from(
        new Set((note.items || []).map((i) => i.cefr).filter(Boolean)),
      ).sort();
      if (levels.length <= 1) {
        select.hidden = true;
        select.value = 'all';
        local.filterLevel = 'all';
        return;
      }
      select.hidden = false;
      select.innerHTML = [
        '<option value="all">All CEFR</option>',
        ...levels.map((lv) => `<option value="${escapeHtml(lv)}">CEFR ${escapeHtml(lv)}</option>`),
      ].join('');
      select.value = levels.includes(local.filterLevel) ? local.filterLevel : 'all';
    }

    function renderCategoryFilters(note) {
      const wrap = el('aex-category-filters');
      if (!wrap) return;
      const counts = new Map();
      for (const item of note.items || []) {
        counts.set(item.category, (counts.get(item.category) || 0) + 1);
      }
      const categories = [
        { id: 'all', label: 'All', count: note.items?.length || 0 },
        ...Array.from(counts.entries()).map(([id, count]) => ({
          id,
          label: store.CATEGORY_LABELS[id] || id,
          count,
        })),
      ];
      wrap.innerHTML = categories
        .map(
          (cat) => `
          <button type="button" class="filter-pill${local.filterCategory === cat.id ? ' active' : ''}" data-aex-filter="${escapeHtml(
            cat.id,
          )}" aria-pressed="${local.filterCategory === cat.id ? 'true' : 'false'}">
            ${cat.id === 'all' ? '' : '<span class="aex-filter-dot" aria-hidden="true"></span>'}
            ${escapeHtml(cat.label)}
            <span class="aex-filter-count">${cat.count}</span>
          </button>`,
        )
        .join('');
      updateFilterRailFades();
      global.requestAnimationFrame?.(updateFilterRailFades);
    }

    function syncDetailRoute(replace = true) {
      if (!local.currentNote?.id || store.state.activeView !== 'detail') return;
      const extraQuery = {};
      if (local.page > 1) extraQuery.page = local.page;
      if (local.pageSize !== DEFAULT_PAGE_SIZE) extraQuery.limit = local.pageSize;
      global.FlaptapRouter?.updateSubroute?.('american-extractor', {
        subview: 'detail',
        noteId: local.currentNote.id,
        extraQuery,
        replace,
      });
    }

    function getFilteredItems(note, completedSet = store.completedIndexSet(note)) {
      const query = local.search.trim().toLowerCase();
      return (note?.items || []).filter((item) => {
        if (local.scopeRemaining && completedSet.has(Number(item.index))) return false;
        if (local.filterCategory !== 'all' && item.category !== local.filterCategory) return false;
        if (local.filterLevel !== 'all' && item.cefr !== local.filterLevel) return false;
        if (!query) return true;
        return [
          item.term,
          item.surface,
          item.meaning,
          item.localizedMeaning,
          item.contextSentence,
          item.contextTranslation,
          item.usageNote,
          item.spokenNote,
          item.example,
          item.exampleTranslation,
        ]
          .filter(Boolean)
          .some((val) => String(val).toLowerCase().includes(query));
      });
    }

    function renderItemSkeletons() {
      const count = Math.min(local.pageSize, 5);
      return Array.from({ length: count }, (_, idx) => `
          <div class="aex-item aex-item-skel ft-skeleton-item" style="--ft-stagger:${idx}" aria-hidden="true">
            <div class="aex-skel-bar aex-skel-bar--sm ft-skel-shimmer"></div>
            <div class="aex-skel-bar aex-skel-bar--title ft-skel-shimmer"></div>
            <div class="aex-skel-bar aex-skel-bar--body ft-skel-shimmer"></div>
          </div>`).join('');
    }

    function goToItemsPage(nextPage, { scrollToTop = true, syncRoute = true, shimmer = true } = {}) {
      const note = local.currentNote;
      if (!note) return;

      clearTimeout(local.pageTimer);
      const seq = ++local.pageSeq;
      local.page = Math.max(1, Math.floor(Number(nextPage) || 1));

      if (scrollToTop) {
        scrollToItemsStart({ force: true });
      }
      if (syncRoute) {
        syncDetailRoute(true);
      }

      const reduced = Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
      const list = el('aex-items-list');
      if (shimmer && !reduced && list) {
        list.setAttribute('aria-busy', 'true');
        list.classList.remove('ft-items-entering');
        list.innerHTML = renderItemSkeletons();
        pager.hide();
        local.pageTimer = setTimeout(() => {
          if (seq !== local.pageSeq || local.currentNote?.id !== note.id) return;
          renderItems(note, { animate: true });
        }, 190);
        return;
      }

      renderItems(note, { animate: true });
    }

    function renderItems(note, options = {}) {
      const list = el('aex-items-list');
      const empty = el('aex-empty-filter');
      if (!list) return;

      clearTimeout(local.pageTimer);
      list.removeAttribute('aria-busy');

      const completedSet = store.completedIndexSet(note);
      const filtered = getFilteredItems(note, completedSet);
      const totalPages = Math.max(1, Math.ceil(filtered.length / local.pageSize));
      const prevPage = local.page;
      local.page = Math.max(1, Math.min(totalPages, local.page));
      const start = (local.page - 1) * local.pageSize;
      const pageItems = filtered.slice(start, start + local.pageSize);

      list.innerHTML = pageItems
        .map((item, pos) => renderItemCard(note, item, pos, completedSet))
        .join('');

      if (options.animate && pageItems.length > 0) {
        P.triggerEntrance(list);
      } else {
        list.classList.remove('ft-items-entering');
      }

      if (empty) {
        empty.hidden = filtered.length > 0;
        if (filtered.length === 0) {
          const query = local.search.trim();
          const allStudied = local.scopeRemaining && !query && local.filterCategory === 'all' && (note.items || []).length > 0;
          setText('aex-empty-title', allStudied ? 'All phrases studied' : 'No matching phrases');
          setText(
            'aex-empty-copy',
            allStudied
              ? 'Turn off “Remaining only” to review the phrases you already mastered.'
              : 'Try another category, CEFR level, or clear your search.',
          );
        }
      }

      pager.render({
        page: local.page,
        pageSize: local.pageSize,
        total: filtered.length,
        totalPages,
        itemsCount: pageItems.length,
        loading: false,
        visible: Boolean(note),
      });

      if (local.page !== prevPage) {
        syncDetailRoute(true);
      }

      syncClearFiltersButton();
      bindItemsSelection(note);
    }

    function renderItemCard(note, item, position, completedSet) {
      const idx = Number(item.index);
      const completed = completedSet.has(idx);
      const saved = store.isTermSaved(item.term);
      const language = store.languageByCode(note.targetLanguage);
      const isEnglishTarget = (note.targetLanguage || 'en') === 'en';
      const rtl = Boolean(language?.rtl);
      const category = String(item.category || 'vocabulary');
      const categoryLabel = store.CATEGORY_LABELS[category] || category || 'Phrase';
      const registerValue = String(item.register || '').trim();
      const showRegister =
        registerValue &&
        registerValue.toLowerCase() !== 'neutral' &&
        registerValue.toLowerCase() !== 'spoken' &&
        registerValue.toLowerCase() !== categoryLabel.toLowerCase();

      const contextHtml = store.highlightTerm(item.contextSentence || '', item.term, item.surface);
      const decoratedContext = global.FlaptapWordLookup
        ? global.FlaptapWordLookup.tokenizeClickableWords(contextHtml, {
            contextSentence: item.contextSentence || '',
          })
        : contextHtml;

      const general =
        item.generalMeaning && item.generalMeaning !== item.meaning ? item.generalMeaning : '';

      const showTranslation = !isEnglishTarget && Boolean(item.localizedMeaning);
      const showContextTranslation =
        !isEnglishTarget &&
        Boolean(item.contextTranslation) &&
        item.contextTranslation !== item.contextSentence;
      const showExampleTranslation =
        !isEnglishTarget &&
        Boolean(item.exampleTranslation) &&
        item.exampleTranslation !== item.example;
      const isMasked = local.recallMode && !local.revealedIndices.has(idx);

      const copyBtn = global.FlaptapCopy?.buttonHtml
        ? global.FlaptapCopy.buttonHtml(item.term, {
            className: 'icon-action icon-action--sm aex-util-btn',
            label: `Copy ${item.term}`,
          })
        : '';

      const canPlayClip =
        Boolean(note.media?.hasAudio) &&
        Boolean(local.mediaPlayer?.hasPlayableMedia?.()) &&
        typeof item.startSec === 'number' &&
        typeof item.endSec === 'number' &&
        item.endSec > item.startSec;
      const clipTimeLabel = canPlayClip
        ? global.FlaptapA2PMediaPlayer?.formatTs?.(item.startSec) || '0:00'
        : '';
      const clipPlaying = canPlayClip && Boolean(local.mediaPlayer?.isPlayingItem?.(idx));
      const clipPlayBtn = canPlayClip
        ? `<button type="button" class="aex-clip-btn${clipPlaying ? ' is-playing' : ''}" data-aex-play-clip="${escapeHtml(
            idx,
          )}" aria-pressed="${clipPlaying ? 'true' : 'false'}" aria-label="Play original clip (${clipTimeLabel})" title="Play original audio segment (${clipTimeLabel}–${
            global.FlaptapA2PMediaPlayer?.formatTs?.(item.endSec) || clipTimeLabel
          })">
            <svg class="aex-clip-ico-play" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"${clipPlaying ? ' hidden' : ''}><path d="M7.5 4.8v14.4a.9.9 0 0 0 1.38.76l11.2-7.2a.9.9 0 0 0 0-1.52l-11.2-7.2a.9.9 0 0 0-1.38.76Z"></path></svg>
            <svg class="aex-clip-ico-pause" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"${clipPlaying ? '' : ' hidden'}><rect x="6" y="4.5" width="4" height="15" rx="1.2"></rect><rect x="14" y="4.5" width="4" height="15" rx="1.2"></rect></svg>
            <span class="ltr-num">${escapeHtml(clipTimeLabel)}</span>
          </button>`
        : '';

      const checkButton = global.FlaptapCheck
        ? global.FlaptapCheck.buttonHtml({
            checked: completed,
            className: 'aex-check-btn',
            attrs: `data-aex-check="${escapeHtml(idx)}"`,
            label: completed ? 'Completed' : 'Mark phrase studied',
          })
        : `<button type="button" class="item-check-btn aex-check-btn${
            completed ? ' is-checked' : ''
          }" data-aex-check="${escapeHtml(idx)}" aria-pressed="${
            completed ? 'true' : 'false'
          }" aria-label="${completed ? 'Completed' : 'Mark phrase studied'}" title="${
            completed ? 'Completed' : 'Mark phrase studied'
          }"><svg class="ft-check-svg chk-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path class="ft-check-tick chk-tick" d="M5.2 12.75 L9.55 17.1 Q10.1 17.65 10.65 17.05 L18.9 7.35" pathLength="1" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>`;

      // Row 1: Separate boxes for In Context + Example
      const row1Boxes = [
        item.contextSentence
          ? `<div class="aex-card-box aex-box-context">
               <span class="aex-sense-label">In context</span>
               <blockquote class="aex-context-quote">${decoratedContext}</blockquote>
               ${
                 showContextTranslation
                   ? `<p class="aex-quote-translation" dir="${rtl ? 'rtl' : 'ltr'}" lang="${escapeHtml(
                       note.targetLanguage || 'en',
                     )}">${escapeHtml(item.contextTranslation)}</p>`
                   : ''
               }
             </div>`
          : '',
        item.example
          ? `<div class="aex-card-box aex-box-example">
               <span class="aex-sense-label">Example</span>
               <p class="aex-example">“${escapeHtml(item.example)}”</p>
               ${
                 showExampleTranslation
                   ? `<p class="aex-quote-translation" dir="${rtl ? 'rtl' : 'ltr'}" lang="${escapeHtml(
                       note.targetLanguage || 'en',
                     )}">${escapeHtml(item.exampleTranslation)}</p>`
                   : ''
               }
             </div>`
          : '',
      ].filter(Boolean);

      // Row 2: Meaning + Usage + Spoken tip (all in one single balanced row -> strictly 2 rows total)
      const row2Boxes = [
        item.meaning
          ? `<div class="aex-card-box aex-box-meaning${isMasked ? ' is-masked' : ''}"${
              isMasked
                ? ` data-aex-reveal="${escapeHtml(idx)}" role="button" tabindex="0" aria-label="Reveal meaning for ${escapeHtml(
                    item.term,
                  )}"`
                : ''
            }>
               ${isMasked ? '<div class="aex-recall-veil"><span>Click to reveal meaning</span></div>' : ''}
               <span class="aex-sense-label">Meaning</span>
               <p class="aex-meaning">${escapeHtml(item.meaning)}</p>
               ${
                 general
                   ? `<p class="aex-general-sense"><span class="aex-inline-label">Broadly</span>${escapeHtml(
                       general,
                     )}</p>`
                   : ''
               }
             </div>`
          : '',
        item.usageNote
          ? `<div class="aex-card-box aex-box-usage">
               <span class="aex-sense-label">Usage</span>
               <p class="aex-note-copy">${escapeHtml(item.usageNote)}</p>
             </div>`
          : '',
        item.spokenNote
          ? `<div class="aex-card-box aex-box-spoken">
               <span class="aex-sense-label">Spoken tip</span>
               <p class="aex-note-copy">${escapeHtml(item.spokenNote)}</p>
             </div>`
          : '',
        !item.spokenNote && item.techNote
          ? `<div class="aex-card-box aex-box-usage">
               <span class="aex-sense-label">In US tech</span>
               <p class="aex-note-copy">${escapeHtml(item.techNote)}</p>
             </div>`
          : '',
      ].filter(Boolean);

      return `
        <article class="aex-item ft-item-surface${completed ? ' is-completed' : ''}${
          isMasked ? ' is-recall-masked' : ''
        }" data-aex-index="${escapeHtml(idx)}" data-category="${escapeHtml(
          category,
        )}" data-context="${escapeHtml(item.contextSentence || '')}" style="--ft-stagger:${Math.min(
          Number(position) || 0,
          12,
        )}">
          <div class="aex-item-head">
            <span class="aex-item-index ltr-num" aria-hidden="true"><span class="aex-index-hash">#</span>${
              idx + 1
            }</span>

            <div class="aex-item-heading">
              <!-- Line 1: English phrase + IPA + Category (+ CEFR / Register / Studied) -->
              <div class="aex-item-line-1">
                <h3 class="aex-item-term"><span class="aex-term-mark"><span class="aex-term-text">${escapeHtml(
                  item.term,
                )}</span></span></h3>
                ${item.ipa ? `<span class="aex-item-ipa" dir="ltr">${escapeHtml(item.ipa)}</span>` : ''}
                <span class="aex-item-cat">${escapeHtml(categoryLabel)}</span>
                ${item.cefr ? `<span class="aex-item-level ltr-num">${escapeHtml(item.cefr)}</span>` : ''}
                ${showRegister ? `<span class="aex-item-register">${escapeHtml(registerValue)}</span>` : ''}
                ${completed ? '<span class="aex-item-done-tag">Studied</span>' : ''}
              </div>

              <!-- Line 2: Localized / Arabic translation directly under the English phrase -->
              ${
                showTranslation
                  ? `<div class="aex-item-line-2${isMasked ? ' is-masked' : ''}"${
                      isMasked
                        ? ` data-aex-reveal="${escapeHtml(idx)}" role="button" tabindex="0" aria-label="Reveal translation for ${escapeHtml(
                            item.term,
                          )}"`
                        : ''
                    }>
                      <p class="aex-localized aex-head-translation" dir="${rtl ? 'rtl' : 'ltr'}" lang="${escapeHtml(
                        note.targetLanguage || 'en',
                      )}">${escapeHtml(item.localizedMeaning)}</p>
                      ${
                        isMasked
                          ? '<span class="aex-recall-inline-hint">Click to reveal</span>'
                          : ''
                      }
                    </div>`
                  : ''
              }
            </div>

            <div class="aex-item-actions">
              <div class="aex-action-utils">
                ${clipPlayBtn}
                <button type="button" class="icon-action icon-action--sm aex-util-btn" data-aex-speak="${escapeHtml(
                  item.term,
                )}" aria-label="Pronounce ${escapeHtml(item.term)} (TTS)" title="Pronounce (TTS)">
                  ${icon('volume-2')}
                </button>
                ${copyBtn}
                <button type="button" class="icon-action icon-action--sm aex-util-btn${
                  saved ? ' is-saved' : ''
                }" data-aex-save-index="${escapeHtml(idx)}" aria-label="${
                  saved ? 'Saved in Vocabulary' : 'Save to Vocabulary'
                }" title="${saved ? 'Saved in Vocabulary' : 'Save to Vocabulary'}">
                  ${icon(saved ? 'bookmark-check' : 'bookmark-plus')}
                </button>
                <button type="button" class="icon-action icon-action--sm is-danger aex-util-btn" data-aex-delete-phrase="${escapeHtml(
                  idx,
                )}" aria-label="Remove ${escapeHtml(item.term)}" title="Remove phrase from guide">
                  ${icon('trash')}
                </button>
              </div>
              <span class="aex-action-divider" aria-hidden="true"></span>
              ${checkButton}
            </div>
          </div>

          ${
            row1Boxes.length || row2Boxes.length
              ? `<div class="aex-item-body">
                  ${
                    row1Boxes.length
                      ? `<div class="aex-box-row aex-row-quotes" data-cols="${row1Boxes.length}">${row1Boxes.join(
                          '',
                        )}</div>`
                      : ''
                  }
                  ${
                    row2Boxes.length
                      ? `<div class="aex-box-row aex-row-insights" data-cols="${row2Boxes.length}">${row2Boxes.join(
                          '',
                        )}</div>`
                      : ''
                  }
                </div>`
              : ''
          }
        </article>
      `;
    }

    function renderSourceReader(note) {
      const container = el('aex-source-content');
      if (!container) return;
      const text = String(note.sourceText || '').trim();
      container.innerHTML = global.FlaptapWordLookup
        ? global.FlaptapWordLookup.tokenizeClickableWords(escapeHtml(text), {})
        : escapeHtml(text);

      const teardown = global.FlaptapWordLookup?.bindSelectionLookup?.(container, {
        maxLength: 320,
        onSelect: (selectedText, meta) => {
          const context = sentenceAroundRange(meta.range, container) || selectedText;
          openLookup(selectedText, context, null);
        },
      });
      if (teardown) local.teardowns.push(teardown);
    }

    function renderSourceMeta(note) {
      const container = el('aex-source-meta');
      if (!container) return;
      const language = store.languageByCode(note.targetLanguage);
      const meta = note.sourceMeta || {};
      const opts = meta.extractionOptions || {};
      const rows = [
        ['Source type', store.SOURCE_TYPE_LABELS[note.sourceType] || note.sourceType],
        ['Pipeline', note.sourceLabel || '—'],
        ['Meaning language', language ? `${language.name} (${language.native})` : note.targetLanguage],
        ['Extract type', opts.extractionTypeLabel || ''],
        ['English style', opts.styleLabel || ''],
        ['Target level', opts.levelLabel || ''],
        ['Topic focus', opts.focusLabel || ''],
        ['Depth', opts.depthLabel || ''],
        ['Study goal', opts.studyGoalLabel || ''],
        ['Order', opts.orderLabel || ''],
        ['Source words', meta.wordCount ? Number(meta.wordCount).toLocaleString() : '—'],
        ['Sections analyzed', meta.chunkCount > 1 ? String(meta.chunkCount) : ''],
        ['Duration', meta.durationSeconds ? store.formatDuration(meta.durationSeconds) : ''],
        ['Platform', meta.platform || ''],
        ['Engine', meta.engine || meta.ocrModel || ''],
        ['Model', note.modelUsed || ''],
      ].filter(([, val]) => Boolean(val));

      const warnings = Array.isArray(meta.warnings) ? meta.warnings.filter(Boolean) : [];
      const warningHtml = warnings.length
        ? `<div class="aex-source-warning">${warnings.map((w) => `<p>${escapeHtml(w)}</p>`).join('')}</div>`
        : '';

      container.innerHTML = `
        ${rows
          .map(
            ([k, v]) => `
          <div class="aex-source-meta-row">
            <span class="aex-source-meta-key">${escapeHtml(k)}</span>
            <span class="aex-source-meta-value">${escapeHtml(v)}</span>
          </div>`,
          )
          .join('')}
        ${warningHtml}
      `;
    }

    function renderNoteProgress(note) {
      const stats = store.noteStudyState(note);
      const completedSet = store.completedIndexSet(note);
      const items = Array.isArray(note?.items) ? note.items : [];

      // Instant-glance whole-page state on header card & top 4px progress rim
      const noteCard = el('aex-note-card');
      const readyWrap = el('aex-detail-ready');
      if (noteCard) noteCard.dataset.guideState = stats.tone;
      if (readyWrap) readyWrap.dataset.guideState = stats.tone;

      const topFill = el('aex-guide-top-fill');
      if (topFill) {
        topFill.style.width = `${stats.tone === 'done' ? 100 : stats.pct}%`;
      }

      const dock = el('aex-sticky-dock');
      const progressRow = el('aex-note-progress-row');
      if (dock) dock.hidden = stats.total === 0;
      if (progressRow) progressRow.hidden = stats.total === 0;

      const bar = el('aex-note-progress');
      if (bar) {
        bar.hidden = stats.total === 0;
        bar.classList.toggle('is-all-done', stats.tone === 'done');

        if (global.FlaptapStudyDock?.renderProgressDeckHtml) {
          bar.innerHTML = global.FlaptapStudyDock.renderProgressDeckHtml({
            total: stats.total,
            done: stats.done,
            singular: 'phrase',
            plural: 'phrases',
            doneHeadline: 'Guide completed',
            readyHeadline: 'Ready to study',
            pipAttr: 'data-aex-jump-index',
            pips: items.map((item) => ({
              id: Number(item.index),
              displayNumber: Number(item.index) + 1,
              label: item.term,
              done: completedSet.has(Number(item.index)),
            })),
          });
        }
      }

      const scopeBtn = el('aex-note-scope');
      if (scopeBtn) {
        scopeBtn.hidden = stats.total === 0;
        scopeBtn.classList.toggle('is-active', local.scopeRemaining);
        scopeBtn.setAttribute('aria-pressed', local.scopeRemaining ? 'true' : 'false');
      }
      setText('aex-study-count', String(stats.remaining));

      const recallBtn = el('aex-recall-toggle');
      if (recallBtn) {
        recallBtn.hidden = stats.total === 0;
        recallBtn.classList.toggle('is-active', local.recallMode);
        recallBtn.setAttribute('aria-pressed', local.recallMode ? 'true' : 'false');
      }

      const derivedCompleted = stats.tone === 'done';
      note.isCompleted = derivedCompleted;
      store.updateCachedNoteMeta(note.id, {
        completedCount: stats.done,
        isCompleted: derivedCompleted,
      });
      syncClearFiltersButton();
      global.requestAnimationFrame?.(syncStickyMetrics);
    }

    /* --------------------------------------------------------------------
       STUDY ACTIONS (RENAME, COMPLETION, RECALL, SAVE, COPY, EXPORT, LOOKUP)
       -------------------------------------------------------------------- */

    function setSourcePanelOpen(open) {
      const panel = el('aex-source-panel');
      const toggle = el('aex-source-toggle');
      if (!panel) return;
      panel.hidden = !open;
      if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function setSourceInfoOpen(open) {
      const pop = el('aex-source-meta');
      const toggle = el('aex-info-toggle');
      if (!pop) return;
      pop.hidden = !open;
      if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function teardownBindings() {
      for (const fn of local.teardowns) {
        try {
          fn();
        } catch {}
      }
      local.teardowns = [];
      if (typeof local.itemsTeardown === 'function') {
        try {
          local.itemsTeardown();
        } catch {}
        local.itemsTeardown = null;
      }
    }

    function bindItemsSelection(note) {
      const list = el('aex-items-list');
      if (!list || !global.FlaptapWordLookup?.bindSelectionLookup) return;
      if (typeof local.itemsTeardown === 'function') {
        try {
          local.itemsTeardown();
        } catch {}
        local.itemsTeardown = null;
      }
      const teardown = global.FlaptapWordLookup.bindSelectionLookup(list, {
        maxLength: 320,
        onSelect: (text, meta) => {
          const itemEl = meta.range.commonAncestorContainer?.parentElement?.closest?.('.aex-item');
          const context = itemEl?.dataset?.context || text;
          openLookup(text, context, null);
        },
      });
      local.itemsTeardown = typeof teardown === 'function' ? teardown : null;
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

        return full.slice(left, right).replace(/\s+/g, ' ').trim().slice(0, 500);
      } catch {
        return '';
      }
    }

    async function openLookup(word, contextSentence, sourceEl) {
      if (!word || !global.FlaptapWordLookup) return;
      const note = local.currentNote;
      const language = el('aex-note-lang-select')?.value || store.getPreferredLanguage();
      store.setPreferredLanguage(language);

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
        fetcher: api.apiFetch,
        canPlay: false,
        canSpeak: true,
        canSave: true,
        isSaved: (term) => store.isTermSaved(term),
        onSave: async (lookup) => {
          if (!store.currentUser()) {
            requireNoteAuth();
            return;
          }
          try {
            await api.saveVocabularyItem({
              term: lookup.term,
              ipa: lookup.ipa,
              partOfSpeech: lookup.partOfSpeech,
              definition: lookup.definition,
              generalTranslation: lookup.generalTranslation || '',
              translation: lookup.translation || '',
              contextSentence: lookup.contextSentence,
              lessonTitle: note?.title || 'Anything to Phrases',
            });
            store.rememberSaved(lookup.term);
            await ws()?.refreshVocabulary?.();
            updateSaveButtons();
            global.FlaptapWordLookup.syncSavedButtonDom();
            showToast(`Saved “${lookup.term}” to Vocabulary`);
          } catch (err) {
            showToast(err?.message || 'Could not save that phrase.');
          }
        },
      });
    }

    function updateSaveButtons() {
      document.querySelectorAll('#aex-view-note [data-aex-save-index]').forEach((btn) => {
        const idx = Number(btn.dataset.aexSaveIndex);
        const item = local.currentNote?.items?.find((e) => Number(e.index) === idx);
        if (!item) return;
        const saved = store.isTermSaved(item.term);
        btn.classList.toggle('is-saved', saved);
        btn.innerHTML = icon(saved ? 'bookmark-check' : 'bookmark-plus');
        const label = saved ? 'Saved in Vocabulary' : 'Save to Vocabulary';
        btn.setAttribute('aria-label', label);
        btn.title = label;
      });
      global.FlaptapWordLookup?.syncSavedButtonDom?.();
    }

    async function saveItem(index) {
      const note = local.currentNote;
      const item = note?.items?.find((e) => Number(e.index) === Number(index));
      if (!item) return;
      if (!store.currentUser()) {
        requireNoteAuth();
        return;
      }
      if (store.isTermSaved(item.term)) {
        showToast('Already saved in your Vocabulary Vault.');
        return;
      }
      try {
        await api.saveVocabularyItem({
          term: item.term,
          ipa: item.ipa,
          partOfSpeech: store.CATEGORY_LABELS[item.category] || '',
          definition: item.meaning,
          generalTranslation: item.generalMeaning || '',
          translation: item.localizedMeaning || '',
          contextSentence: item.contextSentence || '',
          lessonTitle: note.title || 'Anything to Phrases',
        });
        store.rememberSaved(item.term);
        await ws()?.refreshVocabulary?.();
        updateSaveButtons();
        showToast(`Saved “${item.term}” to Vocabulary`);
      } catch (err) {
        showToast(err?.message || 'Could not save that phrase.');
      }
    }

    async function saveAllItems() {
      const note = local.currentNote;
      if (!note) return;
      if (!store.currentUser()) {
        requireNoteAuth();
        return;
      }
      const pending = (note.items || []).filter((item) => !store.isTermSaved(item.term));
      if (pending.length === 0) {
        showToast('Every phrase in this guide is already saved.');
        return;
      }

      const btn = el('aex-save-all-btn');
      const original = btn?.innerHTML;
      if (btn) {
        btn.disabled = true;
        btn.textContent = `Saving ${pending.length}…`;
      }
      let saved = 0;
      for (const item of pending) {
        try {
          await api.saveVocabularyItem({
            term: item.term,
            ipa: item.ipa,
            partOfSpeech: store.CATEGORY_LABELS[item.category] || '',
            definition: item.meaning,
            generalTranslation: item.generalMeaning || '',
            translation: item.localizedMeaning || '',
            contextSentence: item.contextSentence || '',
            lessonTitle: note.title || 'Anything to Phrases',
          });
          store.rememberSaved(item.term);
          saved++;
        } catch {}
      }
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = original;
      }
      await ws()?.refreshVocabulary?.();
      updateSaveButtons();
      showToast(`Saved ${saved} of ${pending.length} phrases to Vocabulary`);
    }

    function applyCardCompletionDom(sourceButton, completed, animate) {
      const card = sourceButton?.closest('.aex-item');
      card?.classList.toggle('is-completed', completed);
      const line1 = card?.querySelector('.aex-item-line-1');
      const existingTag = line1?.querySelector('.aex-item-done-tag');
      if (completed && line1 && !existingTag) {
        const tag = document.createElement('span');
        tag.className = 'aex-item-done-tag';
        tag.textContent = 'Studied';
        line1.appendChild(tag);
      } else if (!completed && existingTag) {
        existingTag.remove();
      }
      if (!sourceButton) return;
      const label = completed ? 'Completed' : 'Mark phrase studied';
      if (global.FlaptapCheck?.setState) {
        global.FlaptapCheck.setState(sourceButton, completed, { label, animate });
      } else if (ws()?.setCheckButtonState) {
        ws().setCheckButtonState(sourceButton, completed);
      } else {
        sourceButton.classList.toggle('is-checked', completed);
        sourceButton.setAttribute('aria-pressed', completed ? 'true' : 'false');
      }
    }

    async function toggleItemCompletion(index, sourceButton) {
      const note = local.currentNote;
      if (!note) return;
      const idx = Number(index);
      const current = store.completedIndexSet(note);
      const total = Array.isArray(note.items) ? note.items.length : 0;
      const wasAllDone = total > 0 && current.size >= total;
      const next = !current.has(idx);

      // Optimistic tactile update so the Apple spring + white tick draw plays instantaneously
      applyCardCompletionDom(sourceButton, next, true);

      try {
        const res = await api.setItemCompletion(note.id, idx, next);
        note.completionProgress = res.completionProgress || note.completionProgress;
        const nowAllDone =
          typeof res.isCompleted === 'boolean'
            ? res.isCompleted
            : total > 0 && store.completedIndexSet(note).size >= total;
        note.isCompleted = nowAllDone;

        if (!wasAllDone && nowAllDone) {
          if (global.FlaptapCelebrate?.trigger) {
            global.FlaptapCelebrate.trigger({
              title: 'Study Guide Completed!',
              subtitle: total > 0 ? `All ${total} phrase${total === 1 ? '' : 's'} studied` : 'Every phrase studied',
              originEl: sourceButton,
            });
          } else {
            showToast('Every phrase studied — study guide completed!');
          }
        }

        if (local.scopeRemaining) {
          renderItems(note);
        }
        renderNoteProgress(note);
      } catch (err) {
        applyCardCompletionDom(sourceButton, !next, false);
        showToast(err?.message || 'Could not update progress.');
      }
    }

    async function submitRename(rawTitle) {
      const note = local.currentNote;
      if (!note) return;
      const title = String(rawTitle || '').trim();
      if (!title) {
        showToast('Title cannot be empty.');
        return;
      }
      try {
        const res = await api.renameNote(note.id, title);
        note.title = res.title || title;
        local.renaming = false;
        renderTitleArea(note);
        store.updateCachedNoteMeta(note.id, { title: note.title });
        showToast('Guide renamed.');
      } catch (err) {
        showToast(err?.message || 'Could not rename guide.');
      }
    }

    function buildMarkdown(note) {
      const language = store.languageByCode(note.targetLanguage);
      const lines = [
        `# ${note.title}`,
        '',
        `Source: ${note.sourceLabel || store.SOURCE_TYPE_LABELS[note.sourceType] || ''}`,
        note.sourceUrl ? `URL: ${note.sourceUrl}` : '',
        note.creator ? `Creator: ${note.creator}` : '',
        `Meaning language: ${language?.name || note.targetLanguage}`,
        '',
        note.summary ? `## Takeaway\n${note.summary}` : '',
        '',
        '## American English Phrases',
        '',
      ].filter(Boolean);

      for (const item of note.items || []) {
        lines.push(
          `### ${Number(item.index) + 1}. ${item.term}${item.ipa ? ` ${item.ipa}` : ''}${
            item.cefr ? ` (${item.cefr})` : ''
          }`,
          `- Category: ${store.CATEGORY_LABELS[item.category] || item.category}${
            item.register && item.register !== 'neutral' ? ` (${item.register})` : ''
          }`,
          `- Meaning: ${item.meaning}`,
        );
        if (item.localizedMeaning && item.localizedMeaning !== item.meaning) {
          lines.push(`- Translation: ${item.localizedMeaning}`);
        }
        if (item.contextSentence) {
          lines.push(`- From source: "${item.contextSentence}"`);
          if (item.contextTranslation && item.contextTranslation !== item.contextSentence) {
            lines.push(`  - Translation: ${item.contextTranslation}`);
          }
        }
        if (item.usageNote) lines.push(`- Usage: ${item.usageNote}`);
        if (item.spokenNote) lines.push(`- Pronunciation: ${item.spokenNote}`);
        if (item.example) {
          lines.push(`- Example: ${item.example}`);
          if (item.exampleTranslation && item.exampleTranslation !== item.example) {
            lines.push(`  - Translation: ${item.exampleTranslation}`);
          }
        }
        lines.push('');
      }
      return lines.join('\n');
    }

    async function copyStudyNotes() {
      const note = local.currentNote;
      if (!note) return;
      const content = buildMarkdown(note);
      const ok = global.FlaptapCopy?.writeClipboard
        ? await global.FlaptapCopy.writeClipboard(content)
        : false;
      if (ok) {
        showToast('Study notes copied to clipboard');
      } else {
        try {
          await navigator.clipboard.writeText(content);
          showToast('Study notes copied to clipboard');
        } catch {
          showToast('Could not copy to clipboard.');
        }
      }
    }

    function exportMarkdown() {
      const note = local.currentNote;
      if (!note) return;
      const content = buildMarkdown(note);
      const slug = String(note.title || 'study-guide')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug || 'anything-to-phrases'}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Exported Markdown study guide');
    }

    /* --------------------------------------------------------------------
       EVENTS & LIFECYCLE
       -------------------------------------------------------------------- */

    function bindEvents() {
      const root = el('aex-view-note');
      if (!root) return;

      el('aex-back-to-library')?.addEventListener('click', () => nav.goToLibrary());
      el('aex-detail-back-err')?.addEventListener('click', () => nav.goToLibrary());
      el('aex-detail-retry-err')?.addEventListener('click', () => {
        if (local.currentNote?.id) loadNote(local.currentNote.id, { forceFetch: true });
        else nav.goToLibrary();
      });

      el('aex-new-btn')?.addEventListener('click', () => nav.goToExtract({ focusInput: true }));
      el('aex-copy-btn')?.addEventListener('click', copyStudyNotes);
      el('aex-export-btn')?.addEventListener('click', exportMarkdown);
      el('aex-save-all-btn')?.addEventListener('click', saveAllItems);

      el('aex-detail-reset-progress-btn')?.addEventListener('click', async () => {
        const note = local.currentNote;
        if (!note || !global.FlaptapConfirm?.confirmAction) return;
        await global.FlaptapConfirm.confirmAction({
          title: 'Reset study guide progress?',
          message: 'Clears all studied phrase checkmarks for this guide.',
          detail: note.title || '',
          confirmLabel: 'Reset Progress',
          tone: 'primary',
          onConfirm: async () => {
            const res = await api.resetNoteProgress(note.id);
            note.completionProgress = res.completionProgress || {};
            note.isCompleted = false;
            store.cacheNote(note);
            store.updateCachedNoteMeta(note.id, { isCompleted: false, completedCount: 0 });
            renderNoteProgress(note);
            renderItems(note);
            showToast('Guide progress reset.');
          },
          onError: (err) => {
            showToast(err?.message || 'Could not reset guide progress.');
          },
        });
      });

      el('aex-detail-delete-btn')?.addEventListener('click', async () => {
        const note = local.currentNote;
        if (!note || !global.FlaptapConfirm?.confirmAction) return;
        await global.FlaptapConfirm.confirmAction({
          title: 'Delete study guide permanently?',
          message: 'Removes this study guide, its phrases, and any orphaned source caches.',
          detail: note.title || '',
          confirmLabel: 'Delete Guide',
          tone: 'danger',
          onConfirm: async () => {
            await api.deleteNote(note.id);
            store.removeNoteFromCache(note.id);
            clearCurrent();
            showToast('Study guide deleted.');
            nav.goToLibrary({ replace: true });
          },
          onError: (err) => {
            showToast(err?.message || 'Could not delete study guide.');
          },
        });
      });

      el('aex-reextract-btn')?.addEventListener('click', () => {
        if (local.currentNote) nav.reextractNote(local.currentNote);
      });

      el('aex-open-source-btn')?.addEventListener('click', () => {
        const url = local.currentNote?.sourceUrl;
        if (url && /^https?:\/\//i.test(url)) {
          global.open(url, '_blank', 'noopener,noreferrer');
        }
      });

      el('aex-studio-btn')?.addEventListener('click', (e) => {
        const target = e.currentTarget?.dataset?.aexStudio;
        if (target) global.location.href = target;
      });

      el('aex-note-lang-select')?.addEventListener('change', (e) => {
        store.setPreferredLanguage(e.target.value);
      });

      el('aex-source-toggle')?.addEventListener('click', () => {
        const panel = el('aex-source-panel');
        if (panel) setSourcePanelOpen(panel.hidden);
      });
      el('aex-source-close')?.addEventListener('click', () => setSourcePanelOpen(false));

      el('aex-info-toggle')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const pop = el('aex-source-meta');
        if (pop) setSourceInfoOpen(pop.hidden);
      });

      document.addEventListener('click', (e) => {
        const pop = el('aex-source-meta');
        if (!pop || pop.hidden) return;
        if (pop.contains(e.target) || e.target.closest?.('#aex-info-toggle')) return;
        setSourceInfoOpen(false);
      });

      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (local.renaming && local.currentNote) {
          local.renaming = false;
          renderTitleArea(local.currentNote);
          return;
        }
        const pop = el('aex-source-meta');
        if (pop && !pop.hidden) {
          setSourceInfoOpen(false);
          return;
        }
        const panel = el('aex-source-panel');
        if (panel && !panel.hidden) setSourcePanelOpen(false);
      });

      el('aex-note-scope')?.addEventListener('click', () => {
        local.scopeRemaining = !local.scopeRemaining;
        local.page = 1;
        if (local.currentNote) {
          renderNoteProgress(local.currentNote);
          renderItems(local.currentNote, { animate: true });
          syncDetailRoute(true);
          scrollToItemsStart({ onlyIfStuck: true, force: true });
        }
      });

      el('aex-recall-toggle')?.addEventListener('click', () => {
        local.recallMode = !local.recallMode;
        local.revealedIndices.clear();
        if (local.currentNote) {
          renderNoteProgress(local.currentNote);
          renderItems(local.currentNote);
        }
        showToast(
          local.recallMode
            ? 'Recall mode on — click any card to reveal meaning'
            : 'Recall mode off',
        );
      });

      el('aex-note-level-filter')?.addEventListener('change', (e) => {
        local.filterLevel = e.target.value || 'all';
        local.page = 1;
        if (local.currentNote) {
          renderItems(local.currentNote, { animate: true });
          syncDetailRoute(true);
          scrollToItemsStart({ onlyIfStuck: true, force: true });
        }
      });

      el('aex-note-search')?.addEventListener('input', (e) => {
        local.search = String(e.target.value || '');
        local.page = 1;
        if (local.currentNote) {
          renderItems(local.currentNote);
          syncDetailRoute(true);
        }
      });

      el('aex-clear-filters-btn')?.addEventListener('click', () => {
        local.filterCategory = 'all';
        local.filterLevel = 'all';
        local.scopeRemaining = false;
        local.search = '';
        local.page = 1;
        const searchInput = el('aex-note-search');
        if (searchInput) searchInput.value = '';
        const levelSelect = el('aex-note-level-filter');
        if (levelSelect) levelSelect.value = 'all';
        if (local.currentNote) {
          renderNoteProgress(local.currentNote);
          renderCategoryFilters(local.currentNote);
          renderItems(local.currentNote, { animate: true });
          syncDetailRoute(true);
          scrollToItemsStart({ onlyIfStuck: true, force: true });
        } else {
          syncClearFiltersButton();
        }
      });

      el('aex-category-filters')?.addEventListener('scroll', updateFilterRailFades, {
        passive: true,
      });

      const scrollCategoryRail = (direction) => {
        const rail = el('aex-category-filters');
        if (!rail) return;
        const isRtl = global.getComputedStyle?.(rail)?.direction === 'rtl';
        const delta = (isRtl ? -direction : direction) * 220;
        const reduced = Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
        rail.scrollBy({
          left: delta,
          behavior: reduced ? 'instant' : 'smooth',
        });
        setTimeout(updateFilterRailFades, 180);
      };

      el('aex-filter-scroll-left')?.addEventListener('click', () => scrollCategoryRail(-1));
      el('aex-filter-scroll-right')?.addEventListener('click', () => scrollCategoryRail(1));

      if (typeof global.ResizeObserver === 'function') {
        const ro = new global.ResizeObserver(() => {
          updateFilterRailFades();
          const prevOffset = local.stickyTopOffset;
          const nextOffset = syncStickyMetrics();
          if (nextOffset !== prevOffset && local.currentNote && !el('aex-detail-ready')?.hidden) {
            setupStickyDock();
          }
          updateStickyState();
        });
        const topbar = document.querySelector('.workspace-topbar');
        const dock = el('aex-sticky-dock');
        const railWrap = el('aex-filter-rail-wrap');
        if (topbar) ro.observe(topbar);
        if (dock) ro.observe(dock);
        if (railWrap) ro.observe(railWrap);
        local.stickyResizeObserver = ro;
      }

      global.addEventListener('scroll', scheduleStickyUpdate, { passive: true });

      pager.bind({
        onPageChange: (nextPage) => {
          goToItemsPage(nextPage, { scrollToTop: true, syncRoute: true, shimmer: true });
        },
        onPageSizeChange: (nextSize) => {
          local.pageSize = nextSize;
          goToItemsPage(1, { scrollToTop: true, syncRoute: true, shimmer: true });
        },
      });

      root.addEventListener('click', (e) => {
        if (e.target.closest('#aex-detail-rename-btn')) {
          if (local.currentNote) {
            local.renaming = true;
            renderTitleArea(local.currentNote);
          }
          return;
        }

        if (e.target.closest('#aex-detail-rename-cancel')) {
          if (local.currentNote) {
            local.renaming = false;
            renderTitleArea(local.currentNote);
          }
          return;
        }

        const revealEl = e.target.closest('[data-aex-reveal]');
        if (revealEl && local.currentNote) {
          const idx = Number(revealEl.dataset.aexReveal);
          local.revealedIndices.add(idx);
          const card = revealEl.closest('.aex-item');
          card?.classList.remove('is-recall-masked');
          card?.querySelectorAll('[data-aex-reveal]').forEach((masked) => {
            masked.classList.remove('is-masked');
            masked.removeAttribute('data-aex-reveal');
            masked.removeAttribute('role');
            masked.removeAttribute('tabindex');
            masked.querySelector('.aex-recall-veil')?.remove();
            masked.querySelector('.aex-recall-inline-hint')?.remove();
          });
          return;
        }

        const filterBtn = e.target.closest('[data-aex-filter]');
        if (filterBtn) {
          local.filterCategory = filterBtn.dataset.aexFilter || 'all';
          local.page = 1;
          if (local.currentNote) {
            renderCategoryFilters(local.currentNote);
            const activePill = document.querySelector(
              `#aex-category-filters [data-aex-filter="${CSS.escape(local.filterCategory)}"]`,
            );
            centerFilterPillHorizontally(activePill);
            renderItems(local.currentNote, { animate: true });
            syncDetailRoute(true);
            scrollToItemsStart({ onlyIfStuck: true, force: true });
          }
          return;
        }

        const jumpPip = e.target.closest('[data-aex-jump-index]');
        if (jumpPip) {
          const targetIdx = jumpPip.dataset.aexJumpIndex;
          let targetCard = document.querySelector(`#aex-items-list .aex-item[data-aex-index="${CSS.escape(targetIdx)}"]`);
          if (!targetCard && local.currentNote) {
            const filtered = getFilteredItems(local.currentNote);
            const filteredPos = filtered.findIndex((item) => String(item.index) === String(targetIdx));
            if (filteredPos >= 0) {
              const targetPage = Math.floor(filteredPos / local.pageSize) + 1;
              if (targetPage !== local.page) {
                local.page = targetPage;
                renderItems(local.currentNote, { animate: false });
                syncDetailRoute(true);
                targetCard = document.querySelector(`#aex-items-list .aex-item[data-aex-index="${CSS.escape(targetIdx)}"]`);
              }
            }
          }
          if (targetCard) {
            scrollCardIntoViewBelowDock(targetCard);
            targetCard.classList.remove('is-jump-highlight');
            void targetCard.offsetWidth;
            targetCard.classList.add('is-jump-highlight');
            setTimeout(() => targetCard.classList.remove('is-jump-highlight'), 1100);
          } else if (local.scopeRemaining) {
            showToast('Turn off “Remaining only” to view studied phrases.');
          }
          return;
        }

        const checkBtn = e.target.closest('[data-aex-check]');
        if (checkBtn) {
          e.preventDefault();
          toggleItemCompletion(checkBtn.dataset.aexCheck, checkBtn);
          return;
        }

        const saveBtn = e.target.closest('[data-aex-save-index]');
        if (saveBtn) {
          e.preventDefault();
          saveItem(saveBtn.dataset.aexSaveIndex);
          return;
        }

        const delPhraseBtn = e.target.closest('[data-aex-delete-phrase]');
        if (delPhraseBtn && local.currentNote) {
          e.preventDefault();
          const idx = Number(delPhraseBtn.dataset.aexDeletePhrase);
          const item = (local.currentNote.items || []).find((it) => Number(it.index) === idx);
          global.FlaptapConfirm?.confirmAction?.({
            title: 'Remove phrase from study guide?',
            message: 'Removes this phrase and re-calculates guide completion automatically.',
            detail: item?.term || '',
            confirmLabel: 'Remove Phrase',
            tone: 'danger',
            onConfirm: async () => {
              const res = await api.deleteNoteItem(local.currentNote.id, idx);
              if (res?.note) {
                local.currentNote = res.note;
                store.cacheNote(res.note);
                renderNoteProgress(res.note);
                renderCategoryFilters(res.note);
                renderItems(res.note);
                const countEl = el('aex-note-count');
                if (countEl) {
                  const len = Array.isArray(res.note.items) ? res.note.items.length : 0;
                  countEl.textContent = `${len} phrase${len === 1 ? '' : 's'}`;
                }
                showToast('Phrase removed from guide.');
              }
            },
            onError: (err) => {
              showToast(err?.message || 'Could not remove phrase.');
            },
          });
          return;
        }

        const clipBtn = e.target.closest('[data-aex-play-clip]');
        if (clipBtn && local.currentNote && local.mediaPlayer) {
          e.preventDefault();
          const idx = Number(clipBtn.dataset.aexPlayClip);
          const item = (local.currentNote.items || []).find((it) => Number(it.index) === idx);
          if (item && typeof item.startSec === 'number' && typeof item.endSec === 'number') {
            local.mediaPlayer.playClip({
              index: idx,
              term: item.term,
              startSec: item.startSec,
              endSec: item.endSec,
            });
          }
          return;
        }

        const speakBtn = e.target.closest('[data-aex-speak]');
        if (speakBtn) {
          e.preventDefault();
          local.mediaPlayer?.pause?.();
          global.FlaptapWordLookup?.speakText?.(speakBtn.dataset.aexSpeak);
        }
      });

      root.addEventListener('keydown', (e) => {
        const revealEl = e.target.closest?.('[data-aex-reveal]');
        if (revealEl && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          revealEl.click();
        }
      });

      root.addEventListener('submit', (e) => {
        const form = e.target.closest('#aex-detail-rename-form');
        if (!form) return;
        e.preventDefault();
        submitRename(el('aex-detail-rename-input')?.value || '');
      });
    }

    function mount() {
      if (local.mounted) return;
      local.mounted = true;
      bindEvents();
      scrollRestorer.bindLifecycle();

      local.unsubs.push(
        store.subscribe('note:deleted', ({ id }) => {
          if (local.currentNote?.id === id) {
            local.currentNote = null;
            teardownBindings();
          }
        }),
      );
    }

    function onDeactivate() {
      setSourceInfoOpen(false);
      local.mediaPlayer?.pause?.();
      disconnectStickyDock();
    }

    function clearCurrent() {
      clearTimeout(local.pageTimer);
      local.currentNote = null;
      disconnectStickyDock();
      pager.hide();
      local.mediaPlayer?.destroy?.();
      teardownBindings();
    }

    return {
      mount,
      openNote: loadNote,
      onDeactivate,
      onLanguagesLoaded: populateLanguageSelect,
      syncVocabularyState: updateSaveButtons,
      clearCurrent,
      getCurrentNote: () => local.currentNote,
    };
  }

  global.FlaptapA2PDetailPage = { create };
})(window);
