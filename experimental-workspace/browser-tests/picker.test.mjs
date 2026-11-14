import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { test, before, after } from 'node:test';
import { chromium } from 'playwright';

let browser;
const baseUrl = 'http://localhost:3100';
const backendUrl = process.env.PICKER_BACKEND_URL ?? 'http://workspace:3000';
before(async () => {
  browser = await chromium.launch({ headless: true });
  await mkdir('/qa/artifacts', { recursive: true });
});
after(async () => { await browser?.close(); });

async function pageFor(t, viewport = { width: 1360, height: 1000 }) {
  // Keep the real browser origin (including its cookies and secure-context APIs),
  // while forwarding HTTP traffic over Docker's internal service network.
  const context = await browser.newContext({ viewport });
  await context.route(baseUrl + '/**', async (route) => {
    const response = await route.fetch({ url: route.request().url().replace(baseUrl, backendUrl) });
    await route.fulfill({ response });
  });
  t.after(() => context.close());
  return context.newPage();
}
async function choices(page) {
  await page.locator('.exercise-choice').first().waitFor();
}
async function ready(page) {
  await page.locator('#session-status').waitFor({ state: 'visible' });
  await page.frameLocator('.exercise-frame').locator('mjx-container svg').first().waitFor();
}
function sessionId(page) { return new URL(page.url()).searchParams.get('session'); }

test('selects a real exercise, renders mathematics, restores on refresh and browser history', { timeout: 120_000 }, async (t) => {
  const page = await pageFor(t);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  let starts = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/sessions' && request.method() === 'POST') starts++;
  });
  await page.goto(baseUrl);
  await choices(page);
  await page.locator('.exercise-choice').click();
  await ready(page);
  const originalId = sessionId(page);
  assert.ok(originalId);
  const frame = page.frameLocator('.exercise-frame');
  assert.equal(await frame.locator('input[name^=AnSwEr]').count(), 4);
  await frame.getByRole('textbox', { name: /^answer 1$/i }).fill('-16');
  assert.equal(await page.locator('.exercise-frame').getAttribute('sandbox'), 'allow-scripts');
  assert.equal(await frame.locator('body').evaluate(() => {
    try { void parent.document.body; return false; } catch { return true; }
  }), true);
  await page.screenshot({ path: '/qa/artifacts/desktop.png', fullPage: true });
  await page.reload();
  await ready(page);
  assert.equal(sessionId(page), originalId);
  assert.equal(starts, 1);
  await page.goBack();
  await page.getByText('A small step toward understanding.').waitFor();
  await page.goForward();
  await ready(page);
  assert.equal(sessionId(page), originalId);
  assert.equal(starts, 1);
  assert.deepEqual(errors, []);
});

test('fits a narrow mobile viewport and keeps exercise inputs usable', { timeout: 90_000 }, async (t) => {
  const page = await pageFor(t, { width: 390, height: 844 });
  await page.goto(baseUrl);
  await choices(page);
  await page.locator('.exercise-choice').click();
  await ready(page);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const input = page.frameLocator('.exercise-frame').getByRole('textbox', { name: /^answer 2$/i });
  await input.fill('<1,2,3>');
  assert.equal(await input.inputValue(), '<1,2,3>');
  await page.screenshot({ path: '/qa/artifacts/mobile.png', fullPage: true });
});

test('shows catalog loading, empty state, and a working refresh action', { timeout: 60_000 }, async (t) => {
  const page = await pageFor(t);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  await page.route('**/api/exercises', async (route) => {
    if (++calls === 1) {
      await gate;
      await route.fulfill({ json: { exercises: [] } });
    } else await route.fallback();
  });
  await page.goto(baseUrl, { waitUntil: 'commit' });
  await page.locator('#catalog').getByText('Loading exercises…').waitFor();
  release();
  await page.getByRole('heading', { name: 'Nothing here yet' }).waitFor();
  await page.getByRole('button', { name: 'Refresh list' }).click();
  await choices(page);
  assert.equal(calls, 2);
});

test('shows catalog errors and recovers through retry', { timeout: 60_000 }, async (t) => {
  const page = await pageFor(t);
  let calls = 0;
  await page.route('**/api/exercises', async (route) => {
    if (++calls === 1) await route.fulfill({ status: 503, json: { error: { message: 'Temporarily unavailable.' } } });
    else await route.fallback();
  });
  await page.goto(baseUrl);
  await page.locator('#catalog [role=alert]').waitFor();
  await page.locator('#catalog').getByRole('button', { name: 'Try again' }).click();
  await choices(page);
});

