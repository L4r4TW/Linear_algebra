import { savePlan } from './practice-plan-store.js';
import { loadStudyProgress, progressElements } from './study-progress.js';
import { requestJson } from './http-client.js';
import { pendingPractice, clearPendingPractice } from './pending-practice.js';

const $ = (id) => document.getElementById(id);
const url = new URL(location.href);
let data,
  starting = false,
  chapterNodes = new Map();
let learningTask = Promise.resolve(),
  startController,
  subjectController,
  progressController;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function updatePracticeButtons() {
  $('subject-start').disabled = starting || !data?.available;
  for (const chapter of data?.chapters ?? [])
    chapterNodes.get(chapter.id).button.disabled = starting || !chapter.available;
}

async function loadProgress() {
  progressController?.abort();
  const controller = new AbortController();
  progressController = controller;
  $('retry-progress').hidden = true;
  $('progress-error').hidden = true;
  try {
    const progress = await loadStudyProgress({
      signal: controller.signal,
      onLoading: () => {
        $('subject-progress').textContent = 'Loading progress…';
      },
    });
    if (controller.signal.aborted) return;
    $('learning-scope').textContent =
      progress.scope === 'account'
        ? 'Progress saved to your account.'
        : 'Progress saved in this browser. Sign in and transfer your work for cross-device continuation.';
    const subject = progress.collections.find((collection) => collection.id === data.collectionId);
    if (!subject) {
      $('subject-progress').textContent =
        'Completion tracking is available in the four study collections.';
      for (const value of chapterNodes.values())
        value.progress.textContent = 'Outside the study-goal tracker.';
      return;
    }
    progressElements($('subject-progress'), subject, data.subject);
    for (const chapter of subject.chapters) {
      const value = chapterNodes.get(chapter.id);
      if (value) {
        progressElements(value.progress, chapter, chapter.title);
        value.card.dataset.complete = String(chapter.percent === 100);
      }
    }
  } catch (error) {
    if (controller.signal.aborted) return;
    $('subject-progress').textContent = 'Progress unavailable';
    $('progress-error').textContent = error.message;
    $('progress-error').hidden = false;
    $('retry-progress').hidden = false;
    for (const value of chapterNodes.values()) value.progress.textContent = 'Progress unavailable';
  }
}

function renderChapter(chapter) {
  const card = node('article', undefined, 'chapter-card');
  card.dataset.chapter = chapter.id;
  const number = node('span', String(chapter.index), 'chapter-number');
  number.setAttribute('aria-hidden', 'true');
  const body = node('div');
  const heading = node('h3', chapter.title);
  heading.tabIndex = -1;
  const progress = node('div', 'Loading progress…', 'chapter-progress');
  body.append(
    heading,
    node(
      'p',
      chapter.available
        ? chapter.available + ' exercises available'
        : 'Exercises are being prepared.',
      'muted',
    ),
    progress,
  );
  const button = node('button', 'Practice chapter →', 'secondary');
  button.type = 'button';
  button.setAttribute('aria-label', 'Practice ' + chapter.title);
  button.addEventListener('click', () => start(chapter.title));
  card.append(number, body, button);
  chapterNodes.set(chapter.id, { card, progress, button });
  return { card, heading };
}

function render(value) {
  data = value;
  document.title = value.subject + ' · MathPractice';
  $('subject-title').textContent = value.subject;
  $('subject-description').textContent =
    value.available + ' exercises available across ' + value.chapters.length + ' chapters.';
  $('chapters').replaceChildren();
  chapterNodes = new Map();
  for (const chapter of value.chapters) {
    const { card, heading } = renderChapter(chapter);
    $('chapters').append(card);
    if (url.searchParams.get('chapter') === chapter.title) {
      heading.focus({ preventScroll: true });
      card.scrollIntoView({ block: 'center' });
    }
  }
  updatePracticeButtons();
}

async function load() {
  subjectController?.abort();
  const active = new AbortController();
  subjectController = active;
  data = undefined;
  updatePracticeButtons();
  progressController?.abort();
  $('subject-error').hidden = true;
  $('retry-subject').hidden = true;
  $('chapters').setAttribute('aria-busy', 'true');
  try {
    if (
      [...url.searchParams.keys()].some((key) => !['subject', 'chapter'].includes(key)) ||
      url.searchParams.getAll('subject').length !== 1 ||
      url.searchParams.getAll('chapter').length > 1
    )
      throw Error('Choose a subject from the home page.');
    render(
      await requestJson(
        '/api/discovery/subject?subject=' + encodeURIComponent(url.searchParams.get('subject')),
        { signal: active.signal },
      ),
    );
    // Await this task before starting: the first progress call establishes guest ownership.
    learningTask = loadProgress();
  } catch (error) {
    if (active.signal.aborted) return;
    $('subject-title').textContent = 'Subject unavailable';
    $('subject-error').textContent = error.message;
    $('subject-error').hidden = false;
    $('retry-subject').hidden = false;
    $('subject-progress').textContent = '';
    $('chapters').replaceChildren();
  } finally {
    if (!active.signal.aborted) $('chapters').setAttribute('aria-busy', 'false');
  }
}

function showStartError(error, setId) {
  $('practice-start-error').replaceChildren(
    node('p', error.message),
    node(
      'p',
      'Your saved work is retained. Retry resumes this request; it does not silently replace the exercise.',
    ),
  );
  if (setId) {
    const link = node('a', 'Open the saved practice set');
    link.href = '/practice?set=' + encodeURIComponent(setId) + '&item=0';
    $('practice-start-error').append(link);
  }
  $('practice-start-error').hidden = false;
  $('practice-start-status').textContent = '';
}

async function start(chapter) {
  if (starting || !data) return;
  starting = true;
  const controller = new AbortController();
  startController = controller;
  updatePracticeButtons();
  $('practice-start-error').hidden = true;
  $('practice-start-status').textContent = 'Preparing your practice set…';
  let setId;
  try {
    await learningTask;
    if (controller.signal.aborted) return;
    const selection = { subject: data.subject, ...(chapter ? { chapter } : {}) };
    const pending = pendingPractice(selection);
    const created = await requestJson('/api/sessions/sets', {
      signal: controller.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pending),
    });
    setId = created.set.id;
    savePlan({ version: 1, ...created.set });
    const opened = await requestJson('/api/sessions/sets/' + setId + '/open', {
      signal: controller.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeoutMs: 40000,
      body: JSON.stringify({ position: 0, revision: created.set.revision }),
    });
    savePlan({ version: 1, ...opened.set });
    clearPendingPractice();
    location.assign(
      '/practice?session=' +
        encodeURIComponent(opened.sessionId) +
        '&set=' +
        encodeURIComponent(setId) +
        '&item=0',
    );
  } catch (error) {
    if (controller.signal.aborted) return;
    showStartError(error, setId);
    starting = false;
    updatePracticeButtons();
  }
}

$('subject-start').addEventListener('click', () => start());
$('retry-subject').addEventListener('click', load);
$('retry-progress').addEventListener('click', () => {
  learningTask = loadProgress();
});
window.addEventListener('pagehide', () => {
  progressController?.abort();
  startController?.abort();
  subjectController?.abort();
});
// Browsers may restore a fully frozen page, including a disabled Start button.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    starting = false;
    $('practice-start-status').textContent = '';
    void load();
  }
});
await load();
