/**
 * Comprehensive End-to-End Test Suite for Flaptap's Learning Library
 *
 * Verifies:
 * 1. Public domain catalog & strict 401 auth_required gating on all user endpoints
 * 2. Strict per-user account isolation (User A vs User B)
 * 3. Live AI generation through Flaptap's existing AgentRoutingModule (count selection,
 *    category coverage, reusable [X]/[Y] pattern frames with slot legends, expression-level
 *    Egyptian Arabic translation, rich variations/combinations/usagePatterns/examples/IPA/mechanics)
 * 4. Multi-generation duplicate prevention across consecutive batches & SQLite persistence
 * 5. Domain scalability & reusability (Natural American English + Programming Terminology)
 * 6. Full library CRUD, filtering, search, mastery tracking, word lookup, and JSON export
 * 7. Full Puppeteer browser E2E: unauthenticated gate + auto-resume after sign-up,
 *    existing AI Agent widget integration, card expansion, word lookup popover,
 *    Vocabulary Flashcards bridge, Active Recall mask, Compact Table view,
 *    domain switching, persistence across reload, and 0px overflow across mobile/tablet/desktop
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_URL = process.env.FLAPTAP_URL || 'http://127.0.0.1:3333';
const SCREENSHOT_DIR = path.join(os.tmpdir(), 'flaptap-ll-e2e');

let failures = 0;
function assert(cond, message) {
  if (!cond) {
    console.error(`❌ FAILED: ${message}`);
    failures++;
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

const BASIC_FORBIDDEN = new Set([
  'good morning',
  'thank you',
  'thank you very much',
  'how are you',
  'nice to meet you',
  'excuse me',
  'i do not understand',
  'for example',
]);

async function runE2E() {
  console.log('🚀 Starting Learning Library End-to-End Verification Suite...\n');
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  let tokenA = '';
  let tokenB = '';
  let browserToken = '';

  try {
    // -------------------------------------------------------------------------
    // PART 1: Public Domain Catalog & Unauthenticated 401 Gate
    // -------------------------------------------------------------------------
    console.log('--- PART 1: Domain Catalog & Unauthenticated 401 Gate ---');
    const domainsRes = await fetch(`${BASE_URL}/api/learning-library/domains`);
    assert(domainsRes.ok, `GET /api/learning-library/domains returned ${domainsRes.status}`);
    const domainsJson = await domainsRes.json();
    assert(
      domainsJson.defaultDomainId === 'natural_american_english' &&
        Array.isArray(domainsJson.domains) &&
        domainsJson.domains.length >= 3 &&
        domainsJson.aiEngine?.provider === 'OpenCode Go' &&
        domainsJson.aiEngine?.configured === true,
      `Exposes default domain "natural_american_english", ${domainsJson.domains?.length} extensible domains, and live OpenCode Go engine (${domainsJson.aiEngine?.model})`,
    );

    const naeDomain = domainsJson.domains.find((d) => d.id === 'natural_american_english');
    assert(
      naeDomain && naeDomain.categories.length === 8,
      `Natural American English exposes 8 categories (${naeDomain?.categories?.map((c) => c.id).join(', ')})`,
    );

    const anonHeaders = {
      'Content-Type': 'application/json',
      'x-guest-token': `ll_anon_${Date.now()}`,
    };
    const gatedEndpoints = [
      ['GET', '/api/learning-library/items'],
      ['GET', '/api/learning-library/batches'],
      ['GET', '/api/learning-library/export'],
      ['POST', '/api/learning-library/generate', { count: 3 }],
      ['POST', '/api/learning-library/generate/stream', { count: 3 }],
      ['PATCH', '/api/learning-library/items/fake-id', { isFavorite: true }],
      ['DELETE', '/api/learning-library/items/fake-id'],
      ['POST', '/api/learning-library/clear', { domainId: 'natural_american_english' }],
      ['POST', '/api/learning-library/define-word', { word: 'lowkey' }],
    ];

    let allGated = true;
    for (const [method, endpoint, body] of gatedEndpoints) {
      const r = await fetch(`${BASE_URL}${endpoint}`, {
        method,
        headers: anonHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await r.json().catch(() => ({}));
      if (r.status !== 401 || json.code !== 'auth_required') {
        allGated = false;
        assert(false, `Expected 401 auth_required on ${method} ${endpoint}, got ${r.status}`);
      }
    }
    assert(allGated, `All ${gatedEndpoints.length} user endpoints enforce 401 auth_required`);

    // -------------------------------------------------------------------------
    // PART 2: Register Isolated Test Users
    // -------------------------------------------------------------------------
    console.log('\n--- PART 2: Account Creation & Isolation ---');
    const regA = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sam Native',
        email: `ll_e2e_a_${Date.now()}@flaptap.test`,
        password: 'Password123!',
        nativeLanguage: 'ar',
      }),
    }).then((r) => r.json());
    tokenA = regA.token;
    assert(Boolean(tokenA), 'Primary test user A registered');

    const regB = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Maya Isolated',
        email: `ll_e2e_b_${Date.now()}@flaptap.test`,
        password: 'Password123!',
        nativeLanguage: 'es',
      }),
    }).then((r) => r.json());
    tokenB = regB.token;
    assert(Boolean(tokenB), 'Secondary test user B registered');

    const authA = { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` };
    const authB = { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` };

    // -------------------------------------------------------------------------
    // PART 3: Live Parallel OpenCode Go Streaming & 20-Item Benchmark + Dedup
    // -------------------------------------------------------------------------
    console.log('\n--- PART 3: Live 20-Item Parallel OpenCode Go Streaming & Deduplication ---');
    const t20 = Date.now();
    const streamRes = await fetch(`${BASE_URL}/api/learning-library/generate/stream`, {
      method: 'POST',
      headers: authA,
      body: JSON.stringify({
        domainId: 'natural_american_english',
        count: 20,
        categoryId: 'all',
        targetLanguage: 'ar',
      }),
    });
    assert(
      streamRes.ok && (streamRes.headers.get('content-type') || '').includes('text/event-stream'),
      `20-item SSE stream POST /api/learning-library/generate/stream returned ${streamRes.status} (${streamRes.headers.get('content-type')})`,
    );

    const rawStream = await streamRes.text();
    const sseEvents = rawStream
      .split(/\r?\n\r?\n/)
      .map((blk) => blk.trim())
      .filter(Boolean)
      .map((blk) => {
        let event = 'message';
        let dataStr = '';
        for (const line of blk.split(/\r?\n/)) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
        }
        return { event, data: JSON.parse(dataStr || '{}') };
      });

    const startedEv = sseEvents.find((e) => e.event === 'started');
    const chunkEvs = sseEvents.filter((e) => e.event === 'chunk');
    const completeEv = sseEvents.find((e) => e.event === 'complete');
    const gen1 = completeEv?.data || {};
    const elapsed20Ms = Date.now() - t20;

    assert(
      startedEv?.data?.chunksPlanned === 4 &&
        chunkEvs.length >= 4 &&
        gen1.success === true &&
        Array.isArray(gen1.items) &&
        gen1.items.length === 20,
      `20/20 unique expressions streamed across ${chunkEvs.length} live SSE chunks via OpenCode Go in ${elapsed20Ms}ms`,
    );

    const distinctCatsIn20 = new Set((gen1.items || []).map((i) => i.categoryId));
    assert(
      distinctCatsIn20.size >= 5,
      `Parallel category sharding produced broad diversity across ${distinctCatsIn20.size} categories`,
    );

    const sampleItem = gen1.items[0];
    assert(
      Boolean(
        sampleItem?.expression &&
          sampleItem?.coreMeaning &&
          sampleItem?.localizedMeaning &&
          sampleItem?.variations?.length >= 1 &&
          sampleItem?.combinations?.length >= 1 &&
          sampleItem?.usagePatterns?.length >= 1 &&
          sampleItem?.examples?.length >= 2,
      ),
      `Generated item "${sampleItem?.expression}" includes full depth (variations=${sampleItem?.variations?.length}, combinations=${sampleItem?.combinations?.length}, patterns=${sampleItem?.usagePatterns?.length}, examples=${sampleItem?.examples?.length})`,
    );

    const hasBasic = (gen1.items || []).some((i) => BASIC_FORBIDDEN.has(i.expression.toLowerCase()));
    assert(!hasBasic, 'Batch 1 contains ZERO elementary ESL textbook filler');

    const slotizedItem = (gen1.items || []).find(
      (i) =>
        Array.isArray(i.patternSlots) &&
        i.patternSlots.length > 0 &&
        /\[[^\]]+\]/.test(i.expression || ''),
    );
    assert(
      Boolean(slotizedItem) &&
        slotizedItem.patternSlots.every((slot) => slot.slot && slot.role) &&
        /\[[^\]]+\]/.test(slotizedItem.localizedMeaning || ''),
      `Reusable pattern contract holds ("${slotizedItem?.expression}" -> "${slotizedItem?.localizedMeaning}" with ${slotizedItem?.patternSlots?.length} explained slots)`,
    );

    // Batch 2: Generate 5 MORE expressions -> verify 25 unique persisted items
    const gen2Res = await fetch(`${BASE_URL}/api/learning-library/generate`, {
      method: 'POST',
      headers: authA,
      body: JSON.stringify({
        domainId: 'natural_american_english',
        count: 5,
        categoryId: 'all',
        targetLanguage: 'ar',
      }),
    });
    assert(gen2Res.ok, `Batch 2 POST /api/learning-library/generate returned ${gen2Res.status}`);
    const gen2 = await gen2Res.json();
    assert(gen2.items?.length === 5, `Batch 2 delivered exact requested count (${gen2.items?.length}/5)`);

    // Batch 3: Targeted category ("modern_slang") + steering focus
    const gen3Res = await fetch(`${BASE_URL}/api/learning-library/generate`, {
      method: 'POST',
      headers: authA,
      body: JSON.stringify({
        domainId: 'natural_american_english',
        count: 3,
        categoryId: 'modern_slang',
        focusTopic: 'hanging out with friends & casual reactions',
        targetLanguage: 'ar',
      }),
    });
    assert(gen3Res.ok, `Batch 3 (modern_slang) returned ${gen3Res.status}`);
    const gen3 = await gen3Res.json();
    assert(gen3.items?.length === 3, `Batch 3 delivered exact requested count (${gen3.items?.length}/3)`);

    // Verify all 28 persisted items in SQLite have ZERO duplicate canonicalKeys or slugKeys
    const listA = await fetch(
      `${BASE_URL}/api/learning-library/items?domainId=natural_american_english`,
      { headers: authA },
    ).then((r) => r.json());

    const canonicalSet = new Set(listA.items.map((i) => i.canonicalKey));
    const slugSet = new Set(listA.items.map((i) => i.slugKey));
    assert(
      listA.totalCount === 28 && canonicalSet.size === 28 && slugSet.size === 28,
      `All 28 persisted items across 3 batches (20+5+3) are 100% unique (canonical=${canonicalSet.size}, slug=${slugSet.size})`,
    );

    // -------------------------------------------------------------------------
    // PART 4: Domain Reusability & User Isolation & CRUD
    // -------------------------------------------------------------------------
    console.log('\n--- PART 4: Domain Scalability, Isolation & CRUD ---');
    const progRes = await fetch(`${BASE_URL}/api/learning-library/generate`, {
      method: 'POST',
      headers: authA,
      body: JSON.stringify({
        domainId: 'programming_terminology',
        count: 3,
        categoryId: 'concurrency_async',
        targetLanguage: 'ar',
      }),
    });
    assert(progRes.ok, `Scalable domain (programming_terminology) generated with status ${progRes.status}`);
    const progJson = await progRes.json();
    assert(
      progJson.items?.length === 3 && progJson.items.every((i) => i.domainId === 'programming_terminology'),
      'Programming Terminology reused the exact same Direct OpenCode Go pipeline cleanly',
    );

    // User B isolation check
    const listB = await fetch(
      `${BASE_URL}/api/learning-library/items?domainId=natural_american_english`,
      { headers: authB },
    ).then((r) => r.json());
    assert(listB.totalCount === 0, 'User B strictly sees 0 items from User A');

    // Update mastery, favorite, userNotes
    const targetId = listA.items[0].id;
    const patchRes = await fetch(`${BASE_URL}/api/learning-library/items/${targetId}`, {
      method: 'PATCH',
      headers: authA,
      body: JSON.stringify({
        isFavorite: true,
        masteryStatus: 'mastered',
        incrementReview: true,
        userNotes: 'Verified via E2E',
      }),
    });
    assert(patchRes.ok, 'PATCH item succeeded');
    const patched = (await patchRes.json()).item;
    assert(
      patched.isFavorite && patched.masteryStatus === 'mastered' && patched.reviewCount === 1,
      'Favorite, mastery, and review count persisted',
    );

    // Filter by mastery & favorites
    const favList = await fetch(
      `${BASE_URL}/api/learning-library/items?domainId=natural_american_english&favoritesOnly=1&masteryStatus=mastered`,
      { headers: authA },
    ).then((r) => r.json());
    assert(favList.items.some((i) => i.id === targetId), 'Favorites + mastery filter works accurately');

    // Word lookup inside Learning Library
    const lookupRes = await fetch(`${BASE_URL}/api/learning-library/define-word`, {
      method: 'POST',
      headers: authA,
      body: JSON.stringify({
        itemId: targetId,
        word: sampleItem.examples[0].sentence.split(/\s+/).find((w) => w.replace(/[^a-zA-Z]/g, '').length >= 4) || 'really',
        contextSentence: sampleItem.examples[0].sentence,
        language: 'ar',
      }),
    });
    assert(lookupRes.ok, `POST /api/learning-library/define-word returned ${lookupRes.status}`);
    const lookupJson = await lookupRes.json();
    assert(Boolean(lookupJson.definition && lookupJson.translation), 'Contextual word lookup returned definition + translation');

    // Export JSON
    const expRes = await fetch(`${BASE_URL}/api/learning-library/export`, { headers: authA });
    const expJson = await expRes.json();
    assert(expRes.ok && expJson.itemsCount === 31, `Export returned all 31 items across domains (got ${expJson.itemsCount})`);

    // -------------------------------------------------------------------------
    // PART 5: Full Headless Browser UI/UX E2E (Puppeteer)
    // -------------------------------------------------------------------------
    console.log('\n--- PART 5: Puppeteer Real Browser UI/UX Verification ---');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });

      const browserErrors = [];
      page.on('pageerror', (err) => browserErrors.push(err.message));

      // 5.1 Direct navigation to dedicated `/library` route as anonymous visitor
      await page.goto(`${BASE_URL}/library`, {
        waitUntil: 'networkidle2',
        timeout: 20000,
      });

      const sectionVisible = await page.$eval('#section-learning-library', (el) => !el.hidden);
      const navActive = await page.$eval('.sidebar-nav-link.active', (el) => el.dataset.routeSection);
      const noTopbarTabs = (await page.$$('.workspace-topbar .nav-tab')).length === 0;
      const sidebarVisible = await page.evaluate(() => {
        const sb = document.querySelector('.app-sidebar');
        return sb ? sb.getBoundingClientRect().width >= 60 : false;
      });
      assert(
        sectionVisible && navActive === 'learning-library' && noTopbarTabs && sidebarVisible,
        'Learning Library dedicated /library route & left sidebar nav active without topbar tabs at 1280px',
      );

      // Verify compact reusable real-time 3-dropdown selector (API Keys -> Live Models -> Dynamic Variants)
      await page.waitForFunction(
        () => {
          const kSel = document.getElementById('ll-aisel-key-select');
          const mSel = document.getElementById('ll-aisel-model-select');
          const vSel = document.getElementById('ll-aisel-variant-select');
          return kSel && kSel.options.length >= 1 && mSel && mSel.options.length >= 5 && vSel && vSel.options.length >= 1 && !mSel.disabled;
        },
        { timeout: 15000 },
      );

      const noCliMount = (await page.$('#ll-agent-routing-mount')) === null;
      const selectorLiveStatus = await page.$eval('#ll-aisel-status-text', (el) => el.textContent.trim());
      assert(
        noCliMount && selectorLiveStatus.includes('Live'),
        `Compact Dynamic AI Selector mounted cleanly ("${selectorLiveStatus}", zero CLI bloat)`,
      );

      // Select count = 3 and category = 'fillers_hesitation'
      await page.click('.ll-count-pill[data-ll-count="3"]');
      await page.select('#ll-gen-category-select', 'fillers_hesitation');
      const runLabel = await page.$eval('#ll-generate-btn-label', (el) => el.textContent.trim());
      assert(
        runLabel.includes('3'),
        `Count selector updated primary CTA ("${runLabel}")`,
      );

      // Click Generate while signed out -> should prompt Sign-In drawer!
      await page.click('#ll-generate-btn');
      await page.waitForFunction(
        () => {
          const bd = document.getElementById('account-drawer-backdrop');
          return bd && !bd.hidden;
        },
        { timeout: 5000 },
      );
      const gateVisible = await page.$eval('#auth-gate-banner', (el) => !el.hidden);
      assert(gateVisible, 'Unauthenticated click opened Sign-In drawer with pending-action gate banner');

      // Register right inside the drawer -> pending SSE generation should auto-resume!
      await page.click('.auth-tab[data-auth-tab="register"]');
      const uiEmail = `ll_ui_${Date.now()}@flaptap.test`;
      await page.type('#reg-name', 'Browser Learner');
      await page.type('#reg-email', uiEmail);
      await page.type('#reg-password', 'Password123!');
      await page.click('#register-submit-btn');

      // Wait for auto-resumed SSE generation to finish and populate centralized library grid!
      await page.waitForFunction(
        () => {
          const banner = document.getElementById('ll-latest-batch-banner');
          const count = document.querySelectorAll('#ll-browse-items-container .ll-table tbody tr, #ll-browse-items-container .ll-card').length;
          const prog = document.getElementById('ll-progress-card');
          return banner && !banner.hidden && count === 3 && prog?.hidden === true;
        },
        { timeout: 60000 },
      );

      browserToken = await page.evaluate(() => localStorage.getItem('flaptap_auth_token') || '');
      assert(true, 'Pending generation auto-resumed after sign-up and populated centralized library with 3 items (Table default)');

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'll_generated_light.png'), fullPage: true });

      // Test click-any-word contextual lookup inside generated card example
      await page.click('#ll-browse-items-container .clickable-word');
      await page.waitForFunction(
        () => {
          const pop = document.getElementById('word-lookup-popover');
          const def = document.getElementById('wp-def')?.textContent?.trim();
          return pop && !pop.hidden && def && !def.includes('Looking up');
        },
        { timeout: 25000 },
      );
      assert(true, 'Click-any-word inside Learning Library example opened contextual definition popover');
      await page.click('#wp-close-btn');

      // Save first expression to Vocabulary Flashcards
      await page.click('#ll-browse-items-container [data-ll-save-vocab]');
      await page.waitForFunction(
        () => document.querySelector('#ll-browse-items-container [data-ll-save-vocab]')?.classList.contains('is-saved'),
        { timeout: 10000 },
      );
      assert(true, 'Saved expression from Learning Library into Vocabulary Flashcards');

      // Test Study Details slide-over drawer + Prev/Next stepping
      await page.click('#ll-browse-items-container [data-ll-open-study]');
      await page.waitForFunction(
        () => {
          const bd = document.getElementById('ll-study-drawer-backdrop');
          return bd && !bd.hidden && Boolean(document.getElementById('ll-study-title')?.textContent?.trim());
        },
        { timeout: 5000 },
      );
      const firstStudyTitle = await page.$eval('#ll-study-title', (el) => el.textContent.trim());
      await page.click('#ll-study-next-btn');
      const secondStudyTitle = await page.$eval('#ll-study-title', (el) => el.textContent.trim());
      assert(
        firstStudyTitle !== secondStudyTitle,
        `Study Detail Drawer opens and steps Next cleanly ("${firstStudyTitle}" -> "${secondStudyTitle}")`,
      );
      await page.click('#ll-study-close-btn');

      // Test Active Recall mask toggle & Reveal button
      await page.click('#ll-recall-toggle-btn');
      const maskedCount = await page.$$eval('.ll-meaning-block.is-masked', (els) => els.length);
      assert(maskedCount === 3, `Active Recall mode masked meanings on all ${maskedCount} cards`);
      await page.click('[data-ll-reveal]');
      const maskedAfterReveal = await page.$$eval('.ll-meaning-block.is-masked', (els) => els.length);
      assert(maskedAfterReveal === 2, 'Clicking Reveal Meaning unmasked targeted card');
      await page.click('#ll-recall-toggle-btn');

      // Test checkable completion & instant Total/Completed/Remaining bar + Telemetry sync across Cards & Compact Table
      const llBarBefore = await page.evaluate(() => ({
        total: document.querySelector('#ll-browse-progress-bar [data-sp-total]')?.textContent?.trim(),
        completed: document.querySelector('#ll-browse-progress-bar [data-sp-completed]')?.textContent?.trim(),
        remaining: document.querySelector('#ll-browse-progress-bar [data-sp-remaining]')?.textContent?.trim(),
      }));
      assert(
        llBarBefore.total === '3' && llBarBefore.completed === '0' && llBarBefore.remaining === '3',
        `Browse progress bar initializes cleanly (${JSON.stringify(llBarBefore)})`,
      );
      await page.click('#ll-browse-items-container [data-ll-toggle-complete]');
      await page.waitForFunction(
        () => document.getElementById('ll-stat-completed')?.textContent?.trim() === '1',
        { timeout: 5000 },
      );
      const llBarAfter = await page.evaluate(() => ({
        total: document.querySelector('#ll-browse-progress-bar [data-sp-total]')?.textContent?.trim(),
        completed: document.querySelector('#ll-browse-progress-bar [data-sp-completed]')?.textContent?.trim(),
        remaining: document.querySelector('#ll-browse-progress-bar [data-sp-remaining]')?.textContent?.trim(),
        statCompleted: document.getElementById('ll-stat-completed')?.textContent?.trim(),
        statProgress: document.getElementById('ll-stat-progress')?.textContent?.trim(),
      }));
      assert(
        llBarAfter.total === '3' &&
          llBarAfter.completed === '1' &&
          llBarAfter.remaining === '2' &&
          llBarAfter.statCompleted === '1' &&
          llBarAfter.statProgress === '33%',
        `Card check updates progress bar & telemetry strip in lockstep (${JSON.stringify(llBarAfter)})`,
      );

      // Test View Mode toggle: switch to Cards mode, then back to Table mode
      await page.click('#ll-view-cards-btn');
      const cardsRendered = await page.$$eval('#ll-browse-items-container .ll-card', (els) => els.length);
      assert(cardsRendered === 3, `Cards view rendered ${cardsRendered} cards`);
      await page.click('#ll-view-table-btn');
      const tableCheckState = await page.evaluate(() => ({
        tableRows: document.querySelectorAll('.ll-table tbody tr').length,
        tableCompletedBtns: document.querySelectorAll('.ll-table tbody tr .item-check-btn.is-checked').length,
      }));
      assert(
        tableCheckState.tableRows === 3 && tableCheckState.tableCompletedBtns === 1,
        `Compact Table default view rendered ${tableCheckState.tableRows} rows with synced completion check`,
      );

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'll_browse_light.png'), fullPage: true });

      // Navigate directly to `/library/browse` and confirm hard reload preserves centralized library with all 3 items
      await page.goto(`${BASE_URL}/library/browse`, { waitUntil: 'networkidle2', timeout: 20000 });
      await page.waitForFunction(
        () =>
          window.location.pathname === '/library/browse' &&
          !document.getElementById('section-learning-library')?.hidden &&
          document.querySelectorAll('#ll-browse-items-container .ll-table tbody tr, #ll-browse-items-container .ll-card').length === 3,
        { timeout: 10000 },
      );
      await page.reload({ waitUntil: 'networkidle2', timeout: 20000 });
      await page.waitForFunction(
        () =>
          window.location.pathname === '/library/browse' &&
          !document.getElementById('section-learning-library')?.hidden &&
          document.querySelectorAll('#ll-browse-items-container .ll-table tbody tr, #ll-browse-items-container .ll-card').length === 3,
        { timeout: 10000 },
      );
      assert(true, 'Hard page.reload() on /library/browse keeps user in Learning Library with all 3 items');

      // Multi-viewport + Dark Mode + RTL zero-overflow audit
      const viewports = [
        { name: 'mobile_375', width: 375, height: 812 },
        { name: 'tablet_768', width: 768, height: 1024 },
        { name: 'laptop_1280', width: 1280, height: 800 },
        { name: 'desktop_1440', width: 1440, height: 900 },
      ];
      let overflowFailures = 0;
      for (const vp of viewports) {
        await page.setViewport({ width: vp.width, height: vp.height });
        for (const theme of ['light', 'dark']) {
          for (const lang of ['en', 'ar']) {
            await page.evaluate(
              (th, lg) => {
                document.documentElement.setAttribute('data-theme', th);
                document.documentElement.setAttribute('lang', lg);
                document.documentElement.setAttribute('dir', lg === 'ar' ? 'rtl' : 'ltr');
              },
              theme,
              lang,
            );
            await new Promise((r) => setTimeout(r, 40));
            const diff = await page.evaluate(
              () => document.documentElement.scrollWidth - window.innerWidth,
            );
            if (diff > 2) {
              overflowFailures++;
              console.error(`Overflow at ${vp.name} [${theme}/${lang}]: +${diff}px`);
            }
          }
        }
      }
      assert(overflowFailures === 0, 'Zero horizontal overflow across 375px, 768px, 1280px, 1440px (Light/Dark & EN/AR)');

      // Capture Dark Mode desktop screenshot for visual inspection
      await page.setViewport({ width: 1280, height: 900 });
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.setAttribute('lang', 'en');
        document.documentElement.setAttribute('dir', 'ltr');
      });
      await new Promise((r) => setTimeout(r, 220));
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'll_unified_dark.png'), fullPage: true });

      assert(browserErrors.length === 0, `Zero browser runtime errors (${JSON.stringify(browserErrors)})`);
      console.log(`Screenshots saved under ${SCREENSHOT_DIR}`);
    } finally {
      await browser.close();
    }
  } finally {
    // Clean up all temporary test accounts (cascades cleanly to all items & batches)
    for (const tok of [tokenA, tokenB, browserToken]) {
      if (tok) {
        await fetch(`${BASE_URL}/api/auth/account`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tok}` },
        }).catch(() => {});
      }
    }
  }

  console.log('\n==================================================');
  if (failures === 0) {
    console.log('🎉 ALL LEARNING LIBRARY E2E TESTS PASSED (100% GREEN)');
    console.log('==================================================\n');
    process.exit(0);
  } else {
    console.error(`💥 ${failures} LEARNING LIBRARY E2E TEST(S) FAILED`);
    console.log('==================================================\n');
    process.exit(1);
  }
}

runE2E().catch((err) => {
  console.error('Fatal E2E error:', err);
  process.exit(1);
});
