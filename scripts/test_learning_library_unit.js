/**
 * Offline Unit & Repository Integration Suite for Learning Library
 * Tests:
 * 1. Multi-layer Lexical Deduplication (canonical, slug, conservative token signature, alias/variation)
 * 2. JSON extraction, repair, and partial truncation salvage
 * 3. Domain Registry & Strategy Pattern extensibility (Natural American English + Tech/Programming + custom runtime registration)
 * 4. LearningLibraryRepository & LearningLibraryService smart top-up + zero-duplicate guarantee + user/domain isolation + CRUD
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const distDir = path.resolve(__dirname, '../backend/dist');
const { SqliteService } = require(path.join(distDir, 'core/database/sqlite.service.js'));
const { AuthService } = require(path.join(distDir, 'modules/auth/auth.service.js'));
const {
  normalizeCanonicalKey,
  normalizeSlugKey,
  computeTokenSignature,
  LearningDeduplicationIndex,
} = require(path.join(distDir, 'modules/learning-library/utils/lexical-dedup.util.js'));
const {
  extractCompletedItemsSince,
  parseLearningGenerationResponse,
} = require(
  path.join(distDir, 'modules/learning-library/utils/json-salvage.util.js'),
);
const { LearningDomainRegistry } = require(
  path.join(distDir, 'modules/learning-library/domains/learning-domain.registry.js'),
);
const { NaturalAmericanEnglishDomainStrategy } = require(
  path.join(distDir, 'modules/learning-library/domains/natural-american-english.strategy.js'),
);
const { TechnicalVocabularyDomainStrategy } = require(
  path.join(distDir, 'modules/learning-library/domains/technical-vocabulary.strategy.js'),
);
const { ProgrammingTerminologyDomainStrategy } = require(
  path.join(distDir, 'modules/learning-library/domains/programming-terminology.strategy.js'),
);
const { LearningLibraryRepository } = require(
  path.join(distDir, 'modules/learning-library/learning-library.repository.js'),
);
const { LearningLibraryService } = require(
  path.join(distDir, 'modules/learning-library/learning-library.service.js'),
);

let passed = 0;
function check(cond, msg) {
  if (!cond) {
    console.error(`❌ FAILED: ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  passed++;
  console.log(`✅ PASSED: ${msg}`);
}

async function run() {
  console.log('🧪 Running Learning Library Unit & Integration Suite...\n');

  // ---------------------------------------------------------------------------
  // 1. Lexical Deduplication Tests
  // ---------------------------------------------------------------------------
  check(
    normalizeCanonicalKey('  “Low-Key!”  ') === 'low key',
    'normalizeCanonicalKey normalizes smart quotes, hyphens, outer punctuation & case',
  );
  check(
    normalizeSlugKey('low-key') === normalizeSlugKey('lowkey') &&
      normalizeSlugKey('low key') === 'lowkey',
    'normalizeSlugKey unifies hyphenated, spaced, and merged variants',
  );
  check(
    computeTokenSignature('cut someone some slack') === computeTokenSignature('cutting someone slack'),
    'computeTokenSignature catches placeholder & verb inflection variants',
  );
  check(
    computeTokenSignature('locked in') !== computeTokenSignature('locked out'),
    'computeTokenSignature preserves prepositions/particles so phrasal idioms do not collide',
  );

  const dedup = new LearningDeduplicationIndex([
    {
      expression: 'not gonna lie',
      variations: ['NGL', "ain't gonna lie"],
    },
    {
      expression: 'low-key',
      variations: ['lowkey'],
    },
    {
      expression: 'cut someone some slack',
      variations: ['cut me some slack'],
    },
  ]);

  check(dedup.isDuplicate('Not gonna lie!'), 'Exact case/punctuation duplicate caught');
  check(dedup.isDuplicate('NGL'), 'Alias variation duplicate ("NGL" from "not gonna lie") caught');
  check(dedup.isDuplicate('lowkey'), 'Merged slug duplicate ("lowkey" vs "low-key") caught');
  check(dedup.isDuplicate('low key'), 'Spaced duplicate ("low key" vs "low-key") caught');
  check(
    dedup.isDuplicate('cutting someone some slack'),
    'Inflectional duplicate ("cutting someone some slack") caught',
  );
  dedup.add({ expression: 'bite the bullet' });
  dedup.add({ expression: 'shoot your shot' });
  check(
    dedup.isDuplicate('biting the bullet'),
    'Silent-e inflectional duplicate ("biting the bullet" vs "bite the bullet") caught',
  );
  check(
    dedup.isDuplicate('shooting my shot'),
    'Pronoun+inflectional duplicate ("shooting my shot" vs "shoot your shot") caught',
  );
  check(!dedup.isDuplicate('bit'), 'Word "bit" does NOT falsely collide with "bite"');
  check(!dedup.isDuplicate('deadass'), 'Distinct slang ("deadass") accepted');
  check(!dedup.isDuplicate('locked in'), 'Distinct phrase ("locked in") accepted');
  check(!dedup.isDuplicate('say less'), 'Distinct conversational pattern ("say less") accepted');

  // ---------------------------------------------------------------------------
  // 2. JSON Salvage Tests
  // ---------------------------------------------------------------------------
  const fenced = 'Here you go:\n```json\n{"items":[{"expression":"bet","coreMeaning":"Agreement",}]}\n```';
  const parsedFenced = parseLearningGenerationResponse(fenced);
  check(
    parsedFenced.items.length === 1 && parsedFenced.items[0].expression === 'bet',
    'parseLearningGenerationResponse strips markdown fences and trailing commas',
  );

  const truncated = '{"items":[{"expression":"fair enough","coreMeaning":"Valid point","examples":[]},{"expression":"truncated_half","coreMeaning';
  const parsedTruncated = parseLearningGenerationResponse(truncated);
  check(
    parsedTruncated.items.length === 1 && parsedTruncated.items[0].expression === 'fair enough',
    'parseLearningGenerationResponse salvages complete objects from truncated LLM JSON',
  );

  // Incremental streaming extraction test
  const part1 = '{"items":[{"expression":"bet","coreMeaning":"Agreement","examples":[{"sentence":"Bet, see you at five."}]}';
  const inc1 = extractCompletedItemsSince(part1, 0);
  const part2 = part1 + ',{"expression":"say less","coreMeaning":"Got it immediately","examples":[]}]}';
  const inc2 = extractCompletedItemsSince(part2, inc1.nextIndex);
  check(
    inc1.items.length === 1 &&
      inc1.items[0].expression === 'bet' &&
      inc2.items.length === 1 &&
      inc2.items[0].expression === 'say less',
    'extractCompletedItemsSince streams completed items incrementally without duplicates',
  );

  // ---------------------------------------------------------------------------
  // 3. Domain Registry & Strategy Extensibility
  // ---------------------------------------------------------------------------
  const registry = new LearningDomainRegistry(
    new NaturalAmericanEnglishDomainStrategy(),
    new TechnicalVocabularyDomainStrategy(),
    new ProgrammingTerminologyDomainStrategy(),
  );

  check(
    registry.getDefaultDomainId() === 'natural_american_english',
    'Default domain is natural_american_english',
  );
  const nae = registry.getStrategy('natural_american_english');
  const expectedCats = [
    'fillers_hesitation',
    'discourse_markers',
    'connected_reductions',
    'modern_slang',
    'conversational_patterns',
    'creator_podcast',
    'tech_startup_casual',
    'idioms_phrasal_combos',
  ];
  check(
    expectedCats.every((id) => nae.metadata.categories.some((c) => c.id === id)),
    'Natural American English strategy exposes all 8 core expression categories',
  );

  // Register a dynamic custom domain at runtime to prove Open/Closed scalability
  registry.register({
    id: 'medical_english',
    metadata: {
      id: 'medical_english',
      title: 'Medical English',
      subtitle: 'Clinical phrasing',
      badge: 'Clinical',
      isDefault: false,
      itemNounSingular: 'clinical phrase',
      itemNounPlural: 'clinical phrases',
      supportsSpokenMechanics: true,
      registers: ['Bedside'],
      suggestedFocusTopics: ['Patient intake'],
      categories: [
        {
          id: 'patient_intake',
          label: 'Patient Intake',
          description: 'Bedside questioning',
          promptGuidance: 'Keep natural',
        },
      ],
      uiLabels: nae.metadata.uiLabels,
    },
    buildGenerationPrompts: (ctx) => nae.buildGenerationPrompts(ctx),
    normalizeCandidate: (raw, ctx) => nae.normalizeCandidate(raw, ctx),
  });
  check(
    registry.listDomains().some((d) => d.id === 'medical_english'),
    'LearningDomainRegistry supports pluggable domain extension with zero core edits',
  );

  let unknownRejected = false;
  try {
    registry.getStrategy('non_existent_domain');
  } catch {
    unknownRejected = true;
  }
  check(unknownRejected, 'Unknown domain rejects cleanly');

  // ---------------------------------------------------------------------------
  // 4. Repository + Service Smart Top-Up, Zero-Duplicate DB Enforcement & Isolation
  // ---------------------------------------------------------------------------
  const tempDb = path.join(os.tmpdir(), `flaptap-ll-unit-${Date.now()}.sqlite`);
  process.env.FLAPTAP_SQLITE_PATH = tempDb;

  const sqlite = new SqliteService();
  const authService = new AuthService(sqlite);
  const userA = authService.register({
    name: 'Tester A',
    email: `ll_a_${Date.now()}@flaptap.test`,
    password: 'Password123!',
    nativeLanguage: 'ar',
  }).user;
  const userB = authService.register({
    name: 'Tester B',
    email: `ll_b_${Date.now()}@flaptap.test`,
    password: 'Password123!',
    nativeLanguage: 'es',
  }).user;

  const repository = new LearningLibraryRepository(sqlite);

  // Stub AiProvidersService that intentionally returns duplicates on multi-call / tests parallel streaming
  let callNum = 0;
  let capturedPrompts = [];
  const stubAiProviders = {
    hasAnyConfiguredKey: () => true,
    getDefaultSummary: () => ({
      configured: true,
      provider: 'OpenCode Go',
      model: 'gpt-5.6-luna',
      keyId: 'env:OPENCODE_GO_API_KEY',
    }),
    resolveExecutionSelection: async () => ({
      key: {
        id: 'env:OPENCODE_GO_API_KEY',
        providerId: 'opencode-go',
        providerName: 'OpenCode Go',
      },
      modelId: 'gpt-5.6-luna',
      variantId: 'none',
    }),
    executeChat: async (_userId, req) => {
      callNum++;
      capturedPrompts.push({ sys: req.systemPrompt, usr: req.userPrompt });

      if (callNum === 1) {
        return {
          content: JSON.stringify({
            items: [
              {
                expression: 'not gonna lie',
                categoryId: 'conversational_patterns',
                register: 'Friends & Gen-Z',
                tone: 'candid',
                level: 'Native Everyday',
                ipa: '/nɑt ɡənə laɪ/',
                spokenForm: 'nɑɾəna laɪ / NGL',
                phoneticBreakdown: '"going to" reduces to "gonna" with weak schwa.',
                coreMeaning: 'Softens an honest opinion or slight confession casually.',
                localizedMeaning: 'بصراحة / عشان أكون صريح',
                textbookEquivalent: 'To tell you the truth',
                nativeContext: 'Used with friends, coworkers on Slack, or podcasts.',
                mistakesToAvoid: 'Avoid in formal legal or executive board reports.',
                variations: ['NGL', "ain't gonna lie"],
                combinations: ['NGL, that was clutch', 'not gonna lie though'],
                usagePatterns: [
                  { pattern: 'Not gonna lie, [clause]', meaning: 'Introduces candid take', example: 'Not gonna lie, I completely forgot.' },
                ],
                examples: [
                  { speakerContext: 'Friends Chat', sentence: 'Not gonna lie, that coffee hit different today.', explanation: 'Casual enthusiasm' },
                  { speakerContext: 'Tech Slack', sentence: 'NGL, that refactor saved us hours.', explanation: 'Friendly candid praise' },
                ],
                relatedExpressions: ['to be totally honest', 'low-key'],
              },
              {
                expression: 'how do I put this',
                categoryId: 'fillers_hesitation',
                register: 'Everyday Spoken',
                tone: 'thoughtful',
                coreMeaning: 'Buys thinking time before phrasing something delicate or tricky.',
                localizedMeaning: 'أقولها إزاي / إزاي أوصفها',
                textbookEquivalent: 'Let me think how to say this',
                variations: ['how should I put this', 'how do I say this'],
                combinations: ['how do I put this nicely'],
                usagePatterns: [{ pattern: 'How do I put this... [careful statement]', meaning: 'Tactful hesitation', example: 'How do I put this—the UI feels a little crowded.' }],
                examples: [{ speakerContext: 'Team Huddle', sentence: 'How do I put this—the rollout was kinda rough.', explanation: 'Softens critique' }],
              },
            ],
          }),
          modelUsed: 'gpt-5.6-luna',
          executionTimeMs: 120,
        };
      }

      if (callNum === 2) {
        return {
          content: JSON.stringify({
            items: [
              { expression: 'Not Gonna Lie!', categoryId: 'conversational_patterns', coreMeaning: 'dup 1', examples: [] },
              { expression: 'NGL', categoryId: 'modern_slang', coreMeaning: 'dup alias', examples: [] },
              {
                expression: 'that being said',
                categoryId: 'discourse_markers',
                register: 'Everyday Spoken',
                coreMeaning: 'Pivots smoothly to a caveat or contrasting angle.',
                localizedMeaning: 'ومع ذلك / بس برضو',
                variations: ['with that being said', 'having said that'],
                combinations: ['that being said, though'],
                usagePatterns: [{ pattern: 'That being said, [contrast]', meaning: 'Balanced transition', example: 'That being said, let us test it.' }],
                examples: [{ speakerContext: 'Podcast', sentence: 'The latency is great; that being said, memory spiked.', explanation: 'Balanced nuance' }],
              },
            ],
          }),
          modelUsed: 'gpt-5.6-luna',
          executionTimeMs: 110,
        };
      }

      if (callNum === 3) {
        return {
          content: JSON.stringify({
            items: [
              {
                expression: 'outta pocket',
                categoryId: 'modern_slang',
                register: 'Friends & Gen-Z',
                coreMeaning: 'Acting way out of line, wild, or crossing social boundaries.',
                localizedMeaning: 'تصرف غريب أو زيادة عن اللزوم',
                variations: ['out of pocket'],
                combinations: ['wildly outta pocket', 'that was outta pocket'],
                usagePatterns: [{ pattern: '[Subject] is outta pocket for [doing X]', meaning: 'Calls out wild behavior', example: 'He was outta pocket for sending that at 2am.' }],
                examples: [{ speakerContext: 'Friends Chat', sentence: 'Bro, canceling ten minutes before is outta pocket.', explanation: 'Calls out rude move' }],
              },
            ],
          }),
          modelUsed: 'gpt-5.6-luna',
          executionTimeMs: 95,
        };
      }

      // Parallel sharding test (calls 4 & 5 for count=8 -> two 4-item sharded workers!)
      const chunkOffset = callNum === 4 ? 0 : 4;
      const sampleNames = [
        'sanity check',
        'read the room',
        'locked in',
        'hits different',
        'fair enough',
        'touch grass',
        'double down on',
        'low-key',
      ];
      return {
        content: JSON.stringify({
          items: sampleNames.slice(chunkOffset, chunkOffset + 4).map((expr) => ({
            expression: expr,
            categoryId: callNum === 4 ? 'fillers_hesitation' : 'modern_slang',
            register: 'Everyday Spoken',
            coreMeaning: `Natural usage of ${expr}`,
            localizedMeaning: 'تعبير يومي طبيعي',
            variations: [`${expr} var 1`, `${expr} var 2`],
            combinations: [`${expr} combo 1`, `${expr} combo 2`],
            usagePatterns: [{ pattern: `${expr} [clause]`, meaning: 'Natural pattern', example: `We should ${expr} right now.` }],
            examples: [
              { speakerContext: 'Friends', sentence: `Honestly ${expr} is super common.`, explanation: 'Natural' },
              { speakerContext: 'Podcast', sentence: `Everyone kept saying ${expr} yesterday.`, explanation: 'Natural' },
            ],
          })),
        }),
        modelUsed: 'gpt-5.6-luna',
        executionTimeMs: 85,
      };
    },
  };

  const stubWordLookup = {
    defineWordInContext: async (req) => ({
      term: req.word,
      ipa: '/tɛst/',
      partOfSpeech: 'noun',
      definition: 'Test def',
      generalTranslation: 'عام',
      translation: 'سياقي',
      targetLanguage: 'ar',
      targetLanguageName: 'Arabic',
      rtl: true,
      spokenTip: 'Tip',
      contextSentence: req.contextSentence,
      sentenceIndex: 1,
      timestampSec: 0,
    }),
  };

  const service = new LearningLibraryService(
    registry,
    repository,
    stubAiProviders,
    stubWordLookup,
  );

  // Batch 1: Request 2 items directly via AiClient
  const gen1 = await service.generateItems(userA.id, {
    domainId: 'natural_american_english',
    count: 2,
  });
  check(
    gen1.items.length === 2 &&
      gen1.fulfilledCount === 2 &&
      gen1.batch.modelName === 'gpt-5.6-luna',
    'Batch 1 generated and persisted exact requested count (2 items) via Direct OpenCode Go AiClient',
  );

  // Batch 2: Request 2 MORE items -> call 2 returns 2 duplicates + 1 unique, triggers top-up call 3!
  const gen2 = await service.generateItems(userA.id, {
    domainId: 'natural_american_english',
    count: 2,
  });
  check(
    callNum === 3 &&
      gen2.items.length === 2 &&
      gen2.skippedDuplicatesCount >= 2 &&
      capturedPrompts[1].usr.includes('not gonna lie'),
    `Batch 2 injected exclusion list, blocked ${gen2.skippedDuplicatesCount} duplicates, and topped up via pass 3 to deliver 2 unique new items`,
  );

  // Batch 3: Parallel sharded streaming test (count=8 -> 2 concurrent 4-item chunks + SSE callbacks)
  let startedEvent = null;
  const chunkEvents = [];
  const gen3 = await service.generateItems(
    userA.id,
    { domainId: 'natural_american_english', count: 8 },
    'ar',
    {
      onStarted: (ev) => {
        startedEvent = ev;
      },
      onChunk: (ev) => {
        chunkEvents.push(ev);
      },
    },
  );
  check(
    startedEvent?.chunksPlanned === 2 &&
      chunkEvents.length === 2 &&
      gen3.items.length === 8 &&
      capturedPrompts[3]?.sys === capturedPrompts[4]?.sys &&
      capturedPrompts[3]?.usr !== capturedPrompts[4]?.usr,
    `Parallel category-sharded stream planned 2 concurrent chunks with static cacheable systemPrompt, delivered ${chunkEvents.length} live chunk events, and saved 8/8 unique items`,
  );

  // Verify User A total count is 12 unique items (2 + 2 + 8)
  const listA = service.listLibrary(userA.id, { domainId: 'natural_american_english' });
  check(listA.totalCount === 12, `User A library persisted 12 unique items (got ${listA.totalCount})`);

  // Verify User B is completely isolated (0 items)
  const listB = service.listLibrary(userB.id, { domainId: 'natural_american_english' });
  check(listB.totalCount === 0, 'User B library strictly isolated (0 items)');

  // Verify search across variations/combinations/examples
  const searchNgl = service.listLibrary(userA.id, {
    domainId: 'natural_american_english',
    q: "ain't gonna lie",
  });
  check(
    searchNgl.items.length === 1 && searchNgl.items[0].expression === 'not gonna lie',
    'Full-text search finds items by variation ("ain\'t gonna lie" -> "not gonna lie")',
  );

  // Verify update mastery, favorite, notes
  const targetId = listA.items[0].id;
  const updated = service.updateItem(userA.id, targetId, {
    isFavorite: true,
    masteryStatus: 'mastered',
    incrementReview: true,
    userNotes: 'Practice this with fast reduction',
  });
  check(
    updated.isFavorite === true &&
      updated.masteryStatus === 'mastered' &&
      updated.reviewCount === 1 &&
      updated.userNotes.includes('fast reduction'),
    'Item mastery, favorite, reviewCount & userNotes persisted in SQLite',
  );

  // Verify User B cannot mutate User A's item
  let crossUserBlocked = false;
  try {
    service.updateItem(userB.id, targetId, { isFavorite: false });
  } catch {
    crossUserBlocked = true;
  }
  check(crossUserBlocked, 'Cross-user item mutation strictly rejected');

  // Verify export & delete
  const exported = service.exportLibrary(userA.id, 'natural_american_english');
  check(
    exported.itemsCount === 12 && exported.batchesCount === 3,
    `Export returns full persisted library items and batch records (items=${exported.itemsCount}, batches=${exported.batchesCount})`,
  );

  // Verify user deletion cascades cleanly to learning_library_items and learning_library_batches
  authService.deleteAccount(userA.id);
  const remainingA = sqlite.db
    .prepare('SELECT COUNT(*) AS cnt FROM learning_library_items WHERE user_id = ?')
    .get(userA.id);
  check(
    Number(remainingA.cnt) === 0,
    'Deleting user account cascades cleanly to delete all Learning Library items',
  );

  const http = require('http');
  const { OpenAiCompatibleAdapter } = require(
    path.join(distDir, 'modules/ai-providers/adapters/openai-compatible.adapter.js'),
  );

  // Verify OpenAiCompatibleAdapter recovers cleanly from empty SSE / length-truncated reasoning
  const adapter = new OpenAiCompatibleAdapter();
  let mockReqCount = 0;
  const seenPayloads = [];
  const mockServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      mockReqCount++;
      const parsed = JSON.parse(body || '{}');
      seenPayloads.push(parsed);
      if (mockReqCount === 1) {
        // Simulate reasoning model exhausting max_tokens before content output
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(
          'data: {"choices":[{"delta":{"reasoning_content":"thinking..."},"finish_reason":"length"}]}\n\n',
        );
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: '{"items":[{"expression":"ship fast"}]}' } }],
        }),
      );
    });
  });

  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const mockPort = mockServer.address().port;
  try {
    const recovered = await adapter.executeChat(
      {
        id: 'test-key',
        providerId: 'openai',
        providerName: 'MockOpenAI',
        protocol: 'openai-compatible',
        label: 'Test',
        displayName: 'Mock',
        source: 'env',
        baseUrl: `http://127.0.0.1:${mockPort}`,
        isDefault: true,
        deletable: false,
        apiKey: 'sk-test',
        fingerprint: 'fp-test',
      },
      {
        model: 'gpt-5.6-luna',
        variant: 'high',
        supportsTemperature: false,
        systemPrompt: 'sys',
        userPrompt: 'usr',
        temperature: 0.5,
        json: true,
      },
    );
    check(
      mockReqCount === 2 &&
        seenPayloads[0].temperature === undefined &&
        seenPayloads[0].max_tokens >= 16384 &&
        seenPayloads[1].max_tokens >= 24576 &&
        recovered.content.includes('ship fast'),
      'OpenAiCompatibleAdapter skips temperature when unsupported, enforces >=16384 max_tokens on Deep tier, and auto-recovers from length-truncated empty responses',
    );
  } finally {
    mockServer.close();
  }

  sqlite.onModuleDestroy();
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      if (fs.existsSync(tempDb + suffix)) fs.unlinkSync(tempDb + suffix);
    } catch {}
  }

  console.log(`\n🎉 ALL ${passed} LEARNING LIBRARY UNIT & INTEGRATION TESTS PASSED!\n`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
