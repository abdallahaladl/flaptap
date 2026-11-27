'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const tmpDb = path.join(os.tmpdir(), `flaptap-aichat-unit-${Date.now()}.sqlite`);
process.env.FLAPTAP_SQLITE_PATH = tmpDb;
process.env.FLAPTAP_LIVE_TRANSCRIPTS = 'off';

const { SqliteService } = require('../backend/dist/core/database/sqlite.service');
const { AiChatRepository } = require('../backend/dist/modules/ai-chat/ai-chat.repository');
const {
  AI_CHAT_PERSONAS,
  buildAiChatSystemPrompt,
  buildContextPromptBlock,
  generateSmartThreadTitle,
} = require('../backend/dist/modules/ai-chat/ai-chat.prompts');
const {
  isWorkspacePagePath,
  resolveFrontendEntryFile,
} = require('../backend/dist/core/config/frontend-routes');

function seedUser(sqlite, id, email) {
  const now = new Date().toISOString();
  sqlite.db
    .prepare(
      `INSERT INTO users (id, email, name, password_hash, created_at)
       VALUES (?, ?, ?, 'hash', ?)`,
    )
    .run(id, email, email.split('@')[0], now);
}

function run() {
  console.log('--- AI Chat Unit Tests ---');

  // 1. Prompt & Persona Contracts
  assert(AI_CHAT_PERSONAS.length >= 6, 'Expected at least 6 AI Chat personas');
  const sysPrompt = buildAiChatSystemPrompt({
    persona: 'accent_coach',
    responseStyle: 'deep',
    responseLanguage: 'ar_en',
    customInstructions: 'Always highlight flap-T and schwa.',
    nativeLanguage: 'ar',
    contextType: 'shadowing',
  });
  assert(sysPrompt.includes('Articulatory & Prosody Coach'), 'Persona directive missing');
  assert(sysPrompt.includes('Comprehensive deep-dive'), 'Style rule missing');
  assert(sysPrompt.includes('Always highlight flap-T and schwa.'), 'Custom instructions missing');
  assert(sysPrompt.includes('"shadowing"'), 'Active surface tag missing');

  const ctxBlock = buildContextPromptBlock({
    contextType: 'shadowing',
    contextLabel: 'Sample Lesson',
    serverSections: ['Title: Sample Lesson', '>>> #1 [00:01] Hello there'],
    quote: {
      text: 'Hello there',
      speaker: 'Speaker 1',
      startMs: 1000,
      endMs: 2200,
    },
  });
  assert(ctxBlock.includes('<active_workspace_context type="shadowing"'), 'Missing workspace context XML');
  assert(ctxBlock.includes('<selected_excerpt>'), 'Missing selected excerpt XML');
  assert(ctxBlock.includes('Quote: "Hello there"'), 'Missing quote text');

  assert.strictEqual(
    generateSmartThreadTitle('  Why did she say "kind of" here?  '),
    'Why did she say "kind of" here?',
  );
  assert(generateSmartThreadTitle('x'.repeat(80)).endsWith('…'), 'Long title should clip cleanly');

  // 2. Clean Route Registration
  for (const route of ['/chat', '/ai', '/ai-chat', '/tutor', '/assistant', '/chat/cht_123']) {
    assert(isWorkspacePagePath(route), `Route ${route} should resolve to workspace`);
    assert.strictEqual(resolveFrontendEntryFile(route), 'index.html');
  }

  // 2b. Extensible Frontend Display Mode Registry Contract
  const modesPath = path.resolve(__dirname, '../frontend/ai-chat/modes.js');
  const modesSrc = fs.readFileSync(modesPath, 'utf8');
  const sandbox = { window: { innerWidth: 1440 } };
  vm.runInNewContext(modesSrc, sandbox);
  const Modes = sandbox.window.FlaptapAiChatModes;
  assert(Modes && typeof Modes.registerMode === 'function', 'FlaptapAiChatModes missing');
  assert.strictEqual(Modes.DEFAULT_MODE_ID, 'split', 'Default display mode should be split');
  const builtIns = Modes.listModes();
  assert(builtIns.length >= 5, 'Expected at least 5 display modes');
  assert.strictEqual(Modes.getMode('split').blocksPage, false, 'Split mode must not block page');
  assert.strictEqual(Modes.getMode('split').pushesLayout, true, 'Split mode must push layout');
  assert.strictEqual(Modes.getMode('floating').blocksPage, false, 'Floating mode must not block page');
  assert.strictEqual(Modes.getMode('floating').draggable, true, 'Floating mode must be draggable');
  assert.strictEqual(Modes.getMode('docked').blocksPage, true, 'Overlay docked mode preserves blocking');
  assert.strictEqual(Modes.resolveEffectiveMode('split', 390).id, 'docked', 'Narrow mobile falls back cleanly');
  Modes.registerMode({
    id: 'bottom_dock',
    label: 'Bottom Console',
    blocksPage: false,
    pushesLayout: true,
  });
  assert.strictEqual(Modes.getMode('bottom_dock').label, 'Bottom Console', 'Custom mode registration failed');

  // 3. SQLite Repository CRUD, Edit/Truncate, Preferences & User Isolation
  const sqlite = new SqliteService();
  try {
    seedUser(sqlite, 'u_chat_1', 'chat1@example.com');
    seedUser(sqlite, 'u_chat_2', 'chat2@example.com');

    const repo = new AiChatRepository(sqlite);

    // Preferences default + upsert
    const defPref = repo.getPreferences('u_chat_1');
    assert.strictEqual(defPref.defaultPersona, 'smart_mentor');
    assert.strictEqual(defPref.usePageContext, true);

    const updatedPref = repo.upsertPreferences('u_chat_1', {
      defaultPersona: 'natural_rewrite',
      responseStyle: 'concise',
      temperature: 0.7,
      customInstructions: 'Keep examples short.',
      usePageContext: false,
    });
    assert.strictEqual(updatedPref.defaultPersona, 'natural_rewrite');
    assert.strictEqual(updatedPref.responseStyle, 'concise');
    assert.strictEqual(updatedPref.temperature, 0.7);
    assert.strictEqual(updatedPref.customInstructions, 'Keep examples short.');
    assert.strictEqual(updatedPref.usePageContext, false);
    assert.strictEqual(repo.getPreferences('u_chat_2').defaultPersona, 'smart_mentor');

    // Thread creation & strict user isolation
    const t1 = repo.createThread('u_chat_1', {
      title: 'Shadowing Q&A',
      persona: 'smart_mentor',
      contextType: 'shadowing',
      contextId: 'lesson_abc',
      contextLabel: 'Tech Podcast Ep 1',
    });
    assert(t1.id.startsWith('cht_'), 'Thread ID prefix mismatch');
    assert.strictEqual(repo.findThreadById('u_chat_2', t1.id), null, 'Cross-user thread leak!');
    assert.strictEqual(repo.listThreads('u_chat_2').length, 0, 'Cross-user list leak!');

    const m1 = repo.appendMessage('u_chat_1', t1.id, {
      role: 'user',
      content: 'First question',
      quote: { text: 'gonna head out', startMs: 1200, endMs: 2400 },
    });
    const m2 = repo.appendMessage('u_chat_1', t1.id, {
      role: 'assistant',
      content: 'First answer',
      reasoning: 'Thought about reduction',
      modelName: 'deepseek-v4.1-flash',
      executionTimeMs: 420,
    });
    const m3 = repo.appendMessage('u_chat_1', t1.id, {
      role: 'user',
      content: 'Follow-up question',
    });
    const m4 = repo.appendMessage('u_chat_1', t1.id, {
      role: 'assistant',
      content: 'Follow-up answer',
    });

    const loaded = repo.findThreadById('u_chat_1', t1.id);
    assert.strictEqual(loaded.messages.length, 4);
    assert.strictEqual(loaded.thread.messageCount, 4);
    assert.strictEqual(loaded.messages[0].quote.text, 'gonna head out');
    assert.strictEqual(loaded.messages[1].reasoning, 'Thought about reduction');

    // Pin & Search
    repo.updateThread('u_chat_1', t1.id, { isPinned: true, title: 'Pinned Podcast Chat' });
    const searchRes = repo.listThreads('u_chat_1', { q: 'podcast' });
    assert.strictEqual(searchRes.length, 1);
    assert.strictEqual(searchRes[0].isPinned, true);

    // Context lookup
    const ctxMatch = repo.findLatestThreadForContext('u_chat_1', 'shadowing', 'lesson_abc');
    assert.strictEqual(ctxMatch.id, t1.id);

    // Edit & truncate downstream messages
    const removed = repo.deleteMessagesFrom('u_chat_1', t1.id, m1.id, false);
    assert.strictEqual(removed, 3, 'Expected m2, m3, m4 to be truncated');
    repo.updateMessage('u_chat_1', t1.id, m1.id, { content: 'Edited first question' });
    const afterTruncate = repo.findThreadById('u_chat_1', t1.id);
    assert.strictEqual(afterTruncate.messages.length, 1);
    assert.strictEqual(afterTruncate.messages[0].content, 'Edited first question');

    // Delete thread
    assert.strictEqual(repo.deleteThread('u_chat_2', t1.id), false, 'User 2 must not delete User 1 thread');
    assert.strictEqual(repo.deleteThread('u_chat_1', t1.id), true);
    assert.strictEqual(repo.listThreads('u_chat_1').length, 0);

    console.log('✅ All AI Chat unit tests passed!');
  } finally {
    sqlite.onModuleDestroy();
    for (const ext of ['', '-wal', '-shm']) {
      try {
        if (fs.existsSync(tmpDb + ext)) fs.unlinkSync(tmpDb + ext);
      } catch {}
    }
  }
}

run();
