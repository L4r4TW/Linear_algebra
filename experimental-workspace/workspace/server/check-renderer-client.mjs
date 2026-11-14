import assert from 'node:assert/strict';
import { getExerciseById } from './exercise-catalog.mjs';
import { loadExercise } from './renderer-client.mjs';

const exerciseId = process.argv[2] ?? 'dot-product-01';
const exercise = getExerciseById(exerciseId);
assert.ok(exercise, 'Choose an approved catalog exercise ID.');
const result = await loadExercise({ exerciseId, seed: exercise.verification.seed });
assert.equal(result.exerciseId, exerciseId);
assert.equal(result.seed, exercise.verification.seed);
console.log(JSON.stringify({
  exerciseId: result.exerciseId,
  seed: result.seed,
  htmlCharacters: result.html.length,
  result: 'PASS',
}, null, 2));
