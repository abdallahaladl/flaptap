/* ==========================================================================
   GENERATE PHRASES — CARD & EXAMPLE RENDERER (generate-phrases/card-renderer.js)
   Single responsibility: pure HTML generation for Phrase Cards (List + Cards),
   Example boxes with idiomatic translations, Reusable Pattern slot legends,
   and Skeleton placeholders. Zero direct event listeners or network calls.
   ========================================================================== */

(function (global) {
  'use strict';

  const U = () => global.FlaptapUtils;
  const PU = () => global.FlaptapPhraseUtils;
  const Store = () => global.FlaptapGPStore;

  function escapeHtml(val) {
    return U().escapeHtml(val);
  }

  function icon(name, options) {
    return global.FlaptapIcon ? global.FlaptapIcon(name, options) : '';
  }

  function renderSlotizedText(text) {
    return PU().formatSlotizedText(text, 'll-slot');
  }

  function getSpeakableText(item) {
    if (!item) return '';
    const expr = String(item.expression || '');
    if (PU().extractSlotNames(expr).length > 0 && item.spokenForm) {
      return String(item.spokenForm);
    }
    return expr;
  }

  function tokenizeExampleSentence(sentence, itemId, expression, spokenForm) {
    const highlighted = PU().highlightTermInSentence(sentence, [spokenForm, expression]);
    if (global.FlaptapWordLookup?.tokenizeClickableWords) {
      return global.FlaptapWordLookup.tokenizeClickableWords(highlighted, {
        contextSentence: sentence,
        llItemId: itemId,
      });
    }
    return highlighted;
  }

  function getPatternGuide(item) {
    if (!item) return null;
    const expressionSlots = PU().extractSlotNames(item.expression);
    if (expressionSlots.length > 0) {
      const stored = (Array.isArray(item.patternSlots) ? item.patternSlots : [])
        .filter((slot) => slot && String(slot.slot || '').trim())
        .map((slot) => ({
          slot: String(slot.slot).replace(/[[\]]/g, '').trim(),
          role: String(slot.role || '').trim(),
          example: String(slot.example || '').trim(),
        }));
      return {
        kind: 'slots',
        slots: expressionSlots.map((name) => {
          const match = stored.find((s) => PU().slotNamesMatch(s.slot, name));
          return {
            slot: name,
            role: match?.role || '',
            example: match?.example || '',
          };
        }),
      };
    }

    const usage = (Array.isArray(item.usagePatterns) ? item.usagePatterns : []).find(
      (pattern) =>
        pattern &&
        String(pattern.pattern || '').trim() &&
        String(pattern.pattern).replace(/\s+/g, ' ').trim().toLowerCase() !==
          String(item.expression || '').replace(/\s+/g, ' ').trim().toLowerCase(),
    );
    if (!usage) return null;
    return {
      kind: 'usage',
      pattern: String(usage.pattern).trim(),
      note: String(usage.meaning || '').trim(),
    };
  }

  function renderPatternGuideHtml(item, { stacked = false, onlySlots = false } = {}) {
    const guide = getPatternGuide(item);
    if (!guide) return '';
    if (guide.kind === 'usage' && onlySlots) return '';
    const heading = Store().getActiveDomain()?.uiLabels?.patternHeading || 'Reusable Pattern';
    const classes = `ll-pattern-guide${stacked ? ' is-stacked' : ''}${guide.kind === 'usage' ? ' is-usage' : ''}`;
    const label = `<span class="ll-pattern-guide-label">${escapeHtml(heading)}</span>`;

    if (guide.kind === 'usage') {
      return `<div class="${classes}" dir="ltr">
        ${label}
        <span class="ll-pattern-guide-formula">${renderSlotizedText(guide.pattern)}</span>
        ${guide.note ? `<span class="ll-pattern-guide-note">${escapeHtml(guide.note)}</span>` : ''}
      </div>`;
    }

    const chips = guide.slots
      .map(
        (slot) => `<span class="ll-slot-chip">
          <span class="ll-slot-chip-token" dir="ltr">[${escapeHtml(slot.slot)}]</span>
          ${slot.role ? `<span class="ll-slot-chip-role">${escapeHtml(slot.role)}</span>` : ''}
          ${slot.example ? `<span class="ll-slot-chip-example" dir="ltr">e.g. ${escapeHtml(slot.example)}</span>` : ''}
        </span>`,
      )
      .join('');

    return `<div class="${classes}" dir="ltr">
      ${label}
      <div class="ll-pattern-chips">${chips}</div>
    </div>`;
  }

  function renderCheckButton(checked, itemId, pillLabel) {
    if (global.FlaptapCheck?.buttonHtml) {
      return global.FlaptapCheck.buttonHtml({
        checked,
        pillLabel: pillLabel || '',
        attrs: `data-ll-toggle-complete="${escapeHtml(itemId)}"`,
      });
    }
    const cls = `item-check-btn${pillLabel ? ' item-check-btn--pill' : ''}${checked ? ' is-checked' : ''}`;
    return `<button type="button" class="${cls}" data-ll-toggle-complete="${escapeHtml(itemId)}" aria-pressed="${checked ? 'true' : 'false'}" aria-label="${checked ? 'Completed' : 'Mark phrase studied'}" title="${checked ? 'Completed' : 'Mark phrase studied'}"><svg class="ft-check-svg chk-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path class="ft-check-tick chk-tick" d="M5.2 12.75 L9.55 17.1 Q10.1 17.65 10.65 17.05 L18.9 7.35" pathLength="1" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>${pillLabel ? `<span>${escapeHtml(pillLabel)}</span>` : ''}</button>`;
  }

  function renderExampleBlock(ex, item, index = 0, options = {}) {
    const showNote = options.showNote !== false;
    const itemId = item?.id || '';
    const expr = item?.expression || '';
    const spoken = item?.spokenForm || '';
    const boxTypeClass = index === 0 ? 'll-box-context' : 'll-box-example';
    const prefixLabel = index === 0 ? 'In context' : 'Example';
    const ctxText = ex.speakerContext ? `${prefixLabel} · ${ex.speakerContext}` : prefixLabel;

    const activeLang = Store().getPreferredLanguage();
    const itemLang = String(item?.targetLanguage || activeLang || 'ar').toLowerCase();
    const isEnglishTarget = activeLang === 'en';
    const rtl = Store().isRtl(itemLang);
    const hasTranslation =
      !isEnglishTarget &&
      Boolean(ex.translation) &&
      String(ex.translation).trim() !== String(ex.sentence || '').trim();

    const translationHtml = hasTranslation
      ? PU().renderQuoteTranslationHtml(ex.translation, itemLang, rtl, {
          className: 'ft-quote-translation ll-quote-translation',
        })
      : !isEnglishTarget && options.showInlineTranslate && index === 0
        ? (() => {
            const busy = Store().state.translatingItemIds.has(itemId);
            return `<button type="button" class="ft-inline-translate-btn" data-ll-translate-item="${escapeHtml(
              itemId,
            )}" ${busy ? 'disabled' : ''} title="Translate example sentences">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 8 6 6"></path><path d="m4 14 6-6 2-3"></path><path d="M2 5h12"></path><path d="M7 2h1"></path><path d="m22 22-5-10-5 10"></path><path d="M14 18h6"></path></svg>
              <span>${busy ? 'Translating…' : 'Translate sentences'}</span>
            </button>`;
          })()
        : '';

    return `
      <div class="ll-card-box ${boxTypeClass}">
        <div class="ll-box-head">
          <span class="ll-sense-label" dir="ltr">${escapeHtml(ctxText)}</span>
          <button type="button" class="ll-mini-speak-btn" data-ll-speak="${escapeHtml(ex.sentence)}" title="Listen to example" aria-label="Listen to example">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            <span>Listen</span>
          </button>
        </div>
        <blockquote class="ll-context-quote" dir="ltr">“${tokenizeExampleSentence(ex.sentence, itemId, expr, spoken)}”</blockquote>
        ${translationHtml}
        ${showNote && ex.explanation ? `<p class="ll-example-note">${escapeHtml(ex.explanation)}</p>` : ''}
      </div>
    `;
  }

  function renderActionClusterHtml(item, { isDone, isSavedToVocab }) {
    const copyBtn = global.FlaptapCopy?.buttonHtml
      ? global.FlaptapCopy.buttonHtml(item.expression, {
          className: 'icon-action icon-action--sm ll-util-btn',
          label: `Copy ${item.expression}`,
        })
      : '';

    return `
      <div class="ll-item-actions">
        <div class="ll-action-utils">
          <button type="button" class="icon-action icon-action--sm ll-util-btn" data-ll-speak="${escapeHtml(
            getSpeakableText(item),
          )}" title="Pronounce (TTS)" aria-label="Pronounce ${escapeHtml(item.expression)}">
            ${icon('volume-2')}
          </button>
          ${copyBtn}
          <button type="button" class="icon-action icon-action--sm ll-util-btn${
            item.isFavorite ? ' is-favorite' : ''
          }" data-ll-toggle-fav="${escapeHtml(item.id)}" title="${
            item.isFavorite ? 'Favorited' : 'Favorite'
          }" aria-label="Toggle favorite">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${
              item.isFavorite ? 'currentColor' : 'none'
            }" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          </button>
          <button type="button" class="icon-action icon-action--sm ll-util-btn${
            isSavedToVocab ? ' is-saved' : ''
          }" data-ll-save-vocab="${escapeHtml(item.id)}" title="${
            isSavedToVocab ? 'In Flashcards' : 'Save to Flashcards'
          }" aria-label="${isSavedToVocab ? 'In Flashcards' : 'Save to Flashcards'}">
            ${icon(isSavedToVocab ? 'bookmark-check' : 'bookmark-plus')}
          </button>
          <button type="button" class="icon-action icon-action--sm ll-util-btn" data-ll-open-study="${escapeHtml(
            item.id,
          )}" title="Open deep study sheet" aria-label="Study ${escapeHtml(item.expression)}">
            ${icon('arrow-up-right')}
          </button>
          <button type="button" class="icon-action icon-action--sm ll-util-btn is-delete" data-ll-delete-item="${escapeHtml(
            item.id,
          )}" title="Delete expression" aria-label="Delete ${escapeHtml(item.expression)}">
            ${icon('trash')}
          </button>
        </div>
        <span class="ll-action-divider" aria-hidden="true"></span>
        ${renderCheckButton(isDone, item.id)}
      </div>
    `;
  }

  function renderHeadingBlockHtml(item, { isDone, isMasked }) {
    const showRegister = Store().isDistinctLabel(item.register, item.categoryLabel);
    const catTone = Store().getCategoryTone(item.categoryId);
    const goalLang = String(item.targetLanguage || Store().getPreferredLanguage() || 'ar').toLowerCase();
    const isEnglishTarget = Store().getPreferredLanguage() === 'en';
    const isRtl = Store().isRtl(goalLang);
    const showTranslation = !isEnglishTarget && Boolean(item.localizedMeaning);

    return `
      <div class="ll-item-heading">
        <div class="ll-item-line-1">
          <button type="button" class="ll-expr-title-btn" data-ll-open-study="${escapeHtml(
            item.id,
          )}" title="Open deep study sheet" aria-label="Study ${escapeHtml(item.expression)}">
            <h3 class="ll-expr-title" dir="ltr"><span class="ll-term-mark"><span class="ll-term-text">${renderSlotizedText(
              item.expression,
            )}</span></span></h3>
          </button>
          ${item.ipa ? `<span class="ll-expr-ipa ltr-num" dir="ltr">${escapeHtml(item.ipa)}</span>` : ''}
          <span class="ll-badge is-category" data-cat-tone="${escapeHtml(catTone)}">${escapeHtml(
            item.categoryLabel,
          )}</span>
          ${item.cefr ? `<span class="ll-badge is-level ltr-num">${escapeHtml(item.cefr)}</span>` : ''}
          ${showRegister ? `<span class="ll-badge is-register">${escapeHtml(item.register)}</span>` : ''}
          ${isDone ? '<span class="ll-item-done-tag">Studied</span>' : ''}
        </div>

        ${
          showTranslation
            ? `<div class="ll-item-line-2${isMasked ? ' is-masked' : ''}${isRtl ? ' is-rtl' : ''}"${
                isMasked
                  ? ` data-ll-reveal="${escapeHtml(item.id)}" role="button" tabindex="0" aria-label="Reveal translation for ${escapeHtml(
                      item.expression,
                    )}"`
                  : ''
              }>
                <p class="ll-head-translation" dir="${isRtl ? 'rtl' : 'ltr'}" lang="${escapeHtml(
                  goalLang,
                )}">${renderSlotizedText(item.localizedMeaning)}</p>
                ${isMasked ? '<span class="ll-recall-inline-hint">Click to reveal</span>' : ''}
              </div>`
            : ''
        }
      </div>
    `;
  }

  function renderItemHeaderHtml(item, opts) {
    const { sequenceNumber, isDone, isMasked, isSavedToVocab, compact = false } = opts;
    if (compact) {
      // Clean 2-part card header for 2-col Cards view: top strip (#N + compact actions) -> full-width title & translation
      return `
        <div class="ll-item-head ll-item-head--card">
          <div class="ll-card-topbar">
            <span class="ll-item-index ltr-num" title="Item ${sequenceNumber || 1}" aria-label="Item ${
              sequenceNumber || 1
            }"><span class="ll-index-hash">#</span>${sequenceNumber || '•'}</span>
            ${renderActionClusterHtml(item, { isDone, isSavedToVocab })}
          </div>
          ${renderHeadingBlockHtml(item, { isDone, isMasked })}
        </div>
      `;
    }

    return `
      <div class="ll-item-head">
        <span class="ll-item-index ltr-num" title="Item ${sequenceNumber || 1}" aria-label="Item ${
          sequenceNumber || 1
        }"><span class="ll-index-hash">#</span>${sequenceNumber || '•'}</span>
        ${renderHeadingBlockHtml(item, { isDone, isMasked })}
        ${renderActionClusterHtml(item, { isDone, isSavedToVocab })}
      </div>
    `;
  }

  function renderItemBodyBoxesHtml(item, isMasked, { compact = false } = {}) {
    const examples = (Array.isArray(item.examples) ? item.examples : []).slice(0, 2);
    const patternHtml = renderPatternGuideHtml(item);
    const showSpoken = Store().isDistinctLabel(item.spokenForm, item.expression);
    const missingAnySentenceTranslation = Store().hasMissingSentenceTranslations(item);

    const row1Boxes = examples.map((ex, idx) =>
      renderExampleBlock(ex, item, idx, {
        showNote: true,
        showInlineTranslate: missingAnySentenceTranslation,
      }),
    );

    const meaningBox = `
      <div class="ll-card-box ll-box-meaning ll-meaning-block${isMasked ? ' is-masked' : ''}"${
        isMasked
          ? ` data-ll-reveal="${escapeHtml(item.id)}" role="button" tabindex="0" aria-label="Reveal meaning for ${escapeHtml(
              item.expression,
            )}"`
          : ''
      }>
        ${
          isMasked
            ? `<button type="button" class="ll-recall-veil ll-recall-reveal-btn" data-ll-reveal="${escapeHtml(
                item.id,
              )}"><span>Click to reveal meaning</span></button>`
            : ''
        }
        <span class="ll-sense-label">Meaning</span>
        <div class="ll-meaning-body">
          <p class="ll-core-meaning">${escapeHtml(item.coreMeaning)}</p>
          ${
            item.textbookEquivalent
              ? `<p class="ll-general-sense"><span class="ll-inline-label">Instead of</span><span class="ll-textbook-inline">${escapeHtml(
                  item.textbookEquivalent,
                )}</span></p>`
              : ''
          }
        </div>
      </div>
    `;

    const usageCopy = item.nativeContext || item.mistakesToAvoid || '';
    const usageBox =
      patternHtml || usageCopy
        ? `<div class="ll-card-box ll-box-usage">
             <span class="ll-sense-label">Usage</span>
             ${patternHtml}
             ${usageCopy ? `<p class="ll-note-copy">${escapeHtml(usageCopy)}</p>` : ''}
           </div>`
        : '';

    const spokenBox =
      item.phoneticBreakdown || showSpoken
        ? `<div class="ll-card-box ll-box-spoken">
             <span class="ll-sense-label">Spoken tip</span>
             ${
               showSpoken
                 ? `<p class="ll-spoken-callout" dir="ltr"><span class="ll-inline-label">Say it</span><strong>${escapeHtml(
                     item.spokenForm,
                   )}</strong></p>`
                 : ''
             }
             ${item.phoneticBreakdown ? `<p class="ll-note-copy">${escapeHtml(item.phoneticBreakdown)}</p>` : ''}
           </div>`
        : '';

    const row2Boxes = [meaningBox, usageBox, spokenBox].filter(Boolean);

    return `
      <div class="ll-item-body">
        ${
          row1Boxes.length
            ? `<div class="ll-box-row ll-row-quotes" data-cols="${compact ? 1 : row1Boxes.length}">${row1Boxes.join(
                '',
              )}</div>`
            : ''
        }
        ${
          row2Boxes.length
            ? `<div class="ll-box-row ll-row-insights" data-cols="${compact ? 1 : row2Boxes.length}">${row2Boxes.join(
                '',
              )}</div>`
            : ''
        }
      </div>
    `;
  }

  function renderCardArticleHtml(item, idx = 0) {
    const s = Store().state;
    const isDone = Boolean(item.isCompleted);
    const isMasked = Boolean(s.recallMaskMode && !s.revealedCardIds.has(item.id));
    const isJustGenerated = s.justGeneratedIds.has(item.id);
    const isSavedToVocab = Boolean(
      Store().ws()?.isVocabularySaved && Store().ws().isVocabularySaved(item.expression),
    );
    const sequenceNumber = Number(item.sequenceNumber) > 0 ? Number(item.sequenceNumber) : 0;
    const catTone = Store().getCategoryTone(item.categoryId);

    return `
      <article class="ll-card ll-item-surface ft-item-surface${isDone ? ' is-item-completed' : ''}${
        isJustGenerated ? ' is-just-generated' : ''
      }${isMasked ? ' is-recall-masked' : ''}" data-ll-card-id="${escapeHtml(
        item.id,
      )}" data-cat-tone="${escapeHtml(catTone)}" style="--ft-stagger: ${Math.min(idx, 7)}">
        ${renderItemHeaderHtml(item, { sequenceNumber, isDone, isMasked, isSavedToVocab, compact: true })}
        ${renderItemBodyBoxesHtml(item, isMasked, { compact: true })}
      </article>
    `;
  }

  function renderListTableHtml(items) {
    const s = Store().state;
    return `
      <div class="ll-table-wrap">
        <table class="ll-table">
          <thead class="visually-hidden">
            <tr>
              <th class="ll-col-expression">Expression, meaning &amp; examples</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((item, idx) => {
                const isDone = Boolean(item.isCompleted);
                const isMasked = Boolean(s.recallMaskMode && !s.revealedCardIds.has(item.id));
                const isJustGenerated = s.justGeneratedIds.has(item.id);
                const isSavedToVocab = Boolean(
                  Store().ws()?.isVocabularySaved && Store().ws().isVocabularySaved(item.expression),
                );
                const sequenceNumber = Number(item.sequenceNumber) > 0 ? Number(item.sequenceNumber) : 0;
                const catTone = Store().getCategoryTone(item.categoryId);

                return `
                  <tr class="ll-item-row ll-item-surface ft-item-surface${isDone ? ' is-item-completed' : ''}${
                    isJustGenerated ? ' is-just-generated' : ''
                  }${isMasked ? ' is-recall-masked' : ''}" data-ll-row-id="${escapeHtml(
                    item.id,
                  )}" data-cat-tone="${escapeHtml(catTone)}" style="--ft-stagger: ${Math.min(idx, 7)}">
                    <td class="ll-cell-bento">
                      ${renderItemHeaderHtml(item, { sequenceNumber, isDone, isMasked, isSavedToVocab, compact: false })}
                      ${renderItemBodyBoxesHtml(item, isMasked, { compact: false })}
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderSkeletonsHtml(isCardsMode) {
    const count = isCardsMode ? 4 : 3;
    const bottomCount = isCardsMode ? 2 : 3;
    const cards = Array.from({ length: count }, (_, idx) => {
      const bottomBoxes = Array.from({ length: bottomCount }, () => `
        <div class="ll-skel-box">
          <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--kicker"></span>
          <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--line"></span>
          <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--line-short"></span>
        </div>
      `).join('');

      return `
        <div class="ll-skeleton-card ft-skeleton-item" aria-hidden="true" style="--ft-stagger: ${Math.min(idx, 4)}">
          <div class="ll-skel-head">
            <div class="ll-skel-head-left">
              <div class="ll-skel-title-row">
                <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--index"></span>
                <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--title"></span>
              </div>
              <div class="ll-skel-pills-row">
                <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--pill"></span>
                <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--pill-sm"></span>
              </div>
            </div>
            <div class="ll-skel-actions">
              <span class="ll-skel-circle ft-skel-shimmer"></span>
              <span class="ll-skel-circle ft-skel-shimmer"></span>
              <span class="ll-skel-circle ft-skel-shimmer"></span>
            </div>
          </div>
          <div class="ll-skel-bento-top">
            <div class="ll-skel-box">
              <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--kicker"></span>
              <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--line"></span>
            </div>
            <div class="ll-skel-box">
              <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--kicker"></span>
              <span class="ll-skel-bar ft-skel-shimmer ll-skel-bar--line"></span>
            </div>
          </div>
          <div class="ll-skel-bento-bottom">${bottomBoxes}</div>
        </div>
      `;
    }).join('');

    return isCardsMode
      ? `<div class="ll-cards-grid">${cards}</div>`
      : `<div class="ll-skeleton-list">${cards}</div>`;
  }

  global.FlaptapGPCardRenderer = {
    renderSlotizedText,
    getSpeakableText,
    tokenizeExampleSentence,
    getPatternGuide,
    renderPatternGuideHtml,
    renderCheckButton,
    renderExampleBlock,
    renderCardArticleHtml,
    renderListTableHtml,
    renderSkeletonsHtml,
  };
})(window);
