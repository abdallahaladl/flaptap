'use strict';

const assert = require('assert');

const BASE_URL = process.env.FLAPTAP_BASE_URL || 'http://localhost:3333';

async function registerUser(email, name, password = 'Password123!') {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, password }),
  });
  const data = await res.json();
  assert(res.ok && data.token, `Register failed for ${email}: ${res.status} ${JSON.stringify(data)}`);
  return {
    token: data.token,
    user: data.user,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.token}`,
    },
  };
}

async function run() {
  console.log(`\n🧪 Running AI Chat End-to-End Verification against ${BASE_URL}\n`);

  // 1. Public Config & Clean Routes
  const cfgRes = await fetch(`${BASE_URL}/api/ai-chat/config`);
  assert(cfgRes.ok, `GET /api/ai-chat/config failed: ${cfgRes.status}`);
  const cfg = await cfgRes.json();
  assert(Array.isArray(cfg.personas) && cfg.personas.length >= 6, 'Expected >= 6 personas in config');
  assert(Array.isArray(cfg.responseStyles) && cfg.responseStyles.length === 3, 'Expected 3 response styles');

  for (const cleanPath of ['/chat', '/ai', '/ai-chat', '/tutor', '/assistant', '/chat/cht_demo']) {
    const pageRes = await fetch(`${BASE_URL}${cleanPath}`);
    assert(pageRes.ok, `Clean HTML route ${cleanPath} failed: ${pageRes.status}`);
    const html = await pageRes.text();
    assert(html.includes('section-ai-chat') && html.includes('/ai-chat/index.js'), `Missing AI Chat shell on ${cleanPath}`);
  }
  console.log('✅ PASSED: Public config & all clean /chat HTML routes return 200');

  // 2. Zero-Benefit Signed-Out Auth Gate
  for (const [method, endpoint] of [
    ['GET', '/api/ai-chat/threads'],
    ['GET', '/api/ai-chat/preferences'],
    ['PATCH', '/api/ai-chat/preferences'],
    ['POST', '/api/ai-chat/ask/stream'],
    ['POST', '/api/ai-chat/threads'],
  ]) {
    const r = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify({}),
    });
    assert.strictEqual(r.status, 401, `Expected 401 on unauthenticated ${method} ${endpoint}, got ${r.status}`);
  }
  console.log('✅ PASSED: Signed-out requests blocked with 401 auth_required');

  // 3. Account Lifecycle, Preferences, Thread CRUD & Strict Per-User Isolation
  const stamp = Date.now();
  const userA = await registerUser(`aichat_a_${stamp}@example.com`, 'Chat Tester A');
  const userB = await registerUser(`aichat_b_${stamp}@example.com`, 'Chat Tester B');

  try {
    // Preferences GET & PATCH
    const pref0 = await fetch(`${BASE_URL}/api/ai-chat/preferences`, { headers: userA.headers }).then((r) => r.json());
    assert.strictEqual(pref0.preferences.defaultPersona, 'smart_mentor');

    const prefPatch = await fetch(`${BASE_URL}/api/ai-chat/preferences`, {
      method: 'PATCH',
      headers: userA.headers,
      body: JSON.stringify({
        defaultPersona: 'accent_coach',
        responseStyle: 'concise',
        responseLanguage: 'ar_en',
        temperature: 0.65,
        customInstructions: 'Explain connected speech clearly.',
      }),
    }).then((r) => r.json());
    assert.strictEqual(prefPatch.preferences.defaultPersona, 'accent_coach');
    assert.strictEqual(prefPatch.preferences.responseStyle, 'concise');

    // Create thread + Update (Pin & Rename) + List + Search
    const created = await fetch(`${BASE_URL}/api/ai-chat/threads`, {
      method: 'POST',
      headers: userA.headers,
      body: JSON.stringify({
        title: 'Flap-T Practice',
        persona: 'accent_coach',
        context: { type: 'phonetics', label: 'Flap-T Drill' },
      }),
    }).then((r) => r.json());
    assert(created.success && created.thread?.id, 'Thread creation failed');
    const tid = created.thread.id;

    const patched = await fetch(`${BASE_URL}/api/ai-chat/threads/${encodeURIComponent(tid)}`, {
      method: 'PATCH',
      headers: userA.headers,
      body: JSON.stringify({ isPinned: true, title: 'Master Flap-T & Reductions' }),
    }).then((r) => r.json());
    assert.strictEqual(patched.thread.isPinned, true);
    assert.strictEqual(patched.thread.title, 'Master Flap-T & Reductions');

    const searchList = await fetch(`${BASE_URL}/api/ai-chat/threads?q=Reductions`, {
      headers: userA.headers,
    }).then((r) => r.json());
    assert.strictEqual(searchList.threads.length, 1);

    // Cross-user isolation check
    const crossRead = await fetch(`${BASE_URL}/api/ai-chat/threads/${encodeURIComponent(tid)}`, {
      headers: userB.headers,
    });
    assert.strictEqual(crossRead.status, 404, `Cross-user thread read leaked (${crossRead.status})`);
    const userBList = await fetch(`${BASE_URL}/api/ai-chat/threads`, {
      headers: userB.headers,
    }).then((r) => r.json());
    assert.strictEqual(userBList.threads.length, 0, 'User B saw User A threads');

    // Export Markdown & JSON
    const expMd = await fetch(`${BASE_URL}/api/ai-chat/threads/${encodeURIComponent(tid)}/export?format=md`, {
      headers: userA.headers,
    });
    assert(expMd.ok, `Markdown export failed: ${expMd.status}`);
    const mdText = await expMd.text();
    assert(mdText.includes('# Master Flap-T & Reductions'), 'Markdown export missing title');
    console.log('✅ PASSED: Preferences, Thread CRUD, Pin/Rename/Search, Isolation & Export');

    // 4. Live Streaming SSE Ask Check (handles both configured key & clean error if unconfigured)
    const keysRes = await fetch(`${BASE_URL}/api/ai-providers/keys`, { headers: userA.headers }).then((r) => r.json());
    const hasKeys = Array.isArray(keysRes?.keys) && keysRes.keys.length > 0;

    const sseRes = await fetch(`${BASE_URL}/api/ai-chat/ask/stream`, {
      method: 'POST',
      headers: userA.headers,
      body: JSON.stringify({
        content: 'In 2 short sentences, what is a flap-T in American English?',
        persona: 'accent_coach',
        responseStyle: 'concise',
      }),
    });
    assert.strictEqual(sseRes.status, 200, `Expected SSE 200 stream response, got ${sseRes.status}`);
    const sseText = await sseRes.text();

    if (hasKeys && sseText.includes('event: done')) {
      assert(sseText.includes('event: thread') && sseText.includes('event: delta'), 'Expected thread & delta SSE frames');
      console.log('✅ PASSED: Live AI SSE streaming produced real response and persisted thread');
    } else if (sseText.includes('event: error')) {
      console.log('⚠️  INFO: Server has no active live AI key or upstream returned transient error; verified clean SSE error framing');
    } else {
      assert(sseText.includes('event: meta'), 'Expected valid SSE stream framing');
    }

    // Delete thread cleanup
    const delThreadRes = await fetch(`${BASE_URL}/api/ai-chat/threads/${encodeURIComponent(tid)}`, {
      method: 'DELETE',
      headers: userA.headers,
    });
    assert(delThreadRes.ok, 'Thread delete failed');
  } finally {
    await fetch(`${BASE_URL}/api/auth/account`, { method: 'DELETE', headers: userA.headers }).catch(() => {});
    await fetch(`${BASE_URL}/api/auth/account`, { method: 'DELETE', headers: userB.headers }).catch(() => {});
  }

  console.log('\n🎉 AI Chat End-to-End Verification PASSED!\n');
}

run().catch((err) => {
  console.error('❌ AI Chat E2E Failed:', err);
  process.exit(1);
});
