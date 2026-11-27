/* ==========================================================================
   FLAPTAP AI CHAT — LIVING FLOATING LAUNCHER, OVERLAY & FULL-PAGE UI
   (frontend/ai-chat/ui.js)
   Renders and manages the site-wide Liquid Glass AI Companion across:
   - Living animated Floating Action Pill (#ft-ai-fab)
   - Resizable Docked Drawer / Expanded Theater Modal (#ft-ai-drawer)
   - Full-Page Workspace Host (#ft-ai-fullpage-host on /chat)
   - Conversations Sidebar, Slash Commands, Image Attachments, Voice,
     Shared FlaptapAiSelector, Personas, Settings, and Rich Markdown Feed.
   ========================================================================== */

(function (global) {
  'use strict';

  const Store = () => global.FlaptapAiChatStore;
  const Api = () => global.FlaptapAiChatApi;
  const Md = () => global.FlaptapAiChatMarkdown;
  const Ctx = () => global.FlaptapAiContext;
  const Modes = () => global.FlaptapAiChatModes;
  const escapeHtml = (v) => Md().escapeHtml(v);

  const SLASH_COMMANDS = [
    { cmd: '/explain', label: 'Explain in depth', text: 'Explain this clearly with nuance, context, and real spoken examples: ' },
    { cmd: '/alternatives', label: 'Natural American alternatives', text: 'Give me 4 natural spoken American alternatives from casual to sharp for: ' },
    { cmd: '/pronounce', label: 'IPA & connected speech', text: 'Break down the exact American pronunciation, IPA, linking, and reductions for: ' },
    { cmd: '/rewrite', label: 'Make me sound native', text: 'Rewrite this so it sounds completely natural like a native American speaker: ' },
    { cmd: '/translate', label: 'Translate + nuance', text: 'Translate this accurately into Arabic and explain any subtle nuance or idiom: ' },
    { cmd: '/roleplay', label: 'Start 1-on-1 roleplay', text: 'Start a realistic spoken roleplay with me based on this topic and coach my replies: ' },
    { cmd: '/quiz', label: 'Active recall quiz', text: 'Quiz me with 3 fast practical prompts on what we are studying here.' },
    { cmd: '/summarize', label: 'Key takeaways', text: 'Summarize the highest-value spoken takeaways from this context in crisp bullets.' },
  ];

  let mounted = false;
  let aiSelector = null;
  let voiceCtrl = null;
  let scrollStickyLock = true;
  let streamRenderRaf = 0;
  let renamingThreadId = '';

  function el(id) {
    return document.getElementById(id);
  }

  function formatClockMs(ms) {
    const safe = Math.max(0, Math.round(Number(ms) || 0));
    const mins = Math.floor(safe / 60000);
    const secs = Math.floor((safe % 60000) / 1000);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function groupThreadsByDate(threads) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const startOfWeek = startOfToday - 6 * 86400000;

    const groups = {
      Pinned: [],
      Today: [],
      Yesterday: [],
      'Previous 7 Days': [],
      Older: [],
    };

    for (const t of threads || []) {
      if (t.isPinned) {
        groups.Pinned.push(t);
        continue;
      }
      const ts = new Date(t.updatedAt || t.createdAt || 0).getTime();
      if (ts >= startOfToday) groups.Today.push(t);
      else if (ts >= startOfYesterday) groups.Yesterday.push(t);
      else if (ts >= startOfWeek) groups['Previous 7 Days'].push(t);
      else groups.Older.push(t);
    }
    return groups;
  }

  function contextShortBadge(ctx) {
    const isAr = (document.documentElement.getAttribute('lang') || 'en') === 'ar';
    const map = isAr
      ? {
          shadowing: 'الترديد',
          dialogue: 'الحوارات',
          phonetics: 'الصوتيات',
          think_aloud: 'فكّر بصوت عالٍ',
          phrase_miner: 'استخراج العبارات',
          phrase_builder: 'بناء العبارات',
          vocabulary: 'المفردات',
          word_lookup: 'شرح كلمة',
          general: 'مساعد AI',
        }
      : {
          shadowing: 'Shadowing',
          dialogue: 'Dialogues',
          phonetics: 'Phonetics',
          think_aloud: 'Think Aloud',
          phrase_miner: 'Phrase Miner',
          phrase_builder: 'Phrase Builder',
          vocabulary: 'Vocabulary',
          word_lookup: 'Word Lookup',
          general: 'AI Mentor',
        };
    return map[ctx?.type] || (isAr ? 'مساعد AI' : 'AI Mentor');
  }

  function buildDom() {
    if (mounted && el('ft-ai-root')) return;
    mounted = true;

    const root = document.createElement('div');
    root.id = 'ft-ai-root';
    root.className = 'ft-ai-root';
    root.innerHTML = `
      <!-- Living Animated Floating AI Launcher -->
      <button type="button" id="ft-ai-fab" class="ft-ai-fab" aria-label="Open Flaptap AI Chat (Cmd+J)" aria-expanded="false" aria-controls="ft-ai-drawer">
        <span class="ft-ai-fab-aura" aria-hidden="true"></span>
        <span class="ft-ai-fab-rim" aria-hidden="true"></span>
        <span class="ft-ai-fab-surface">
          <span class="ft-ai-fab-wave" aria-hidden="true">
            <span class="ft-ai-wave-bar"></span>
            <span class="ft-ai-wave-bar"></span>
            <span class="ft-ai-wave-bar"></span>
            <span class="ft-ai-wave-bar"></span>
          </span>
          <span class="ft-ai-fab-copy">
            <span class="ft-ai-fab-title" id="ft-ai-fab-title">Ask AI</span>
            <span class="ft-ai-fab-ctx" id="ft-ai-fab-ctx">AI Mentor</span>
          </span>
          <kbd class="ft-ai-fab-kbd" aria-hidden="true">⌘J</kbd>
        </span>
      </button>

      <!-- Overlay Backdrop -->
      <div id="ft-ai-backdrop" class="ft-ai-backdrop" hidden></div>

      <!-- Unified AI Chat Workspace (Docked / Expanded / Full-Page) -->
      <aside id="ft-ai-drawer" class="ft-ai-drawer" data-mode="docked" role="dialog" aria-modal="false" aria-labelledby="ft-ai-title" hidden>
        <div id="ft-ai-resize-handle" class="ft-ai-resize-handle" title="Drag to resize" aria-hidden="true"></div>

        <!-- Conversations History Sidebar -->
        <aside id="ft-ai-sidebar" class="ft-ai-sidebar" aria-label="AI Conversations History">
          <div class="ft-ai-sidebar-top">
            <button type="button" id="ft-ai-new-chat-btn" class="ft-ai-new-chat-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
              <span>New Chat</span>
            </button>
            <button type="button" id="ft-ai-sidebar-close-btn" class="ft-ai-icon-btn ft-ai-sidebar-close" aria-label="Close history sidebar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div class="ft-ai-search-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
            <input type="search" id="ft-ai-thread-search" class="ft-ai-thread-search" placeholder="Search chats…" aria-label="Search conversations" />
          </div>
          <div id="ft-ai-thread-list" class="ft-ai-thread-list"></div>
          <div class="ft-ai-sidebar-foot">
            <button type="button" id="ft-ai-clear-all-btn" class="ft-ai-clear-all-btn" title="Delete all conversations">Clear All History</button>
          </div>
        </aside>

        <!-- Main Chat Stage -->
        <div class="ft-ai-main">
          <header class="ft-ai-head">
            <div class="ft-ai-head-left">
              <button type="button" id="ft-ai-sidebar-toggle-btn" class="ft-ai-icon-btn" aria-label="Toggle conversations history" title="Conversations">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"></rect><line x1="9" y1="4" x2="9" y2="20"></line></svg>
              </button>
              <button type="button" id="ft-ai-quick-new-btn" class="ft-ai-icon-btn" aria-label="New chat" title="New Chat">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
              </button>
              <div class="ft-ai-title-stack">
                <div class="ft-ai-title-row">
                  <span class="ft-ai-live-dot" aria-hidden="true"></span>
                  <h2 id="ft-ai-title" class="ft-ai-title">Flaptap AI</h2>
                </div>
                <button type="button" id="ft-ai-ctx-pill" class="ft-ai-ctx-pill" aria-expanded="false" title="Inspect or toggle active workspace context">
                  <span class="ft-ai-ctx-dot" aria-hidden="true"></span>
                  <span id="ft-ai-ctx-pill-text">AI Mentor</span>
                </button>
              </div>
            </div>

            <div class="ft-ai-head-actions">
              <button type="button" id="ft-ai-mode-btn" class="ft-ai-pill-btn ft-ai-mode-btn ft-ai-desktop-only" aria-expanded="false" aria-controls="ft-ai-mode-popover" title="Switch AI Chat display mode (Split, Floating, Overlay, Theater, Full Page)">
                <span id="ft-ai-mode-btn-icon" class="ft-ai-mode-btn-icon" aria-hidden="true"></span>
                <span id="ft-ai-mode-btn-label">Split</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </button>

              <button type="button" id="ft-ai-model-btn" class="ft-ai-pill-btn" aria-expanded="false" title="Choose AI Provider & Model">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"></path></svg>
                <span id="ft-ai-model-pill-label">Model</span>
              </button>

              <button type="button" id="ft-ai-settings-btn" class="ft-ai-icon-btn" aria-expanded="false" aria-label="AI Controls & Persona" title="Persona, Style & Instructions">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="2" y1="14" x2="6" y2="14"></line><line x1="10" y1="8" x2="14" y2="8"></line><line x1="18" y1="16" x2="22" y2="16"></line></svg>
              </button>

              <button type="button" id="ft-ai-export-btn" class="ft-ai-icon-btn" aria-label="Export conversation" title="Export Markdown (.md)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </button>

              <button type="button" id="ft-ai-close-btn" class="ft-ai-icon-btn ft-ai-close-btn" aria-label="Close AI Chat" title="Close">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </header>

          <!-- Extensible Visual Display Mode Picker Popover -->
          <div id="ft-ai-mode-popover" class="ft-ai-subpanel ft-ai-mode-popover" hidden>
            <div class="ft-ai-ctrl-head">
              <span class="ft-ai-ctrl-label">Workspace Display Mode</span>
              <span class="ft-ai-mode-hint">Choose how AI works beside you</span>
            </div>
            <div id="ft-ai-mode-grid" class="ft-ai-mode-grid" role="radiogroup" aria-label="AI Chat Display Mode"></div>
          </div>

          <!-- Collapsible Shared FlaptapAiSelector Panel -->
          <div id="ft-ai-model-panel" class="ft-ai-model-panel" hidden>
            <div id="ft-ai-selector-mount"></div>
          </div>

          <!-- Context Inspector Popover -->
          <div id="ft-ai-ctx-popover" class="ft-ai-subpanel" hidden>
            <div class="ft-ai-subpanel-row">
              <div>
                <strong>Live Workspace Grounding</strong>
                <span id="ft-ai-ctx-detail-sub" class="ft-ai-subpanel-sub">Automatically reads your active lesson, guide, or card</span>
              </div>
              <label class="ft-ai-switch">
                <input type="checkbox" id="ft-ai-ctx-toggle" checked />
                <span class="ft-ai-switch-track"></span>
              </label>
            </div>
            <div id="ft-ai-ctx-preview" class="ft-ai-ctx-preview"></div>
          </div>

          <!-- Claude/ChatGPT-Level Controls Popover -->
          <div id="ft-ai-settings-popover" class="ft-ai-subpanel ft-ai-settings-popover" hidden>
            <div class="ft-ai-ctrl-section">
              <div class="ft-ai-ctrl-label">AI Persona</div>
              <div id="ft-ai-persona-grid" class="ft-ai-persona-grid"></div>
            </div>
            <div class="ft-ai-ctrl-row-2">
              <div class="ft-ai-ctrl-section">
                <div class="ft-ai-ctrl-label">Response Depth</div>
                <div id="ft-ai-style-seg" class="ft-ai-seg"></div>
              </div>
              <div class="ft-ai-ctrl-section">
                <div class="ft-ai-ctrl-label">Language</div>
                <select id="ft-ai-lang-select" class="ft-ai-select"></select>
              </div>
            </div>
            <div class="ft-ai-ctrl-section">
              <div class="ft-ai-ctrl-head">
                <span class="ft-ai-ctrl-label">Creativity (Temperature)</span>
                <span id="ft-ai-temp-val" class="ft-ai-temp-val ltr-num">0.45</span>
              </div>
              <input type="range" id="ft-ai-temp-slider" min="0" max="1.2" step="0.05" value="0.45" class="ft-ai-range" />
            </div>
            <div class="ft-ai-ctrl-section">
              <div class="ft-ai-ctrl-label">Custom Instructions (Saved to your profile)</div>
              <textarea id="ft-ai-custom-inst" class="ft-ai-custom-inst" rows="2" placeholder="e.g. Always include IPA and compare Egyptian Arabic nuance…"></textarea>
              <div class="ft-ai-ctrl-foot">
                <button type="button" id="ft-ai-save-inst-btn" class="ft-ai-mini-primary">Save Preferences</button>
              </div>
            </div>
          </div>

          <!-- Scrollable Conversation Canvas -->
          <div id="ft-ai-scroll" class="ft-ai-body">
            <div id="ft-ai-empty" class="ft-ai-empty">
              <div class="ft-ai-empty-orb" aria-hidden="true">
                <span class="ft-ai-empty-ring"></span>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"></path></svg>
              </div>
              <h3 class="ft-ai-empty-title" id="ft-ai-empty-title">Ask anything with full context</h3>
              <p class="ft-ai-empty-sub" id="ft-ai-empty-sub">I know the active screen, transcript, or phrase you are studying — ask in English or Arabic by text, voice, or screenshot.</p>
              <div id="ft-ai-empty-cards" class="ft-ai-empty-cards"></div>
            </div>

            <div id="ft-ai-messages" class="ft-ai-messages"></div>
          </div>

          <button type="button" id="ft-ai-scroll-bottom-btn" class="ft-ai-scroll-bottom" hidden aria-label="Scroll to latest message">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>

          <!-- Composer Dock -->
          <footer class="ft-ai-foot">
            <div id="ft-ai-quote-card" class="ft-ai-quote-card" hidden></div>
            <div id="ft-ai-images-bar" class="ft-ai-images-bar" hidden></div>
            <div id="ft-ai-starters" class="ft-ai-starters"></div>

            <!-- Slash Command Popup -->
            <div id="ft-ai-slash-menu" class="ft-ai-slash-menu" role="listbox" hidden></div>

            <!-- Voice Listening Bar -->
            <div id="ft-ai-voice-bar" class="ft-ai-voice-bar" hidden>
              <span class="ft-ai-voice-waves" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
              <span id="ft-ai-voice-status" class="ft-ai-voice-status">Listening…</span>
            </div>

            <div class="ft-ai-composer" id="ft-ai-composer">
              <div class="ft-ai-composer-top">
                <textarea id="ft-ai-input" class="ft-ai-input" rows="1" placeholder="Ask anything or type / for commands…" aria-label="Message Flaptap AI"></textarea>
              </div>
              <div class="ft-ai-composer-bar">
                <div class="ft-ai-composer-left">
                  <input type="file" id="ft-ai-image-file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden />
                  <button type="button" id="ft-ai-attach-btn" class="ft-ai-tool-btn" title="Attach image or screenshot (or paste Cmd+V)" aria-label="Attach image">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path></svg>
                  </button>
                  <button type="button" id="ft-ai-slash-btn" class="ft-ai-tool-btn" title="Slash commands (/)" aria-label="Insert slash command">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="15" y1="4" x2="9" y2="20"></line></svg>
                  </button>
                  <button type="button" id="ft-ai-persona-chip" class="ft-ai-persona-chip" title="Switch AI Persona">
                    <span id="ft-ai-persona-chip-text">Mentor</span>
                  </button>
                </div>
                <div class="ft-ai-composer-right">
                  <button type="button" id="ft-ai-voice-lang" class="ft-ai-voice-lang" title="Switch voice dictation language (Auto / EN / AR)">Auto</button>
                  <button type="button" id="ft-ai-mic-btn" class="ft-ai-tool-btn ft-ai-mic-btn" aria-pressed="false" aria-label="Speak your question" title="Voice input">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>
                  </button>
                  <button type="button" id="ft-ai-send-btn" class="ft-ai-send-btn" aria-label="Send message" title="Send (Enter)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                  </button>
                  <button type="button" id="ft-ai-stop-btn" class="ft-ai-stop-btn" hidden aria-label="Stop generating" title="Stop generating">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2.5"></rect></svg>
                  </button>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </aside>
    `;

    document.body.appendChild(root);
    ensureVoice();
    bindDomEvents();
    syncDisplayHost();
  }

  function ensureAiSelector() {
    if (aiSelector || !global.FlaptapAiSelector) return;
    const mount = el('ft-ai-selector-mount');
    if (!mount) return;
    aiSelector = global.FlaptapAiSelector.create({
      container: mount,
      idPrefix: 'ft-ai-aisel',
      persistenceKey: 'ai_chat',
      title: 'Chat AI Model',
      compact: true,
      showRunButton: false,
      hideMetaChips: false,
      fetcher: async (url, opts) => {
        const headers = Object.assign(
          {},
          global.FlaptapWorkspace?.getAuthHeaders?.() || {},
          opts?.headers || {},
        );
        const res = await fetch(url, { credentials: 'same-origin', ...opts, headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
        return data;
      },
      onChange: (sel) => {
        const lbl = el('ft-ai-model-pill-label');
        if (lbl) {
          lbl.textContent = sel?.model ? String(sel.model).split('/').pop().slice(0, 22) : 'Model';
        }
      },
    });
    Store().state.handlers.getActiveModelSelection = () => aiSelector?.getSelection?.() || {};
    aiSelector.init();
  }

  function ensureVoice() {
    if (voiceCtrl || !global.FlaptapAiChatVoice) return;
    voiceCtrl = global.FlaptapAiChatVoice.create({
      onStateChange: ({ active, status }) => {
        const mic = el('ft-ai-mic-btn');
        const bar = el('ft-ai-voice-bar');
        const st = el('ft-ai-voice-status');
        const lang = el('ft-ai-voice-lang');
        const fab = el('ft-ai-fab');
        if (mic) {
          mic.classList.toggle('is-listening', active);
          mic.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
        if (fab) fab.classList.toggle('is-listening', active);
        if (bar) bar.hidden = !active && !status;
        if (st && status) st.textContent = status;
        if (lang) lang.textContent = voiceCtrl.getLangBadge();
      },
      onTranscriptReady: (text) => {
        const inp = el('ft-ai-input');
        if (inp) inp.value = '';
        autoResizeTextarea(inp);
        Store().sendMessage(text);
      },
      onError: (msg) => Store().showToast(msg),
    });
    const lang = el('ft-ai-voice-lang');
    if (lang && voiceCtrl) lang.textContent = voiceCtrl.getLangBadge();
  }

  function autoResizeTextarea(inp) {
    if (!inp) return;
    inp.style.height = 'auto';
    const nextH = Math.min(168, Math.max(40, inp.scrollHeight));
    inp.style.height = `${nextH}px`;
    inp.style.overflowY = inp.scrollHeight > 168 ? 'auto' : 'hidden';
  }

  function resolveEffectiveModeDef() {
    const s = Store().state;
    const requested = s.displayMode || 'split';
    if (Modes()?.resolveEffectiveMode) {
      return Modes().resolveEffectiveMode(requested, global.innerWidth);
    }
    return {
      id: requested,
      label: requested,
      shortLabel: requested,
      blocksPage: requested === 'docked' || requested === 'expanded',
      pushesLayout: requested === 'split',
      resizable: requested === 'split' || requested === 'docked' || requested === 'floating',
      draggable: requested === 'floating',
      isRouteMode: requested === 'fullpage',
      iconSvg: '',
    };
  }

  function applyFloatingBounds(drawer) {
    const s = Store().state;
    if (!drawer) return;
    const vw = global.innerWidth || 1280;
    const vh = global.innerHeight || 800;
    const width = Math.min(s.drawerWidth || 430, vw - 24);
    const height = Math.min(600, vh - 36);
    const fallbackX = document.documentElement.getAttribute('dir') === 'rtl' ? 18 : vw - width - 18;
    const fallbackY = vh - height - 20;
    const rawX = s.floatingPos ? s.floatingPos.x : fallbackX;
    const rawY = s.floatingPos ? s.floatingPos.y : fallbackY;
    const clampedX = Math.max(12, Math.min(rawX, vw - width - 12));
    const clampedY = Math.max(12, Math.min(rawY, vh - height - 12));
    drawer.style.left = `${Math.round(clampedX)}px`;
    drawer.style.top = `${Math.round(clampedY)}px`;
    drawer.style.right = 'auto';
    drawer.style.bottom = 'auto';
    drawer.style.insetInlineEnd = 'auto';
  }

  function clearFloatingBounds(drawer) {
    if (!drawer) return;
    drawer.style.left = '';
    drawer.style.top = '';
    drawer.style.right = '';
    drawer.style.bottom = '';
    drawer.style.insetInlineEnd = '';
  }

  function renderModePicker() {
    const grid = el('ft-ai-mode-grid');
    if (!grid) return;
    const s = Store().state;
    const activeId = s.displayMode || 'split';
    const eff = resolveEffectiveModeDef();
    const list = Modes()?.listModes?.() || [];

    grid.innerHTML = list
      .map((m) => {
        const isSelected = m.id === activeId;
        const isDisabledMobile = m.desktopOnly && (global.innerWidth || 1280) <= (Modes()?.DESKTOP_BREAKPOINT || 900);
        return `
          <button type="button" class="ft-ai-mode-card${isSelected ? ' is-active' : ''}${isDisabledMobile ? ' is-mobile-fallback' : ''}" data-set-display-mode="${escapeHtml(m.id)}" role="radio" aria-checked="${isSelected ? 'true' : 'false'}"${isDisabledMobile ? ' title="Uses Overlay Sheet on narrow screens"' : ''}>
            <div class="ft-ai-mode-card-top">
              <span class="ft-ai-mode-card-icon">${m.iconSvg || ''}</span>
              ${m.badge ? `<span class="ft-ai-mode-badge${m.blocksPage ? '' : ' is-copilot'}">${escapeHtml(m.badge)}</span>` : ''}
            </div>
            <strong class="ft-ai-mode-card-title">${escapeHtml(m.label)}</strong>
            <span class="ft-ai-mode-card-desc">${escapeHtml(m.description)}</span>
          </button>`;
      })
      .join('');

    const modeBtnLabel = el('ft-ai-mode-btn-label');
    const modeBtnIcon = el('ft-ai-mode-btn-icon');
    if (modeBtnLabel && eff) modeBtnLabel.textContent = eff.shortLabel || eff.label;
    if (modeBtnIcon && eff) modeBtnIcon.innerHTML = eff.iconSvg || '';
  }

  function syncHeaderSubpanelAria() {
    const s = Store().state;
    const modePop = el('ft-ai-mode-popover');
    const modelPanel = el('ft-ai-model-panel');
    const settingsPop = el('ft-ai-settings-popover');
    const ctxPop = el('ft-ai-ctx-popover');
    if (modePop) modePop.hidden = !s.modePopoverOpen;
    if (modelPanel) modelPanel.hidden = !s.modelPanelOpen;
    if (settingsPop) settingsPop.hidden = !s.settingsPanelOpen;
    if (ctxPop) ctxPop.hidden = !s.contextPopoverOpen;
    el('ft-ai-mode-btn')?.setAttribute('aria-expanded', s.modePopoverOpen ? 'true' : 'false');
    el('ft-ai-model-btn')?.setAttribute('aria-expanded', s.modelPanelOpen ? 'true' : 'false');
    el('ft-ai-settings-btn')?.setAttribute('aria-expanded', s.settingsPanelOpen ? 'true' : 'false');
    el('ft-ai-ctx-pill')?.setAttribute('aria-expanded', s.contextPopoverOpen ? 'true' : 'false');
  }

  function syncDisplayHost() {
    const s = Store().state;
    const drawer = el('ft-ai-drawer');
    const backdrop = el('ft-ai-backdrop');
    const fab = el('ft-ai-fab');
    const root = el('ft-ai-root');
    const fullHost = el('ft-ai-fullpage-host');
    if (!drawer || !root) return;

    const isFull = s.displayMode === 'fullpage' && Boolean(fullHost);
    const eff = isFull
      ? { id: 'fullpage', shortLabel: 'Full', label: 'Full Page', blocksPage: false, pushesLayout: false, draggable: false, resizable: false, iconSvg: Modes()?.getMode?.('fullpage')?.iconSvg || '' }
      : resolveEffectiveModeDef();

    drawer.dataset.mode = eff.id;
    drawer.dataset.interactive = eff.blocksPage ? 'modal' : 'coexist';
    drawer.style.setProperty('--ft-ai-drawer-width', `${s.drawerWidth}px`);

    if (isFull) {
      if (drawer.parentElement !== fullHost) {
        fullHost.appendChild(drawer);
      }
      clearFloatingBounds(drawer);
      drawer.hidden = false;
      drawer.setAttribute('aria-modal', 'false');
      if (backdrop) backdrop.hidden = true;
      if (fab) fab.hidden = true;
      document.documentElement.removeAttribute('data-ai-chat-mode');
      document.documentElement.style.removeProperty('--ft-ai-split-width');
    } else {
      if (drawer.parentElement !== root) {
        root.appendChild(drawer);
      }
      drawer.hidden = !s.isOpen;
      drawer.setAttribute('aria-modal', s.isOpen && eff.blocksPage ? 'true' : 'false');
      if (backdrop) {
        backdrop.hidden = !(s.isOpen && eff.blocksPage);
        backdrop.classList.toggle('is-expanded', eff.id === 'expanded');
      }
      if (fab) {
        fab.hidden = s.isOpen;
        fab.setAttribute('aria-expanded', s.isOpen ? 'true' : 'false');
      }

      if (s.isOpen && eff.pushesLayout) {
        document.documentElement.setAttribute('data-ai-chat-mode', eff.id);
        document.documentElement.style.setProperty('--ft-ai-split-width', `${s.drawerWidth}px`);
      } else {
        document.documentElement.removeAttribute('data-ai-chat-mode');
        document.documentElement.style.removeProperty('--ft-ai-split-width');
      }

      if (s.isOpen && eff.draggable) {
        applyFloatingBounds(drawer);
      } else {
        clearFloatingBounds(drawer);
      }
    }

    const sidebar = el('ft-ai-sidebar');
    if (sidebar) {
      const showSidebar = isFull ? s.sidebarOpen !== false : Boolean(s.sidebarOpen);
      drawer.classList.toggle('has-sidebar', showSidebar);
    }

    const modeBtn = el('ft-ai-mode-btn');
    if (modeBtn) modeBtn.hidden = false;
    const closeBtn = el('ft-ai-close-btn');
    if (closeBtn) closeBtn.hidden = isFull;

    renderModePicker();
    syncHeaderSubpanelAria();

    if (s.isOpen || isFull) {
      ensureAiSelector();
    }
  }

  function renderContextUi() {
    const s = Store().state;
    const ctx = Store().getEffectiveContext();
    const badge = contextShortBadge(ctx);

    const fabTitle = el('ft-ai-fab-title');
    const isAr = (document.documentElement.getAttribute('lang') || 'en') === 'ar';
    if (fabTitle) {
      fabTitle.textContent = isAr ? 'اسأل AI' : 'Ask AI';
    }
    const chatInp = el('ft-ai-input');
    if (chatInp) {
      chatInp.placeholder = isAr
        ? 'اسأل أي شيء أو اكتب / للأوامر…'
        : 'Ask anything or type / for commands…';
    }
    const fabCtx = el('ft-ai-fab-ctx');
    if (fabCtx) fabCtx.textContent = badge;

    const pill = el('ft-ai-ctx-pill');
    const pillText = el('ft-ai-ctx-pill-text');
    if (pill) {
      pill.classList.toggle('is-off', !s.usePageContext);
    }
    if (pillText) {
      const label = ctx?.label && ctx.label !== badge ? `${badge} · ${ctx.label}` : badge;
      pillText.textContent = s.usePageContext ? label.slice(0, 42) : 'Context Off';
    }

    const ctxToggle = el('ft-ai-ctx-toggle');
    if (ctxToggle) ctxToggle.checked = Boolean(s.usePageContext);

    const preview = el('ft-ai-ctx-preview');
    if (preview) {
      preview.innerHTML = `
        <div class="ft-ai-ctx-kv"><span>Surface</span><strong>${escapeHtml(badge)}</strong></div>
        ${ctx?.label ? `<div class="ft-ai-ctx-kv"><span>Active Item</span><strong>${escapeHtml(ctx.label)}</strong></div>` : ''}
        ${ctx?.subtitle ? `<div class="ft-ai-ctx-kv"><span>Scope</span><span>${escapeHtml(ctx.subtitle)}</span></div>` : ''}
      `;
    }
  }

  function renderPersonaAndControls() {
    const s = Store().state;
    const activePersona = Store().getActivePersona();
    const personas = s.config.personas?.length
      ? s.config.personas
      : [
          { id: 'smart_mentor', label: 'Native Mentor', shortLabel: 'Mentor', description: 'Context-aware spoken American coach' },
          { id: 'accent_coach', label: 'Pronunciation & Prosody', shortLabel: 'Accent', description: 'Connected speech, IPA & mouth mechanics' },
          { id: 'natural_rewrite', label: 'Natural Rewriter', shortLabel: 'Rewrite', description: 'Casual to sharp native upgrades' },
          { id: 'grammar_nuance', label: 'Grammar & Nuance', shortLabel: 'Nuance', description: 'Modals, tenses & real usage' },
          { id: 'roleplay', label: 'Roleplay Partner', shortLabel: 'Roleplay', description: 'Interactive spoken conversation' },
          { id: 'general', label: 'General Assistant', shortLabel: 'General', description: 'Any topic, fast and versatile' },
        ];

    const grid = el('ft-ai-persona-grid');
    if (grid) {
      grid.innerHTML = personas
        .map(
          (p) => `
          <button type="button" class="ft-ai-persona-opt${p.id === activePersona ? ' is-active' : ''}" data-ai-persona="${escapeHtml(p.id)}" title="${escapeHtml(p.description || '')}">
            <strong>${escapeHtml(p.label)}</strong>
            <span>${escapeHtml(p.description || '')}</span>
          </button>`,
        )
        .join('');
    }

    const activeMeta = personas.find((p) => p.id === activePersona) || personas[0];
    const chipText = el('ft-ai-persona-chip-text');
    if (chipText && activeMeta) chipText.textContent = activeMeta.shortLabel || activeMeta.label;

    const seg = el('ft-ai-style-seg');
    if (seg) {
      const styles = [
        { id: 'concise', label: 'Concise' },
        { id: 'balanced', label: 'Balanced' },
        { id: 'deep', label: 'Deep' },
      ];
      seg.innerHTML = styles
        .map(
          (st) => `
          <button type="button" class="ft-ai-seg-btn${s.preferences.responseStyle === st.id ? ' is-active' : ''}" data-ai-style="${st.id}">${st.label}</button>`,
        )
        .join('');
    }

    const langSel = el('ft-ai-lang-select');
    if (langSel) {
      const modes = [
        { id: 'auto', label: 'Match My Language' },
        { id: 'en', label: 'English Only' },
        { id: 'ar_en', label: 'Arabic + EN Examples' },
        { id: 'bilingual', label: 'Bilingual EN + AR' },
      ];
      langSel.innerHTML = modes
        .map((m) => `<option value="${m.id}"${s.preferences.responseLanguage === m.id ? ' selected' : ''}>${m.label}</option>`)
        .join('');
    }

    const tempSlider = el('ft-ai-temp-slider');
    const tempVal = el('ft-ai-temp-val');
    if (tempSlider) tempSlider.value = String(s.preferences.temperature ?? 0.45);
    if (tempVal) tempVal.textContent = Number(s.preferences.temperature ?? 0.45).toFixed(2);

    const inst = el('ft-ai-custom-inst');
    if (inst && document.activeElement !== inst) {
      inst.value = s.preferences.customInstructions || '';
    }
  }

  function renderThreadsSidebar() {
    const listEl = el('ft-ai-thread-list');
    if (!listEl) return;
    const s = Store().state;

    if (!Store().isAuthenticated()) {
      listEl.innerHTML = `<div class="ft-ai-thread-empty">Sign in to save &amp; search your conversation history across devices.</div>`;
      return;
    }

    const threads = s.threads || [];
    if (threads.length === 0) {
      const msg = s.threadSearch?.trim()
        ? 'No conversations match your search.'
        : 'No conversations yet. Start asking below!';
      listEl.innerHTML = `<div class="ft-ai-thread-empty">${msg}</div>`;
      return;
    }

    const grouped = groupThreadsByDate(threads);
    const html = [];
    for (const [groupName, items] of Object.entries(grouped)) {
      if (!items.length) continue;
      html.push(`<div class="ft-ai-thread-group-label">${escapeHtml(groupName)}</div>`);
      for (const t of items) {
        const isActive = t.id === s.activeThreadId;
        const isRenaming = t.id === renamingThreadId;
        const badge = t.contextType && t.contextType !== 'general' ? contextShortBadge({ type: t.contextType }) : '';
        if (isRenaming) {
          html.push(`
            <div class="ft-ai-thread-row${isActive ? ' is-active' : ''}" data-thread-id="${escapeHtml(t.id)}">
              <input type="text" class="ft-ai-thread-rename-input" id="ft-ai-rename-inp-${escapeHtml(t.id)}" data-rename-input="${escapeHtml(t.id)}" value="${escapeHtml(t.title || 'New Chat')}" aria-label="Rename conversation" />
            </div>
          `);
          continue;
        }
        html.push(`
          <div class="ft-ai-thread-row${isActive ? ' is-active' : ''}" data-thread-id="${escapeHtml(t.id)}">
            <button type="button" class="ft-ai-thread-select" data-select-thread="${escapeHtml(t.id)}">
              <span class="ft-ai-thread-title" dir="auto">${escapeHtml(t.title || 'New Chat')}</span>
              <span class="ft-ai-thread-meta">
                ${badge ? `<span class="ft-ai-thread-tag">${escapeHtml(badge)}</span>` : ''}
                <span>${Number(t.messageCount) || 0} msgs</span>
              </span>
            </button>
            <div class="ft-ai-thread-actions">
              <button type="button" class="ft-ai-thread-act${t.isPinned ? ' is-pinned' : ''}" data-pin-thread="${escapeHtml(t.id)}" title="${t.isPinned ? 'Unpin' : 'Pin'}" aria-label="Pin conversation">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="${t.isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"></path><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path></svg>
              </button>
              <button type="button" class="ft-ai-thread-act" data-rename-thread="${escapeHtml(t.id)}" title="Rename" aria-label="Rename conversation">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>
              </button>
              <button type="button" class="ft-ai-thread-act is-danger" data-delete-thread="${escapeHtml(t.id)}" title="Delete" aria-label="Delete conversation">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
              </button>
            </div>
          </div>
        `);
      }
    }
    listEl.innerHTML = html.join('');
  }

  function renderQuoteAndImages() {
    const s = Store().state;
    const qCard = el('ft-ai-quote-card');
    if (qCard) {
      const q = s.attachedQuote;
      if (!q || !q.text) {
        qCard.hidden = true;
        qCard.innerHTML = '';
      } else {
        const hasMs = Number.isFinite(Number(q.startMs)) && Number.isFinite(Number(q.endMs)) && q.endMs > q.startMs;
        qCard.hidden = false;
        qCard.innerHTML = `
          <div class="ft-ai-quote-head">
            <div class="ft-ai-quote-meta">
              <span class="ft-ai-quote-kicker">Attached Context</span>
              ${q.speaker ? `<span class="ft-ai-quote-badge">${escapeHtml(q.speaker)}</span>` : ''}
              ${hasMs ? `<span class="ft-ai-quote-time ltr-num">${formatClockMs(q.startMs)} – ${formatClockMs(q.endMs)}</span>` : ''}
            </div>
            <div class="ft-ai-quote-btns">
              ${
                hasMs && s.handlers.playRange
                  ? `<button type="button" class="ft-ai-quote-hear" id="ft-ai-play-quote-btn" title="Hear excerpt">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                      <span>Hear</span>
                    </button>`
                  : ''
              }
              <button type="button" class="ft-ai-quote-clear" id="ft-ai-clear-quote-btn" aria-label="Remove excerpt">×</button>
            </div>
          </div>
          <blockquote class="ft-ai-quote-body" dir="auto">“${escapeHtml(q.text)}”</blockquote>
        `;
      }
    }

    const imgBar = el('ft-ai-images-bar');
    if (imgBar) {
      if (!s.attachedImages.length) {
        imgBar.hidden = true;
        imgBar.innerHTML = '';
      } else {
        imgBar.hidden = false;
        imgBar.innerHTML = s.attachedImages
          .map(
            (img, idx) => `
            <div class="ft-ai-img-chip">
              <img src="${img.previewDataUrl}" alt="${escapeHtml(img.name || 'Image')}" />
              <button type="button" class="ft-ai-img-rm" data-rm-img="${idx}" aria-label="Remove image">×</button>
            </div>`,
          )
          .join('');
      }
    }
  }

  function renderStarters() {
    const s = Store().state;
    const ctx = Store().getEffectiveContext();
    const chips = Ctx()?.getStarterChips?.(ctx, s.attachedQuote) || [];

    const emptyCards = el('ft-ai-empty-cards');
    if (emptyCards) {
      emptyCards.innerHTML = chips
        .slice(0, 4)
        .map(
          (c) => `
          <button type="button" class="ft-ai-empty-card" data-ai-starter="${escapeHtml(c.prompt)}">
            <span class="ft-ai-empty-card-title">${escapeHtml(c.label)}</span>
            <span class="ft-ai-empty-card-sub">${escapeHtml(c.prompt.slice(0, 74))}…</span>
          </button>`,
        )
        .join('');
    }

    const starters = el('ft-ai-starters');
    if (starters) {
      starters.hidden = s.messages.length > 0 && !s.attachedQuote?.text;
      starters.innerHTML = chips
        .slice(0, 4)
        .map(
          (c) =>
            `<button type="button" class="ft-ai-starter-chip" data-ai-starter="${escapeHtml(c.prompt)}">${escapeHtml(c.label)}</button>`,
        )
        .join('');
    }
  }

  function renderMessages() {
    const s = Store().state;
    const feed = el('ft-ai-messages');
    const empty = el('ft-ai-empty');
    const titleEl = el('ft-ai-title');
    if (!feed) return;

    if (titleEl) {
      titleEl.textContent = s.activeThread?.title || 'Flaptap AI';
    }

    const list = s.messages || [];
    if (empty) empty.hidden = list.length > 0;
    if (list.length === 0) {
      feed.innerHTML = '';
      renderStarters();
      return;
    }

    const enableTs = Boolean(s.handlers.seekToSeconds || s.handlers.playRange);
    const mdOpts = { enableTimestampPills: enableTs };

    feed.innerHTML = list
      .map((m, idx) => {
        if (m.role === 'user') {
          const isEditing = s.editingMessageId === m.id;
          const q = m.quote;
          const hasMs = q && Number.isFinite(Number(q.startMs)) && Number.isFinite(Number(q.endMs)) && q.endMs > q.startMs;
          const quoteHtml = q?.text
            ? `
              <div class="ft-ai-msg-quote">
                <span class="ft-ai-msg-quote-text" dir="auto">“${escapeHtml(q.text)}”</span>
                ${
                  hasMs && s.handlers.playRange
                    ? `<button type="button" class="ft-ai-msg-quote-play" data-ai-play-start="${(q.startMs / 1000).toFixed(3)}" data-ai-play-end="${(q.endMs / 1000).toFixed(3)}" title="Hear excerpt"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg></button>`
                    : ''
                }
              </div>`
            : '';

          const imgsHtml = Array.isArray(m.attachments) && m.attachments.length
            ? `<div class="ft-ai-msg-imgs">${m.attachments
                .filter((a) => a.previewDataUrl)
                .map((a) => `<img src="${a.previewDataUrl}" alt="${escapeHtml(a.name || 'Attached image')}" />`)
                .join('')}</div>`
            : '';

          if (isEditing) {
            return `
              <div class="ft-ai-msg ft-ai-msg--user is-editing" data-msg-id="${escapeHtml(m.id)}">
                <textarea class="ft-ai-edit-textarea" id="ft-ai-edit-input-${escapeHtml(m.id)}" rows="3" dir="auto">${escapeHtml(m.content)}</textarea>
                <div class="ft-ai-edit-actions">
                  <button type="button" class="ft-ai-mini-ghost" data-ai-cancel-edit="1">Cancel</button>
                  <button type="button" class="ft-ai-mini-primary" data-ai-save-edit="${escapeHtml(m.id)}">Save &amp; Resend</button>
                </div>
              </div>`;
          }

          return `
            <div class="ft-ai-msg ft-ai-msg--user" data-msg-id="${escapeHtml(m.id)}">
              ${quoteHtml}
              ${imgsHtml}
              <div class="ft-ai-msg-bubble" dir="auto">${escapeHtml(m.content)}</div>
              ${
                !s.streaming && !String(m.id).startsWith('tmp_')
                  ? `<div class="ft-ai-msg-tools ft-ai-msg-tools--user">
                      <button type="button" class="ft-ai-msg-tool" data-ai-edit-id="${escapeHtml(m.id)}" title="Edit &amp; resend">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>
                      </button>
                      <button type="button" class="ft-ai-msg-tool" data-ai-copy-id="${escapeHtml(m.id)}" title="Copy">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                      </button>
                    </div>`
                  : ''
              }
            </div>`;
        }

        const isStreamingThis = s.streaming && s.streamingMsgId === m.id;
        const reasoningHtml = m.reasoning
          ? `
            <details class="ft-ai-reasoning"${isStreamingThis && !m.content ? ' open' : ''}>
              <summary>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.4-1.2 4.5-3 5.7V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.3C6.2 13.5 5 11.4 5 9a7 7 0 0 1 7-7z"></path></svg>
                <span>Thought process</span>
              </summary>
              <div class="ft-ai-reasoning-body" dir="auto">${escapeHtml(m.reasoning)}</div>
            </details>`
          : '';

        const bodyHtml =
          m.pending && !m.content
            ? '<span class="ft-ai-thinking" aria-label="Thinking"><span></span><span></span><span></span></span>'
            : `${Md().render(m.content, mdOpts)}${isStreamingThis ? '<span class="ft-ai-stream-cursor" aria-hidden="true"></span>' : ''}`;

        const metaBits = [];
        if (m.modelName) metaBits.push(m.modelName);
        if (m.executionTimeMs) metaBits.push(`${(m.executionTimeMs / 1000).toFixed(1)}s`);

        const isLastAsst = idx === list.length - 1;

        return `
          <div class="ft-ai-msg ft-ai-msg--assistant${m.error ? ' is-error' : ''}" data-msg-id="${escapeHtml(m.id)}">
            ${reasoningHtml}
            <div class="ft-ai-msg-bubble ft-ai-markdown">${bodyHtml}</div>
            ${
              !m.pending && !isStreamingThis && m.content
                ? `<div class="ft-ai-msg-foot">
                    <span class="ft-ai-msg-meta ltr-num">${escapeHtml(metaBits.join(' · '))}</span>
                    <div class="ft-ai-msg-tools">
                      <button type="button" class="ft-ai-msg-tool" data-ai-copy-id="${escapeHtml(m.id)}" title="Copy answer">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                      </button>
                      <button type="button" class="ft-ai-msg-tool" data-ai-speak-id="${escapeHtml(m.id)}" title="Read aloud">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                      </button>
                      ${
                        !String(m.id).startsWith('tmp_')
                          ? `<button type="button" class="ft-ai-msg-tool" data-ai-regen-id="${escapeHtml(m.id)}" title="Regenerate response">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg>
                            </button>`
                          : ''
                      }
                      ${
                        isLastAsst && !String(m.id).startsWith('tmp_')
                          ? `<button type="button" class="ft-ai-msg-tool" data-ai-continue-id="${escapeHtml(m.id)}" title="Continue generating">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>
                            </button>`
                          : ''
                      }
                    </div>
                  </div>`
                : ''
            }
          </div>`;
      })
      .join('');

    renderStarters();
    if (scrollStickyLock) scrollToBottom();
  }

  function updateStreamingBubbleOnly() {
    const s = Store().state;
    const msgId = s.streamingMsgId;
    if (!msgId) return;
    const target = s.messages.find((m) => m.id === msgId);
    const row = el('ft-ai-messages')?.querySelector(`.ft-ai-msg[data-msg-id="${CSS.escape(msgId)}"]`);
    if (!target || !row) return;

    if (target.reasoning) {
      let det = row.querySelector('.ft-ai-reasoning');
      if (!det) {
        renderMessages();
        return;
      }
      const rBody = det.querySelector('.ft-ai-reasoning-body');
      if (rBody) rBody.textContent = target.reasoning;
    }

    const bubble = row.querySelector('.ft-ai-msg-bubble');
    if (bubble && target.content) {
      const enableTs = Boolean(s.handlers.seekToSeconds || s.handlers.playRange);
      bubble.innerHTML = `${Md().render(target.content, { enableTimestampPills: enableTs })}<span class="ft-ai-stream-cursor" aria-hidden="true"></span>`;
      if (scrollStickyLock) scrollToBottom();
    }
  }

  function scrollToBottom(force = false) {
    const sc = el('ft-ai-scroll');
    if (!sc) return;
    if (force) scrollStickyLock = true;
    requestAnimationFrame(() => {
      sc.scrollTop = sc.scrollHeight;
    });
  }

  function syncStreamingControls() {
    const s = Store().state;
    const sendBtn = el('ft-ai-send-btn');
    const stopBtn = el('ft-ai-stop-btn');
    const fab = el('ft-ai-fab');
    if (sendBtn) sendBtn.hidden = s.streaming;
    if (stopBtn) stopBtn.hidden = !s.streaming;
    if (fab) fab.classList.toggle('is-streaming', s.streaming);
  }

  function renderSlashMenu() {
    const s = Store().state;
    const menu = el('ft-ai-slash-menu');
    if (!menu) return;
    if (!s.slashMenuOpen) {
      menu.hidden = true;
      return;
    }
    const q = String(s.slashFilter || '').toLowerCase();
    const matches = SLASH_COMMANDS.filter(
      (c) => c.cmd.includes(q) || c.label.toLowerCase().includes(q),
    );
    if (!matches.length) {
      menu.hidden = true;
      return;
    }
    const activeIdx = Math.max(0, Math.min(s.slashActiveIdx, matches.length - 1));
    menu.hidden = false;
    menu.innerHTML = matches
      .map(
        (c, i) => `
        <button type="button" class="ft-ai-slash-item${i === activeIdx ? ' is-active' : ''}" data-slash-cmd="${escapeHtml(c.cmd)}">
          <span class="ft-ai-slash-cmd">${escapeHtml(c.cmd)}</span>
          <span class="ft-ai-slash-label">${escapeHtml(c.label)}</span>
        </button>`,
      )
      .join('');
  }

  function applySlashCommand(cmdStr) {
    const found = SLASH_COMMANDS.find((c) => c.cmd === cmdStr);
    const inp = el('ft-ai-input');
    Store().state.slashMenuOpen = false;
    renderSlashMenu();
    if (!found || !inp) return;
    inp.value = found.text;
    autoResizeTextarea(inp);
    inp.focus();
  }

  async function handleFiles(files) {
    const list = Array.from(files || []).filter((f) => String(f.type || '').startsWith('image/'));
    if (!list.length) return;
    const s = Store().state;
    for (const file of list) {
      if (s.attachedImages.length >= 3) {
        Store().showToast('Max 3 image attachments per message.');
        break;
      }
      try {
        const encoded = await Api().encodeImageFile(file);
        s.attachedImages.push(encoded);
      } catch (err) {
        Store().showToast(err?.message || 'Could not attach image.');
      }
    }
    renderQuoteAndImages();
  }

  function bindDomEvents() {
    const drawer = el('ft-ai-drawer');
    if (!drawer || drawer.dataset.bound === '1') return;
    drawer.dataset.bound = '1';

    el('ft-ai-fab')?.addEventListener('click', () => global.FlaptapAiChat.toggle());
    el('ft-ai-backdrop')?.addEventListener('click', () => {
      if (resolveEffectiveModeDef().blocksPage) global.FlaptapAiChat.close();
    });
    el('ft-ai-close-btn')?.addEventListener('click', () => global.FlaptapAiChat.close());

    el('ft-ai-mode-btn')?.addEventListener('click', () => {
      const s = Store().state;
      s.modePopoverOpen = !s.modePopoverOpen;
      s.modelPanelOpen = false;
      s.settingsPanelOpen = false;
      s.contextPopoverOpen = false;
      if (s.modePopoverOpen) renderModePicker();
      syncHeaderSubpanelAria();
    });

    el('ft-ai-sidebar-toggle-btn')?.addEventListener('click', () => {
      Store().state.sidebarOpen = !Store().state.sidebarOpen;
      syncDisplayHost();
      if (Store().state.sidebarOpen) Store().refreshThreads();
    });
    el('ft-ai-sidebar-close-btn')?.addEventListener('click', () => {
      Store().state.sidebarOpen = false;
      syncDisplayHost();
    });

    const newChatFn = () => {
      Store().startNewChat({ clearQuote: true });
      el('ft-ai-input')?.focus();
    };
    el('ft-ai-new-chat-btn')?.addEventListener('click', newChatFn);
    el('ft-ai-quick-new-btn')?.addEventListener('click', newChatFn);

    el('ft-ai-clear-all-btn')?.addEventListener('click', () => {
      if (global.FlaptapConfirm?.confirmAction) {
        global.FlaptapConfirm.confirmAction({
          title: 'Clear all AI chat history?',
          message: 'Permanently deletes all your AI Chat threads and messages.',
          confirmLabel: 'Clear All',
          tone: 'danger',
          onConfirm: () => Store().clearAllThreads(),
        });
      } else if (global.confirm('Delete all AI chat conversations? This cannot be undone.')) {
        Store().clearAllThreads();
      }
    });

    let searchTimer = 0;
    el('ft-ai-thread-search')?.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        Store().refreshThreads(e.target.value || '');
      }, 200);
    });

    el('ft-ai-model-btn')?.addEventListener('click', () => {
      const s = Store().state;
      s.modelPanelOpen = !s.modelPanelOpen;
      s.modePopoverOpen = false;
      s.settingsPanelOpen = false;
      s.contextPopoverOpen = false;
      syncHeaderSubpanelAria();
      if (s.modelPanelOpen) ensureAiSelector();
    });

    el('ft-ai-settings-btn')?.addEventListener('click', () => {
      const s = Store().state;
      s.settingsPanelOpen = !s.settingsPanelOpen;
      s.modePopoverOpen = false;
      s.modelPanelOpen = false;
      s.contextPopoverOpen = false;
      syncHeaderSubpanelAria();
    });

    el('ft-ai-ctx-pill')?.addEventListener('click', () => {
      const s = Store().state;
      s.contextPopoverOpen = !s.contextPopoverOpen;
      s.modePopoverOpen = false;
      s.modelPanelOpen = false;
      s.settingsPanelOpen = false;
      syncHeaderSubpanelAria();
    });

    el('ft-ai-persona-chip')?.addEventListener('click', () => {
      el('ft-ai-settings-btn')?.click();
    });

    el('ft-ai-ctx-toggle')?.addEventListener('change', (e) => {
      const checked = Boolean(e.target.checked);
      Store().state.usePageContext = checked;
      Store().updatePreferences({ usePageContext: checked });
      renderContextUi();
    });

    el('ft-ai-temp-slider')?.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      const lbl = el('ft-ai-temp-val');
      if (lbl) lbl.textContent = val.toFixed(2);
    });
    el('ft-ai-temp-slider')?.addEventListener('change', (e) => {
      Store().updatePreferences({ temperature: Number(e.target.value) });
    });

    el('ft-ai-lang-select')?.addEventListener('change', (e) => {
      Store().updatePreferences({ responseLanguage: e.target.value });
    });

    el('ft-ai-save-inst-btn')?.addEventListener('click', () => {
      const val = el('ft-ai-custom-inst')?.value || '';
      Store().updatePreferences({ customInstructions: val });
      Store().showToast('AI preferences saved');
      Store().state.settingsPanelOpen = false;
      el('ft-ai-settings-popover').hidden = true;
    });

    el('ft-ai-export-btn')?.addEventListener('click', () => {
      const tid = Store().state.activeThreadId;
      if (!tid) {
        Store().showToast('Start a conversation first to export it.');
        return;
      }
      global.open(Api().exportUrl(tid, 'md'), '_blank', 'noopener');
    });

    const scrollEl = el('ft-ai-scroll');
    scrollEl?.addEventListener('scroll', () => {
      const nearBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 64;
      scrollStickyLock = nearBottom;
      const btn = el('ft-ai-scroll-bottom-btn');
      if (btn) btn.hidden = nearBottom || Store().state.messages.length === 0;
    });
    el('ft-ai-scroll-bottom-btn')?.addEventListener('click', () => scrollToBottom(true));

    // Left-edge drag resize across Split, Docked, and Floating modes
    const resizeHandle = el('ft-ai-resize-handle');
    resizeHandle?.addEventListener('pointerdown', (ev) => {
      const eff = resolveEffectiveModeDef();
      if (!eff.resizable) return;
      ev.preventDefault();
      document.documentElement.classList.add('ft-ai-resizing');
      const isRtl = document.documentElement.getAttribute('dir') === 'rtl';
      const drawerRect = drawer.getBoundingClientRect();
      const onMove = (moveEv) => {
        let nextW;
        if (eff.id === 'floating') {
          nextW = isRtl ? moveEv.clientX - drawerRect.left : drawerRect.right - moveEv.clientX;
        } else {
          const edgeOffset = eff.id === 'split' ? 0 : 12;
          nextW = isRtl ? moveEv.clientX - edgeOffset : global.innerWidth - moveEv.clientX - edgeOffset;
        }
        const clamped = Math.max(340, Math.min(720, Math.round(nextW)));
        Store().state.drawerWidth = clamped;
        drawer.style.setProperty('--ft-ai-drawer-width', `${clamped}px`);
        if (eff.pushesLayout) {
          document.documentElement.style.setProperty('--ft-ai-split-width', `${clamped}px`);
        }
        if (eff.draggable) {
          applyFloatingBounds(drawer);
        }
      };
      const onUp = () => {
        document.documentElement.classList.remove('ft-ai-resizing');
        Store().setDrawerWidth(Store().state.drawerWidth);
        global.removeEventListener('pointermove', onMove);
        global.removeEventListener('pointerup', onUp);
      };
      global.addEventListener('pointermove', onMove);
      global.addEventListener('pointerup', onUp);
    });

    // Drag header to reposition Floating Window
    const headEl = drawer.querySelector('.ft-ai-head');
    headEl?.addEventListener('pointerdown', (ev) => {
      const eff = resolveEffectiveModeDef();
      if (!eff.draggable) return;
      if (ev.target.closest('button, a, input, select, textarea')) return;
      ev.preventDefault();
      const rect = drawer.getBoundingClientRect();
      const offsetX = ev.clientX - rect.left;
      const offsetY = ev.clientY - rect.top;
      drawer.classList.add('is-dragging');
      const onMove = (moveEv) => {
        const vw = global.innerWidth || 1280;
        const vh = global.innerHeight || 800;
        const nextX = Math.max(12, Math.min(moveEv.clientX - offsetX, vw - rect.width - 12));
        const nextY = Math.max(12, Math.min(moveEv.clientY - offsetY, vh - rect.height - 12));
        drawer.style.left = `${Math.round(nextX)}px`;
        drawer.style.top = `${Math.round(nextY)}px`;
        Store().state.floatingPos = { x: Math.round(nextX), y: Math.round(nextY) };
      };
      const onUp = () => {
        drawer.classList.remove('is-dragging');
        if (Store().state.floatingPos) {
          Store().setFloatingPos(Store().state.floatingPos.x, Store().state.floatingPos.y);
        }
        global.removeEventListener('pointermove', onMove);
        global.removeEventListener('pointerup', onUp);
      };
      global.addEventListener('pointermove', onMove);
      global.addEventListener('pointerup', onUp);
    });

    // Delegated clicks inside drawer
    drawer.addEventListener('click', (e) => {
      const modePick = e.target.closest('[data-set-display-mode]');
      if (modePick) {
        const targetMode = modePick.getAttribute('data-set-display-mode');
        global.FlaptapAiChat.setDisplayMode(targetMode);
        return;
      }
      const selThread = e.target.closest('[data-select-thread]');
      if (selThread) {
        const id = selThread.getAttribute('data-select-thread');
        Store().selectThread(id);
        if (global.innerWidth <= 900 && Store().state.displayMode !== 'fullpage') {
          Store().state.sidebarOpen = false;
          syncDisplayHost();
        }
        return;
      }

      const pinThread = e.target.closest('[data-pin-thread]');
      if (pinThread) {
        const id = pinThread.getAttribute('data-pin-thread');
        const t = Store().state.threads.find((x) => x.id === id);
        if (t) Store().updateThreadMeta(id, { isPinned: !t.isPinned });
        return;
      }

      const renameThread = e.target.closest('[data-rename-thread]');
      if (renameThread) {
        const id = renameThread.getAttribute('data-rename-thread');
        renamingThreadId = id;
        renderThreadsSidebar();
        const rInp = el(`ft-ai-rename-inp-${id}`);
        if (rInp) {
          rInp.focus();
          rInp.select();
          const commitRename = () => {
            if (renamingThreadId !== id) return;
            renamingThreadId = '';
            const nextTitle = rInp.value.trim();
            if (nextTitle) {
              Store().updateThreadMeta(id, { title: nextTitle });
            } else {
              renderThreadsSidebar();
            }
          };
          rInp.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              commitRename();
            } else if (ev.key === 'Escape') {
              ev.preventDefault();
              renamingThreadId = '';
              renderThreadsSidebar();
            }
          });
          rInp.addEventListener('blur', commitRename, { once: true });
        }
        return;
      }

      const delThread = e.target.closest('[data-delete-thread]');
      if (delThread) {
        Store().deleteThread(delThread.getAttribute('data-delete-thread'));
        return;
      }

      const personaBtn = e.target.closest('[data-ai-persona]');
      if (personaBtn) {
        const p = personaBtn.getAttribute('data-ai-persona');
        Store().state.personaOverride = p;
        Store().updatePreferences({ defaultPersona: p });
        if (Store().state.activeThreadId) {
          Store().updateThreadMeta(Store().state.activeThreadId, { persona: p });
        }
        renderPersonaAndControls();
        return;
      }

      const styleBtn = e.target.closest('[data-ai-style]');
      if (styleBtn) {
        Store().updatePreferences({ responseStyle: styleBtn.getAttribute('data-ai-style') });
        renderPersonaAndControls();
        return;
      }

      const starterBtn = e.target.closest('[data-ai-starter]');
      if (starterBtn) {
        const prompt = starterBtn.getAttribute('data-ai-starter');
        if (prompt) Store().sendMessage(prompt);
        return;
      }

      const slashBtn = e.target.closest('[data-slash-cmd]');
      if (slashBtn) {
        applySlashCommand(slashBtn.getAttribute('data-slash-cmd'));
        return;
      }

      if (e.target.closest('#ft-ai-clear-quote-btn')) {
        Store().state.attachedQuote = null;
        renderQuoteAndImages();
        renderStarters();
        return;
      }

      if (e.target.closest('#ft-ai-play-quote-btn') && Store().state.attachedQuote) {
        const q = Store().state.attachedQuote;
        Store().state.handlers.playRange?.(q.startMs / 1000, q.endMs / 1000, {
          mode: 'range',
          label: q.text.slice(0, 28),
          sentIndex: q.sentenceIndex,
        });
        return;
      }

      const rmImg = e.target.closest('[data-rm-img]');
      if (rmImg) {
        const idx = Number(rmImg.getAttribute('data-rm-img'));
        Store().state.attachedImages.splice(idx, 1);
        renderQuoteAndImages();
        return;
      }

      const playMsgQ = e.target.closest('[data-ai-play-start]');
      if (playMsgQ) {
        const sSec = Number(playMsgQ.getAttribute('data-ai-play-start'));
        const eSec = Number(playMsgQ.getAttribute('data-ai-play-end'));
        if (Number.isFinite(sSec) && Number.isFinite(eSec)) {
          Store().state.handlers.playRange?.(sSec, eSec, { mode: 'range', label: 'Quote' });
        }
        return;
      }

      const seekTs = e.target.closest('[data-ai-seek-ts]');
      if (seekTs) {
        const raw = seekTs.getAttribute('data-ai-seek-ts') || '';
        const parts = raw.split(':').map(Number);
        let secs = 0;
        if (parts.length === 2) secs = parts[0] * 60 + parts[1];
        else if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (Number.isFinite(secs)) {
          if (Store().state.handlers.seekToSeconds) {
            Store().state.handlers.seekToSeconds(secs);
          } else if (Store().state.handlers.playRange) {
            Store().state.handlers.playRange(secs, secs + 5, { mode: 'range', label: raw });
          }
        }
        return;
      }

      const codeCopy = e.target.closest('[data-ai-copy-code]');
      if (codeCopy) {
        const code = codeCopy.closest('.ft-ai-code-block')?.querySelector('pre code')?.textContent || '';
        navigator.clipboard?.writeText?.(code).then(() => Store().showToast('Code copied'));
        return;
      }

      const copyId = e.target.closest('[data-ai-copy-id]');
      if (copyId) {
        const id = copyId.getAttribute('data-ai-copy-id');
        const m = Store().state.messages.find((x) => x.id === id);
        if (m?.content) {
          navigator.clipboard?.writeText?.(m.content).then(() => Store().showToast('Copied'));
        }
        return;
      }

      const speakId = e.target.closest('[data-ai-speak-id]');
      if (speakId) {
        const id = speakId.getAttribute('data-ai-speak-id');
        const m = Store().state.messages.find((x) => x.id === id);
        if (m?.content) voiceCtrl?.speak(m.content);
        return;
      }

      const regenId = e.target.closest('[data-ai-regen-id]');
      if (regenId) {
        Store().regenerateMessage(regenId.getAttribute('data-ai-regen-id'));
        return;
      }

      const contId = e.target.closest('[data-ai-continue-id]');
      if (contId) {
        Store().continueMessage(contId.getAttribute('data-ai-continue-id'));
        return;
      }

      const editId = e.target.closest('[data-ai-edit-id]');
      if (editId) {
        Store().state.editingMessageId = editId.getAttribute('data-ai-edit-id');
        renderMessages();
        const editBox = el(`ft-ai-edit-input-${Store().state.editingMessageId}`);
        editBox?.focus();
        return;
      }

      if (e.target.closest('[data-ai-cancel-edit]')) {
        Store().state.editingMessageId = '';
        renderMessages();
        return;
      }

      const saveEditBtn = e.target.closest('[data-ai-save-edit]');
      if (saveEditBtn) {
        const id = saveEditBtn.getAttribute('data-ai-save-edit');
        const val = el(`ft-ai-edit-input-${id}`)?.value || '';
        Store().editAndResend(id, val);
      }
    });

    // Composer input, slash commands, image paste & drag-drop
    const inp = el('ft-ai-input');
    inp?.addEventListener('input', () => {
      autoResizeTextarea(inp);
      const val = inp.value || '';
      if (val.startsWith('/') && !val.includes(' ')) {
        Store().state.slashMenuOpen = true;
        Store().state.slashFilter = val;
        Store().state.slashActiveIdx = 0;
        renderSlashMenu();
      } else if (Store().state.slashMenuOpen) {
        Store().state.slashMenuOpen = false;
        renderSlashMenu();
      }
    });

    inp?.addEventListener('keydown', (e) => {
      e.stopPropagation();
      const s = Store().state;
      if (s.slashMenuOpen) {
        const matches = SLASH_COMMANDS.filter(
          (c) => c.cmd.includes(s.slashFilter.toLowerCase()) || c.label.toLowerCase().includes(s.slashFilter.toLowerCase()),
        );
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          s.slashActiveIdx = (s.slashActiveIdx + 1) % Math.max(1, matches.length);
          renderSlashMenu();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          s.slashActiveIdx = (s.slashActiveIdx - 1 + matches.length) % Math.max(1, matches.length);
          renderSlashMenu();
          return;
        }
        if (e.key === 'Enter' && matches[s.slashActiveIdx]) {
          e.preventDefault();
          applySlashCommand(matches[s.slashActiveIdx].cmd);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          s.slashMenuOpen = false;
          renderSlashMenu();
          return;
        }
      }

      if (e.key === 'Escape' && s.isOpen && s.displayMode !== 'fullpage') {
        e.preventDefault();
        if (s.modePopoverOpen || s.modelPanelOpen || s.settingsPanelOpen || s.contextPopoverOpen) {
          s.modePopoverOpen = false;
          s.modelPanelOpen = false;
          s.settingsPanelOpen = false;
          s.contextPopoverOpen = false;
          syncHeaderSubpanelAria();
          return;
        }
        global.FlaptapAiChat.close();
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = inp.value;
        if (!String(text || '').trim()) return;
        inp.value = '';
        autoResizeTextarea(inp);
        Store().sendMessage(text);
      }
    });

    inp?.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles = [];
      for (const it of items) {
        if (it.kind === 'file' && String(it.type || '').startsWith('image/')) {
          const f = it.getAsFile();
          if (f) imageFiles.push(f);
        }
      }
      if (imageFiles.length) {
        e.preventDefault();
        handleFiles(imageFiles);
      }
    });

    const composer = el('ft-ai-composer');
    composer?.addEventListener('dragover', (e) => {
      e.preventDefault();
      composer.classList.add('is-dragover');
    });
    composer?.addEventListener('dragleave', () => composer.classList.remove('is-dragover'));
    composer?.addEventListener('drop', (e) => {
      e.preventDefault();
      composer.classList.remove('is-dragover');
      if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
    });

    el('ft-ai-attach-btn')?.addEventListener('click', () => el('ft-ai-image-file')?.click());
    el('ft-ai-image-file')?.addEventListener('change', (e) => {
      handleFiles(e.target.files);
      e.target.value = '';
    });

    el('ft-ai-slash-btn')?.addEventListener('click', () => {
      Store().state.slashMenuOpen = !Store().state.slashMenuOpen;
      Store().state.slashFilter = '/';
      Store().state.slashActiveIdx = 0;
      renderSlashMenu();
      inp?.focus();
    });

    el('ft-ai-send-btn')?.addEventListener('click', () => {
      const text = inp?.value || '';
      if (!String(text).trim()) return;
      inp.value = '';
      autoResizeTextarea(inp);
      Store().sendMessage(text);
    });

    el('ft-ai-stop-btn')?.addEventListener('click', () => {
      Store().state.abortCtrl?.abort();
    });

    el('ft-ai-mic-btn')?.addEventListener('click', () => {
      if (!Store().ensureAuth({ type: 'open_ai_chat' })) return;
      voiceCtrl?.start(
        () => inp?.value || '',
        (val) => {
          if (inp) {
            inp.value = val;
            autoResizeTextarea(inp);
          }
        },
      );
    });

    el('ft-ai-voice-lang')?.addEventListener('click', () => {
      voiceCtrl?.cycleLang();
    });

    // Global keyboard shortcuts: Cmd/Ctrl + J toggles overlay, Esc closes overlay
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (Store().state.displayMode !== 'fullpage') {
          global.FlaptapAiChat.toggle();
        } else {
          el('ft-ai-input')?.focus();
        }
        return;
      }
      if (e.key === 'Escape' && Store().state.isOpen && Store().state.displayMode !== 'fullpage') {
        const activeTag = document.activeElement?.tagName;
        const s = Store().state;
        if (s.slashMenuOpen) {
          s.slashMenuOpen = false;
          renderSlashMenu();
          return;
        }
        if (s.modePopoverOpen || s.modelPanelOpen || s.settingsPanelOpen || s.contextPopoverOpen) {
          s.modePopoverOpen = false;
          s.modelPanelOpen = false;
          s.settingsPanelOpen = false;
          s.contextPopoverOpen = false;
          syncHeaderSubpanelAria();
          return;
        }
        const focusedInside = drawer.contains(document.activeElement);
        if ((resolveEffectiveModeDef().blocksPage || focusedInside) && activeTag !== 'SELECT') {
          global.FlaptapAiChat.close();
        }
      }
    });

    let resizeRaf = 0;
    global.addEventListener('resize', () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        syncDisplayHost();
      });
    });

    // React to Store updates cleanly
    Store().subscribe((_s, reason) => {
      if (reason === 'stream-delta') {
        if (!streamRenderRaf) {
          streamRenderRaf = requestAnimationFrame(() => {
            streamRenderRaf = 0;
            updateStreamingBubbleOnly();
          });
        }
        return;
      }
      syncDisplayHost();
      syncStreamingControls();
      renderContextUi();
      renderPersonaAndControls();
      renderQuoteAndImages();
      if (reason === 'threads' || reason === 'account' || reason === 'thread' || reason === 'init') {
        renderThreadsSidebar();
      }
      if (
        (reason === 'thread' || reason === 'thread-meta') &&
        Store().state.displayMode === 'fullpage' &&
        global.history?.replaceState
      ) {
        const tid = Store().state.activeThreadId;
        const targetPath = tid ? `/chat/${encodeURIComponent(tid)}` : '/chat';
        if (global.location.pathname !== targetPath) {
          global.history.replaceState({}, '', targetPath);
        }
      }
      if (reason !== 'width' && reason !== 'preferences') {
        renderMessages();
      }
    });

    // React to live context changes & UI language switches across the app
    Ctx()?.subscribe?.(() => {
      renderContextUi();
      renderStarters();
    });
    global.addEventListener('flaptap:ui-lang-changed', () => {
      renderContextUi();
      renderStarters();
    });
  }

  global.FlaptapAiChatUi = {
    buildDom,
    syncDisplayHost,
    renderModePicker,
    renderContextUi,
    renderPersonaAndControls,
    renderThreadsSidebar,
    renderQuoteAndImages,
    renderMessages,
    focusInput: () => setTimeout(() => el('ft-ai-input')?.focus(), 50),
    setInputPrefill: (text) => {
      const inp = el('ft-ai-input');
      if (inp) {
        inp.value = String(text || '');
        autoResizeTextarea(inp);
      }
    },
  };
})(window);
