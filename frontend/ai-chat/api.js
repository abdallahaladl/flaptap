/* ==========================================================================
   FLAPTAP AI CHAT — API & STREAMING CLIENT (frontend/ai-chat/api.js)
   Handles REST calls, SSE streaming with AbortController, auth headers,
   image compression/encoding, and voice transcription uploads.
   ========================================================================== */

(function (global) {
  'use strict';

  function getHeaders(extra) {
    const base = {};
    if (global.FlaptapWorkspace?.getAuthHeaders) {
      Object.assign(base, global.FlaptapWorkspace.getAuthHeaders());
    } else {
      try {
        const guest = localStorage.getItem('flaptap_guest_token');
        if (guest) base['x-guest-token'] = guest;
        const tok = localStorage.getItem('flaptap_auth_token');
        if (tok) base.Authorization = `Bearer ${tok}`;
      } catch {}
    }
    return Object.assign(base, extra || {});
  }

  async function requestJson(url, options = {}) {
    const headers = getHeaders(
      options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {},
    );
    const res = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: Object.assign(headers, options.headers || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.message || data?.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.code = data?.code;
      throw err;
    }
    return data;
  }

  async function streamSse(url, payload, handlers = {}) {
    const headers = getHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      signal: handlers.signal,
      body: JSON.stringify(payload || {}),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const err = new Error(data?.message || data?.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.code = data?.code;
      throw err;
    }

    const reader = res.body?.getReader?.();
    if (!reader) {
      throw new Error('Streaming is unavailable in this browser.');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let doneData = null;

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

        if (ev === 'thread' && parsed?.thread) {
          handlers.onThread?.(parsed.thread);
        } else if (ev === 'user_message' && parsed?.message) {
          handlers.onUserMessage?.(parsed.message);
        } else if (ev === 'delta') {
          handlers.onDelta?.(String(parsed?.delta || ''), String(parsed?.accumulated || ''));
        } else if (ev === 'reasoning') {
          handlers.onReasoning?.(String(parsed?.delta || ''), String(parsed?.accumulated || ''));
        } else if (ev === 'done') {
          doneData = parsed?.data || null;
        } else if (ev === 'error') {
          throw new Error(parsed?.message || 'AI model failed to respond.');
        }
      }
    }

    return doneData;
  }

  /**
   * Reads an image File/Blob and scales down oversized photos cleanly
   * so multimodal uploads stay fast and within payload limits.
   */
  async function encodeImageFile(file) {
    if (!file || !String(file.type || '').startsWith('image/')) {
      throw new Error('Please choose a valid image file.');
    }
    const rawDataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(new Error('Could not read image file.'));
      fr.readAsDataURL(file);
    });

    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Invalid image data.'));
      el.src = rawDataUrl;
    });

    const maxDim = 1600;
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    let finalDataUrl = rawDataUrl;
    let mimeType = file.type || 'image/png';

    if (w > maxDim || h > maxDim || rawDataUrl.length > 1_800_000) {
      const ratio = Math.min(1, maxDim / Math.max(w, h));
      w = Math.max(1, Math.round(w * ratio));
      h = Math.max(1, Math.round(h * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      finalDataUrl = canvas.toDataURL(mimeType, 0.86);
    }

    const base64 = finalDataUrl.split(',')[1] || '';
    return {
      mimeType,
      base64,
      previewDataUrl: finalDataUrl,
      name: file.name || 'image',
    };
  }

  global.FlaptapAiChatApi = {
    getConfig: () => requestJson('/api/ai-chat/config'),
    getPreferences: () => requestJson('/api/ai-chat/preferences'),
    updatePreferences: (patch) =>
      requestJson('/api/ai-chat/preferences', {
        method: 'PATCH',
        body: JSON.stringify(patch || {}),
      }),
    listThreads: (params = {}) => {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.contextType) qs.set('contextType', params.contextType);
      if (params.contextId) qs.set('contextId', params.contextId);
      if (params.limit) qs.set('limit', String(params.limit));
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return requestJson(`/api/ai-chat/threads${suffix}`);
    },
    getThreadByContext: (contextType, contextId) => {
      const qs = new URLSearchParams({
        contextType: String(contextType || ''),
        contextId: String(contextId || ''),
      });
      return requestJson(`/api/ai-chat/threads/by-context?${qs.toString()}`);
    },
    createThread: (body) =>
      requestJson('/api/ai-chat/threads', {
        method: 'POST',
        body: JSON.stringify(body || {}),
      }),
    getThread: (id) => requestJson(`/api/ai-chat/threads/${encodeURIComponent(id)}`),
    updateThread: (id, patch) =>
      requestJson(`/api/ai-chat/threads/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch || {}),
      }),
    deleteThread: (id) =>
      requestJson(`/api/ai-chat/threads/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    deleteAllThreads: () => requestJson('/api/ai-chat/threads', { method: 'DELETE' }),
    deleteMessage: (threadId, msgId) =>
      requestJson(
        `/api/ai-chat/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(msgId)}`,
        { method: 'DELETE' },
      ),
    askStream: (payload, handlers) => streamSse('/api/ai-chat/ask/stream', payload, handlers),
    sendToThreadStream: (threadId, payload, handlers) =>
      streamSse(
        `/api/ai-chat/threads/${encodeURIComponent(threadId)}/messages/stream`,
        payload,
        handlers,
      ),
    regenerateStream: (threadId, msgId, payload, handlers) =>
      streamSse(
        `/api/ai-chat/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(msgId)}/regenerate/stream`,
        payload,
        handlers,
      ),
    editStream: (threadId, msgId, payload, handlers) =>
      streamSse(
        `/api/ai-chat/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(msgId)}/edit/stream`,
        payload,
        handlers,
      ),
    continueStream: (threadId, msgId, payload, handlers) =>
      streamSse(
        `/api/ai-chat/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(msgId)}/continue/stream`,
        payload,
        handlers,
      ),
    transcribeAudio: async (blob) => {
      const fd = new FormData();
      fd.append('audio', blob, 'voice-question.webm');
      return requestJson('/api/ai-chat/transcribe', {
        method: 'POST',
        body: fd,
      });
    },
    exportUrl: (threadId, format = 'md') =>
      `/api/ai-chat/threads/${encodeURIComponent(threadId)}/export?format=${encodeURIComponent(format)}`,
    encodeImageFile,
  };
})(window);
