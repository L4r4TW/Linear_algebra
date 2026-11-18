import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDatabase, actors } from './db.mjs';
import { createVault } from './crypto.mjs';
import { createAccounts } from './auth.mjs';
import { createRecordStore } from './record-store.mjs';
import { createAccountSessions } from './session-service.mjs';
import { createSetStore } from './set-store.mjs';
import { createStudentData } from './student-data.mjs';
import { createLegacyImport } from './legacy-import.mjs';
import {
  createExerciseSessions,
  ExerciseSessionError,
} from '../application/server/exercise-sessions.mjs';
import { createPracticeSets, PracticeSetError } from '../application/server/practice-sets.mjs';
const db = createDatabase({ domainErrors: [ExerciseSessionError, PracticeSetError] }),
  vault = createVault((await readFile('/secrets/encryption-key', 'utf8')).trim()),
  accounts = createAccounts({ db, vault }),
  directory = await mkdtemp(join(tmpdir(), 'legacy-acceptance-'));
const report = {
  version: 1,
  observedAt: new Date().toISOString(),
  scope:
    'Read-only import of synthetic legacy JSON and SQLite in a fresh temporary directory; existing student volume not mounted',
};
let localSets;
try {
  const guestToken = randomBytes(32).toString('base64url'),
    guest = await accounts.resolveGuest(guestToken),
    account = (
      await accounts.signIn({
        signup: true,
        email: 'legacy-' + randomBytes(12).toString('hex') + '@example.test',
        password: randomBytes(24).toString('base64url') + 'Aa1!',
      })
    ).actor;
  const lookup = (id) =>
    id === 'one'
      ? {
          id,
          title: 'Synthetic',
          subject: 'Math',
          source: { sha256: 'a'.repeat(64), revision: 'synthetic' },
        }
      : null;
  const rendered = () => ({
      html: '<div id="problem_body"><input name="AnSwEr0001"></div>',
      sessionToken: 'synthetic-private-token',
      problemToken: 'synthetic-private-problem',
      score: 0.5,
      resources: [],
      feedback: { message: '', summary: '' },
      fieldFeedback: [],
    }),
    renderer = {
      loadExercise: async () => rendered(),
      restoreSession: async () => rendered(),
      submitAnswers: async () => rendered(),
    };
  const local = createExerciseSessions({
    directory,
    exerciseLookup: lookup,
    rendererClient: renderer,
  });
  const checked = await local.startSession({ exerciseId: 'one', ownerToken: guestToken });
  await local.submitAnswers(checked.session.id, [['AnSwEr0001', 'first']], {
    ownerToken: guestToken,
  });
  await local.submitAnswers(checked.session.id, [['AnSwEr0001', 'second']], {
    ownerToken: guestToken,
  });
  const foreign = await local.startSession({
    exerciseId: 'one',
    ownerToken: randomBytes(32).toString('base64url'),
  });
  localSets = createPracticeSets({
    filename: join(directory, 'practice-sets.sqlite'),
    entries: () => [{ id: 'one', title: 'Synthetic', subject: 'Math' }],
    exerciseLookup: lookup,
    startSession: (input) => local.startSession(input),
  });
  const set = localSets.create(
      { subject: 'Math' },
      { ownerToken: guestToken, requestKey: randomUUID() },
    ),
    opened = await localSets.openItem(set.id, 0, { ownerToken: guestToken });
  const files = await Promise.all(
    [checked.session.id, foreign.session.id, opened.sessionId].map(async (id) => [
      id,
      await readFile(join(directory, id + '.json'), 'utf8'),
    ]),
  );
  const store = createRecordStore({
      db,
      vault,
      exerciseLookup: lookup,
      runtimeDigest: 'synthetic',
    }),
    sessions = createAccountSessions({ store, exerciseLookup: lookup, rendererClient: renderer }),
    data = createStudentData({ db, vault, store, sessions, exerciseLookup: lookup }),
    importLegacy = createLegacyImport({ directory, db, vault, store }),
    run = (actor, work) => actors.run({ ...actor }, work);
  await run(guest, () => importLegacy());
  await run(guest, () => importLegacy());
  const imported = await db.transaction(
    guest,
    async (client) =>
      (
        await client.query(
          'SELECT (SELECT count(*)::int FROM practice_runtime.sessions WHERE principal_id=$1) sessions,(SELECT count(*)::int FROM practice_runtime.attempts WHERE principal_id=$1) attempts',
          [guest.principalId],
        )
      ).rows[0],
  );
  assert.deepEqual(imported, { sessions: 2, attempts: 1 });
  const restored = await run(guest, () =>
    sessions.resumeSession(checked.session.id, { ownerToken: guestToken }),
  );
  assert.equal(restored.submission.number, 2);
  const sets = createSetStore({
    db,
    vault,
    exerciseLookup: lookup,
    entries: () => [],
    startSession: (input) => sessions.startSession(input),
  });
  assert.equal(
    (await run(guest, () => sets.get(set.id, { ownerToken: guestToken }))).items[0].sessionId,
    opened.sessionId,
  );
  await run(account, () => data.claimGuest(guestToken, { importLegacy }));
  assert.equal(
    (await run(account, () => sets.get(set.id, { ownerToken: account.ownerToken }))).items[0]
      .sessionId,
    opened.sessionId,
  );
  assert.equal(
    (
      await run(account, () =>
        sessions.resumeSession(checked.session.id, { ownerToken: account.ownerToken }),
      )
    ).submission.number,
    2,
  );
  await assert.rejects(
    () => accounts.resolveGuest(guestToken),
    (e) => e.code === 'GUEST_CLAIMED',
  );
  for (const [id, before] of files)
    assert.ok((await readFile(join(directory, id + '.json'), 'utf8')) === before);
  const progress = await run(account, () => data.progress());
  assert.equal(progress.counts.attempts, 1);
  assert.equal(progress.recent[0].provenance, 'legacy-latest-only');
  report.originalJsonUnchanged = true;
  report.foreignJsonExcluded = true;
  report.repeatImportNoDuplicates = true;
  report.sameSessionAndSeed = true;
  report.originalSetMembershipPreserved = true;
  report.explicitClaimRetiresGuest = true;
  report.missingLegacyAttemptsNotInvented = true;
  report.complete = true;
  await mkdir('/artifacts', { recursive: true });
  await writeFile('/artifacts/legacy-observations.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ complete: true, existingStudentVolumeMounted: false }));
} finally {
  localSets?.close();
  await db.close();
  await rm(directory, { recursive: true, force: true });
}
