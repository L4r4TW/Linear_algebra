import { readFileSync } from 'node:fs';

// Server-side allowlist. Renderer paths and source details stay out of public summaries.
const catalog = JSON.parse(
  readFileSync(new URL('./exercise-catalog.json', import.meta.url), 'utf8'),
);

/** Return friendly metadata suitable for a future exercise picker. */
export function listExercises() {
  return catalog.exercises.map(({ id, title, topicId, topic, description }) => ({
    id,
    title,
    topicId,
    topic,
    description,
  }));
}

/**
 * Resolve an exact catalog ID to trusted server configuration.
 * Unknown IDs (including file paths) return undefined.
 * Callers receive a copy so they cannot change the allowlist.
 */
export function getExerciseById(id) {
  const exercise = catalog.exercises.find((entry) => entry.id === id);
  return exercise ? structuredClone(exercise) : undefined;
}
