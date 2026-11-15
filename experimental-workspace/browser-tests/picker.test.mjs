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
  const page=await context.newPage();
  page.on('dialog',dialog=>dialog.type()==='beforeunload'||dialog.message().startsWith('Leave this exercise?')?dialog.accept():dialog.dismiss());
  return page;
}
async function choices(page) {
  await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).first().waitFor();
}
async function ready(page) {
  await page.waitForFunction(()=>!document.querySelector('#check-answer').disabled);
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
  await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();
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
  await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();
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
  await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();
  await page.locator('#exercise-content').getByText('Opening your exercise…').waitFor();
  assert.equal(await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).isDisabled(), true);
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
  assert.equal(await page.locator('#exercise-content').getByRole('button', { name: 'Try again' }).count(),0);
  await page.locator('#exercise-content').getByRole('button', { name: 'Choose another exercise' }).click();
  await page.locator('.exercise-choice:focus').waitFor();
  assert.equal(starts, 0);
  assert.equal(await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).isEnabled(), true);
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
  await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();
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
  await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();
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
  await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();
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
  await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();
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
  await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();
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
test('submitted answers and feedback survive page refresh without another grading request', { timeout: 90_000 }, async (t) => {
  const page = await pageFor(t);
  await page.goto(baseUrl);
  await choices(page);
  await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();
  await ready(page);
  const values = [' 2 + 3 ', '<1, 2, 3>', '', 'sqrt(9)'];
  for (let index = 0; index < values.length; index++) {
    await page.frameLocator('.exercise-frame').locator('[name="AnSwEr000' + (index + 1) + '"]').fill(values[index]);
  }
  let grades = 0;
  page.on('request', (request) => {
    if (/\/api\/sessions\/[^/]+\/answers$/.test(new URL(request.url()).pathname)) grades++;
  });
  const checked = await page.evaluate(async () => {
    const { collectCurrentAnswers } = await import('/assets/picker.js');
    const current = await collectCurrentAnswers();
    const response = await fetch('/api/sessions/' + current.sessionId + '/answers', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: current.answers.entries }),
    });
    if (!response.ok) throw new Error('Grading failed.');
    return response.json();
  });
  const expected = values.map((value, index) => ['AnSwEr000' + (index + 1), value]);
  assert.equal(checked.submission.number, 1);
  assert.deepEqual(checked.submission.answers, expected);
  assert.equal(typeof checked.submission.feedback.summary, 'string');
  await page.reload();
  await ready(page);
  const restored = await page.evaluate(async () => {
    const id = new URL(location.href).searchParams.get('session');
    return (await fetch('/api/sessions/' + id)).json();
  });
  assert.deepEqual(restored.submission, checked.submission);
  assert.equal(restored.exercise.score, checked.exercise.score);
  const current = await page.evaluate(async () => (await import('/assets/picker.js')).collectCurrentAnswers());
  assert.deepEqual(current.answers.entries, expected);
  assert.equal(grades, 1);
});
test('Check answer sends fresh values once, shows submitting state, and keeps the live inputs', { timeout: 90_000 }, async (t) => {
  const page = await pageFor(t);
  await page.goto(baseUrl);
  await choices(page);
  assert.equal(await page.locator('#practice-controls').isHidden(), true);
  await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();
  await ready(page);
  const button = page.getByRole('button', { name: 'Check answer', exact: true });
  assert.equal(await button.isEnabled(), true);
  const frame = page.frameLocator('.exercise-frame');
  const field = frame.locator('[name=AnSwEr0001]');
  await field.evaluate((input) => { input.value = ' 2 + 3 '; });
  await frame.locator('[name=AnSwEr0002]').fill('<1, 2, 3>');
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  t.after(() => release());
  let calls = 0;
  let pairs;
  await page.route('**/api/sessions/*/answers', async (route) => {
    calls++;
    pairs = route.request().postDataJSON().answers;
    await gate;
    await route.fallback();
  });
  await page.locator('.exercise-frame').evaluate((frame) => { window.originalExerciseFrame = frame; });
  await button.focus();
  await page.keyboard.press('Enter');
  const checking = page.getByRole('button', { name: 'Checking…', exact: true });
  await checking.waitFor();
  await page.waitForFunction(() => document.querySelector('#check-answer').disabled);
  assert.equal(await checking.getAttribute('aria-busy'), 'true');
  assert.equal(await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).isDisabled(), true);
  // Dispatching extra events bypasses native disabled-button handling, testing the handler guard too.
  await checking.evaluate((button) => { button.dispatchEvent(new MouseEvent('click')); button.dispatchEvent(new MouseEvent('click')); });
  await field.fill('edits made while checking');
  release();
  await page.locator('#submission-status').getByText('Submitted answers checked and saved.').waitFor();
  assert.equal(calls, 1);
  assert.deepEqual(pairs, [['AnSwEr0001', ' 2 + 3 '], ['AnSwEr0002', '<1, 2, 3>'], ['AnSwEr0003', ''], ['AnSwEr0004', '']]);
  assert.equal(await field.inputValue(), 'edits made while checking');
  await frame.locator('.field-feedback[data-status=changed]').waitFor();
  await page.locator('#result-stale').waitFor();
  assert.equal(await page.locator('.exercise-frame').evaluate((frame) => frame === window.originalExerciseFrame), true);
  assert.equal(await button.isEnabled(), true);
  assert.equal(await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).isEnabled(), true);
});

test('grading server and network failures preserve all inputs and allow an explicit retry', { timeout: 90_000 }, async (t) => {
  const page = await pageFor(t, { width: 390, height: 844 });
  await page.goto(baseUrl);
  await choices(page);
  await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();
  await ready(page);
  const values = [' 2 + 3 ', '<1, 2, 3>', '', 'sqrt(9)'];
  const fields = page.frameLocator('.exercise-frame').locator('input[name^=AnSwEr]');
  for (let index = 0; index < values.length; index++) await fields.nth(index).fill(values[index]);
  await page.locator('.exercise-frame').evaluate((frame) => { window.originalExerciseFrame = frame; });
  let calls = 0;
  await page.route('**/api/sessions/*/answers', async (route) => {
    calls++;
    if (calls === 1) await route.fulfill({ status: 503, json: { error: { message: 'Answer checking is temporarily unavailable.' } } });
    else if (calls === 2) await route.abort('failed');
    else await route.fallback();
  });
  const button = page.getByRole('button', { name: 'Check answer', exact: true });
  await button.click();
  await page.locator('#submission-error').getByText(/temporarily unavailable/).waitFor();
  assert.deepEqual(await fields.evaluateAll((fields) => fields.map((field) => field.value)), values);
  assert.equal(await button.isEnabled(), true);
  assert.equal(calls, 1);
  await button.click();
  await page.locator('#submission-error').getByText(/could not confirm whether your answers were saved/).waitFor();
  assert.deepEqual(await fields.evaluateAll((fields) => fields.map((field) => field.value)), values);
  assert.equal(calls, 2);
  assert.equal(await page.locator('.exercise-frame').evaluate((frame) => frame === window.originalExerciseFrame), true);
  assert.equal(await button.isDisabled(),true);
  await page.locator('#submission-error').getByRole('button',{name:'Reload saved session'}).click();await ready(page);
  assert.deepEqual(await fields.evaluateAll(fields=>fields.map(field=>field.value)),values);
  await button.click();
  await page.locator('#submission-status').getByText('Submitted answers checked and saved.').waitFor();
  assert.equal(await page.locator('#submission-error').isHidden(), true);
  assert.equal(calls, 3);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const bounds = await button.boundingBox();
  assert.ok(bounds.width > 250 && bounds.height >= 44);
  await page.screenshot({ path: '/qa/artifacts/practice-controls-mobile.png', fullPage: true });
});

test('leaving during grading clears the controls and ignores a late response', { timeout: 90_000 }, async (t) => {
  const page = await pageFor(t);
  await page.goto(baseUrl);
  await choices(page);
  await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();
  await ready(page);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  t.after(() => release());
  let reached;
  const requestReached = new Promise((resolve) => { reached = resolve; });
  await page.route('**/api/sessions/*/answers', async (route) => {
    reached();
    await gate;
    await route.fulfill({ status: 503, json: { error: { message: 'Late grading error.' } } }).catch(() => {});
  });
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await requestReached;
  await page.goBack();
  await page.getByText('A small step toward understanding.').waitFor();
  assert.equal(await page.locator('#practice-controls').isHidden(), true);
  release();
  await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();
  await ready(page);
  assert.equal(await page.locator('#submission-error').isHidden(), true);
  assert.equal(await page.locator('#submission-status').textContent(), '');
  assert.equal(await page.getByRole('button', { name: 'Check answer', exact: true }).isEnabled(), true);
});

