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
  const calls = { load: [], restore: [], grade: [] };
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
    async submitAnswers(input) { calls.grade.push(input); return { ...rendered(), score: 0.75, sessionToken: 'UPDATED_TOKEN', problemToken: 'UPDATED_PROBLEM_TOKEN' }; },
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
    ['/assets/answer-fields.js', 'text/javascript'],
    ['/assets/answer-bridge.js', 'text/javascript'],
    ['/assets/exercise.css', 'text/css'],
    ['/assets/picker.css', 'text/css'],
  ]) {
    const response = await fetch(f.baseUrl + path);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').startsWith(type));
  }
  for (const path of ['/server/exercise-catalog.json', '/server/exercise-sessions.mjs', '/assets/../server/renderer-client.mjs', '/compatibility/catalog.json', '/compatibility/observations.json', '/compatibility/probe.mjs']) {
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
function grade(f, id, cookie, body = { answers: [['AnSwEr0001', '2 + 3']] }, headers = {}) {
  return fetch(f.baseUrl + '/api/sessions/' + id + '/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: JSON.stringify(body),
  });
}

test('grades an owned session with stored parameters and hides updated renderer tokens', async (t) => {
  const f = await fixture(t);
  const started = await start(f);
  const cookie = cookieOf(started);
  const { session } = await started.json();
  const response = await grade(f, session.id, cookie);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.exercise.score, 0.75);
  assert.deepEqual(result.session, session);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|UPDATED_|sessionJWT|problemJWT|sourceFilePath/);
  const record = JSON.parse(await readFile(join(f.directory, session.id + '.json'), 'utf8'));
  assert.equal(f.calls.grade[0].sessionToken, 'PRIVATE_TOKEN');
  assert.equal(f.calls.grade[0].seed, record.seed);
  assert.deepEqual(f.calls.grade[0].answers, [['AnSwEr0001', '2 + 3']]);
  assert.equal(record.rendererSessionToken, 'UPDATED_TOKEN');
  await grade(f, session.id, cookie, { answers: [] });
  assert.equal(f.calls.grade[1].sessionToken, 'UPDATED_TOKEN');
  assert.deepEqual(f.calls.grade[1].answers, [['AnSwEr0001', '']]);
});

test('grading denies absent/different owners and legacy sessions before contacting the renderer', async (t) => {
  const f = await fixture(t);
  const started = await start(f);
  const cookie = cookieOf(started);
  const { session } = await started.json();
  for (const owner of [undefined, 'la_experiment_owner=' + 'B'.repeat(43)]) {
    const response = await grade(f, session.id, owner);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, 'SESSION_NOT_FOUND');
  }
  const legacy = await f.sessions.startSession({ exerciseId: 'dot-product-01' });
  assert.equal((await grade(f, legacy.session.id, cookie)).status, 404);
  assert.equal(f.calls.grade.length, 0);
  assert.equal(f.calls.restore.length, 0);
});

