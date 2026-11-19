/* ==========================================================================
   FLAPTAP REAL-TIME AI PROVIDER, MODEL & VARIANT SELECTOR (ai-provider-selector.js)
   Modular, multi-instance UI & live key-probing widget reusable across any feature.
   - Lists all API keys configured on the system (.env + user encrypted BYOK vault)
   - Probes THAT specific key's /models endpoint in real time on selection or refresh
   - Dynamically populates Thinking/Reasoning options from live capabilities
   - Never caches or handles raw secrets on the client
   ========================================================================== */

(function (global) {
  'use strict';

  let instanceCounter = 0;
  let sharedPresetsCache = null;
  let sharedModalEl = null;
  const activeWidgets = new Set();

  const U = global.FlaptapUtils;
  const escapeHtml = U.escapeHtml;
  const formatTokens = U.formatTokens;

  async function defaultFetcher(url, options = {}) {
    return U.apiFetch(url, options, {
      getHeaders: (extra) =>
        Object.assign(
          { 'Content-Type': 'application/json' },
          global.FlaptapWorkspace?.getAuthHeaders ? global.FlaptapWorkspace.getAuthHeaders() : {},
          extra || {},
        ),
    });
  }

  function loadPersistedSelection(persistenceKey) {
    if (!persistenceKey) return null;
    try {
      const raw = localStorage.getItem(`flaptap_aisel_${persistenceKey}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function savePersistedSelection(persistenceKey, data) {
    if (!persistenceKey) return;
    try {
      localStorage.setItem(`flaptap_aisel_${persistenceKey}`, JSON.stringify(data));
    } catch {
      // Non-fatal storage error
    }
  }

  /* ========================================================================
     SINGLETON API KEYS MANAGER MODAL (BYOK VAULT + SYSTEM ENV INSPECTOR)
     ======================================================================== */

  async function loadPresets(fetcher) {
    if (Array.isArray(sharedPresetsCache)) return sharedPresetsCache;
    try {
      const res = await fetcher('/api/ai-providers/presets', { method: 'GET' });
      sharedPresetsCache = Array.isArray(res?.presets) ? res.presets : [];
    } catch {
      sharedPresetsCache = [];
    }
    return sharedPresetsCache;
  }

  function ensureKeysModal(fetcher, onChangedAll) {
    if (sharedModalEl) return sharedModalEl;

    const wrap = document.createElement('div');
    wrap.id = 'ft-ai-keys-modal-backdrop';
    wrap.className = 'ft-ai-modal-backdrop';
    wrap.hidden = true;
    wrap.innerHTML = `
      <div class="ft-ai-modal" role="dialog" aria-modal="true" aria-labelledby="ft-ai-modal-title">
        <div class="ft-ai-modal-head">
          <div>
            <div class="ft-ai-modal-kicker">BYOK &amp; SYSTEM VAULT</div>
            <h3 id="ft-ai-modal-title">Manage AI Provider API Keys</h3>
          </div>
          <button type="button" class="icon-action icon-action--sm" id="ft-ai-modal-close" aria-label="Close modal" title="Close">
            <svg class="ft-icon" aria-hidden="true" focusable="false"><use href="/icons.svg#x"></use></svg>
          </button>
        </div>

        <div class="ft-ai-modal-body">
          <div class="ft-ai-keys-section">
            <div class="ft-ai-section-label">Active Keys on This System</div>
            <div id="ft-ai-keys-list" class="ft-ai-keys-list">
              <div class="ft-ai-muted">Loading configured keys...</div>
            </div>
          </div>

          <form id="ft-ai-add-key-form" class="ft-ai-add-form">
            <div class="ft-ai-section-label">Add Another API Key (Same or New Provider)</div>
            <div class="ft-ai-form-grid">
              <div>
                <label class="ft-ai-field-label" for="ft-ai-provider-input">Provider</label>
                <select id="ft-ai-provider-input" class="ll-select-field"></select>
              </div>
              <div>
                <label class="ft-ai-field-label" for="ft-ai-label-input">Custom Name / Label</label>
                <input id="ft-ai-label-input" type="text" class="ll-input-field" placeholder="e.g. Personal Work Key, Gemini Pro..." maxlength="48" />
              </div>
            </div>

            <div class="ft-ai-form-row" id="ft-ai-baseurl-row" hidden>
              <label class="ft-ai-field-label" for="ft-ai-baseurl-input">Custom Base URL (OpenAI-Compatible)</label>
              <input id="ft-ai-baseurl-input" type="url" class="ll-input-field" placeholder="https://api.example.com/v1" />
            </div>

            <div class="ft-ai-form-row">
              <label class="ft-ai-field-label" for="ft-ai-secret-input">API Key</label>
              <input id="ft-ai-secret-input" type="password" class="ll-input-field" autocomplete="off" placeholder="Paste API key (verified live &amp; encrypted AES-256-GCM)" />
            </div>

            <label class="ft-ai-check-row">
              <input type="checkbox" id="ft-ai-default-check" />
              <span>Set as my default active key</span>
            </label>

            <div id="ft-ai-modal-error" class="ft-ai-modal-err" hidden></div>

            <div class="ft-ai-modal-actions">
              <button type="submit" class="btn-vox" id="ft-ai-save-key-btn">Verify Live &amp; Save Key</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);
    sharedModalEl = wrap;

    const close = () => {
      wrap.hidden = true;
    };
    wrap.querySelector('#ft-ai-modal-close')?.addEventListener('click', close);
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !wrap.hidden) close();
    });

    const providerSel = wrap.querySelector('#ft-ai-provider-input');
    const baseUrlRow = wrap.querySelector('#ft-ai-baseurl-row');
    const baseUrlInput = wrap.querySelector('#ft-ai-baseurl-input');
    const secretInput = wrap.querySelector('#ft-ai-secret-input');

    const syncPresetFields = () => {
      const presets = sharedPresetsCache || [];
      const found = presets.find((p) => p.id === providerSel.value);
      if (!found) return;
      if (secretInput) secretInput.placeholder = found.keyPlaceholder || 'Paste API key...';
      if (baseUrlRow) baseUrlRow.hidden = !found.allowCustomBaseUrl && found.id !== 'custom';
      if (baseUrlInput && !baseUrlInput.value) {
        baseUrlInput.placeholder = found.defaultBaseUrl || 'https://api.example.com/v1';
      }
    };

    providerSel?.addEventListener('change', syncPresetFields);

    const errEl = wrap.querySelector('#ft-ai-modal-error');
    const showErr = (msg) => {
      if (!errEl) return;
      errEl.textContent = msg;
      errEl.hidden = !msg;
    };

    wrap.querySelector('#ft-ai-add-key-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      showErr('');
      const btn = wrap.querySelector('#ft-ai-save-key-btn');
      const prevText = btn?.textContent || '';
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Testing Key Live...';
      }

      try {
        const res = await fetcher('/api/ai-providers/keys', {
          method: 'POST',
          body: JSON.stringify({
            providerId: providerSel?.value || 'openai',
            label: wrap.querySelector('#ft-ai-label-input')?.value?.trim() || '',
            apiKey: secretInput?.value?.trim() || '',
            baseUrl: baseUrlRow?.hidden ? '' : baseUrlInput?.value?.trim() || '',
            makeDefault: Boolean(wrap.querySelector('#ft-ai-default-check')?.checked),
          }),
        });
        if (secretInput) secretInput.value = '';
        if (wrap.querySelector('#ft-ai-label-input')) {
          wrap.querySelector('#ft-ai-label-input').value = '';
        }
        if (baseUrlInput) baseUrlInput.value = '';
        await renderKeysListInModal(fetcher, onChangedAll);
        await onChangedAll(res?.profile?.id);
        global.FlaptapWorkspace?.showToast?.(
          `Saved "${res?.profile?.displayName}" (${res?.discovery?.models?.length || 0} live models verified)`,
        );
      } catch (err) {
        showErr(err?.message || 'Could not validate or save API key.');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = prevText;
        }
      }
    });

    wrap.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('[data-ft-del-key]');
      if (!delBtn) return;
      const keyId = delBtn.getAttribute('data-ft-del-key');
      if (!keyId) return;
      delBtn.disabled = true;
      try {
        await fetcher(`/api/ai-providers/keys/${encodeURIComponent(keyId)}`, {
          method: 'DELETE',
        });
        await renderKeysListInModal(fetcher, onChangedAll);
        await onChangedAll(null);
        global.FlaptapWorkspace?.showToast?.('Removed saved API key.');
      } catch (err) {
        showErr(err?.message || 'Delete failed.');
        delBtn.disabled = false;
      }
    });

    return wrap;
  }

  async function renderKeysListInModal(fetcher) {
    if (!sharedModalEl) return;
    const listEl = sharedModalEl.querySelector('#ft-ai-keys-list');
    const providerSel = sharedModalEl.querySelector('#ft-ai-provider-input');

    const [presets, keysRes] = await Promise.all([
      loadPresets(fetcher),
      fetcher('/api/ai-providers/keys', { method: 'GET' }).catch(() => ({ keys: [] })),
    ]);

    if (providerSel && providerSel.options.length === 0 && presets.length > 0) {
      providerSel.innerHTML = presets
        .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
        .join('');
      providerSel.dispatchEvent(new Event('change'));
    }

    const keys = Array.isArray(keysRes?.keys) ? keysRes.keys : [];
    if (listEl) {
      if (keys.length === 0) {
        listEl.innerHTML = `<div class="ft-ai-muted">No API keys configured yet. Add one below.</div>`;
      } else {
        listEl.innerHTML = keys
          .map(
            (k) => `
          <div class="ft-ai-key-row">
            <div class="ft-ai-key-row-main">
              <div class="ft-ai-key-name">${escapeHtml(k.displayName)}</div>
              <div class="ft-ai-key-meta">
                <span>${escapeHtml(k.source === 'vault' ? 'Personal Vault (Encrypted)' : k.source === 'env' ? `Env: ${k.envVarName || 'system'}` : 'Local Auth')}</span>
                ${k.isDefault ? '<span class="ft-ai-badge-default">Default</span>' : ''}
              </div>
            </div>
            ${
              k.deletable
                ? `<button type="button" class="icon-action icon-action--xs is-danger" data-ft-del-key="${escapeHtml(k.id)}" aria-label="Remove key" title="Remove key"><svg class="ft-icon" aria-hidden="true" focusable="false"><use href="/icons.svg#trash"></use></svg></button>`
                : `<span class="ft-ai-env-tag">System</span>`
            }
          </div>
        `,
          )
          .join('');
      }
    }
  }

  async function openKeysManagerModal(fetcher, preferredSelectCb) {
    const ws = global.FlaptapWorkspace;
    if (ws && !ws.getUser?.() && ws.requireAuthBeforeAction) {
      ws.requireAuthBeforeAction(
        { type: 'section', section: 'learning-library' },
        'Sign in to save personal provider API keys securely to your encrypted account vault.',
      );
      return;
    }

    const modal = ensureKeysModal(fetcher, async (newlyAddedKeyId) => {
      for (const widget of activeWidgets) {
        await widget.refreshKeys(false, newlyAddedKeyId || undefined);
      }
      if (preferredSelectCb && newlyAddedKeyId) {
        preferredSelectCb(newlyAddedKeyId);
      }
    });

    modal.hidden = false;
    const errEl = modal.querySelector('#ft-ai-modal-error');
    if (errEl) errEl.hidden = true;
    await renderKeysListInModal(fetcher);
  }

  /* ========================================================================
     SELECTOR WIDGET FACTORY
     ======================================================================== */

  function create(config = {}) {
    const container =
      typeof config.container === 'string'
        ? document.querySelector(config.container)
        : config.container;
    if (!container) {
      throw new Error('FlaptapAiSelector.create requires a valid container element.');
    }

    instanceCounter++;
    const idPrefix = String(config.idPrefix || `ft-aisel-${instanceCounter}`);
    const persistenceKey = String(config.persistenceKey || '').trim();
    const fetcher = typeof config.fetcher === 'function' ? config.fetcher : defaultFetcher;
    const extraSummary = Array.isArray(config.extraSummaryItems) ? config.extraSummaryItems : [];

    const ids = {
      card: `${idPrefix}-card`,
      statusBadge: `${idPrefix}-status-badge`,
      statusDot: `${idPrefix}-status-dot`,
      statusText: `${idPrefix}-status-text`,
      refreshBtn: `${idPrefix}-refresh-btn`,
      keysBtn: `${idPrefix}-keys-btn`,
      keySelect: `${idPrefix}-key-select`,
      modelSelect: `${idPrefix}-model-select`,
      variantSelect: `${idPrefix}-variant-select`,
      chipContext: `${idPrefix}-chip-context`,
      chipSource: `${idPrefix}-chip-source`,
      chipVariant: `${idPrefix}-chip-variant`,
      runBtn: `${idPrefix}-run-btn`,
      runLabel: `${idPrefix}-run-label`,
    };

    const state = {
      keys: [],
      selectedKeyId: '',
      models: [],
      selectedModel: '',
      selectedVariant: '',
      activePreset: 'fast',
      initialized: false,
      loadingModels: false,
      lastLatencyMs: 0,
      liveStatus: 'idle',
      liveError: '',
      probeSeq: 0,
    };

    const extraSummaryHtml = extraSummary
      .map(
        (item) => `
      <span class="ll-bp-chip"><span class="ll-bp-k">${escapeHtml(item.label)}:</span> <strong id="${escapeHtml(`${idPrefix}-sum-${item.id}`)}">${escapeHtml(item.value || '—')}</strong></span>
      <span class="ll-bp-sep" aria-hidden="true">·</span>
    `,
      )
      .join('');

    const isCompact = Boolean(config.compact);
    const showFooter = config.showRunButton !== false || !config.hideMetaChips;

    container.innerHTML = `
      <div class="ft-ai-selector${isCompact ? ' ft-ai-selector--compact' : ''}" id="${escapeHtml(ids.card)}">
        <div class="ft-ai-head">
          <div class="ft-ai-head-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M7 15h4m-4-4h10"></path></svg>
            <span>${escapeHtml(config.title || (isCompact ? 'AI Model' : 'Dynamic AI Provider & Live Model Selector'))}</span>
          </div>

          <div class="ft-ai-head-controls">
            <div class="exec-presets-strip" role="group" aria-label="Speed presets">
              <button type="button" class="preset-pill active" data-ft-preset="fast" title="Lowest thinking latency (~2–10s)">Fast</button>
              <button type="button" class="preset-pill" data-ft-preset="balanced" title="Balanced reasoning effort (~10–30s)">Balanced</button>
              <button type="button" class="preset-pill" data-ft-preset="deep" title="Deepest reasoning (~60–120s · much slower)">Deep</button>
            </div>

            <button type="button" class="btn-secondary btn-xs ft-ai-keys-btn" id="${escapeHtml(ids.keysBtn)}" title="Add or manage API keys">
              + API Keys
            </button>

            <button type="button" class="btn-refresh-agents" id="${escapeHtml(ids.refreshBtn)}" title="Re-query live /models from selected API key">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            </button>

            <div class="exec-status-badge" id="${escapeHtml(ids.statusBadge)}">
              <span class="status-dot live" id="${escapeHtml(ids.statusDot)}"></span>
              <span id="${escapeHtml(ids.statusText)}">Loading API keys...</span>
            </div>
          </div>
        </div>

        <div class="ft-ai-grid">
          <div class="ft-ai-col">
            <label class="ft-ai-label" for="${escapeHtml(ids.keySelect)}">Provider</label>
            <select id="${escapeHtml(ids.keySelect)}" class="ft-ai-select" aria-label="Provider or API Key">
              <option value="">Detecting available keys...</option>
            </select>
          </div>

          <div class="ft-ai-col">
            <label class="ft-ai-label" for="${escapeHtml(ids.modelSelect)}">Model</label>
            <select id="${escapeHtml(ids.modelSelect)}" class="ft-ai-select" aria-label="Available Models from Key">
              <option value="">Select API key first</option>
            </select>
          </div>

          <div class="ft-ai-col">
            <label class="ft-ai-label" for="${escapeHtml(ids.variantSelect)}">Thinking</label>
            <select id="${escapeHtml(ids.variantSelect)}" class="ft-ai-select" aria-label="Thinking or Reasoning Effort">
              <option value="">Select model first</option>
            </select>
          </div>
        </div>

        ${
          showFooter
            ? `<div class="ft-ai-footer">
          <div class="ft-ai-meta-left">
            ${
              config.hideMetaChips
                ? ''
                : `<div class="ribbon-chips">
              <span class="ribbon-chip" id="${escapeHtml(ids.chipContext)}">Context: <strong>—</strong></span>
              <span class="ribbon-chip" id="${escapeHtml(ids.chipSource)}">Discovery: <strong>—</strong></span>
              <span class="ribbon-chip" id="${escapeHtml(ids.chipVariant)}">Thinking: <strong>—</strong></span>
            </div>`
            }
            ${
              extraSummaryHtml
                ? `<div class="ll-direct-blueprint">${extraSummaryHtml}<span class="ll-bp-chip"><span class="ll-bp-k">Transport:</span> <strong>Direct API</strong></span></div>`
                : ''
            }
          </div>

          ${
            config.showRunButton !== false
              ? `<button type="button" class="btn-vox ll-generate-btn" id="${escapeHtml(ids.runBtn)}">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                  <span id="${escapeHtml(ids.runLabel)}">${escapeHtml(config.actionLabel || 'Run Task')}</span>
                </button>`
              : ''
          }
        </div>`
            : ''
        }
      </div>
    `;

    const el = (id) => document.getElementById(id);

    function notifyChange() {
      savePersistedSelection(persistenceKey, {
        keyId: state.selectedKeyId,
        model: state.selectedModel,
        variant: state.selectedVariant,
      });
      if (typeof config.onChange === 'function') {
        config.onChange(getSelection());
      }
    }

    function setStatus(tone, text) {
      const dot = el(ids.statusDot);
      const txt = el(ids.statusText);
      if (dot) {
        dot.classList.remove('live', 'yellow', 'red');
        dot.classList.add(tone);
      }
      if (txt) txt.textContent = text;
    }

    function renderKeysDropdown() {
      const keySel = el(ids.keySelect);
      if (!keySel) return;
      if (state.keys.length === 0) {
        keySel.innerHTML = `<option value="">No API keys found — click + API Keys</option>`;
        keySel.disabled = true;
        return;
      }
      keySel.disabled = false;
      keySel.innerHTML = state.keys
        .map(
          (k) =>
            `<option value="${escapeHtml(k.id)}">${escapeHtml(k.displayName)}</option>`,
        )
        .join('');
      keySel.value = state.selectedKeyId;
    }

    function getSelectedModelObj() {
      return state.models.find((m) => m.id === state.selectedModel) || null;
    }

    function syncPresetFromVariant(variantId) {
      const v = String(variantId || '').toLowerCase();
      let matchedPreset = '';
      if (['none', 'minimal', 'standard'].includes(v)) {
        matchedPreset = 'fast';
      } else if (['low', 'medium'].includes(v)) {
        matchedPreset = 'balanced';
      } else if (['high', 'xhigh', 'max', 'on'].includes(v)) {
        matchedPreset = 'deep';
      }
      state.activePreset = matchedPreset;
      container.querySelectorAll('[data-ft-preset]').forEach((btn) => {
        btn.classList.toggle(
          'active',
          Boolean(matchedPreset) && btn.getAttribute('data-ft-preset') === matchedPreset,
        );
      });
    }

    function renderVariantsDropdown() {
      const varSel = el(ids.variantSelect);
      const chipVar = el(ids.chipVariant);
      const chipCtx = el(ids.chipContext);
      const chipSrc = el(ids.chipSource);
      const modelObj = getSelectedModelObj();

      if (!varSel) return;

      if (!modelObj) {
        varSel.innerHTML = `<option value="">No model selected</option>`;
        varSel.disabled = true;
        if (chipCtx) chipCtx.innerHTML = `Context: <strong>—</strong>`;
        if (chipSrc) chipSrc.innerHTML = `Discovery: <strong>—</strong>`;
        if (chipVar) chipVar.innerHTML = `Thinking: <strong>—</strong>`;
        return;
      }

      const variants =
        Array.isArray(modelObj.variants) && modelObj.variants.length > 0
          ? modelObj.variants
          : [{ id: 'standard', label: 'Standard (Direct Model)', default: true }];

      const stillValid = variants.some((v) => v.id === state.selectedVariant);
      if (!stillValid) {
        const preferredVariant = Array.isArray(config.preferredVariants)
          ? config.preferredVariants.find((id) => variants.some((v) => v.id === id))
          : '';
        state.selectedVariant =
          preferredVariant ||
          modelObj.defaultVariant ||
          variants.find((v) => v.default)?.id ||
          variants[0].id;
      }

      varSel.disabled = false;
      varSel.innerHTML = variants
        .map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.label)}</option>`)
        .join('');
      varSel.value = state.selectedVariant;
      syncPresetFromVariant(state.selectedVariant);

      const curVar = variants.find((v) => v.id === state.selectedVariant) || variants[0];
      const isDeepWarn = ['high', 'xhigh', 'max', 'on'].includes(
        String(state.selectedVariant || '').toLowerCase(),
      );
      if (chipCtx) {
        chipCtx.innerHTML = `Context: <strong class="ltr-num">${escapeHtml(formatTokens(modelObj.contextLength))}</strong>`;
      }
      if (chipSrc) {
        chipSrc.innerHTML = `Capability: <strong>${escapeHtml(
          modelObj.source === 'live-api+models.dev' ? 'Live + models.dev' : 'Live Endpoint',
        )}</strong>`;
      }
      if (chipVar) {
        chipVar.innerHTML = `Thinking: <strong>${escapeHtml(curVar?.label || 'Standard')}${
          isDeepWarn ? ' (Deep · ~30–90s slower)' : ''
        }</strong>`;
      }
    }

    function renderModelsDropdown() {
      const modelSel = el(ids.modelSelect);
      if (!modelSel) return;

      if (state.loadingModels) {
        modelSel.innerHTML = `<option value="">Querying API key /models live...</option>`;
        modelSel.disabled = true;
        renderVariantsDropdown();
        return;
      }

      if (state.models.length === 0) {
        modelSel.innerHTML = `<option value="">${escapeHtml(
          state.liveError ? 'Live fetch failed — inspect status badge' : 'No chat models returned for this key',
        )}</option>`;
        modelSel.disabled = true;
        state.selectedModel = '';
        renderVariantsDropdown();
        return;
      }

      modelSel.disabled = false;
      modelSel.innerHTML = state.models
        .map((m) => {
          const ctxTag = m.contextLength ? ` · ${formatTokens(m.contextLength)}` : '';
          const thinkTag = m.reasoningSupported ? ' · Thinking' : '';
          const recTag = m.default ? ' (Recommended)' : '';
          return `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name || m.id)}${escapeHtml(recTag)}${escapeHtml(ctxTag)}${escapeHtml(thinkTag)}</option>`;
        })
        .join('');

      if (!state.models.some((m) => m.id === state.selectedModel)) {
        const preferredModel = Array.isArray(config.preferredModels)
          ? config.preferredModels.find((id) => state.models.some((m) => m.id === id))
          : '';
        state.selectedModel =
          preferredModel || state.models.find((m) => m.default)?.id || state.models[0].id;
      }
      modelSel.value = state.selectedModel;
      renderVariantsDropdown();
    }

    async function loadLiveModelsForKey(keyId, forceRefresh = false) {
      if (!keyId) {
        state.models = [];
        renderModelsDropdown();
        return;
      }

      const seq = ++state.probeSeq;
      state.loadingModels = true;
      state.liveError = '';
      setStatus('yellow', forceRefresh ? 'Refreshing key /models live...' : 'Probing key live...');
      renderModelsDropdown();

      const refreshBtn = el(ids.refreshBtn);
      refreshBtn?.classList.add('is-spinning');

      try {
        const qs = forceRefresh ? '?refresh=1' : '';
        const res = await fetcher(`/api/ai-providers/keys/${encodeURIComponent(keyId)}/models${qs}`, {
          method: 'GET',
        });

        if (seq !== state.probeSeq) return; // Superseded by newer key selection

        state.loadingModels = false;
        state.models = Array.isArray(res?.models) ? res.models : [];
        state.lastLatencyMs = Number(res?.latencyMs) || 0;
        state.liveStatus = res?.liveStatus || 'ok';
        state.liveError = res?.error || '';

        const persisted = loadPersistedSelection(persistenceKey);
        if (
          persisted &&
          persisted.keyId === keyId &&
          state.models.some((m) => m.id === persisted.model)
        ) {
          state.selectedModel = persisted.model;
          state.selectedVariant = persisted.variant || '';
        } else {
          const preferredModel = Array.isArray(config.preferredModels)
            ? config.preferredModels.find((id) => state.models.some((m) => m.id === id))
            : '';
          state.selectedModel =
            preferredModel || res?.defaultModel || state.models[0]?.id || '';
          state.selectedVariant = '';
        }

        if (res?.fetchedLive) {
          const cacheNote = res?.cached ? 'cached' : `${state.lastLatencyMs}ms`;
          setStatus('live', `Live · ${state.models.length} models (${cacheNote})`);
        } else {
          setStatus(
            res?.liveStatus === 'auth_error' ? 'red' : 'yellow',
            res?.liveStatus === 'auth_error' ? 'Invalid / Rejected Key' : 'Endpoint Unreachable',
          );
          if (res?.error) config.onToast?.(res.error);
        }

        renderModelsDropdown();
        notifyChange();
      } catch (err) {
        if (seq !== state.probeSeq) return;
        state.loadingModels = false;
        state.models = [];
        state.liveError = err?.message || 'Failed to query key.';
        setStatus('red', 'Key Discovery Error');
        renderModelsDropdown();
      } finally {
        refreshBtn?.classList.remove('is-spinning');
      }
    }

    async function refreshKeys(forceRefreshModels = false, preferKeyId = undefined) {
      try {
        const res = await fetcher('/api/ai-providers/keys', { method: 'GET' });
        state.keys = Array.isArray(res?.keys) ? res.keys : [];

        const persisted = loadPersistedSelection(persistenceKey);
        const candidates = [
          preferKeyId,
          state.selectedKeyId,
          persisted?.keyId,
          state.keys.find((k) => k.isDefault)?.id,
          state.keys[0]?.id,
        ].filter(Boolean);

        state.selectedKeyId =
          candidates.find((cid) => state.keys.some((k) => k.id === cid)) || '';

        renderKeysDropdown();

        if (state.selectedKeyId) {
          await loadLiveModelsForKey(state.selectedKeyId, forceRefreshModels);
        } else {
          state.models = [];
          setStatus('yellow', 'No API keys found');
          renderModelsDropdown();
        }
      } catch (err) {
        setStatus('red', err?.message || 'Key scan failed');
      }
    }

    function applyPreset(presetName) {
      state.activePreset = presetName;
      container.querySelectorAll('[data-ft-preset]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-ft-preset') === presetName);
      });

      const modelObj = getSelectedModelObj();
      if (!modelObj) return;
      const variants = modelObj.variants || [];
      const orderByPreset = {
        fast: ['none', 'minimal', 'standard', 'low'],
        balanced: ['medium', 'low', 'standard', 'none'],
        deep: ['high', 'xhigh', 'max', 'on', 'medium'],
      };
      const prefs = orderByPreset[presetName] || orderByPreset.fast;
      const matched = prefs.map((id) => variants.find((v) => v.id === id)).find(Boolean);
      if (matched) {
        state.selectedVariant = matched.id;
        renderVariantsDropdown();
        notifyChange();
      }
    }

    function bindDom() {
      el(ids.keySelect)?.addEventListener('change', async (e) => {
        state.selectedKeyId = e.target.value || '';
        state.selectedModel = '';
        state.selectedVariant = '';
        await loadLiveModelsForKey(state.selectedKeyId, false);
      });

      el(ids.modelSelect)?.addEventListener('change', (e) => {
        state.selectedModel = e.target.value || '';
        state.selectedVariant = '';
        renderVariantsDropdown();
        notifyChange();
      });

      el(ids.variantSelect)?.addEventListener('change', (e) => {
        state.selectedVariant = e.target.value || '';
        renderVariantsDropdown();
        notifyChange();
      });

      el(ids.refreshBtn)?.addEventListener('click', async () => {
        if (state.selectedKeyId) {
          await loadLiveModelsForKey(state.selectedKeyId, true);
          config.onToast?.(`Refreshed live models (${state.models.length} loaded)`);
        } else {
          await refreshKeys(true);
        }
      });

      el(ids.keysBtn)?.addEventListener('click', () => {
        openKeysManagerModal(fetcher, (newKeyId) => {
          if (newKeyId) {
            state.selectedKeyId = newKeyId;
            renderKeysDropdown();
          }
        });
      });

      container.querySelectorAll('[data-ft-preset]').forEach((btn) => {
        btn.addEventListener('click', () => applyPreset(btn.getAttribute('data-ft-preset') || 'fast'));
      });

      el(ids.runBtn)?.addEventListener('click', () => {
        if (typeof config.onRun === 'function') {
          config.onRun(getSelection());
        }
      });
    }

    function getSelection() {
      const keyObj = state.keys.find((k) => k.id === state.selectedKeyId) || null;
      const modelObj = getSelectedModelObj();
      const varObj = modelObj?.variants?.find((v) => v.id === state.selectedVariant) || null;
      return {
        keyId: state.selectedKeyId,
        providerId: keyObj?.providerId || '',
        providerName: keyObj?.providerName || '',
        model: state.selectedModel,
        modelName: modelObj?.name || state.selectedModel,
        variant: state.selectedVariant || 'standard',
        variantLabel: varObj?.label || state.selectedVariant || 'Standard',
      };
    }

    bindDom();

    const api = {
      init: async () => {
        if (state.initialized) return;
        state.initialized = true;
        await refreshKeys(false);
      },
      refreshKeys,
      getSelection,
      setSelection: async ({ keyId, model, variant }) => {
        if (keyId && keyId !== state.selectedKeyId && state.keys.some((k) => k.id === keyId)) {
          state.selectedKeyId = keyId;
          renderKeysDropdown();
          await loadLiveModelsForKey(keyId, false);
        }
        if (model && state.models.some((m) => m.id === model)) {
          state.selectedModel = model;
          renderModelsDropdown();
        }
        if (variant) {
          state.selectedVariant = variant;
          renderVariantsDropdown();
        }
        notifyChange();
      },
      setRunLabel: (label) => {
        const lbl = el(ids.runLabel);
        if (lbl) lbl.textContent = label;
      },
      setSummaryValue: (id, value) => {
        const node = el(`${idPrefix}-sum-${id}`);
        if (node) node.textContent = String(value ?? '—');
      },
      setDisabled: (disabled) => {
        const runBtn = el(ids.runBtn);
        if (runBtn) runBtn.disabled = Boolean(disabled);
        const keySel = el(ids.keySelect);
        if (keySel && state.keys.length > 0) keySel.disabled = Boolean(disabled);
        const modelSel = el(ids.modelSelect);
        if (modelSel && state.models.length > 0) modelSel.disabled = Boolean(disabled);
        const varSel = el(ids.variantSelect);
        if (varSel && state.models.length > 0) varSel.disabled = Boolean(disabled);
      },
      getIds: () => ids,
      destroy: () => {
        activeWidgets.delete(api);
      },
    };

    activeWidgets.add(api);
    return api;
  }

  global.addEventListener('flaptap:auth-changed', () => {
    for (const widget of activeWidgets) {
      widget.refreshKeys(false);
    }
  });

  global.FlaptapAiSelector = {
    create,
    openKeysManager: (fetcher) => openKeysManagerModal(fetcher || defaultFetcher),
    openKeysModal: (fetcher) => openKeysManagerModal(fetcher || defaultFetcher),
  };
})(window);
