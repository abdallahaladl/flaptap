/* ==========================================================================
   THINK ALOUD — API TRANSPORT CLIENT (think-aloud/api.js)
   Single responsibility: clean HTTP requests to /api/think-aloud & /api/vocabulary.
   ========================================================================== */

(function (global) {
  'use strict';

  const U = global.FlaptapUtils;

  async function apiFetch(url, options = {}) {
    return U.apiFetch(url, options, {
      getHeaders: (extra) =>
        Object.assign(
          { 'Content-Type': 'application/json' },
          global.FlaptapWorkspace?.getAuthHeaders ? global.FlaptapWorkspace.getAuthHeaders() : {},
          extra || {},
        ),
    });
  }

  function getConfig() {
    return apiFetch('/api/think-aloud/config', { method: 'GET' });
  }

  function getOverview() {
    return apiFetch('/api/think-aloud/overview', { method: 'GET' });
  }

  function generatePrompt(payload) {
    return apiFetch('/api/think-aloud/prompt', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  function transcribeAudio(blob, filename = 'recording.webm') {
    const fd = new FormData();
    fd.append('audio', blob, filename);
    return apiFetch('/api/think-aloud/transcribe', {
      method: 'POST',
      body: fd,
    });
  }

  function evaluateSession(payload) {
    return apiFetch('/api/think-aloud/sessions/evaluate', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  function listSessions(params = {}) {
    const qs = new URLSearchParams();
    if (params.mode && params.mode !== 'all') qs.set('mode', params.mode);
    if (params.domain && params.domain !== 'all') qs.set('domain', params.domain);
    if (params.q) qs.set('q', params.q);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiFetch(`/api/think-aloud/sessions${suffix}`, { method: 'GET' });
  }

  function getSession(id) {
    return apiFetch(`/api/think-aloud/sessions/${encodeURIComponent(id)}`, { method: 'GET' });
  }

  function deleteSession(id) {
    return apiFetch(`/api/think-aloud/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  function bulkDeleteSessions(ids) {
    return apiFetch('/api/think-aloud/sessions/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids: Array.isArray(ids) ? ids : [] }),
    });
  }

  function clearAllSessions() {
    return apiFetch('/api/think-aloud/sessions/clear', { method: 'POST' });
  }

  function listSpines() {
    return apiFetch('/api/think-aloud/spines', { method: 'GET' });
  }

  function generateSpinePack(payload) {
    return apiFetch('/api/think-aloud/spines/generate', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  function toggleSpineItem(packId, itemId) {
    return apiFetch(`/api/think-aloud/spines/${encodeURIComponent(packId)}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ itemId }),
    });
  }

  function resetSpineProgress(packId) {
    return apiFetch(`/api/think-aloud/spines/${encodeURIComponent(packId)}/reset-progress`, {
      method: 'POST',
    });
  }

  function clearAllSpines() {
    return apiFetch('/api/think-aloud/spines/clear', { method: 'POST' });
  }

  function deleteSpinePack(packId) {
    return apiFetch(`/api/think-aloud/spines/${encodeURIComponent(packId)}`, {
      method: 'DELETE',
    });
  }

  function saveVocabularyItem(item) {
    return apiFetch('/api/vocabulary', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  global.FlaptapTAApi = {
    apiFetch,
    getConfig,
    getOverview,
    generatePrompt,
    transcribeAudio,
    evaluateSession,
    listSessions,
    getSession,
    deleteSession,
    bulkDeleteSessions,
    clearAllSessions,
    listSpines,
    generateSpinePack,
    toggleSpineItem,
    resetSpineProgress,
    clearAllSpines,
    deleteSpinePack,
    saveVocabularyItem,
  };
})(window);
