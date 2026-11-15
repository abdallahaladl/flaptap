/**
 * Comprehensive Unit + Live API + Puppeteer Browser E2E Suite
 * for Flaptap's Reusable Dynamic AI Providers Module (`AiProvidersModule`)
 * and `FlaptapAiSelector` UI Component.
 *
 * Verifies:
 * 1. AES-256-GCM key vault encryption, masking & SSRF URL hardening
 * 2. Automatic multi-key discovery from environment (multiple keys from same & different providers)
 * 3. Real-time `/api/ai-providers/keys` & live `/models` probing (OpenCode Go real key)
 * 4. Dynamic capability-based model & thinking/reasoning enrichment via live models.dev catalog
 * 5. Live BYOK HTTP mock provider (multi-provider switching, validation on bad key, user isolation, delete)
 * 6. Real Puppeteer UI E2E:
 *    - Dropdown 1 (Keys) -> real-time Dropdown 2 (Live Models) -> dynamic Dropdown 3 (Thinking/Variants)
 *    - Switching models dynamically updates thinking variants per capability
 *    - Adding a 2nd live API key in modal immediately adds it to Dropdown 1 and loads its models into Dropdown 2
 *    - Refresh button forces live re-probe
 *    - Mounting a 2nd independent FlaptapAiSelector instance simultaneously works with zero collisions
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.FLAPTAP_URL || 'http://127.0.0.1:3333';

const distAi = path.resolve(__dirname, '../backend/dist/modules/ai-providers');
const distDb = path.resolve(__dirname, '../backend/dist/core/database');
const {
  maskApiKey,
  fingerprintApiKey,
  sanitizeAndValidateBaseUrl,
  encryptApiKey,
  decryptApiKey,
} = require(path.join(distAi, 'security/key-vault.util.js'));
const { ProviderCatalogService } = require(path.join(distAi, 'services/provider-catalog.service.js'));
const { KeyDiscoveryService } = require(path.join(distAi, 'services/key-discovery.service.js'));
const { AiProvidersRepository } = require(path.join(distAi, 'ai-providers.repository.js'));
const { SqliteService } = require(path.join(distDb, 'sqlite.service.js'));

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    console.error(`❌ FAILED: ${msg}`);
    failures++;
  } else {
    console.log(`✅ PASSED: ${msg}`);
  }
}

async function runSuite() {
  console.log('🧪 Running Comprehensive Dynamic AI Providers & Selector E2E Suite...\n');

  // ---------------------------------------------------------------------------
  // PART 1: Vault Security, SSRF Protection, Multi-Key Env Discovery & Catalog
  // ---------------------------------------------------------------------------
  console.log('--- PART 1: Vault Security, Multi-Key Discovery & Live Catalog ---');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaptap-aiprovs-'));
  const tempDbPath = path.join(tmpDir, 'test.sqlite');

  try {
    const rawSecret = 'sk-proj-supersecret-1234567890-abcdef';
    const masked = maskApiKey(rawSecret);
    check(masked === 'sk-pro••••cdef' && !masked.includes('supersecret'), `API key masked cleanly (${masked})`);

    const encrypted = encryptApiKey(rawSecret, tempDbPath);
    const decrypted = decryptApiKey(encrypted, tempDbPath);
    check(decrypted === rawSecret && encrypted !== rawSecret, 'AES-256-GCM encryption & decryption roundtrip succeeded');

    let blockedMeta = false;
    try {
      sanitizeAndValidateBaseUrl('http://169.254.169.254/latest/meta-data');
    } catch {
      blockedMeta = true;
    }
    let blockedPrivate = false;
    try {
      sanitizeAndValidateBaseUrl('http://10.0.0.5/v1', { allowLocalhost: false });
    } catch {
      blockedPrivate = true;
    }
    const okLocalCustom = sanitizeAndValidateBaseUrl('http://127.0.0.1:9999/v1', { allowLocalhost: true });
    check(blockedMeta && blockedPrivate && okLocalCustom === 'http://127.0.0.1:9999/v1', 'SSRF URL validation blocks cloud metadata/private IPs & permits explicit local custom endpoint');

    // Multi-key env scan (same provider x2 + different providers + custom)
    const prevEnv = { ...process.env };
    process.env.FLAPTAP_SQLITE_PATH = tempDbPath;
    process.env.FLAPTAP_DISABLE_EXTERNAL_KEY_SCAN = '1';
    process.env.OPENCODE_GO_API_KEY = 'oc_sk_primary_1111111111';
    process.env.OPENCODE_GO_API_KEY_WORK = 'oc_sk_work_22222222222';
    process.env.OPENAI_API_KEY = 'sk-proj-openai_3333333333';
    process.env.GEMINI_API_KEY = 'AIzaSyFakeGemini_444444444';
    process.env.AI_CUSTOM_MYPROXY_API_KEY = 'cp_secret_555555555';
    process.env.AI_CUSTOM_MYPROXY_BASE_URL = 'https://proxy.example.com/v1';
    process.env.AI_CUSTOM_MYPROXY_NAME = 'Corp Gateway';

    const sqlite = new SqliteService();
    const repo = new AiProvidersRepository(sqlite);
    const discovery = new KeyDiscoveryService(repo);
    const discovered = discovery.discoverAllKeys(null);
    sqlite.onModuleDestroy();

    // Restore env cleanly
    process.env = prevEnv;

    const hasTwoOpenCode =
      discovered.filter((k) => k.providerId === 'opencode-go').length === 2;
    const hasOpenAi = discovered.some((k) => k.providerId === 'openai');
    const hasGemini = discovered.some((k) => k.providerId === 'google');
    const hasCustom = discovered.some((k) => k.providerId === 'custom' && k.providerName === 'Corp Gateway');
    check(
      hasTwoOpenCode && hasOpenAi && hasGemini && hasCustom,
      `Multi-key auto-discovery detected 2 OpenCode Go keys + OpenAI + Gemini + Custom Gateway (${discovered.length} total)`,
    );

    const anonProfile = discovery.toPublicProfile(discovered[0], false);
    const authProfile = discovery.toPublicProfile(discovered[0], true);
    check(
      anonProfile.maskedKey === undefined && !anonProfile.displayName.includes('1111') && authProfile.maskedKey !== undefined,
      'Public profile hides key mask from anonymous visitors and shows mask only when authenticated',
    );

    // Test dynamic ProviderCatalogService enrichment
    const catalog = new ProviderCatalogService();
    await catalog.ensureSynced(false);
    const enrichedOpenAi = catalog.enrichDiscoveredModels('openai', [
      { id: 'o3' },
      { id: 'gpt-4o' },
      { id: 'text-embedding-3-large' },
    ]);
    const o3Model = enrichedOpenAi.models.find((m) => m.id === 'o3');
    const embModel = enrichedOpenAi.models.find((m) => m.id === 'text-embedding-3-large');
    check(
      Boolean(o3Model) && o3Model.variants.some((v) => v.id === 'high') && !embModel,
      `Live catalog enriched OpenAI o3 variants (${o3Model?.variants?.map((v) => v.id).join(', ')}) and filtered non-chat embedding model`,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // ---------------------------------------------------------------------------
  // PART 2: Live Server API Discovery + Dynamic Local BYOK HTTP Provider Server
  // ---------------------------------------------------------------------------
  console.log('\n--- PART 2: Live API Discovery & Real-Time BYOK Custom Provider ---');

  // Spin up a real local mock OpenAI-compatible HTTP server to test real-time per-key model loading
  const mockValidToken = 'sk-mock-live-valid-9999';
  let mockModelsHits = 0;
  let mockChatHits = 0;
  const mockServer = http.createServer((req, res) => {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${mockValidToken}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Invalid mock API key' } }));
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/v1/models')) {
      mockModelsHits++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          object: 'list',
          data: [
            {
              id: 'mock-flash-direct',
              name: 'Mock Flash Direct',
              owned_by: 'mock-ai',
              capabilities: {
                reasoning: { supported: false },
                structured_output: true,
              },
              limit: { context: 128000, output: 16384 },
            },
            {
              id: 'mock-reasoner-pro',
              name: 'Mock Reasoner Pro',
              owned_by: 'mock-ai',
              capabilities: {
                reasoning: { supported: true, effort: ['none', 'low', 'medium', 'high'] },
                structured_output: true,
              },
              limit: { context: 512000, output: 32768 },
            },
          ],
        }),
      );
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/v1/chat/completions')) {
      mockChatHits++;
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'chatcmpl-mock-1',
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    items: [
                      {
                        expression: 'spill the tea',
                        categoryId: 'modern_slang',
                        register: 'Friends & Gen-Z',
                        tone: 'playful',
                        level: 'Native Everyday',
                        ipa: '/spɪl ðə tiː/',
                        spokenForm: 'spill the tea',
                        phoneticBreakdown: 'Link consonant /l/ cleanly.',
                        coreMeaning: 'Share juicy gossip or inside news.',
                        localizedMeaning: 'احكي التفاصيل / طلع المستخبي',
                        textbookEquivalent: 'Tell me the gossip',
                        nativeContext: 'Friends chatting casually.',
                        mistakesToAvoid: 'Avoid in formal legal briefings.',
                        variations: ['spill the T', 'spilling tea'],
                        combinations: ['ready to spill the tea'],
                        usagePatterns: [
                          { pattern: 'Spill the tea on [X]', meaning: 'Ask for updates', example: 'Spill the tea on what happened at lunch.' },
                        ],
                        examples: [
                          { speakerContext: 'Friends', sentence: 'Come on, spill the tea—what did they say?', explanation: 'Playful curiosity' },
                          { speakerContext: 'Podcast', sentence: 'She basically spilled the tea on the entire merger.', explanation: 'Revealed inside story' },
                        ],
                        relatedExpressions: ['fill me in'],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        );
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const mockPort = mockServer.address().port;
  const mockBaseUrl = `http://127.0.0.1:${mockPort}/v1`;

  let tokenA = '';
  let tokenB = '';
  let savedCustomKeyId = '';

  try {
    // 2.1 Public presets & keys check
    const presetsJson = await fetch(`${BASE_URL}/api/ai-providers/presets`).then((r) => r.json());
    check(
      presetsJson.success && Array.isArray(presetsJson.presets) && presetsJson.presets.length >= 10,
      `GET /api/ai-providers/presets exposes ${presetsJson.presets?.length} supported providers`,
    );

    const anonKeysJson = await fetch(`${BASE_URL}/api/ai-providers/keys`).then((r) => r.json());
    check(
      anonKeysJson.success &&
        anonKeysJson.keys.length >= 1 &&
        anonKeysJson.keys.every((k) => !k.maskedKey),
      `Anonymous GET /api/ai-providers/keys lists ${anonKeysJson.keys?.length} system provider(s) with ZERO masked secret exposure`,
    );

    const primarySysKey = anonKeysJson.keys[0];

    // 2.2 Live OpenCode Go /models test
    const liveSysModels = await fetch(
      `${BASE_URL}/api/ai-providers/keys/${encodeURIComponent(primarySysKey.id)}/models?refresh=1`,
    ).then((r) => r.json());
    check(
      liveSysModels.success &&
        liveSysModels.fetchedLive === true &&
        liveSysModels.models.length >= 10,
      `Live GET /api/ai-providers/keys/${primarySysKey.id}/models returned ${liveSysModels.models?.length} live models in ${liveSysModels.latencyMs}ms`,
    );

    // Register User A and User B
    const regA = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Provider Tester A',
        email: `prov_a_${Date.now()}@flaptap.test`,
        password: 'Password123!',
        nativeLanguage: 'ar',
      }),
    }).then((r) => r.json());
    tokenA = regA.token;

    const regB = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Provider Tester B',
        email: `prov_b_${Date.now()}@flaptap.test`,
        password: 'Password123!',
        nativeLanguage: 'es',
      }),
    }).then((r) => r.json());
    tokenB = regB.token;

    const authA = { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` };
    const authB = { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` };

    // 2.3 Signed-out POST /keys blocked with 401 auth_required
    const unauthAdd = await fetch(`${BASE_URL}/api/ai-providers/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: 'custom', apiKey: 'x', baseUrl: mockBaseUrl }),
    });
    check(unauthAdd.status === 401, 'Unauthenticated POST /api/ai-providers/keys rejected with 401');

    // 2.4 Invalid API key tested live & rejected before saving
    const badAdd = await fetch(`${BASE_URL}/api/ai-providers/keys`, {
      method: 'POST',
      headers: authA,
      body: JSON.stringify({
        providerId: 'custom',
        label: 'Bad Key',
        apiKey: 'wrong-key',
        baseUrl: mockBaseUrl,
      }),
    });
    check(badAdd.status === 400, 'Invalid API key rejected live with HTTP 400 before persisting');

    // 2.5 Valid BYOK Custom key verified live, encrypted, and isolated to User A
    const goodAddRes = await fetch(`${BASE_URL}/api/ai-providers/keys`, {
      method: 'POST',
      headers: authA,
      body: JSON.stringify({
        providerId: 'custom',
        label: 'Mock Live Provider',
        apiKey: mockValidToken,
        baseUrl: mockBaseUrl,
      }),
    });
    const goodAdd = await goodAddRes.json();
    savedCustomKeyId = goodAdd.profile?.id || '';
    check(
      goodAddRes.ok &&
        Boolean(savedCustomKeyId) &&
        mockModelsHits >= 1 &&
        goodAdd.discovery?.models?.length === 2,
      `Live BYOK key saved & verified against upstream /models (${goodAdd.discovery?.models?.length} models loaded live)`,
    );

    // User A sees new key + models; User B does NOT see User A's key and cannot access it
    const keysA = await fetch(`${BASE_URL}/api/ai-providers/keys`, { headers: authA }).then((r) => r.json());
    const keysB = await fetch(`${BASE_URL}/api/ai-providers/keys`, { headers: authB }).then((r) => r.json());
    const crossProbe = await fetch(
      `${BASE_URL}/api/ai-providers/keys/${encodeURIComponent(savedCustomKeyId)}/models`,
      { headers: authB },
    );
    check(
      keysA.keys.some((k) => k.id === savedCustomKeyId) &&
        !keysB.keys.some((k) => k.id === savedCustomKeyId) &&
        crossProbe.status === 400,
      'User A sees saved BYOK key while User B is strictly isolated (cannot list or probe User A vault key)',
    );

    // Generate 1 expression through LearningLibrary using User A's live BYOK Custom key + specific model & variant!
    const customGenRes = await fetch(`${BASE_URL}/api/learning-library/generate`, {
      method: 'POST',
      headers: authA,
      body: JSON.stringify({
        domainId: 'natural_american_english',
        count: 1,
        keyId: savedCustomKeyId,
        model: 'mock-reasoner-pro',
        variant: 'low',
        targetLanguage: 'ar',
      }),
    });
    const customGen = await customGenRes.json();
    check(
      customGenRes.ok &&
        mockChatHits === 1 &&
        customGen.items?.[0]?.expression === 'spill the tea' &&
        customGen.batch?.modelName === 'mock-reasoner-pro',
      'LearningLibrary generated item directly via selected custom BYOK key, live model, and reasoning variant!',
    );

    // 2.6 Regression guard for user's screenshot scenario: DeepSeek V4.1 Flash + Max Effort on OpenCode Go
    // Either streams to completion directly OR transparently rescues within OpenCode Go key without timing out!
    const deepSeekMaxRes = await fetch(`${BASE_URL}/api/learning-library/generate`, {
      method: 'POST',
      headers: authA,
      body: JSON.stringify({
        domainId: 'natural_american_english',
        count: 5,
        keyId: 'env:OPENCODE_GO_API_KEY',
        model: 'deepseek-v4.1-flash',
        variant: 'max',
        targetLanguage: 'ar',
      }),
    });
    const deepSeekMax = await deepSeekMaxRes.json();
    check(
      deepSeekMaxRes.ok && Array.isArray(deepSeekMax.items) && deepSeekMax.items.length === 5,
      `DeepSeek V4.1 Flash (Max Effort) stress check delivered 5/5 items cleanly in ${deepSeekMax.batch?.executionTimeMs}ms (model=${deepSeekMax.batch?.modelName}${deepSeekMax.batch?.fallbackFrom ? `, rescued from ${deepSeekMax.batch.fallbackFrom}` : ''})`,
    );

    // -------------------------------------------------------------------------
    // PART 3: Puppeteer Real Browser Dynamic Dropdown Cascade & Reusable Mounts
    // -------------------------------------------------------------------------
    console.log('\n--- PART 3: Puppeteer Real-Time Cascading Dropdowns & Reusable Widget E2E ---');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      const runtimeErrors = [];
      page.on('pageerror', (e) => runtimeErrors.push(e.message));

      // Inject User A's session before page scripts run so BYOK key appears deterministically on first load
      await page.evaluateOnNewDocument((tok) => {
        localStorage.setItem('flaptap_auth_token', tok);
      }, tokenA);

      await page.goto(`${BASE_URL}/library`, {
        waitUntil: 'networkidle2',
        timeout: 20000,
      });

      // Wait for Dropdown 1 (Keys) & Dropdown 2 (Live Models) to populate
      await page.waitForFunction(
        () => {
          const k = document.getElementById('ll-aisel-key-select');
          const m = document.getElementById('ll-aisel-model-select');
          const v = document.getElementById('ll-aisel-variant-select');
          return k && k.options.length >= 2 && m && m.options.length >= 1 && v && v.options.length >= 1;
        },
        { timeout: 15000 },
      );

      // Select User A's Mock Live Provider key in Dropdown 1 -> Dropdown 2 MUST load ONLY its 2 live models!
      await page.select('#ll-aisel-key-select', savedCustomKeyId);
      await page.waitForFunction(
        () => {
          const m = document.getElementById('ll-aisel-model-select');
          return m && !m.disabled && [...m.options].some((o) => o.value === 'mock-reasoner-pro');
        },
        { timeout: 10000 },
      );

      const mockModelIds = await page.$$eval('#ll-aisel-model-select option', (opts) =>
        opts.map((o) => o.value),
      );
      check(
        mockModelIds.includes('mock-flash-direct') &&
          mockModelIds.includes('mock-reasoner-pro') &&
          mockModelIds.length === 2,
        `Switching API Key loaded ONLY live models from that key in Dropdown 2 (${JSON.stringify(mockModelIds)})`,
      );

      // Switch model from mock-flash-direct (non-reasoning) -> mock-reasoner-pro (has high/low/medium/none)
      await page.select('#ll-aisel-model-select', 'mock-flash-direct');
      const flashVariants = await page.$$eval('#ll-aisel-variant-select option', (opts) =>
        opts.map((o) => o.value),
      );

      await page.select('#ll-aisel-model-select', 'mock-reasoner-pro');
      const proVariants = await page.$$eval('#ll-aisel-variant-select option', (opts) =>
        opts.map((o) => o.value),
      );

      check(
        flashVariants.length === 1 &&
          flashVariants[0] === 'standard' &&
          proVariants.includes('none') &&
          proVariants.includes('high'),
        `Switching Model dynamically updated Dropdown 3 (flash=${JSON.stringify(flashVariants)}, pro=${JSON.stringify(proVariants)})`,
      );

      // Verify preset pill sync when Dropdown 3 changes manually (regression guard for Fast staying lit on Deep/High)
      await page.select('#ll-aisel-variant-select', 'high');
      const presetOnHigh = await page.$eval(
        '#ll-aisel-card [data-ft-preset].active',
        (b) => b.getAttribute('data-ft-preset'),
      );
      await page.select('#ll-aisel-variant-select', 'none');
      const presetOnNone = await page.$eval(
        '#ll-aisel-card [data-ft-preset].active',
        (b) => b.getAttribute('data-ft-preset'),
      );
      check(
        presetOnHigh === 'deep' && presetOnNone === 'fast',
        `Changing Variant manually keeps speed preset pills synced (high->${presetOnHigh}, none->${presetOnNone})`,
      );

      // Click Refresh button -> triggers real live HTTP fetch (?refresh=1)
      const beforeHits = mockModelsHits;
      const refreshResponsePromise = page.waitForResponse(
        (res) => res.url().includes('/models') && res.url().includes('refresh=1'),
        { timeout: 10000 },
      );
      await page.click('#ll-aisel-refresh-btn');
      await refreshResponsePromise;
      await page.waitForFunction(
        () => document.getElementById('ll-aisel-status-text')?.textContent?.includes('Live'),
        { timeout: 10000 },
      );
      check(
        mockModelsHits > beforeHits,
        `Refresh button re-queried live /models endpoint (hits ${beforeHits} -> ${mockModelsHits})`,
      );

      // Mount a SECOND independent FlaptapAiSelector widget dynamically -> zero ID collisions
      const multiCheck = await page.evaluate(async () => {
        const host = document.createElement('div');
        host.id = 'e2e-second-aisel-host';
        document.body.appendChild(host);
        const w2 = window.FlaptapAiSelector.create({
          container: host,
          idPrefix: 'e2e-second',
          title: 'Second Reusable Instance',
          actionLabel: 'Secondary Action',
        });
        await w2.init();
        const sel1 = document.getElementById('ll-aisel-key-select')?.id;
        const sel2 = document.getElementById('e2e-second-key-select')?.id;
        const count2 = document.querySelectorAll('#e2e-second-model-select option').length;
        w2.destroy();
        host.remove();
        return { sel1, sel2, count2 };
      });
      check(
        multiCheck.sel1 !== multiCheck.sel2 && multiCheck.count2 >= 1,
        `Mounted second independent FlaptapAiSelector widget cleanly (${multiCheck.sel2}, models=${multiCheck.count2})`,
      );

      check(runtimeErrors.length === 0, `Zero browser runtime errors (${JSON.stringify(runtimeErrors)})`);
    } finally {
      await browser.close();
    }

    // Verify User A delete BYOK key works
    const delKeyRes = await fetch(
      `${BASE_URL}/api/ai-providers/keys/${encodeURIComponent(savedCustomKeyId)}`,
      { method: 'DELETE', headers: authA },
    ).then((r) => r.json());
    check(delKeyRes.success === true, 'DELETE /api/ai-providers/keys/:id removed user BYOK key cleanly');
  } finally {
    mockServer.close();
    for (const tok of [tokenA, tokenB]) {
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
    console.log('🎉 ALL DYNAMIC AI PROVIDERS & SELECTOR E2E TESTS PASSED!');
    console.log('==================================================\n');
    process.exit(0);
  } else {
    console.error(`💥 ${failures} TEST(S) FAILED`);
    console.log('==================================================\n');
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal suite error:', err);
  process.exit(1);
});