test('real PG feedback distinguishes invalid input, incorrect answers, blanks and correctness, then restores results', {timeout:120_000}, async (t) => {
  const page=await pageFor(t);
  await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();await ready(page);
  const id=sessionId(page);
  const frame=page.frameLocator('.exercise-frame');
  // Solve this verified exercise from its visible mathematical statement, without privileged APIs.
  const vectors=await frame.locator('body').evaluate(()=>[...MathJax.startup.document.math].slice(0,3).map(item=>{
    const match=item.math.match(/\\left<([^>]+)\\right>/);
    if(!match)throw Error('Unexpected vector statement');
    return match[1].split(',').map(Number);
  }));
  const [u,v,w]=vectors;
  const dot=(a,b)=>a.reduce((total,value,index)=>total+value*b[index],0);
  const answers=[String(dot(u,w)),'<'+u.map(value=>value*dot(u,v)).join(',')+'>',String(dot(w,w)*dot(u,u)),String(dot(u,v)+dot(v,w))];
  let grades=0;
  page.on('request',request=>{if(/\/api\/sessions\/[^/]+\/answers$/.test(new URL(request.url()).pathname))grades++;});
  const inputs=frame.locator('input[name^=AnSwEr]');
  const check=page.getByRole('button',{name:'Check answer',exact:true});
  async function checkAndWait(){
    const graded=page.waitForResponse(response=>/\/api\/sessions\/[^/]+\/answers$/.test(new URL(response.url()).pathname)&&response.request().method()==='POST');
    await check.click();const response=await graded;assert.equal(response.status(),200);
    await page.locator('#submission-status').getByText('Submitted answers checked and saved.').waitFor();
    return response.json();
  }
  await inputs.nth(0).fill(String(Number(answers[0])+1));
  await inputs.nth(1).fill('gibberish(');
  await inputs.nth(3).fill(answers[3]);
  const mixed=await checkAndWait();
  assert.deepEqual(mixed.submission.fieldFeedback.map(field=>field.status),['incorrect','invalid','unanswered','correct']);
  await page.getByRole('heading',{name:'Check your input',exact:true}).waitFor();
  assert.match(await page.locator('#result-score').textContent(),/25%/);
  await frame.locator('.field-feedback[data-status=invalid]').waitFor();
  assert.match(await frame.locator('.field-feedback[data-status=invalid]').textContent(),/gibberish.*not defined/);
  assert.match(await frame.locator('.field-feedback[data-status=incorrect]').textContent(),/PG marked this answer incorrect/);
  assert.equal(await inputs.nth(1).getAttribute('aria-invalid'),'true');
  assert.equal(await inputs.nth(0).getAttribute('aria-invalid'),null);
  const description=await inputs.nth(1).getAttribute('aria-describedby');
  assert.ok(description.includes('practice-field-feedback-'));
  await inputs.nth(1).fill(answers[1]);
  await frame.locator('.field-feedback[data-status=changed]').waitFor();
  await page.locator('#result-stale').waitFor();
  assert.equal(await inputs.nth(1).getAttribute('aria-invalid'),null);
  await inputs.nth(2).fill(answers[2]);
  const partial=await checkAndWait();
  assert.equal(partial.submission.score,0.75);
  await page.getByRole('heading',{name:'Partially correct',exact:true}).waitFor();
  await inputs.nth(0).fill(answers[0]);
  const correct=await checkAndWait();
  assert.equal(correct.submission.score,1);
  await page.getByRole('heading',{name:'All answers correct',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('#result-stale').hidden);
  assert.doesNotMatch(await page.locator('#result-title').getAttribute('aria-describedby'),/result-stale/);
  assert.equal(await frame.locator('.field-feedback[data-status=correct]').count(),4);
  await page.reload();await ready(page);
  await page.getByRole('heading',{name:'All answers correct',exact:true}).waitFor();
  assert.equal(sessionId(page),id);
  assert.equal(grades,3);
  await frame.locator('.field-feedback[data-status=correct]').first().waitFor();
  assert.equal(await frame.locator('.ww-feedback-btn').count(),0);
  assert.deepEqual(await inputs.evaluateAll(inputs=>inputs.map(input=>input.value)),answers);
  assert.equal(await page.locator('.exercise-frame').getAttribute('sandbox'),'allow-scripts');
  await page.screenshot({path:'/qa/artifacts/feedback-correct.png',fullPage:true});
  // Use a large offset: PG deliberately accepts small numerical differences within tolerance.
  const wrong=[String(Number(answers[0])+1000),'<'+u.map(value=>value*dot(u,v)+1000).join(',')+'>',String(Number(answers[2])+1000),String(Number(answers[3])+1000)];
  for(let index=0;index<wrong.length;index++)await inputs.nth(index).fill(wrong[index]);
  const incorrect=await checkAndWait();
  assert.equal(incorrect.submission.score,0);
  assert.ok(incorrect.submission.fieldFeedback.every(field=>field.status==='incorrect'));
  await page.getByRole('heading',{name:'Not correct yet',exact:true}).waitFor();
});

test('keyboard flow supports skip navigation, Enter checking, result focus, and return to invalid answers', {timeout:90_000}, async (t) => {
  const page = await pageFor(t);
  await page.goto(baseUrl);
  await choices(page);
  await page.keyboard.press('Tab');
  await page.locator('.skip-link:focus').waitFor();
  const skip = await page.locator('.skip-link').boundingBox();
  assert.ok(skip.y >= 0 && skip.height >= 44);
  await page.keyboard.press('Enter');
  await page.locator('#practice:focus').waitFor();
  await page.keyboard.press('Shift+Tab');
  await page.locator('.exercise-choice:focus').waitFor();
  for(let index=1;index<await page.locator('.exercise-choice').count();index++)await page.keyboard.press('Shift+Tab');
  await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).and(page.locator(':focus')).waitFor();
  await page.keyboard.press('Enter');
  await ready(page);
  await page.locator('#exercise-title:focus').waitFor();
  await page.keyboard.press('Tab');
  const frame = page.frameLocator('.exercise-frame');
  await frame.locator('[name=AnSwEr0001]:focus').waitFor();
  await page.keyboard.type('gibberish(');
  await page.keyboard.press('Enter');
  await page.locator('#result-title:focus').waitFor();
  assert.equal(await page.locator('#result-title').textContent(), 'Check your input');
  assert.match(await page.locator('#practice-announcement').textContent(), /Check your input.*Score:/);
  assert.equal(await page.locator('#practice-announcement').getAttribute('aria-live'), 'polite');
  assert.equal(await page.locator('#practice-result').getAttribute('role'), 'region');
  await page.keyboard.press('Tab');
  await page.locator('#review-answers:focus').waitFor();
  await page.keyboard.press('Enter');
  await frame.locator('[name=AnSwEr0001]:focus').waitFor();
  const field = frame.locator('[name=AnSwEr0001]');
  assert.equal(await field.getAttribute('aria-invalid'), 'true');
  assert.match(await field.getAttribute('aria-describedby'), /practice-keyboard-help.*practice-field-feedback/);
  assert.equal(await field.getAttribute('aria-keyshortcuts'), 'Enter');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('1');
  await frame.locator('.field-feedback[data-status=changed]').waitFor();
  assert.match(await page.locator('#practice-announcement').textContent(), /unsubmitted changes/);
  assert.match(await page.locator('#result-title').getAttribute('aria-describedby'), /result-stale/);
  await page.evaluate(() => {
    window.practiceAnnouncementChanges = 0;
    new MutationObserver(() => window.practiceAnnouncementChanges++).observe(document.querySelector('#practice-announcement'),{childList:true,subtree:true,characterData:true});
  });
  await page.keyboard.type('2');
  await page.evaluate(async () => (await import('/assets/picker.js')).collectCurrentAnswers());
  assert.equal(await page.evaluate(() => window.practiceAnnouncementChanges),0);
  await page.keyboard.press('Tab');
  await frame.locator('[name=AnSwEr0002]:focus').waitFor();
  await page.keyboard.press('Shift+Tab');
  await frame.locator('[name=AnSwEr0001]:focus').waitFor();
});

test('Enter preserves textarea, selection, widget, modifier, composition, and repeat-key behavior', {timeout:90_000}, async (t) => {
  const page = await pageFor(t);
  await page.goto(baseUrl); await choices(page); await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click(); await ready(page);
  let grades = 0;
  page.on('request', request => { if (/\/api\/sessions\/[^/]+\/answers$/.test(new URL(request.url()).pathname)) grades++; });
  const frame = page.frameLocator('.exercise-frame');
  await frame.locator('#problem_body').evaluate(root => {
    root.insertAdjacentHTML('beforeend', `<div>
      <label>Notes<textarea name="fixtureNotes"></textarea></label>
      <label>Choice<select name="fixtureSelect"><option>One</option><option>Two</option></select></label>
      <label>Option<input type="checkbox" name="fixtureCheckbox" value="one"></label>
      <label>Radio<input type="radio" name="fixtureRadio" value="one"></label>
      <label>Widget<input name="fixtureWidget" role="combobox" aria-expanded="true"></label>
      <label>Suggestions<input name="fixtureSuggestions" list="fixtureOptions"></label><datalist id="fixtureOptions"><option value="One"></datalist>
      <label>Opt out<input name="fixtureOptOut" data-enter-submit="off"></label>
    </div>`);
  });
  const notes = frame.locator('[name=fixtureNotes]');
  await notes.fill('First'); await notes.press('Enter'); await page.keyboard.type('Second');
  assert.equal(await notes.inputValue(), 'First\nSecond');
  const checkbox = frame.locator('[name=fixtureCheckbox]');
  await checkbox.focus(); await page.keyboard.press('Space');
  assert.equal(await checkbox.isChecked(), true);
  await checkbox.press('Enter');
  await frame.locator('[name=fixtureRadio]').press('Enter');
  await frame.locator('[name=fixtureSelect]').press('Enter'); await page.keyboard.press('Escape');
  for (const name of ['fixtureWidget','fixtureSuggestions','fixtureOptOut']) await frame.locator('[name='+name+']').press('Enter');
  const field = frame.locator('[name=AnSwEr0001]');
  await field.press('Shift+Enter');
  const prevented = await field.evaluate(field => {
    const cases = [{isComposing:true},{keyCode:229},{repeat:true},{ctrlKey:true},{altKey:true},{metaKey:true}];
    const results = cases.map(options => {
      const event = new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,...options});
      field.dispatchEvent(event); return event.defaultPrevented;
    });
    field.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
    const composing = new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
    field.dispatchEvent(composing); results.push(composing.defaultPrevented);
    field.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
    return results;
  });
  assert.ok(prevented.every(value => value === false));
  const channel = await page.locator('.exercise-frame').evaluate(frame => JSON.parse(frame.srcdoc.match(/const channel=("[^"]+");/)[1]));
  await page.evaluate(channel => {
    window.postMessage({channel,type:'submit-answers'},location.origin);
    window.dispatchEvent(new MessageEvent('message',{
      source:document.querySelector('.exercise-frame').contentWindow,origin:'https://untrusted.example',data:{channel,type:'submit-answers'},
    }));
  },channel);
  await frame.locator('body').evaluate(()=>parent.postMessage({channel:'wrong-channel',type:'submit-answers'},'*'));
  // Collecting crosses the same frame message queue, flushing any accidentally posted submit message.
  await page.evaluate(async () => (await import('/assets/picker.js')).collectCurrentAnswers());
  assert.equal(grades, 0);
});

test('slow loads and grading do not steal focus after the student moves elsewhere', {timeout:90_000}, async (t) => {
  const page = await pageFor(t);
  await page.goto(baseUrl); await choices(page);
  let releaseLoad;
  const loadGate = new Promise(resolve => { releaseLoad = resolve; });
  t.after(() => releaseLoad());
  await page.route('**/api/sessions', async route => { await loadGate; await route.fallback(); });
  await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();
  await page.locator('#exercise-content').getByText('Opening your exercise…').waitFor();
  await page.locator('.brand').focus();
  releaseLoad(); await ready(page);
  assert.equal(await page.locator('.brand').evaluate(node => node === document.activeElement), true);
  let releaseGrade, reached;
  const gradeGate = new Promise(resolve => { releaseGrade = resolve; });
  const gradeReached = new Promise(resolve => { reached = resolve; });
  t.after(() => releaseGrade());
  await page.route('**/api/sessions/*/answers', async route => { reached(); await gradeGate; await route.fallback(); });
  await page.getByRole('button',{name:'Check answer',exact:true}).click();
  await gradeReached;
  assert.equal(await page.locator('#practice-announcement').textContent(), 'Checking your answers…');
  const field = page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]');
  await field.fill('keep editing');
  releaseGrade();
  await page.getByText('Submitted answers checked and saved.',{exact:true}).waitFor();
  await page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]:focus').waitFor();
  assert.equal(await field.inputValue(), 'keep editing');
  assert.equal(await page.locator('#result-stale').isVisible(), true);
});

