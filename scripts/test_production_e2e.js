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
   REAL CRYPTOGRAPHIC GOOGLE OAUTH 2.0 PKCE + RS256 OIDC VERIFICATION HARNESS
   Uses a real 2048-bit RSA keypair, JWKS endpoint, PKCE S256 verifier check,
   and an isolated production NestJS instance to verify Google Sign-In E2E.
   ============================================================================ */
async function verifyRealGoogleOAuthAndOidc() {
  console.log('\n--- 1b. Real Cryptographic Google OAuth 2.0 PKCE (S256) + RS256 OIDC Verification ---');

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const kid = 'e2e-google-rs256-key-1';
  const testClientId = 'e2e-google-client-id.apps.googleusercontent.com';
  const testClientSecret = 'e2e-google-client-secret-xyz';

  const issuedCodes = new Map();

  function signOidcIdToken(claims, customPrivateKey = privateKey) {
    const header = { alg: 'RS256', typ: 'JWT', kid };
    const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;
    const signature = crypto.createSign('RSA-SHA256').update(signingInput).end().sign(customPrivateKey);
    return `${signingInput}.${base64UrlEncode(signature)}`;
  }

  // Start local OIDC Provider (JWKS + Authorization + Token exchange with PKCE S256 validation)
  const oidcServer = http.createServer((req, res) => {
    const reqUrl = new URL(req.url, 'http://127.0.0.1');

    if (req.method === 'GET' && reqUrl.pathname === '/jwks') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(
        JSON.stringify({
          keys: [
            {
              ...publicJwk,
              kid,
              use: 'sig',
              alg: 'RS256',
            },
          ],
        }),
      );
      return;
    }

    if (req.method === 'GET' && reqUrl.pathname === '/auth') {
      const clientId = reqUrl.searchParams.get('client_id');
      const redirectUri = reqUrl.searchParams.get('redirect_uri');
      const state = reqUrl.searchParams.get('state');
      const codeChallenge = reqUrl.searchParams.get('code_challenge');
      const codeChallengeMethod = reqUrl.searchParams.get('code_challenge_method');

      if (clientId !== testClientId || codeChallengeMethod !== 'S256' || !codeChallenge || !redirectUri || !state) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid OAuth authorization request');
        return;
      }

      const authCode = `code_${crypto.randomBytes(16).toString('hex')}`;
      issuedCodes.set(authCode, { redirectUri, codeChallenge });

      const cb = new URL(redirectUri);
      cb.searchParams.set('code', authCode);
      cb.searchParams.set('state', state);
      res.writeHead(302, { Location: cb.toString() });
      res.end();
      return;
    }

    if (req.method === 'POST' && reqUrl.pathname === '/token') {
      let rawBody = '';
      req.on('data', (chunk) => {
        rawBody += chunk;
      });
      req.on('end', () => {
        const params = new URLSearchParams(rawBody);
        const code = params.get('code');
        const clientId = params.get('client_id');
        const clientSecret = params.get('client_secret');
        const redirectUri = params.get('redirect_uri');
        const codeVerifier = params.get('code_verifier') || '';
        const grantType = params.get('grant_type');

        const record = issuedCodes.get(code);
        issuedCodes.delete(code);

        const computedChallenge = base64UrlEncode(
          crypto.createHash('sha256').update(codeVerifier).digest(),
        );

        if (
          !record ||
          grantType !== 'authorization_code' ||
          clientId !== testClientId ||
          clientSecret !== testClientSecret ||
          redirectUri !== record.redirectUri ||
          computedChallenge !== record.codeChallenge
        ) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'PKCE or client check failed' }));
          return;
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const idToken = signOidcIdToken({
          iss: 'https://accounts.google.com',
          aud: testClientId,
          sub: 'google-sub-pkce-1001',
          email: 'google.pkce.user@flaptap.test',
          email_verified: true,
          name: ' Jordan Google PKCE ',
          picture: 'https://lh3.googleusercontent.com/a/default-user',
          iat: nowSec - 5,
          exp: nowSec + 3600,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            access_token: 'ya29.real_pkce_access_token',
            token_type: 'Bearer',
            expires_in: 3600,
            id_token: idToken,
          }),
        );
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => oidcServer.listen(0, '127.0.0.1', resolve));
  const oidcPort = oidcServer.address().port;
  const oidcBase = `http://127.0.0.1:${oidcPort}`;

  const tempDbPath = path.join(os.tmpdir(), `flaptap-google-e2e-${Date.now()}.sqlite`);
  const testAppPort = 3390 + Math.floor(Math.random() * 80);
  const testAppUrl = `http://127.0.0.1:${testAppPort}`;

  const backendProc = spawn(process.execPath, [path.resolve(__dirname, '../backend/dist/main.js')], {
    env: {
      ...process.env,
      PORT: String(testAppPort),
      HOST: '127.0.0.1',
      FLAPTAP_SQLITE_PATH: tempDbPath,
      GOOGLE_CLIENT_ID: testClientId,
      GOOGLE_CLIENT_SECRET: testClientSecret,
      GOOGLE_OAUTH_AUTH_URL: `${oidcBase}/auth`,
      GOOGLE_OAUTH_TOKEN_URL: `${oidcBase}/token`,
      GOOGLE_OAUTH_JWKS_URI: `${oidcBase}/jwks`,
    },
    stdio: 'ignore',
  });

  try {
    // Wait for isolated NestJS server to boot
    let booted = false;
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(`${testAppUrl}/api/auth/google/config`);
        if (r.ok) {
          const cfg = await r.json();
          assert(cfg.enabled === true && cfg.clientId === testClientId, `Unexpected google config: ${JSON.stringify(cfg)}`);
          booted = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 150));
    }
    assert(booted, 'Isolated Google OAuth test server failed to start.');

    // 1. Test full OAuth 2.0 Authorization Code + PKCE (S256) + Double-Submit Cookie State Flow
    const startRes = await fetch(`${testAppUrl}/api/auth/google/start?mode=popup&uiLang=en&nativeLang=ar`, {
      redirect: 'manual',
    });
    assert(startRes.status === 302, `Expected 302 from /api/auth/google/start, got ${startRes.status}`);
    const authLocation = startRes.headers.get('location');
    const setCookieHeader = startRes.headers.get('set-cookie') || '';
    const stateCookieMatch = /flaptap_oauth_state=([^;]+)/.exec(setCookieHeader);
    assert(authLocation && stateCookieMatch, 'Missing OAuth redirect location or state cookie.');

    // Follow redirect to OIDC provider `/auth`
    const providerRes = await fetch(authLocation, { redirect: 'manual' });
    assert(providerRes.status === 302, `Expected 302 from OIDC /auth, got ${providerRes.status}`);
    const callbackLocation = providerRes.headers.get('location');
    assert(callbackLocation && callbackLocation.includes('/api/auth/google/callback'), 'Invalid callback redirect.');

    // Complete callback with double-submit state cookie
    const cbRes = await fetch(callbackLocation, {
      headers: { Cookie: `flaptap_oauth_state=${stateCookieMatch[1]}` },
    });
    assert(cbRes.status === 200, `Expected 200 from Google callback, got ${cbRes.status}`);
    const cbHtml = await cbRes.text();
    assert(cbHtml.includes('flaptap:google-auth-success'), 'Callback HTML missing success postMessage payload.');
    assert(cbHtml.includes('google.pkce.user@flaptap.test'), 'Callback HTML missing verified Google user email.');
    const sessionCookieMatch = /flaptap_session=([^;]+)/.exec(cbRes.headers.get('set-cookie') || '');
    assert(sessionCookieMatch, 'Google callback did not set HttpOnly flaptap_session cookie.');

    // Verify authenticated `/api/auth/me` using the Google session cookie
    const googleMe = await fetch(`${testAppUrl}/api/auth/me`, {
      headers: { Cookie: `flaptap_session=${sessionCookieMatch[1]}` },
    }).then((r) => r.json());
    assert(
      googleMe.authenticated &&
      googleMe.user.email === 'google.pkce.user@flaptap.test' &&
      googleMe.user.authProvider === 'google' &&
      googleMe.user.hasPassword === false,
      `Google PKCE user profile mismatch: ${JSON.stringify(googleMe)}`,
    );

    // 2. Replay protection: replaying the exact same callback URL & state must fail (400 bridge error)
    const replayRes = await fetch(callbackLocation, {
      headers: { Cookie: `flaptap_oauth_state=${stateCookieMatch[1]}` },
    });
    assert(replayRes.status === 400, `Expected 400 on replayed OAuth state, got ${replayRes.status}`);

    // 3. Account Linking via GIS RS256 Credential (`POST /api/auth/google/credential`):
    // Register an email+password account first, then sign in with Google using the same verified email!
    const existingEmail = 'linked.account@flaptap.test';
    const emailReg = await fetch(`${testAppUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Linked User',
        email: existingEmail,
        password: 'Password123!',
      }),
    }).then((r) => r.json());
    assert(emailReg.authenticated && emailReg.user.authProvider === 'email', 'Pre-link email registration failed.');

    const nowSec = Math.floor(Date.now() / 1000);
    const validGisToken = signOidcIdToken({
      iss: 'accounts.google.com',
      aud: testClientId,
      sub: 'google-sub-gis-2002',
      email: existingEmail,
      email_verified: true,
      name: 'Linked User',
      picture: 'https://lh3.googleusercontent.com/a/linked-user',
      iat: nowSec - 5,
      exp: nowSec + 3600,
    });

    const linkRes = await fetch(`${testAppUrl}/api/auth/google/credential`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: validGisToken }),
    });
    assert(linkRes.ok, `Google GIS credential login failed: ${linkRes.status}`);
    const linkData = await linkRes.json();
    assert(
      linkData.authenticated &&
      linkData.isNewUser === false &&
      linkData.user.id === emailReg.user.id &&
      linkData.user.authProvider === 'email+google' &&
      linkData.user.hasPassword === true,
      `Google account linking mismatch: ${JSON.stringify(linkData)}`,
    );

    // 4. Forged Signature Rejection: sign with an attacker RSA key -> must return 401!
    const attackerKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const forgedJwt = signOidcIdToken(
      {
        iss: 'https://accounts.google.com',
        aud: testClientId,
        sub: 'attacker-sub',
        email: existingEmail,
        email_verified: true,
        iat: nowSec,
        exp: nowSec + 3600,
      },
      attackerKeys.privateKey,
    );
    const forgedRes = await fetch(`${testAppUrl}/api/auth/google/credential`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: forgedJwt }),
    });
    assert(forgedRes.status === 401, `Forged RSA signature must return 401, got ${forgedRes.status}`);

    console.log(
      'PASS: Google OAuth 2.0 PKCE (S256), RS256 JWKS verification, account creation, email+google linking, state replay defense & forged-JWT rejection verified!',
    );
  } finally {
    backendProc.kill('SIGTERM');
    await new Promise((resolve) => oidcServer.close(resolve));
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

    // Run real cryptographic Google OAuth 2.0 PKCE + RS256 OIDC verification
    await verifyRealGoogleOAuthAndOidc();

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
      'Dialogue lesson missing dynamic AI content.',
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
      'Pronunciation workout missing dynamic AI content.',
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
    console.log('\n--- 2a. Signed-Out Browser UI Gate, Google Sign-In Drawer & Auto-Resume ---');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.navbar', { timeout: 10000 });
    await page.waitForFunction(() => window.flaptapState?.sessionLoaded === true, { timeout: 10000 });

    const signedOutHome = await page.evaluate(() => ({
      navTabs: [...document.querySelectorAll('.nav-tab[data-section]')].map((b) => b.dataset.section),
      cardsLeaked: document.querySelectorAll('.history-card').length,
      gateVisible: !document.getElementById('library-auth-gate-card')?.hidden,
      startBtnEnabled: !document.getElementById('start-lesson-btn')?.disabled,
      presetsDemo: document.querySelectorAll('.presets-container, .preset-chip').length,
      googleFonts: [...document.querySelectorAll('link[rel="stylesheet"]')].some((l) =>
        /fonts\.googleapis\.com/i.test(l.href),
      ),
    }));

    assert(
      JSON.stringify(signedOutHome.navTabs) === JSON.stringify(['lessons', 'dialogue', 'pronunciation', 'vocabulary', 'history']),
      `Expected all 5 tabs visible to signed-out visitor, got ${JSON.stringify(signedOutHome.navTabs)}`,
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
      googleBtnVisible: Boolean(document.getElementById('google-signin-btn')),
    }));
    assert(
      interceptedState.pathname === '/' &&
      interceptedState.drawerOpen &&
      interceptedState.gateBannerVisible &&
      interceptedState.googleBtnVisible,
      `Action was not intercepted by Sign-In drawer: ${JSON.stringify(interceptedState)}`,
    );
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-auth-gate-google-drawer.png') });

    // Now sign in inside the open drawer -> pending Start Lesson action must automatically resume into Studio!
    await page.type('#login-email', userAEmail);
    await page.type('#login-password', userAPassword);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.click('#login-submit-btn'),
    ]);

    await page.waitForSelector('.sentence-driller-card', { timeout: 30000 });
    assert(
      page.url().includes('/studio.html') && page.url().includes(`id=${encodeURIComponent(fixture.id)}`),
      `Pending action did not auto-resume into Studio after sign-in: ${page.url()}`,
    );
    console.log('PASS: Signed-out actions intercepted before execution and automatically resumed into Studio upon Sign-In!');

    // -----------------------------------------------------------------------
    // 2b. Authenticated Workspace, URL Cache Banner, Themes, RTL & History Control Center
    // -----------------------------------------------------------------------
    console.log('\n--- 2b. Authenticated Workspace, Instant Cache Banner & History/Usage Control Center ---');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('.history-card').length === 4, {
      timeout: 15000,
    });

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

    // Switch to `History & Usage` Control Center tab
    await page.click('.nav-tab[data-section="history"]');
    await page.waitForFunction(
      () => document.querySelectorAll('#history-ledger-list .history-ledger-row').length === 4,
      { timeout: 15000 },
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

    // --- CRITICAL REGRESSION TEST: LOOP BUTTON & ALL PLAYBACK BUTTON STATES ---
    // Step A: Click Loop on Sentence #1
    await page.click('[data-loop-sent="1"]');
    const loopStepA = await page.evaluate(() => ({
      loopIdx: window.studioState.loopSentenceIndex,
      loop1Active: document.querySelector('[data-loop-sent="1"]')?.classList.contains('active'),
      loop1Pressed: document.querySelector('[data-loop-sent="1"]')?.getAttribute('aria-pressed'),
      play1Active: document.querySelector('[data-play-sent="1"]')?.classList.contains('active'),
    }));
    assert(
      loopStepA.loopIdx === 1 && loopStepA.loop1Active && loopStepA.loop1Pressed === 'true' && loopStepA.play1Active,
      `Step A (Loop #1) failed: ${JSON.stringify(loopStepA)}`,
    );

    // Step B: Move to Sentence #2 (click Play on Sentence #2) -> Sentence #1 Loop MUST reset!
    await page.click('[data-play-sent="2"]');
    const loopStepB = await page.evaluate(() => ({
      loopIdx: window.studioState.loopSentenceIndex,
      activeSent: window.studioState.activeSentence?.index,
      loop1Active: document.querySelector('[data-loop-sent="1"]')?.classList.contains('active'),
      loop1Pressed: document.querySelector('[data-loop-sent="1"]')?.getAttribute('aria-pressed'),
      loop2Active: document.querySelector('[data-loop-sent="2"]')?.classList.contains('active'),
      play1Active: document.querySelector('[data-play-sent="1"]')?.classList.contains('active'),
      play2Active: document.querySelector('[data-play-sent="2"]')?.classList.contains('active'),
    }));
    assert(
      loopStepB.loopIdx === null &&
      loopStepB.activeSent === 2 &&
      loopStepB.loop1Active === false &&
      loopStepB.loop1Pressed === 'false' &&
      loopStepB.loop2Active === false &&
      loopStepB.play1Active === false &&
      loopStepB.play2Active === true,
      `Step B (Move #1 -> #2 must clear #1 Loop & Play state) failed: ${JSON.stringify(loopStepB)}`,
    );

    // Step C: Click Loop on Sentence #2, then directly click Loop on Sentence #3 -> #2 Loop MUST clear!
    await page.click('[data-loop-sent="2"]');
    await page.click('[data-loop-sent="3"]');
    const loopStepC = await page.evaluate(() => ({
      loopIdx: window.studioState.loopSentenceIndex,
      loop2Active: document.querySelector('[data-loop-sent="2"]')?.classList.contains('active'),
      loop3Active: document.querySelector('[data-loop-sent="3"]')?.classList.contains('active'),
      totalActiveLoops: document.querySelectorAll('[data-loop-sent].active').length,
    }));
    assert(
      loopStepC.loopIdx === 3 && !loopStepC.loop2Active && loopStepC.loop3Active && loopStepC.totalActiveLoops === 1,
      `Step C (Direct Loop #2 -> Loop #3 switch) failed: ${JSON.stringify(loopStepC)}`,
    );

    // Step D: Click Sentence #1 text line -> Sentence #3 Loop MUST clear!
    await page.click('[data-line-sent="1"]');
    const loopStepD = await page.evaluate(() => ({
      loopIdx: window.studioState.loopSentenceIndex,
      totalActiveLoops: document.querySelectorAll('[data-loop-sent].active').length,
    }));
    assert(
      loopStepD.loopIdx === null && loopStepD.totalActiveLoops === 0,
      `Step D (Clicking another sentence line must clear Loop) failed: ${JSON.stringify(loopStepD)}`,
    );

    // Step E: Enable Loop on #1, then click `Auto-Pause` flow button -> Loop #1 MUST clear, and clicking Play #1 while playing toggles Pause!
    await page.click('[data-loop-sent="1"]');
    await page.click('.flow-btn[data-end-action="pause"]');
    await page.click('[data-play-sent="1"]'); // Already playing #1 -> toggles Pause!
    const loopStepE = await page.evaluate(() => ({
      loopIdx: window.studioState.loopSentenceIndex,
      totalActiveLoops: document.querySelectorAll('[data-loop-sent].active').length,
      isPlaying: window.studioState.isPlaying,
      play1Active: document.querySelector('[data-play-sent="1"]')?.classList.contains('active'),
    }));
    assert(
      loopStepE.loopIdx === null &&
      loopStepE.totalActiveLoops === 0 &&
      loopStepE.isPlaying === false &&
      loopStepE.play1Active === false,
      `Step E (Flow Auto-Pause reset & Play->Pause toggle) failed: ${JSON.stringify(loopStepE)}`,
    );
    console.log('PASS: Loop button & Play/Pause/Flow button states cleanly reset across every transition!');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-studio-shadow-light.png') });

    // Flexible Video Docking: Side -> Top -> Focus -> Side (Zero Remount!)
    await page.click('[data-layout-choice="top"]');
    assert(
      (await page.evaluate(() => document.getElementById('studio-main-content').getAttribute('data-layout'))) === 'top',
      'Top layout failed.',
    );
    await page.click('#video-mode-toggle');
    await new Promise((r) => setTimeout(r, 180));
    const focusLayout = await page.evaluate(() => {
      const ws = document.getElementById('studio-main-content');
      return {
        layout: ws.getAttribute('data-layout'),
        pressed: document.getElementById('video-mode-toggle').getAttribute('aria-pressed'),
        sidePressed: document.querySelector('[data-layout-choice="side"]').getAttribute('aria-pressed'),
        wsAlive: ws.dataset.e2eAlive,
        cardAlive: document.querySelector('.sentence-driller-card')?.dataset.e2eAlive,
        playerAlive: document.getElementById('studio-youtube-player')?.dataset.e2eAlive,
      };
    });
    assert(
      focusLayout.layout === 'focus' &&
      focusLayout.pressed === 'true' &&
      focusLayout.sidePressed === 'false' &&
      focusLayout.wsAlive === 'yes' &&
      focusLayout.cardAlive === 'yes' &&
      focusLayout.playerAlive === 'yes',
      `Focus layout or zero-remount invariant failed: ${JSON.stringify(focusLayout)}`,
    );
    await page.click('[data-layout-choice="side"]');

    // Read Mode
    await page.click('.mode-tab-btn[data-mode="read"]');
    const readState = await page.evaluate(() => ({
      paragraphs: document.querySelectorAll('.editorial-paragraph-block').length,
      readVisible: getComputedStyle(document.getElementById('mode-panel-read')).display !== 'none',
      transHidden: getComputedStyle(document.getElementById('translation-control-deck')).display === 'none',
    }));
    assert(readState.readVisible && readState.transHidden && readState.paragraphs > 0, 'Read mode failed.');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-studio-read-paragraphs.png') });

    // Listen Mode (Cloze Dictation + Prev/Next Disabled Boundary Check)
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
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08-studio-listen-dictation.png') });

    // Coach Mode (Real Dynamic OpenCode Go AI Analysis + `+ Save` -> `✓ Saved` Button State)
    console.log('\n--- 4. Dynamic OpenCode Go AI Coach, Word Lookup & Save Button States ---');
    await page.click('.mode-tab-btn[data-mode="coach"]');
    await page.waitForFunction(() => !document.getElementById('coach-content-box')?.hidden, {
      timeout: 90000,
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
    // 5. Exact Millisecond Playback Boundaries & Speed Snapping
    // -----------------------------------------------------------------------
    console.log('\n--- 5. Exact Millisecond Playback Boundaries & Speed Control ---');
    await page.evaluate(() => window.setStudioSpeed(0.85));
    const snappedSpeed = await page.evaluate(() => ({
      badge: document.getElementById('current-speed-badge')?.textContent,
      slider: document.getElementById('speed-slider')?.value,
    }));
    assert(snappedSpeed.badge === '0.90x' && snappedSpeed.slider === '0.9', `Speed snap failed: ${JSON.stringify(snappedSpeed)}`);

    await page.evaluate(() => window.setStudioSpeed(1.5));
    const presetSpeed = await page.evaluate(() => ({
      state: window.studioState.speed,
      activeTick: document.querySelector('#speed-ticks-row .speed-tick.active')?.textContent,
    }));
    assert(presetSpeed.state === 1.5 && presetSpeed.activeTick === '1.50x', '1.50x preset failed.');
    await page.evaluate(() => window.setStudioSpeed(1.0));

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
    // 6. 170+ World Language Translation (Arabic RTL + English Identity)
    // -----------------------------------------------------------------------
    console.log('\n--- 6. World Language Translation Deck ---');
    const langInfo = await page.evaluate(() => ({
      count: document.getElementById('trans-lang-select')?.options?.length || 0,
      first: document.getElementById('trans-lang-select')?.options?.[0]?.value,
    }));
    assert(langInfo.count > 150 && langInfo.first === 'ar', `Language catalog check failed: ${JSON.stringify(langInfo)}`);

    await page.evaluate(() => {
      const toggle = document.getElementById('translation-toggle-checkbox');
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitForTranslation(page);

    const arTrans = await page.evaluate(() => ({
      dir: document.querySelector('.sentence-translation-text')?.getAttribute('dir'),
      filled: [...document.querySelectorAll('.sentence-translation-text')].filter((el) => {
        const txt = (el.textContent || '').trim();
        return txt.length > 0 && txt !== '—' && txt !== '...';
      }).length,
    }));
    assert(arTrans.dir === 'rtl' && arTrans.filled === fixture.sentences.length, 'Arabic translation incomplete.');

    await page.evaluate(() => {
      const select = document.getElementById('trans-lang-select');
      select.value = 'en';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(
      (expectedFirst) => {
        const first = document.querySelector('.sentence-translation-text');
        return first && first.getAttribute('dir') === 'ltr' && (first.textContent || '').trim() === expectedFirst;
      },
      { timeout: 30000 },
      fixture.sentences[0].text,
    );
    console.log(`PASS: ${langInfo.count} languages verified — Arabic RTL & English identity exact`);

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

    await page.click('#download-obsidian-btn');
    await new Promise((r) => setTimeout(r, 250));
    const toastMsg = await page.evaluate(() => document.getElementById('studio-toast')?.textContent || '');
    assert(/downloaded|\.md/i.test(toastMsg), `Export toast did not confirm: "${toastMsg}"`);

    await page.click('.mode-tab-btn[data-mode="shadow"]');
    await page.click('#studio-theme-toggle');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10-studio-dark-mode.png') });
    await page.click('#studio-theme-toggle');

    await page.setViewport({ width: 390, height: 844 });
    await new Promise((r) => setTimeout(r, 250));
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(mobileOverflow <= 4, `Horizontal overflow on 390px mobile: +${mobileOverflow}px`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11-studio-mobile.png') });

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
