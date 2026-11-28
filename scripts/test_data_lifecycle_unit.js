#!/usr/bin/env node
/**
 * Flaptap — DataLifecycle & Zero-Trace Purge Unit Suite
 * Verifies:
 *  1. Shadowing zero-trace delete (SQLite, shared_sources, disk transcript & media caches,
 *     practice_logs, wordLookup RAM cache, checkExisting === false, linked vocab option,
 *     multi-user reference-counted disk media GC, replaceExisting reset, clearLessonCaches reset)
 *  2. Phrase Miner (american_extractor): sub-item delete with index shifting & Real Derived
 *     Completion Law, resetProgress, purgeExtractorNote, bulk delete, clear all
 *  3. Phrase Builder (learning_library): single delete pruning empty batch rows,
 *     resetLearningLibraryProgress (notes/favorites options), bulk & domain/all clear
 *  4. Think Aloud: session delete cascading practice_logs, spine progress reset,
 *     builtin spine protection vs custom spine delete
 *  5. Vocabulary & Feature-Scoped Isolation: bulk/clear/reset & shadowing vs street_talk vs userB
 *  6. Audit Log, Workspace Factory Reset (`RESET` phrase validation, `includeAuditLog` modes,
 *     preserving users & auth_sessions), and Account external artifact cleanup
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const distRoot = path.resolve(__dirname, '../backend/dist');

const { SqliteService } = require(path.join(distRoot, 'core/database/sqlite.service.js'));
const { HistoryRepository } = require(path.join(distRoot, 'core/database/history.repository.js'));
const {
  clearWordLookupCache,
  WordLookupService,
} = require(path.join(distRoot, 'core/ai/word-lookup.service.js'));
const { SharedSourcesRepository } = require(
  path.join(distRoot, 'modules/shared-sources/shared-sources.repository.js'),
);
const { SharedSourcesService } = require(
  path.join(distRoot, 'modules/shared-sources/shared-sources.service.js'),
);
const { TranscriptService } = require(
  path.join(distRoot, 'modules/tracks/media-hub/transcript.service.js'),
);
const { MediaHubService } = require(
  path.join(distRoot, 'modules/tracks/media-hub/media-hub.service.js'),
);
const { MediaTranscriptionService } = require(
  path.join(distRoot, 'modules/american-extractor/sources/media-transcription.service.js'),
);
const { AmericanExtractorRepository } = require(
  path.join(distRoot, 'modules/american-extractor/american-extractor.repository.js'),
);
const { LearningLibraryRepository } = require(
  path.join(distRoot, 'modules/learning-library/learning-library.repository.js'),
);
const { ThinkAloudRepository } = require(
  path.join(distRoot, 'modules/think-aloud/think-aloud.repository.js'),
);
const { VocabularyService } = require(
  path.join(distRoot, 'modules/vocabulary/vocabulary.service.js'),
);
const { AiProvidersRepository } = require(
  path.join(distRoot, 'modules/ai-providers/ai-providers.repository.js'),
);
const { AiProvidersService } = require(
  path.join(distRoot, 'modules/ai-providers/ai-providers.service.js'),
);
const { AuditLogRepository } = require(
  path.join(distRoot, 'modules/data-lifecycle/audit-log.repository.js'),
);
const { DataLifecycleService } = require(
  path.join(distRoot, 'modules/data-lifecycle/data-lifecycle.service.js'),
);

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

function seedUsers(sqlite, userIds) {
  const now = new Date().toISOString();
  const stmt = sqlite.db.prepare(
    `INSERT OR IGNORE INTO users (
      id, email, name, password_hash, native_language, ui_language,
      daily_goal_minutes, created_at
    ) VALUES (?, ?, ?, 'hash', 'ar', 'en', 15, ?)`,
  );
  for (const uid of userIds) {
    stmt.run(uid, `${uid}@flaptap.test`, `User ${uid}`, now);
  }
}

function buildHarness() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaptap-lifecycle-unit-'));
  const tmpDb = path.join(tmpDir, 'test.sqlite');
  const prevEnv = process.env.FLAPTAP_SQLITE_PATH;
  process.env.FLAPTAP_SQLITE_PATH = tmpDb;

  const sqlite = new SqliteService();

  const historyRepo = new HistoryRepository(sqlite);
  const sharedSourcesRepo = new SharedSourcesRepository(sqlite);
  const sharedSourcesService = new SharedSourcesService(sharedSourcesRepo, sqlite);
  const transcriptService = new TranscriptService();
  const mediaTranscription = new MediaTranscriptionService();
  const aiProvidersRepo = new AiProvidersRepository(sqlite);
  const aiProvidersService = new AiProvidersService(
    {
      discoverAllKeys: () => [],
      toPublicProfile: (k) => k,
    },
    aiProvidersRepo,
    {},
    { protocol: 'openai' },
    { protocol: 'gemini' },
    { protocol: 'anthropic' },
  );
  const auditLog = new AuditLogRepository(sqlite);
  const lifecycle = new DataLifecycleService(
    sqlite,
    historyRepo,
    sharedSourcesService,
    sharedSourcesRepo,
    transcriptService,
    mediaTranscription,
    aiProvidersService,
    auditLog,
  );
  const shadowingService = new MediaHubService(
    historyRepo,
    transcriptService,
    null,
    null,
    null,
    null,
    sharedSourcesService,
    mediaTranscription,
    aiProvidersService,
  );
  const extractorRepo = new AmericanExtractorRepository(sqlite);
  const libraryRepo = new LearningLibraryRepository(sqlite);
  const thinkAloudRepo = new ThinkAloudRepository(sqlite);
  const vocabService = new VocabularyService(sqlite);

  const createdFiles = [];

  return {
    tmpDir,
    tmpDb,
    sqlite,
    historyRepo,
    sharedSourcesRepo,
    sharedSourcesService,
    transcriptService,
    mediaTranscription,
    aiProvidersService,
    auditLog,
    lifecycle,
    shadowingService,
    extractorRepo,
    libraryRepo,
    thinkAloudRepo,
    vocabService,
    trackFile(filePath) {
      createdFiles.push(filePath);
      return filePath;
    },
    cleanup() {
      for (const f of createdFiles) {
        try {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch {}
      }
      try {
        sqlite.onModuleDestroy?.();
      } catch {}
      if (prevEnv === undefined) delete process.env.FLAPTAP_SQLITE_PATH;
      else process.env.FLAPTAP_SQLITE_PATH = prevEnv;
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    },
  };
}

function makeLessonInput(overrides = {}) {
  const id = overrides.id || `lesson_${Math.random().toString(36).slice(2, 10)}`;
  const ytId = overrides.videoId || 'testVid0001';
  const sourceUrl =
    overrides.sourceUrl !== undefined
      ? overrides.sourceUrl
      : `https://www.youtube.com/watch?v=${ytId}`;
  return {
    id,
    title: overrides.title || 'Sample Lesson',
    creator: 'Speaker',
    videoId: ytId,
    sourceUrl,
    sourceKey: overrides.sourceKey || `youtube:${ytId}`,
    sourceId: overrides.sourceId || '',
    track: overrides.track || 'media_hub',
    trackTitle: overrides.trackTitle || 'Media Hub',
    duration: '00:05',
    sentencesCount: 2,
    completedCount: overrides.completedCount ?? 0,
    isCompleted: overrides.isCompleted ?? false,
    pacingMode: 'normal',
    pacingWpm: 150,
    sentences: [
      {
        id: 's1',
        index: 1,
        text: 'First sentence.',
        startSec: 0,
        endSec: 2,
        durationSec: 2,
        timeRange: '00:00.000 - 00:02.000',
        highlightedHtml: 'First sentence.',
        completed: true,
        analysis: { summary: 'Cached AI coach analysis' },
        translations: { ar: 'الجملة الأولى' },
      },
      {
        id: 's2',
        index: 2,
        text: 'Second sentence.',
        startSec: 2.2,
        endSec: 4.5,
        durationSec: 2.3,
        timeRange: '00:02.200 - 00:04.500',
        highlightedHtml: 'Second sentence.',
        completed: false,
      },
    ],
    chunks: [
      {
        index: 1,
        text: 'First sentence. Second sentence.',
        startSec: 0,
        endSec: 4.5,
        timeRange: '00:00.000 - 00:04.500',
        sentenceIndices: [1, 2],
        highlightedHtml: 'First sentence. Second sentence.',
      },
    ],
    transcriptData: {
      sourceType: 'youtube',
      platform: 'YouTube',
      providerEngine: 'youtube-captions',
      reviewStatus: 'ready',
      reviewError: '',
      speakerOverrides: { spk_1: 'Alex' },
      raw: {
        fullText: 'First sentence. Second sentence.',
        words: [
          { i: 0, word: 'First', clean: 'first', startMs: 0, endMs: 900, rawWord: 'First' },
          { i: 1, word: 'sentence.', clean: 'sentence', startMs: 900, endMs: 2000, rawWord: 'sentence.' },
          { i: 2, word: 'Second', clean: 'second', startMs: 2200, endMs: 3200, rawWord: 'Second' },
          { i: 3, word: 'sentence.', clean: 'sentence', startMs: 3200, endMs: 4500, rawWord: 'sentence.' },
        ],
        sentences: [
          {
            id: 'raw_s1',
            index: 1,
            text: 'First sentence.',
            startSec: 0,
            endSec: 2,
            durationSec: 2,
            timeRange: '00:00.000 - 00:02.000',
            highlightedHtml: 'First sentence.',
          },
          {
            id: 'raw_s2',
            index: 2,
            text: 'Second sentence.',
            startSec: 2.2,
            endSec: 4.5,
            durationSec: 2.3,
            timeRange: '00:02.200 - 00:04.500',
            highlightedHtml: 'Second sentence.',
          },
        ],
      },
      reviewed: {
        sentences: [],
        paragraphs: [],
        ideas: [],
        speakers: [],
        speakerTurns: [],
        quality: {
          totalWords: 4,
          repairedWords: 0,
          repairedSentences: 0,
          overlapsResolved: 0,
          verbatimScore: 100,
          multiSpeaker: false,
          summary: '',
        },
        providerName: 'Test',
        modelName: 'test',
        reasoningLevel: 'none',
        executionTimeMs: 50,
        reviewedAt: new Date().toISOString(),
      },
    },
    completionProgress: { sentences: [1], paragraphs: [] },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

console.log('\n🧪 Running DataLifecycle & Zero-Trace Purge Unit Suite...\n');

// ---------------------------------------------------------------------------
// 1. Shadowing zero-trace delete + re-ingest + refcounted media GC
// ---------------------------------------------------------------------------
test('1a. Shadowing purgeLesson performs zero-trace purge, records leak-free audit receipt, and resets checkExisting', () => {
  const h = buildHarness();
  try {
    seedUsers(h.sqlite, ['user_a', 'user_b']);

    const ytId = `tVid_${crypto.randomBytes(3).toString('hex')}`;
    const ytValidId = 'testVid0001'; // 11-char YouTube ID
    const ytCacheFile = h.trackFile(
      path.join(h.transcriptService.cacheDir, `${ytValidId}.json`),
    );
    fs.mkdirSync(path.dirname(ytCacheFile), { recursive: true });
    fs.writeFileSync(
      ytCacheFile,
      JSON.stringify({ version: 1, cachedAt: new Date().toISOString(), videoId: ytValidId, data: { text: 'First sentence.' } }),
    );

    const urlToPurge = `https://cdn.flaptap.test/audio/${ytId}.mp3`;
    const urlHash = crypto.createHash('sha1').update(`url:${urlToPurge}`).digest('hex');
    const mediaCacheFile = h.trackFile(
      path.join(h.mediaTranscription.cacheDir, `${urlHash}.json`),
    );
    fs.mkdirSync(path.dirname(mediaCacheFile), { recursive: true });
    fs.writeFileSync(mediaCacheFile, JSON.stringify({ cachedAt: new Date().toISOString(), data: { text: 'cached url' } }));

    const sharedSrc = h.sharedSourcesService.upsert('user_a', {
      sourceKey: `youtube:${ytValidId}`,
      sourceType: 'youtube',
      title: 'Purge Test Video',
      sourceUrl: `https://www.youtube.com/watch?v=${ytValidId}`,
      mediaKind: 'youtube',
      mediaId: ytValidId,
      transcriptText: 'First sentence. Second sentence.',
    });

    const lessonId = 'lesson_purge_1';
    h.historyRepo.create(
      makeLessonInput({
        id: lessonId,
        title: 'Purge Test Video',
        videoId: ytValidId,
        sourceUrl: `https://www.youtube.com/watch?v=${ytValidId}`,
        sourceKey: `youtube:${ytValidId}`,
        sourceId: sharedSrc.id,
      }),
      { userId: 'user_a' },
    );

    // Practice log + linked vocab
    h.sqlite.db
      .prepare(
        `INSERT INTO practice_logs (id, user_id, lesson_id, mode, drills_count, duration_sec, created_at)
         VALUES ('pl_purge_1', 'user_a', ?, 'shadow', 1, 25, ?)`,
      )
      .run(lessonId, new Date().toISOString());
    const vocab = h.vocabService.save(
      {
        term: 'keep going',
        definition: 'persist through difficulty',
        lessonId,
        videoId: ytValidId,
        lessonTitle: 'Purge Test Video',
      },
      { userId: 'user_a' },
    );

    // Populate WordLookupService RAM cache
    const wl = new WordLookupService({});
    wl.cache.set('test::keep::ar', { term: 'keep', definition: 'hold' });
    assert.strictEqual(wl.cache.size >= 1, true);

    assert.strictEqual(
      h.shadowingService.checkExisting(`https://www.youtube.com/watch?v=${ytValidId}`, { userId: 'user_a' }).exists,
      true,
    );

    // Purge WITHOUT removing linked vocab (default)
    const res = h.lifecycle.purgeLesson('user_a', lessonId, { removeLinkedVocab: false });
    assert.strictEqual(res.deleted, true);
    assert.strictEqual(res.purged.lessons, 1);
    assert.strictEqual(res.purged.practiceLogs, 1);
    assert.strictEqual(res.purged.sharedSources, 1);
    assert.strictEqual(res.purged.transcriptCaches, 1);
    assert.strictEqual(fs.existsSync(ytCacheFile), false, 'YouTube transcript cache file must be deleted from disk');
    assert.strictEqual(wl.cache.size, 0, 'WordLookup shared RAM cache must be cleared');

    // Lesson + checkExisting + shared source completely gone
    assert.strictEqual(h.historyRepo.findById(lessonId, { userId: 'user_a' }), undefined);
    assert.strictEqual(
      h.shadowingService.checkExisting(`https://www.youtube.com/watch?v=${ytValidId}`, { userId: 'user_a' }).exists,
      false,
      'Re-entering deleted YouTube URL must treat it as brand new',
    );
    assert.strictEqual(h.sharedSourcesRepo.findById('user_a', sharedSrc.id), null);

    // Vocab preserved cleanly with lessonId = null
    const remainingVocab = h.vocabService.list({ userId: 'user_a' });
    assert.strictEqual(remainingVocab.length, 1);
    assert.strictEqual(remainingVocab[0].id, vocab.id);
    assert.strictEqual(remainingVocab[0].lessonId, null);

    // Audit event recorded cleanly without transcript/progress payload
    assert.ok(res.auditEvent && res.auditEvent.id);
    const events = h.auditLog.list('user_a');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].action, 'purge_lesson');
    assert.strictEqual(events[0].targetId, lessonId);
    assert.strictEqual(JSON.stringify(events[0]).includes('First sentence.'), false);

    // Also verify removeLinkedVocab: true & URL media cache cleanup
    const lessonId2 = 'lesson_purge_2';
    h.historyRepo.create(
      makeLessonInput({
        id: lessonId2,
        title: 'Direct Audio Purge',
        videoId: `aud_${ytId}`,
        sourceUrl: urlToPurge,
        sourceKey: `media:${ytId}`,
      }),
      { userId: 'user_a' },
    );
    h.vocabService.save(
      {
        term: 'breakthrough',
        definition: 'sudden important discovery',
        lessonId: lessonId2,
      },
      { userId: 'user_a' },
    );
    const res2 = h.lifecycle.purgeLesson('user_a', lessonId2, { removeLinkedVocab: true });
    assert.strictEqual(res2.deleted, true);
    assert.strictEqual(res2.purged.vocabulary, 1);
    assert.strictEqual(fs.existsSync(mediaCacheFile), false, 'URL whisper cache file must be deleted from disk');
    assert.strictEqual(h.vocabService.list({ userId: 'user_a' }).length, 1);
  } finally {
    h.cleanup();
  }
});

test('1b. Multi-user reference-counted media file GC keeps shared disk file until last user deletes', () => {
  const h = buildHarness();
  try {
    seedUsers(h.sqlite, ['user_a', 'user_b']);
    const mediaId = 'media_test_shared.mp3';
    const mediaPath = h.trackFile(path.join(h.sharedSourcesService.getMediaDir(), mediaId));
    fs.writeFileSync(mediaPath, Buffer.from('FAKE_MP3_BYTES_123456'));

    const srcA = h.sharedSourcesService.upsert('user_a', {
      sourceKey: 'file:sharedhash123',
      sourceType: 'audio',
      title: 'Shared Audio A',
      mediaKind: 'audio',
      mediaId,
    });
    const srcB = h.sharedSourcesService.upsert('user_b', {
      sourceKey: 'file:sharedhash123',
      sourceType: 'audio',
      title: 'Shared Audio B',
      mediaKind: 'audio',
      mediaId,
    });

    h.historyRepo.create(
      makeLessonInput({
        id: 'lesson_shared_a',
        videoId: mediaId,
        sourceUrl: '',
        sourceKey: 'file:sharedhash123',
        sourceId: srcA.id,
      }),
      { userId: 'user_a' },
    );
    h.historyRepo.create(
      makeLessonInput({
        id: 'lesson_shared_b',
        videoId: mediaId,
        sourceUrl: '',
        sourceKey: 'file:sharedhash123',
        sourceId: srcB.id,
      }),
      { userId: 'user_b' },
    );

    const purgeA = h.lifecycle.purgeLesson('user_a', 'lesson_shared_a');
    assert.strictEqual(purgeA.purged.mediaFiles || 0, 0);
    assert.strictEqual(fs.existsSync(mediaPath), true, 'Disk media must survive while user_b still references it');

    const purgeB = h.lifecycle.purgeLesson('user_b', 'lesson_shared_b');
    assert.strictEqual(purgeB.purged.mediaFiles, 1);
    assert.strictEqual(purgeB.purged.bytesFreed > 0, true);
    assert.strictEqual(fs.existsSync(mediaPath), false, 'Disk media must be unlinked once last reference is purged');
  } finally {
    h.cleanup();
  }
});

test('1c. historyRepo.create replaceExisting & clearLessonCaches completely reset progress, AI coach, review & disk cache', () => {
  const h = buildHarness();
  try {
    seedUsers(h.sqlite, ['user_a']);
    const ytId = 'testVid0002';
    const ytCacheFile = h.trackFile(
      path.join(h.transcriptService.cacheDir, `${ytId}.json`),
    );
    fs.mkdirSync(path.dirname(ytCacheFile), { recursive: true });
    fs.writeFileSync(ytCacheFile, JSON.stringify({ version: 1, videoId: ytId, data: {} }));

    h.historyRepo.create(
      makeLessonInput({
        id: 'lesson_reingest',
        videoId: ytId,
        sourceUrl: `https://www.youtube.com/watch?v=${ytId}`,
        sourceKey: `youtube:${ytId}`,
        completedCount: 1,
        completionProgress: { sentences: [1], paragraphs: [] },
      }),
      { userId: 'user_a' },
    );

    // clearLessonCaches('transcript') wipes reviewed, reviewStatus, speakerOverrides, AI coach, and disk cache
    const cacheClear = h.lifecycle.clearLessonCaches('user_a', ['lesson_reingest'], 'transcript');
    assert.strictEqual(cacheClear.clearedLessonsCount, 1);
    assert.strictEqual(cacheClear.purged.transcriptCaches, 1);
    assert.strictEqual(fs.existsSync(ytCacheFile), false);

    const afterClear = h.historyRepo.findById('lesson_reingest', { userId: 'user_a' });
    assert.strictEqual(Boolean(afterClear.transcriptData.reviewed), false);
    assert.strictEqual(afterClear.transcriptData.reviewStatus, 'pending');
    assert.deepStrictEqual(afterClear.transcriptData.speakerOverrides, {});

    // Mark done again, then create with replaceExisting: true (force re-ingest)
    h.historyRepo.setLessonItemCompletion('lesson_reingest', 'sentences', 2, true, { userId: 'user_a' });
    const replaced = h.historyRepo.create(
      makeLessonInput({
        id: 'lesson_reingest',
        videoId: ytId,
        sourceUrl: `https://www.youtube.com/watch?v=${ytId}`,
        sourceKey: `youtube:${ytId}`,
        completedCount: 0,
        completionProgress: { sentences: [], paragraphs: [] },
        sentences: [
          {
            id: 's_new',
            index: 1,
            text: 'Fresh re-ingested sentence.',
            startSec: 0,
            endSec: 2,
            durationSec: 2,
            timeRange: '00:00.000 - 00:02.000',
            highlightedHtml: 'Fresh re-ingested sentence.',
          },
        ],
      }),
      { userId: 'user_a', replaceExisting: true },
    );

    assert.strictEqual(replaced.sentences.length, 1);
    assert.strictEqual(replaced.sentences[0].text, 'Fresh re-ingested sentence.');
    assert.strictEqual(replaced.sentences[0].analysis, undefined);
    assert.strictEqual(replaced.completedCount, 0);
    assert.strictEqual(Boolean(replaced.isCompleted), false);
  } finally {
    h.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 2. Phrase Miner (american_extractor)
// ---------------------------------------------------------------------------
test('2. Phrase Miner sub-item deletion re-derives completion, resets progress, and purges guides + shared sources', () => {
  const h = buildHarness();
  try {
    seedUsers(h.sqlite, ['user_a']);
    const src = h.sharedSourcesService.upsert('user_a', {
      sourceKey: 'text:notesrc1',
      sourceType: 'text',
      title: 'Note Source',
      transcriptText: 'Phrase one. Phrase two. Phrase three.',
    });

    const noteId = 'note_test_1';
    h.extractorRepo.save({
      id: noteId,
      userId: 'user_a',
      sourceId: src.id,
      title: 'Daily Idioms',
      creator: 'Self',
      summary: 'Summary',
      speakerStyle: 'Casual',
      sourceType: 'text',
      sourceUrl: '',
      sourceLabel: 'Text',
      sourceMeta: {},
      targetLanguage: 'ar',
      agentName: 'Test',
      modelName: 'test-model',
      reasoningLevel: 'none',
      executionTimeMs: 50,
      items: [
        { term: 'hit the sack', index: 0 },
        { term: 'break the ice', index: 1 },
        { term: 'call it a day', index: 2 },
      ],
      sourceText: 'Phrase one. Phrase two. Phrase three.',
      createdAt: new Date().toISOString(),
    });

    // Complete items 0 and 2 (leaving index 1 incomplete -> total 3, done 2 => isCompleted false)
    h.extractorRepo.setItemCompletion('user_a', noteId, 0, true);
    h.extractorRepo.setItemCompletion('user_a', noteId, 2, true);
    let note = h.extractorRepo.findById('user_a', noteId);
    assert.strictEqual(note.isCompleted, false);

    // Delete incomplete item at index 1 -> remaining 2 items both completed => Real Derived Completion -> true!
    const delItemRes = h.extractorRepo.deleteNoteItem('user_a', noteId, 1);
    assert.strictEqual(delItemRes.removedPhrase, 'break the ice');
    assert.deepStrictEqual(delItemRes.completionProgress.items, [0, 1]);
    assert.strictEqual(delItemRes.isCompleted, true);
    assert.strictEqual(delItemRes.note.items.length, 2);

    // Reset progress
    const resetRes = h.extractorRepo.resetProgress('user_a', noteId);
    assert.strictEqual(resetRes.isCompleted, false);
    assert.deepStrictEqual(resetRes.completionProgress, {});

    // Bulk + purge note cleans orphaned shared_sources and writes audit event
    h.extractorRepo.save({
      id: 'note_test_2',
      userId: 'user_a',
      title: 'Guide Two',
      creator: 'Self',
      summary: 'Summary',
      speakerStyle: 'Casual',
      sourceType: 'text',
      sourceUrl: '',
      sourceLabel: 'Text',
      sourceMeta: {},
      targetLanguage: 'ar',
      agentName: 'Test',
      modelName: 'test-model',
      reasoningLevel: 'none',
      executionTimeMs: 50,
      items: [{ term: 'on the same page', index: 0 }],
      sourceText: 'We are on the same page.',
      createdAt: new Date().toISOString(),
    });

    const singlePurge = h.lifecycle.purgeExtractorNote('user_a', noteId);
    assert.strictEqual(singlePurge.deleted, true);
    assert.strictEqual(singlePurge.purged.extractorNotes, 1);
    assert.strictEqual(singlePurge.purged.sharedSources, 1);

    const bulkRes = h.lifecycle.purgeExtractorNotesBulk('user_a', ['note_test_2']);
    assert.strictEqual(bulkRes.affectedCount, 1);
    assert.strictEqual(h.extractorRepo.countForUser('user_a'), 0);
  } finally {
    h.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 3. Phrase Builder (learning_library)
// ---------------------------------------------------------------------------
test('3. Phrase Builder item deletion prunes empty batch rows, resetLearningLibraryProgress & clear domain/all work', () => {
  const h = buildHarness();
  try {
    seedUsers(h.sqlite, ['user_a']);
    const now = new Date().toISOString();

    const insertBatch = h.sqlite.db.prepare(
      `INSERT INTO learning_library_batches (
        id, user_id, domain_id, category_filter, focus_topic, requested_count,
        generated_count, skipped_duplicates_count, agent_id, agent_name, model_name, created_at
      ) VALUES (?, ?, ?, 'idioms', 'General', 2, 2, 0, 'test-agent', 'Test', 'test-model', ?)`,
    );
    insertBatch.run('batch_1', 'user_a', 'natural-american-english', now);
    insertBatch.run('batch_2', 'user_a', 'technical-vocabulary', now);

    const insertItem = h.sqlite.db.prepare(
      `INSERT INTO learning_library_items (
        id, user_id, domain_id, batch_id, category_id, category_label,
        expression, canonical_key, slug_key, token_signature,
        register, tone, level, ipa, spoken_form, core_meaning, localized_meaning,
        target_language, search_blob,
        is_completed, mastery_status, is_favorite, review_count, user_notes, created_at, updated_at
      ) VALUES (?, 'user_a', ?, ?, 'idioms', 'Idioms',
        ?, ?, ?, ?, 'casual', 'warm', 'B2', '', '', 'Meaning', 'المعنى',
        'ar', 'blob',
        1, 'mastered', 1, 3, 'My personal note', ?, ?)`,
    );

    insertItem.run('ll_1', 'natural-american-english', 'batch_1', 'lock in', 'lock in', 'lockin', 'lock in', now, now);
    insertItem.run('ll_2', 'natural-american-english', 'batch_1', 'play it by ear', 'play it by ear', 'playitbyear', 'play it by ear', now, now);
    insertItem.run('ll_tech_1', 'technical-vocabulary', 'batch_2', 'backpressure', 'backpressure', 'backpressure', 'backpressure', now, now);

    // Reset progress on natural-american-english with clearNotes & clearFavorites
    const resetRes = h.lifecycle.resetLearningLibraryProgress('user_a', 'natural-american-english', {
      clearNotes: true,
      clearFavorites: true,
    });
    assert.strictEqual(resetRes.resetCount, 2);
    const resetRow = h.sqlite.db
      .prepare('SELECT is_completed, mastery_status, review_count, is_favorite, user_notes FROM learning_library_items WHERE id = ?')
      .get('ll_1');
    assert.strictEqual(resetRow.is_completed, 0);
    assert.strictEqual(resetRow.mastery_status, 'new');
    assert.strictEqual(resetRow.review_count, 0);
    assert.strictEqual(resetRow.is_favorite, 0);
    assert.strictEqual(resetRow.user_notes, '');

    // Delete 1st item of batch_1 -> batch stays
    const del1 = h.lifecycle.purgeLearningLibraryItem('user_a', 'll_1');
    assert.strictEqual(del1.deleted, true);
    assert.strictEqual(del1.purged.libraryBatches || 0, 0);

    // Delete 2nd item of batch_1 -> batch_1 is now empty and must be auto-pruned
    const del2 = h.lifecycle.purgeLearningLibraryItem('user_a', 'll_2');
    assert.strictEqual(del2.deleted, true);
    assert.strictEqual(del2.purged.libraryBatches, 1);

    // Remaining domain item cleared when calling purgeLearningLibraryDomain('user_a', undefined)
    const clearAll = h.lifecycle.purgeLearningLibraryDomain('user_a', undefined);
    assert.strictEqual(clearAll.removedCount, 1);
  } finally {
    h.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 4. Think Aloud
// ---------------------------------------------------------------------------
test('4. Think Aloud session delete cascades practice_logs; spine reset & protection work cleanly', () => {
  const h = buildHarness();
  try {
    seedUsers(h.sqlite, ['user_a']);
    const session = h.thinkAloudRepo.saveSession({
      userId: 'user_a',
      mode: 'circumlocution',
      domain: 'daily',
      cefrLevel: 'B2',
      frameworkId: '',
      promptTitle: 'Describe Coffee',
      promptBody: 'Explain without saying coffee.',
      promptMeta: {},
      inputMode: 'mic',
      rounds: [],
      metrics: { totalWords: 45, avgWpm: 120, totalDurationSec: 30, wpmGainPct: 0 },
      coaching: { directnessScore: 80, flowScore: 80, structureScore: 80, naturalnessScore: 80, overallScore: 80 },
      modelUsed: 'test-model',
      nativeLanguage: 'ar',
    });

    // saveSession automatically inserted a practice_logs row with lesson_id = session.id
    const logsBefore = h.sqlite.db
      .prepare('SELECT COUNT(*) AS cnt FROM practice_logs WHERE user_id = ? AND lesson_id = ?')
      .get('user_a', session.id);
    assert.strictEqual(logsBefore.cnt, 1);

    const purgeRes = h.lifecycle.purgeThinkAloudSession('user_a', session.id);
    assert.strictEqual(purgeRes.deleted, true);
    assert.strictEqual(purgeRes.purged.thinkAloudSessions, 1);
    assert.strictEqual(purgeRes.purged.practiceLogs, 1);

    // Spine packs: builtin protection + state reset + custom delete
    assert.throws(
      () => h.lifecycle.purgeThinkAloudSpinePack('user_a', 'builtin_core_reflex'),
      /Custom spine pack not found/,
    );

    const now = new Date().toISOString();
    h.sqlite.db
      .prepare(
        `INSERT INTO think_aloud_spine_packs (
          id, user_id, title, domain, topic, starters_json, engines_json,
          tails_json, chunks_json, practiced_ids_json, created_at, updated_at
        ) VALUES (?, 'user_a', 'Builtin State', 'daily', 'general', '[]', '[]', '[]', '[]', '["s1"]', ?, ?)`,
      )
      .run('state_user_a_builtin_core_reflex', now, now);

    h.sqlite.db
      .prepare(
        `INSERT INTO think_aloud_spine_packs (
          id, user_id, title, domain, topic, starters_json, engines_json,
          tails_json, chunks_json, practiced_ids_json, created_at, updated_at
        ) VALUES ('custom_spine_1', 'user_a', 'My Custom Spine', 'daily', 'general', '[]', '[]', '[]', '[]', '["c1"]', ?, ?)`,
      )
      .run(now, now);

    const resetSpines = h.lifecycle.resetThinkAloudSpineProgress('user_a');
    assert.strictEqual(resetSpines.resetCount, 2);

    const delCustom = h.lifecycle.purgeThinkAloudSpinePack('user_a', 'custom_spine_1');
    assert.strictEqual(delCustom.deleted, true);
    assert.strictEqual(delCustom.purged.thinkAloudSpines, 1);
  } finally {
    h.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 5. Vocabulary & Feature-Scoped Isolation
// ---------------------------------------------------------------------------
test('5. Vocabulary reset/bulk/clear and feature-scoped purge isolate tracks and users', () => {
  const h = buildHarness();
  try {
    seedUsers(h.sqlite, ['user_a', 'user_b']);
    const v1 = h.vocabService.save({ term: 'v1', definition: 'd1' }, { userId: 'user_a' });
    h.vocabService.save({ term: 'v2', definition: 'd2' }, { userId: 'user_a' });
    h.sqlite.db
      .prepare('UPDATE vocabulary_items SET mastery_level = 4, is_completed = 1 WHERE user_id = ?')
      .run('user_a');

    const vReset = h.lifecycle.resetVocabularyProgress('user_a');
    assert.strictEqual(vReset.resetCount, 2);
    const v1After = h.vocabService.list({ userId: 'user_a' }).find((x) => x.id === v1.id);
    assert.strictEqual(v1After.masteryLevel, 0);
    assert.strictEqual(Boolean(v1After.isCompleted), false);

    const vBulk = h.lifecycle.purgeVocabularyBulk('user_a', [v1.id]);
    assert.strictEqual(vBulk.affectedCount, 1);
    assert.strictEqual(h.vocabService.list({ userId: 'user_a' }).length, 1);

    h.historyRepo.create(makeLessonInput({ id: 'l_shadow_a', track: 'media_hub' }), { userId: 'user_a' });
    h.historyRepo.create(
      makeLessonInput({
        id: 'l_dialogue_a',
        track: 'street_talk',
        trackTitle: 'Dialogues',
        videoId: 'dlg_vid_1',
        sourceUrl: '',
        sourceKey: '',
      }),
      { userId: 'user_a' },
    );
    h.historyRepo.create(
      makeLessonInput({ id: 'l_shadow_b', track: 'media_hub' }),
      { userId: 'user_b' },
    );

    const featPurge = h.lifecycle.purgeFeature('user_a', 'media_hub');
    assert.strictEqual(featPurge.removedCount, 1);
    assert.strictEqual(h.historyRepo.findById('l_shadow_a', { userId: 'user_a' }), undefined);
    assert.ok(h.historyRepo.findById('l_dialogue_a', { userId: 'user_a' }), 'street_talk must remain untouched');
    assert.ok(h.historyRepo.findById('l_shadow_b', { userId: 'user_b' }), 'user_b lessons must remain untouched');
  } finally {
    h.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 6. Workspace Factory Reset & Account Deletion External Cleanup
// ---------------------------------------------------------------------------
test('6. Workspace Factory Reset & Account deletion external artifact cleanup keep account/other users intact', () => {
  const h = buildHarness();
  try {
    seedUsers(h.sqlite, ['user_a', 'user_b']);
    const now = new Date().toISOString();
    h.sqlite.db
      .prepare(`INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at) VALUES ('tok_a', 'user_a', '2099-01-01', ?)`)
      .run(now);
    h.sqlite.db
      .prepare(`INSERT INTO user_ai_keys (id, user_id, provider_id, label, key_fingerprint, key_mask, encrypted_key, is_default, created_at, updated_at) VALUES ('k_a', 'user_a', 'openai', 'Test Key', 'fp_a', 'sk-..ab', 'enc', 1, ?, ?)`)
      .run(now, now);

    h.historyRepo.create(makeLessonInput({ id: 'ws_l1', track: 'media_hub' }), { userId: 'user_a' });
    h.historyRepo.create(makeLessonInput({ id: 'ws_b1', track: 'media_hub' }), { userId: 'user_b' });
    h.vocabService.save({ term: 'resilient', definition: 'bouncing back' }, { userId: 'user_a' });

    assert.throws(
      () => h.lifecycle.resetWorkspace('user_a', { confirmPhrase: 'nope' }),
      /Type RESET/,
    );

    // Keep audit log & AI keys on first reset
    const resKeepAudit = h.lifecycle.resetWorkspace('user_a', {
      confirmPhrase: 'RESET',
      includeAuditLog: false,
      includeAiKeys: false,
    });
    assert.strictEqual(resKeepAudit.success, true);
    assert.ok(resKeepAudit.auditEvent && resKeepAudit.auditEvent.action === 'workspace_factory_reset');
    assert.strictEqual(h.auditLog.count('user_a'), 1);
    assert.strictEqual(h.historyRepo.findSummaries(undefined, { userId: 'user_a' }).length, 0);
    assert.strictEqual(h.vocabService.list({ userId: 'user_a' }).length, 0);

    // Auth account + session + AI key preserved
    const userRow = h.sqlite.db.prepare('SELECT id FROM users WHERE id = ?').get('user_a');
    const sessRow = h.sqlite.db.prepare('SELECT user_id FROM auth_sessions WHERE user_id = ?').get('user_a');
    const keyRow = h.sqlite.db.prepare('SELECT id FROM user_ai_keys WHERE user_id = ?').get('user_a');
    assert.ok(userRow && sessRow && keyRow);
    // User B completely intact
    assert.strictEqual(h.historyRepo.findSummaries(undefined, { userId: 'user_b' }).length, 1);

    // Second reset wiping audit log & AI keys as well
    const resFull = h.lifecycle.resetWorkspace('user_a', {
      confirmPhrase: 'reset',
      includeAuditLog: true,
      includeAiKeys: true,
      resetPreferences: true,
    });
    assert.strictEqual(resFull.success, true);
    assert.strictEqual(resFull.auditEvent, undefined);
    assert.strictEqual(h.auditLog.count('user_a'), 0);
    assert.strictEqual(
      h.sqlite.db.prepare('SELECT id FROM user_ai_keys WHERE user_id = ?').get('user_a'),
      undefined,
    );

    // Verify purgeAccountExternalArtifacts executes clean SQL (single-quoted '') & cleans disk media
    const mediaId = 'media_acct_del.mp3';
    const mediaPath = h.trackFile(path.join(h.sharedSourcesService.getMediaDir(), mediaId));
    fs.writeFileSync(mediaPath, Buffer.from('ACCOUNT_DELETE_MEDIA'));
    h.thinkAloudRepo.saveSession({
      userId: 'user_a',
      mode: 'free',
      domain: 'daily',
      cefrLevel: 'B2',
      frameworkId: '',
      promptTitle: 'Account Test',
      promptBody: 'Speak freely',
      promptMeta: {},
      inputMode: 'upload',
      rounds: [],
      metrics: { totalWords: 20, avgWpm: 100, totalDurationSec: 12, wpmGainPct: 0 },
      coaching: { directnessScore: 70, flowScore: 70, structureScore: 70, naturalnessScore: 70, overallScore: 70 },
      mediaId,
      modelUsed: 'test-model',
      nativeLanguage: 'ar',
    });

    const acctPurge = h.lifecycle.purgeAccountExternalArtifacts('user_a', () => {
      h.sqlite.db.prepare('DELETE FROM users WHERE id = ?').run('user_a');
    });
    assert.strictEqual(acctPurge.mediaFiles, 1);
    assert.strictEqual(fs.existsSync(mediaPath), false);
    assert.strictEqual(h.sqlite.db.prepare('SELECT id FROM users WHERE id = ?').get('user_a'), undefined);
    assert.strictEqual(h.historyRepo.findSummaries(undefined, { userId: 'user_b' }).length, 1);
  } finally {
    h.cleanup();
  }
});

console.log(`\n🎉 All ${passed} DataLifecycle unit tests passed!\n`);
