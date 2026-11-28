/**
 * American English Extractor — production E2E suite.
 *
 * Covers:
 * 1. Public config + strict auth/ownership isolation.
 * 2. Text, Markdown upload, image OCR, audio upload, saved lesson transcript,
 *    article URL, and YouTube URL extraction through real AI.
 * 3. Grounding, duplicate removal, category coverage, contextual translation,
 *    completion persistence, contextual word lookup, and deletion.
 * 4. Headless browser: auth gate, input validation, extraction, filters,
 *    selectable source lookup, vocabulary saving, completion, hard-refresh
 *    persistence, library management, mobile responsiveness, dark mode,
 *    console cleanliness, and screenshots.
 *
 * Run: node scripts/test_american_extractor_e2e.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(ROOT, 'data/audit_screenshots/american-extractor');
const API_TIMEOUT_MS = 240000;

const RICH_TEXT = `Alright, let's kick this off. I want to double down on the latency work we shipped last week, because honestly the numbers still don't add up. We're kind of chasing our tail here. Let me walk you back through what happened: the canary looked fine, then out of nowhere the p99 went through the roof. I'm not going to sugarcoat it — we dropped the ball on the rollback. That being said, the fix is pretty straightforward. Can you take a stab at the profiling? If we can get ahead of it, we'll be in good shape. I don't want to nickel-and-dime the infra budget, but we should ballpark the cost before Friday. Let's circle back once you've had a chance to dig in. Sound good?`;

const MARKDOWN_TEXT = `# Shipping a hard migration

We were on the fence about the cutover, but the team decided to bite the bullet. The migration had been hanging over our heads for months. Once the dust settled, the rollout was a lot smoother than we had bargained for. Honestly, it was a no-brainer: the old system was held together with duct tape. We did hit a snag with the auth layer, but we managed to iron it out before the demo. The lesson? Don't put all your eggs in one basket when you plan a rollback.
`;

let passed = 0;
let failures = 0;
const skipped = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed++;
  console.log(`✅ PASSED: ${message}`);
}

function note(message) {
  console.log(`ℹ️  ${message}`);
}

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hasArabic(value) {
  return /[\u0600-\u06FF]/.test(String(value || ''));
}

async function api(baseUrl, route, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let body;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method || (body ? 'POST' : 'GET'),
    headers,
    body,
    signal: AbortSignal.timeout(options.timeoutMs || API_TIMEOUT_MS),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, data };
}

async function waitForServer(baseUrl, attempts = 80) {
  for (let index = 0; index < attempts; index++) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Test server failed to become healthy.');
}

function trackedPage(page, state) {
  page.on('pageerror', (error) => state.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') state.consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || '';
    if (/ERR_ABORTED|ERR_NAVIGATION/i.test(failure)) return;
    state.requestFailures.push(`${request.url()} :: ${failure}`);
  });
}

async function signIn(page, baseUrl, email, password) {
  await page.goto(`${baseUrl}/extractor`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const result = await page.evaluate(
    async (loginEmail, loginPassword) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || 'Login failed');
      localStorage.setItem('flaptap_auth_token', data.token);
      return { token: data.token, email: data.user?.email };
    },
    email,
    password,
  );
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.flaptapState?.user?.email, { timeout: 20000 });
  return result;
}

async function waitForAiSelector(page) {
  await page.waitForSelector('#aex-aisel-run-btn', { visible: true, timeout: 25000 });
  await page.waitForFunction(
    () => {
      const button = document.getElementById('aex-aisel-run-btn');
      return Boolean(button && !button.disabled);
    },
    { timeout: 30000 },
  );
}

async function selectSourcePhrase(page, phrase) {
  return page.evaluate((target) => {
    const container = document.getElementById('aex-source-content');
    if (!container) return { ok: false, reason: 'no source container' };
    const words = [...container.querySelectorAll('.clickable-word')];
    const targetWords = String(target || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    let startIndex = -1;
    for (let index = 0; index < words.length; index++) {
      const windowText = words
        .slice(index, index + targetWords.length)
        .map((word) => (word.textContent || '').toLowerCase().replace(/[^a-z']/g, ''))
        .join(' ');
      if (windowText === targetWords.map((word) => word.replace(/[^a-z']/g, '')).join(' ')) {
        startIndex = index;
        break;
      }
    }
    if (startIndex < 0) return { ok: false, reason: 'phrase not found', sample: words.slice(0, 15).map((w) => w.textContent) };
    const start = words[startIndex];
    const end = words[startIndex + targetWords.length - 1];
    const range = document.createRange();
    range.setStart(start.firstChild, 0);
    range.setEnd(end.firstChild, (end.firstChild.textContent || '').length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    container.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return { ok: true, selected: selection.toString() };
  }, phrase);
}

async function run() {
  console.log('🧪 American English Extractor E2E Suite\n');
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const port = 3490 + Math.floor(Math.random() * 90);
  const baseUrl = `http://127.0.0.1:${port}`;
  const dbPath = path.join(os.tmpdir(), `flaptap-aex-e2e-${Date.now()}.sqlite`);
  const server = spawn(process.execPath, [path.join(ROOT, 'backend/dist/main.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', FLAPTAP_SQLITE_PATH: dbPath },
    stdio: 'ignore',
  });

  let browser;
  const browserState = { pageErrors: [], consoleErrors: [], requestFailures: [] };
  const created = [];

  try {
    await waitForServer(baseUrl);
    note(`Isolated server ready at ${baseUrl} (temp SQLite)`);

    /* ------------------------------------------------------------------ */
    /* 1. Auth, config, isolation                                          */
    /* ------------------------------------------------------------------ */
    const suffix = Date.now();
    const email = `aex.e2e.${suffix}@flaptap.test`;
    const password = 'Password123!';
    const register = await api(baseUrl, '/api/auth/register', {
      body: { name: 'AEX E2E', email, password },
      method: 'POST',
    });
    assert(register.ok && register.data.token, 'Registered isolated E2E account');
    const token = register.data.token;

    const secondEmail = `aex.e2e.second.${suffix}@flaptap.test`;
    const secondRegister = await api(baseUrl, '/api/auth/register', {
      body: { name: 'AEX Second', email: secondEmail, password },
      method: 'POST',
    });
    assert(secondRegister.ok && secondRegister.data.token, 'Registered second isolated account');
    const secondToken = secondRegister.data.token;

    const config = await api(baseUrl, '/api/american-extractor/config');
    assert(config.ok && config.data.categories.length >= 8, `Public config exposes ${config.data.categories.length} categories`);
    assert(config.data.focuses.length >= 4, 'Public config exposes all learning focuses');
    assert(
      config.data.defaultModel === 'gpt-6-luna' && config.data.defaultVariant === 'medium',
      `Public config advertises defaultModel=${config.data.defaultModel} and defaultVariant=${config.data.defaultVariant}`,
    );
    assert(
      Array.isArray(config.data.extractionTypes) &&
        config.data.extractionTypes.length >= 10 &&
        Array.isArray(config.data.styles) &&
        config.data.styles.length >= 7 &&
        Array.isArray(config.data.levels) &&
        config.data.levels.length >= 10 &&
        Array.isArray(config.data.depths) &&
        config.data.depths.length >= 4 &&
        Array.isArray(config.data.studyGoals) &&
        config.data.studyGoals.length >= 5 &&
        Array.isArray(config.data.orders) &&
        config.data.orders.length >= 3,
      'Public config exposes all extraction control spinner catalogs',
    );

    const unauth = await api(baseUrl, '/api/american-extractor/extract', {
      method: 'POST',
      body: { inputKind: 'text', text: 'Testing authentication.' },
    });
    assert(unauth.status === 401, 'Extraction without a session returns 401');

    const missingInput = await api(baseUrl, '/api/american-extractor/extract', {
      token,
      method: 'POST',
      body: { inputKind: 'text' },
    });
    assert(missingInput.status === 400, 'Missing source input returns 400');

    const privateUrl = await api(baseUrl, '/api/american-extractor/extract', {
      token,
      method: 'POST',
      body: { inputKind: 'url', url: 'http://127.0.0.1:3333/' },
    });
    assert(
      privateUrl.status === 400 && /private|local network/i.test(privateUrl.data?.message || ''),
      'SSRF guard rejects localhost and private network URLs',
    );

    /* ------------------------------------------------------------------ */
    /* 2. Text extraction + grounding                                      */
    /* ------------------------------------------------------------------ */
    console.log('\n--- Text extraction ---');
    const textStart = Date.now();
    const textExtraction = await api(baseUrl, '/api/american-extractor/extract', {
      token,
      method: 'POST',
      body: {
        inputKind: 'text',
        text: RICH_TEXT,
        title: 'E2E platform standup',
        language: 'ar',
        focus: 'professional',
        keyId: 'env:OPENCODE_GO_API_KEY',
      },
    });
    const textMs = Date.now() - textStart;
    assert(textExtraction.ok && textExtraction.data?.data, `Text extraction succeeded in ${(textMs / 1000).toFixed(1)}s`);
    const textNote = textExtraction.data.data;
    created.push(textNote.id);
    assert(
      textNote.modelUsed === 'gpt-6-luna' && textNote.reasoningLevel === 'medium',
      `Backend defaults resolved to model=${textNote.modelUsed}, reasoning=${textNote.reasoningLevel} without client overrides`,
    );

    assert(textNote.items.length >= 8, `Extracted ${textNote.items.length} high-value items`);
    assert(textNote.itemCount === textNote.items.length, 'Item count matches the item array');
    assert(textNote.targetLanguage === 'ar' && textNote.rtl === true, 'Arabic target language metadata is correct');
    assert(textNote.items.some((item) => item.category === 'phrasal_verb'), 'Includes phrasal verbs');
    assert(textNote.items.some((item) => item.category === 'idiom'), 'Includes idioms');
    assert(new Set(textNote.items.map((item) => item.category)).size >= 3, 'Covers at least three distinct categories');
    assert(new Set(textNote.items.map((item) => normalize(item.term).toLowerCase())).size === textNote.items.length, 'Contains no duplicate terms');

    const normalizedSource = normalize(textNote.sourceText).toLowerCase();
    const ungrounded = textNote.items.filter(
      (item) => !normalizedSource.includes(normalize(item.term).toLowerCase()) && !normalizedSource.includes(normalize(item.surface).toLowerCase()),
    );
    assert(ungrounded.length === 0, `Every item is grounded in the source (${ungrounded.length} ungrounded)`);

    const contextMismatch = textNote.items.filter(
      (item) => item.contextSentence && !normalizedSource.includes(normalize(item.contextSentence).toLowerCase()),
    );
    assert(contextMismatch.length === 0, `Every context quote is verbatim source text (${contextMismatch.length} mismatches)`);

    const arabicItems = textNote.items.filter((item) => hasArabic(item.localizedMeaning));
    assert(arabicItems.length >= Math.ceil(textNote.items.length * 0.8), `Contextual Arabic translations present on ${arabicItems.length}/${textNote.items.length} items`);
    assert(textNote.items.filter((item) => item.ipa && item.ipa.includes('/')).length >= 10, 'General American IPA present on most items');
    assert(textNote.items.filter((item) => item.usageNote || item.spokenNote).length >= 10, 'Usage or spoken-mechanics guidance present');
    assert(textNote.items.filter((item) => item.example).length >= 10, 'Natural example sentences present');
    assert(textNote.summary.length > 20, 'Editorial summary is present');

    const history = await api(baseUrl, '/api/american-extractor/history', { token });
    assert(history.ok && history.data.items.some((item) => item.id === textNote.id), 'Extraction appears in private history');

    const noteFetch = await api(baseUrl, `/api/american-extractor/notes/${textNote.id}`, { token });
    assert(noteFetch.ok && noteFetch.data.data.sourceText === textNote.sourceText, 'Stored note rehydrates with its full selectable source');

    const foreignNote = await api(baseUrl, `/api/american-extractor/notes/${textNote.id}`, { token: secondToken });
    assert(foreignNote.status === 404, 'A second account cannot read another account’s note');
    const foreignDelete = await api(baseUrl, `/api/american-extractor/notes/${textNote.id}`, {
      token: secondToken,
      method: 'DELETE',
    });
    assert(foreignDelete.status === 404, 'A second account cannot delete another account’s note');

    const itemComplete = await api(baseUrl, `/api/american-extractor/notes/${textNote.id}/items/0`, {
      token,
      method: 'PATCH',
      body: { completed: true },
    });
    assert(itemComplete.ok && itemComplete.data.completionProgress.items.includes(0), 'Item completion persists to SQLite');

    const invalidIndex = await api(baseUrl, `/api/american-extractor/notes/${textNote.id}/items/9999`, {
      token,
      method: 'PATCH',
      body: { completed: true },
    });
    assert(invalidIndex.status === 400, 'Invalid item index returns 400');

    const noteComplete = await api(baseUrl, `/api/american-extractor/notes/${textNote.id}`, {
      token,
      method: 'PATCH',
      body: { completed: true },
    });
    assert(noteComplete.status === 400, 'Fake manual whole-guide completion override is rejected (400)');

    const lookup = await api(baseUrl, '/api/american-extractor/define-word', {
      token,
      method: 'POST',
      body: {
        noteId: textNote.id,
        word: 'chasing our tail',
        contextSentence: "We're kind of chasing our tail here.",
        language: 'ar',
      },
    });
    assert(lookup.ok && lookup.data.term && lookup.data.translation, 'Contextual word lookup returns definition and translation');
    assert(hasArabic(lookup.data.translation), 'Contextual lookup translation is in the selected language');

    const emptyLookup = await api(baseUrl, '/api/american-extractor/define-word', {
      token,
      method: 'POST',
      body: { word: '   ' },
    });
    assert(emptyLookup.status === 400, 'Empty word lookup returns 400');

    /* ------------------------------------------------------------------ */
    /* 3. Markdown upload                                                  */
    /* ------------------------------------------------------------------ */
    console.log('\n--- Markdown upload ---');
    const markdownForm = new FormData();
    markdownForm.append('file', new Blob([MARKDOWN_TEXT], { type: 'text/markdown' }), 'migration-notes.md');
    markdownForm.append('language', 'ar');
    markdownForm.append('focus', 'professional');
    const markdownExtraction = await api(baseUrl, '/api/american-extractor/extract/upload', {
      token,
      method: 'POST',
      form: markdownForm,
    });
    assert(markdownExtraction.ok && markdownExtraction.data?.data, 'Markdown upload extraction succeeded');
    const markdownNote = markdownExtraction.data.data;
    created.push(markdownNote.id);
    assert(markdownNote.sourceType === 'markdown', 'Markdown upload is classified correctly');
    assert(markdownNote.items.length >= 5, `Markdown yielded ${markdownNote.items.length} study items`);
    assert(normalize(markdownNote.sourceText).includes('bite the bullet'), 'Markdown prose survived cleaning');

    /* ------------------------------------------------------------------ */
    /* 4. Image OCR                                                       */
    /* ------------------------------------------------------------------ */
    console.log('\n--- Image OCR ---');
    const imageBuffer = await fs.promises.readFile(path.join(ROOT, 'frontend/screenshot-wide.png'));
    const imageForm = new FormData();
    imageForm.append('file', new Blob([imageBuffer], { type: 'image/png' }), 'product-screenshot.png');
    imageForm.append('language', 'ar');
    imageForm.append('focus', 'balanced');
    const imageExtraction = await api(baseUrl, '/api/american-extractor/extract/upload', {
      token,
      method: 'POST',
      form: imageForm,
    });
    assert(imageExtraction.ok && imageExtraction.data?.data, 'Image OCR extraction succeeded');
    const imageNote = imageExtraction.data.data;
    created.push(imageNote.id);
    assert(imageNote.sourceType === 'image', 'Image upload is classified correctly');
    assert(/flaptap|spoken english/i.test(imageNote.sourceText), 'OCR transcribed the screenshot text');
    assert(imageNote.items.length >= 5, `OCR source yielded ${imageNote.items.length} study items`);
    assert(
      Boolean(imageNote.title) &&
        !/product[-_\s]?screenshot|\.png|^\s*screenshot\s*$/i.test(imageNote.title),
      `Single image upload generated a non-filename contextual title ("${imageNote.title}")`,
    );

    /* ------------------------------------------------------------------ */
    /* 4b. Multi-image OCR batch + contextual naming + newest-first order */
    /* ------------------------------------------------------------------ */
    console.log('\n--- Multi-image OCR batch ---');
    const secondImageBuffer = await fs.promises.readFile(path.join(ROOT, 'frontend/screenshot-mobile.png'));
    const multiImageForm = new FormData();
    multiImageForm.append('files', new Blob([imageBuffer], { type: 'image/png' }), 'IMG_4829_raw.png');
    multiImageForm.append('files', new Blob([secondImageBuffer], { type: 'image/png' }), 'Screenshot_2026_11_21.png');
    multiImageForm.append('language', 'ar');
    multiImageForm.append('focus', 'balanced');
    const multiExtraction = await api(baseUrl, '/api/american-extractor/extract/upload', {
      token,
      method: 'POST',
      form: multiImageForm,
    });
    assert(multiExtraction.ok && multiExtraction.data?.data, 'Multi-image OCR batch extraction succeeded');
    const multiNote = multiExtraction.data.data;
    created.push(multiNote.id);
    assert(multiNote.sourceType === 'image', 'Multi-image upload keeps image sourceType');
    assert(
      Number(multiNote.sourceMeta?.imageCount) === 2,
      `Multi-image extraction recorded imageCount=${multiNote.sourceMeta?.imageCount}`,
    );
    assert(multiNote.items.length >= 5, `Multi-image batch yielded ${multiNote.items.length} study items`);
    assert(
      Boolean(multiNote.title) &&
        !/img[-_\s]?4829|screenshot[-_\s]?2026|\.png|^\s*(screenshot|image)\s*$/i.test(multiNote.title),
      `Multi-image upload generated a contextual title without filenames ("${multiNote.title}")`,
    );

    const historyPageRes = await api(baseUrl, '/api/american-extractor/history?page=1&limit=10', { token });
    assert(historyPageRes.ok && Array.isArray(historyPageRes.data?.items), 'Paginated history endpoint returned items');
    assert(
      Number(historyPageRes.data.pageSize) === 10 && historyPageRes.data.items[0]?.id === multiNote.id,
      'Newest generated multi-image guide appears first (#1) on Page 1 with 10-per-page default',
    );

    /* ------------------------------------------------------------------ */
    /* 5. Audio transcription                                             */
    /* ------------------------------------------------------------------ */
    console.log('\n--- Audio upload ---');
    let audioSkipped = false;
    try {
      const audioResponse = await fetch(
        'https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0010_8k.wav',
        { signal: AbortSignal.timeout(45000) },
      );
      if (!audioResponse.ok) throw new Error(`audio download HTTP ${audioResponse.status}`);
      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
      const audioForm = new FormData();
      audioForm.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'spoken-sample.wav');
      audioForm.append('language', 'ar');
      audioForm.append('focus', 'balanced');
      const audioExtraction = await api(baseUrl, '/api/american-extractor/extract/upload', {
        token,
        method: 'POST',
        form: audioForm,
      });
      assert(audioExtraction.ok && audioExtraction.data?.data, 'Audio upload transcription + extraction succeeded');
      const audioNote = audioExtraction.data.data;
      created.push(audioNote.id);
      assert(audioNote.sourceType === 'audio', 'Audio upload is classified correctly');
      assert(/birch canoe|smooth planks/i.test(audioNote.sourceText), 'Speech-to-text produced the expected words');
      assert(audioNote.items.length >= 5, `Audio source yielded ${audioNote.items.length} study items`);
      assert(audioNote.sourceMeta?.engine, 'Audio note records its transcription engine');
    } catch (error) {
      audioSkipped = true;
      skipped.push(`Audio upload: ${error.message}`);
      console.warn(`⚠️  SKIPPED: Audio upload (${error.message})`);
    }

    /* ------------------------------------------------------------------ */
    /* 6. Saved lesson transcript                                         */
    /* ------------------------------------------------------------------ */
    console.log('\n--- Saved lesson transcript ---');
    const processVideo = await api(baseUrl, '/api/tracks/media-hub/process', {
      token,
      method: 'POST',
      body: { url: 'https://www.youtube.com/watch?v=C89c0fsHYIQ' },
    });
    assert(processVideo.ok && processVideo.data?.id, 'Created a real saved video lesson');
    const lessonId = processVideo.data.id;

    const sources = await api(baseUrl, '/api/american-extractor/transcript-sources', { token });
    assert(
      sources.ok && sources.data.items.some((item) => item.id === lessonId),
      'Saved lesson transcript appears in the picker endpoint',
    );

    const lessonExtraction = await api(baseUrl, '/api/american-extractor/extract', {
      token,
      method: 'POST',
      body: {
        inputKind: 'lesson',
        lessonId,
        language: 'ar',
        focus: 'professional',
      },
    });
    assert(lessonExtraction.ok && lessonExtraction.data?.data, 'Existing transcript extraction succeeded');
    const lessonNote = lessonExtraction.data.data;
    created.push(lessonNote.id);
    assert(
      (lessonNote.sourceType === 'lesson' || lessonNote.sourceType === 'youtube') &&
        lessonNote.sourceMeta?.lessonId === lessonId,
      'Saved transcript preserves lesson linkage in source metadata',
    );
    assert(/New York City|tech boom/i.test(lessonNote.sourceText), 'Saved lesson transcript text is reused');
    assert(lessonNote.items.length >= 5, `Saved transcript yielded ${lessonNote.items.length} study items`);

    /* ------------------------------------------------------------------ */
    /* 7. Article URL                                                     */
    /* ------------------------------------------------------------------ */
    console.log('\n--- Article URL ---');
    const articleExtraction = await api(baseUrl, '/api/american-extractor/extract', {
      token,
      method: 'POST',
      timeoutMs: 420000,
      body: {
        inputKind: 'url',
        url: 'https://paulgraham.com/greatwork.html',
        language: 'ar',
        focus: 'balanced',
      },
    });
    assert(articleExtraction.ok && articleExtraction.data?.data, 'Public article URL extraction succeeded');
    const articleNote = articleExtraction.data.data;
    created.push(articleNote.id);
    assert(articleNote.sourceType === 'article', 'Article URL is classified correctly');
    assert(articleNote.sourceText.length > 1000, 'Article reader extracted substantial prose');
    assert(articleNote.items.length >= 5, `Article yielded ${articleNote.items.length} study items`);

    /* ------------------------------------------------------------------ */
    /* 8. YouTube URL                                                     */
    /* ------------------------------------------------------------------ */
    console.log('\n--- YouTube URL ---');
    const youtubeExtraction = await api(baseUrl, '/api/american-extractor/extract', {
      token,
      method: 'POST',
      body: {
        inputKind: 'url',
        url: 'https://www.youtube.com/watch?v=C89c0fsHYIQ',
        language: 'ar',
        focus: 'professional',
        force: true,
      },
    });
    assert(youtubeExtraction.ok && youtubeExtraction.data?.data, 'YouTube URL extraction succeeded');
    const youtubeNote = youtubeExtraction.data.data;
    created.push(youtubeNote.id);
    assert(youtubeNote.sourceType === 'youtube', 'YouTube URL is classified correctly');
    assert(youtubeNote.sourceMeta?.engine === 'captions', 'YouTube uses the caption fast path');
    assert(youtubeNote.items.length >= 5, `YouTube yielded ${youtubeNote.items.length} study items`);

    /* ------------------------------------------------------------------ */
    /* 9. Unsupported upload                                              */
    /* ------------------------------------------------------------------ */
    const badForm = new FormData();
    badForm.append('file', new Blob([Buffer.from('MZ binary')], { type: 'application/x-msdownload' }), 'malware.exe');
    const badUpload = await api(baseUrl, '/api/american-extractor/extract/upload', {
      token,
      method: 'POST',
      form: badForm,
    });
    assert(badUpload.status === 400, 'Unsupported upload type returns 400');

    /* ------------------------------------------------------------------ */
    /* 10. Headless browser journey                                       */
    /* ------------------------------------------------------------------ */
    console.log('\n--- Headless browser journey ---');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    trackedPage(page, browserState);

    const signInResult = await signIn(page, baseUrl, email, password);
    assert(signInResult.email === email, 'Browser signed into the isolated account');
    await waitForAiSelector(page);

    const shell = await page.evaluate(() => ({
      path: location.pathname,
      title: document.title,
      activeLink: document.querySelector('.sidebar-nav-link.active')?.getAttribute('data-route-section'),
      authed: Boolean(window.flaptapState?.user),
      aiKey: document.querySelector('#aex-aisel-key-select')?.value || '',
      selectedModel: document.querySelector('#aex-aisel-model-select')?.value || '',
      selectedVariant: document.querySelector('#aex-aisel-variant-select')?.value || '',
      models: document.querySelectorAll('#aex-aisel-model-select option').length,
      recentCards: document.querySelectorAll('#aex-recent-row .aex-recent-mini').length,
    }));
    assert(shell.path === '/extractor', 'Dedicated /extractor route owns the feature');
    assert(shell.activeLink === 'american-extractor', 'Sidebar marks the Extractor as active');
    assert(shell.authed, 'Browser session is authenticated');
    assert(shell.models >= 1 && shell.aiKey, 'Shared AI provider/model selector is mounted and live');
    assert(
      shell.selectedModel === 'gpt-6-luna' && shell.selectedVariant === 'medium',
      `UI AI selector defaults to model=${shell.selectedModel}, reasoning=${shell.selectedVariant}`,
    );
    assert(shell.recentCards >= 1, 'Recent shelf renders persisted notes');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-extractor-desktop.png'), fullPage: true });

    // Input validation before any network call.
    await page.click('#aex-aisel-run-btn');
    await page.waitForFunction(
      () => {
        const error = document.getElementById('aex-inline-error');
        return error && !error.hidden && /source link/i.test(error.textContent || '');
      },
      { timeout: 5000 },
    );
    assert(true, 'Missing source shows an inline error before execution');
    await page.click('#aex-err-dismiss');

    // Text extraction through the real UI.
    await page.click('[data-aex-source="text"]');
    await page.evaluate((source, title) => {
      const textarea = document.getElementById('aex-text-input');
      textarea.value = source;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('aex-text-title').value = title;
      document.getElementById('aex-focus-select').value = 'professional';
      document.getElementById('aex-language-select').value = 'ar';
      document.getElementById('aex-language-select').dispatchEvent(new Event('change', { bubbles: true }));
      const force = document.getElementById('aex-force-fresh');
      if (force) {
        force.checked = true;
        force.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, RICH_TEXT, 'Browser standup study map');

    const uiStart = Date.now();
    await page.click('#aex-aisel-run-btn');
    await page.waitForFunction(() => !document.getElementById('aex-progress')?.hidden, { timeout: 5000 });
    assert(true, 'Progress card appears with staged pipeline feedback');

    await page.waitForFunction(
      () =>
        location.pathname.startsWith('/extractor/library/') &&
        document.querySelectorAll('#aex-items-list .aex-item').length > 0,
      { timeout: 240000 },
    );
    const uiMs = Date.now() - uiStart;
    note(`Browser extraction completed in ${(uiMs / 1000).toFixed(1)}s`);

    const uiNote = await page.evaluate(async () => {
      const items = [...document.querySelectorAll('#aex-items-list .aex-item')];
      const dock = document.getElementById('aex-sticky-dock');
      const noteCard = document.getElementById('aex-note-card');
      const list = document.getElementById('aex-items-list');
      const dockRectBefore = dock?.getBoundingClientRect();
      const listRectBefore = list?.getBoundingClientRect();
      const dockContains = Boolean(
        dock &&
          dock.contains(document.getElementById('aex-note-progress')) &&
          dock.contains(document.getElementById('aex-note-scope')) &&
          dock.contains(document.getElementById('aex-recall-toggle')) &&
          dock.contains(document.getElementById('aex-category-filters')) &&
          dock.contains(document.getElementById('aex-note-search')),
      );
      const dockExcludesHeader = Boolean(
        dock &&
          !dock.contains(noteCard) &&
          !dock.contains(document.getElementById('aex-note-title')) &&
          !dock.contains(document.getElementById('aex-note-summary-wrap')) &&
          !dock.contains(document.querySelector('.aex-shell-bar')),
      );
      const dockPosition = dock ? getComputedStyle(dock).position : '';

      window.scrollTo(0, 900);
      await new Promise((resolve) => setTimeout(resolve, 140));
      const dockRectStuck = dock?.getBoundingClientRect();
      const noteCardRectStuck = noteCard?.getBoundingClientRect();
      const dockIsStuckClass = Boolean(dock?.classList.contains('is-stuck'));
      window.scrollTo(0, 0);
      await new Promise((resolve) => setTimeout(resolve, 120));
      const dockIsStuckReset = Boolean(dock && !dock.classList.contains('is-stuck'));

      return {
        path: location.pathname,
        id: location.pathname.split('/').pop(),
        title: document.getElementById('aex-note-title')?.textContent,
        count: items.length,
        firstTerm: items[0]?.querySelector('.aex-item-term')?.textContent,
        firstIpa: items[0]?.querySelector('.aex-item-ipa')?.textContent,
        arabic: items.filter((item) => /[\u0600-\u06FF]/.test(item.querySelector('.aex-localized')?.textContent || '')).length,
        contexts: items.filter((item) => item.querySelector('.aex-context-quote')?.textContent?.trim()).length,
        sourceLength: document.getElementById('aex-source-content')?.textContent.length,
        progressTotal: document.querySelector('#aex-note-progress [data-sp-total]')?.textContent,
        summary: document.getElementById('aex-note-summary')?.textContent?.length,
        viewTabs: [...document.querySelectorAll('.aex-view-nav [role="tab"]')].map((tab) => tab.id),
        stateChip: document.querySelector('#aex-note-progress .sp-state')?.textContent?.trim(),
        dockAboveList: Boolean(dockRectBefore && listRectBefore && dockRectBefore.bottom <= listRectBefore.top + 2),
        dockContains,
        dockExcludesHeader,
        dockPosition,
        dockStaysPinned: Boolean(
          dockRectStuck &&
            dockRectStuck.top >= 45 &&
            dockRectStuck.top <= 75 &&
            noteCardRectStuck &&
            noteCardRectStuck.top < 0 &&
            dockIsStuckClass,
        ),
        dockIsStuckReset,
      };
    });
    assert(uiNote.path.startsWith('/extractor/library/'), 'Successful extraction updates the URL to the detail route');
    const persistedUiNote = await api(baseUrl, `/api/american-extractor/notes/${uiNote.id}`, { token });
    assert(
      persistedUiNote.ok &&
        persistedUiNote.data?.data?.modelUsed === 'gpt-6-luna' &&
        persistedUiNote.data?.data?.reasoningLevel === 'medium',
      `UI-triggered extraction persisted backend execution with model=${persistedUiNote.data?.data?.modelUsed}, reasoning=${persistedUiNote.data?.data?.reasoningLevel}`,
    );
    const persistedCount = Number(persistedUiNote.data?.data?.itemCount) || 0;
    assert(uiNote.title === 'Browser standup study map', 'Study map title is preserved');
    assert(
      uiNote.count === Math.min(10, persistedCount) && persistedCount >= 8,
      `Browser study map renders ${uiNote.count} item cards on Page 1 (of ${persistedCount} total)`,
    );
    assert(uiNote.arabic >= Math.ceil(uiNote.count * 0.8), `Arabic translations render on ${uiNote.arabic}/${uiNote.count} cards`);
    assert(uiNote.contexts >= Math.ceil(uiNote.count * 0.8), 'Context quotes render on most cards');
    assert(uiNote.firstIpa && uiNote.firstIpa.includes('/'), 'IPA renders on the first card');
    assert(uiNote.sourceLength > 300, 'Selectable source is rendered');
    assert(Number(uiNote.progressTotal) === persistedCount, 'Progress bar total matches total persisted item count');
    assert(uiNote.summary > 20, 'Editorial summary is available');
    assert(
      uiNote.viewTabs.length === 2 && !uiNote.viewTabs.includes('aex-tab-note'),
      'Study map opens as a sub-route, not as a third tab',
    );
    assert(uiNote.stateChip === 'Not started', 'Fresh study map reports the Not started state');
    assert(
      uiNote.dockAboveList &&
        uiNote.dockContains &&
        uiNote.dockExcludesHeader &&
        uiNote.dockPosition === 'sticky' &&
        uiNote.dockStaysPinned &&
        uiNote.dockIsStuckReset,
      'Sticky Study Dock pins progress and all filters above the list while header and takeaway scroll away',
    );

    if (persistedCount > 10) {
      const detailPageCheck = await page.evaluate(async () => {
        const bar = document.getElementById('aex-items-pagination');
        const page1Info = document.getElementById('aex-items-page-info')?.textContent?.trim() || '';
        const hiddenBefore = bar ? bar.hidden : true;
        bar?.querySelector('[data-ft-page="2"]')?.click();
        await new Promise((r) => setTimeout(r, 80));
        const page2Url = location.pathname + location.search;
        const page2Info = document.getElementById('aex-items-page-info')?.textContent?.trim() || '';
        const page2Count = document.querySelectorAll('#aex-items-list .aex-item:not(.aex-item-skel)').length;
        bar?.querySelector('[data-ft-page="1"]')?.click();
        await new Promise((r) => setTimeout(r, 80));
        return {
          hiddenBefore,
          page1Info,
          page2Url,
          page2Info,
          page2Count,
          backPage1Info: document.getElementById('aex-items-page-info')?.textContent?.trim() || '',
        };
      });
      assert(
        detailPageCheck.hiddenBefore === false && /Showing 1–10 of \d+ · Page 1 of \d+/.test(detailPageCheck.page1Info),
        `Study guide phrases pagination bar visible on Page 1 (${detailPageCheck.page1Info})`,
      );
      assert(
        detailPageCheck.page2Url.includes('?page=2') &&
          detailPageCheck.page2Count === Math.min(10, persistedCount - 10) &&
          /Page 2 of/.test(detailPageCheck.page2Info),
        `Clicking Page 2 switches detail phrases cleanly (${detailPageCheck.page2Info})`,
      );
    }

    // Category filter + note search.
    const filterResult = await page.evaluate(async () => {
      const filter = document.querySelector('#aex-category-filters [data-aex-filter="idiom"]');
      if (!filter) return { skipped: true };
      filter.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const idiomCount = document.querySelectorAll('#aex-items-list .aex-item').length;
      document.querySelector('#aex-category-filters [data-aex-filter="all"]')?.click();
      const search = document.getElementById('aex-note-search');
      search.value = 'latency';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 80));
      const searchCount = document.querySelectorAll('#aex-items-list .aex-item').length;
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      return { skipped: false, idiomCount, searchCount };
    });
    assert(!filterResult.skipped && filterResult.idiomCount > 0, 'Category filter narrows the study map');
    assert(!filterResult.skipped && filterResult.searchCount > 0, 'In-note search filters cards');

    // The source text is an icon-opened panel, so reveal it before interacting.
    const sourceOpened = await page.evaluate(() => {
      document.getElementById('aex-source-toggle')?.click();
      return document.getElementById('aex-source-panel')?.hidden === false;
    });
    assert(sourceOpened, 'Source icon opens the selectable source panel');

    // Clicking a token alone must not open lookup; selecting text should.
    const clickLookupStayedClosed = await page.evaluate(() => {
      document.querySelector('#aex-source-content .clickable-word')?.click();
      return document.getElementById('word-lookup-popover')?.hidden !== false;
    });
    assert(clickLookupStayedClosed, 'Clicking a source word alone does not open contextual lookup');

    // Selectable source lookup.
    const selection = await selectSourcePhrase(page, 'double down on');
    assert(selection.ok, `Programmatically selected "${selection.selected}" in the source`);
    await page.waitForFunction(
      () => {
        const menu = document.getElementById('selection-action-menu');
        const preview = document.getElementById('selection-menu-text')?.textContent || '';
        return Boolean(menu && !menu.hidden && /double down on/i.test(preview));
      },
      { timeout: 8000 },
    );
    const lookupDeferred = await page.evaluate(() => {
      const pop = document.getElementById('word-lookup-popover');
      return !pop || pop.hidden;
    });
    assert(lookupDeferred, 'Selecting text reveals actions without calling the model yet');
    await page.$eval('#selection-action-menu [data-selection-action="translate"]', (btn) => btn.click());
    await page.waitForFunction(
      () => {
        const menu = document.getElementById('selection-action-menu');
        const definition = document.getElementById('wp-def')?.textContent || '';
        return (!menu || menu.hidden) && definition.length > 0 && !/Looking up/i.test(definition);
      },
      { timeout: 45000 },
    );
    assert(true, 'Choosing the selection action runs the contextual lookup');
    const uiLookup = await page.evaluate(() => ({
      term: document.getElementById('wp-term')?.textContent,
      ipa: document.getElementById('wp-ipa')?.textContent,
      definition: document.getElementById('wp-def')?.textContent,
      translation: document.getElementById('wp-trans')?.textContent,
      context: document.getElementById('wp-context')?.textContent,
      saved: document.getElementById('wp-save-btn')?.getAttribute('aria-pressed'),
    }));
    assert(uiLookup.definition.length > 10, 'Multi-word selection returns a contextual definition');
    assert(hasArabic(uiLookup.translation), 'Multi-word selection returns the user-language translation');
    assert(/double down/i.test(uiLookup.context || ''), 'Lookup context is the real source sentence');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-selection-lookup.png'), fullPage: false });
    await page.click('#wp-close-btn');

    // Save + complete the first item.
    await page.click('[data-aex-save-index="0"]');
    await page.waitForFunction(
      () => document.querySelector('[data-aex-save-index="0"]')?.classList.contains('is-saved'),
      { timeout: 20000 },
    );
    assert(true, 'Saving an item updates its bookmark state immediately');
    const firstTerm = await page.$eval('[data-aex-save-index="0"]', (el) =>
      el.closest('.aex-item')?.querySelector('.aex-item-term')?.textContent || '',
    );
    const vocabulary = await api(baseUrl, '/api/vocabulary', { token });
    assert(
      vocabulary.ok && vocabulary.data.some((item) => normalize(item.term).toLowerCase() === normalize(firstTerm).toLowerCase()),
      `Saved item “${firstTerm}” appears in the Vocabulary Vault`,
    );

    await page.click('#aex-items-list [data-aex-check]');
    await page.waitForFunction(
      () => (document.querySelector('#aex-note-progress [data-sp-completed]')?.textContent || '').trim() === '1',
      { timeout: 15000 },
    );
    assert(true, 'Completing an item updates the study progress bar in place');
    const inProgressState = await page.evaluate(() => ({
      chip: document.querySelector('#aex-note-progress .sp-state')?.textContent?.trim(),
      chipTone: document.querySelector('#aex-note-progress .sp-state')?.classList.contains('sp-state--progress'),
    }));
    assert(
      inProgressState.chip === 'In progress' && inProgressState.chipTone === true,
      'Checking an item flips the study map to the In progress state',
    );
    assert(
      await page.$eval('.aex-item', (el) => el.classList.contains('is-completed')),
      'Completed item uses the reserved completion treatment',
    );

    // Copy notes.
    await page.click('#aex-copy-btn');
    await page.waitForFunction(
      () => /copied/i.test(document.getElementById('workspace-toast')?.textContent || ''),
      { timeout: 5000 },
    );
    assert(true, 'Copy study notes produces a clipboard action');

    // Hard refresh persistence.
    const noteUrl = page.url();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll('#aex-items-list .aex-item').length > 0, { timeout: 20000 });
    const reloadState = await page.evaluate(() => ({
      path: location.pathname,
      count: document.querySelectorAll('#aex-items-list .aex-item').length,
      completed: document.querySelector('#aex-note-progress [data-sp-completed]')?.textContent,
      saved: document.querySelector('[data-aex-save-index="0"]')?.classList.contains('is-saved'),
      title: document.getElementById('aex-note-title')?.textContent,
    }));
    assert(reloadState.path === new URL(noteUrl).pathname, 'Hard refresh preserves the exact note route');
    assert(reloadState.count >= 8 && reloadState.completed === '1', 'Hard refresh preserves items and completion progress');
    assert(reloadState.saved === true, 'Hard refresh preserves saved vocabulary state');
    assert(reloadState.title === 'Browser standup study map', 'Hard refresh preserves the study map title');

    // Full desktop screenshots.
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-study-map-desktop.png'), fullPage: true });

    // Library + search + deletion.
    await page.click('#aex-tab-library');
    await page.waitForFunction(
      () => {
        const grid = document.getElementById('aex-library-grid');
        return (
          location.pathname === '/extractor/library' &&
          document.getElementById('aex-view-library')?.hidden === false &&
          grid &&
          grid.getAttribute('aria-busy') !== 'true' &&
          grid.querySelectorAll('.aex-library-card-item:not(.aex-lib-skel)').length > 0
        );
      },
      { timeout: 15000 },
    );
    const libraryBefore = await page.evaluate(
      () => document.querySelectorAll('#aex-library-grid .aex-library-card-item:not(.aex-lib-skel)').length,
    );
    assert(libraryBefore >= 3, `Library renders ${libraryBefore} persisted study maps`);
    const libraryStates = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#aex-library-grid .aex-library-card-item')];
      const browser = cards.find((card) => /Browser standup/i.test(card.textContent || ''));
      return {
        withChip: cards.filter((card) => card.querySelector('.sp-state')).length,
        withTrack: cards.filter((card) => card.querySelector('.aex-card-track-fill')).length,
        states: cards.map((card) => card.dataset.state),
        browserState: browser?.dataset.state,
        browserCount: browser?.querySelector('.aex-card-progress-count')?.textContent?.trim(),
        browserAction: browser?.querySelector('.aex-lib-open-btn[data-aex-open]')?.textContent?.trim(),
      };
    });
    assert(
      libraryStates.withChip === libraryBefore && libraryStates.withTrack === libraryBefore,
      'Every library card shows a study state chip and a progress track',
    );
    assert(
      libraryStates.states.every((value) => ['new', 'progress', 'done'].includes(value)),
      'Library cards carry an explicit not-started / in-progress / completed state',
    );
    assert(libraryStates.browserState === 'progress', 'A partly studied map is flagged In progress');
    assert(
      /^1 \/ \d+$/.test(libraryStates.browserCount || '') && /Continue/i.test(libraryStates.browserAction || ''),
      'Library card reflects real completed count and offers Continue',
    );
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-library-desktop.png'), fullPage: true });

    await page.evaluate(() => {
      const search = document.getElementById('aex-library-search');
      search.value = 'Browser standup';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(
      () => {
        const grid = document.getElementById('aex-library-grid');
        if (!grid || grid.getAttribute('aria-busy') === 'true') return false;
        const cards = [...grid.querySelectorAll('.aex-library-card-item:not(.aex-lib-skel)')];
        return cards.length === 1 && /Browser standup/i.test(cards[0].textContent || '');
      },
      { timeout: 15000 },
    );
    const filteredLibrary = await page.evaluate(
      () => document.querySelectorAll('#aex-library-grid .aex-library-card-item:not(.aex-lib-skel)').length,
    );
    assert(filteredLibrary === 1, `Library search narrows ${libraryBefore} cards to ${filteredLibrary}`);
    await page.evaluate(() => {
      const search = document.getElementById('aex-library-search');
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(
      () => {
        const grid = document.getElementById('aex-library-grid');
        if (!grid || grid.getAttribute('aria-busy') === 'true') return false;
        return grid.querySelectorAll('.aex-library-card-item:not(.aex-lib-skel)').length > 1;
      },
      { timeout: 15000 },
    );

    // YouTube notes expose the core Studio integration.
    const openedYoutube = await page.evaluate(async () => {
      const cards = [...document.querySelectorAll('#aex-library-grid .aex-library-card-item:not(.aex-lib-skel)')];
      const target = cards.find((card) => Boolean(card.querySelector('.aex-source-badge.is-video')));
      if (!target) return { skipped: true };
      const targetId = target.dataset.aexLibraryId || '';
      target.querySelector('.aex-lib-open-btn[data-aex-open]')?.click();
      const startedAt = Date.now();
      while (Date.now() - startedAt < 15000) {
        const ready =
          document.getElementById('aex-view-note')?.hidden === false &&
          document.getElementById('aex-detail-ready')?.hidden === false &&
          (!targetId || location.pathname.endsWith(targetId)) &&
          document.querySelectorAll('#aex-items-list .aex-item').length > 0;
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      const button = document.getElementById('aex-studio-btn');
      return {
        skipped: false,
        sourceLabel: document.getElementById('aex-note-source-label')?.textContent,
        studioHidden: button?.hidden,
        studioTarget: button?.dataset?.aexStudio || '',
      };
    });
    assert(!openedYoutube.skipped, 'A YouTube study map is available in the library');
    assert(/youtube/i.test(openedYoutube.sourceLabel || ''), 'YouTube study map rehydrates its source label');
    assert(openedYoutube.studioHidden === false, 'YouTube notes expose the Train in Studio action');
    assert(
      /^\/studio\?(id=[^&]+|url=https%3A%2F%2F)/i.test(openedYoutube.studioTarget),
      `Studio action targets the synced lesson or saved video URL (${openedYoutube.studioTarget})`,
    );
    await page.goto(`${baseUrl}/extractor/library`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => {
        const grid = document.getElementById('aex-library-grid');
        return (
          document.getElementById('aex-view-library')?.hidden === false &&
          grid &&
          grid.getAttribute('aria-busy') !== 'true' &&
          grid.querySelectorAll('.aex-library-card-item:not(.aex-lib-skel)').length > 0
        );
      },
      { timeout: 20000 },
    );

    const deleteResult = await page.evaluate(async () => {
      const cards = [...document.querySelectorAll('#aex-library-grid .aex-library-card-item:not(.aex-lib-skel)')];
      const target = cards.find((card) => /markdown|migration/i.test(card.textContent || ''));
      if (!target) return { skipped: true };
      const title = target.querySelector('.aex-library-card-title')?.textContent;
      const before = cards.length;
      target.querySelector('[data-aex-delete]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      const confirmOpen = document.getElementById('ft-confirm-backdrop')?.hidden === false;
      document.getElementById('ft-confirm-accept-btn')?.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      const undoVisible = document.getElementById('ft-undo-toast')?.hidden === false;
      const midCount = document.querySelectorAll('#aex-library-grid .aex-library-card-item:not(.aex-lib-skel)').length;
      // Undo once to verify restore works cleanly
      document.getElementById('ft-undo-btn')?.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      const restoredCount = document.querySelectorAll('#aex-library-grid .aex-library-card-item:not(.aex-lib-skel)').length;

      // Delete again and dismiss Undo pill to commit DELETE immediately before reload
      const reTarget = [...document.querySelectorAll('#aex-library-grid .aex-library-card-item:not(.aex-lib-skel)')].find(
        (card) => card.querySelector('.aex-library-card-title')?.textContent === title,
      );
      reTarget?.querySelector('[data-aex-delete]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      document.getElementById('ft-confirm-accept-btn')?.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      document.getElementById('ft-undo-close-btn')?.click();
      await new Promise((resolve) => setTimeout(resolve, 350));
      const startedAt = Date.now();
      while (Date.now() - startedAt < 15000) {
        const grid = document.getElementById('aex-library-grid');
        if (
          grid &&
          grid.getAttribute('aria-busy') !== 'true' &&
          grid.querySelectorAll('.aex-library-card-item:not(.aex-lib-skel)').length === before - 1
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      return {
        skipped: false,
        title,
        confirmOpen,
        undoVisible,
        midCount,
        restoredCount,
        before,
        after: document.querySelectorAll('#aex-library-grid .aex-library-card-item:not(.aex-lib-skel)').length,
      };
    });
    assert(
      !deleteResult.skipped &&
        deleteResult.confirmOpen &&
        deleteResult.undoVisible &&
        deleteResult.midCount === deleteResult.before - 1 &&
        deleteResult.restoredCount === deleteResult.before,
      'Delete uses themed confirmation modal + animated timed Undo restore',
    );
    assert(
      !deleteResult.skipped && deleteResult.after === deleteResult.before - 1,
      `Confirmed delete removes the study map (${deleteResult.before} → ${deleteResult.after})`,
    );

    // Hard refresh on the library route must preserve the library view, not
    // flash back to the extractor while history loads in the background.
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => {
        const grid = document.getElementById('aex-library-grid');
        return (
          document.getElementById('aex-view-library')?.hidden === false &&
          grid &&
          grid.getAttribute('aria-busy') !== 'true' &&
          grid.querySelectorAll('.aex-library-card-item:not(.aex-lib-skel)').length > 0
        );
      },
      { timeout: 20000 },
    );
    const libraryReload = await page.evaluate(() => ({
      path: location.pathname,
      libraryHidden: document.getElementById('aex-view-library')?.hidden,
      extractHidden: document.getElementById('aex-view-extract')?.hidden,
      cards: document.querySelectorAll('#aex-library-grid .aex-library-card-item:not(.aex-lib-skel)').length,
      activeTab: document.querySelector('.aex-view-nav .lexicon-view-tab.active')?.id,
    }));
    assert(libraryReload.path === '/extractor/library', 'Hard refresh keeps the /extractor/library route');
    assert(
      libraryReload.libraryHidden === false && libraryReload.extractHidden === true,
      'Hard refresh renders the library panel, not the extractor panel',
    );
    assert(libraryReload.activeTab === 'aex-tab-library', 'Hard refresh marks the Library tab active');
    assert(libraryReload.cards >= 3, 'Hard refresh rehydrates the library cards');

    // Auto-resume incomplete multi-page Library lesson to the page of the next uncompleted item.
    const resumeTargetId = await page.evaluate((primaryNoteUrl) => {
      const primaryId = new URL(primaryNoteUrl).pathname.split('/').pop();
      const cards = [...document.querySelectorAll('#aex-library-grid .aex-library-card-item:not(.aex-lib-skel)')];
      const multiPage = cards.find((card) => {
        const id = card.dataset.aexLibraryId || '';
        const text = card.querySelector('.aex-library-card-meta')?.textContent || '';
        const count = Number(text.match(/(\d+)\s+phrases/i)?.[1] || 0);
        return id && id !== primaryId && count >= 12;
      });
      return multiPage?.dataset?.aexLibraryId || '';
    }, noteUrl);
    assert(Boolean(resumeTargetId), 'Library has a secondary multi-page study map for auto-resume verification');

    const resumeDetail = await api(baseUrl, `/api/american-extractor/notes/${resumeTargetId}`, { token });
    const resumeItemCount = Number(resumeDetail.data?.data?.itemCount || resumeDetail.data?.data?.items?.length || 0);
    assert(resumeItemCount >= 12, `Auto-resume study map has ${resumeItemCount} items`);

    for (let idx = 0; idx < 10; idx += 1) {
      const patchRes = await api(baseUrl, `/api/american-extractor/notes/${resumeTargetId}/items/${idx}`, {
        method: 'PATCH',
        token,
        body: { completed: true },
      });
      assert(patchRes.ok, `Marked item ${idx} completed for auto-resume setup`);
    }

    await page.goto(`${baseUrl}/extractor/library`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      (targetId) => {
        const grid = document.getElementById('aex-library-grid');
        return (
          document.getElementById('aex-view-library')?.hidden === false &&
          grid &&
          grid.getAttribute('aria-busy') !== 'true' &&
          Boolean(document.querySelector(`[data-aex-library-id="${CSS.escape(targetId)}"] .aex-lib-open-btn[data-aex-open]`))
        );
      },
      { timeout: 20000 },
      resumeTargetId,
    );

    await page.evaluate((targetId) => {
      document
        .querySelector(`[data-aex-library-id="${CSS.escape(targetId)}"] .aex-lib-open-btn[data-aex-open]`)
        ?.click();
    }, resumeTargetId);

    await page.waitForFunction(
      (targetId) =>
        location.pathname.endsWith(targetId) &&
        document.getElementById('aex-detail-ready')?.hidden === false &&
        document.querySelectorAll('#aex-items-list .aex-item:not(.aex-item-skel)').length > 0,
      { timeout: 20000 },
      resumeTargetId,
    );
    await new Promise((r) => setTimeout(r, 80));

    const autoResumePg2 = await page.evaluate(() => ({
      search: location.search,
      pageInfo: document.getElementById('aex-items-page-info')?.textContent?.trim() || '',
      firstIndex: document.querySelector('#aex-items-list .aex-item')?.dataset?.aexIndex,
    }));
    assert(
      autoResumePg2.search.includes('page=2') &&
        /Page 2 of/.test(autoResumePg2.pageInfo) &&
        autoResumePg2.firstIndex === '10',
      `Opening incomplete lesson auto-resumes to Page 2 showing next uncompleted item #11 (${autoResumePg2.pageInfo})`,
    );

    // Explicit ?page=1 URL parameter overrides auto-resume cleanly.
    await page.goto(`${baseUrl}/extractor/library/${resumeTargetId}?page=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForFunction(
      () => document.querySelectorAll('#aex-items-list .aex-item:not(.aex-item-skel)').length > 0,
      { timeout: 20000 },
    );
    const explicitPg1 = await page.evaluate(() => ({
      pageInfo: document.getElementById('aex-items-page-info')?.textContent?.trim() || '',
      firstIndex: document.querySelector('#aex-items-list .aex-item')?.dataset?.aexIndex,
    }));
    assert(
      /Page 1 of/.test(explicitPg1.pageInfo) && explicitPg1.firstIndex === '0',
      `Explicit ?page=1 deep link overrides auto-resume (${explicitPg1.pageInfo})`,
    );

    // Completing every remaining item causes opening from Library to start on Page 1.
    for (let idx = 10; idx < resumeItemCount; idx += 1) {
      const patchRes = await api(baseUrl, `/api/american-extractor/notes/${resumeTargetId}/items/${idx}`, {
        method: 'PATCH',
        token,
        body: { completed: true },
      });
      assert(patchRes.ok, `Marked remaining item ${idx} completed`);
    }

    await page.goto(`${baseUrl}/extractor/library`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      (targetId) => {
        const grid = document.getElementById('aex-library-grid');
        return (
          document.getElementById('aex-view-library')?.hidden === false &&
          grid &&
          grid.getAttribute('aria-busy') !== 'true' &&
          Boolean(document.querySelector(`[data-aex-library-id="${CSS.escape(targetId)}"] .aex-lib-open-btn[data-aex-open]`))
        );
      },
      { timeout: 20000 },
      resumeTargetId,
    );

    await page.evaluate((targetId) => {
      document
        .querySelector(`[data-aex-library-id="${CSS.escape(targetId)}"] .aex-lib-open-btn[data-aex-open]`)
        ?.click();
    }, resumeTargetId);

    await page.waitForFunction(
      (targetId) =>
        location.pathname.endsWith(targetId) &&
        document.getElementById('aex-detail-ready')?.hidden === false &&
        document.querySelectorAll('#aex-items-list .aex-item:not(.aex-item-skel)').length > 0,
      { timeout: 20000 },
      resumeTargetId,
    );
    await new Promise((r) => setTimeout(r, 80));

    const completedOpen = await page.evaluate(() => ({
      search: location.search,
      pageInfo: document.getElementById('aex-items-page-info')?.textContent?.trim() || '',
      firstIndex: document.querySelector('#aex-items-list .aex-item')?.dataset?.aexIndex,
    }));
    assert(
      !completedOpen.search.includes('page=2') &&
        /Page 1 of/.test(completedOpen.pageInfo) &&
        completedOpen.firstIndex === '0',
      `Opening a 100% completed lesson opens on Page 1 (${completedOpen.pageInfo})`,
    );

    // Mobile layout + no horizontal overflow.
    const notePath = new URL(noteUrl).pathname;
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(`${baseUrl}${notePath}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll('#aex-items-list .aex-item').length > 0, { timeout: 20000 });
    const mobile = await page.evaluate(() => {
      const root = document.documentElement;
      const card = document.querySelector('#aex-items-list .aex-item');
      document.getElementById('aex-source-toggle')?.click();
      const sourcePanel = document.getElementById('aex-source-panel');
      const source = sourcePanel?.getBoundingClientRect();
      const items = document.querySelector('.aex-items-root, .aex-items-column')?.getBoundingClientRect();
      return {
        innerWidth: window.innerWidth,
        scrollWidth: root.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        cardWidth: card?.getBoundingClientRect().width,
        navVisible: getComputedStyle(document.getElementById('aex-view-note')).display !== 'none',
        sourceOpen: sourcePanel ? !sourcePanel.hidden : false,
        sourceFirst: source && items ? source.top < items.top : null,
      };
    });
    assert(mobile.scrollWidth <= mobile.innerWidth + 2, `Mobile has no horizontal overflow (${mobile.scrollWidth}px / ${mobile.innerWidth}px)`);
    assert(mobile.cardWidth > 200 && mobile.cardWidth < mobile.innerWidth, 'Mobile item cards fit the viewport');
    assert(mobile.sourceOpen === true, 'The source icon reveals the selectable source');
    assert(mobile.sourceFirst === true, 'Mobile places the selectable source above the study items');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-study-map-mobile.png'), fullPage: true });

    // Dark mode.
    await page.evaluate(() => localStorage.setItem('flaptap_theme', 'dark'));
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll('#aex-items-list .aex-item').length > 0, { timeout: 20000 });
    const dark = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      cardBg: getComputedStyle(document.querySelector('.aex-item')).backgroundColor,
      text: getComputedStyle(document.querySelector('.aex-item-term')).color,
    }));
    assert(dark.theme === 'dark', 'Dark mode applies to the study map');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-study-map-dark.png'), fullPage: true });
    await page.evaluate(() => localStorage.setItem('flaptap_theme', 'light'));

    // Back to desktop extract view for the final overview screenshot.
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}/extractor`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForAiSelector(page);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-extractor-final.png'), fullPage: true });

    // Console + request cleanliness.
    assert(browserState.pageErrors.length === 0, `No uncaught page errors (${browserState.pageErrors.join(' | ') || 'none'})`);
    const relevantConsoleErrors = browserState.consoleErrors.filter(
      (message) => !/favicon|manifest|Download the React DevTools/i.test(message),
    );
    assert(
      relevantConsoleErrors.length === 0,
      `No browser console errors (${relevantConsoleErrors.slice(0, 3).join(' | ') || 'none'})`,
    );
    assert(
      browserState.requestFailures.length === 0,
      `No failed browser requests (${browserState.requestFailures.slice(0, 3).join(' | ') || 'none'})`,
    );

    /* ------------------------------------------------------------------ */
    /* 11. Cleanup + summary                                              */
    /* ------------------------------------------------------------------ */
    console.log('\n--- Cleanup ---');
    for (const id of created) {
      await api(baseUrl, `/api/american-extractor/notes/${id}`, { token, method: 'DELETE' }).catch(() => {});
    }
    await api(baseUrl, '/api/auth/account', { token, method: 'DELETE' }).catch(() => {});
    await api(baseUrl, '/api/auth/account', { token: secondToken, method: 'DELETE' }).catch(() => {});

    console.log('\n==================================================');
    console.log(`🎉 ALL AMERICAN EXTRACTOR TESTS PASSED (${passed} assertions)`);
    if (skipped.length > 0) {
      console.log(`⚠️  ${skipped.length} skipped: ${skipped.join(' | ')}`);
    }
    console.log(`📷 Screenshots: ${SCREENSHOT_DIR}`);
    console.log('==================================================\n');
  } catch (error) {
    failures++;
    console.error(`\n❌ FAILED: ${error?.stack || error?.message || error}`);
  } finally {
    try {
      if (browser) await browser.close();
    } catch {}
    try {
      server.kill('SIGTERM');
    } catch {}
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        if (fs.existsSync(`${dbPath}${suffix}`)) fs.unlinkSync(`${dbPath}${suffix}`);
      } catch {}
    }
  }

  if (failures > 0) {
    console.error(`💥 ${failures} test group failed`);
    process.exit(1);
  }
  process.exit(0);
}

run();
