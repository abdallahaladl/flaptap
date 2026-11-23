/**
 * Flaptap Completion Check Component (`FlaptapCheck`)
 * Extracted, reusable Apple-HIG check button shared across every feature
 * (Anything to Phrases, Learning Library, Tech Lexicon, Vocabulary, Studio).
 *
 * API:
 *   FlaptapCheck.ICON_SVG
 *   FlaptapCheck.buttonHtml({ checked, attrs, label, pill, text, pillLabel, className, size, id })
 *   FlaptapCheck.setState(btn, checked, { label, animate })
 *   FlaptapCheck.animate(btn, checked)
 */
(function (global) {
  'use strict';

  /**
   * Sculpted SF-Symbol-inspired checkmark path with subtle curved vertex
   * and normalized `pathLength="1"` for silky exact stroke-draw animations.
   */
  const ICON_SVG =
    '<svg class="ft-check-svg chk-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">' +
    '<path class="ft-check-tick chk-tick" d="M5.2 12.75 L9.55 17.1 Q10.1 17.65 10.65 17.05 L18.9 7.35" pathLength="1" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"></path>' +
    '</svg>';

  const CHECK_ANIM_MS = 560;
  const UNCHECK_ANIM_MS = 260;

  function escapeHtml(value) {
    if (typeof global.FlaptapUtils?.escapeHtml === 'function') {
      return global.FlaptapUtils.escapeHtml(value);
    }
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function defaultLabel(checked) {
    return checked ? 'Completed' : 'Mark complete';
  }

  /**
   * Render a standardized Apple-style completion check button HTML string.
   *
   * @param {object} [opts]
   * @param {boolean} [opts.checked=false]
   * @param {string}  [opts.attrs='']       Extra HTML attributes (e.g. data-* hooks)
   * @param {string}  [opts.label='']       Accessible label & tooltip
   * @param {boolean} [opts.pill=false]     Labeled pill variant
   * @param {string}  [opts.text='']        Visible pill text (when pill=true)
   * @param {string}  [opts.pillLabel='']   Alias that enables pill mode with text
   * @param {string}  [opts.className='']   Additional host classes (e.g. 'aex-check-btn')
   * @param {'sm'|'md'|'lg'} [opts.size]    Optional circular size modifier
   * @param {string}  [opts.id='']          Optional element id
   */
  function buttonHtml({
    checked = false,
    attrs = '',
    label = '',
    pill = false,
    text = '',
    pillLabel = '',
    className = '',
    size = '',
    id = '',
  } = {}) {
    const isChecked = Boolean(checked);
    const effectiveText = text || pillLabel || '';
    const isPill = Boolean(pill || pillLabel);
    const titleText = label || effectiveText || defaultLabel(isChecked);

    const classes = ['item-check-btn'];
    if (size === 'sm') classes.push('item-check-btn--sm');
    else if (size === 'lg') classes.push('item-check-btn--lg');
    if (isPill) classes.push('item-check-btn--pill');
    if (className) classes.push(className.trim());
    if (isChecked) classes.push('is-checked');

    const idAttr = id ? ` id="${escapeHtml(id)}"` : '';
    const extraAttrs = attrs ? ` ${attrs.trim()}` : '';
    const innerText = isPill && effectiveText ? `<span>${escapeHtml(effectiveText)}</span>` : '';

    return (
      `<button type="button"${idAttr} class="${classes.join(' ')}"${extraAttrs}` +
      ` aria-pressed="${isChecked ? 'true' : 'false'}"` +
      ` aria-label="${escapeHtml(titleText)}"` +
      ` title="${escapeHtml(titleText)}">` +
      `${ICON_SVG}${innerText}</button>`
    );
  }

  /**
   * Trigger the tactile Apple spring + stroke-draw + halo ripple animation
   * cleanly without ever replaying on initial render.
   */
  function animate(btn, checked) {
    if (!btn || !(btn instanceof Element)) return;
    clearTimeout(btn.__ftCheckAnimTimer);
    btn.classList.remove('is-just-checked', 'is-just-unchecked');

    // Force reflow so rapid consecutive clicks always restart cleanly.
    void btn.offsetWidth;

    const animClass = checked ? 'is-just-checked' : 'is-just-unchecked';
    const duration = checked ? CHECK_ANIM_MS : UNCHECK_ANIM_MS;
    btn.classList.add(animClass);

    btn.__ftCheckAnimTimer = setTimeout(() => {
      btn.classList.remove('is-just-checked', 'is-just-unchecked');
    }, duration);
  }

  /**
   * Patch an existing check button in place with optional Apple tick animation.
   */
  function setState(btn, checked, options = {}) {
    if (!btn || !(btn instanceof Element)) return;
    const isChecked = Boolean(checked);
    const wasChecked = btn.classList.contains('is-checked');
    const shouldAnimate = options.animate !== false && wasChecked !== isChecked;

    btn.classList.toggle('is-checked', isChecked);
    btn.setAttribute('aria-pressed', isChecked ? 'true' : 'false');

    const label = options.label || defaultLabel(isChecked);
    btn.setAttribute('aria-label', label);
    btn.title = label;

    const pillSpan = btn.querySelector('span');
    if (pillSpan && !pillSpan.classList.contains('visually-hidden')) {
      pillSpan.textContent = options.text || label;
    } else if (pillSpan) {
      pillSpan.textContent = label;
    }

    if (shouldAnimate) {
      animate(btn, isChecked);
    }
  }

  global.FlaptapCheck = {
    ICON_SVG,
    buttonHtml,
    setState,
    animate,
  };
})(window);
