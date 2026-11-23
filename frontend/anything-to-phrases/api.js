/* ==========================================================================
   ANYTHING TO PHRASES — TYPED API & SSE STREAM CLIENT (api.js)
   Single responsibility: all HTTP + Server-Sent Events transport for the
   Anything to Phrases feature. Zero DOM coupling.
   ========================================================================== */

(function (global) {
  'use strict';

  const BASE = '/api/american-extractor';

  function ws() {
    return global.FlaptapWorkspace || null;
  }

  function authHeaders(extra) {
    const base = ws()?.getAuthHeaders ? { ...ws().getAuthHeaders() } : {};
    return Object.assign(base, extra || {});
  }

  async function apiFetch(url, options = {}) {
    return global.FlaptapUtils.apiFetch(url, options);
  }

  /**
   * Parses a Server-Sent Events stream from a fetch Response and dispatches
   * typed callbacks (`stage`, `source_ready`, `item_preview`, `complete`, `error`).
   */
  async function consumeSseResponse(response, handlers = {}) {
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const err = new Error(data?.message || `Request failed (${response.status})`);
      err.status = response.status;
      err.code = data?.code;
      throw err;
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
      const json = await response.json();
      if (json?.data) return json;
      throw new Error(json?.message || 'Unexpected JSON response from extraction stream.');
    }

    if (!response.body) {
      throw new Error('Streaming response body unavailable.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let completedPayload = null;
    let streamError = null;

    function processBlock(block) {
      const lines = block.split(/\r?\n/);
      let eventName = 'message';
      const dataLines = [];

      for (const line of lines) {
        if (!line || line.startsWith(':')) continue;
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      if (dataLines.length === 0) return;
      const rawData = dataLines.join('\n');
      let parsed;
      try {
        parsed = JSON.parse(rawData);
      } catch {
        parsed = { raw: rawData };
      }

      if (eventName === 'stage') {
        handlers.onStage?.(parsed);
      } else if (eventName === 'source_ready') {
        handlers.onSourceReady?.(parsed);
      } else if (eventName === 'item_preview') {
        handlers.onItemPreview?.(parsed);
      } else if (eventName === 'complete') {
        completedPayload = parsed;
      } else if (eventName === 'error') {
        const err = new Error(parsed?.message || 'Extraction failed.');
        err.status = Number(parsed?.statusCode) || 500;
        err.retryable = parsed?.retryable !== false;
        streamError = err;
      }
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIndex;
        while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, sepIndex).trim();
          buffer = buffer.slice(sepIndex + 2);
          if (block) processBlock(block);
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        processBlock(buffer.trim());
      }
    } finally {
      reader.releaseLock?.();
    }

    if (streamError) throw streamError;
    if (!completedPayload?.data) {
      throw new Error('The extraction ended before a study guide was returned. Please retry.');
    }
    return completedPayload;
  }

  async function getConfig() {
    return apiFetch(`${BASE}/config`, { method: 'GET' });
  }

  async function listHistory(query = {}) {
    const params = new URLSearchParams();
    if (query.q) params.set('q', String(query.q));
    if (query.sourceType && query.sourceType !== 'all') params.set('sourceType', String(query.sourceType));
    if (query.status && query.status !== 'all') params.set('status', String(query.status));
    if (query.sort && query.sort !== 'newest') params.set('sort', String(query.sort));
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    const qs = params.toString();
    return apiFetch(`${BASE}/history${qs ? `?${qs}` : ''}`, { method: 'GET' });
  }

  async function getTranscriptSources() {
    return apiFetch(`${BASE}/transcript-sources`, { method: 'GET' });
  }

  async function listSharedSources(limit = 40) {
    return apiFetch(`/api/sources?limit=${encodeURIComponent(String(limit))}`, { method: 'GET' });
  }

  async function resolveSourceLinks(params = {}) {
    const qs = new URLSearchParams();
    if (params.sourceId) qs.set('sourceId', String(params.sourceId));
    if (params.noteId) qs.set('noteId', String(params.noteId));
    if (params.lessonId) qs.set('lessonId', String(params.lessonId));
    if (params.url) qs.set('url', String(params.url));
    return apiFetch(`/api/sources/resolve-links?${qs.toString()}`, { method: 'GET' });
  }

  async function getNote(id) {
    return apiFetch(`${BASE}/notes/${encodeURIComponent(id)}`, { method: 'GET' });
  }

  async function renameNote(id, title) {
    return apiFetch(`${BASE}/notes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  }

  async function setItemCompletion(id, index, completed) {
    return apiFetch(`${BASE}/notes/${encodeURIComponent(id)}/items/${Number(index)}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed: Boolean(completed) }),
    });
  }

  async function deleteNote(id, options = {}) {
    return apiFetch(`${BASE}/notes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      keepalive: Boolean(options?.keepalive),
    });
  }

  async function saveVocabularyItem(payload) {
    return apiFetch('/api/vocabulary', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async function extractStream(body, handlers = {}) {
    const response = await fetch(`${BASE}/extract/stream`, {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      }),
      body: JSON.stringify(body),
      credentials: 'same-origin',
      signal: handlers.signal,
    });
    return consumeSseResponse(response, handlers);
  }

  async function extractUploadStream(formData, handlers = {}) {
    const headers = authHeaders({ Accept: 'text/event-stream' });
    delete headers['Content-Type'];
    const response = await fetch(`${BASE}/extract/upload/stream`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'same-origin',
      signal: handlers.signal,
    });
    return consumeSseResponse(response, handlers);
  }

  global.FlaptapA2PApi = {
    apiFetch,
    getConfig,
    listHistory,
    getTranscriptSources,
    listSharedSources,
    resolveSourceLinks,
    getNote,
    renameNote,
    setItemCompletion,
    deleteNote,
    saveVocabularyItem,
    extractStream,
    extractUploadStream,
  };
})(window);
