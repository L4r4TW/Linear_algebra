import assert from 'node:assert/strict';

const baseUrl = process.env.API_URL ?? 'http://127.0.0.1:3000';
const listed = await fetch(baseUrl + '/api/exercises');
assert.equal(listed.status, 200);
const { exercises } = await listed.json();
assert.ok(exercises.some((exercise) => exercise.id === 'dot-product-01'));
assert.equal(Object.hasOwn(exercises[0], 'renderer'), false);
const started = await fetch(baseUrl + '/api/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ exerciseId: 'dot-product-01' }),
});
assert.equal(started.status, 201);
const cookie = started.headers.get('set-cookie').split(';')[0];
const initial = await started.json();
assert.ok(initial.exercise.html.includes('AnSwEr0001'));
assert.doesNotMatch(initial.exercise.html, /sessionJWT|problemJWT|<form/);
assert.equal(Object.hasOwn(initial.session, 'seed'), false);
const restored = await fetch(baseUrl + '/api/sessions/' + initial.session.id, { headers: { Cookie: cookie } });
assert.equal(restored.status, 200);
assert.deepEqual((await restored.json()).session, initial.session);
const unauthorized = await fetch(baseUrl + '/api/sessions/' + initial.session.id);
assert.equal(unauthorized.status, 404);
console.log(JSON.stringify({
  exerciseCount: exercises.length,
  sessionId: initial.session.id,
  exerciseId: initial.session.exerciseId,
  result: 'PASS',
}, null, 2));
