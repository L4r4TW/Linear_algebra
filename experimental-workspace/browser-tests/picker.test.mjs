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
