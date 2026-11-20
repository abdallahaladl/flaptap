/* ==========================================================================
   ANYTHING TO PHRASES — ITEM DETAIL PAGE (detail-page.js)
   Isolated Page 3 (/extractor/library/:id):
   - Full details of one extracted study guide + interactive study actions
   - Loading skeleton for direct deep links & hard refreshes
   - Graceful 404 / error states
   - Inline Rename, Remaining-only filter, Active Recall quiz mode,
     Category + CEFR + Search filters, TTS pronunciation, Copy, Export,
     Save to Vocabulary Vault, Selectable Source Text reader + Word Lookup
   Zero cross-imports with Extract or Library pages.
   ========================================================================== */

(function (global) {
  'use strict';

  function create(deps) {
    const store = deps.store;
    const api = deps.api;
    const nav = deps.nav;
    const U = global.FlaptapUtils;
    const escapeHtml = U.escapeHtml;

    const local = {
      mounted: false,
      currentNote: null,
      loadingNoteId: '',
      error: '',
      filterCategory: 'all',
      filterLevel: 'all',
      scopeRemaining: false,
      recallMode: false,
      revealedIndices: new Set(),
      search: '',
      renaming: false,
      teardowns: [],
      itemsTeardown: null,
      listAnimTimer: null,
      unsubs: [],
    };

    function ws() {
      return global.FlaptapWorkspace || null;
    }

    function el(id) {
      return document.getElementById(id);
    }

    function setText(id, val) {
      const node = el(id);
      if (node) node.textContent = val == null ? '' : String(val);
    }

    function icon(name, options) {
      return global.FlaptapIcon ? global.FlaptapIcon(name, options) : '';
    }

    function showToast(msg) {
      U.showToast(msg);
    }

    function requireNoteAuth() {
      if (store.currentUser()) return true;
      if (ws()?.requireAuthBeforeAction) {
        return ws().requireAuthBeforeAction({
          type: 'navigate',
          href: `${global.location.pathname}${global.location.search || ''}`,
        });
      }
      showToast('Sign in to open saved study guides.');
      return false;
    }

    /* --------------------------------------------------------------------
       OPEN & HYDRATE
       -------------------------------------------------------------------- */

    function setViewMode(mode) {
      // mode: 'loading' | 'error' | 'ready'
      const skel = el('aex-detail-skeleton');
      const errBox = el('aex-detail-error');
      const card = el('aex-note-card');
      if (skel) skel.hidden = mode !== 'loading';
      if (errBox) errBox.hidden = mode !== 'error';
      if (card) card.hidden = mode !== 'ready';
    }

    async function loadNote(id, options = {}) {
      if (!id) {
        nav.goToLibrary({ replace: true });
        return;
      }
      if (!store.currentUser()) {
        requireNoteAuth();
        return;
      }
      if (local.loadingNoteId === id) return;

      // Instant render from memory cache if already loaded
      const cached = store.getCachedNote(id);
      if (cached && !options.forceFetch) {
        hydrateNote(cached);
        setViewMode('ready');
        return;
      }

      local.loadingNoteId = id;
      local.error = '';
      setViewMode('loading');

      try {
        const res = await api.getNote(id);
        if (!res?.data) throw new Error('That study guide could not be opened.');
        store.cacheNote(res.data);
        hydrateNote(res.data);
        setViewMode('ready');
        healCompletionState(res.data);
      } catch (err) {
        if (err?.status === 401) {
          requireNoteAuth();
        } else {
          local.error =
            err?.status === 404
              ? 'This study guide no longer exists or was deleted.'
              : err?.message || 'Could not load this study guide.';
          setText('aex-detail-error-title', err?.status === 404 ? 'Study guide not found' : 'Could not load guide');
          setText('aex-detail-error-msg', local.error);
          setViewMode('error');
          if (err?.status === 404) {
            store.removeNoteFromCache(id);
          }
        }
      } finally {
        local.loadingNoteId = '';
      }
    }

    function hydrateNote(note) {
      local.currentNote = note;
      local.filterCategory = 'all';
      local.filterLevel = 'all';
      local.scopeRemaining = false;
      local.recallMode = false;
      local.revealedIndices.clear();
      local.search = '';
      local.renaming = false;

      if (el('aex-note-search')) el('aex-note-search').value = '';
      if (note.targetLanguage) store.setPreferredLanguage(note.targetLanguage);
      renderNote(note);
    }

    async function healCompletionState(note) {
      if (!note || note.isCompleted) return;
      const stats = store.noteStudyState(note);
      if (stats.total === 0 || stats.done < stats.total) return;
      try {
        const res = await api.setNoteCompleted(note.id, true);
        note.isCompleted = Boolean(res.isCompleted);
        store.updateCachedNoteMeta(note.id, { isCompleted: note.isCompleted });
        renderNoteProgress(note);
      } catch {}
    }

    /* --------------------------------------------------------------------
       RENDERING
       -------------------------------------------------------------------- */

    function populateLanguageSelect() {
      const select = el('aex-note-lang-select');
      if (!select) return;
      const items = store.languages();
      const preferred = local.currentNote?.targetLanguage || store.getPreferredLanguage();
      select.innerHTML = items
        .map(
          (l) =>
            `<option value="${escapeHtml(l.code)}">${escapeHtml(l.name)} (${escapeHtml(
              l.native,
            )})</option>`,
        )
        .join('');
      select.value = items.some((l) => l.code === preferred) ? preferred : items[0]?.code || 'en';
    }

    function renderTitleArea(note) {
      const wrap = el('aex-note-title-wrap');
      if (!wrap) return;
      if (local.renaming) {
        wrap.innerHTML = `
          <form class="aex-detail-rename-form" id="aex-detail-rename-form">
            <input type="text" class="aex-rename-input aex-detail-rename-input" id="aex-detail-rename-input" value="${escapeHtml(
              note.title || '',
            )}" maxlength="140" aria-label="Rename study guide" required />
            <button type="submit" class="btn-vox btn-xs">Save</button>
            <button type="button" class="btn-secondary btn-xs" id="aex-detail-rename-cancel">Cancel</button>
          </form>
        `;
        const input = el('aex-detail-rename-input');
        input?.focus();
        input?.select();
      } else {
        wrap.innerHTML = `
          <div class="aex-note-title-row">
            <h2 class="aex-note-title" id="aex-note-title">${escapeHtml(note.title || 'Study guide')}</h2>
            <button type="button" class="aex-icon-btn aex-title-edit-btn" id="aex-detail-rename-btn" title="Rename guide" aria-label="Rename guide">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
          </div>
        `;
      }
    }

    function renderNote(note) {
      if (!note) return;

      teardownBindings();
      setSourcePanelOpen(false);
      setSourceInfoOpen(false);

      renderTitleArea(note);
      setText('aex-note-creator', note.creator || store.SOURCE_TYPE_LABELS[note.sourceType] || 'Source');

      const sourceTypeLabel = store.SOURCE_TYPE_LABELS[note.sourceType] || 'Source';
      const sourceLabel = String(note.sourceLabel || '').trim();
      setText(
        'aex-note-source-label',
        sourceLabel && !sourceLabel.toLowerCase().startsWith(sourceTypeLabel.toLowerCase())
          ? `${sourceTypeLabel} · ${sourceLabel}`
          : sourceLabel || sourceTypeLabel,
      );
      setText(
        'aex-note-model',
        note.modelUsed ? `${note.agentUsed || 'AI'} · ${note.modelUsed}` : 'AI extraction',
      );
      setText('aex-note-time', `Extracted in ${store.formatTime(note.executionTimeMs)}`);
      setText('aex-note-count', `${note.itemCount || note.items?.length || 0} phrases`);

      const cacheBadge = el('aex-note-cached-badge');
      const reextractBtn = el('aex-reextract-btn');
      if (cacheBadge) cacheBadge.hidden = !note.cached;
      if (reextractBtn) {
        reextractBtn.hidden = !(note.sourceUrl || note.sourceText);
      }

      const summaryWrap = el('aex-note-summary-wrap');
      if (summaryWrap) summaryWrap.hidden = !note.summary;
      setText('aex-note-summary', note.summary || '');
      const styleEl = el('aex-note-style');
      if (styleEl) {
        styleEl.textContent = note.speakerStyle || '';
        styleEl.hidden = !note.speakerStyle;
      }

      const openSourceBtn = el('aex-open-source-btn');
      if (openSourceBtn) {
        openSourceBtn.hidden = !/^https?:\/\//i.test(note.sourceUrl || '');
      }

      const studioBtn = el('aex-studio-btn');
      if (studioBtn) {
        const lessonId = String(note.sourceMeta?.lessonId || '').trim();
        const isYouTube = /youtube\.com|youtu\.be/i.test(note.sourceUrl || '');
        studioBtn.hidden = !(lessonId || isYouTube);
        studioBtn.dataset.aexStudio = lessonId
          ? `/studio?id=${encodeURIComponent(lessonId)}`
          : `/studio?url=${encodeURIComponent(note.sourceUrl)}`;
      }

      populateLanguageSelect();
      renderLevelFilter(note);
      renderCategoryFilters(note);
      renderItems(note, { animate: true });
      renderSourceReader(note);
      renderSourceMeta(note);
      renderNoteProgress(note);
    }

    function renderLevelFilter(note) {
      const select = el('aex-note-level-filter');
      if (!select) return;
      const levels = Array.from(
        new Set((note.items || []).map((i) => i.cefr).filter(Boolean)),
      ).sort();
      if (levels.length <= 1) {
        select.hidden = true;
        select.value = 'all';
        local.filterLevel = 'all';
        return;
      }
      select.hidden = false;
      select.innerHTML = [
        '<option value="all">All CEFR levels</option>',
        ...levels.map((lv) => `<option value="${escapeHtml(lv)}">CEFR ${escapeHtml(lv)}</option>`),
      ].join('');
      select.value = levels.includes(local.filterLevel) ? local.filterLevel : 'all';
    }

    function renderCategoryFilters(note) {
      const wrap = el('aex-category-filters');
      if (!wrap) return;
      const counts = new Map();
      for (const item of note.items || []) {
        counts.set(item.category, (counts.get(item.category) || 0) + 1);
      }
      const categories = [
        { id: 'all', label: 'All', count: note.items?.length || 0 },
        ...Array.from(counts.entries()).map(([id, count]) => ({
          id,
          label: store.CATEGORY_LABELS[id] || id,
          count,
        })),
      ];
      wrap.innerHTML = categories
        .map(
          (cat) => `
          <button type="button" class="filter-pill${local.filterCategory === cat.id ? ' active' : ''}" data-aex-filter="${escapeHtml(
            cat.id,
          )}" aria-pressed="${local.filterCategory === cat.id ? 'true' : 'false'}">
            ${cat.id === 'all' ? '' : '<span class="aex-filter-dot" aria-hidden="true"></span>'}
            ${escapeHtml(cat.label)}
            <span class="aex-filter-count">${cat.count}</span>
          </button>`,
        )
        .join('');
    }

    function renderItems(note, options = {}) {
      const list = el('aex-items-list');
      const empty = el('aex-empty-filter');
      if (!list) return;

      list.classList.toggle('is-entering', Boolean(options.animate));
      if (options.animate) {
        clearTimeout(local.listAnimTimer);
        local.listAnimTimer = setTimeout(() => list.classList.remove('is-entering'), 700);
      }

      const completedSet = store.completedIndexSet(note);
      const query = local.search.trim().toLowerCase();
      const items = (note.items || []).filter((item) => {
        if (local.scopeRemaining && completedSet.has(Number(item.index))) return false;
        if (local.filterCategory !== 'all' && item.category !== local.filterCategory) return false;
        if (local.filterLevel !== 'all' && item.cefr !== local.filterLevel) return false;
        if (!query) return true;
        return [
          item.term,
          item.surface,
          item.meaning,
          item.localizedMeaning,
          item.contextSentence,
          item.usageNote,
          item.spokenNote,
          item.example,
        ]
          .filter(Boolean)
          .some((val) => String(val).toLowerCase().includes(query));
      });

      list.innerHTML = items
        .map((item, pos) => renderItemCard(note, item, pos, completedSet))
        .join('');

      if (empty) {
        empty.hidden = items.length > 0;
        if (items.length === 0) {
          const allStudied = local.scopeRemaining && !query && local.filterCategory === 'all' && (note.items || []).length > 0;
          setText('aex-empty-title', allStudied ? 'All phrases studied' : 'No matching phrases');
          setText(
            'aex-empty-copy',
            allStudied
              ? 'Turn off “Remaining only” to review the phrases you already mastered.'
              : 'Try another category, CEFR level, or clear your search.',
          );
        }
      }

      bindItemsSelection(note);
    }

    function renderItemCard(note, item, position, completedSet) {
      const idx = Number(item.index);
      const completed = completedSet.has(idx);
      const saved = store.isTermSaved(item.term);
      const language = store.languageByCode(note.targetLanguage);
      const isEnglishTarget = (note.targetLanguage || 'en') === 'en';
      const rtl = Boolean(language?.rtl);
      const category = String(item.category || 'vocabulary');
      const categoryLabel = store.CATEGORY_LABELS[category] || category || 'Phrase';
      const registerValue = String(item.register || '').trim();
      const showRegister =
        registerValue &&
        registerValue.toLowerCase() !== 'neutral' &&
        registerValue.toLowerCase() !== 'spoken' &&
        registerValue.toLowerCase() !== categoryLabel.toLowerCase();

      const showSurface =
        item.surface &&
        item.surface.trim().toLowerCase() !== item.term.trim().toLowerCase();

      const notes = [
        item.usageNote ? ['Usage', item.usageNote] : null,
        item.spokenNote ? ['Pronunciation & flow', item.spokenNote] : null,
        item.techNote ? ['In US tech', item.techNote] : null,
      ].filter(Boolean);

      const contextHtml = store.highlightTerm(item.contextSentence || '', item.term, item.surface);
      const decoratedContext = global.FlaptapWordLookup
        ? global.FlaptapWordLookup.tokenizeClickableWords(contextHtml, {
            contextSentence: item.contextSentence || '',
          })
        : contextHtml;

      const general =
        item.generalMeaning && item.generalMeaning !== item.meaning ? item.generalMeaning : '';

      const showTranslation = !isEnglishTarget && Boolean(item.localizedMeaning);
      const isMasked = local.recallMode && !local.revealedIndices.has(idx);

      const copyBtn = global.FlaptapCopy?.buttonHtml
        ? global.FlaptapCopy.buttonHtml(item.term, {
            className: 'icon-action icon-action--sm aex-util-btn',
            label: `Copy ${item.term}`,
          })
        : '';

      const checkButton = `<button type="button" class="item-check-btn aex-check-btn${
        completed ? ' is-checked' : ''
      }" data-aex-check="${escapeHtml(idx)}" aria-pressed="${
        completed ? 'true' : 'false'
      }" aria-label="${completed ? 'Completed' : 'Mark phrase studied'}" title="${
        completed ? 'Completed' : 'Mark phrase studied'
      }"><svg class="aex-check-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg></button>`;

      return `
        <article class="aex-item${completed ? ' is-completed' : ''}${
          isMasked ? ' is-recall-masked' : ''
        }" data-aex-index="${escapeHtml(idx)}" data-category="${escapeHtml(
          category,
        )}" data-context="${escapeHtml(item.contextSentence || '')}" style="--aex-order:${Math.min(
          Number(position) || 0,
          12,
        )}">
          <div class="aex-item-head">
            <span class="aex-item-index ltr-num" aria-hidden="true">${idx + 1}</span>
            <div class="aex-item-heading">
              <div class="aex-item-term-line">
                <h3 class="aex-item-term"><span class="aex-term-mark"><span class="aex-term-text">${escapeHtml(
                  item.term,
                )}</span></span></h3>
                ${item.ipa ? `<span class="aex-item-ipa" dir="ltr">${escapeHtml(item.ipa)}</span>` : ''}
                ${
                  showSurface
                    ? `<span class="aex-item-surface" title="Exact wording in source">“${escapeHtml(
                        item.surface,
                      )}”</span>`
                    : ''
                }
              </div>
              <div class="aex-item-meta">
                <span class="aex-item-cat">${escapeHtml(categoryLabel)}</span>
                ${item.cefr ? `<span class="aex-item-level ltr-num">${escapeHtml(item.cefr)}</span>` : ''}
                ${showRegister ? `<span class="aex-item-register">${escapeHtml(registerValue)}</span>` : ''}
                ${
                  item.frequency
                    ? `<span class="aex-item-freq">${escapeHtml(item.frequency)}</span>`
                    : ''
                }
              </div>
            </div>
            <div class="aex-item-actions">
              <div class="aex-action-utils">
                <button type="button" class="icon-action icon-action--sm aex-util-btn" data-aex-speak="${escapeHtml(
                  item.term,
                )}" aria-label="Pronounce ${escapeHtml(item.term)}" title="Pronounce">
                  ${icon('volume-2')}
                </button>
                ${copyBtn}
                <button type="button" class="icon-action icon-action--sm aex-util-btn${
                  saved ? ' is-saved' : ''
                }" data-aex-save-index="${escapeHtml(idx)}" aria-label="${
                  saved ? 'Saved in Vocabulary' : 'Save to Vocabulary'
                }" title="${saved ? 'Saved in Vocabulary' : 'Save to Vocabulary'}">
                  ${icon(saved ? 'bookmark-check' : 'bookmark-plus')}
                </button>
              </div>
              <span class="aex-action-divider" aria-hidden="true"></span>
              ${checkButton}
            </div>
          </div>

          <div class="aex-item-body">
            <div class="aex-sense-grid${showTranslation ? ' has-translation' : ''}${
              isMasked ? ' is-masked' : ''
            }"${isMasked ? ` data-aex-reveal="${escapeHtml(idx)}" role="button" tabindex="0" aria-label="Reveal meaning for ${escapeHtml(item.term)}"` : ''}>
              ${
                isMasked
                  ? `<div class="aex-recall-veil">
                       <span>Recall meaning · Click to reveal</span>
                     </div>`
                  : ''
              }
              <div class="aex-sense">
                <span class="aex-sense-label">Meaning</span>
                <p class="aex-meaning">${escapeHtml(item.meaning)}</p>
                ${
                  general
                    ? `<p class="aex-general-sense"><span class="aex-inline-label">Broadly</span>${escapeHtml(
                        general,
                      )}</p>`
                    : ''
                }
              </div>
              ${
                showTranslation
                  ? `<div class="aex-translation" dir="${rtl ? 'rtl' : 'ltr'}" lang="${escapeHtml(
                      note.targetLanguage || 'en',
                    )}">
                      <span class="aex-sense-label">${escapeHtml(language ? language.name : 'Translation')}</span>
                      <p class="aex-localized" dir="${rtl ? 'rtl' : 'ltr'}" lang="${escapeHtml(
                        note.targetLanguage || 'en',
                      )}">${escapeHtml(item.localizedMeaning)}</p>
                    </div>`
                  : ''
              }
            </div>

            ${
              item.contextSentence || item.example
                ? `<div class="aex-context-band${
                    item.contextSentence && item.example ? ' has-both' : ''
                  }">
                    ${
                      item.contextSentence
                        ? `<div class="aex-context-block">
                            <span class="aex-sense-label">From source</span>
                            <blockquote class="aex-context-quote">${decoratedContext}</blockquote>
                          </div>`
                        : ''
                    }
                    ${
                      item.example
                        ? `<div class="aex-example-block">
                            <span class="aex-sense-label">Spoken example</span>
                            <p class="aex-example">“${escapeHtml(item.example)}”</p>
                          </div>`
                        : ''
                    }
                  </div>`
                : ''
            }

            ${
              notes.length
                ? `<div class="aex-study-footer">
                    <div class="aex-item-notes" data-cols="${Math.min(notes.length, 3)}">${notes
                      .map(
                        ([label, copy]) =>
                          `<div class="aex-note-block"><span class="aex-note-label">${escapeHtml(
                            label,
                          )}</span><p class="aex-note-copy">${escapeHtml(copy)}</p></div>`,
                      )
                      .join('')}</div>
                  </div>`
                : ''
            }
          </div>
        </article>
      `;
    }

    function renderSourceReader(note) {
      const container = el('aex-source-content');
      if (!container) return;
      const text = String(note.sourceText || '').trim();
      container.innerHTML = global.FlaptapWordLookup
        ? global.FlaptapWordLookup.tokenizeClickableWords(escapeHtml(text), {})
        : escapeHtml(text);

      const teardown = global.FlaptapWordLookup?.bindSelectionLookup?.(container, {
        maxLength: 320,
        onSelect: (selectedText, meta) => {
          const context = sentenceAroundRange(meta.range, container) || selectedText;
          openLookup(selectedText, context, null);
        },
      });
      if (teardown) local.teardowns.push(teardown);
    }

    function renderSourceMeta(note) {
      const container = el('aex-source-meta');
      if (!container) return;
      const language = store.languageByCode(note.targetLanguage);
      const meta = note.sourceMeta || {};
      const opts = meta.extractionOptions || {};
      const rows = [
        ['Source type', store.SOURCE_TYPE_LABELS[note.sourceType] || note.sourceType],
        ['Pipeline', note.sourceLabel || '—'],
        ['Meaning language', language ? `${language.name} (${language.native})` : note.targetLanguage],
        ['Extract type', opts.extractionTypeLabel || ''],
        ['English style', opts.styleLabel || ''],
        ['Target level', opts.levelLabel || ''],
        ['Topic focus', opts.focusLabel || ''],
        ['Depth', opts.depthLabel || ''],
        ['Study goal', opts.studyGoalLabel || ''],
        ['Order', opts.orderLabel || ''],
        ['Source words', meta.wordCount ? Number(meta.wordCount).toLocaleString() : '—'],
        ['Sections analyzed', meta.chunkCount > 1 ? String(meta.chunkCount) : ''],
        ['Duration', meta.durationSeconds ? store.formatDuration(meta.durationSeconds) : ''],
        ['Platform', meta.platform || ''],
        ['Engine', meta.engine || meta.ocrModel || ''],
        ['Model', note.modelUsed || ''],
      ].filter(([, val]) => Boolean(val));

      const warnings = Array.isArray(meta.warnings) ? meta.warnings.filter(Boolean) : [];
      const warningHtml = warnings.length
        ? `<div class="aex-source-warning">${warnings.map((w) => `<p>${escapeHtml(w)}</p>`).join('')}</div>`
        : '';

      container.innerHTML = `
        ${rows
          .map(
            ([k, v]) => `
          <div class="aex-source-meta-row">
            <span class="aex-source-meta-key">${escapeHtml(k)}</span>
            <span class="aex-source-meta-value">${escapeHtml(v)}</span>
          </div>`,
          )
          .join('')}
        ${warningHtml}
      `;
    }

    function renderNoteProgress(note) {
      const stats = store.noteStudyState(note);

      const bar = el('aex-note-progress');
      if (bar) {
        bar.hidden = stats.total === 0;
        if (ws()?.renderSubjectProgressBar) {
          ws().renderSubjectProgressBar(bar, {
            total: stats.total,
            completed: stats.done,
            state: { label: stats.label, tone: stats.tone },
          });
        } else {
          bar.textContent = `${stats.done} / ${stats.total} studied`;
        }
      }

      const btn = el('aex-complete-note-btn');
      if (btn) {
        btn.classList.toggle('is-checked', Boolean(note.isCompleted));
        btn.setAttribute('aria-pressed', note.isCompleted ? 'true' : 'false');
        const label = btn.querySelector('span');
        if (label) label.textContent = note.isCompleted ? 'Completed' : 'Mark Complete';
      }

      const scopeBtn = el('aex-note-scope');
      if (scopeBtn) {
        scopeBtn.hidden = stats.total === 0;
        scopeBtn.classList.toggle('is-active', local.scopeRemaining);
        scopeBtn.setAttribute('aria-pressed', local.scopeRemaining ? 'true' : 'false');
      }
      setText('aex-study-count', String(stats.remaining));

      const recallBtn = el('aex-recall-toggle');
      if (recallBtn) {
        recallBtn.hidden = stats.total === 0;
        recallBtn.classList.toggle('is-active', local.recallMode);
        recallBtn.setAttribute('aria-pressed', local.recallMode ? 'true' : 'false');
      }

      store.updateCachedNoteMeta(note.id, {
        completedCount: stats.done,
        isCompleted: Boolean(note.isCompleted),
      });
    }

    /* --------------------------------------------------------------------
       STUDY ACTIONS (RENAME, COMPLETION, RECALL, SAVE, COPY, EXPORT, LOOKUP)
       -------------------------------------------------------------------- */

    function setSourcePanelOpen(open) {
      const panel = el('aex-source-panel');
      const toggle = el('aex-source-toggle');
      if (!panel) return;
      panel.hidden = !open;
      if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function setSourceInfoOpen(open) {
      const pop = el('aex-source-meta');
      const toggle = el('aex-info-toggle');
      if (!pop) return;
      pop.hidden = !open;
      if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function teardownBindings() {
      for (const fn of local.teardowns) {
        try {
          fn();
        } catch {}
      }
      local.teardowns = [];
      if (typeof local.itemsTeardown === 'function') {
        try {
          local.itemsTeardown();
        } catch {}
        local.itemsTeardown = null;
      }
    }

    function bindItemsSelection(note) {
      const list = el('aex-items-list');
      if (!list || !global.FlaptapWordLookup?.bindSelectionLookup) return;
      if (typeof local.itemsTeardown === 'function') {
        try {
          local.itemsTeardown();
        } catch {}
        local.itemsTeardown = null;
      }
      const teardown = global.FlaptapWordLookup.bindSelectionLookup(list, {
        maxLength: 320,
        onSelect: (text, meta) => {
          const itemEl = meta.range.commonAncestorContainer?.parentElement?.closest?.('.aex-item');
          const context = itemEl?.dataset?.context || text;
          openLookup(text, context, null);
        },
      });
      local.itemsTeardown = typeof teardown === 'function' ? teardown : null;
    }

    function sentenceAroundRange(range, container) {
      try {
        const full = container.textContent || '';
        if (!full) return '';
        const before = document.createRange();
        before.selectNodeContents(container);
        before.setEnd(range.startContainer, range.startOffset);
        const start = before.toString().length;
        const end = start + String(range.toString() || '').length;

        let left = start;
        while (left > 0 && !/[.!?\n]/.test(full[left - 1])) left--;
        let right = end;
        while (right < full.length && !/[.!?\n]/.test(full[right])) right++;
        if (right < full.length) right++;

        return full.slice(left, right).replace(/\s+/g, ' ').trim().slice(0, 500);
      } catch {
        return '';
      }
    }

    async function openLookup(word, contextSentence, sourceEl) {
      if (!word || !global.FlaptapWordLookup) return;
      const note = local.currentNote;
      const language = el('aex-note-lang-select')?.value || store.getPreferredLanguage();
      store.setPreferredLanguage(language);

      await global.FlaptapWordLookup.open({
        word,
        sourceEl: sourceEl || undefined,
        contextSentence: contextSentence || word,
        endpoint: '/api/american-extractor/define-word',
        payload: {
          noteId: note?.id,
          word,
          contextSentence: contextSentence || undefined,
          title: note?.title,
          language,
        },
        fetcher: api.apiFetch,
        canPlay: false,
        canSpeak: true,
        canSave: true,
        isSaved: (term) => store.isTermSaved(term),
        onSave: async (lookup) => {
          if (!store.currentUser()) {
            requireNoteAuth();
            return;
          }
          try {
            await api.saveVocabularyItem({
              term: lookup.term,
              ipa: lookup.ipa,
              partOfSpeech: lookup.partOfSpeech,
              definition: lookup.definition,
              generalTranslation: lookup.generalTranslation || '',
              translation: lookup.translation || '',
              contextSentence: lookup.contextSentence,
              lessonTitle: note?.title || 'Anything to Phrases',
            });
            store.rememberSaved(lookup.term);
            await ws()?.refreshVocabulary?.();
            updateSaveButtons();
            global.FlaptapWordLookup.syncSavedButtonDom();
            showToast(`Saved “${lookup.term}” to Vocabulary`);
          } catch (err) {
            showToast(err?.message || 'Could not save that phrase.');
          }
        },
      });
    }

    function updateSaveButtons() {
      document.querySelectorAll('#aex-view-note [data-aex-save-index]').forEach((btn) => {
        const idx = Number(btn.dataset.aexSaveIndex);
        const item = local.currentNote?.items?.find((e) => Number(e.index) === idx);
        if (!item) return;
        const saved = store.isTermSaved(item.term);
        btn.classList.toggle('is-saved', saved);
        btn.innerHTML = icon(saved ? 'bookmark-check' : 'bookmark-plus');
        const label = saved ? 'Saved in Vocabulary' : 'Save to Vocabulary';
        btn.setAttribute('aria-label', label);
        btn.title = label;
      });
      global.FlaptapWordLookup?.syncSavedButtonDom?.();
    }

    async function saveItem(index) {
      const note = local.currentNote;
      const item = note?.items?.find((e) => Number(e.index) === Number(index));
      if (!item) return;
      if (!store.currentUser()) {
        requireNoteAuth();
        return;
      }
      if (store.isTermSaved(item.term)) {
        showToast('Already saved in your Vocabulary Vault.');
        return;
      }
      try {
        await api.saveVocabularyItem({
          term: item.term,
          ipa: item.ipa,
          partOfSpeech: store.CATEGORY_LABELS[item.category] || '',
          definition: item.meaning,
          generalTranslation: item.generalMeaning || '',
          translation: item.localizedMeaning || '',
          contextSentence: item.contextSentence || '',
          lessonTitle: note.title || 'Anything to Phrases',
        });
        store.rememberSaved(item.term);
        await ws()?.refreshVocabulary?.();
        updateSaveButtons();
        showToast(`Saved “${item.term}” to Vocabulary`);
      } catch (err) {
        showToast(err?.message || 'Could not save that phrase.');
      }
    }

    async function saveAllItems() {
      const note = local.currentNote;
      if (!note) return;
      if (!store.currentUser()) {
        requireNoteAuth();
        return;
      }
      const pending = (note.items || []).filter((item) => !store.isTermSaved(item.term));
      if (pending.length === 0) {
        showToast('Every phrase in this guide is already saved.');
        return;
      }

      const btn = el('aex-save-all-btn');
      const original = btn?.innerHTML;
      if (btn) {
        btn.disabled = true;
        btn.textContent = `Saving ${pending.length}…`;
      }
      let saved = 0;
      for (const item of pending) {
        try {
          await api.saveVocabularyItem({
            term: item.term,
            ipa: item.ipa,
            partOfSpeech: store.CATEGORY_LABELS[item.category] || '',
            definition: item.meaning,
            generalTranslation: item.generalMeaning || '',
            translation: item.localizedMeaning || '',
            contextSentence: item.contextSentence || '',
            lessonTitle: note.title || 'Anything to Phrases',
          });
          store.rememberSaved(item.term);
          saved++;
        } catch {}
      }
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = original;
      }
      await ws()?.refreshVocabulary?.();
      updateSaveButtons();
      showToast(`Saved ${saved} of ${pending.length} phrases to Vocabulary`);
    }

    async function toggleItemCompletion(index, sourceButton) {
      const note = local.currentNote;
      if (!note) return;
      const idx = Number(index);
      const current = store.completedIndexSet(note);
      const total = Array.isArray(note.items) ? note.items.length : 0;
      const wasAllDone = total > 0 && current.size >= total;
      const next = !current.has(idx);

      try {
        const res = await api.setItemCompletion(note.id, idx, next);
        note.completionProgress = res.completionProgress || note.completionProgress;
        const nowAllDone = total > 0 && store.completedIndexSet(note).size >= total;

        if (!note.isCompleted && nowAllDone) {
          const comp = await api.setNoteCompleted(note.id, true);
          note.isCompleted = Boolean(comp.isCompleted);
          showToast('Every phrase studied — study guide completed!');
        } else if (note.isCompleted && wasAllDone && !nowAllDone) {
          const comp = await api.setNoteCompleted(note.id, false);
          note.isCompleted = Boolean(comp.isCompleted);
        }

        if (local.scopeRemaining) {
          renderItems(note);
        } else {
          const card = sourceButton?.closest('.aex-item');
          card?.classList.toggle('is-completed', next);
          if (sourceButton && ws()?.setCheckButtonState) {
            ws().setCheckButtonState(sourceButton, next);
          } else if (sourceButton) {
            sourceButton.classList.toggle('is-checked', next);
            sourceButton.setAttribute('aria-pressed', next ? 'true' : 'false');
          }
        }
        renderNoteProgress(note);
      } catch (err) {
        showToast(err?.message || 'Could not update progress.');
      }
    }

    async function toggleNoteCompletion() {
      const note = local.currentNote;
      if (!note) return;
      try {
        const res = await api.setNoteCompleted(note.id, !note.isCompleted);
        note.isCompleted = Boolean(res.isCompleted);
        renderNoteProgress(note);
        showToast(note.isCompleted ? 'Study guide marked complete' : 'Study guide reopened');
      } catch (err) {
        showToast(err?.message || 'Could not update study guide.');
      }
    }

    async function submitRename(rawTitle) {
      const note = local.currentNote;
      if (!note) return;
      const title = String(rawTitle || '').trim();
      if (!title) {
        showToast('Title cannot be empty.');
        return;
      }
      try {
        const res = await api.renameNote(note.id, title);
        note.title = res.title || title;
        local.renaming = false;
        renderTitleArea(note);
        store.updateCachedNoteMeta(note.id, { title: note.title });
        showToast('Guide renamed.');
      } catch (err) {
        showToast(err?.message || 'Could not rename guide.');
      }
    }

    function buildMarkdown(note) {
      const language = store.languageByCode(note.targetLanguage);
      const lines = [
        `# ${note.title}`,
        '',
        `Source: ${note.sourceLabel || store.SOURCE_TYPE_LABELS[note.sourceType] || ''}`,
        note.sourceUrl ? `URL: ${note.sourceUrl}` : '',
        note.creator ? `Creator: ${note.creator}` : '',
        `Meaning language: ${language?.name || note.targetLanguage}`,
        '',
        note.summary ? `## Takeaway\n${note.summary}` : '',
        '',
        '## American English Phrases',
        '',
      ].filter(Boolean);

      for (const item of note.items || []) {
        lines.push(
          `### ${Number(item.index) + 1}. ${item.term}${item.ipa ? ` ${item.ipa}` : ''}${
            item.cefr ? ` (${item.cefr})` : ''
          }`,
          `- Category: ${store.CATEGORY_LABELS[item.category] || item.category}${
            item.register && item.register !== 'neutral' ? ` (${item.register})` : ''
          }`,
          `- Meaning: ${item.meaning}`,
        );
        if (item.localizedMeaning && item.localizedMeaning !== item.meaning) {
          lines.push(`- Translation: ${item.localizedMeaning}`);
        }
        if (item.contextSentence) lines.push(`- From source: "${item.contextSentence}"`);
        if (item.usageNote) lines.push(`- Usage: ${item.usageNote}`);
        if (item.spokenNote) lines.push(`- Pronunciation: ${item.spokenNote}`);
        if (item.example) lines.push(`- Example: ${item.example}`);
        lines.push('');
      }
      return lines.join('\n');
    }

    async function copyStudyNotes() {
      const note = local.currentNote;
      if (!note) return;
      const content = buildMarkdown(note);
      const ok = global.FlaptapCopy?.writeClipboard
        ? await global.FlaptapCopy.writeClipboard(content)
        : false;
      if (ok) {
        showToast('Study notes copied to clipboard');
      } else {
        try {
          await navigator.clipboard.writeText(content);
          showToast('Study notes copied to clipboard');
        } catch {
          showToast('Could not copy to clipboard.');
        }
      }
    }

    function exportMarkdown() {
      const note = local.currentNote;
      if (!note) return;
      const content = buildMarkdown(note);
      const slug = String(note.title || 'study-guide')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug || 'anything-to-phrases'}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Exported Markdown study guide');
    }

    /* --------------------------------------------------------------------
       EVENTS & LIFECYCLE
       -------------------------------------------------------------------- */

    function bindEvents() {
      const root = el('aex-view-note');
      if (!root) return;

      el('aex-back-to-library')?.addEventListener('click', () => nav.goToLibrary());
      el('aex-detail-back-err')?.addEventListener('click', () => nav.goToLibrary());
      el('aex-detail-retry-err')?.addEventListener('click', () => {
        if (local.currentNote?.id) loadNote(local.currentNote.id, { forceFetch: true });
        else nav.goToLibrary();
      });

      el('aex-new-btn')?.addEventListener('click', () => nav.goToExtract({ focusInput: true }));
      el('aex-copy-btn')?.addEventListener('click', copyStudyNotes);
      el('aex-export-btn')?.addEventListener('click', exportMarkdown);
      el('aex-save-all-btn')?.addEventListener('click', saveAllItems);
      el('aex-complete-note-btn')?.addEventListener('click', toggleNoteCompletion);

      el('aex-reextract-btn')?.addEventListener('click', () => {
        if (local.currentNote) nav.reextractNote(local.currentNote);
      });

      el('aex-open-source-btn')?.addEventListener('click', () => {
        const url = local.currentNote?.sourceUrl;
        if (url && /^https?:\/\//i.test(url)) {
          global.open(url, '_blank', 'noopener,noreferrer');
        }
      });

      el('aex-studio-btn')?.addEventListener('click', (e) => {
        const target = e.currentTarget?.dataset?.aexStudio;
        if (target) global.location.href = target;
      });

      el('aex-note-lang-select')?.addEventListener('change', (e) => {
        store.setPreferredLanguage(e.target.value);
      });

      el('aex-source-toggle')?.addEventListener('click', () => {
        const panel = el('aex-source-panel');
        if (panel) setSourcePanelOpen(panel.hidden);
      });
      el('aex-source-close')?.addEventListener('click', () => setSourcePanelOpen(false));

      el('aex-info-toggle')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const pop = el('aex-source-meta');
        if (pop) setSourceInfoOpen(pop.hidden);
      });

      document.addEventListener('click', (e) => {
        const pop = el('aex-source-meta');
        if (!pop || pop.hidden) return;
        if (pop.contains(e.target) || e.target.closest?.('#aex-info-toggle')) return;
        setSourceInfoOpen(false);
      });

      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (local.renaming && local.currentNote) {
          local.renaming = false;
          renderTitleArea(local.currentNote);
          return;
        }
        const pop = el('aex-source-meta');
        if (pop && !pop.hidden) {
          setSourceInfoOpen(false);
          return;
        }
        const panel = el('aex-source-panel');
        if (panel && !panel.hidden) setSourcePanelOpen(false);
      });

      el('aex-note-scope')?.addEventListener('click', () => {
        local.scopeRemaining = !local.scopeRemaining;
        if (local.currentNote) {
          renderNoteProgress(local.currentNote);
          renderItems(local.currentNote);
        }
      });

      el('aex-recall-toggle')?.addEventListener('click', () => {
        local.recallMode = !local.recallMode;
        local.revealedIndices.clear();
        if (local.currentNote) {
          renderNoteProgress(local.currentNote);
          renderItems(local.currentNote);
        }
        showToast(
          local.recallMode
            ? 'Recall mode on — click any card to reveal meaning'
            : 'Recall mode off',
        );
      });

      el('aex-note-level-filter')?.addEventListener('change', (e) => {
        local.filterLevel = e.target.value || 'all';
        if (local.currentNote) renderItems(local.currentNote);
      });

      el('aex-note-search')?.addEventListener('input', (e) => {
        local.search = String(e.target.value || '');
        if (local.currentNote) renderItems(local.currentNote);
      });

      root.addEventListener('click', (e) => {
        if (e.target.closest('#aex-detail-rename-btn')) {
          if (local.currentNote) {
            local.renaming = true;
            renderTitleArea(local.currentNote);
          }
          return;
        }

        if (e.target.closest('#aex-detail-rename-cancel')) {
          if (local.currentNote) {
            local.renaming = false;
            renderTitleArea(local.currentNote);
          }
          return;
        }

        const revealEl = e.target.closest('[data-aex-reveal]');
        if (revealEl && local.currentNote) {
          const idx = Number(revealEl.dataset.aexReveal);
          local.revealedIndices.add(idx);
          revealEl.classList.remove('is-masked');
          revealEl.removeAttribute('data-aex-reveal');
          revealEl.removeAttribute('role');
          revealEl.removeAttribute('tabindex');
          revealEl.querySelector('.aex-recall-veil')?.remove();
          revealEl.closest('.aex-item')?.classList.remove('is-recall-masked');
          return;
        }

        const filterBtn = e.target.closest('[data-aex-filter]');
        if (filterBtn) {
          local.filterCategory = filterBtn.dataset.aexFilter || 'all';
          if (local.currentNote) {
            renderCategoryFilters(local.currentNote);
            renderItems(local.currentNote);
          }
          return;
        }

        const checkBtn = e.target.closest('[data-aex-check]');
        if (checkBtn) {
          e.preventDefault();
          toggleItemCompletion(checkBtn.dataset.aexCheck, checkBtn);
          return;
        }

        const saveBtn = e.target.closest('[data-aex-save-index]');
        if (saveBtn) {
          e.preventDefault();
          saveItem(saveBtn.dataset.aexSaveIndex);
          return;
        }

        const speakBtn = e.target.closest('[data-aex-speak]');
        if (speakBtn) {
          e.preventDefault();
          global.FlaptapWordLookup?.speakText?.(speakBtn.dataset.aexSpeak);
        }
      });

      root.addEventListener('keydown', (e) => {
        const revealEl = e.target.closest?.('[data-aex-reveal]');
        if (revealEl && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          revealEl.click();
        }
      });

      root.addEventListener('submit', (e) => {
        const form = e.target.closest('#aex-detail-rename-form');
        if (!form) return;
        e.preventDefault();
        submitRename(el('aex-detail-rename-input')?.value || '');
      });
    }

    function mount() {
      if (local.mounted) return;
      local.mounted = true;
      bindEvents();

      local.unsubs.push(
        store.subscribe('note:deleted', ({ id }) => {
          if (local.currentNote?.id === id) {
            local.currentNote = null;
            teardownBindings();
          }
        }),
      );
    }

    function onDeactivate() {
      setSourceInfoOpen(false);
    }

    function clearCurrent() {
      local.currentNote = null;
      teardownBindings();
    }

    return {
      mount,
      openNote: loadNote,
      onDeactivate,
      onLanguagesLoaded: populateLanguageSelect,
      syncVocabularyState: updateSaveButtons,
      clearCurrent,
      getCurrentNote: () => local.currentNote,
    };
  }

  global.FlaptapA2PDetailPage = { create };
})(window);
