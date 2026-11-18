import { readFileSync } from 'node:fs';

export const STUDY_DEFINITION = 'study-goals-v1';
export const PRACTICE_SET_LIMIT = 20;

// Presentation order is deliberate. It never changes stored chapter IDs or goals.
const CHAPTER_ORDER = {
  algebra: [
    'expressions',
    'exponents',
    'linear',
    'systems',
    'quadratic',
    'polynomials',
    'logarithms',
  ],
  trigonometry: [
    'angles',
    'circle',
    'functions',
    'inverse',
    'identities',
    'equations',
    'triangles',
  ],
};

/** Validate at startup so malformed curriculum changes cannot silently alter percentages. */
export function createStudyModel(definitions) {
  const byId = new Map();
  const byTitle = new Map();
  if (!Array.isArray(definitions) || !definitions.length) throw Error('INVALID_STUDY_DEFINITION');
  const validText = (value) => typeof value === 'string' && value.trim().length > 0;
  const validTarget = (value) => Number.isSafeInteger(value) && value > 0;

  for (const collection of definitions) {
    if (
      !validText(collection.id) ||
      !validText(collection.title) ||
      !validTarget(collection.target) ||
      byId.has(collection.id) ||
      byTitle.has(collection.title) ||
      !Array.isArray(collection.topics) ||
      !collection.topics.length
    ) {
      throw Error('INVALID_STUDY_COLLECTION');
    }
    const chapters = new Map();
    const titles = new Set();
    for (const chapter of collection.topics) {
      if (
        !validText(chapter.id) ||
        !validText(chapter.title) ||
        !validTarget(chapter.target) ||
        chapters.has(chapter.id) ||
        titles.has(chapter.title)
      )
        throw Error('INVALID_STUDY_CHAPTER');
      chapters.set(chapter.id, Object.freeze({ ...chapter }));
      titles.add(chapter.title);
    }
    if (
      [...chapters.values()].reduce((sum, chapter) => sum + chapter.target, 0) !== collection.target
    ) {
      throw Error('INCONSISTENT_STUDY_TARGET');
    }
    const value = Object.freeze({ ...collection, topics: Object.freeze([...chapters.values()]) });
    byId.set(value.id, value);
    byTitle.set(value.title, value);
  }

  const collections = Object.freeze([...byId.values()]);
  const assignments = new Map(
    collections.map((c) => [c.id, new Map(c.topics.map((t) => [t.title, t]))]),
  );
  return Object.freeze({
    collections,
    collection: (id) => byId.get(id),
    subject: (title) => byTitle.get(title),
    assignment(entry) {
      const collection = byId.get(entry?.collectionId);
      const chapter = assignments.get(collection?.id)?.get(entry?.chapter);
      if (!chapter) return null;
      return {
        exerciseKey: exerciseIdentity(entry),
        collectionKey: collection.id,
        chapterKey: chapter.id,
        definition: STUDY_DEFINITION,
      };
    },
    orderedChapters(id) {
      const collection = byId.get(id);
      if (!collection) return [];
      const order = CHAPTER_ORDER[id] ?? [];
      const rank = (chapter) => {
        const index = order.indexOf(chapter.id);
        return index < 0 ? order.length : index;
      };
      // New chapters absent from an explicit order stay at the end in definition order.
      return [...collection.topics].sort((a, b) => rank(a) - rank(b));
    },
  });
}

/** Aliases and permanent IDs refer to the same exercise, not extra practice material. */
export const exerciseIdentity = (entry) => entry.identityId ?? entry.id;
export const studyModel = createStudyModel(
  JSON.parse(readFileSync(new URL('./collections.json', import.meta.url), 'utf8')),
);
export const STUDY_COLLECTIONS = studyModel.collections;
