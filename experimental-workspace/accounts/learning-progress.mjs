import { STUDY_COLLECTIONS, STUDY_DEFINITION, studyModel } from '../practice-400/study-model.mjs';

export { STUDY_COLLECTIONS };
export const learningAssignment = (entry) => studyModel.assignment(entry);
const BACKFILL_BATCH_SIZE = 500;

/** Only trusted, visible full-credit PG attempts can earn completion. Never accept HTTP proof. */
export function completionAssignment(attempt, entry) {
  if (
    attempt?.provenance !== 'server-pg' ||
    attempt.feedbackVisibility === 'suppressed' ||
    attempt.score !== 1
  )
    return null;

  // New attempts retain their server-derived assignment even after source withdrawal.
  if (attempt.learning) {
    const assignment = attempt.learning;
    const collection = studyModel.collection(assignment.collectionKey);
    return assignment.definition === STUDY_DEFINITION &&
      typeof assignment.exerciseKey === 'string' &&
      collection?.topics.some((chapter) => chapter.id === assignment.chapterKey)
      ? assignment
      : null;
  }

  // Historical attempts have no assignment snapshot: require the exact current source.
  const source = attempt.source;
  if (
    !source ||
    !entry?.source ||
    source.sha256 !== entry.source.sha256 ||
    source.revision !== entry.source.revision ||
    (source.versionId && source.versionId !== entry.source.versionId)
  )
    return null;
  return learningAssignment(entry);
}

/** Call inside the transaction that persists the attempt and renderer tokens. */
export async function recordLearning(client, { attempt, entry, principalId }) {
  const assignment = completionAssignment(attempt, entry);
  if (assignment) {
    await client.query(
      `
      INSERT INTO practice_runtime.learning_credits
        (principal_id, exercise_key, attempt_id, collection_key, chapter_key, earned_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (principal_id, exercise_key) DO NOTHING
    `,
      [
        principalId,
        assignment.exerciseKey,
        attempt.id,
        assignment.collectionKey,
        assignment.chapterKey,
        attempt.submittedAt,
      ],
    );
  }
  // Receipts include non-credit attempts so later reads do not repeatedly decrypt them.
  await client.query(
    `
    INSERT INTO practice_runtime.learning_receipts (attempt_id, principal_id)
    VALUES ($1, $2) ON CONFLICT DO NOTHING
  `,
    [attempt.id, principalId],
  );
}

export function projectLearning(rows) {
  const counts = new Map(
    rows.map((row) => [row.collection_key + ':' + row.chapter_key, Number(row.completed)]),
  );
  return STUDY_COLLECTIONS.map((collection) => {
    const chapters = studyModel.orderedChapters(collection.id).map((chapter) => {
      const completed = Math.min(chapter.target, counts.get(collection.id + ':' + chapter.id) ?? 0);
      return {
        id: chapter.id,
        title: chapter.title,
        target: chapter.target,
        completed,
        percent: Math.floor((completed / chapter.target) * 100),
      };
    });
    const completed = chapters.reduce((sum, chapter) => sum + chapter.completed, 0);
    return {
      id: collection.id,
      title: collection.title,
      target: collection.target,
      completed,
      percent: Math.floor((completed / collection.target) * 100),
      chapters,
    };
  });
}

export function createLearningProgress({ db, vault, exerciseLookup }) {
  return () =>
    db.current(async (client) => {
      // db.current binds verified ownership and forced RLS to this pooled connection.
      // Keep old history bounded; another request can continue when syncing is true.
      const pending = (
        await client.query(
          `
      SELECT a.id, a.principal_id, a.session_id, a.encrypted_attempt
      FROM practice_runtime.attempts a
      WHERE NOT EXISTS (SELECT 1 FROM practice_runtime.learning_receipts r WHERE r.attempt_id = a.id)
      ORDER BY a.submitted_at, a.id LIMIT $1
    `,
          [BACKFILL_BATCH_SIZE],
        )
      ).rows;
      for (const row of pending) {
        const attempt = vault.open(
          row.encrypted_attempt,
          'attempt:' + row.id + ':' + row.session_id,
        );
        await recordLearning(client, {
          attempt,
          entry: attempt.learning ? null : exerciseLookup(attempt.exerciseId),
          principalId: row.principal_id,
        });
      }
      const { more: syncing } = (
        await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM practice_runtime.attempts a
        WHERE NOT EXISTS (SELECT 1 FROM practice_runtime.learning_receipts r WHERE r.attempt_id = a.id)
      ) more
    `)
      ).rows[0];
      // Claimed guest principals remain separate rows. Deduplicate before counting.
      const rows = (
        await client.query(`
      SELECT collection_key, chapter_key, count(*)::int completed
      FROM (
        SELECT DISTINCT ON (exercise_key) exercise_key, collection_key, chapter_key
        FROM practice_runtime.learning_credits ORDER BY exercise_key, earned_at, attempt_id
      ) credits GROUP BY collection_key, chapter_key
    `)
      ).rows;
      return {
        definition: STUDY_DEFINITION,
        meaning:
          'A distinct exercise completed with a fully correct, visible WeBWorK result. Repeats, skips and partial answers do not add completion. Fixed study goals do not grow with the catalog; this is completion, not mastery.',
        syncing,
        collections: projectLearning(rows),
      };
    });
}
