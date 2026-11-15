/**
 * Comprehensive End-to-End Test for FlapTap's Tech Lexicon Studio
 * Tests:
 * 1. Backend API endpoints (agent discovery, extraction, shared contextual word lookup, history)
 * 2. SQLite relational persistence (Zero external Obsidian files)
 * 3. Local machine agent drivers (Antigravity strict, OpenCode Go)
 * 4. Headless browser (Puppeteer) decoupled 3-spinner routing, interactive tables,
 *    segmented transcript, and shared click-any-word contextual translation popover
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const BASE_URL = 'http://localhost:3333';
const TEST_VIDEO_URL = 'https://www.youtube.com/watch?v=C89c0fsHYIQ';

async function runTests() {
  console.log('🚀 Starting Native Tech Linguist E2E Test Suite...\n');
  let failures = 0;

  function assert(condition, message) {
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      failures++;
    } else {
      console.log(`✅ PASSED: ${message}`);
    }
  }

  // TEST 1: Unified Direct AI Key & Live Models Discovery API
  console.log('--- TEST 1: Unified AI Provider & Live Models API ---');
  try {
    const res = await fetch(`${BASE_URL}/api/ai-providers/keys`);
    assert(res.ok, `GET /api/ai-providers/keys returned status ${res.status}`);
    const json = await res.json();
    assert(Array.isArray(json.keys) && json.keys.length >= 1, `Discovered ${json.keys.length} active API key(s)`);
    const goKey = json.keys.find((k) => k.providerId === 'opencode-go') || json.keys[0];
    const modelsRes = await fetch(`${BASE_URL}/api/ai-providers/keys/${encodeURIComponent(goKey.id)}/models`);
    assert(modelsRes.ok, `GET live models for ${goKey.providerName} returned ${modelsRes.status}`);
    const modelsJson = await modelsRes.json();
    assert(Array.isArray(modelsJson.models) && modelsJson.models.length >= 1, `Loaded ${modelsJson.models.length} live models`);
  } catch (e) {
    assert(false, `Provider discovery failed: ${e.message}`);
  }

  // TEST 2A: Direct API Text Extraction (Comprehensive Mode)
  console.log('\n--- TEST 2A: Direct API Text Extraction ---');
  let quickExtractionId = null;
  try {
    const res = await fetch(`${BASE_URL}/api/tech-linguist/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcriptText:
          'We need to unblock our CI/CD pipeline before shipping to production. Yesterday we ran into a nasty latency regression when autoscaling Kubernetes pods, so let us hop on a quick huddle and triage the bottleneck right out of the gate.',
        keyId: 'env:OPENCODE_GO_API_KEY',
        model: 'gpt-5.6-luna',
        variant: 'none',
      }),
    });

    assert(res.ok, `POST /api/tech-linguist/extract (Direct API) returned status ${res.status}`);
    const json = await res.json();
    assert(json.success === true, 'Direct extraction returned success=true');
    const data = json.data;
    quickExtractionId = data.id;
    assert(data.vocabItems && data.vocabItems.length >= 1, `Vocab items count: ${data.vocabItems.length}`);
    assert(data.idiomItems && data.idiomItems.length >= 1, `Idiom items count: ${data.idiomItems.length}`);
    assert(!('obsidianMarkdown' in data) && !('vaultSavedPath' in data), 'Obsidian fields completely removed from payload');
    if (quickExtractionId) {
      await fetch(`${BASE_URL}/api/tech-linguist/extractions/${quickExtractionId}`, { method: 'DELETE' });
    }
  } catch (e) {
    assert(false, `Direct API text extraction failed: ${e.message}`);
  }

  // TEST 2B: Pipeline Extraction API (YouTube URL via Direct OpenCode Go)
  console.log('\n--- TEST 2B: Pipeline Extraction API (YouTube + Direct API) ---');
  let lastExtractionId = null;
  try {
    const res = await fetch(`${BASE_URL}/api/tech-linguist/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: TEST_VIDEO_URL,
        keyId: 'env:OPENCODE_GO_API_KEY',
        model: 'gpt-5.6-luna',
        variant: 'none',
      }),
    });

    assert(res.ok, `POST /api/tech-linguist/extract returned status ${res.status}`);
    const json = await res.json();
    assert(json.success === true, 'Extraction returned success=true');
    const data = json.data;
    assert(Boolean(data.id), `Generated extraction ID: ${data.id}`);
    lastExtractionId = data.id;

    assert(data.title.includes('Tech Workers') || data.title.includes('NYC'), `Title captured: "${data.title}"`);
    assert(data.vocabItems && data.vocabItems.length >= 1, `Vocab items count: ${data.vocabItems.length}`);
    assert(data.idiomItems && data.idiomItems.length >= 1, `Idiom items count: ${data.idiomItems.length}`);
    assert(
      Boolean(data.vocabItems[0]?.generalArabic && data.vocabItems[0]?.meaningArabic),
      `First vocab includes dual translations (general="${data.vocabItems[0]?.generalArabic}" | context="${data.vocabItems[0]?.meaningArabic}")`,
    );
    assert(
      Boolean(data.idiomItems[0]?.generalArabic && data.idiomItems[0]?.meaningArabic),
      `First idiom includes dual translations (general="${data.idiomItems[0]?.generalArabic}" | context="${data.idiomItems[0]?.meaningArabic}")`,
    );
    assert(Boolean(data.fullTranscript && data.fullTranscript.length > 50), 'Full audited transcript persisted');
    assert(!('obsidianMarkdown' in data) && !('vaultSavedPath' in data), 'Web-native payload contains zero Obsidian fields');
  } catch (e) {
    assert(false, `Extraction pipeline test failed: ${e.message}`);
  }

  // TEST 3: Shared Click-Word Lookup & History API
  console.log('\n--- TEST 3: Shared Word Lookup & History API ---');
  try {
    const lookupRes = await fetch(`${BASE_URL}/api/tech-linguist/define-word`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        extractionId: lastExtractionId,
        word: 'talent',
        contextSentence: "New York's pool of tech talent grew exponentially between 2022 and 2025.",
        language: 'ar',
      }),
    });
    assert(lookupRes.ok, `POST /api/tech-linguist/define-word returned status ${lookupRes.status}`);
    const lookupJson = await lookupRes.json();
    assert(
      Boolean(lookupJson.definition && lookupJson.generalTranslation && lookupJson.translation),
      `Shared lookup returned IPA="${lookupJson.ipa}", general="${lookupJson.generalTranslation}", context="${lookupJson.translation}"`,
    );

    const histRes = await fetch(`${BASE_URL}/api/tech-linguist/history`);
    assert(histRes.ok, `GET /api/tech-linguist/history returned status ${histRes.status}`);
    const histJson = await histRes.json();
    assert(histJson.items && histJson.items.length >= 1, `History returns ${histJson.items.length} records`);

    if (lastExtractionId) {
      const singleRes = await fetch(`${BASE_URL}/api/tech-linguist/extractions/${lastExtractionId}`);
      assert(singleRes.ok, `GET /api/tech-linguist/extractions/:id returned status ${singleRes.status}`);
      const singleJson = await singleRes.json();
      assert(singleJson.data && singleJson.data.id === lastExtractionId, 'Single extraction retrieved accurately with all items');
      assert(singleJson.data.extractionMode === 'comprehensive', 'Mode 1 extraction defaults to comprehensive');
    }
  } catch (e) {
    assert(false, `Word lookup & history test failed: ${e.message}`);
  }

  // TEST 3B: Mode 2 (Native Elite Strict 2-Tab) API, Quality & Persistence
  console.log('\n--- TEST 3B: Mode 2 (Native Elite Strict 2-Tab) API & Quality ---');
  let eliteExtractionId = null;
  try {
    const modesRes = await fetch(`${BASE_URL}/api/tech-linguist/modes`);
    assert(modesRes.ok, `GET /api/tech-linguist/modes returned status ${modesRes.status}`);
    const modesJson = await modesRes.json();
    assert(
      Array.isArray(modesJson.modes) &&
        modesJson.modes.some((m) => m.id === 'comprehensive') &&
        modesJson.modes.some((m) => m.id === 'advanced_native'),
      'Modes endpoint exposes both comprehensive and advanced_native modes',
    );

    const mixedTranscript = [
      'Hey guys, quick update: I bought a house and started working on a project for my fashion video, and I apologize for not sharing my life sooner after school.',
      'Honestly NGL, low-key I was completely cooked last week because our marketing team kept cutting corners on our attribution model while burning cash at a brutal burn rate.',
      'Instead of trying to obfuscate the regression, our CTO decided to double down on idempotent retries and corroborate telemetry before things jeopardize uptime.',
      'TL;DR: whether you are chasing hypertrophy with progressive overload in fitness or scaling AI inference, quit being complacent — winging it will get you cooked, no cap.',
    ].join(' ');

    const eliteRes = await fetch(`${BASE_URL}/api/tech-linguist/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcriptText: mixedTranscript,
        mode: 'advanced_native',
        keyId: 'env:OPENCODE_GO_API_KEY',
        model: 'gpt-5.6-luna',
        variant: 'none',
      }),
    });
    assert(eliteRes.ok, `POST /api/tech-linguist/extract (advanced_native) returned status ${eliteRes.status}`);
    const eliteJson = await eliteRes.json();
    const elite = eliteJson.data;
    eliteExtractionId = elite?.id;

    assert(elite && elite.extractionMode === 'advanced_native', `Mode 2 saved as extractionMode="${elite?.extractionMode}"`);
    assert(Array.isArray(elite.thoughtPatterns) && elite.thoughtPatterns.length === 0, 'Mode 2 omits thoughtPatterns (strict 2-list contract)');
    assert(Array.isArray(elite.vocabItems) && elite.vocabItems.length >= 2, `Mode 2 extracted ${elite.vocabItems?.length} hard/advanced words & verbs`);
    assert(Array.isArray(elite.idiomItems) && elite.idiomItems.length >= 3, `Mode 2 extracted ${elite.idiomItems?.length} idioms, abbreviations & street slang`);

    const multiWordInVocab = (elite.vocabItems || []).filter((v) => /\s/.test(v.term));
    assert(multiWordInVocab.length === 0, `Mode 2 Tab 1 contains ZERO multi-word phrases (${JSON.stringify(multiWordInVocab.map((v) => v.term))})`);

    const forbiddenBasicWords = new Set(['house', 'video', 'fashion', 'apologize', 'school', 'academic', 'project', 'share', 'update', 'bought a house', 'make a video', 'working on a project']);
    const leakedBasic = [
      ...(elite.vocabItems || []).map((v) => v.term.toLowerCase()),
      ...(elite.idiomItems || []).map((i) => i.phrase.toLowerCase()),
    ].filter((t) => forbiddenBasicWords.has(t));
    assert(leakedBasic.length === 0, `Mode 2 filtered out elementary filler (${JSON.stringify(leakedBasic)})`);

    // Verify strict zero overlap between Tab 1 words and Tab 2 idiom tokens
    const idiomTokenSet = new Set(
      (elite.idiomItems || [])
        .flatMap((i) => i.phrase.toLowerCase().match(/[a-z0-9']+/g) || [])
        .filter((tok) => tok.length >= 3 && !['the', 'and', 'for', 'with', 'out', 'off', 'not'].includes(tok)),
    );
    const overlappingTerms = (elite.vocabItems || []).filter((v) => {
      const t = v.term.toLowerCase();
      return (elite.idiomItems || []).some((i) => i.phrase.toLowerCase() === t) || idiomTokenSet.has(t);
    });
    assert(overlappingTerms.length === 0, `Zero cross-tab overlap between Words/Verbs and Idioms/Slang (${JSON.stringify(overlappingTerms.map((v) => v.term))})`);

    assert(
      Boolean(elite.vocabItems[0]?.generalArabic && elite.vocabItems[0]?.meaningArabic),
      `Mode 2 Tab 1 preserves dual Arabic ("${elite.vocabItems[0]?.generalArabic}" | "${elite.vocabItems[0]?.meaningArabic}")`,
    );
    assert(
      Boolean(elite.idiomItems[0]?.generalArabic && elite.idiomItems[0]?.meaningArabic),
      `Mode 2 Tab 2 preserves dual Arabic ("${elite.idiomItems[0]?.generalArabic}" | "${elite.idiomItems[0]?.meaningArabic}")`,
    );

    if (eliteExtractionId) {
      const getEliteRes = await fetch(`${BASE_URL}/api/tech-linguist/extractions/${eliteExtractionId}`);
      const getEliteJson = await getEliteRes.json();
      assert(getEliteJson.data?.extractionMode === 'advanced_native', 'SQLite persistence restores extractionMode=advanced_native');
    }
  } catch (e) {
    assert(false, `Mode 2 API/Quality test failed: ${e.message}`);
  }

  // TEST 4: Browser UI / UX via Puppeteer
  console.log('\n--- TEST 4: Browser UI/UX via Puppeteer ---');
  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', (err) => console.error('BROWSER ERROR:', err.message));

    // 4.1 Direct Navigation to Dedicated /lexicon Route
    await page.goto(`${BASE_URL}/lexicon`, { waitUntil: 'networkidle2', timeout: 15000 });
    const isSectionVisible = await page.$eval('#section-tech-linguist', (el) => !el.hidden);
    assert(isSectionVisible, 'Tech Lexicon section is visible on direct /lexicon navigation');

    const activeSidebarLink = await page.$eval('.sidebar-nav-link.active', (el) => el.dataset.routeSection);
    assert(activeSidebarLink === 'tech-linguist', 'Tech Lexicon left sidebar nav link has .active class');

    // 4.2 Unified Reusable Dynamic AI Selector checks (no duplicate agent-routing mount!)
    const noLegacyMount = (await page.$('#linguist-agent-routing-mount')) === null;
    assert(noLegacyMount, 'Removed legacy #linguist-agent-routing-mount duplicate');

    await page.waitForFunction(
      () => {
        const k = document.getElementById('linguist-aisel-key-select');
        const m = document.getElementById('linguist-aisel-model-select');
        const v = document.getElementById('linguist-aisel-variant-select');
        return k && k.options.length >= 1 && m && m.options.length >= 5 && v && v.options.length >= 1 && !m.disabled;
      },
      { timeout: 15000 },
    );

    const modelCount = await page.$$eval('#linguist-aisel-model-select option', (opts) => opts.length);
    assert(modelCount >= 5, `Unified FlaptapAiSelector populated ${modelCount} live models`);

    const sumMode = await page.$eval('#linguist-aisel-sum-mode', (el) => el.textContent.trim());
    assert(sumMode.includes('Full Studio'), `Selector summary displays extraction mode: "${sumMode}"`);

    // 4.3 Demo Chip Click & Pre-population
    await page.click('#demo-chip-nyc-tech');
    const urlValue = await page.$eval('#linguist-url-input', (el) => el.value);
    assert(urlValue === TEST_VIDEO_URL, `Demo chip successfully populated URL: ${urlValue}`);

    // 4.4 Trigger Execution and Observe Progress + Results + Subroute URL Persistence
    console.log('Triggering extraction from browser...');
    await page.click('#linguist-aisel-run-btn');

    // Wait for results card to become visible
    await page.waitForFunction(
      () => {
        const card = document.getElementById('linguist-results-card');
        return card && !card.hidden;
      },
      { timeout: 90000 },
    );

    const resTitle = await page.$eval('#res-title', (el) => el.textContent);
    assert(resTitle.length > 5, `Results card rendered title: "${resTitle}"`);

    const vocabRowsCount = await page.$$eval('#res-vocab-tbody tr', (rows) => rows.length);
    assert(vocabRowsCount >= 1, `Rendered ${vocabRowsCount} vocabulary rows in 3-column table`);

    const dualCellAudit = await page.evaluate(() => {
      const cell = document.querySelector('#res-vocab-tbody tr td .arabic-val');
      const gen = cell?.querySelector('.arabic-general-text');
      const ctx = cell?.querySelector('.arabic-bold');
      return {
        genText: gen?.textContent?.trim() || '',
        ctxText: ctx?.textContent?.trim() || '',
        orderOk: Boolean(gen && ctx && gen.getBoundingClientRect().top < ctx.getBoundingClientRect().top),
      };
    });
    assert(
      Boolean(dualCellAudit.genText && dualCellAudit.ctxText && dualCellAudit.orderOk),
      `First row renders General ("${dualCellAudit.genText}") ABOVE Contextual ("${dualCellAudit.ctxText}")`,
    );

    // 4.6 Interactive Tabs, Clickable Words & Shared Popover Test
    const hasObsidianText = await page.evaluate(() =>
      /obsidian/i.test(document.getElementById('section-tech-linguist')?.innerText || ''),
    );
    assert(!hasObsidianText, 'Zero mentions of Obsidian anywhere in rendered Tech Lexicon UI');

    const clickableWordsCount = await page.$$eval('#res-vocab-tbody .clickable-word', (els) => els.length);
    assert(clickableWordsCount >= 10, `Rendered ${clickableWordsCount} clickable English words in Tech Vocab`);

    // Click first clickable word in Vocab table to trigger shared Word Lookup Popover
    await page.click('#res-vocab-tbody .clickable-word');
    await page.waitForFunction(
      () => {
        const pop = document.getElementById('word-lookup-popover');
        const trans = document.getElementById('wp-trans')?.textContent?.trim();
        return pop && !pop.hidden && Boolean(trans && trans.length > 0);
      },
      { timeout: 35000 },
    );
    const lookupDetails = await page.evaluate(() => {
      const genEl = document.getElementById('wp-general-trans');
      const ctxEl = document.getElementById('wp-trans');
      const genRect = genEl?.getBoundingClientRect();
      const ctxRect = ctxEl?.getBoundingClientRect();
      return {
        term: document.getElementById('wp-term')?.textContent,
        ipa: document.getElementById('wp-ipa')?.textContent,
        generalTrans: genEl?.textContent?.trim() || '',
        trans: ctxEl?.textContent?.trim() || '',
        def: document.getElementById('wp-def')?.textContent,
        orderOk: Boolean(genRect && ctxRect && genRect.top < ctxRect.top),
      };
    });
    assert(
      Boolean(lookupDetails.def && lookupDetails.generalTrans && lookupDetails.trans && lookupDetails.orderOk),
      `Shared popover shows General ("${lookupDetails.generalTrans}") ABOVE Contextual ("${lookupDetails.trans}") for "${lookupDetails.term}" (${lookupDetails.ipa})`,
    );

    // Screenshot with Shared Contextual Word Popover open!
    await page.screenshot({ path: '/tmp/tech_lexicon_popover_screenshot.png', fullPage: false });

    // Close popover via Close button
    await page.click('#wp-close-btn');
    const isPopClosed = await page.$eval('#word-lookup-popover', (el) => el.hidden);
    assert(isPopClosed, 'Shared Word Lookup Popover closes cleanly');

    await page.click('.res-tab-btn[data-tab="idioms"]');
    const isIdiomsVisible = await page.$eval('#res-panel-idioms', (el) => !el.hidden);
    assert(isIdiomsVisible, 'Idioms tab panel is visible after click');

    const idiomDualAudit = await page.evaluate(() => {
      const cell = document.querySelector('#res-idioms-tbody tr td .arabic-val');
      const gen = cell?.querySelector('.arabic-general-text');
      const ctx = cell?.querySelector('.arabic-bold');
      return {
        genText: gen?.textContent?.trim() || '',
        ctxText: ctx?.textContent?.trim() || '',
        orderOk: Boolean(gen && ctx && gen.getBoundingClientRect().top < ctx.getBoundingClientRect().top),
      };
    });
    assert(
      Boolean(idiomDualAudit.genText && idiomDualAudit.ctxText && idiomDualAudit.orderOk),
      `First idiom row renders General ("${idiomDualAudit.genText}") ABOVE Contextual ("${idiomDualAudit.ctxText}")`,
    );

    await page.click('.res-tab-btn[data-tab="transcript"]');
    const transcriptCardsCount = await page.$$eval('#res-full-transcript .lex-sent-card', (els) => els.length);
    assert(transcriptCardsCount >= 1, `Interactive Transcript segmented into ${transcriptCardsCount} clickable sentence cards`);

    // Full Screenshot (Mode 1)
    const screenshotPath = '/tmp/tech_linguist_e2e_screenshot.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Saved full verification screenshot to: ${screenshotPath}`);

    // 4.7 Mode 2 (Native Elite Strict 2-Tab) Browser Flow
    console.log('Testing Mode 2 (Native Elite) in browser...');
    await page.click('#view-tab-extract');
    await page.click('#mode-card-advanced-native');

    const mode2Check = await page.evaluate(() => ({
      sumMode: document.getElementById('linguist-aisel-sum-mode')?.textContent?.trim(),
      runLabel: document.getElementById('linguist-aisel-run-label')?.textContent?.trim(),
      cardActive: document.getElementById('mode-card-advanced-native')?.classList.contains('active'),
    }));
    assert(
      mode2Check.cardActive && mode2Check.sumMode === 'Native Elite (2-Tab)' && mode2Check.runLabel === 'Extract Native Elite',
      `Mode 2 card updated Selector summary & button cleanly (${JSON.stringify(mode2Check)})`,
    );

    await page.screenshot({ path: '/tmp/tech_lexicon_extractor_modes_screenshot.png', fullPage: false });

    await page.click('#tab-src-text');
    await page.evaluate(() => {
      const ta = document.getElementById('linguist-raw-text-input');
      ta.value =
        'NGL, low-key our marketing team was cooked after cutting corners on attribution while burning cash at an insane burn rate. Our CTO had to double down on idempotent retries and corroborate telemetry instead of obfuscating latency regressions. TL;DR: whether you chase hypertrophy via progressive overload or scale AI inference, quit being complacent, no cap.';
    });
    await page.click('#linguist-aisel-run-btn');

    await page.waitForFunction(
      () => {
        const card = document.getElementById('linguist-results-card');
        return card && !card.hidden && card.dataset.extractionMode === 'advanced_native';
      },
      { timeout: 90000 },
    );

    const twoTabCheck = await page.evaluate(() => {
      const visibleTabs = Array.from(document.querySelectorAll('.res-tab-btn[data-tab]'))
        .filter((el) => !el.hidden && getComputedStyle(el).display !== 'none')
        .map((el) => el.dataset.tab);
      const patternsHidden = document.getElementById('res-panel-patterns')?.hidden;
      const transcriptHidden = document.getElementById('res-panel-transcript')?.hidden;
      const modeBadge = document.getElementById('res-mode-badge')?.textContent?.trim();
      const vocabLabel = document.getElementById('res-vocab-label')?.textContent?.trim();
      const idiomsLabel = document.getElementById('res-idioms-label')?.textContent?.trim();
      return { visibleTabs, patternsHidden, transcriptHidden, modeBadge, vocabLabel, idiomsLabel };
    });
    assert(
      JSON.stringify(twoTabCheck.visibleTabs) === JSON.stringify(['vocab', 'idioms']) &&
        twoTabCheck.patternsHidden === true &&
        twoTabCheck.transcriptHidden === true &&
        twoTabCheck.vocabLabel === 'Words & Verbs' &&
        twoTabCheck.idiomsLabel === 'Idioms, Expressions & Slang',
      `Mode 2 renders STRICTLY 2 tabs and hides Patterns/Transcript (${JSON.stringify(twoTabCheck)})`,
    );

    await page.screenshot({ path: '/tmp/tech_lexicon_native_elite_tab1_screenshot.png', fullPage: true });

    await page.click('.res-tab-btn[data-tab="idioms"]');
    const idiomRowsMode2 = await page.$$eval('#res-idioms-tbody tr', (rows) => rows.length);
    assert(idiomRowsMode2 >= 2, `Mode 2 Idioms tab rendered ${idiomRowsMode2} high-signal expressions/slang`);
    const usageNotesAreEnglish = await page.evaluate(() => {
      const notes = Array.from(document.querySelectorAll('#res-idioms-tbody .term-ctx'))
        .map((el) => el.textContent || '')
        .filter((t) => t.startsWith('Note:'));
      return notes.every((t) => !/[\u0600-\u06FF]/.test(t));
    });
    assert(usageNotesAreEnglish, 'Mode 2 usageNote tips are cleanly in English (not duplicated Arabic)');

    await page.screenshot({ path: '/tmp/tech_lexicon_native_elite_screenshot.png', fullPage: true });
    console.log('Saved Mode 2 verification screenshot to: /tmp/tech_lexicon_native_elite_screenshot.png');

    // 4.8 Subroute persistence: Verify URL became `/lexicon/note/:id`, reload page -> stays on exact note!
    const notePathname = new URL(page.url()).pathname;
    assert(notePathname.startsWith('/lexicon/note/'), `Active study note updated URL to ${notePathname}`);
    await page.reload({ waitUntil: 'networkidle2', timeout: 20000 });
    await page.waitForFunction(
      () =>
        window.location.pathname.startsWith('/lexicon/note/') &&
        !document.getElementById('linguist-results-card')?.hidden &&
        document.getElementById('linguist-results-card')?.dataset.extractionMode === 'advanced_native',
      { timeout: 15000 },
    );
    assert(true, 'Hard page.reload() on /lexicon/note/:id preserves exact active study note');

    // Switching back to Study Library (`/lexicon/library`), reload & open Mode 1 note -> restores all 4 tabs
    await page.click('#view-tab-library');
    await page.waitForFunction(() => window.location.pathname === '/lexicon/library', { timeout: 5000 });
    await page.reload({ waitUntil: 'networkidle2', timeout: 20000 });
    await page.waitForSelector('.library-note-card', { timeout: 10000 });
    const libReloadedOk = await page.$eval('#lexicon-view-library', (el) => !el.hidden);
    assert(libReloadedOk && new URL(page.url()).pathname === '/lexicon/library', 'Hard reload on /lexicon/library preserves Study Library view');
    const libAudit = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.library-note-card'));
      const eliteCard = cards.find((c) => Boolean(c.querySelector('.card-badge.elite')));
      const mode1Card = cards.find((c) => !c.querySelector('.card-badge.elite'));
      const browserEliteId = eliteCard ? eliteCard.dataset.id : null;
      if (mode1Card) {
        mode1Card.querySelector('[data-action="open"]').click();
      }
      return { openedMode1: Boolean(mode1Card), browserEliteId, hasEliteBadge: Boolean(eliteCard) };
    });
    assert(libAudit.hasEliteBadge, 'Study Library renders Native Elite 2-Tab badge on Mode 2 card');
    if (libAudit.openedMode1) {
      await page.waitForFunction(
        () => document.getElementById('linguist-results-card')?.dataset.extractionMode === 'comprehensive',
        { timeout: 10000 },
      );
      const restoredTabs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.res-tab-btn[data-tab]'))
          .filter((el) => !el.hidden && getComputedStyle(el).display !== 'none')
          .map((el) => el.dataset.tab),
      );
      assert(
        JSON.stringify(restoredTabs) === JSON.stringify(['vocab', 'idioms', 'patterns', 'transcript']),
        `Opening Mode 1 note from Library restores all 4 tabs (${JSON.stringify(restoredTabs)})`,
      );

      // Test Tech Lexicon vocab row check button + instant Total/Completed/Remaining progress bar
      await page.click('#res-vocab-tbody [data-lex-check-subject="vocab"]');
      const lexVocabBar = await page.evaluate(() => ({
        total: document.querySelector('#lex-vocab-progress-bar [data-sp-total]')?.textContent?.trim(),
        completed: document.querySelector('#lex-vocab-progress-bar [data-sp-completed]')?.textContent?.trim(),
        remaining: document.querySelector('#lex-vocab-progress-bar [data-sp-remaining]')?.textContent?.trim(),
      }));
      assert(
        Number(lexVocabBar.total) >= 1 && lexVocabBar.completed === '1',
        `Tech Lexicon vocab check updates #lex-vocab-progress-bar instantaneously (${JSON.stringify(lexVocabBar)})`,
      );
    }

    // Cleanup temporary test extractions
    if (eliteExtractionId) {
      await fetch(`${BASE_URL}/api/tech-linguist/extractions/${eliteExtractionId}`, { method: 'DELETE' });
    }
    if (libAudit.browserEliteId && libAudit.browserEliteId !== eliteExtractionId) {
      await fetch(`${BASE_URL}/api/tech-linguist/extractions/${libAudit.browserEliteId}`, { method: 'DELETE' });
    }
    if (lastExtractionId) {
      await fetch(`${BASE_URL}/api/tech-linguist/extractions/${lastExtractionId}`, { method: 'DELETE' });
    }

    await browser.close();
  } catch (e) {
    assert(false, `Browser Puppeteer test failed: ${e.message}`);
  }

  console.log('\n==================================================');
  if (failures === 0) {
    console.log('🎉 ALL TESTS PASSED (100% GREEN, ZERO FAILURES)');
    console.log('==================================================\n');
    process.exit(0);
  } else {
    console.error(`💥 ${failures} TEST(S) FAILED`);
    console.log('==================================================\n');
    process.exit(1);
  }
}

runTests();
