import { createProblemReports } from './problem-reports.mjs';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDatabase } from './db.mjs';
import { createVault } from './crypto.mjs';
import { createAccounts } from './auth.mjs';
import { createRecordStore } from './record-store.mjs';
import { createAccountSessions } from './session-service.mjs';
import { createSetStore } from './set-store.mjs';
import { createStudentData } from './student-data.mjs';
import { createAccountApp } from './http-app.mjs';
import { ExerciseSessionError } from '../application/server/exercise-sessions.mjs';
import { PracticeSetError } from '../application/server/practice-sets.mjs';
const db = createDatabase({ domainErrors: [ExerciseSessionError, PracticeSetError] }),
  vault = createVault((await readFile('/secrets/encryption-key', 'utf8')).trim()),
  accounts = createAccounts({ db, vault }),
  origin = 'http://localhost:3100';
const lookup = (id) =>
    id === 'one'
      ? {
          id,
          title: 'Synthetic',
          subject: 'Math',
          topic: 'Synthetic',
          source: { sha256: 'a'.repeat(64), revision: 'synthetic' },
        }
      : null,
  list = () => [{ id: 'one', title: 'Synthetic', topic: 'Synthetic' }];
const store = createRecordStore({ db, vault, exerciseLookup: lookup, runtimeDigest: 'synthetic' }),
  rendered = () => ({
    html: '<div id="problem_body"><input name="AnSwEr0001"></div>',
    sessionToken: 'private-renderer-session',
    problemToken: 'private-renderer-problem',
    score: 0.5,
    resources: [],
    feedback: { message: '', summary: '' },
    fieldFeedback: [],
  });
const sessions = createAccountSessions({
    store,
    exerciseLookup: lookup,
    rendererClient: {
      loadExercise: async () => rendered(),
      restoreSession: async () => rendered(),
      submitAnswers: async () => rendered(),
    },
  }),
  practiceSets = createSetStore({
    db,
    vault,
    exerciseLookup: lookup,
    entries: () => [{ id: 'one', title: 'Synthetic', subject: 'Math', chapter: 'Synthetic' }],
    startSession: (input) => sessions.startSession(input),
  }),
  data = createStudentData({ db, vault, store, sessions, exerciseLookup: lookup });
const app = createAccountApp({
  reports: createProblemReports({ db, vault }),
  db,
  accounts,
  data,
  sessions,
  practiceSets,
  exerciseList: list,
  setExerciseLookup: lookup,
  origin,
  rendererBaseUrl: 'http://unused:3000',
});
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + app.address().port;
const report = {
  version: 1,
  observedAt: new Date().toISOString(),
  scope:
    'Real HTTP BFF and real local Supabase/RLS; controlled renderer double, no public deployment claim',
};
const jar = () => new Map(),
  guest = jar(),
  account = guest,
  foreign = jar();
