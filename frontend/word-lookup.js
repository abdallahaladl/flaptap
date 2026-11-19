/* ==========================================================================
   FLAPTAP SHARED CONTEXTUAL WORD LOOKUP & SELECTABLE WORD TOKENIZER (word-lookup.js)
   Shared across Lessons Studio (studio.html) & Tech Lexicon (index.html)
   ========================================================================== */

(function (global) {
  'use strict';

  const lookupCache = new Map();
  const MAX_CACHE_ENTRIES = 250;

  let activeLookup = null;
  let pendingToken = '';
  let pendingWord = '';
  let currentConfig = null;
  let globalListenersBound = false;
  let lastOpenedAt = 0;

  function icon(name, options) {
    return global.FlaptapIcon ? global.FlaptapIcon(name, options) : '';
  }

  const LOOKUP_SCOPES = new Set(['word', 'phrase', 'sentence']);
  const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
  const EDGE_PUNCTUATION = /^[\s"'“”‘’()[\]{}<>«».,;:!?—–-]+|[\s"'“”‘’()[\]{}<>«».,;:!?—–-]+$/gu;

  function normalizeTermKey(term) {
    return String(term || '')
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * Trims a raw text selection into a clean lookup term while preserving the
   * learner's chosen interior punctuation (e.g. "don't", "well-known").
   */
  function normalizeSelectionText(raw) {
    return String(raw ?? '')
      .replace(/\s+/g, ' ')
      .replace(EDGE_PUNCTUATION, '')
      .trim();
  }

  function countWords(text) {
    const matches = String(text ?? '').match(WORD_PATTERN);
    return matches ? matches.length : 0;
  }

  /**
   * Single source of truth for deciding how a lookup should be prompted.
   * One word → dictionary entry, 2-8 words → phrasal unit, more → full excerpt.
   */
  function classifySelection(raw) {
    const text = normalizeSelectionText(raw);
    const wordCount = countWords(text);
    const scope = wordCount > 8 ? 'sentence' : wordCount > 1 ? 'phrase' : 'word';
    return { text, wordCount, scope };
  }

  function normalizeScope(scope, fallbackText) {
    const candidate = String(scope || '').toLowerCase();
    return LOOKUP_SCOPES.has(candidate) ? candidate : classifySelection(fallbackText).scope;
  }

  function escapeText(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Preserves inline HTML tags such as <mark> while wrapping all English words
   * (>= 2 characters) in selectable lookup tokens.
   */
  function tokenizeClickableWords(verbatimHtml, extraDataset) {
    const container = document.createElement('div');
    container.innerHTML = verbatimHtml || '';

    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue || '';
        if (!text.trim()) return;
        const frag = document.createDocumentFragment();
        const parts = text.split(/([\p{L}\p{N}''-]+)/gu);
        for (const part of parts) {
          if (!part) continue;
          if (/^[\p{L}\p{N}]/u.test(part) && part.length >= 2) {
            const span = document.createElement('span');
            span.className = 'clickable-word';
            span.dataset.word = part;
            if (extraDataset) {
              for (const [key, val] of Object.entries(extraDataset)) {
                if (val !== undefined && val !== null) {
                  span.dataset[key] = String(val);
                }
              }
            }
            span.textContent = part;
            frag.appendChild(span);
          } else {
            frag.appendChild(document.createTextNode(part));
          }
        }
        node.parentNode.replaceChild(frag, node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        Array.from(node.childNodes).forEach(walk);
      }
    }

    Array.from(container.childNodes).forEach(walk);
    return container.innerHTML;
  }

  /**
   * Pronounces text using Web Speech API (General American English).
   * Pass { rate } to slow a phrase down for shadowing practice.
   */
  function speakText(text, options) {
    if (!text || typeof window.speechSynthesis === 'undefined') return false;
    try {
      const opts = options || {};
      const requestedRate = Number(opts.rate);
      const rate = Number.isFinite(requestedRate)
        ? Math.max(0.5, Math.min(1.5, requestedRate))
        : 0.94;

      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(String(text));
      utter.lang = 'en-US';
      utter.rate = rate;
      const voices = window.speechSynthesis.getVoices() || [];
      const usVoice =
        voices.find((v) => v.lang === 'en-US' && /samantha|alex|allison|ava|google us/i.test(v.name)) ||
        voices.find((v) => v.lang === 'en-US') ||
        voices.find((v) => v.lang && v.lang.startsWith('en'));
      if (usVoice) utter.voice = usVoice;
      window.speechSynthesis.speak(utter);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Selection action bar: selecting text never calls a model directly. It
   * reveals a compact action bar next to the selection and each feature's
   * lookup runs only after the learner picks an action.
   */
  let selectionMenuState = null;
  let selectionMenuDismissBound = false;

  function ensureSelectionMenuDom() {
    let menu = document.getElementById('selection-action-menu');
    if (menu) return menu;

    menu = document.createElement('div');
    menu.id = 'selection-action-menu';
    menu.className = 'selection-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'toolbar');
    menu.setAttribute('aria-label', 'Actions for the selected text');
    menu.innerHTML = `
      <span class="selection-menu-text" id="selection-menu-text"></span>
      <span class="selection-menu-actions" id="selection-menu-actions"></span>
    `;
    menu.addEventListener('pointerdown', (event) => {
      // Keep the text selection alive while the action bar is used.
      event.preventDefault();
    });
    menu.addEventListener('click', (event) => {
      const button = event.target.closest('[data-selection-action]');
      if (!button || !selectionMenuState) return;
      const id = button.getAttribute('data-selection-action');
      const state = selectionMenuState;
      hideSelectionMenu();
      const action = state.actions.find((entry, index) => String(entry.id || index) === id);
      if (!action || typeof action.run !== 'function') return;
      try {
        action.run({ text: state.text, range: state.range });
      } catch {}
    });
    document.body.appendChild(menu);
    return menu;
  }

  function bindSelectionMenuDismiss() {
    if (selectionMenuDismissBound) return;
    selectionMenuDismissBound = true;
    document.addEventListener(
      'pointerdown',
      (event) => {
        const menu = document.getElementById('selection-action-menu');
        if (!menu || menu.hidden) return;
        if (menu.contains(event.target)) return;
        hideSelectionMenu();
      },
      true,
    );
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Escape') return;
        const menu = document.getElementById('selection-action-menu');
        if (!menu || menu.hidden) return;
        hideSelectionMenu();
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    );
    window.addEventListener('scroll', repositionSelectionMenu, { capture: true, passive: true });
    window.addEventListener('resize', repositionSelectionMenu);
  }

  function repositionSelectionMenu() {
    const menu = document.getElementById('selection-action-menu');
    if (!menu || menu.hidden || !selectionMenuState) return;
    positionSelectionMenu(menu, selectionMenuState.range);
  }

  function positionSelectionMenu(menu, range) {
    let rect = null;
    try {
      rect = range.getBoundingClientRect();
    } catch {
      rect = null;
    }
    if (!rect || (!rect.width && !rect.height)) {
      hideSelectionMenu();
      return;
    }

    menu.hidden = false;
    const menuRect = menu.getBoundingClientRect();
    const margin = 10;
    const gap = 9;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let left = rect.left + rect.width / 2 - menuRect.width / 2;
    left = Math.max(margin, Math.min(left, viewportW - menuRect.width - margin));

    let top = rect.top - menuRect.height - gap;
    let placement = 'above';
    if (top < margin) {
      top = rect.bottom + gap;
      placement = 'below';
    }
    top = Math.max(margin, Math.min(top, viewportH - menuRect.height - margin));

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.dataset.placement = placement;
  }

  function showSelectionMenu(text, range, actions, options) {
    const list = Array.isArray(actions) ? actions.filter((action) => action && action.label) : [];
    if (!text || !range || list.length === 0) return;

    const menu = ensureSelectionMenuDom();
    bindSelectionMenuDismiss();

    const textEl = menu.querySelector('#selection-menu-text');
    textEl.textContent = text.length > 34 ? `${text.slice(0, 33)}…` : text;
    textEl.title = text;

    menu.querySelector('#selection-menu-actions').innerHTML = list
      .map(
        (action, index) => `
        <button type="button" class="selection-menu-btn" data-selection-action="${escapeText(
          action.id || index,
        )}" title="${escapeText(action.title || action.label)}">
          ${action.icon ? icon(action.icon, { size: 14 }) : ''}
          <span>${escapeText(action.label)}</span>
        </button>`,
      )
      .join('');

    selectionMenuState = { text, range, actions: list };
    positionSelectionMenu(menu, range);

    if (options?.focus) {
      menu.querySelector('.selection-menu-btn')?.focus({ preventScroll: true });
    }
  }

  function hideSelectionMenu() {
    const menu = document.getElementById('selection-action-menu');
    if (menu && !menu.hidden) menu.hidden = true;
    selectionMenuState = null;
  }

  /**
   * Resolves the action bar contents. Features keep their existing lookup in
   * `onSelect`; it is invoked only when the learner picks the action.
   */
  function resolveSelectionActions(options, text, range) {
    if (typeof options.actions === 'function') {
      const produced = options.actions({ text, range });
      if (Array.isArray(produced) && produced.length > 0) return produced;
    }
    if (Array.isArray(options.actions) && options.actions.length > 0) {
      return options.actions;
    }
    if (typeof options.onSelect !== 'function') return [];
    return [
      {
        id: 'translate',
        label: options.actionLabel || 'Translate',
        icon: 'languages',
        run: ({ text: selectedText, range: selectedRange }) =>
          options.onSelect(selectedText, { range: selectedRange }),
      },
    ];
  }

  /**
   * Turns any selectable prose container into a contextual lookup surface.
   * Selecting reveals the action bar; no request is made until an action runs.
   *
   * @param {HTMLElement} container
   * @param {{ onSelect: (text: string, meta: { range: Range }) => void, actions?: Function|Array, actionLabel?: string, ignoreSelector?: string, maxLength?: number }} options
   * @returns {() => void} teardown
   */
  function bindSelectionLookup(container, options) {
    if (!container || (typeof options?.onSelect !== 'function' && !options?.actions)) return () => {};

    const maxLength = Math.max(2, Number(options.maxLength) || 300);
    const ignoreSelector =
      options.ignoreSelector ||
      'button, a, input, textarea, select, label, .word-popover, .wp-sense-label, .coach-tag, .coach-ipa';

    function selectionBelongsToContainer(range) {
      const node =
        range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;
      if (!node || !container.contains(node)) return false;
      return !node.closest(ignoreSelector);
    }

    function handleSelection() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

      const text = normalizeSelectionText(selection.toString());
      if (!text || text.length < 2 || text.length > maxLength) return;

      // A plain click inside a stale selection is not a new lookup gesture.
      if (text === selectionBeforePointerDown) return;

      const range = selection.getRangeAt(0);
      if (!selectionBelongsToContainer(range)) return;
      if (
        lastHandledSelection &&
        lastHandledSelection.text === text &&
        lastHandledSelection.startContainer === range.startContainer &&
        lastHandledSelection.startOffset === range.startOffset &&
        lastHandledSelection.endContainer === range.endContainer &&
        lastHandledSelection.endOffset === range.endOffset
      ) {
        return;
      }
      lastHandledSelection = {
        text,
        startContainer: range.startContainer,
        startOffset: range.startOffset,
        endContainer: range.endContainer,
        endOffset: range.endOffset,
      };
      showSelectionMenu(text, range, resolveSelectionActions(options, text, range), {
        focus: keyboardGesture,
      });
    }

    let timer = null;
    let pointerIsDown = false;
    let keyboardGesture = false;
    let selectionBeforePointerDown = '';
    let lastHandledSelection = null;
    const onPointerDown = () => {
      pointerIsDown = true;
      keyboardGesture = false;
      lastHandledSelection = null;
      selectionBeforePointerDown = normalizeSelectionText(
        window.getSelection()?.toString() || '',
      );
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(handleSelection, 10);
    };
    const onKeyUp = (event) => {
      if (event.shiftKey || /^Arrow/.test(event.key)) {
        keyboardGesture = true;
        schedule();
      }
    };
    const onPointerUp = () => {
      pointerIsDown = false;
      keyboardGesture = false;
      schedule();
    };
    const onTouchEnd = () => {
      pointerIsDown = false;
      keyboardGesture = false;
      schedule();
    };
    const onSelectionChange = () => {
      if (!pointerIsDown) schedule();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('touchstart', onPointerDown, { capture: true, passive: true });
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('selectionchange', onSelectionChange);
    container.addEventListener('keyup', onKeyUp);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('touchstart', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('selectionchange', onSelectionChange);
      container.removeEventListener('keyup', onKeyUp);
    };
  }

  function ensurePopoverDom() {
    let popover = document.getElementById('word-lookup-popover');
    if (!popover) {
      popover = document.createElement('div');
      popover.id = 'word-lookup-popover';
      popover.className = 'word-popover';
      popover.hidden = true;
      popover.setAttribute('role', 'dialog');
      popover.setAttribute('aria-label', 'Contextual word definition');
      popover.innerHTML = `
        <div class="word-popover-head">
          <div>
            <span id="wp-term" class="word-popover-term"></span>
            <span id="wp-ipa" class="vocab-ipa ltr-num word-popover-ipa"></span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span id="wp-pos" class="vocab-pos"></span>
            ${window.FlaptapCopy ? window.FlaptapCopy.sourceButtonHtml('#wp-term', { className: 'icon-action icon-action--xs' }) : ''}
            <button type="button" class="icon-btn" style="width: 26px; height: 26px;" id="wp-close-btn" aria-label="Close definition">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
        <p id="wp-def" class="vocab-def" style="margin-bottom: 8px;"></p>
        <div id="wp-general-trans-wrap" class="wp-trans-block wp-general-block" hidden>
          <span class="wp-sense-label">General</span>
          <p id="wp-general-trans" class="word-popover-general-trans"></p>
        </div>
        <div id="wp-context-trans-wrap" class="wp-trans-block">
          <span id="wp-context-sense-label" class="wp-sense-label is-context" hidden>In context</span>
          <p id="wp-trans" class="word-popover-trans" style="font-weight: 700; font-size: 0.96rem; margin-bottom: 0;"></p>
        </div>
        <p id="wp-tip" class="word-popover-tip" style="font-size: 0.8rem; color: var(--ink-muted); margin-bottom: 8px;"></p>
        <p id="wp-context" class="word-popover-context" hidden></p>
        <div class="word-popover-actions">
          <div class="word-popover-action-group">
            <button type="button" class="icon-action icon-action--sm" style="height: 32px; width: 32px;" id="wp-play-btn" hidden aria-label="Play sentence" title="Play sentence">${icon('play')}</button>
            <button type="button" class="icon-action icon-action--sm" style="height: 32px; width: 32px;" id="wp-speak-btn" hidden aria-label="Pronounce" title="Pronounce">${icon('volume-2')}</button>
          </div>
          <button type="button" class="btn-vox" style="height: 32px; width: 34px; padding: 0; font-size: 0.79rem;" id="wp-save-btn" aria-label="Save to Vocabulary"></button>
        </div>
      `;
      document.body.appendChild(popover);
    } else {
      // Ensure optional dual-translation, #wp-context, and #wp-speak-btn exist if adopting studio.html markup
      const transElExisting = document.getElementById('wp-trans');
      if (transElExisting && !document.getElementById('wp-general-trans-wrap')) {
        const genWrap = document.createElement('div');
        genWrap.id = 'wp-general-trans-wrap';
        genWrap.className = 'wp-trans-block wp-general-block';
        genWrap.hidden = true;
        genWrap.innerHTML =
          '<span class="wp-sense-label">General</span><p id="wp-general-trans" class="word-popover-general-trans"></p>';
        transElExisting.insertAdjacentElement('beforebegin', genWrap);

        const ctxLabel = document.createElement('span');
        ctxLabel.id = 'wp-context-sense-label';
        ctxLabel.className = 'wp-sense-label is-context';
        ctxLabel.textContent = 'In context';
        ctxLabel.hidden = true;
        transElExisting.insertAdjacentElement('beforebegin', ctxLabel);
      }
      if (!document.getElementById('wp-context')) {
        const tipEl = document.getElementById('wp-tip');
        if (tipEl && tipEl.parentNode) {
          const ctxP = document.createElement('p');
          ctxP.id = 'wp-context';
          ctxP.className = 'word-popover-context';
          ctxP.hidden = true;
          tipEl.insertAdjacentElement('afterend', ctxP);
        }
      }
      if (!document.getElementById('wp-speak-btn')) {
        const playBtn = document.getElementById('wp-play-btn');
        if (playBtn && playBtn.parentNode) {
          const speakBtn = document.createElement('button');
          speakBtn.type = 'button';
          speakBtn.id = 'wp-speak-btn';
          speakBtn.className = 'btn-secondary';
          speakBtn.style.cssText = 'height: 32px; font-size: 0.78rem;';
          speakBtn.hidden = true;
          speakBtn.innerHTML =
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg> <span>Pronounce</span>';
          playBtn.insertAdjacentElement('afterend', speakBtn);
        }
      }
    }

    if (!globalListenersBound) {
      globalListenersBound = true;

      popover.addEventListener('click', (e) => {
        if (e.target.closest('#wp-close-btn')) {
          close();
          return;
        }
        if (e.target.closest('#wp-play-btn') && currentConfig?.onPlay) {
          currentConfig.onPlay(activeLookup);
          return;
        }
        if (e.target.closest('#wp-speak-btn')) {
          const term = activeLookup?.term || pendingWord || document.getElementById('wp-term')?.textContent;
          speakText(term);
          return;
        }
        if (e.target.closest('#wp-save-btn') && currentConfig?.onSave && activeLookup) {
          currentConfig.onSave(activeLookup);
        }
      });

      document.addEventListener('click', (e) => {
        const pop = document.getElementById('word-lookup-popover');
        if (!pop || pop.hidden) return;
        // A selection-triggered lookup opens on pointerup; ignore the synthetic
        // click that immediately follows so the popover is not dismissed.
        if (Date.now() - lastOpenedAt < 320) return;
        if (pop.contains(e.target)) return;
        close();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          const pop = document.getElementById('word-lookup-popover');
          if (pop && !pop.hidden) close();
        }
      });
    }

    return popover;
  }

  function syncSavedButtonDom() {
    const saveBtn = document.getElementById('wp-save-btn');
    if (!saveBtn) return;

    if (currentConfig && currentConfig.canSave === false) {
      saveBtn.hidden = true;
      return;
    }
    saveBtn.hidden = false;

    const term = activeLookup?.term || pendingWord || '';
    const isSaved = Boolean(currentConfig?.isSavedFn && term && currentConfig.isSavedFn(term));
    saveBtn.classList.toggle('active', isSaved);
    saveBtn.setAttribute('aria-pressed', isSaved ? 'true' : 'false');
    const saveLabel = saveBtn.hidden
      ? ''
      : isSaved
        ? currentConfig?.savedLabel || 'Saved in Vocabulary'
        : currentConfig?.saveLabel || 'Save to Vocabulary';
    saveBtn.innerHTML = `${icon(isSaved ? 'bookmark-check' : 'bookmark-plus')}<span class="visually-hidden">${saveLabel}</span>`;
    saveBtn.title = saveLabel;
  }

  function setPopoverLoading(isLoading) {
    const popover = document.getElementById('word-lookup-popover');
    if (!popover) return;
    popover.classList.toggle('is-loading', Boolean(isLoading));
    popover.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  }

  function setPopoverScope(scope) {
    const popover = document.getElementById('word-lookup-popover');
    if (popover) popover.dataset.scope = scope || 'word';
  }

  function renderResolvedData(word, data, contextFallback) {
    activeLookup = data;
    setPopoverLoading(false);
    const termEl = document.getElementById('wp-term');
    termEl.textContent = data.term || word;
    termEl.title = data.term || word;
    document.getElementById('wp-ipa').textContent = data.ipa || '';
    document.getElementById('wp-pos').textContent = data.partOfSpeech || '';
    document.getElementById('wp-def').textContent = data.definition || '';

    const generalWrap = document.getElementById('wp-general-trans-wrap');
    const generalEl = document.getElementById('wp-general-trans');
    const generalText = String(data.generalTranslation || '').trim();
    if (generalWrap && generalEl) {
      generalEl.textContent = generalText;
      generalEl.setAttribute('dir', data.rtl ? 'rtl' : 'ltr');
      generalWrap.hidden = !generalText;
    }

    const contextSenseLabel = document.getElementById('wp-context-sense-label');
    if (contextSenseLabel) {
      contextSenseLabel.hidden = !generalText || !String(data.translation || '').trim();
    }

    const transEl = document.getElementById('wp-trans');
    if (transEl) {
      transEl.textContent = data.translation || '';
      transEl.setAttribute('dir', data.rtl ? 'rtl' : 'ltr');
    }

    const tipEl = document.getElementById('wp-tip');
    if (tipEl) {
      tipEl.textContent = data.spokenTip || '';
      tipEl.hidden = !data.spokenTip;
    }

    const ctxEl = document.getElementById('wp-context');
    const ctxText = data.contextSentence || contextFallback || '';
    const popoverScope =
      document.getElementById('word-lookup-popover')?.dataset.scope || 'word';
    if (ctxEl) {
      if (popoverScope === 'sentence') {
        // The selected excerpt is already the context; another line would mislead.
        ctxEl.hidden = true;
      } else if (ctxText && normalizeTermKey(ctxText) !== normalizeTermKey(data.term || word)) {
        const needle = (data.term || word || '').trim();
        if (needle) {
          const safeNeedle = needle
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/['’]/g, "['’]");
          const re = new RegExp(
            `(?<![\\p{L}\\p{N}_])(${safeNeedle}(?:['’]?s|es|ed|d|ing|er|ers)?)(?![\\p{L}\\p{N}_])`,
            'giu',
          );
          const matches = Array.from(String(ctxText).matchAll(re));
          if (matches.length > 0) {
            let lastIdx = 0;
            let out = '';
            for (const m of matches) {
              const idx = m.index ?? 0;
              out += escapeText(ctxText.slice(lastIdx, idx));
              out += `<mark class="lexicon-highlight">${escapeText(m[1])}</mark>`;
              lastIdx = idx + m[0].length;
            }
            out += escapeText(ctxText.slice(lastIdx));
            ctxEl.innerHTML = `"${out}"`;
          } else {
            ctxEl.textContent = `"${ctxText}"`;
          }
        } else {
          ctxEl.textContent = `"${ctxText}"`;
        }
        ctxEl.hidden = false;
      } else {
        ctxEl.hidden = true;
      }
    }

    syncSavedButtonDom();
  }

  async function open(config) {
    const word = String(config?.word || '').trim();
    if (!word) return;

    const popover = ensurePopoverDom();
    currentConfig = config;
    const scope = normalizeScope(config.scope, word);
    setPopoverScope(scope);

    document.querySelectorAll('.clickable-word.selected-word').forEach((el) => {
      el.classList.remove('selected-word');
    });
    if (config.sourceEl) {
      config.sourceEl.classList.add('selected-word');
    }

    const playBtn = document.getElementById('wp-play-btn');
    const speakBtn = document.getElementById('wp-speak-btn');
    if (playBtn) {
      playBtn.hidden = !config.canPlay;
      if (config.playLabel) playBtn.textContent = config.playLabel;
    }
    if (speakBtn) {
      speakBtn.hidden = !config.canSpeak;
    }

    activeLookup = null;
    pendingWord = word;
    pendingToken = `${word}::${Date.now()}`;
    const thisToken = pendingToken;

    syncSavedButtonDom();
    popover.hidden = false;
    lastOpenedAt = Date.now();

    const ctxStr = config.contextSentence || config.payload?.contextSentence || '';
    const langStr = config.payload?.language || 'ar';
    const cacheKey = `${normalizeTermKey(word)}::${scope}::${ctxStr.slice(0, 120).toLowerCase()}::${langStr}`;

    if (lookupCache.has(cacheKey)) {
      const cached = lookupCache.get(cacheKey);
      renderResolvedData(word, cached, ctxStr);
      return cached;
    }

    const termEl = document.getElementById('wp-term');
    termEl.textContent = word;
    termEl.title = word;
    document.getElementById('wp-ipa').textContent = '';
    document.getElementById('wp-pos').textContent = '';
    document.getElementById('wp-def').textContent = 'Looking up contextual meaning...';
    const generalWrap = document.getElementById('wp-general-trans-wrap');
    if (generalWrap) generalWrap.hidden = true;
    const generalEl = document.getElementById('wp-general-trans');
    if (generalEl) generalEl.textContent = '';
    const contextSenseLabel = document.getElementById('wp-context-sense-label');
    if (contextSenseLabel) contextSenseLabel.hidden = true;
    const transEl = document.getElementById('wp-trans');
    if (transEl) transEl.textContent = '';
    const tipEl = document.getElementById('wp-tip');
    if (tipEl) {
      tipEl.textContent = '';
      tipEl.hidden = true;
    }
    const ctxEl = document.getElementById('wp-context');
    if (ctxEl) ctxEl.hidden = true;
    setPopoverLoading(true);

    try {
      const data = await config.fetcher(config.endpoint, {
        method: 'POST',
        body: JSON.stringify(config.payload),
      });

      if (pendingToken !== thisToken) return null;

      if (lookupCache.size >= MAX_CACHE_ENTRIES) {
        const oldest = lookupCache.keys().next().value;
        if (oldest) lookupCache.delete(oldest);
      }
      lookupCache.set(cacheKey, data);

      renderResolvedData(word, data, ctxStr);
      return data;
    } catch (err) {
      if (pendingToken === thisToken) {
        setPopoverLoading(false);
        document.getElementById('wp-ipa').textContent = '';
        document.getElementById('wp-def').textContent = err?.message || 'Lookup failed.';
      }
      return null;
    }
  }

  function close() {
    const popover = document.getElementById('word-lookup-popover');
    if (popover) {
      popover.hidden = true;
      setPopoverLoading(false);
      setPopoverScope('word');
    }
    activeLookup = null;
    pendingToken = '';
    pendingWord = '';
    document.querySelectorAll('.clickable-word.selected-word').forEach((el) => {
      el.classList.remove('selected-word');
    });
  }

  global.FlaptapWordLookup = {
    tokenizeClickableWords,
    speakText,
    bindSelectionLookup,
    classifySelection,
    normalizeSelectionText,
    open,
    close,
    syncSavedButtonDom,
    getActiveLookup: () => activeLookup,
    normalizeTermKey,
  };
})(window);
