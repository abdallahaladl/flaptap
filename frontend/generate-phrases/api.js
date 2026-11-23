/* ==========================================================================
   GENERATE PHRASES — API TRANSPORT MODULE (generate-phrases/api.js)
   Single responsibility: HTTP & SSE communication with /api/learning-library/*
   and /api/vocabulary. Zero DOM access.
   ========================================================================== */

(function (global) {
  'use strict';

  function ws() {
    return global.FlaptapWorkspace || null;
  }

  async function apiFetch(url, options) {
    return global.FlaptapUtils.apiFetch(url, options);
  }

  function getAuthHeaders() {
    return ws()?.getAuthHeaders ? ws().getAuthHeaders() : { 'Content-Type': 'application/json' };
  }

  async function listDomains() {
    return apiFetch('/api/learning-library/domains', { method: 'GET' });
  }

  async function listItems(params = {}) {
    const qs = new URLSearchParams();
    if (params.domainId) qs.set('domainId', params.domainId);
    if (params.categoryId && params.categoryId !== 'all') qs.set('categoryId', params.categoryId);
    if (params.favoritesOnly) {
      qs.set('favoritesOnly', '1');
    } else if (params.masteryStatus && params.masteryStatus !== 'all') {
      qs.set('masteryStatus', params.masteryStatus);
    }
    if (params.register && params.register !== 'all') qs.set('register', params.register);
    if (params.level && params.level !== 'all') qs.set('level', params.level);
    if (params.q && String(params.q).trim()) qs.set('q', String(params.q).trim());
    qs.set('sort', params.sort || 'newest');
    if (params.page !== undefined) qs.set('page', String(Math.max(1, Number(params.page) || 1)));
    if (params.limit !== undefined) qs.set('limit', String(Math.max(1, Number(params.limit) || 10)));
    return apiFetch(`/api/learning-library/items?${qs.toString()}`, { method: 'GET' });
  }

  async function getItem(id) {
    return apiFetch(`/api/learning-library/items/${encodeURIComponent(id)}`, { method: 'GET' });
  }

  async function generateStream(payload, signal, onEvent) {
    if (global.FlaptapPhraseUtils?.consumeSseStream) {
      return global.FlaptapPhraseUtils.consumeSseStream(
        '/api/learning-library/generate/stream',
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
          signal,
        },
        onEvent,
      );
    }

    const fallbackJson = await apiFetch('/api/learning-library/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });
    onEvent?.('complete', fallbackJson);
    return fallbackJson;
  }

  async function patchItem(id, patch) {
    return apiFetch(`/api/learning-library/items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch || {}),
    });
  }

  async function deleteItem(id, options = {}) {
    return apiFetch(`/api/learning-library/items/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      keepalive: Boolean(options.keepalive),
    });
  }

  async function clearDomain(domainId, options = {}) {
    return apiFetch('/api/learning-library/clear', {
      method: 'POST',
      keepalive: Boolean(options.keepalive),
      body: JSON.stringify({ domainId }),
    });
  }

  async function exportLibrary(domainId) {
    return apiFetch(`/api/learning-library/export?domainId=${encodeURIComponent(domainId || '')}`, {
      method: 'GET',
    });
  }

  async function translateItem(id, payload = {}) {
    return apiFetch(`/api/learning-library/items/${encodeURIComponent(id)}/translate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async function translateBatch(itemIds, payload = {}) {
    return apiFetch('/api/learning-library/translate-batch', {
      method: 'POST',
      body: JSON.stringify({
        itemIds,
        ...payload,
      }),
    });
  }

  async function saveVocabularyItem(payload) {
    return apiFetch('/api/vocabulary', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  global.FlaptapGPApi = {
    apiFetch,
    listDomains,
    listItems,
    getItem,
    generateStream,
    patchItem,
    deleteItem,
    clearDomain,
    exportLibrary,
    translateItem,
    translateBatch,
    saveVocabularyItem,
  };
})(window);
