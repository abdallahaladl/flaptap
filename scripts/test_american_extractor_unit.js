/**
 * American English Extractor — offline unit suite.
 *
 * Covers source cleaning (VTT/SRT/Markdown), grounding, verbatim context
 * recovery, JSON repair/truncation salvage, category normalization, filtering,
 * deduplication, and unbounded item selection. No AI or network required.
 *
 * Run: node scripts/test_american_extractor_unit.js
 */

const assert = require('assert');
const path = require('path');

const dist = path.resolve(__dirname, '../backend/dist/modules/american-extractor');
const {
  cleanSourceText,
  countWords,
  findContextSentence,
  isGroundedInText,
  normalizeCategory,
  normalizeTermKey,
  safeList,
  truncateSource,
  MAX_SOURCE_CHARS,
} = require(path.join(dist, 'utils/source-text.util.js'));
const {
  normalizeExtraction,
  parseModelJson,
} = require(path.join(dist, 'utils/extraction-normalize.util.js'));
const {
  buildExtractionPrompts,
  EXTRACTION_TYPES,
  EXTRACTION_STYLES,
  EXTRACTION_LEVELS,
  EXTRACTION_FOCUSES,
  EXTRACTION_DEPTHS,
  EXTRACTION_GOALS,
  EXTRACTION_ORDERS,
} = require(path.join(dist, 'extraction.prompt.js'));

let passed = 0;
function check(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}

console.log('🧪 Running American English Extractor Unit Suite...\n');

// ---------------------------------------------------------------------------
// Source cleaning
// ---------------------------------------------------------------------------
const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
Let's kick this off.

00:00:03.000 --> 00:00:06.000
We should double down on latency.`;
const vttClean = cleanSourceText(vtt);
check(!/WEBVTT|-->|00:00/.test(vttClean), 'VTT headers, timestamps, and cue markers are removed');
check(/kick this off/i.test(vttClean) && /double down on latency/i.test(vttClean), 'VTT prose survives cleaning');

const srt = `1
00:00:01,000 --> 00:00:03,000
We're kind of chasing our tail here.

2
00:00:03,000 --> 00:00:06,000
Let's circle back after the standup.`;
const srtClean = cleanSourceText(srt);
check(!/-->|00:00:0/.test(srtClean), 'SRT timestamps and indices are removed');
check(/circle back/i.test(srtClean), 'SRT prose survives cleaning');

const markdown = `# Platform standup

We need to **double down** on the [latency work](https://example.com) — see \`p99\`.

- Don't sugarcoat it
- Let's ballpark the cost`;

