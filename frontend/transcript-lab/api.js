/* ==========================================================================
   TRANSCRIPT LAB — API & SSE STREAM CLIENT (transcript-lab/api.js)
   Reuses FlaptapWorkspace.apiFetch and auth headers with zero duplication.
   ========================================================================== */

(function (global) {
  'use strict';

  function ws() {
    return global.FlaptapWorkspace || null;
  }

  function authHeaders(extra = {}) {
    return Object.assign(
      {},
      ws()?.getAuthHeaders ? ws().getAuthHeaders() : {},
      extra,
    );
  }

  async function requestJson(url, options = {}) {
    if (ws()?.apiFetch) {
      return ws().apiFetch(url, options);
    }
    const res = await fetch(url, {
      ...options,
      headers: authHeaders({ 'Content-Type': 'application/json', ...(options.headers || {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.message || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function getConfig() {
    return requestJson('/api/transcript-lab/config', { method: 'GET' });
  }

  function listDocs(params = {}) {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.platform && params.platform !== 'all') qs.set('platform', params.platform);
    if (params.status && params.status !== 'all') qs.set('status', params.status);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    const tail = qs.toString() ? `?${qs.toString()}` : '';
    return requestJson(`/api/transcript-lab/docs${tail}`, { method: 'GET' });
  }

  function getDoc(id) {
    return requestJson(`/api/transcript-lab/docs/${encodeURIComponent(id)}`, { method: 'GET' });
  }

  function ingestUrl(url, force = false) {
    return requestJson('/api/transcript-lab/ingest', {
      method: 'POST',
      body: JSON.stringify({ url, force: Boolean(force) }),
    });
  }

  async function ingestUpload(file, force = false) {
    const form = new FormData();
    form.append('file', file);
    if (force) form.append('force', 'true');
    const res = await fetch('/api/transcript-lab/ingest-upload', {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.message || `Upload failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /**
   * Streams Stage 2 AI Review & Millisecond Alignment via Server-Sent Events.
   */
  async function reviewDocStream(id, payload = {}, callbacks = {}) {
    const { onProgress, signal } = callbacks;
    const res = await fetch(`/api/transcript-lab/docs/${encodeURIComponent(id)}/review/stream`, {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      }),
      body: JSON.stringify(payload),
      signal,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const err = new Error(errBody?.message || `AI review failed (${res.status})`);
      err.status = res.status;
      throw err;
    }

    if (!res.body || typeof res.body.getReader !== 'function') {
      const fallback = await requestJson(`/api/transcript-lab/docs/${encodeURIComponent(id)}/review`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return fallback.data;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finalDoc = null;
    let streamError = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';

      for (const frame of frames) {
        const lines = frame.split('\n');
        let evName = 'message';
        let dataStr = '';
        for (const line of lines) {
          if (line.startsWith('event:')) evName = line.slice(6).trim();
          else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
        }
        if (!dataStr) continue;
        let parsed = null;
        try { parsed = JSON.parse(dataStr); } catch { continue; }

        if (evName === 'progress') {
          onProgress?.(parsed);
        } else if (evName === 'done') {
          finalDoc = parsed?.data || null;
        } else if (evName === 'error') {
          streamError = new Error(parsed?.message || 'AI transcript review failed.');
        }
      }
    }

    if (streamError) throw streamError;
    if (!finalDoc) throw new Error('Transcript review ended without returning a document.');
    return finalDoc;
  }

  function renameDoc(id, title) {
    return requestJson(`/api/transcript-lab/docs/${encodeURIComponent(id)}/title`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  }

  function renameSpeakers(id, speakers) {
    return requestJson(`/api/transcript-lab/docs/${encodeURIComponent(id)}/speakers`, {
      method: 'PATCH',
      body: JSON.stringify({ speakers }),
    });
  }

  function toggleCompletion(id, sentenceIndex, completed) {
    return requestJson(`/api/transcript-lab/docs/${encodeURIComponent(id)}/completion`, {
      method: 'PATCH',
      body: JSON.stringify({ sentenceIndex, completed: Boolean(completed) }),
    });
  }

  function deleteDoc(id) {
    return requestJson(`/api/transcript-lab/docs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  function lookupWord(payload) {
    return requestJson('/api/transcript-lab/lookup-word', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async function downloadExport(id, opts = {}) {
    const qs = new URLSearchParams();
    qs.set('view', opts.view || 'sentences');
    qs.set('format', opts.format || 'txt');
    if (opts.includeTimestamps === false) qs.set('timestamps', '0');
    if (opts.includeSpeakers === false) qs.set('speakers', '0');

    const res = await fetch(
      `/api/transcript-lab/docs/${encodeURIComponent(id)}/export?${qs.toString()}`,
      { method: 'GET', headers: authHeaders() },
    );
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody?.message || 'Export download failed.');
    }

    const disp = res.headers.get('Content-Disposition') || '';
    const match = /filename="([^"]+)"/i.exec(disp);
    const filename = match ? match[1] : `transcript-${opts.view || 'sentences'}.${opts.format || 'txt'}`;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    return filename;
  }

  global.FlaptapTranscriptApi = {
    getConfig,
    listDocs,
    getDoc,
    ingestUrl,
    ingestUpload,
    reviewDocStream,
    renameDoc,
    renameSpeakers,
    toggleCompletion,
    deleteDoc,
    lookupWord,
    downloadExport,
  };
})(window);
