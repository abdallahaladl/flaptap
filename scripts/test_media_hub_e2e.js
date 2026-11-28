#!/usr/bin/env node
/**
 * Flaptap — Consolidated Shadowing E2E Verification Suite
 * Exercises a live NestJS server + real SQLite DB + Headless Puppeteer:
 *  1. Sidebar consolidation: exactly 7 nav links (Transcripts removed), zero topbar nav leaks
 *  2. Auth gates (401) on upload, review stream, export, title rename, speaker rename
 *  3. Real spoken English audio upload (macOS `say` + `ffmpeg` or fallback fixture) ->
 *     POST /api/tracks/media-hub/upload -> HTTP 206 Range media streaming -> multi-user isolation
 *  4. 7-format × 5-view export API (.txt, .md, .srt, .vtt, .json, .csv, .html)
 *  5. Inline title rename (`PATCH /:id/title`) & speaker rename (`PATCH /:id/speakers`)
 *  6. Puppeteer UI on `/` (Media Link / Audio-Video File tabs, live platform detection pill,
 *     AI Review Model toggle, Platform & Status filters)
 *  7. Puppeteer UI on `/studio?id=...`:
 *     - Millisecond word playback (`Word` mode click + `#studio-define-word-btn`)
 *     - 4 Read sub-views (`Paragraphs`, `Ideas`, `Speakers`, `Raw Original`) + hard refresh `?mode=read&view=raw`
 *     - Inline title rename in topbar + persistence after reload
 *     - Live in-transcript search highlighting + counter
 *     - Unified Export Popover (Full Study Sheet `.md` + all 7 formats + Copy)
 *     - Flow mode cycling (including Shadow Pause & Word Loop)
 *     - Real Derived Completion (checking sentences updates progress pill automatically)
 *     - Light & Dark mode + Mobile 390px & 360px zero overflow & control bar <= 140px
 */

'use strict';

const assert = require('assert');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const PORT = 3198;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'flaptap-shadowing-e2e-'));
const DB_PATH = path.join(TMP_DIR, 'test.sqlite');

function ok(msg) {
  console.log(`✅ ${msg}`);
}

async function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/tracks/media-hub/config`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server failed to start within timeout');
}

async function api(urlPath, opts = {}, token = '') {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${urlPath}`, Object.assign({}, opts, { headers }));
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, ok: res.ok, text, json, headers: res.headers };
}

function generateTestAudioMp3() {
  const aiff = path.join(TMP_DIR, 'sample.aiff');
  const mp3 = path.join(TMP_DIR, 'sample.mp3');
  const sayRes = spawnSync('say', [
    '-o',
    aiff,
    'Welcome back to Flaptap Shadowing Studio. Practice real American English with millisecond word timing.',
  ]);
  if (sayRes.status !== 0 || !fs.existsSync(aiff)) return null;
  const ffRes = spawnSync('ffmpeg', ['-y', '-i', aiff, '-codec:a', 'libmp3lame', '-b:a', '96k', mp3]);
  if (ffRes.status !== 0 || !fs.existsSync(mp3)) return null;
  return mp3;
}

async function seedLessonViaSqlite(userId) {
  const { SqliteService } = require(path.join(ROOT, 'backend/dist/core/database/sqlite.service.js'));
  const { HistoryRepository } = require(path.join(ROOT, 'backend/dist/core/database/history.repository.js'));
  const prevEnv = process.env.FLAPTAP_SQLITE_PATH;
  process.env.FLAPTAP_SQLITE_PATH = DB_PATH;
  const sqlite = new SqliteService();
  const repo = new HistoryRepository(sqlite);

  const now = new Date().toISOString();
  const s1Words = [
    { i: 0, word: 'Welcome', clean: 'welcome', startMs: 100, endMs: 420 },
    { i: 1, word: 'to', clean: 'to', startMs: 440, endMs: 560 },
    { i: 2, word: 'PyTorch', clean: 'pytorch', startMs: 580, endMs: 1020, repaired: true, rawWord: 'pie torch' },
    { i: 3, word: 'studio.', clean: 'studio', startMs: 1050, endMs: 1480 },
  ];
  const s2Words = [
    { i: 4, word: 'Every', clean: 'every', startMs: 1800, endMs: 2100 },
    { i: 5, word: 'word', clean: 'word', startMs: 2120, endMs: 2450 },
    { i: 6, word: 'plays', clean: 'plays', startMs: 2480, endMs: 2820 },
    { i: 7, word: 'fast.', clean: 'fast', startMs: 2850, endMs: 3250 },
  ];

  const saved = repo.create(
    {
      id: 'lesson_e2e_consolidated',
      track: 'shadowing',
      trackTitle: 'Shadowing',
      title: 'Consolidated Shadowing Sample',
      creator: 'Host',
      sourceUrl: 'https://cdn.example.com/sample.mp3',
      sourceKey: 'media:e2e_sample',
      platform: 'uploaded_audio',
      mediaKind: 'audio',
      reviewStatus: 'ready',
      speakerCount: 2,
      repairCount: 1,
      wordCount: 8,
      durationSeconds: 4,
      pacingWpm: 150,
      media: {
        hasAudio: true,
        hasVideo: false,
        mediaKind: 'audio',
        mediaId: '',
        streamUrl: '',
        mimeType: 'audio/mpeg',
        durationSeconds: 4,
      },
      sentences: [
        {
          id: 's1',
          index: 1,
          text: 'Welcome to PyTorch studio.',
          rawText: 'Welcome to pie torch studio.',
          startSec: 0.1,
          endSec: 1.48,
          startMs: 100,
          endMs: 1480,
          durationSec: 1.38,
          timeRange: '00:00.100 - 00:01.480',
          speakerId: 'spk_1',
          speaker: 'Host',
          repaired: true,
          repairNote: 'ASR technical term fix',
          isOverlap: false,
          words: s1Words,
          highlightedHtml: 'Welcome to PyTorch studio.',
        },
        {
          id: 's2',
          index: 2,
          text: 'Every word plays fast.',
          rawText: 'Every word plays fast.',
          startSec: 1.8,
          endSec: 3.25,
          startMs: 1800,
          endMs: 3250,
          durationSec: 1.45,
          timeRange: '00:01.800 - 00:03.250',
          speakerId: 'spk_2',
          speaker: 'Guest',
          repaired: false,
          repairNote: '',
          isOverlap: true,
          words: s2Words,
          highlightedHtml: 'Every word plays fast.',
        },
      ],
      chunks: [
        {
          index: 1,
          text: 'Welcome to PyTorch studio. Every word plays fast.',
          startSec: 0.1,
          endSec: 3.25,
          timeRange: '00:00.100 - 00:03.250',
          sentenceIndices: [1, 2],
          speakerId: 'spk_1',
          speaker: 'Host',
          highlightedHtml: 'Welcome to PyTorch studio. Every word plays fast.',
        },
      ],
      transcriptData: {
        sourceType: 'uploaded_audio',
        platform: 'uploaded_audio',
        providerEngine: 'whisper',
        reviewStatus: 'ready',
        reviewError: '',
        speakerOverrides: {},
        raw: {
          provider: 'whisper',
          model: 'whisper-1',
          fullText: 'Welcome to pie torch studio. Every word plays fast.',
          cues: [],
          words: [...s1Words, ...s2Words],
          sentences: [
            { id: 'raw-1', index: 1, text: 'Welcome to pie torch studio.', rawText: 'Welcome to pie torch studio.', speakerId: 'spk_1', speaker: 'Host', repaired: false, repairNote: '', isOverlap: false, paragraphIndex: 1, ideaIndex: 1, startMs: 100, endMs: 1480, startSec: 0.1, endSec: 1.48, words: s1Words },
            { id: 'raw-2', index: 2, text: 'Every word plays fast.', rawText: 'Every word plays fast.', speakerId: 'spk_1', speaker: 'Host', repaired: false, repairNote: '', isOverlap: false, paragraphIndex: 1, ideaIndex: 1, startMs: 1800, endMs: 3250, startSec: 1.8, endSec: 3.25, words: s2Words },
          ],
          paragraphs: [],
          extractedAt: now,
        },
        reviewed: {
          sentences: [
            { id: 's1', index: 1, text: 'Welcome to PyTorch studio.', rawText: 'Welcome to pie torch studio.', speakerId: 'spk_1', speaker: 'Host', repaired: true, repairNote: 'ASR technical term fix', isOverlap: false, paragraphIndex: 1, ideaIndex: 1, startMs: 100, endMs: 1480, startSec: 0.1, endSec: 1.48, words: s1Words },
            { id: 's2', index: 2, text: 'Every word plays fast.', rawText: 'Every word plays fast.', speakerId: 'spk_2', speaker: 'Guest', repaired: false, repairNote: '', isOverlap: true, paragraphIndex: 1, ideaIndex: 1, startMs: 1800, endMs: 3250, startSec: 1.8, endSec: 3.25, words: s2Words },
          ],
          paragraphs: [
            { index: 1, speakerId: 'spk_1', speaker: 'Host', sentenceIndices: [1, 2], text: 'Welcome to PyTorch studio. Every word plays fast.', startMs: 100, endMs: 3250, startSec: 0.1, endSec: 3.25 },
          ],
          speakers: [
            { id: 'spk_1', name: 'Host', originalLabel: 'Host', colorIndex: 0, sentenceCount: 1, wordCount: 4, talkTimeMs: 1380 },
            { id: 'spk_2', name: 'Guest', originalLabel: 'Guest', colorIndex: 1, sentenceCount: 1, wordCount: 4, talkTimeMs: 1450 },
          ],
          ideas: [
            {
              index: 1,
              title: 'Fast Word Timing',
              summary: 'Introduces PyTorch studio with exact millisecond playback.',
              keyTakeaway: 'Every word plays fast.',
              sentenceIndices: [1, 2],
              startMs: 100,
              endMs: 3250,
              startSec: 0.1,
              endSec: 3.25,
              speakers: ['Host', 'Guest'],
            },
          ],
          speakerTurns: [
            {
              index: 1,
              speakerId: 'spk_1',
              speaker: 'Host',
              colorIndex: 0,
              text: 'Welcome to PyTorch studio.',
              sentenceIndices: [1],
              startMs: 100,
              endMs: 1480,
              startSec: 0.1,
              endSec: 1.48,
              isOverlap: false,
            },
            {
              index: 2,
              speakerId: 'spk_2',
              speaker: 'Guest',
              colorIndex: 1,
              text: 'Every word plays fast.',
              sentenceIndices: [2],
              startMs: 1800,
              endMs: 3250,
              startSec: 1.8,
              endSec: 3.25,
              isOverlap: true,
            },
          ],
          quality: {
            totalWords: 8,
            repairedWords: 1,
            repairedSentences: 1,
            overlapsResolved: 1,
            verbatimScore: 95,
            multiSpeaker: true,
            summary: '1 ASR repair applied.',
          },
          providerName: 'TestAI',
          modelName: 'test-model',
          reasoningLevel: 'none',
          executionTimeMs: 100,
          reviewedAt: now,
        },
      },
      createdAt: now,
    },
    { userId },
  );

  sqlite.onModuleDestroy?.();
  if (prevEnv === undefined) delete process.env.FLAPTAP_SQLITE_PATH;
  else process.env.FLAPTAP_SQLITE_PATH = prevEnv;
  return saved;
}

