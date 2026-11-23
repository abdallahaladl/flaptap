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
  ALL_CATEGORIES,
  AUDIO_DEPENDENT_CATEGORIES,
  CORE_CATEGORIES,
  cleanSourceText,
  computeExtractionHash,
  countWords,
  findContextSentence,
  isAudioDependentCategory,
  isGroundedInText,
  normalizeCategory,
  normalizeTermKey,
  safeList,
  splitSourceIntoChunks,
  truncateSource,
  MAX_SOURCE_CHARS,
} = require(path.join(dist, 'utils/source-text.util.js'));
const {
  anchorItemsToSegments,
  parseSubtitleSegments,
} = require(path.join(dist, 'utils/timestamp-anchor.util.js'));
const {
  deriveContextualFallbackTitle,
  extractCompletedItemsFromStream,
  isGenericOrFilenameTitle,
  mergeChunkExtractions,
  normalizeExtraction,
  parseModelJson,
} = require(path.join(dist, 'utils/extraction-normalize.util.js'));
const { detectImageMime } = require(path.join(dist, 'sources/vision-ocr.service.js'));
const {
  buildExtractionPrompts,
  EXTRACTION_CATEGORIES_CATALOG,
  EXTRACTION_TYPES,
  EXTRACTION_STYLES,
  EXTRACTION_LEVELS,
  EXTRACTION_FOCUSES,
  EXTRACTION_DEPTHS,
  EXTRACTION_GOALS,
  EXTRACTION_ORDERS,
  resolveEffectiveCategories,
} = require(path.join(dist, 'extraction.prompt.js'));
const { extractTextFromPdfBuffer } = require(
  path.resolve(__dirname, '../backend/dist/modules/shared-sources/pdf-text.util.js'),
);
const { SharedSourcesRepository } = require(
  path.resolve(__dirname, '../backend/dist/modules/shared-sources/shared-sources.repository.js'),
);
const {
  buildCanonicalSourceKey,
  SharedSourcesService,
} = require(
  path.resolve(__dirname, '../backend/dist/modules/shared-sources/shared-sources.service.js'),
);
const zlib = require('zlib');
const fs = require('fs');
const os = require('os');
const { SqliteService } = require(path.resolve(__dirname, '../backend/dist/core/database/sqlite.service.js'));
const { AmericanExtractorRepository } = require(path.join(dist, 'american-extractor.repository.js'));

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
    !enPrompt.systemPrompt.includes('"localizedMeaning"') &&
    enPrompt.systemPrompt.includes('"cefr"') &&
    enPrompt.systemPrompt.includes('"frequency"') &&
    enPrompt.systemPrompt.includes('Anything to Phrases'),
  'Rewritten American English prompt includes CEFR & frequency while omitting backend-derived fields and English translation',
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
    arPrompt.systemPrompt.includes('"contextTranslation"') &&
    arPrompt.systemPrompt.includes('"exampleTranslation"') &&
    /standalone general/i.test(arPrompt.systemPrompt) &&
    /separated by commas/i.test(arPrompt.systemPrompt) &&
    !arPrompt.systemPrompt.includes('"contextSentence"'),
  'Non-English prompt enforces standalone comma-separated term meanings plus context/example translations while omitting contextSentence',
);
check(
  !enPrompt.systemPrompt.includes('"contextTranslation"') &&
    !enPrompt.systemPrompt.includes('"exampleTranslation"'),
  'English target prompt omits contextTranslation and exampleTranslation',
);