test('service errors announce the failure and leave keyboard focus on the retry control', {timeout:90_000}, async (t) => {
  const page = await pageFor(t);
  await page.goto(baseUrl); await choices(page); await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click(); await ready(page);
  await page.route('**/api/sessions/*/answers', route => route.fulfill({status:503,json:{error:{message:'Checking is temporarily unavailable.'}}}));
  const frame = page.frameLocator('.exercise-frame');
  await frame.locator('[name=AnSwEr0001]').fill(' 2 + 3 ');
  await frame.locator('[name=AnSwEr0001]').press('Enter');
  await page.locator('#submission-error').waitFor();
  await page.locator('#check-answer:focus').waitFor();
  assert.equal(await page.locator('#submission-error').getAttribute('role'),'alert');
  assert.match(await page.locator('#check-answer').getAttribute('aria-describedby'),/submission-error/);
  assert.equal(await frame.locator('[name=AnSwEr0001]').inputValue(),' 2 + 3 ');
  const outline = await page.locator('#check-answer').evaluate(node => getComputedStyle(node).outlineStyle);
  assert.notEqual(outline,'none');
});

test('narrow screens retain readable mathematics, touch targets, contrast and visible focus', {timeout:90_000}, async (t) => {
  const page = await pageFor(t,{width:320,height:740});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(baseUrl); await choices(page); await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click(); await ready(page);
  const frame = page.frameLocator('.exercise-frame');
  const input = frame.locator('[name=AnSwEr0001]');
  await input.fill('gibberish('); await input.press('Enter');
  await page.locator('#result-title:focus').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
  assert.equal(await frame.locator('body').evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
  assert.ok(await frame.getByRole('math').count() >= 7);
  assert.equal(await frame.locator('mjx-assistive-mml math').count(),7);
  for (const selector of ['#check-answer','#review-answers']) {
    const bounds=await page.locator(selector).boundingBox(); assert.ok(bounds.height>=48 && bounds.width>=200);
  }
  const inputStyle=await input.evaluate(node=>({size:parseFloat(getComputedStyle(node).fontSize),height:node.getBoundingClientRect().height}));
  assert.ok(inputStyle.size>=16 && inputStyle.height>=48);
  assert.equal(await page.locator('.spinner').evaluate(node=>getComputedStyle(node).animationName),'none');
  const contrast=await page.locator('.choice-description').evaluateAll(nodes=>nodes.map(node=>{
    const channels=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;});
    const luminance=color=>channels(color).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
    const a=luminance(getComputedStyle(node).color),b=luminance(getComputedStyle(node.closest('button')).backgroundColor);
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  }));
  assert.ok(contrast.every(value=>value>=4.5));
  await page.locator('#review-answers').click();
  await frame.locator('[name=AnSwEr0001]:focus').waitFor();
  const focusFits=await input.evaluate(node=>{
    const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
    const ring=parseFloat(style.outlineWidth)+parseFloat(style.outlineOffset);
    return rect.left>=ring && rect.right+ring<=innerWidth;
  });
  assert.equal(focusFits,true);
  await page.screenshot({path:'/qa/artifacts/accessibility-mobile.png',fullPage:true});
  await page.emulateMedia({forcedColors:'active'});
  await page.locator('#review-answers').focus();
  assert.notEqual(await page.locator('#review-answers').evaluate(node=>getComputedStyle(node).outlineStyle),'none');
  await page.setViewportSize({width:1280,height:1000});
  await page.evaluate(()=>{document.documentElement.style.zoom='2';});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
});

async function solveVerifiedDotProduct(page) {
  // Derive answers from the public question, never an instructor response.
  const vectors = await page.frameLocator('.exercise-frame').locator('body').evaluate(() =>
    [...MathJax.startup.document.math].slice(0, 3).map(item => {
      const match = item.math.match(/\\left<([^>]+)\\right>/);
      if (!match) throw new Error('Unexpected verified exercise statement.');
      return match[1].split(',').map(Number);
    }));
  const [u, v, w] = vectors;
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  return [
    ' ' + dot(u, w) + ' ',
    ' <' + u.map(value => value * dot(u, v)).join(', ') + '> ',
    String(dot(w, w) * dot(u, u)),
    String(dot(u, v) + dot(v, w)),
  ];
}

async function ownedSnapshot(page, id = sessionId(page)) {
  return page.evaluate(async id => {
    const response = await fetch('/api/sessions/' + id, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Owned session could not be retrieved.');
    return response.json();
  }, id);
}

test('complete real practice flow preserves partial credit through failures and recovers a lost successful response on refresh', {timeout:120_000}, async (t) => {
  const page = await pageFor(t, {width:390, height:844});
  await page.goto(baseUrl); await choices(page); await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click(); await ready(page);
  const id = sessionId(page);
  const values = await solveVerifiedDotProduct(page);
  const fields = page.frameLocator('.exercise-frame').locator('input[name^=AnSwEr]');
  assert.equal(await fields.count(), 4);
  await fields.nth(0).fill(values[0]);
  const partialResponse = page.waitForResponse(response => response.url().endsWith('/answers') && response.request().method() === 'POST');
  await page.getByRole('button', {name:'Check answer', exact:true}).click();
  assert.equal((await partialResponse).status(), 200);
  await page.getByRole('heading', {name:'Partially correct', exact:true}).waitFor();
  const partial = await ownedSnapshot(page);
  assert.equal(partial.submission.number, 1);
  assert.equal(partial.submission.score, 0.25);
  assert.equal(partial.submission.fieldFeedback.filter(field => field.status === 'unanswered').length, 3);
  for (let index=0; index<values.length; index++) await fields.nth(index).fill(values[index]);
  let attempts = 0;
  let accepted;
  await page.route('**/api/sessions/*/answers', async route => {
    attempts++;
    if (attempts === 1) {
      await route.fulfill({status:503, json:{error:{code:'RENDERER_UNAVAILABLE',message:'The exercise service is temporarily unavailable.'}}});
    } else if (attempts === 2) {
      // The real backend grades and saves, but the browser never receives its response.
      const response = await route.fetch({url:route.request().url().replace(baseUrl, backendUrl)});
      assert.equal(response.status(), 200);
      accepted = await response.json();
      await route.abort('failed');
    } else await route.fallback();
  });
  const check = page.getByRole('button', {name:'Check answer',exact:true});
  await check.click();
  await page.locator('#submission-error').getByText(/temporarily unavailable/).waitFor();
  assert.deepEqual(await fields.evaluateAll(fields => fields.map(field => field.value)), values);
  assert.deepEqual((await ownedSnapshot(page)).submission, partial.submission);
  assert.equal(attempts, 1);
  await check.click();
  await page.locator('#submission-error').getByText(/confirm whether your answers were saved/).waitFor();
  assert.deepEqual(await fields.evaluateAll(fields => fields.map(field => field.value)), values);
  assert.equal(attempts, 2);
  assert.equal(accepted.submission.number, 2);
  assert.equal(accepted.submission.score, 1);
  assert.deepEqual((await ownedSnapshot(page)).submission, accepted.submission);
  await page.reload(); await ready(page);
  await page.getByRole('heading', {name:'All answers correct',exact:true}).waitFor();
  assert.equal(sessionId(page), id);
  assert.deepEqual(await fields.evaluateAll(fields => fields.map(field => field.value)), values);
  const restored = await ownedSnapshot(page);
  assert.deepEqual(restored.submission, accepted.submission);
  assert.equal(attempts, 2);
  assert.doesNotMatch(JSON.stringify(restored), /sessionJWT|problemJWT|answerJWT|correct_value|ownerHash|rendererSessionToken/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test('real browser sessions enforce ownership across owned and anonymous contexts without changing either session', {timeout:120_000}, async (t) => {
  const owner = await pageFor(t);
  await owner.goto(baseUrl); await choices(owner); await owner.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click(); await ready(owner);
  const id = sessionId(owner);
  const values = await solveVerifiedDotProduct(owner);
  const fields = owner.frameLocator('.exercise-frame').locator('input[name^=AnSwEr]');
  for (let index=0;index<values.length;index++) await fields.nth(index).fill(values[index]);
  await owner.getByRole('button',{name:'Check answer',exact:true}).click();
  await owner.getByRole('heading',{name:'All answers correct',exact:true}).waitFor();
  const saved = await ownedSnapshot(owner);
  const identity = (await owner.context().cookies(baseUrl+'/api/sessions')).find(cookie=>cookie.name==='la_experiment_owner');
  assert.ok(identity);
  assert.equal(identity.httpOnly,true);
  assert.equal(identity.sameSite,'Strict');

  const other = await pageFor(t);
  await other.goto(baseUrl); await choices(other); await other.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click(); await ready(other);
  const otherId = sessionId(other);
  assert.notEqual(otherId,id);
  const anonymous = await pageFor(t);
  await anonymous.goto(baseUrl); await choices(anonymous);
  for (const page of [other,anonymous]) {
    const statuses = await page.evaluate(async id => {
      const read = await fetch('/api/sessions/'+id);
      const grade = await fetch('/api/sessions/'+id+'/answers',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answers:[['AnSwEr0001','tampered']]}),
      });
      return {read:read.status,grade:grade.status,readBody:await read.json(),gradeBody:await grade.json()};
    },id);
    assert.equal(statuses.read,404);
    assert.equal(statuses.grade,404);
    assert.deepEqual(Object.keys(statuses.readBody),['error']);
    assert.deepEqual(Object.keys(statuses.gradeBody),['error']);
    let replacements = 0;
    page.on('request',request=>{if(new URL(request.url()).pathname==='/api/sessions'&&request.method()==='POST')replacements++;});
    await page.goto(baseUrl+'/?session='+id);
    await page.locator('#exercise-content').getByText('Session was not found.').waitFor();
    assert.equal(await page.locator('.exercise-frame').count(),0);
    assert.equal(replacements,0);
  }
  await owner.reload(); await ready(owner);
  await owner.getByRole('heading',{name:'All answers correct',exact:true}).waitFor();
  assert.deepEqual((await ownedSnapshot(owner)).submission,saved.submission);
  assert.deepEqual(await fields.evaluateAll(fields=>fields.map(field=>field.value)),values);
  await other.goto(baseUrl+'/?session='+otherId); await ready(other);
  assert.equal((await ownedSnapshot(other)).submission,null);
  assert.ok((await other.frameLocator('.exercise-frame').locator('input[name^=AnSwEr]').evaluateAll(fields=>fields.map(field=>field.value))).every(value=>value===''));
});

test('a failed dependency keeps grading disabled after the deadline and retry restores the same session', {timeout:90_000}, async(t)=>{
 const page=await pageFor(t);
 await page.route(baseUrl+'/assets/exercise/**',route=>route.abort('failed'));
 await page.goto(baseUrl);await choices(page);
 await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).first().click();
 await page.getByText('Exercise resources could not load. Retry before checking answers.').waitFor();
 const id=sessionId(page);
 assert.equal(await page.locator('#check-answer').isEnabled(),false);
 await page.waitForTimeout(21_000);
 assert.equal(await page.locator('#check-answer').isEnabled(),false);
 await page.unroute(baseUrl+'/assets/exercise/**');
 await page.getByRole('button',{name:'Retry exercise',exact:true}).click();
 await ready(page);
 assert.equal(sessionId(page),id);
 assert.equal(await page.locator('#check-answer').isEnabled(),true);
 assert.equal(await page.locator('.exercise-frame').getAttribute('sandbox'),'allow-scripts');
});
test('GraphTool observation is limited to the mapped answer, preserves native values, and cleans up',async(t)=>{
 const page=await pageFor(t);await page.goto(baseUrl);
 const result=await page.evaluate(async()=>{
  const {installGraphAnswerAdapters}=await import('/assets/widget-answers.js');
  const {collectAnswerFields}=await import('/assets/answer-fields.js');
  const root=document.createElement('div');
  root.innerHTML='<div class="graphtool-outer-container"><input type="hidden" id="AnSwEr0001" name="AnSwEr0001"><input type="hidden" id="MaThQuIlL_AnSwEr0001" name="MaThQuIlL_AnSwEr0001"><div class="graphtool-container" id="AnSwEr0001_graphbox"></div></div><input type="hidden" id="other" name="other">';
  let changes=0;const dispose=installGraphAnswerAdapters(root,()=>changes++);
  const answer=root.querySelector('#AnSwEr0001');answer.value='{point,(1,2)}';answer.value='{point,(1,2)}';
  root.querySelector('#MaThQuIlL_AnSwEr0001').value='helper';root.querySelector('#other').value='unrelated';
  const observed=changes,snapshot=collectAnswerFields(root);
  dispose();answer.value='';
  return {observed,afterCleanup:changes,snapshot,cleared:answer.value};
 });
 assert.equal(result.observed,1);assert.equal(result.afterCleanup,1);assert.equal(result.cleared,'');
 assert.deepEqual(result.snapshot,{fieldNames:['AnSwEr0001','other'],entries:[['AnSwEr0001','{point,(1,2)}'],['other','unrelated']]});
});