async function request(cookies, path, { method = 'GET', input, extra = {}, expected = 200 } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Cookie: [...cookies].map(([k, v]) => k + '=' + v).join('; '),
      ...(method === 'POST' ? { Origin: origin, 'Content-Type': 'application/json' } : {}),
      ...extra,
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  for (const value of response.headers.getSetCookie()) {
    assert.ok(value.includes('HttpOnly'));
    assert.ok(value.includes('SameSite=Strict'));
    const pair = value.split(';')[0],
      cut = pair.indexOf('=');
    if (pair.slice(cut + 1)) cookies.set(pair.slice(0, cut), pair.slice(cut + 1));
    else cookies.delete(pair.slice(0, cut));
  }
  const result = await response.json();
  assert.equal(response.status, expected, result.error?.code);
  assert.ok(!JSON.stringify(result).includes('private-renderer'));
  assert.ok(!Object.hasOwn(result, 'actor'));
  return result;
}
try {
  const started = await request(guest, '/api/sessions', {
      method: 'POST',
      input: { exerciseId: 'one' },
      expected: 201,
    }),
    id = started.session.id,
    oldGuest = guest.get('la_experiment_owner');
  assert.ok(oldGuest);
  await request(foreign, '/api/sessions/' + id, { expected: 404 });
  const issue = {
    requestId: randomUUID(),
    category: 'grading',
    message: 'Synthetic acceptance report: check the result.',
  };
  await request(foreign, '/api/sessions/' + id + '/reports', {
    method: 'POST',
    input: issue,
    expected: 404,
  });
  const received = await request(guest, '/api/sessions/' + id + '/reports', {
    method: 'POST',
    input: issue,
  });
  assert.equal(received.received, true);
  assert.equal(
    (await request(guest, '/api/sessions/' + id + '/reports', { method: 'POST', input: issue }))
      .reportId,
    received.reportId,
  );
  await request(guest, '/api/sessions/' + id + '/reports', {
    method: 'POST',
    input: { ...issue, ownerId: randomUUID() },
    expected: 400,
  });
  await request(guest, '/api/sessions/' + id + '/reports', {
    method: 'POST',
    input: issue,
    extra: { Origin: 'https://foreign.invalid' },
    expected: 403,
  });
  report.problemReportsOwnedAndIdempotent = true;
  await request(guest, '/api/sessions/account/signup', {
    method: 'POST',
    input: {
      email: 'http-' + randomBytes(12).toString('hex') + '@example.test',
      password: randomBytes(24).toString('base64url') + 'Aa1!',
    },
  });
  assert.ok(guest.has('mathpractice_account'));
  assert.ok((await request(account, '/api/sessions/account/status')).account.authenticated);
  // Sign-in does not silently claim anonymous work.
  await request(account, '/api/sessions/' + id, { expected: 404 });
  const claimed = await request(account, '/api/sessions/account/claim', {
    method: 'POST',
    input: {},
  });
  assert.equal(claimed.sessions, 1);
  await request(account, '/api/sessions/' + id);
  await request(new Map([['la_experiment_owner', oldGuest]]), '/api/sessions/' + id, {
    expected: 401,
  });
  report.explicitClaimRequired = true;
  report.claimedCookieRetired = true;
  report.accountCookieHttpOnly = true;
  report.noBrowserTokens = true;
  report.ownerCheckedHttp = true;
  await request(account, '/api/sessions/' + id + '/draft', {
    method: 'POST',
    input: { entries: [['AnSwEr0001', 'draft']], baseAttemptId: null, revision: 0 },
  });
  await request(account, '/api/sessions/' + id + '/draft', {
    method: 'POST',
    input: { entries: [], baseAttemptId: null, revision: 0 },
    expected: 409,
  });
  const key = randomUUID();
  await request(account, '/api/sessions/' + id + '/answers', {
    method: 'POST',
    input: { answers: [['AnSwEr0001', '1']] },
    extra: { 'Idempotency-Key': key },
  });
  await request(account, '/api/sessions/' + id + '/answers', {
    method: 'POST',
    input: { answers: [['AnSwEr0001', '1']] },
    extra: { 'Idempotency-Key': key },
    expected: 409,
  });
  report.draftCasThroughHttp = true;
  report.gradeReplayThroughHttp = true;
  const created = await request(account, '/api/sessions/sets', {
    method: 'POST',
    input: { selection: { subject: 'Math' }, requestKey: randomUUID() },
    expected: 201,
  });
  await request(account, '/api/sessions/sets/' + created.set.id + '/open', {
    method: 'POST',
    input: { position: 0, revision: created.set.revision },
  });
  await request(account, '/api/sessions/account/bookmarks', {
    method: 'POST',
    input: { exerciseId: 'one', saved: true },
  });
  assert.equal((await request(account, '/api/sessions/account/bookmarks')).bookmarks.length, 1);
  assert.equal((await request(account, '/api/sessions/account/progress')).counts.attempts, 1);
  await request(account, '/api/sessions/account/bookmarks', {
    method: 'POST',
    input: { exerciseId: 'one', saved: true, accountId: randomUUID() },
    expected: 400,
  });
  await request(account, '/api/sessions/account/claim', {
    method: 'POST',
    input: {},
    extra: { Origin: 'https://foreign.invalid' },
    expected: 403,
  });
  report.setBookmarkProgressHttp = true;
  report.callerAuthorityRejected = true;
  report.crossOriginRejected = true;
  await request(account, '/api/sessions/account/logout', { method: 'POST', input: {} });
  assert.equal(account.has('mathpractice_account'), false);
  await request(account, '/api/sessions/' + id, { expected: 404 });
  report.logoutRetiresBffSession = true;
  report.complete = true;
  await mkdir('/artifacts', { recursive: true });
  await writeFile('/artifacts/http-observations.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ complete: true, privateDataDisclosed: false }));
} finally {
  await new Promise((resolve) => app.close(resolve));
  await db.close();
}
