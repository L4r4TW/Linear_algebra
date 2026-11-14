import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getExerciseById } from './exercise-catalog.mjs';

const baseUrl = process.env.API_URL ?? 'http://127.0.0.1:3000';
const start = await fetch(baseUrl + '/api/sessions', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ exerciseId: 'dot-product-01' }),
});
assert.equal(start.status, 201);
const cookie = start.headers.get('set-cookie').split(';')[0];
const initial = await start.json();
const sessionId = initial.session.id;
const recordPath = join(process.env.EXERCISE_SESSION_DIR, sessionId + '.json');
const before = JSON.parse(await readFile(recordPath, 'utf8'));

// Operator-only diagnostic: expected answers never pass through the student API.
const instructor = await fetch(process.env.RENDERER_URL.replace(/\/$/, '') + '/render-api', {
  method: 'POST',
  body: new URLSearchParams({
    sourceFilePath: getExerciseById(before.exerciseId).renderer.sourceFilePath,
    problemSeed: String(before.seed), _format: 'json', isInstructor: '1',
  }),
});
assert.equal(instructor.status, 200);
const answerMap = (await instructor.json()).answers;
const correct = Object.entries(answerMap).map(([name, answer]) => [name, String(answer.correct_value)]);
assert.equal(correct.length, 4);

async function submit(answers, owned = true) {
  return fetch(baseUrl + '/api/sessions/' + sessionId + '/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(owned ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ answers }),
  });
}
assert.equal((await submit([], false)).status, 404);
const wrong = await submit(correct.map(([name]) => [name, 'not_a_valid_answer']));
assert.equal(wrong.status, 200);
const wrongResult = await wrong.json();
assert.equal(wrongResult.exercise.score, 0);
const partial = await submit([correct[0]]);
assert.equal(partial.status, 200);
const partialResult = await partial.json();
assert.equal(partialResult.exercise.score, 0.25);
const complete = await submit(correct);
assert.equal(complete.status, 200);
const completeResult = await complete.json();
assert.equal(completeResult.exercise.score, 1);
assert.equal(completeResult.submission.number, 3);
assert.deepEqual(completeResult.submission.answers, correct);
assert.equal(JSON.stringify(completeResult).includes(before.rendererSessionToken), false);
const updated = JSON.parse(await readFile(recordPath, 'utf8'));
assert.notEqual(updated.rendererSessionToken, before.rendererSessionToken);
assert.equal(updated.seed, before.seed);
const restored = await fetch(baseUrl + '/api/sessions/' + sessionId, { headers: { Cookie: cookie } });
assert.equal(restored.status, 200);
const restoredResult = await restored.json();
assert.equal(restoredResult.exercise.score, 1);
assert.deepEqual(restoredResult.submission, completeResult.submission);
const blank = await submit([]);
assert.equal(blank.status, 200);
const blankResult = await blank.json();
assert.equal(blankResult.exercise.score, 0);
assert.equal(blankResult.submission.number, 4);
assert.deepEqual(blankResult.submission.answers, []);

console.log(JSON.stringify({
  sessionId,
  incorrectScore: wrongResult.exercise.score,
  partialScore: partialResult.exercise.score,
  correctScore: completeResult.exercise.score,
  clearedScore: blankResult.exercise.score,
  restoredCorrectScore: 1,
  result: 'PASS',
}, null, 2));