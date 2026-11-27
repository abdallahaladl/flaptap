/* ==========================================================================
   THINK ALOUD — SESSIONS & AUTOMATICITY PROGRESS (think-aloud/sessions-page.js)
   ========================================================================== */

(function (global) {
  'use strict';

  function create({ store, api, nav, practicePage }) {
    const U = global.FlaptapUtils;
    const esc = U.escapeHtml;
    const el = (id) => document.getElementById(id);

    const local = {
      mounted: false,
      loading: false,
      selectedIds: new Set(),
    };

    function showToast(msg, isErr) {
      store.ws()?.showToast?.(msg, isErr);
    }

    async function loadSessions() {
      if (!store.currentUser()) {
        store.state.sessionsItems = [];
        store.state.sessionsTotal = 0;
        renderList();
        return;
      }
      local.loading = true;
      renderList();
      try {
        const [ovRes, listRes] = await Promise.all([
          api.getOverview(),
          api.listSessions({
            mode: store.state.sessionsFilterMode,
            domain: store.state.sessionsFilterDomain,
            q: store.state.sessionsSearch,
            page: store.state.sessionsPage,
            limit: 10,
          }),
        ]);
        store.state.overview = ovRes?.overview || store.state.overview;
        store.state.sessionsItems = Array.isArray(listRes?.items) ? listRes.items : [];
        store.state.sessionsTotal = Number(listRes?.total) || 0;
        store.state.sessionsTotalPages = Number(listRes?.totalPages) || 1;
      } catch (err) {
        console.error('Failed to load Think Aloud sessions:', err);
      } finally {
        local.loading = false;
        renderList();
      }
    }

    function renderList() {
      const host = el('ta-sessions-host');
      if (!host) return;
      const signedIn = Boolean(store.currentUser());
      const ov = store.state.overview || {};

      if (!signedIn) {
        host.innerHTML = `
          <div class="ta-empty-box">
            <h4>Sign in to track your Spontaneous Speaking Progress</h4>
            <p style="margin:0;color:var(--ap-text-secondary);max-width:460px;">
              Every 4/3/2 speed delta, WPM trend, Calque Radar fix, and shadowable recast stays saved privately in your workspace.
            </p>
            <button type="button" class="btn-vox btn-sm" id="ta-sessions-signin-btn">Sign in to Continue</button>
          </div>
        `;
        return;
      }

      const items = store.state.sessionsItems || [];
      const validIds = new Set(items.map((s) => s.id));
      for (const id of Array.from(local.selectedIds)) {
        if (!validIds.has(id)) local.selectedIds.delete(id);
      }
      const allSelected = items.length > 0 && items.every((s) => local.selectedIds.has(s.id));

      host.innerHTML = `
        <div class="ta-metrics-grid">
          <div class="ta-metric-card">
            <div class="ta-metric-label">Speaking Minutes</div>
            <div class="ta-metric-val ltr-num">${ov.totalSpeakingMinutes || 0} min</div>
            <div class="ta-stage-meta ltr-num">${ov.totalSessions || 0} total sessions</div>
          </div>
          <div class="ta-metric-card">
            <div class="ta-metric-label">Average Speed</div>
            <div class="ta-metric-val ltr-num">${ov.avgWpm || 0} WPM</div>
            <div class="ta-stage-meta ltr-num">${ov.wpmDeltaRecent > 0 ? `+${ov.wpmDeltaRecent}` : ov.wpmDeltaRecent || 0} WPM recent trend</div>
          </div>
          <div class="ta-metric-card">
            <div class="ta-metric-label">Directness Score</div>
            <div class="ta-metric-val ltr-num">${ov.avgDirectness || 0}/100</div>
            <div class="ta-stage-meta">Anti-translation index</div>
          </div>
          <div class="ta-metric-card">
            <div class="ta-metric-label">4/3/2 Speed Gain</div>
            <div class="ta-metric-val ltr-num">${ov.avgFourThreeTwoGainPct >= 0 ? '+' : ''}${ov.avgFourThreeTwoGainPct || 0}%</div>
            <div class="ta-stage-meta">Round 1 → Round 3 compression</div>
          </div>
        </div>

        <div class="ta-card">
          <div class="ta-command-topbar">
            <div class="ta-btn-group">
              <select id="ta-sessions-mode-filter" class="ta-select" style="width:auto;" aria-label="Filter by mode">
                <option value="all" ${store.state.sessionsFilterMode === 'all' ? 'selected' : ''}>All Modes</option>
                <option value="four_three_two" ${store.state.sessionsFilterMode === 'four_three_two' ? 'selected' : ''}>4/3/2 Loop</option>
                <option value="framework" ${store.state.sessionsFilterMode === 'framework' ? 'selected' : ''}>Framework Sprint</option>
                <option value="circumlocution" ${store.state.sessionsFilterMode === 'circumlocution' ? 'selected' : ''}>Circumlocution</option>
                <option value="camera_qa" ${store.state.sessionsFilterMode === 'camera_qa' ? 'selected' : ''}>Camera &amp; Q&amp;A</option>
              </select>
              <select id="ta-sessions-domain-filter" class="ta-select" style="width:auto;" aria-label="Filter by domain">
                <option value="all" ${store.state.sessionsFilterDomain === 'all' ? 'selected' : ''}>All Domains</option>
                <option value="programming_ai" ${store.state.sessionsFilterDomain === 'programming_ai' ? 'selected' : ''}>Programming &amp; AI</option>
                <option value="tech_systems" ${store.state.sessionsFilterDomain === 'tech_systems' ? 'selected' : ''}>Tech &amp; Product</option>
                <option value="business_econ" ${store.state.sessionsFilterDomain === 'business_econ' ? 'selected' : ''}>Business &amp; Economics</option>
                <option value="camera_creator" ${store.state.sessionsFilterDomain === 'camera_creator' ? 'selected' : ''}>Unscripted Camera</option>
                <option value="everyday" ${store.state.sessionsFilterDomain === 'everyday' ? 'selected' : ''}>Everyday Life</option>
              </select>
            </div>
            <div class="ta-btn-group">
              <input id="ta-sessions-search" type="search" class="ta-input" style="max-width:240px;" value="${esc(store.state.sessionsSearch)}" placeholder="Search sessions..." />
              ${
                items.length > 0
                  ? `<button type="button" class="btn-danger-ghost btn-sm" id="ta-clear-all-sessions-btn">Clear All Sessions</button>`
                  : ''
              }
            </div>
          </div>
          ${
            items.length > 0
              ? `<div class="bulk-actions-bar" style="margin-top:12px;">
                  <label class="bulk-select-label">
                    <input type="checkbox" id="ta-sessions-select-all" ${allSelected ? 'checked' : ''} />
                    <span>Select all visible</span>
                    <span class="section-count ltr-num">(${local.selectedIds.size} selected)</span>
                  </label>
                  <div class="bulk-buttons-group">
                    <button type="button" class="apple-action-pill is-danger" id="ta-bulk-delete-sessions-btn" ${local.selectedIds.size === 0 ? 'disabled' : ''}>Delete Selected</button>
                  </div>
                </div>`
              : ''
          }
        </div>

        ${
          local.loading
            ? `<div class="ta-empty-box"><p>Loading speaking sessions...</p></div>`
            : items.length === 0
              ? `<div class="ta-empty-box">
                  <h4>No speaking sessions yet</h4>
                  <p style="margin:0;color:var(--ap-text-secondary);">Launch a 4/3/2 Loop or Camera Q&amp;A turn in Practice to receive your first AI Automaticity Review.</p>
                  <button type="button" class="btn-vox btn-sm" id="ta-sessions-start-btn">Start Practicing</button>
                </div>`
              : `<div style="display:flex;flex-direction:column;gap:12px;">
                  ${items
                    .map(
                      (s) => `
                      <div class="ta-session-card">
                        <div style="display:flex;align-items:flex-start;gap:10px;min-width:0;flex:1;">
                          <input type="checkbox" data-ta-select-session="${esc(s.id)}" ${local.selectedIds.has(s.id) ? 'checked' : ''} style="margin-top:4px;width:15px;height:15px;" aria-label="Select ${esc(s.promptTitle)}" />
                          <div style="min-width:0;flex:1;">
                            <div class="ta-arena-badges" style="margin-bottom:6px;">
                              <span class="ta-badge ta-badge--blue">${esc(s.mode.replace(/_/g, ' '))}</span>
                              <span class="ta-badge">${esc(s.domain.replace(/_/g, ' '))}</span>
                              <span class="ta-badge ltr-num">${s.avgWpm} WPM · ${s.overallScore}/100</span>
                            </div>
                            <div style="font-weight:660;font-size:1rem;margin-bottom:3px;">${esc(s.promptTitle)}</div>
                            <div style="font-size:0.84rem;color:var(--ap-text-secondary);">${esc(s.coaching?.headlineVerdict || s.promptBody)}</div>
                          </div>
                        </div>
                        <div class="ta-btn-group">
                          <span class="ta-stage-meta ltr-num">${U.formatShortDate(s.createdAt)}</span>
                          <button type="button" class="btn-secondary btn-sm" data-ta-open-session="${esc(s.id)}">Inspect</button>
                          <button type="button" class="btn-danger-ghost btn-sm" data-ta-delete-session="${esc(s.id)}">Delete</button>
                        </div>
                      </div>
                    `,
                    )
                    .join('')}
                </div>`
        }
      `;
    }

    async function openDetail(sessionId) {
      const host = el('ta-detail-host');
      if (!host) return;
      if (!store.currentUser()) {
        host.innerHTML = `<div class="ta-empty-box"><h4>Sign in to view this session.</h4></div>`;
        return;
      }
      host.innerHTML = `<div class="ta-empty-box"><p>Loading session report...</p></div>`;
      try {
        const res = await api.getSession(sessionId);
        const s = res.session;
        store.state.activeDetailSession = s;

        host.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
              <button type="button" class="btn-secondary btn-sm" id="ta-detail-back-btn">← All Sessions</button>
              <div class="ta-btn-group">
                <button type="button" class="btn-secondary btn-sm" id="ta-detail-retry-btn">Retry This Topic</button>
                <button type="button" class="btn-danger-ghost btn-sm" id="ta-detail-delete-btn">Delete Session</button>
              </div>
            </div>

            <div class="ta-card">
              <div class="ta-command-body">
                <div class="ta-arena-badges">
                  <span class="ta-badge ta-badge--blue">${esc(s.mode.replace(/_/g, ' '))}</span>
                  <span class="ta-badge">${esc(s.domain.replace(/_/g, ' '))}</span>
                  <span class="ta-badge ltr-num">${U.formatShortDate(s.createdAt)}</span>
                </div>
                <h2 style="margin:0;font-family:var(--ap-font-display);">${esc(s.promptTitle)}</h2>
                <p style="margin:0;color:var(--ap-text-secondary);">${esc(s.promptBody)}</p>

                <div>
                  <span class="ta-field-label">Your Verbatim Rounds</span>
                  <div style="display:flex;flex-direction:column;gap:8px;">
                    ${(s.rounds || [])
                      .map(
                        (r) => `
                        <div class="ta-calque-card">
                          <div style="display:flex;justify-content:space-between;gap:8px;font-size:0.8rem;color:var(--ap-text-secondary);">
                            <strong>${esc(r.label)}</strong>
                            <span class="ltr-num">${r.wordCount} words · ${r.wpm} WPM · ${r.actualDurationSec}s</span>
                          </div>
                          <div style="font-size:0.9rem;line-height:1.55;">${esc(r.transcript)}</div>
                        </div>
                      `,
                      )
                      .join('')}
                  </div>
                </div>
              </div>
            </div>

            ${practicePage.renderCoachingReportHtml(s)}
          </div>
        `;
        practicePage.bindRecastWordLookup(host, s);
      } catch (err) {
        host.innerHTML = `<div class="ta-empty-box"><h4>Session not found</h4><button type="button" class="btn-secondary btn-sm" id="ta-detail-back-btn">Back to Sessions</button></div>`;
      }
    }

    function bindEvents() {
      const sessionsRoot = el('ta-view-sessions');
      if (sessionsRoot) {
        sessionsRoot.addEventListener('click', async (e) => {
          if (e.target.closest('#ta-sessions-signin-btn')) {
            store.ws()?.requireAuthBeforeAction?.({ type: 'section', section: 'think-aloud' });
            return;
          }
          if (e.target.closest('#ta-sessions-start-btn')) {
            nav.goToPractice();
            return;
          }
          const openBtn = e.target.closest('[data-ta-open-session]');
          if (openBtn) {
            nav.goToDetail(openBtn.getAttribute('data-ta-open-session'));
            return;
          }
          const delBtn = e.target.closest('[data-ta-delete-session]');
          if (delBtn) {
            const id = delBtn.getAttribute('data-ta-delete-session');
            const target = (store.state.sessionsItems || []).find((s) => s.id === id);
            await global.FlaptapConfirm?.confirmAction?.({
              title: 'Delete speaking session?',
              message: 'Permanently removes this session, its verbatim rounds, coaching report, and practice log.',
              detail: target?.promptTitle || '',
              confirmLabel: 'Delete Session',
              tone: 'danger',
              onConfirm: async () => {
                await api.deleteSession(id);
                local.selectedIds.delete(id);
                if (store.state.activeDetailSession?.id === id) store.state.activeDetailSession = null;
                if (store.state.lastReportSession?.id === id) store.state.lastReportSession = null;
                showToast('Session deleted.');
                await Promise.all([loadSessions(), practicePage.refreshOverview()]);
                store.ws()?.refreshStats?.();
              },
              onError: (err) => {
                showToast(err?.message || 'Could not delete session.', true);
              },
            });
            return;
          }

          if (e.target.closest('#ta-bulk-delete-sessions-btn')) {
            const ids = Array.from(local.selectedIds);
            if (!ids.length) return;
            await global.FlaptapConfirm?.confirmAction?.({
              title: 'Delete selected sessions?',
              message: `Permanently delete ${ids.length} speaking session(s) and their practice logs.`,
              detail: `${ids.length} session(s) selected`,
              confirmLabel: 'Delete Selected',
              tone: 'danger',
              onConfirm: async () => {
                await api.bulkDeleteSessions(ids);
                const idSet = new Set(ids);
                local.selectedIds.clear();
                if (store.state.activeDetailSession && idSet.has(store.state.activeDetailSession.id)) {
                  store.state.activeDetailSession = null;
                }
                if (store.state.lastReportSession && idSet.has(store.state.lastReportSession.id)) {
                  store.state.lastReportSession = null;
                }
                showToast(`Deleted ${ids.length} session(s).`);
                await Promise.all([loadSessions(), practicePage.refreshOverview()]);
                store.ws()?.refreshStats?.();
              },
              onError: (err) => {
                showToast(err?.message || 'Bulk delete failed.', true);
              },
            });
            return;
          }

          if (e.target.closest('#ta-clear-all-sessions-btn')) {
            await global.FlaptapConfirm?.confirmAction?.({
              title: 'Clear all speaking sessions?',
              message: 'Permanently delete every Think Aloud session, coaching report, and practice log.',
              detail: `${(store.state.sessionsItems || []).length} session(s)`,
              confirmLabel: 'Clear All Sessions',
              tone: 'danger',
              onConfirm: async () => {
                await api.clearAllSessions();
                local.selectedIds.clear();
                store.state.activeDetailSession = null;
                store.state.lastReportSession = null;
                showToast('All speaking sessions cleared.');
                await Promise.all([loadSessions(), practicePage.refreshOverview()]);
                store.ws()?.refreshStats?.();
              },
              onError: (err) => {
                showToast(err?.message || 'Could not clear sessions.', true);
              },
            });
          }
        });

        sessionsRoot.addEventListener('change', (e) => {
          if (e.target.id === 'ta-sessions-select-all') {
            const items = store.state.sessionsItems || [];
            if (e.target.checked) items.forEach((s) => local.selectedIds.add(s.id));
            else local.selectedIds.clear();
            renderList();
            return;
          }
          const cb = e.target.closest('[data-ta-select-session]');
          if (cb) {
            const id = cb.getAttribute('data-ta-select-session');
            if (cb.checked) local.selectedIds.add(id);
            else local.selectedIds.delete(id);
            renderList();
            return;
          }
          if (e.target.id === 'ta-sessions-mode-filter') {
            store.state.sessionsFilterMode = e.target.value;
            store.state.sessionsPage = 1;
            loadSessions();
          } else if (e.target.id === 'ta-sessions-domain-filter') {
            store.state.sessionsFilterDomain = e.target.value;
            store.state.sessionsPage = 1;
            loadSessions();
          }
        });

        sessionsRoot.addEventListener('input', (e) => {
          if (e.target.id === 'ta-sessions-search') {
            store.state.sessionsSearch = e.target.value;
            store.state.sessionsPage = 1;
            loadSessions();
          }
        });
      }

      const detailRoot = el('ta-view-detail');
      if (detailRoot) {
        detailRoot.addEventListener('click', async (e) => {
          if (e.target.closest('#ta-detail-back-btn')) {
            nav.goToSessions();
            return;
          }
          if (e.target.closest('#ta-detail-retry-btn')) {
            const s = store.state.activeDetailSession;
            if (s) {
              nav.goToPracticeWithTopic({
                mode: s.mode,
                customTopic: s.promptTitle,
                frameworkId: s.frameworkId,
              });
            }
            return;
          }
          if (e.target.closest('#ta-detail-delete-btn')) {
            const s = store.state.activeDetailSession;
            if (!s) return;
            await global.FlaptapConfirm?.confirmAction?.({
              title: 'Delete speaking session?',
              message: 'Permanently removes this session, its verbatim rounds, coaching report, and practice log.',
              detail: s.promptTitle || '',
              confirmLabel: 'Delete Session',
              tone: 'danger',
              onConfirm: async () => {
                await api.deleteSession(s.id);
                if (store.state.lastReportSession?.id === s.id) {
                  store.state.lastReportSession = null;
                }
                store.state.activeDetailSession = null;
                showToast('Session deleted.');
                await practicePage.refreshOverview();
                store.ws()?.refreshStats?.();
                nav.goToSessions();
              },
              onError: (err) => {
                showToast(err?.message || 'Could not delete session.', true);
              },
            });
            return;
          }

          const speakBtn = e.target.closest('[data-ta-speak]');
          if (speakBtn) {
            const txt = speakBtn.getAttribute('data-ta-speak');
            if (txt) global.FlaptapWordLookup?.speakText?.(txt);
            return;
          }
          const askAiBtn = e.target.closest('[data-ta-ask-ai]');
          if (askAiBtn) {
            const s = store.state.activeDetailSession;
            global.FlaptapAiChat?.openWithContext?.(
              {
                type: 'think_aloud',
                id: s?.id || askAiBtn.getAttribute('data-ta-ask-ai') || '',
                label: s?.promptTitle || 'Think Aloud Session',
                subtitle: 'Saved Session Report',
              },
              {
                quote: s?.coaching?.shadowableRecast
                  ? { text: s.coaching.shadowableRecast, sourceLabel: 'Shadowable Recast' }
                  : undefined,
                prefill: 'Review my Think Aloud session and help me sound even more natural: ',
              },
            );
            return;
          }
          const copyBtn = e.target.closest('[data-ta-copy]');
          if (copyBtn) {
            const txt = copyBtn.getAttribute('data-ta-copy');
            if (txt && navigator.clipboard) {
              navigator.clipboard.writeText(txt).then(() => showToast('Copied recast to clipboard.'));
            }
          }
        });
      }
    }

    function mount() {
      if (local.mounted) return;
      local.mounted = true;
      bindEvents();
      renderList();
    }

    return {
      mount,
      loadSessions,
      openDetail,
      renderList,
      onActivate: () => loadSessions(),
    };
  }

  global.FlaptapTASessionsPage = { create };
})(window);
