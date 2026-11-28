#!/usr/bin/env node
/**
 * Flaptap — Studio Insights Engine Unit Test Suite
 * Verifies:
 *  - Shortest meaningful complete-thought grouping (never repeats paragraphs per item)
 *  - Long paragraphs split cleanly at complete sentence boundaries (never mid-sentence)
 *  - Verbatim text preservation across computeParagraphHighlights
 *  - Overlap resolution & extraItems retention (zero items dropped)
 *  - Per-paragraph statistics & strictly child-derived completion
 *  - Native Flow & sentence construction cues
 */

'use strict';

const assert = require('assert');
const path = require('path');

const engine = require(path.resolve(__dirname, '../frontend/studio-insights-engine.js'));

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASSED: ${name}`);
  } catch (err) {
    console.error(`FAILED: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('\nRunning Studio Insights Engine Unit Suite...\n');

test('groups multiple extracted items sharing a paragraph into one unique thought without repeating', () => {
  const lesson = {
    sentences: [
      { index: 1, text: "I just changed the way I program after doing it for 20 years.", startSec: 0.2, endSec: 3.1, speaker: 'Host' },
      { index: 2, text: "It's called negative space programming.", startSec: 3.15, endSec: 5.4, speaker: 'Host' },
      { index: 3, text: "Let's take this function right here.", startSec: 5.5, endSec: 7.8, speaker: 'Host' },
    ],
    chunks: [
      {
        index: 1,
        sentenceIndices: [1, 2, 3],
        startSec: 0.2,
        endSec: 7.8,
        speaker: 'Host',
        text: "I just changed the way I program after doing it for 20 years. It's called negative space programming. Let's take this function right here.",
      },
    ],
  };

  const items = [
    { index: 0, term: 'change the way', surface: 'changed the way', category: 'collocation', cefr: 'A2', sentenceIndex: 1, startSec: 0.2, endSec: 3.1 },
    { index: 1, term: 'after doing it', surface: 'after doing it', category: 'grammar_structure', cefr: 'B1', sentenceIndex: 1, startSec: 0.2, endSec: 3.1 },
    { index: 2, term: 'negative space programming', surface: 'negative space programming', category: 'metaphor_figurative', cefr: 'C1', sentenceIndex: 2, startSec: 3.15, endSec: 5.4 },
    { index: 3, term: "let's take", surface: "Let's take", category: 'conversational_expression', cefr: 'B1', sentenceIndex: 3, startSec: 5.5, endSec: 7.8 },
    { index: 4, term: 'right here', surface: 'right here', category: 'discourse_marker', cefr: 'A2', sentenceIndex: 3, startSec: 5.5, endSec: 7.8 },
  ];

  const thoughts = engine.buildThoughtParagraphs(lesson, items, items);
  assert.strictEqual(thoughts.length, 1);
  assert.strictEqual(thoughts[0].items.length, 5);
  assert.strictEqual(thoughts[0].highlights.inlineItemIndices.size, 5);
  assert.strictEqual(thoughts[0].highlights.extraItems.length, 0);
});

