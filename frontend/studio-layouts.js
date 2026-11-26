/* ==========================================================================
   FLAPTAP STUDIO — MULTI-LAYOUT ENGINE & MOTION-GRAPHIC PICKER
   Zero-Remount CSS Grid Orchestration · GPU FLIP Transitions
   6 Desktop Layouts · 4 Mobile Layouts · Interactive Split Resizer
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_DESKTOP_KEY = 'flaptap_studio_layout';
  const STORAGE_MOBILE_KEY = 'flaptap_studio_layout_mobile';
  const STORAGE_SPLITS_KEY = 'flaptap_studio_split_widths';
  const STORAGE_COMPACT_KEY = 'flaptap_studio_compact_dock';

  const LEGACY_LAYOUT_MAP = {
    side: 'transcript',
    top: 'cinema-stack',
    focus: 'zen',
  };

  const DEFAULT_SPLITS = {
    theater: 62,
    'split-right': 40,
    transcript: 36,
  };

  const DESKTOP_LAYOUTS = [
    {
      id: 'theater',
      tag: '62 / 38',
      en: { name: 'Theater', desc: 'Widescreen video left, synced lines right' },
      ar: { name: 'مسرح', desc: 'فيديو عريض يساراً وقائمة الجمل يميناً' },
    },
    {
      id: 'split-right',
      tag: '40 / 60',
      en: { name: 'Mirror', desc: 'Sentences left for reading, video stage right' },
      ar: { name: 'معكوس', desc: 'الجمل يساراً للقراءة والفيديو يميناً' },
    },
    {
      id: 'transcript',
      tag: '36 / 64',
      en: { name: 'Transcript', desc: 'Wide reading canvas with compact video deck' },
      ar: { name: 'تفريغ', desc: 'مساحة قراءة واسعة وفيديو مدمج' },
    },
    {
      id: 'cinema-stack',
      tag: 'Top / List',
      en: { name: 'Cinema', desc: 'Video & controls pinned above full-width list' },
      ar: { name: 'سينمائي', desc: 'الفيديو والتحكم بالأعلى والقائمة بعرض الشاشة' },
    },
    {
      id: 'cockpit',
      tag: 'Stack / Rail',
      en: { name: 'Cockpit', desc: 'Video & lines stacked with side control rail' },
      ar: { name: 'كوكبيت', desc: 'الفيديو والجمل معاً ولوحة التحكم بالجانب' },
    },
    {
      id: 'zen',
      tag: 'Teleprompter',
      en: { name: 'Zen Focus', desc: 'Spotlight active line with bottom glass bar' },
      ar: { name: 'تركيز', desc: 'تركيز تفاعلي على الجملة مع شريط سفلي' },
    },
  ];

  const MOBILE_LAYOUTS = [
    {
      id: 'docked',
      tag: 'Pinned',
      en: { name: 'Pinned Top', desc: 'Compact video pinned top, free-scroll lines' },
      ar: { name: 'مثبت علوي', desc: 'فيديو مدمج بالأعلى وقائمة جمل مريحة' },
    },
    {
      id: 'mini',
      tag: 'Max Text',
      en: { name: 'Audio Mini', desc: 'Hides video box for maximum reading space' },
      ar: { name: 'شريط مصغر', desc: 'إخفاء الفيديو لأكبر مساحة قراءة وترديد' },
    },
    {
      id: 'scroll-dock',
      tag: 'Thumb Bar',
      en: { name: 'Thumb Dock', desc: 'Video scrolls smoothly, controls stay bottom' },
      ar: { name: 'تحكم سفلي', desc: 'تمرير طبيعي للفيديو وشريط تحكم سفلي ثابت' },
    },
    {
      id: 'zen',
      tag: 'Spotlight',
      en: { name: 'Teleprompter', desc: 'Spotlight active line with bottom controls' },
      ar: { name: 'تلقين', desc: 'تمييز الجملة النشطة مع شريط تحكم سفلي' },
    },
  ];

  const DESKTOP_IDS = new Set(DESKTOP_LAYOUTS.map((l) => l.id));
  const MOBILE_IDS = new Set(MOBILE_LAYOUTS.map((l) => l.id));

  const state = {
    desktopLayout: 'theater',
    mobileLayout: 'docked',
    compactDock: false,
    splits: loadSavedSplits(),
    uiLang: 'en',
    lastViewportIsMobile: null,
    morphTimer: null,
    resizerBound: false,
    resizeObserver: null,
    onChangeCallback: null,
    onClosePopoverCallback: null,
  };

  function normalizeDesktopLayout(raw) {
    const val = String(raw || '').trim().toLowerCase();
    const mapped = LEGACY_LAYOUT_MAP[val] || val;
    return DESKTOP_IDS.has(mapped) ? mapped : 'theater';
  }

  function normalizeMobileLayout(raw) {
    const val = String(raw || '').trim().toLowerCase();
    return MOBILE_IDS.has(val) ? val : 'docked';
  }

  function isMobileViewport() {
    const w = window.innerWidth || document.documentElement.clientWidth || 1024;
    const h = window.innerHeight || document.documentElement.clientHeight || 768;
    return w <= 768 && h >= 551;
  }

  function loadSavedSplits() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_SPLITS_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveSplits() {
    try {
      localStorage.setItem(STORAGE_SPLITS_KEY, JSON.stringify(state.splits));
    } catch {}
  }

  function getWorkspace() {
    return document.getElementById('studio-main-content');
  }

  function getTriggerIconSvg(id, isMobile) {
    if (isMobile) {
      if (id === 'mini') {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="13" x2="17" y2="13"/><line x1="7" y1="17" x2="14" y2="17"/></svg>';
      }
      if (id === 'scroll-dock') {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="15" y2="12"/><rect x="6" y="16" width="12" height="3" rx="1.2"/></svg>';
      }
      if (id === 'zen') {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/><rect x="6.5" y="9" width="11" height="4.5" rx="1.2"/><line x1="7" y1="17.5" x2="17" y2="17.5"/></svg>';
      }
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/><rect x="6.5" y="5.5" width="11" height="5" rx="1.2"/><line x1="7" y1="14" x2="17" y2="14"/><line x1="7" y1="17.5" x2="14" y2="17.5"/></svg>';
    }

    switch (id) {
      case 'split-right':
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><line x1="10" y1="4" x2="10" y2="20"/></svg>';
      case 'transcript':
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><line x1="9.5" y1="4" x2="9.5" y2="20"/><line x1="13" y1="9" x2="18" y2="9"/><line x1="13" y1="13" x2="18" y2="13"/></svg>';
      case 'cinema-stack':
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><line x1="3" y1="12" x2="21" y2="12"/></svg>';
      case 'cockpit':
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><line x1="15.5" y1="4" x2="15.5" y2="20"/><line x1="3" y1="12" x2="15.5" y2="12"/></svg>';
      case 'zen':
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><rect x="6.5" y="9" width="11" height="5" rx="1.2"/><line x1="6.5" y1="17" x2="17.5" y2="17"/></svg>';
      case 'theater':
      default:
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><line x1="14.5" y1="4" x2="14.5" y2="20"/></svg>';
    }
  }

  function buildLinesHtml(variant) {
    if (variant === 'tokens') {
      return `
        <div class="slp-m-list">
          <div class="slp-m-line slp-m-line--a is-lit">
            <div class="slp-m-tokens"><span class="slp-m-tok is-blue"></span><span class="slp-m-tok"></span><span class="slp-m-tok is-amber"></span></div>
            <span class="slp-m-barline is-short"></span>
          </div>
          <div class="slp-m-line slp-m-line--b">
            <div class="slp-m-tokens"><span class="slp-m-tok"></span><span class="slp-m-tok is-pink"></span><span class="slp-m-tok"></span></div>
            <span class="slp-m-barline is-short"></span>
          </div>
          <div class="slp-m-line slp-m-line--c">
            <div class="slp-m-tokens"><span class="slp-m-tok is-amber"></span><span class="slp-m-tok is-blue"></span><span class="slp-m-tok"></span></div>
          </div>
        </div>
      `;
    }
    const trackClass = variant === 'glide' ? 'slp-m-list slp-m-scroll-track' : 'slp-m-list';
    return `
      <div class="${trackClass}">
        <div class="slp-m-line slp-m-line--a ${variant === 'zen' ? '' : 'is-lit'}">
          <span class="slp-m-barline"></span>
          <span class="slp-m-barline is-short"></span>
        </div>
        <div class="slp-m-line slp-m-line--b ${variant === 'zen' ? 'is-lit' : ''}">
          <span class="slp-m-barline"></span>
          <span class="slp-m-barline is-short"></span>
        </div>
        <div class="slp-m-line slp-m-line--c">
          <span class="slp-m-barline"></span>
        </div>
      </div>
    `;
  }

  function buildVideoBoxHtml() {
    return `
      <div class="slp-m-video">
        <span class="slp-m-ring" aria-hidden="true"></span>
        <span class="slp-m-play" aria-hidden="true"></span>
        <span class="slp-m-scrub"><span class="slp-m-scrub-fill"></span></span>
      </div>
    `;
  }

  function buildBarHtml() {
    return `
      <div class="slp-m-bar">
        <span class="slp-m-dot"></span>
        <span class="slp-m-dot is-primary"></span>
        <span class="slp-m-dot"></span>
        <span class="slp-m-pill"></span>
      </div>
    `;
  }

  function buildPreviewStageHtml(id, isMobile) {
    if (isMobile) {
      if (id === 'mini') {
        return `
          <div class="slp-stage slp-stage--phone" aria-hidden="true">
            <div class="slp-phone-bezel slp-phone-bezel--mini">
              ${buildBarHtml()}
              ${buildLinesHtml('step')}
            </div>
          </div>
        `;
      }
      if (id === 'scroll-dock') {
        return `
          <div class="slp-stage slp-stage--phone" aria-hidden="true">
            <div class="slp-phone-bezel slp-phone-bezel--scroll-dock">
              ${buildLinesHtml('glide')}
              ${buildBarHtml()}
            </div>
          </div>
        `;
      }
      if (id === 'zen') {
        return `
          <div class="slp-stage slp-stage--phone" aria-hidden="true">
            <div class="slp-phone-bezel slp-phone-bezel--zen">
              ${buildVideoBoxHtml()}
              ${buildLinesHtml('zen')}
              ${buildBarHtml()}
            </div>
          </div>
        `;
      }
      return `
        <div class="slp-stage slp-stage--phone" aria-hidden="true">
          <div class="slp-phone-bezel slp-phone-bezel--docked">
            ${buildVideoBoxHtml()}
            ${buildBarHtml()}
            ${buildLinesHtml('step')}
          </div>
        </div>
      `;
    }

    switch (id) {
      case 'split-right':
        return `
          <div class="slp-stage slp-stage--split-right" aria-hidden="true">
            ${buildLinesHtml('step')}
            <div class="slp-m-col">
              ${buildVideoBoxHtml()}
              ${buildBarHtml()}
            </div>
          </div>
        `;
      case 'transcript':
        return `
          <div class="slp-stage slp-stage--transcript" aria-hidden="true">
            <div class="slp-m-col">
              ${buildVideoBoxHtml()}
              ${buildBarHtml()}
            </div>
            ${buildLinesHtml('tokens')}
          </div>
        `;
      case 'cinema-stack':
        return `
          <div class="slp-stage slp-stage--cinema-stack" aria-hidden="true">
            <div class="slp-m-video-stage">
              ${buildVideoBoxHtml()}
              ${buildBarHtml()}
            </div>
            ${buildLinesHtml('glide')}
          </div>
        `;
      case 'cockpit':
        return `
          <div class="slp-stage slp-stage--cockpit" aria-hidden="true">
            <div class="slp-m-col">
              ${buildVideoBoxHtml()}
              ${buildLinesHtml('step')}
            </div>
            <div class="slp-m-cockpit-rail">
              ${buildBarHtml()}
              <div class="slp-m-bar"><span class="slp-m-pill"></span><span class="slp-m-dot"></span></div>
              <div class="slp-m-caption-box">
                <span class="slp-m-barline"></span>
                <span class="slp-m-barline is-short"></span>
              </div>
            </div>
          </div>
        `;
      case 'zen':
        return `
          <div class="slp-stage slp-stage--zen" aria-hidden="true">
            ${buildVideoBoxHtml()}
            ${buildLinesHtml('zen')}
            ${buildBarHtml()}
          </div>
        `;
      case 'theater':
      default:
        return `
          <div class="slp-stage slp-stage--theater" aria-hidden="true">
            <div class="slp-m-col">
              ${buildVideoBoxHtml()}
              ${buildBarHtml()}
            </div>
            ${buildLinesHtml('step')}
          </div>
        `;
    }
  }

  function getActiveMeta() {
    const mobile = isMobileViewport();
    const list = mobile ? MOBILE_LAYOUTS : DESKTOP_LAYOUTS;
    const id = mobile ? state.mobileLayout : state.desktopLayout;
    const entry = list.find((l) => l.id === id) || list[0];
    const loc = state.uiLang === 'ar' ? entry.ar : entry.en;
    return { id: entry.id, isMobile: mobile, name: loc.name, desc: loc.desc, tag: entry.tag };
  }

  function syncTriggerPill({ popAnimation = false } = {}) {
    const btn = document.getElementById('studio-layout-btn');
    const iconEl = document.getElementById('studio-layout-trigger-icon');
    const labelEl = document.getElementById('studio-layout-trigger-label');
    const meta = getActiveMeta();
    if (iconEl) iconEl.innerHTML = getTriggerIconSvg(meta.id, meta.isMobile);
    if (labelEl) labelEl.textContent = meta.name;
    if (btn) {
      btn.setAttribute('aria-label', `Studio layout: ${meta.name}`);
      if (popAnimation) {
        btn.classList.remove('is-switched');
        void btn.offsetWidth;
        btn.classList.add('is-switched');
      }
    }
  }

  function applyCustomSplitsToWorkspace() {
    const ws = getWorkspace();
    if (!ws) return;
    const map = {
      theater: '--studio-split-theater',
      'split-right': '--studio-split-mirror',
      transcript: '--studio-split-transcript',
    };
    Object.entries(map).forEach(([layoutId, cssVar]) => {
      const val = Number(state.splits[layoutId]);
      if (Number.isFinite(val) && val >= 28 && val <= 72) {
        ws.style.setProperty(cssVar, `${val}%`);
      } else {
        ws.style.removeProperty(cssVar);
      }
    });
  }

  function hasAnyCustomSplit() {
    return ['theater', 'split-right', 'transcript'].some((id) => {
      const v = Number(state.splits[id]);
      return Number.isFinite(v) && Math.abs(v - DEFAULT_SPLITS[id]) >= 0.5;
    });
  }

  function renderLayoutPopover() {
    const pop = document.getElementById('studio-layout-popover');
    if (!pop) return;

    const mobile = isMobileViewport();
    const list = mobile ? MOBILE_LAYOUTS : DESKTOP_LAYOUTS;
    const activeId = mobile ? state.mobileLayout : state.desktopLayout;
    const isAr = state.uiLang === 'ar';

    const titleText = mobile
      ? (isAr ? 'تخطيط الهاتف' : 'Mobile Layout')
      : (isAr ? 'تخطيط الاستوديو' : 'Studio Layout');
    const subText = mobile
      ? (isAr ? 'اختر أسلوب العرض والتمرير الأنسب لهاتفك' : 'Choose how video & controls fit your screen')
      : (isAr ? 'تبديل فوري بدون إيقاف الفيديو أو إعادة التحميل' : 'Instant zero-reload switch — keeps playback alive');
    const compactLabel = isAr ? 'شريط علوي مدمج' : 'Compact Header';
    const resetLabel = isAr ? 'إعادة ضبط التقسيم' : 'Reset Split';

    const cardsHtml = list
      .map((item) => {
        const loc = isAr ? item.ar : item.en;
        const isActive = item.id === activeId;
        return `
          <button
            type="button"
            class="slp-card${isActive ? ' is-active' : ''}"
            data-studio-layout-option="${item.id}"
            data-layout-scope="${mobile ? 'mobile' : 'desktop'}"
            aria-pressed="${isActive ? 'true' : 'false'}"
          >
            ${buildPreviewStageHtml(item.id, mobile)}
            <div class="slp-card-meta">
              <div class="slp-card-top">
                <span class="slp-card-name">${loc.name}</span>
                <span class="slp-card-tag ltr-num">${item.tag}</span>
              </div>
              <span class="slp-card-desc">${loc.desc}</span>
            </div>
          </button>
        `;
      })
      .join('');

    pop.innerHTML = `
      <span class="slp-grabber" aria-hidden="true"></span>
      <div class="slp-header">
        <div class="slp-header-copy">
          <span class="slp-title">${titleText}</span>
          <span class="slp-subtitle">${subText}</span>
        </div>
        <div class="slp-header-meta">
          <span class="slp-kbd-hint"><kbd class="kbd-chip">Y</kbd> / <kbd class="kbd-chip">⇧Y</kbd></span>
          <button type="button" class="slp-close-btn" id="slp-close-btn" aria-label="Close layout picker">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <div class="slp-grid${mobile ? ' slp-grid--mobile' : ''}" role="group" aria-label="${titleText}">
        ${cardsHtml}
      </div>
      <div class="slp-footer">
        <label class="slp-footer-toggle">
          <input type="checkbox" id="slp-compact-dock-toggle" class="trans-switch-input" ${state.compactDock ? 'checked' : ''} />
          <span class="trans-switch-track" aria-hidden="true"><span class="trans-switch-thumb"></span></span>
          <span>${compactLabel}</span>
        </label>
        ${!mobile && hasAnyCustomSplit() ? `<button type="button" class="slp-footer-reset" id="slp-reset-split-btn">${resetLabel}</button>` : ''}
      </div>
    `;

    bindPopoverInnerEvents(pop);
  }

  function bindPopoverInnerEvents(pop) {
    pop.querySelector('#slp-close-btn')?.addEventListener('click', () => {
      if (typeof state.onClosePopoverCallback === 'function') {
        state.onClosePopoverCallback();
      } else {
        pop.hidden = true;
        onPopoverStateChange(false);
      }
      document.getElementById('studio-layout-btn')?.focus();
    });

    pop.querySelectorAll('[data-studio-layout-option]').forEach((card) => {
      card.addEventListener('click', () => {
        const nextId = card.getAttribute('data-studio-layout-option');
        const scope = card.getAttribute('data-layout-scope') || 'desktop';
        setLayout(nextId, { scope, animate: true, persist: true });
      });
    });

    pop.querySelector('#slp-compact-dock-toggle')?.addEventListener('change', (e) => {
      setCompactDock(Boolean(e.target.checked));
    });

    pop.querySelector('#slp-reset-split-btn')?.addEventListener('click', () => {
      resetSplitWidths();
    });

    pop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof state.onClosePopoverCallback === 'function') {
          state.onClosePopoverCallback();
        } else {
          pop.hidden = true;
          onPopoverStateChange(false);
        }
        document.getElementById('studio-layout-btn')?.focus();
        return;
      }
      const cards = Array.from(pop.querySelectorAll('[data-studio-layout-option]'));
      const currentIdx = cards.indexOf(document.activeElement);
      if (currentIdx === -1) return;
      const cols = isMobileViewport() ? 2 : 3;
      let nextIdx = -1;
      if (e.key === 'ArrowRight') nextIdx = (currentIdx + 1) % cards.length;
      else if (e.key === 'ArrowLeft') nextIdx = (currentIdx - 1 + cards.length) % cards.length;
      else if (e.key === 'ArrowDown') nextIdx = Math.min(cards.length - 1, currentIdx + cols);
      else if (e.key === 'ArrowUp') nextIdx = Math.max(0, currentIdx - cols);
      if (nextIdx >= 0) {
        e.preventDefault();
        cards[nextIdx]?.focus();
      }
    });
  }

  function syncActiveCardsInPopover() {
    const pop = document.getElementById('studio-layout-popover');
    if (!pop) return;
    const mobile = isMobileViewport();
    const activeId = mobile ? state.mobileLayout : state.desktopLayout;
    pop.querySelectorAll('[data-studio-layout-option]').forEach((card) => {
      const active = card.getAttribute('data-studio-layout-option') === activeId;
      card.classList.toggle('is-active', active);
      card.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function runFlipMorph(mutateDomFn) {
    const ws = getWorkspace();
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!ws || reduced) {
      mutateDomFn();
      return;
    }

    const targets = [
      ws.querySelector('.player-frame-card'),
      ws.querySelector('.studio-media-console'),
      ws.querySelector('.studio-canvas'),
    ].filter(Boolean);

    // Clear any in-flight transition first
    if (state.morphTimer) {
      clearTimeout(state.morphTimer);
      state.morphTimer = null;
    }
    targets.forEach((el) => {
      el.style.transition = '';
      el.style.transform = '';
      el.style.opacity = '';
    });

    const beforeRects = targets.map((el) => {
      const r = el.getBoundingClientRect();
      return { el, rect: r, visible: r.width > 0 && r.height > 0 };
    });

    mutateDomFn();

    ws.classList.add('is-layout-morphing');

    const animations = [];
    beforeRects.forEach(({ el, rect: before, visible }) => {
      if (!visible) return;
      const after = el.getBoundingClientRect();
      if (after.width === 0 || after.height === 0) return;
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      const isPlayer = el.classList.contains('player-frame-card');
      const sx = isPlayer ? Math.max(0.65, Math.min(1.45, before.width / after.width)) : 1;
      const sy = isPlayer ? Math.max(0.65, Math.min(1.45, before.height / after.height)) : 1;

      if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && Math.abs(sx - 1) < 0.03) return;

      el.style.transition = 'none';
      el.style.transformOrigin = 'top left';
      el.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
      if (!isPlayer) {
        el.style.opacity = '0.88';
      }
      animations.push(el);
    });

    if (!animations.length) {
      ws.classList.remove('is-layout-morphing');
      return;
    }

    void ws.offsetHeight;

    requestAnimationFrame(() => {
      animations.forEach((el) => {
        el.style.transition = 'transform 0.34s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.24s ease';
        el.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
        el.style.opacity = '1';
      });
    });

    state.morphTimer = setTimeout(() => {
      animations.forEach((el) => {
        el.style.transition = '';
        el.style.transform = '';
        el.style.transformOrigin = '';
        el.style.opacity = '';
      });
      ws.classList.remove('is-layout-morphing');
      state.morphTimer = null;
    }, 370);
  }

  function syncMiniVideoChip() {
    const chip = document.getElementById('studio-mini-expand-video-btn');
    if (!chip) return;
    const show = isMobileViewport() && state.mobileLayout === 'mini';
    chip.hidden = !show;
  }

  function updateSplitResizerGeometry() {
    const resizer = document.getElementById('studio-split-resizer');
    const ws = getWorkspace();
    if (!resizer || !ws) return;

    const w = window.innerWidth || 1024;
    const h = window.innerHeight || 768;
    const splitSupported =
      w > 900 &&
      h >= 551 &&
      (state.desktopLayout === 'theater' ||
        state.desktopLayout === 'split-right' ||
        state.desktopLayout === 'transcript');

    if (!splitSupported) {
      resizer.hidden = true;
      return;
    }

    const deck = ws.querySelector('.studio-deck');
    const canvas = ws.querySelector('.studio-canvas');
    if (!deck || !canvas) {
      resizer.hidden = true;
      return;
    }

    const wsRect = ws.getBoundingClientRect();
    const deckRect = deck.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    if (wsRect.width <= 0 || deckRect.width <= 0 || canvasRect.width <= 0) {
      resizer.hidden = true;
      return;
    }

    const leftRect = deckRect.left < canvasRect.left ? deckRect : canvasRect;
    const rightRect = deckRect.left < canvasRect.left ? canvasRect : deckRect;
    const gapMidX = (leftRect.right + rightRect.left) / 2 - wsRect.left;

    resizer.hidden = false;
    ws.style.setProperty('--studio-resizer-x', `${Math.round(gapMidX)}px`);
  }

  function resetSplitWidths() {
    state.splits = {};
    saveSplits();
    applyCustomSplitsToWorkspace();
    renderLayoutPopover();
    requestAnimationFrame(updateSplitResizerGeometry);
  }

  function setCompactDock(enabled, { persist = true } = {}) {
    state.compactDock = Boolean(enabled);
    const ws = getWorkspace();
    if (ws) {
      ws.setAttribute('data-compact-dock', state.compactDock ? '1' : '0');
    }
    if (persist) {
      try {
        localStorage.setItem(STORAGE_COMPACT_KEY, state.compactDock ? '1' : '0');
      } catch {}
    }
    const chk = document.getElementById('slp-compact-dock-toggle');
    if (chk) chk.checked = state.compactDock;
    if (typeof state.onChangeCallback === 'function') {
      state.onChangeCallback(getActiveMeta());
    }
  }

  function setLayout(rawId, { scope, animate = true, persist = true } = {}) {
    const ws = getWorkspace();
    if (!ws) return getActiveMeta();

    const targetScope = scope || (isMobileViewport() ? 'mobile' : 'desktop');
    const applyFn = () => {
      if (targetScope === 'mobile') {
        const nextMobile = normalizeMobileLayout(rawId);
        state.mobileLayout = nextMobile;
        ws.setAttribute('data-mobile-layout', nextMobile);
        document.documentElement.setAttribute('data-studio-mobile-layout', nextMobile);
        if (persist) {
          try {
            localStorage.setItem(STORAGE_MOBILE_KEY, nextMobile);
          } catch {}
        }
      } else {
        const nextDesktop = normalizeDesktopLayout(rawId);
        state.desktopLayout = nextDesktop;
        ws.setAttribute('data-layout', nextDesktop);
        if (window.studioState) {
          window.studioState.layout = nextDesktop;
        }
        if (persist) {
          try {
            localStorage.setItem(STORAGE_DESKTOP_KEY, nextDesktop);
          } catch {}
        }
      }
      syncTriggerPill({ popAnimation: animate });
      syncActiveCardsInPopover();
      syncMiniVideoChip();
      requestAnimationFrame(updateSplitResizerGeometry);
    };

    if (animate) {
      runFlipMorph(applyFn);
    } else {
      applyFn();
    }

    const meta = getActiveMeta();
    if (typeof state.onChangeCallback === 'function') {
      state.onChangeCallback(meta);
    }
    return meta;
  }

  function cycleLayout() {
    const mobile = isMobileViewport();
    const list = mobile ? MOBILE_LAYOUTS : DESKTOP_LAYOUTS;
    const currentId = mobile ? state.mobileLayout : state.desktopLayout;
    const idx = list.findIndex((l) => l.id === currentId);
    const next = list[(idx + 1) % list.length];
    return setLayout(next.id, {
      scope: mobile ? 'mobile' : 'desktop',
      animate: true,
      persist: true,
    });
  }

  function onPopoverStateChange(isOpen) {
    const backdrop = document.getElementById('studio-layout-backdrop');
    const isNarrowMobile = (window.innerWidth || 1024) <= 640;
    if (backdrop) {
      backdrop.hidden = !(isOpen && isNarrowMobile);
    }
    if (isOpen) {
      syncActiveCardsInPopover();
    }
  }

  function onUiLanguageChange(lang) {
    state.uiLang = lang === 'ar' ? 'ar' : 'en';
    syncTriggerPill({ popAnimation: false });
    renderLayoutPopover();
  }

  function initSplitResizer() {
    if (state.resizerBound) return;
    const resizer = document.getElementById('studio-split-resizer');
    const badge = document.getElementById('studio-split-badge');
    const ws = getWorkspace();
    if (!resizer || !ws) return;

    state.resizerBound = true;
    let dragging = false;

    const getColumn1Pct = (clientX) => {
      const wsRect = ws.getBoundingClientRect();
      if (wsRect.width <= 0) return 50;
      const isRtl = document.documentElement.getAttribute('dir') === 'rtl';
      let pct = ((clientX - wsRect.left) / wsRect.width) * 100;
      if (isRtl) pct = 100 - pct;
      return Math.max(30, Math.min(70, Math.round(pct * 10) / 10));
    };

    const onMove = (e) => {
      if (!dragging) return;
      const pct = getColumn1Pct(e.clientX);
      const layoutId = state.desktopLayout;
      if (layoutId === 'theater' || layoutId === 'split-right' || layoutId === 'transcript') {
        state.splits[layoutId] = pct;
        applyCustomSplitsToWorkspace();
        updateSplitResizerGeometry();
        if (badge) {
          badge.hidden = false;
          badge.textContent = `${Math.round(pct)}% / ${Math.round(100 - pct)}%`;
        }
      }
    };

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('is-studio-resizing');
      resizer.classList.remove('is-dragging');
      if (badge) badge.hidden = true;
      saveSplits();
      renderLayoutPopover();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };

    resizer.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      document.body.classList.add('is-studio-resizing');
      resizer.classList.add('is-dragging');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
    });

    resizer.addEventListener('dblclick', () => {
      resetSplitWidths();
    });

    resizer.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const layoutId = state.desktopLayout;
      if (layoutId !== 'theater' && layoutId !== 'split-right' && layoutId !== 'transcript') return;
      e.preventDefault();
      const isRtl = document.documentElement.getAttribute('dir') === 'rtl';
      const step = (e.key === 'ArrowRight' ? 2 : -2) * (isRtl ? -1 : 1);
      const curr = Number(state.splits[layoutId]) || DEFAULT_SPLITS[layoutId];
      state.splits[layoutId] = Math.max(30, Math.min(70, curr + step));
      saveSplits();
      applyCustomSplitsToWorkspace();
      updateSplitResizerGeometry();
    });
  }

  function initMobileHelpers() {
    const searchToggle = document.getElementById('studio-mobile-search-toggle');
    const toolsBar = document.getElementById('studio-transcript-tools');
    const searchInput = document.getElementById('studio-search-input');
    if (searchToggle && toolsBar) {
      searchToggle.addEventListener('click', () => {
        const nextOpen = !toolsBar.classList.contains('is-mobile-search-open');
        toolsBar.classList.toggle('is-mobile-search-open', nextOpen);
        searchToggle.classList.toggle('active', nextOpen);
        searchToggle.setAttribute('aria-pressed', nextOpen ? 'true' : 'false');
        if (nextOpen && searchInput) {
          requestAnimationFrame(() => searchInput.focus());
        }
      });
    }

    const miniExpandBtn = document.getElementById('studio-mini-expand-video-btn');
    if (miniExpandBtn) {
      miniExpandBtn.addEventListener('click', () => {
        setLayout('docked', { scope: 'mobile', animate: true, persist: true });
      });
    }

    const backdrop = document.getElementById('studio-layout-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => {
        if (typeof state.onClosePopoverCallback === 'function') {
          state.onClosePopoverCallback();
        }
      });
    }
  }

  function init({ uiLang = 'en', onChange, onClosePopover } = {}) {
    state.uiLang = uiLang === 'ar' ? 'ar' : 'en';
    state.onChangeCallback = onChange || null;
    state.onClosePopoverCallback = onClosePopover || null;

    try {
      state.desktopLayout = normalizeDesktopLayout(localStorage.getItem(STORAGE_DESKTOP_KEY) || 'theater');
      state.mobileLayout = normalizeMobileLayout(localStorage.getItem(STORAGE_MOBILE_KEY) || 'docked');
      state.compactDock = localStorage.getItem(STORAGE_COMPACT_KEY) === '1';
    } catch {}

    const ws = getWorkspace();
    if (ws) {
      ws.setAttribute('data-layout', state.desktopLayout);
      ws.setAttribute('data-mobile-layout', state.mobileLayout);
      ws.setAttribute('data-compact-dock', state.compactDock ? '1' : '0');
    }
    document.documentElement.setAttribute('data-studio-mobile-layout', state.mobileLayout);

    applyCustomSplitsToWorkspace();
    state.lastViewportIsMobile = isMobileViewport();

    syncTriggerPill({ popAnimation: false });
    renderLayoutPopover();
    initSplitResizer();
    initMobileHelpers();
    syncMiniVideoChip();
    requestAnimationFrame(updateSplitResizerGeometry);

    if (ws && typeof ResizeObserver === 'function' && !state.resizeObserver) {
      state.resizeObserver = new ResizeObserver(() => {
        updateSplitResizerGeometry();
      });
      state.resizeObserver.observe(ws);
    }

    window.addEventListener(
      'resize',
      () => {
        const nowMobile = isMobileViewport();
        if (nowMobile !== state.lastViewportIsMobile) {
          state.lastViewportIsMobile = nowMobile;
          syncTriggerPill({ popAnimation: false });
          renderLayoutPopover();
          onPopoverStateChange(!document.getElementById('studio-layout-popover')?.hidden);
        }
        syncMiniVideoChip();
        updateSplitResizerGeometry();
      },
      { passive: true },
    );

    return getActiveMeta();
  }

  window.FlaptapStudioLayouts = {
    init,
    setLayout,
    cycleLayout,
    setCompactDock,
    resetSplitWidths,
    getActiveMeta,
    isMobileViewport,
    onPopoverStateChange,
    onUiLanguageChange,
    updateSplitResizerGeometry,
    DESKTOP_LAYOUTS,
    MOBILE_LAYOUTS,
  };
})();
