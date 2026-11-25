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
  regroupShadowingLessonByPacing,
} = require(path.join(distRoot, 'modules/tracks/shadowing/utils/word-alignment.util.js'));

const {
  exportShadowingLesson,
  SUPPORTED_EXPORT_FORMATS,
  SUPPORTED_VIEW_MODES,
} = require(path.join(distRoot, 'modules/tracks/shadowing/utils/transcript-export.util.js'));

const {
  buildReviewChunks,
  parseTranscriptReviewResponse,
} = require(path.join(distRoot, 'modules/tracks/shadowing/shadowing-review.prompt.js'));

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

test('assembleAlignedReviewedViews automatically splits long 20+ word rambling sentences into short shadowing bites (<=8 words)', () => {
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
      s.words.length <= 8,
      `Shadowing line too long (${s.words.length} words): "${s.text}"`,
    );
    assert.strictEqual(s.paragraphIndex, 1, 'Split lines must stay grouped in the same paragraph');
  }
  // Verify exact verbatim preservation across all split lines
  const rejoined = assembled.sentences.map((s) => s.text).join(' ');
  assert.strictEqual(rejoined, tokens.join(' '));
});

test('regroupShadowingLessonByPacing dynamically switches short <-> balanced <-> full with zero hard cuts, completion & translation preservation', () => {
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
  assert.ok(lesson.sentences.every((s) => s.words.length <= 8), 'Every short line must be <= 8 words');

  // Seed translation for short line #1 and mark all short lines belonging to canonical sentence #1 complete
  const firstShortText = lesson.sentences[0].text;
  lesson.translationsCache.ar[1] = 'لكن ما لن أفعله';
  lesson.sentences[0].translations = { ar: 'لكن ما لن أفعله' };
  const s1MaxWordI = s1Tokens.length - 1;
  lesson.completionProgress.sentences = lesson.sentences
    .filter((s) => s.words.every((w) => w.i <= s1MaxWordI))
    .map((s) => s.index);

  // Switch short -> full
  regroupShadowingLessonByPacing(lesson, 'full');
  assert.strictEqual(lesson.pacingMode, 'full');
  assert.ok(lesson.sentences.length <= 3, `Expected full mode to keep grammatical sentences (<=3), got ${lesson.sentences.length}`);
  // Sentence #1 should remain completed under Real Derived Completion Law
  assert.ok(lesson.completionProgress.sentences.includes(1), 'Full sentence #1 must remain completed when all constituent short bites were completed');
  // Mismatched short translation must NOT leak onto full sentence #1
  assert.strictEqual(lesson.translationsCache.ar?.[1], undefined, 'Mismatched short translation must not attach to different full sentence');
  // 50ms Playback Boundary Law check
  for (let i = 0; i < lesson.sentences.length - 1; i++) {
    assert.ok(
      lesson.sentences[i].endMs <= lesson.sentences[i + 1].startMs - 50,
      `Full mode boundary violation between #${i + 1} and #${i + 2}`,
    );
  }

  // Switch full -> balanced
  regroupShadowingLessonByPacing(lesson, 'balanced');
  assert.strictEqual(lesson.pacingMode, 'balanced');
  assert.ok(lesson.sentences.length > 2 && lesson.sentences.length < shortCount, `Expected balanced count between full and short, got ${lesson.sentences.length}`);
  assert.ok(lesson.sentences.every((s) => s.words.length <= 14), 'Every balanced line must be <= 14 words');

  // Switch balanced -> short (round-trip)
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

console.log(`\n🎉 Consolidated Shadowing Unit Suite: ${passed} / ${passed} passed!\n`);
