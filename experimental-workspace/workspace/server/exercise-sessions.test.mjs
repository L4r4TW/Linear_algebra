import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, writeFile, chmod } from 'node:fs/promises';
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

test('persists browser ownership across service instances and denies missing or different owners', async (t) => {
  const f = await fixture(t);
  const ownerToken = 'A'.repeat(43);
  const started = await f.service.startSession({ exerciseId: 'dot-product-01', ownerToken });
  const fresh = createExerciseSessions({ directory: f.directory, rendererClient: f.rendererClient });
  for (const options of [{}, { ownerToken: 'B'.repeat(43) }, { ownerToken: 'invalid' }]) {
    await assert.rejects(fresh.resumeSession(started.session.id, options), hasCode('SESSION_NOT_FOUND'));
  }
  assert.deepEqual((await fresh.resumeSession(started.session.id, { ownerToken })).session, started.session);
  await assert.rejects(f.service.startSession({ exerciseId: 'dot-product-01', ownerToken: 'bad' }), hasCode('INVALID_INPUT'));
});
async function gradingFixture(t) {
  const f = await fixture(t);
  const ownerToken = 'A'.repeat(43);
  const started = await f.service.startSession({ exerciseId: 'dot-product-01', ownerToken });
  const html = '<div id="problem_body"><input name="AnSwEr0001"><input name="AnSwEr0002"><input type="checkbox" name="choices"><input type="checkbox" name="choices"><input name="sessionJWT"><input name="previous_AnSwEr0001"></div>';
  f.calls.grade = [];
  f.rendererClient.restoreSession = async (input) => {
    f.calls.restore.push(input);
    return { html, score: input.sessionToken.startsWith('graded-') ? 0.5 : 0, resources: { assets: [] }, sessionToken: input.sessionToken, problemToken: 'problem' };
  };
  f.rendererClient.submitAnswers = async (input) => {
    f.calls.grade.push(input);
    return { html, score: 0.5, resources: { assets: [] }, sessionToken: 'graded-' + f.calls.grade.length, problemToken: 'updated-problem' };
  };
  return { ...f, ownerToken, started };
}

test('grades only trusted fields and atomically advances the stored renderer token', async (t) => {
  const f = await gradingFixture(t);
  const before = JSON.parse(await readFile(join(f.directory, f.started.session.id + '.json'), 'utf8'));
  const answers = [['AnSwEr0001', ' 2 + 3 '], ['choices', 'a'], ['choices', 'b']];
  const graded = await f.service.submitAnswers(f.started.session.id, answers, { ownerToken: f.ownerToken });
  assert.equal(graded.exercise.score, 0.5);
  assert.deepEqual(graded.session, f.started.session);
  assert.deepEqual(f.calls.grade[0], {
    exerciseId: before.exerciseId, seed: before.seed, sessionToken: before.rendererSessionToken,
    answers: [...answers, ['AnSwEr0002', '']],
  });
  const after = JSON.parse(await readFile(join(f.directory, before.id + '.json'), 'utf8'));
  assert.equal(after.rendererSessionToken, 'graded-1');
  assert.equal(after.rendererProblemToken, 'updated-problem');
  assert.equal(after.ownerHash, before.ownerHash);
  assert.ok(after.updatedAt);
  assert.equal((await stat(join(f.directory, before.id + '.json'))).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(f.directory), [before.id + '.json']);
  const fresh = createExerciseSessions({ directory: f.directory, rendererClient: f.rendererClient });
  assert.equal((await fresh.resumeSession(before.id, { ownerToken: f.ownerToken })).exercise.score, 0.5);
  assert.equal(f.calls.restore.at(-1).sessionToken, 'graded-1');
  await fresh.submitAnswers(before.id, [], { ownerToken: f.ownerToken });
  assert.equal(f.calls.grade[1].sessionToken, 'graded-1');
  assert.deepEqual(f.calls.grade[1].answers, [['AnSwEr0001', ''], ['AnSwEr0002', ''], ['choices', '']]);
});

test('denies unauthorized grading before restoring or submitting to PG', async (t) => {
  const f = await gradingFixture(t);
  for (const options of [{}, { ownerToken: 'B'.repeat(43) }]) {
    await assert.rejects(f.service.submitAnswers(f.started.session.id, [], options), hasCode('SESSION_NOT_FOUND'));
  }
  const legacy = await f.service.startSession({ exerciseId: 'dot-product-01' });
  await assert.rejects(f.service.submitAnswers(legacy.session.id, [], { ownerToken: f.ownerToken }), hasCode('SESSION_NOT_FOUND'));
  assert.equal(f.calls.restore.length, 0);
  assert.equal(f.calls.grade.length, 0);
});

