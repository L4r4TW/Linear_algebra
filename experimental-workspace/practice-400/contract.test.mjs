import test from 'node:test';
import assert from 'node:assert/strict';
import { COLLECTIONS, classify, screenSource, KNOWN_BAD } from './contract.mjs';
test('four collections each have exactly one hundred unique exercise slots', () => {
  assert.equal(COLLECTIONS.length, 4);
  for (const c of COLLECTIONS)
    assert.equal(
      c.topics.reduce((n, t) => n + t.target, 0),
      100,
    );
});
test('classifications keep integration/series out of calculus and trigonometry distinct from calculus', () => {
  assert.equal(
    classify([
      'Calculus - single variable',
      'Techniques of integration',
      'Trigonometric substitution',
    ]),
    null,
  );
  assert.equal(
    classify(['Calculus - single variable', 'Infinite sequences and series', 'Polynomial']),
    null,
  );
  assert.deepEqual(classify(['Trigonometry', 'Analytic trigonometry', 'Trigonometric equations']), {
    collection: 'trigonometry',
    topic: 'equations',
  });
  assert.deepEqual(classify(['Algebra', 'Quadratic equations and functions', 'Roots']), {
    collection: 'algebra',
    topic: 'quadratic',
  });
  assert.deepEqual(classify(['Statistics', 'Hypothesis tests', 'Population mean']), {
    collection: 'statistics',
    topic: 'tests',
  });
});
test('known defects, unsupported and incomplete sources cannot enter the selected pool', () => {
  const row = {
    path: 'OpenProblemLibrary/example.pg',
    sha256: 'a'.repeat(64),
    metadata: { normalized: ['Algebra', 'Quadratic equations and functions', 'Roots'] },
    manifest: { unsupported: [] },
  };
  assert.equal(screenSource('DOCUMENT(); ENDDOCUMENT();', row).passed, true);
  for (const path of KNOWN_BAD)
    assert.equal(screenSource('DOCUMENT(); ENDDOCUMENT();', { ...row, path }).passed, false);
  assert.equal(screenSource('DOCUMENT();', row).passed, false);
});
