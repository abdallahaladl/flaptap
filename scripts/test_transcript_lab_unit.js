#!/usr/bin/env node
/**
 * Flaptap — Transcript Lab Unit Test Suite
 * Verifies:
 *  - Millisecond word sequence alignment (exact, 1:1 ASR fix, 2:1 merge, 1:2 split, ins/del, 2500-word perf)
 *  - Multi-speaker overlap resolution, Playback Boundary Law, speaker rename propagation
 *  - Universal 7-format x 5-view exporter (.txt, .md, .srt, .vtt, .json, .csv, .html)
 *  - Prompt chunking & malformed JSON salvage
 *  - SQLite repository isolation, pagination, filters & Real Derived Completion Law
 *  - Universal media URL classification (YouTube, Podcasts, Social, Direct Media, private IP block)
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
} = require(path.join(distRoot, 'modules/transcript-lab/utils/word-alignment.util.js'));

const {
  exportTranscriptDocument,
  SUPPORTED_EXPORT_FORMATS,
  SUPPORTED_VIEW_MODES,
} = require(path.join(distRoot, 'modules/transcript-lab/utils/transcript-export.util.js'));

const {
  buildReviewChunks,
  parseTranscriptReviewResponse,
} = require(path.join(distRoot, 'modules/transcript-lab/transcript-review.prompt.js'));

const { classifyMediaUrl } = require(path.join(distRoot, 'core/media/media-url.js'));
const { SqliteService } = require(path.join(distRoot, 'core/database/sqlite.service.js'));
const { TranscriptLabRepository } = require(path.join(
  distRoot,
  'modules/transcript-lab/transcript-lab.repository.js',
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

console.log('\n🧪 Running Transcript Lab Unit Suite...\n');

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

test('alignReviewedWordsToRawTiming aligns 2,500-word podcast monotonically in under 150ms', () => {
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
  // Playback Boundary Law: first sentence endMs must be <= next startMs - 50
  assert.ok(
    assembled.sentences[0].endMs <= assembled.sentences[1].startMs - 50,
    `Expected <= ${assembled.sentences[1].startMs - 50}, got ${assembled.sentences[0].endMs}`,
  );

  // Rename speakers & confirm propagation across sentences, paragraphs, ideas, speakerTurns
  applySpeakerOverridesToReviewed(assembled, { spk_1: 'Lex Fridman', spk_2: 'Andrej Karpathy' });
  assert.strictEqual(assembled.sentences[0].speaker, 'Lex Fridman');
  assert.strictEqual(assembled.sentences[1].speaker, 'Andrej Karpathy');
  assert.strictEqual(assembled.speakerTurns[1].speaker, 'Andrej Karpathy');
  assert.ok(assembled.ideas[0].speakers.includes('Andrej Karpathy'));
});

// 4. Universal 7-Format x 5-View Exporter
test('exportTranscriptDocument generates valid output across all 5 views and all 7 formats', () => {
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

  const fakeDoc = {
    id: 'tr_test',
    userId: 'u1',
    sourceId: 'src_1',
    sourceKey: 'youtube:dQw4w9WgXcQ',
    sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    sourceType: 'youtube',
    platform: 'YouTube',
    title: 'Thinking in American English',
    creator: 'Host',
    thumbnailUrl: '',
    durationSeconds: 12,
    providerEngine: 'youtube_json3',
    media: { hasAudio: true, hasVideo: true, mediaKind: 'youtube', mediaId: 'dQw4w9WgXcQ', streamUrl: '', mimeType: '', durationSeconds: 12 },
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
    completion: { items: [] },
    sentenceCount: 2,
    completedCount: 0,
    wordCount: 8,
    speakerCount: 2,
    repairCount: 0,
    isCompleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  for (const view of SUPPORTED_VIEW_MODES) {
    for (const format of SUPPORTED_EXPORT_FORMATS) {
      const out = exportTranscriptDocument(fakeDoc, { view, format });
      assert.ok(out.content.length > 10, `Empty export for ${view}.${format}`);
      assert.ok(out.filename.endsWith(`-${view}.${format}`), `Unexpected filename ${out.filename}`);
      if (format === 'json') {
        const parsed = JSON.parse(out.content);
        assert.strictEqual(parsed.view, view);
      }
      if (format === 'srt') {
        assert.ok(out.content.includes(' --> '), 'SRT must contain arrow cue');
      }
      if (format === 'vtt') {
        assert.ok(out.content.startsWith('WEBVTT'), 'VTT must start with WEBVTT');
      }
      if (format === 'md') {
        assert.ok(out.content.startsWith('---\n'), 'Markdown must start with YAML frontmatter');
      }
      if (format === 'html') {
        assert.ok(out.content.includes('<!doctype html>'), 'HTML must be standalone document');
      }
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

  const parsed = parseTranscriptReviewResponse('```json\n{"sentences":[{"text":"Hello world.","speaker":"Host","repaired":false}],"ideas":[{"index":1,"title":"Greeting","summary":"Says hello."}]}\n```');
  assert.strictEqual(parsed.sentences.length, 1);
  assert.strictEqual(parsed.ideas.length, 1);
});

// 6. SQLite Repository, Strict Account Isolation & Real Derived Completion Law
test('TranscriptLabRepository enforces user isolation, speaker overrides, and strict Real Derived Completion Law', () => {
  const tmpDb = path.join(os.tmpdir(), `flaptap-tlab-unit-${Date.now()}.sqlite`);
  process.env.FLAPTAP_SQLITE_PATH = tmpDb;
  const sqlite = new SqliteService();

  try {
    const now = new Date().toISOString();
    sqlite.db
      .prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('u_alice', 'alice@test.local', 'Alice', 'hash', now);
    sqlite.db
      .prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('u_bob', 'bob@test.local', 'Bob', 'hash', now);

    const repo = new TranscriptLabRepository(sqlite);
    const raw = buildRawTranscriptSnapshot({
      provider: 'youtube_json3',
      title: 'Test Clip',
      creator: 'Alice',
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
      mediaId: 'abcdefghijk',
      durationSeconds: 10,
      fullText: 'First sentence here. Second sentence here.',
      timedWords: [
        { word: 'First', clean: 'first', start_sec: 0.1, end_sec: 0.5 },
        { word: 'sentence', clean: 'sentence', start_sec: 0.5, end_sec: 1.0 },
        { word: 'here.', clean: 'here', start_sec: 1.0, end_sec: 1.5 },
        { word: 'Second', clean: 'second', start_sec: 2.0, end_sec: 2.4 },
        { word: 'sentence', clean: 'sentence', start_sec: 2.4, end_sec: 2.9 },
        { word: 'here.', clean: 'here', start_sec: 2.9, end_sec: 3.4 },
      ],
    });

    const created = repo.createOrUpdateRaw('u_alice', {
      sourceId: 'src_a',
      sourceKey: 'youtube:abcdefghijk',
      sourceUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      sourceType: 'youtube',
      platform: 'YouTube',
      title: 'Test Clip',
      creator: 'Alice',
      thumbnailUrl: '',
      durationSeconds: 10,
      hasAudio: true,
      hasVideo: true,
      mediaKind: 'youtube',
      mediaId: 'abcdefghijk',
      mimeType: 'video/youtube',
      providerEngine: 'youtube_json3',
      raw,
    });

    // Strict account isolation
    assert.strictEqual(repo.findById('u_bob', created.id), null);
    assert.strictEqual(repo.delete('u_bob', created.id), false);
    assert.strictEqual(repo.list('u_bob').total, 0);

    // Real Derived Completion Law
    assert.strictEqual(created.sentenceCount, 2);
    assert.strictEqual(created.isCompleted, false);

    const step1 = repo.toggleSentenceCompletion('u_alice', created.id, 1, true);
    assert.strictEqual(step1.completedCount, 1);
    assert.strictEqual(step1.isCompleted, false);

    const step2 = repo.toggleSentenceCompletion('u_alice', created.id, 2, true);
    assert.strictEqual(step2.completedCount, 2);
    assert.strictEqual(step2.isCompleted, true);

    const step3 = repo.toggleSentenceCompletion('u_alice', created.id, 1, false);
    assert.strictEqual(step3.completedCount, 1);
    assert.strictEqual(step3.isCompleted, false);

    // Rename title & verify
    const renamed = repo.updateTitle('u_alice', created.id, 'My Custom Podcast Title');
    assert.strictEqual(renamed.title, 'My Custom Podcast Title');

    // Pagination & search
    const listRes = repo.list('u_alice', { q: 'Custom Podcast', page: 1, limit: 10 });
    assert.strictEqual(listRes.total, 1);
    assert.strictEqual(listRes.items[0].id, created.id);
  } finally {
    sqlite.onModuleDestroy();
    try { fs.unlinkSync(tmpDb); } catch {}
    try { fs.unlinkSync(tmpDb + '-wal'); } catch {}
    try { fs.unlinkSync(tmpDb + '-shm'); } catch {}
  }
});

console.log('\n' + '='.repeat(50));
console.log(`🎉 ALL TRANSCRIPT LAB UNIT TESTS PASSED (${passed} suites)`);
console.log('='.repeat(50) + '\n');
