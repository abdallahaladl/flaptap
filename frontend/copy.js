/**
 * Flaptap copy helper — one consistent copy affordance for every learning item
 * (verbatim transcript lines, expressions, phrasal verbs, idioms, terms).
 *
 * Markup: `FlaptapCopy.buttonHtml(text, { className })`.
 * A single delegated listener copies the text and flips the button to a check
 * state, so dynamically rendered lists need no wiring of their own.
 */
(function () {
  const SPRITE_URL = '/icons.svg';

  const LABELS = {
    en: { copy: 'Copy', copied: 'Copied' },
    ar: { copy: 'نسخ', copied: 'تم النسخ' },
    es: { copy: 'Copiar', copied: 'Copiado' },
    fr: { copy: 'Copier', copied: 'Copié' },
    de: { copy: 'Kopieren', copied: 'Kopiert' },
    tr: { copy: 'Kopyala', copied: 'Kopyalandı' },
  };

  function uiLang() {
    try {
      return localStorage.getItem('flaptap_ui_lang') || 'en';
    } catch {
      return 'en';
    }
  }

  function labels() {
    return LABELS[uiLang()] || LABELS.en;
  }

  function escapeAttribute(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function icon(name) {
    if (typeof window.FlaptapIcon === 'function') return window.FlaptapIcon(name);
    return `<svg class="ft-icon" aria-hidden="true" focusable="false"><use href="${SPRITE_URL}#${name}"></use></svg>`;
  }

  function normalize(text) {
    return String(text ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * @param {string} text verbatim text to copy
   * @param {{className?: string, label?: string}} [options]
   */
  function buttonHtml(text, options) {
    const value = normalize(text);
    if (!value) return '';
    return buildButton({ text: value, options });
  }

  /**
   * Copy button whose text is read from a live DOM node at click time
   * (popovers and other re-rendered surfaces).
   *
   * @param {string} selector CSS selector of the element holding the text
   * @param {{className?: string, label?: string}} [options]
   */
  function sourceButtonHtml(selector, options) {
    const target = normalize(selector);
    if (!target) return '';
    return buildButton({ sourceSelector: target, options });
  }

  function buildButton({ text, sourceSelector, options }) {
    const opts = options || {};
    const hostClass = opts.className ? ` ${opts.className}` : '';
    const label = normalize(opts.label) || labels().copy;
    const targetAttr = text
      ? ` data-copy-text="${escapeAttribute(text)}"`
      : ` data-copy-source="${escapeAttribute(sourceSelector || '')}"`;
    return (
      `<button type="button" class="ft-copy-btn${hostClass}"${targetAttr} data-copy-state="idle"` +
      ` aria-label="${escapeAttribute(label)}" title="${escapeAttribute(label)}">` +
      `<span class="ft-copy-glyph is-copy" aria-hidden="true">${icon('copy')}</span>` +
      `<span class="ft-copy-glyph is-check" aria-hidden="true">${icon('check')}</span>` +
      `</button>`
    );
  }

  async function writeClipboard(text) {
    if (!text) return false;

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to the selection-based fallback (older/embedded browsers).
      }
    }

    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }

  function resolveText(button) {
    const explicit = button.getAttribute('data-copy-text');
    if (explicit) return normalize(explicit);
    const sourceSelector = button.getAttribute('data-copy-source');
    if (!sourceSelector) return '';
    const source = document.querySelector(sourceSelector);
    return normalize(source ? source.textContent : '');
  }

  function flashState(button, copied) {
    const labelsNow = labels();
    button.setAttribute('data-copy-state', copied ? 'copied' : 'idle');
    const text = copied ? labelsNow.copied : labelsNow.copy;
    button.setAttribute('aria-label', text);
    button.setAttribute('title', text);

    if (copied) {
      clearTimeout(button.__copyResetTimer);
      button.__copyResetTimer = setTimeout(() => {
        if (button.getAttribute('data-copy-state') !== 'copied') return;
        button.setAttribute('data-copy-state', 'idle');
        const idleLabel = labels().copy;
        button.setAttribute('aria-label', idleLabel);
        button.setAttribute('title', idleLabel);
      }, 1600);
    }
  }

  // Capture phase: a copy click must never bubble into a card-level handler
  // (seeking video, opening the study drawer, checking an item, …).
  document.addEventListener(
    'click',
    async (event) => {
      const target = event.target;
      const button = target instanceof Element ? target.closest('[data-copy-text], [data-copy-source]') : null;
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();

      const text = resolveText(button);
      if (!text) return;

      const ok = await writeClipboard(text);
      flashState(button, ok);
    },
    true,
  );

  window.FlaptapCopy = { buttonHtml, sourceButtonHtml, writeClipboard, labels };
})();
