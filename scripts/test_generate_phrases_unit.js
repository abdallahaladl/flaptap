/**
 * Fast Offline Unit Test Suite for Shared Linguistic/Translation Rules,
 * Generate Phrases Normalization, FlaptapPhraseUtils, and FlaptapStudyDock.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const {
  SHARED_CEFR_LEVELS,
  SHARED_STUDY_GOALS,
  normalizeCefrTag,
  buildTermTranslationGuidance,
  buildSentenceTranslationGuidance,
} = require(path.join(ROOT, 'backend/dist/core/ai/translation-rules.util'));
const { getLanguage } = require(path.join(ROOT, 'backend/dist/core/ai/languages'));
const { NaturalAmericanEnglishDomainStrategy } = require(path.join(
  ROOT,
  'backend/dist/modules/learning-library/domains/natural-american-english.strategy',
));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASSED: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAILED: ${name}\n   ${err?.message || err}`);
    failed++;
  }
}

// 1. Shared Backend Translation Rules & CEFR Helpers
test('SHARED_CEFR_LEVELS and SHARED_STUDY_GOALS expose complete catalogs', () => {
  assert(SHARED_CEFR_LEVELS.length >= 10);
  assert(SHARED_STUDY_GOALS.length >= 4);
  assert.strictEqual(SHARED_CEFR_LEVELS[0].id, 'all');
  assert.strictEqual(SHARED_STUDY_GOALS[0].id, 'full');
});

test('normalizeCefrTag extracts clean CEFR tags from diverse strings', () => {
  assert.strictEqual(normalizeCefrTag('b2'), 'B2');
  assert.strictEqual(normalizeCefrTag('CEFR C1 · Advanced'), 'C1');
  assert.strictEqual(normalizeCefrTag('a1'), 'A1');
  assert.strictEqual(normalizeCefrTag('Native Fluency'), '');
  assert.strictEqual(normalizeCefrTag(''), '');
});

test('buildTermTranslationGuidance outputs Egyptian Arabic rules with slot preservation', () => {
  const ar = getLanguage('ar');
  const rule = buildTermTranslationGuidance(ar, { preserveSlots: true, multiSense: false });
  assert(rule.includes('عامية مصرية'));
  assert(rule.includes('[X]'));
  const en = getLanguage('en');
  assert(buildTermTranslationGuidance(en).includes('English only'));
});

test('buildSentenceTranslationGuidance covers example & pattern fields idiomatic Arabic', () => {
  const ar = getLanguage('ar');
  const rule = buildSentenceTranslationGuidance(ar, [
    'examples[].translation',
    'usagePatterns[].exampleTranslation',
  ]);
  assert(rule.includes('"examples[].translation"'));
  assert(rule.includes('"usagePatterns[].exampleTranslation"'));
  assert(rule.includes('عامية مصرية'));
});

// 2. Domain Strategy Normalization (Translations + CEFR + Slots)
test('NaturalAmericanEnglishDomainStrategy preserves example translations, pattern translations, and CEFR', () => {
  const strategy = new NaturalAmericanEnglishDomainStrategy();
  const ctx = {
    domainId: 'natural_american_english',
    requestedCount: 3,
    askCount: 3,
    categoryFilter: 'all',
    focusTopic: '',
    preferredRegister: '',
    level: 'b2',
    studyGoal: 'speaking',
    targetLanguageCode: 'ar',
    targetLanguageName: 'Arabic',
    targetLanguageNative: 'العربية',
    excludedExpressions: [],
  };
  const bundle = strategy.buildGenerationPrompts(ctx);
  assert(bundle.systemPrompt.includes('"cefr"'));
  assert(bundle.systemPrompt.includes('"exampleTranslation"'));
  assert(bundle.userPrompt.includes('Sentence translations:'));
  assert(bundle.userPrompt.includes('Learner level (CEFR):'));
  assert(bundle.userPrompt.includes('Study goal:'));

  const normalized = strategy.normalizeCandidate(
    {
      expression: 'double down on [X]',
      categoryId: 'idioms_phrasal_combos',
      register: 'Tech Casual',
      cefr: 'b2',
      level: 'Upper Intermediate',
      ipa: '/ˈdʌbəl daʊn ɑn/',
      spokenForm: 'double down on testing',
      coreMeaning: 'Commit even more strongly to an existing plan.',
      localizedMeaning: 'تضاعف تركيزك على [X]',
      patternSlots: [{ slot: 'X', role: 'project or strategy', example: 'reliability' }],
      usagePatterns: [
        {
          pattern: 'double down on [X]',
          meaning: 'invest harder',
          example: 'We decided to double down on reliability.',
          exampleTranslation: 'قررنا نضاعف تركيزنا على الاعتمادية.',
        },
      ],
      examples: [
        {
          speakerContext: 'Planning meeting',
          sentence: 'Let us double down on latency this sprint.',
          translation: 'خلّينا نضاعف تركيزنا على الـ latency في السبرنت ده.',
          explanation: 'Signals renewed priority.',
        },
      ],
    },
    ctx,
  );

  assert(normalized);
  assert.strictEqual(normalized.cefr, 'B2');
  assert.strictEqual(
    normalized.examples[0].translation,
    'خلّينا نضاعف تركيزنا على الـ latency في السبرنت ده.',
  );
  assert.strictEqual(
    normalized.usagePatterns[0].exampleTranslation,
    'قررنا نضاعف تركيزنا على الاعتمادية.',
  );
});

// 3. Shared Frontend Deep Modules (FlaptapPhraseUtils & FlaptapStudyDock)
function loadFrontendScript(relPath, sandbox) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  vm.runInNewContext(code, sandbox);
}

const sandbox = { window: {}, document: {}, console };
sandbox.window = sandbox;
loadFrontendScript('frontend/shared-utils.js', sandbox);
loadFrontendScript('frontend/phrase-utils.js', sandbox);
loadFrontendScript('frontend/study-dock.js', sandbox);

test('FlaptapPhraseUtils isolates [X] slots with <bdi dir="ltr"> and detects RTL', () => {
  const PU = sandbox.FlaptapPhraseUtils;
  assert.strictEqual(PU.isRtlLanguage('ar'), true);
  assert.strictEqual(PU.isRtlLanguage('en'), false);
  const slotHtml = PU.formatSlotizedText('مفيش معايا [X]');
  assert(slotHtml.includes('<bdi class="ll-slot" dir="ltr">[X]</bdi>'));
  const highlighted = PU.highlightTermInSentence('We are running outta time.', ['outta']);
  assert(highlighted.includes('<mark class="lexicon-highlight">outta</mark>'));
});

test('FlaptapStudyDock renders Botanical Emerald progress ring + clickable pips + done checkmark', () => {
  const Dock = sandbox.FlaptapStudyDock;
  const inProgressHtml = Dock.renderProgressDeckHtml({
    total: 10,
    done: 3,
    singular: 'expression',
    plural: 'expressions',
    pipAttr: 'data-ll-jump-id',
    pips: [
      { id: '1', displayNumber: 1, label: 'outta [X]', done: true },
      { id: '2', displayNumber: 2, label: 'locked in', done: false },
    ],
  });
  assert(inProgressHtml.includes('30%'));
  assert(inProgressHtml.includes('7 expressions left to master'));
  assert(inProgressHtml.includes('data-ll-jump-id="1"'));
  assert(inProgressHtml.includes('data-sp-completed>3</strong>'));

  const doneHtml = Dock.renderProgressDeckHtml({
    total: 2,
    done: 2,
    doneHeadline: 'Collection completed',
    pips: [],
  });
  assert(doneHtml.includes('is-done'));
  assert(doneHtml.includes('Collection completed'));
});

console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
