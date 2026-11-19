const puppeteer = require('puppeteer');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const BASE_URL = process.env.FLAPTAP_URL || 'http://localhost:3333';
const SCREENSHOT_DIR =
  process.env.FLAPTAP_E2E_SCREENSHOT_DIR ||
  path.join(os.tmpdir(), 'flaptap-e2e-screenshots');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function waitForTranslation(page) {
  await page.waitForFunction(
    () => {
      const boxes = [...document.querySelectorAll('.sentence-translation-text')];
      if (boxes.length === 0) return false;
      const first = (boxes[0].textContent || '').trim();
      return first.length > 0 && first !== '...' && first !== '—';
    },
    { timeout: 120000 },
  );
}

/* ============================================================================
   EMAIL & PASSWORD ONLY AUTHENTICATION VERIFICATION
   Verifies session cookie + Bearer token auth, password hashing/change,
   session management, and absence of third-party OAuth / companion pairing routes.
   ============================================================================ */
async function verifyEmailOnlyAuthIsolation() {
  console.log('\n--- 1b. Email & Password Only Authentication Verification ---');
  const tempDbPath = path.join(os.tmpdir(), `flaptap-email-auth-e2e-${Date.now()}.sqlite`);
  const testAppPort = 3390 + Math.floor(Math.random() * 80);
  const testAppUrl = `http://127.0.0.1:${testAppPort}`;

  const backendProc = spawn(process.execPath, [path.resolve(__dirname, '../backend/dist/main.js')], {
    env: {
      ...process.env,
      PORT: String(testAppPort),
      HOST: '127.0.0.1',
      FLAPTAP_SQLITE_PATH: tempDbPath,
    },
    stdio: 'ignore',
  });

  try {
    let booted = false;
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(`${testAppUrl}/api/auth/me`);
        if (r.ok) {
          booted = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 150));
    }
    assert(booted, 'Isolated Email-Only Auth test server failed to start.');

    const email = `email.only.${Date.now()}@flaptap.test`;
    const password = 'Password123!';
    const regRes = await fetch(`${testAppUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Jordan Email', email, password }),
    });
    assert(regRes.ok, `Email registration failed: ${regRes.status}`);
    const setCookieHeader = regRes.headers.get('set-cookie') || '';
    const sessionCookieMatch = /flaptap_session=([^;]+)/.exec(setCookieHeader);
    assert(sessionCookieMatch, 'Registration did not set HttpOnly flaptap_session cookie.');

    const meCookie = await fetch(`${testAppUrl}/api/auth/me`, {
      headers: { Cookie: `flaptap_session=${sessionCookieMatch[1]}` },
    }).then((r) => r.json());
    assert(
      meCookie.authenticated && meCookie.user.email === email && meCookie.user.hasPassword === true,
      `Email session profile mismatch: ${JSON.stringify(meCookie)}`,
    );

    const wrongLogin = await fetch(`${testAppUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'WrongPassword!' }),
    });
    assert(wrongLogin.status === 401, `Wrong password must return 401, got ${wrongLogin.status}`);

    // Duplicate registration on an account with an existing password must still return 409 Conflict
    const dupReg = await fetch(`${testAppUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Duplicate Try', email, password: 'AnotherPassword123!' }),
    });
    assert(dupReg.status === 409, `Expected 409 for duplicate email with password, got ${dupReg.status}`);

    // Legacy passwordless (oauth_google_only) account upgrades smoothly on Create Account
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(tempDbPath);
    const legacyId = 'legacy-pwless-e2e';
    const legacyEmail = `legacy.pwless.${Date.now()}@flaptap.test`;
    const nowIso = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, auth_provider, created_at)
       VALUES (?, ?, 'Legacy User', 'oauth_google_only', 'google', ?)`,
    ).run(legacyId, legacyEmail, nowIso);
    db.close();

    const claimLegacy = await fetch(`${testAppUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Legacy Upgraded', email: legacyEmail, password }),
    });
    assert(claimLegacy.ok, `Expected legacy passwordless account upgrade to succeed, got ${claimLegacy.status}`);
    const claimData = await claimLegacy.json();
    assert(
      claimData.authenticated && claimData.user.id === legacyId && claimData.user.hasPassword === true,
      `Legacy upgrade user mismatch: ${JSON.stringify(claimData)}`,
    );

    const removedGoogle = await fetch(`${testAppUrl}/api/auth/google/config`);
    assert(removedGoogle.status === 404, `Expected 404 for removed Google config route, got ${removedGoogle.status}`);
    const removedCompanion = await fetch(`${testAppUrl}/api/auth/companion/status`);
    assert(removedCompanion.status === 404, `Expected 404 for removed companion route, got ${removedCompanion.status}`);

    console.log('PASS: Email & Password-only registration, legacy passwordless upgrade, cookie session auth, bad-password 401, and removal of OAuth/pairing routes verified!');
  } finally {
    backendProc.kill('SIGTERM');
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        if (fs.existsSync(tempDbPath + suffix)) fs.unlinkSync(tempDbPath + suffix);
      } catch {}
    }
  }
}

async function runProductionE2ETest() {
  console.log('Flaptap — Comprehensive Production End-to-End Verification Suite');
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // -------------------------------------------------------------------------
  // 0. Zero-Benefit Unauthenticated Gate (All Protected APIs Enforce 401)
  // -------------------------------------------------------------------------
  console.log('\n--- 0. Zero-Benefit Unauthenticated API Gate ---');
  const anonHeaders = {
    'Content-Type': 'application/json',
    'x-guest-token': `anon_probe_${Date.now()}`,
  };

  const gatedChecks = [
    ['GET', '/api/history'],
    ['GET', '/api/history/usage'],
    ['GET', '/api/history/export'],
    ['GET', '/api/stats'],
    ['GET', '/api/vocabulary'],
    ['POST', '/api/vocabulary', { term: 'test', definition: 'test' }],
    ['POST', '/api/tracks/shadowing/process', { url: 'https://www.youtube.com/watch?v=Ka0p5tUUmgg' }],
    ['POST', '/api/tracks/street-talk/start', { scenario: 'Coffee chat' }],
    ['POST', '/api/tracks/phonetics/drill', { topic: 'Flap T' }],
  ];

  for (const [method, endpoint, payload] of gatedChecks) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: anonHeaders,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const body = await res.json().catch(() => ({}));
    assert(
      res.status === 401 && body.code === 'auth_required',
      `Expected 401 auth_required on ${method} ${endpoint}, got ${res.status} (${JSON.stringify(body)})`,
    );
  }

  const anonMe = await fetch(`${BASE_URL}/api/auth/me`, { headers: anonHeaders }).then((r) => r.json());
  assert(anonMe.authenticated === false && anonMe.user === null, 'Anonymous /api/auth/me should be unauthenticated.');
  console.log(`PASS: All ${gatedChecks.length} value-producing & user-data endpoints enforce 401 auth_required before sign-in`);

  // -------------------------------------------------------------------------
  // 1. Real Account Registration, Per-User Isolation, Sessions & Failure Taxonomy
  // -------------------------------------------------------------------------
  console.log('\n--- 1. Account Creation, Strict Per-User Isolation, Sessions & Failure Taxonomy ---');
  const userAEmail = `e2e_primary_${Date.now()}@flaptap.test`;
  const userAPassword = 'Password123!';
  const userBEmail = `e2e_isolated_${Date.now()}@flaptap.test`;

  const regARes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Alex Editorial',
      email: userAEmail,
      password: userAPassword,
      nativeLanguage: 'ar',
      uiLanguage: 'en',
    }),
  });
  assert(regARes.ok, `Primary account registration failed: ${regARes.status}`);
  const userAData = await regARes.json();
  const tokenA = userAData.token;
  assert(userAData.authenticated && tokenA, 'Primary account token missing.');
  const authHeadersA = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${tokenA}`,
  };

  const regBRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Maya Isolated',
      email: userBEmail,
      password: 'Password123!',
      nativeLanguage: 'es',
      uiLanguage: 'en',
    }),
  });
  assert(regBRes.ok, `Secondary account registration failed: ${regBRes.status}`);
  const userBData = await regBRes.json();
  const tokenB = userBData.token;
  const authHeadersB = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${tokenB}`,
  };

  let browser = null;

  try {
    // API Failure Taxonomy (Authenticated)
    const invalidRes = await fetch(`${BASE_URL}/api/tracks/shadowing/process`, {
      method: 'POST',
      headers: authHeadersA,
      body: JSON.stringify({ url: 'not-a-youtube-url' }),
    });
    assert(invalidRes.status === 400, `Expected 400 for invalid URL, got ${invalidRes.status}`);

    const removedRes = await fetch(`${BASE_URL}/api/tracks/shadowing/process`, {
      method: 'POST',
      headers: authHeadersA,
      body: JSON.stringify({ url: 'https://www.youtube.com/shorts/NgI_xpTl5w4' }),
    });
    const removedBody = await removedRes.json();
    assert(removedRes.status === 404 && removedBody.code === 'video_unavailable',
      `Expected 404 video_unavailable, got ${removedRes.status} ${removedBody.code}`);
    console.log('PASS: Invalid URL -> 400, removed video -> 404 video_unavailable');

    // Verify Email & Password only authentication and clean removal of OAuth/pairing routes
    await verifyEmailOnlyAuthIsolation();

    // -----------------------------------------------------------------------
    // 1c. Lesson Processing, Segmentation Invariants, Dynamic AI Generators & Isolation
    // -----------------------------------------------------------------------
    console.log('\n--- 1c. Segmentation Invariants, Dynamic AI Generators, Isolation & Cache Controls ---');

    // Process Punctuated Video Fixture (`Ka0p5tUUmgg`) + Unpunctuated ASR Video Fixture (`0CmtDk-joT4`)
    const primaryRes = await fetch(`${BASE_URL}/api/tracks/shadowing/process`, {
      method: 'POST',
      headers: authHeadersA,
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=Ka0p5tUUmgg' }),
    });
    assert(primaryRes.ok, `Primary video process failed: ${primaryRes.status}`);
    const fixture = await primaryRes.json();

    const asrRes = await fetch(`${BASE_URL}/api/tracks/shadowing/process`, {
      method: 'POST',
      headers: authHeadersA,
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=0CmtDk-joT4' }),
    });
    assert(asrRes.ok, `Unpunctuated ASR process failed: ${asrRes.status}`);
    const asrLesson = await asrRes.json();
    assert(
      Array.isArray(asrLesson.sentences) && asrLesson.sentences.length >= 10 &&
      Array.isArray(asrLesson.chunks) && asrLesson.chunks.length >= 3,
      `ASR segmentation unexpected counts: ${asrLesson.sentences?.length} sent, ${asrLesson.chunks?.length} para`,
    );

    // Verify strict per-user isolation: User B cannot see or access User A's lessons!
    const userBHistory = await fetch(`${BASE_URL}/api/history`, { headers: authHeadersB }).then((r) => r.json());
    assert(Array.isArray(userBHistory) && userBHistory.length === 0, 'User B leaked User A history!');
    const crossReadRes = await fetch(`${BASE_URL}/api/history/${encodeURIComponent(fixture.id)}`, {
      headers: authHeadersB,
    });
    assert(crossReadRes.status === 404, `Cross-account lesson read must 404, got ${crossReadRes.status}`);

    // Test User B Password Change, Active Sessions & Account Deletion
    const pwRes = await fetch(`${BASE_URL}/api/auth/password`, {
      method: 'POST',
      headers: authHeadersB,
      body: JSON.stringify({ currentPassword: 'Password123!', newPassword: 'NewPassword456!' }),
    });
    assert(pwRes.ok, `Password update failed: ${pwRes.status}`);

    const sessionsRes = await fetch(`${BASE_URL}/api/auth/sessions`, { headers: authHeadersB }).then((r) => r.json());
    assert(Array.isArray(sessionsRes.sessions) && sessionsRes.sessions.length === 1 && sessionsRes.sessions[0].isCurrent,
      'Active sessions list malformed.');

    const delBRes = await fetch(`${BASE_URL}/api/auth/account`, {
      method: 'DELETE',
      headers: authHeadersB,
    });
    assert(delBRes.ok, `User B account deletion failed: ${delBRes.status}`);

    // Verify lightweight summary contract + cache metadata on `GET /api/history`
    const summariesA = await fetch(`${BASE_URL}/api/history`, { headers: authHeadersA }).then((r) => r.json());
    assert(summariesA.length === 2, `Expected 2 lessons for User A, got ${summariesA.length}`);
    const heavyField = summariesA.find(
      (entry) =>
        Array.isArray(entry.sentences) ||
        Array.isArray(entry.chunks) ||
        typeof entry.noteMarkdown === 'string',
    );
    assert(!heavyField, 'History list shipped heavy transcript payloads instead of summaries.');
    assert(summariesA[0].cacheInfo && typeof summariesA[0].payloadBytes === 'number', 'Summary missing cacheInfo/payloadBytes.');

    // Verify Full-Sentence & Cohesive-Paragraph Invariants across both fixtures
    for (const item of [fixture, asrLesson]) {
      const allSentenceText = item.sentences.map((s) => s.text.trim()).join(' ').replace(/\s+/g, ' ');
      const allChunkText = item.chunks.map((c) => c.text.trim()).join(' ').replace(/\s+/g, ' ');
      assert(allSentenceText === allChunkText, `Paragraph text diverged from complete sentences in "${item.title}"`);
      const byIdx = new Map(item.sentences.map((s) => [s.index, s]));
      for (const chunk of item.chunks) {
        if (Array.isArray(chunk.sentenceIndices) && chunk.sentenceIndices.length > 0) {
          const expected = chunk.sentenceIndices.map((idx) => byIdx.get(idx)?.text || '').join(' ').trim();
          assert(chunk.text.trim() === expected, `Paragraph cut mid-sentence in "${item.title}"`);
        }
      }
      const commaEnded = item.sentences.filter((s) => /,$/.test(s.text.trim()));
      assert(commaEnded.length === 0, `Mid-sentence comma cut in "${item.title}"`);
    }

    // Dynamic Dialogue & Pronunciation Generators (OpenCode Go)
    const dlgRes = await fetch(`${BASE_URL}/api/tracks/street-talk/start`, {
      method: 'POST',
      headers: authHeadersA,
      body: JSON.stringify({
        scenario: 'Aligning on a software release deadline with a product manager',
      }),
    });
    assert(dlgRes.ok, `Dialogue generator failed: ${dlgRes.status}`);
    const dlgLesson = await dlgRes.json();
    assert(
      dlgLesson.sentences?.length >= 4 &&
      dlgLesson.aiAnalysis?.connectedSpeech?.length > 0 &&
      dlgLesson.aiAnalysis?.vocabulary?.length > 0,
      `Dialogue lesson missing dynamic AI content: ${JSON.stringify({
        sentencesLen: dlgLesson.sentences?.length,
        connLen: dlgLesson.aiAnalysis?.connectedSpeech?.length,
        vocabLen: dlgLesson.aiAnalysis?.vocabulary?.length,
        aiAnalysis: dlgLesson.aiAnalysis,
      })}`,
    );

    const pronRes = await fetch(`${BASE_URL}/api/tracks/phonetics/drill`, {
      method: 'POST',
      headers: authHeadersA,
      body: JSON.stringify({
        topic: 'Alveolar Flap-T between vowels and unstressed schwa linking',
      }),
    });
    assert(pronRes.ok, `Pronunciation generator failed: ${pronRes.status}`);
    const pronLesson = await pronRes.json();
    assert(
      pronLesson.sentences?.length >= 4 &&
      pronLesson.aiAnalysis?.connectedSpeech?.length > 0 &&
      pronLesson.aiAnalysis?.vocabulary?.length > 0,
      `Pronunciation workout missing dynamic AI content: ${JSON.stringify({
        sentencesLen: pronLesson.sentences?.length,
        connLen: pronLesson.aiAnalysis?.connectedSpeech?.length,
        vocabLen: pronLesson.aiAnalysis?.vocabulary?.length,
        aiAnalysis: pronLesson.aiAnalysis,
      })}`,
    );

    // Vocabulary SRS Save & Review + Usage Overview + Cache Clear + Full JSON Export
    const vocabRes = await fetch(`${BASE_URL}/api/vocabulary`, {
      method: 'POST',
      headers: authHeadersA,
      body: JSON.stringify({
        term: 'exponential',
        ipa: '/ˌɛkspəˈnɛnʃəl/',
        partOfSpeech: 'adjective',
        definition: 'Growing increasingly rapid in scale or rate.',
        translation: 'أُسّي / متسارع',
        contextSentence: fixture.sentences[0]?.text || 'Exponential growth.',
        lessonId: fixture.id,
        timestampSec: fixture.sentences[0]?.startSec || 0,
      }),
    }).then((r) => r.json());
    assert(vocabRes.id && vocabRes.term === 'exponential', 'Vocabulary save failed.');

    const srsData = await fetch(`${BASE_URL}/api/vocabulary/${encodeURIComponent(vocabRes.id)}/review`, {
      method: 'PATCH',
      headers: authHeadersA,
      body: JSON.stringify({ rating: 'good' }),
    }).then((r) => r.json());
    assert(srsData.masteryLevel === 1, `Expected masteryLevel 1, got ${srsData.masteryLevel}`);

    const checkHit = await fetch(
      `${BASE_URL}/api/tracks/shadowing/check-existing?url=${encodeURIComponent('https://www.youtube.com/watch?v=Ka0p5tUUmgg')}`,
      { headers: authHeadersA },
    ).then((r) => r.json());
    assert(checkHit.exists === true && checkHit.id === fixture.id, 'check-existing cache hit failed.');

    const usageOverview = await fetch(`${BASE_URL}/api/history/usage`, { headers: authHeadersA }).then((r) => r.json());
    assert(
      usageOverview.stats.lessonsCount === 4 &&
      usageOverview.stats.byTrack.shadowing === 2 &&
      usageOverview.stats.byTrack.street_talk === 1 &&
      usageOverview.stats.byTrack.phonetics === 1 &&
      usageOverview.cacheOverview.totalStorageBytes > 0,
      `Usage overview mismatch: ${JSON.stringify(usageOverview.stats)}`,
    );

    // Clear Coach cache on `dlgLesson` and verify `aiCoachCached` becomes false without deleting the lesson
    const clearedItemRes = await fetch(`${BASE_URL}/api/history/${encodeURIComponent(dlgLesson.id)}/cache/clear`, {
      method: 'POST',
      headers: authHeadersA,
      body: JSON.stringify({ scope: 'coach' }),
    }).then((r) => r.json());
    assert(clearedItemRes.success && clearedItemRes.item.cacheInfo.aiCoachCached === false, 'Per-lesson coach cache clear failed.');

    const exportJson = await fetch(`${BASE_URL}/api/history/export`, { headers: authHeadersA }).then((r) => r.json());
    assert(
      exportJson.version === 2 &&
      exportJson.user.email === userAEmail &&
      Array.isArray(exportJson.lessons) &&
      exportJson.lessons.length === 4 &&
      Array.isArray(exportJson.vocabulary) &&
      exportJson.vocabulary.length === 1,
      'Full account JSON export payload incomplete.',
    );

    console.log(
      'PASS: Per-user isolation, ASR + Punctuated segmentation, Dialogue & Pronunciation AI, Usage/Cache APIs & JSON Export verified!',
    );

    // -----------------------------------------------------------------------
    // 2. Browser E2E Suite (Puppeteer)
    // -----------------------------------------------------------------------
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,950'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 950 });

    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // -----------------------------------------------------------------------
    // 2a. Signed-Out Visitor Gate & Automatic Pending-Action Continuation
    // -----------------------------------------------------------------------
    console.log('\n--- 2a. Signed-Out Browser UI Gate, Email Sign-In Drawer & Auto-Resume ---');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.app-sidebar', { timeout: 10000 });
    await page.waitForFunction(() => window.flaptapState?.sessionLoaded === true, { timeout: 10000 });

    const signedOutHome = await page.evaluate(() => ({
      navTabs: [...document.querySelectorAll('.sidebar-nav-link[data-route-section]')].map(
        (b) => b.dataset.routeSection,
      ),
      topbarNavLeak: document.querySelectorAll('.workspace-topbar .nav-tab').length,
      cardsLeaked: document.querySelectorAll('.history-card').length,
      gateVisible: !document.getElementById('library-auth-gate-card')?.hidden,
      startBtnEnabled: !document.getElementById('start-lesson-btn')?.disabled,
      presetsDemo: document.querySelectorAll('.presets-container, .preset-chip').length,
      googleFonts: [...document.querySelectorAll('link[rel="stylesheet"]')].some((l) =>
        /fonts\.googleapis\.com/i.test(l.href),
      ),
    }));

    assert(
      signedOutHome.topbarNavLeak === 0 &&
        JSON.stringify(signedOutHome.navTabs) ===
          JSON.stringify([
            'lessons',
            'dialogue',
            'pronunciation',
            'learning-library',
            'tech-linguist',
            'american-extractor',
            'vocabulary',
            'history',
          ]),
      `Expected all 8 primary links inside Left Sidebar (0 topbar tabs), got ${JSON.stringify(signedOutHome.navTabs)}`,
    );
    assert(signedOutHome.cardsLeaked === 0 && signedOutHome.gateVisible, 'Signed-out visitor leaked library cards!');
    assert(signedOutHome.startBtnEnabled, 'Start Lesson button must remain clickable for signed-out visitor.');
    assert(signedOutHome.presetsDemo === 0 && !signedOutHome.googleFonts, 'Demo chips or external fonts detected.');

    // Attempt direct navigation to Studio while signed out -> must redirect back to `/` with Sign-In gate open!
    await page.goto(`${BASE_URL}/studio.html?id=${encodeURIComponent(fixture.id)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForFunction(
      () =>
        window.location.pathname === '/' &&
        document.getElementById('account-drawer-backdrop') &&
        !document.getElementById('account-drawer-backdrop').hidden,
      { timeout: 15000 },
    );

    // Close drawer, type YouTube URL as signed-out visitor, click Start Lesson -> intercepts BEFORE executing!
    await page.click('#close-account-btn');
    await page.type('#youtube-url-input', 'https://www.youtube.com/watch?v=Ka0p5tUUmgg');
    await page.click('#start-lesson-btn');

    const interceptedState = await page.evaluate(() => ({
      pathname: window.location.pathname,
      drawerOpen: !document.getElementById('account-drawer-backdrop')?.hidden,
      gateBannerVisible: !document.getElementById('auth-gate-banner')?.hidden,
      emailFormVisible: Boolean(document.getElementById('login-form')),
      noGoogleBtn: !document.getElementById('google-signin-btn'),
      noPairingUi: !document.getElementById('wifi-companion-card') && !document.getElementById('google-device-pairing-card'),
    }));
    assert(
      interceptedState.pathname === '/' &&
      interceptedState.drawerOpen &&
      interceptedState.gateBannerVisible &&
      interceptedState.emailFormVisible &&
      interceptedState.noGoogleBtn &&
      interceptedState.noPairingUi,
      `Action was not intercepted by clean Email-Only Sign-In drawer: ${JSON.stringify(interceptedState)}`,
    );
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-auth-gate-email-drawer.png') });

    // Now sign in inside the open drawer -> pending Start Lesson action must automatically resume into Studio!
    await page.type('#login-email', userAEmail);
    await page.type('#login-password', userAPassword);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.click('#login-submit-btn'),
    ]);

    await page.waitForSelector('.sentence-driller-card', { timeout: 30000 });
    assert(
      page.url().includes('/studio') && page.url().includes(`id=${encodeURIComponent(fixture.id)}`),
      `Pending action did not auto-resume into Studio after sign-in: ${page.url()}`,
    );
    console.log('PASS: Signed-out actions intercepted before execution and automatically resumed into Studio upon Sign-In!');

    // -----------------------------------------------------------------------
    // 2b. Authenticated Workspace, URL Cache Banner, Themes, RTL & History Control Center
    // -----------------------------------------------------------------------
    console.log('\n--- 2b. Authenticated Workspace, Instant Cache Banner & History/Usage Control Center ---');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      () =>
        document.querySelectorAll('#history-grid .history-card').length === 4 &&
        document.querySelectorAll('#dialogue-history-grid .history-card').length === 1 &&
        document.querySelectorAll('#pronunciation-history-grid .history-card').length === 1,
      { timeout: 15000 },
    );

    // Verify checkable Lesson cards & real-time Total/Completed/Remaining progress bar
    const initLessonBar = await page.evaluate(() => ({
      total: document.querySelector('#lessons-progress-bar [data-sp-total]')?.textContent?.trim(),
      completed: document.querySelector('#lessons-progress-bar [data-sp-completed]')?.textContent?.trim(),
      remaining: document.querySelector('#lessons-progress-bar [data-sp-remaining]')?.textContent?.trim(),
    }));
    assert(
      initLessonBar.total === '4' && initLessonBar.completed === '0' && initLessonBar.remaining === '4',
      `Initial Lessons progress bar mismatch: ${JSON.stringify(initLessonBar)}`,
    );
    await page.click('#history-grid [data-lesson-complete]');
    const afterLessonCheck = await page.evaluate(() => ({
      total: document.querySelector('#lessons-progress-bar [data-sp-total]')?.textContent?.trim(),
      completed: document.querySelector('#lessons-progress-bar [data-sp-completed]')?.textContent?.trim(),
      remaining: document.querySelector('#lessons-progress-bar [data-sp-remaining]')?.textContent?.trim(),
      checkedCard: document.querySelector('#history-grid .history-card')?.classList.contains('is-item-completed'),
    }));
    assert(
      afterLessonCheck.total === '4' &&
      afterLessonCheck.completed === '1' &&
      afterLessonCheck.remaining === '3' &&
      afterLessonCheck.checkedCard === true,
      `Instant Lessons completion update failed: ${JSON.stringify(afterLessonCheck)}`,
    );

    // Type cached URL -> assert `#url-cache-banner` detects cached video immediately
    await page.type('#youtube-url-input', 'https://www.youtube.com/watch?v=Ka0p5tUUmgg');
    await page.waitForFunction(() => !document.getElementById('url-cache-banner')?.hidden, {
      timeout: 10000,
    });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-workspace-light-en.png') });

    // Dark Mode + Arabic RTL check
    await page.click('#theme-toggle-btn');
    assert((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark', 'Dark mode failed.');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-workspace-dark-en.png') });

    await page.select('#ui-lang-select', 'ar');
    assert((await page.evaluate(() => document.documentElement.getAttribute('dir'))) === 'rtl', 'Arabic RTL failed.');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-workspace-dark-ar.png') });

    await page.select('#ui-lang-select', 'en');
    await page.click('#theme-toggle-btn');

    // Switch to `History & Usage` dedicated route `/history` & verify refresh preserves page
    await page.click('.sidebar-nav-link[data-route-section="history"]');
    await page.waitForFunction(
      () =>
        window.location.pathname === '/history' &&
        document.querySelectorAll('#history-ledger-list .history-ledger-row').length === 4,
      { timeout: 15000 },
    );
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(
      () =>
        window.location.pathname === '/history' &&
        !document.getElementById('section-history')?.hidden &&
        document.querySelectorAll('#history-ledger-list .history-ledger-row').length === 4,
      { timeout: 15000 },
    );
    const reloadedHistoryBar = await page.evaluate(() => ({
      total: document.querySelector('#history-ledger-progress-bar [data-sp-total]')?.textContent?.trim(),
      completed: document.querySelector('#history-ledger-progress-bar [data-sp-completed]')?.textContent?.trim(),
      remaining: document.querySelector('#history-ledger-progress-bar [data-sp-remaining]')?.textContent?.trim(),
    }));
    assert(
      reloadedHistoryBar.total === '4' &&
      reloadedHistoryBar.completed === '1' &&
      reloadedHistoryBar.remaining === '3',
      `History progress bar did not persist lesson completion after reload: ${JSON.stringify(reloadedHistoryBar)}`,
    );

    // Test multi-select checkbox state & bulk button enable/disable state
    const bulkBefore = await page.evaluate(() => document.getElementById('bulk-clear-cache-btn')?.disabled);
    assert(bulkBefore === true, 'Bulk buttons must start disabled when 0 rows are selected.');
    await page.click('#ledger-select-all');
    const bulkAfterSelect = await page.evaluate(() => ({
      clearDisabled: document.getElementById('bulk-clear-cache-btn')?.disabled,
      selectedText: document.getElementById('ledger-selected-count')?.textContent,
    }));
    assert(bulkAfterSelect.clearDisabled === false && bulkAfterSelect.selectedText.includes('4'),
      `Select-all bulk state failed: ${JSON.stringify(bulkAfterSelect)}`);
    await page.click('#ledger-select-all'); // Unselect all -> bulk buttons disable cleanly again
    assert((await page.evaluate(() => document.getElementById('bulk-clear-cache-btn')?.disabled)) === true,
      'Bulk buttons did not re-disable after unchecking Select All.');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-history-usage-control-center.png') });
    console.log('PASS: Instant URL cache detection, Themes/RTL, and History & Usage Control Center verified');

    // -----------------------------------------------------------------------
    // 2c. Unavailable Video Error Classification in Studio
    // -----------------------------------------------------------------------
    console.log('\n--- 2c. Unavailable Video Error Overlay ---');
    await page.goto(
      `${BASE_URL}/studio.html?url=${encodeURIComponent('https://www.youtube.com/shorts/NgI_xpTl5w4')}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 },
    );
    await page.waitForFunction(
      () => document.getElementById('loader-overlay')?.classList.contains('loader-error'),
      { timeout: 30000 },
    );
    const unavailableUi = await page.evaluate(() => {
      const retry = document.getElementById('loader-retry-btn');
      return {
        detail: document.getElementById('loader-subheadline')?.textContent?.trim() || '',
        retryVisible: Boolean(retry && getComputedStyle(retry).display !== 'none'),
      };
    });
    assert(!unavailableUi.retryVisible && /unavailable/i.test(unavailableUi.detail),
      `Removed video overlay mismatch: ${JSON.stringify(unavailableUi)}`);
    console.log('PASS: Removed video displays accurate message without retry button');

    // -----------------------------------------------------------------------
    // 3. Studio Modes, Flexible Docking & FULL BUTTON STATE REGRESSION AUDIT
    // -----------------------------------------------------------------------
    console.log('\n--- 3. Studio Load, Flexible Docking, 5 Modes & Loop/Button State Audit ---');
    await page.goto(
      `${BASE_URL}/studio.html?id=${encodeURIComponent(fixture.id)}&mode=shadow`,
      { waitUntil: 'domcontentloaded', timeout: 30000 },
    );
    await page.waitForSelector('.sentence-driller-card', { timeout: 30000 });
    await page.waitForFunction(() => document.getElementById('loader-overlay')?.hidden === true, {
      timeout: 30000,
    });

    // Attach deterministic fake YT player so play/pause/loop state transitions are 100% deterministic
    await page.evaluate(() => {
      document.getElementById('studio-main-content').dataset.e2eAlive = 'yes';
      document.querySelector('.sentence-driller-card').dataset.e2eAlive = 'yes';
      document.getElementById('studio-youtube-player').dataset.e2eAlive = 'yes';
      window.studioState.ytPlayer = {
        current: 0,
        state: 2,
        seekTo(v) { this.current = v; },
        playVideo() { this.state = 1; },
        pauseVideo() { this.state = 2; },
        mute() {},
        unMute() {},
        getCurrentTime() { return this.current; },
        setPlaybackRate() {},
        getPlayerState() { return this.state; },
      };
    });

    // --- CRITICAL REGRESSION TEST: SINGLE-ROW HORIZONTAL CONTROL BAR & CHECKABLE ITEMS ---
    const iconButtonsCheck = await page.evaluate(() => {
      const bar = document.getElementById('studio-control-bar');
      const btns = Array.from(bar?.querySelectorAll('.scb-btn') || []).filter(
        (b) => getComputedStyle(b).display !== 'none',
      );
      const tops = btns.map((b) => Math.round(b.getBoundingClientRect().top));
      const bottoms = btns.map((b) => Math.round(b.getBoundingClientRect().bottom));
      return {
        playBtnsCount: document.querySelectorAll('[data-play-sent]').length,
        loopBtnsInCard: document.querySelectorAll('.sentence-driller-card [data-loop-sent]').length,
        transBtnsInCard: document.querySelectorAll('.sentence-driller-card [data-trans-btn-sent]').length,
        deckPrevBtn: Boolean(document.getElementById('deck-prev-sent-btn')),
        deckNextBtn: Boolean(document.getElementById('deck-next-sent-btn')),
        deckPlayBtn: Boolean(document.getElementById('deck-play-active-btn')),
        deckAutoFollowBtn: Boolean(document.getElementById('deck-auto-follow-btn')),
        flowBtn: Boolean(document.getElementById('studio-flow-btn')),
        barHeight: bottoms.length ? Math.max(...bottoms) - Math.min(...tops) : 999,
        barOverflow: bar ? bar.scrollWidth - bar.clientWidth : 999,
        sideTransBtn: Boolean(document.getElementById('side-trans-active-btn')),
        playTextLen: (document.querySelector('[data-play-sent="1"]')?.textContent || '').trim().length,
      };
    });
    assert(
      iconButtonsCheck.playBtnsCount > 0 &&
      iconButtonsCheck.loopBtnsInCard === 0 &&
      iconButtonsCheck.transBtnsInCard > 0 &&
      iconButtonsCheck.deckPrevBtn &&
      iconButtonsCheck.deckNextBtn &&
      iconButtonsCheck.deckPlayBtn &&
      iconButtonsCheck.deckAutoFollowBtn &&
      iconButtonsCheck.flowBtn &&
      iconButtonsCheck.barHeight <= 44 &&
      iconButtonsCheck.barOverflow <= 2 &&
      !iconButtonsCheck.sideTransBtn &&
      iconButtonsCheck.playTextLen === 0,
      `Unified single-row control bar & card layout check failed: ${JSON.stringify(iconButtonsCheck)}`,
    );

    // Verify Shadow Mode Completion Checkbox toggles synchronously without starting playback
    await page.click('[data-studio-check-subject="sentences"][data-studio-check-index="1"]');
    const shadowCompletionAfterCheck = await page.evaluate(() => ({
      completed: document.querySelector('#studio-shadow-progress-bar [data-sp-completed]')?.textContent?.trim(),
      total: document.querySelector('#studio-shadow-progress-bar [data-sp-total]')?.textContent?.trim(),
      remaining: document.querySelector('#studio-shadow-progress-bar [data-sp-remaining]')?.textContent?.trim(),
      isPlaying: window.studioState.isPlaying,
      cardDone: document.getElementById('sent-card-1')?.classList.contains('is-item-completed'),
    }));
    assert(
      shadowCompletionAfterCheck.completed === '1' &&
      Number(shadowCompletionAfterCheck.remaining) === Number(shadowCompletionAfterCheck.total) - 1 &&
      shadowCompletionAfterCheck.isPlaying === false &&
      shadowCompletionAfterCheck.cardDone === true,
      `Shadow sentence completion toggle failed: ${JSON.stringify(shadowCompletionAfterCheck)}`,
    );

    const setStudioFlow = async (targetFlow) => {
      for (let i = 0; i < 4; i++) {
        const cur = await page.evaluate(
          () => document.getElementById('studio-flow-btn')?.getAttribute('data-flow-state'),
        );
        if (cur === targetFlow) return;
        await page.click('#studio-flow-btn');
      }
      throw new Error(`Could not cycle #studio-flow-btn to "${targetFlow}"`);
    };

    // Default flow state on load must be 'loop' (Loop Once)
    const defaultFlowState = await page.evaluate(() => ({
      attr: document.getElementById('studio-flow-btn')?.getAttribute('data-flow-state'),
      endAction: window.studioState.endAction,
    }));
    assert(
      defaultFlowState.attr === 'loop' && defaultFlowState.endAction === 'loop',
      `Default #studio-flow-btn state must be "loop": ${JSON.stringify(defaultFlowState)}`,
    );

    // Step A: Play/Pause button on sentence card has 2 logical states only (Play starts, Pause stops)
    // Switch to 'pause' flow first to verify non-loop single play/pause behavior
    await setStudioFlow('pause');
    // Click 1: Click Play -> starts playing!
    await page.click('[data-play-sent="1"]');
    const stepAPlay = await page.evaluate(() => ({
      loopIdx: window.studioState.loopSentenceIndex,
      endAction: window.studioState.endAction,
      state1: document.querySelector('[data-play-sent="1"]')?.getAttribute('data-play-state'),
      active1: document.querySelector('[data-play-sent="1"]')?.classList.contains('active'),
      isPlaying: window.studioState.isPlaying,
    }));
    assert(
      stepAPlay.loopIdx === null &&
      stepAPlay.endAction === 'pause' &&
      stepAPlay.state1 === 'playing' &&
      stepAPlay.active1 === true &&
      stepAPlay.isPlaying === true,
      `Step A1 (Play #1) failed: ${JSON.stringify(stepAPlay)}`,
    );

    // Click 2: Click while playing -> PAUSES! (2 states only)
    await page.click('[data-play-sent="1"]');
    const stepAPause = await page.evaluate(() => ({
      loopIdx: window.studioState.loopSentenceIndex,
      endAction: window.studioState.endAction,
      state1: document.querySelector('[data-play-sent="1"]')?.getAttribute('data-play-state'),
      active1: document.querySelector('[data-play-sent="1"]')?.classList.contains('active'),
      isPlaying: window.studioState.isPlaying,
    }));
    assert(
      stepAPause.state1 === 'idle' &&
      stepAPause.active1 === false &&
      stepAPause.isPlaying === false,
      `Step A2 (Pause #1) failed: ${JSON.stringify(stepAPause)}`,
    );

    // Step A3: Centralized Loop flow via single-icon #studio-flow-btn
    await setStudioFlow('loop');
    await page.click('[data-play-sent="1"]');
    const loopStepA = await page.evaluate(() => ({
      loopIdx: window.studioState.loopSentenceIndex,
      endAction: window.studioState.endAction,
      isPlaying: window.studioState.isPlaying,
      active1: document.querySelector('[data-play-sent="1"]')?.classList.contains('active'),
    }));
    assert(
      loopStepA.loopIdx === 1 &&
      loopStepA.endAction === 'loop' &&
      loopStepA.isPlaying === true &&
      loopStepA.active1 === true,
      `Step A3 (Loop flow activation) failed: ${JSON.stringify(loopStepA)}`,
    );

    // Step B: Move to Sentence #2 -> Sentence #2 inherits Loop mode from active flow, and #1 resets to idle!
    await page.click('[data-play-sent="2"]');
    const loopStepB = await page.evaluate(() => ({
      loopIdx: window.studioState.loopSentenceIndex,
      endAction: window.studioState.endAction,
      activeSent: window.studioState.activeSentence?.index,
      state1: document.querySelector('[data-play-sent="1"]')?.getAttribute('data-play-state'),
      active1: document.querySelector('[data-play-sent="1"]')?.classList.contains('active'),
      state2: document.querySelector('[data-play-sent="2"]')?.getAttribute('data-play-state'),
      active2: document.querySelector('[data-play-sent="2"]')?.classList.contains('active'),
    }));
    assert(
      loopStepB.loopIdx === 2 &&
      loopStepB.endAction === 'loop' &&
      loopStepB.activeSent === 2 &&
      loopStepB.state1 === 'idle' &&
      loopStepB.active1 === false &&
      loopStepB.state2 === 'playing' &&
      loopStepB.active2 === true,
      `Step B (Move #1 -> #2 must inherit Loop mode) failed: ${JSON.stringify(loopStepB)}`,
    );

    // Step C: Cycle flow to Auto-Pause -> deactivates loop, then move to #3 -> #3 plays once!
    await setStudioFlow('pause');
    await page.click('[data-play-sent="3"]');
    const loopStepC = await page.evaluate(() => ({
      loopIdx: window.studioState.loopSentenceIndex,
      endAction: window.studioState.endAction,
      activeSent: window.studioState.activeSentence?.index,
      state2: document.querySelector('[data-play-sent="2"]')?.getAttribute('data-play-state'),
      state3: document.querySelector('[data-play-sent="3"]')?.getAttribute('data-play-state'),
      isPlaying3: window.studioState.isPlaying,
      totalActiveButtons: document.querySelectorAll('[data-play-sent].active').length,
    }));
    assert(
      loopStepC.loopIdx === null &&
      loopStepC.endAction === 'pause' &&
      loopStepC.activeSent === 3 &&
      loopStepC.state2 === 'idle' &&
      loopStepC.state3 === 'playing' &&
      loopStepC.isPlaying3 === true &&
      loopStepC.totalActiveButtons === 1,
      `Step C (Toggle Auto-Pause -> #3 plays Once) failed: ${JSON.stringify(loopStepC)}`,
    );

    // Step D: Cycle flow to Loop, then click Sentence #1 card -> #1 inherits Loop!
    await setStudioFlow('loop');
    await page.click('#sent-card-1');
    const loopStepD = await page.evaluate(() => ({
      loopIdx: window.studioState.loopSentenceIndex,
      endAction: window.studioState.endAction,
      state1: document.querySelector('[data-play-sent="1"]')?.getAttribute('data-play-state'),
      totalActiveButtons: document.querySelectorAll('[data-play-sent].active').length,
    }));
    assert(
      loopStepD.loopIdx === 1 &&
      loopStepD.endAction === 'loop' &&
      loopStepD.state1 === 'playing' &&
      loopStepD.totalActiveButtons === 1,
      `Step D (Clicking sentence line inherits Loop) failed: ${JSON.stringify(loopStepD)}`,
    );

    // Step E: Cycle back to Auto-Pause -> switches flow to Once, and clicking #1 while playing pauses it!
    await setStudioFlow('pause');
    await page.click('[data-play-sent="1"]');
    const loopStepE = await page.evaluate(() => ({
      loopIdx: window.studioState.loopSentenceIndex,
      totalActiveButtons: document.querySelectorAll('[data-play-sent].active').length,
      isPlaying: window.studioState.isPlaying,
      state1: document.querySelector('[data-play-sent="1"]')?.getAttribute('data-play-state'),
    }));
    assert(
      loopStepE.loopIdx === null &&
      loopStepE.totalActiveButtons === 0 &&
      loopStepE.isPlaying === false &&
      loopStepE.state1 === 'idle',
      `Step E (Flow Auto-Pause reset & Pause toggle) failed: ${JSON.stringify(loopStepE)}`,
    );

    // Step F: Test Natural Playback Completion and Repress (Bug fix verification)
    // When sentence plays to end and stops naturally, it must reset to idle.
    // When user represses that play button, it must Play Once and NEVER jump to loop!
    await page.evaluate(() => {
      window.studioState.endAction = 'pause';
      window.studioState.loopSentenceIndex = null;
      window.studioState.activeSentence = window.studioState.item.sentences[0];
      window.studioState.isPlaying = true;
      window.studioState.activeSentenceStep = 'playing-once';
      window.studioState.lastSeekTime = 0;
      window.studioState.ytPlayer.current = window.studioState.item.sentences[0].endSec;
      window.checkSentenceDrillProgress();
    });
    const naturalEndCheck = await page.evaluate(() => ({
      isPlaying: window.studioState.isPlaying,
      activeStep: window.studioState.activeSentenceStep,
      state1: document.querySelector('[data-play-sent="1"]')?.getAttribute('data-play-state'),
    }));
    assert(
      naturalEndCheck.isPlaying === false &&
      naturalEndCheck.activeStep === 'idle' &&
      naturalEndCheck.state1 === 'idle',
      `Natural end reset failed: ${JSON.stringify(naturalEndCheck)}`,
    );

    await page.click('[data-play-sent="1"]');
    const repressCheck = await page.evaluate(() => ({
      loopIdx: window.studioState.loopSentenceIndex,
      endAction: window.studioState.endAction,
      state1: document.querySelector('[data-play-sent="1"]')?.getAttribute('data-play-state'),
      isPlaying: window.studioState.isPlaying,
      activeStep: window.studioState.activeSentenceStep,
    }));
    assert(
      repressCheck.loopIdx === null &&
      repressCheck.endAction === 'pause' &&
      repressCheck.state1 === 'playing' &&
      repressCheck.isPlaying === true &&
      repressCheck.activeStep === 'playing-once',
      `Repress after natural stop must play once (NEVER jump to loop): ${JSON.stringify(repressCheck)}`,
    );

    // Step G: Full Item Clickable — Clicking top meta (#02 or timestamp) triggers playback!
    await page.click('#sent-card-2 .sent-meta-left');
    const topClickCheck = await page.evaluate(() => ({
      activeSent: window.studioState.activeSentence?.index,
      isPlaying: window.studioState.isPlaying,
    }));
    assert(
      topClickCheck.activeSent === 2 && topClickCheck.isPlaying === true,
      `Full item clickable failed on top meta click: ${JSON.stringify(topClickCheck)}`,
    );
    // Clicking top area again while playing toggles pause
    await page.click('#sent-card-2 .sent-card-top');
    const topPauseCheck = await page.evaluate(() => ({
      activeSent: window.studioState.activeSentence?.index,
      isPlaying: window.studioState.isPlaying,
    }));
    assert(
      topPauseCheck.activeSent === 2 && topPauseCheck.isPlaying === false,
      `Full item pause failed on top click: ${JSON.stringify(topPauseCheck)}`,
    );
    console.log('PASS: Single unified playback button, separate loop toggle & full item clickability verified!');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-studio-shadow-light.png') });

    // Flexible Video Docking: Transcript (side) -> Theater (theater) -> Transcript (side) (Zero Remount!)
    await page.click('[data-layout-choice="theater"]');
    await new Promise((r) => setTimeout(r, 180));
    const theaterLayout = await page.evaluate(() => {
      const ws = document.getElementById('studio-main-content');
      return {
        layout: ws.getAttribute('data-layout'),
        theaterPressed: document.querySelector('[data-layout-choice="theater"]').getAttribute('aria-pressed'),
        sidePressed: document.querySelector('[data-layout-choice="side"]').getAttribute('aria-pressed'),
        wsAlive: ws.dataset.e2eAlive,
        cardAlive: document.querySelector('.sentence-driller-card')?.dataset.e2eAlive,
        playerAlive: document.getElementById('studio-youtube-player')?.dataset.e2eAlive,
      };
    });
    assert(
      theaterLayout.layout === 'theater' &&
      theaterLayout.theaterPressed === 'true' &&
      theaterLayout.sidePressed === 'false' &&
      theaterLayout.wsAlive === 'yes' &&
      theaterLayout.cardAlive === 'yes' &&
      theaterLayout.playerAlive === 'yes',
      `Theater layout or zero-remount invariant failed: ${JSON.stringify(theaterLayout)}`,
    );
    await page.click('[data-layout-choice="side"]');

    // Read Mode
    await page.click('.mode-tab-btn[data-mode="read"]');
    const readState = await page.evaluate(() => ({
      paragraphs: document.querySelectorAll('.editorial-paragraph-block').length,
      readVisible: getComputedStyle(document.getElementById('mode-panel-read')).display !== 'none',
      transHidden: getComputedStyle(document.getElementById('translation-control-deck')).display === 'none',
      transBtnHidden: document.getElementById('trans-trigger-btn')?.hidden,
    }));
    assert(
      readState.readVisible && readState.transHidden && readState.transBtnHidden && readState.paragraphs > 0,
      `Read mode failed: ${JSON.stringify(readState)}`,
    );
    await page.click('[data-studio-check-subject="paragraphs"][data-studio-check-index="1"]');
    assert(
      (await page.evaluate(() => document.querySelector('#studio-read-progress-bar [data-sp-completed]')?.textContent?.trim())) === '1',
      'Read paragraph completion did not update #studio-read-progress-bar.',
    );
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-studio-read-paragraphs.png') });

    // Listen Mode (Cloze Dictation + Prev/Next Disabled Boundary Check + Completion Toggle)
    await page.click('.mode-tab-btn[data-mode="listen"]');
    const dictInit = await page.evaluate(() => ({
      inputs: document.querySelectorAll('#dictation-sentence-area .cloze-input').length,
      prevDisabledAtStart: document.getElementById('dict-prev-btn')?.disabled,
      nextDisabledAtStart: document.getElementById('dict-next-btn')?.disabled,
    }));
    assert(dictInit.inputs >= 1 && dictInit.prevDisabledAtStart === true && dictInit.nextDisabledAtStart === false,
      `Listen dictation initial button boundary state failed: ${JSON.stringify(dictInit)}`);
    await page.click('#dict-next-btn');
    assert((await page.evaluate(() => document.getElementById('dict-prev-btn')?.disabled)) === false,
      'Dictation Prev button did not enable on sentence #2.');
    await page.click('#dict-reveal-btn');
    await page.click('#dict-check-complete-btn');
    assert(
      (await page.evaluate(() => document.querySelector('#studio-listen-progress-bar [data-sp-completed]')?.textContent?.trim())) === '1',
      'Listen dictation manual completion toggle did not update #studio-listen-progress-bar.',
    );
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08-studio-listen-dictation.png') });

    // Coach Mode (Real Dynamic OpenCode Go AI Analysis + `+ Save` -> `✓ Saved` + Completion Check)
    console.log('\n--- 4. Dynamic OpenCode Go AI Coach, Word Lookup & Save Button States ---');
    await page.click('.mode-tab-btn[data-mode="coach"]');
    await page.waitForFunction(() => !document.getElementById('coach-content-box')?.hidden, {
      timeout: 120000,
    });
    const coachStats = await page.evaluate(() => ({
      connected: document.querySelectorAll('#coach-connected-grid .coach-item-card').length,
      expressions: document.querySelectorAll('#coach-expressions-grid .coach-item-card').length,
      vocab: document.querySelectorAll('#coach-vocab-grid .coach-item-card').length,
      cefr: document.getElementById('coach-cefr-stamp')?.textContent?.trim(),
      verbatimIntact: (window.studioState.item?.sentences || []).every((s) => {
        const d = document.createElement('div');
        d.innerHTML = s.highlightedHtml || '';
        return d.textContent.replace(/\s+/g, ' ').trim() === s.text.replace(/\s+/g, ' ').trim();
      }),
    }));
    assert(coachStats.connected > 0 && coachStats.expressions > 0 && coachStats.vocab > 0 && coachStats.verbatimIntact,
      `Dynamic AI Coach check failed: ${JSON.stringify(coachStats)}`);
    await page.click('[data-studio-check-subject="coachConnected"][data-studio-check-index="0"]');
    assert(
      (await page.evaluate(() => document.querySelector('#studio-coach-connected-progress-bar [data-sp-completed]')?.textContent?.trim())) === '1',
      'Coach connected speech check toggle did not update progress bar.',
    );

    // Click `+ Save` on first Coach vocabulary card -> assert `.is-saved` state transitions immediately
    await page.click('[data-save-vocab="0"]');
    await page.waitForFunction(
      () => document.querySelector('[data-save-vocab="0"]')?.classList.contains('is-saved') === true,
      { timeout: 10000 },
    );
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09-studio-ai-coach.png') });

    // Switch back to Shadow Mode & test Click-Any-Word Contextual AI Lookup + selected-word cleanup
    await page.click('.mode-tab-btn[data-mode="shadow"]');
    await page.evaluate(() => {
      const words = [...document.querySelectorAll('.clickable-word')];
      const target = words.find((w) => (w.dataset.word || '').length >= 5) || words[0];
      target?.click();
    });
    await page.waitForFunction(
      () => {
        const pop = document.getElementById('word-lookup-popover');
        const def = document.getElementById('wp-def')?.textContent?.trim() || '';
        return pop && !pop.hidden && def && !/Looking up/i.test(def);
      },
      { timeout: 45000 },
    );
    assert(
      (await page.evaluate(() => document.querySelectorAll('.clickable-word.selected-word').length)) === 1,
      'Expected exactly 1 .selected-word while popover is open.',
    );
    await page.click('#wp-close-btn');
    assert(
      (await page.evaluate(() => document.querySelectorAll('.clickable-word.selected-word').length)) === 0,
      '.selected-word highlight was not cleared when closing popover.',
    );

    // -----------------------------------------------------------------------
    // 5. Exact Millisecond Playback Boundaries & 0.05x Speed Steppers (Inline + Popover)
    // -----------------------------------------------------------------------
    console.log('\n--- 5. Exact Millisecond Playback Boundaries & Speed Control ---');
    // Inline [−] and [+] steppers directly in #studio-control-bar without opening popover
    await page.click('#scb-speed-down-btn');
    const inlineDown = await page.evaluate(() => ({
      pill: document.getElementById('scb-speed-value')?.textContent,
      popoverHidden: document.getElementById('speed-popover')?.hidden,
    }));
    assert(
      inlineDown.pill === '0.95x' && inlineDown.popoverHidden === true,
      `Inline speed down failed: ${JSON.stringify(inlineDown)}`,
    );
    await page.click('#scb-speed-up-btn');
    assert(
      (await page.evaluate(() => document.getElementById('scb-speed-value')?.textContent)) === '1.00x',
      'Inline speed up failed to restore 1.00x.',
    );

    await page.click('#speed-trigger-btn');
    await page.waitForFunction(() => document.getElementById('speed-popover')?.hidden === false, {
      timeout: 5000,
    });
    await page.evaluate(() => window.setStudioSpeed(0.85));
    const exact005Speed = await page.evaluate(() => ({
      badge: document.getElementById('current-speed-badge')?.textContent,
      pill: document.getElementById('scb-speed-value')?.textContent,
      slider: document.getElementById('speed-slider')?.value,
    }));
    assert(
      exact005Speed.badge === '0.85x' && exact005Speed.pill === '0.85x' && exact005Speed.slider === '0.85',
      `0.05x speed precision failed: ${JSON.stringify(exact005Speed)}`,
    );

    // Test Steppers: [−] and [+] flanking speed badge
    await page.click('#speed-up-btn');
    const steppedUp = await page.evaluate(() => ({
      badge: document.getElementById('current-speed-badge')?.textContent,
      pill: document.getElementById('scb-speed-value')?.textContent,
    }));
    assert(
      steppedUp.badge === '0.90x' && steppedUp.pill === '0.90x',
      `Step up (+0.05x) failed: expected 0.90x, got ${JSON.stringify(steppedUp)}`,
    );

    await page.click('#speed-down-btn');
    const steppedDown = await page.evaluate(() => document.getElementById('current-speed-badge')?.textContent);
    assert(steppedDown === '0.85x', `Step down (-0.05x) failed: expected 0.85x, got ${steppedDown}`);

    await page.evaluate(() => window.setStudioSpeed(1.5));
    const presetSpeed = await page.evaluate(() => ({
      state: window.studioState.speed,
      pill: document.getElementById('scb-speed-value')?.textContent,
      activeTick: document.querySelector('#speed-ticks-row .speed-tick.active')?.textContent,
    }));
    assert(
      presetSpeed.state === 1.5 && presetSpeed.pill === '1.50x' && presetSpeed.activeTick === '1.50x',
      '1.50x preset failed.',
    );
    await page.evaluate(() => window.setStudioSpeed(1.0));
    await page.click('#speed-trigger-btn'); // Close speed popover

    const boundaries = await page.evaluate(() => {
      window.studioState.endAction = 'pause';
      window.studioState.loopSentenceIndex = null;
      const fake = {
        current: 0,
        pausedAt: null,
        seekedTo: null,
        unmutedAt: null,
        seekTo(value) { this.current = value; this.seekedTo = value; },
        playVideo() {},
        pauseVideo() { this.pausedAt = this.current; },
        mute() {},
        unMute() { this.unmutedAt = this.current; },
        getCurrentTime() { return this.current; },
        setPlaybackRate() {},
        isMuted() { return false; },
        getPlayerState() { return 1; },
      };
      window.studioState.ytPlayer = fake;
      const sentence = window.studioState.item.sentences[1];
      window.playSentence(sentence.index);
      clearInterval(window.studioState.playbackTicker);
      window.studioState.playbackTicker = null;
      window.checkSentenceDrillProgress();
      window.studioState.lastSeekTime = 0;
      for (let t = sentence.startSec; t <= sentence.endSec + 0.03; t += 0.005) {
        fake.current = Number(t.toFixed(3));
        window.checkSentenceDrillProgress();
        if (fake.pausedAt !== null) break;
      }
      return {
        start: sentence.startSec,
        end: sentence.endSec,
        seekedTo: fake.seekedTo,
        pausedAt: fake.pausedAt,
        unmutedAt: fake.unmutedAt,
        isPlayingAfterAutoPause: window.studioState.isPlaying,
        playBtnActiveAfterAutoPause: document
          .querySelector(`[data-play-sent="${sentence.index}"]`)
          ?.classList.contains('active'),
      };
    });

    assert(Math.abs(boundaries.seekedTo - boundaries.start) < 0.0005, `Seek ${boundaries.seekedTo} !== ${boundaries.start}`);
    assert(boundaries.unmutedAt !== null && Math.abs(boundaries.unmutedAt - boundaries.start) <= 0.002, 'Onset unmute failed.');
    assert(
      boundaries.pausedAt !== null &&
      boundaries.pausedAt <= boundaries.end &&
      boundaries.pausedAt >= boundaries.end - 0.03,
      `Pause ${boundaries.pausedAt} outside 30ms before ${boundaries.end}`,
    );
    assert(
      boundaries.isPlayingAfterAutoPause === false && boundaries.playBtnActiveAfterAutoPause === false,
      'Play button remained active after end-of-sentence auto-pause!',
    );
    console.log(`PASS: Exact seek ${boundaries.seekedTo}s, onset unmute ${boundaries.unmutedAt}s, pre-boundary pause ${boundaries.pausedAt}s + Play button auto-reset`);

    // -----------------------------------------------------------------------
    // 6. 170+ World Language Translation (2-Trigger State Machine & Quota Lock)
    // -----------------------------------------------------------------------
    console.log('\n--- 6. World Language Translation Deck (Per-Sentence + Translate All + Permanent Cache) ---');

    const langInfo = await page.evaluate(() => ({
      removedCheckbox: document.getElementById('translation-toggle-checkbox') === null,
      removedRefreshBtn: document.getElementById('trans-refresh-btn') === null,
      count: document.getElementById('trans-lang-select')?.options?.length || 0,
      first: document.getElementById('trans-lang-select')?.options?.[0]?.value,
      second: document.getElementById('trans-lang-select')?.options?.[1]?.value,
    }));
    assert(
      langInfo.removedCheckbox &&
      langInfo.removedRefreshBtn &&
      langInfo.count > 150 &&
      langInfo.first === 'none' &&
      langInfo.second === 'ar',
      `Language catalog / removed controls check failed: ${JSON.stringify(langInfo)}`,
    );

    // Open Translation popover from unified control bar before interacting
    await page.click('#trans-trigger-btn');
    await page.waitForFunction(() => document.getElementById('translation-control-deck')?.hidden === false, {
      timeout: 5000,
    });

    // 6a. Verify permanent cross-account video cache on `fixture` (`Ka0p5tUUmgg`)
    await page.select('#trans-lang-select', 'ar');
    const needsFixtureTranslate = await page.evaluate(
      () => document.getElementById('trans-all-btn')?.dataset.transAllState !== 'completed',
    );
    if (needsFixtureTranslate) {
      await page.click('#trans-all-btn');
      await page.waitForFunction(
        () => document.getElementById('trans-all-btn')?.dataset.transAllState === 'completed',
        { timeout: 120000 },
      );
    }
    const fixtureArState = await page.evaluate(() => ({
      dir: document.querySelector('.sentence-translation-text')?.getAttribute('dir'),
      filled: [...document.querySelectorAll('.sentence-translation-text')].filter((el) => {
        const txt = (el.textContent || '').trim();
        return txt.length > 0 && !el.classList.contains('is-loading');
      }).length,
      allBtnDisabled: document.getElementById('trans-all-btn')?.disabled,
      allBtnState: document.getElementById('trans-all-btn')?.dataset.transAllState,
    }));
    assert(
      fixtureArState.dir === 'rtl' &&
      fixtureArState.filled === fixture.sentences.length &&
      fixtureArState.allBtnDisabled === true &&
      fixtureArState.allBtnState === 'completed',
      `Permanent video cache on fixture failed: ${JSON.stringify(fixtureArState)}`,
    );

    // 6b. Open fresh untranslated `dlgLesson` to test full Before -> Single Sentence -> Translate Remaining -> Locked -> Reload
    await page.goto(
      `${BASE_URL}/studio.html?id=${encodeURIComponent(dlgLesson.id)}&mode=shadow`,
      { waitUntil: 'domcontentloaded', timeout: 30000 },
    );
    await page.waitForSelector('.sentence-driller-card', { timeout: 30000 });
    await page.waitForFunction(() => document.getElementById('loader-overlay')?.hidden === true, {
      timeout: 30000,
    });

    // Open Translation popover before interacting on fresh lesson
    await page.click('#trans-trigger-btn');
    await page.waitForFunction(() => document.getElementById('translation-control-deck')?.hidden === false, {
      timeout: 5000,
    });

    // Selecting "none" hides all translation buttons and boxes without calling API
    await page.select('#trans-lang-select', 'none');
    const noneState = await page.evaluate(() => ({
      allBtnHidden: document.getElementById('trans-all-btn')?.hidden,
      badge: document.getElementById('scb-trans-lang-badge')?.textContent?.trim(),
      visibleBoxes: [...document.querySelectorAll('.sentence-translation-box')].filter((b) => !b.hidden).length,
    }));
    assert(
      noneState.allBtnHidden === true && noneState.badge === 'OFF' && noneState.visibleBoxes === 0,
      `None language state failed: ${JSON.stringify(noneState)}`,
    );

    // Selecting "ar" in spinner NEVER triggers API; only shows the 2 triggers (Translate Active + Translate All)
    await page.select('#trans-lang-select', 'ar');
    await new Promise((r) => setTimeout(r, 250));
    const beforeTriggerState = await page.evaluate(() => ({
      allBtnHidden: document.getElementById('trans-all-btn')?.hidden,
      allBtnDisabled: document.getElementById('trans-all-btn')?.disabled,
      allBtnState: document.getElementById('trans-all-btn')?.dataset.transAllState,
      badge: document.getElementById('scb-trans-lang-badge')?.textContent?.trim(),
      transBtnSent1: Boolean(document.querySelector('[data-trans-btn-sent="1"]')),
      visibleBoxes: [...document.querySelectorAll('.sentence-translation-box')].filter((b) => !b.hidden).length,
    }));
    assert(
      beforeTriggerState.allBtnHidden === false &&
      beforeTriggerState.allBtnDisabled === false &&
      beforeTriggerState.allBtnState === 'ready' &&
      beforeTriggerState.badge === 'AR' &&
      beforeTriggerState.transBtnSent1 === true &&
      beforeTriggerState.visibleBoxes === 0,
      `Before-trigger state failed (spinner must not auto-translate): ${JSON.stringify(beforeTriggerState)}`,
    );

    // Close popover before per-sentence trigger click, then open for #trans-all-btn
    await page.click('#trans-trigger-btn');

    // 6c. Trigger 1: Click translation button on sentence #1
    await page.click('[data-trans-btn-sent="1"]');
    await page.waitForFunction(
      () => {
        const box1 = document.querySelector('[data-trans-box="1"]');
        const txt1 = document.querySelector('.sentence-translation-text[data-trans-sent="1"]');
        return (
          box1 &&
          box1.hidden === false &&
          txt1 &&
          !txt1.classList.contains('is-loading') &&
          (txt1.textContent || '').trim().length > 0
        );
      },
      { timeout: 60000 },
    );

    const afterSingleState = await page.evaluate(() => ({
      visibleBoxes: [...document.querySelectorAll('.sentence-translation-box')].filter((b) => !b.hidden).length,
      allBtnText: document.getElementById('trans-all-btn')?.textContent?.trim() || '',
      allBtnDisabled: document.getElementById('trans-all-btn')?.disabled,
    }));
    assert(
      afterSingleState.visibleBoxes === 1 &&
      afterSingleState.allBtnDisabled === false &&
      afterSingleState.allBtnText.includes(String(dlgLesson.sentences.length - 1)),
      `Single-sentence translation state failed: ${JSON.stringify(afterSingleState)}`,
    );

    // 6d. Trigger 2: Open Translation popover and click Translate All (Translate Remaining) button
    await page.click('#trans-trigger-btn');
    await page.click('#trans-all-btn');
    await page.waitForFunction(
      (total) => {
        const allBtn = document.getElementById('trans-all-btn');
        const filledBoxes = [...document.querySelectorAll('.sentence-translation-text')].filter((el) => {
          const txt = (el.textContent || '').trim();
          return txt.length > 0 && !el.classList.contains('is-loading');
        }).length;
        return (
          allBtn &&
          allBtn.disabled === true &&
          allBtn.dataset.transAllState === 'completed' &&
          filledBoxes === total
        );
      },
      { timeout: 90000 },
      dlgLesson.sentences.length,
    );

    // 6e. Reload the page -> verify all translations load in 0ms from SQLite cache with buttons locked!
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.sentence-driller-card', { timeout: 30000 });
    await page.waitForFunction(() => document.getElementById('loader-overlay')?.hidden === true, {
      timeout: 30000,
    });
    const afterReloadState = await page.evaluate(() => ({
      dir: document.querySelector('.sentence-translation-text')?.getAttribute('dir'),
      filled: [...document.querySelectorAll('.sentence-translation-text')].filter((el) => {
        const txt = (el.textContent || '').trim();
        return txt.length > 0 && !el.classList.contains('is-loading');
      }).length,
      allBtnDisabled: document.getElementById('trans-all-btn')?.disabled,
      allBtnState: document.getElementById('trans-all-btn')?.dataset.transAllState,
    }));
    assert(
      afterReloadState.dir === 'rtl' &&
      afterReloadState.filled === dlgLesson.sentences.length &&
      afterReloadState.allBtnDisabled === true &&
      afterReloadState.allBtnState === 'completed',
      `Post-reload SQLite translation cache lock failed: ${JSON.stringify(afterReloadState)}`,
    );

    // Return to primary video `fixture` for Section 7
    await page.goto(
      `${BASE_URL}/studio.html?id=${encodeURIComponent(fixture.id)}&mode=shadow`,
      { waitUntil: 'domcontentloaded', timeout: 30000 },
    );
    await page.waitForSelector('.sentence-driller-card', { timeout: 30000 });
    await page.waitForFunction(() => document.getElementById('loader-overlay')?.hidden === true, {
      timeout: 30000,
    });

    const persistedLesson = await fetch(`${BASE_URL}/api/history/${encodeURIComponent(dlgLesson.id)}`, {
      headers: authHeadersA,
    }).then((r) => r.json());
    assert(
      persistedLesson.translationsCache?.ar &&
      Object.keys(persistedLesson.translationsCache.ar).length === dlgLesson.sentences.length,
      'Permanent SQLite translation cache did not persist all sentences.',
    );
    console.log(
      `PASS: ${langInfo.count} options verified — 2-Trigger State Machine (Per-Sentence + Translate All), Quota Lock & Permanent SQLite/Video Cache verified!`,
    );

    // -----------------------------------------------------------------------
    // 7. SQLite Notes Persistence, Session Completion, Export & Mobile 390px
    // -----------------------------------------------------------------------
    console.log('\n--- 7. SQLite Notes Persistence, Session Completion, Export & Mobile Check ---');
    await page.click('.mode-tab-btn[data-mode="notes"]');
    const noteText = `E2E SQLite Note ${Date.now()}`;
    await page.evaluate(() => {
      document.getElementById('study-notes-textarea').value = '';
    });
    await page.type('#study-notes-textarea', noteText);
    await new Promise((r) => setTimeout(r, 800));

    const verifyDbNote = await fetch(`${BASE_URL}/api/history/${encodeURIComponent(fixture.id)}`, {
      headers: authHeadersA,
    }).then((r) => r.json());
    assert(verifyDbNote.studyNotes === noteText, `SQLite did not persist note: "${verifyDbNote.studyNotes}"`);

    const beforeDrill = await page.evaluate(() => window.studioState.item.completedDrills || 0);
    await page.click('#complete-drill-btn');
    await page.waitForFunction(
      (prev) => (window.studioState.item.completedDrills || 0) === prev + 1,
      { timeout: 10000 },
      beforeDrill,
    );

    await page.click('#download-markdown-btn');
    await new Promise((r) => setTimeout(r, 250));
    const toastMsg = await page.evaluate(() => document.getElementById('studio-toast')?.textContent || '');
    assert(/downloaded|\.md/i.test(toastMsg), `Export toast did not confirm: "${toastMsg}"`);

    await page.click('.mode-tab-btn[data-mode="shadow"]');
    await page.click('#studio-theme-toggle');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10-studio-dark-mode.png') });
    await page.click('#studio-theme-toggle');

    await page.setViewport({ width: 390, height: 844 });
    await new Promise((r) => setTimeout(r, 250));
    const mobile390 = await page.evaluate(() => {
      const bar = document.getElementById('studio-control-bar');
      const btns = Array.from(bar?.querySelectorAll('.scb-btn') || []).filter(
        (b) => getComputedStyle(b).display !== 'none',
      );
      const tops = btns.map((b) => Math.round(b.getBoundingClientRect().top));
      const bottoms = btns.map((b) => Math.round(b.getBoundingClientRect().bottom));
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        barHeight: bottoms.length ? Math.max(...bottoms) - Math.min(...tops) : 999,
        barOverflow: bar ? bar.scrollWidth - bar.clientWidth : 999,
      };
    });
    assert(mobile390.overflow <= 4, `Horizontal overflow on 390px mobile: +${mobile390.overflow}px`);
    assert(
      mobile390.barHeight <= 44 && mobile390.barOverflow <= 2,
      `Control bar wrapped/overflowed on 390px mobile: ${JSON.stringify(mobile390)}`,
    );
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11-studio-mobile.png') });

    await page.setViewport({ width: 360, height: 780 });
    await new Promise((r) => setTimeout(r, 200));
    const mobile360 = await page.evaluate(() => {
      const bar = document.getElementById('studio-control-bar');
      const btns = Array.from(bar?.querySelectorAll('.scb-btn') || []).filter(
        (b) => getComputedStyle(b).display !== 'none',
      );
      const tops = btns.map((b) => Math.round(b.getBoundingClientRect().top));
      const bottoms = btns.map((b) => Math.round(b.getBoundingClientRect().bottom));
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        barHeight: bottoms.length ? Math.max(...bottoms) - Math.min(...tops) : 999,
        barOverflow: bar ? bar.scrollWidth - bar.clientWidth : 999,
        persistedShadowDone: document.querySelector('#studio-shadow-progress-bar [data-sp-completed]')?.textContent?.trim(),
      };
    });
    assert(
      mobile360.overflow <= 4 &&
      mobile360.barHeight <= 44 &&
      mobile360.barOverflow <= 2 &&
      mobile360.persistedShadowDone === '1',
      `360px single-row control bar or persisted completion failed: ${JSON.stringify(mobile360)}`,
    );

    // Check Vocabulary Vault progress bar reflects Coach-saved word & completion toggle
    await page.goto(`${BASE_URL}/vocabulary`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#vocab-grid [data-vocab-complete]', { timeout: 15000 });
    await page.click('#vocab-grid [data-vocab-complete]');
    const vocabBarAfter = await page.evaluate(() => ({
      total: document.querySelector('#vocab-progress-bar [data-sp-total]')?.textContent?.trim(),
      completed: document.querySelector('#vocab-progress-bar [data-sp-completed]')?.textContent?.trim(),
      remaining: document.querySelector('#vocab-progress-bar [data-sp-remaining]')?.textContent?.trim(),
    }));
    assert(
      Number(vocabBarAfter.total) >= 1 && vocabBarAfter.completed === '1',
      `Vocabulary Vault completion toggle/progress bar failed: ${JSON.stringify(vocabBarAfter)}`,
    );

    // Verify PWA Manifest, Service Worker & Chromium Installability
    const cdpSession = await page.target().createCDPSession();
    const appManifest = await cdpSession.send('Page.getAppManifest');
    const installErrors = await cdpSession.send('Page.getInstallabilityErrors');
    assert(appManifest.url.endsWith('/manifest.json'), `Manifest URL missing: ${appManifest.url}`);
    assert(
      !installErrors.installabilityErrors || installErrors.installabilityErrors.length === 0,
      `PWA installability errors detected: ${JSON.stringify(installErrors.installabilityErrors)}`,
    );
    console.log('PASS: PWA Manifest, Service Worker & Chromium Installability (0 errors)');

    const appConsoleErrors = consoleErrors.filter(
      (txt) => !/youtube|ytimg|googlevideo|ERR_BLOCKED|Failed to load resource|401 \(Unauthorized\)|404 \(Not Found\)/i.test(txt),
    );
    assert(appConsoleErrors.length === 0, `Console errors: ${appConsoleErrors.join(' | ')}`);
    assert(pageErrors.length === 0, `Uncaught page errors: ${pageErrors.join(' | ')}`);

    console.log('PASS: Mobile responsive (0px overflow) & zero console/page errors');
    console.log(`\nALL END-TO-END PRODUCTION VERIFICATION CHECKS PASSED! Screenshots: ${SCREENSHOT_DIR}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    // Clean up primary E2E test account & all its test rows from production SQLite
    await fetch(`${BASE_URL}/api/auth/account`, {
      method: 'DELETE',
      headers: authHeadersA,
    }).catch(() => {});
  }
}

runProductionE2ETest().catch((error) => {
  console.error('E2E Verification Failed:', error.message);
  process.exit(1);
});
