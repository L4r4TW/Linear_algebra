import { studyModel, STUDY_DEFINITION } from '../practice-400/study-model.mjs';
import { DiscoveryError } from './catalog.mjs';

export function subjectInput(params) {
  if ([...params.keys()].some((key) => key !== 'subject') || params.getAll('subject').length !== 1)
    throw new DiscoveryError('INVALID_TOPIC');
  const subject = params.get('subject');
  if (!subject || subject.length > 200 || /[\x00-\x1f\x7f]/.test(subject))
    throw new DiscoveryError('INVALID_TOPIC');
  return subject;
}

/** Public chapter summaries contain counts and goals, never private sources or renderer state. */
export function projectSubject(entries, subject) {
  const collection = studyModel.subject(subject);
  const members = new Map();
  for (const entry of entries) {
    if (entry.subject === subject && (!collection || entry.collectionId === collection.id))
      members.set(entry.id, entry);
  }
  if (!collection && !members.size) throw new DiscoveryError('TOPIC_UNAVAILABLE', 404);
  const counts = new Map();
  for (const entry of members.values())
    counts.set(entry.chapter, (counts.get(entry.chapter) ?? 0) + 1);
  const chapters = collection
    ? studyModel.orderedChapters(collection.id)
    : [...counts.keys()]
        .filter(Boolean)
        .sort()
        .map((title, index) => ({ id: String(index), title, target: null }));
  return {
    subject,
    collectionId: collection?.id ?? null,
    target: collection?.target ?? null,
    available: members.size,
    tracking: Boolean(collection),
    chapters: chapters.map((chapter, index) => ({
      ...chapter,
      index: index + 1,
      available: counts.get(chapter.title) ?? 0,
    })),
    definition: STUDY_DEFINITION,
  };
}
