/* ==========================================================================
   FLAPTAP MODULAR WORKSPACE ROUTER & APP SHELL CONTROLLER (router.js)
   Single Source of Truth for Clean Dedicated URLs, History API (pushState /
   popstate), Refresh Persistence, Breadcrumbs, Sidebar Collapse & Mobile Drawer.
   ========================================================================== */

(function (global) {
  'use strict';

  const SIDEBAR_COLLAPSE_KEY = 'flaptap_sidebar_collapsed';

  const ROUTE_TABLE = {
    lessons: {
      section: 'lessons',
      path: '/',
      aliases: ['/lessons', '/index.html'],
      title: 'Video Lessons',
      i18nKey: 'navLessons',
      group: 'Studio',
    },
    dialogue: {
      section: 'dialogue',
      path: '/dialogue',
      aliases: [],
      title: 'Conversational Dialogue',
      i18nKey: 'navDialogue',
      group: 'Studio',
    },
    pronunciation: {
      section: 'pronunciation',
      path: '/pronunciation',
      aliases: [],
      title: 'Pronunciation Lab',
      i18nKey: 'navPronunciation',
      group: 'Studio',
    },
    'transcript-lab': {
      section: 'transcript-lab',
      path: '/transcripts',
      aliases: ['/transcript-lab'],
      title: 'Transcript Lab',
      i18nKey: 'navTranscriptLab',
      group: 'Studio',
    },
    'learning-library': {
      section: 'learning-library',
      path: '/library',
      aliases: ['/learning-library'],
      title: 'Generate Phrases',
      i18nKey: 'navLearningLibrary',
      group: 'Knowledge',
    },
    'american-extractor': {
      section: 'american-extractor',
      path: '/extractor',
      aliases: ['/american-extractor', '/american-english', '/phrases'],
      title: 'Anything to Phrases',
      i18nKey: 'navExtractor',
      group: 'Knowledge',
    },
    vocabulary: {
      section: 'vocabulary',
      path: '/vocabulary',
      aliases: [],
      title: 'Vocabulary Vault',
      i18nKey: 'navVocabulary',
      group: 'Knowledge',
    },
    history: {
      section: 'history',
      path: '/history',
      aliases: [],
      title: 'History & Usage',
      i18nKey: 'navHistory',
      group: 'Workspace',
    },
  };

  const listeners = new Set();
  let labelTranslator = null;
  let bound = false;

  function normalizePath(pathname) {
    const clean = String(pathname || '/').split('?')[0].trim();
    if (!clean || clean === '/') return '/';
    return clean.replace(/\/+$/, '') || '/';
  }

  function normalizeSectionAlias(raw) {
    const val = String(raw || '').trim().toLowerCase();
    if (val === 'library' || val === 'learning-library') return 'learning-library';
    if (
      val === 'extractor' ||
      val === 'american-english' ||
      val === 'american-extractor' ||
      val === 'phrases' ||
      val === 'anything-to-phrases'
    ) {
      return 'american-extractor';
    }
    if (
      val === 'transcripts' ||
      val === 'transcript-lab' ||
      val === 'transcribe'
    ) {
      return 'transcript-lab';
    }
    if (ROUTE_TABLE[val]) return val;
    return null;
  }

  function parseLocation(loc = global.location) {
    const pathname = normalizePath(loc.pathname);
    const params = new URLSearchParams(loc.search || '');

    // Sub-routes: Learning Library
    if (pathname === '/library/browse' || pathname === '/learning-library/browse') {
      return {
        section: 'learning-library',
        subview: 'browse',
        domainId: params.get('domain') || '',
        noteId: '',
        searchParams: params,
        canonicalizedFromQuery: false,
      };
    }

    // Sub-routes: Anything to Phrases (/extractor, /extractor/library, /extractor/library/:id)
    if (
      pathname === '/extractor/library' ||
      pathname === '/american-extractor/library' ||
      pathname === '/phrases/library'
    ) {
      return {
        section: 'american-extractor',
        subview: 'library',
        domainId: '',
        noteId: '',
        searchParams: params,
        canonicalizedFromQuery: false,
      };
    }
    if (
      pathname.startsWith('/extractor/library/') ||
      pathname.startsWith('/american-extractor/library/') ||
      pathname.startsWith('/phrases/library/') ||
      pathname.startsWith('/extractor/note/') ||
      pathname.startsWith('/american-extractor/note/') ||
      pathname.startsWith('/phrases/note/')
    ) {
      const parts = pathname.split('/');
      const noteId = decodeURIComponent(parts[parts.length - 1] || '');
      return {
        section: 'american-extractor',
        subview: noteId ? 'detail' : 'library',
        domainId: '',
        noteId,
        searchParams: params,
        canonicalizedFromQuery: false,
      };
    }

    // Sub-routes: Transcript Lab (/transcripts, /transcripts/library, /transcripts/:id)
    if (pathname === '/transcripts/library' || pathname === '/transcript-lab/library') {
      return {
        section: 'transcript-lab',
        subview: 'library',
        domainId: '',
        noteId: '',
        docId: '',
        searchParams: params,
        canonicalizedFromQuery: false,
      };
    }
    if (pathname.startsWith('/transcripts/') || pathname.startsWith('/transcript-lab/')) {
      const parts = pathname.split('/').filter(Boolean);
      const last = decodeURIComponent(parts[parts.length - 1] || '');
      const docId = last && last !== 'view' && last !== 'library' ? last : '';
      return {
        section: 'transcript-lab',
        subview: docId ? 'view' : 'library',
        domainId: '',
        noteId: '',
        docId,
        searchParams: params,
        canonicalizedFromQuery: false,
      };
    }

    // Exact path lookup across canonical routes + aliases
    for (const def of Object.values(ROUTE_TABLE)) {
      if (def.path === pathname || def.aliases.includes(pathname)) {
        // Legacy `?section=...` on `/` (only convert when explicitly requested on root)
        if (def.section === 'lessons' && params.has('section')) {
          const legacyTarget = normalizeSectionAlias(params.get('section'));
          if (legacyTarget) {
            return {
              section: legacyTarget,
              subview: params.get('view') || '',
              domainId: params.get('domain') || '',
              noteId: params.get('note') || '',
              searchParams: params,
              canonicalizedFromQuery: true,
            };
          }
        }
        return {
          section: def.section,
          subview: params.get('view') || '',
          domainId: params.get('domain') || '',
          noteId: params.get('note') || '',
          searchParams: params,
          canonicalizedFromQuery: false,
        };
      }
    }

    // Unknown workspace path defaults safely to Lessons
    return {
      section: 'lessons',
      subview: '',
      domainId: '',
      noteId: '',
      searchParams: params,
      canonicalizedFromQuery: false,
    };
  }

  function buildUrl(section, options = {}) {
    const def = ROUTE_TABLE[section] || ROUTE_TABLE.lessons;
    let pathname = def.path;
    const nextParams = new URLSearchParams();

    // Preserve explicit safe auth redirect params if requested
    if (options.preserveAuthParams) {
      const cur = new URLSearchParams(global.location.search || '');
      ['auth', 'next', 'auth_error', 'needed_uri'].forEach((k) => {
        if (cur.has(k)) nextParams.set(k, cur.get(k));
      });
    }

    if (section === 'learning-library') {
      if (options.subview === 'browse') {
        pathname = '/library/browse';
      } else {
        pathname = '/library';
      }
      if (options.domainId && options.domainId !== 'natural_american_english') {
        nextParams.set('domain', options.domainId);
      }
    } else if (section === 'american-extractor') {
      if (options.subview === 'library') {
        pathname = '/extractor/library';
      } else if ((options.subview === 'detail' || options.subview === 'note') && options.noteId) {
        pathname = `/extractor/library/${encodeURIComponent(options.noteId)}`;
      } else {
        pathname = '/extractor';
      }
    } else if (section === 'transcript-lab') {
      if (options.subview === 'library') {
        pathname = '/transcripts/library';
      } else if (options.subview === 'view' && options.docId) {
        pathname = `/transcripts/${encodeURIComponent(options.docId)}`;
        if (options.view && options.view !== 'sentences') {
          nextParams.set('view', options.view);
        }
      } else {
        pathname = '/transcripts';
      }
    } else if (section === 'vocabulary') {
      if (options.subview === 'flashcards') {
        nextParams.set('view', 'flashcards');
      }
      if (options.filter && options.filter !== 'all') {
        nextParams.set('filter', options.filter);
      }
    } else if (section === 'history') {
      if (options.track && options.track !== 'all') {
        nextParams.set('track', options.track);
      }
      if (options.cache && options.cache !== 'all') {
        nextParams.set('cache', options.cache);
      }
    }

    if (options.extraQuery && typeof options.extraQuery === 'object') {
      Object.entries(options.extraQuery).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v) !== '') {
          nextParams.set(k, String(v));
        }
      });
    }

    const qs = nextParams.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function getSubViewLabel(route) {
    if (route.section === 'learning-library') {
      if (route.subview === 'browse') return 'Browse Library';
      return '';
    }
    if (route.section === 'american-extractor') {
      if (route.subview === 'library') return 'Library';
      if (route.subview === 'detail' || route.subview === 'note') return 'Study Guide';
      return '';
    }
    if (route.section === 'transcript-lab') {
      if (route.subview === 'library') return 'Library';
      if (route.subview === 'view') return 'Workbench';
      return '';
    }
    if (route.section === 'vocabulary') {
      if (route.subview === 'flashcards') return 'Flashcards';
      return '';
    }
    return '';
  }

  function updateDocumentAndChrome(route) {
    const def = ROUTE_TABLE[route.section] || ROUTE_TABLE.lessons;
    const translatedTitle =
      typeof labelTranslator === 'function' ? labelTranslator(def.i18nKey) || def.title : def.title;
    const subLabel = getSubViewLabel(route);

    document.title = subLabel
      ? `${translatedTitle} · ${subLabel} — Flaptap`
      : route.section === 'lessons'
        ? 'Flaptap — Spoken English Studio'
        : `${translatedTitle} — Flaptap`;

    // Sync left primary sidebar active link & ARIA
    document.querySelectorAll('.sidebar-nav-link[data-route-section]').forEach((link) => {
      const isAct = link.dataset.routeSection === route.section;
      link.classList.toggle('active', isAct);
      if (isAct) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    // Sync crisp contextual Apple path bar inside the topbar
    const crumbEl = document.getElementById('topbar-breadcrumb');
    if (crumbEl) {
      const makeChevron = () => {
        const sep = document.createElement('span');
        sep.className = 'crumb-sep';
        sep.setAttribute('aria-hidden', 'true');
        sep.innerHTML =
          '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
        return sep;
      };

      crumbEl.replaceChildren();

      const groupSpan = document.createElement('span');
      groupSpan.className = 'crumb-group';
      groupSpan.textContent = def.group;
      crumbEl.appendChild(groupSpan);
      crumbEl.appendChild(makeChevron());

      if (subLabel) {
        const parentBtn = document.createElement('button');
        parentBtn.type = 'button';
        parentBtn.className = 'crumb-parent crumb-parent-btn';
        parentBtn.setAttribute('data-route-section', route.section);
        parentBtn.textContent = translatedTitle;
        crumbEl.appendChild(parentBtn);
        crumbEl.appendChild(makeChevron());

        const subSpan = document.createElement('span');
        subSpan.className = 'crumb-current';
        subSpan.textContent = subLabel;
        crumbEl.appendChild(subSpan);
      } else {
        const curSpan = document.createElement('span');
        curSpan.className = 'crumb-current';
        curSpan.textContent = translatedTitle;
        crumbEl.appendChild(curSpan);
      }
    }
  }

  function emitRouteChange(route, meta = {}) {
    updateDocumentAndChrome(route);
    for (const fn of listeners) {
      try {
        fn(route, meta);
      } catch (err) {
        console.error('FlaptapRouter listener error:', err);
      }
    }
  }

  function navigate(targetSection, options = {}) {
    const resolvedSection = normalizeSectionAlias(targetSection) || 'lessons';
    const nextUrl = buildUrl(resolvedSection, options);
    const currentFull = `${normalizePath(global.location.pathname)}${global.location.search || ''}`;

    if (nextUrl !== currentFull) {
      if (options.replace) {
        global.history.replaceState({ section: resolvedSection, options }, '', nextUrl);
      } else {
        global.history.pushState({ section: resolvedSection, options }, '', nextUrl);
      }
    }

    const route = parseLocation(global.location);
    closeMobileDrawer();
    emitRouteChange(route, { source: options.replace ? 'replace' : 'navigate', ...options });
    return route;
  }

  function updateSubroute(section, options = {}) {
    const current = parseLocation(global.location);
    if (current.section !== section) return;
    const nextUrl = buildUrl(section, options);
    const currentFull = `${normalizePath(global.location.pathname)}${global.location.search || ''}`;

    if (nextUrl !== currentFull) {
      if (options.replace) {
        global.history.replaceState({ section, options }, '', nextUrl);
      } else {
        global.history.pushState({ section, options }, '', nextUrl);
      }
    }
    const updated = parseLocation(global.location);
    updateDocumentAndChrome(updated);
    return updated;
  }

  function canonicalizeInitialUrl() {
    const parsed = parseLocation(global.location);
    if (parsed.canonicalizedFromQuery) {
      const clean = buildUrl(parsed.section, {
        subview: parsed.subview,
        domainId: parsed.domainId,
        noteId: parsed.noteId,
        preserveAuthParams: true,
      });
      global.history.replaceState({ section: parsed.section }, '', clean);
    } else if (
      normalizePath(global.location.pathname) === '/index.html' ||
      normalizePath(global.location.pathname) === '/lessons' ||
      normalizePath(global.location.pathname) === '/learning-library' ||
      normalizePath(global.location.pathname) === '/american-extractor' ||
      normalizePath(global.location.pathname) === '/american-english' ||
      normalizePath(global.location.pathname) === '/phrases' ||
      normalizePath(global.location.pathname) === '/transcript-lab'
    ) {
      const clean = buildUrl(parsed.section, {
        subview: parsed.subview,
        domainId: parsed.domainId,
        noteId: parsed.noteId,
        preserveAuthParams: true,
      });
      global.history.replaceState({ section: parsed.section }, '', clean);
    }
    return parseLocation(global.location);
  }

  /* ========================================================================
     SIDEBAR COLLAPSE & MOBILE DRAWER CONTROLS
     ======================================================================== */

  function applySidebarCollapsedState(collapsed) {
    const isCollapsed = Boolean(collapsed);
    if (isCollapsed) {
      document.documentElement.setAttribute('data-sidebar', 'collapsed');
    } else {
      document.documentElement.removeAttribute('data-sidebar');
    }
    try {
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, isCollapsed ? '1' : '0');
    } catch {}
    const btn = document.getElementById('sidebar-collapse-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      btn.setAttribute('title', isCollapsed ? 'Expand sidebar (Cmd+B)' : 'Collapse sidebar (Cmd+B)');
    }
  }

  function toggleSidebarCollapsed() {
    const currentlyCollapsed = document.documentElement.getAttribute('data-sidebar') === 'collapsed';
    applySidebarCollapsedState(!currentlyCollapsed);
  }

  function openMobileDrawer() {
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const mobileBtn = document.getElementById('mobile-nav-btn');
    if (sidebar) sidebar.classList.add('is-mobile-open');
    if (backdrop) backdrop.hidden = false;
    if (mobileBtn) mobileBtn.setAttribute('aria-expanded', 'true');
  }

  function closeMobileDrawer() {
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const mobileBtn = document.getElementById('mobile-nav-btn');
    if (sidebar) sidebar.classList.remove('is-mobile-open');
    if (backdrop) backdrop.hidden = true;
    if (mobileBtn) mobileBtn.setAttribute('aria-expanded', 'false');
  }

  function bindChromeEvents() {
    if (bound) return;
    bound = true;

    // Intercept dedicated sidebar & internal route links (preserve Ctrl/Cmd/middle click)
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-route-section], button[data-route-section]');
      if (!link) return;
      if (link.tagName === 'A') {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
      }
      const targetSection = link.getAttribute('data-route-section');
      const targetSubview = link.getAttribute('data-route-subview') || '';
      if (targetSection) {
        navigate(targetSection, { subview: targetSubview });
      }
    });

    document.getElementById('sidebar-collapse-btn')?.addEventListener('click', toggleSidebarCollapsed);
    document.getElementById('mobile-nav-btn')?.addEventListener('click', openMobileDrawer);
    document.getElementById('sidebar-close-btn')?.addEventListener('click', closeMobileDrawer);
    document.getElementById('sidebar-backdrop')?.addEventListener('click', closeMobileDrawer);

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        const tag = (e.target?.tagName || '').toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && !e.target?.isContentEditable) {
          e.preventDefault();
          toggleSidebarCollapsed();
        }
      } else if (e.key === 'Escape') {
        closeMobileDrawer();
      }
    });

    global.addEventListener('popstate', () => {
      const route = parseLocation(global.location);
      closeMobileDrawer();
      emitRouteChange(route, { source: 'popstate' });
    });
  }

  function initShell(options = {}) {
    if (typeof options.translator === 'function') {
      labelTranslator = options.translator;
    }
    try {
      const savedCollapsed = localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1';
      applySidebarCollapsedState(savedCollapsed);
    } catch {}
    bindChromeEvents();
    const initialRoute = canonicalizeInitialUrl();
    updateDocumentAndChrome(initialRoute);
    return initialRoute;
  }

  global.FlaptapRouter = {
    ROUTES: ROUTE_TABLE,
    initShell,
    parseLocation,
    getCurrentRoute: () => parseLocation(global.location),
    buildUrl,
    navigate,
    updateSubroute,
    refreshChrome: () => updateDocumentAndChrome(parseLocation(global.location)),
    onRouteChange: (fn) => {
      if (typeof fn === 'function') listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
})(window);
