/* ==========================================================================
   GENERATE PHRASES — STUDY DETAIL SHEET (generate-phrases/study-drawer.js)
   Deep single-expression breakdown with:
   - Full translated examples & translated usage pattern examples
   - Inline one-click sentence translation for legacy items
   - Textbook vs. Natural American contrast & Spoken Mechanics
   - Variations, Collocations, Related Expressions & Personal Memory Note
   - Prev/Next stepping + Keyboard shortcuts (ArrowLeft / ArrowRight / Esc)
   ========================================================================== */

(function (global) {
  'use strict';

  function create(deps) {
    const store = deps.store;
    const api = deps.api;
    const R = () => global.FlaptapGPCardRenderer;
    const PU = () => global.FlaptapPhraseUtils;
    const U = global.FlaptapUtils;
    const escapeHtml = U.escapeHtml;

    let mounted = false;

    function el(id) {
      return document.getElementById(id);
    }

    function icon(name, options) {
      return global.FlaptapIcon ? global.FlaptapIcon(name, options) : '';
    }

    async function open(itemId) {
      let item = store.findItemAnywhere(itemId);
      if (!item && itemId && store.currentUser()) {
        try {
          const res = await api.getItem(itemId);
          if (res?.item) {
            item = res.item;
            if (!store.state.items.some((i) => i.id === item.id)) {
              store.state.items.unshift(item);
            }
          }
        } catch {
          return;
        }
      }
      if (!item) return;

      store.state.activeStudyItemId = item.id;
      render();
      const backdrop = el('ll-study-drawer-backdrop');
      if (backdrop) backdrop.hidden = false;
    }

    function close() {
      store.state.activeStudyItemId = null;
      const backdrop = el('ll-study-drawer-backdrop');
      if (backdrop) backdrop.hidden = true;
    }

    function step(delta) {
      const items = store.state.items || [];
      if (items.length === 0 || !store.state.activeStudyItemId) return;
      const idx = items.findIndex((it) => it.id === store.state.activeStudyItemId);
      if (idx === -1) return;
      const nextIdx = (idx + delta + items.length) % items.length;
      store.state.activeStudyItemId = items[nextIdx].id;
      render();
    }

    function render() {
      const body = el('ll-study-drawer-body');
      const counter = el('ll-study-counter');
      const prevBtn = el('ll-study-prev-btn');
      const nextBtn = el('ll-study-next-btn');
      const crumbDomain = el('ll-study-crumb-domain');
      if (!body) return;

      const item = store.findItemAnywhere(store.state.activeStudyItemId);
      if (!item) {
        close();
        return;
      }

      const items = store.state.items || [];
      const idx = items.findIndex((it) => it.id === item.id);
      const totalFiltered = Number(store.state.filteredCount) || items.length;
      if (counter) {
        if (idx >= 0) {
          const globalPos = (Math.max(1, store.state.page) - 1) * store.state.pageSize + idx + 1;
          counter.textContent =
            totalFiltered > items.length
              ? `${globalPos} / ${totalFiltered}`
              : `${idx + 1} / ${items.length}`;
        } else {
          counter.textContent = '1 / 1';
        }
      }
      if (prevBtn) prevBtn.disabled = items.length <= 1;
      if (nextBtn) nextBtn.disabled = items.length <= 1;

      const domain = store.getActiveDomain();
      const labels = domain?.uiLabels || {};
      const isDone = Boolean(item.isCompleted);
      const isMasked = Boolean(
        store.state.recallMaskMode && !store.state.revealedCardIds.has(item.id),
      );
      const showRegister = store.isDistinctLabel(item.register, item.categoryLabel);
      const showSpoken = store.isDistinctLabel(item.spokenForm, item.expression);
      const isSavedToVocab = Boolean(
        store.ws()?.isVocabularySaved && store.ws().isVocabularySaved(item.expression),
      );
      const examples = Array.isArray(item.examples) ? item.examples : [];
      const sequenceNumber = Number(item.sequenceNumber) > 0 ? Number(item.sequenceNumber) : idx + 1;
      const catTone = store.getCategoryTone(item.categoryId);
      const goalLang = String(item.targetLanguage || store.getPreferredLanguage() || 'ar').toLowerCase();
      const isEnglishTarget = store.getPreferredLanguage() === 'en';
      const isRtl = store.isRtl(goalLang);
      const missingTrans = store.hasMissingSentenceTranslations(item);
      const busyTrans = store.state.translatingItemIds.has(item.id);

      if (crumbDomain) {
        crumbDomain.textContent = `${domain?.title || 'Generate Phrases'} · ${
          item.categoryLabel || 'Expression'
        }`;
      }

      const patternKey = (v) => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const extraPatterns = (Array.isArray(item.usagePatterns) ? item.usagePatterns : []).filter(
        (p) => p && String(p.pattern || '').trim() && patternKey(p.pattern) !== patternKey(item.expression),
      );

      const drawerEl = document.querySelector('.ll-study-drawer');
      if (drawerEl) {
        drawerEl.classList.toggle('is-item-completed', isDone);
        drawerEl.dataset.guideState = isDone ? 'done' : 'progress';
      }

      const contrastAndMechanicsRow = [
        item.textbookEquivalent
          ? `<div class="ll-card-box ll-box-contrast">
               <span class="ll-sense-label">${escapeHtml(
                 labels.textbookContrastHeading || 'Textbook vs. Natural Native',
               )}</span>
               <div class="ll-contrast-strip">
                 <div class="ll-contrast-col">
                   <span class="ll-contrast-label">Textbook / Literal</span>
                   <span class="ll-contrast-textbook">${escapeHtml(item.textbookEquivalent)}</span>
                 </div>
                 <div class="ll-contrast-col">
                   <span class="ll-contrast-label">Natural American</span>
                   <span class="ll-contrast-native" dir="ltr">${R().renderSlotizedText(item.expression)}</span>
                 </div>
               </div>
             </div>`
          : '',
        item.phoneticBreakdown || showSpoken
          ? `<div class="ll-card-box ll-box-spoken">
               <span class="ll-sense-label">${escapeHtml(
                 labels.mechanicsHeading || 'Spoken Mechanics & Delivery',
               )}</span>
               ${
                 showSpoken
                   ? `<p class="ll-spoken-callout" dir="ltr"><span class="ll-inline-label">Spoken reduction</span><strong>${escapeHtml(
                       item.spokenForm,
                     )}</strong></p>`
                   : ''
               }
               ${item.phoneticBreakdown ? `<p class="ll-note-copy">${escapeHtml(item.phoneticBreakdown)}</p>` : ''}
             </div>`
          : '',
      ].filter(Boolean);

      const nuanceHeadingText = String(labels.nuanceHeading || 'Context & Native Vibe')
        .replace(/\s*&\s*mistakes to avoid/i, '')
        .trim();

      const nuanceAndMistakesRow = [
        item.nativeContext
          ? `<div class="ll-card-box ll-box-usage">
               <span class="ll-sense-label">${escapeHtml(nuanceHeadingText || 'Context & Native Vibe')}</span>
               <p class="ll-note-copy">${escapeHtml(item.nativeContext)}</p>
             </div>`
          : '',
        item.mistakesToAvoid
          ? `<div class="ll-card-box ll-box-avoid">
               <span class="ll-sense-label">Mistakes to Avoid</span>
               <p class="ll-note-copy">${escapeHtml(item.mistakesToAvoid)}</p>
             </div>`
          : '',
      ].filter(Boolean);

      const variationsAndPatternsRow = [
        item.variations?.length || item.combinations?.length
          ? `<div class="ll-card-box ll-box-variations">
               ${
                 item.variations?.length
                   ? `<div class="ll-chip-section">
                        <span class="ll-sense-label">${escapeHtml(
                          labels.variationsHeading || 'Variations & Shortcuts',
                        )}</span>
                        <div class="ll-chips-wrap">${item.variations
                          .map(
                            (v) =>
                              `<button type="button" class="ll-chip" data-ll-speak="${escapeHtml(
                                v,
                              )}" title="Listen to variation" dir="ltr">${escapeHtml(v)}</button>`,
                          )
                          .join('')}</div>
                      </div>`
                   : ''
               }
               ${
                 item.combinations?.length
                   ? `<div class="ll-chip-section">
                        <span class="ll-sense-label">${escapeHtml(
                          labels.combinationsHeading || 'Combinations & Collocations',
                        )}</span>
                        <div class="ll-chips-wrap">${item.combinations
                          .map(
                            (c) =>
                              `<button type="button" class="ll-chip is-combo" data-ll-speak="${escapeHtml(
                                c,
                              )}" title="Listen to collocation" dir="ltr">${R().renderSlotizedText(c)}</button>`,
                          )
                          .join('')}</div>
                      </div>`
                   : ''
               }
             </div>`
          : '',
        extraPatterns.length || item.relatedExpressions?.length || R().getPatternGuide(item)
          ? `<div class="ll-card-box ll-box-patterns">
               <span class="ll-sense-label">${escapeHtml(
                 labels.patternsHeading || 'Usage Patterns & Related',
               )}</span>
               ${R().renderPatternGuideHtml(item, { stacked: true })}
               ${
                 extraPatterns.length
                   ? `<div class="ll-patterns-stack">
                        ${extraPatterns
                          .map((p) => {
                            const pTransHtml =
                              !isEnglishTarget && p.exampleTranslation
                                ? PU().renderQuoteTranslationHtml(p.exampleTranslation, goalLang, isRtl, {
                                    className: 'ft-quote-translation ll-pattern-translation',
                                  })
                                : '';
                            return `
                            <div class="ll-pattern-item">
                              <span class="ll-pattern-formula" dir="ltr">${R().renderSlotizedText(p.pattern)}</span>
                              ${p.meaning ? `<span class="ll-pattern-meaning">${escapeHtml(p.meaning)}</span>` : ''}
                              ${
                                p.example
                                  ? `<span class="ll-pattern-example" dir="ltr">“${R().tokenizeExampleSentence(
                                      p.example,
                                      item.id,
                                      item.expression,
                                      item.spokenForm,
                                    )}”</span>`
                                  : ''
                              }
                              ${pTransHtml}
                            </div>`;
                          })
                          .join('')}
                      </div>`
                   : ''
               }
               ${
                 item.relatedExpressions?.length
                   ? `<div class="ll-chip-section">
                        <span class="ll-sense-label">Related Native Expressions</span>
                        <div class="ll-chips-wrap">${item.relatedExpressions
                          .map(
                            (r) =>
                              `<button type="button" class="ll-chip" data-ll-speak="${escapeHtml(
                                r,
                              )}" title="Listen" dir="ltr">${escapeHtml(r)}</button>`,
                          )
                          .join('')}</div>
                      </div>`
                   : ''
               }
             </div>`
          : '',
      ].filter(Boolean);

      body.innerHTML = `
        <div class="ll-detail-hero">
          <div class="ll-study-actions-bar">
            ${R().renderCheckButton(isDone, item.id, isDone ? 'Completed' : 'Mark Done')}
            <button type="button" class="btn-secondary btn-sm" data-ll-speak="${escapeHtml(
              R().getSpeakableText(item),
            )}" title="Pronounce" aria-label="Pronounce">
              ${icon('volume-2')}
              <span>Pronounce</span>
            </button>
            ${
              global.FlaptapCopy
                ? global.FlaptapCopy.buttonHtml(item.expression, { className: 'btn-secondary btn-sm' })
                : ''
            }
            <button type="button" class="btn-secondary btn-sm${
              item.isFavorite ? ' is-favorite' : ''
            }" data-ll-toggle-fav="${escapeHtml(item.id)}" title="${
              item.isFavorite ? 'Favorited' : 'Favorite'
            }">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="${
                item.isFavorite ? 'currentColor' : 'none'
              }" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              <span>${item.isFavorite ? 'Favorited' : 'Favorite'}</span>
            </button>
            ${
              !isEnglishTarget && missingTrans
                ? `<button type="button" class="btn-secondary btn-sm" data-ll-translate-item="${escapeHtml(
                    item.id,
                  )}" ${busyTrans ? 'disabled' : ''}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 8 6 6"></path><path d="m4 14 6-6 2-3"></path><path d="M2 5h12"></path><path d="M7 2h1"></path><path d="m22 22-5-10-5 10"></path><path d="M14 18h6"></path></svg>
                    <span>${busyTrans ? 'Translating…' : 'Translate sentences'}</span>
                  </button>`
                : ''
            }
            <button type="button" class="btn-vox btn-sm${
              isSavedToVocab ? ' is-saved' : ''
            }" data-ll-save-vocab="${escapeHtml(item.id)}">
              ${icon(isSavedToVocab ? 'bookmark-check' : 'bookmark-plus')}
              <span>${isSavedToVocab ? 'In Flashcards' : 'Save to Flashcards'}</span>
            </button>
            <button type="button" class="btn-secondary btn-sm is-danger-ghost" data-ll-delete-item="${escapeHtml(
              item.id,
            )}" title="Delete expression" aria-label="Delete expression">
              ${icon('trash')}
            </button>
          </div>

          <div class="ll-detail-title-row">
            <span class="ll-item-index ll-detail-index ltr-num"><span class="ll-index-hash">#</span>${sequenceNumber}</span>
            <h2 class="ll-study-title" id="ll-study-title" dir="ltr"><span class="ll-term-text">${R().renderSlotizedText(
              item.expression,
            )}</span></h2>
          </div>

          <div class="ll-card-badges ll-detail-meta">
            ${item.ipa ? `<span class="ll-expr-ipa ltr-num" dir="ltr">${escapeHtml(item.ipa)}</span>` : ''}
            <span class="ll-badge is-category" data-cat-tone="${escapeHtml(catTone)}">${escapeHtml(
              item.categoryLabel,
            )}</span>
            ${item.cefr ? `<span class="ll-badge is-level ltr-num">${escapeHtml(item.cefr)}</span>` : ''}
            ${item.level && item.level !== item.cefr ? `<span class="ll-badge is-level">${escapeHtml(item.level)}</span>` : ''}
            ${showRegister ? `<span class="ll-badge is-register">${escapeHtml(item.register)}</span>` : ''}
            ${item.tone ? `<span class="ll-badge">${escapeHtml(item.tone)}</span>` : ''}
            ${
              showSpoken
                ? `<span class="ll-badge is-spoken" dir="ltr"><span class="ll-meta-label">${escapeHtml(
                    labels.spokenHeading || 'Spoken',
                  )}</span> <strong>${escapeHtml(item.spokenForm)}</strong></span>`
                : ''
            }
            ${
              item.modelName
                ? `<span class="ll-badge is-model">${escapeHtml(item.agentName || 'AI')} · ${escapeHtml(
                    item.modelName,
                  )}</span>`
                : ''
            }
            ${isDone ? '<span class="ll-item-done-tag">Studied</span>' : ''}
          </div>
        </div>

        <div class="ll-summary-banner ll-meaning-block${isMasked ? ' is-masked' : ''}">
          ${
            isMasked
              ? `<button type="button" class="ll-recall-veil ll-recall-reveal-btn" data-ll-reveal="${escapeHtml(
                  item.id,
                )}"><span>Click to reveal meaning</span></button>`
              : ''
          }
          <div class="ll-summary-head">
            <span class="ll-summary-kicker">Core Meaning &amp; Takeaway</span>
            <span class="ll-summary-style">${escapeHtml(item.register || item.categoryLabel || '')}</span>
          </div>
          <div class="ll-meaning-body">
            <p class="ll-summary-body ll-core-meaning">${escapeHtml(item.coreMeaning)}</p>
            ${
              !isEnglishTarget && item.localizedMeaning
                ? `<p class="ll-localized-meaning" dir="${isRtl ? 'rtl' : 'ltr'}" lang="${escapeHtml(
                    goalLang,
                  )}">${R().renderSlotizedText(item.localizedMeaning)}</p>`
                : ''
            }
          </div>
        </div>

        ${
          examples.length
            ? `<div class="ll-box-row ll-row-quotes" data-cols="${Math.min(2, examples.length)}">
                 ${examples
                   .map((ex, exIdx) =>
                     R().renderExampleBlock(ex, item, exIdx, {
                       showNote: true,
                       showInlineTranslate: missingTrans,
                     }),
                   )
                   .join('')}
               </div>`
            : ''
        }

        ${
          contrastAndMechanicsRow.length
            ? `<div class="ll-box-row ll-row-insights" data-cols="${contrastAndMechanicsRow.length}">${contrastAndMechanicsRow.join(
                '',
              )}</div>`
            : ''
        }

        ${
          nuanceAndMistakesRow.length
            ? `<div class="ll-box-row ll-row-insights" data-cols="${nuanceAndMistakesRow.length}">${nuanceAndMistakesRow.join(
                '',
              )}</div>`
            : ''
        }

        ${
          variationsAndPatternsRow.length
            ? `<div class="ll-box-row ll-row-insights" data-cols="${variationsAndPatternsRow.length}">${variationsAndPatternsRow.join(
                '',
              )}</div>`
            : ''
        }

        <div class="ll-card-box ll-box-notes">
          <span class="ll-sense-label">Personal Memory Note</span>
          <div class="ll-notes-row">
            <input type="text" class="ll-notes-input" data-ll-note-input="${escapeHtml(
              item.id,
            )}" value="${escapeHtml(item.userNotes || '')}" placeholder="Add a personal memory cue or example sentence..." />
            <button type="button" class="btn-vox btn-sm" data-ll-save-note="${escapeHtml(
              item.id,
            )}" title="Save note" aria-label="Save note">
              ${icon('check')}
              <span>Save Note</span>
            </button>
          </div>
        </div>
      `;
    }

    function mount() {
      if (mounted) return;
      mounted = true;

      const backdrop = el('ll-study-drawer-backdrop');
      const body = el('ll-study-drawer-body');
      el('ll-study-close-btn')?.addEventListener('click', close);
      el('ll-study-back-btn')?.addEventListener('click', close);
      el('ll-study-prev-btn')?.addEventListener('click', () => step(-1));
      el('ll-study-next-btn')?.addEventListener('click', () => step(1));
      backdrop?.addEventListener('click', (e) => {
        if (e.target === backdrop) close();
      });
      body?.addEventListener('click', (e) => {
        deps.onAction?.(e);
      });

      if (body && global.FlaptapWordLookup?.bindSelectionLookup) {
        global.FlaptapWordLookup.bindSelectionLookup(body, {
          maxLength: 320,
          onSelect: (text, meta) => {
            const node = meta?.range?.startContainer;
            const element = node?.nodeType === 1 ? node : node?.parentElement;
            const word = element?.closest('.clickable-word');
            deps.onWordLookup?.(
              text,
              word?.dataset.contextSentence || text,
              word?.dataset.llItemId || store.state.activeStudyItemId || '',
              meta?.sourceEl || null,
            );
          },
        });
      }

      document.addEventListener('keydown', (e) => {
        if (!backdrop || backdrop.hidden) return;
        if (e.key === 'Escape') {
          close();
        } else if (!e.target.matches('input, textarea, select')) {
          if (e.key === 'ArrowLeft') step(-1);
          if (e.key === 'ArrowRight') step(1);
        }
      });
    }

    return {
      mount,
      open,
      close,
      renderIfOpen() {
        if (store.state.activeStudyItemId) render();
      },
    };
  }

  global.FlaptapGPStudyDrawer = { create };
})(window);