test('shows session loading and errors, and retries the selected exercise', { timeout: 90_000 }, async (t) => {
  const page = await pageFor(t);
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/sessions', async (route) => {
    if (++calls === 1) {
      await gate;
      await route.fulfill({ status: 503, json: { error: { message: 'The exercise service is temporarily unavailable.' } } });
    } else await route.fallback();
  });
  await page.goto(baseUrl);
  await choices(page);
  await page.locator('.exercise-choice').click();
  await page.getByText('Opening your exercise…').waitFor();
  assert.equal(await page.locator('.exercise-choice').isDisabled(), true);
  release();
  await page.locator('#exercise-content [role=alert]').waitFor();
  await page.locator('#exercise-content').getByRole('button', { name: 'Try again' }).click();
  await ready(page);
  assert.equal(calls, 2);
});

test('a missing saved session shows an error without starting a replacement', { timeout: 60_000 }, async (t) => {
  const page = await pageFor(t);
  let starts = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/sessions' && request.method() === 'POST') starts++;
  });
  await page.goto(baseUrl + '/?session=00000000-0000-4000-8000-000000000000');
  await page.locator('#exercise-content').getByText('Session was not found.').waitFor();
  await page.locator('#exercise-content').getByRole('button', { name: 'Try again' }).click();
  await page.locator('#exercise-content').getByText('Session was not found.').waitFor();
  assert.equal(starts, 0);
  assert.equal(await page.locator('.exercise-choice').isEnabled(), true);
});

test('math resource failures can be retried without creating another session', { timeout: 90_000 }, async (t) => {
  const page = await pageFor(t);
  let attempts = 0;
  let starts = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/sessions' && request.method() === 'POST') starts++;
  });
  await page.route('**/assets/mathjax/tex-svg.js', async (route) => {
    if (++attempts === 1) await route.abort('failed');
    else await route.fallback();
  });
  await page.goto(baseUrl);
  await choices(page);
  await page.locator('.exercise-choice').click();
  await page.getByText('Math formatting could not load.').waitFor();
  const originalId = sessionId(page);
  await page.getByRole('button', { name: 'Retry formatting' }).click();
  await ready(page);
  assert.equal(sessionId(page), originalId);
  assert.equal(starts, 1);
});

test('collects all four real PG fields exactly and publishes session-bound changes', { timeout: 90_000 }, async (t) => {
  const page = await pageFor(t);
  await page.goto(baseUrl);
  await choices(page);
  await page.locator('.exercise-choice').click();
  await ready(page);
  await page.evaluate(() => {
    window.answerChanges = [];
    document.querySelector('#practice').addEventListener('exercise-answers-change', (event) => {
      window.answerChanges.push(structuredClone(event.detail));
    });
  });
  const initial = await page.evaluate(async () => (await import('/assets/picker.js')).collectCurrentAnswers());
  assert.deepEqual(initial.answers, {
    fieldNames: ['AnSwEr0001', 'AnSwEr0002', 'AnSwEr0003', 'AnSwEr0004'],
    entries: [['AnSwEr0001', ''], ['AnSwEr0002', ''], ['AnSwEr0003', ''], ['AnSwEr0004', '']],
  });
  const values = [' 2 + 3 ', '<-12, 48, 36>', '650', 'sqrt(9)'];
  const frame = page.frameLocator('.exercise-frame');
  for (let index = 0; index < values.length; index++) {
    await frame.locator('[name="AnSwEr000' + (index + 1) + '"]').fill(values[index]);
  }
  await page.waitForFunction(() => window.answerChanges.some((event) => event?.answers.entries.some(
    ([name, value]) => name === 'AnSwEr0004' && value === 'sqrt(9)',
  )));
  const result = await page.evaluate(async () => (await import('/assets/picker.js')).collectCurrentAnswers());
  assert.equal(result.sessionId, sessionId(page));
  assert.deepEqual(result.answers.entries, values.map((value, index) => ['AnSwEr000' + (index + 1), value]));
  // A widget can update its value without an input event. A collection request must read it afresh.
  await frame.locator('[name=AnSwEr0001]').evaluate((field) => { field.value = 'programmatic value'; });
  const fresh = await page.evaluate(async () => (await import('/assets/picker.js')).collectCurrentAnswers());
  assert.equal(fresh.answers.entries[0][1], 'programmatic value');
  const copy = await page.evaluate(async () => {
    const module = await import('/assets/picker.js');
    const snapshot = module.getCurrentAnswers();
    snapshot.answers.entries[0][1] = 'tampered';
    return module.getCurrentAnswers();
  });
  assert.equal(copy.answers.entries[0][1], 'programmatic value');
});

