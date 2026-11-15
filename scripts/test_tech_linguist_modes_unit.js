/**
 * Offline Unit & Contract Test Suite for Modular Tech Lexicon Modes
 * Tests backend strategies, registry, lexical deduplication, JSON salvage,
 * and frontend tech-lexicon-modes.js helpers.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const distBase = path.resolve(__dirname, '../backend/dist/modules/tech-linguist');
const {
  enforceStrictTwoListSeparation,
  isWordCoveredByIdiom,
  phrasesAreDuplicate,
  tokensShareInflection,
} = require(path.join(distBase, 'utils/lexical-dedup.util.js'));
const { parseExtractionResponse } = require(path.join(distBase, 'utils/json-salvage.util.js'));
const { cleanAsrTranscript } = require(path.join(distBase, 'utils/transcript-cleaner.util.js'));
const { ComprehensiveModeStrategy } = require(path.join(distBase, 'modes/comprehensive-mode.strategy.js'));
const { AdvancedNativeModeStrategy } = require(path.join(distBase, 'modes/advanced-native-mode.strategy.js'));
const { ExtractionModeRegistry } = require(path.join(distBase, 'modes/extraction-mode.registry.js'));

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}\n   ${err.stack || err.message}`);
    process.exitCode = 1;
  }
}

console.log('🧪 Running Tech Lexicon Modular Modes Unit Suite...\n');

test('tokensShareInflection handles inflections accurately without false positives', () => {
  assert.strictEqual(tokensShareInflection('corner', 'corners'), true);
  assert.strictEqual(tokensShareInflection('spill', 'spilling'), true);
  assert.strictEqual(tokensShareInflection('cut', 'cutting'), true);
  assert.strictEqual(tokensShareInflection('ghost', 'ghosted'), true);
  assert.strictEqual(tokensShareInflection('leverage', 'leveraged'), true);
  assert.strictEqual(tokensShareInflection('double', 'doubling'), true);
  assert.strictEqual(tokensShareInflection('art', 'architecture'), false);
  assert.strictEqual(tokensShareInflection('rate', 'corporate'), false);
});

test('phrasesAreDuplicate catches case, apostrophe, and inflectional duplicates', () => {
  assert.strictEqual(phrasesAreDuplicate('cut corners', 'Cutting Corners'), true);
  assert.strictEqual(phrasesAreDuplicate('TL;DR', 'tl;dr'), true);
  assert.strictEqual(phrasesAreDuplicate('cut corners', 'cut the line'), false);
});

test('isWordCoveredByIdiom detects single words embedded in idioms/combinations', () => {
  assert.strictEqual(isWordCoveredByIdiom('corners', 'cut corners'), true);
  assert.strictEqual(isWordCoveredByIdiom('overload', 'progressive overload'), true);
  assert.strictEqual(isWordCoveredByIdiom('burn', 'burn rate'), true);
  assert.strictEqual(isWordCoveredByIdiom('cooked', 'cooked'), true);
  assert.strictEqual(isWordCoveredByIdiom('architecture', 'state-of-the-art'), false);
  assert.strictEqual(isWordCoveredByIdiom('hypertrophy', 'progressive overload'), false);
});

test('enforceStrictTwoListSeparation strips multi-word items, cross-tab overlaps, and duplicates', () => {
  const inputVocab = [
    { index: 1, term: 'to obfuscate', partOfSpeech: 'verb', generalArabic: 'يعتم', meaningArabic: 'يشوش', contextSentence: 'They obfuscate the payload.', techCategory: 'Security' },
    { index: 2, term: 'bought a house', partOfSpeech: 'noun phrase', generalArabic: 'اشترى منزلا', meaningArabic: 'اشترى منزلا', contextSentence: 'I bought a house.', techCategory: 'General' },
    { index: 3, term: 'corners', partOfSpeech: 'noun', generalArabic: 'زوايا', meaningArabic: 'اختصارات', contextSentence: 'Quit cutting corners.', techCategory: 'General' },
    { index: 4, term: 'overload', partOfSpeech: 'noun', generalArabic: 'حمل زائد', meaningArabic: 'زيادة الحمل', contextSentence: 'Progressive overload drives hypertrophy.', techCategory: 'Fitness' },
    { index: 5, term: 'hypertrophy', partOfSpeech: 'noun', generalArabic: 'تضخم عضلي', meaningArabic: 'نمو عضلي', contextSentence: 'Progressive overload drives hypertrophy.', techCategory: 'Fitness' },
    { index: 6, term: 'Obfuscated', partOfSpeech: 'verb', generalArabic: 'معتم', meaningArabic: 'مشوش', contextSentence: 'Obfuscated code.', techCategory: 'Security' },
    { index: 7, term: 'low-key', partOfSpeech: 'adverb', generalArabic: 'بهدوء', meaningArabic: 'بصراحة', contextSentence: 'Low-key I was cooked.', techCategory: 'Slang' },
    { index: 8, term: 'cropping', partOfSpeech: 'verb', generalArabic: 'يظهر', meaningArabic: 'يظهر فجأة', contextSentence: 'More companies cropping up.', techCategory: 'Phrasal Verb (cropping up)' },
    { index: 9, term: 'idempotent', partOfSpeech: 'adjective', generalArabic: 'متساوي الأثر', meaningArabic: 'آمن للتكرار', contextSentence: 'Make retries idempotent.', techCategory: 'Backend' },
  ];

  const inputIdioms = [
    { index: 1, phrase: 'cutting corners', category: 'Idiom', generalArabic: 'اختصار الطريق', meaningArabic: 'تقليل الجودة للتوفير', contextSentence: 'Quit cutting corners.', usageNote: 'Very common in US teams' },
    { index: 2, phrase: 'cut corners', category: 'Idiom', generalArabic: 'اختصار الطريق', meaningArabic: 'تكرار', contextSentence: 'Do not cut corners.', usageNote: 'Duplicate inflection' },
    { index: 3, phrase: 'progressive overload', category: 'Fitness Combo', generalArabic: 'الحمل التدريجي', meaningArabic: 'زيادة الحمل التدريجي', contextSentence: 'Progressive overload drives hypertrophy.', usageNote: 'Core fitness term' },
    { index: 4, phrase: 'low-key', category: 'Street Slang', generalArabic: 'بشكل خفي', meaningArabic: 'صراحة / بشكل غير معلن', contextSentence: 'Low-key I was cooked.', usageNote: 'Everyday American street slang' },
  ];

  const result = enforceStrictTwoListSeparation(inputVocab, inputIdioms);

  // Only single non-overlapping words remain in Tab 1
  assert.deepStrictEqual(
    result.vocabItems.map((v) => v.term),
    ['obfuscate', 'hypertrophy', 'idempotent'],
  );
  assert.deepStrictEqual(
    result.vocabItems.map((v) => v.index),
    [1, 2, 3],
  );

  // Idiom duplicate collapsed cleanly
  assert.deepStrictEqual(
    result.idiomItems.map((i) => i.phrase),
    ['cutting corners', 'progressive overload', 'low-key'],
  );
  assert.deepStrictEqual(
    result.idiomItems.map((i) => i.index),
    [1, 2, 3],
  );
});

test('ComprehensiveModeStrategy preserves Mode 1 contract completely', () => {
  const mode1 = new ComprehensiveModeStrategy();
  assert.strictEqual(mode1.id, 'comprehensive');
  assert.strictEqual(mode1.metadata.tabs.filter((t) => t.visible).length, 4);

  const normalized = mode1.normalizeAndFilter(
    {
      title: 'Test Talk',
      summary: 'Summary here',
      vocabItems: [{ term: 'tech stack (noun phrase)', generalArabic: 'مجموعة تقنية', meaningArabic: 'البنية التقنية', contextSentence: 'Our tech stack.' }],
      idiomItems: [{ phrase: 'hop on a call', generalArabic: 'انضمام', meaningArabic: 'يدخل مكالمة', contextSentence: 'Let us hop on a call.', usageNote: 'Agile' }],
      thoughtPatterns: [{ title: 'Agile', americanStyle: 'Hop on', textbookContrast: 'Join meeting', mindsetNote: 'Fast' }],
    },
    'Fallback',
  );

  assert.strictEqual(normalized.vocabItems.length, 1);
  assert.strictEqual(normalized.vocabItems[0].term, 'tech stack');
  assert.strictEqual(normalized.vocabItems[0].partOfSpeech, 'noun phrase');
  assert.strictEqual(normalized.thoughtPatterns.length, 1);
});

test('AdvancedNativeModeStrategy enforces 2-tab metadata, empty thoughtPatterns, and zero duplicates', () => {
  const mode2 = new AdvancedNativeModeStrategy();
  assert.strictEqual(mode2.id, 'advanced_native');
  const visibleTabs = mode2.metadata.tabs.filter((t) => t.visible).map((t) => t.id);
  assert.deepStrictEqual(visibleTabs, ['vocab', 'idioms']);

  const prompts = mode2.buildPrompts({
    title: 'Engineering & Street Slang',
    creator: 'Test',
    sourceUrl: '',
    cleanedTranscript: 'Low-key our attribution pipeline was scuffed.',
  });
  assert.ok(prompts.systemPrompt.includes('SINGLE WORDS & SINGLE VERBS ONLY'));
  assert.ok(prompts.systemPrompt.includes('ZERO DUPLICATION'));
  assert.ok(prompts.systemPrompt.includes('fitness') || prompts.systemPrompt.includes('Fitness'));

  const normalized = mode2.normalizeAndFilter(
    {
      title: 'Clean Note',
      summary: 'Compact takeaway.',
      vocabItems: [
        { term: 'attribution', partOfSpeech: 'noun', generalArabic: 'إسناد', meaningArabic: 'نسب النتيجة للمصدر', contextSentence: 'Our attribution pipeline.', techCategory: 'Marketing' },
        { term: 'double down', partOfSpeech: 'phrasal verb', generalArabic: 'يضاعف', meaningArabic: 'يصر على الاستراتيجية', contextSentence: 'Double down on retention.', techCategory: 'Business' },
      ],
      idiomItems: [
        { phrase: 'double down', category: 'Phrasal Verb', generalArabic: 'يضاعف', meaningArabic: 'يركز بقوة مضاعفة', contextSentence: 'Double down on retention.', usageNote: 'Native business & everyday verb' },
      ],
      thoughtPatterns: [{ title: 'Should be stripped', americanStyle: 'x', textbookContrast: 'y', mindsetNote: 'z' }],
    },
    'Fallback',
  );

  assert.deepStrictEqual(normalized.vocabItems.map((v) => v.term), ['attribution']);
  assert.deepStrictEqual(normalized.idiomItems.map((i) => i.phrase), ['double down']);
  assert.deepStrictEqual(normalized.thoughtPatterns, []);
});

test('ExtractionModeRegistry routes modes safely with comprehensive default', () => {
  const registry = new ExtractionModeRegistry(
    new ComprehensiveModeStrategy(),
    new AdvancedNativeModeStrategy(),
  );
  assert.strictEqual(registry.getStrategy().id, 'comprehensive');
  assert.strictEqual(registry.getStrategy('unknown_mode').id, 'comprehensive');
  assert.strictEqual(registry.getStrategy('advanced_native').id, 'advanced_native');
  assert.strictEqual(registry.getStrategy('native_elite').id, 'advanced_native');
  assert.strictEqual(registry.listModes().length, 2);
});

test('parseExtractionResponse & cleanAsrTranscript work cleanly', () => {
  assert.strictEqual(cleanAsrTranscript('We use open ai and face time.'), 'We use OpenAI and FaceTime.');
  const parsed = parseExtractionResponse('```json\n{"title":"Ok","vocabItems":[],"idiomItems":[]}\n```', 'Fallback');
  assert.strictEqual(parsed.title, 'Ok');
});

test('Frontend tech-lexicon-modes.js enforces mode tab visibility, filtering & clipboard formatting', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../frontend/tech-lexicon-modes.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);
  const api = sandbox.window.FlaptapTechLexiconModes;
  assert.ok(api, 'FlaptapTechLexiconModes attached to window');

  assert.strictEqual(api.isTabVisible('comprehensive', 'patterns'), true);
  assert.strictEqual(api.isTabVisible('comprehensive', 'transcript'), true);
  assert.strictEqual(api.isTabVisible('advanced_native', 'vocab'), true);
  assert.strictEqual(api.isTabVisible('advanced_native', 'idioms'), true);
  assert.strictEqual(api.isTabVisible('advanced_native', 'patterns'), false);
  assert.strictEqual(api.isTabVisible('advanced_native', 'transcript'), false);

  const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const pills = api.renderFilterPillsHtml(
    [
      { phrase: 'low-key', category: 'Street Slang' },
      { phrase: 'progressive overload', category: 'Fitness Combo' },
    ],
    'category',
    'all',
    escapeHtml,
  );
  assert.strictEqual(pills.visible, true);
  assert.ok(pills.html.includes('Street Slang (1)'));
  assert.ok(pills.html.includes('Fitness Combo (1)'));

  const clip = api.buildStudyNotesClipboardText({
    extractionMode: 'advanced_native',
    title: 'Street & AI',
    vocabItems: [{ index: 1, term: 'latency', partOfSpeech: 'noun', generalArabic: 'تأخير', meaningArabic: 'زمن الاستجابة', contextSentence: 'Low latency.' }],
    idiomItems: [{ index: 1, phrase: 'low-key', category: 'Street Slang', generalArabic: 'خفي', meaningArabic: 'بصراحة', contextSentence: 'Low-key fast.' }],
  });
  assert.ok(clip.includes('Advanced Words & Verbs (1)'));
  assert.ok(clip.includes('Idioms, Expressions & Street Slang (1)'));
  assert.ok(!clip.includes('Thought Patterns'));
});

if (process.exitCode && process.exitCode !== 0) {
  console.error('\n💥 Unit suite failed.');
  process.exit(process.exitCode);
} else {
  console.log(`\n🎉 ALL ${passed} UNIT TESTS PASSED!`);
}
