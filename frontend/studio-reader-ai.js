/* ==========================================================================
   FLAPTAP SHADOWING STUDIO — UNIFIED AI CHAT BRIDGE (studio-reader-ai.js)
   Connects Studio's topbar AI Tutor button, text selection Ask AI action,
   audio playback, and active lesson context into the universal FlaptapAiChat.
   ========================================================================== */

(function (global) {
  'use strict';

  const state = {
    lessonId: '',
    loadedThreadLessonId: '',
    handlers: {},
  };

  function getAi() {
    return global.FlaptapAiChat || null;
  }

  function resolveTrackContextType(track) {
    if (track === 'street_talk') return 'dialogue';
    if (track === 'phonetics') return 'phonetics';
    return 'media_hub';
  }

  function buildStudioContext() {
    const item = global.studioState?.item;
    if (!item) {
      return {
        type: 'media_hub',
        id: '',
        label: 'Media Hub Studio',
        subtitle: 'Active lesson studio',
      };
    }
    const mode = global.studioState?.mode || 'shadow';
    const readView = global.studioState?.readView || 'reviewed';
    const curSent =
      Array.isArray(item.sentences) && Number.isFinite(global.studioState?.activeIdx)
        ? item.sentences[global.studioState.activeIdx]
        : null;

    return {
      type: resolveTrackContextType(item.track),
      id: item.id,
      label: item.title || 'Studio Lesson',
      subtitle: `${mode.toUpperCase()} mode · ${readView === 'raw' ? 'Raw' : 'Reviewed'} transcript`,
      view: readView === 'raw' ? 'raw' : 'reviewed',
      payload: {
        mode,
        creator: item.creator || '',
        cefrLevel: item.cefrLevel || '',
        pacingWpm: item.pacingWpm || '',
        activeSentence: curSent ? `#${curSent.index}: ${curSent.text}` : undefined,
        sentenceIndex: curSent?.index,
        startMs: curSent?.startMs,
      },
    };
  }

  function syncTopButtonState() {
    const topBtn = document.getElementById('studio-ask-ai-btn');
    if (!topBtn) return;
    const isOpen = Boolean(getAi()?.isOpen?.());
    topBtn.classList.toggle('active', isOpen);
    topBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  function configure(handlers = {}) {
    Object.assign(state.handlers, handlers);
    const ai = getAi();
    if (!ai) return;
    ai.configure({
      playRange: handlers.playRange,
      speakText: handlers.speakText,
      showToast: handlers.showToast,
      seekToSeconds: (secs) => {
        if (handlers.playRange) {
          handlers.playRange(secs, secs + 6, { mode: 'range', label: 'Timestamp' });
        }
      },
    });
    ai.registerContextProvider('studio-lesson', buildStudioContext);
  }

  function bindDomEvents() {
    const ai = getAi();
    if (!ai) return;
    ai.boot();
    ai.registerContextProvider('studio-lesson', buildStudioContext);
    global.FlaptapAiChatStore?.subscribe?.((_s, reason) => {
      if (reason === 'display-mode' || reason === 'change' || reason === 'init') {
        syncTopButtonState();
      }
    });
    syncTopButtonState();
  }

  async function hydrate(item) {
    state.lessonId = item?.id || '';
    state.loadedThreadLessonId = '';
    const ai = getAi();
    if (!ai) return;
    ai.notifyContextChanged();
    if (item?.id && ai.isOpen?.()) {
      state.loadedThreadLessonId = item.id;
      const type = resolveTrackContextType(item.track);
      await ai.loadContextThread?.(type, item.id);
    }
  }

  function open(opts = {}) {
    const ai = getAi();
    if (!ai) return;
    if (state.lessonId && state.loadedThreadLessonId !== state.lessonId) {
      state.loadedThreadLessonId = state.lessonId;
      const type = resolveTrackContextType(global.studioState?.item?.track);
      void ai.loadContextThread?.(type, state.lessonId);
    }
    const ctx = buildStudioContext();
    ai.open({
      context: ctx,
      quote: opts.selection
        ? {
            text: String(opts.selection.text || '').trim(),
            startMs: opts.selection.startMs,
            endMs: opts.selection.endMs,
            sentenceIndex: opts.selection.sentenceIndex,
            speaker: opts.selection.speaker || '',
            view: opts.selection.view === 'raw' ? 'raw' : 'reviewed',
          }
        : undefined,
      prefill: opts.prefill,
    });
    syncTopButtonState();
  }

  function openWithSelection(selection) {
    open({ selection });
  }

  function toggle() {
    const ai = getAi();
    if (!ai) return;
    if (ai.isOpen()) ai.close();
    else open();
    syncTopButtonState();
  }

  function close() {
    getAi()?.close();
    syncTopButtonState();
  }

  function sendQuestion(text) {
    const ai = getAi();
    if (!ai) return;
    open();
    return ai.sendMessage(text);
  }

  global.FlaptapStudioReaderAi = {
    configure,
    bindDomEvents,
    hydrate,
    open,
    openWithSelection,
    toggle,
    close,
    isOpen: () => Boolean(getAi()?.isOpen?.()),
    sendQuestion,
  };
})(window);
