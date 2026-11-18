import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createAccountRuntime } from './runtime.mjs';
const origin = 'http://localhost:3100',
  exercise = {
    id: 'synthetic-work',
    title: 'Synthetic',
    topic: 'Synthetic',
    subject: 'Synthetic',
    source: { sha256: 'a'.repeat(64), revision: 'synthetic' },
  };
let calls = 0,
  release;
const gate = new Promise((resolve) => (release = resolve)),
  renderer = {
    async loadExercise() {
      calls++;
      await gate;
      return {
        html: '<div id="problem_body"><input name="AnSwEr0001"></div>',
        sessionToken: 'synthetic-private-session',
        problemToken: 'synthetic-private-problem',
        score: 0,
        resources: [],
      };
    },
  };
const runtime = await createAccountRuntime({
  exerciseLookup: (id) => (id === exercise.id ? exercise : undefined),
  exerciseList: () => [exercise],
  rendererClient: renderer,
  rendererUrl: 'http://unused:3000',
  legacyDirectory: null,
});
await new Promise((resolve) => runtime.app.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + runtime.app.address().port;
let cookie = '';
const post = (path, input, signal) =>
  fetch(base + path, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(input),
    signal,
  });
const metrics = async () => (await (await fetch(base + '/internal/status')).json()).engine;
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw Error('WORK_LIFETIME_TIMEOUT');
}
const requests = [];
try {
  const login = await post('/api/sessions/account/signup', {
    email: 'work-' + randomBytes(12).toString('hex') + '@example.test',
    password: randomBytes(24).toString('base64url') + 'Aa1!',
  });
  assert.equal(login.status, 200);
  cookie = login.headers
    .getSetCookie()
    .find((value) => value.startsWith('mathpractice_account='))
    .split(';')[0];
  const cancelled = new AbortController(),
    lost = post('/api/sessions', { exerciseId: exercise.id }, cancelled.signal).catch(() => null);
  await until(() => calls === 1);
  cancelled.abort();
  await lost;
  await until(async () => (await metrics()).active === 1);
  assert.equal(calls, 1);
  for (let i = 0; i < 3; i++) requests.push(post('/api/sessions', { exerciseId: exercise.id }));
  await until(() => calls === 4);
  const queuedAbort = new AbortController(),
    queued = post('/api/sessions', { exerciseId: exercise.id }, queuedAbort.signal).catch(
      () => null,
    );
  await until(async () => (await metrics()).waiting === 1);
  assert.equal(calls, 4);
  queuedAbort.abort();
  await queued;
  await until(async () => (await metrics()).waiting === 0);
  assert.equal((await metrics()).active, 4);
  const timed = await post('/api/sessions', { exerciseId: exercise.id });
  assert.equal(timed.status, 503);
  assert.equal((await timed.json()).error.code, 'RENDERER_UNAVAILABLE');
  assert.equal(calls, 4);
  release();
  const results = await Promise.all(requests);
  for (const response of results) {
    assert.equal(response.status, 201);
    await response.json();
  }
  await until(async () => (await metrics()).active === 0);
  assert.equal(calls, 4);
  const report = {
    version: 1,
    complete: true,
    observedAt: new Date().toISOString(),
    scope:
      'Actual HTTP/account runtime and local Supabase with a controlled renderer double; no original student volume',
    disconnectedActiveWorkRetainsPermit: true,
    maximumActiveOperations: 4,
    queuedDisconnectNeverInvokesRenderer: true,
    queueTimeoutIsRetryableServiceError: true,
    permitsReleaseAfterPersistence: true,
  };
  await mkdir('/artifacts', { recursive: true });
  await writeFile(
    '/artifacts/work-lifetime-observations.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      complete: true,
      controlledRendererInvocations: 4,
      privateDataDisclosed: false,
    }),
  );
} finally {
  release();
  await Promise.allSettled(requests);
  runtime.app.closeAllConnections();
  await new Promise((resolve) => runtime.app.close(resolve));
  await runtime.db.close();
}