test('widget feedback describes the visible graph and keeps choice labels together using plain text',async(t)=>{
 const page=await pageFor(t);await page.goto(baseUrl);
 const result=await page.evaluate(async()=>{
  const {renderFieldFeedback}=await import('/assets/field-feedback.js');
  const root=document.createElement('div');document.body.append(root);
  root.innerHTML='<div class="graphtool-outer-container"><input type="hidden" id="AnSwEr0001" name="AnSwEr0001" value="graph"><div class="graphtool-container" id="AnSwEr0001_graphbox"><button>Plot point</button></div></div><div class="checkboxes-container"><label><input type="checkbox" name="choices" value="a" checked>Choice A</label><label><input type="checkbox" name="choices" value="b" checked>Choice B</label></div>';
  const fields=[{name:'AnSwEr0001',status:'partial',message:'<img src=x> Hint'},{name:'choices',status:'correct',message:'Good choices'}];
  const submitted=[['AnSwEr0001','graph'],['choices','a'],['choices','b']];
  renderFieldFeedback(root,fields,submitted);
  const graph=root.querySelector('.graphtool-container'),button=graph.querySelector('button');
  const described=button.getAttribute('aria-describedby');
  const initial={count:root.querySelectorAll('[data-practice-feedback]').length,graphDescribed:graph.getAttribute('aria-describedby')===described&&Boolean(root.querySelector('#'+described)),groupFeedback:root.querySelector('.checkboxes-container').nextElementSibling.dataset.status,labelIntact:root.querySelectorAll('label [data-practice-feedback]').length===0,plainText:root.querySelector('.field-feedback span').textContent,executable:root.querySelectorAll('img').length};
  root.querySelector('input[name="AnSwEr0001"]').value='edited';renderFieldFeedback(root,fields,submitted);
  const changed=root.querySelector('.graphtool-outer-container').nextElementSibling.dataset.status;
  renderFieldFeedback(root,[],[]);const cleaned=!button.hasAttribute('aria-describedby')&&!graph.hasAttribute('aria-describedby');root.remove();
  return {initial,changed,cleaned};
 });
 assert.equal(result.initial.count,2);assert.equal(result.initial.graphDescribed,true);assert.equal(result.initial.groupFeedback,'correct');assert.equal(result.initial.labelIntact,true);assert.equal(result.initial.executable,0);assert.equal(result.initial.plainText,'<img src=x> Hint');assert.equal(result.changed,'changed');assert.equal(result.cleaned,true);
});
test('exercise styles opt in native answers while preserving table, graph, editor and author opt-outs',async(t)=>{
 const page=await pageFor(t);await page.goto(baseUrl);
 const result=await page.evaluate(async()=>{
  const {markPracticeControls}=await import('/assets/exercise-frame.js');
  const root=document.createElement('div');
  root.innerHTML='<p>Plain question</p><p class="author-prose">Authored question</p><p style="color:red">Colored question</p><input name="ordinary"><input name="authored-field" style="width:73px"><input type="hidden" name="hidden"><input name="problemSeed"><table><tr><td><input name="matrix" size="5"></td></tr></table><div class="graphtool-outer-container"><input name="graph-control"></div><div class="mq-editable-field"><input name="editor"></div><div data-practice-preserve-style><input name="author"></div><label><input type="checkbox" name="choices">Choice</label>';
  document.body.append(root);markPracticeControls(root);
  const marked=[...root.querySelectorAll('.practice-answer')].map(n=>n.name);
  const focused=[...root.querySelectorAll('.practice-focus')].map(n=>n.name);
  const result={marked,focused,prose:root.querySelectorAll('.practice-prose').length,label:root.querySelector('label').classList.contains('practice-choice-label'),matrixSize:root.querySelector('[name=matrix]').getAttribute('size')};root.remove();return result;
 });
 assert.deepEqual(result.marked,['ordinary','choices']);assert.deepEqual(result.focused,['ordinary','authored-field','matrix','choices']);assert.equal(result.label,true);assert.equal(result.prose,1);assert.equal(result.matrixSize,'5');
});

