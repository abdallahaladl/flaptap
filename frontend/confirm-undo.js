/* ==========================================================================
   Flaptap Shared Apple Confirmation Dialog & Animated Timed Undo
   Single reusable UI mechanism for every destructive / removable action
   across all Flaptap features (Zero duplicated confirm() or undo code).
   ========================================================================== */
(function (global) {
  'use strict';

  const DEFAULT_UNDO_MS = 5200;
  const RING_CIRCUMFERENCE = 43.982; // 2 * Math.PI * 7

  let confirmState = null;
  let undoState = null;
  let toastDismissTimer = null;
  let globalListenersBound = false;

  function toastNotify(msg) {
    if (!msg) return;
    if (typeof global.FlaptapUtils?.showToast === 'function') {
      const targetId = document.getElementById('workspace-toast')
        ? 'workspace-toast'
        : document.getElementById('studio-toast')
          ? 'studio-toast'
          : '';
      if (targetId) {
        global.FlaptapUtils.showToast(msg, { elementId: targetId });
        return;
      }
    }
    const fallbackEl =
      document.getElementById('workspace-toast') || document.getElementById('studio-toast');
    if (!fallbackEl) return;
    fallbackEl.textContent = msg;
    fallbackEl.classList.add('show');
    window.clearTimeout(toastDismissTimer);
    toastDismissTimer = window.setTimeout(() => {
      fallbackEl.classList.remove('show');
    }, 3200);
  }

  function svgIcon(name) {
    if (typeof global.FlaptapIcon?.svg === 'function') {
      return global.FlaptapIcon.svg(name, { size: 18 });
    }
    if (name === 'undo' || name === 'rotate-ccw') {
      return '<svg class="ft-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>';
    }
    if (name === 'x') {
      return '<svg class="ft-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    }
    if (name === 'alert-triangle') {
      return '<svg class="ft-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
    }
    return '<svg class="ft-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>';
  }

  /* ========================================================================
     THEMED APPLE CONFIRMATION MODAL
     ======================================================================== */

  function ensureConfirmDom() {
    let backdrop = document.getElementById('ft-confirm-backdrop');
    if (backdrop) return backdrop;

    backdrop = document.createElement('div');
    backdrop.id = 'ft-confirm-backdrop';
    backdrop.className = 'ft-confirm-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <div class="ft-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="ft-confirm-title" aria-describedby="ft-confirm-message" data-tone="danger">
        <div class="ft-confirm-icon-wrap" id="ft-confirm-icon-wrap" aria-hidden="true"></div>
        <h3 class="ft-confirm-title" id="ft-confirm-title"></h3>
        <p class="ft-confirm-message" id="ft-confirm-message"></p>
        <div class="ft-confirm-detail" id="ft-confirm-detail" hidden></div>
        <div class="ft-confirm-actions">
          <button type="button" class="ft-confirm-cancel" id="ft-confirm-cancel-btn">Cancel</button>
          <button type="button" class="ft-confirm-accept" id="ft-confirm-accept-btn">Delete</button>
        </div>
      </div>
    `;

    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        closeConfirm(false);
      }
    });
    backdrop.querySelector('#ft-confirm-cancel-btn')?.addEventListener('click', () => closeConfirm(false));
    backdrop.querySelector('#ft-confirm-accept-btn')?.addEventListener('click', () => closeConfirm(true));

    document.body.appendChild(backdrop);
    bindGlobalHandlers();
    return backdrop;
  }

  function closeConfirm(accepted) {
    const backdrop = document.getElementById('ft-confirm-backdrop');
    if (!confirmState) {
      if (backdrop) backdrop.hidden = true;
      return;
    }
    const { resolve, previousFocus } = confirmState;
    confirmState = null;

    if (backdrop) {
      backdrop.classList.remove('is-open');
      backdrop.hidden = true;
    }
    document.documentElement.classList.remove('ft-confirm-open');

    if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) {
      try {
        previousFocus.focus({ preventScroll: true });
      } catch {}
    }
    resolve(Boolean(accepted));
  }

  /**
   * Opens the unified Apple-frosted confirmation modal.
   *
   * @param {{
   *   title?: string,
   *   message?: string,
   *   detail?: string,
   *   confirmLabel?: string,
   *   cancelLabel?: string,
   *   tone?: 'danger' | 'warning' | 'primary',
   *   icon?: string
   * }} options
   * @returns {Promise<boolean>}
   */
  function ask(options = {}) {
    if (confirmState) {
      closeConfirm(false);
    }

    const backdrop = ensureConfirmDom();
    const card = backdrop.querySelector('.ft-confirm-card');
    const iconWrap = backdrop.querySelector('#ft-confirm-icon-wrap');
    const titleEl = backdrop.querySelector('#ft-confirm-title');
    const msgEl = backdrop.querySelector('#ft-confirm-message');
    const detailEl = backdrop.querySelector('#ft-confirm-detail');
    const cancelBtn = backdrop.querySelector('#ft-confirm-cancel-btn');
    const acceptBtn = backdrop.querySelector('#ft-confirm-accept-btn');

    const tone = options.tone || 'danger';
    const iconName =
      options.icon || (tone === 'primary' ? 'rotate-ccw' : tone === 'warning' ? 'alert-triangle' : 'trash');

    if (card) card.dataset.tone = tone;
    if (iconWrap) iconWrap.innerHTML = svgIcon(iconName);
    if (titleEl) titleEl.textContent = options.title || 'Confirm removal';
    if (msgEl) msgEl.textContent = options.message || 'Are you sure you want to remove this item?';

    const detail = String(options.detail || '').trim();
    if (detailEl) {
      detailEl.textContent = detail;
      detailEl.hidden = !detail;
    }

    if (cancelBtn) cancelBtn.textContent = options.cancelLabel || 'Cancel';
    if (acceptBtn) acceptBtn.textContent = options.confirmLabel || 'Delete';

    const previousFocus = document.activeElement;
    backdrop.hidden = false;
    document.documentElement.classList.add('ft-confirm-open');
    // Force layout frame so CSS opacity/scale transition animates cleanly.
    void backdrop.offsetWidth;
    backdrop.classList.add('is-open');

    window.setTimeout(() => {
      cancelBtn?.focus({ preventScroll: true });
    }, 10);

    return new Promise((resolve) => {
      confirmState = { resolve, previousFocus };
    });
  }

  /* ========================================================================
     ANIMATED TIMED UNDO PILL
     ======================================================================== */

  function ensureUndoDom() {
    let el = document.getElementById('ft-undo-toast');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'ft-undo-toast';
    el.className = 'ft-undo-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    el.innerHTML = `
      <div class="ft-undo-main">
        <span class="ft-undo-ring" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="20" height="20">
            <circle class="ft-undo-ring-track" cx="10" cy="10" r="7" fill="none" stroke-width="2"></circle>
            <circle class="ft-undo-ring-fill" id="ft-undo-ring-circle" cx="10" cy="10" r="7" fill="none" stroke-width="2" stroke-linecap="round" stroke-dasharray="${RING_CIRCUMFERENCE}" stroke-dashoffset="0"></circle>
          </svg>
          <span class="ft-undo-seconds ltr-num" id="ft-undo-seconds">5</span>
        </span>
        <div class="ft-undo-copy">
          <span class="ft-undo-msg" id="ft-undo-msg"></span>
        </div>
        <div class="ft-undo-actions">
          <button type="button" class="ft-undo-btn" id="ft-undo-btn">
            ${svgIcon('rotate-ccw')}
            <span id="ft-undo-btn-label">Undo</span>
          </button>
          <button type="button" class="ft-undo-close" id="ft-undo-close-btn" aria-label="Dismiss and confirm" title="Dismiss">
            ${svgIcon('x')}
          </button>
        </div>
      </div>
      <div class="ft-undo-bar" aria-hidden="true">
        <div class="ft-undo-bar-fill" id="ft-undo-bar-fill"></div>
      </div>
    `;

    el.querySelector('#ft-undo-btn')?.addEventListener('click', () => {
      handleUndoClick();
    });
    el.querySelector('#ft-undo-close-btn')?.addEventListener('click', () => {
      flushPending({ keepalive: false });
    });

    document.body.appendChild(el);
    bindGlobalHandlers();
    return el;
  }

  function clearUndoVisuals() {
    const el = document.getElementById('ft-undo-toast');
    if (!el) return;
    el.classList.remove('is-open');
    el.hidden = true;
  }

  async function commitUndoEntry(entry, { keepalive = false } = {}) {
    if (!entry || entry.settled) return;
    entry.settled = true;
    window.clearTimeout(entry.timer);
    window.clearInterval(entry.countdownTimer);
    if (undoState === entry) {
      undoState = null;
      clearUndoVisuals();
    }

    try {
      await entry.onCommit?.({ keepalive });
      entry.resolve?.({ status: 'committed' });
    } catch (err) {
      try {
        await entry.onUndo?.();
      } catch {}
      if (typeof entry.onError === 'function') {
        entry.onError(err);
      } else {
        toastNotify(err?.message || 'Could not complete removal — item restored.');
      }
      entry.resolve?.({ status: 'error', error: err });
    }
  }

  async function handleUndoClick() {
    const entry = undoState;
    if (!entry || entry.settled) return;
    entry.settled = true;
    window.clearTimeout(entry.timer);
    window.clearInterval(entry.countdownTimer);
    undoState = null;
    clearUndoVisuals();

    try {
      await entry.onUndo?.();
      toastNotify(entry.restoredMessage || 'Restored.');
      entry.resolve?.({ status: 'undone' });
    } catch (err) {
      toastNotify(err?.message || 'Could not undo.');
      entry.resolve?.({ status: 'error', error: err });
    }
  }

  /**
   * Immediately commits any queued pending deletion before navigation or a new delete.
   */
  function flushPending({ keepalive = false } = {}) {
    if (!undoState || undoState.settled) return Promise.resolve();
    return commitUndoEntry(undoState, { keepalive });
  }

  /**
   * Optimistically applies a removal immediately, shows an animated countdown
   * Undo pill, and only executes `onCommit` when the timer expires (or flushes).
   *
   * @param {{
   *   message: string,
   *   undoLabel?: string,
   *   restoredMessage?: string,
   *   durationMs?: number,
   *   onApply: () => void | Promise<void>,
   *   onUndo: () => void | Promise<void>,
   *   onCommit: (ctx?: { keepalive?: boolean }) => Promise<void>,
   *   onError?: (err: Error) => void
   * }} options
   * @returns {Promise<{ status: 'undone' | 'committed' | 'error' }>}
   */
  async function withUndo(options) {
    if (!options || typeof options.onApply !== 'function' || typeof options.onCommit !== 'function') {
      throw new Error('FlaptapConfirm.withUndo requires onApply and onCommit callbacks.');
    }

    // Never drop an un-committed prior delete if user deletes multiple items quickly.
    if (undoState && !undoState.settled) {
      await flushPending({ keepalive: false });
    }

    await options.onApply();

    const durationMs = Math.max(2000, Number(options.durationMs) || DEFAULT_UNDO_MS);
    const toast = ensureUndoDom();
    const msgEl = toast.querySelector('#ft-undo-msg');
    const secEl = toast.querySelector('#ft-undo-seconds');
    const btnLabelEl = toast.querySelector('#ft-undo-btn-label');
    const ringEl = toast.querySelector('#ft-undo-ring-circle');
    const barEl = toast.querySelector('#ft-undo-bar-fill');

    if (msgEl) msgEl.textContent = options.message || 'Item removed';
    if (btnLabelEl) btnLabelEl.textContent = options.undoLabel || 'Undo';

    // Reset animations cleanly to full before opening
    if (ringEl) {
      ringEl.style.transition = 'none';
      ringEl.style.strokeDashoffset = '0';
    }
    if (barEl) {
      barEl.style.transition = 'none';
      barEl.style.transform = 'scaleX(1)';
    }

    const totalSec = Math.max(1, Math.ceil(durationMs / 1000));
    if (secEl) secEl.textContent = String(totalSec);

    toast.hidden = false;
    void toast.offsetWidth;
    toast.classList.add('is-open');

    window.requestAnimationFrame(() => {
      if (ringEl) {
        ringEl.style.transition = `stroke-dashoffset ${durationMs}ms linear`;
        ringEl.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
      }
      if (barEl) {
        barEl.style.transition = `transform ${durationMs}ms linear`;
        barEl.style.transform = 'scaleX(0)';
      }
    });

    const startedAt = Date.now();
    return new Promise((resolve) => {
      const entry = {
        settled: false,
        onUndo: options.onUndo,
        onCommit: options.onCommit,
        onError: options.onError,
        restoredMessage: options.restoredMessage,
        resolve,
        timer: null,
        countdownTimer: null,
      };

      entry.countdownTimer = window.setInterval(() => {
        if (entry.settled) return;
        const remainingMs = Math.max(0, durationMs - (Date.now() - startedAt));
        const remainingSec = Math.max(1, Math.ceil(remainingMs / 1000));
        if (secEl) secEl.textContent = String(remainingSec);
      }, 250);

      entry.timer = window.setTimeout(() => {
        commitUndoEntry(entry, { keepalive: false });
      }, durationMs);

      undoState = entry;
    });
  }

  /**
   * Standard Website Flow:
   * 1. Opens themed Apple confirmation dialog.
   * 2. If confirmed, runs optimistic removal + timed animated Undo bar.
   */
  async function confirmAndUndo(options) {
    const confirmed = await ask({
      title: options.title,
      message: options.message,
      detail: options.detail,
      confirmLabel: options.confirmLabel || 'Delete',
      cancelLabel: options.cancelLabel || 'Cancel',
      tone: options.tone || 'danger',
      icon: options.icon,
    });
    if (!confirmed) return { status: 'cancelled' };

    // Return once optimistic removal has applied so callers don't freeze UI awaiting 5s timer;
    // actual server commit is tracked asynchronously by the timer + pagehide handler.
    withUndo({
      message: options.undoMessage || 'Removed',
      undoLabel: options.undoLabel || 'Undo',
      restoredMessage: options.restoredMessage || 'Restored.',
      durationMs: options.durationMs,
      onApply: options.onApply,
      onUndo: options.onUndo,
      onCommit: options.onCommit,
      onError: options.onError,
    });
    return { status: 'scheduled' };
  }

  function bindGlobalHandlers() {
    if (globalListenersBound) return;
    globalListenersBound = true;

    document.addEventListener(
      'keydown',
      (event) => {
        if (!confirmState) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeConfirm(false);
          return;
        }
        if (event.key === 'Tab') {
          const cancelBtn = document.getElementById('ft-confirm-cancel-btn');
          const acceptBtn = document.getElementById('ft-confirm-accept-btn');
          if (!cancelBtn || !acceptBtn) return;
          if (event.shiftKey && document.activeElement === cancelBtn) {
            event.preventDefault();
            acceptBtn.focus();
          } else if (!event.shiftKey && document.activeElement === acceptBtn) {
            event.preventDefault();
            cancelBtn.focus();
          }
        }
      },
      true,
    );

    global.addEventListener('pagehide', () => {
      if (undoState && !undoState.settled) {
        commitUndoEntry(undoState, { keepalive: true });
      }
    });
  }

  global.FlaptapConfirm = {
    ask,
    withUndo,
    confirmAndUndo,
    flushPending,
    hasPending: () => Boolean(undoState && !undoState.settled),
  };
})(window);
