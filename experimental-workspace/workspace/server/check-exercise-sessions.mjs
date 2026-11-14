import assert from 'node:assert/strict';
import { createExerciseSessions } from './exercise-sessions.mjs';

const service = createExerciseSessions();
const suppliedId = process.argv[2];
const initial = suppliedId
  ? await service.resumeSession(suppliedId)
  : await service.startSession({ exerciseId: 'dot-product-01' });
const resumed = await createExerciseSessions().resumeSession(initial.session.id);
assert.deepEqual(resumed.session, initial.session);
assert.equal(resumed.exercise.score, initial.exercise.score);
assert.ok(resumed.exercise.html.includes('AnSwEr0001'));
console.log(JSON.stringify({
  sessionId: resumed.session.id,
  exerciseId: resumed.session.exerciseId,
  seed: resumed.session.seed,
  result: 'PASS',
}, null, 2));
