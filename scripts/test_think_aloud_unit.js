#!/usr/bin/env node
/**
 * Flaptap — Think Aloud Unit Test Suite
 * Verifies:
 *  - Deterministic fluency metrics (WPM, fillers, 4/3/2 speed gain %, taboo hits, uniqueWordRatio)
 *  - 5-tier Automaticity Stage calculation & progress %
 *  - AI Coaching Report normalization & clamping
 *  - ThinkAloudRepository against isolated temp SQLite:
 *    CRUD, strict user_id isolation, daily 3-step ritual derivation,
 *    child-derived spine pack completion, and practice_logs + streak_days update
 *  - frontend-routes.ts route resolution for /think, /think/spines, /think/sessions, /think/session/:id
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const distRoot = path.resolve(__dirname, '../backend/dist');

const {
  computeFluencyMetrics,
  computeAutomaticityStage,
  normalizeCoachingReport,
  detectFillers,
  detectForbiddenWords,
  BUILT_IN_SPINE_PACKS,
} = require(path.join(distRoot, 'modules/think-aloud/think-aloud.catalog.js'));

const {
  isWorkspacePagePath,
  resolveFrontendEntryFile,
} = require(path.join(distRoot, 'core/config/frontend-routes.js'));

const { SqliteService } = require(path.join(distRoot, 'core/database/sqlite.service.js'));
const { ThinkAloudRepository } = require(path.join(
  distRoot,
  'modules/think-aloud/think-aloud.repository.js',
));

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ PASSED: ${name}`);
  } catch (err) {
    console.error(`❌ FAILED: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('\n🧪 Running Think Aloud Unit Suite...\n');

// 1. Fluency Metrics & 4/3/2 Speed Gain
test('computeFluencyMetrics computes WPM, filler rates, uniqueWordRatio, and 4/3/2 wpmGainPct', () => {
  const rounds = [
    {
      roundIndex: 1,
      label: 'Round 1 (90s)',
      targetDurationSec: 90,
      actualDurationSec: 60,
      transcript:
        'Um I think SQLite is, like, really great because it keeps everything in one process and avoids network hops.',
    },
    {
      roundIndex: 2,
      label: 'Round 2 (60s)',
      targetDurationSec: 60,
      actualDurationSec: 40,
      transcript:
        'Honestly, SQLite beats premature distributed databases because keeping reads local eliminates network latency and operational overhead.',
    },
    {
      roundIndex: 3,
      label: 'Round 3 (45s)',
      targetDurationSec: 45,
      actualDurationSec: 25,
      transcript:
        'SQLite wins early on because local reads cut latency in half without extra moving parts or cluster maintenance.',
    },
  ];

  const metrics = computeFluencyMetrics('four_three_two', rounds);
  assert.strictEqual(metrics.rounds.length, 3);
  assert(metrics.totalWords > 45, `Expected >45 totalWords, got ${metrics.totalWords}`);
  assert(metrics.rounds[2].wpm > metrics.rounds[0].wpm, 'Round 3 WPM should exceed Round 1 WPM');
  assert(metrics.wpmGainPct > 0, `Expected positive 4/3/2 wpmGainPct, got ${metrics.wpmGainPct}`);
  assert(metrics.rounds[0].fillerCount >= 2, 'Should detect um and hedging like in Round 1');
  assert.strictEqual(metrics.rounds[2].fillerCount, 0, 'Clean Round 3 should have 0 fillers');
  assert(metrics.uniqueWordRatio > 0.5 && metrics.uniqueWordRatio <= 1);
});

// 2. Filler detection doesn't penalize valid "I like coffee"
test('detectFillers distinguishes hedging "like" from normal verb usage', () => {
  const normal = detectFillers('I like building local software because it feels fast.');
  assert.strictEqual(normal.length, 0);

  const hedged = detectFillers('Um, like, you know, I basically tried to ship it.');
  assert(hedged.length >= 3, `Expected >=3 fillers, got ${hedged.length}`);
});

// 3. Circumlocution Taboo Forbidden Word Detection
test('detectForbiddenWords catches exact and inflected forbidden words', () => {
  const hits = detectForbiddenWords(
    'It is when a server caches responses so users do not wait.',
    ['cache', 'latency', 'database'],
  );
  assert.deepStrictEqual(hits, ['cache']);

  const clean = detectForbiddenWords(
    'It keeps frequently requested data close to memory so pages load right away.',
    ['cache', 'latency', 'database'],
  );
  assert.deepStrictEqual(clean, []);
});

// 4. 5 Automaticity Stages
test('computeAutomaticityStage progresses across all 5 tiers cleanly', () => {
  const s1 = computeAutomaticityStage({ totalSessions: 0, avgWpm: 0, avgDirectness: 0 });
  const s2 = computeAutomaticityStage({ totalSessions: 4, avgWpm: 92, avgDirectness: 60 });
  const s3 = computeAutomaticityStage({ totalSessions: 9, avgWpm: 110, avgDirectness: 70 });
  const s4 = computeAutomaticityStage({ totalSessions: 16, avgWpm: 125, avgDirectness: 80 });
  const s5 = computeAutomaticityStage({ totalSessions: 28, avgWpm: 142, avgDirectness: 90 });

  assert.strictEqual(s1.stage, 1);
  assert.strictEqual(s2.stage, 2);
  assert.strictEqual(s3.stage, 3);
  assert.strictEqual(s4.stage, 4);
  assert.strictEqual(s5.stage, 5);
  assert.strictEqual(s5.progressPct, 100);
});

// 5. Coaching Report Normalization & Clamping
test('normalizeCoachingReport clamps out-of-range scores and preserves valid upgrades', () => {
  const report = normalizeCoachingReport(
    {
      directnessScore: 140,
      flowScore: -12,
      structureScore: 84,
      naturalnessScore: 'not-a-number',
      headlineVerdict: 'Strong clear argument.',
      calquesAndUpgrades: [
        {
          original: 'make a big problem',
          issueType: 'calque',
          whyUnnatural: 'Literal translation phrasing',
          naturalUpgrade: 'create a major bottleneck',
          spokenIpa: '/kriˈeɪt ə ˈmeɪdʒər ˈbɑːtəlnɛk/',
          exampleSentence: 'Polling every second will create a major bottleneck.',
        },
        { original: 'missing upgrade', naturalUpgrade: '' },
      ],
      shadowableRecast: 'Honestly, keeping state in SQLite avoids unnecessary network hops.',
      extractedChunks: [
        {
          phrase: 'moving parts',
          patternSlot: 'without extra [moving parts]',
          ipa: '/ˈmuvɪŋ ˈpɑːrts/',
          meaning: 'components that can fail',
          localizedMeaning: 'أجزاء متحركة',
          whenToUse: 'Explaining simplicity',
          example: 'We cut latency without adding extra moving parts.',
        },
      ],
    },
    'Fallback transcript',
  );

  assert.strictEqual(report.directnessScore, 100);
  assert.strictEqual(report.flowScore, 0);
  assert.strictEqual(report.structureScore, 84);
  assert.strictEqual(report.naturalnessScore, 70);
  assert.strictEqual(report.calquesAndUpgrades.length, 1);
  assert.strictEqual(report.extractedChunks.length, 1);
});

// 6. Clean URL Route Registry
test('frontend-routes resolves /think and subroutes cleanly', () => {
  assert.strictEqual(isWorkspacePagePath('/think'), true);
  assert.strictEqual(isWorkspacePagePath('/think/spines'), true);
  assert.strictEqual(isWorkspacePagePath('/think/sessions'), true);
  assert.strictEqual(isWorkspacePagePath('/think/session/ta_abc123'), true);
  assert.strictEqual(isWorkspacePagePath('/spontaneous'), true);
  assert.strictEqual(resolveFrontendEntryFile('/think/spines'), 'index.html');
});

// 7. Repository Isolation, Derived Daily 3-Step Ritual, Streak & Spine Completion
test('ThinkAloudRepository enforces strict user isolation, derives daily ritual, updates streaks, and computes spine completion', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaptap-ta-test-'));
  const tmpDb = path.join(tmpDir, 'test.sqlite');
  process.env.FLAPTAP_SQLITE_PATH = tmpDb;

  const sqlite = new SqliteService();
  const repo = new ThinkAloudRepository(sqlite);

  try {
    const now = new Date().toISOString();
    sqlite.db
      .prepare(
        `INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run('user_a', 'a@test.local', 'User A', 'hash', now);
    sqlite.db
      .prepare(
        `INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run('user_b', 'b@test.local', 'User B', 'hash', now);

    // Save 3 sessions for User A covering all 3 daily ritual steps
    const modesToSave = ['circumlocution', 'four_three_two', 'camera_qa'];
    const savedIds = [];
    for (const mode of modesToSave) {
      const rounds = [{ roundIndex: 1, label: 'R1', targetDurationSec: 45, actualDurationSec: 40, transcript: 'Clear direct English speech with zero mental translation.' }];
      const metrics = computeFluencyMetrics(mode, rounds);
      const coaching = normalizeCoachingReport(
        { directnessScore: 82, flowScore: 79, structureScore: 85, naturalnessScore: 80 },
        rounds[0].transcript,
      );
      const rec = repo.saveSession({
        userId: 'user_a',
        mode,
        domain: 'programming_ai',
        cefrLevel: 'B2',
        frameworkId: 'what_so_what_now_what',
        promptTitle: `Prompt for ${mode}`,
        promptBody: 'Explain clearly.',
        promptMeta: {},
        inputMode: 'mic',
        rounds: metrics.rounds,
        metrics,
        coaching,
        modelUsed: 'test-model',
        nativeLanguage: 'ar',
      });
      savedIds.push(rec.id);
    }

    // Check User A overview & derived 3/3 daily ritual
    const ovA = repo.getOverviewMetrics('user_a');
    assert.strictEqual(ovA.totalSessions, 3);
    assert.strictEqual(ovA.dailyRitual.completedCount, 3);
    assert.strictEqual(ovA.dailyRitual.isComplete, true);

    // Check streak_days & practice_logs updated for User A
    const userARow = sqlite.db.prepare('SELECT streak_days FROM users WHERE id = ?').get('user_a');
    assert.strictEqual(userARow.streak_days, 1);
    const logsCount = sqlite.db
      .prepare("SELECT COUNT(*) AS cnt FROM practice_logs WHERE user_id = ? AND mode = 'think_aloud'")
      .get('user_a');
    assert.strictEqual(logsCount.cnt, 3);

    // Strict User Isolation: User B sees 0 sessions and cannot read or delete User A's sessions
    const listB = repo.listSessions('user_b');
    assert.strictEqual(listB.total, 0);
    assert.strictEqual(repo.getSessionById('user_b', savedIds[0]), null);
    assert.strictEqual(repo.deleteSession('user_b', savedIds[0]), false);

    // Built-in Spine pack child-derived completion
    const firstBuiltIn = BUILT_IN_SPINE_PACKS[0];
    const firstItemId = firstBuiltIn.starters[0].id;
    const toggled = repo.toggleSpineItemPracticed('user_a', firstBuiltIn.id, firstItemId);
    assert.strictEqual(toggled.practicedCount, 1);
    assert.strictEqual(toggled.isCompleted, false);

    // User B should still see 0 practiced on that built-in pack
    const spinesB = repo.listSpinePacks('user_b');
    const samePackForB = spinesB.find((p) => p.id === firstBuiltIn.id);
    assert.strictEqual(samePackForB.practicedCount, 0);

    // Custom Spine Pack save + full derived completion
    const customPack = repo.saveSpinePack({
      userId: 'user_a',
      title: 'AI Latency Defense',
      domain: 'programming_ai',
      topic: 'Latency',
      starters: [{ id: 'cs1', text: 'From an architecture standpoint,' }],
      engines: [{ id: 'ce1', text: 'the bottleneck is [X]' }],
      tails: [{ id: 'ct1', text: 'without extra moving parts.' }],
      chunks: [],
      modelUsed: 'test-model',
    });
    assert.strictEqual(customPack.totalItems, 3);
    assert.strictEqual(customPack.isCompleted, false);
    repo.toggleSpineItemPracticed('user_a', customPack.id, 'cs1');
    repo.toggleSpineItemPracticed('user_a', customPack.id, 'ce1');
    const donePack = repo.toggleSpineItemPracticed('user_a', customPack.id, 'ct1');
    assert.strictEqual(donePack.practicedCount, 3);
    assert.strictEqual(donePack.isCompleted, true);
    assert.strictEqual(repo.deleteSpinePack('user_b', customPack.id), false);
    assert.strictEqual(repo.deleteSpinePack('user_a', customPack.id), true);
  } finally {
    sqlite.onModuleDestroy();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.FLAPTAP_SQLITE_PATH;
  }
});

console.log(`\n🎉 Think Aloud Unit Suite Complete: ${passed}/${passed} tests passed.\n`);
