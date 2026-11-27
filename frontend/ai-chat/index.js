/* ==========================================================================
   FLAPTAP AI CHAT — PUBLIC FACADE & AUTO-BOOT (frontend/ai-chat/index.js)
   Exposes window.FlaptapAiChat for every feature across index.html & studio.html.
   ========================================================================== */

(function (global) {
  'use strict';

  const Store = () => global.FlaptapAiChatStore;
  const Ui = () => global.FlaptapAiChatUi;
  const Ctx = () => global.FlaptapAiContext;

  function boot() {
    Ui().buildDom();
    Store().init();
    Ui().renderContextUi();
    Ui().renderPersonaAndControls();
    Ui().renderMessages();
  }

  function open(opts = {}) {
    boot();
    const s = Store().state;
    if (opts.newChat) {
      Store().startNewChat({ clearQuote: !opts.quote });
    }
    if (opts.context) {
      s.explicitContext = opts.context;
    }
    if (opts.quote) {
      s.attachedQuote = opts.quote;
    }
    if (opts.persona) {
      s.personaOverride = opts.persona;
    }
    if (s.displayMode === 'fullpage') {
      s.displayMode = s.lastOverlayMode || 'docked';
    }
    s.isOpen = true;
    if (Store().isAuthenticated()) {
      Store().loadAccountState();
    }
    Ui().syncDisplayHost();
    Ui().renderContextUi();
    Ui().renderPersonaAndControls();
    Ui().renderQuoteAndImages();
    Ui().renderMessages();
    if (opts.prefill) {
      Ui().setInputPrefill(opts.prefill);
    }
    if (opts.autoSend && opts.prompt) {
      Store().sendMessage(opts.prompt);
    } else {
      Ui().focusInput();
    }
  }

  function openWithContext(context, opts = {}) {
    return open({
      ...opts,
      context,
      newChat: opts.newChat !== undefined ? opts.newChat : true,
    });
  }

  function close() {
    const s = Store().state;
    if (s.displayMode === 'fullpage') return;
    s.isOpen = false;
    Ui().syncDisplayHost();
  }

  function toggle() {
    if (Store().state.isOpen) close();
    else open();
  }

  function mountFullPage(opts = {}) {
    boot();
    const s = Store().state;
    s.isOpen = true;
    Store().setDisplayMode('fullpage');
    if (Store().isAuthenticated()) {
      Store().loadAccountState(true);
      if (opts.threadId) {
        Store().selectThread(opts.threadId);
      }
    }
    Ui().focusInput();
  }

  function unmountFullPage() {
    const s = Store().state;
    if (s.displayMode !== 'fullpage') return;
    s.isOpen = false;
    Store().setDisplayMode(s.lastOverlayMode || 'docked');
  }

  function configure(handlers = {}) {
    Object.assign(Store().state.handlers, handlers);
  }

  global.FlaptapAiChat = {
    boot,
    open,
    openWithContext,
    close,
    toggle,
    isOpen: () => Boolean(Store().state.isOpen),
    mountFullPage,
    unmountFullPage,
    configure,
    registerContextProvider: (id, fn) => Ctx().registerProvider(id, fn),
    notifyContextChanged: () => Ctx().notifyChange(),
    loadContextThread: (type, id) => Store().loadContextThread(type, id),
    sendMessage: (text) => {
      open();
      return Store().sendMessage(text);
    },
    setQuote: (quote) => {
      Store().state.attachedQuote = quote || null;
      Ui().renderQuoteAndImages();
    },
    refreshAuth: () => Store().loadAccountState(true),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