test('splits long paragraphs strictly at complete sentence boundaries into short complete thoughts', () => {
  const sentences = [
    { index: 1, text: 'First we look at how people start conversations in casual settings.', startSec: 0, endSec: 4 },
    { index: 2, text: 'Usually they open with a quick check-in before jumping into business.', startSec: 4, endSec: 8.5 },
    { index: 3, text: 'That small warm-up makes the whole exchange feel relaxed and natural.', startSec: 8.5, endSec: 13 },
    { index: 4, text: 'Next they connect the main point using simple linking phrases.', startSec: 13, endSec: 17.5 },
    { index: 5, text: 'You will hear expressions like on top of that and to be honest.', startSec: 17.5, endSec: 22 },
    { index: 6, text: 'Try noticing those bridges whenever you watch interviews.', startSec: 22, endSec: 26 },
  ];
  const lesson = {
    sentences,
    chunks: [
      {
        index: 1,
        sentenceIndices: [1, 2, 3, 4, 5, 6],
        startSec: 0,
        endSec: 26,
        text: sentences.map((s) => s.text).join(' '),
      },
    ],
  };

  const items = [
    { index: 0, term: 'check-in', surface: 'check-in', category: 'vocabulary', cefr: 'B1', sentenceIndex: 2 },
    { index: 1, term: 'on top of that', surface: 'on top of that', category: 'discourse_marker', cefr: 'B2', sentenceIndex: 5 },
  ];

  const thoughts = engine.buildThoughtParagraphs(lesson, items, items);
  assert.strictEqual(thoughts.length, 2);
  assert.deepStrictEqual(thoughts[0].sentenceIndices, [1, 2, 3]);
  assert.deepStrictEqual(thoughts[1].sentenceIndices, [4, 5, 6]);
  // Verify exact sentence boundaries (ends with period)
  assert.ok(thoughts[0].text.endsWith('.'));
  assert.ok(thoughts[1].text.endsWith('.'));
});

test('falls back to deduplicated contextSentence when lesson has no chunks or sentences', () => {
  const quote = "We're gonna figure this out before the deadline hits.";
  const items = [
    { index: 0, term: 'figure out', surface: 'figure this out', category: 'phrasal_verb', cefr: 'B1', contextSentence: quote },
    { index: 1, term: 'gonna', surface: 'gonna', category: 'contraction_reduction', cefr: 'A2', contextSentence: quote },
    { index: 2, term: 'deadline', surface: 'deadline', category: 'vocabulary', cefr: 'B1', contextSentence: quote },
  ];

  const thoughts = engine.buildThoughtParagraphs(null, items, items);
  assert.strictEqual(thoughts.length, 1);
  assert.strictEqual(thoughts[0].items.length, 3);
  assert.strictEqual(thoughts[0].text, quote);
});

test('computeParagraphHighlights preserves verbatim text character-for-character and retains overlapping spans in extraItems', () => {
  const text = "It's called negative space programming, and it changed the way I code.";
  const items = [
    { index: 0, term: 'negative space programming', surface: 'negative space programming', category: 'metaphor_figurative' },
    { index: 1, term: 'program', surface: 'programming', category: 'vocabulary' },
    { index: 2, term: 'change the way', surface: 'changed the way', category: 'collocation' },
  ];

  const res = engine.computeParagraphHighlights(text, items, []);
  const reconstructed = res.segments.map((s) => s.text).join('');
  assert.strictEqual(reconstructed, text);
  assert.strictEqual(res.inlineItemIndices.has(0), true);
  assert.strictEqual(res.inlineItemIndices.has(2), true);
  assert.strictEqual(res.extraItems.length, 1);
  assert.strictEqual(res.extraItems[0].index, 1);
});

test('computeParagraphStats computes WPM, CEFR range, and strictly child-derived progress', () => {
  const unit = {
    text: 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty.',
    sentences: [{ index: 1 }, { index: 2 }],
    startSec: 0,
    endSec: 8,
    items: [
      { index: 0, cefr: 'A2', category: 'vocabulary' },
      { index: 1, cefr: 'C1', category: 'idiom' },
      { index: 2, cefr: 'B2', category: 'discourse_marker' },
    ],
  };

  const statsPartial = engine.computeParagraphStats(unit, new Set([0, 2]));
  assert.strictEqual(statsPartial.wordCount, 20);
  assert.strictEqual(statsPartial.wpm, 150);
  assert.strictEqual(statsPartial.paceLabel, 'Conversational');
  assert.strictEqual(statsPartial.cefrRange, 'A2–C1');
  assert.strictEqual(statsPartial.studiedInsights, 2);
  assert.strictEqual(statsPartial.totalInsights, 3);
  assert.strictEqual(statsPartial.progressPct, 67);
  assert.strictEqual(statsPartial.isComplete, false);

  const statsDone = engine.computeParagraphStats(unit, new Set([0, 1, 2]));
  assert.strictEqual(statsDone.isComplete, true);
  assert.strictEqual(statsDone.progressPct, 100);
});

