/* ==========================================================================
   ANYTHING TO PHRASES — EXTRACT PAGE (extract-page.js)
   Isolated Page 1 (/extractor):
   - Source switcher (Link / Text / File) with live source-type detection
   - Real-time validation & smart saved-lesson selection
   - Smart defaults + progressive disclosure for fine-tune options
   - Real SSE pipeline progress with live streaming phrase previews, skeletons,
     chunk progress, elapsed timer, Cancel (AbortController), and Retry
   - Compact Recent Guides strip
   Zero cross-imports with Library or Detail pages.
   ========================================================================== */

(function (global) {
  'use strict';

  const STAGE_MAP = {
    detecting: 1,
    resolving: 1,
    cleaning: 2,
    chunking: 2,
    extracting: 3,
    grounding: 4,
    saving: 4,
  };

  const TAB_HINTS = {
    link: 'YouTube · Articles · Podcasts · Social clips',
    text: 'Transcripts · Notes · Markdown · Saved lessons',
    upload: 'Images (OCR) · Audio/Video · Subtitles · Docs',
  };

  function create(deps) {
    const store = deps.store;
    const api = deps.api;
    const nav = deps.nav;
    const U = global.FlaptapUtils;
    const escapeHtml = U.escapeHtml;

    const local = {
      mounted: false,
      sourceTab: 'link',
      selectedFile: null,
      aiSelector: null,
      running: false,
      abortController: null,
      progressTimer: null,
      progressStartedAt: 0,
      lastRunPayload: null,
      streamedPreviews: [],
      unsubs: [],
    };

    function ws() {
      return global.FlaptapWorkspace || null;
    }

    function showToast(msg) {
      U.showToast(msg);
    }

    function el(id) {
      return document.getElementById(id);
    }

    function requireAuth(payload) {
      if (store.currentUser()) return true;
      if (ws()?.requireAuthBeforeAction) {
        return ws().requireAuthBeforeAction({ type: 'aex_extract', payload });
      }
      showToast('Sign in to run an extraction.');
      return false;
    }

    /* --------------------------------------------------------------------
       SOURCE TABS & LIVE SOURCE-TYPE DETECTION
       -------------------------------------------------------------------- */

    function setSourceTab(tab) {
      const next = ['link', 'text', 'upload'].includes(tab) ? tab : 'link';
      local.sourceTab = next;

      document.querySelectorAll('#aex-view-extract [data-aex-source]').forEach((button) => {
        const active = button.dataset.aexSource === next;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      document.querySelectorAll('#aex-view-extract [data-aex-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.aexPanel !== next;
      });

      const hint = el('aex-source-cap-hint');
      if (hint) hint.textContent = TAB_HINTS[next] || TAB_HINTS.link;

      // Clear stale validation errors when switching source tabs
      hideInlineError();
      syncAiSummary();
    }

    function updateUrlDetection() {
      const input = el('aex-url-input');
      const pill = el('aex-url-detect');
      const clearBtn = el('aex-url-clear');
      if (!input) return;

      const raw = input.value;
      const info = store.detectUrlSource(raw);
      if (clearBtn) clearBtn.hidden = !raw.trim();

      if (!pill) return;
      if (info.empty) {
        pill.hidden = true;
        pill.removeAttribute('data-tone');
        pill.innerHTML = '';
        input.removeAttribute('aria-invalid');
        return;
      }

      pill.hidden = false;
      pill.dataset.tone = info.tone;
      if (info.valid) {
        input.removeAttribute('aria-invalid');
        pill.innerHTML = `<span class="aex-detect-dot" aria-hidden="true"></span><strong>${escapeHtml(
          info.label,
        )}</strong><span class="aex-detect-sep" aria-hidden="true">·</span><span>${escapeHtml(
          info.pipeline,
        )}</span>`;
      } else {
        input.setAttribute('aria-invalid', 'true');
        pill.innerHTML = `<span class="aex-detect-dot" aria-hidden="true"></span><strong>${escapeHtml(
          info.label,
        )}</strong><span class="aex-detect-sep" aria-hidden="true">·</span><span>${escapeHtml(
          info.error,
        )}</span>`;
      }
    }

    function updateTextStats() {
      const input = el('aex-text-input');
      const countEl = el('aex-text-word-count');
      const metaEl = el('aex-text-meta-pill');
      if (!input) return;

      const stats = store.estimateTextStats(input.value);
      if (countEl) countEl.textContent = String(stats.words);

      if (metaEl) {
        if (stats.words === 0) {
          metaEl.hidden = true;
          metaEl.textContent = '';
        } else if (stats.tooShort) {
          metaEl.hidden = false;
          metaEl.dataset.tone = 'warn';
          metaEl.textContent = 'Add a couple of sentences';
        } else if (stats.veryLong) {
          metaEl.hidden = false;
          metaEl.dataset.tone = 'info';
          metaEl.textContent = `~${stats.readMin}m read · ${stats.chunks} passes (long source)`;
        } else if (stats.chunks > 1) {
          metaEl.hidden = false;
          metaEl.dataset.tone = 'info';
          metaEl.textContent = `~${stats.readMin}m read · ${stats.chunks} passes`;
        } else {
          metaEl.hidden = false;
          metaEl.dataset.tone = 'ok';
          metaEl.textContent = `~${stats.readMin}m read · 1 fast pass`;
        }
      }
    }

    function syncSelectedLessonUi() {
      const select = el('aex-lesson-select');
      const banner = el('aex-lesson-selected-banner');
      const titleEl = el('aex-lesson-selected-title');
      const textarea = el('aex-text-input');
      if (!select) return;

      const lessonId = String(select.value || '').trim();
      const lesson = store.state.lessonSources.find((l) => l.id === lessonId) || null;
      if (banner) banner.hidden = !lesson;
      if (titleEl && lesson) {
        titleEl.textContent = `${lesson.title} (${lesson.sentencesCount || 0} sentences)`;
      }
      if (textarea) {
        textarea.disabled = Boolean(lesson);
        textarea.placeholder = lesson
          ? 'Extracting from the selected saved lesson below. Clear it to paste custom text.'
          : 'Paste a transcript, dialogue, excerpt, or Markdown notes...';
      }
      syncAiSummary();
    }

    function setSelectedFile(file) {
      const maxMb = Number(store.state.config?.maxUploadMb) || 50;
      const chip = el('aex-file-chip');
      const nameEl = el('aex-file-name');
      const metaEl = el('aex-file-meta');
      const input = el('aex-file-input');

      if (!file) {
        local.selectedFile = null;
        if (chip) chip.hidden = true;
        if (input) input.value = '';
        return;
      }

      const info = store.detectFileSource(file, maxMb);
      if (!info?.valid) {
        showInlineError(info?.label || 'Unsupported file', info?.error || 'Choose a supported file.');
        setSelectedFile(null);
        return;
      }

      local.selectedFile = file;
      if (nameEl) nameEl.textContent = file.name;
      if (metaEl) metaEl.textContent = `${info.label} · ${info.sizeLabel}`;
      if (chip) {
        chip.hidden = false;
        chip.dataset.tone = info.tone;
      }
      hideInlineError();
    }

    /* --------------------------------------------------------------------
       OPTIONS & AI SELECTOR
       -------------------------------------------------------------------- */

    function populateLanguageSelect() {
      const select = el('aex-language-select');
      if (!select) return;
      const items = store.languages();
      const preferred = select.value || store.getPreferredLanguage();
      select.innerHTML = items
        .map(
          (l) =>
            `<option value="${escapeHtml(l.code)}">${escapeHtml(l.name)} (${escapeHtml(
              l.native,
            )})</option>`,
        )
        .join('');
      select.value = items.some((l) => l.code === preferred)
        ? preferred
        : items.some((l) => l.code === 'ar')
          ? 'ar'
          : items[0]?.code || 'en';
      syncAiSummary();
    }

    function populateExtractionOptions(savedOverrides) {
      const saved = savedOverrides || store.loadSavedOptions();
      for (const spec of store.OPTION_SPECS) {
        const select = el(spec.selectId);
        if (!select) continue;
        const items =
          Array.isArray(store.state.config?.[spec.configKey]) &&
          store.state.config[spec.configKey].length > 0
            ? store.state.config[spec.configKey]
            : spec.fallback;
        const fallbackById = new Map((spec.fallback || []).map((e) => [e.id, e]));
        const defVal = store.DEFAULT_OPTIONS[spec.key];
        const preferred = select.value || saved[spec.key] || defVal;
        select.innerHTML = items
          .map((item) => {
            const fb = fallbackById.get(item.id);
            const cleanLabel =
              fb?.label ||
              item.shortLabel ||
              String(item.label || item.id).replace(/\s*\(Default\)\s*/i, '').trim();
            return `<option value="${escapeHtml(item.id)}">${escapeHtml(cleanLabel)}</option>`;
          })
          .join('');
        select.value = items.some((i) => i.id === preferred)
          ? preferred
          : items.some((i) => i.id === defVal)
            ? defVal
            : items[0]?.id || defVal;
      }
      syncOptionIndicators();
      syncAiSummary();
    }

    function syncOptionIndicators() {
      let anyCustom = false;
      let fineTuneCustom = 0;
      const fineTuneKeys = new Set(['extractionType', 'style', 'focus', 'depth', 'studyGoal', 'order']);
      for (const spec of store.OPTION_SPECS) {
        const select = el(spec.selectId);
        if (!select) continue;
        const isCustom = (select.value || store.DEFAULT_OPTIONS[spec.key]) !== store.DEFAULT_OPTIONS[spec.key];
        if (isCustom) {
          anyCustom = true;
          if (fineTuneKeys.has(spec.key)) fineTuneCustom++;
        }
        select.closest('.aex-option')?.classList.toggle('is-customized', isCustom);
      }
      const forceCheck = el('aex-force-fresh');
      if (forceCheck?.checked) {
        anyCustom = true;
        fineTuneCustom++;
      }

      const resetBtn = el('aex-reset-options-btn');
      if (resetBtn) resetBtn.hidden = !anyCustom;
      const badge = el('aex-custom-count');
      if (badge) {
        badge.textContent = String(fineTuneCustom);
        badge.hidden = fineTuneCustom === 0;
      }
      el('aex-options-toggle')?.classList.toggle('has-custom', fineTuneCustom > 0);
    }

    function saveCurrentOptions() {
      const out = {};
      for (const spec of store.OPTION_SPECS) {
        out[spec.key] = el(spec.selectId)?.value || store.DEFAULT_OPTIONS[spec.key];
      }
      store.saveOptions(out);
    }

    function resetOptions() {
      for (const spec of store.OPTION_SPECS) {
        const select = el(spec.selectId);
        if (select) select.value = store.DEFAULT_OPTIONS[spec.key];
      }
      const forceCheck = el('aex-force-fresh');
      if (forceCheck) forceCheck.checked = false;
      saveCurrentOptions();
      syncOptionIndicators();
      syncAiSummary();
      showToast('Options reset to defaults.');
    }

    function mountAiSelector() {
      if (local.aiSelector || !global.FlaptapAiSelector) return;
      const mount = el('aex-ai-selector-mount');
      if (!mount) return;

      local.aiSelector = global.FlaptapAiSelector.create({
        container: mount,
        idPrefix: 'aex-aisel',
        persistenceKey: 'american_extractor_v2',
        preferredModels: ['gpt-6-luna', 'gpt-5.6-luna'],
        preferredVariants: ['medium', 'low', 'standard'],
        compact: true,
        hideMetaChips: true,
        title: 'AI Model',
        actionLabel: 'Extract Phrases',
        fetcher: api.apiFetch,
        onToast: showToast,
        onRun: () => handleRun(),
      });
    }

    function syncAiSummary() {
      // Compact selector hides chip clutter; keep hook safe for future metadata
    }

    function populateLessonSelect(items) {
      const select = el('aex-lesson-select');
      if (!select) return;
      const prev = select.value;
      const list = Array.isArray(items) ? items : [];
      select.innerHTML = [
        '<option value="">Choose a saved lesson…</option>',
        ...list.map(
          (item) =>
            `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)} · ${escapeHtml(
              String(item.sentencesCount || 0),
            )} sentences</option>`,
        ),
      ].join('');
      if (list.some((i) => i.id === prev)) select.value = prev;
      syncSelectedLessonUi();
    }

    /* --------------------------------------------------------------------
       PAYLOAD COLLECTION & VALIDATION
       -------------------------------------------------------------------- */

    function collectRunPayload() {
      const payload = {
        tab: local.sourceTab,
        url: String(el('aex-url-input')?.value || '').trim(),
        text: String(el('aex-text-input')?.value || '').trim(),
        title: String(el('aex-text-title')?.value || '').trim(),
        lessonId: String(el('aex-lesson-select')?.value || '').trim(),
        language: el('aex-language-select')?.value || store.getPreferredLanguage(),
        force: Boolean(el('aex-force-fresh')?.checked),
      };
      for (const spec of store.OPTION_SPECS) {
        payload[spec.key] = el(spec.selectId)?.value || store.DEFAULT_OPTIONS[spec.key];
      }
      return payload;
    }

    function restoreRunPayload(payload) {
      if (!payload || typeof payload !== 'object') return;
      setSourceTab(payload.tab || 'link');
      if (el('aex-url-input')) el('aex-url-input').value = payload.url || '';
      if (el('aex-text-input')) el('aex-text-input').value = payload.text || '';
      if (el('aex-text-title')) el('aex-text-title').value = payload.title || '';
      if (el('aex-lesson-select') && payload.lessonId) el('aex-lesson-select').value = payload.lessonId;
      if (el('aex-language-select') && payload.language) el('aex-language-select').value = payload.language;
      if (el('aex-force-fresh')) el('aex-force-fresh').checked = Boolean(payload.force);
      for (const spec of store.OPTION_SPECS) {
        const s = el(spec.selectId);
        if (s && payload[spec.key]) s.value = payload[spec.key];
      }
      updateUrlDetection();
      updateTextStats();
      syncSelectedLessonUi();
      syncOptionIndicators();
    }

    function validateBeforeRun(payload) {
      if (payload.tab === 'link') {
        if (!payload.url) {
          el('aex-url-input')?.focus();
          return {
            title: 'Add a source link',
            message: 'Paste a YouTube, podcast, social video, or article URL first.',
          };
        }
        const check = store.detectUrlSource(payload.url);
        if (!check.valid) {
          el('aex-url-input')?.focus();
          return {
            title: check.label || 'Invalid URL',
            message: check.error || 'Enter a valid public http(s) URL.',
          };
        }
      } else if (payload.tab === 'text') {
        if (!payload.lessonId && !payload.text) {
          el('aex-text-input')?.focus();
          return {
            title: 'Add some text',
            message: 'Paste an English transcript or excerpt, or pick a saved lesson below.',
          };
        }
        if (!payload.lessonId && payload.text.length < 20) {
          el('aex-text-input')?.focus();
          return {
            title: 'Text is too short',
            message: 'Paste at least a couple of sentences (20+ characters) to extract phrases from.',
          };
        }
      } else if (payload.tab === 'upload') {
        if (!local.selectedFile) {
          el('aex-file-drop')?.focus();
          return {
            title: 'Choose a file',
            message: 'Drop a file or click Browse to pick text, subtitles, an image, audio, or video.',
          };
        }
      }
      return null;
    }

    /* --------------------------------------------------------------------
       REAL-STAGE SSE EXTRACTION EXECUTION + CANCEL + LIVE PREVIEWS
       -------------------------------------------------------------------- */

    async function handleRun(overridePayload) {
      if (local.running) return;
      hideInlineError();

      const payload = overridePayload ? { ...collectRunPayload(), ...overridePayload } : collectRunPayload();
      const validationError = validateBeforeRun(payload);
      if (validationError) {
        showInlineError(validationError.title, validationError.message, { retryable: false });
        return;
      }

      if (!requireAuth(payload)) return;

      const selection = local.aiSelector?.getSelection?.() || {
        keyId: '',
        model: 'gpt-6-luna',
        variant: 'medium',
      };

      local.lastRunPayload = payload;
      local.running = true;
      local.streamedPreviews = [];
      local.abortController = new AbortController();

      startProgress(payload);
      local.aiSelector?.setDisabled?.(true);

      const streamHandlers = {
        signal: local.abortController.signal,
        onStage: (stageEvent) => {
          updateProgressStage(stageEvent);
        },
        onSourceReady: (sourceEvent) => {
          renderProgressSourceChip(sourceEvent);
        },
        onItemPreview: (preview) => {
          appendStreamPreview(preview);
        },
      };

      try {
        let response;
        if (payload.tab === 'upload') {
          const form = new FormData();
          form.append('file', local.selectedFile);
          form.append('language', payload.language);
          for (const spec of store.OPTION_SPECS) {
            form.append(spec.key, payload[spec.key]);
          }
          if (payload.force) form.append('force', 'true');
          if (selection.keyId) form.append('keyId', selection.keyId);
          if (selection.model) form.append('model', selection.model);
          if (selection.variant) form.append('variant', selection.variant);
          response = await api.extractUploadStream(form, streamHandlers);
        } else {
          const normalizedUrl =
            payload.tab === 'link' ? store.detectUrlSource(payload.url).normalizedUrl || payload.url : undefined;
          response = await api.extractStream(
            {
              inputKind: payload.tab === 'link' ? 'url' : payload.lessonId ? 'lesson' : 'text',
              url: normalizedUrl,
              text: payload.lessonId ? undefined : payload.text || undefined,
              title: payload.title || undefined,
              lessonId: payload.lessonId || undefined,
              language: payload.language,
              extractionType: payload.extractionType,
              style: payload.style,
              level: payload.level,
              focus: payload.focus,
              depth: payload.depth,
              studyGoal: payload.studyGoal,
              order: payload.order,
              force: payload.force || undefined,
              keyId: selection.keyId || undefined,
              model: selection.model || undefined,
              variant: selection.variant || undefined,
            },
            streamHandlers,
          );
        }

        const note = response?.data;
        if (!note?.id) {
          throw new Error('The extraction returned no study guide.');
        }

        store.setPreferredLanguage(payload.language);
        store.cacheNote(note);
        local.lastRunPayload = null;

        // Clear one-shot force checkbox after successful run
        if (el('aex-force-fresh')) {
          el('aex-force-fresh').checked = false;
          syncOptionIndicators();
        }

        if (note.cached) {
          showToast(`Loaded instantly from Library (${note.itemCount} phrases)`);
        } else if (note.fallbackFrom) {
          showToast(`Extracted ${note.itemCount} phrases (failover from ${note.fallbackFrom})`);
        } else {
          showToast(`Extracted ${note.itemCount} American English phrases`);
        }

        nav.onExtractionComplete(note);
      } catch (error) {
        if (error?.name === 'AbortError' || local.abortController?.signal?.aborted) {
          showToast('Extraction cancelled.');
        } else if (error?.status === 401 || error?.code === 'auth_required') {
          requireAuth(payload);
        } else {
          showInlineError(
            'Extraction failed',
            error?.message || 'Something went wrong while extracting phrases.',
            { retryable: true },
          );
        }
      } finally {
        local.running = false;
        local.abortController = null;
        stopProgress();
        local.aiSelector?.setDisabled?.(false);
      }
    }

    function cancelRunningExtraction() {
      if (local.abortController) {
        local.abortController.abort();
      }
    }

    /* --------------------------------------------------------------------
       LIVE PROGRESS, SKELETONS & STREAMED PHRASE PREVIEWS
       -------------------------------------------------------------------- */

    function startProgress(payload) {
      const card = el('aex-progress');
      if (card) {
        card.hidden = false;
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      local.progressStartedAt = Date.now();
      const elapsed = el('aex-progress-elapsed');
      if (elapsed) elapsed.textContent = '0.0s';
      clearInterval(local.progressTimer);
      local.progressTimer = setInterval(() => {
        const target = el('aex-progress-elapsed');
        if (target) {
          target.textContent = `${((Date.now() - local.progressStartedAt) / 1000).toFixed(1)}s`;
        }
      }, 100);

      const sourceChip = el('aex-progress-source-chip');
      if (sourceChip) {
        sourceChip.hidden = true;
        sourceChip.textContent = '';
      }

      const previewWrap = el('aex-stream-preview');
      if (previewWrap) {
        previewWrap.innerHTML = renderSkeletonPreviews();
      }

      updateProgressStage({
        stage: 'detecting',
        label:
          payload.tab === 'link'
            ? 'Connecting to source link…'
            : payload.tab === 'upload'
              ? 'Uploading & reading file…'
              : payload.lessonId
                ? 'Loading saved lesson transcript…'
                : 'Preparing text for extraction…',
        detail: 'Pipeline started',
        progress: 6,
      });
    }

    function updateProgressStage(evt) {
      const stepNum = STAGE_MAP[evt?.stage] || 1;
      const pct = Math.max(4, Math.min(100, Number(evt?.progress) || stepNum * 22));

      const status = el('aex-progress-status');
      const detail = el('aex-progress-detail');
      const bar = el('aex-progress-bar-fill');
      const role = el('aex-progress-bar-role');

      if (status && evt?.label) status.textContent = evt.label;
      if (detail) detail.textContent = evt?.detail || '';
      if (bar) bar.style.width = `${pct}%`;
      if (role) role.setAttribute('aria-valuenow', String(pct));

      for (let i = 1; i <= 4; i++) {
        const stepEl = el(`aex-step-${i}`);
        if (!stepEl) continue;
        stepEl.classList.toggle('done', i < stepNum);
        stepEl.classList.toggle('active', i === stepNum);
      }
    }

    function renderProgressSourceChip(src) {
      const chip = el('aex-progress-source-chip');
      if (!chip || !src) return;
      const parts = [
        src.sourceLabel || store.SOURCE_TYPE_LABELS[src.sourceType] || 'Source',
        src.wordCount ? `${Number(src.wordCount).toLocaleString()} words` : '',
        src.chunkCount > 1 ? `${src.chunkCount} sections` : '',
        src.cached ? 'Cache hit' : '',
      ].filter(Boolean);
      chip.textContent = parts.join(' · ');
      chip.hidden = parts.length === 0;
    }

    function renderSkeletonPreviews() {
      return [0, 1, 2]
        .map(
          () => `
          <div class="aex-stream-skel" aria-hidden="true">
            <span class="aex-skel-bar aex-skel-bar--title"></span>
            <span class="aex-skel-bar aex-skel-bar--meta"></span>
          </div>`,
        )
        .join('');
    }

    function appendStreamPreview(preview) {
      if (!preview?.term) return;
      local.streamedPreviews.push(preview);
      const wrap = el('aex-stream-preview');
      if (!wrap) return;

      const countEl = el('aex-progress-detail');
      if (countEl) {
        countEl.textContent = `${local.streamedPreviews.length} grounded phrase${
          local.streamedPreviews.length === 1 ? '' : 's'
        } streamed so far…`;
      }

      const recent = local.streamedPreviews.slice(-6);
      wrap.innerHTML = recent
        .map(
          (item) => `
          <div class="aex-stream-pill">
            <span class="aex-stream-term">${escapeHtml(item.term)}</span>
            ${item.ipa ? `<span class="aex-stream-ipa" dir="ltr">${escapeHtml(item.ipa)}</span>` : ''}
            ${item.cefr ? `<span class="aex-stream-cefr">${escapeHtml(item.cefr)}</span>` : ''}
          </div>`,
        )
        .join('');
    }

    function stopProgress() {
      clearInterval(local.progressTimer);
      local.progressTimer = null;
      const card = el('aex-progress');
      if (card) card.hidden = true;
    }

    function showInlineError(title, message, options = {}) {
      const wrap = el('aex-inline-error');
      const titleEl = el('aex-err-title');
      const msgEl = el('aex-err-msg');
      const retry = el('aex-err-retry');
      if (titleEl) titleEl.textContent = title || 'Extraction failed';
      if (msgEl) msgEl.textContent = message || 'Something went wrong.';
      if (retry) retry.hidden = !(options.retryable && local.lastRunPayload);
      if (wrap) {
        wrap.hidden = false;
        wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    function hideInlineError() {
      const wrap = el('aex-inline-error');
      if (wrap) wrap.hidden = true;
    }

    /* --------------------------------------------------------------------
       RECENT GUIDES SHELF
       -------------------------------------------------------------------- */

    function renderRecent() {
      const row = el('aex-recent-row');
      const empty = el('aex-empty-recent');
      const total = el('aex-recent-total');
      if (!row) return;

      const items = store.state.recentHistory.slice(0, 3);
      if (total) total.textContent = String(store.state.historyTotal);

      row.innerHTML = items
        .map((item) => {
          const stats = store.historyStudyState(item);
          return `
            <button type="button" class="aex-recent-mini" data-state="${stats.tone}" data-aex-open="${escapeHtml(
              item.id,
            )}" aria-label="Open ${escapeHtml(item.title || 'study guide')} — ${escapeHtml(stats.label)}">
              <span class="aex-recent-top">
                ${store.sourceBadgeHtml(item.source_type)}
                <span class="aex-recent-meta">${escapeHtml(store.formatDate(item.created_at))}</span>
              </span>
              <span class="aex-recent-title">${escapeHtml(item.title || 'Untitled study guide')}</span>
              <span class="aex-recent-progress">
                ${store.studyStateChipHtml(stats)}
                ${store.studyStateTrackHtml(stats, { decorative: true })}
                <span class="aex-card-progress-count ltr-num">${store.studyStateCount(stats)}</span>
              </span>
              <span class="aex-recent-meta">
                <span>${escapeHtml(item.creator || 'Source')}</span>
                <span class="ltr-num">${Number(item.item_count) || 0} phrases</span>
              </span>
            </button>
          `;
        })
        .join('');

      if (empty) empty.hidden = items.length > 0;
    }

    /* --------------------------------------------------------------------
       LIFECYCLE & EVENTS
       -------------------------------------------------------------------- */

    function bindEvents() {
      const root = el('aex-view-extract');
      if (!root) return;

      root.querySelectorAll('[data-aex-source]').forEach((btn) => {
        btn.addEventListener('click', () => setSourceTab(btn.dataset.aexSource));
      });

      const urlInput = el('aex-url-input');
      urlInput?.addEventListener('input', () => {
        hideInlineError();
        updateUrlDetection();
      });
      urlInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleRun();
        }
      });

      el('aex-url-clear')?.addEventListener('click', () => {
        if (urlInput) {
          urlInput.value = '';
          urlInput.focus();
          updateUrlDetection();
        }
      });

      el('aex-paste-btn')?.addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (urlInput && text) {
            urlInput.value = text.trim();
            urlInput.focus();
            updateUrlDetection();
          }
        } catch {
          urlInput?.focus();
          showToast('Press Cmd+V (or Ctrl+V) to paste the link.');
        }
      });

      const textInput = el('aex-text-input');
      textInput?.addEventListener('input', () => {
        hideInlineError();
        updateTextStats();
      });

      el('aex-lesson-select')?.addEventListener('change', () => {
        hideInlineError();
        syncSelectedLessonUi();
      });

      el('aex-lesson-clear-btn')?.addEventListener('click', () => {
        const select = el('aex-lesson-select');
        if (select) select.value = '';
        syncSelectedLessonUi();
        el('aex-text-input')?.focus();
      });

      el('aex-refresh-lessons-btn')?.addEventListener('click', async () => {
        await deps.refreshLessonSources();
        showToast(
          store.state.lessonSources.length > 0
            ? 'Saved lesson transcripts refreshed.'
            : 'No saved transcripts found.',
        );
      });

      const fileInput = el('aex-file-input');
      fileInput?.addEventListener('change', () => setSelectedFile(fileInput.files?.[0] || null));
      el('aex-file-clear')?.addEventListener('click', (e) => {
        e.preventDefault();
        setSelectedFile(null);
      });

      const dropzone = el('aex-file-drop');
      if (dropzone) {
        ['dragenter', 'dragover'].forEach((ev) => {
          dropzone.addEventListener(ev, (e) => {
            e.preventDefault();
            dropzone.classList.add('is-dragover');
          });
        });
        ['dragleave', 'drop'].forEach((ev) => {
          dropzone.addEventListener(ev, (e) => {
            e.preventDefault();
            dropzone.classList.remove('is-dragover');
          });
        });
        dropzone.addEventListener('drop', (e) => {
          const file = e.dataTransfer?.files?.[0];
          if (file) setSelectedFile(file);
        });
        dropzone.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput?.click();
          }
        });
      }

      el('aex-language-select')?.addEventListener('change', (e) => {
        store.setPreferredLanguage(e.target.value);
      });

      for (const spec of store.OPTION_SPECS) {
        el(spec.selectId)?.addEventListener('change', () => {
          saveCurrentOptions();
          syncOptionIndicators();
        });
      }
      el('aex-force-fresh')?.addEventListener('change', syncOptionIndicators);
      el('aex-reset-options-btn')?.addEventListener('click', resetOptions);

      el('aex-options-toggle')?.addEventListener('click', () => {
        const btn = el('aex-options-toggle');
        const drawer = el('aex-advanced-options');
        if (!btn || !drawer) return;
        const isOpen = drawer.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });

      el('aex-progress-cancel')?.addEventListener('click', cancelRunningExtraction);

      el('aex-err-retry')?.addEventListener('click', () => {
        if (local.lastRunPayload) {
          restoreRunPayload(local.lastRunPayload);
          handleRun();
        }
      });
      el('aex-err-dismiss')?.addEventListener('click', hideInlineError);

      el('aex-jump-library')?.addEventListener('click', () => nav.goToLibrary());

      root.addEventListener('click', (e) => {
        const openBtn = e.target.closest('[data-aex-open]');
        if (openBtn) {
          e.preventDefault();
          nav.goToDetail(openBtn.dataset.aexOpen);
        }
      });
    }

    async function mount() {
      if (local.mounted) return;
      local.mounted = true;
      bindEvents();
      mountAiSelector();
      populateLanguageSelect();
      populateExtractionOptions(store.loadSavedOptions());
      renderRecent();

      local.unsubs.push(
        store.subscribe('config:changed', (cfg) => {
          populateExtractionOptions();
          const fi = el('aex-file-input');
          if (fi && Array.isArray(cfg?.acceptedUploadTypes)) {
            fi.setAttribute('accept', cfg.acceptedUploadTypes.join(','));
          }
        }),
        store.subscribe('history:changed', renderRecent),
        store.subscribe('lessons:changed', populateLessonSelect),
        store.subscribe('language:changed', (code) => {
          const s = el('aex-language-select');
          if (s && s.value !== code) s.value = code;
        }),
      );

      if (local.aiSelector) {
        await local.aiSelector.init();
      }
    }

    function onActivate(options = {}) {
      renderRecent();
      if (options.focusInput) {
        if (local.sourceTab === 'text') el('aex-text-input')?.focus();
        else if (local.sourceTab === 'upload') el('aex-file-drop')?.focus();
        else el('aex-url-input')?.focus();
      }
    }

    function onLanguagesLoaded() {
      populateLanguageSelect();
    }

    async function resumePending(payload) {
      restoreRunPayload(payload);
      await handleRun();
    }

    async function reextractFromNote(note) {
      if (!note) return;
      if (note.sourceUrl && /^https?:\/\//i.test(note.sourceUrl)) {
        restoreRunPayload({
          tab: 'link',
          url: note.sourceUrl,
          language: note.targetLanguage || store.getPreferredLanguage(),
          force: true,
        });
      } else if (note.sourceText) {
        restoreRunPayload({
          tab: 'text',
          text: note.sourceText,
          title: note.title || '',
          language: note.targetLanguage || store.getPreferredLanguage(),
          force: true,
        });
      }
      await handleRun();
    }

    return {
      mount,
      onActivate,
      onLanguagesLoaded,
      resumePending,
      reextractFromNote,
      focusUrl: () => el('aex-url-input')?.focus(),
      getAiSelector: () => local.aiSelector,
    };
  }

  global.FlaptapA2PExtractPage = { create };
})(window);
