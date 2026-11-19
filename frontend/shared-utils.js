/* ==========================================================================
   FLAPTAP SHARED FRONTEND UTILITIES (shared-utils.js)
   Single source of truth for HTML escaping, API transport, toast feedback,
   formatting, User-Agent parsing, Blob downloads, and clipboard helpers.
   ========================================================================== */

(function (global) {
  'use strict';

  const toastTimers = new Map();

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeTermKey(term) {
    return String(term || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function formatDuration(sec) {
    const total = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function formatBytes(bytes) {
    const num = Math.max(0, Number(bytes) || 0);
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatShortDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(iso).slice(0, 16);
    }
  }

  function formatTokens(n) {
    const num = Number(n);
    if (!Number.isFinite(num) || num <= 0) return '—';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
    if (num >= 1000) return `${Math.round(num / 1000)}k`;
    return String(num);
  }

  function parseUserAgent(ua) {
    const raw = String(ua || '').trim();
    if (!raw) return 'Web Session';

    let browser = 'Browser';
    if (/Edg\//i.test(raw)) browser = 'Edge';
    else if (/OPR\/|Opera/i.test(raw)) browser = 'Opera';
    else if (/Firefox\//i.test(raw)) browser = 'Firefox';
    else if (/Chrome\//i.test(raw) && !/Chromium/i.test(raw)) browser = 'Chrome';
    else if (/Safari\//i.test(raw) && !/Chrome/i.test(raw)) browser = 'Safari';
    else if (/HeadlessChrome/i.test(raw)) browser = 'Chrome';

    let os = '';
    if (/iPhone/i.test(raw)) os = 'iPhone';
    else if (/iPad/i.test(raw)) os = 'iPad';
    else if (/Android/i.test(raw)) os = 'Android';
    else if (/Mac OS X|Macintosh/i.test(raw)) os = 'macOS';
    else if (/Windows/i.test(raw)) os = 'Windows';
    else if (/Linux/i.test(raw)) os = 'Linux';

    return os ? `${browser} on ${os}` : browser;
  }

  function buildAuthHeaders(config = {}) {
    const headers = config.skipContentType
      ? Object.assign({}, config.extra || {})
      : Object.assign({ 'Content-Type': 'application/json' }, config.extra || {});
    if (config.guestToken) headers['x-guest-token'] = config.guestToken;
    if (config.authToken) headers['Authorization'] = `Bearer ${config.authToken}`;
    return headers;
  }

  async function apiFetch(url, options = {}, config = {}) {
    const ws = global.FlaptapWorkspace;
    if (config.preferWorkspace !== false && ws?.apiFetch && !config.direct) {
      return ws.apiFetch(url, options);
    }

    const opts = Object.assign({ credentials: 'same-origin' }, options || {});
    const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    const baseHeaders = config.getHeaders
      ? config.getHeaders(opts.headers)
      : buildAuthHeaders({
          guestToken: config.guestToken,
          authToken: config.authToken,
          extra: opts.headers,
          skipContentType: isFormData,
        });
    if (isFormData) delete baseHeaders['Content-Type'];
    opts.headers = baseHeaders;

    let res;
    try {
      res = await fetch(url, opts);
    } catch {
      const isMobileOnLocalhost =
        global.location?.hostname === 'localhost' &&
        /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(global.navigator?.userAgent || '');
      throw new Error(
        isMobileOnLocalhost
          ? 'Cannot reach Flaptap on localhost. Open your computer’s same-Wi-Fi URL instead (for example http://192.168.x.x:3333).'
          : 'Cannot connect to Flaptap right now. Check that the server is running.',
      );
    }

    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && typeof config.onUnauthorized === 'function') {
      config.onUnauthorized(body);
    }
    if (!res.ok) {
      const err = new Error(body?.message || `Request failed (${res.status})`);
      err.status = res.status;
      err.code = body?.code;
      throw err;
    }
    return body;
  }

  function showToast(message, elementId = 'workspace-toast', durationMs = 3400) {
    const el = document.getElementById(elementId) || document.getElementById('workspace-toast') || document.getElementById('studio-toast');
    if (!el) return;
    el.textContent = String(message || '');
    el.classList.add('visible');
    const prev = toastTimers.get(el);
    if (prev) clearTimeout(prev);
    toastTimers.set(
      el,
      setTimeout(() => {
        el.classList.remove('visible');
      }, durationMs),
    );
  }

  function downloadBlob(content, filename, mimeType = 'application/octet-stream') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  async function readClipboardText() {
    if (!global.navigator?.clipboard?.readText) return '';
    try {
      return String((await global.navigator.clipboard.readText()) || '').trim();
    } catch {
      return '';
    }
  }

  global.FlaptapUtils = {
    escapeHtml,
    escapeAttr: escapeHtml,
    normalizeTermKey,
    formatDuration,
    formatBytes,
    formatShortDate,
    formatTokens,
    parseUserAgent,
    buildAuthHeaders,
    apiFetch,
    showToast,
    downloadBlob,
    readClipboardText,
  };
})(window);
