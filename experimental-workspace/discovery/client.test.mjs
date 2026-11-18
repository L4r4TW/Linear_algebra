import test from 'node:test';
import assert from 'node:assert/strict';
import { requestJson, delay } from './public/http-client.js';
import { pendingPractice } from './public/pending-practice.js';
import { loadStudyProgress } from './public/study-progress.js';

const requestKey = '12345678-1234-4123-8123-123456789abc';
function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('unavailable or unreadable responses retain error identity without exposing response bodies', async () => {
  await assert.rejects(
    requestJson('/api/example', {
      fetcher: async () =>
        Response.json(
          { error: { code: 'CATALOG_CHANGED', message: 'Restart this search.' } },
          { status: 409 },
        ),
    }),
    { code: 'CATALOG_CHANGED', status: 409 },
  );
  await assert.rejects(
    requestJson('/api/example', {
      fetcher: async () => new Response('<html>private-upstream-detail</html>', { status: 502 }),
    }),
    (error) =>
      error.code === 'INVALID_RESPONSE' && !error.message.includes('private-upstream-detail'),
  );
});

test('a stalled mutation times out once and never automatically repeats the POST', async () => {
  let calls = 0;
  await assert.rejects(
    requestJson('/api/sessions/sets', {
      method: 'POST',
      timeoutMs: 10,
      fetcher: async (path, { signal, method }) => {
        calls++;
        assert.equal(method, 'POST');
        return new Promise((resolve, reject) =>
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          ),
        );
      },
    }),
    { code: 'REQUEST_TIMEOUT' },
  );
  assert.equal(calls, 1);
});

test('view cancellation aborts both an active request and a polling delay', async () => {
  const controller = new AbortController();
  const request = requestJson('/api/example', {
    signal: controller.signal,
    fetcher: async (path, { signal }) =>
      new Promise((resolve, reject) =>
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        }),
      ),
  });
  const paused = delay(10000, controller.signal);
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
  await assert.rejects(paused, { name: 'AbortError' });
});

test('practice retries survive lost responses and normalize cached selection key order', () => {
  const storage = memoryStorage();
  storage.setItem(
    'mathpractice.pending-set',
    JSON.stringify({
      requestKey,
      selection: { chapter: 'Limits', subject: 'Calculus' },
      unexpected: 'untrusted',
    }),
  );
  const pending = pendingPractice(
    { subject: 'Calculus', chapter: 'Limits' },
    {
      storage,
      createKey: () => {
        throw Error('Must recover the old request');
      },
    },
  );
  assert.deepEqual(pending, { requestKey, selection: { subject: 'Calculus', chapter: 'Limits' } });
  assert.deepEqual(pendingPractice(pending.selection, { storage }), pending);
});

test('silent and explicit storage failures prevent a practice request from being issued', () => {
  for (const storage of [
    { getItem: () => null, setItem: () => {} },
    {
      getItem: () => null,
      setItem: () => {
        throw Error('Blocked');
      },
    },
  ])
    assert.throws(
      () => pendingPractice({ subject: 'Algebra' }, { storage, createKey: () => requestKey }),
      /No exercise was started/,
    );
});

test('historical progress polling is bounded and never presents incomplete totals as final', async () => {
  let calls = 0;
  const value = await loadStudyProgress({
    request: async () => ({ syncing: ++calls < 3, collections: [] }),
    pause: async () => {},
  });
  assert.equal(calls, 3);
  assert.equal(value.syncing, false);
  calls = 0;
  await assert.rejects(
    loadStudyProgress({
      request: async () => {
        calls++;
        return { syncing: true };
      },
      pause: async () => {},
    }),
    /still being updated/,
  );
  assert.equal(calls, 30);
});
