import assert from 'node:assert/strict';
import { parse } from 'parse5';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const base = process.env.API_URL ?? 'http://127.0.0.1:3000';
const started = await fetch(base + '/api/sessions', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ exerciseId: 'dot-product-01' }),
});
assert.equal(started.status, 201);
const cookie = started.headers.get('set-cookie').split(';')[0];
const initial = await started.json();
assert.equal(initial.submission, null);
const answers = [
  ['AnSwEr0001', ' 2 + 3 '], ['AnSwEr0002', '<1, 2, 3>'],
  ['AnSwEr0003', ''], ['AnSwEr0004', 'sqrt(9)'],
];
const checked = await fetch(base + '/api/sessions/' + initial.session.id + '/answers', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ answers }),
});
assert.equal(checked.status, 200);
const graded = await checked.json();
assert.deepEqual(graded.submission.answers, answers);
assert.equal(graded.submission.number, 1);
const restored = await fetch(base + '/api/sessions/' + initial.session.id, { headers: { Cookie: cookie } });
assert.equal(restored.status, 200);
const current = await restored.json();
assert.deepEqual(current.submission, graded.submission);
assert.equal(current.exercise.score, graded.exercise.score);
const restoredAnswers = [];
function visit(node) {
  const attrs = new Map((node.attrs ?? []).map(({ name, value }) => [name, value]));
  if (node.tagName === 'input' && /^AnSwEr[0-9]+$/.test(attrs.get('name') ?? '')) {
    restoredAnswers.push([attrs.get('name'), attrs.get('value') ?? '']);
  }
  for (const child of node.childNodes ?? []) visit(child);
}
visit(parse(current.exercise.html));
assert.deepEqual(restoredAnswers, answers);
const record = JSON.parse(await readFile(join(process.env.EXERCISE_SESSION_DIR, initial.session.id + '.json'), 'utf8'));
assert.deepEqual(record.lastSubmission, current.submission);
assert.equal(record.submissionCount, 1);
assert.equal(record.rendererSessionToken.includes(' '), false);
console.log(JSON.stringify({
  sessionId: current.session.id, submissionNumber: current.submission.number,
  restoredAnswerFields: restoredAnswers.length, result: 'PASS',
}, null, 2));