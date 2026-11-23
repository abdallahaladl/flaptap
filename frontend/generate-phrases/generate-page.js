/* ==========================================================================
   GENERATE PHRASES — PAGE 1: GENERATE STUDIO (generate-phrases/generate-page.js)
   Isolated Page 1 (/library):
   - Domain switcher inside Studio Card topbar (matching Link/Text/File in A2P)
   - Full-width Topic Focus input + Batch Size presets
   - Smart Defaults (Translate Language + Learner Level CEFR) + Fine-tune drawer
   - Unified FlaptapAiSelector + bottom-right primary Generate CTA
   - 4-stage live SSE streaming progress card + live expression chips
   - Recent Expressions 3-card preview strip + Open Library link
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
      aiSelector: null,
      abortController: null,
      elapsedTimer: null,
      streamingItems: [],
      fineTuneOpen: false,
      unsubs: [],
    };

    function el(id) {
      return document.getElementById(id);
    }

    function icon(name, options) {
      return global.FlaptapIcon ? global.FlaptapIcon(name, options) : '';
    }

    function showToast(msg) {
      U.showToast(msg);
    }

    /* --------------------------------------------------------------------
       PREFERENCES, DOMAIN TABS & FINE-TUNE PROGRESSIVE DISCLOSURE
       -------------------------------------------------------------------- */

    function renderDomainTabs() {
      const container = el('ll-domain-pills');
      if (!container) return;
      const domainIcon = (id) =>
        id === 'programming_terminology'
          ? 'file-code'
          : id === 'technical_vocabulary'
            ? 'type'
            : 'graduation-cap';

      container.innerHTML = store.state.domains
        .map((d) => {
          const active = d.id === store.state.activeDomainId;
          return `<button type="button" class="linguist-tab-btn${active ? ' active' : ''}" data-ll-domain="${escapeHtml(
            d.id,
          )}" role="tab" aria-selected="${active ? 'true' : 'false'}">${icon(domainIcon(d.id))}<span>${escapeHtml(
            d.title,
          )}</span></button>`;
        })
        .join('');
    }

    function renderDomainContext() {
      const domain = store.getActiveDomain();
      if (!domain) return;

      const subcopyEl = el('ll-domain-subcopy');
      const capHintEl = el('ll-source-cap-hint');
      const focusInput = el('ll-focus-topic-input');

      if (subcopyEl) {
        subcopyEl.textContent = domain.subtitle;
      }
      if (capHintEl) {
        const catCount = Array.isArray(domain.categories) ? domain.categories.length : 8;
        const regCount = Array.isArray(domain.registers) ? domain.registers.length : 5;
        capHintEl.textContent = `${catCount} categories · ${regCount} registers · IPA & sentence translations`;
      }
      if (focusInput && domain.suggestedFocusTopics?.length) {
        focusInput.placeholder = `Optional situation or topic (e.g. ${domain.suggestedFocusTopics[0]})`;
      }

      renderCountControls();
      renderGenSelects();
      syncGenerateButtonLabel();
      syncFineTuneBadge();
    }

    function renderCountControls() {
      const pillsWrap = el('ll-count-pills');
      const inputEl = el('ll-count-input');
      if (pillsWrap) {
        pillsWrap.innerHTML = store.PRESET_COUNTS.map((num) => {
          const active = Number(store.state.requestedCount) === num;
          return `<button type="button" class="ll-count-pill${active ? ' active' : ''}" data-ll-count="${num}" aria-pressed="${
            active ? 'true' : 'false'
          }">${num}</button>`;
        }).join('');
      }
      if (inputEl) {
        inputEl.value = String(store.state.requestedCount);
      }
    }

    function populateLanguagesSelect() {
      const sel = el('ll-target-lang-select');
      if (!sel) return;
      const langs = store.languages();
      const preferred = store.getPreferredLanguage();
      sel.innerHTML = langs
        .map(
          (l) =>
            `<option value="${escapeHtml(l.code)}">${escapeHtml(l.name)} (${escapeHtml(
              l.native,
            )})</option>`,
        )
        .join('');
      sel.value = langs.some((l) => l.code === preferred) ? preferred : langs[0]?.code || 'ar';
    }

    function renderGenSelects() {
      const domain = store.getActiveDomain();

      const levelSel = el('ll-gen-level-select');
      if (levelSel) {
        levelSel.innerHTML = (store.state.levels || [])
          .map((lv) => `<option value="${escapeHtml(lv.id)}">${escapeHtml(lv.label)}</option>`)
          .join('');
        levelSel.value = store.state.genLevel || 'all';
      }

      const goalSel = el('ll-gen-goal-select');
      if (goalSel) {
        goalSel.innerHTML = (store.state.studyGoals || [])
          .map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.label)}</option>`)
          .join('');
        goalSel.value = store.state.genStudyGoal || 'full';
      }

      const catSel = el('ll-gen-category-select');
      if (catSel && domain) {
        catSel.innerHTML =
          `<option value="all">All Categories</option>` +
          domain.categories
            .map((cat) => `<option value="${escapeHtml(cat.id)}">${escapeHtml(cat.label)}</option>`)
            .join('');
        catSel.value = store.state.genCategoryId || 'all';
      }

      const regSel = el('ll-register-select');
      if (regSel && domain) {
        regSel.innerHTML =
          `<option value="">Any Register</option>` +
          domain.registers
            .map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`)
            .join('');
        regSel.value = store.state.genRegister || '';
      }
    }

    function syncFineTuneBadge() {
      let overrides = 0;
      if (store.state.genCategoryId && store.state.genCategoryId !== 'all') overrides++;
      if (store.state.genRegister) overrides++;
      if (store.state.genStudyGoal && store.state.genStudyGoal !== 'full') overrides++;

      const countEl = el('ll-custom-count');
      const resetBtn = el('ll-reset-options-btn');
      if (countEl) {
        countEl.textContent = String(overrides);
        countEl.hidden = overrides === 0;
      }
      if (resetBtn) {
        resetBtn.hidden = overrides === 0 && (store.state.genLevel || 'all') === 'all';
      }
    }

    function setFineTuneOpen(open) {
      local.fineTuneOpen = Boolean(open);
      const panel = el('ll-advanced-options');
      const toggle = el('ll-options-toggle');
      if (panel) panel.classList.toggle('is-open', local.fineTuneOpen);
      if (toggle) toggle.setAttribute('aria-expanded', local.fineTuneOpen ? 'true' : 'false');
    }

    function resetPreferences() {
      store.state.genCategoryId = 'all';
      store.state.genRegister = '';
      store.state.genLevel = 'all';
      store.state.genStudyGoal = 'full';
      store.saveGenPrefs();
      renderGenSelects();
      syncFineTuneBadge();
      showToast('Study preferences reset to defaults');
    }

    function syncGenerateButtonLabel() {
      const domain = store.getActiveDomain();
      const noun =
        store.state.requestedCount === 1
          ? domain?.itemNounSingular || 'expression'
          : domain?.itemNounPlural || 'expressions';
      const lbl = el('ll-generate-btn-label');
      if (lbl) lbl.textContent = `Generate ${store.state.requestedCount} ${store.capitalize(noun)}`;
    }

    function mountAiSelector() {
      if (local.aiSelector || !global.FlaptapAiSelector) return;
      const mount = el('ll-ai-selector-mount');
      if (!mount) return;
      local.aiSelector = global.FlaptapAiSelector.create({
        container: mount,
        idPrefix: 'll-aisel',
        persistenceKey: 'learning_library',
        title: 'AI Model',
        compact: true,
        showRunButton: false,
        hideMetaChips: true,
        fetcher: api.apiFetch,
        onToast: showToast,
      });
    }

    /* --------------------------------------------------------------------
       RECENT EXPRESSIONS SHELF (Page 1 Preview Strip, mirrors A2P Recent Guides)
       -------------------------------------------------------------------- */

    function renderRecentShelf() {
      const row = el('ll-recent-row');
      const empty = el('ll-empty-recent');
      const totalBadge = el('ll-recent-total');
      if (!row) return;

      const signedIn = Boolean(store.currentUser());
      const items = signedIn ? (store.state.recentItems || []).slice(0, 6) : [];
      const total = signedIn ? Number(store.state.stats?.totalItems) || items.length : 0;
      if (totalBadge) totalBadge.textContent = String(total);

      if (!signedIn || items.length === 0) {
        row.innerHTML = '';
        if (empty) {
          empty.hidden = false;
          const p = empty.querySelector('p');
          if (p) {
            p.textContent = signedIn
              ? 'Your generated American phrases will appear here for one-click study.'
              : 'Sign in and generate phrases to build your permanent spoken American library.';
          }
        }
        return;
      }

      if (empty) empty.hidden = true;
      const isEnglishTarget = store.getPreferredLanguage() === 'en';
      row.innerHTML = items
        .map((item) => {
          const isDone = Boolean(item.isCompleted);
          const lang = String(item.targetLanguage || 'ar').toLowerCase();
          const rtl = store.isRtl(lang);
          const tone = store.getCategoryTone(item.categoryId);
          return `
            <article class="ll-recent-card" data-state="${isDone ? 'done' : 'new'}" data-ll-open-study="${escapeHtml(
              item.id,
            )}" tabindex="0" role="button" aria-label="Study ${escapeHtml(item.expression)}">
              <div class="ll-recent-card-top">
                <span class="ll-badge is-category" data-cat-tone="${escapeHtml(tone)}">${escapeHtml(
                  item.categoryLabel || 'Phrase',
                )}</span>
                ${
                  isDone
                    ? '<span class="sp-state sp-state--done">Studied</span>'
                    : item.cefr
                      ? `<span class="ll-badge is-level ltr-num">${escapeHtml(item.cefr)}</span>`
                      : ''
                }
              </div>
              <h3 class="ll-recent-card-title" dir="ltr">${global.FlaptapGPCardRenderer.renderSlotizedText(
                item.expression,
              )}</h3>
              ${
                !isEnglishTarget && item.localizedMeaning
                  ? `<p class="ll-recent-card-trans" dir="${rtl ? 'rtl' : 'ltr'}" lang="${escapeHtml(
                      lang,
                    )}">${global.FlaptapGPCardRenderer.renderSlotizedText(item.localizedMeaning)}</p>`
                  : `<p class="ll-recent-card-meaning">${escapeHtml(item.coreMeaning || '')}</p>`
              }
              <div class="ll-recent-card-foot">
                <span class="ll-recent-ipa ltr-num" dir="ltr">${escapeHtml(item.ipa || item.register || '')}</span>
                <span class="ll-recent-cta">${isDone ? 'Review' : 'Study'}</span>
              </div>
            </article>
          `;
        })
        .join('');
    }

    /* --------------------------------------------------------------------
       GENERATION EXECUTION & 4-STAGE SSE PROGRESS
       -------------------------------------------------------------------- */

    function collectPayload() {
      const focusInput = el('ll-focus-topic-input');
      const langSelect = el('ll-target-lang-select');
      const regSelect = el('ll-register-select');
      const catSelect = el('ll-gen-category-select');
      const levelSelect = el('ll-gen-level-select');
      const goalSelect = el('ll-gen-goal-select');
      const aiSel = local.aiSelector
        ? local.aiSelector.getSelection()
        : { keyId: '', model: '', variant: '' };

      return {
        domainId: store.state.activeDomainId,
        count: store.state.requestedCount,
        categoryId: catSelect?.value || store.state.genCategoryId || 'all',
        focusTopic: (focusInput?.value || store.state.focusTopic || '').trim(),
        register: (regSelect?.value || store.state.genRegister || '').trim(),
        level: (levelSelect?.value || store.state.genLevel || 'all').trim(),
        studyGoal: (goalSelect?.value || store.state.genStudyGoal || 'full').trim(),
        targetLanguage: langSelect?.value || store.getPreferredLanguage() || 'ar',
        keyId: aiSel.keyId || undefined,
        model: aiSel.model || undefined,
        variant: aiSel.variant || undefined,
      };
    }

    function showGenError(title, msg, canRetry) {
      const box = el('ll-inline-error');
      const tEl = el('ll-inline-err-title');
      const mEl = el('ll-inline-err-msg');
      const retryBtn = el('ll-btn-err-retry');
      if (box && tEl && mEl) {
        tEl.textContent = title || 'Generation Error';
        mEl.textContent = msg || 'Unable to generate expressions.';
        if (retryBtn) retryBtn.hidden = !canRetry;
        box.hidden = false;
      }
    }

    function hideGenError() {
      const box = el('ll-inline-error');
      if (box) box.hidden = true;
    }

    function setProgressStep(activeStep) {
      for (let i = 1; i <= 4; i++) {
        const node = el(`ll-step-${i}`);
        if (!node) continue;
        node.classList.toggle('is-done', i < activeStep);
        node.classList.toggle('is-active', i === activeStep);
      }
    }

    function setProgressUi(pct, counterText, titleText, subText, stepNum) {
      const fill = el('ll-progress-fill');
      const roleEl = el('ll-progress-bar-role');
      const counterEl = el('ll-progress-counter');
      const titleEl = el('ll-progress-title');
      const subEl = el('ll-progress-sub');

      const safePct = Math.max(4, Math.min(100, Math.round(pct)));
      if (fill) fill.style.width = `${safePct}%`;
      if (roleEl) roleEl.setAttribute('aria-valuenow', String(safePct));
      if (counterEl && counterText !== undefined) counterEl.textContent = counterText;
      if (titleEl && titleText !== undefined) titleEl.textContent = titleText;
      if (subEl && subText !== undefined) subEl.textContent = subText;
      if (stepNum) setProgressStep(stepNum);
    }

    function cancelGeneration() {
      if (local.abortController) {
        local.abortController.abort();
      }
    }

    async function handleGenerateClick() {
      const payload = collectPayload();
      if (store.ws()?.requireAuthBeforeAction) {
        const ok = store.ws().requireAuthBeforeAction(
          { type: 'learning_library_generate', payload },
          'Sign in or create an account to generate and permanently save expressions in Generate Phrases.',
        );
        if (!ok) return;
      }
      await executeGeneration(payload);
    }

    async function resumePending(payload) {
      if (!payload) return;
      if (payload.domainId && store.state.domains.some((d) => d.id === payload.domainId)) {
        store.state.activeDomainId = payload.domainId;
        renderDomainTabs();
        renderDomainContext();
      }
      if (payload.count) {
        store.state.requestedCount = Math.max(1, Math.min(25, Number(payload.count) || 8));
        renderCountControls();
      }
      if (payload.categoryId) store.state.genCategoryId = payload.categoryId;
      if (payload.level) store.state.genLevel = payload.level;
      if (payload.studyGoal) store.state.genStudyGoal = payload.studyGoal;
      renderGenSelects();
      syncFineTuneBadge();

      const focusInput = el('ll-focus-topic-input');
      if (focusInput && typeof payload.focusTopic === 'string') {
        focusInput.value = payload.focusTopic;
      }
      if (payload.targetLanguage) {
        store.setPreferredLanguage(payload.targetLanguage);
        populateLanguagesSelect();
      }
      if (local.aiSelector && (payload.keyId || payload.model || payload.variant)) {
        await local.aiSelector.setSelection({
          keyId: payload.keyId,
          model: payload.model,
          variant: payload.variant,
        });
      }
      syncGenerateButtonLabel();
      await executeGeneration(payload);
    }

    async function executeGeneration(payload) {
      if (store.state.isGenerating) return;
      hideGenError();

      const countVal = Number(payload.count) || store.state.requestedCount;
      if (countVal < 1 || countVal > 25) {
        showGenError('Invalid Item Count', 'Choose between 1 and 25 items per generation.', false);
        return;
      }

      store.state.isGenerating = true;
      local.streamingItems = [];
      store.state.justGeneratedIds.clear();
      const ac = new AbortController();
      local.abortController = ac;

      const progressCard = el('ll-progress-card');
      const elapsedEl = el('ll-progress-elapsed');
      const liveEl = el('ll-progress-live');
      const genBtn = el('ll-generate-btn');
      let liveCount = 0;

      const resetLiveStrip = () => {
        liveCount = 0;
        if (liveEl) {
          liveEl.innerHTML = '';
          liveEl.hidden = true;
        }
      };

      const appendLiveChip = (item) => {
        if (!liveEl || !item) return;
        liveCount += 1;
        const shown = liveEl.querySelectorAll('.ll-progress-live-chip').length;
        if (shown >= 10) {
          let more = liveEl.querySelector('.ll-progress-live-more');
          if (!more) {
            more = document.createElement('span');
            more.className = 'll-progress-live-chip ll-progress-live-more';
            liveEl.appendChild(more);
          }
          more.textContent = `+${liveCount - 10} more`;
          return;
        }
        const chip = document.createElement('span');
        chip.className = 'll-progress-live-chip';
        const index = document.createElement('span');
        index.className = 'll-live-index ltr-num';
        index.textContent = String(liveCount);
        chip.appendChild(index);
        chip.appendChild(document.createTextNode(item.expression || ''));
        liveEl.appendChild(chip);
        liveEl.hidden = false;
      };

      resetLiveStrip();
      const startTime = Date.now();
      clearInterval(local.elapsedTimer);
      local.elapsedTimer = setInterval(() => {
        if (elapsedEl) {
          elapsedEl.textContent = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
        }
      }, 100);

      if (progressCard) progressCard.hidden = false;
      if (genBtn) genBtn.disabled = true;
      local.aiSelector?.setDisabled(true);
      if (elapsedEl) elapsedEl.textContent = '0.0s';

      const sel = local.aiSelector?.getSelection() || {};
      const providerName = sel.providerName || 'AI Provider';
      const modelName = payload.model || sel.model || 'auto';
      setProgressUi(
        8,
        `0 / ${countVal} saved`,
        `Generating ${countVal} unique expressions via ${providerName}…`,
        `Checking against ${store.state.stats.totalItems || 0} saved items to prevent duplicates.`,
        1,
      );

      let completedResult = null;
      let streamError = null;

      try {
        await api.generateStream(payload, ac.signal, (eventName, ev) => {
          if (eventName === 'started') {
            resetLiveStrip();
            setProgressUi(
              14,
              `0 / ${ev.requestedCount || countVal} saved`,
              `Authoring expressions with ${ev.provider || providerName} (${ev.model || modelName})…`,
              'Crafting reusable [X] frames, IPA, spoken mechanics, and translated examples.',
              2,
            );
            return;
          }

          if (eventName === 'chunk') {
            const fresh = Array.isArray(ev.newItems) ? ev.newItems : [];
            for (const item of fresh) {
              store.state.justGeneratedIds.add(item.id);
              local.streamingItems.push(item);
              appendLiveChip(item);
            }
            const targetCount = ev.requestedCount || countVal;
            const pct = Math.max(18, Math.min(96, Math.round((ev.totalSavedCount / targetCount) * 100)));
            setProgressUi(
              pct,
              `${ev.totalSavedCount} / ${targetCount} saved`,
              `Saved ${ev.totalSavedCount} of ${targetCount} expressions…`,
              ev.totalSavedCount >= targetCount
                ? 'All passes complete — opening your Library.'
                : 'Streaming live · each expression & translated sentence saves immediately.',
              ev.totalSavedCount >= targetCount ? 4 : 3,
            );
            return;
          }

          if (eventName === 'complete') {
            completedResult = ev;
            return;
          }

          if (eventName === 'error') {
            streamError = new Error(ev?.message || 'Generation stream failed.');
          }
        });

        if (streamError) throw streamError;

        if (completedResult) {
          const fulfilled = Number(completedResult.fulfilledCount) || 0;
          const requested = Number(completedResult.requestedCount) || countVal;
          setProgressUi(100, `${fulfilled} / ${requested} saved`, 'Completed!', 'Opening your Library…', 4);
          await nav.onGenerationComplete(completedResult);
        }
      } catch (err) {
        if (err?.name === 'AbortError' || ac.signal.aborted) {
          if (local.streamingItems.length > 0) {
            await deps.reloadSnapshot?.();
            showToast(`Stopped · ${local.streamingItems.length} generated items saved.`);
          } else {
            showToast('Generation cancelled.');
          }
          return;
        }
        if (err?.status === 401 && store.ws()?.requireAuthBeforeAction) {
          store.ws().requireAuthBeforeAction({ type: 'learning_library_generate', payload });
          return;
        }
        showGenError(
          `${providerName} Generation Error`,
          err?.message || 'Unexpected error while generating expressions.',
          true,
        );
      } finally {
        clearInterval(local.elapsedTimer);
        local.elapsedTimer = null;
        local.abortController = null;
        store.state.isGenerating = false;
        resetLiveStrip();
        if (progressCard) progressCard.hidden = true;
        if (genBtn) genBtn.disabled = false;
        local.aiSelector?.setDisabled(false);
      }
    }

    /* --------------------------------------------------------------------
       EVENTS & LIFECYCLE
       -------------------------------------------------------------------- */

    function syncFocusClearBtn() {
      const input = el('ll-focus-topic-input');
      const clearBtn = el('ll-focus-clear-btn');
      if (clearBtn) clearBtn.hidden = !String(input?.value || '').trim();
    }

    function bindEvents() {
      el('ll-generate-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        handleGenerateClick();
      });

      el('ll-generate-btn')?.addEventListener('click', (e) => {
        if (e.currentTarget?.type !== 'submit') {
          e.preventDefault();
          handleGenerateClick();
        }
      });

      el('ll-domain-pills')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-ll-domain]');
        if (!btn) return;
        const nextDomain = btn.getAttribute('data-ll-domain');
        if (nextDomain && nextDomain !== store.state.activeDomainId) {
          nav.switchDomain(nextDomain);
        }
      });

      el('ll-count-pills')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-ll-count]');
        if (!btn) return;
        const num = Math.max(1, Math.min(25, Number(btn.getAttribute('data-ll-count')) || 8));
        store.state.requestedCount = num;
        renderCountControls();
        syncGenerateButtonLabel();
      });

      const countInputEl = el('ll-count-input');
      countInputEl?.addEventListener('input', (e) => {
        const raw = Number(e.target.value);
        if (Number.isFinite(raw) && raw >= 1 && raw <= 25) {
          store.state.requestedCount = Math.round(raw);
          document.querySelectorAll('.ll-count-pill').forEach((p) => {
            p.classList.toggle('active', Number(p.dataset.llCount) === store.state.requestedCount);
          });
          syncGenerateButtonLabel();
        }
      });
      countInputEl?.addEventListener('change', (e) => {
        store.state.requestedCount = Math.max(1, Math.min(25, Math.round(Number(e.target.value) || 8)));
        renderCountControls();
        syncGenerateButtonLabel();
      });

      const focusInput = el('ll-focus-topic-input');
      focusInput?.addEventListener('input', (e) => {
        store.state.focusTopic = e.target.value || '';
        syncFocusClearBtn();
      });
      el('ll-focus-clear-btn')?.addEventListener('click', () => {
        if (focusInput) {
          focusInput.value = '';
          focusInput.focus();
        }
        store.state.focusTopic = '';
        syncFocusClearBtn();
      });

      el('ll-target-lang-select')?.addEventListener('change', (e) => {
        store.setPreferredLanguage(e.target.value || 'ar');
      });
      el('ll-gen-level-select')?.addEventListener('change', (e) => {
        store.state.genLevel = e.target.value || 'all';
        store.saveGenPrefs();
        syncFineTuneBadge();
      });
      el('ll-gen-category-select')?.addEventListener('change', (e) => {
        store.state.genCategoryId = e.target.value || 'all';
        syncFineTuneBadge();
      });
      el('ll-register-select')?.addEventListener('change', (e) => {
        store.state.genRegister = e.target.value || '';
        syncFineTuneBadge();
      });
      el('ll-gen-goal-select')?.addEventListener('change', (e) => {
        store.state.genStudyGoal = e.target.value || 'full';
        store.saveGenPrefs();
        syncFineTuneBadge();
      });

      el('ll-options-toggle')?.addEventListener('click', () => setFineTuneOpen(!local.fineTuneOpen));
      el('ll-reset-options-btn')?.addEventListener('click', resetPreferences);

      el('ll-cancel-btn')?.addEventListener('click', cancelGeneration);
      el('ll-btn-err-dismiss')?.addEventListener('click', hideGenError);
      el('ll-btn-err-retry')?.addEventListener('click', () => {
        hideGenError();
        handleGenerateClick();
      });

      el('ll-jump-library')?.addEventListener('click', () => nav.goToLibrary());

      const recentRow = el('ll-recent-row');
      recentRow?.addEventListener('click', (e) => {
        const card = e.target.closest('[data-ll-open-study]');
        if (!card) return;
        nav.openStudyDrawer(card.getAttribute('data-ll-open-study'));
      });
      recentRow?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const card = e.target.closest('[data-ll-open-study]');
        if (!card) return;
        e.preventDefault();
        nav.openStudyDrawer(card.getAttribute('data-ll-open-study'));
      });
    }

    async function mount() {
      if (local.mounted) return;
      local.mounted = true;
      bindEvents();
      mountAiSelector();
      populateLanguagesSelect();
      renderCountControls();
      renderGenSelects();
      syncGenerateButtonLabel();
      syncFineTuneBadge();
      renderRecentShelf();

      local.unsubs.push(
        store.subscribe('domains:loaded', () => {
          renderDomainTabs();
          renderDomainContext();
        }),
        store.subscribe('domain:changed', () => {
          renderDomainTabs();
          renderDomainContext();
          renderRecentShelf();
        }),
        store.subscribe('stats:changed', renderRecentShelf),
        store.subscribe('item:updated', renderRecentShelf),
        store.subscribe('language:changed', () => {
          populateLanguagesSelect();
          renderRecentShelf();
        }),
      );

      if (local.aiSelector) {
        await local.aiSelector.init();
      }
    }

    function onActivate(options = {}) {
      renderDomainTabs();
      renderDomainContext();
      renderRecentShelf();
      if (options?.focusInput) {
        el('ll-focus-topic-input')?.focus();
      }
    }

    return {
      mount,
      onActivate,
      resumePending,
      onLanguagesLoaded: populateLanguagesSelect,
      renderDomainContext,
      renderRecentShelf,
    };
  }

  global.FlaptapGPGeneratePage = { create };
})(window);
