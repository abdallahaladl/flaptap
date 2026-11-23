/* ==========================================================================
   FLAPTAP — SHARED PAGINATION, SKELETON TIMING & ANIMATED SCROLLING (pagination-ui.js)
   Single reusable UI mechanism shared across Learning Library and
   Anything to Phrases (Zero duplicated pagination, skeleton, or scroll code).
   ========================================================================== */

(function (global) {
  'use strict';

  const DEFAULT_PAGE_SIZE = 10;

  function escapeHtml(value) {
    if (typeof global.FlaptapUtils?.escapeHtml === 'function') {
      return global.FlaptapUtils.escapeHtml(value);
    }
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function prefersReducedMotion() {
    return Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  }

  /**
   * Builds a compact page-number sequence with left/right ellipses when > 7 pages.
   */
  function buildRange(currentPage, totalPages) {
    const total = Math.max(1, Math.floor(Number(totalPages) || 1));
    const current = Math.max(1, Math.min(total, Math.floor(Number(currentPage) || 1)));
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    if (start > 2) pages.push('ellipsis-left');
    for (let p = start; p <= end; p += 1) {
      pages.push(p);
    }
    if (end < total - 1) pages.push('ellipsis-right');
    pages.push(total);
    return pages;
  }

  /**
   * Smoothly scrolls the viewport so the top of a results container sits cleanly
   * below the fixed topbar whenever it is scrolled past or far below the fold.
   */
  function scrollToTop(targetOrSelector, options = {}) {
    const target =
      typeof targetOrSelector === 'string'
        ? document.querySelector(targetOrSelector)
        : targetOrSelector;
    if (!target || typeof target.getBoundingClientRect !== 'function') return;

    const offset = Number.isFinite(options.offset) ? Number(options.offset) : 78;
    const minTopThreshold = Number.isFinite(options.minTopThreshold) ? Number(options.minTopThreshold) : 72;
    const maxViewportRatio = Number.isFinite(options.maxViewportRatio) ? Number(options.maxViewportRatio) : 0.65;

    const rect = target.getBoundingClientRect();
    if (options.force || rect.top < minTopThreshold || rect.top > global.innerHeight * maxViewportRatio) {
      const targetTop = Math.max(0, rect.top + global.scrollY - offset);
      global.scrollTo({
        top: targetTop,
        behavior: prefersReducedMotion() ? 'instant' : 'smooth',
      });
    }
  }

  /**
   * Triggers staggered Apple spring card/row entrance on a list container.
   */
  function triggerEntrance(containerEl) {
    if (!containerEl) return;
    containerEl.classList.remove('ft-items-entering');
    void containerEl.offsetWidth;
    containerEl.classList.add('ft-items-entering');
  }

  /**
   * Prevents abrupt skeleton flashes by ensuring active shimmer placeholders
   * stay visible for at least `minDurationMs` before swapping to real content.
   */
  function createSkeletonGate(minDurationMs = 190) {
    let startedAt = 0;

    return {
      start() {
        if (!startedAt) {
          startedAt = performance.now();
        }
      },
      async waitRemaining(isStillCurrentFn) {
        if (minDurationMs > 0 && startedAt > 0) {
          const elapsed = performance.now() - startedAt;
          if (elapsed < minDurationMs) {
            await new Promise((resolve) => setTimeout(resolve, minDurationMs - elapsed));
          }
        }
        if (typeof isStillCurrentFn === 'function' && !isStillCurrentFn()) {
          return false;
        }
        return true;
      },
      reset() {
        startedAt = 0;
      },
    };
  }

  /**
   * Preserves and restores pixel-exact scroll position across page reload / back-forward
   * navigation for paginated views.
   */
  function createScrollRestorer({ storageKey, isActive, getContainer }) {
    let pendingRestore = null;
    let userTouchedScroll = false;
    let scrollSaveTimer = null;
    let listenersBound = false;

    function currentRouteKey() {
      return `${global.location?.pathname || '/'}${global.location?.search || ''}`;
    }

    function clear() {
      pendingRestore = null;
      try {
        sessionStorage.removeItem(storageKey);
      } catch {}
    }

    function save() {
      if ((typeof isActive === 'function' && !isActive()) || pendingRestore) {
        return;
      }
      const container = typeof getContainer === 'function' ? getContainer() : null;
      try {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({
            routeKey: currentRouteKey(),
            y: Math.max(0, Math.round(global.scrollY || 0)),
            listHeight: container ? Math.round(container.offsetHeight || 0) : 0,
            ts: Date.now(),
          }),
        );
      } catch {}
    }

    function prepareFromNavigation() {
      try {
        const navEntry = performance.getEntriesByType?.('navigation')?.[0];
        const navType = navEntry?.type || '';
        if (navType !== 'reload' && navType !== 'back_forward') {
          pendingRestore = null;
          return null;
        }
        const raw = sessionStorage.getItem(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.routeKey !== currentRouteKey()) return null;
        if (Date.now() - (Number(parsed.ts) || 0) > 30 * 60 * 1000) return null;
        if (!(Number(parsed.y) > 0)) return null;

        pendingRestore = {
          y: Math.round(Number(parsed.y)),
          listHeight: Math.max(0, Math.round(Number(parsed.listHeight) || 0)),
        };

        const markTouched = () => {
          userTouchedScroll = true;
        };
        global.addEventListener('wheel', markTouched, { passive: true, once: true });
        global.addEventListener('touchstart', markTouched, { passive: true, once: true });
        const container = typeof getContainer === 'function' ? getContainer() : null;
        if (container && pendingRestore.listHeight > 0) {
          container.style.minHeight = `${pendingRestore.listHeight}px`;
        }
        return pendingRestore;
      } catch {
        pendingRestore = null;
        return null;
      }
    }

    function finishRestore() {
      const container = typeof getContainer === 'function' ? getContainer() : null;
      if (!pendingRestore) {
        if (container && container.style.minHeight) container.style.minHeight = '';
        return;
      }
      const target = pendingRestore;
      pendingRestore = null;
      requestAnimationFrame(() => {
        if (container) container.style.minHeight = '';
        if (!userTouchedScroll && Number.isFinite(target.y)) {
          const maxScroll = Math.max(0, document.documentElement.scrollHeight - global.innerHeight);
          global.scrollTo({ top: Math.min(target.y, maxScroll), behavior: 'instant' });
        }
        requestAnimationFrame(() => save());
      });
    }

    function bindLifecycle() {
      if (listenersBound) return;
      listenersBound = true;
      global.addEventListener(
        'scroll',
        () => {
          clearTimeout(scrollSaveTimer);
          scrollSaveTimer = setTimeout(save, 120);
        },
        { passive: true },
      );
      global.addEventListener('pagehide', save);
      global.addEventListener('beforeunload', save);
    }

    return {
      clear,
      save,
      prepareFromNavigation,
      finishRestore,
      bindLifecycle,
      hasPending: () => Boolean(pendingRestore),
    };
  }

  /**
   * Creates or attaches to a standardized Pro Apple Pagination Bar.
   */
  function createBar(config = {}) {
    const pageAttr = config.pageAttr || 'data-ft-page';
    const pageSizeAttr = config.pageSizeAttr || 'data-ft-page-size';
    const pageSizeOptions = Array.isArray(config.pageSizeOptions) && config.pageSizeOptions.length > 0
      ? config.pageSizeOptions
      : null;

    let bound = false;
    let currentState = {
      page: 1,
      totalPages: 1,
      pageSize: pageSizeOptions ? pageSizeOptions[0] : DEFAULT_PAGE_SIZE,
    };
    let handlers = { onPageChange: null, onPageSizeChange: null };

    function resolveBarEl() {
      if (config.barEl) return config.barEl;
      if (config.barId) return document.getElementById(config.barId);
      return null;
    }

    function ensureDom(barEl) {
      if (!barEl) return null;
      if (!barEl.classList.contains('ft-pagination-bar')) {
        barEl.classList.add('ft-pagination-bar');
      }
      if (config.ariaLabel && !barEl.getAttribute('aria-label')) {
        barEl.setAttribute('aria-label', config.ariaLabel);
      }

      if (!barEl.querySelector('.ft-pagination-controls')) {
        const infoIdAttr = config.infoId ? ` id="${escapeHtml(config.infoId)}"` : '';
        const numbersIdAttr = config.numbersId ? ` id="${escapeHtml(config.numbersId)}"` : '';
        const prevIdAttr = config.prevId ? ` id="${escapeHtml(config.prevId)}"` : '';
        const nextIdAttr = config.nextId ? ` id="${escapeHtml(config.nextId)}"` : '';
        const pillsIdAttr = config.pageSizePillsId ? ` id="${escapeHtml(config.pageSizePillsId)}"` : '';

        const pageSizeMarkup = pageSizeOptions
          ? `<div class="ft-page-size-wrap" role="group" aria-label="Items per page">
               <span class="ft-page-size-label">Per page</span>
               <div class="ft-page-size-pills"${pillsIdAttr}>
                 ${pageSizeOptions
                   .map(
                     (size, idx) =>
                       `<button type="button" class="ft-page-size-pill${idx === 0 ? ' active' : ''}" ${pageSizeAttr}="${size}" aria-pressed="${idx === 0 ? 'true' : 'false'}">${size}</button>`,
                   )
                   .join('')}
               </div>
             </div>`
          : '';

        barEl.innerHTML = `
          <div class="ft-pagination-meta">
            <span class="ft-page-info ltr-num"${infoIdAttr}></span>
            ${pageSizeMarkup}
          </div>
          <div class="ft-pagination-controls">
            <button type="button" class="btn-secondary btn-sm ft-page-nav-btn"${prevIdAttr}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
              <span>Previous</span>
            </button>
            <div class="ft-page-numbers"${numbersIdAttr} role="group" aria-label="Page numbers"></div>
            <button type="button" class="btn-secondary btn-sm ft-page-nav-btn"${nextIdAttr}>
              <span>Next</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
        `;
      }

      const infoEl =
        config.infoEl ||
        (config.infoId ? document.getElementById(config.infoId) : null) ||
        barEl.querySelector('.ft-page-info');
      const numbersEl =
        config.numbersEl ||
        (config.numbersId ? document.getElementById(config.numbersId) : null) ||
        barEl.querySelector('.ft-page-numbers');
      const prevBtn =
        config.prevBtn ||
        (config.prevId ? document.getElementById(config.prevId) : null) ||
        barEl.querySelector('.ft-pagination-controls .ft-page-nav-btn:first-of-type');
      const nextBtn =
        config.nextBtn ||
        (config.nextId ? document.getElementById(config.nextId) : null) ||
        barEl.querySelector('.ft-pagination-controls .ft-page-nav-btn:last-of-type');
      const pageSizePillsEl =
        config.pageSizePillsEl ||
        (config.pageSizePillsId ? document.getElementById(config.pageSizePillsId) : null) ||
        barEl.querySelector('.ft-page-size-pills');

      return { barEl, infoEl, numbersEl, prevBtn, nextBtn, pageSizePillsEl };
    }

    function bindEvents() {
      if (bound) return;
      const barEl = resolveBarEl();
      const refs = ensureDom(barEl);
      if (!refs) return;
      bound = true;

      refs.prevBtn?.addEventListener('click', () => {
        if (currentState.page > 1) {
          handlers.onPageChange?.(currentState.page - 1);
        }
      });

      refs.nextBtn?.addEventListener('click', () => {
        if (currentState.page < currentState.totalPages) {
          handlers.onPageChange?.(currentState.page + 1);
        }
      });

      refs.numbersEl?.addEventListener('click', (e) => {
        const btn = e.target.closest(`[${pageAttr}]`);
        if (!btn) return;
        const targetPage = Number(btn.getAttribute(pageAttr));
        if (Number.isFinite(targetPage) && targetPage >= 1 && targetPage !== currentState.page) {
          handlers.onPageChange?.(targetPage);
        }
      });

      refs.pageSizePillsEl?.addEventListener('click', (e) => {
        const btn = e.target.closest(`[${pageSizeAttr}]`);
        if (!btn || !pageSizeOptions) return;
        const nextSize = Number(btn.getAttribute(pageSizeAttr));
        if (pageSizeOptions.includes(nextSize) && nextSize !== currentState.pageSize) {
          handlers.onPageSizeChange?.(nextSize);
        }
      });
    }

    function bind(nextHandlers = {}) {
      handlers = { ...handlers, ...nextHandlers };
      bindEvents();
    }

    function hide() {
      const barEl = resolveBarEl();
      if (barEl) barEl.hidden = true;
    }

    function render({
      page = 1,
      pageSize = DEFAULT_PAGE_SIZE,
      total = 0,
      totalPages,
      itemsCount = 0,
      loading = false,
      visible = true,
    } = {}) {
      const barEl = resolveBarEl();
      const refs = ensureDom(barEl);
      if (!refs) return;

      bindEvents();

      const safeTotal = Math.max(0, Number(total) || 0);
      const safePageSize = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE);
      const safeTotalPages = Math.max(
        1,
        Number(totalPages) || Math.ceil(safeTotal / safePageSize) || 1,
      );
      const safePage = Math.max(1, Math.min(safeTotalPages, Number(page) || 1));

      currentState = {
        page: safePage,
        totalPages: safeTotalPages,
        pageSize: safePageSize,
      };

      const minPageSizeOption = pageSizeOptions ? Math.min(...pageSizeOptions) : null;
      const showPager =
        Boolean(visible) &&
        !loading &&
        safeTotal > 0 &&
        (minPageSizeOption !== null
          ? safeTotalPages > 1 || safeTotal > minPageSizeOption
          : safeTotalPages > 1);

      refs.barEl.hidden = !showPager;
      if (!showPager) return;

      const from = (safePage - 1) * safePageSize + 1;
      const to = Math.min(safeTotal, from + Math.max((Number(itemsCount) || 0) - 1, 0));

      if (refs.infoEl) {
        refs.infoEl.textContent =
          safeTotalPages > 1
            ? `Showing ${from}–${to} of ${safeTotal} · Page ${safePage} of ${safeTotalPages}`
            : `Showing ${from}–${to} of ${safeTotal}`;
      }

      if (refs.prevBtn) refs.prevBtn.disabled = safePage <= 1;
      if (refs.nextBtn) refs.nextBtn.disabled = safePage >= safeTotalPages;

      if (refs.pageSizePillsEl) {
        refs.pageSizePillsEl.querySelectorAll(`[${pageSizeAttr}]`).forEach((btn) => {
          const active = Number(btn.getAttribute(pageSizeAttr)) === safePageSize;
          btn.classList.toggle('active', active);
          btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      }

      if (refs.numbersEl) {
        if (safeTotalPages <= 1) {
          refs.numbersEl.innerHTML = '';
          refs.numbersEl.hidden = true;
        } else {
          refs.numbersEl.hidden = false;
          refs.numbersEl.innerHTML = buildRange(safePage, safeTotalPages)
            .map((token) => {
              if (typeof token !== 'number') {
                return '<span class="ft-page-ellipsis" aria-hidden="true">…</span>';
              }
              const active = token === safePage;
              return `<button type="button" class="ft-page-num-btn${active ? ' active' : ''}" ${pageAttr}="${token}" aria-label="Page ${token}"${
                active ? ' aria-current="page"' : ''
              }>${token}</button>`;
            })
            .join('');
        }
      }
    }

    return {
      bind,
      render,
      hide,
    };
  }

  global.FlaptapPagination = {
    DEFAULT_PAGE_SIZE,
    buildRange,
    scrollToTop,
    triggerEntrance,
    createSkeletonGate,
    createScrollRestorer,
    createBar,
  };
})(window);
