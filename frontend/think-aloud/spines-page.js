/* ==========================================================================
   THINK ALOUD — INTERACTIVE THINKING SPINES PLAYBOOK (think-aloud/spines-page.js)
   Combinatorial Starter + Engine + Tail builder + custom AI Spine Packs.
   ========================================================================== */

(function (global) {
  'use strict';

  function create({ store, api, nav }) {
    const U = global.FlaptapUtils;
    const esc = U.escapeHtml;
    const el = (id) => document.getElementById(id);

    const local = {
      mounted: false,
      aiSelector: null,
      starterIdx: 0,
      engineIdx: 0,
      tailIdx: 0,
      customTopic: '',
      customDomain: 'programming_ai',
    };

    function showToast(msg, isErr) {
      store.ws()?.showToast?.(msg, isErr);
    }

    function activePack() {
      const packs = store.state.spinePacks || [];
      return packs.find((p) => p.id === store.state.selectedPackId) || packs[0] || null;
    }

    function mountAiSelector() {
      if (local.aiSelector || !global.FlaptapAiSelector) return;
      const mount = el('ta-spine-ai-mount');
      if (!mount) return;
      local.aiSelector = global.FlaptapAiSelector.create({
        container: mount,
        idPrefix: 'ta-sp-aisel',
        persistenceKey: 'think_aloud_spines',
        title: 'AI Model',
        compact: true,
        showRunButton: false,
        hideMetaChips: true,
        fetcher: api.apiFetch,
        onToast: showToast,
      });
      local.aiSelector.init?.();
    }

    async function loadSpines() {
      try {
        const res = await api.listSpines();
        store.state.spinePacks = Array.isArray(res?.packs) ? res.packs : [];
        if (!store.state.selectedPackId && store.state.spinePacks.length > 0) {
          store.state.selectedPackId = store.state.spinePacks[0].id;
        }
        store.state.spinesLoaded = true;
        renderAll();
      } catch (err) {
        console.error('Failed to load spine packs:', err);
      }
    }

    function renderAll() {
      const host = el('ta-spines-host');
      if (!host) return;
      const packs = store.state.spinePacks || [];
      const pack = activePack();

      if (!pack) {
        host.innerHTML = `<div class="ta-empty-box"><h4>Loading Thinking Spines...</h4></div>`;
        return;
      }

      const starters = pack.starters || [];
      const engines = pack.engines || [];
      const tails = pack.tails || [];
      const chunks = pack.chunks || [];

      const sIdx = Math.min(local.starterIdx, Math.max(0, starters.length - 1));
      const eIdx = Math.min(local.engineIdx, Math.max(0, engines.length - 1));
      const tIdx = Math.min(local.tailIdx, Math.max(0, tails.length - 1));

      const sItem = starters[sIdx] || { text: '' };
      const eItem = engines[eIdx] || { text: '' };
      const tItem = tails[tIdx] || { text: '' };
      const combined = `${sItem.text} ${eItem.text} ${tItem.text}`.replace(/\s+/g, ' ').trim();
      const practicedSet = new Set(pack.practicedIds || []);

      host.innerHTML = `
        <div class="ta-pack-card">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div>
              <span class="ta-field-label" style="margin-bottom:4px;">Select Spine Pack</span>
              <div class="ta-domain-pills">
                ${packs
                  .map(
                    (p) => `
                    <button type="button" class="ta-pill-btn ${p.id === pack.id ? 'active' : ''}" data-ta-select-pack="${esc(p.id)}">
                      <span>${esc(p.title)}</span>
                      <span class="ltr-num" style="opacity:0.75;">${p.practicedCount || 0}/${p.totalItems || 0}</span>
                    </button>
                  `,
                  )
                  .join('')}
              </div>
            </div>
            <div class="ta-btn-group">
              ${
                (pack.practicedCount || 0) > 0
                  ? `<button type="button" class="btn-secondary btn-xs" id="ta-reset-pack-progress-btn" data-ta-reset-pack="${esc(pack.id)}">Reset Progress</button>`
                  : ''
              }
              ${
                !pack.isBuiltIn
                  ? `<button type="button" class="btn-danger-ghost btn-xs" data-ta-delete-pack="${esc(pack.id)}">Delete Pack</button>`
                  : ''
              }
              ${
                packs.some((p) => !p.isBuiltIn)
                  ? `<button type="button" class="btn-danger-ghost btn-xs" id="ta-clear-custom-spines-btn">Clear Custom Packs</button>`
                  : ''
              }
            </div>
          </div>

          <div id="ta-spine-progress-bar" class="subject-progress-bar"></div>
        </div>

        <div class="ta-combiner-preview">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <span class="ta-badge ta-badge--blue">Live 3-Chunk Spine Combiner (${starters.length} × ${engines.length} × ${tails.length} = ${starters.length * engines.length * tails.length} templates)</span>
            <div class="ta-btn-group">
              <button type="button" class="btn-secondary btn-xs" id="ta-spine-randomize-btn">Shuffle Spine</button>
              <button type="button" class="btn-secondary btn-xs" data-ta-speak="${esc(combined)}">Listen</button>
              <button type="button" class="ft-ask-ai-chip-btn" id="ta-spine-ask-ai-btn" style="height:28px;" title="Roleplay &amp; drill this spine with Flaptap AI">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"></path></svg>
                <span>Practice with AI</span>
              </button>
              <button type="button" class="btn-vox btn-xs" id="ta-spine-practice-arena-btn">Practice in Arena →</button>
            </div>
          </div>

          <div class="ta-combiner-sentence">
            <span class="seg-starter">${esc(sItem.text)}</span>
            <span class="seg-engine"> ${esc(eItem.text)}</span>
            <span class="seg-tail"> ${esc(tItem.text)}</span>
          </div>
        </div>

        <div class="ta-spine-columns">
          <div class="ta-spine-col">
            <span class="ta-field-label">1. Autopilot Starters (Buy Time)</span>
            ${starters
              .map(
                (item, idx) => `
                <div class="ta-spine-choice ${idx === sIdx ? 'active' : ''}" data-ta-pick-col="starter" data-ta-pick-idx="${idx}">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <strong style="font-size:0.88rem;">${esc(item.text)}</strong>
                    <span class="ta-btn-group" style="gap:4px;">
                      ${renderCheck(pack.id, item.id, practicedSet.has(item.id))}
                    </span>
                  </div>
                  ${item.ipa ? `<span class="ta-ipa">${esc(item.ipa)}</span>` : ''}
                  ${item.note ? `<span style="font-size:0.76rem;color:var(--ap-text-secondary);">${esc(item.note)}</span>` : ''}
                </div>
              `,
              )
              .join('')}
          </div>

          <div class="ta-spine-col">
            <span class="ta-field-label">2. Core Engines (Stance / Frame)</span>
            ${engines
              .map(
                (item, idx) => `
                <div class="ta-spine-choice ${idx === eIdx ? 'active' : ''}" data-ta-pick-col="engine" data-ta-pick-idx="${idx}">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <strong style="font-size:0.88rem;">${esc(item.text)}</strong>
                    ${renderCheck(pack.id, item.id, practicedSet.has(item.id))}
                  </div>
                  ${item.ipa ? `<span class="ta-ipa">${esc(item.ipa)}</span>` : ''}
                  ${item.note ? `<span style="font-size:0.76rem;color:var(--ap-text-secondary);">${esc(item.note)}</span>` : ''}
                </div>
              `,
              )
              .join('')}
          </div>

          <div class="ta-spine-col">
            <span class="ta-field-label">3. Natural Tails (Extend &amp; Justify)</span>
            ${tails
              .map(
                (item, idx) => `
                <div class="ta-spine-choice ${idx === tIdx ? 'active' : ''}" data-ta-pick-col="tail" data-ta-pick-idx="${idx}">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <strong style="font-size:0.88rem;">${esc(item.text)}</strong>
                    ${renderCheck(pack.id, item.id, practicedSet.has(item.id))}
                  </div>
                  ${item.ipa ? `<span class="ta-ipa">${esc(item.ipa)}</span>` : ''}
                  ${item.note ? `<span style="font-size:0.76rem;color:var(--ap-text-secondary);">${esc(item.note)}</span>` : ''}
                </div>
              `,
              )
              .join('')}
          </div>
        </div>

        ${
          chunks.length
            ? `
            <div class="ta-pack-card">
              <span class="ta-field-label" style="margin-bottom:0;">High-Frequency Domain Chunks</span>
              <div class="ta-chunk-grid">
                ${chunks
                  .map(
                    (ch) => `
                    <div class="ta-chunk-card">
                      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <strong>${esc(ch.text)}</strong>
                        <div class="ta-btn-group">
                          <button type="button" class="btn-secondary btn-xs" data-ta-speak="${esc(ch.example || ch.text)}">Listen</button>
                          ${renderCheck(pack.id, ch.id, practicedSet.has(ch.id))}
                        </div>
                      </div>
                      ${ch.ipa ? `<span class="ta-ipa">${esc(ch.ipa)}</span>` : ''}
                      ${ch.example ? `<span style="font-size:0.82rem;color:var(--ap-text-secondary);">"${esc(ch.example)}"</span>` : ''}
                    </div>
                  `,
                  )
                  .join('')}
              </div>
            </div>
          `
            : ''
        }

        <div class="ta-card">
          <div class="ta-command-topbar">
            <span class="ta-badge ta-badge--blue">AI Custom Spine Pack Generator</span>
            <span class="ta-stage-meta">Author a tailored Starter + Engine + Tail pack for any niche topic</span>
          </div>
          <div class="ta-command-body">
            <div class="ta-controls-grid" style="grid-template-columns: 2fr 1fr auto;align-items:end;">
              <div>
                <label class="ta-field-label" for="ta-spine-topic-input">Topic or Situation</label>
                <input id="ta-spine-topic-input" type="text" class="ta-input" value="${esc(local.customTopic)}" placeholder="e.g. Defending an AI architecture trade-off in a staff meeting" />
              </div>
              <div>
                <label class="ta-field-label" for="ta-spine-domain-select">Domain</label>
                <select id="ta-spine-domain-select" class="ta-select">
                  <option value="programming_ai" ${local.customDomain === 'programming_ai' ? 'selected' : ''}>Programming &amp; AI</option>
                  <option value="tech_systems" ${local.customDomain === 'tech_systems' ? 'selected' : ''}>Tech &amp; Product</option>
                  <option value="business_econ" ${local.customDomain === 'business_econ' ? 'selected' : ''}>Business &amp; Economics</option>
                  <option value="camera_creator" ${local.customDomain === 'camera_creator' ? 'selected' : ''}>Unscripted Camera</option>
                  <option value="everyday" ${local.customDomain === 'everyday' ? 'selected' : ''}>Everyday Life</option>
                </select>
              </div>
              <button type="button" class="btn-vox" id="ta-generate-spine-btn" ${store.state.generatingSpine ? 'disabled' : ''}>
                ${store.state.generatingSpine ? 'Generating...' : 'Generate Spine Pack'}
              </button>
            </div>
          </div>
        </div>
      `;

      store.ws()?.renderSubjectProgressBar?.('ta-spine-progress-bar', {
        total: pack.totalItems || 0,
        completed: pack.practicedCount || 0,
        singular: 'phrase',
        plural: 'phrases',
        doneHeadline: 'Pack Practiced',
        readyHeadline: 'Mark phrases as you speak them aloud',
      });
    }

    function renderCheck(packId, itemId, checked) {
      const attrs = `data-ta-toggle-pack="${esc(packId)}" data-ta-toggle-item="${esc(itemId)}"`;
      if (store.ws()?.renderCheckButtonHtml) {
        return store.ws().renderCheckButtonHtml({
          checked,
          attrs,
          label: checked ? 'Practiced' : 'Mark practiced',
          size: 'sm',
        });
      }
      return `<button type="button" class="item-check-btn ${checked ? 'is-checked' : ''}" ${attrs}>✓</button>`;
    }

    async function runGenerateSpine(overridePayload = null) {
      const ws = store.ws();
      const sel = local.aiSelector?.getSelection?.();
      const payload = overridePayload || {
        topic: local.customTopic.trim(),
        domain: local.customDomain,
        ...(sel ? { keyId: sel.keyId, model: sel.modelId || sel.model, variant: sel.variantId || sel.variant } : {}),
      };

      if (!payload.topic) {
        showToast('Enter a topic for your custom Spine Pack.', true);
        return;
      }

      if (!store.currentUser() && ws?.requireAuthBeforeAction) {
        const allowed = ws.requireAuthBeforeAction({ type: 'think_aloud_spine', payload });
        if (!allowed) return;
      }

      store.state.generatingSpine = true;
      renderAll();

      try {
        const res = await api.generateSpinePack(payload);
        if (res?.pack) {
          store.state.spinePacks = [res.pack, ...store.state.spinePacks];
          store.state.selectedPackId = res.pack.id;
          local.starterIdx = 0;
          local.engineIdx = 0;
          local.tailIdx = 0;
          local.customTopic = '';
          showToast(`Created Spine Pack "${res.pack.title}"!`);
        }
      } catch (err) {
        showToast(err?.message || 'Failed to generate Spine Pack.', true);
      } finally {
        store.state.generatingSpine = false;
        renderAll();
      }
    }

    function bindEvents() {
      const root = el('ta-view-spines');
      if (!root) return;

      root.addEventListener('click', async (e) => {
        const checkBtn = e.target.closest('[data-ta-toggle-item]');
        if (checkBtn) {
          e.stopPropagation();
          const packId = checkBtn.getAttribute('data-ta-toggle-pack');
          const itemId = checkBtn.getAttribute('data-ta-toggle-item');
          if (!store.currentUser()) {
            store.ws()?.requireAuthBeforeAction?.({ type: 'section', section: 'think-aloud' });
            return;
          }
          try {
            const res = await api.toggleSpineItem(packId, itemId);
            if (res?.pack) {
              store.state.spinePacks = store.state.spinePacks.map((p) => (p.id === packId ? res.pack : p));
              renderAll();
            }
          } catch (err) {
            showToast(err?.message || 'Could not update phrase progress.', true);
          }
          return;
        }

        const speakBtn = e.target.closest('[data-ta-speak]');
        if (speakBtn) {
          const txt = speakBtn.getAttribute('data-ta-speak');
          if (txt) global.FlaptapWordLookup?.speakText?.(txt);
          return;
        }

        if (e.target.closest('#ta-spine-ask-ai-btn')) {
          const pack = store.state.spinePacks.find((p) => p.id === store.state.selectedPackId) || store.state.spinePacks[0];
          const sTxt = pack?.starters?.[local.starterIdx]?.text || '';
          const eTxt = pack?.engines?.[local.engineIdx]?.text || '';
          const tTxt = pack?.tails?.[local.tailIdx]?.text || '';
          const combined = `${sTxt} ${eTxt} ${tTxt}`.trim();
          global.FlaptapAiChat?.openWithContext?.(
            {
              type: 'think_aloud',
              id: pack?.id || '',
              label: pack?.title || 'Thinking Spine',
              subtitle: 'Spine Roleplay Drill',
              payload: { combinedSpine: combined, domain: pack?.domain || '' },
            },
            {
              persona: 'roleplay',
              quote: combined ? { text: combined, sourceLabel: pack?.title || 'Thinking Spine' } : undefined,
              prefill: `Give me a realistic spoken prompt so I can reply using this thinking spine: "${combined}"`,
            },
          );
          return;
        }

        const packBtn = e.target.closest('[data-ta-select-pack]');
        if (packBtn) {
          store.state.selectedPackId = packBtn.getAttribute('data-ta-select-pack');
          local.starterIdx = 0;
          local.engineIdx = 0;
          local.tailIdx = 0;
          renderAll();
          return;
        }

        const colItem = e.target.closest('[data-ta-pick-col]');
        if (colItem) {
          const col = colItem.getAttribute('data-ta-pick-col');
          const idx = Number(colItem.getAttribute('data-ta-pick-idx')) || 0;
          if (col === 'starter') local.starterIdx = idx;
          if (col === 'engine') local.engineIdx = idx;
          if (col === 'tail') local.tailIdx = idx;
          renderAll();
          return;
        }

        if (e.target.closest('#ta-spine-randomize-btn')) {
          const pack = activePack();
          if (pack) {
            local.starterIdx = Math.floor(Math.random() * Math.max(1, pack.starters.length));
            local.engineIdx = Math.floor(Math.random() * Math.max(1, pack.engines.length));
            local.tailIdx = Math.floor(Math.random() * Math.max(1, pack.tails.length));
            renderAll();
          }
          return;
        }

        if (e.target.closest('#ta-spine-practice-arena-btn')) {
          const pack = activePack();
          const s = pack?.starters?.[local.starterIdx]?.text || '';
          const topic = pack ? `Use this spine naturally: "${s} ..." (${pack.title})` : '';
          nav.goToPracticeWithTopic({
            mode: 'framework',
            frameworkId: 'starter_engine_tail',
            customTopic: topic,
          });
          return;
        }

        if (e.target.closest('#ta-generate-spine-btn')) {
          await runGenerateSpine();
          return;
        }

        const resetBtn = e.target.closest('[data-ta-reset-pack]');
        if (resetBtn) {
          const packId = resetBtn.getAttribute('data-ta-reset-pack');
          const pack = packs.find((p) => p.id === packId);
          await global.FlaptapConfirm?.confirmAction?.({
            title: 'Reset spine pack progress?',
            message: 'Clears practiced checkmarks for this spine pack.',
            detail: pack?.title || '',
            confirmLabel: 'Reset Progress',
            tone: 'primary',
            onConfirm: async () => {
              await api.resetSpineProgress(packId);
              await loadSpines();
              showToast('Spine pack progress reset.');
            },
            onError: (err) => {
              showToast(err?.message || 'Could not reset progress.', true);
            },
          });
          return;
        }

        if (e.target.closest('#ta-clear-custom-spines-btn')) {
          await global.FlaptapConfirm?.confirmAction?.({
            title: 'Clear all custom Spine Packs?',
            message: 'Deletes all custom AI Spine Packs and resets built-in pack progress.',
            confirmLabel: 'Clear Custom Packs',
            tone: 'danger',
            onConfirm: async () => {
              await api.clearAllSpines();
              await loadSpines();
              showToast('Custom Spine Packs cleared.');
            },
            onError: (err) => {
              showToast(err?.message || 'Could not clear Spine Packs.', true);
            },
          });
          return;
        }

        const delBtn = e.target.closest('[data-ta-delete-pack]');
        if (delBtn) {
          const id = delBtn.getAttribute('data-ta-delete-pack');
          const pack = packs.find((p) => p.id === id);
          await global.FlaptapConfirm?.confirmAction?.({
            title: 'Delete custom Spine Pack?',
            message: 'Permanently removes this custom Spine Pack and its practice progress.',
            detail: pack?.title || '',
            confirmLabel: 'Delete Pack',
            tone: 'danger',
            onConfirm: async () => {
              await api.deleteSpinePack(id);
              store.state.spinePacks = store.state.spinePacks.filter((p) => p.id !== id);
              store.state.selectedPackId = store.state.spinePacks[0]?.id || '';
              renderAll();
              showToast('Custom Spine Pack deleted.');
            },
            onError: (err) => {
              showToast(err?.message || 'Could not delete Spine Pack.', true);
            },
          });
        }
      });

      root.addEventListener('input', (e) => {
        if (e.target.id === 'ta-spine-topic-input') {
          local.customTopic = e.target.value;
        }
      });
      root.addEventListener('change', (e) => {
        if (e.target.id === 'ta-spine-domain-select') {
          local.customDomain = e.target.value;
        }
      });
    }

    function mount() {
      if (local.mounted) return;
      local.mounted = true;
      mountAiSelector();
      bindEvents();
      renderAll();
    }

    return {
      mount,
      loadSpines,
      renderAll,
      onActivate: () => loadSpines(),
      resumePendingSpine: (payload) => runGenerateSpine(payload),
    };
  }

  global.FlaptapTASpinesPage = { create };
})(window);
