import { randomInt } from 'node:crypto';
import { PRACTICE_SET_LIMIT, exerciseIdentity, studyModel } from '../practice-400/study-model.mjs';

/** Sample eligible identities once; the set store freezes the result before any rendering. */
export function randomPracticeMembers(
  entries,
  selection,
  { completed = new Set(), random = randomInt } = {},
) {
  const collection = studyModel.subject(selection.subject);
  const members = new Map();
  for (const entry of entries) {
    if (!Object.entries(selection).every(([key, value]) => value === null || entry[key] === value))
      continue;
    if (collection && entry.collectionId !== collection.id) continue;
    const identity = exerciseIdentity(entry);
    if (!members.has(identity)) members.set(identity, entry);
  }
  const unfinished = [...members.values()].filter(
    (entry) => !completed.has(exerciseIdentity(entry)),
  );
  const pool = unfinished.length ? unfinished : [...members.values()];

  // Partial Fisher-Yates: scan once, then make at most 20 cryptographic draws.
  const count = Math.min(PRACTICE_SET_LIMIT, pool.length);
  for (let index = 0; index < count; index++) {
    const chosen = index + random(pool.length - index);
    [pool[index], pool[chosen]] = [pool[chosen], pool[index]];
  }
  return pool.slice(0, count);
}