test('grading rejects forged scores, renderer parameters, client manifests, unknown fields, and duplicate scalar entries', async (t) => {
  const f = await fixture(t);
  const started = await start(f);
  const cookie = cookieOf(started);
  const { session } = await started.json();
  for (const key of ['score', 'sessionJWT', 'sourceFilePath', 'problemSeed', 'isInstructor', 'fieldNames']) {
    assert.equal((await grade(f, session.id, cookie, { answers: [], [key]: 'untrusted' })).status, 400);
  }
  for (const answers of [
    [['sessionJWT', 'evil']], [['isInstructor', '1']], [['unknown', 'x']], [['__proto__', 'x']],
    [['AnSwEr0001', 'x'], ['AnSwEr0001', 'y']], [['AnSwEr0001', 12]], {},
  ]) {
    assert.equal((await grade(f, session.id, cookie, { answers })).status, 400);
  }
  const wrongMethod = await fetch(f.baseUrl + '/api/sessions/' + session.id + '/answers');
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');
  assert.equal((await grade(f, session.id, cookie, { answers: [] }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal(f.calls.grade.length, 0);
});

test('grading maps upstream failures without retrying or changing the stored record', async (t) => {
  const f = await fixture(t);
  const started = await start(f);
  const cookie = cookieOf(started);
  const { session } = await started.json();
  const path = join(f.directory, session.id + '.json');
  const original = await readFile(path, 'utf8');
  let attempts = 0;
  f.rendererClient.submitAnswers = async () => {
    attempts++;
    throw new RendererClientError('TIMEOUT', 'PRIVATE upstream failure');
  };
  const response = await grade(f, session.id, cookie);
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error.code, 'RENDERER_TIMEOUT');
  assert.equal(attempts, 1);
  assert.equal(await readFile(path, 'utf8'), original);
});

test('overlapping HTTP grading requests return 409 and do not expose another owner session', async (t) => {
  const f = await fixture(t);
  const started = await start(f);
  const cookie = cookieOf(started);
  const { session } = await started.json();
  let release;
  let entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const reached = new Promise((resolve) => { entered = resolve; });
  const original = f.rendererClient.submitAnswers;
  f.rendererClient.submitAnswers = async (input) => { entered(); await gate; return original(input); };
  const first = grade(f, session.id, cookie);
  await reached;
  const second = await grade(f, session.id, cookie);
  assert.equal(second.status, 409);
  assert.equal((await second.json()).error.code, 'SESSION_BUSY');
  assert.equal((await grade(f, session.id, 'la_experiment_owner=' + 'B'.repeat(43))).status, 404);
  release();
  assert.equal((await first).status, 200);
  assert.equal(f.calls.grade.length, 1);
});
test('session retrieval returns the persisted last submission rather than a new or empty result', async (t) => {
  const f = await fixture(t);
  const original = f.rendererClient.submitAnswers;
  f.rendererClient.submitAnswers = async (input) => ({
    ...await original(input),
    feedback: { message: 'You can earn partial credit.', summary: 'Some answers need attention.' },
  });
  const started = await start(f);
  const cookie = cookieOf(started);
  const initial = await started.json();
  assert.equal(initial.submission, null);
  const answers = [['AnSwEr0001', ' 2 + 3 ']];
  const checked = await (await grade(f, initial.session.id, cookie, { answers })).json();
  const restored = await (await fetch(f.baseUrl + '/api/sessions/' + initial.session.id, { headers: { Cookie: cookie } })).json();
  assert.deepEqual(restored.submission, checked.submission);
  assert.deepEqual(restored.submission.answers, answers);
  assert.deepEqual(restored.submission.fieldNames, ['AnSwEr0001']);
  assert.equal(restored.submission.number, 1);
  assert.equal(restored.submission.score, 0.75);
  assert.equal(restored.exercise.score, 0.75);
  assert.equal(restored.submission.feedback.summary, 'Some answers need attention.');
  assert.doesNotMatch(JSON.stringify(restored.submission), /PRIVATE_|UPDATED_|ownerHash|rendererSessionToken/);
  const denied = await fetch(f.baseUrl + '/api/sessions/' + initial.session.id);
  assert.equal(denied.status, 404);
});
test('exposes only allowlisted field feedback properties and restores them to the owner', async (t) => {
  const f = await fixture(t);
  const original = f.rendererClient.submitAnswers;
  f.rendererClient.submitAnswers = async (input) => ({ ...await original(input), fieldFeedback:[
    {name:'AnSwEr0001',status:'invalid',score:0,message:'Use a number.',correct_value:'PRIVATE_EXPECTED',token:'PRIVATE_FEEDBACK_TOKEN'},
  ] });
  const startResponse = await start(f);
  const cookie = cookieOf(startResponse);
  const initial = await startResponse.json();
  const response = await fetch(f.baseUrl+'/api/sessions/'+initial.session.id+'/answers', {
    method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({answers:[['AnSwEr0001','x(']]}),
  });
  assert.equal(response.status,200);
  const checked = await response.json();
  assert.deepEqual(checked.submission.fieldFeedback,[{name:'AnSwEr0001',status:'invalid',score:0,message:'Use a number.'}]);
  assert.doesNotMatch(JSON.stringify(checked),/PRIVATE_EXPECTED|PRIVATE_FEEDBACK_TOKEN|correct_value/);
  const restored = await (await fetch(f.baseUrl+'/api/sessions/'+initial.session.id,{headers:{Cookie:cookie}})).json();
  assert.deepEqual(restored.submission.fieldFeedback,checked.submission.fieldFeedback);
});

test('operator compatibility fixture IDs do not expand the student exercise allowlist', async (t) => {
  const f = await fixture(t);
  const response = await start(f, {exerciseId:'compat-algebra-graphtool-01'});
  assert.equal(response.status,404);
  assert.equal((await response.json()).error.code,'UNKNOWN_EXERCISE');
  assert.equal(f.calls.load.length,0);
});

test('serves only opaque registered assets without exposing paths, tokens, or fetch parameters', async(t)=>{
 const upstream=createServer((req,res)=>{
   if(req.url==='/pg_files/tmp/images/aa___bb.png'){res.writeHead(200,{'Content-Type':'image/png'});res.end('image');}
   else{res.writeHead(404);res.end();}
 });
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
 t.after(()=>new Promise(resolve=>upstream.close(resolve)));
 const f=await fixture(t,{rendererBaseUrl:'http://127.0.0.1:'+upstream.address().port});
 const load=f.rendererClient.loadExercise;
 f.rendererClient.loadExercise=async input=>{
  const result=await load(input);
  result.html=result.html.replace('<p>Vectors</p>','<p>Vectors</p><img src="plot.png">');
  result.resources.alias={'plot.png':'pg_files/tmp/images/aa___bb.png'};
  return result;
 };
 const response=await start(f);const session=await response.json();
 const url=session.exercise.html.match(/<img src="([^"]+)/)[1];
 assert.match(url,/^\/assets\/exercise\/[\w-]{43}\/0$/);
 assert.doesNotMatch(JSON.stringify(session),/plot.png|tmp\/images|PRIVATE_|alias/);
 const asset=await fetch(f.baseUrl+url,{headers:{Origin:'null'}});
 assert.equal(asset.status,200);assert.equal(await asset.text(),'image');
 assert.equal(asset.headers.get('cache-control'),'private, no-store');
 assert.equal(asset.headers.get('x-content-type-options'),'nosniff');
 assert.match(asset.headers.get('content-security-policy'),/sandbox/);
 assert.equal((await fetch(f.baseUrl+url+'?url=https://evil.test')).status,404);
 assert.equal((await fetch(f.baseUrl+url.replace(/\/0$/,'/100'))).status,404);
 assert.equal((await fetch(f.baseUrl+'/assets/exercise/'+'x'.repeat(43)+'/0')).status,404);
 assert.equal((await fetch(f.baseUrl+url,{method:'POST'})).status,404);
});