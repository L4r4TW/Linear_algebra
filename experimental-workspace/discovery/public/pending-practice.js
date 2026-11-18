const STORAGE_KEY = 'mathpractice.pending-set';
const uuidV4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

/** Retain the same creation key after an unavailable, lost or unreadable response. */
export function pendingPractice(
  selection,
  { storage = sessionStorage, createKey = () => crypto.randomUUID() } = {},
) {
  let previous;
  try {
    previous = JSON.parse(storage.getItem(STORAGE_KEY));
  } catch {
    /* A missing/corrupt local cache is not trusted session authority. */
  }
  const sameSelection =
    previous?.selection?.subject === selection.subject &&
    (previous.selection.chapter ?? null) === (selection.chapter ?? null) &&
    !previous.selection.section;
  const request = {
    requestKey:
      sameSelection && uuidV4.test(previous?.requestKey) ? previous.requestKey : createKey(),
    selection,
  };
  try {
    const serialized = JSON.stringify(request);
    storage.setItem(STORAGE_KEY, serialized);
    if (storage.getItem(STORAGE_KEY) !== serialized) throw Error('STORAGE_WRITE_NOT_RETAINED');
  } catch {
    throw Error(
      'Allow site storage to start a saved practice set, then retry. No exercise was started.',
    );
  }
  return request;
}

export function clearPendingPractice(storage = sessionStorage) {
  storage.removeItem(STORAGE_KEY);
}