test('application shell styles cannot reach the exercise and widget geometry survives exercise override removal',async(t)=>{
 const page=await pageFor(t);await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).first().click();await ready(page);
 const frame=page.frameLocator('.exercise-frame');
 const before=await frame.locator('[name=AnSwEr0001]').evaluate(n=>({height:n.getBoundingClientRect().height,font:getComputedStyle(n).fontSize}));
 await page.addStyleTag({content:'body{font-size:42px!important;color:red!important}input{height:100px!important}'});
 const after=await frame.locator('[name=AnSwEr0001]').evaluate(n=>({height:n.getBoundingClientRect().height,font:getComputedStyle(n).fontSize}));
 assert.deepEqual(after,before);
 const preserved=await frame.locator('#problem_body').evaluate(root=>{
  const widget=document.createElement('div');widget.className='graphtool-outer-container';widget.innerHTML='<div class="graphtool-container"><input name="widget-dimension" style="width:73px;height:29px;padding:2px;line-height:17px;font-size:12px;border:1px solid black"><svg width="150" height="90" viewBox="0 0 150 90"><rect width="100" height="40" fill="blue"/></svg></div>';root.append(widget);
  const signature=()=>{const input=widget.querySelector('input'),svg=widget.querySelector('svg'),s=getComputedStyle(input);return {width:input.getBoundingClientRect().width,height:input.getBoundingClientRect().height,padding:s.padding,lineHeight:s.lineHeight,viewBox:svg.getAttribute('viewBox'),fill:getComputedStyle(svg.querySelector('rect')).fill};};
  const styled=signature();document.querySelector('[data-practice-exercise-style]').sheet.disabled=true;const upstream=signature();document.querySelector('[data-practice-exercise-style]').sheet.disabled=false;widget.remove();return {styled,upstream};
 });
 assert.deepEqual(preserved.styled,preserved.upstream);
});
test('approved multi-subject batch is selectable and disabled candidates stay private', {timeout:180_000}, async t=>{
 const page=await pageFor(t);await page.goto(baseUrl);await choices(page);
 const {exercises}=await page.evaluate(async()=> (await fetch('/api/exercises')).json());
 assert.equal(exercises.length,6);assert.equal(await page.locator('.exercise-choice').count(),6);
 for(const exercise of exercises){
  await page.locator('.exercise-choice').filter({hasText:exercise.title}).click();
  await page.waitForFunction(()=>{const button=document.querySelector('#check-answer');return button&&!button.disabled&&!button.closest('[hidden]');});
  assert.ok(await page.frameLocator('.exercise-frame').locator('input[name],select[name],textarea[name]').count()>0);
  assert.ok(new URL(page.url()).searchParams.get('session'));
 }
 for(const id of ['compat-matrix-grid-01','compat-algebra-image-01','compat-economics-popup-01','compat-calculus-scaffold-01','compat-algebra-graphtool-01']){
  const status=await page.evaluate(async exerciseId=>(await fetch('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({exerciseId})})).status,id);assert.equal(status,404);
 }
});

async function draftAnswers(page){return page.evaluate(async()=> (await (await import('/assets/picker.js')).collectCurrentAnswers()).answers);}
async function draftReady(page){await page.waitForFunction(()=>{const button=document.querySelector('#check-answer');return button&&!button.disabled&&!button.closest('[hidden]');});}
async function gradeDraft(page){const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/answers'));await page.locator('#check-answer').click();assert.equal((await response).status(),200);await draftReady(page);}

test('drafts preserve every enabled native exercise, whitespace and repeated-name choices across refresh', {timeout:180_000}, async t=>{
 const page=await pageFor(t,{width:390,height:844});await page.goto(baseUrl);await choices(page);
 const exercises=await page.evaluate(async()=> (await fetch('/api/exercises')).json());
 for(const exercise of exercises.exercises){
  await page.locator('.exercise-choice[data-exercise-id="'+exercise.id+'"]').click();await draftReady(page);
  const id=sessionId(page),frame=page.frameLocator('.exercise-frame');
  for(const input of await frame.locator('#problem_body input[type=text],#problem_body input:not([type]),#problem_body textarea').all())await input.fill('  <1, 2, 3>  ');
  const groups=await frame.locator('#problem_body input[type=radio]').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.name))]);
  for(const name of groups)await frame.locator('input[type=radio][name="'+name+'"]').first().check();
  const boxes=frame.locator('#problem_body input[type=checkbox]');for(let i=0;i<Math.min(2,await boxes.count());i++)await boxes.nth(i).check();
  const before=await draftAnswers(page);await page.locator('#draft-status').getByText(/Draft saved/).waitFor();
  if(exercise.id==='compat-algebra-checkbox-01')assert.ok(before.entries.some(([name])=>before.entries.filter(([key])=>key===name).length>1));
  await page.reload();await draftReady(page);assert.equal(sessionId(page),id);assert.deepEqual(await draftAnswers(page),before);
  if(await boxes.count()){
   for(const box of await boxes.all())await box.uncheck();const cleared=await draftAnswers(page);await page.reload();await draftReady(page);assert.deepEqual(await draftAnswers(page),cleared);
  }
 }
});

test('draft overrides checked answers, marks feedback stale, and clears only after those edits are checked', {timeout:90_000}, async t=>{
 const page=await pageFor(t);await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();await draftReady(page);
 await gradeDraft(page);const original=await ownedSnapshot(page),id=sessionId(page);
 const input=page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]');await input.fill(' 7 + 3 ');const draft=await draftAnswers(page);
 await page.reload();await draftReady(page);assert.deepEqual(await draftAnswers(page),draft);await page.locator('#result-stale').waitFor({state:'visible'});
 assert.deepEqual((await ownedSnapshot(page)).submission,original.submission);
 await gradeDraft(page);assert.equal(await page.evaluate(id=>sessionStorage.getItem('practice-draft:v1:'+id),id),null);
 const checked=await ownedSnapshot(page);await page.reload();await draftReady(page);assert.deepEqual(await draftAnswers(page),draft);assert.deepEqual((await ownedSnapshot(page)).submission,checked.submission);assert.equal(await page.locator('#result-stale').isVisible(),false);
});

test('draft retains edits made during accepted grading when the response is lost', {timeout:90_000}, async t=>{
 const page=await pageFor(t);await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();await draftReady(page);
 const input=page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]');await input.fill('1');await draftAnswers(page);
 let release;const waiting=new Promise(resolve=>{release=resolve;});let accept;const accepted=new Promise(resolve=>{accept=resolve;});
 await page.route('**/api/sessions/*/answers',async route=>{const response=await route.fetch({url:route.request().url().replace(baseUrl,backendUrl)});assert.equal(response.status(),200);accept();await waiting;await route.abort('failed');});
 await page.locator('#check-answer').click();await accepted;await input.fill(' 99 + 1 ');const newer=await draftAnswers(page);release();await page.locator('#submission-error').waitFor({state:'visible'});
 const saved=await ownedSnapshot(page);await page.unroute('**/api/sessions/*/answers');await page.reload();await draftReady(page);
 assert.deepEqual(await draftAnswers(page),newer);assert.deepEqual((await ownedSnapshot(page)).submission,saved.submission);await page.locator('#result-stale').waitFor({state:'visible'});
});

test('new versions and other owners never receive the original session draft', {timeout:90_000}, async t=>{
 const page=await pageFor(t);await page.goto(baseUrl);await choices(page);const choice=page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'});await choice.click();await draftReady(page);
 const oldId=sessionId(page);await page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').fill('draft in original');const before=await draftAnswers(page);
 const stored=await page.evaluate(id=>sessionStorage.getItem('practice-draft:v1:'+id),oldId);
 await choice.click();await draftReady(page);assert.notEqual(sessionId(page),oldId);assert.ok((await draftAnswers(page)).entries.every(([,v])=>v===''));
 await page.goBack();await draftReady(page);assert.equal(sessionId(page),oldId);assert.deepEqual(await draftAnswers(page),before);
 const stranger=await pageFor(t);await stranger.addInitScript(({id,stored})=>sessionStorage.setItem('practice-draft:v1:'+id,stored),{id:oldId,stored});await stranger.goto(baseUrl+'/?session='+oldId);await stranger.locator('#exercise-content [role=alert]').waitFor();assert.equal(await stranger.locator('.exercise-frame').count(),0);assert.equal(await stranger.locator('#draft-status').isVisible(),false);
});

test('unavailable storage and corrupt drafts leave answers editable and report the problem', {timeout:90_000}, async t=>{
 const page=await pageFor(t);await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();await draftReady(page);
 const id=sessionId(page);await page.evaluate(id=>sessionStorage.setItem('practice-draft:v1:'+id,'{broken'),id);await page.reload();await draftReady(page);await page.locator('#draft-status').getByText(/could not be restored/).waitFor();
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Quota','QuotaExceededError');};});
 await page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').fill('keep me');await draftAnswers(page);await page.locator('#draft-status').getByText(/could not be saved/).waitFor();assert.equal(await page.locator('#check-answer').isEnabled(),true);assert.equal(await page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').inputValue(),'keep me');
});

test('native draft adapter restores repeated values, cleared groups and selects atomically, rejecting helpers',async t=>{
 const page=await pageFor(t);await page.goto(baseUrl);const result=await page.evaluate(async()=>{
  const {collectAnswerFields,restoreAnswerFields}=await import('/assets/answer-fields.js');
  const root=document.createElement('div');root.innerHTML='<input name="text" value="old"><input name="choices" type="checkbox" value="x"><input name="choices" type="checkbox" value="x"><input name="radio" type="radio" value="a"><input name="radio" type="radio" value="b"><select name="select" multiple><option>a</option><option>b</option></select><input name="sessionJWT" value="private-helper">';
  const desired={fieldNames:['text','choices','radio','select'],entries:[['text',' <2, 3> '],['choices','x'],['choices','x'],['select','a'],['select','b']]};
  restoreAnswerFields(root,desired);const restored=collectAnswerFields(root);let rejected=false;
  try{restoreAnswerFields(root,{...desired,entries:[['text','tampered'],['choices','unknown']]});}catch{rejected=true;}
  const unchanged=JSON.stringify(collectAnswerFields(root))===JSON.stringify(restored);
  restoreAnswerFields(root,{...desired,entries:[['text','']]});
  return {restored,rejected,unchanged,helper:root.querySelector('[name=sessionJWT]').value,cleared:collectAnswerFields(root)};
 });assert.equal(result.rejected,true);assert.equal(result.unchanged,true);assert.equal(result.helper,'private-helper');assert.deepEqual(result.restored.entries,[['text',' <2, 3> '],['choices','x'],['choices','x'],['select','a'],['select','b']]);assert.deepEqual(result.cleared.entries,[['text','']]);
});

