import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createApp } from './http-app.mjs';
import { createExerciseSessions } from './exercise-sessions.mjs';
import { RendererClientError } from './renderer-client.mjs';

async function fixture(t, { origin = 'http://localhost:3100', rendererBaseUrl } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'exercise-api-'));
  const directory = join(root, 'sessions');
  const calls = { load: [], restore: [] };
  const rendered = () => ({
    html: '<html><body><form action="http://renderer/render-api"><div id="problem_body"><p>Vectors</p><div><input name="AnSwEr0001"></div><input name="problemSeed" value="PRIVATE_SEED"><input name="problemJWT" value="PRIVATE_TOKEN"></div><input name="sessionJWT" value="PRIVATE_TOKEN"><button name="isInstructor">Private control</button></form></body></html>',
    score: 0,
    resources: { assets: ['http://localhost:3101/math.js'], alias: { private: '/private/file' } },
    sessionToken: 'PRIVATE_TOKEN',
    problemToken: 'PRIVATE_PROBLEM_TOKEN',
  });
  const rendererClient = {
    async loadExercise(input) { calls.load.push(input); return rendered(); },
    async restoreSession(input) { calls.restore.push(input); return rendered(); },
  };
  const sessions = createExerciseSessions({ directory, rendererClient });
  const app = createApp({ sessions, origin, rendererBaseUrl });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(async () => {
    app.closeAllConnections();
    await new Promise((resolve) => app.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  const baseUrl = 'http://127.0.0.1:' + app.address().port;
  return { root, directory, calls, sessions, rendererClient, baseUrl };
}

function start(f, body = { exerciseId: 'dot-product-01' }, extra = {}) {
  return fetch(f.baseUrl + '/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extra },
    body: JSON.stringify(body),
  });
}

function cookieOf(response) {
  return response.headers.get('set-cookie').split(';')[0];
}

test('lists only friendly catalog metadata and leaves existing health/page routes working', async (t) => {
  const f = await fixture(t);
  const response = await fetch(f.baseUrl + '/api/exercises');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.exercises[0].id, 'dot-product-01');
  assert.equal(data.exercises[0].topic, 'Dot product');
  assert.equal(Object.hasOwn(data.exercises[0], 'renderer'), false);
  assert.equal(Object.hasOwn(data.exercises[0], 'source'), false);
  assert.equal((await fetch(f.baseUrl + '/health')).status, 200);
  assert.equal((await fetch(f.baseUrl + '/')).status, 200);
});

test('starts and retrieves an owned session while keeping renderer state and seed private', async (t) => {
  const f = await fixture(t);
  const response = await start(f, undefined, { Origin: 'http://localhost:3100' });
  assert.equal(response.status, 201);
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.match(response.headers.get('set-cookie'), /Path=\/api\/sessions/);
  const cookie = cookieOf(response);
  const initial = await response.json();
  assert.equal(response.headers.get('location'), '/api/sessions/' + initial.session.id);
  assert.equal(initial.session.exerciseId, 'dot-product-01');
  assert.equal(Object.hasOwn(initial.session, 'seed'), false);
  assert.match(initial.exercise.html, /<div><input name="AnSwEr0001"><\/div>/);
  assert.doesNotMatch(JSON.stringify(initial), /PRIVATE_|sessionJWT|problemJWT|problemSeed|sourceFilePath|<form|isInstructor|\/private\/file/);
  const stored = JSON.parse(await readFile(join(f.directory, initial.session.id + '.json'), 'utf8'));
  assert.match(stored.ownerHash, /^[0-9a-f]{64}$/);
  assert.equal(stored.rendererSessionToken, 'PRIVATE_TOKEN');
  assert.equal(JSON.stringify(stored).includes(cookie.split('=')[1]), false);
  const retrieved = await fetch(f.baseUrl + response.headers.get('location'), { headers: { Cookie: cookie } });
  assert.equal(retrieved.status, 200);
  assert.deepEqual(await retrieved.json(), initial);
  assert.deepEqual(f.calls.restore, [{
    exerciseId: 'dot-product-01',
    seed: stored.seed,
    sessionToken: 'PRIVATE_TOKEN',
  }]);
});

