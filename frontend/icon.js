/**
 * Flaptap icon helper — one local, stroke-authored sprite (frontend/icons.svg).
 * No icon font, no CDN, no render-blocking request: symbols inherit
 * `currentColor`, so every icon follows the active light/dark theme.
 */
(function () {
  const SPRITE_URL = '/icons.svg';

  function escapeAttribute(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * @param {string} name symbol id inside icons.svg
   * @param {{size?: number, className?: string, label?: string}} [options]
   */
  function icon(name, options) {
    const opts = options || {};
    const classes = ['ft-icon', opts.className].filter(Boolean).join(' ');
    const size = Number(opts.size) > 0 ? ` style="--ft-icon-size:${Number(opts.size)}px"` : '';
    const a11y = opts.label
      ? ` role="img" aria-label="${escapeAttribute(opts.label)}"`
      : ' aria-hidden="true"';
    return `<svg class="${classes}"${size}${a11y} focusable="false"><use href="${SPRITE_URL}#${escapeAttribute(
      name,
    )}"></use></svg>`;
  }

  window.FlaptapIcon = icon;
  window.FlaptapIcons = { svg: icon, sprite: SPRITE_URL };
})();