test('rejects injected, unknown, duplicate scalar, and malformed answers without grading', async (t) => {
  const f = await gradingFixture(t);
  for (const answers of [
    [['sessionJWT', 'evil']], [['isInstructor', '1']], [['sourceFilePath', 'evil']],
    [['unknown', 'x']], [['AnSwEr0001', 'x'], ['AnSwEr0001', 'y']], [['AnSwEr0001', 2]], {},
  ]) {
    await assert.rejects(f.service.submitAnswers(f.started.session.id, answers, { ownerToken: f.ownerToken }), hasCode('INVALID_ANSWERS'));
  }
  assert.equal(f.calls.grade.length, 0);
});

test('rejects overlapping submissions across service instances and releases the lock afterward', async (t) => {
  const f = await gradingFixture(t);
  let release;
  let entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const reached = new Promise((resolve) => { entered = resolve; });
  const original = f.rendererClient.submitAnswers;
  f.rendererClient.submitAnswers = async (input) => { entered(); await gate; return original(input); };
  const first = f.service.submitAnswers(f.started.session.id, [], { ownerToken: f.ownerToken });
  await reached;
  const fresh = createExerciseSessions({ directory: f.directory, rendererClient: f.rendererClient });
  await assert.rejects(fresh.submitAnswers(f.started.session.id, [], { ownerToken: f.ownerToken }), hasCode('SESSION_BUSY'));
  release();
  await first;
  await fresh.submitAnswers(f.started.session.id, [], { ownerToken: f.ownerToken });
  assert.equal(f.calls.grade.length, 2);
});

test('failed grading leaves the saved token unchanged and allows a later explicit retry', async (t) => {
  const f = await gradingFixture(t);
  const path = join(f.directory, f.started.session.id + '.json');
  const before = await readFile(path, 'utf8');
  const original = f.rendererClient.submitAnswers;
  const failure = new Error('PG unavailable');
  f.rendererClient.submitAnswers = async () => { throw failure; };
  await assert.rejects(f.service.submitAnswers(f.started.session.id, [], { ownerToken: f.ownerToken }), (error) => error === failure);
  assert.equal(await readFile(path, 'utf8'), before);
  f.rendererClient.submitAnswers = original;
  await f.service.submitAnswers(f.started.session.id, [], { ownerToken: f.ownerToken });
});

test('storage failure after grading is reported without replacing the previous record', async (t) => {
  if (process.getuid?.() === 0) { t.skip('Requires the non-root application user.'); return; }
  const f = await gradingFixture(t);
  const path = join(f.directory, f.started.session.id + '.json');
  const before = await readFile(path, 'utf8');
  await chmod(f.directory, 0o500);
  try {
    await assert.rejects(f.service.submitAnswers(f.started.session.id, [], { ownerToken: f.ownerToken }), hasCode('STORAGE_ERROR'));
    assert.equal(await readFile(path, 'utf8'), before);
    assert.equal(f.calls.grade.length, 1);
  } finally { await chmod(f.directory, 0o700); }
  await f.service.submitAnswers(f.started.session.id, [], { ownerToken: f.ownerToken });
});
test('latest submitted values, result, feedback, and count survive a fresh service instance', async (t) => {
  const f = await gradingFixture(t);
  const original = f.rendererClient.submitAnswers;
  f.rendererClient.submitAnswers = async (input) => ({
    ...await original(input),
    feedback: { message: 'Try again.', summary: 'One answer needs attention.' },
  });
  const answers = [['AnSwEr0001', ' 2 + 3 '], ['choices', 'a'], ['choices', 'b']];
  const first = await f.service.submitAnswers(f.started.session.id, answers, { ownerToken: f.ownerToken });
  assert.equal(first.submission.number, 1);
  assert.deepEqual(first.submission.answers, answers);
  assert.deepEqual(first.submission.fieldNames, ['AnSwEr0001', 'AnSwEr0002', 'choices']);
  assert.equal(first.submission.score, 0.5);
  const expected = structuredClone(first.submission);
  first.submission.answers[0][1] = 'mutated returned object';
  const fresh = createExerciseSessions({ directory: f.directory, rendererClient: f.rendererClient });
  const resumed = await fresh.resumeSession(f.started.session.id, { ownerToken: f.ownerToken });
  assert.deepEqual(resumed.submission, expected);
  assert.deepEqual(resumed.submission.feedback, { message: 'Try again.', summary: 'One answer needs attention.' });
  const second = await fresh.submitAnswers(f.started.session.id, [], { ownerToken: f.ownerToken });
  assert.equal(second.submission.number, 2);
  assert.notEqual(second.submission.id, expected.id);
  assert.deepEqual(second.submission.answers, []);
  const disk = JSON.parse(await readFile(join(f.directory, f.started.session.id + '.json'), 'utf8'));
  assert.equal(disk.submissionCount, 2);
  assert.equal(disk.rendererSessionToken, 'graded-2');
  assert.deepEqual(disk.lastSubmission, second.submission);
  assert.equal(Object.hasOwn(disk, 'submissions'), false);
});