test('preserves repeated names and successful-control semantics without renderer/helper state', { timeout: 90_000 }, async (t) => {
  const page = await pageFor(t);
  await page.goto(baseUrl);
  await choices(page);
  await page.locator('.exercise-choice').click();
  await ready(page);
  await page.frameLocator('.exercise-frame').locator('#problem_body').evaluate((root) => {
    root.innerHTML = `
      <input name="AnSwEr0001" value=" 2 + 3 ">
      <textarea name="AnSwEr0002">first line
second line</textarea>
      <input type="radio" name="AnSwEr0003" value="a">
      <input type="radio" name="AnSwEr0003" value="b" checked>
      <input type="checkbox" name="AnSwEr0004" value="x" checked>
      <input type="checkbox" name="AnSwEr0004" value="y" checked>
      <input type="checkbox" name="AnSwEr0005" value="unchecked">
      <select name="AnSwEr0006" multiple>
        <option value="one" selected>One</option><option value="two">Two</option>
        <option value="three" selected>Three</option><option value="disabled" selected disabled>Disabled</option>
      </select>
      <select name="AnSwEr0007"><option value="" selected>Choose</option></select>
      <input name="AnSwEr0008" value="disabled" disabled>
      <fieldset disabled><input name="AnSwEr0009" value="disabled parent"></fieldset>
      <input type="hidden" name="AnSwEr0010" value="&lt;1,2&gt;">
      <input name="customCoordinate" value="0">
      <input type="hidden" name="MaThQuIlL_AnSwEr0001" value="helper">
      <input type="hidden" name="previous_AnSwEr0001" value="old">
      <input type="hidden" name="sessionJWT" value="private">
      <input type="hidden" name="sourceFilePath" value="private">
      <input type="hidden" name="isInstructor" value="1">
      <input name="submitAnswers" type="submit" value="submit">
      <input name="upload" type="file"><input value="nameless">
    `;
  });
  const { answers } = await page.evaluate(async () => (await import('/assets/picker.js')).collectCurrentAnswers());
  assert.deepEqual(answers.fieldNames, [
    'AnSwEr0001', 'AnSwEr0002', 'AnSwEr0003', 'AnSwEr0004', 'AnSwEr0005',
    'AnSwEr0006', 'AnSwEr0007', 'AnSwEr0010', 'customCoordinate',
  ]);
  assert.deepEqual(answers.entries, [
    ['AnSwEr0001', ' 2 + 3 '], ['AnSwEr0002', 'first line\nsecond line'],
    ['AnSwEr0003', 'b'], ['AnSwEr0004', 'x'], ['AnSwEr0004', 'y'],
    ['AnSwEr0006', 'one'], ['AnSwEr0006', 'three'], ['AnSwEr0007', ''],
    ['AnSwEr0010', '<1,2>'], ['customCoordinate', '0'],
  ]);
});

test('ignores forged frame messages and clears snapshots when changing exercises', { timeout: 90_000 }, async (t) => {
  const page = await pageFor(t);
  await page.goto(baseUrl);
  await choices(page);
  await page.locator('.exercise-choice').click();
  await ready(page);
  const originalId = sessionId(page);
  await page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').fill('original answer');
  const original = await page.evaluate(async () => (await import('/assets/picker.js')).collectCurrentAnswers());
  const channel = await page.locator('.exercise-frame').evaluate((frame) =>
    JSON.parse(frame.srcdoc.match(/const channel=("[^"]+");/)[1]));
  await page.evaluate((channel) => {
    window.postMessage({
      channel, type: 'answers-changed', revision: 100000,
      fieldNames: ['AnSwEr0001'], entries: [['AnSwEr0001', 'forged parent message']],
    }, location.origin);
  }, channel);
  await page.frameLocator('.exercise-frame').locator('body').evaluate(() => {
    parent.postMessage({
      channel: 'wrong-channel', type: 'answers-changed', revision: 100000,
      fieldNames: ['AnSwEr0001'], entries: [['AnSwEr0001', 'forged channel']],
    }, '*');
  });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
  const unchanged = await page.evaluate(async () => (await import('/assets/picker.js')).getCurrentAnswers());
  assert.deepEqual(unchanged, original);
  await page.locator('.exercise-choice').click();
  await ready(page);
  const next = await page.evaluate(async () => (await import('/assets/picker.js')).collectCurrentAnswers());
  assert.notEqual(next.sessionId, originalId);
  assert.ok(next.answers.entries.every(([, value]) => value === ''));
});

test('answer requests time out cleanly and pending requests reject when their frame is replaced', { timeout: 60_000 }, async (t) => {
  const page = await pageFor(t);
  await page.goto(baseUrl);
  await choices(page);
  const result = await page.evaluate(async () => {
    const { createAnswerBridge } = await import('/assets/answer-bridge.js');
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.srcdoc = '<!doctype html><body>No answer listener</body>';
    await new Promise((resolve) => { frame.onload = resolve; document.body.append(frame); });
    const timed = createAnswerBridge({ frame, channel: crypto.randomUUID(), timeoutMs: 50 });
    const timeout = await timed.collect().catch((error) => error.code);
    timed.destroy();
    const replaced = createAnswerBridge({ frame, channel: crypto.randomUUID() });
    const pending = replaced.collect().catch((error) => error.code);
    replaced.destroy();
    const closed = await replaced.collect().catch((error) => error.code);
    frame.remove();
    return { timeout, replaced: await pending, closed };
  });
  assert.deepEqual(result, { timeout: 'TIMEOUT', replaced: 'FRAME_REPLACED', closed: 'FRAME_REPLACED' });
});