const translatedNorm = normalizeExtraction({
  sourceText: 'How can we be sure that the security of these apps is sound? We should double down on testing.',
  fallbackTitle: 'Security',
  targetLanguage: 'ar',
  parsed: {
    items: [
      {
        term: 'sound',
        surface: 'sound',
        category: 'vocabulary',
        meaning: 'Solid, reliable, and not flawed.',
        localizedMeaning: ['صوت', 'سليم', 'موثوق', 'متين', 'يبدو'],
        contextTranslation: 'كيف نضمن أن أمان هذه التطبيقات موثوق؟',
        example: 'The security plan looks sound to me.',
        exampleTranslation: 'تبدو لي خطة الأمان متينة وموثوقة.',
      },
      {
        term: 'double down on',
        surface: 'double down on',
        category: 'phrasal_verb',
        meaning: 'Commit even more strongly to something.',
        localizedMeaning: 'يضاعف الجهد في، يلتزم بقوة أكبر تجاه',
        contextTranslation: 'علينا أن نضاعف جهودنا في الاختبار.',
        example: 'We decided to double down on security.',
        exampleTranslation: 'قررنا مضاعفة تركيزنا على الأمان.',
      },
    ],
  },
});
check(
  translatedNorm.items[0].localizedMeaning === 'صوت، سليم، موثوق، متين، يبدو' &&
    translatedNorm.items[0].contextTranslation === 'كيف نضمن أن أمان هذه التطبيقات موثوق؟' &&
    translatedNorm.items[0].exampleTranslation === 'تبدو لي خطة الأمان متينة وموثوقة.' &&
    translatedNorm.items[1].localizedMeaning === 'يضاعف الجهد في، يلتزم بقوة أكبر تجاه' &&
    translatedNorm.items[1].contextTranslation === 'علينا أن نضاعف جهودنا في الاختبار.' &&
    translatedNorm.items[1].exampleTranslation === 'قررنا مضاعفة تركيزنا على الأمان.',
  'Normalization preserves comma-separated standalone meanings and true context/example translations',
);