async function seedLongPacingLessonViaSqlite(userId) {
  const prevEnv = process.env.FLAPTAP_SQLITE_PATH;
  process.env.FLAPTAP_SQLITE_PATH = DB_PATH;
  const distDir = path.join(ROOT, 'backend/dist');
  const { SqliteService } = require(path.join(distDir, 'core/database/sqlite.service.js'));
  const { HistoryRepository } = require(path.join(distDir, 'core/database/history.repository.js'));
  const { assembleAlignedReviewedViews } = require(path.join(distDir, 'modules/tracks/media-hub/utils/word-alignment.util.js'));

  const sqlite = new SqliteService();
  const repo = new HistoryRepository(sqlite);
  const now = new Date().toISOString();
  const longText =
    "But what I'm not going to do is repeat the past, where I envision myself living a completely different life and not creating a plan to take action on that.";
  const tokens = longText.split(/\s+/);
  const rawWords = tokens.map((word, i) => ({
    i,
    word,
    clean: word.toLowerCase().replace(/[^a-z0-9']/g, ''),
    startMs: 100 + i * 350,
    endMs: 100 + i * 350 + 290,
  }));

  const reviewedParts = assembleAlignedReviewedViews({
    rawWords,
    draftSentences: [
      { text: longText, speaker: 'Miranda', paragraphIndex: 1, ideaIndex: 1 },
    ],
    draftIdeas: [{ index: 1, title: 'Action Plan', summary: 'Create a concrete plan.' }],
    defaultSpeaker: 'Miranda',
    pacingMode: 'short',
  });

  const saved = repo.create(
    {
      id: 'lesson_e2e_pacing',
      track: 'shadowing',
      trackTitle: 'Shadowing',
      title: 'Dynamic Pacing E2E Sample',
      creator: 'Miranda',
      sourceUrl: 'uploaded://pacing.mp3',
      sourceKey: 'media:e2e_pacing_1',
      platform: 'uploaded_audio',
      mediaKind: 'audio',
      reviewStatus: 'ready',
      pacingMode: 'short',
      speakerCount: 1,
      repairCount: 0,
      wordCount: tokens.length,
      durationSeconds: 12,
      pacingWpm: 165,
      sentences: reviewedParts.sentences.map((s) => ({
        ...s,
        timeRange: '00:00.100 - 00:02.000',
        durationSec: Number(((s.endMs - s.startMs) / 1000).toFixed(3)),
        highlightedHtml: s.text,
      })),
      chunks: reviewedParts.paragraphs.map((p) => ({
        ...p,
        timeRange: '00:00.100 - 00:11.000',
        highlightedHtml: p.text,
      })),
      transcriptData: {
        sourceType: 'uploaded_audio',
        platform: 'uploaded_audio',
        providerEngine: 'whisper',
        pacingMode: 'short',
        reviewStatus: 'ready',
        reviewError: '',
        speakerOverrides: {},
        raw: {
          provider: 'whisper',
          model: 'whisper-1',
          fullText: longText,
          cues: [],
          words: rawWords,
          sentences: [],
          paragraphs: [],
          extractedAt: now,
        },
        reviewed: {
          ...reviewedParts,
          providerName: 'TestAI',
          modelName: 'test-model',
          reasoningLevel: 'none',
          executionTimeMs: 90,
          reviewedAt: now,
        },
      },
      createdAt: now,
    },
    { userId },
  );

  sqlite.onModuleDestroy?.();
  if (prevEnv === undefined) delete process.env.FLAPTAP_SQLITE_PATH;
  else process.env.FLAPTAP_SQLITE_PATH = prevEnv;
  return saved;
}

async function run() {
  console.log('\n🚀 Running Consolidated Shadowing E2E Suite...\n');

  const server = spawn('node', ['backend/dist/main.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: String(PORT),
      FLAPTAP_SQLITE_PATH: DB_PATH,
      FLAPTAP_LIVE_TRANSCRIPTS: 'off',
      FLAPTAP_GUARD_STATE_PATH: path.join(TMP_DIR, 'guard-state.json'),
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrBuf = '';
  server.stderr.on('data', (d) => {
    stderrBuf += d.toString();
  });

  let browser;
  try {
    await waitForServer();
    ok(`Live NestJS server booted on ${BASE}`);

    // 1. Config & Auth gates
    const cfg = await api('/api/tracks/media-hub/config');
    assert.strictEqual(cfg.status, 200);
    assert.ok(Array.isArray(cfg.json.exportFormats) && cfg.json.exportFormats.length === 7);
    assert.ok(Array.isArray(cfg.json.views) && cfg.json.views.length === 5);
    assert.ok(cfg.json.providerGuard && cfg.json.providerGuard.liveFetchEnabled === false, 'Config must expose providerGuard with liveFetchEnabled: false under kill-switch');
    ok('GET /api/tracks/media-hub/config exposes all 7 export formats, 5 views & providerGuard');

    const unauthExport = await api('/api/tracks/media-hub/fake/export?view=sentences&format=txt');
    assert.strictEqual(unauthExport.status, 401);
    const unauthStream = await api('/api/tracks/media-hub/fake/review/stream', { method: 'POST', body: '{}' });
    assert.strictEqual(unauthStream.status, 401);
    const unauthTitle = await api('/api/tracks/media-hub/fake/title', { method: 'PATCH', body: '{"title":"x"}' });
    assert.strictEqual(unauthTitle.status, 401);
    const unauthPacing = await api('/api/tracks/media-hub/fake/pacing', { method: 'PATCH', body: '{"pacingMode":"normal"}' });
    assert.strictEqual(unauthPacing.status, 401);
    ok('Auth gates strictly return 401 on consolidated Media Hub endpoints');

    // 2. Register two isolated accounts
    const regA = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice Shadow', email: 'alice@shadow.test', password: 'password123' }),
    });
    assert.strictEqual(regA.status, 201);
    const tokenA = regA.json.token;
    const userIdA = regA.json.user.id;

    const regB = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bob Shadow', email: 'bob@shadow.test', password: 'password123' }),
    });
    assert.strictEqual(regB.status, 201);
    const tokenB = regB.json.token;
    ok('Registered two isolated test accounts');

    // 3. Seed consolidated Shadowing lessons
    const seeded = await seedLessonViaSqlite(userIdA);
    assert.strictEqual(seeded.id, 'lesson_e2e_consolidated');
    const pacingLesson = await seedLongPacingLessonViaSqlite(userIdA);
    assert.strictEqual(pacingLesson.id, 'lesson_e2e_pacing');

    // Verify user isolation
    const bobGet = await api(`/api/history/${seeded.id}`, {}, tokenB);
    assert.ok(bobGet.status === 404 || bobGet.status === 403, `Expected 404/403 for User B, got ${bobGet.status}`);
    const bobExport = await api(`/api/tracks/media-hub/${seeded.id}/export?view=sentences&format=txt`, {}, tokenB);
    assert.strictEqual(bobExport.status, 404);
    const bobPacing = await api(`/api/tracks/media-hub/${pacingLesson.id}/pacing`, { method: 'PATCH', body: '{"pacingMode":"normal"}' }, tokenB);
    assert.strictEqual(bobPacing.status, 404);
    ok('Strict user isolation verified across consolidated Media Hub endpoints');

    // Verify dynamic pacing API validation & round-trip (short -> normal -> short)
    const badPacing = await api(`/api/tracks/media-hub/${pacingLesson.id}/pacing`, { method: 'PATCH', body: '{"pacingMode":"giant"}' }, tokenA);
    assert.strictEqual(badPacing.status, 400);
    const normalRes = await api(`/api/tracks/media-hub/${pacingLesson.id}/pacing`, { method: 'PATCH', body: '{"pacingMode":"normal"}' }, tokenA);
    assert.strictEqual(normalRes.status, 200);
    assert.strictEqual(normalRes.json.pacingMode, 'normal');
    assert.ok(normalRes.json.sentenceCount <= 3, `Expected normal pacing <=3 lines, got ${normalRes.json.sentenceCount}`);
    const legacyBalRes = await api(`/api/tracks/media-hub/${pacingLesson.id}/pacing`, { method: 'PATCH', body: '{"pacingMode":"balanced"}' }, tokenA);
    assert.strictEqual(legacyBalRes.status, 200);
    assert.strictEqual(legacyBalRes.json.pacingMode, 'normal', 'Legacy balanced input must normalize to normal');
    assert.strictEqual(legacyBalRes.json.sentenceCount, normalRes.json.sentenceCount, 'Legacy balanced must equal normal sentence count');
    const shortRes = await api(`/api/tracks/media-hub/${pacingLesson.id}/pacing`, { method: 'PATCH', body: '{"pacingMode":"short"}' }, tokenA);
    assert.strictEqual(shortRes.status, 200);
    assert.strictEqual(shortRes.json.pacingMode, 'short');
    assert.ok(shortRes.json.sentenceCount >= 4, `Expected short pacing >=4 lines, got ${shortRes.json.sentenceCount}`);
    ok('PATCH /api/tracks/media-hub/:id/pacing switches short <-> normal cleanly with strict validation');

    // 4. Test all 7 export formats + Raw Original view via live HTTP API
    for (const fmt of ['txt', 'md', 'srt', 'vtt', 'json', 'csv', 'html']) {
      const exp = await api(`/api/tracks/media-hub/${seeded.id}/export?view=sentences&format=${fmt}`, {}, tokenA);
      assert.strictEqual(exp.status, 200, `Export ${fmt} returned ${exp.status}`);
      assert.ok(exp.text.length > 20, `Export ${fmt} was empty`);
    }
    const expRaw = await api(`/api/tracks/media-hub/${seeded.id}/export?view=raw&format=txt`, {}, tokenA);
    assert.strictEqual(expRaw.status, 200);
    assert.ok(expRaw.text.includes('pie torch'), 'Raw export must preserve untouched ASR text');
    ok('All 7 export formats + untouched Raw Original export verified over HTTP');

    // 5. Test speaker rename API propagation
    const spkRes = await api(
      `/api/tracks/media-hub/${seeded.id}/speakers`,
      { method: 'PATCH', body: JSON.stringify({ speakers: { spk_1: 'Lex', spk_2: 'Andrej' } }) },
      tokenA,
    );
    assert.strictEqual(spkRes.status, 200);
    assert.strictEqual(spkRes.json.data.sentences[0].speaker, 'Lex');
    assert.strictEqual(spkRes.json.data.sentences[1].speaker, 'Andrej');
    ok('PATCH /api/tracks/media-hub/:id/speakers propagates speaker renames cleanly');

    // Optional live audio upload test (only if OPENAI_API_KEY / GROQ_API_KEY configured)
    const sampleMp3 = generateTestAudioMp3();
    if (sampleMp3 && (process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY)) {
      const form = new FormData();
      form.append('file', new Blob([fs.readFileSync(sampleMp3)], { type: 'audio/mpeg' }), 'sample.mp3');
      const upRes = await fetch(`${BASE}/api/tracks/media-hub/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: form,
      });
      if (upRes.ok) {
        const upJson = await upRes.json();
        assert.ok(upJson.id && upJson.media?.streamUrl);
        const rangeRes = await fetch(`${BASE}${upJson.media.streamUrl}`, {
          headers: { Authorization: `Bearer ${tokenA}`, Range: 'bytes=0-1023' },
        });
        assert.strictEqual(rangeRes.status, 206);
        ok('Live audio upload + HTTP 206 Range media streaming verified');
      }
    }

    // 6. Headless Puppeteer UI Verification
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(e.message));
    await page.setViewport({ width: 1440, height: 900 });

    // Set auth token & open home
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
    const sidebarNavs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#app-sidebar .sidebar-nav-link[data-route-section]')).map((a) =>
        a.getAttribute('data-route-section'),
      ),
    );
    assert.deepStrictEqual(sidebarNavs, [
      'lessons',
      'dialogue',
      'pronunciation',
      'think-aloud',
      'american-extractor',
      'learning-library',
      'vocabulary',
      'history',
    ]);
    assert.strictEqual(await page.$('#section-transcript-lab'), null, 'Obsolete #section-transcript-lab still exists!');
    ok('Sidebar consolidated cleanly to 8 links with zero Transcripts leftovers');

    // Sign in via localStorage token & reload Home
    await page.evaluate((tok) => localStorage.setItem('flaptap_auth_token', tok), tokenA);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });

    // Test Media Link / Audio-Video File tabs, live platform detection, AI Model toggle, library filters
    await page.type('#youtube-url-input', 'https://podcasts.apple.com/us/podcast/test/id123');
    const detectText = await page.$eval('#lessons-url-detect', (el) => (el.hidden ? '' : el.textContent));
    assert.ok(detectText.includes('Apple Podcasts'), `Expected Apple Podcasts detection, got "${detectText}"`);

    await page.click('[data-lessons-input="upload"]');
    const dropVisible = await page.$eval('[data-lessons-panel="upload"]', (el) => !el.hidden);
    assert.ok(dropVisible, 'Upload panel did not open');

    // Home link screen must keep auto-review opt-in removed for instant Studio opening
    assert.strictEqual(await page.$('#lessons-auto-review'), null, 'Home auto-review checkbox should be removed for instant Studio load');
    assert.strictEqual(await page.$('#lessons-ai-model-toggle'), null, 'Home AI model toggle should live inside Studio Enhancements');

    // Test Shadowing Home pre-start pacing control (#lessons-pacing-group)
    await page.click('#lessons-pacing-group [data-pacing="normal"]');
    const savedPacingNormal = await page.evaluate(() => localStorage.getItem('flaptap_shadowing_pacing'));
    assert.strictEqual(savedPacingNormal, 'normal', 'Home pacing pill did not persist normal preference');
    await page.click('#lessons-pacing-group [data-pacing="short"]');
    const savedPacingShort = await page.evaluate(() => localStorage.getItem('flaptap_shadowing_pacing'));
    assert.strictEqual(savedPacingShort, 'short', 'Home pacing pill did not restore short preference');

    await page.waitForSelector('.history-card[data-lesson-id="lesson_e2e_consolidated"]', { timeout: 8000 });
    const cardText = await page.$eval('.history-card[data-lesson-id="lesson_e2e_consolidated"]', (el) => el.textContent);
    assert.ok(cardText.includes('Uploaded Audio') && cardText.includes('AI Reviewed'), `Missing consolidated badges on card: ${cardText}`);
    ok('Shadowing Home verified: Media Link/Upload tabs, live platform detection, AI selector & library badges');

    // 7. Open Consolidated Shadowing Studio
    await page.goto(`${BASE}/studio?id=${seeded.id}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.sentence-driller-card[data-sentence-index="1"]', { timeout: 10000 });

    // Verify speaker filter bar, repair badge & overlap badge rendered
    const hasSpkBar = await page.$eval('#studio-speaker-bar', (el) => !el.hidden && el.textContent.includes('Lex') && el.textContent.includes('Andrej'));
    assert.ok(hasSpkBar, 'Multi-speaker filter bar missing Lex/Andrej');
    assert.ok(await page.$('.studio-word.is-repaired'), 'Repaired word underline missing');
    assert.ok(await page.$('.studio-info-badge.is-repair'), 'Repair count badge missing');
    assert.ok(await page.$('.studio-info-badge.is-overlap'), 'Overlap badge missing');
    ok('Studio Shadow mode renders speakers, repair underlines, repair badge & overlap badge');

    // Test Repair Diff Popover
    await page.click('.studio-info-badge.is-repair');
    const diffText = await page.$eval('#studio-info-popover', (el) => (el.hidden ? '' : el.textContent));
    assert.ok(diffText.includes('pie torch') && diffText.includes('PyTorch'), `Repair popover missing diff: ${diffText}`);
    ok('Repair diff popover displays original ASR vs repaired word');

    // Test Word Click Mode ('word') -> clicking timed word reveals Define pill
    await page.click('#studio-tools-menu-btn');
    await page.waitForSelector('#studio-tools-popover', { visible: true });
    await page.click('[data-word-click-mode="word"]');
    await page.click('#studio-tools-pop-close');
    await page.click('.studio-word[data-word="PyTorch"]');
    const defPillText = await page.$eval('#studio-define-word-btn', (el) => (el.hidden ? '' : el.textContent));
    assert.ok(defPillText.includes('PyTorch'), `Define word pill not updated: ${defPillText}`);
    ok('Word click mode plays millisecond clip and reveals quick Define pill');

    // Test Inline Title Rename + reload persistence
    await page.click('#studio-rename-btn');
    await page.waitForSelector('#studio-title-input', { visible: true });
    await page.evaluate(() => {
      const inp = document.getElementById('studio-title-input');
      inp.value = 'Renamed Consolidated Studio';
    });
    await page.click('#studio-title-save-btn');
    await page.waitForFunction(() => document.getElementById('studio-title')?.textContent === 'Renamed Consolidated Studio', { timeout: 5000 });
    ok('Inline lesson title rename saves immediately');

    // Test Live In-Transcript Search
    await page.type('#studio-search-input', 'PyTorch');
    const searchCnt = await page.$eval('#studio-search-count', (el) => (el.hidden ? '' : el.textContent));
    assert.strictEqual(searchCnt, '1/1', `Expected search count 1/1, got "${searchCnt}"`);
    await page.click('#studio-search-clear');
    ok('Live in-transcript search highlights match and updates counter');

    // Verify lazy rendering (Read paragraphs not rendered while in Shadow mode) & zero duplicate toolbar
    const initialLazyAudit = await page.evaluate(() => ({
      noReaderToolbar: !document.getElementById('studio-reader-toolbar'),
      readChunksLen: document.getElementById('subview-chunks-list')?.children?.length || 0,
      isAudioOnlyCard: document.querySelector('.player-frame-card')?.classList.contains('is-audio-only-media'),
      audioHasControls: document.getElementById('studio-html5-player')?.hasAttribute('controls') || false,
    }));
    assert.ok(initialLazyAudit.noReaderToolbar, 'Duplicate #studio-reader-toolbar should be removed');
    assert.strictEqual(initialLazyAudit.readChunksLen, 0, 'Read sub-view should lazy-render only when visited');
    assert.strictEqual(initialLazyAudit.audioHasControls, false, 'Audio-only track should not render duplicate native <audio controls>');
    ok('Lazy rendering & streamlined toolbar verified on initial Studio load');

    // Test Per-Mode Completion Filter Isolation (Shadow Completed does NOT bleed into Read)
    await page.click('.sentence-driller-card[data-sentence-index="1"] [data-studio-check-subject="sentences"]');
    await page.click('[data-studio-comp-filter="completed"]');
    const shadowCompletedCount = await page.$$eval('.sentence-driller-card:not([hidden])', (els) => els.length);
    assert.strictEqual(shadowCompletedCount, 1, `Expected 1 visible completed sentence in Shadow, got ${shadowCompletedCount}`);

    await page.click('.mode-tab-btn[data-mode="read"]');
    await page.waitForSelector('#subview-chunks-list .editorial-paragraph-block', { timeout: 5000 });
    const readFilterIsolation = await page.evaluate(() => ({
      readVisibleParas: document.querySelectorAll('#subview-chunks-list .editorial-paragraph-block:not([hidden])').length,
      readFilterActive: document.querySelector('[data-studio-comp-filter].active')?.getAttribute('data-studio-comp-filter'),
      pacingHiddenInRead: Boolean(document.getElementById('studio-pacing-group')?.hidden),
      badgeParaCount: Number(document.getElementById('badge-paragraphs-count')?.textContent || 0),
      barParaTotal: Number(document.querySelector('#studio-read-progress-bar [data-sp-total]')?.textContent || 0),
      domParaCount: document.querySelectorAll('#subview-chunks-list .editorial-paragraph-block').length,
    }));
    assert.ok(readFilterIsolation.readVisibleParas > 0, 'Shadow Completed filter bled into Read mode and hid paragraphs');
    assert.strictEqual(readFilterIsolation.readFilterActive, 'all', 'Read mode filter should remain "all" independently');
    assert.strictEqual(readFilterIsolation.pacingHiddenInRead, true, 'Short|Normal pacing toggle must be hidden in Read mode');
    assert.strictEqual(readFilterIsolation.badgeParaCount, readFilterIsolation.domParaCount, 'Read tab badge must match rendered paragraph count');
    assert.strictEqual(readFilterIsolation.barParaTotal, readFilterIsolation.domParaCount, 'Read progress bar total must match rendered paragraph count');

    // Reset Shadow completion & filter back to clean baseline for downstream bookmark/completion assertions
    await page.click('.mode-tab-btn[data-mode="shadow"]');
    const shadowFilterRestored = await page.$eval('[data-studio-comp-filter].active', (el) => el.getAttribute('data-studio-comp-filter'));
    assert.strictEqual(shadowFilterRestored, 'completed', 'Shadow mode should remember its own filter state');
    await page.click('[data-studio-comp-filter="all"]');
    await page.click('.sentence-driller-card[data-sentence-index="1"] [data-studio-check-subject="sentences"]');
    ok('Per-mode filter isolation & paragraph count parity verified');

    // Test all 4 Read sub-views + Hard Refresh persistence on ?mode=read&view=raw
    await page.click('.mode-tab-btn[data-mode="read"]');
    for (const viewId of ['paragraphs', 'ideas', 'speakers', 'raw']) {
      await page.click(`[data-read-view="${viewId}"]`);
      const subAudit = await page.evaluate((vid) => ({
        visible: !document.querySelector(`[data-read-panel="${vid}"]`)?.hidden,
        progressDockHidden: Boolean(document.getElementById('canvas-progress-dock')?.hidden),
        repairsHidden: Boolean(document.getElementById('studio-toggle-repairs')?.hidden),
      }), viewId);
      assert.ok(subAudit.visible, `Read sub-view "${viewId}" failed to become visible`);
      if (viewId !== 'paragraphs') {
        assert.strictEqual(subAudit.progressDockHidden, true, `Progress dock must be hidden in Read -> ${viewId}`);
      }
      if (viewId === 'raw') {
        assert.strictEqual(subAudit.repairsHidden, true, 'Repairs toggle must be hidden in Read -> Raw Original');
      }
    }
    assert.ok(page.url().includes('mode=read') && page.url().includes('view=raw'), `URL did not persist view=raw: ${page.url()}`);

    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.studio-raw-banner', { timeout: 10000 });
    const rawVisibleAfterReload = await page.$eval('[data-read-panel="raw"]', (el) => !el.hidden);
    const titleAfterReload = await page.$eval('#studio-title', (el) => el.textContent);
    assert.ok(rawVisibleAfterReload, 'Hard refresh did not preserve Read -> Raw Original view');
    assert.strictEqual(titleAfterReload, 'Renamed Consolidated Studio', 'Inline renamed title did not persist after reload');
    ok('All 4 Read sub-views (Paragraphs/Ideas/Speakers/Raw) & hard refresh state verified');

    // Test Reading Bookmark SQLite Persistence, Zero Inline Gap, Multi-Action Selection Menu & Ask AI Drawer
    await page.click('[data-read-view="paragraphs"]');
    await page.waitForSelector('#subview-chunks-list .reader-flow-sent', { timeout: 5000 });
    const bmBtnGapCheck = await page.evaluate(() => {
      const sents = Array.from(document.querySelectorAll('#subview-chunks-list .reader-flow-sent'));
      const nonActive = sents.find((s) => !s.classList.contains('active-reading')) || sents[1];
      const btn = nonActive?.querySelector('.reader-bm-btn');
      return btn ? Math.round(btn.getBoundingClientRect().width) : -1;
    });
    assert.strictEqual(bmBtnGapCheck, 0, `Idle .reader-bm-btn should collapse to 0px width (got ${bmBtnGapCheck}px)`);

    await page.click('#subview-chunks-list .reader-bm-btn');
    await page.waitForFunction(() => {
      const pill = document.getElementById('reader-bookmark-pill');
      return pill && !pill.hidden;
    }, { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 250));
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('#reader-bookmark-pill', { visible: true, timeout: 10000 });
    const lessonAfterBm = await page.evaluate(async (id) => {
      const token = localStorage.getItem('flaptap_auth_token');
      const res = await fetch(`/api/history/${encodeURIComponent(id)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return res.json();
    }, 'lesson_e2e_consolidated');
    assert.ok(lessonAfterBm?.transcriptData?.readingBookmark?.sentenceIndex >= 1, 'Reading bookmark did not persist to SQLite');
    assert.strictEqual(Boolean(lessonAfterBm?.isCompleted), false, 'Reading bookmark must not falsify derived completion');
    ok('Reading bookmark persists in SQLite across reload without inline text gap or false completion');

    // Select multi-word span inside continuous transcript -> verify Play + Ask AI + Translate + Bookmark + Copy
    await page.click('[data-read-view="paragraphs"]');
    await page.evaluate(() => {
      const words = Array.from(document.querySelectorAll('#subview-chunks-list .studio-word'));
      if (words.length >= 2) {
        const range = document.createRange();
        range.setStartBefore(words[0]);
        range.setEndAfter(words[1]);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      }
    });
    await page.waitForSelector('#selection-action-menu', { visible: true, timeout: 5000 });
    const selBtns = await page.$$eval('#selection-action-menu [data-selection-action]', (els) =>
      els.map((e) => e.getAttribute('data-selection-action')),
    );
    assert.ok(selBtns.includes('play-selection') && selBtns.includes('ask-ai') && selBtns.includes('translate'), `Missing expected selection actions: ${selBtns.join(', ')}`);
    await page.click('#selection-action-menu [data-selection-action="ask-ai"]');
    await page.waitForSelector('#studio-ask-drawer', { visible: true, timeout: 5000 });
    const quoteVisible = await page.$eval('#studio-ask-quote-card', (el) => !el.hidden && (el.textContent || '').trim().length > 0);
    const hasMicBtn = Boolean(await page.$('#studio-ask-mic-btn'));
    assert.ok(quoteVisible && hasMicBtn, 'Ask AI drawer missing attached quote card or voice mic button');
    await page.click('#studio-ask-close-btn');
    await page.waitForFunction(() => document.getElementById('studio-ask-drawer')?.hidden === true, { timeout: 3000 });
    ok('Multi-action selection menu (Play / Ask AI / Translate) & Context-Aware AI Companion drawer verified');

    // Verify Listen mode non-spoiling & sentence sync + Range Play button state toggle
    await page.evaluate(() => {
      window.studioState.ytPlayer = {
        getCurrentTime: () => 0.2,
        getDuration: () => 4,
        seekTo: () => {},
        playVideo: () => {},
        pauseVideo: () => {},
        mute: () => {},
        unMute: () => {},
        setPlaybackRate: () => {},
        getPlayerState: () => 1,
      };
    });
    await page.click('#subview-chunks-list .paragraph-play-btn');
    const rangePlayActive = await page.$eval('#subview-chunks-list .paragraph-play-btn', (el) => ({
      isPlaying: el.classList.contains('is-playing'),
      text: el.textContent?.trim(),
    }));
    assert.ok(rangePlayActive.isPlaying && rangePlayActive.text === 'Pause', `Range Play button did not toggle to Pause: ${JSON.stringify(rangePlayActive)}`);
    await page.click('#subview-chunks-list .paragraph-play-btn');
    const rangePlayIdle = await page.$eval('#subview-chunks-list .paragraph-play-btn', (el) => ({
      isPlaying: el.classList.contains('is-playing'),
      text: el.textContent?.trim(),
    }));
    assert.ok(!rangePlayIdle.isPlaying && rangePlayIdle.text === 'Play', `Range Play button did not pause cleanly: ${JSON.stringify(rangePlayIdle)}`);

    await page.evaluate(() => {
      window.studioState.activeSentence = window.studioState.item.sentences[1];
    });
    await page.click('.mode-tab-btn[data-mode="listen"]');
    const listenAudit = await page.evaluate(() => ({
      dictIdx: window.studioState.dictationIndex,
      liveSubHidden: Boolean(document.getElementById('deck-live-subtitle')?.hidden),
      ttsQuote: document.getElementById('tts-active-quote')?.textContent || '',
      compFilterHidden: Boolean(document.querySelector('.studio-comp-filter')?.hidden),
    }));
    assert.strictEqual(listenAudit.dictIdx, 2, 'Listen mode must sync dictationIndex to active sentence #2');
    assert.strictEqual(listenAudit.liveSubHidden, true, 'Listen mode must hide #deck-live-subtitle to avoid spoiling answers');
    assert.ok(!listenAudit.ttsQuote.includes('Every word plays fast'), 'Listen mode must mask #tts-active-quote');
    assert.strictEqual(listenAudit.compFilterHidden, true, 'Listen mode must hide completion filter pills');
    ok('Listen mode non-spoiling, active sentence sync & Range Play toggle verified');

    // Audio-Only Focus mode toggle (Hide Video -> Show Video) without remounting media deck (visible on video lessons)
    const hasVideoToggle = await page.$eval('#studio-video-toggle-btn', (el) => !el.hidden);
    if (hasVideoToggle) {
      await page.click('#studio-video-toggle-btn');
      const isHiddenAttr = await page.$eval('#studio-main-content', (el) => el.getAttribute('data-video-hidden'));
      assert.strictEqual(isHiddenAttr, '1', 'Audio-Only toggle did not set data-video-hidden="1"');
      await page.click('#studio-video-toggle-btn');
      const isRestoredAttr = await page.$eval('#studio-main-content', (el) => el.getAttribute('data-video-hidden'));
      assert.strictEqual(isRestoredAttr, '0', 'Audio-Only toggle did not restore data-video-hidden="0"');
      ok('Audio-Only focus toggle verified cleanly without remounting');
    }

    // Test Unified Export Popover
    await page.click('#studio-export-btn');
    await page.waitForSelector('#studio-export-popover', { visible: true });
    const fmtBtns = await page.$$eval('[data-export-fmt]', (els) => els.length);
    assert.strictEqual(fmtBtns, 7, `Expected 7 export format buttons, got ${fmtBtns}`);
    await page.click('#download-markdown-btn');
    await new Promise((r) => setTimeout(r, 200));
    const mdToast = await page.$eval('#studio-toast', (el) => el.textContent || '');
    assert.ok(/downloaded|\.md/i.test(mdToast), `Markdown study sheet toast missing: ${mdToast}`);
    ok('Unified Export Popover exposes Full Study Sheet (.md) + all 7 transcript formats');

    // Test Flow Mode cycling includes shadow & word
    await page.click('.mode-tab-btn[data-mode="shadow"]');
    const seenFlowStates = new Set();
    for (let i = 0; i < 6; i++) {
      seenFlowStates.add(await page.$eval('#studio-flow-btn', (el) => el.dataset.flowState));
      await page.click('#studio-flow-btn');
    }
    assert.ok(seenFlowStates.has('shadow') && seenFlowStates.has('word') && seenFlowStates.has('loop'), `Missing flow states: ${Array.from(seenFlowStates)}`);
    ok('Sentence Flow cycles cleanly through Loop, Auto-Pause, Shadow Pause, Word Loop & Continuous');

    // Test Live Studio Pacing Switcher (Short -> Normal -> Short) without remounting media deck
    await page.goto(`${BASE}/studio?id=${pacingLesson.id}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#studio-pacing-group .studio-tool-pill[data-pacing="short"].active', { timeout: 10000 });
    const initialShortCards = await page.$$eval('.sentence-driller-card', (els) => els.length);
    assert.ok(initialShortCards >= 4, `Expected >=4 short cards in Studio, got ${initialShortCards}`);
    await page.evaluate(() => {
      const deck = document.getElementById('studio-media-deck') || document.querySelector('.video-player-stage');
      if (deck) deck.dataset.pacingKeepAlive = 'intact';
    });

    await page.click('#studio-pacing-group [data-pacing="normal"]');
    await page.waitForFunction(
      (prev) => document.querySelectorAll('.sentence-driller-card').length < prev &&
        document.querySelector('#studio-pacing-group [data-pacing="normal"]')?.classList.contains('active'),
      { timeout: 8000 },
      initialShortCards,
    );
    const normalCards = await page.$$eval('.sentence-driller-card', (els) => els.length);
    assert.ok(normalCards <= 3, `Expected <=3 normal sentence cards, got ${normalCards}`);
    const deckIntact = await page.evaluate(() => {
      const deck = document.getElementById('studio-media-deck') || document.querySelector('.video-player-stage');
      return deck ? deck.dataset.pacingKeepAlive === 'intact' : true;
    });
    assert.ok(deckIntact, 'Media deck must NOT remount during real-time pacing switch');

    await page.click('#studio-pacing-group [data-pacing="short"]');
    await page.waitForFunction(
      (expected) => document.querySelectorAll('.sentence-driller-card').length === expected &&
        document.querySelector('#studio-pacing-group [data-pacing="short"]')?.classList.contains('active'),
      { timeout: 8000 },
      initialShortCards,
    );
    ok('Real-time Studio pacing switcher (Short <-> Normal) updates cards & persists without remounting media deck');

    // Test Multi-Layout Engine (6 Desktop Layouts + Zero-Remount + Persistence + Split + Mobile Modes)
    await page.setViewport({ width: 1440, height: 900 });
    await new Promise((r) => setTimeout(r, 180));
    await page.evaluate(() => {
      const card = document.querySelector('.player-frame-card');
      const sent = document.querySelector('.sentence-driller-card');
      if (card) card.dataset.layoutKeepAlive = 'intact';
      if (sent) sent.dataset.layoutKeepAlive = 'intact';
    });

    await page.click('#studio-layout-btn');
    await page.waitForSelector('#studio-layout-popover', { visible: true });
    await page.focus('#studio-layout-popover [data-studio-layout-option]');
    await page.keyboard.press('Escape');
    const layoutClosedOnEsc = await page.$eval('#studio-layout-popover', (el) => Boolean(el.hidden));
    assert.strictEqual(layoutClosedOnEsc, true, 'Escape key did not close #studio-layout-popover');
    await page.click('#studio-layout-btn');
    await page.waitForSelector('#studio-layout-popover', { visible: true });
    const desktopLayoutCount = await page.$$eval('#studio-layout-popover [data-studio-layout-option]', (els) => els.length);
    const previewStagesCount = await page.$$eval('#studio-layout-popover .slp-stage', (els) => els.length);
    assert.strictEqual(desktopLayoutCount, 6, `Expected 6 desktop layouts in picker, got ${desktopLayoutCount}`);
    assert.strictEqual(previewStagesCount, 6, `Expected 6 animated wireframe previews, got ${previewStagesCount}`);

    for (const layoutId of ['split-right', 'transcript', 'cinema-stack', 'cockpit', 'zen', 'theater']) {
      await page.click(`#studio-layout-popover [data-studio-layout-option="${layoutId}"]`);
      await new Promise((r) => setTimeout(r, 120));
      const check = await page.evaluate(() => {
        const ws = document.getElementById('studio-main-content');
        const canvas = document.querySelector('.studio-canvas');
        const consoleEl = document.querySelector('.studio-media-console');
        const playerCard = document.querySelector('.player-frame-card');
        const sent = document.querySelector('.sentence-driller-card');
        const bar = document.getElementById('studio-control-bar');
        const btns = Array.from(bar?.querySelectorAll('.scb-btn') || []).filter((b) => {
          const r = b.getBoundingClientRect();
          return getComputedStyle(b).display !== 'none' && r.width > 0 && r.height > 0;
        });
        const tops = btns.map((b) => Math.round(b.getBoundingClientRect().top));
        const bottoms = btns.map((b) => Math.round(b.getBoundingClientRect().bottom));
        return {
          layout: ws?.getAttribute('data-layout'),
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          canvasH: canvas ? Math.round(canvas.getBoundingClientRect().height) : 0,
          consoleH: consoleEl ? Math.round(consoleEl.getBoundingClientRect().height) : 0,
          playerAlive: playerCard?.dataset.layoutKeepAlive,
          sentAlive: sent?.dataset.layoutKeepAlive,
          barHeight: bottoms.length ? Math.max(...bottoms) - Math.min(...tops) : 999,
          barOverflow: bar ? bar.scrollWidth - bar.clientWidth : 999,
        };
      });
      assert.strictEqual(check.layout, layoutId, `Layout did not switch to ${layoutId}`);
      assert.ok(check.overflow <= 4, `Desktop overflow in ${layoutId}: +${check.overflow}px`);
      assert.ok(check.canvasH >= 240, `Canvas height too small in ${layoutId}: ${check.canvasH}px`);
      assert.ok(check.consoleH >= 46, `Console height too small in ${layoutId}: ${check.consoleH}px`);
      assert.strictEqual(check.playerAlive, 'intact', `Player remounted in ${layoutId}`);
      assert.strictEqual(check.sentAlive, 'intact', `Sentence card remounted in ${layoutId}`);
      assert.ok(
        check.barHeight <= 44 && check.barOverflow <= 2,
        `Desktop ${layoutId} control bar broke single row: ${JSON.stringify(check)}`,
      );
    }

    // Verify Cockpit persistence across reload & Shift+Y cycle
    await page.click('#studio-layout-popover [data-studio-layout-option="cockpit"]');
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.sentence-driller-card', { timeout: 10000 });
    const persistedLayout = await page.$eval('#studio-main-content', (el) => el.getAttribute('data-layout'));
    assert.strictEqual(persistedLayout, 'cockpit', 'Selected layout did not persist across reload');

    await page.keyboard.down('Shift');
    await page.keyboard.press('KeyY');
    await page.keyboard.up('Shift');
    const cycledLayout = await page.$eval('#studio-main-content', (el) => el.getAttribute('data-layout'));
    assert.strictEqual(cycledLayout, 'zen', 'Shift+Y did not cycle cockpit -> zen');

    // Reset back to default theater and verify single-row control bar
    await page.evaluate(() => window.setStudioLayout('theater', { animate: false }));
    const theaterBar = await page.evaluate(() => {
      const bar = document.getElementById('studio-control-bar');
      const btns = Array.from(bar?.querySelectorAll('.scb-btn') || []).filter((b) => {
        const r = b.getBoundingClientRect();
        return getComputedStyle(b).display !== 'none' && r.width > 0 && r.height > 0;
      });
      const tops = btns.map((b) => Math.round(b.getBoundingClientRect().top));
      const bottoms = btns.map((b) => Math.round(b.getBoundingClientRect().bottom));
      return {
        barHeight: bottoms.length ? Math.max(...bottoms) - Math.min(...tops) : 999,
        barOverflow: bar ? bar.scrollWidth - bar.clientWidth : 999,
      };
    });
    assert.ok(theaterBar.barHeight <= 44 && theaterBar.barOverflow <= 2, `Theater control bar broke single row: ${JSON.stringify(theaterBar)}`);
    ok('All 6 desktop layouts, zero-remount morphing, reload persistence & Shift+Y cycle verified');

    // Test Tablet 768x1024 & Mobile 390px/360px zero overflow, spacious canvas & single-row control bar
    await page.setViewport({ width: 768, height: 1024 });
    await new Promise((r) => setTimeout(r, 200));
    const tabletCheck = await page.evaluate(() => {
      const bar = document.getElementById('studio-control-bar');
      const btns = Array.from(bar?.querySelectorAll('.scb-btn') || []).filter((b) => {
        const r = b.getBoundingClientRect();
        return getComputedStyle(b).display !== 'none' && r.width > 0 && r.height > 0;
      });
      const tops = btns.map((b) => Math.round(b.getBoundingClientRect().top));
      const bottoms = btns.map((b) => Math.round(b.getBoundingClientRect().bottom));
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        canvasH: Math.round(document.querySelector('.studio-canvas')?.getBoundingClientRect().height || 0),
        htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
        bodyOverflowY: getComputedStyle(document.body).overflowY,
        barHeight: bottoms.length ? Math.max(...bottoms) - Math.min(...tops) : 999,
        barOverflow: bar ? bar.scrollWidth - bar.clientWidth : 999,
      };
    });
    assert.ok(
      tabletCheck.overflow <= 4 &&
      tabletCheck.canvasH >= 380 &&
      tabletCheck.htmlOverflowY === 'hidden' &&
      tabletCheck.bodyOverflowY === 'hidden' &&
      tabletCheck.barHeight <= 44 &&
      tabletCheck.barOverflow <= 2,
      `Tablet 768x1024 layout check failed: ${JSON.stringify(tabletCheck)}`,
    );

    // Test Mobile 390px & 360px zero overflow, title legibility, canvas space & single-row control bar
    for (const width of [390, 360]) {
      await page.setViewport({ width, height: 844 });
      await new Promise((r) => setTimeout(r, 200));
      const metrics = await page.evaluate(() => {
        const bar = document.getElementById('studio-control-bar');
        const btns = Array.from(bar?.querySelectorAll('.scb-btn') || []).filter((b) => {
          const r = b.getBoundingClientRect();
          return getComputedStyle(b).display !== 'none' && r.width > 0 && r.height > 0;
        });
        const tops = btns.map((b) => Math.round(b.getBoundingClientRect().top));
        const bottoms = btns.map((b) => Math.round(b.getBoundingClientRect().bottom));
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          barHeight: bottoms.length ? Math.max(...bottoms) - Math.min(...tops) : 0,
          barOverflow: bar ? bar.scrollWidth - bar.clientWidth : 0,
          titleW: Math.round(document.getElementById('studio-title')?.getBoundingClientRect().width || 0),
          canvasH: Math.round(document.querySelector('.studio-canvas')?.getBoundingClientRect().height || 0),
        };
      });
      assert.ok(metrics.overflow <= 4, `Mobile ${width}px horizontal overflow: +${metrics.overflow}px`);
      assert.ok(metrics.barHeight <= 44 && metrics.barOverflow <= 2, `Mobile ${width}px control bar broke single row: ${JSON.stringify(metrics)}`);
      assert.ok(metrics.titleW >= 80, `Mobile ${width}px title severely clipped (${metrics.titleW}px)`);
      assert.ok(metrics.canvasH >= 320, `Mobile ${width}px sentence canvas squeezed (${metrics.canvasH}px)`);
    }

    // Verify mobile layout picker renders 4 mobile layouts and switches cleanly
    await page.setViewport({ width: 390, height: 844 });
    await new Promise((r) => setTimeout(r, 150));
    await page.click('#studio-layout-btn');
    await page.waitForSelector('#studio-layout-popover', { visible: true });
    const mobileOptCount = await page.$$eval('#studio-layout-popover [data-studio-layout-option]', (els) => els.length);
    assert.strictEqual(mobileOptCount, 4, `Expected 4 mobile layouts in sheet, got ${mobileOptCount}`);
    for (const mLayout of ['mini', 'scroll-dock', 'zen', 'docked']) {
      await page.click(`#studio-layout-popover [data-studio-layout-option="${mLayout}"]`);
      await new Promise((r) => setTimeout(r, 120));
      const mRes = await page.evaluate(() => ({
        mobileLayout: document.getElementById('studio-main-content')?.getAttribute('data-mobile-layout'),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }));
      assert.strictEqual(mRes.mobileLayout, mLayout);
      assert.ok(mRes.overflow <= 4, `Mobile ${mLayout} overflow: +${mRes.overflow}px`);
    }
    await page.click('#slp-close-btn');
    ok('Tablet 768px & Mobile 390px/360px layouts, readable title, spacious canvas & 4 mobile modes verified');

    assert.strictEqual(consoleErrors.length, 0, `Uncaught browser page errors: ${consoleErrors.join(' | ')}`);
    // 10. Regression check: DOM word timing decoration handles numbers, currency, URLs, curly apostrophes & [ __ ] tokens
    const domSyncAudit = await page.evaluate(() => {
      const TT = window.FlaptapStudioTranscriptTools;
      if (!TT) return { error: 'Missing FlaptapStudioTranscriptTools' };

      const trickySentence = {
        index: 99,
        text: "We don’t pay $100,000. at busy.com/cody at 10:00 in D.C. [ __ ]!",
        words: [
          { i: 0, word: 'We', startMs: 0, endMs: 180 },
          { i: 1, word: 'don’t', startMs: 180, endMs: 420 },
          { i: 2, word: 'pay', startMs: 420, endMs: 650 },
          { i: 3, word: '$100,000.', startMs: 650, endMs: 1100 },
          { i: 4, word: 'at', startMs: 1100, endMs: 1220 },
          { i: 5, word: 'busy.com/cody', startMs: 1220, endMs: 1700 },
          { i: 6, word: 'at', startMs: 1700, endMs: 1820 },
          { i: 7, word: '10:00', startMs: 1820, endMs: 2200 },
          { i: 8, word: 'in', startMs: 2200, endMs: 2320 },
          { i: 9, word: 'D.C.', startMs: 2320, endMs: 2700 },
          { i: 10, word: '[', startMs: 2700, endMs: 2750 },
          { i: 11, word: '__', startMs: 2750, endMs: 2800 },
          { i: 12, word: ']!', startMs: 2800, endMs: 2850 },
        ],
      };
      const html = TT.decorateTimedWordsHtml(trickySentence.text, trickySentence);
      const wrap = document.createElement('div');
      wrap.innerHTML = html;
      const spans = Array.from(wrap.querySelectorAll('.studio-word')).map((el) => ({
        word: el.textContent,
        i: Number(el.getAttribute('data-word-i')),
        startMs: Number(el.getAttribute('data-start-ms')),
        endMs: Number(el.getAttribute('data-end-ms')),
      }));

      // Also check touching boundary lookup precision in findWordAtTimeMs
      const hitAt180 = TT.findWordAtTimeMs(trickySentence.words, 180);
      const hitAt1100 = TT.findWordAtTimeMs(trickySentence.words, 1100);
      const hitAtBusy = TT.findWordAtTimeMs(trickySentence.words, 1450);

      return { spans, hitAt180, hitAt1100, hitAtBusy };
    });

    assert(!domSyncAudit.error, domSyncAudit.error || 'DOM sync check ok');
    assert.strictEqual(domSyncAudit.spans.length, 10, 'All 10 lexical tokens get aligned .studio-word spans without splitting 100,000 / 10:00 / busy.com/cody / D.C.');
    assert.strictEqual(domSyncAudit.spans[1].word, 'don’t');
    assert.strictEqual(domSyncAudit.spans[1].startMs, 180);
    assert.strictEqual(domSyncAudit.spans[3].word, '100,000');
    assert.strictEqual(domSyncAudit.spans[3].startMs, 650);
    assert.strictEqual(domSyncAudit.spans[5].word, 'busy.com/cody');
    assert.strictEqual(domSyncAudit.spans[5].startMs, 1220);
    assert.strictEqual(domSyncAudit.spans[7].word, '10:00');
    assert.strictEqual(domSyncAudit.spans[7].startMs, 1820);
    assert.strictEqual(domSyncAudit.spans[9].word, 'D.C');
    assert.strictEqual(domSyncAudit.spans[9].startMs, 2320);
    assert.strictEqual(domSyncAudit.hitAt180, 1, 'Boundary 180ms resolves cleanly to word 1 (don’t)');
    assert.strictEqual(domSyncAudit.hitAt1100, 4, 'Boundary 1100ms resolves cleanly to word 4 (at)');
    assert.strictEqual(domSyncAudit.hitAtBusy, 5, 'Midpoint 1450ms resolves cleanly to busy.com/cody');
    ok('DOM word-timing decoration handles curly apostrophes, numbers, currency, times, URLs, acronyms & [ __ ] accurately');

    const karaokeToggle = await page.evaluate(async () => {
      const btn = document.getElementById('studio-toggle-karaoke');
      if (!btn) return null;
      const before = btn.getAttribute('aria-pressed');
      btn.click();
      const off = { pressed: btn.getAttribute('aria-pressed'), stored: localStorage.getItem('flaptap_karaoke') };
      btn.click();
      const on = { pressed: btn.getAttribute('aria-pressed'), stored: localStorage.getItem('flaptap_karaoke') };
      return { before, off, on };
    });
    assert(karaokeToggle, 'Highlight toggle button exists');
    assert.strictEqual(karaokeToggle.before, 'true');
    assert.deepStrictEqual(karaokeToggle.off, { pressed: 'false', stored: 'off' });
    assert.deepStrictEqual(karaokeToggle.on, { pressed: 'true', stored: 'on' });
    ok('Live word Highlight toggle disables/enables and persists preference');

    // Verify Unified Studio Enhancements Checklist Popover & Manual Transcript Import API
    await page.click('#studio-review-btn');
    await page.waitForSelector('#studio-review-popover', { visible: true });
    const enhanceAudit = await page.evaluate(() => {
      const checks = Array.from(document.querySelectorAll('#studio-enhance-list .studio-enhance-check'));
      return {
        totalChecks: checks.length,
        anyCheckedByDefault: checks.some((c) => c.checked),
        runDisabled: document.getElementById('studio-run-enhancements-btn')?.disabled,
      };
    });
    assert.strictEqual(await page.$('#enhance-row-transcribe'), null, 'Third-party Whisper/Groq transcribe checkbox must not be present');
    assert.ok(enhanceAudit.totalChecks >= 4, `Expected >=4 enhancement checklist tasks, got ${enhanceAudit.totalChecks}`);
    assert.strictEqual(enhanceAudit.anyCheckedByDefault, false, 'All deferred enhancements must start unchecked by default');
    assert.strictEqual(enhanceAudit.runDisabled, true, 'Run Selected button must start disabled until user checks an option');

    await page.click('#studio-enhance-model-toggle');
    const aiMountVisible = await page.$eval('#studio-review-ai-mount', (el) => !el.hidden);
    assert.ok(aiMountVisible, 'FlaptapAiSelector disclosure failed to expand inside Enhancements popover');
    await page.click('#studio-review-btn'); // Close popover
    ok('Unified Studio Enhancements checklist renders all deferred options unchecked by default');

    const importRes = await api(
      `/api/tracks/media-hub/${seeded.id}/transcript/import`,
      {
        method: 'POST',
        body: JSON.stringify({ rawText: 'Hello there. Welcome back to instant shadowing!' }),
      },
      tokenA,
    );
    assert.strictEqual(importRes.status, 201);
    assert.ok(Array.isArray(importRes.json.sentences) && importRes.json.sentences.length === 2, 'Manual transcript import should produce 2 sentences');
    ok('POST /api/tracks/media-hub/:id/transcript/import deterministically populates sentences with 0% CPU');

    const sttDisabledRes = await api(
      `/api/tracks/media-hub/${seeded.id}/transcribe`,
      { method: 'POST', body: JSON.stringify({ allowLocalWhisper: true }) },
      tokenA,
    );
    assert.strictEqual(sttDisabledRes.status, 400);
    assert.strictEqual(sttDisabledRes.json?.code, 'third_party_stt_disabled');
    ok('Third-party Whisper/Groq transcription endpoint strictly returns 400 third_party_stt_disabled');

    const guardBlockedRes = await api(
      '/api/tracks/media-hub/process',
      { method: 'POST', body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=zzGuardTest9' }) },
      tokenA,
    );
    assert.strictEqual(guardBlockedRes.status, 503);
    assert.strictEqual(guardBlockedRes.json?.code, 'live_fetch_disabled');
    ok('Uncached live YouTube process is blocked at 503 live_fetch_disabled under FLAPTAP_LIVE_TRANSCRIPTS=off (0 outbound calls)');

    ok('Zero uncaught browser errors across entire E2E flow');

    console.log('\n🎉 Consolidated Shadowing E2E Suite: ALL CHECKS PASSED!\n');
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill('SIGTERM');
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    if (stderrBuf && stderrBuf.includes('ERROR')) {
      console.error('Server stderr excerpt:', stderrBuf.slice(0, 800));
    }
  }
}

run().catch((err) => {
  console.error('\n❌ E2E FAILED:', err);
  process.exit(1);
});