test('a newer checked result wins over an older draft in this tab', {timeout:90_000},async t=>{
 const page=await pageFor(t);await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();await draftReady(page);await gradeDraft(page);
 await page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').fill('older local draft');await draftAnswers(page);
 const id=sessionId(page),advanced=await page.evaluate(async id=>{
  const response=await fetch('/api/sessions/'+id+'/answers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answers:[['AnSwEr0001','2']]})});if(!response.ok)throw new Error('Could not advance saved result');return response.json();
 },id);
 await page.reload();await draftReady(page);await page.locator('#draft-status').getByText(/newer checked result/).waitFor();
 assert.equal(await page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').inputValue(),'2');assert.deepEqual((await ownedSnapshot(page)).submission,advanced.submission);assert.equal(await page.locator('#result-stale').isVisible(),false);
});

test('native input events autosave without requesting collection or grading', {timeout:90_000},async t=>{
 const page=await pageFor(t);await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice[data-exercise-id="compat-algebra-checkbox-01"]').click();await draftReady(page);
 let grades=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/answers'))grades++;});
 const frame=page.frameLocator('.exercise-frame'),text=frame.locator('#problem_body input[type=text]').first(),box=frame.locator('#problem_body input[type=checkbox]').first();
 const textName=await text.getAttribute('name'),boxName=await box.getAttribute('name'),boxValue=await box.getAttribute('value'),id=sessionId(page);
 await text.fill('  preserve this exactly  ');await box.check();
 await page.waitForFunction(({id,textName,boxName,boxValue})=>{
  const record=JSON.parse(sessionStorage.getItem('practice-draft:v1:'+id)||'null');return record?.answers.entries.some(([name,value])=>name===textName&&value==='  preserve this exactly  ')&&record.answers.entries.some(([name,value])=>name===boxName&&value===boxValue);
 },{id,textName,boxName,boxValue});
 await page.reload();await draftReady(page);assert.equal(await text.inputValue(),'  preserve this exactly  ');assert.equal(await box.isChecked(),true);assert.equal(grades,0);
});

for(const [code,status,title] of [['SESSION_EXPIRED',410,'This saved session has expired'],['SESSION_REJECTED',409,'This saved session cannot be resumed'],['EXERCISE_WITHDRAWN',410,'This exercise is currently unavailable'],['SESSION_NOT_FOUND',404,'Session unavailable in this browser']])test('terminal recovery '+code+' keeps the session link and draft without retrying or starting another', {timeout:90_000},async t=>{
 const page=await pageFor(t);await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();await draftReady(page);
 const id=sessionId(page);await page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').fill('retained unfinished work');await draftAnswers(page);
 const record=await page.evaluate(id=>sessionStorage.getItem('practice-draft:v1:'+id),id);let starts=0,gets=0;
 page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/sessions'))starts++;});const pattern='**/api/sessions/'+id;
 await page.route(pattern,async route=>{gets++;await route.fulfill({status,json:{error:{code,message:'PRIVATE upstream details must not be displayed'}}});});
 await page.reload();await page.locator('#exercise-content').getByRole('heading',{name:title,exact:true}).waitFor();
 assert.equal(await page.locator('#exercise-content').getByRole('button',{name:'Try again',exact:true}).count(),0);assert.doesNotMatch(await page.locator('#exercise-content').textContent(),/PRIVATE/);
 await page.waitForTimeout(150);assert.equal(gets,1);assert.equal(starts,0);assert.equal(sessionId(page),id);assert.equal(await page.evaluate(id=>sessionStorage.getItem('practice-draft:v1:'+id),id),record);
 await page.locator('#exercise-content').getByRole('button',{name:'Choose another exercise'}).press('Enter');await page.locator('.exercise-choice:focus').waitFor();assert.equal(starts,0);
 await page.unroute(pattern);await page.reload();await draftReady(page);assert.equal(await page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').inputValue(),'retained unfinished work');
});

for(const [code,status] of [['RENDERER_UNAVAILABLE',503],['RENDERER_TIMEOUT',504]])test('transient recovery '+code+' retries only the same saved session on request', {timeout:90_000},async t=>{
 const page=await pageFor(t,{width:390,height:844});await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();await draftReady(page);
 const id=sessionId(page);await page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').fill('retry same draft');await draftAnswers(page);let gets=0,starts=0;
 page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/sessions'))starts++;});
 await page.route('**/api/sessions/'+id,async route=>{gets++;if(gets===1)await route.fulfill({status,json:{error:{code,message:'temporary'}}});else await route.fallback();});
 await page.reload();await page.locator('#exercise-content [role=alert]').waitFor();await page.waitForTimeout(150);assert.equal(gets,1);
 await page.locator('#exercise-content').getByRole('button',{name:'Try again',exact:true}).press('Enter');await draftReady(page);assert.equal(gets,2);assert.equal(starts,0);assert.equal(sessionId(page),id);assert.equal(await page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').inputValue(),'retry same draft');
});

test('terminal grading failure keeps the live frame editable, blocks repeated checks and offers a deliberate choice', {timeout:90_000},async t=>{
 const page=await pageFor(t);await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();await draftReady(page);
 const input=page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]');await input.fill('first draft');await draftAnswers(page);const id=sessionId(page),before=await ownedSnapshot(page);let checks=0;
 await page.route('**/api/sessions/*/answers',async route=>{checks++;await route.fulfill({status:410,json:{error:{code:'SESSION_EXPIRED',message:'expired'}}});});
 await page.locator('#check-answer').click();await page.locator('#submission-error').getByText(/confirmed.*expired/).waitFor();assert.equal(await page.locator('#check-answer').isDisabled(),true);
 await page.locator('#check-answer').evaluate(n=>n.dispatchEvent(new MouseEvent('click')));await input.fill('still editable');await draftAnswers(page);assert.equal(checks,1);assert.equal(sessionId(page),id);assert.deepEqual((await ownedSnapshot(page)).submission,before.submission);
 await page.locator('#submission-error').getByRole('button',{name:'Choose another exercise'}).press('Enter');await page.locator('.exercise-choice:focus').waitFor();assert.equal(await input.inputValue(),'still editable');
});

test('lost grading response reload action uses GET, restores saved result and preserves newer draft edits', {timeout:90_000},async t=>{
 const page=await pageFor(t);await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();await draftReady(page);
 const id=sessionId(page),input=page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]');await input.fill('1');let grades=0,starts=0;
 page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/sessions'))starts++;});
 let accept,release;const accepted=new Promise(resolve=>{accept=resolve;}),gate=new Promise(resolve=>{release=resolve;});t.after(()=>release());
 await page.route('**/api/sessions/*/answers',async route=>{grades++;const response=await route.fetch({url:route.request().url().replace(baseUrl,backendUrl)});assert.equal(response.status(),200);accept();await gate;await route.abort('failed');});
 await page.locator('#check-answer').click();await accepted;await input.fill('newer unchecked edit');const newer=await draftAnswers(page);release();await page.locator('#submission-error').waitFor();assert.equal(await page.locator('#check-answer').isDisabled(),true);
 const saved=await ownedSnapshot(page);await page.locator('#submission-error').getByRole('button',{name:'Reload saved session'}).press('Enter');await draftReady(page);
 assert.equal(sessionId(page),id);assert.equal(grades,1);assert.equal(starts,0);assert.deepEqual((await ownedSnapshot(page)).submission,saved.submission);assert.deepEqual(await draftAnswers(page),newer);await page.locator('#result-stale').waitFor();
});

test('failed GET recovery and blocked draft storage keep live edits until a successful restore', {timeout:90_000},async t=>{
 const page=await pageFor(t);await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();await draftReady(page);
 const id=sessionId(page),input=page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]');await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('blocked','QuotaExceededError');};});await input.fill('1');
 let release,accept;const gate=new Promise(resolve=>{release=resolve;}),accepted=new Promise(resolve=>{accept=resolve;});t.after(()=>release());
 await page.route('**/api/sessions/*/answers',async route=>{const response=await route.fetch({url:route.request().url().replace(baseUrl,backendUrl)});assert.equal(response.status(),200);accept();await gate;await route.abort('failed');});
 await page.locator('#check-answer').click();await accepted;await input.fill('draft without storage');release();await page.locator('#submission-error').getByRole('button',{name:'Reload saved session'}).waitFor();
 await page.locator('.exercise-frame').evaluate(n=>{window.recoveryOriginalFrame=n;});let gets=0;
 await page.route('**/api/sessions/'+id,async route=>{gets++;if(gets===1)await route.fulfill({status:503,json:{error:{code:'RENDERER_UNAVAILABLE',message:'unavailable'}}});else await route.fallback();});
 await page.locator('#submission-error').getByRole('button',{name:'Reload saved session'}).click();await page.locator('#submission-error').getByText(/temporarily unavailable/).waitFor();assert.equal(await page.locator('.exercise-frame').evaluate(n=>n===window.recoveryOriginalFrame),true);assert.equal(await input.inputValue(),'draft without storage');assert.equal(await page.locator('#check-answer').isDisabled(),true);
 await input.fill('latest in-memory edit');await page.locator('#submission-error').getByRole('button',{name:'Reload saved session'}).click();await draftReady(page);assert.equal(sessionId(page),id);assert.equal(await input.inputValue(),'latest in-memory edit');assert.equal(gets,2);await page.locator('#result-stale').waitFor();await page.locator('#draft-status').getByText(/(cannot|could not) be saved/).waitFor();
});

test('a mismatched saved-session response is rejected without replacing the requested exercise', {timeout:90_000},async t=>{
 const page=await pageFor(t);await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();await draftReady(page);const id=sessionId(page);await page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').fill('original draft');await draftAnswers(page);
 const pattern='**/api/sessions/'+id;await page.route(pattern,route=>route.fulfill({status:200,json:{session:{id:'11111111-1111-4111-8111-111111111111',exerciseId:'dot-product-01'},exercise:{html:'<div id="problem_body">wrong session</div>'}}}));
 await page.reload();await page.locator('#exercise-content').getByText(/response could not be verified/).waitFor();assert.equal(sessionId(page),id);assert.equal(await page.locator('.exercise-frame').count(),0);await page.unroute(pattern);await page.locator('#exercise-content').getByRole('button',{name:'Try again',exact:true}).click();await draftReady(page);assert.equal(await page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').inputValue(),'original draft');
});

test('suppressed public results stay neutral and visible grading can follow without stale score state', {timeout:90_000},async t=>{
 const page=await pageFor(t);await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();await draftReady(page);
 const pattern='**/api/sessions/*/answers';await page.route(pattern,async route=>{
  const response=await route.fetch({url:route.request().url().replace(baseUrl,backendUrl)}),data=await response.json();
  data.submission.feedbackVisibility='suppressed';data.submission.score=null;data.exercise.score=null;data.submission.feedback={summary:'PRIVATE hidden result',message:'PRIVATE hidden result'};
  data.submission.fieldFeedback=data.submission.fieldFeedback.map(({name})=>({name,status:'ungraded',score:null,message:'',reason:'suppressed'}));await route.fulfill({response,json:data});
 });
 await gradeDraft(page);await page.getByRole('heading',{name:'Answers submitted',exact:true}).waitFor();assert.equal(await page.locator('#result-score').isHidden(),true);assert.equal(await page.locator('#result-score').textContent(),'');assert.equal(await page.locator('#result-message').isHidden(),true);assert.doesNotMatch(await page.locator('#practice-result').textContent(),/PRIVATE|100%|Not correct yet/);
 const frame=page.frameLocator('.exercise-frame');assert.equal(await frame.locator('[data-status=ungraded]').count(),4);assert.equal(await frame.getByText('Feedback withheld',{exact:true}).count(),4);
 await frame.locator('[name=AnSwEr0001]').fill('314159');await frame.getByText(/Grading feedback remains withheld/).waitFor();await page.locator('#result-stale').waitFor();
 await page.unroute(pattern);await gradeDraft(page);assert.equal(await page.locator('#result-score').isVisible(),true);assert.match(await page.locator('#result-score').textContent(),/^Score:/);assert.equal(await frame.getByText('Feedback withheld',{exact:true}).count(),0);
});

test('field feedback remains bound by generated name, clears stale invalid semantics and restores them on revert',async t=>{
 const page=await pageFor(t);await page.goto(baseUrl);const result=await page.evaluate(async()=>{
  const {renderFieldFeedback}=await import('/assets/field-feedback.js');const root=document.createElement('div');root.innerHTML='<input name="scalar" value="bad("><div class="checkboxes-container"><label><input type="checkbox" name="choices" value="a" checked>A</label><label><input type="checkbox" name="choices" value="b">B</label></div>';
  const submitted=[['scalar','bad('],['choices','a']],fields=[{name:'choices',status:'correct',score:1,message:'Group message'},{name:'scalar',status:'invalid',score:0,message:'Parser message'}];
  renderFieldFeedback(root,fields,submitted);const scalar=root.querySelector('[name=scalar]'),choice=root.querySelector('[name=choices]'),box=node=>root.querySelector('#'+node.getAttribute('data-practice-description'));
  const initial={invalid:scalar.getAttribute('aria-invalid')==='true',scalarMessage:box(scalar).textContent.includes('Parser message'),groupMessage:box(choice).textContent.includes('Group message'),groupCount:root.querySelectorAll('[data-practice-feedback]').length};
  scalar.value='new';renderFieldFeedback(root,fields,submitted);const changed={invalidRemoved:!scalar.hasAttribute('aria-invalid'),scalarChanged:box(scalar).dataset.status==='changed',groupUnchanged:box(choice).dataset.status==='correct'};
  scalar.value='bad(';renderFieldFeedback(root,fields,submitted);return {initial,changed,reverted:scalar.getAttribute('aria-invalid')==='true'&&box(scalar).dataset.status==='invalid',noLabelMutation:root.querySelectorAll('label [data-practice-feedback]').length===0};
 });assert.deepEqual(result,{initial:{invalid:true,scalarMessage:true,groupMessage:true,groupCount:2},changed:{invalidRemoved:true,scalarChanged:true,groupUnchanged:true},reverted:true,noLabelMutation:true});
});

test('reviewed PG notation renders in field and overall feedback while HTML and unreviewed TeX stay inert', {timeout:90000}, async t=>{
 const page=await pageFor(t,{width:360,height:900});await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice[data-exercise-id="dot-product-01"]').click();await ready(page);
 const f=page.frameLocator('.exercise-frame');let unsafeRequests=0;page.on('request',r=>{if(r.url().includes('feedback-evil'))unsafeRequests++;});
 await page.route('**/api/sessions/*/answers',async route=>{
  const response=await route.fetch({url:route.request().url().replace(baseUrl,backendUrl)}),data=await response.json();data.submission.feedback={summary:'PG summary: \\(x^2 + \\frac{1}{2}\\).\nNext paragraph.',message:'<img src="/feedback-evil" onerror="window.feedbackExecuted=true"> \\(\\href{https://feedback-evil}{x}\\)'};
  data.submission.fieldFeedback[0].message='PG field: \\(\\vec{v} = \\langle 1,2\\rangle\\).\nKeep this line. \\(\\href{https://feedback-evil}{x}\\)';await route.fulfill({response,json:data});
 });
 await f.locator('[name=AnSwEr0001]').fill('gibberish(');await page.locator('#check-answer').click();
 await page.locator('#result-message .feedback-math[data-math-state=rendered]').waitFor();await f.locator('.field-feedback-message .feedback-math[data-math-state=rendered]').waitFor();
 await f.locator('.field-feedback-message').first().evaluate(async node=>{await MathJax.typesetPromise([node]);});
 assert.equal(await f.locator('.field-feedback-message a').count(),0);
 assert.match(await f.locator('.field-feedback-message').first().textContent(),/\\href/);
 assert.equal(await page.locator('#result-message mjx-assistive-mml').count(),1);assert.equal(await f.locator('.field-feedback-message mjx-assistive-mml').count(),1);
 assert.match(await page.locator('#result-message').textContent(),/Next paragraph/);assert.match(await page.locator('#result-message').textContent(),/\\href/);assert.match(await f.locator('.field-feedback-message').first().textContent(),/Keep this line/);
 assert.equal(await page.locator('#result-message img,#result-message a').count(),0);assert.equal(unsafeRequests,0);assert.equal(await page.evaluate(()=>window.feedbackExecuted),undefined);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 await f.locator('[name=AnSwEr0001]').fill('1');await f.locator('.field-feedback[data-status=changed]').waitFor();assert.equal(await f.locator('.field-feedback-message .feedback-math').count(),0);
 await f.locator('[name=AnSwEr0001]').fill('gibberish(');await f.locator('.field-feedback-message .feedback-math[data-math-state=rendered]').waitFor();
});

test('optional feedback math failure preserves original notation, saved result and usable controls', {timeout:90000}, async t=>{
 const page=await pageFor(t);await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice[data-exercise-id="dot-product-01"]').click();await ready(page);
 await page.route('**/assets/mathjax/tex-svg.js',route=>route.abort());
 await page.route('**/api/sessions/*/answers',async route=>{const response=await route.fetch({url:route.request().url().replace(baseUrl,backendUrl)}),data=await response.json();data.submission.feedback.message='PG notation: \\(x^2\\).';await route.fulfill({response,json:data});});
 await page.locator('#check-answer').click();await page.locator('#result-message [data-math-state=fallback]').waitFor();
 assert.match(await page.locator('#result-message').textContent(),/\\\(x\^2\\\)/);assert.equal(await page.locator('#check-answer').isEnabled(),true);assert.equal(await page.locator('#practice-result').isVisible(),true);
});

test('late feedback math cannot replace edited feedback and wide expressions retain keyboard scrolling',async t=>{
 const page=await pageFor(t,{width:360,height:900});await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice[data-exercise-id=dot-product-01]').click();await ready(page);
 const result=await page.evaluate(async()=>{
  const {renderFeedbackContent}=await import('/assets/feedback-content.js');const target=document.createElement('div');document.body.append(target);
  let resolve;const pending=renderFeedbackContent(target,'Old \\(x^2\\)',()=>new Promise(r=>{resolve=r;}));await Promise.resolve();
  await renderFeedbackContent(target,'Changed since last check',()=>{throw Error('Unexpected math');});
  resolve({tex2svgPromise:async()=>{const n=document.createElement('div');n.textContent='Late old mathematics';return n;}});await pending;
  const staleKept=target.textContent==='Changed since last check';target.remove();
  const {feedbackMathReady}=await import('/assets/feedback-content.js');const overall=document.getElementById('result-message');document.getElementById('practice-result').hidden=false;
  await renderFeedbackContent(overall,'\\['+'x+'.repeat(120)+'x\\]',feedbackMathReady);
  const expression=overall.querySelector('.feedback-math');return {staleKept,state:expression?.dataset.mathState,width:expression?.clientWidth,scroll:expression?.scrollWidth,scrollable:expression?.tabIndex===0&&expression?.getAttribute('role')==='group',noOverflow:document.documentElement.scrollWidth<=innerWidth+1};
 });assert.equal(result.staleKept,true);assert.equal(result.scrollable,true,JSON.stringify(result));assert.equal(result.noOverflow,true);
});
test('hint disclosure preserves live text/vector drafts, session and grading state, and closes when availability changes',{timeout:90000},async t=>{
 const page=await pageFor(t,{width:360,height:900});let available=true,grades=0,starts=0;
 const hint='Use the authored relation \\(x^2\\). <img src="/hint-evil"> \\(\\href{https://hint-evil}{x}\\)';
 await page.route('**/api/sessions',async route=>{const response=await route.fetch({url:route.request().url().replace(baseUrl,backendUrl)}),data=await response.json();if(route.request().method()==='POST'){starts++;data.exercise.hint=available?{available:true,message:hint}:{available:false};}await route.fulfill({response,json:data});});
 await page.route('**/api/sessions/*/answers',async route=>{grades++;const response=await route.fetch({url:route.request().url().replace(baseUrl,backendUrl)}),data=await response.json();data.exercise.hint=available?{available:true,message:hint}:{available:false};await route.fulfill({response,json:data});});
 await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice[data-exercise-id=dot-product-01]').click();await ready(page);const id=sessionId(page),f=page.frames().find(f=>f.parentFrame());await f.locator('[name=AnSwEr0001]').fill(' 17 ');await f.locator('[name=AnSwEr0002]').fill('< 1, 2, 3 >');const before=await page.evaluate(async()=>(await(await import('/assets/picker.js')).collectCurrentAnswers()).answers.entries);
 await page.locator('#view-hint').focus();await page.keyboard.press('Enter');await page.locator('#hint-message [data-math-state=rendered]').waitFor();assert.equal(await page.locator('#view-hint').getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#hint-message img,#hint-message a').count(),0);assert.match(await page.locator('#hint-message').textContent(),/\\href/);assert.equal(await page.locator('#hint-message mjx-assistive-mml').count(),1);
 assert.equal(sessionId(page),id);assert.equal(page.frames().find(f=>f.parentFrame()),f);assert.equal(starts,1);assert.equal(grades,0);assert.deepEqual(await page.evaluate(async()=>(await(await import('/assets/picker.js')).collectCurrentAnswers()).answers.entries),before);
 await page.locator('#view-hint').click();assert.equal(await page.locator('#hint-content').isHidden(),true);await page.locator('#view-hint').click();available=false;await page.locator('#check-answer').click();await page.waitForFunction(()=>!document.querySelector('#check-answer').disabled);assert.equal(await page.locator('#practice-hint').isHidden(),true);assert.equal(await page.locator('#hint-message').textContent(),'');assert.equal(page.frames().find(f=>f.parentFrame()),f);assert.equal(sessionId(page),id);assert.equal(grades,1);assert.deepEqual(await page.evaluate(async()=>(await(await import('/assets/picker.js')).collectCurrentAnswers()).answers.entries),before);
});

test('a normal exercise without authored hints never advertises a View hint action',{timeout:90000},async t=>{
 const page=await pageFor(t);await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice[data-exercise-id=dot-product-01]').click();await ready(page);assert.equal(await page.locator('#view-hint').isHidden(),true);await page.locator('#check-answer').click();await page.waitForFunction(()=>!document.querySelector('#check-answer').disabled);assert.equal(await page.locator('#view-hint').isHidden(),true);await page.reload();await ready(page);assert.equal(await page.locator('#view-hint').isHidden(),true);
});
test('result actions retry in the same session and choosing another only focuses the catalog',{timeout:90000},async t=>{
 const p=await pageFor(t,{width:360,height:900});let starts=0,grades=0;p.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/sessions'))starts++;if(r.method()==='POST'&&r.url().endsWith('/answers'))grades++;});await p.goto(baseUrl);await choices(p);await p.locator('.exercise-choice[data-exercise-id=dot-product-01]').click();await ready(p);const id=sessionId(p),f=p.frames().find(f=>f.parentFrame());
 await p.locator('#check-answer').click();await p.locator('#practice-result').waitFor();await ready(p);assert.match(await p.locator('#result-next-step').textContent(),/same exercise/);await p.locator('#review-answers').press('Enter');await f.locator('[name=AnSwEr0001]:focus').waitFor();assert.equal(grades,1);
 await f.locator('[name=AnSwEr0001]').fill('17');await p.locator('#check-answer').click();await ready(p);assert.equal(grades,2);assert.equal(starts,1);assert.equal(sessionId(p),id);assert.equal(p.frames().find(f=>f.parentFrame()),f);
 await f.locator('[name=AnSwEr0001]').fill('unfinished');await p.locator('#choose-exercise').press('Enter');await p.locator('.exercise-choice:not([aria-current=true]):focus').waitFor();assert.equal(starts,1);assert.equal(grades,2);assert.equal(sessionId(p),id);assert.equal(await f.locator('[name=AnSwEr0001]').inputValue(),'unfinished');assert.equal(p.frames().find(f=>f.parentFrame()),f);
});

test('new variation is explicit, Cancel keeps fresh unsignalled edits and confirmed leave preserves the old draft',{timeout:90000},async t=>{
 const p=await pageFor(t);let accept=false,confirmations=0;const messages=[];p.removeAllListeners('dialog');p.on('dialog',d=>{if(d.type()==='beforeunload')return d.accept();confirmations++;messages.push(d.message());return accept?d.accept():d.dismiss();});await p.goto(baseUrl);await choices(p);const card=p.locator('.exercise-choice[data-exercise-id=dot-product-01]');await card.click();await ready(p);const id=sessionId(p),f=p.frames().find(f=>f.parentFrame());assert.match(await card.textContent(),/starts a new session/);
 await f.locator('[name=AnSwEr0001]').evaluate(n=>{n.value='  fresh without input event  ';});await card.click();await ready(p);assert.equal(confirmations,1);assert.equal(await card.evaluate(n=>document.activeElement===n),true);assert.match(messages[0],/unchecked work is saved in this tab/);assert.equal(sessionId(p),id);assert.equal(p.frames().find(f=>f.parentFrame()),f);assert.equal(await f.locator('[name=AnSwEr0001]').inputValue(),'  fresh without input event  ');
 accept=true;let starts=0;p.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/sessions'))starts++;});await card.evaluate(n=>{n.click();n.click();});await p.waitForFunction(id=>new URL(location.href).searchParams.get('session')!==id,id);await ready(p);assert.equal(starts,1);assert.notEqual(sessionId(p),id);assert.equal(await p.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').inputValue(),'');
 await p.goBack();await ready(p);assert.equal(sessionId(p),id);assert.equal(await p.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').inputValue(),'  fresh without input event  ');
});

test('Back and browser reload protect unfinished work, with exact history and draft restoration',{timeout:90000},async t=>{
 const p=await pageFor(t);let leave=false,reload=false,exits=0;p.removeAllListeners('dialog');p.on('dialog',d=>{if(d.type()==='beforeunload'){exits++;return reload?d.accept():d.dismiss();}return leave?d.accept():d.dismiss();});await p.goto(baseUrl);await choices(p);await p.locator('.exercise-choice[data-exercise-id=dot-product-01]').click();await ready(p);const id=sessionId(p),f=p.frames().find(f=>f.parentFrame());await f.locator('[name=AnSwEr0001]').fill('history draft');
 await p.goBack();await p.waitForFunction(id=>new URL(location.href).searchParams.get('session')===id,id);await ready(p);assert.equal(p.frames().find(f=>f.parentFrame()),f);assert.equal(await f.locator('[name=AnSwEr0001]').inputValue(),'history draft');
 leave=true;await p.goBack();await p.getByText('A small step toward understanding.').waitFor();await p.goForward();await ready(p);assert.equal(sessionId(p),id);assert.equal(await p.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').inputValue(),'history draft');
 const blockedReload=p.waitForEvent('dialog');await p.evaluate(()=>{setTimeout(()=>location.reload(),0);});await blockedReload;assert.ok(exits>0);assert.equal(sessionId(p),id);assert.equal(await p.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').inputValue(),'history draft');reload=true;await p.reload();await ready(p);assert.equal(sessionId(p),id);assert.equal(await p.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').inputValue(),'history draft');
});

test('storage and collection failures require explicit consent instead of losing live answers',{timeout:90000},async t=>{
 const p=await pageFor(t),messages=[];await p.addInitScript(()=>window.addEventListener('message',e=>{if(window.blockCollectedAnswers&&e.data?.type==='answers')e.stopImmediatePropagation();}));p.removeAllListeners('dialog');p.on('dialog',d=>{if(d.type()==='beforeunload')return d.accept();messages.push(d.message());return d.dismiss();});await p.goto(baseUrl);await choices(p);await p.locator('.exercise-choice[data-exercise-id=dot-product-01]').click();await ready(p);const id=sessionId(p),f=p.frames().find(f=>f.parentFrame());await p.evaluate(()=>{Storage.prototype.setItem=function(){throw Error('blocked');};});await f.locator('[name=AnSwEr0001]').fill('cannot save');await p.locator('.exercise-choice:not([aria-current=true])').first().click();await ready(p);assert.match(messages[0],/could not be saved/);assert.equal(sessionId(p),id);assert.equal(await f.locator('[name=AnSwEr0001]').inputValue(),'cannot save');
 await p.evaluate(()=>{window.blockCollectedAnswers=true;});await p.locator('.exercise-choice:not([aria-current=true])').first().click();await ready(p);assert.match(messages[1],/could not be read/);assert.equal(sessionId(p),id);assert.equal(p.frames().find(f=>f.parentFrame()),f);assert.equal(await f.locator('[name=AnSwEr0001]').inputValue(),'cannot save');
});

test('cancelling Back during a check preserves the active session and never duplicates grading',{timeout:90000},async t=>{
 const p=await pageFor(t);p.removeAllListeners('dialog');const messages=[];p.on('dialog',d=>{if(d.type()==='beforeunload')return d.accept();messages.push(d.message());return d.dismiss();});await p.goto(baseUrl);await choices(p);await p.locator('.exercise-choice[data-exercise-id=dot-product-01]').click();await ready(p);const id=sessionId(p);let release,reached,calls=0;const gate=new Promise(r=>{release=r;}),entered=new Promise(r=>{reached=r;});t.after(()=>release());await p.route('**/api/sessions/*/answers',async route=>{calls++;reached();await gate;await route.fulfill({status:503,json:{error:{code:'RENDERER_UNAVAILABLE',message:'Try again.'}}});});await p.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').fill('pending work');await p.locator('#check-answer').click();await entered;await p.goBack();await p.waitForFunction(id=>new URL(location.href).searchParams.get('session')===id,id);assert.match(messages[0],/last check has not been confirmed/);assert.equal(calls,1);assert.equal(await p.locator('#check-answer').isDisabled(),true);release();await p.locator('#submission-error').waitFor();assert.equal(sessionId(p),id);assert.equal(await p.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').inputValue(),'pending work');assert.equal(calls,1);
});
test('rapid history requests supersede a pending restore without duplicate sessions or losing the current draft',{timeout:90000},async t=>{
 const p=await pageFor(t);let starts=0;p.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/sessions'))starts++;});await p.goto(baseUrl);await choices(p);const card=p.locator('.exercise-choice[data-exercise-id=dot-product-01]');await card.click();await ready(p);const first=sessionId(p);await card.click();await p.waitForFunction(id=>new URL(location.href).searchParams.get('session')!==id,first);await ready(p);const second=sessionId(p);
 let release,reached;const gate=new Promise(r=>{release=r;}),entered=new Promise(r=>{reached=r;});t.after(()=>release());await p.route('**/api/sessions/'+first,async route=>{reached();await gate;const response=await route.fetch({url:route.request().url().replace(baseUrl,backendUrl)});await route.fulfill({response});});
 await p.goBack();await entered;await p.goBack();release();await p.getByText('A small step toward understanding.').waitFor();assert.equal(sessionId(p),null);assert.equal(starts,2);await p.unroute('**/api/sessions/'+first);await p.goForward();await ready(p);assert.equal(sessionId(p),first);await p.goForward();await ready(p);assert.equal(sessionId(p),second);
 p.removeAllListeners('dialog');p.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());const f=p.frames().find(f=>f.parentFrame());await f.locator('[name=AnSwEr0001]').fill('keep across two steps');const cancelled=p.waitForEvent('dialog');await p.evaluate(()=>history.go(-2));await cancelled;await p.waitForFunction(id=>new URL(location.href).searchParams.get('session')===id,second);await ready(p);assert.equal(p.frames().find(f=>f.parentFrame()),f);assert.equal(await f.locator('[name=AnSwEr0001]').inputValue(),'keep across two steps');assert.equal(starts,2);
});