test('analyzeNativeFlow detects idea connectors, roles, and spoken contractions', () => {
  const unit = {
    text: "Let's take a look at what we're gonna build next, because it's super practical.",
    sentences: [{ index: 1 }],
    startSec: 0,
    endSec: 4,
    items: [
      { index: 0, term: "let's take", surface: "Let's take", category: 'conversational_expression' },
      { index: 1, term: 'because', surface: 'because', category: 'discourse_marker' },
      { index: 2, term: 'practical', surface: 'practical', category: 'vocabulary' },
    ],
  };

  const flow = engine.analyzeNativeFlow(unit);
  assert.ok(flow.flowChips.length >= 2);
  assert.strictEqual(flow.flowChips[0].role, 'Conversational Opener');
  assert.strictEqual(flow.flowChips[1].role, 'Idea Connector');
  assert.ok(flow.contractions.includes("Let's"));
  assert.ok(flow.contractions.includes("we're"));
  assert.ok(flow.contractions.includes('gonna'));
  assert.ok(flow.constructionNote.length > 20);
});

test('mergeProsodyIntoInsightsItems merges Connected Speech into Spoken & Phonetics and enriches overlaps', () => {
  const baseItems = [
    {
      index: 1,
      term: 'keep track of things',
      surface: 'keep track of things',
      category: 'phrasal_verb',
      cefr: 'B1',
      meaning: 'monitor something consistently',
      sentenceIndex: 1,
    },
  ];
  const coach = {
    overview: { cefrLevel: 'B2', speakerStyle: 'Fast coaching', summary: 'Natural flow' },
    connectedSpeech: [
      {
        exactPhrase: 'Keep track of things',
        spokenIpa: '/kiːp træk əv θɪŋz/',
        phenomenon: 'linking',
        mechanics: 'Links track and of smoothly.',
        sentenceIndex: 1,
      },
      {
        exactPhrase: 'sort of like',
        spokenIpa: '/sɔːrɾə laɪk/',
        phenomenon: 'flapping',
        mechanics: 'Flap /t/ + dropped f in casual speech.',
        sentenceIndex: 2,
      },
    ],
    expressions: [{ phrase: 'at the end of the day', meaning: 'ultimately', sentenceIndex: 2 }],
    vocabulary: [{ term: 'consistency', definition: 'staying steady', sentenceIndex: 1 }],
  };
  const lesson = {
    sentences: [
      { index: 1, text: 'Keep track of things carefully.', startSec: 1, endSec: 4 },
      { index: 2, text: "It's sort of like a habit at the end of the day.", startSec: 4, endSec: 8 },
    ],
  };

  // With baseItems present: enriches overlap without duplicating, adds connectedSpeech into connected_speech
  const merged = engine.mergeProsodyIntoInsightsItems(baseItems, coach, lesson);
  assert.strictEqual(merged.length, 2);
  assert.strictEqual(merged[0].spokenNote, 'Links track and of smoothly.');
  assert.strictEqual(merged[1].category, 'connected_speech');
  assert.strictEqual(engine.getMacroGroupId(merged[1].category), 'spoken');
  assert.strictEqual(merged[1]._coachSubject, 'coachConnected');

  // With empty baseItems: falls back cleanly using connectedSpeech + expressions + vocabulary
  const fallback = engine.mergeProsodyIntoInsightsItems([], coach, lesson);
  assert.strictEqual(fallback.length, 4);
  assert.ok(fallback.some((it) => it.term === 'sort of like' && it.category === 'connected_speech'));
  assert.ok(fallback.some((it) => it.term === 'at the end of the day' && it._coachSubject === 'coachExpressions'));
  assert.ok(fallback.some((it) => it.term === 'consistency' && it._coachSubject === 'coachVocabulary'));
});

console.log(`\nAll ${passed} Studio Insights Engine unit tests passed.\n`);
