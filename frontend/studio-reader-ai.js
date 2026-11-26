/* ==========================================================================
   FLAPTAP SHADOWING STUDIO — CONTEXT-AWARE VOICE & TEXT AI COMPANION
   Slide-over Native American Thinking & Speaking Mentor grounded in the
   active video transcript, surrounding ±5 lines, speaker & ms timestamps.
   Supports live streaming SSE responses, shared FlaptapAiSelector, and
   Voice input (Web Speech API live dictation + MediaRecorder server STT fallback).
   ========================================================================== */

(function (global) {
  'use strict';

  const state = {
    lessonId: '',
    isOpen: false,
    streaming: false,
    abortCtrl: null,
    aiSelector: null,
    modelPanelOpen: false,
    messages: [],
    selection: null, // { text, startMs, endMs, sentenceIndex, speaker, view }
    voiceActive: false,
    voiceLang: localStorage.getItem('flaptap_ask_voice_lang') || 'auto', // 'auto' | 'en-US' | 'ar-EG'
    autoSendVoice: localStorage.getItem('flaptap_ask_voice_autosend') !== '0',
    recognition: null,
    mediaRecorder: null,
    mediaStream: null,
    audioChunks: [],
    liveRecognizedText: '',
    handlers: {
      apiFetch: null,
      apiHeaders: null,
      showToast: null,
      playRange: null,
      speakText: null,
    },
  };

  function escapeHtml(val) {
    if (global.FlaptapUtils?.escapeHtml) return global.FlaptapUtils.escapeHtml(val);
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatClockMs(ms) {
    if (global.FlaptapStudioTranscriptTools?.formatClockMs) {
      return global.FlaptapStudioTranscriptTools.formatClockMs(ms);
    }
    const safe = Math.max(0, Math.round(Number(ms) || 0));
    const mins = Math.floor(safe / 60000);
    const secs = Math.floor((safe % 60000) / 1000);
    const rem = safe % 1000;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(rem).padStart(3, '0')}`;
  }

  function configure(handlers = {}) {
    Object.assign(state.handlers, handlers);
  }

  function ensureAiSelector() {
    if (state.aiSelector || !global.FlaptapAiSelector) return;
    const mount = document.getElementById('studio-ask-ai-mount');
    if (!mount) return;
    state.aiSelector = global.FlaptapAiSelector.create({
      container: mount,
      idPrefix: 'studio-ask-aisel',
      persistenceKey: 'shadowing_ask',
      title: 'Companion Model',
      compact: true,
      showRunButton: false,
      hideMetaChips: true,
      fetcher: state.handlers.apiFetch,
    });
    state.aiSelector.init();
  }

  function renderMarkdownSafe(raw) {
    const src = String(raw || '').replace(/\r\n/g, '\n').trim();
    if (!src) return '';

    const inlineFormat = (text) => {
      let s = escapeHtml(text);
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
      return s;
    };

    const lines = src.split('\n');
    const blocks = [];
    let listType = null;
    let listItems = [];

    const flushList = () => {
      if (!listType || !listItems.length) return;
      blocks.push(`<${listType} dir="auto">${listItems.join('')}</${listType}>`);
      listType = null;
      listItems = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        flushList();
        continue;
      }
      const ulMatch = trimmed.match(/^[-*•]\s+(.+)$/);
      const olMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
      const hMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
      const bqMatch = trimmed.match(/^>\s+(.+)$/);

      if (ulMatch) {
        if (listType !== 'ul') flushList();
        listType = 'ul';
        listItems.push(`<li dir="auto">${inlineFormat(ulMatch[1])}</li>`);
      } else if (olMatch) {
        if (listType !== 'ol') flushList();
        listType = 'ol';
        listItems.push(`<li dir="auto">${inlineFormat(olMatch[1])}</li>`);
      } else {
        flushList();
        if (hMatch) {
          blocks.push(`<h4 dir="auto">${inlineFormat(hMatch[1])}</h4>`);
        } else if (bqMatch) {
          blocks.push(`<blockquote dir="auto">${inlineFormat(bqMatch[1])}</blockquote>`);
        } else {
          blocks.push(`<p dir="auto">${inlineFormat(trimmed)}</p>`);
        }
      }
    }
    flushList();
    return blocks.join('');
  }

  function renderQuoteCard() {
    const card = document.getElementById('studio-ask-quote-card');
    if (!card) return;
    const sel = state.selection;
    if (!sel || !sel.text) {
      card.hidden = true;
      card.innerHTML = '';
      renderStarterChips();
      return;
    }

    const hasMs = Number.isFinite(Number(sel.startMs)) && Number.isFinite(Number(sel.endMs)) && sel.endMs > sel.startMs;
    const timeBadge = hasMs
      ? `<span class="ask-quote-time ltr-num">${escapeHtml(formatClockMs(sel.startMs))} – ${escapeHtml(formatClockMs(sel.endMs))}</span>`
      : '';
    const spkBadge = sel.speaker
      ? `<span class="ask-quote-speaker">${escapeHtml(sel.speaker)}</span>`
      : '';

    card.hidden = false;
    card.innerHTML = `
      <div class="ask-quote-head">
        <div class="ask-quote-meta">
          <span class="ask-quote-kicker">Focused Excerpt</span>
          ${spkBadge}
          ${timeBadge}
        </div>
        <div class="ask-quote-actions">
          ${
            hasMs
              ? `<button type="button" class="ask-quote-play-btn" id="studio-ask-play-quote-btn" title="Hear exact speaker audio">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                  <span>Hear</span>
                </button>`
              : ''
          }
          <button type="button" class="ask-quote-clear-btn" id="studio-ask-clear-quote-btn" aria-label="Detach excerpt" title="Ask about whole transcript">×</button>
        </div>
      </div>
      <blockquote class="ask-quote-text" dir="auto">“${escapeHtml(sel.text)}”</blockquote>
    `;
    renderStarterChips();
  }

  function renderStarterChips() {
    const host = document.getElementById('studio-ask-starters');
    if (!host) return;
    const hasQuote = Boolean(state.selection?.text);
    const chips = hasQuote
      ? [
          { label: 'Why say it like this?', prompt: 'Why did the speaker phrase this exact part this way? Break down the natural American thought flow and nuance.' },
          { label: 'Natural alternatives', prompt: 'Give me 3-4 natural spoken American alternatives for this idea with subtle differences in tone.' },
          { label: 'Explain meaning & idioms', prompt: 'Explain the exact meaning in context, any idioms or reductions, and how natives use it.' },
          { label: 'Is this natural or cut off?', prompt: 'Is this a clean natural phrasing or a spontaneous self-correction / interruption? Show how a native hears it.' },
        ]
      : [
          { label: 'How they structure thoughts', prompt: 'How does the speaker sequence and connect their thoughts naturally in this video?' },
          { label: 'Key spoken expressions', prompt: 'What are the most useful natural American phrases and connectors to steal from this transcript?' },
          { label: 'Explain speaker’s style', prompt: 'Describe this speaker’s spontaneous speaking style, fillers, pacing, and thought patterns.' },
        ];

    host.innerHTML = chips
      .map(
        (c) =>
          `<button type="button" class="ask-starter-chip" data-ask-starter="${escapeHtml(c.prompt)}">${escapeHtml(c.label)}</button>`,
      )
      .join('');
  }

  function renderMessages() {
    const feed = document.getElementById('studio-ask-messages');
    const empty = document.getElementById('studio-ask-empty');
    if (!feed) return;

    const list = state.messages || [];
    if (empty) empty.hidden = list.length > 0;

    if (list.length === 0) {
      feed.innerHTML = '';
      return;
    }

    feed.innerHTML = list
      .map((m) => {
        if (m.role === 'user') {
          const hasMs = Number.isFinite(Number(m.startMs)) && Number.isFinite(Number(m.endMs)) && m.endMs > m.startMs;
          const quoteHtml = m.selectedText
            ? `
              <div class="ask-msg-quote">
                <span class="ask-msg-quote-text" dir="auto">“${escapeHtml(m.selectedText)}”</span>
                ${
                  hasMs
                    ? `<button type="button" class="ask-msg-quote-play" data-ask-play-start="${(m.startMs / 1000).toFixed(3)}" data-ask-play-end="${(m.endMs / 1000).toFixed(3)}" title="Hear excerpt (${escapeHtml(formatClockMs(m.startMs))})">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                      </button>`
                    : ''
                }
              </div>
            `
            : '';
          return `
            <div class="ask-msg ask-msg--user" data-msg-id="${escapeHtml(m.id)}">
              ${quoteHtml}
              <div class="ask-msg-bubble" dir="auto">${escapeHtml(m.content)}</div>
            </div>
          `;
        }

        const bodyHtml = m.pending && !m.content
          ? '<span class="ask-typing-dots" aria-label="Thinking"><span></span><span></span><span></span></span>'
          : renderMarkdownSafe(m.content);

        return `
          <div class="ask-msg ask-msg--assistant${m.error ? ' is-error' : ''}" data-msg-id="${escapeHtml(m.id)}">
            <div class="ask-msg-bubble ask-markdown">${bodyHtml}</div>
            ${
              !m.pending && m.content
                ? `
                  <div class="ask-msg-foot">
                    ${m.modelName ? `<span class="ask-msg-model ltr-num">${escapeHtml(m.modelName)}</span>` : '<span></span>'}
                    <div class="ask-msg-tools">
                      <button type="button" class="ask-msg-tool-btn" data-ask-speak-id="${escapeHtml(m.id)}" title="Read aloud">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                      </button>
                      <button type="button" class="ask-msg-tool-btn" data-ask-copy-id="${escapeHtml(m.id)}" title="Copy answer">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                      </button>
                    </div>
                  </div>
                `
                : ''
            }
          </div>
        `;
      })
      .join('');

    scrollMessagesToBottom();
  }

  function updateStreamingAssistantBubble(msgId, content) {
    const feed = document.getElementById('studio-ask-messages');
    const row = feed?.querySelector(`.ask-msg[data-msg-id="${CSS.escape(msgId)}"] .ask-msg-bubble`);
    if (!row) return;
    row.innerHTML = renderMarkdownSafe(content);
    scrollMessagesToBottom();
  }

  function scrollMessagesToBottom() {
    const body = document.getElementById('studio-ask-scroll');
    if (!body) return;
    requestAnimationFrame(() => {
      body.scrollTop = body.scrollHeight;
    });
  }

  function setDrawerOpen(open) {
    state.isOpen = Boolean(open);
    const drawer = document.getElementById('studio-ask-drawer');
    const backdrop = document.getElementById('studio-ask-backdrop');
    const topBtn = document.getElementById('studio-ask-ai-btn');

    if (drawer) {
      drawer.hidden = !state.isOpen;
      drawer.classList.toggle('is-open', state.isOpen);
    }
    if (backdrop) {
      backdrop.hidden = !state.isOpen;
    }
    if (topBtn) {
      topBtn.classList.toggle('active', state.isOpen);
      topBtn.setAttribute('aria-expanded', state.isOpen ? 'true' : 'false');
    }

    if (state.isOpen) {
      ensureAiSelector();
      renderQuoteCard();
      renderMessages();
      setTimeout(() => {
        document.getElementById('studio-ask-input')?.focus();
      }, 60);
    } else if (state.voiceActive) {
      stopVoiceCapture({ autoSend: false });
    }
  }

  function open(opts = {}) {
    if (opts.selection) {
      state.selection = opts.selection;
    }
    setDrawerOpen(true);
    if (opts.prefill) {
      const inp = document.getElementById('studio-ask-input');
      if (inp) {
        inp.value = opts.prefill;
        autoResizeTextarea(inp);
      }
    }
  }

  function openWithSelection(selection) {
    state.selection = selection
      ? {
          text: String(selection.text || '').trim(),
          startMs: Number.isFinite(Number(selection.startMs)) ? Number(selection.startMs) : undefined,
          endMs: Number.isFinite(Number(selection.endMs)) ? Number(selection.endMs) : undefined,
          sentenceIndex: Number(selection.sentenceIndex) || undefined,
          speaker: selection.speaker || '',
          view: selection.view === 'raw' ? 'raw' : 'reviewed',
        }
      : null;
    setDrawerOpen(true);
  }

  function toggle() {
    setDrawerOpen(!state.isOpen);
  }

  function close() {
    setDrawerOpen(false);
  }

  function hydrate(item) {
    state.lessonId = item?.id || '';
    state.messages = Array.isArray(item?.transcriptData?.askHistory)
      ? item.transcriptData.askHistory.slice(-40)
      : [];
    state.selection = null;
    renderQuoteCard();
    renderMessages();
  }

  function syncSendStopUi() {
    const sendBtn = document.getElementById('studio-ask-send-btn');
    const stopBtn = document.getElementById('studio-ask-stop-btn');
    if (sendBtn) sendBtn.hidden = state.streaming;
    if (stopBtn) stopBtn.hidden = !state.streaming;
  }

  async function sendQuestion(explicitText) {
    const inp = document.getElementById('studio-ask-input');
    const question = String(explicitText !== undefined ? explicitText : inp?.value || '').trim();
    if (!question || state.streaming) return;
    if (!state.lessonId) {
      state.handlers.showToast?.('Open a lesson first to ask questions.');
      return;
    }

    if (inp && explicitText === undefined) {
      inp.value = '';
      autoResizeTextarea(inp);
    }

    const sel = state.selection;
    const activeView =
      sel?.view ||
      (global.studioState?.mode === 'read' && global.studioState?.readView === 'raw'
        ? 'raw'
        : 'reviewed');

    const tempUserId = `tmp_u_${Date.now()}`;
    const tempAsstId = `tmp_a_${Date.now()}`;

    const historySnapshot = state.messages
      .filter((m) => !m.pending && !m.error && m.content)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content, selectedText: m.selectedText }));

    state.messages.push(
      {
        id: tempUserId,
        role: 'user',
        content: question,
        selectedText: sel?.text || '',
        startMs: sel?.startMs,
        endMs: sel?.endMs,
        speaker: sel?.speaker || '',
      },
      {
        id: tempAsstId,
        role: 'assistant',
        content: '',
        pending: true,
      },
    );
    renderMessages();

    const aiSel = state.aiSelector?.getSelection?.() || {};
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      state.handlers.apiHeaders ? state.handlers.apiHeaders() : {},
    );

    const ac = new AbortController();
    state.abortCtrl = ac;
    state.streaming = true;
    syncSendStopUi();

    try {
      const res = await fetch(
        `/api/tracks/shadowing/${encodeURIComponent(state.lessonId)}/ask/stream`,
        {
          method: 'POST',
          headers,
          credentials: 'same-origin',
          signal: ac.signal,
          body: JSON.stringify({
            question,
            selectedText: sel?.text || undefined,
            startMs: sel?.startMs,
            endMs: sel?.endMs,
            sentenceIndex: sel?.sentenceIndex,
            speaker: sel?.speaker || undefined,
            view: activeView,
            history: historySnapshot,
            keyId: aiSel.keyId || undefined,
            model: aiSel.model || aiSel.modelId || undefined,
            variant: aiSel.variant || aiSel.variantId || undefined,
          }),
        },
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || `Request failed (${res.status})`);
      }

      const reader = res.body?.getReader?.();
      if (!reader) throw new Error('Streaming unavailable.');

      const decoder = new TextDecoder();
      let buffer = '';
      let donePayload = null;
      let streamedText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';
        for (const frame of frames) {
          const lines = frame.split('\n');
          let ev = 'message';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event:')) ev = line.slice(6).trim();
            else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          let parsed = null;
          try {
            parsed = JSON.parse(dataStr);
          } catch {
            continue;
          }
          if (ev === 'delta') {
            streamedText = String(parsed?.accumulated || `${streamedText}${parsed?.delta || ''}`);
            const target = state.messages.find((m) => m.id === tempAsstId);
            if (target) {
              target.content = streamedText;
              target.pending = false;
              updateStreamingAssistantBubble(tempAsstId, streamedText);
            }
          } else if (ev === 'done') {
            donePayload = parsed?.data || null;
          } else if (ev === 'error') {
            throw new Error(parsed?.message || 'AI Tutor failed to answer.');
          }
        }
      }

      if (donePayload?.assistantMessage) {
        const uIdx = state.messages.findIndex((m) => m.id === tempUserId);
        if (uIdx !== -1 && donePayload.userMessage) state.messages[uIdx] = donePayload.userMessage;
        const aIdx = state.messages.findIndex((m) => m.id === tempAsstId);
        if (aIdx !== -1) state.messages[aIdx] = donePayload.assistantMessage;
        if (global.studioState?.item?.transcriptData) {
          global.studioState.item.transcriptData.askHistory = state.messages.slice(-40);
        }
        renderMessages();
      } else if (streamedText) {
        const target = state.messages.find((m) => m.id === tempAsstId);
        if (target) {
          target.content = streamedText;
          target.pending = false;
        }
        renderMessages();
      } else {
        throw new Error('No response received from AI Tutor.');
      }
    } catch (err) {
      const target = state.messages.find((m) => m.id === tempAsstId);
      if (ac.signal.aborted) {
        if (target) {
          target.pending = false;
          if (!target.content) target.content = '*Stopped.*';
        }
      } else if (target) {
        target.pending = false;
        target.error = true;
        target.content = err?.message || 'Could not reach the AI model.';
      }
      renderMessages();
    } finally {
      state.streaming = false;
      state.abortCtrl = null;
      syncSendStopUi();
    }
  }

  async function clearConversation() {
    if (!state.lessonId) return;
    try {
      await state.handlers.apiFetch?.(
        `/api/tracks/shadowing/${encodeURIComponent(state.lessonId)}/ask/history`,
        { method: 'DELETE' },
      );
      state.messages = [];
      if (global.studioState?.item?.transcriptData) {
        global.studioState.item.transcriptData.askHistory = [];
      }
      renderMessages();
      state.handlers.showToast?.('Conversation cleared');
    } catch (err) {
      state.handlers.showToast?.(err?.message || 'Could not clear chat.');
    }
  }

  /* ========================================================================
     VOICE QUESTION CAPTURE (LIVE WEB SPEECH + SERVER WHISPER FALLBACK)
     ======================================================================== */

  function syncVoiceUi(statusText) {
    const micBtn = document.getElementById('studio-ask-mic-btn');
    const bar = document.getElementById('studio-ask-voice-bar');
    const label = document.getElementById('studio-ask-voice-status');
    const langBtn = document.getElementById('studio-ask-voice-lang');
    if (micBtn) {
      micBtn.classList.toggle('is-listening', state.voiceActive);
      micBtn.setAttribute('aria-pressed', state.voiceActive ? 'true' : 'false');
      micBtn.title = state.voiceActive ? 'Stop voice input' : 'Ask with your voice';
    }
    if (bar) bar.hidden = !state.voiceActive && !statusText;
    if (label) {
      label.textContent = statusText || (state.voiceActive ? 'Listening… speak your question' : '');
    }
    if (langBtn) {
      const map = { auto: 'Auto', 'en-US': 'EN', 'ar-EG': 'AR' };
      langBtn.textContent = map[state.voiceLang] || 'Auto';
    }
  }

  function resolveRecognitionLang() {
    if (state.voiceLang === 'en-US' || state.voiceLang === 'ar-EG') return state.voiceLang;
    const uiLang = global.studioState?.uiLang || 'en';
    return uiLang === 'ar' ? 'ar-EG' : 'en-US';
  }

  async function startVoiceCapture() {
    if (state.voiceActive) {
      await stopVoiceCapture({ autoSend: state.autoSendVoice });
      return;
    }

    const inp = document.getElementById('studio-ask-input');
    const preExistingText = String(inp?.value || '').trim();
    state.liveRecognizedText = '';
    state.audioChunks = [];

    const SpeechRec = global.SpeechRecognition || global.webkitSpeechRecognition;
    let startedAny = false;

    if (SpeechRec) {
      try {
        const rec = new SpeechRec();
        rec.lang = resolveRecognitionLang();
        rec.continuous = true;
        rec.interimResults = true;
        let finalAccum = '';
        rec.onresult = (ev) => {
          let interim = '';
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const txt = ev.results[i][0]?.transcript || '';
            if (ev.results[i].isFinal) finalAccum += `${txt} `;
            else interim += txt;
          }
          state.liveRecognizedText = `${finalAccum}${interim}`.replace(/\s+/g, ' ').trim();
          if (inp) {
            inp.value = preExistingText
              ? `${preExistingText} ${state.liveRecognizedText}`.trim()
              : state.liveRecognizedText;
            autoResizeTextarea(inp);
          }
        };
        rec.onerror = () => {};
        rec.onend = () => {
          if (state.voiceActive && !state.mediaRecorder) {
            state.voiceActive = false;
            syncVoiceUi();
          }
        };
        rec.start();
        state.recognition = rec;
        startedAny = true;
      } catch {
        state.recognition = null;
      }
    }

    if (navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        state.mediaStream = stream;
        const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
        const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
        const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) state.audioChunks.push(ev.data);
        };
        recorder.start(250);
        state.mediaRecorder = recorder;
        startedAny = true;
      } catch (err) {
        if (!startedAny) {
          state.handlers.showToast?.('Microphone permission denied or unavailable.');
          return;
        }
      }
    }

    if (!startedAny) {
      state.handlers.showToast?.('Voice input is unavailable in this browser.');
      return;
    }

    state.voiceActive = true;
    syncVoiceUi('Listening… tap mic again when done');
  }

  async function stopVoiceCapture({ autoSend = true } = {}) {
    if (!state.voiceActive && !state.recognition && !state.mediaRecorder) return;
    state.voiceActive = false;

    if (state.recognition) {
      try {
        state.recognition.stop();
      } catch {}
      state.recognition = null;
    }

    let blob = null;
    if (state.mediaRecorder) {
      const rec = state.mediaRecorder;
      state.mediaRecorder = null;
      blob = await new Promise((resolve) => {
        if (rec.state === 'inactive') {
          resolve(state.audioChunks.length ? new Blob(state.audioChunks, { type: rec.mimeType || 'audio/webm' }) : null);
          return;
        }
        rec.onstop = () => {
          resolve(state.audioChunks.length ? new Blob(state.audioChunks, { type: rec.mimeType || 'audio/webm' }) : null);
        };
        try {
          rec.stop();
        } catch {
          resolve(null);
        }
      });
    }

    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      state.mediaStream = null;
    }

    const inp = document.getElementById('studio-ask-input');
    let finalText = String(state.liveRecognizedText || inp?.value || '').trim();

    if (!finalText && blob && blob.size >= 512) {
      syncVoiceUi('Transcribing voice question…');
      try {
        const fd = new FormData();
        fd.append('audio', blob, 'question.webm');
        const headers = state.handlers.apiHeaders ? state.handlers.apiHeaders() : {};
        delete headers['Content-Type'];
        const res = await fetch('/api/tracks/shadowing/transcribe-question', {
          method: 'POST',
          headers,
          credentials: 'same-origin',
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.text) {
          finalText = String(data.text).trim();
          if (inp) {
            inp.value = finalText;
            autoResizeTextarea(inp);
          }
        }
      } catch {}
    }

    syncVoiceUi('');

    if (finalText && autoSend) {
      await sendQuestion(finalText);
    } else if (finalText && inp) {
      inp.focus();
    }
  }

  function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(132, Math.max(40, el.scrollHeight))}px`;
  }

  function bindDomEvents() {
    const drawer = document.getElementById('studio-ask-drawer');
    if (!drawer || drawer.dataset.bound === '1') return;
    drawer.dataset.bound = '1';

    document.getElementById('studio-ask-close-btn')?.addEventListener('click', close);
    document.getElementById('studio-ask-backdrop')?.addEventListener('click', close);
    document.getElementById('studio-ask-clear-btn')?.addEventListener('click', clearConversation);

    document.getElementById('studio-ask-model-btn')?.addEventListener('click', () => {
      state.modelPanelOpen = !state.modelPanelOpen;
      const box = document.getElementById('studio-ask-ai-mount');
      const btn = document.getElementById('studio-ask-model-btn');
      if (box) box.hidden = !state.modelPanelOpen;
      if (btn) btn.setAttribute('aria-expanded', state.modelPanelOpen ? 'true' : 'false');
      if (state.modelPanelOpen) ensureAiSelector();
    });

    drawer.addEventListener('click', (e) => {
      if (e.target.closest('#studio-ask-play-quote-btn') && state.selection) {
        const s = state.selection;
        if (Number.isFinite(Number(s.startMs)) && Number.isFinite(Number(s.endMs))) {
          state.handlers.playRange?.(s.startMs / 1000, s.endMs / 1000, {
            mode: 'range',
            label: s.text.slice(0, 28),
            sentIndex: s.sentenceIndex,
          });
        }
        return;
      }

      if (e.target.closest('#studio-ask-clear-quote-btn')) {
        state.selection = null;
        renderQuoteCard();
        return;
      }

      const starter = e.target.closest('[data-ask-starter]');
      if (starter) {
        const prompt = starter.getAttribute('data-ask-starter');
        if (prompt) sendQuestion(prompt);
        return;
      }

      const playRangeBtn = e.target.closest('[data-ask-play-start]');
      if (playRangeBtn) {
        const sSec = Number(playRangeBtn.getAttribute('data-ask-play-start'));
        const eSec = Number(playRangeBtn.getAttribute('data-ask-play-end'));
        if (Number.isFinite(sSec) && Number.isFinite(eSec)) {
          state.handlers.playRange?.(sSec, eSec, { mode: 'range', label: 'Quote' });
        }
        return;
      }

      const speakBtn = e.target.closest('[data-ask-speak-id]');
      if (speakBtn) {
        const id = speakBtn.getAttribute('data-ask-speak-id');
        const msg = state.messages.find((m) => m.id === id);
        if (msg?.content) state.handlers.speakText?.(msg.content);
        return;
      }

      const copyBtn = e.target.closest('[data-ask-copy-id]');
      if (copyBtn) {
        const id = copyBtn.getAttribute('data-ask-copy-id');
        const msg = state.messages.find((m) => m.id === id);
        if (msg?.content && navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(msg.content).then(() => {
            state.handlers.showToast?.('Answer copied');
          }).catch(() => {});
        }
      }
    });

    const inp = document.getElementById('studio-ask-input');
    inp?.addEventListener('input', () => autoResizeTextarea(inp));
    inp?.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendQuestion();
      }
    });

    document.getElementById('studio-ask-send-btn')?.addEventListener('click', () => sendQuestion());
    document.getElementById('studio-ask-stop-btn')?.addEventListener('click', () => {
      state.abortCtrl?.abort();
    });
    document.getElementById('studio-ask-mic-btn')?.addEventListener('click', () => {
      startVoiceCapture();
    });
    document.getElementById('studio-ask-voice-lang')?.addEventListener('click', () => {
      const order = ['auto', 'en-US', 'ar-EG'];
      const next = order[(order.indexOf(state.voiceLang) + 1) % order.length];
      state.voiceLang = next;
      try {
        localStorage.setItem('flaptap_ask_voice_lang', next);
      } catch {}
      syncVoiceUi();
    });

    syncVoiceUi();
  }

  global.FlaptapStudioReaderAi = {
    configure,
    bindDomEvents,
    hydrate,
    open,
    openWithSelection,
    toggle,
    close,
    isOpen: () => state.isOpen,
    sendQuestion,
  };
})(window);