test('does not return another browser session or a legacy unowned diagnostic session', async (t) => {
  const f = await fixture(t);
  const response = await start(f);
  const cookie = cookieOf(response);
  const initial = await response.json();
  const path = '/api/sessions/' + initial.session.id;
  for (const headers of [{}, { Cookie: 'la_experiment_owner=' + 'B'.repeat(43) }]) {
    const denied = await fetch(f.baseUrl + path, { headers });
    assert.equal(denied.status, 404);
    assert.equal((await denied.json()).error.code, 'SESSION_NOT_FOUND');
  }
  const legacy = await f.sessions.startSession({ exerciseId: 'dot-product-01' });
  const deniedLegacy = await fetch(f.baseUrl + '/api/sessions/' + legacy.session.id, { headers: { Cookie: cookie } });
  assert.equal(deniedLegacy.status, 404);
  assert.equal(f.calls.restore.length, 0);
});

test('reuses the anonymous browser identity for additional sessions', async (t) => {
  const f = await fixture(t);
  const first = await start(f);
  const cookie = cookieOf(first);
  const second = await start(f, undefined, { Cookie: cookie });
  assert.equal(second.status, 201);
  assert.equal(second.headers.get('set-cookie'), null);
  const data = await second.json();
  const resumed = await fetch(f.baseUrl + '/api/sessions/' + data.session.id, { headers: { Cookie: cookie } });
  assert.equal(resumed.status, 200);
});

test('rejects caller-controlled renderer settings and malformed exercise selections before rendering', async (t) => {
  const f = await fixture(t);
  for (const key of ['seed', 'problemSeed', 'sourceFilePath', 'problemSource', 'sessionJWT', 'isInstructor', '_format', 'ownerToken']) {
    const response = await start(f, { exerciseId: 'dot-product-01', [key]: 'untrusted' });
    assert.equal(response.status, 400);
  }
  for (const body of [null, [], {}, 'dot-product-01', { exerciseId: '' }, { exerciseId: 1 }]) {
    assert.equal((await start(f, body)).status, 400);
  }
  assert.equal((await start(f, { exerciseId: '../arbitrary.pg' })).status, 404);
  assert.equal(f.calls.load.length, 0);
  assert.deepEqual(await readdir(f.root), []);
});

test('rejects invalid JSON, unsupported content types, and oversized chunked bodies', async (t) => {
  const f = await fixture(t);
  const invalid = await fetch(f.baseUrl + '/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'INVALID_JSON');
  const unsupported = await fetch(f.baseUrl + '/api/sessions', { method: 'POST', body: 'exerciseId=dot-product-01' });
  assert.equal(unsupported.status, 415);
  const large = await fetch(f.baseUrl + '/api/sessions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: Readable.from(['{"exerciseId":"', 'x'.repeat(9000), '"}']), duplex: 'half',
  });
  assert.equal(large.status, 413);
  assert.equal(f.calls.load.length, 0);
});

