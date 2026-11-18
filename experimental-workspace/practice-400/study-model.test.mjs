import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudyModel, studyModel } from './study-model.mjs';

const definition = {
  id: 'sample',
  title: 'Sample',
  target: 2,
  topics: [{ id: 'one', title: 'One', target: 2 }],
};
test('curriculum rejects duplicate identities and drifting denominators before serving requests', () => {
  for (const definitions of [
    [],
    [definition, definition],
    [{ ...definition, target: 3 }],
    [
      {
        ...definition,
        topics: [
          { id: 'one', title: 'One', target: 1 },
          { id: 'one', title: 'Two', target: 1 },
        ],
      },
    ],
    [{ ...definition, topics: [{ id: 'one', title: 'One', target: 0 }] }],
  ])
    assert.throws(() => createStudyModel(definitions));
  const model = createStudyModel([definition]);
  assert.throws(() => {
    model.collections[0].topics[0].target = 99;
  }, TypeError);
  assert.equal(model.collection('sample').target, 2);
  assert.equal(model.subject('Sample').id, 'sample');
});
test('all study goals sum to 100 and navigation shares the same chapter definitions', () => {
  for (const collection of studyModel.collections) {
    assert.equal(
      collection.topics.reduce((total, chapter) => total + chapter.target, 0),
      collection.target,
    );
    assert.equal(collection.target, 100);
    assert.deepEqual(
      new Set(studyModel.orderedChapters(collection.id).map((chapter) => chapter.id)),
      new Set(collection.topics.map((chapter) => chapter.id)),
    );
  }
  assert.deepEqual(
    studyModel
      .orderedChapters('algebra')
      .slice(0, 4)
      .map((chapter) => chapter.id),
    ['expressions', 'exponents', 'linear', 'systems'],
  );
});
test('unlisted future chapters follow the explicit sequence without jumping ahead of prerequisites', () => {
  const model = createStudyModel([
    {
      id: 'algebra',
      title: 'Algebra',
      target: 3,
      topics: [
        { id: 'future', title: 'Future', target: 1 },
        { id: 'linear', title: 'Linear', target: 1 },
        { id: 'expressions', title: 'Expressions', target: 1 },
      ],
    },
  ]);
  assert.deepEqual(
    model.orderedChapters('algebra').map((chapter) => chapter.id),
    ['expressions', 'linear', 'future'],
  );
});
