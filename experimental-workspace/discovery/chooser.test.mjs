import test from 'node:test';
import assert from 'node:assert/strict';
import { chooserInput, projectChooser, createPracticePlan } from './chooser.mjs';
const input = (q) => chooserInput(new URLSearchParams(q));
test('dependent columns preserve uneven metadata, aggregate counts and bound large lists', () => {
  const rows = [
    { subject: 'Math', chapter: 'Vectors', section: 'Dot product', indexed: 4 },
    { subject: 'Math', chapter: 'Vectors', section: null, indexed: 3 },
    { subject: 'Math', chapter: null, section: null, indexed: 2 },
  ];
  let result = projectChooser(rows, input('view=library&subject=Math&chapter=Vectors'));
  assert.equal(result.indexed, 7);
  assert.equal(result.available, 0);
  assert.equal(result.missingSection, 3);
  assert.equal(result.columns[2].nodes[0].label, 'Dot product');
  assert.equal(result.canStart, false);
  assert.throws(
    () => projectChooser(rows, input('subject=Math&chapter=Missing')),
    /TOPIC_UNAVAILABLE/,
  );
  const large = Array.from({ length: 1000 }, (_, i) => ({ subject: 'Subject ' + i, indexed: 1 }));
  result = projectChooser(large, input('view=library'));
  assert.equal(result.columns[0].nodes.length, 40);
  assert.equal(result.columns[0].total, 1000);
  result = projectChooser(large, input('view=library&subjectFind=Subject+999'));
  assert.equal(result.columns[0].nodes.length, 1);
});
test('topic inputs reject repeated, invalid, nested-without-parent and private settings', () => {
  for (const query of [
    'view=all',
    'chapter=Vectors',
    'subject=A&section=B',
    'subject=A&subject=B',
    'sourceFilePath=bad',
    'subject=%00',
    'cursor=abc',
  ])
    assert.throws(() => input(query));
});
test('plans freeze a deterministic bounded live-allowlist selection without renderer controls', () => {
  const entries = Array.from({ length: 30 }, (_, i) => ({
    id: 'id' + String(i).padStart(2, '0'),
    title: 'Exercise',
    subject: 'Math',
    chapter: 'Vectors',
    section: null,
    canPractice: true,
    seed: 123,
    sourceFilePath: 'private',
  })).reverse();
  const plan = createPracticePlan(entries, input('subject=Math&chapter=Vectors'));
  assert.equal(plan.items.length, 20);
  assert.equal(plan.items[0].exerciseId, 'id00');
  assert.equal(plan.items.at(-1).exerciseId, 'id19');
  assert.ok(
    plan.items.every(
      (entry) => entry.sessionId === null && !('seed' in entry) && !('sourceFilePath' in entry),
    ),
  );
  assert.throws(
    () =>
      createPracticePlan(
        entries.filter((e) => !e.canPractice),
        input('subject=Other'),
      ),
    /TOPIC_UNAVAILABLE/,
  );
  assert.throws(() => createPracticePlan(entries, input('view=library')), /PRACTICE_NOT_AVAILABLE/);
});