const enTranslatedNorm = normalizeExtraction({
  sourceText: 'How can we be sure that the security of these apps is sound?',
  fallbackTitle: 'Security',
  targetLanguage: 'en',
  parsed: {
    items: [
      {
        term: 'sound',
        surface: 'sound',
        category: 'vocabulary',
        meaning: 'Solid, reliable, and not flawed.',
        contextTranslation: 'should be omitted for en',
        example: 'The plan looks sound.',
        exampleTranslation: 'should be omitted for en',
      },
    ],
  },
});
check(
  !enTranslatedNorm.items[0].contextTranslation && !enTranslatedNorm.items[0].exampleTranslation,
  'English target normalization omits contextTranslation and exampleTranslation',
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
    /STRICT (?:TYPE FILTER|CATEGORY)/i.test(customPrompt.systemPrompt) &&
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

// ---------------------------------------------------------------------------
// Chunking, hashing, streaming previews, multi-chunk merge, and repository
// ---------------------------------------------------------------------------
const shortChunks = splitSourceIntoChunks(source);
check(shortChunks.length === 1 && shortChunks[0] === source.trim(), 'Short sources stay in a single chunk');

const longMultiPara = Array.from({ length: 120 }, (_, i) =>
  `Paragraph ${i + 1}: We had to double down on reliability before we could ship the rollback cleanly.`,
).join('\n\n');
const multiChunks = splitSourceIntoChunks(longMultiPara, { maxChunkChars: 3500, maxChunks: 4 });
check(
  multiChunks.length === 4 && multiChunks.every((c) => c.length <= 3600 && c.length > 0),
  `Long sources split cleanly into ${multiChunks.length} bounded chunks`,
);

const chunkPrompt = buildExtractionPrompts({
  source: {
    title: 'Long Podcast',
    creator: 'Host',
    sourceType: 'audio',
    sourceUrl: '',
    sourceLabel: 'Audio',
    text: longMultiPara,
    sourceMeta: {},
    warnings: [],
    truncated: false,
  },
  chunkText: multiChunks[1],
  chunkIndex: 1,
  totalChunks: 4,
  excludeTerms: ['double down on', 'kick off'],
  targetLanguage: 'ar',
});
check(
  chunkPrompt.systemPrompt.includes('part 2 of 4') &&
    chunkPrompt.userPrompt.includes('Already extracted (skip these): double down on, kick off'),
  'Chunked prompt injects part indicator and exclusion list to prevent cross-chunk duplicates',
);

const hashA = computeExtractionHash({
  sourceText: 'Let us   double down on latency.',
  targetLanguage: 'ar',
  extractionType: 'all',
  style: 'auto',
  level: 'all',
  focus: 'balanced',
  depth: 'adaptive',
  studyGoal: 'full',
  order: 'appearance',
});
const hashB = computeExtractionHash({
  sourceText: 'let us double down on latency.',
  targetLanguage: 'ar',
  extractionType: 'all',
  style: 'auto',
  level: 'all',
  focus: 'balanced',
  depth: 'adaptive',
  studyGoal: 'full',
  order: 'appearance',
});
const hashC = computeExtractionHash({
  sourceText: 'let us double down on latency.',
  targetLanguage: 'es',
  extractionType: 'all',
  style: 'auto',
  level: 'all',
  focus: 'balanced',
  depth: 'adaptive',
  studyGoal: 'full',
  order: 'appearance',
});
check(hashA === hashB && hashA !== hashC, 'Content hash is whitespace/case-stable and sensitive to options');

const partialStream = '{"title":"Standup","items":[{"term":"kick this off","surface":"kick this off","category":"phrasal_verb","ipa":"/kɪk ðɪs ɔf/","cefr":"B2","meaning":"start"},{"term":"fake idiom","surface":"fake idiom","category":"idiom","meaning":"hallucinated"},{"term":"double down on","surface":"double down';
const emitted = new Set();
const previews1 = extractCompletedItemsFromStream(partialStream, emitted, source);
check(
  previews1.length === 1 && previews1[0].term === 'kick this off' && previews1[0].cefr === 'B2',
  'Streaming preview parser emits grounded completed objects and drops hallucinated ones',
);
const previews2 = extractCompletedItemsFromStream(
  `${partialStream} on","category":"phrasal_verb","ipa":"/ˈdʌbəl daʊn ɑn/","cefr":"C1","meaning":"commit"}]`,
  emitted,
  source,
);
check(
  previews2.length === 1 && previews2[0].term === 'double down on' && previews2[0].count === 2,
  'Streaming preview parser emits only newly completed items on subsequent deltas',
);

const mergedByAppearance = mergeChunkExtractions({
  sourceText: source,
  fallbackTitle: 'Standup',
  order: 'appearance',
  chunks: [
    {
      title: 'Standup Guide',
      summary: 'Summary from chunk 1',
      speakerStyle: 'Casual engineering',
      items: [
        {
          index: 0,
          term: "chase one's tail",
          surface: 'chasing our tail',
          category: 'idiom',
          register: 'casual',
          ipa: '/tʃeɪs/',
          cefr: 'C1',
          frequency: 'common',
          meaning: 'work hard with no progress',
          localizedMeaning: 'work hard with no progress',
          contextSentence: '',
          usageNote: '',
          spokenNote: '',
          example: '',
          grounded: true,
        },
      ],
    },
    {
      title: '',
      summary: '',
      speakerStyle: '',
      items: [
        {
          index: 0,
          term: 'kick this off',
          surface: 'kick this off',
          category: 'phrasal_verb',
          register: 'casual',
          ipa: '/kɪk/',
          cefr: 'B1',
          frequency: 'very common',
          meaning: 'start',
          localizedMeaning: 'start',
          contextSentence: '',
          usageNote: '',
          spokenNote: '',
          example: '',
          grounded: true,
        },
        {
          index: 1,
          term: "chase one's tail",
          surface: 'chasing our tail',
          category: 'idiom',
          register: 'casual',
          ipa: '/tʃeɪs/',
          cefr: 'C1',
          frequency: 'common',
          meaning: 'duplicate across chunks',
          localizedMeaning: 'duplicate',
          contextSentence: '',
          usageNote: '',
          spokenNote: '',
          example: '',
          grounded: true,
        },
      ],
    },
  ],
});
check(
  mergedByAppearance.items.length === 2 &&
    mergedByAppearance.items[0].term === 'kick this off' &&
    mergedByAppearance.items[1].term === "chase one's tail" &&
    mergedByAppearance.items[1].contextSentence === "We're kind of chasing our tail here.",
  'mergeChunkExtractions deduplicates across chunks, restores source order, and re-anchors context',
);

const mergedByDifficulty = mergeChunkExtractions({
  sourceText: source,
  fallbackTitle: 'Standup',
  order: 'difficulty',
  chunks: [mergedByAppearance],
});
check(
  mergedByDifficulty.items[0].cefr === 'C1' && mergedByDifficulty.items[1].cefr === 'B1',
  'mergeChunkExtractions supports difficulty (CEFR) sorting',
);

// Repository SQLite integration (cache hit, rename, filtered/sorted/paginated library)
const tempDb = path.join(os.tmpdir(), `flaptap-aex-unit-${Date.now()}.sqlite`);
const prevDbEnv = process.env.FLAPTAP_SQLITE_PATH;
process.env.FLAPTAP_SQLITE_PATH = tempDb;
const sqlite = new SqliteService();
try {
  const userId = 'u_unit_test';
  sqlite.db
    .prepare(
      `INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(userId, 'unit@test.local', 'Unit Tester', 'hash', new Date().toISOString());

  const repo = new AmericanExtractorRepository(sqlite);
  repo.save({
    id: 'aex_unit_1',
    userId,
    title: 'Beta Standup',
    creator: 'Tester',
    summary: 'Latency notes',
    speakerStyle: 'Casual',
    sourceType: 'text',
    sourceUrl: '',
    sourceLabel: 'Text',
    sourceMeta: {},
    targetLanguage: 'ar',
    agentName: 'OpenCode',
    modelName: 'gpt-6-luna',
    reasoningLevel: 'medium',
    executionTimeMs: 1200,
    items: mergedByAppearance.items,
    sourceText: source,
    contentHash: hashA,
    createdAt: '2026-11-18T10:00:00.000Z',
  });
  repo.save({
    id: 'aex_unit_2',
    userId,
    title: 'Alpha YouTube Talk',
    creator: 'Channel',
    summary: 'Product scaling',
    speakerStyle: 'Professional',
    sourceType: 'youtube',
    sourceUrl: 'https://youtube.com/watch?v=12345678901',
    sourceLabel: 'YouTube · captions',
    sourceMeta: {},
    targetLanguage: 'ar',
    agentName: 'OpenCode',
    modelName: 'gpt-6-luna',
    reasoningLevel: 'medium',
    executionTimeMs: 2400,
    items: [mergedByAppearance.items[0]],
    sourceText: source,
    contentHash: 'other_hash',
    createdAt: '2026-11-19T10:00:00.000Z',
  });

  const cachedHit = repo.findByContentHash(userId, hashA);
  check(cachedHit && cachedHit.id === 'aex_unit_1', 'Repository resolves instant cache hit by content_hash');

  const renamed = repo.rename(userId, 'aex_unit_1', 'Renamed Standup Guide');
  check(renamed && renamed.title === 'Renamed Standup Guide', 'Repository persists guide rename');
  check(repo.findById(userId, 'aex_unit_1')?.title === 'Renamed Standup Guide', 'Renamed title rehydrates from SQLite');

  const partialRes = repo.setItemCompletion(userId, 'aex_unit_1', 0, true);
  check(
    partialRes && partialRes.isCompleted === false,
    'Partial item completion keeps guide strictly in-progress (never fake done)',
  );

  // Simulate legacy stale DB row with is_completed=1 despite unchecked items
  sqlite.db.prepare('UPDATE american_extractor_notes SET is_completed = 1 WHERE id = ?').run('aex_unit_1');
  check(
    repo.findById(userId, 'aex_unit_1')?.isCompleted === false &&
      repo.listPaginated(userId, { status: 'done' }).filteredTotal === 0,
    'Stale manual is_completed=1 row is overridden by real derived item completion',
  );

  const byVideo = repo.listPaginated(userId, { sourceType: 'video' });
  check(byVideo.filteredTotal === 1 && byVideo.items[0].id === 'aex_unit_2', 'Library sourceType=video groups YouTube sources');

  const byProgress = repo.listPaginated(userId, { status: 'progress' });
  check(byProgress.filteredTotal === 1 && byProgress.items[0].id === 'aex_unit_1', 'Library status=progress filters partly studied guides');

  // Completing every remaining item flips guide to completed automatically
  let finalRes = partialRes;
  for (let i = 1; i < mergedByAppearance.items.length; i++) {
    finalRes = repo.setItemCompletion(userId, 'aex_unit_1', i, true);
  }
  check(
    finalRes &&
      finalRes.isCompleted === true &&
      repo.findById(userId, 'aex_unit_1')?.isCompleted === true &&
      repo.listPaginated(userId, { status: 'done' }).filteredTotal === 1,
    'Checking every phrase automatically completes the guide',
  );

  // Unchecking any item reverts completed back to in-progress immediately
  const revertedRes = repo.setItemCompletion(userId, 'aex_unit_1', 0, false);
  check(
    revertedRes &&
      revertedRes.isCompleted === false &&
      repo.findById(userId, 'aex_unit_1')?.isCompleted === false &&
      repo.listPaginated(userId, { status: 'done' }).filteredTotal === 0,
    'Unchecking any item immediately reverts guide out of completed state',
  );

  const sortedTitle = repo.listPaginated(userId, { sort: 'title', page: 1, limit: 1 });
  check(
    sortedTitle.items.length === 1 &&
      sortedTitle.items[0].id === 'aex_unit_2' &&
      sortedTitle.hasMore === true &&
      sortedTitle.stats.totalGuides === 2,
    'Library supports title sorting, pagination, and accurate stats',
  );

  // 20-Category Catalog & Strict Audio-Dependent Gate
  check(
    CORE_CATEGORIES.length === 16 &&
      AUDIO_DEPENDENT_CATEGORIES.length === 4 &&
      ALL_CATEGORIES.length === 20 &&
      EXTRACTION_CATEGORIES_CATALOG.length === 21,
    'Category catalog exposes 16 core + 4 audio-dependent categories + All default',
  );
  check(
    normalizeCategory('sentence patterns') === 'pattern' &&
      normalizeCategory('slang & informal expressions') === 'slang' &&
      normalizeCategory('conversational expressions') === 'conversational_expression' &&
      normalizeCategory('grammar structures') === 'grammar_structure' &&
      normalizeCategory('fillers') === 'filler' &&
      normalizeCategory('interjections') === 'interjection' &&
      normalizeCategory('contractions & reductions') === 'contraction_reduction' &&
      normalizeCategory('metaphors & figurative language') === 'metaphor_figurative' &&
      normalizeCategory('american cultural references') === 'cultural_reference' &&
      normalizeCategory('pragmatics & social context') === 'pragmatics_context' &&
      normalizeCategory('native-like responses & reactions') === 'native_response' &&
      normalizeCategory('pronunciation & phonetics') === 'pronunciation_phonetics' &&
      normalizeCategory('word stress & sentence stress') === 'word_sentence_stress' &&
      normalizeCategory('linking & sound changes') === 'linking_sound_changes',
    'All 20 category names and aliases normalize accurately',
  );

  const textAllCats = resolveEffectiveCategories({ extractionType: 'all', hasAudio: false });
  const audioAllCats = resolveEffectiveCategories({ extractionType: 'all', hasAudio: true });
  const rejectedAudio = resolveEffectiveCategories({
    categories: ['connected_speech', 'word_sentence_stress'],
    hasAudio: false,
  });
  check(
    textAllCats.selectedCategories.length === 16 &&
      textAllCats.selectedCategories.every((c) => !isAudioDependentCategory(c)),
    'All-mode on text sources strictly excludes all 4 audio-dependent categories',
  );
  check(
    audioAllCats.selectedCategories.length === 20,
    'All-mode on audio/video sources unlocks all 20 categories',
  );
  check(
    rejectedAudio.rejectedAudioOnly === true && rejectedAudio.selectedCategories.length === 0,
    'Explicit audio-only category selection on text source is cleanly rejected',
  );

  const audioLeakGuarded = normalizeExtraction({
    parsed: {
      title: 'Guard test',
      items: [
        {
          term: 'kick something off',
          surface: 'kick this off',
          category: 'connected_speech',
          meaning: 'start',
        },
        {
          term: 'double down on',
          surface: 'double down on',
          category: 'phrasal_verb',
          meaning: 'commit strongly',
        },
      ],
    },
    sourceText: source,
    fallbackTitle: 'Guard',
    targetLanguage: 'ar',
    hasAudio: false,
  });
  check(
    audioLeakGuarded.items.length === 1 && audioLeakGuarded.items[0].category === 'phrasal_verb',
    'Normalization hard-drops any audio-dependent category item when hasAudio=false',
  );

  const arPrompt = buildExtractionPrompts({
    source: {
      title: 'Standup',
      creator: 'Host',
      sourceType: 'text',
      sourceUrl: '',
      sourceLabel: 'Text',
      text: source,
      hasAudio: false,
      sourceMeta: {},
      warnings: [],
      truncated: false,
    },
    targetLanguage: 'ar',
    hasAudio: false,
  });
  check(
    arPrompt.systemPrompt.includes('Egyptian Arabic') &&
      arPrompt.systemPrompt.includes('NO AUDIO IS AVAILABLE'),
    'Arabic prompt requests natural Egyptian Arabic and enforces strict no-audio anti-fabrication contract',
  );

  // Subtitle & Millisecond Timestamp Anchoring
  const parsedSrtSegs = parseSubtitleSegments(
    '1\n00:00:01,200 --> 00:00:04,500\nAlright, let\'s kick this off.\n\n2\n00:00:04,600 --> 00:00:08,100\nI want to double down on latency.',
  );
  check(
    parsedSrtSegs.length === 2 &&
      parsedSrtSegs[0].startSec === 1.2 &&
      parsedSrtSegs[1].endSec === 8.1,
    'Subtitle cue parser extracts exact millisecond timestamps',
  );

  const anchored = anchorItemsToSegments(
    [
      {
        index: 0,
        term: 'double down on',
        surface: 'double down on',
        category: 'phrasal_verb',
        register: 'neutral',
        ipa: '',
        meaning: 'commit strongly',
        localizedMeaning: 'يركز أكتر',
        contextSentence: 'I want to double down on latency.',
        usageNote: '',
        spokenNote: '',
        example: '',
        grounded: true,
      },
    ],
    parsedSrtSegs,
    "Alright, let's kick this off. I want to double down on latency.",
  );
  check(
    typeof anchored[0].startSec === 'number' &&
      anchored[0].startSec >= 4.4 &&
      anchored[0].startSec <= 4.7 &&
      anchored[0].endSec >= 8.0,
    'Timestamp anchor maps extracted phrase to exact source segment boundaries',
  );

  // PDF text extraction (FlateDecode compressed stream)
  const pdfContent = 'BT /F1 12 Tf 72 720 Td (Alright, lets kick this off and double down on latency.) Tj ET';
  const deflated = zlib.deflateSync(Buffer.from(pdfContent, 'latin1'));
  const fakePdf = Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Filter /FlateDecode /Length ' + deflated.length + ' >>\nstream\n', 'latin1'),
    deflated,
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);
  const pdfExtracted = extractTextFromPdfBuffer(fakePdf);
  check(
    pdfExtracted.pageCount === 1 && pdfExtracted.text.includes('double down on latency'),
    'Pure-Node PDF extractor reads FlateDecode streams cleanly',
  );

  // Shared Sources Deduplication & Cross-Feature Link Resolution
  const sharedRepo = new SharedSourcesRepository(sqlite);
  const sharedSvc = new SharedSourcesService(sharedRepo, sqlite);
  const ytKey = buildCanonicalSourceKey({
    sourceType: 'youtube',
    sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  });
  const s1 = sharedSvc.upsert(userId, {
    sourceKey: ytKey,
    sourceType: 'youtube',
    title: 'Shared Video Talk',
    creator: 'Tech Speaker',
    sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    hasAudio: true,
    hasVideo: true,
    mediaKind: 'youtube',
    mediaId: 'dQw4w9WgXcQ',
    transcriptText: source,
    segments: parsedSrtSegs,
  });
  const s2 = sharedSvc.upsert(userId, {
    sourceKey: ytKey,
    sourceType: 'youtube',
    title: 'Shared Video Talk Updated',
    sourceUrl: 'https://youtu.be/dQw4w9WgXcQ',
    hasAudio: true,
    hasVideo: true,
    mediaKind: 'youtube',
    mediaId: 'dQw4w9WgXcQ',
  });
  check(s1.id === s2.id && s2.segments.length === 2, 'Shared source upsert deduplicates same YouTube source and preserves segments');

  sqlite.db
    .prepare(
      `INSERT INTO lessons (id, user_id, source_id, track, video_id, source_url, title, creator, thumbnail_url, accent_dialect, sentences_count, payload_json, created_at, updated_at)
       VALUES (?, ?, ?, 'shadowing', 'dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Shared Lesson', 'Tech Speaker', '', 'General American', 12, '{}', ?, ?)`,
    )
    .run('lesson_sync_1', userId, s1.id, '2026-11-20T00:00:00.000Z', '2026-11-20T00:00:00.000Z');
  repo.save({
    id: 'aex_sync_1',
    userId,
    sourceId: s1.id,
    title: 'Synced Guide',
    creator: 'Tech Speaker',
    summary: 'Summary',
    speakerStyle: 'Casual',
    sourceType: 'youtube',
    sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    sourceLabel: 'YouTube · captions',
    sourceMeta: { sourceId: s1.id, videoId: 'dQw4w9WgXcQ', hasAudio: true, hasVideo: true, mediaKind: 'youtube', mediaId: 'dQw4w9WgXcQ' },
    targetLanguage: 'ar',
    agentName: 'OpenCode',
    modelName: 'gpt-6-luna',
    reasoningLevel: 'medium',
    executionTimeMs: 900,
    items: anchored,
    sourceText: source,
    contentHash: 'sync_hash_1',
    createdAt: '2026-11-20T00:00:00.000Z',
  });

  const linksFromNote = sharedSvc.resolveLinks(userId, { noteId: 'aex_sync_1' });
  const linksFromLesson = sharedSvc.resolveLinks(userId, { lessonId: 'lesson_sync_1' });
  check(
    linksFromNote.lesson?.id === 'lesson_sync_1' &&
      linksFromLesson.extractorNotes.some((n) => n.id === 'aex_sync_1') &&
      linksFromNote.source?.id === s1.id,
    'Cross-feature link resolution connects Extractor guides and Studio lessons via shared source',
  );

  // Image MIME detection (magic bytes + spoofing rejection)
  check(
    detectImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) === 'image/png' &&
      detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])) === 'image/jpeg' &&
      detectImageMime(Buffer.from('GIF89a0000')) === 'image/gif' &&
      detectImageMime(Buffer.from('RIFF0000WEBP')) === 'image/webp' &&
      detectImageMime(Buffer.from('%PDF-1.7 fake'), 'image/png') === null,
    'detectImageMime validates real PNG/JPEG/GIF/WebP headers and rejects non-images',
  );

  // Contextual naming & filename rejection guards
  check(
    isGenericOrFilenameTitle('IMG_4829_raw.png', ['IMG_4829_raw.png']) === true &&
      isGenericOrFilenameTitle('Img 4829 Raw', ['IMG_4829_raw.png']) === true &&
      isGenericOrFilenameTitle('Screenshot 2026 11 21', ['Screenshot_2026_11_21.png']) === true &&
      isGenericOrFilenameTitle('Screenshot', []) === true &&
      isGenericOrFilenameTitle('Engineering Deployment Checklist Discussions', [
        'IMG_4829_raw.png',
        'Screenshot_2026_11_21.png',
      ]) === false,
    'isGenericOrFilenameTitle rejects raw image filenames/placeholders and accepts contextual titles',
  );

  const derivedTitle = deriveContextualFallbackTitle(
    'This excerpt discusses staging rollouts and calm incident postmortems.',
    'Backup source prose.',
  );
  check(
    derivedTitle.length >= 10 && !isGenericOrFilenameTitle(derivedTitle),
    `deriveContextualFallbackTitle builds a clean contextual title ("${derivedTitle}")`,
  );

  const imagePrompt = buildExtractionPrompts({
    source: {
      sourceType: 'image',
      title: '',
      creator: 'Image OCR',
      sourceUrl: '',
      sourceLabel: '2 images · OCR · gpt-6-luna',
      text: 'We need to triage the deployment outage before cutover.',
      hasAudio: false,
      needsContextualTitle: true,
      submittedFileNames: ['IMG_4829_raw.png', 'Screenshot_2026_11_21.png'],
      sourceMeta: { imageCount: 2 },
      warnings: [],
      truncated: false,
    },
    targetLanguage: 'ar',
    chunkIndex: 0,
    totalChunks: 1,
  });
  check(
    !imagePrompt.userPrompt.includes('IMG_4829') &&
      !imagePrompt.userPrompt.includes('Screenshot_2026_11_21') &&
      /unified contextual title/i.test(imagePrompt.userPrompt) &&
      /Title rule:/i.test(imagePrompt.systemPrompt),
    'Multi-image extraction prompt enforces contextual naming and never leaks filenames',
  );

  // 15-guide repository pagination: default 10 per page + deterministic newest-first order
  const pageUserId = 'usr_paginated_15';
  sqlite.db
    .prepare(
      `INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(pageUserId, 'paginated@test.local', 'Pagination Tester', 'hash', new Date().toISOString());
  const sameTs = '2026-11-21T10:00:00.000Z';
  for (let idx = 1; idx <= 15; idx++) {
    const padded = String(idx).padStart(2, '0');
    const createdAt = idx >= 13 ? sameTs : `2026-11-${padded}T09:00:00.000Z`;
    repo.save({
      id: `aex_pg_${padded}`,
      userId: pageUserId,
      title: `Study Guide #${padded}`,
      creator: 'Unit Fixture',
      summary: `Summary ${padded}`,
      speakerStyle: 'Casual',
      sourceType: 'text',
      sourceUrl: '',
      sourceLabel: 'Text',
      sourceMeta: {},
      targetLanguage: 'ar',
      agentName: 'Unit',
      modelName: 'unit',
      reasoningLevel: 'none',
      executionTimeMs: 100,
      items: [],
      sourceText: `Guide ${padded} sample text for pagination verification.`,
      contentHash: `pg_hash_${padded}`,
      createdAt,
    });
  }
  const pg1 = repo.listPaginated(pageUserId, { page: 1 });
  const pg2 = repo.listPaginated(pageUserId, { page: 2 });
  const pgClamped = repo.listPaginated(pageUserId, { page: 99 });
  check(
    pg1.pageSize === 10 &&
      pg1.totalPages === 2 &&
      pg1.filteredTotal === 15 &&
      pg1.items.length === 10 &&
      pg1.hasMore === true &&
      pg1.items[0].id === 'aex_pg_15' &&
      pg1.items[1].id === 'aex_pg_14' &&
      pg1.items[2].id === 'aex_pg_13' &&
      pg1.items[9].id === 'aex_pg_06',
    'Repository default pagination returns 10 newest items on Page 1 with deterministic rowid tie-breaking',
  );
  check(
    pg2.page === 2 &&
      pg2.items.length === 5 &&
      pg2.hasMore === false &&
      pg2.items[0].id === 'aex_pg_05' &&
      pg2.items[4].id === 'aex_pg_01' &&
      pgClamped.page === 2 &&
      pgClamped.items.length === 5,
    'Repository Page 2 returns oldest 5 items and out-of-range pages clamp safely',
  );

  // Frontend store getNextUncompletedPage resume helper
  const vm = require('node:vm');
  const storeSource = fs.readFileSync(
    path.join(process.cwd(), 'frontend/anything-to-phrases/store.js'),
    'utf8',
  );
  const storeSandbox = {
    window: {},
    localStorage: { getItem: () => null, setItem: () => {} },
    FlaptapUtils: { escapeHtml: (v) => String(v ?? '') },
    FlaptapPagination: { DEFAULT_PAGE_SIZE: 10 },
    URL,
    Set,
    Map,
  };
  storeSandbox.window = storeSandbox;
  vm.runInNewContext(storeSource, storeSandbox);
  const a2pStore = storeSandbox.window.FlaptapA2PStore;
  const makeNote = (count, completed = []) => ({
    items: Array.from({ length: count }, (_, idx) => ({ index: idx, term: `term ${idx}` })),
    completionProgress: { items: completed },
  });
  check(
    a2pStore && typeof a2pStore.getNextUncompletedPage === 'function',
    'FlaptapA2PStore exposes getNextUncompletedPage helper',
  );
  check(
    a2pStore.getNextUncompletedPage(makeNote(0, []), 10) === 1 &&
      a2pStore.getNextUncompletedPage(makeNote(24, []), 10) === 1 &&
      a2pStore.getNextUncompletedPage(makeNote(24, [0, 1, 2, 3, 4, 5]), 10) === 1 &&
      a2pStore.getNextUncompletedPage(makeNote(24, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), 10) === 2 &&
      a2pStore.getNextUncompletedPage(makeNote(24, Array.from({ length: 14 }, (_, i) => i)), 10) === 2 &&
      a2pStore.getNextUncompletedPage(makeNote(24, Array.from({ length: 20 }, (_, i) => i)), 10) === 3,
    'getNextUncompletedPage resolves Page 1, 2, and 3 across sequential completions',
  );
  check(
    a2pStore.getNextUncompletedPage(
      makeNote(24, [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]),
      10,
    ) === 1 &&
      a2pStore.getNextUncompletedPage(
        makeNote(24, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]),
        10,
      ) === 2 &&
      a2pStore.getNextUncompletedPage(makeNote(24, Array.from({ length: 24 }, (_, i) => i)), 10) === 1 &&
      a2pStore.getNextUncompletedPage(makeNote(24, Array.from({ length: 16 }, (_, i) => i)), 20) === 1 &&
      a2pStore.getNextUncompletedPage(makeNote(24, Array.from({ length: 20 }, (_, i) => i)), 20) === 2,
    'getNextUncompletedPage handles out-of-order gaps, 100% completed guides (Page 1), and custom pageSize=20',
  );
} finally {
  sqlite.onModuleDestroy();
  if (prevDbEnv === undefined) delete process.env.FLAPTAP_SQLITE_PATH;
  else process.env.FLAPTAP_SQLITE_PATH = prevDbEnv;
  for (const sfx of ['', '-wal', '-shm']) {
    try {
      if (fs.existsSync(`${tempDb}${sfx}`)) fs.unlinkSync(`${tempDb}${sfx}`);
    } catch {}
  }
}

console.log('\n==================================================');
console.log(`🎉 ALL EXTRACTOR UNIT TESTS PASSED (${passed} assertions)`);
console.log('==================================================\n');
