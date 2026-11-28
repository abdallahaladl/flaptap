/* ==========================================================================
   FLAPTAP SHADOWING STUDIO — UNIFIED MODE CAPABILITIES & TRANSITION ENGINE
   Single source of truth for per-mode chrome visibility, isolated filters &
   search state, lazy view dirty-tracking, mode-aware playback flow, and
   non-spoiling Listen/Dictation transitions across all 5 Studio modes.
   ========================================================================== */

(function (global) {
  'use strict';

  const VALID_MODES = ['shadow', 'read', 'listen', 'insights', 'notes'];
  const VALID_READ_VIEWS = ['paragraphs', 'ideas', 'speakers', 'raw'];
  const VALID_FILTERS = ['all', 'remaining', 'completed'];

  function normalizeMode(mode) {
    if (mode === 'extract' || mode === 'coach') return 'insights';
    return VALID_MODES.includes(mode) ? mode : 'shadow';
  }

  function normalizeReadView(view) {
    return VALID_READ_VIEWS.includes(view) ? view : 'paragraphs';
  }

  function createModeState() {
    return {
      completionFilterByMode: { shadow: 'all', read: 'all', insights: 'all', coach: 'all' },
      searchQueryByMode: { shadow: '', read: '', insights: '', coach: '' },
      dirtyViews: {
        shadow: true,
        'read:paragraphs': true,
        'read:ideas': true,
        'read:speakers': true,
        'read:raw': true,
      },
    };
  }

  function getViewKey(mode, readView) {
    const m = normalizeMode(mode);
    if (m === 'read') return `read:${normalizeReadView(readView)}`;
    return m;
  }

  function markAllViewsDirty(modeState) {
    if (!modeState || !modeState.dirtyViews) return;
    Object.keys(modeState.dirtyViews).forEach((key) => {
      modeState.dirtyViews[key] = true;
    });
  }

  function markViewClean(modeState, key) {
    if (!modeState || !modeState.dirtyViews || !key) return;
    if (key in modeState.dirtyViews) {
      modeState.dirtyViews[key] = false;
    }
  }

  function isViewDirty(modeState, key) {
    if (!modeState || !modeState.dirtyViews || !key) return true;
    return modeState.dirtyViews[key] !== false;
  }

  function getCompletionFilter(modeState, mode) {
    const m = normalizeMode(mode);
    if (!modeState?.completionFilterByMode || !(m in modeState.completionFilterByMode)) {
      return 'all';
    }
    const val = modeState.completionFilterByMode[m];
    return VALID_FILTERS.includes(val) ? val : 'all';
  }

  function setCompletionFilter(modeState, mode, value) {
    const m = normalizeMode(mode);
    const next = VALID_FILTERS.includes(value) ? value : 'all';
    if (modeState?.completionFilterByMode && m in modeState.completionFilterByMode) {
      modeState.completionFilterByMode[m] = next;
    }
    return next;
  }

  function getSearchQuery(modeState, mode) {
    const m = normalizeMode(mode);
    if (!modeState?.searchQueryByMode || !(m in modeState.searchQueryByMode)) {
      return '';
    }
    return String(modeState.searchQueryByMode[m] || '');
  }

  function setSearchQuery(modeState, mode, query) {
    const m = normalizeMode(mode);
    const clean = String(query ?? '');
    if (modeState?.searchQueryByMode && m in modeState.searchQueryByMode) {
      modeState.searchQueryByMode[m] = clean;
    }
    return clean;
  }

  /**
   * Computes exact UI capabilities for the active mode, sub-view, and lesson track/media.
   */
  function resolveCapabilities(ctx = {}) {
    const mode = normalizeMode(ctx.mode);
    const readView = normalizeReadView(ctx.readView);
    const item = ctx.item || null;
    const isMediaHubTrack = Boolean(item && (item.track === 'media_hub' || item.track === 'shadowing'));
    const isShadowingTrack = isMediaHubTrack;
    const hasTranscriptData = Boolean(isMediaHubTrack && item.transcriptData);
    const hasCoachContent = Boolean(item && item.aiAnalysis);
    const isReadParagraphs = mode === 'read' && readView === 'paragraphs';
    const isReadRaw = mode === 'read' && readView === 'raw';

    return {
      mode,
      readView,
      isShadowingTrack,
      hasTranscriptData,
      hasCoachContent,
      isReadParagraphs,
      isReadRaw,
      showReadSubbar: mode === 'read' && hasTranscriptData,
      showToolsBar: mode === 'shadow' || mode === 'read',
      showSearch: mode === 'shadow' || mode === 'read',
      searchPlaceholder: mode === 'shadow' ? 'Search sentences...' : 'Search transcript...',
      showPacing: mode === 'shadow' && isShadowingTrack,
      showKaraokeToggle: (mode === 'shadow' || mode === 'read') && Boolean(ctx.hasTimedMedia),
      showRepairsToggle:
        (mode === 'shadow' || (mode === 'read' && !isReadRaw)) && Number(ctx.repairCount) > 0,
      showToolsMenu: mode === 'shadow' || mode === 'read',
      showSpeakerBar:
        (mode === 'shadow' || (mode === 'read' && !isReadRaw)) &&
        (Number(ctx.speakerCount) > 1 || Boolean(ctx.speakerEditorOpen)),
      showProgressDock: mode === 'shadow' || isReadParagraphs || mode === 'listen',
      showCompletionFilter: mode === 'shadow' || isReadParagraphs,
      showActiveJump: mode === 'shadow' || mode === 'read',
      showTranslationTrigger: mode === 'shadow',
      maskDeckSubtitle: mode === 'listen',
      showBookmarkPill:
        mode === 'read' && (isReadParagraphs || isReadRaw) && Boolean(ctx.hasBookmark),
      showVideoToggle: Boolean(ctx.hasVideo),
    };
  }

  /**
   * Atomically applies resolved capability flags to Studio chrome DOM elements so
   * zero stale controls, filters, or badges remain visible across mode switches.
   */
  function applyChrome(caps, els = {}) {
    if (!caps) return;
    if (els.toolsBar) els.toolsBar.hidden = !caps.showToolsBar;
    if (els.readSubbarWrap) els.readSubbarWrap.hidden = !caps.showReadSubbar;
    if (els.readSubbar) els.readSubbar.hidden = !caps.showReadSubbar;
    if (els.searchWrap) els.searchWrap.hidden = !caps.showSearch;
    if (els.mobileSearchToggle) els.mobileSearchToggle.hidden = !caps.showSearch;
    if (els.searchInput && els.searchInput.placeholder !== caps.searchPlaceholder) {
      els.searchInput.placeholder = caps.searchPlaceholder;
      els.searchInput.setAttribute('aria-label', caps.searchPlaceholder);
    }
    if (els.pacingGroup) els.pacingGroup.hidden = !caps.showPacing;
    if (els.karaokeBtn) els.karaokeBtn.hidden = !caps.showKaraokeToggle;
    if (els.repairsBtn) els.repairsBtn.hidden = !caps.showRepairsToggle;
    if (els.toolsMenuBtn) els.toolsMenuBtn.hidden = !caps.showToolsMenu;
    if (els.speakerBar && !caps.showSpeakerBar) {
      els.speakerBar.hidden = true;
    }
    if (els.progressDock) els.progressDock.hidden = !caps.showProgressDock;
    if (els.compFilter) els.compFilter.hidden = !caps.showCompletionFilter;
    if (els.activeJumpBtn) els.activeJumpBtn.hidden = !caps.showActiveJump;
    if (els.transTrigger) els.transTrigger.hidden = !caps.showTranslationTrigger;
    if (els.transDeck && !caps.showTranslationTrigger) {
      els.transDeck.hidden = true;
      els.transDeck.style.display = 'none';
    }
    if (els.bookmarkPill) els.bookmarkPill.hidden = !caps.showBookmarkPill;
    if (els.videoToggleBtn) els.videoToggleBtn.hidden = !caps.showVideoToggle;
  }

  /**
   * Resolves effective end-of-sentence playback behavior per active mode while
   * preserving the learner's Shadow flow preference when returning to Shadow.
   */
  function resolveEffectiveFlow(mode, userFlow) {
    const m = normalizeMode(mode);
    const flow = userFlow || 'loop';
    if (m === 'shadow') return flow;
    if (m === 'read') {
      return flow === 'loop' || flow === 'shadow' || flow === 'word' ? 'continue' : flow;
    }
    if (m === 'listen' || m === 'insights') {
      return 'pause';
    }
    if (m === 'notes') {
      return flow === 'shadow' || flow === 'word' ? 'continue' : flow;
    }
    return flow;
  }

  /**
   * Computes deterministic transition side-effects when moving between Studio modes.
   */
  function computeTransitionPlan(prevMode, nextMode, ctx = {}) {
    const prev = normalizeMode(prevMode);
    const next = normalizeMode(nextMode);
    const sameMode = prev === next;
    const plan = {
      cancelShadowPause: prev === 'shadow' && next !== 'shadow',
      syncDictationToActive: false,
      pauseIfPlayingMismatch: false,
      resetUserScrolledAway: false,
      scrollActiveIfAutoFollow: false,
    };

    if (next === 'listen') {
      const activeIdx = Number(ctx.activeSentence?.index);
      const dictIdx = Number(ctx.dictationIndex) || 1;
      plan.syncDictationToActive = Number.isFinite(activeIdx) && activeIdx >= 1;
      if (ctx.isPlaying && (ctx.activeRange || (plan.syncDictationToActive && activeIdx !== dictIdx) || !sameMode)) {
        plan.pauseIfPlayingMismatch = true;
      }
      return plan;
    }

    if (!sameMode && next === 'shadow') {
      plan.resetUserScrolledAway = true;
      plan.scrollActiveIfAutoFollow = true;
    } else if (!sameMode && next === 'read') {
      plan.scrollActiveIfAutoFollow = true;
    }

    return plan;
  }

  global.FlaptapStudioModeController = {
    VALID_MODES,
    VALID_READ_VIEWS,
    VALID_FILTERS,
    createModeState,
    getViewKey,
    markAllViewsDirty,
    markViewClean,
    isViewDirty,
    getCompletionFilter,
    setCompletionFilter,
    getSearchQuery,
    setSearchQuery,
    resolveCapabilities,
    applyChrome,
    resolveEffectiveFlow,
    computeTransitionPlan,
  };
})(window);