test('rejects cross-origin and cross-site API requests without enabling CORS', async (t) => {
  const f = await fixture(t);
  for (const headers of [{ Origin: 'https://another-site.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const response = await start(f, undefined, headers);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  assert.equal(f.calls.load.length, 0);
});

test('returns explicit method, query, invalid-ID, and unknown-route errors', async (t) => {
  const f = await fixture(t);
  for (const [path, method, allow] of [
    ['/api/exercises', 'POST', 'GET'],
    ['/api/sessions', 'GET', 'POST'],
    ['/api/sessions/id', 'DELETE', 'GET'],
    ['/api/sessions', 'OPTIONS', 'POST'],
  ]) {
    const response = await fetch(f.baseUrl + path, { method });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), allow);
  }
  assert.equal((await fetch(f.baseUrl + '/api/exercises?problemSeed=1')).status, 400);
  assert.equal((await fetch(f.baseUrl + '/api/unknown')).status, 404);
  const response = await fetch(f.baseUrl + '/api/sessions/not-a-uuid', {
    headers: { Cookie: 'la_experiment_owner=' + 'A'.repeat(43) },
  });
  assert.equal(response.status, 400);
});

test('maps renderer failures to friendly HTTP errors without leaking causes', async (t) => {
  const f = await fixture(t);
  for (const [code, status] of [['TIMEOUT', 504], ['NETWORK_ERROR', 503], ['HTTP_ERROR', 502], ['PG_ERROR', 502]]) {
    f.rendererClient.loadExercise = async () => {
      throw new RendererClientError(code, 'PRIVATE_TOKEN', { cause: new Error('/private/file') });
    };
    const response = await start(f);
    assert.equal(response.status, status);
    assert.doesNotMatch(JSON.stringify(await response.json()), /PRIVATE_TOKEN|\/private\/file|stack|cause/);
  }
});

test('fails closed if the renderer template changes or storage fails', async (t) => {
  const f = await fixture(t);
  f.rendererClient.loadExercise = async () => ({
    html: '<form><input name="sessionJWT" value="PRIVATE_TOKEN"></form>',
    resources: { assets: [] }, score: 0, sessionToken: 'PRIVATE_TOKEN', problemToken: 'PRIVATE_PROBLEM_TOKEN',
  });
  const badContent = await start(f);
  assert.equal(badContent.status, 502);
  assert.doesNotMatch(JSON.stringify(await badContent.json()), /PRIVATE_TOKEN/);
  const files = await readdir(f.directory);
  for (const file of files) await rm(join(f.directory, file));
  await rmdir(f.directory);
  await writeFile(f.directory, 'blocked storage');
  const badStorage = await start(f);
  assert.equal(badStorage.status, 500);
  assert.equal((await badStorage.json()).error.code, 'SESSION_SERVICE_ERROR');
});

test('sets Secure cookies when configured for HTTPS', async (t) => {
  const f = await fixture(t, { origin: 'https://practice.example' });
  const response = await start(f);
  assert.equal(response.status, 201);
  assert.match(response.headers.get('set-cookie'), /; Secure$/);
});

test('serves picker assets without making server-side modules public', async (t) => {
  const f = await fixture(t);
  const page = await fetch(f.baseUrl + '/');
  assert.match(await page.text(), /Explore topics/);
  for (const [path, type] of [
    ['/assets/picker.js', 'text/javascript'],
    ['/assets/exercise-frame.js', 'text/javascript'],
    ['/assets/picker.css', 'text/css'],
  ]) {
    const response = await fetch(f.baseUrl + path);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').startsWith(type));
  }
  for (const path of ['/server/exercise-catalog.json', '/server/exercise-sessions.mjs', '/assets/../server/renderer-client.mjs']) {
    assert.equal((await fetch(f.baseUrl + path)).status, 404);
  }
});

test('proxies only MathJax JavaScript files from the configured renderer', async (t) => {
  const paths = [];
  const upstream = createServer((request, response) => {
    paths.push(request.url);
    if (request.url.endsWith('/missing.js')) { response.writeHead(404); response.end('PRIVATE upstream error'); return; }
    response.end('window.MathJax = {};');
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  t.after(async () => {
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  });
  const f = await fixture(t, { rendererBaseUrl: 'http://127.0.0.1:' + upstream.address().port });
  const response = await fetch(f.baseUrl + '/assets/mathjax/tex-svg.js?url=http://untrusted.example');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/javascript/);
  assert.deepEqual(paths, ['/node_modules/mathjax/es5/tex-svg.js']);
  assert.equal((await fetch(f.baseUrl + '/assets/mathjax/input/tex/extensions/ams.js')).status, 200);
  assert.equal((await fetch(f.baseUrl + '/assets/mathjax/config.json')).status, 404);
  assert.equal((await fetch(f.baseUrl + '/assets/mathjax/%2Fprivate.js')).status, 404);
  const missing = await fetch(f.baseUrl + '/assets/mathjax/missing.js');
  assert.equal(missing.status, 502);
  assert.doesNotMatch(await missing.text(), /PRIVATE/);
});