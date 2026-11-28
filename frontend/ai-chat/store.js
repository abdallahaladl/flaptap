/* ==========================================================================
   FLAPTAP AI CHAT — REACTIVE STATE STORE (frontend/ai-chat/store.js)
   Manages threads, active conversation, preferences, streaming lifecycle,
   page context attachment, quote excerpts, and image attachments.
   ========================================================================== */

(function (global) {
  'use strict';

  const DISPLAY_MODE_KEY = 'flaptap_ai_chat_display_mode';
  const SIDEBAR_WIDTH_KEY = 'flaptap_ai_chat_drawer_width';
  const FLOAT_POS_KEY = 'flaptap_ai_chat_float_pos';

  const Api = () => global.FlaptapAiChatApi;
  const Ctx = () => global.FlaptapAiContext;
  const Modes = () => global.FlaptapAiChatModes;

  function readInitialOverlayMode() {
    try {
      const saved = String(localStorage.getItem(DISPLAY_MODE_KEY) || '').trim();
      if (saved && saved !== 'fullpage' && (!Modes() || Modes().getMode(saved))) {
        return saved;
      }
    } catch {}
    return Modes()?.DEFAULT_MODE_ID || 'split';
  }

  function readInitialFloatingPos() {
    try {
      const raw = localStorage.getItem(FLOAT_POS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Number.isFinite(Number(parsed?.x)) && Number.isFinite(Number(parsed?.y))) {
        return { x: Number(parsed.x), y: Number(parsed.y) };
      }
    } catch {}
    return null;
  }

  const initialMode = readInitialOverlayMode();

  const state = {
    initialized: false,
    isOpen: false,
    displayMode: initialMode,
    lastOverlayMode: initialMode,
    drawerWidth: Number(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || 430,
    floatingPos: readInitialFloatingPos(),
    sidebarOpen: false,
    modePopoverOpen: false,
    modelPanelOpen: false,
    settingsPanelOpen: false,
    contextPopoverOpen: false,
    slashMenuOpen: false,
    slashFilter: '',
    slashActiveIdx: 0,

    config: {
      personas: [],
      responseStyles: [],
      languageModes: [],
    },
    preferences: {
      defaultPersona: 'smart_mentor',
      responseStyle: 'balanced',
      responseLanguage: 'auto',
      temperature: 0.45,
      customInstructions: '',
      usePageContext: true,
    },

    threads: [],
    threadsLoaded: false,
    threadSearch: '',
    activeThreadId: '',
    activeThread: null,
    messages: [],

    personaOverride: '',
    usePageContext: true,
    attachedQuote: null, // { text, speaker, startMs, endMs, sentenceIndex, view, sourceLabel }
    attachedImages: [], // [{ mimeType, base64, previewDataUrl, name }]
    explicitContext: null, // Temporary override passed via openWithContext

    editingMessageId: '',
    streaming: false,
    streamingMsgId: '',
    abortCtrl: null,
    errorText: '',

    handlers: {
      playRange: null,
      seekToSeconds: null,
      speakText: null,
      showToast: null,
      getActiveModelSelection: null,
      onAuthRequired: null,
    },
  };

  const listeners = new Set();

  function emit(reason = 'change') {
    listeners.forEach((fn) => {
      try {
        fn(state, reason);
      } catch {}
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function isAuthenticated() {
    if (global.FlaptapWorkspace?.getUser) {
      return Boolean(global.FlaptapWorkspace.getUser());
    }
    if (global.studioState && 'user' in global.studioState) {
      return Boolean(global.studioState.user);
    }
    try {
      return Boolean(localStorage.getItem('flaptap_auth_token'));
    } catch {
      return false;
    }
  }

  function getEffectiveContext() {
    if (state.explicitContext) return state.explicitContext;
    return Ctx()?.getActiveContext?.() || { type: 'general', label: 'Flaptap AI' };
  }

  function getActivePersona() {
    return (
      state.personaOverride ||
      state.activeThread?.persona ||
      state.preferences.defaultPersona ||
      'smart_mentor'
    );
  }

  function showToast(msg) {
    if (state.handlers.showToast) {
      state.handlers.showToast(msg);
      return;
    }
    if (global.FlaptapWorkspace?.showToast) {
      global.FlaptapWorkspace.showToast(msg);
      return;
    }
    if (global.FlaptapUtils?.showToast) {
      global.FlaptapUtils.showToast(msg);
    }
  }

  function ensureAuth(pendingAction) {
    if (isAuthenticated()) return true;
    if (state.handlers.onAuthRequired) {
      state.handlers.onAuthRequired(pendingAction);
      return false;
    }
    if (global.FlaptapWorkspace?.requireAuthBeforeAction) {
      return global.FlaptapWorkspace.requireAuthBeforeAction(
        pendingAction || { type: 'open_ai_chat' },
        'Sign in to chat with Flaptap AI, save conversation history, and use voice.',
      );
    }
    showToast('Please sign in first to chat with Flaptap AI.');
    const next = encodeURIComponent(`${global.location.pathname}${global.location.search || ''}`);
    global.location.href = `/?auth=1&next=${next}`;
    return false;
  }

  async function init() {
    if (state.initialized) return;
    state.initialized = true;
    try {
      const cfg = await Api().getConfig();
      if (cfg) {
        state.config = {
          personas: Array.isArray(cfg.personas) ? cfg.personas : [],
          responseStyles: Array.isArray(cfg.responseStyles) ? cfg.responseStyles : [],
          languageModes: Array.isArray(cfg.languageModes) ? cfg.languageModes : [],
        };
      }
    } catch {}

    if (isAuthenticated()) {
      await loadAccountState();
    }
    emit('init');
  }

  async function loadAccountState(force = false) {
    if (!isAuthenticated()) return;
    if (state.threadsLoaded && !force) return;
    try {
      const [prefRes, threadsRes] = await Promise.all([
        Api().getPreferences().catch(() => null),
        Api().listThreads({ limit: 80 }).catch(() => null),
      ]);
      if (prefRes?.preferences) {
        state.preferences = { ...state.preferences, ...prefRes.preferences };
        state.usePageContext = state.preferences.usePageContext !== false;
      }
      if (Array.isArray(threadsRes?.threads)) {
        state.threads = threadsRes.threads;
        state.threadsLoaded = true;
      }
      emit('account');
    } catch {}
  }

  async function refreshThreads(searchQuery) {
    if (!isAuthenticated()) return;
    if (searchQuery !== undefined) state.threadSearch = searchQuery;
    try {
      const res = await Api().listThreads({
        q: state.threadSearch || undefined,
        limit: 80,
      });
      if (Array.isArray(res?.threads)) {
        state.threads = res.threads;
        state.threadsLoaded = true;
        emit('threads');
      }
    } catch {}
  }

  async function selectThread(threadId) {
    if (!threadId) return;
    if (!ensureAuth({ type: 'open_ai_chat', threadId })) return;
    try {
      const res = await Api().getThread(threadId);
      if (res?.thread) {
        state.activeThread = res.thread;
        state.activeThreadId = res.thread.id;
        state.messages = Array.isArray(res.messages) ? res.messages : [];
        state.personaOverride = res.thread.persona || '';
        state.editingMessageId = '';
        emit('thread');
      }
    } catch (err) {
      showToast(err?.message || 'Could not load conversation.');
    }
  }

  async function loadContextThread(contextType, contextId) {
    if (!contextType || !contextId || !isAuthenticated()) return false;
    try {
      const res = await Api().getThreadByContext(contextType, contextId);
      if (res?.thread) {
        state.activeThread = res.thread;
        state.activeThreadId = res.thread.id;
        state.messages = Array.isArray(res.messages) ? res.messages : [];
        state.personaOverride = res.thread.persona || '';
        emit('thread');
        return true;
      }
    } catch {}
    return false;
  }

  function startNewChat({ clearQuote = true, clearExplicitContext = false } = {}) {
    if (state.streaming && state.abortCtrl) {
      state.abortCtrl.abort();
    }
    state.activeThreadId = '';
    state.activeThread = null;
    state.messages = [];
    state.editingMessageId = '';
    state.errorText = '';
    state.personaOverride = '';
    if (clearQuote) state.attachedQuote = null;
    if (clearExplicitContext) state.explicitContext = null;
    state.attachedImages = [];
    emit('thread');
  }

  function upsertThreadInList(thread) {
    if (!thread?.id) return;
    const idx = state.threads.findIndex((t) => t.id === thread.id);
    if (idx !== -1) {
      state.threads[idx] = thread;
    } else {
      state.threads.unshift(thread);
    }
    state.threads.sort((a, b) => {
      if (Boolean(b.isPinned) !== Boolean(a.isPinned)) return b.isPinned ? 1 : -1;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
  }

  async function sendMessage(rawText) {
    const content = String(rawText || '').trim();
    if (!content || state.streaming) return;
    if (!ensureAuth({ type: 'open_ai_chat' })) return;

    const ctx = getEffectiveContext();
    const quote = state.attachedQuote ? { ...state.attachedQuote } : undefined;
    const images = state.attachedImages.map((img) => ({
      mimeType: img.mimeType,
      base64: img.base64,
      name: img.name,
    }));
    const modelSel = state.handlers.getActiveModelSelection?.() || {};

    const tempUserId = `tmp_u_${Date.now()}`;
    const tempAsstId = `tmp_a_${Date.now()}`;

    state.messages.push(
      {
        id: tempUserId,
        role: 'user',
        content,
        quote,
        attachments: state.attachedImages.map((i) => ({
          mimeType: i.mimeType,
          name: i.name,
          previewDataUrl: i.previewDataUrl,
        })),
        createdAt: new Date().toISOString(),
      },
      {
        id: tempAsstId,
        role: 'assistant',
        content: '',
        reasoning: '',
        pending: true,
        createdAt: new Date().toISOString(),
      },
    );

    // Clear composer attachments once dispatched
    state.attachedImages = [];
    state.errorText = '';
    state.streaming = true;
    state.streamingMsgId = tempAsstId;
    const ac = new AbortController();
    state.abortCtrl = ac;
    emit('messages');

    const payload = {
      content,
      persona: getActivePersona(),
      responseStyle: state.preferences.responseStyle,
      responseLanguage: state.preferences.responseLanguage,
      temperature: state.preferences.temperature,
      usePageContext: state.usePageContext,
      context: state.usePageContext ? ctx : { type: 'general' },
      quote,
      images: images.length ? images : undefined,
      keyId: modelSel.keyId || undefined,
      model: modelSel.model || modelSel.modelId || undefined,
      variant: modelSel.variant || modelSel.variantId || undefined,
    };

    try {
      const streamCall = state.activeThreadId
        ? (h) => Api().sendToThreadStream(state.activeThreadId, payload, h)
        : (h) => Api().askStream(payload, h);

      const done = await streamCall({
        signal: ac.signal,
        onThread: (thread) => {
          state.activeThread = thread;
          state.activeThreadId = thread.id;
          upsertThreadInList(thread);
          emit('thread-meta');
        },
        onUserMessage: (realUserMsg) => {
          const uIdx = state.messages.findIndex((m) => m.id === tempUserId);
          if (uIdx !== -1) state.messages[uIdx] = realUserMsg;
        },
        onReasoning: (_delta, accumulated) => {
          const target = state.messages.find((m) => m.id === tempAsstId);
          if (target) {
            target.reasoning = accumulated;
            emit('stream-delta');
          }
        },
        onDelta: (_delta, accumulated) => {
          const target = state.messages.find((m) => m.id === tempAsstId);
          if (target) {
            target.content = accumulated;
            target.pending = false;
            emit('stream-delta');
          }
        },
      });

      if (done?.thread) {
        state.activeThread = done.thread;
        state.activeThreadId = done.thread.id;
        upsertThreadInList(done.thread);
      }
      if (done?.userMessage) {
        const uIdx = state.messages.findIndex((m) => m.id === tempUserId || m.id === done.userMessage.id);
        if (uIdx !== -1) state.messages[uIdx] = done.userMessage;
      }
      if (done?.assistantMessage) {
        const aIdx = state.messages.findIndex((m) => m.id === tempAsstId);
        if (aIdx !== -1) state.messages[aIdx] = done.assistantMessage;
      } else {
        const target = state.messages.find((m) => m.id === tempAsstId);
        if (target && !target.content) {
          throw new Error('No response received from AI model.');
        }
        if (target) target.pending = false;
      }
    } catch (err) {
      const target = state.messages.find((m) => m.id === tempAsstId);
      if (ac.signal.aborted) {
        if (target) {
          target.pending = false;
          if (!target.content) target.content = '*Generation stopped.*';
        }
      } else if (target) {
        target.pending = false;
        target.error = true;
        target.content = err?.message || 'Could not reach the AI model.';
      }
    } finally {
      state.streaming = false;
      state.streamingMsgId = '';
      state.abortCtrl = null;
      emit('messages');
    }
  }

  async function regenerateMessage(assistantMsgId) {
    if (state.streaming || !state.activeThreadId) return;
    if (!ensureAuth({ type: 'open_ai_chat' })) return;

    const idx = state.messages.findIndex((m) => m.id === assistantMsgId);
    if (idx === -1) return;

    let targetUserIdx = -1;
    for (let i = idx; i >= 0; i--) {
      if (state.messages[i].role === 'user') {
        targetUserIdx = i;
        break;
      }
    }
    if (targetUserIdx === -1) return;

    const tempAsstId = `tmp_regen_${Date.now()}`;
    state.messages = state.messages.slice(0, targetUserIdx + 1);
    state.messages.push({
      id: tempAsstId,
      role: 'assistant',
      content: '',
      reasoning: '',
      pending: true,
      createdAt: new Date().toISOString(),
    });

    const ctx = getEffectiveContext();
    const modelSel = state.handlers.getActiveModelSelection?.() || {};
    const ac = new AbortController();
    state.abortCtrl = ac;
    state.streaming = true;
    state.streamingMsgId = tempAsstId;
    emit('messages');

    try {
      const done = await Api().regenerateStream(
        state.activeThreadId,
        assistantMsgId,
        {
          persona: getActivePersona(),
          responseStyle: state.preferences.responseStyle,
          responseLanguage: state.preferences.responseLanguage,
          temperature: state.preferences.temperature,
          usePageContext: state.usePageContext,
          context: state.usePageContext ? ctx : { type: 'general' },
          keyId: modelSel.keyId || undefined,
          model: modelSel.model || modelSel.modelId || undefined,
          variant: modelSel.variant || modelSel.variantId || undefined,
        },
        {
          signal: ac.signal,
          onReasoning: (_d, acc) => {
            const t = state.messages.find((m) => m.id === tempAsstId);
            if (t) {
              t.reasoning = acc;
              emit('stream-delta');
            }
          },
          onDelta: (_d, acc) => {
            const t = state.messages.find((m) => m.id === tempAsstId);
            if (t) {
              t.content = acc;
              t.pending = false;
              emit('stream-delta');
            }
          },
        },
      );
      if (done?.thread) {
        state.activeThread = done.thread;
        upsertThreadInList(done.thread);
      }
      if (done?.assistantMessage) {
        const aIdx = state.messages.findIndex((m) => m.id === tempAsstId);
        if (aIdx !== -1) state.messages[aIdx] = done.assistantMessage;
      }
    } catch (err) {
      const t = state.messages.find((m) => m.id === tempAsstId);
      if (t) {
        t.pending = false;
        if (!ac.signal.aborted) {
          t.error = true;
          t.content = err?.message || 'Regeneration failed.';
        } else if (!t.content) {
          t.content = '*Generation stopped.*';
        }
      }
    } finally {
      state.streaming = false;
      state.streamingMsgId = '';
      state.abortCtrl = null;
      emit('messages');
    }
  }

  async function editAndResend(userMsgId, newContent) {
    const clean = String(newContent || '').trim();
    if (!clean || state.streaming || !state.activeThreadId) return;
    if (!ensureAuth({ type: 'open_ai_chat' })) return;

    const idx = state.messages.findIndex((m) => m.id === userMsgId && m.role === 'user');
    if (idx === -1) return;

    state.editingMessageId = '';
    state.messages[idx] = { ...state.messages[idx], content: clean };
    const tempAsstId = `tmp_edit_${Date.now()}`;
    state.messages = state.messages.slice(0, idx + 1);
    state.messages.push({
      id: tempAsstId,
      role: 'assistant',
      content: '',
      reasoning: '',
      pending: true,
      createdAt: new Date().toISOString(),
    });

    const ctx = getEffectiveContext();
    const modelSel = state.handlers.getActiveModelSelection?.() || {};
    const ac = new AbortController();
    state.abortCtrl = ac;
    state.streaming = true;
    state.streamingMsgId = tempAsstId;
    emit('messages');

    try {
      const done = await Api().editStream(
        state.activeThreadId,
        userMsgId,
        {
          content: clean,
          persona: getActivePersona(),
          responseStyle: state.preferences.responseStyle,
          responseLanguage: state.preferences.responseLanguage,
          temperature: state.preferences.temperature,
          usePageContext: state.usePageContext,
          context: state.usePageContext ? ctx : { type: 'general' },
          keyId: modelSel.keyId || undefined,
          model: modelSel.model || modelSel.modelId || undefined,
          variant: modelSel.variant || modelSel.variantId || undefined,
        },
        {
          signal: ac.signal,
          onReasoning: (_d, acc) => {
            const t = state.messages.find((m) => m.id === tempAsstId);
            if (t) {
              t.reasoning = acc;
              emit('stream-delta');
            }
          },
          onDelta: (_d, acc) => {
            const t = state.messages.find((m) => m.id === tempAsstId);
            if (t) {
              t.content = acc;
              t.pending = false;
              emit('stream-delta');
            }
          },
        },
      );
      if (done?.thread) {
        state.activeThread = done.thread;
        upsertThreadInList(done.thread);
      }
      if (done?.userMessage) state.messages[idx] = done.userMessage;
      if (done?.assistantMessage) {
        const aIdx = state.messages.findIndex((m) => m.id === tempAsstId);
        if (aIdx !== -1) state.messages[aIdx] = done.assistantMessage;
      }
    } catch (err) {
      const t = state.messages.find((m) => m.id === tempAsstId);
      if (t) {
        t.pending = false;
        if (!ac.signal.aborted) {
          t.error = true;
          t.content = err?.message || 'Could not regenerate after edit.';
        }
      }
    } finally {
      state.streaming = false;
      state.streamingMsgId = '';
      state.abortCtrl = null;
      emit('messages');
    }
  }

  async function continueMessage(assistantMsgId) {
    if (state.streaming || !state.activeThreadId) return;
    if (!ensureAuth({ type: 'open_ai_chat' })) return;
    const target = state.messages.find((m) => m.id === assistantMsgId && m.role === 'assistant');
    if (!target) return;

    const baseContent = target.content;
    const modelSel = state.handlers.getActiveModelSelection?.() || {};
    const ac = new AbortController();
    state.abortCtrl = ac;
    state.streaming = true;
    state.streamingMsgId = assistantMsgId;
    emit('messages');

    try {
      const done = await Api().continueStream(
        state.activeThreadId,
        assistantMsgId,
        {
          persona: getActivePersona(),
          responseStyle: state.preferences.responseStyle,
          responseLanguage: state.preferences.responseLanguage,
          temperature: state.preferences.temperature,
          keyId: modelSel.keyId || undefined,
          model: modelSel.model || modelSel.modelId || undefined,
          variant: modelSel.variant || modelSel.variantId || undefined,
        },
        {
          signal: ac.signal,
          onDelta: (_d, acc) => {
            target.content = `${baseContent.trimEnd()}\n\n${acc}`;
            emit('stream-delta');
          },
        },
      );
      if (done?.thread) {
        state.activeThread = done.thread;
        upsertThreadInList(done.thread);
      }
      if (done?.assistantMessage) {
        const idx = state.messages.findIndex((m) => m.id === assistantMsgId);
        if (idx !== -1) state.messages[idx] = done.assistantMessage;
      }
    } catch (err) {
      if (!ac.signal.aborted) {
        showToast(err?.message || 'Could not continue answer.');
      }
    } finally {
      state.streaming = false;
      state.streamingMsgId = '';
      state.abortCtrl = null;
      emit('messages');
    }
  }

  async function deleteMessage(msgId) {
    if (!state.activeThreadId || !msgId) return;
    try {
      await Api().deleteMessage(state.activeThreadId, msgId);
      state.messages = state.messages.filter((m) => m.id !== msgId);
      emit('messages');
    } catch (err) {
      showToast(err?.message || 'Could not delete message.');
    }
  }

  async function updateThreadMeta(threadId, patch) {
    if (!threadId) return;
    try {
      const res = await Api().updateThread(threadId, patch);
      if (res?.thread) {
        upsertThreadInList(res.thread);
        if (state.activeThreadId === threadId) {
          state.activeThread = res.thread;
        }
        emit('threads');
      }
    } catch (err) {
      showToast(err?.message || 'Could not update conversation.');
    }
  }

  async function deleteThread(threadId) {
    if (!threadId) return;
    try {
      await Api().deleteThread(threadId);
      state.threads = state.threads.filter((t) => t.id !== threadId);
      if (state.activeThreadId === threadId) {
        startNewChat({ clearQuote: false });
      }
      emit('threads');
      showToast('Conversation deleted');
    } catch (err) {
      showToast(err?.message || 'Could not delete conversation.');
    }
  }

  async function clearAllThreads() {
    if (!ensureAuth({ type: 'open_ai_chat' })) return;
    try {
      await Api().deleteAllThreads();
      state.threads = [];
      startNewChat({ clearQuote: false });
      emit('threads');
      showToast('All conversations cleared');
    } catch (err) {
      showToast(err?.message || 'Could not clear conversations.');
    }
  }

  async function updatePreferences(patch) {
    state.preferences = { ...state.preferences, ...patch };
    if (patch.usePageContext !== undefined) {
      state.usePageContext = Boolean(patch.usePageContext);
    }
    emit('preferences');
    if (!isAuthenticated()) return;
    try {
      const res = await Api().updatePreferences(patch);
      if (res?.preferences) {
        state.preferences = { ...state.preferences, ...res.preferences };
        emit('preferences');
      }
    } catch {}
  }

  function setDisplayMode(modeId) {
    const clean = String(modeId || '').trim();
    const def = Modes()?.getMode?.(clean);
    const fallbackAllowed = ['split', 'floating', 'docked', 'expanded', 'fullpage'];
    if (!def && !fallbackAllowed.includes(clean)) return;

    if (clean !== 'fullpage') {
      state.lastOverlayMode = clean;
      try {
        localStorage.setItem(DISPLAY_MODE_KEY, clean);
      } catch {}
    }
    const prevMode = state.displayMode;
    state.displayMode = clean;
    state.modePopoverOpen = false;
    if (clean === 'fullpage') {
      state.sidebarOpen = true;
    } else if (prevMode === 'fullpage') {
      state.sidebarOpen = false;
    }
    emit('display-mode');
  }

  function setDrawerWidth(w) {
    const clamped = Math.max(340, Math.min(720, Math.round(Number(w) || 430)));
    state.drawerWidth = clamped;
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped));
    } catch {}
    emit('width');
  }

  function setFloatingPos(x, y) {
    if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return;
    const pos = { x: Math.round(Number(x)), y: Math.round(Number(y)) };
    state.floatingPos = pos;
    try {
      localStorage.setItem(FLOAT_POS_KEY, JSON.stringify(pos));
    } catch {}
  }

  global.FlaptapAiChatStore = {
    state,
    subscribe,
    emit,
    init,
    loadAccountState,
    refreshThreads,
    selectThread,
    loadContextThread,
    startNewChat,
    sendMessage,
    regenerateMessage,
    editAndResend,
    continueMessage,
    deleteMessage,
    updateThreadMeta,
    deleteThread,
    clearAllThreads,
    updatePreferences,
    setDisplayMode,
    setDrawerWidth,
    setFloatingPos,
    getEffectiveContext,
    getActivePersona,
    isAuthenticated,
    ensureAuth,
    showToast,
  };
})(window);
