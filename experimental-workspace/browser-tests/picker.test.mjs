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
  await page.locator('#exercise-content').getByText('Opening your exercise…').waitFor();
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
test('submitted answers and feedback survive page refresh without another grading request', { timeout: 90_000 }, async (t) => {
  const page = await pageFor(t);
  await page.goto(baseUrl);
  await choices(page);
  await page.locator('.exercise-choice').click();
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
  await page.locator('.exercise-choice').click();
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
  assert.equal(await page.locator('.exercise-choice').isDisabled(), true);
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
  assert.equal(await page.locator('.exercise-choice').isEnabled(), true);
});

test('grading server and network failures preserve all inputs and allow an explicit retry', { timeout: 90_000 }, async (t) => {
  const page = await pageFor(t, { width: 390, height: 844 });
  await page.goto(baseUrl);
  await choices(page);
  await page.locator('.exercise-choice').click();
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
  await page.locator('#submission-error').getByText(/couldn’t confirm whether your answers were saved/).waitFor();
  assert.deepEqual(await fields.evaluateAll((fields) => fields.map((field) => field.value)), values);
  assert.equal(calls, 2);
  assert.equal(await page.locator('.exercise-frame').evaluate((frame) => frame === window.originalExerciseFrame), true);
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
  await page.locator('.exercise-choice').click();
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
  await page.locator('.exercise-choice').click();
  await ready(page);
  assert.equal(await page.locator('#submission-error').isHidden(), true);
  assert.equal(await page.locator('#submission-status').textContent(), '');
  assert.equal(await page.getByRole('button', { name: 'Check answer', exact: true }).isEnabled(), true);
});

test('real PG feedback distinguishes invalid input, incorrect answers, blanks and correctness, then restores results', {timeout:120_000}, async (t) => {
  const page=await pageFor(t);
  await page.goto(baseUrl);await choices(page);await page.locator('.exercise-choice').click();await ready(page);
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
  assert.match(await frame.locator('.field-feedback[data-status=incorrect]').textContent(),/understood.*not mathematically correct/);
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
  await page.goto(baseUrl); await choices(page); await page.locator('.exercise-choice').click(); await ready(page);
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
  await page.locator('.exercise-choice').click();
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
  await page.goto(baseUrl); await choices(page); await page.locator('.exercise-choice').click(); await ready(page);
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
  await page.goto(baseUrl); await choices(page); await page.locator('.exercise-choice').click(); await ready(page);
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
  const contrast=await page.locator('.choice-description').evaluate(node=>{
    const channels=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;});
    const luminance=color=>channels(color).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
    const a=luminance(getComputedStyle(node).color),b=luminance(getComputedStyle(node.closest('button')).backgroundColor);
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  });
  assert.ok(contrast>=4.5);
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
  await page.goto(baseUrl); await choices(page); await page.locator('.exercise-choice').click(); await ready(page);
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
  await owner.goto(baseUrl); await choices(owner); await owner.locator('.exercise-choice').click(); await ready(owner);
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
  await other.goto(baseUrl); await choices(other); await other.locator('.exercise-choice').click(); await ready(other);
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
 await page.locator('.exercise-choice').first().click();
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