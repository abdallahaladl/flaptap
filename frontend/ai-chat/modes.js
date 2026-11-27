/* ==========================================================================
   FLAPTAP AI CHAT — EXTENSIBLE DISPLAY MODE REGISTRY (frontend/ai-chat/modes.js)
   Declarative, scalable mode architecture supporting Split View, Floating PiP,
   Overlay Sheet, Theater Modal, Full Page, and future custom display modes.
   ========================================================================== */

(function (global) {
  'use strict';

  const DEFAULT_MODE_ID = 'split';
  const DESKTOP_BREAKPOINT = 900;

  const registry = new Map();

  function registerMode(def) {
    if (!def || !def.id) {
      throw new Error('Display mode definition requires a valid "id".');
    }
    const id = String(def.id).trim();
    const normalized = {
      id,
      order: Number.isFinite(Number(def.order)) ? Number(def.order) : registry.size * 10 + 10,
      label: String(def.label || id),
      shortLabel: String(def.shortLabel || def.label || id),
      badge: def.badge ? String(def.badge) : '',
      description: String(def.description || ''),
      blocksPage: Boolean(def.blocksPage),
      pushesLayout: Boolean(def.pushesLayout),
      resizable: Boolean(def.resizable),
      draggable: Boolean(def.draggable),
      desktopOnly: Boolean(def.desktopOnly),
      mobileFallback: def.mobileFallback ? String(def.mobileFallback) : 'docked',
      isRouteMode: Boolean(def.isRouteMode),
      showInPicker: def.showInPicker !== false,
      iconSvg: String(def.iconSvg || ''),
    };
    registry.set(id, normalized);
    return normalized;
  }

  function getMode(id) {
    return registry.get(String(id || '').trim()) || null;
  }

  function listModes(opts = {}) {
    const all = Array.from(registry.values()).sort((a, b) => a.order - b.order);
    if (opts.includeHidden) return all;
    return all.filter((m) => m.showInPicker);
  }

  function resolveEffectiveMode(requestedId, viewportWidth) {
    const vw = Number.isFinite(Number(viewportWidth))
      ? Number(viewportWidth)
      : global.innerWidth || 1280;
    const mode = getMode(requestedId) || getMode(DEFAULT_MODE_ID) || getMode('docked');
    if (!mode) return null;
    if (mode.desktopOnly && vw <= DESKTOP_BREAKPOINT) {
      return getMode(mode.mobileFallback) || getMode('docked') || mode;
    }
    return mode;
  }

  // Register core built-in modes
  registerMode({
    id: 'split',
    order: 10,
    label: 'Split View',
    shortLabel: 'Split',
    badge: 'Co-pilot',
    description: 'Side-by-side · Use feature & AI together',
    blocksPage: false,
    pushesLayout: true,
    resizable: true,
    draggable: false,
    desktopOnly: true,
    mobileFallback: 'docked',
    iconSvg:
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"></rect><line x1="14" y1="4" x2="14" y2="20"></line></svg>',
  });

  registerMode({
    id: 'floating',
    order: 20,
    label: 'Floating Window',
    shortLabel: 'Float',
    badge: 'Co-pilot',
    description: 'Draggable window · Page stays interactive',
    blocksPage: false,
    pushesLayout: false,
    resizable: true,
    draggable: true,
    desktopOnly: true,
    mobileFallback: 'docked',
    iconSvg:
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"></rect><rect x="11" y="10" width="8" height="7" rx="1.5" fill="currentColor" fill-opacity="0.16"></rect></svg>',
  });

  registerMode({
    id: 'docked',
    order: 30,
    label: 'Overlay Sheet',
    shortLabel: 'Overlay',
    badge: '',
    description: 'Dimmed side sheet · Click outside to close',
    blocksPage: true,
    pushesLayout: false,
    resizable: true,
    draggable: false,
    desktopOnly: false,
    iconSvg:
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"></rect><rect x="13" y="5" width="7" height="14" rx="1.5" fill="currentColor" fill-opacity="0.18" stroke="none"></rect><line x1="13" y1="4" x2="13" y2="20"></line></svg>',
  });

  registerMode({
    id: 'expanded',
    order: 40,
    label: 'Theater Modal',
    shortLabel: 'Theater',
    badge: '',
    description: 'Centered wide modal · Deep reading',
    blocksPage: true,
    pushesLayout: false,
    resizable: false,
    draggable: false,
    desktopOnly: false,
    iconSvg:
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>',
  });

  registerMode({
    id: 'fullpage',
    order: 50,
    label: 'Full Page',
    shortLabel: 'Full',
    badge: '/chat',
    description: 'Dedicated /chat workspace with sidebar',
    blocksPage: false,
    pushesLayout: false,
    resizable: false,
    draggable: false,
    desktopOnly: false,
    isRouteMode: true,
    iconSvg:
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>',
  });

  global.FlaptapAiChatModes = {
    DEFAULT_MODE_ID,
    DESKTOP_BREAKPOINT,
    registerMode,
    getMode,
    listModes,
    resolveEffectiveMode,
  };
})(window);
