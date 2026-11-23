/* ==========================================================================
   FLAPTAP SHARED STICKY STUDY DOCK & PROGRESS DECK (study-dock.js)
   Deep reusable module shared by BOTH Anything to Phrases & Generate Phrases:
   - Botanical Emerald circular SVG progress ring (percentage -> emerald tick)
   - Clickable segmented phrase pips (<= 32 items) or smooth bar (> 32 items)
   - Sticky topbar offset synchronization via IntersectionObserver + ResizeObserver
   - Horizontal scrollable filter pill rail with dynamic fade masks & scroll arrows
   ========================================================================== */

(function (global) {
  'use strict';

  function escapeHtml(val) {
    return global.FlaptapUtils ? global.FlaptapUtils.escapeHtml(val) : String(val ?? '');
  }

  function measureTopbarHeight() {
    const topbar = document.querySelector('.workspace-topbar');
    const rect = topbar?.getBoundingClientRect();
    return rect && rect.height > 0 ? Math.max(0, Math.round(rect.height)) : 55;
  }

  /**
   * Build the Botanical Emerald Progress Deck HTML (SVG ring + status pill +
   * headline + tabular fraction + clickable pips or linear progress bar).
   */
  function renderProgressDeckHtml(options) {
    const total = Math.max(0, Number(options?.total) || 0);
    const done = Math.max(0, Math.min(total, Number(options?.done) || 0));
    const remaining = Math.max(0, total - done);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const tone = total > 0 && done >= total ? 'done' : done > 0 ? 'progress' : 'new';
    const statusLabel =
      tone === 'done' ? 'Completed' : tone === 'progress' ? 'In progress' : 'Not started';

    const singular = options?.singular || 'phrase';
    const plural = options?.plural || 'phrases';
    const doneHeadline = options?.doneHeadline || 'Guide completed';
    const readyHeadline = options?.readyHeadline || 'Ready to study';
    const headline =
      tone === 'done'
        ? doneHeadline
        : tone === 'progress'
          ? `${remaining} ${remaining === 1 ? singular : plural} left to master`
          : readyHeadline;

    const radius = 17;
    const circumference = 2 * Math.PI * radius;
    const displayPct = tone === 'done' ? 100 : pct;
    const dashOffset = circumference * (1 - displayPct / 100);

    const ringSvg =
      tone === 'done'
        ? `<div class="ft-ring-badge aex-ring-badge is-done" aria-hidden="true">
             ${
               global.FlaptapCheck?.ICON_SVG ||
               '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.2 12.75 L9.55 17.1 Q10.1 17.65 10.65 17.05 L18.9 7.35"></path></svg>'
             }
           </div>`
        : `<div class="ft-ring-badge aex-ring-badge is-${tone}" aria-hidden="true">
             <svg class="ft-ring-svg aex-ring-svg" viewBox="0 0 42 42">
               <circle class="ft-ring-bg aex-ring-bg" cx="21" cy="21" r="${radius}"></circle>
               <circle class="ft-ring-fg aex-ring-fg" cx="21" cy="21" r="${radius}" stroke-dasharray="${circumference.toFixed(
                 2,
               )}" stroke-dashoffset="${dashOffset.toFixed(2)}"></circle>
             </svg>
             <span class="ft-ring-pct aex-ring-pct ltr-num">${displayPct}%</span>
           </div>`;

    const pips = Array.isArray(options?.pips) ? options.pips : [];
    const pipAttr = options?.pipAttr || 'data-ft-jump-id';
    const maxPips = Number(options?.maxPips) || 32;

    const trackHtml =
      pips.length > 0 && pips.length <= maxPips
        ? `<div class="ft-pip-track aex-pip-track" role="list" aria-label="Study completion map">
             ${pips
               .map((pip) => {
                 const isDone = Boolean(pip.done);
                 const num = pip.displayNumber != null ? `#${pip.displayNumber} · ` : '';
                 const title = `${num}${pip.label || ''} (${isDone ? 'Studied' : 'Remaining'})`;
                 return `<button type="button" class="ft-pip aex-pip${isDone ? ' is-done' : ''}" ${pipAttr}="${escapeHtml(
                   pip.id,
                 )}" title="${escapeHtml(title)}" aria-label="Jump to ${escapeHtml(title)}"></button>`;
               })
               .join('')}
           </div>`
        : `<div class="subject-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}">
             <div class="subject-progress-fill" style="width: ${displayPct}%"></div>
           </div>`;

    return `
      <div class="ft-progress-deck aex-progress-deck">
        ${ringSvg}
        <div class="ft-progress-main aex-progress-main">
          <div class="ft-progress-top-line aex-progress-top-line">
            <span class="sp-state sp-state--${tone}">${escapeHtml(statusLabel)}</span>
            <span class="ft-progress-headline aex-progress-headline">${escapeHtml(headline)}</span>
            <span class="ft-progress-fraction aex-progress-fraction ltr-num">
              <strong data-sp-completed>${done}</strong>/<span data-sp-total>${total}</span>
              <span class="visually-hidden"> (<span data-sp-remaining>${remaining}</span> remaining)</span>
            </span>
          </div>
          ${trackHtml}
        </div>
      </div>
    `;
  }

  /**
   * Create a sticky dock controller for a page with a sentinel, dock element,
   * root container, and optional horizontal scrollable filter rail.
   */
  function createController(config) {
    let observer = null;
    let resizeObserver = null;
    let rafId = 0;
    let topOffset = 55;
    let bound = false;

    const getEl = (id) => (id ? document.getElementById(id) : null);
    const isActive = () => (typeof config.isActive === 'function' ? Boolean(config.isActive()) : true);

    function syncMetrics() {
      const dock = getEl(config.dockId);
      const root = getEl(config.rootId);
      topOffset = measureTopbarHeight();
      if (dock) {
        dock.style.setProperty('--ft-sticky-top', `${topOffset}px`);
        dock.style.setProperty('--aex-sticky-top', `${topOffset}px`);
      }
      const dockHeight = dock?.getBoundingClientRect()?.height || 110;
      if (root) {
        const clearance = `${Math.round(topOffset + dockHeight + 16)}px`;
        root.style.setProperty('--ft-scroll-clearance', clearance);
        root.style.setProperty('--aex-scroll-clearance', clearance);
      }
      return topOffset;
    }

    function updateStickyState() {
      const sentinel = getEl(config.sentinelId);
      const dock = getEl(config.dockId);
      if (!sentinel || !dock || dock.hidden || !isActive()) {
        dock?.classList.remove('is-stuck');
        return;
      }
      const stuck = sentinel.getBoundingClientRect().top <= topOffset + 2;
      dock.classList.toggle('is-stuck', stuck);
    }

    function scheduleUpdate() {
      if (rafId || !isActive()) return;
      rafId = global.requestAnimationFrame(() => {
        rafId = 0;
        updateStickyState();
      });
    }

    function disconnect() {
      if (rafId) {
        global.cancelAnimationFrame?.(rafId);
        rafId = 0;
      }
      if (observer) {
        try {
          observer.disconnect();
        } catch {}
        observer = null;
      }
      getEl(config.dockId)?.classList.remove('is-stuck');
    }

    function setup() {
      disconnect();
      const sentinel = getEl(config.sentinelId);
      const dock = getEl(config.dockId);
      if (!sentinel || !dock || dock.hidden) return;

      const offset = syncMetrics();
      updateStickyState();
      if (typeof global.IntersectionObserver !== 'function') return;

      observer = new global.IntersectionObserver(
        () => {
          updateStickyState();
        },
        {
          root: null,
          rootMargin: `-${offset + 1}px 0px 0px 0px`,
          threshold: [0, 1],
        },
      );
      observer.observe(sentinel);
    }

    function updateRailFades() {
      const wrap = getEl(config.railWrapId);
      const rail = getEl(config.railId);
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

    function centerPill(pillBtn) {
      const rail = getEl(config.railId);
      if (!rail || !pillBtn) return;
      const targetLeft = pillBtn.offsetLeft - rail.clientWidth / 2 + pillBtn.offsetWidth / 2;
      const reduced = Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
      rail.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: reduced ? 'instant' : 'smooth',
      });
    }

    function scrollToStart({ onlyIfStuck = false, force = false } = {}) {
      const dock = getEl(config.dockId);
      if (onlyIfStuck && !dock?.classList.contains('is-stuck')) return;
      const offset = topOffset || measureTopbarHeight();
      if (global.FlaptapPagination?.scrollToTop) {
        global.FlaptapPagination.scrollToTop(`#${config.sentinelId}`, {
          offset,
          minTopThreshold: offset + 4,
          force,
        });
      }
    }

    function scrollCardIntoView(targetCard) {
      if (!targetCard || typeof targetCard.getBoundingClientRect !== 'function') return;
      const offset = topOffset || measureTopbarHeight();
      const dockHeight = getEl(config.dockId)?.getBoundingClientRect()?.height || 110;
      const targetTop =
        targetCard.getBoundingClientRect().top + global.scrollY - (offset + dockHeight + 16);
      const reduced = Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
      global.scrollTo({
        top: Math.max(0, targetTop),
        behavior: reduced ? 'instant' : 'smooth',
      });
    }

    function bind() {
      if (bound) return;
      bound = true;

      const rail = getEl(config.railId);
      rail?.addEventListener('scroll', updateRailFades, { passive: true });

      const scrollRailBy = (dir) => {
        const node = getEl(config.railId);
        if (!node) return;
        const step = Math.max(180, Math.round(node.clientWidth * 0.65));
        const isRtl = global.getComputedStyle?.(node)?.direction === 'rtl';
        node.scrollBy({ left: dir * step * (isRtl ? -1 : 1), behavior: 'smooth' });
      };

      getEl(config.railPrevId)?.addEventListener('click', () => scrollRailBy(-1));
      getEl(config.railNextId)?.addEventListener('click', () => scrollRailBy(1));

      global.addEventListener('scroll', scheduleUpdate, { passive: true });
      global.addEventListener(
        'resize',
        () => {
          if (!isActive()) return;
          syncMetrics();
          updateStickyState();
          updateRailFades();
        },
        { passive: true },
      );

      if (typeof global.ResizeObserver === 'function') {
        resizeObserver = new global.ResizeObserver(() => {
          if (!isActive()) return;
          syncMetrics();
          updateRailFades();
        });
        const topbar = document.querySelector('.workspace-topbar');
        const dock = getEl(config.dockId);
        if (topbar) resizeObserver.observe(topbar);
        if (dock) resizeObserver.observe(dock);
        if (rail) resizeObserver.observe(rail);
      }
    }

    return {
      bind,
      setup,
      disconnect,
      syncMetrics,
      updateStickyState,
      updateRailFades,
      centerPill,
      scrollToStart,
      scrollCardIntoView,
    };
  }

  global.FlaptapStudyDock = {
    renderProgressDeckHtml,
    createController,
    measureTopbarHeight,
  };
})(window);