test('failed grading and saving keep the previously accepted snapshot and token together', async (t) => {
  const f = await gradingFixture(t);
  await f.service.submitAnswers(f.started.session.id, [['AnSwEr0001', 'first accepted value']], { ownerToken: f.ownerToken });
  const path = join(f.directory, f.started.session.id + '.json');
  const before = await readFile(path, 'utf8');
  const original = f.rendererClient.submitAnswers;
  f.rendererClient.submitAnswers = async () => { throw new Error('PG unavailable'); };
  await assert.rejects(f.service.submitAnswers(f.started.session.id, [], { ownerToken: f.ownerToken }));
  assert.equal(await readFile(path, 'utf8'), before);
  f.rendererClient.submitAnswers = original;
  if (process.getuid?.() !== 0) {
    await chmod(f.directory, 0o500);
    try {
      await assert.rejects(f.service.submitAnswers(f.started.session.id, [], { ownerToken: f.ownerToken }), hasCode('STORAGE_ERROR'));
      assert.equal(await readFile(path, 'utf8'), before);
    } finally { await chmod(f.directory, 0o700); }
  }
});

test('legacy token-only records remain usable and acquire explicit state on their next grade', async (t) => {
  const f = await gradingFixture(t);
  const path = join(f.directory, f.started.session.id + '.json');
  const legacy = JSON.parse(await readFile(path, 'utf8'));
  delete legacy.lastSubmission;
  delete legacy.submissionCount;
  await writeFile(path, JSON.stringify(legacy));
  const resumed = await f.service.resumeSession(legacy.id, { ownerToken: f.ownerToken });
  assert.equal(resumed.submission, null);
  const graded = await f.service.submitAnswers(legacy.id, [], { ownerToken: f.ownerToken });
  assert.equal(graded.submission.number, 1);
  const bad = JSON.parse(await readFile(path, 'utf8'));
  bad.submissionCount++;
  await writeFile(path, JSON.stringify(bad));
  const restores = f.calls.restore.length;
  await assert.rejects(f.service.resumeSession(legacy.id, { ownerToken: f.ownerToken }), hasCode('STORAGE_ERROR'));
  assert.equal(f.calls.restore.length, restores);
});
test('persists per-field PG feedback with the accepted token and restores it', async (t) => {
  const f = await gradingFixture(t);
  const original = f.rendererClient.submitAnswers;
  f.rendererClient.submitAnswers = async (input) => ({ ...await original(input), fieldFeedback: [
    {name:'AnSwEr0001',status:'invalid',score:0,message:'Unknown variable.'},
    {name:'AnSwEr0002',status:'unanswered',score:0,message:''},
    {name:'choices',status:'correct',score:1,message:''},
  ] });
  const checked = await f.service.submitAnswers(f.started.session.id, [['AnSwEr0001','x(']], {ownerToken:f.ownerToken});
  const fresh = createExerciseSessions({directory:f.directory,rendererClient:f.rendererClient});
  const restored = await fresh.resumeSession(f.started.session.id,{ownerToken:f.ownerToken});
  assert.deepEqual(restored.submission.fieldFeedback,checked.submission.fieldFeedback);
  assert.equal(restored.submission.fieldFeedback[0].status,'invalid');
});

test('a server-injected verification seed stays stable and browser seed parameters cannot override it',async(t)=>{
 const f=await fixture(t);
 const service=createExerciseSessions({directory:f.directory,rendererClient:f.rendererClient,seedGenerator:()=>1234});
 const started=await service.startSession({exerciseId:'dot-product-01',seed:4321});
 assert.equal(started.session.seed,1234);
 const resumed=await service.resumeSession(started.session.id);
 assert.equal(resumed.session.seed,1234);assert.equal(f.calls.restore[0].seed,1234);
});

test('invalid injected seeds fail before renderer calls or storage writes',async(t)=>{
 const f=await fixture(t);
 for(const seed of [0,-1,2147483648,1.5,NaN,'1234']){
  const service=createExerciseSessions({directory:f.directory,rendererClient:f.rendererClient,seedGenerator:()=>seed});
  await assert.rejects(service.startSession({exerciseId:'dot-product-01'}),hasCode('INVALID_CONFIGURATION'));
 }
 assert.equal(f.calls.load.length,0);
 assert.equal(await stat(f.directory).then(()=>true,()=>false),false);
});