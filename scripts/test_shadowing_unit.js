#!/usr/bin/env node
/**
 * Flaptap — Consolidated Shadowing Unit Test Suite
 * Verifies:
 *  - Universal media URL classification (YouTube, Podcasts, Social, Direct Media, private IP block)
 *  - Millisecond word sequence alignment (exact, 1:1 ASR fix, 2:1 merge, 2500-word perf)
 *  - Multi-speaker overlap resolution, Playback Boundary Law, speaker rename propagation
 *  - Universal 7-format x 5-view exporter (.txt, .md, .srt, .vtt, .json, .csv, .html)
 *  - Prompt chunking & malformed JSON salvage
 *  - Consolidated HistoryRepository: user isolation, source_key lookup, title rename,
 *    metadata summary projection, and strict Real Derived Completion Law
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const distRoot = path.resolve(__dirname, '../backend/dist');

const {
  alignReviewedWordsToRawTiming,
  assembleAlignedReviewedViews,
  applySpeakerOverridesToReviewed,
  buildRawTranscriptSnapshot,
  coalesceToCanonicalSentences,
  regroupShadowingLessonByPacing,
} = require(path.join(distRoot, 'modules/tracks/shadowing/utils/word-alignment.util.js'));

const {
  buildShadowingAskSystemPrompt,
  buildShadowingAskContextBundle,
} = require(path.join(distRoot, 'modules/tracks/shadowing/shadowing.ask.service.js'));

const {
  exportShadowingLesson,
  SUPPORTED_EXPORT_FORMATS,
  SUPPORTED_VIEW_MODES,
} = require(path.join(distRoot, 'modules/tracks/shadowing/utils/transcript-export.util.js'));

const {
  buildReviewChunks,
  parseTranscriptReviewResponse,
} = require(path.join(distRoot, 'modules/tracks/shadowing/shadowing-review.prompt.js'));

const { parseManualTranscriptInput } = require(path.join(
  distRoot,
  'modules/tracks/shadowing/utils/manual-transcript.util.js',
));
const { ShadowingService } = require(path.join(
  distRoot,
  'modules/tracks/shadowing/shadowing.service.js',
));
const { ServiceUnavailableException } = require(path.join(
  distRoot,
  '../node_modules/@nestjs/common',
));

const { TranscriptProviderGuard } = require(path.join(
  distRoot,
  'core/media/transcript-provider-guard.service.js',
));
const { classifyMediaUrl } = require(path.join(distRoot, 'core/media/media-url.js'));
const { SqliteService } = require(path.join(distRoot, 'core/database/sqlite.service.js'));
const { HistoryRepository } = require(path.join(distRoot, 'core/database/history.repository.js'));

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

console.log('\n🧪 Running Consolidated Shadowing Unit Suite...\n');

// 1. Media URL Classification
test('classifyMediaUrl detects YouTube, TikTok, Apple Podcasts, Podcast RSS, SoundCloud & Direct MP3', () => {
  assert.strictEqual(classifyMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.platform, 'YouTube');
  assert.strictEqual(classifyMediaUrl('https://www.tiktok.com/@creator/video/123456')?.platform, 'TikTok');
  assert.strictEqual(classifyMediaUrl('https://podcasts.apple.com/us/podcast/lex/id1434243584?i=1000')?.platform, 'Apple Podcasts');
  assert.strictEqual(classifyMediaUrl('https://feeds.simplecast.com/episode.rss')?.platform, 'Podcast');
  assert.strictEqual(classifyMediaUrl('https://example.com/shows/feed.xml')?.platform, 'Podcast RSS');
  assert.strictEqual(classifyMediaUrl('https://soundcloud.com/user/track-name')?.platform, 'SoundCloud');
  assert.strictEqual(classifyMediaUrl('https://cdn.example.com/audio/interview.mp3')?.platform, 'Direct Media');
  assert.strictEqual(classifyMediaUrl('http://127.0.0.1/secret.mp3'), null);
  assert.strictEqual(classifyMediaUrl('http://192.168.1.5/video.mp4'), null);
});

// 2. Millisecond Word Sequence Alignment
test('alignReviewedWordsToRawTiming preserves exact millisecond boundaries on verbatim text', () => {
  const raw = [
    { i: 0, word: 'hey', clean: 'hey', startMs: 100, endMs: 320 },
    { i: 1, word: 'everybody', clean: 'everybody', startMs: 340, endMs: 820 },
    { i: 2, word: 'welcome', clean: 'welcome', startMs: 860, endMs: 1250 },
    { i: 3, word: 'back', clean: 'back', startMs: 1280, endMs: 1600 },
  ];
  const res = alignReviewedWordsToRawTiming(raw, ['Hey', 'everybody,', 'welcome', 'back!']);
  assert.strictEqual(res.words.length, 4);
  assert.strictEqual(res.repairedWords, 0);
  assert.strictEqual(res.verbatimScore, 100);
  assert.strictEqual(res.words[0].startMs, 100);
  assert.strictEqual(res.words[0].endMs, 320);
  assert.strictEqual(res.words[3].startMs, 1280);
  assert.strictEqual(res.words[3].endMs, 1600);
});

test('alignReviewedWordsToRawTiming handles 2:1 ASR merge ("pie torch" -> "PyTorch") and 1:1 fix ("clod" -> "Claude")', () => {
  const raw = [
    { i: 0, word: 'we', clean: 'we', startMs: 0, endMs: 150 },
    { i: 1, word: 'ran', clean: 'ran', startMs: 160, endMs: 340 },
    { i: 2, word: 'pie', clean: 'pie', startMs: 360, endMs: 550 },
    { i: 3, word: 'torch', clean: 'torch', startMs: 560, endMs: 890 },
    { i: 4, word: 'with', clean: 'with', startMs: 910, endMs: 1080 },
    { i: 5, word: 'clod', clean: 'clod', startMs: 1100, endMs: 1480 },
  ];
  const res = alignReviewedWordsToRawTiming(raw, ['We', 'ran', 'PyTorch', 'with', 'Claude.']);
  assert.strictEqual(res.words.length, 5);
  assert.strictEqual(res.words[2].word, 'PyTorch');
  assert.strictEqual(res.words[2].startMs, 360);
  assert.strictEqual(res.words[2].endMs, 890);
  assert.strictEqual(res.words[2].repaired, true);
  assert.strictEqual(res.words[2].rawWord, 'pie torch');

  assert.strictEqual(res.words[4].word, 'Claude.');
  assert.strictEqual(res.words[4].startMs, 1100);
  assert.strictEqual(res.words[4].endMs, 1480);
  assert.strictEqual(res.words[4].repaired, true);
  assert.strictEqual(res.words[4].rawWord, 'clod');
});

test('alignReviewedWordsToRawTiming aligns 2,500-word podcast monotonically in under 250ms', () => {
  const vocab = ['actually', 'building', 'agents', 'spoken', 'american', 'workflow', 'system', 'latency', 'model', 'podcast'];
  const raw = [];
  const reviewed = [];
  for (let i = 0; i < 2500; i++) {
    const w = vocab[i % vocab.length] + (i % 7 === 0 ? String(i % 13) : '');
    raw.push({ i, word: w, clean: w, startMs: i * 280, endMs: i * 280 + 230 });
    reviewed.push(i % 120 === 0 ? 'PyTorch' : w);
  }
  const t0 = Date.now();
  const res = alignReviewedWordsToRawTiming(raw, reviewed);
  const elapsed = Date.now() - t0;
  assert.strictEqual(res.words.length, 2500);
  assert.ok(elapsed < 250, `Expected <250ms, got ${elapsed}ms`);
  for (let i = 1; i < res.words.length; i++) {
    assert.ok(res.words[i].startMs >= res.words[i - 1].startMs, 'Timestamps must be monotonic');
  }
});

// 3. Multi-Speaker Assembly, Playback Boundary Law & Speaker Renaming
test('assembleAlignedReviewedViews resolves multi-speaker overlaps, honors 50ms Playback Boundary Law, and propagates speaker overrides', () => {
  const rawWords = [
    { i: 0, word: 'so', clean: 'so', startMs: 0, endMs: 180 },
    { i: 1, word: 'how', clean: 'how', startMs: 200, endMs: 420 },
    { i: 2, word: 'fast', clean: 'fast', startMs: 440, endMs: 750 },
    { i: 3, word: 'is', clean: 'is', startMs: 770, endMs: 920 },
    { i: 4, word: 'it', clean: 'it', startMs: 940, endMs: 1120 },
    { i: 5, word: 'wait', clean: 'wait', startMs: 1600, endMs: 1880 },
    { i: 6, word: 'super', clean: 'super', startMs: 1900, endMs: 2220 },
    { i: 7, word: 'fast', clean: 'fast', startMs: 2240, endMs: 2560 },
  ];

  const assembled = assembleAlignedReviewedViews({
    rawWords,
    draftSentences: [
      { text: 'So how fast is it?', speaker: 'Host', paragraphIndex: 1, ideaIndex: 1 },
      { text: 'Wait—super fast!', speaker: 'Guest', isOverlap: true, paragraphIndex: 2, ideaIndex: 1 },
    ],
    draftIdeas: [
      { index: 1, title: 'Speed Check', summary: 'Host asks about speed and guest jumps in.', keyTakeaway: 'Wait—super fast!' },
    ],
    defaultSpeaker: 'Host',
  });

  assert.strictEqual(assembled.sentences.length, 2);
  assert.strictEqual(assembled.speakers.length, 2);
  assert.strictEqual(assembled.quality.multiSpeaker, true);
  assert.strictEqual(assembled.quality.overlapsResolved, 1);
  assert.ok(
    assembled.sentences[0].endMs <= assembled.sentences[1].startMs - 50,
    `Expected <= ${assembled.sentences[1].startMs - 50}, got ${assembled.sentences[0].endMs}`,
  );

  applySpeakerOverridesToReviewed(assembled, { spk_1: 'Lex Fridman', spk_2: 'Andrej Karpathy' });
  assert.strictEqual(assembled.sentences[0].speaker, 'Lex Fridman');
  assert.strictEqual(assembled.sentences[1].speaker, 'Andrej Karpathy');
  assert.strictEqual(assembled.speakerTurns[1].speaker, 'Andrej Karpathy');
  assert.ok(assembled.ideas[0].speakers.includes('Andrej Karpathy'));
});

test('assembleAlignedReviewedViews automatically splits long 20+ word rambling sentences into short shadowing bites (<=9 words)', () => {
  const tokens =
    "But what I'm not going to do is repeat the past, where I envision myself living a completely different life and not creating a plan to take action on that.".split(
      /\s+/,
    );
  const rawWords = tokens.map((word, i) => ({
    i,
    word,
    clean: word.toLowerCase().replace(/[^a-z0-9']/g, ''),
    startMs: i * 360,
    endMs: i * 360 + 300,
  }));

  const assembled = assembleAlignedReviewedViews({
    rawWords,
    draftSentences: [
      {
        text: tokens.join(' '),
        speaker: 'Miranda Cohen',
        paragraphIndex: 1,
        ideaIndex: 1,
      },
    ],
    draftIdeas: [{ index: 1, title: 'Action Plan', summary: 'Taking concrete action.' }],
    defaultSpeaker: 'Miranda Cohen',
  });

  assert.ok(
    assembled.sentences.length >= 4,
    `Expected long 30-word sentence to split into >=4 short lines, got ${assembled.sentences.length}`,
  );
  for (const s of assembled.sentences) {
    assert.ok(
      s.words.length <= 9,
      `Shadowing line too long (${s.words.length} words): "${s.text}"`,
    );
    assert.strictEqual(s.paragraphIndex, 1, 'Split lines must stay grouped in the same paragraph');
  }
  // Verify exact verbatim preservation across all split lines
  const rejoined = assembled.sentences.map((s) => s.text).join(' ');
  assert.strictEqual(rejoined, tokens.join(' '));
});

test('regroupShadowingLessonByPacing dynamically switches short <-> normal with zero hard cuts, completion & translation preservation', () => {
  const s1Tokens =
    "But what I'm not going to do is repeat the past, where I envision myself living a completely different life and not creating a plan to take action on that.".split(
      /\s+/,
    );
  const s2Tokens =
    'And I think that this stems from me constantly living in this fight or flight experience with my career and with my life choices.'.split(
      /\s+/,
    );
  const allTokens = [...s1Tokens, ...s2Tokens];
  const rawWords = allTokens.map((word, i) => ({
    i,
    word,
    clean: word.toLowerCase().replace(/[^a-z0-9']/g, ''),
    startMs: i * 350,
    endMs: i * 350 + 290,
  }));

  const reviewedParts = assembleAlignedReviewedViews({
    rawWords,
    draftSentences: [
      { text: s1Tokens.join(' '), speaker: 'Miranda', paragraphIndex: 1, ideaIndex: 1 },
      { text: s2Tokens.join(' '), speaker: 'Miranda', paragraphIndex: 1, ideaIndex: 1 },
    ],
    draftIdeas: [{ index: 1, title: 'Structure & Action', summary: 'Building a real plan.' }],
    defaultSpeaker: 'Miranda',
    pacingMode: 'short',
  });

  const lesson = {
    id: 'lesson_pacing_unit',
    track: 'shadowing',
    trackTitle: 'Shadowing',
    title: 'Dynamic Pacing Test',
    creator: 'Miranda',
    pacingMode: 'short',
    sentences: reviewedParts.sentences.map((s) => ({
      ...s,
      timeRange: '00:00.000 - 00:01.000',
      durationSec: Number(((s.endMs - s.startMs) / 1000).toFixed(3)),
      highlightedHtml: s.text,
    })),
    chunks: reviewedParts.paragraphs.map((p) => ({
      ...p,
      timeRange: '00:00.000 - 00:05.000',
      highlightedHtml: p.text,
    })),
    sentencesCount: reviewedParts.sentences.length,
    chunksCount: reviewedParts.paragraphs.length,
    completionProgress: { sentences: [], listen: [], paragraphs: [] },
    translationsCache: { ar: {} },
    transcriptData: {
      sourceType: 'youtube',
      platform: 'YouTube',
      providerEngine: 'youtube_json3',
      pacingMode: 'short',
      raw: {
        provider: 'youtube_json3',
        model: 'json3',
        fullText: allTokens.join(' '),
        cues: [],
        words: rawWords,
        sentences: [],
        paragraphs: [],
        extractedAt: new Date().toISOString(),
      },
      reviewed: {
        ...reviewedParts,
        providerName: 'TestAI',
        modelName: 'test-model',
        reasoningLevel: 'none',
        executionTimeMs: 120,
        reviewedAt: new Date().toISOString(),
      },
      reviewStatus: 'ready',
      reviewError: '',
      speakerOverrides: {},
    },
    createdAt: new Date().toISOString(),
  };

  const shortCount = lesson.sentences.length;
  assert.ok(shortCount >= 8, `Expected >=8 short lines across 54 words, got ${shortCount}`);
  assert.ok(lesson.sentences.every((s) => s.words.length <= 9), 'Every short line must be <= 9 words');

  // Seed translation for short line #1 and mark all short lines belonging to canonical sentence #1 complete
  const firstShortText = lesson.sentences[0].text;
  lesson.translationsCache.ar[1] = 'لكن ما لن أفعله';
  lesson.sentences[0].translations = { ar: 'لكن ما لن أفعله' };
  const s1MaxWordI = s1Tokens.length - 1;
  lesson.completionProgress.sentences = lesson.sentences
    .filter((s) => s.words.every((w) => w.i <= s1MaxWordI))
    .map((s) => s.index);

  // Switch short -> normal
  regroupShadowingLessonByPacing(lesson, 'normal');
  assert.strictEqual(lesson.pacingMode, 'normal');
  assert.ok(
    lesson.sentences.length >= 2 && lesson.sentences.length < shortCount,
    `Expected normal mode to keep complete clauses while merging short bites, got ${lesson.sentences.length}`,
  );
  assert.ok(
    lesson.sentences.every((s) => s.words.length <= 20),
    'Every normal line must respect the 20-word spoken-sentence ceiling',
  );
  // Sentence #1 should remain completed under Real Derived Completion Law
  assert.ok(lesson.completionProgress.sentences.includes(1), 'Normal sentence #1 must remain completed when all constituent short bites were completed');
  // Mismatched short translation must NOT leak onto normal sentence #1
  assert.strictEqual(lesson.translationsCache.ar?.[1], undefined, 'Mismatched short translation must not attach to different normal sentence');
  // 50ms Playback Boundary Law check
  for (let i = 0; i < lesson.sentences.length - 1; i++) {
    assert.ok(
      lesson.sentences[i].endMs <= lesson.sentences[i + 1].startMs - 50,
      `Normal mode boundary violation between #${i + 1} and #${i + 2}`,
    );
  }

  // Switch normal -> short (round-trip)
  const normalTexts = lesson.sentences.map((s) => s.text);
  regroupShadowingLessonByPacing(lesson, 'short');
  assert.strictEqual(lesson.pacingMode, 'short');
  assert.strictEqual(lesson.sentences.length, shortCount, 'Round-trip back to short must match exact short count');
  assert.strictEqual(lesson.sentences[0].text, firstShortText);
  // Cached translation for exact short line #1 restores in 0ms!
  assert.strictEqual(lesson.translationsCache.ar[1], 'لكن ما لن أفعله', 'Exact-text translation must restore automatically on round-trip');
  // Completion for all short bites of sentence #1 stays intact!
  const restoredS1Shorts = lesson.sentences
    .filter((s) => s.words.every((w) => w.i <= s1MaxWordI))
    .map((s) => s.index);
  for (const idx of restoredS1Shorts) {
    assert.ok(lesson.completionProgress.sentences.includes(idx), `Short bite #${idx} completion lost on round-trip`);
  }

  // Legacy "Medium" alias resolves to the same complete sentences as normal
  regroupShadowingLessonByPacing(lesson, 'balanced');
  assert.strictEqual(lesson.pacingMode, 'normal', 'Legacy balanced must persist as normal');
  assert.deepStrictEqual(lesson.sentences.map((s) => s.text), normalTexts, 'Legacy balanced must not re-introduce arbitrary middle splits');
  // Exact verbatim text check across entire transcript
  assert.strictEqual(lesson.sentences.map((s) => s.text).join(' '), allTokens.join(' '));
});

// 4. Universal 7-Format x 5-View Exporter
test('exportShadowingLesson generates valid output across all 5 views and all 7 formats', () => {
  const raw = buildRawTranscriptSnapshot({
    provider: 'youtube_json3',
    title: 'Thinking in American English',
    creator: 'Host',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    mediaId: 'dQw4w9WgXcQ',
    durationSeconds: 12,
    fullText: 'Hey everyone welcome back. Today we talk fast.',
    timedWords: [
      { word: 'Hey', clean: 'hey', start_sec: 0.1, end_sec: 0.3 },
      { word: 'everyone', clean: 'everyone', start_sec: 0.35, end_sec: 0.8 },
      { word: 'welcome', clean: 'welcome', start_sec: 0.85, end_sec: 1.2 },
      { word: 'back.', clean: 'back', start_sec: 1.25, end_sec: 1.6 },
      { word: 'Today', clean: 'today', start_sec: 2.0, end_sec: 2.35 },
      { word: 'we', clean: 'we', start_sec: 2.4, end_sec: 2.55 },
      { word: 'talk', clean: 'talk', start_sec: 2.6, end_sec: 2.9 },
      { word: 'fast.', clean: 'fast', start_sec: 2.95, end_sec: 3.4 },
    ],
  });

  const reviewedParts = assembleAlignedReviewedViews({
    rawWords: raw.words,
    draftSentences: [
      { text: 'Hey everyone, welcome back.', speaker: 'Host', paragraphIndex: 1, ideaIndex: 1 },
      { text: 'Today we talk fast.', speaker: 'Guest', paragraphIndex: 2, ideaIndex: 1 },
    ],
    draftIdeas: [{ index: 1, title: 'Opening Hook', summary: 'Quick intro.' }],
    defaultSpeaker: 'Host',
  });

  const fakeLesson = {
    id: 'sh_test',
    track: 'shadowing',
    trackTitle: 'Shadowing',
    title: 'Thinking in American English',
    creator: 'Host',
    sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    platform: 'YouTube',
    durationSeconds: 12,
    sentences: reviewedParts.sentences.map((s) => ({ ...s, timeRange: '00:00.000 - 00:02.000', durationSec: 2, highlightedHtml: s.text })),
    chunks: reviewedParts.paragraphs.map((p) => ({ ...p, timeRange: '00:00.000 - 00:02.000', highlightedHtml: p.text })),
    transcriptData: {
      sourceType: 'youtube',
      platform: 'YouTube',
      providerEngine: 'youtube_json3',
      raw,
      reviewed: {
        ...reviewedParts,
        providerName: 'TestAI',
        modelName: 'test-model',
        reasoningLevel: 'none',
        executionTimeMs: 420,
        reviewedAt: new Date().toISOString(),
      },
      reviewStatus: 'ready',
      reviewError: '',
      speakerOverrides: {},
    },
    createdAt: new Date().toISOString(),
  };

  for (const view of SUPPORTED_VIEW_MODES) {
    for (const format of SUPPORTED_EXPORT_FORMATS) {
      const out = exportShadowingLesson(fakeLesson, { view, format });
      assert.ok(out.content.length > 10, `Empty export for ${view}.${format}`);
      assert.ok(out.filename.endsWith(`-${view}.${format}`), `Unexpected filename ${out.filename}`);
      if (format === 'json') {
        const parsed = JSON.parse(out.content);
        assert.strictEqual(parsed.view, view);
      }
      if (format === 'srt') assert.ok(out.content.includes(' --> '), 'SRT must contain arrow cue');
      if (format === 'vtt') assert.ok(out.content.startsWith('WEBVTT'), 'VTT must start with WEBVTT');
      if (format === 'md') assert.ok(out.content.startsWith('---\n'), 'Markdown must start with YAML frontmatter');
      if (format === 'html') assert.ok(out.content.includes('<!doctype html>'), 'HTML must be standalone document');
    }
  }
});

// 5. Prompt Chunking & JSON Parsing
test('buildReviewChunks splits long transcripts cleanly and parseTranscriptReviewResponse parses fenced JSON', () => {
  const fakeSents = Array.from({ length: 40 }, (_, i) => ({
    id: `raw-s-${i + 1}`,
    index: i + 1,
    text: 'word '.repeat(60).trim() + '.',
    rawText: '',
    speakerId: 'spk_1',
    speaker: 'Host',
    repaired: false,
    repairNote: '',
    isOverlap: false,
    paragraphIndex: 1,
    ideaIndex: 1,
    startMs: i * 5000,
    endMs: (i + 1) * 5000,
    startSec: i * 5,
    endSec: (i + 1) * 5,
    words: Array.from({ length: 60 }, (__, k) => ({
      i: i * 60 + k,
      word: 'word',
      clean: 'word',
      startMs: i * 5000 + k * 50,
      endMs: i * 5000 + (k + 1) * 50,
    })),
  }));
  const chunks = buildReviewChunks(fakeSents, 1000);
  assert.ok(chunks.length >= 3, `Expected >=3 chunks, got ${chunks.length}`);

  const parsed = parseTranscriptReviewResponse(
    '```json\n{"sentences":[{"text":"Hello world.","speaker":"Host","paragraphIndex":1,"ideaIndex":1}],"ideas":[{"index":1,"title":"Greeting","summary":"Says hello."}]}\n```',
  );
  assert.strictEqual(parsed.sentences.length, 1);
  assert.strictEqual(parsed.ideas.length, 1);
});

// 6. Consolidated HistoryRepository: User Isolation, Source Key, Title Rename, Derived Completion
test('HistoryRepository persists consolidated Shadowing metadata, enforces user isolation, and derives completion strictly from children', () => {
  const tmpDb = path.join(os.tmpdir(), `flaptap-shadowing-unit-${Date.now()}.sqlite`);
  const prevEnv = process.env.FLAPTAP_SQLITE_PATH;
  process.env.FLAPTAP_SQLITE_PATH = tmpDb;
  let sqlite;
  try {
    sqlite = new SqliteService();
    // Confirm obsolete transcript_lab_docs table is NOT created
    const tables = sqlite.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all()
      .map((r) => r.name);
    assert.ok(!tables.includes('transcript_lab_docs'), 'Obsolete transcript_lab_docs table must not exist');

    const nowIso = new Date().toISOString();
    sqlite.db
      .prepare(`INSERT INTO users (id, email, name, password_hash, native_language, ui_language, daily_goal_minutes, created_at) VALUES (?, ?, ?, ?, 'ar', 'en', 15, ?)`)
      .run('user_a', 'a@unit.test', 'User A', 'hash', nowIso);
    sqlite.db
      .prepare(`INSERT INTO users (id, email, name, password_hash, native_language, ui_language, daily_goal_minutes, created_at) VALUES (?, ?, ?, ?, 'ar', 'en', 15, ?)`)
      .run('user_b', 'b@unit.test', 'User B', 'hash', nowIso);

    const repo = new HistoryRepository(sqlite);
    const saved = repo.create({
      id: 'lesson_unit_1',
      track: 'shadowing',
      trackTitle: 'Shadowing',
      title: 'Initial Podcast Episode',
      creator: 'Host',
      sourceUrl: 'https://cdn.example.com/ep1.mp3',
      sourceKey: 'media:abc123',
      platform: 'uploaded_audio',
      mediaKind: 'audio',
      reviewStatus: 'ready',
      speakerCount: 2,
      repairCount: 3,
      wordCount: 120,
      durationSeconds: 30,
      pacingWpm: 150,
      sentences: [
        { id: 's1', index: 1, text: 'First sentence.', startSec: 0, endSec: 2, durationSec: 2, timeRange: '00:00.000 - 00:02.000', highlightedHtml: 'First sentence.' },
        { id: 's2', index: 2, text: 'Second sentence.', startSec: 2.2, endSec: 4.5, durationSec: 2.3, timeRange: '00:02.200 - 00:04.500', highlightedHtml: 'Second sentence.' },
      ],
      chunks: [
        { index: 1, text: 'First sentence. Second sentence.', startSec: 0, endSec: 4.5, timeRange: '00:00.000 - 00:04.500', sentenceIndices: [1, 2], highlightedHtml: 'First sentence. Second sentence.' },
      ],
      transcriptData: {
        sourceType: 'uploaded_audio',
        platform: 'uploaded_audio',
        providerEngine: 'whisper',
        reviewStatus: 'ready',
        reviewError: '',
        speakerOverrides: {},
        raw: { fullText: 'First sentence. Second sentence.', words: [], sentences: [] },
        reviewed: {
          sentences: [],
          paragraphs: [],
          ideas: [],
          speakers: [
            { id: 'spk_1', name: 'Host', originalLabel: 'Host', colorIndex: 0, sentenceCount: 1, wordCount: 60, talkTimeMs: 15000 },
            { id: 'spk_2', name: 'Guest', originalLabel: 'Guest', colorIndex: 1, sentenceCount: 1, wordCount: 60, talkTimeMs: 15000 },
          ],
          speakerTurns: [],
          quality: { totalWords: 120, repairedWords: 3, repairedSentences: 1, overlapsResolved: 0, verbatimScore: 98, multiSpeaker: true, summary: '' },
          providerName: 'Test',
          modelName: 'test',
          reasoningLevel: 'none',
          executionTimeMs: 100,
          reviewedAt: new Date().toISOString(),
        },
      },
      createdAt: new Date().toISOString(),
    }, { userId: 'user_a' });

    assert.strictEqual(Boolean(saved.isCompleted), false);

    // Source key lookup scoped by user
    assert.ok(repo.findBySourceKey('media:abc123', { userId: 'user_a' }));
    assert.strictEqual(repo.findBySourceKey('media:abc123', { userId: 'user_b' }), undefined);

    // Summary projection includes metadata but omits heavy transcriptData
    const summariesA = repo.findSummaries(undefined, { userId: 'user_a' });
    assert.strictEqual(summariesA.length, 1);
    assert.strictEqual(summariesA[0].platform, 'uploaded_audio');
    assert.strictEqual(summariesA[0].reviewStatus, 'ready');
    assert.strictEqual(summariesA[0].speakerCount, 2);
    assert.strictEqual(summariesA[0].wordCount, 120);
    assert.strictEqual(summariesA[0].transcriptData, undefined);

    // Title rename isolated to user_a
    const renamedB = repo.updateTitle('lesson_unit_1', 'Hacked', { userId: 'user_b' });
    assert.strictEqual(renamedB, undefined);
    const renamedA = repo.updateTitle('lesson_unit_1', 'Renamed Podcast Episode', { userId: 'user_a' });
    assert.strictEqual(renamedA.title, 'Renamed Podcast Episode');

    // Real Derived Completion Law: 1/2 -> not completed; 2/2 -> completed!
    const partial = repo.setLessonItemCompletion('lesson_unit_1', 'sentences', 1, true, { userId: 'user_a' });
    assert.strictEqual(Boolean(partial.isCompleted), false);
    const done = repo.setLessonItemCompletion('lesson_unit_1', 'sentences', 2, true, { userId: 'user_a' });
    assert.strictEqual(Boolean(done.isCompleted), true);
  } finally {
    if (sqlite) sqlite.onModuleDestroy?.();
    if (prevEnv === undefined) delete process.env.FLAPTAP_SQLITE_PATH;
    else process.env.FLAPTAP_SQLITE_PATH = prevEnv;
    try { fs.unlinkSync(tmpDb); } catch {}
    try { fs.unlinkSync(`${tmpDb}-wal`); } catch {}
    try { fs.unlinkSync(`${tmpDb}-shm`); } catch {}
  }
});

test('normalizeRawTimedWords & alignReviewedWordsToRawTiming eliminate same-onset and insertion word overlaps', () => {
  const {
    normalizeRawTimedWords,
  } = require(path.join(distRoot, 'modules/tracks/shadowing/utils/word-alignment.util.js'));

  const sameOnsetRaw = [
    { word: 'You', clean: 'you', start_sec: 4.2, end_sec: 4.21 },
    { word: 'can', clean: 'can', start_sec: 4.2, end_sec: 4.3 },
    { word: 'do', clean: 'do', start_sec: 4.3, end_sec: 4.5 },
  ];
  const { words: norm } = normalizeRawTimedWords(sameOnsetRaw, undefined, 'You can do', 5);
  assert.strictEqual(norm.length, 3);
  assert(norm[0].endMs <= norm[1].startMs, 'same-onset first word must not overlap second word');
  assert(norm[1].endMs <= norm[2].startMs, 'second word must not overlap third word');
  assert(norm[0].endMs > norm[0].startMs && norm[1].endMs > norm[1].startMs);

  // Adjacent zero-gap insertion (`I` between `kilograms.` and `think`)
  const aligned = alignReviewedWordsToRawTiming(
    [
      { i: 0, word: 'kilograms', clean: 'kilograms', startMs: 1000, endMs: 1200, rawWord: 'kilograms' },
      { i: 1, word: 'think', clean: 'think', startMs: 1200, endMs: 1450, rawWord: 'think' },
    ],
    ['kilograms.', 'I', 'think'],
  );
  assert.strictEqual(aligned.words.length, 3);
  for (let i = 0; i < aligned.words.length - 1; i++) {
    assert(
      aligned.words[i].endMs <= aligned.words[i + 1].startMs,
      `aligned word ${i} must not overlap word ${i + 1}`,
    );
    assert(aligned.words[i].endMs > aligned.words[i].startMs);
  }
});

test('Short / Normal pacing modes produce distinct natural boundaries without fake periods or verb-object cuts', () => {
  const {
    segmentSentences,
  } = require(path.join(distRoot, 'core/linguistics/segmentation.js'));

  const rawTokens =
    "There are two hard problems when it comes to computer science. And I thought I would help guide you through the process, you know. When I was doing random workouts, my strength was plateauing because I wasn't doing anything consistently.".split(
      /\s+/,
    );
  const timed_words = rawTokens.map((w, idx) => ({
    word: w,
    clean: w.toLowerCase().replace(/[^a-z']/g, ''),
    start_sec: idx * 0.34,
    end_sec: idx * 0.34 + 0.31,
  }));
  const transcript = {
    title: 'Pacing Test',
    creator: 'Speaker',
    url: 'https://example.com',
    video_id: 'pacing_test_1',
    duration_seconds: rawTokens.length * 0.34 + 1,
    total_cues: 1,
    chunks: [],
    sentences: [],
    cues: [],
    timed_words,
    full_raw_transcript: rawTokens.join(' '),
  };

  const shortSents = segmentSentences(transcript, 'short');
  const normalSents = segmentSentences(transcript, 'normal');

  assert.strictEqual(normalSents.length, 3, 'Normal mode keeps all 3 complete grammatical sentences intact');
  assert(shortSents.length > normalSents.length, 'Short breaks sentences into bite-sized drills');

  // Legacy "Medium" (`balanced`) is folded into the accurate normal-sentence mode
  const legacyBalanced = segmentSentences(transcript, 'balanced');
  assert.deepStrictEqual(
    legacyBalanced.map((s) => s.text),
    normalSents.map((s) => s.text),
    'Legacy balanced input must resolve to complete Normal sentences',
  );

  for (let i = 0; i < shortSents.length - 1; i++) {
    assert(
      !(/\b(guide|help|get|stay)\.?$/i.test(shortSents[i].text) && /^(you|the|tuned)\b/i.test(shortSents[i + 1].text)),
      `Short mode must never cut verb+object ("${shortSents[i].text}" | "${shortSents[i + 1].text}")`,
    );
  }
  for (let i = 0; i < shortSents.length - 1; i++) {
    if (shortSents[i].text.includes('workouts,')) {
      assert(!shortSents[i].text.endsWith('.'), 'Split comma clause should keep verbatim comma, never inject fake period');
    }
  }
});

test('coalesceToCanonicalSentences + regroupShadowingLessonByPacing recovers legacy synthetic periods from raw.words', () => {
  const {
    coalesceToCanonicalSentences,
  } = require(path.join(distRoot, 'modules/tracks/shadowing/utils/word-alignment.util.js'));

  const rawWords = [
    { i: 0, word: 'If', clean: 'if', startMs: 0, endMs: 200, rawWord: 'If' },
    { i: 1, word: "you're", clean: "you're", startMs: 200, endMs: 420, rawWord: "you're" },
    { i: 2, word: 'like', clean: 'like', startMs: 420, endMs: 650, rawWord: 'like' },
    { i: 3, word: 'me,', clean: 'me', startMs: 650, endMs: 900, rawWord: 'me,' },
    { i: 4, word: 'and', clean: 'and', startMs: 950, endMs: 1150, rawWord: 'and' },
    { i: 5, word: 'you', clean: 'you', startMs: 1150, endMs: 1350, rawWord: 'you' },
    { i: 6, word: 'find', clean: 'find', startMs: 1350, endMs: 1600, rawWord: 'find' },
    { i: 7, word: 'yourself', clean: 'yourself', startMs: 1600, endMs: 1950, rawWord: 'yourself' },
    { i: 8, word: 'accumulating', clean: 'accumulating', startMs: 1950, endMs: 2450, rawWord: 'accumulating' },
    { i: 9, word: 'things', clean: 'things', startMs: 2450, endMs: 2700, rawWord: 'things' },
    { i: 10, word: 'because', clean: 'because', startMs: 2750, endMs: 3000, rawWord: 'because' },
    { i: 11, word: 'you', clean: 'you', startMs: 3000, endMs: 3200, rawWord: 'you' },
    { i: 12, word: 'need', clean: 'need', startMs: 3200, endMs: 3450, rawWord: 'need' },
    { i: 13, word: 'them.', clean: 'them', startMs: 3450, endMs: 3800, rawWord: 'them.' },
  ];

  // Legacy corrupted reviewed snapshot where synthetic periods were baked into short fragments
  const legacyReviewedSents = [
    {
      id: 'rev-1',
      index: 1,
      text: "If you're like me.",
      rawText: "If you're like me.",
      speakerId: 'spk_1',
      speaker: 'Speaker',
      repaired: false,
      repairNote: '',
      isOverlap: false,
      paragraphIndex: 1,
      ideaIndex: 1,
      startMs: 0,
      endMs: 900,
      startSec: 0,
      endSec: 0.9,
      words: [
        { ...rawWords[0], word: 'If' },
        { ...rawWords[1], word: "you're" },
        { ...rawWords[2], word: 'like' },
        { ...rawWords[3], word: 'me.' },
      ],
    },
    {
      id: 'rev-2',
      index: 2,
      text: 'And you find yourself accumulating things.',
      rawText: 'And you find yourself accumulating things.',
      speakerId: 'spk_1',
      speaker: 'Speaker',
      repaired: false,
      repairNote: '',
      isOverlap: false,
      paragraphIndex: 1,
      ideaIndex: 1,
      startMs: 950,
      endMs: 2700,
      startSec: 0.95,
      endSec: 2.7,
      words: [
        { ...rawWords[4], word: 'And' },
        rawWords[5],
        rawWords[6],
        rawWords[7],
        rawWords[8],
        { ...rawWords[9], word: 'things.' },
      ],
    },
    {
      id: 'rev-3',
      index: 3,
      text: 'Because you need them.',
      rawText: 'Because you need them.',
      speakerId: 'spk_1',
      speaker: 'Speaker',
      repaired: false,
      repairNote: '',
      isOverlap: false,
      paragraphIndex: 1,
      ideaIndex: 1,
      startMs: 2750,
      endMs: 3800,
      startSec: 2.75,
      endSec: 3.8,
      words: [
        { ...rawWords[10], word: 'Because' },
        rawWords[11],
        rawWords[12],
        rawWords[13],
      ],
    },
  ];

  const recovered = coalesceToCanonicalSentences(legacyReviewedSents, rawWords);
  assert.strictEqual(recovered.length, 1, 'Synthetic periods grounded via rawWords must coalesce into 1 canonical sentence');
  assert.strictEqual(
    recovered[0].text,
    "If you're like me, and you find yourself accumulating things because you need them.",
  );
});

test('parseManualTranscriptInput parses SRT, VTT, and plain text with monotonic word timings', () => {
  const srt = parseManualTranscriptInput(
    '1\n00:00:01,000 --> 00:00:03,200\nWelcome back to the channel.\n\n2\n00:00:03,500 --> 00:00:05,900\nLet us practice natural speech.',
  );
  assert.strictEqual(srt.format, 'srt');
  assert.strictEqual(srt.cues.length, 2);
  assert.strictEqual(srt.cues[0].start_sec, 1);
  assert.ok(srt.timedWords.length >= 10);

  const vtt = parseManualTranscriptInput(
    'WEBVTT\n\n00:00.500 --> 00:02.100\nFirst line here.\n\n00:02.400 --> 00:04.200\nSecond line here.',
  );
  assert.strictEqual(vtt.format, 'vtt');
  assert.strictEqual(vtt.cues.length, 2);

  const plain = parseManualTranscriptInput('First spoken sentence. Second spoken sentence!');
  assert.strictEqual(plain.format, 'plain');
  assert.strictEqual(plain.cues.length, 2);
  for (let i = 1; i < plain.timedWords.length; i++) {
    assert.ok(plain.timedWords[i].start_sec >= plain.timedWords[i - 1].start_sec);
  }
});

const asyncTests = [];
function testAsync(name, fn) {
  asyncTests.push({ name, fn });
}

testAsync('ShadowingService strictly enforces original provider transcripts (blocks Whisper/Groq and stops on errors)', async () => {
  const savedItems = new Map();
  let whisperCalled = false;
  const fakeHistoryRepo = {
    findBySourceKey: () => undefined,
    findByUrlOrVideoId: () => undefined,
    create: (item) => {
      savedItems.set(item.id, item);
      return item;
    },
    findById: (id) => savedItems.get(id),
    update: () => undefined,
    buildCleanMarkdown: (t) => `# ${t}`,
  };
  const fakeTranscript = {
    extract: async () => {
      throw new ServiceUnavailableException({ code: 'rate_limited', message: 'YouTube 429 limit' });
    },
  };
  const fakeMediaTx = {
    transcribeUrl: async () => {
      whisperCalled = true;
      throw new Error('Should never be called on YouTube 429');
    },
  };
  const fakeShared = {
    findByKey: () => null,
    getMediaDir: () => os.tmpdir(),
    linkLessonToSource: () => undefined,
    upsert: () => ({ id: 'src_1' }),
  };
  const fakeAiProviders = {
    hasAnyConfiguredKey: () => true,
    resolvePreferredCloudSttKey: () => ({ provider: 'groq', apiKey: 'gsk_test', baseUrl: 'https://api.groq.com', model: 'whisper-large-v3-turbo' }),
  };
  const svc = new ShadowingService(
    fakeHistoryRepo,
    fakeTranscript,
    {},
    {},
    {},
    {},
    fakeShared,
    fakeMediaTx,
    fakeAiProviders,
  );

  const cfg = svc.getConfig('u1');
  assert.strictEqual(cfg.cloudStt.available, false, 'cloudStt must be disabled for Shadowing');
  assert.strictEqual(cfg.strictProviderTranscriptsOnly, true);

  // 1. Even with allowInstantOpen: true, caption error MUST reject immediately and NEVER open/persist an empty fallback
  await assert.rejects(
    () => svc.process('https://www.youtube.com/watch?v=dQw4w9WgXcQ', false, { userId: 'u1' }, 'short', { allowInstantOpen: true }),
    (err) => err?.getStatus?.() === 503 && !whisperCalled,
  );
  assert.strictEqual(whisperCalled, false, 'Whisper/Groq fallback must NEVER trigger on YouTube errors');
  assert.strictEqual(savedItems.size, 0, 'Must NOT proceed or persist a pending lesson when provider captions fail');

  // 2. Explicit third-party / Whisper transcribe endpoint is strictly disabled
  await assert.rejects(
    () => svc.transcribeLessonExplicit('any_id', { allowLocalWhisper: true }, { userId: 'u1' }),
    (err) => err?.getStatus?.() === 400 && err?.getResponse?.()?.code === 'third_party_stt_disabled',
  );
});

// 13. Interrupted utterances & self-corrections in AI Review + Alignment
test('parseTranscriptReviewResponse & assembleAlignedReviewedViews preserve isInterrupted and never merge interrupted turns', () => {
  const parsed = parseTranscriptReviewResponse(JSON.stringify({
    sentences: [
      {
        text: 'I was gonna—actually, hold on—',
        speaker: 'Alex',
        repaired: false,
        isOverlap: true,
        isInterrupted: true,
        paragraphIndex: 1,
        ideaIndex: 1,
      },
      {
        text: 'Wait let me jump in real quick.',
        speaker: 'Alex',
        repaired: false,
        isOverlap: false,
        isInterrupted: false,
        paragraphIndex: 1,
        ideaIndex: 1,
      },
    ],
    ideas: [{ index: 1, title: 'Quick Pivot', summary: 'Speaker interrupts.', keyTakeaway: 'Self-correction flow' }],
  }));

  assert.strictEqual(parsed.sentences[0].isInterrupted, true);
  assert.strictEqual(parsed.sentences[1].isInterrupted, false);

  const rawWords = [
    { i: 0, word: 'i', clean: 'i', startMs: 0, endMs: 100 },
    { i: 1, word: 'was', clean: 'was', startMs: 110, endMs: 250 },
    { i: 2, word: 'gonna', clean: 'gonna', startMs: 260, endMs: 500 },
    { i: 3, word: 'actually', clean: 'actually', startMs: 510, endMs: 800 },
    { i: 4, word: 'hold', clean: 'hold', startMs: 810, endMs: 1000 },
    { i: 5, word: 'on', clean: 'on', startMs: 1010, endMs: 1200 },
    { i: 6, word: 'wait', clean: 'wait', startMs: 1300, endMs: 1500 },
    { i: 7, word: 'let', clean: 'let', startMs: 1510, endMs: 1650 },
    { i: 8, word: 'me', clean: 'me', startMs: 1660, endMs: 1780 },
    { i: 9, word: 'jump', clean: 'jump', startMs: 1790, endMs: 2000 },
    { i: 10, word: 'in', clean: 'in', startMs: 2010, endMs: 2150 },
    { i: 11, word: 'real', clean: 'real', startMs: 2160, endMs: 2350 },
    { i: 12, word: 'quick', clean: 'quick', startMs: 2360, endMs: 2600 },
  ];

  const assembled = assembleAlignedReviewedViews({
    rawWords,
    draftSentences: parsed.sentences,
    draftIdeas: parsed.ideas,
    defaultSpeaker: 'Host',
    pacingMode: 'normal',
  });

  assert.strictEqual(assembled.canonicalSentences.length, 2);
  assert.strictEqual(assembled.canonicalSentences[0].isInterrupted, true);
  assert.strictEqual(assembled.sentences[0].isInterrupted, true);

  const coalesced = coalesceToCanonicalSentences(assembled.canonicalSentences, rawWords);
  assert.strictEqual(coalesced.length, 2, 'Interrupted sentence must not coalesce into next turn');
});

// 14. Context-Aware AI Companion Prompt & Context Grounding
test('buildShadowingAskSystemPrompt & buildShadowingAskContextBundle include excerpt, ±5 surrounding lines, ideas & history', () => {
  const sys = buildShadowingAskSystemPrompt('ar');
  assert.ok(sys.includes('Native American English'), 'System prompt establishes native mentor persona');
  assert.ok(sys.includes('"ar"'), 'System prompt includes learner native language code');

  const fakeLesson = {
    id: 'les_ask_1',
    title: 'How Founders Think Out Loud',
    creator: 'Alex',
    platform: 'YouTube',
    pacingWpm: 162,
    cefrLevel: 'C1',
    sentences: [],
    transcriptData: {
      reviewed: {
        canonicalSentences: Array.from({ length: 12 }, (_, idx) => ({
          index: idx + 1,
          text: `Sentence number ${idx + 1} with natural phrasing.`,
          speaker: idx % 2 === 0 ? 'Alex' : 'Sam',
          startMs: idx * 2000,
          endMs: idx * 2000 + 1800,
          isInterrupted: idx === 5,
        })),
        ideas: [{ index: 1, title: 'Opening Hook', summary: 'Sets the stage.', startMs: 0, endMs: 24000 }],
      },
      askHistory: [{ id: 'h1', role: 'user', content: 'Previous question?', selectedText: 'Sentence number 2' }],
    },
  };

  const bundle = buildShadowingAskContextBundle(fakeLesson, {
    question: 'Why did he cut himself off here?',
    selectedText: 'Sentence number 6 with natural phrasing.',
    sentenceIndex: 6,
    startMs: 10000,
    endMs: 11800,
    speaker: 'Sam',
    view: 'reviewed',
  });

  assert.strictEqual(bundle.anchorIndex, 6);
  assert.ok(bundle.userPrompt.includes('<selected_excerpt>'));
  assert.ok(bundle.userPrompt.includes('speaker_interrupted_cut_off'));
  assert.ok(bundle.userPrompt.includes('>>> #6 [00:10.000] Sam: Sentence number 6'));
  assert.ok(bundle.userPrompt.includes('#1 [00:00.000]'), 'Includes -5 window');
  assert.ok(bundle.userPrompt.includes('#11 [00:20.000]'), 'Includes +5 window');
  assert.ok(bundle.userPrompt.includes('Opening Hook'), 'Includes video ideas arc');
  assert.ok(bundle.userPrompt.includes('Previous question?'), 'Includes prior conversation history');
});

// 15. Reading Bookmark Persistence Separate From Derived Completion Law
test('ShadowingService.updateReadingBookmark persists & clears bookmark in SQLite without mutating isCompleted', () => {
  const tmpDb = path.join(os.tmpdir(), `flaptap-bm-test-${Date.now()}.sqlite`);
  const sqlite = { db: new (require('node:sqlite').DatabaseSync)(tmpDb) };
  // Reuse full SqliteService schema initialization
  process.env.FLAPTAP_SQLITE_PATH = tmpDb;
  const realSqlite = new SqliteService();
  try {
    realSqlite.db.prepare(
      `INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run('u_bm', 'bm@example.com', 'BM', 'hash', new Date().toISOString());

    const repo = new HistoryRepository(realSqlite);
    const created = repo.create({
      id: 'les_bm_1',
      track: 'shadowing',
      trackTitle: 'Shadowing',
      title: 'Bookmark Test',
      creator: 'Host',
      sourceUrl: 'https://youtube.com/watch?v=abcdefghijk',
      thumbnailUrl: '',
      accentDialect: 'American',
      durationSeconds: 30,
      pacingWpm: 150,
      difficulty: 'Intermediate',
      chunksCount: 1,
      stats: { totalWords: 8, sentencesCount: 2, connectedCount: 0, expressionsCount: 0, vocabularyCount: 0 },
      sentences: [
        { id: 's-1', index: 1, timeRange: '00:00 - 00:02', startSec: 0, endSec: 2, durationSec: 2, text: 'First sentence.', highlightedHtml: 'First sentence.' },
        { id: 's-2', index: 2, timeRange: '00:02 - 00:04', startSec: 2, endSec: 4, durationSec: 2, text: 'Second sentence.', highlightedHtml: 'Second sentence.' },
      ],
      chunks: [{ index: 1, timeRange: '00:00 - 00:04', startSec: 0, endSec: 4, sentenceIndices: [1, 2], text: 'First sentence. Second sentence.', highlightedHtml: 'First sentence. Second sentence.' }],
      noteMarkdown: '# Bookmark Test',
      createdAt: new Date().toISOString(),
      completedDrills: 0,
    }, { userId: 'u_bm' });

    const { ShadowingReviewService } = require(path.join(distRoot, 'modules/tracks/shadowing/shadowing.review.service.js'));
    const revSvc = new ShadowingReviewService(repo, {});
    const svc = new ShadowingService(repo, {}, {}, {}, {}, revSvc, {}, {}, {});

    const setRes = svc.updateReadingBookmark(created.id, {
      sentenceIndex: 2,
      startMs: 2000,
      view: 'reviewed',
      excerpt: 'Second sentence.',
    }, { userId: 'u_bm' });

    assert.strictEqual(setRes.readingBookmark.sentenceIndex, 2);
    assert.strictEqual(setRes.readingBookmark.view, 'reviewed');

    const reloaded = repo.findById(created.id, { userId: 'u_bm' });
    assert.strictEqual(reloaded.transcriptData.readingBookmark.sentenceIndex, 2);
    assert.strictEqual(Boolean(reloaded.isCompleted), false, 'Bookmark must NEVER mark lesson completed');

    const cleared = svc.updateReadingBookmark(created.id, null, { userId: 'u_bm' });
    assert.strictEqual(cleared.readingBookmark, null);
  } finally {
    realSqlite.onModuleDestroy();
    try { fs.unlinkSync(tmpDb); } catch {}
    delete process.env.FLAPTAP_SQLITE_PATH;
  }
});

// 16. TranscriptProviderGuard: dedup, spacing, budget, persistent circuit breaker, negative cache, & kill-switch
testAsync('TranscriptProviderGuard enforces dedup, spacing, rolling budget, persistent cooldown & kill-switch', async () => {
  const { execFileSync } = require('child_process');
  const tmpState = path.join(os.tmpdir(), `flaptap-guard-test-${Date.now()}.json`);
  const prevLiveFlag = process.env.FLAPTAP_LIVE_TRANSCRIPTS;
  process.env.FLAPTAP_LIVE_TRANSCRIPTS = 'on';

  try {
    let fakeNow = 1_700_000_000_000;
    const sleeps = [];
    const createGuard = () =>
      new TranscriptProviderGuard({
        stateFilePath: tmpState,
        nowFn: () => fakeNow,
        sleepFn: async (ms) => {
          sleeps.push(ms);
          fakeNow += ms;
        },
        jitterFn: () => 0,
        policies: {
          youtube: {
            minSpacingMs: 5000,
            jitterMs: 0,
            maxPer10Min: 3,
            maxPerHour: 10,
            cooldownStepsSec: [900, 2700, 7200],
          },
        },
        forceCooldownMs: 120_000,
        negativeCacheTtlMs: 6 * 60 * 60 * 1000,
      });

    const guard = createGuard();

    // A. Single-flight deduplication
    let dedupCalls = 0;
    const [r1, r2] = await Promise.all([
      guard.execute({
        provider: 'youtube',
        targetKey: 'vid_dedup_1',
        isRateLimitError: () => false,
        run: async () => {
          dedupCalls++;
          await new Promise((r) => setTimeout(r, 15));
          return { ok: true };
        },
      }),
      guard.execute({
        provider: 'youtube',
        targetKey: 'vid_dedup_1',
        isRateLimitError: () => false,
        run: async () => {
          dedupCalls++;
          return { ok: false };
        },
      }),
    ]);
    assert.strictEqual(dedupCalls, 1, 'Concurrent calls for same video must deduplicate to 1 execution');
    assert.strictEqual(r1.ok && r2.ok, true);

    // Force cooldown check on same video immediately after fetch
    assert.strictEqual(
      guard.shouldSkipForceRefresh('youtube', 'vid_dedup_1'),
      true,
      'Repeated force refresh inside cooldown window should be skipped',
    );

    // B. Pacing spacing & rolling budget exhaustion (maxPer10Min = 3)
    await guard.execute({
      provider: 'youtube',
      targetKey: 'vid_budget_2',
      isRateLimitError: () => false,
      run: async () => 'ok2',
    });
    assert.ok(sleeps.some((ms) => ms >= 4900), 'Second call immediately after first must wait minSpacingMs');

    fakeNow += 10_000;
    await guard.execute({
      provider: 'youtube',
      targetKey: 'vid_budget_3',
      isRateLimitError: () => false,
      run: async () => 'ok3',
    });

    // 4th call within 10 minutes exceeds maxPer10Min=3 and must fail fast BEFORE running `run`
    let budgetBlockedRan = false;
    await assert.rejects(
      () =>
        guard.execute({
          provider: 'youtube',
          targetKey: 'vid_budget_4',
          isRateLimitError: () => false,
          run: async () => {
            budgetBlockedRan = true;
            return 'nope';
          },
        }),
      (err) => {
        const resp = err?.getResponse?.();
        return resp?.code === 'rate_limited' && resp?.retryAfterSec > 0;
      },
    );
    assert.strictEqual(budgetBlockedRan, false, 'Rolling 10-min budget must block BEFORE hitting network');

    // C. Negative cache for no_captions
    fakeNow += 11 * 60 * 1000; // Advance 11m so 10m budget clears
    let negCalls = 0;
    await assert.rejects(
      () =>
        guard.execute({
          provider: 'youtube',
          targetKey: 'vid_nocap_1',
          isRateLimitError: () => false,
          classifyPermanentError: () => ({ code: 'no_captions', message: 'No English captions.' }),
          run: async () => {
            negCalls++;
            throw new Error('no_captions');
          },
        }),
    );
    assert.strictEqual(negCalls, 1);

    await assert.rejects(
      () =>
        guard.execute({
          provider: 'youtube',
          targetKey: 'vid_nocap_1',
          isRateLimitError: () => false,
          run: async () => {
            negCalls++;
            return 'should not run';
          },
        }),
      (err) => err?.getStatus?.() === 422 && err?.getResponse?.()?.code === 'no_captions',
    );
    assert.strictEqual(negCalls, 1, 'Cached negative result must short-circuit with 0 network calls');

    // D. Persistent circuit breaker + exponential cooldown across fresh instances
    await assert.rejects(
      () =>
        guard.execute({
          provider: 'youtube',
          targetKey: 'vid_429_1',
          isRateLimitError: () => true,
          run: async () => {
            throw new ServiceUnavailableException({ code: 'rate_limited', message: '429' });
          },
        }),
      (err) => err?.getResponse?.()?.code === 'rate_limited' && err?.getResponse?.()?.retryAfterSec === 900,
    );

    // Brand-new instance simulating a server restart MUST still block for remaining cooldown!
    const restartedGuard = createGuard();
    let restartedRan = false;
    await assert.rejects(
      () =>
        restartedGuard.execute({
          provider: 'youtube',
          targetKey: 'vid_after_restart',
          isRateLimitError: () => false,
          run: async () => {
            restartedRan = true;
            return 'nope';
          },
        }),
      (err) => err?.getResponse?.()?.code === 'rate_limited' && err?.getResponse?.()?.retryAfterSec >= 899,
    );
    assert.strictEqual(restartedRan, false, 'Persisted circuit breaker must block calls even after restart');

    // Advance past 15m cooldown; strike #2 must escalate to 45m (2700s)
    fakeNow += 905 * 1000;
    await assert.rejects(
      () =>
        restartedGuard.execute({
          provider: 'youtube',
          targetKey: 'vid_429_2',
          isRateLimitError: () => true,
          run: async () => {
            throw new ServiceUnavailableException({ code: 'rate_limited', message: '429' });
          },
        }),
      (err) => err?.getResponse?.()?.retryAfterSec === 2700,
    );

    // Advance past 45m cooldown; success resets circuit breaker streak back to 0
    fakeNow += 2705 * 1000;
    const recovered = await restartedGuard.execute({
      provider: 'youtube',
      targetKey: 'vid_recover',
      isRateLimitError: () => false,
      run: async () => 'recovered',
    });
    assert.strictEqual(recovered, 'recovered');
    assert.strictEqual(restartedGuard.getStatusSnapshot().providers.youtube.consecutiveRateLimits, 0);

    // E. Kill-switch: FLAPTAP_LIVE_TRANSCRIPTS=off blocks both TS guard and Python helper
    process.env.FLAPTAP_LIVE_TRANSCRIPTS = 'off';
    assert.strictEqual(restartedGuard.isLiveFetchDisabled(), true);
    let killSwitchRan = false;
    await assert.rejects(
      () =>
        restartedGuard.execute({
          provider: 'youtube',
          targetKey: 'vid_kill',
          isRateLimitError: () => false,
          run: async () => {
            killSwitchRan = true;
            return 'nope';
          },
        }),
      (err) => err?.getStatus?.() === 503 && err?.getResponse?.()?.code === 'live_fetch_disabled',
    );
    assert.strictEqual(killSwitchRan, false);

    // Verify Python CLI helper also stops immediately with FLAPTAP_ERROR:live_fetch_disabled
    const pyBin = fs.existsSync(path.resolve(__dirname, '../.venv/bin/python3'))
      ? path.resolve(__dirname, '../.venv/bin/python3')
      : 'python3';
    const scriptPath = path.resolve(
      __dirname,
      '../skills/american-accent-shadowing-skill/scripts/extract_transcript.py',
    );
    let pyStderr = '';
    try {
      execFileSync(pyBin, [scriptPath, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'], {
        env: Object.assign({}, process.env, { FLAPTAP_LIVE_TRANSCRIPTS: 'off' }),
        encoding: 'utf-8',
      });
      assert.fail('extract_transcript.py should have exited non-zero under FLAPTAP_LIVE_TRANSCRIPTS=off');
    } catch (pyErr) {
      pyStderr = String(pyErr?.stderr || '');
    }
    assert.ok(
      pyStderr.includes('FLAPTAP_ERROR:live_fetch_disabled:'),
      `Expected FLAPTAP_ERROR:live_fetch_disabled in stderr, got: ${pyStderr}`,
    );
  } finally {
    if (prevLiveFlag === undefined) delete process.env.FLAPTAP_LIVE_TRANSCRIPTS;
    else process.env.FLAPTAP_LIVE_TRANSCRIPTS = prevLiveFlag;
    try { fs.unlinkSync(tmpState); } catch {}
  }
});

(async () => {
  for (const t of asyncTests) {
    try {
      await t.fn();
      passed++;
      console.log(`✅ PASSED: ${t.name}`);
    } catch (err) {
      console.error(`❌ FAILED: ${t.name}`);
      console.error(err);
      process.exit(1);
    }
  }
  console.log(`\n🎉 Consolidated Shadowing Unit Suite: ${passed} / ${passed} passed!\n`);
})();
