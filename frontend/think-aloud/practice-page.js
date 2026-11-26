/* ==========================================================================
   THINK ALOUD — PRACTICE ARENA & AI COACH RENDERER (think-aloud/practice-page.js)
   ========================================================================== */

(function (global) {
  'use strict';

  function create({ store, api, nav, recorder }) {
    const U = global.FlaptapUtils;
    const esc = U.escapeHtml;
    const el = (id) => document.getElementById(id);

    const local = {
      mounted: false,
      aiSelector: null,
      wordLookupTeardown: null,
      arena: null, // active drill runtime state
      timerId: null,
      curveballShown: false,
      audioLevel: 0,
      isRecording: false,
      isTranscribing: false,
    };

    function showToast(msg, isErr) {
      store.ws()?.showToast?.(msg, isErr);
    }

    function formatClock(sec) {
      const s = Math.max(0, Math.round(Number(sec) || 0));
      const m = Math.floor(s / 60);
      const r = s % 60;
      return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
    }

    function stopTimer() {
      if (local.timerId) {
        clearInterval(local.timerId);
        local.timerId = null;
      }
    }

    function cleanupMedia() {
      stopTimer();
      local.isRecording = false;
      local.audioLevel = 0;
      const vid = el('ta-camera-preview');
      recorder?.cleanup?.(vid);
    }

    function mountAiSelector() {
      if (local.aiSelector || !global.FlaptapAiSelector) return;
      const mount = el('ta-ai-selector-mount');
      if (!mount) return;
      local.aiSelector = global.FlaptapAiSelector.create({
        container: mount,
        idPrefix: 'ta-aisel',
        persistenceKey: 'think_aloud',
        title: 'AI Coach Model',
        compact: true,
        showRunButton: false,
        hideMetaChips: true,
        fetcher: api.apiFetch,
        onToast: showToast,
      });
      local.aiSelector.init?.();
    }

    function getAiSelection() {
      const sel = local.aiSelector?.getSelection?.();
      return sel ? { keyId: sel.keyId, model: sel.modelId || sel.model, variant: sel.variantId || sel.variant } : {};
    }

    /* ----------------------------------------------------------------------
       DAILY 3-STEP RITUAL & AUTOMATICITY STAGE STRIP
       ---------------------------------------------------------------------- */

    function renderOverviewStrip() {
      const host = el('ta-ritual-host');
      if (!host) return;
      const signedIn = Boolean(store.currentUser());
      const ov = store.state.overview;

      if (!signedIn) {
        host.innerHTML = `
          <div class="ta-ritual-card">
            <div class="ta-ritual-top">
              <div class="ta-stage-pill-group">
                <span class="ta-stage-badge">Stage 1 · Direct Anchoring</span>
                <span class="ta-stage-meta">Daily 3-step fluency loop: Reflex Warm-Up → Compression → Unscripted Camera</span>
              </div>
              <div class="ta-ritual-progress-summary ltr-num">Sign in to track daily progress</div>
            </div>
          </div>
        `;
        return;
      }

      const stage = ov?.stage || {
        stage: 1,
        label: 'Direct Anchoring',
        description: 'Breaking the L1 word-for-word loop via circumlocution and short daily turns.',
        nextStageLabel: 'Stage 2: Chunked Flow',
        progressPct: 10,
      };
      const ritual = ov?.dailyRitual || {
        completedCount: 0,
        totalCount: 3,
        isComplete: false,
        steps: [
          { id: 'warmup_reflex', title: '1. Warm-Up Reflex', subtitle: 'Circumlocution (Concept -> English)', targetModes: ['circumlocution'], completed: false },
          { id: 'core_compression', title: '2. Core Compression', subtitle: '4/3/2 Loop or Framework Sprint', targetModes: ['four_three_two', 'framework'], completed: false },
          { id: 'real_transfer', title: '3. Real-World Transfer', subtitle: 'Unscripted Camera & Q&A', targetModes: ['camera_qa'], completed: false },
        ],
      };

      host.innerHTML = `
        <div class="ta-ritual-card">
          <div class="ta-ritual-top">
            <div class="ta-stage-pill-group">
              <span class="ta-stage-badge ltr-num">Stage ${stage.stage} · ${esc(stage.label)}</span>
              <span class="ta-stage-meta">${esc(stage.description)} (${stage.progressPct}% toward ${esc(stage.nextStageLabel)})</span>
            </div>
            <div class="ta-ritual-progress-summary ltr-num">
              <span>Today's Ritual: <strong>${ritual.completedCount}/${ritual.totalCount}</strong></span>
              ${ov?.avgWpm ? `<span>· Avg <strong>${ov.avgWpm} WPM</strong></span>` : ''}
            </div>
          </div>
          <div class="ta-ritual-steps">
            ${ritual.steps
              .map(
                (st) => `
                <button type="button" class="ta-ritual-step ${st.completed ? 'is-done' : ''}" data-ta-ritual-mode="${esc(st.targetModes?.[0] || 'four_three_two')}">
                  <div>
                    <div class="ta-ritual-step-title">${esc(st.title)}</div>
                    <div class="ta-ritual-step-sub">${esc(st.subtitle)}</div>
                  </div>
                  <span class="ta-ritual-check" aria-hidden="true">
                    ${st.completed ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                  </span>
                </button>
              `,
              )
              .join('')}
          </div>
        </div>
      `;
    }

    /* ----------------------------------------------------------------------
       CONFIGURATOR DESK
       ---------------------------------------------------------------------- */

    function renderConfigurator() {
      const host = el('ta-configurator-host');
      if (!host) return;

      const modes = store.state.modes.length
        ? store.state.modes
        : [
            { id: 'four_three_two', shortLabel: '4/3/2 Loop', tagline: 'Retell the same idea across 3 shrinking timers to outrun translation.', scienceBasis: 'Paul Nation 4/3/2 + Levelt Priming' },
            { id: 'framework', shortLabel: 'Framework', tagline: 'Offload structure onto a proven speaking spine.', scienceBasis: 'Stanford GSB Cognitive Offloading' },
            { id: 'circumlocution', shortLabel: 'Taboo Reflex', tagline: 'Explain 5 concepts in pure English without touching forbidden words.', scienceBasis: 'Direct Conceptual Mediation' },
            { id: 'camera_qa', shortLabel: 'Camera & Q&A', tagline: 'Unscripted camera/mic turn with a mid-flight follow-up curveball.', scienceBasis: 'Paraphrase Buffer + Pushed Output' },
          ];

      const domains = store.state.domains.length
        ? store.state.domains
        : [
            { id: 'programming_ai', label: 'Programming & AI', sampleTopics: [] },
            { id: 'tech_systems', label: 'Tech & Product', sampleTopics: [] },
            { id: 'business_econ', label: 'Business & Economics', sampleTopics: [] },
            { id: 'camera_creator', label: 'Unscripted Camera', sampleTopics: [] },
            { id: 'everyday', label: 'Everyday Life', sampleTopics: [] },
            { id: 'custom', label: 'Custom Topic', sampleTopics: [] },
          ];

      const frameworks = store.state.frameworks.length
        ? store.state.frameworks
        : [{ id: 'what_so_what_now_what', title: 'What -> So What -> Now What' }];

      const presets = store.state.presets.length
        ? store.state.presets
        : [{ id: 'standard', label: 'Standard 4/3/2 (90 / 60 / 45s)' }];

      const activeModeObj = modes.find((m) => m.id === store.state.mode) || modes[0];
      const showPreset = store.state.mode === 'four_three_two';
      const showFramework = store.state.mode === 'framework' || store.state.mode === 'camera_qa';

      host.innerHTML = `
        <div class="ta-card">
          <div class="ta-command-topbar">
            <div class="ta-mode-tabs" role="tablist" aria-label="Training Mode">
              ${modes
                .map(
                  (m) => `
                  <button type="button" class="ta-mode-tab ${store.state.mode === m.id ? 'active' : ''}" data-ta-mode="${esc(m.id)}" role="tab" aria-selected="${store.state.mode === m.id ? 'true' : 'false'}">
                    ${esc(m.shortLabel || m.title)}
                  </button>
                `,
                )
                .join('')}
            </div>
            <span class="ta-mode-science-pill">${esc(activeModeObj.scienceBasis || '')}</span>
          </div>

          <div class="ta-command-body">
            <div class="ta-mode-brief">
              <span>${esc(activeModeObj.tagline || '')}</span>
            </div>

            <div>
              <span class="ta-field-label">Topic Domain</span>
              <div class="ta-domain-pills" role="group" aria-label="Topic Domain">
                ${domains
                  .map(
                    (d) => `
                    <button type="button" class="ta-pill-btn ${store.state.domain === d.id ? 'active' : ''}" data-ta-domain="${esc(d.id)}">
                      ${esc(d.label)}
                    </button>
                  `,
                  )
                  .join('')}
              </div>
            </div>

            <div class="ta-controls-grid">
              <div>
                <label class="ta-field-label" for="ta-topic-input">Custom Angle / Topic (Optional)</label>
                <input id="ta-topic-input" type="text" class="ta-input" value="${esc(store.state.customTopic)}" placeholder="e.g. Why SQLite beats microservices early on..." autocomplete="off" />
              </div>

              <div>
                <label class="ta-field-label" for="ta-level-select">Target Fluency Level</label>
                <select id="ta-level-select" class="ta-select">
                  <option value="B1" ${store.state.cefrLevel === 'B1' ? 'selected' : ''}>B1 · Clear Directness</option>
                  <option value="B2" ${store.state.cefrLevel === 'B2' ? 'selected' : ''}>B2 · Natural Spontaneity</option>
                  <option value="C1" ${store.state.cefrLevel === 'C1' ? 'selected' : ''}>C1 · Sharp Executive Flow</option>
                </select>
              </div>

              ${
                showPreset
                  ? `
                <div>
                  <label class="ta-field-label" for="ta-preset-select">4/3/2 Compression Timing</label>
                  <select id="ta-preset-select" class="ta-select">
                    ${presets
                      .map(
                        (p) => `<option value="${esc(p.id)}" ${store.state.presetId === p.id ? 'selected' : ''}>${esc(p.label)}</option>`,
                      )
                      .join('')}
                  </select>
                </div>`
                  : showFramework
                    ? `
                <div>
                  <label class="ta-field-label" for="ta-framework-select">Speaking Structure</label>
                  <select id="ta-framework-select" class="ta-select">
                    ${frameworks
                      .map(
                        (f) => `<option value="${esc(f.id)}" ${store.state.frameworkId === f.id ? 'selected' : ''}>${esc(f.title)}</option>`,
                      )
                      .join('')}
                  </select>
                </div>`
                    : `
                <div>
                  <label class="ta-field-label">Card Format</label>
                  <div class="ta-select" style="display:flex;align-items:center;opacity:0.85;">5 Concepts · 30s/Card · Zero L1</div>
                </div>`
              }
            </div>

            <div class="ta-command-actions">
              <div class="ta-input-mode-group" role="group" aria-label="Speaking Input Mode">
                <button type="button" class="ta-input-mode-btn ${store.state.inputMode === 'mic' ? 'active' : ''}" data-ta-input-mode="mic">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path></svg>
                  <span>Mic</span>
                </button>
                <button type="button" class="ta-input-mode-btn ${store.state.inputMode === 'camera' ? 'active' : ''}" data-ta-input-mode="camera">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"></path><rect x="2" y="6" width="14" height="12" rx="2"></rect></svg>
                  <span>Camera + Mic</span>
                </button>
                <button type="button" class="ta-input-mode-btn ${store.state.inputMode === 'text' ? 'active' : ''}" data-ta-input-mode="text">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>
                  <span>Fast-Type</span>
                </button>
              </div>

              <button type="button" class="btn-vox" id="ta-generate-prompt-btn" ${store.state.generatingPrompt ? 'disabled' : ''}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                <span>${store.state.generatingPrompt ? 'Preparing Challenge...' : 'Launch Speaking Challenge'}</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    /* ----------------------------------------------------------------------
       ARENA STATE MACHINE & RUNTIME
       ---------------------------------------------------------------------- */

    function initArenaFromPrompt(prompt) {
      cleanupMedia();
      local.curveballShown = false;

      const meta = prompt.promptMeta || {};
      let rounds = [];

      if (prompt.mode === 'four_three_two') {
        const durations = Array.isArray(meta.roundDurationsSec) && meta.roundDurationsSec.length === 3
          ? meta.roundDurationsSec
          : [90, 60, 45];
        rounds = durations.map((sec, idx) => ({
          roundIndex: idx + 1,
          label: `Round ${idx + 1} (${sec}s)`,
          targetDurationSec: sec,
          actualDurationSec: 0,
          transcript: '',
          done: false,
        }));
      } else if (prompt.mode === 'circumlocution') {
        const cards = Array.isArray(meta.cards) && meta.cards.length
          ? meta.cards
          : [{ id: 'c1', concept: 'Latency', hint: 'Time delay before a response starts', forbiddenWords: ['delay', 'slow', 'time', 'wait'] }];
        rounds = cards.map((card, idx) => ({
          roundIndex: idx + 1,
          label: `Card ${idx + 1}/${cards.length}: ${card.concept}`,
          targetDurationSec: 30,
          actualDurationSec: 0,
          transcript: '',
          conceptId: card.id,
          conceptLabel: card.concept,
          hint: card.hint,
          forbiddenWords: card.forbiddenWords || [],
          done: false,
        }));
      } else {
        const dur = prompt.mode === 'camera_qa' ? 90 : 75;
        rounds = [
          {
            roundIndex: 1,
            label: prompt.mode === 'camera_qa' ? 'Unscripted Camera & Q&A' : 'Framework Sprint',
            targetDurationSec: dur,
            actualDurationSec: 0,
            transcript: '',
            curveballTriggered: false,
            done: false,
          },
        ];
      }

      local.arena = {
        prompt,
        rounds,
        currentRoundIdx: 0,
        remainingSec: rounds[0].targetDurationSec,
        elapsedSec: 0,
        started: false,
        awaitingNextRound: false,
        allRoundsDone: false,
        showStarters: false,
      };
    }

    function computeLiveRoundStats(round, elapsedSec) {
      const text = String(round?.transcript || '').trim();
      const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
      const secs = Math.max(1, Number(elapsedSec) || Number(round?.actualDurationSec) || 1);
      const wpm = words > 0 ? Math.round((words / secs) * 60) : 0;
      return { words, wpm };
    }

    function checkForbiddenHitsClient(transcript, forbiddenWords) {
      const lower = String(transcript || '').toLowerCase();
      if (!lower || !Array.isArray(forbiddenWords)) return [];
      return forbiddenWords.filter((w) => {
        const clean = String(w || '').trim().toLowerCase();
        if (!clean) return false;
        const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escaped}(?:s|es|ed|ing)?\\b`, 'i').test(lower);
      });
    }

    function renderArena() {
      const host = el('ta-arena-host');
      if (!host) return;
      const arena = local.arena;
      if (!arena) {
        host.innerHTML = '';
        return;
      }

      const { prompt, rounds, currentRoundIdx } = arena;
      const curRound = rounds[currentRoundIdx] || rounds[0];
      const meta = prompt.promptMeta || {};
      const framework = store.state.frameworks.find((f) => f.id === prompt.frameworkId);
      const isCamera = store.state.inputMode === 'camera';
      const isFastType = store.state.inputMode === 'text';

      // Beat Pacer active index
      let activeBeatIdx = 0;
      if (framework?.beats?.length && curRound.targetDurationSec > 0) {
        const pct = Math.min(99, (arena.elapsedSec / curRound.targetDurationSec) * 100);
        let acc = 0;
        for (let i = 0; i < framework.beats.length; i++) {
          acc += framework.beats[i].targetPct;
          if (pct <= acc) {
            activeBeatIdx = i;
            break;
          }
          activeBeatIdx = i;
        }
      }

      const forbiddenHits =
        prompt.mode === 'circumlocution'
          ? checkForbiddenHitsClient(curRound.transcript, curRound.forbiddenWords)
          : [];

      const liveStats = computeLiveRoundStats(curRound, arena.elapsedSec || curRound.actualDurationSec || 1);

      host.innerHTML = `
        <div class="ta-arena-card">
          <div class="ta-arena-header">
            <div>
              <div class="ta-arena-badges">
                <span class="ta-badge ta-badge--blue">${esc(prompt.mode.replace(/_/g, ' ').toUpperCase())}</span>
                <span class="ta-badge">${esc(prompt.cefrLevel)}</span>
                ${framework ? `<span class="ta-badge">${esc(framework.title)}</span>` : ''}
                ${arena.started ? `<span class="ta-badge ta-badge--green ltr-num" id="ta-live-wpm-badge">${liveStats.words} words · ${liveStats.wpm} WPM</span>` : ''}
              </div>
              <h2 class="ta-arena-title">${esc(prompt.promptTitle)}</h2>
              <p class="ta-arena-body">${esc(prompt.promptBody)}</p>
            </div>

            <div class="ta-timer-box">
              <span class="ta-timer-label">${esc(curRound.label)}</span>
              <span class="ta-timer-clock ltr-num ${arena.remainingSec <= 10 && arena.started ? 'is-urgent' : ''}" id="ta-timer-clock">${formatClock(arena.remainingSec)}</span>
              <span class="ta-timer-label ltr-num">Round ${currentRoundIdx + 1} of ${rounds.length}</span>
            </div>
          </div>

          ${
            prompt.mode === 'camera_qa'
              ? `
              <div class="ta-grounding-bar">
                <span><strong>Mindset Anchor:</strong> ${esc(meta.groundingCue || 'Conversation, not performance. Dare to be dull.')}</span>
                ${meta.openingHookGoal ? `<span class="ta-badge">Hook Goal: ${esc(meta.openingHookGoal)}</span>` : ''}
              </div>
            `
              : ''
          }

          ${
            prompt.mode === 'camera_qa' && meta.curveballQuestion && local.curveballShown
              ? `
              <div class="ta-curveball-banner" id="ta-curveball-banner">
                <span class="ta-curveball-kicker">Live Curveball Follow-Up — Use Paraphrase Buffer ("So if I'm hearing you right...")</span>
                <div class="ta-curveball-question">${esc(meta.curveballQuestion)}</div>
              </div>
            `
              : prompt.mode === 'camera_qa' && meta.curveballQuestion && !arena.allRoundsDone
                ? `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                  <span class="ta-stage-meta">A live Q&amp;A curveball will pop up automatically at ~${meta.curveballTriggerSec || 38}s into your turn.</span>
                  <button type="button" class="btn-secondary btn-xs" id="ta-trigger-curveball-btn">Reveal Curveball Now</button>
                </div>
              `
                : ''
          }

          ${
            prompt.mode === 'four_three_two'
              ? `
              <div class="ta-rounds-strip">
                ${rounds
                  .map((r, i) => {
                    const st = computeLiveRoundStats(r, r.actualDurationSec || r.targetDurationSec);
                    return `
                      <div class="ta-round-pill ${i === currentRoundIdx && !arena.allRoundsDone ? 'is-active' : r.done ? 'is-done' : ''}">
                        <div>
                          <div style="font-size:0.82rem;font-weight:650;">${esc(r.label)}</div>
                          <div style="font-size:0.74rem;color:var(--ap-text-secondary);" class="ltr-num">
                            ${r.done ? `${st.words}w · ${st.wpm} WPM` : i === currentRoundIdx ? 'Active' : 'Upcoming'}
                          </div>
                        </div>
                        <span class="ta-badge ltr-num">${r.targetDurationSec}s</span>
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            `
              : ''
          }

          ${
            (prompt.mode === 'framework' || prompt.mode === 'camera_qa') && framework?.beats?.length
              ? `
              <div class="ta-beats-rail">
                ${framework.beats
                  .map((b, i) => {
                    const customCue = meta.beatCues?.[i] || b.cue;
                    return `
                      <div class="ta-beat-card ${arena.started && i === activeBeatIdx ? 'is-active' : arena.started && i < activeBeatIdx ? 'is-done' : ''}">
                        <div class="ta-beat-label">${esc(b.label)}</div>
                        <div class="ta-beat-cue">${esc(customCue)}</div>
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            `
              : ''
          }

          ${
            prompt.mode === 'circumlocution'
              ? `
              <div class="ta-taboo-card">
                <div class="ta-taboo-head">
                  <div>
                    <div class="ta-field-label" style="margin-bottom:4px;">Explain in Pure English (Zero L1, Zero Forbidden Words)</div>
                    <div class="ta-taboo-concept">${esc(curRound.conceptLabel || 'Concept')}</div>
                  </div>
                  <span id="ta-taboo-status-badge" class="ta-badge ltr-num ${forbiddenHits.length ? 'ta-badge--red' : 'ta-badge--green'}">
                    ${forbiddenHits.length ? `${forbiddenHits.length} Forbidden Hit${forbiddenHits.length === 1 ? '' : 's'}` : 'Clean Paraphrase'}
                  </span>
                </div>
                <div class="ta-taboo-hint">${esc(curRound.hint || '')}</div>
                <div class="ta-forbidden-row">
                  <span style="font-size:0.76rem;font-weight:640;color:var(--ap-text-tertiary);">DO NOT SAY:</span>
                  ${(curRound.forbiddenWords || [])
                    .map(
                      (fw) =>
                        `<span class="ta-forbidden-chip ${forbiddenHits.includes(fw) ? 'is-hit' : ''}">${esc(fw)}</span>`,
                    )
                    .join('')}
                </div>
              </div>
            `
              : ''
          }

          ${
            arena.awaitingNextRound
              ? `
              <div class="ta-grounding-bar" style="background:var(--ap-green-wash);border-color:rgba(52,199,89,0.3);">
                <span><strong>Round ${currentRoundIdx} Complete!</strong> Same idea, tighter timer next—your brain has already pre-compiled the blueprint.</span>
                <button type="button" class="btn-vox btn-sm" id="ta-next-round-btn">Start ${esc(curRound.label)}</button>
              </div>
            `
              : ''
          }

          <div class="ta-arena-workspace ${isCamera ? 'has-camera' : ''}">
            ${
              isCamera
                ? `
                <div class="ta-camera-frame">
                  <video id="ta-camera-preview" autoplay playsinline muted></video>
                  <span class="ta-camera-status" id="ta-camera-status">${local.isRecording ? 'Recording On-Lens' : 'Camera Ready'}</span>
                </div>
              `
                : ''
            }
            <div style="display:flex;flex-direction:column;gap:10px;">
              ${
                !isFastType
                  ? `
                  <div class="ta-level-meter" title="Live microphone level">
                    <div class="ta-level-fill" id="ta-level-fill" style="width:${local.audioLevel}%"></div>
                  </div>
                `
                  : ''
              }
              <label class="ta-field-label" for="ta-transcript-box" style="margin-bottom:0;">
                ${isFastType ? 'Fast-Type Stream of Thought (Do not edit or translate—keep flowing)' : 'Live Captured Transcript (Editable before AI review)'}
              </label>
              <textarea id="ta-transcript-box" class="ta-textarea" rows="5" placeholder="${
                isFastType
                  ? 'Type straight in English as fast as you think—no backspacing, no L1 lookups...'
                  : 'Press Start Speaking below. Live speech captions appear here (or local Whisper transcribes automatically when you stop)...'
              }">${esc(curRound.transcript)}</textarea>
            </div>
          </div>

          <div class="ta-arena-controls">
            <div class="ta-btn-group">
              ${
                !arena.allRoundsDone && !arena.awaitingNextRound
                  ? isFastType
                    ? !arena.started
                      ? `<button type="button" class="btn-vox" id="ta-start-turn-btn">Start Timed Turn</button>`
                      : `<button type="button" class="btn-vox" id="ta-finish-round-btn">${currentRoundIdx < rounds.length - 1 ? 'Complete & Next' : 'Finish Turn'}</button>`
                    : !local.isRecording
                      ? `<button type="button" class="btn-vox" id="ta-start-rec-btn" ${local.isTranscribing ? 'disabled' : ''}>${local.isTranscribing ? 'Transcribing Audio...' : arena.started ? 'Resume Mic' : 'Start Speaking'}</button>`
                      : `<button type="button" class="btn-vox" style="background:var(--ap-red-solid);" id="ta-stop-rec-btn">Stop &amp; Capture Round</button>`
                  : ''
              }

              ${
                !arena.allRoundsDone && prompt.mode === 'circumlocution' && !arena.awaitingNextRound && currentRoundIdx < rounds.length - 1
                  ? `<button type="button" class="btn-secondary" id="ta-skip-card-btn">Next Card →</button>`
                  : ''
              }
            </div>

            <div class="ta-btn-group">
              <button type="button" class="btn-secondary btn-sm" id="ta-discard-arena-btn">Reset</button>
              <button type="button" class="btn-vox" id="ta-submit-eval-btn" ${store.state.evaluatingSession || local.isRecording || local.isTranscribing ? 'disabled' : ''}>
                ${store.state.evaluatingSession ? 'Coaching in Progress...' : 'Get AI Coach Review'}
              </button>
            </div>
          </div>

          ${
            meta.starterHints?.length
              ? `
              <div class="ta-starter-drawer">
                <button type="button" class="btn-secondary btn-xs" id="ta-toggle-starters-btn">
                  ${arena.showStarters ? 'Hide Autopilot Starters' : 'Need a 2-Second Opening? Show Autopilot Starters'}
                </button>
                ${
                  arena.showStarters
                    ? `<div class="ta-starter-chips">${meta.starterHints
                        .map((h) => `<button type="button" class="ta-starter-chip" data-ta-speak="${esc(h)}">${esc(h)}</button>`)
                        .join('')}</div>`
                    : ''
                }
              </div>
            `
              : ''
          }
        </div>
      `;
    }

    function syncActiveRoundText() {
      const box = el('ta-transcript-box');
      if (!box || !local.arena) return;
      const cur = local.arena.rounds[local.arena.currentRoundIdx];
      if (cur) cur.transcript = box.value;
    }

    function startCountdownTimer() {
      stopTimer();
      const arena = local.arena;
      if (!arena) return;
      arena.started = true;
      arena.awaitingNextRound = false;

      local.timerId = setInterval(() => {
        const cur = arena.rounds[arena.currentRoundIdx];
        if (!cur) return;
        arena.elapsedSec += 1;
        cur.actualDurationSec = arena.elapsedSec;
        if (arena.remainingSec > 0) {
          arena.remainingSec -= 1;
        }

        const clock = el('ta-timer-clock');
        if (clock) {
          clock.textContent = formatClock(arena.remainingSec);
          clock.classList.toggle('is-urgent', arena.remainingSec <= 10);
        }

        const statsBadge = el('ta-live-wpm-badge');
        if (statsBadge) {
          const st = computeLiveRoundStats(cur, arena.elapsedSec);
          statsBadge.textContent = `${st.words} words · ${st.wpm} WPM`;
        }

        // Camera & Q&A timed curveball reveal
        const triggerSec = arena.prompt?.promptMeta?.curveballTriggerSec || 38;
        if (
          arena.prompt?.mode === 'camera_qa' &&
          arena.prompt?.promptMeta?.curveballQuestion &&
          !local.curveballShown &&
          arena.elapsedSec >= triggerSec
        ) {
          local.curveballShown = true;
          cur.curveballTriggered = true;
          syncActiveRoundText();
          renderArena();
          showToast('Live Q&A Curveball arrived — paraphrase & bridge!');
        }

        if (arena.remainingSec === 0) {
          if (local.isRecording) {
            handleStopRecording();
          } else {
            finishCurrentRound();
          }
        }
      }, 1000);
    }

    function finishCurrentRound() {
      stopTimer();
      syncActiveRoundText();
      const arena = local.arena;
      if (!arena) return;
      const cur = arena.rounds[arena.currentRoundIdx];
      if (cur) {
        cur.done = true;
        cur.actualDurationSec = Math.max(1, arena.elapsedSec || cur.actualDurationSec || cur.targetDurationSec);
      }

      if (arena.currentRoundIdx < arena.rounds.length - 1) {
        arena.currentRoundIdx += 1;
        const nextRound = arena.rounds[arena.currentRoundIdx];
        arena.remainingSec = nextRound.targetDurationSec;
        arena.elapsedSec = 0;
        arena.started = false;
        arena.awaitingNextRound = arena.prompt.mode === 'four_three_two';
      } else {
        arena.allRoundsDone = true;
        arena.awaitingNextRound = false;
      }
      renderArena();
    }

    async function handleStartRecording() {
      if (!local.arena || local.isRecording) return;
      syncActiveRoundText();
      const withCamera = store.state.inputMode === 'camera';
      const cur = local.arena.rounds[local.arena.currentRoundIdx];
      const existingPrefix = cur.transcript ? `${cur.transcript.trim()} ` : '';

      try {
        local.isRecording = true;
        renderArena();
        const vid = el('ta-camera-preview');
        await recorder.start({
          withCamera,
          videoEl: vid,
          onLevel: (lvl) => {
            local.audioLevel = lvl;
            const fill = el('ta-level-fill');
            if (fill) fill.style.width = `${lvl}%`;
          },
          onInterimTranscript: (txt) => {
            if (!local.arena) return;
            const activeRound = local.arena.rounds[local.arena.currentRoundIdx];
            if (!activeRound) return;
            activeRound.transcript = `${existingPrefix}${txt}`.trim();
            const box = el('ta-transcript-box');
            if (box && document.activeElement !== box) {
              box.value = activeRound.transcript;
            }
          },
        });
        startCountdownTimer();
        renderArena();
      } catch (err) {
        local.isRecording = false;
        showToast(err?.message || 'Could not start microphone/camera.', true);
        renderArena();
      }
    }

    async function handleStopRecording() {
      if (!local.isRecording) return;
      stopTimer();
      syncActiveRoundText();
      const arena = local.arena;
      const cur = arena?.rounds?.[arena.currentRoundIdx];
      const vid = el('ta-camera-preview');

      local.isRecording = false;
      const { blob, liveTranscript } = await recorder.stop({ videoEl: vid });

      if (cur && liveTranscript && liveTranscript.length > (cur.transcript || '').length) {
        cur.transcript = liveTranscript;
      }

      // If browser SpeechRecognition didn't produce text (e.g. Firefox or silent mic caption), run local Whisper transcription
      if (cur && (!cur.transcript || cur.transcript.trim().length < 4) && blob && blob.size > 1024) {
        local.isTranscribing = true;
        renderArena();
        try {
          const res = await api.transcribeAudio(blob, 'think_aloud.webm');
          if (res?.text) {
            cur.transcript = res.text;
            showToast('Transcribed speech locally via Whisper.');
          }
        } catch (err) {
          showToast(err?.message || 'Speech transcription failed—you can type or edit below.', true);
        } finally {
          local.isTranscribing = false;
        }
      }

      finishCurrentRound();
    }

    /* ----------------------------------------------------------------------
       COACHING REPORT RENDERER (SHARED WITH SESSION DETAIL)
       ---------------------------------------------------------------------- */

    function renderCoachingReportHtml(session) {
      const c = session?.coaching || {};
      const m = session?.metrics || {};
      const recastHtml = global.FlaptapWordLookup?.tokenizeClickableWords
        ? global.FlaptapWordLookup.tokenizeClickableWords(esc(c.shadowableRecast || ''), {})
        : esc(c.shadowableRecast || '');

      return `
        <div class="ta-report-stack" data-ta-report-id="${esc(session.id)}">
          <div class="ta-card">
            <div class="ta-command-topbar">
              <div>
                <span class="ta-badge ta-badge--blue">AI Automaticity Coach</span>
                <span class="ta-badge ltr-num">${m.avgWpm || 0} WPM · ${m.totalWords || 0} words · ${m.fillerRatePer100 || 0} fillers/100w</span>
                ${session.mode === 'four_three_two' ? `<span class="ta-badge ${m.wpmGainPct >= 0 ? 'ta-badge--green' : ''} ltr-num">4/3/2 Speed Delta: ${m.wpmGainPct >= 0 ? '+' : ''}${m.wpmGainPct}%</span>` : ''}
              </div>
              <span class="ta-stage-meta">${esc(session.modelUsed || '')}</span>
            </div>

            <div class="ta-command-body">
              <h3 style="margin:0;font-family:var(--ap-font-display);font-size:1.25rem;">${esc(c.headlineVerdict || '')}</h3>

              <div class="ta-scores-grid">
                <div class="ta-score-tile">
                  <span class="ta-score-val ltr-num">${c.directnessScore || 0}</span>
                  <span class="ta-score-lbl">Directness (Anti-L1)</span>
                </div>
                <div class="ta-score-tile">
                  <span class="ta-score-val ltr-num">${c.flowScore || 0}</span>
                  <span class="ta-score-lbl">Spontaneous Flow</span>
                </div>
                <div class="ta-score-tile">
                  <span class="ta-score-val ltr-num">${c.structureScore || 0}</span>
                  <span class="ta-score-lbl">Structure &amp; Clarity</span>
                </div>
                <div class="ta-score-tile">
                  <span class="ta-score-val ltr-num">${c.naturalnessScore || 0}</span>
                  <span class="ta-score-lbl">American Naturalness</span>
                </div>
              </div>

              ${
                c.strengths?.length
                  ? `<div>
                      <span class="ta-field-label">What Worked Well</span>
                      <ul style="margin:0;padding-inline-start:18px;display:flex;flex-direction:column;gap:4px;font-size:0.9rem;color:var(--ap-text-secondary);">
                        ${c.strengths.map((s) => `<li>${esc(s)}</li>`).join('')}
                      </ul>
                    </div>`
                  : ''
              }

              ${
                c.curveballFeedback
                  ? `<div class="ta-grounding-bar"><span><strong>Curveball Response:</strong> ${esc(c.curveballFeedback)}</span></div>`
                  : ''
              }

              <div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap;">
                  <span class="ta-field-label" style="margin-bottom:0;">Shadowable American Recast (Click any word for IPA &amp; lookup)</span>
                  <div class="ta-btn-group">
                    <button type="button" class="btn-secondary btn-xs" data-ta-speak="${esc(c.shadowableRecast || '')}">Listen</button>
                    <button type="button" class="btn-secondary btn-xs" data-ta-copy="${esc(c.shadowableRecast || '')}">Copy</button>
                  </div>
                </div>
                <div class="ta-recast-box" id="ta-recast-clickable">${recastHtml}</div>
              </div>

              ${
                c.calquesAndUpgrades?.length
                  ? `<div>
                      <span class="ta-field-label">Calque Radar &amp; Natural American Upgrades</span>
                      <div class="ta-calque-grid">
                        ${c.calquesAndUpgrades
                          .map(
                            (u) => `
                            <div class="ta-calque-card">
                              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                                <span class="ta-badge ta-badge--orange">${esc(u.issueType.replace(/_/g, ' '))}</span>
                                <button type="button" class="btn-secondary btn-xs" data-ta-speak="${esc(u.naturalUpgrade)}">Listen</button>
                              </div>
                              <div class="ta-calque-before">${esc(u.original)}</div>
                              <div class="ta-calque-after">${esc(u.naturalUpgrade)}</div>
                              ${u.spokenIpa ? `<div class="ta-ipa">${esc(u.spokenIpa)}</div>` : ''}
                              <div style="font-size:0.82rem;color:var(--ap-text-secondary);">${esc(u.whyUnnatural)}</div>
                              ${u.exampleSentence ? `<div style="font-size:0.82rem;color:var(--ap-text-primary);">"${esc(u.exampleSentence)}"</div>` : ''}
                            </div>
                          `,
                          )
                          .join('')}
                      </div>
                    </div>`
                  : ''
              }

              ${
                c.extractedChunks?.length
                  ? `<div>
                      <span class="ta-field-label">Reusable [Slot] Chunks to Automate</span>
                      <div class="ta-chunk-grid">
                        ${c.extractedChunks
                          .map(
                            (ch, idx) => `
                            <div class="ta-chunk-card">
                              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                                <strong style="font-size:0.96rem;">${esc(ch.phrase)}</strong>
                                <div class="ta-btn-group">
                                  <button type="button" class="btn-secondary btn-xs" data-ta-speak="${esc(ch.example || ch.phrase)}">Listen</button>
                                  <button type="button" class="btn-secondary btn-xs" data-ta-save-vocab="${idx}">Save</button>
                                </div>
                              </div>
                              ${ch.patternSlot ? `<span class="ta-badge">${esc(ch.patternSlot)}</span>` : ''}
                              ${ch.ipa ? `<span class="ta-ipa">${esc(ch.ipa)}</span>` : ''}
                              <div style="font-size:0.84rem;color:var(--ap-text-secondary);">${esc(ch.meaning)}</div>
                              ${ch.localizedMeaning ? `<div style="font-size:0.84rem;color:var(--ap-blue);font-weight:560;">${esc(ch.localizedMeaning)}</div>` : ''}
                              ${ch.example ? `<div style="font-size:0.82rem;color:var(--ap-text-primary);">"${esc(ch.example)}"</div>` : ''}
                            </div>
                          `,
                          )
                          .join('')}
                      </div>
                    </div>`
                  : ''
              }

              <div class="ta-grounding-bar">
                <span><strong>Tomorrow’s Micro-Mission:</strong> ${esc(c.microMission || '')}</span>
                <button type="button" class="btn-secondary btn-xs" id="ta-practice-again-btn">New Challenge</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function bindRecastWordLookup(container, session) {
      if (local.wordLookupTeardown) {
        try {
          local.wordLookupTeardown();
        } catch {}
        local.wordLookupTeardown = null;
      }
      const recastEl = container?.querySelector('#ta-recast-clickable');
      if (!recastEl || !global.FlaptapWordLookup) return;

      recastEl.addEventListener('click', (e) => {
        const wordEl = e.target.closest('.clickable-word');
        if (!wordEl) return;
        global.FlaptapWordLookup.open({
          word: wordEl.dataset.word || wordEl.textContent,
          contextSentence: session?.coaching?.shadowableRecast || '',
          sourceEl: wordEl,
          canSpeak: true,
          payload: {
            contextSentence: session?.coaching?.shadowableRecast || '',
            language: session?.nativeLanguage || store.currentUser()?.nativeLanguage || 'ar',
            lessonTitle: session?.promptTitle || 'Think Aloud Recast',
          },
        });
      });

      if (global.FlaptapWordLookup.bindSelectionLookup) {
        local.wordLookupTeardown = global.FlaptapWordLookup.bindSelectionLookup(recastEl, {
          getContext: () => ({
            contextSentence: session?.coaching?.shadowableRecast || '',
            language: session?.nativeLanguage || store.currentUser()?.nativeLanguage || 'ar',
          }),
        });
      }
    }

    function renderReport() {
      const host = el('ta-report-host');
      if (!host) return;
      const session = store.state.lastReportSession;
      if (!session) {
        host.innerHTML = '';
        return;
      }
      host.innerHTML = renderCoachingReportHtml(session);
      bindRecastWordLookup(host, session);
    }

    /* ----------------------------------------------------------------------
       ACTIONS (WITH AUTH GATE + PENDING ACTION RESUME)
       ---------------------------------------------------------------------- */

    async function runPromptGeneration(overridePayload = null) {
      const ws = store.ws();
      const payload = overridePayload || {
        mode: store.state.mode,
        domain: store.state.domain,
        cefrLevel: store.state.cefrLevel,
        frameworkId: store.state.frameworkId,
        presetId: store.state.presetId,
        customTopic: store.state.customTopic,
        ...getAiSelection(),
      };

      if (!store.currentUser() && ws?.requireAuthBeforeAction) {
        const allowed = ws.requireAuthBeforeAction({ type: 'think_aloud_prompt', payload });
        if (!allowed) return;
      }

      store.state.generatingPrompt = true;
      store.state.lastReportSession = null;
      renderConfigurator();
      renderReport();

      try {
        const res = await api.generatePrompt(payload);
        store.state.activePrompt = res.prompt;
        initArenaFromPrompt(res.prompt);
        renderArena();
        el('ta-arena-host')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (err) {
        showToast(err?.message || 'Could not generate speaking challenge.', true);
      } finally {
        store.state.generatingPrompt = false;
        renderConfigurator();
      }
    }

    async function runSessionEvaluation(overridePayload = null) {
      syncActiveRoundText();
      const ws = store.ws();
      const arena = local.arena;

      const payload = overridePayload || {
        mode: arena.prompt.mode,
        domain: arena.prompt.domain,
        cefrLevel: arena.prompt.cefrLevel,
        frameworkId: arena.prompt.frameworkId,
        promptTitle: arena.prompt.promptTitle,
        promptBody: arena.prompt.promptBody,
        promptMeta: arena.prompt.promptMeta,
        inputMode: store.state.inputMode,
        nativeLanguage: store.currentUser()?.nativeLanguage || 'ar',
        rounds: arena.rounds.map((r) => ({
          roundIndex: r.roundIndex,
          label: r.label,
          targetDurationSec: r.targetDurationSec,
          actualDurationSec: Math.max(1, r.actualDurationSec || r.targetDurationSec),
          transcript: r.transcript || '',
          conceptId: r.conceptId,
          conceptLabel: r.conceptLabel,
          forbiddenWords: r.forbiddenWords,
          curveballTriggered: Boolean(r.curveballTriggered),
        })),
        ...getAiSelection(),
      };

      if (!payload.rounds.some((r) => String(r.transcript || '').trim().length > 0)) {
        showToast('Speak or type at least a few sentences before requesting AI coaching.', true);
        return;
      }

      if (!store.currentUser() && ws?.requireAuthBeforeAction) {
        const allowed = ws.requireAuthBeforeAction({ type: 'think_aloud_evaluate', payload });
        if (!allowed) return;
      }

      store.state.evaluatingSession = true;
      renderArena();

      try {
        const res = await api.evaluateSession(payload);
        store.state.lastReportSession = res.session;
        showToast('Session evaluated & saved to your progress!');
        renderReport();
        await Promise.all([
          loadOverview(),
          ws?.refreshStats ? ws.refreshStats() : Promise.resolve(),
        ]);
        el('ta-report-host')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        showToast(err?.message || 'AI evaluation failed.', true);
      } finally {
        store.state.evaluatingSession = false;
        renderArena();
      }
    }

    async function loadOverview() {
      if (!store.currentUser()) {
        store.state.overview = null;
        renderOverviewStrip();
        return;
      }
      try {
        const res = await api.getOverview();
        store.state.overview = res.overview || null;
        renderOverviewStrip();
        store.emit('overview:updated', store.state.overview);
      } catch {
        // Non-fatal
      }
    }

    function bindEvents() {
      const root = el('ta-view-practice');
      if (!root) return;

      root.addEventListener('click', async (e) => {
        const ritualBtn = e.target.closest('[data-ta-ritual-mode]');
        if (ritualBtn) {
          store.state.mode = ritualBtn.getAttribute('data-ta-ritual-mode');
          store.savePrefs();
          renderConfigurator();
          runPromptGeneration();
          return;
        }

        const modeBtn = e.target.closest('[data-ta-mode]');
        if (modeBtn) {
          store.state.mode = modeBtn.getAttribute('data-ta-mode');
          store.savePrefs();
          renderConfigurator();
          return;
        }

        const domBtn = e.target.closest('[data-ta-domain]');
        if (domBtn) {
          store.state.domain = domBtn.getAttribute('data-ta-domain');
          store.savePrefs();
          renderConfigurator();
          return;
        }

        const inpBtn = e.target.closest('[data-ta-input-mode]');
        if (inpBtn) {
          store.state.inputMode = inpBtn.getAttribute('data-ta-input-mode');
          store.savePrefs();
          renderConfigurator();
          if (local.arena) renderArena();
          return;
        }

        if (e.target.closest('#ta-generate-prompt-btn')) {
          runPromptGeneration();
          return;
        }
        if (e.target.closest('#ta-start-turn-btn')) {
          startCountdownTimer();
          renderArena();
          el('ta-transcript-box')?.focus();
          return;
        }
        if (e.target.closest('#ta-finish-round-btn') || e.target.closest('#ta-skip-card-btn')) {
          finishCurrentRound();
          return;
        }
        if (e.target.closest('#ta-next-round-btn')) {
          if (store.state.inputMode === 'text') {
            startCountdownTimer();
            renderArena();
            el('ta-transcript-box')?.focus();
          } else {
            await handleStartRecording();
          }
          return;
        }
        if (e.target.closest('#ta-start-rec-btn')) {
          await handleStartRecording();
          return;
        }
        if (e.target.closest('#ta-stop-rec-btn')) {
          await handleStopRecording();
          return;
        }
        if (e.target.closest('#ta-trigger-curveball-btn')) {
          local.curveballShown = true;
          if (local.arena?.rounds?.[0]) local.arena.rounds[0].curveballTriggered = true;
          syncActiveRoundText();
          renderArena();
          return;
        }
        if (e.target.closest('#ta-toggle-starters-btn')) {
          if (local.arena) {
            syncActiveRoundText();
            local.arena.showStarters = !local.arena.showStarters;
            renderArena();
          }
          return;
        }
        if (e.target.closest('#ta-discard-arena-btn')) {
          cleanupMedia();
          local.arena = null;
          renderArena();
          return;
        }
        if (e.target.closest('#ta-submit-eval-btn')) {
          await runSessionEvaluation();
          return;
        }
        if (e.target.closest('#ta-practice-again-btn')) {
          store.state.lastReportSession = null;
          renderReport();
          runPromptGeneration();
          return;
        }

        const speakBtn = e.target.closest('[data-ta-speak]');
        if (speakBtn) {
          const txt = speakBtn.getAttribute('data-ta-speak');
          if (txt) global.FlaptapWordLookup?.speakText?.(txt);
          return;
        }

        const copyBtn = e.target.closest('[data-ta-copy]');
        if (copyBtn) {
          const txt = copyBtn.getAttribute('data-ta-copy');
          if (txt && navigator.clipboard) {
            navigator.clipboard.writeText(txt).then(() => showToast('Copied recast to clipboard.'));
          }
          return;
        }

        const saveVocabBtn = e.target.closest('[data-ta-save-vocab]');
        if (saveVocabBtn) {
          const idx = Number(saveVocabBtn.getAttribute('data-ta-save-vocab'));
          const ch = store.state.lastReportSession?.coaching?.extractedChunks?.[idx];
          if (!ch) return;
          try {
            await api.saveVocabularyItem({
              term: ch.phrase,
              ipa: ch.ipa || '',
              partOfSpeech: 'phrase',
              definition: ch.meaning || ch.whenToUse || 'Spontaneous speaking chunk',
              translation: ch.localizedMeaning || '',
              contextSentence: ch.example || '',
              lessonTitle: store.state.lastReportSession?.promptTitle || 'Think Aloud',
            });
            saveVocabBtn.textContent = 'Saved ✓';
            saveVocabBtn.disabled = true;
            await store.ws()?.refreshVocabulary?.();
            showToast(`Saved "${ch.phrase}" to Vocabulary Vault.`);
          } catch (err) {
            showToast(err?.message || 'Could not save chunk.', true);
          }
        }
      });

      root.addEventListener('input', (e) => {
        if (e.target.id === 'ta-topic-input') {
          store.state.customTopic = e.target.value;
        } else if (e.target.id === 'ta-transcript-box' && local.arena) {
          const cur = local.arena.rounds[local.arena.currentRoundIdx];
          if (cur) {
            cur.transcript = e.target.value;
            if (local.arena.prompt?.mode === 'circumlocution') {
              const hits = checkForbiddenHitsClient(cur.transcript, cur.forbiddenWords);
              const chips = root.querySelectorAll('.ta-forbidden-chip');
              chips.forEach((chip) => {
                chip.classList.toggle('is-hit', hits.includes(chip.textContent));
              });
              const badge = el('ta-taboo-status-badge');
              if (badge) {
                badge.classList.toggle('ta-badge--red', hits.length > 0);
                badge.classList.toggle('ta-badge--green', hits.length === 0);
                badge.textContent = hits.length
                  ? `${hits.length} Forbidden Hit${hits.length === 1 ? '' : 's'}`
                  : 'Clean Paraphrase';
              }
            }
          }
        }
      });

      root.addEventListener('change', (e) => {
        if (e.target.id === 'ta-level-select') {
          store.state.cefrLevel = e.target.value;
          store.savePrefs();
        } else if (e.target.id === 'ta-preset-select') {
          store.state.presetId = e.target.value;
          store.savePrefs();
        } else if (e.target.id === 'ta-framework-select') {
          store.state.frameworkId = e.target.value;
          store.savePrefs();
        }
      });
    }

    function mount() {
      if (local.mounted) return;
      local.mounted = true;
      mountAiSelector();
      renderOverviewStrip();
      renderConfigurator();
      bindEvents();
    }

    function startWithTopic({ mode, customTopic, frameworkId } = {}) {
      if (mode) store.state.mode = mode;
      if (customTopic !== undefined) store.state.customTopic = customTopic;
      if (frameworkId) store.state.frameworkId = frameworkId;
      store.savePrefs();
      renderConfigurator();
      runPromptGeneration();
    }

    return {
      mount,
      onActivate: () => {
        renderOverviewStrip();
        renderConfigurator();
        loadOverview();
      },
      onDeactivate: () => {
        cleanupMedia();
      },
      refreshOverview: loadOverview,
      renderConfigurator,
      renderOverviewStrip,
      renderReport,
      renderCoachingReportHtml,
      bindRecastWordLookup,
      startWithTopic,
      resumePendingPrompt: (payload) => runPromptGeneration(payload),
      resumePendingEvaluate: (payload) => runSessionEvaluation(payload),
    };
  }

  global.FlaptapTAPracticePage = { create };
})(window);
