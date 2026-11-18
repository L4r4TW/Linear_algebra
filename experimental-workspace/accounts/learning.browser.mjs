import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
import { parse } from 'parse5';
import { solveStudentQuestion } from '../calculus/student-oracles.mjs';
const origin = 'http://localhost:3105',
  backend = 'http://linear-algebra-discovery-home-1:3005',
  browser = await chromium.launch(),
  contexts = [],
  email = 'learning-ui-' + randomBytes(12).toString('hex') + '@example.test',
  password = randomBytes(24).toString('base64url') + 'Aa1!';
const report = {
  version: 1,
  observedAt: new Date().toISOString(),
  scope:
    'Real local home/Auth/RLS/private PG and independent student-question answer; synthetic users only; no original secrets/student volumes in this QA container',
};
let phase = 'home';
async function pageFor() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  contexts.push(ctx);
  await ctx.route(origin + '/**', async (route) => {
    try {
      const r = await route.fetch({ url: route.request().url().replace(origin, backend) });
      await route.fulfill({ response: r });
    } catch {
      await route
        .fulfill({ status: 503, json: { error: { code: 'QA_TRANSPORT_UNAVAILABLE' } } })
        .catch(() => {});
    }
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(40000);
  p.on('dialog', (d) => d.accept());
  return p;
}
const card = (p) =>
  p
    .locator('.collection-card')
    .filter({ has: p.getByRole('heading', { name: 'Differential calculus', exact: true }) });
async function home(p, percent) {
  await p.goto(origin);
  await p.waitForFunction(
    () => document.querySelectorAll('.collection-card progress').length === 4,
  );
  assert.match(
    await card(p).locator('.progress-label').textContent(),
    new RegExp('^' + percent + '%'),
  );
  assert.equal(await p.locator('#section').count(), 0);
}
async function auth(p, signup) {
  await p.goto(origin + '/account');
  await p.locator('#auth-form').waitFor();
  await p.locator('#email').fill(email);
  await p.locator('#password').fill(password);
  await p.getByRole('button', { name: signup ? 'Create account' : 'Sign in', exact: true }).click();
  await p.locator('#signed-in').waitFor({ state: 'visible' });
}
const ready = (p) =>
  p.waitForFunction(
    () =>
      document.querySelector('#check-answer') &&
      !document.querySelector('#check-answer').disabled &&
      !document.querySelector('#session-status').hidden,
  );
try {
  const page = await pageFor();
  await home(page, 0);
  await page.screenshot({ path: '/tmp/learning-home.png', fullPage: true });
  const exerciseId = '3efe7179-771d-4aa4-bf28-24665ead4ce8';
  phase = 'start';
  const started = await page.evaluate(async (exerciseId) => {
    const r = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseId }),
    });
    if (r.status !== 201) throw Error('START_FAILED');
    return r.json();
  }, exerciseId);
  const id = started.session.id,
    plain = (n) =>
      (n.nodeName === '#text' ? n.value : '') + (n.childNodes ?? []).map(plain).join(' '),
    answer = String(solveStudentQuestion(2, plain(parse(started.exercise.html)))[0]);
  await page.goto(origin + '/practice?session=' + id);
  await ready(page);
  await page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').fill(answer);
  phase = 'real-grade';
  let response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/answers'),
  );
  await page.locator('#check-answer').focus();
  await page.keyboard.press('Enter');
  let r = await response;
  assert.equal(r.status(), 200);
  assert.equal((await r.json()).submission.score, 1);
  await ready(page);
  phase = 'completion';
  await home(page, 1);
  await card(page).click();
  await page.locator('#subject-progress progress').waitFor();
  assert.match(await page.locator('#subject-progress .progress-label').textContent(), /^1%/);
  assert.match(await page.locator('[data-chapter=rules] .progress-label').textContent(), /^5%/);
  await page.screenshot({ path: '/tmp/learning-subject.png', fullPage: true });
  report.realPGUpdatesSubjectAndChapter = true;
  phase = 'repeat';
  await page.goto(origin + '/practice?session=' + id);
  await ready(page);
  response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/answers'),
  );
  await page.locator('#check-answer').click();
  r = await response;
  assert.equal(r.status(), 200);
  await ready(page);
  await home(page, 1);
  report.repeatDoesNotInflate = true;
  phase = 'claim';
  await auth(page, true);
  await home(page, 0);
  await page.goto(origin + '/account');
  await page.locator('#claim').click();
  await page.waitForFunction(() =>
    document.querySelector('#claim-status').textContent.includes('Transferred'),
  );
  await home(page, 1);
  report.signInRequiresExplicitTransfer = true;
  const second = await pageFor();
  await auth(second, false);
  await home(second, 1);
  report.crossDeviceAccountContinuation = true;
  const foreign = await pageFor();
  await home(foreign, 0);
  report.otherBrowserDoesNotSeeProgress = true;
  report.complete = true;
  await mkdir('/artifacts', { recursive: true });
  await writeFile('/artifacts/learning-browser.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ complete: true, privateDataDisclosed: false }));
} catch (error) {
  console.error(JSON.stringify({ complete: false, phase, error: error.name }));
  process.exitCode = 1;
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