const mdClean = cleanSourceText(markdown);
check(!mdClean.includes('#') && !mdClean.includes('**') && !mdClean.includes('https://'), 'Markdown headings, emphasis, and link targets are stripped');
check(/double down on the latency work/i.test(mdClean), 'Markdown link text and prose are preserved');
check(/Don't sugarcoat it/.test(mdClean), 'Markdown list content is preserved');

check(countWords("Let's double down on the p99 latency work.") === 8, 'countWords handles apostrophes and numbers');

// ---------------------------------------------------------------------------
// Truncation & keys
// ---------------------------------------------------------------------------
const longSource = 'We shipped the fix. '.repeat(4000);
const truncated = truncateSource(longSource);
check(truncated.text.length <= MAX_SOURCE_CHARS + 60, 'Long sources are capped near the model input ceiling');
check(truncated.truncated === true && /Source truncated/i.test(truncated.text), 'Truncation is explicit in the stored text');

check(normalizeTermKey('  “Double-Down!”  ') === 'double-down', 'normalizeTermKey lowercases, trims punctuation, and keeps interior hyphens');

// ---------------------------------------------------------------------------
// Grounding & context recovery
// ---------------------------------------------------------------------------
const source = `Alright, let's kick this off. I want to double down on the latency work we shipped last week, because honestly the numbers still don't add up. We're kind of chasing our tail here.`;

check(isGroundedInText(source, 'double down on', 'double down on'), 'Grounding accepts an exact multi-word term');
check(isGroundedInText(source, 'chase one’s tail', 'chasing our tail'), 'Grounding tolerates inflection and smart quotes');
check(!isGroundedInText(source, 'move the needle', 'move the needle'), 'Grounding rejects an absent expression');

const context = findContextSentence(source, 'chasing our tail', 'chasing our tail');
check(context === "We're kind of chasing our tail here.", 'Context recovery returns the exact source sentence');
check(findContextSentence(source, 'not present anywhere', 'not present anywhere') === '', 'Missing terms return no fabricated context');

// ---------------------------------------------------------------------------
// JSON repair / truncation salvage
// ---------------------------------------------------------------------------
const fenced = '```json\n{"items":[{"term":"double down on"}]}\n```';
check(parseModelJson(fenced).items[0].term === 'double down on', 'Fenced model JSON is parsed');

const truncatedJson = '{"items":[{"term":"double down on","meaning":"commit harder"},{"term":"chasing our tail","meaning":"looping without progress"},{"term":"dropped the ball","meaning":"made a mistake","examples":[';
const salvaged = parseModelJson(truncatedJson);
check(salvaged.items.length === 2, 'A truncated JSON array salvages every complete preceding item');
check(salvaged.items[0].term === 'double down on', 'Salvaged items preserve their fields');

let parseFailed = false;
try {
  parseModelJson('there is no json here');
} catch {
  parseFailed = true;
}
check(parseFailed, 'Non-JSON model prose is rejected instead of silently accepted');

// ---------------------------------------------------------------------------
// Category normalization
// ---------------------------------------------------------------------------
check(normalizeCategory('phrasal verbs') === 'phrasal_verb', 'Category aliases map to phrasal_verb');
check(normalizeCategory('Connected-Speech') === 'connected_speech', 'Category case and hyphen variants normalize');
check(normalizeCategory('made up category') === 'vocabulary', 'Unknown categories fall back safely');

// ---------------------------------------------------------------------------
// Normalization, filtering, dedupe, adaptive size
// ---------------------------------------------------------------------------
const normalized = normalizeExtraction({
  sourceText: source,
  fallbackTitle: 'Standup',
  targetLanguage: 'ar',
  parsed: {
    title: 'Model Title',
    summary: 'A concise summary of the source.',
    items: [
      {
        term: 'double down on',
        surface: 'double down on',
        category: 'phrasal verb',
        meaning: 'commit more effort to something',
        localizedMeaning: 'نضاعف الجهد على',
        contextSentence: 'I want to double down on the latency work we shipped last week, because honestly the numbers still don’t add up.',
        ipa: '/ˈdʌbəl daʊn ɑn/',
        cefr: 'C1',
        frequency: 'very common',
        usageNote: 'Common in planning and prioritization.',
        spokenNote: 'Stress both words evenly.',
        example: 'We should double down on reliability.',
        tags: ['prioritization', 'work'],
      },
      {
        term: 'double down on',
        surface: 'double down on',
        category: 'idiom',
        meaning: 'duplicate',
        localizedMeaning: 'مكرر',
      },
      {
        term: 'move the needle',
        surface: 'move the needle',
        category: 'idiom',
        meaning: 'make a meaningful difference',
        localizedMeaning: 'يحدث فرقًا ملموسًا',
      },
      {
        term: 'chase one’s tail',
        surface: 'chasing our tail',
        category: 'idiom',
        meaning: 'keep working without progress',
        localizedMeaning: 'ندور في حلقة مفرغة',
        contextSentence: "",
      },
      {
        term: '',
        surface: '',
        category: 'vocabulary',
        meaning: 'empty term should be skipped',
      },
    ],
  },
});

check(normalized.items.length === 2, 'Normalization drops duplicates, ungrounded items, and empty terms');
check(normalized.items[0].term === 'double down on' && normalized.items[1].term === 'chase one’s tail', 'Valid items keep model order');
check(normalized.items[0].grounded === true, 'Kept items are marked grounded');
check(normalized.items[0].localizedMeaning === 'نضاعف الجهد على', 'Contextual target-language meaning survives');
check(normalized.items[0].contextSentence.includes('double down on the latency work'), 'Verbatim source context is preferred');
check(normalized.items[1].contextSentence === "We're kind of chasing our tail here.", 'Context is recovered when the model omits it');
check(normalized.items[0].index === 0 && normalized.items[1].index === 1, 'Indices are reassigned after filtering');
check(normalized.title === 'Model Title' && normalized.summary.length > 0, 'Title and summary normalize');

const unbounded = normalizeExtraction({
  sourceText: source,
  fallbackTitle: 'Standup',
  targetLanguage: 'en',
  parsed: {
    items: [1, 2, 3, 4].map((index) => ({
      term: index === 1 ? 'kick this off' : index === 2 ? 'double down on' : index === 3 ? 'chasing our tail' : 'add up',
      surface: index === 1 ? 'kick this off' : index === 2 ? 'double down on' : index === 3 ? 'chasing our tail' : 'add up',
      meaning: `meaning ${index}`,
      localizedMeaning: `meaning ${index}`,
    })),
  },
});
check(unbounded.items.length === 4, 'Every grounded item survives with no artificial cap');
check(unbounded.items.every((item) => item.localizedMeaning === item.meaning), 'English targets use the English meaning as the localized sense');

const englishFallback = normalizeExtraction({
  sourceText: source,
  fallbackTitle: 'Standup',
  targetLanguage: 'ar',
  parsed: {
    items: [
      {
        term: 'double down on',
        meaning: 'commit more effort',
        localizedMeaning: '',
      },
    ],
  },
});
check(englishFallback.items[0].localizedMeaning === 'commit more effort', 'Missing translation falls back to the English meaning instead of an empty card');

check(safeList([' one ', 'One', 'two', '', 'three'], 3, 10).join(',') === 'one,two,three', 'safeList deduplicates and caps tags');
check(safeList(null).length === 0, 'safeList tolerates non-array model output');

let emptyFailed = false;
try {
  normalizeExtraction({
    sourceText: source,
    fallbackTitle: 'Standup',
    targetLanguage: 'ar',
    parsed: { items: [] },
  });
} catch {
  emptyFailed = true;
}
check(emptyFailed, 'An empty item array is rejected with a retryable error');

// ---------------------------------------------------------------------------
// Lean prompt & long-transcript context windowing
// ---------------------------------------------------------------------------
const longUnpunctuated = `${'we talked about general architecture and deployment for a long while '.repeat(12)}then we decided to bite the bullet and ship it${' after checking all metrics'.repeat(6)}`;
const windowed = findContextSentence(longUnpunctuated, 'bite the bullet', 'bite the bullet');
check(
  windowed.includes('bite the bullet') &&
    windowed.length <= 420 &&
    longUnpunctuated.includes(windowed),
  'Long unpunctuated transcripts window verbatim around the matched expression',
);

const enPrompt = buildExtractionPrompts({
  source: {
    title: 'Sample',
    creator: 'Tester',
    sourceType: 'text',
    sourceUrl: '',
    sourceLabel: 'Text',
    text: source,
    sourceMeta: {},
    warnings: [],
    truncated: false,
  },
  targetLanguage: 'en',
  focus: 'balanced',
});
check(
  !enPrompt.systemPrompt.includes('"contextSentence"') &&
    !enPrompt.systemPrompt.includes('"tags"') &&
    !enPrompt.systemPrompt.includes('"generalMeaning"') &&
    !enPrompt.systemPrompt.includes('"techNote"') &&
    !enPrompt.systemPrompt.includes('"cefr"') &&
    !enPrompt.systemPrompt.includes('"frequency"') &&
    !enPrompt.systemPrompt.includes('"localizedMeaning"'),
  'Lean English extraction prompt omits redundant and backend-derived fields',
);

const arPrompt = buildExtractionPrompts({
  source: {
    title: 'Sample',
    creator: 'Tester',
    sourceType: 'text',
    sourceLabel: 'Text',
    sourceUrl: '',
    text: source,
    sourceMeta: {},
    warnings: [],
    truncated: false,
  },
  targetLanguage: 'ar',
  focus: 'professional',
});
check(
  arPrompt.systemPrompt.includes('"localizedMeaning"') &&
    !arPrompt.systemPrompt.includes('"contextSentence"'),
  'Non-English prompt keeps localizedMeaning while omitting contextSentence',
);

// ---------------------------------------------------------------------------
// Extraction control options (type, style, level, depth, goal, order)
// ---------------------------------------------------------------------------
check(
  EXTRACTION_TYPES.length >= 10 &&
    EXTRACTION_STYLES.length >= 6 &&
    EXTRACTION_LEVELS.length >= 9 &&
    EXTRACTION_FOCUSES.length >= 4 &&
    EXTRACTION_DEPTHS.length >= 4 &&
    EXTRACTION_GOALS.length >= 5 &&
    EXTRACTION_ORDERS.length >= 3,
  'All extraction control option catalogs are populated',
);

const customPrompt = buildExtractionPrompts({
  source: {
    title: 'Street Chat',
    creator: 'Tester',
    sourceType: 'text',
    sourceUrl: '',
    sourceLabel: 'Text',
    text: source,
    sourceMeta: {},
    warnings: [],
    truncated: false,
  },
  targetLanguage: 'ar',
  extractionType: 'vocabulary',
  style: 'american_slang',
  level: 'a2',
  focus: 'everyday',
  depth: 'essentials',
  studyGoal: 'speaking',
  order: 'importance',
});
check(
  customPrompt.extractionType.id === 'vocabulary' &&
    customPrompt.systemPrompt.includes('STRICT TYPE FILTER') &&
    customPrompt.systemPrompt.includes('"category":"vocabulary"'),
  'Single-category extractionType injects strict category constraint and itemShape',
);
check(
  customPrompt.style.id === 'american_slang' &&
    /slang/i.test(customPrompt.systemPrompt) &&
    customPrompt.level.id === 'a2' &&
    /CEFR A2/i.test(customPrompt.systemPrompt) &&
    customPrompt.depth.id === 'essentials' &&
    /5–8/.test(customPrompt.systemPrompt) &&
    customPrompt.studyGoal.id === 'speaking' &&
    /spoken delivery/i.test(customPrompt.systemPrompt) &&
    customPrompt.order.id === 'importance' &&
    /frequency/i.test(customPrompt.systemPrompt),
  'Style, A1-C2 level, depth, study goal, and ordering options steer the extraction prompt',
);

const fallbackOptionsPrompt = buildExtractionPrompts({
  source: {
    title: 'Fallback',
    creator: 'Tester',
    sourceType: 'text',
    sourceUrl: '',
    sourceLabel: 'Text',
    text: source,
    sourceMeta: {},
    warnings: [],
    truncated: false,
  },
  targetLanguage: 'en',
  extractionType: 'nonexistent',
  style: 'nonexistent',
  level: 'nonexistent',
  focus: 'nonexistent',
  depth: 'nonexistent',
  studyGoal: 'nonexistent',
  order: 'nonexistent',
});
check(
  fallbackOptionsPrompt.extractionType.id === 'all' &&
    fallbackOptionsPrompt.style.id === 'auto' &&
    fallbackOptionsPrompt.level.id === 'all' &&
    fallbackOptionsPrompt.focus.id === 'balanced' &&
    fallbackOptionsPrompt.depth.id === 'adaptive' &&
    fallbackOptionsPrompt.studyGoal.id === 'full' &&
    fallbackOptionsPrompt.order.id === 'appearance',
  'Unknown extraction options fall back safely to defaults',
);

const strictFiltered = normalizeExtraction({
  sourceText: source,
  fallbackTitle: 'Standup',
  targetLanguage: 'en',
  extractionType: 'vocabulary',
  parsed: {
    items: [
      {
        term: 'double down on',
        surface: 'double down on',
        category: 'phrasal_verb',
        meaning: 'commit harder',
      },
      {
        term: 'latency',
        surface: 'latency',
        category: 'vocabulary',
        cefr: 'B1',
        meaning: 'delay before a transfer of data begins',
      },
      {
        term: 'honestly',
        surface: 'honestly',
        category: 'vocabulary',
        cefr: 'A2',
        meaning: 'used to emphasize a candid opinion',
      },
    ],
  },
});
check(
  strictFiltered.items.length === 2 &&
    strictFiltered.items.every((item) => item.category === 'vocabulary') &&
    strictFiltered.items[0].index === 0 &&
    strictFiltered.items[1].index === 1 &&
    strictFiltered.items[0].cefr === 'B1' &&
    strictFiltered.items[1].cefr === 'A2',
  'Strict extractionType filters stray categories, re-indexes items, and preserves A1-C2 CEFR tags',
);

const strictFallback = normalizeExtraction({
  sourceText: source,
  fallbackTitle: 'Standup',
  targetLanguage: 'en',
  extractionType: 'idiom',
  parsed: {
    items: [
      {
        term: 'latency',
        surface: 'latency',
        category: 'vocabulary',
        meaning: 'delay',
      },
    ],
  },
});
check(
  strictFallback.items.length === 1 && strictFallback.items[0].term === 'latency',
  'Strict extractionType falls back safely when zero items match the exact category label',
);

const phrasesFiltered = normalizeExtraction({
  sourceText: source,
  fallbackTitle: 'Standup',
  targetLanguage: 'en',
  extractionType: 'phrases',
  parsed: {
    items: [
      {
        term: 'latency',
        surface: 'latency',
        category: 'vocabulary',
        meaning: 'delay',
      },
      {
        term: 'double down on',
        surface: 'double down on',
        category: 'phrasal_verb',
        meaning: 'commit harder',
      },
    ],
  },
});
check(
  phrasesFiltered.items.length === 1 && phrasesFiltered.items[0].term === 'double down on',
  'Phrases extractionType filters out isolated single vocabulary words when phrases exist',
);

console.log('\n==================================================');
console.log(`🎉 ALL EXTRACTOR UNIT TESTS PASSED (${passed} assertions)`);
console.log('==================================================\n');
