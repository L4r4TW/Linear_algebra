import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createExerciseSessions, ExerciseSessionError } from './exercise-sessions.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'exercise-sessions-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = { load: [], restore: [] };
  const rendered = (input) => ({
    ...input,
    html: '<form>Exercise</form>',
    resources: { assets: [] },
    score: 0,
    sessionToken: 'private-session-' + input.seed,
    problemToken: 'private-problem-' + input.seed,
  });
  const rendererClient = {
    async loadExercise(input) { calls.load.push(input); return rendered(input); },
    async restoreSession(input) { calls.restore.push(input); return rendered(input); },
  };
  const directory = join(root, 'sessions');
  return { root, directory, rendererClient, calls, service: createExerciseSessions({ directory, rendererClient }) };
}

const hasCode = (code) => (error) => error instanceof ExerciseSessionError && error.code === code;

test('generates session identity and seed, persists tokens privately, and returns a presentation', async (t) => {
  const f = await fixture(t);
  const result = await f.service.startSession({ exerciseId: 'dot-product-01', seed: 0, id: 'untrusted' });
  assert.match(result.session.id, /^[0-9a-f-]{36}$/);
  assert.ok(Number.isInteger(result.session.seed) && result.session.seed > 0 && result.session.seed <= 2147483647);
  assert.deepEqual(f.calls.load, [{ exerciseId: 'dot-product-01', seed: result.session.seed }]);
  const file = join(f.directory, result.session.id + '.json');
  const record = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(record.rendererSessionToken, 'private-session-' + result.session.seed);
  assert.equal(record.rendererProblemToken, 'private-problem-' + result.session.seed);
  assert.equal(record.seed, result.session.seed);
  assert.equal(record.exerciseId, result.session.exerciseId);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal(Object.hasOwn(result.session, 'rendererSessionToken'), false);
  assert.equal(Object.hasOwn(result.exercise, 'sessionToken'), false);
  assert.deepEqual(await readdir(f.directory), [result.session.id + '.json']);
});

test('a fresh service resumes the persisted token and seed without generating a new problem', async (t) => {
  const f = await fixture(t);
  const started = await f.service.startSession({ exerciseId: 'dot-product-01' });
  const fresh = createExerciseSessions({ directory: f.directory, rendererClient: f.rendererClient });
  const resumed = await fresh.resumeSession(started.session.id);
  assert.deepEqual(resumed.session, started.session);
  assert.deepEqual(resumed.exercise, started.exercise);
  assert.equal(f.calls.load.length, 1);
  assert.deepEqual(f.calls.restore, [{
    exerciseId: started.session.exerciseId,
    seed: started.session.seed,
    sessionToken: 'private-session-' + started.session.seed,
  }]);
});

test('unknown exercises and traversal session IDs are rejected before renderer or storage access', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.service.startSession({ exerciseId: '../arbitrary.pg' }), hasCode('UNKNOWN_EXERCISE'));
  await assert.rejects(f.service.startSession(null), hasCode('INVALID_INPUT'));
  for (const id of ['../../outside', '', '__proto__', null]) {
    await assert.rejects(f.service.resumeSession(id), hasCode('INVALID_INPUT'));
  }
  await assert.rejects(f.service.resumeSession(randomUUID()), hasCode('SESSION_NOT_FOUND'));
  assert.equal(f.calls.load.length, 0);
  assert.equal(f.calls.restore.length, 0);
});

test('renderer failures do not create saved sessions', async (t) => {
  const f = await fixture(t);
  const failure = new Error('Renderer unavailable');
  f.rendererClient.loadExercise = async () => { throw failure; };
  await assert.rejects(f.service.startSession({ exerciseId: 'dot-product-01' }), (error) => error === failure);
  assert.deepEqual(await readdir(f.root), []);
});

test('expired or rejected renderer tokens are surfaced without silently starting over', async (t) => {
  const f = await fixture(t);
  const started = await f.service.startSession({ exerciseId: 'dot-product-01' });
  const failure = new Error('Token rejected');
  f.rendererClient.restoreSession = async () => { throw failure; };
  await assert.rejects(f.service.resumeSession(started.session.id), (error) => error === failure);
  assert.equal(f.calls.load.length, 1);
  const record = JSON.parse(await readFile(join(f.directory, started.session.id + '.json'), 'utf8'));
  assert.equal(record.seed, started.session.seed);
});

test('corrupt or inconsistent records fail closed', async (t) => {
  const f = await fixture(t);
  const started = await f.service.startSession({ exerciseId: 'dot-product-01' });
  const file = join(f.directory, started.session.id + '.json');
  const original = JSON.parse(await readFile(file, 'utf8'));
  for (const content of ['not json', JSON.stringify({ ...original, seed: 0 }), JSON.stringify({ ...original, id: randomUUID() })]) {
    await writeFile(file, content);
    await assert.rejects(f.service.resumeSession(started.session.id), hasCode('STORAGE_ERROR'));
  }
  await writeFile(file, JSON.stringify({ ...original, exerciseId: 'removed-exercise' }));
  await assert.rejects(f.service.resumeSession(started.session.id), hasCode('UNKNOWN_EXERCISE'));
  assert.equal(f.calls.restore.length, 0);
});

test('parallel starts publish separate complete records with no temporary files left behind', async (t) => {
  const f = await fixture(t);
  const results = await Promise.all(Array.from({ length: 10 }, () => f.service.startSession({ exerciseId: 'dot-product-01' })));
  assert.equal(new Set(results.map((entry) => entry.session.id)).size, 10);
  const files = await readdir(f.directory);
  assert.equal(files.length, 10);
  for (const file of files) {
    assert.match(file, /\.json$/);
    const record = JSON.parse(await readFile(join(f.directory, file), 'utf8'));
    assert.equal(record.rendererSessionToken, 'private-session-' + record.seed);
  }
});

test('storage failures prevent a successful session response', async (t) => {
  const f = await fixture(t);
  const blocked = join(f.root, 'not-a-directory');
  await writeFile(blocked, 'existing file');
  const service = createExerciseSessions({ directory: blocked, rendererClient: f.rendererClient });
  await assert.rejects(service.startSession({ exerciseId: 'dot-product-01' }), hasCode('STORAGE_ERROR'));
});

test('requires an absolute private storage directory', async (t) => {
  const f = await fixture(t);
  assert.throws(() => createExerciseSessions({ directory: 'relative', rendererClient: f.rendererClient }), hasCode('INVALID_CONFIGURATION'));
});
