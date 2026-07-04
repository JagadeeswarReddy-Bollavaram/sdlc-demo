// E2E suite — Task Manager POC
// ponytail: Playwright .NET substituted with node:test + fetch (no dotnet on this
// machine); same case coverage, same @TestRail/@PROJ traceability tags. Swap to
// playwright-dotnet-scripts output when a .NET toolchain is available.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const fixtures = require('../test-data/fixtures.json');
const BASE = 'http://localhost:3210';
let server;

before(async () => {
  server = spawn('node', [path.join(__dirname, '../../app/server.js')], { stdio: 'ignore' });
  // wait for /health (same readiness gate the orchestrator uses after deploy)
  for (let i = 0; i < 20; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('app did not become healthy');
});

after(() => server.kill());

const post = (url, body) =>
  fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// @TestRail-C1008 @PROJ-104
test('C1008: health endpoint returns 200', async () => {
  assert.strictEqual((await fetch(`${BASE}/health`)).status, 200);
});

// @TestRail-C1001 @PROJ-101
test('C1001: create task with valid title returns 201, id, status open', async () => {
  const res = await post('/tasks', fixtures.valid_task);
  assert.strictEqual(res.status, 201);
  const task = await res.json();
  assert.ok(task.id);
  assert.strictEqual(task.title, fixtures.valid_task.title);
  assert.strictEqual(task.status, 'open');
});

// @TestRail-C1002 @PROJ-101
test('C1002: create task with empty title returns 400', async () => {
  const res = await post('/tasks', fixtures.empty_title_task);
  assert.strictEqual(res.status, 400);
  assert.ok((await res.json()).error);
});

// @TestRail-C1003 @PROJ-101
test('C1003: create task with 101-char title returns 400', async () => {
  assert.strictEqual(fixtures.over_limit_title_task.title.length, 101);
  const res = await post('/tasks', fixtures.over_limit_title_task);
  assert.strictEqual(res.status, 400);
});

// @TestRail-C1004 @PROJ-101
test('C1004: create task with exactly 100-char title returns 201', async () => {
  assert.strictEqual(fixtures.max_length_title_task.title.length, 100);
  const res = await post('/tasks', fixtures.max_length_title_task);
  assert.strictEqual(res.status, 201);
});

// @TestRail-C1005 @PROJ-102
test('C1005: list returns tasks newest first', async () => {
  const a = await (await post('/tasks', fixtures.valid_task)).json();
  const b = await (await post('/tasks', fixtures.second_valid_task)).json();
  const list = await (await fetch(`${BASE}/tasks`)).json();
  assert.ok(
    list.findIndex((t) => t.id === b.id) < list.findIndex((t) => t.id === a.id),
    'newer task must appear before older task'
  );
});

// @TestRail-C1006 @PROJ-103
test('C1006: complete existing task returns 200 with status complete', async () => {
  const task = await (await post('/tasks', fixtures.valid_task)).json();
  const res = await post(`/tasks/${task.id}/complete`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).status, 'complete');
});

// @TestRail-C1007 @PROJ-103
test('C1007: complete unknown task id returns 404', async () => {
  const res = await post('/tasks/99999/complete');
  assert.strictEqual(res.status, 404);
});
