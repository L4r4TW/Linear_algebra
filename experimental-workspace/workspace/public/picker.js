import { buildExerciseDocument } from '/assets/exercise-frame.js';

const catalog = document.querySelector('#catalog');
const content = document.querySelector('#exercise-content');
const title = document.querySelector('#exercise-title');
const topic = document.querySelector('#exercise-topic');
const panel = document.querySelector('#practice');
const count = document.querySelector('#exercise-count');
const savedLabel = document.querySelector('#session-status');
const notice = document.querySelector('#exercise-notice');
const welcome = content.firstElementChild.cloneNode(true);

let exercises = [];
let selectedId;
let busy = false;
let catalogController;
let exerciseController;
let operation = 0;
let frameState;
let frameTimer;
let lastAction;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function action(label, callback) {
  const button = element('button', label, 'action');
  button.type = 'button';
  button.addEventListener('click', callback);
  return button;
}

function stateMessage(heading, message, retry, label = 'Try again') {
  const box = element('div', undefined, 'state');
  box.append(element('h3', heading), element('p', message));
  if (retry) box.append(action(label, retry));
  return box;
}

function loading(message) {
  const box = element('div', undefined, 'loading');
  box.setAttribute('role', 'status');
  const spinner = element('span', undefined, 'spinner');
  spinner.setAttribute('aria-hidden', 'true');
  box.append(spinner, element('span', message));
  return box;
}

function setBusy(value) {
  busy = value;
  panel.setAttribute('aria-busy', String(value));
  for (const button of catalog.querySelectorAll('.exercise-choice')) button.disabled = value;
}

function selectCurrent() {
  for (const button of catalog.querySelectorAll('.exercise-choice')) {
    const active = button.dataset.exerciseId === selectedId;
    button.setAttribute('aria-current', String(active));
    button.querySelector('.choice-action').textContent = active ? 'Start a new version →' : 'Start exercise →';
  }
}

async function request(path, options, signal) {
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...options?.headers },
    signal: AbortSignal.any([signal, AbortSignal.timeout(40_000)]),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('The service returned an unexpected response. Please try again.'); }
  if (!response.ok) {
    throw new Error(typeof data.error?.message === 'string' ? data.error.message : 'The exercise service is unavailable. Please try again.');
  }
  return data;
}

function renderCatalog() {
  catalog.replaceChildren();
  count.hidden = false;
  count.textContent = String(exercises.length);
  if (!exercises.length) {
    catalog.append(stateMessage('Nothing here yet', 'No exercises are available right now. Check again soon.', loadCatalog, 'Refresh list'));
    return;
  }
  const groups = new Map();
  for (const exercise of exercises) {
    if (!groups.has(exercise.topicId)) groups.set(exercise.topicId, { title: exercise.topic, entries: [] });
    groups.get(exercise.topicId).entries.push(exercise);
  }
  for (const group of groups.values()) {
    const section = element('section', undefined, 'topic-group');
    section.append(element('h3', group.title, 'topic-heading'));
    for (const exercise of group.entries) {
      const button = element('button', undefined, 'exercise-choice');
      button.type = 'button';
      button.dataset.exerciseId = exercise.id;
      button.disabled = busy;
      button.append(
        element('span', exercise.title, 'choice-title'),
        element('span', exercise.description, 'choice-description'),
        element('span', 'Start exercise →', 'choice-action'),
      );
      button.addEventListener('click', () => startExercise(exercise.id));
      section.append(button);
    }
    catalog.append(section);
  }
  selectCurrent();
}

async function loadCatalog() {
  catalogController?.abort();
  const controller = new AbortController();
  catalogController = controller;
  catalog.setAttribute('aria-busy', 'true');
  catalog.replaceChildren(loading('Loading exercises…'));
  count.hidden = true;
  try {
    const data = await request('/api/exercises', {}, controller.signal);
    if (!Array.isArray(data.exercises) || data.exercises.some((entry) =>
      !entry || ['id', 'title', 'topicId', 'topic', 'description'].some((key) => typeof entry[key] !== 'string'))) {
      throw new Error('The exercise list could not be read. Please try again.');
    }
    exercises = data.exercises;
    renderCatalog();
  } catch (error) {
    if (controller.signal.aborted) return;
    const box = stateMessage('Couldn’t load the exercises', error.message, loadCatalog);
    box.setAttribute('role', 'alert');
    catalog.replaceChildren(box);
  } finally {
    if (catalogController === controller) catalog.setAttribute('aria-busy', 'false');
  }
}

function clearFrame() {
  clearTimeout(frameTimer);
  frameState = undefined;
}

function resetPanel() {
  exerciseController?.abort();
  operation++;
  clearFrame();
  selectedId = undefined;
  title.textContent = 'Your next idea starts here.';
  topic.textContent = 'A FRESH PERSPECTIVE';
  savedLabel.hidden = notice.hidden = true;
  content.replaceChildren(welcome.cloneNode(true));
  setBusy(false);
  selectCurrent();
}

function finishFrame(error = false) {
  if (!frameState) return;
  clearTimeout(frameTimer);
  const { frame, progress, warning } = frameState;
  progress.remove();
  frame.style.visibility = 'visible';
  warning.hidden = !error;
  savedLabel.hidden = notice.hidden = false;
  setBusy(false);
  title.focus({ preventScroll: true });
}

function displaySession(data) {
  if (!data?.session || typeof data.session.id !== 'string' || typeof data.session.exerciseId !== 'string' ||
      typeof data.exercise?.html !== 'string') {
    throw new Error('The exercise response could not be read. Please try again.');
  }
  clearFrame();
  setBusy(true);
  selectedId = data.session.exerciseId;
  const exercise = exercises.find((entry) => entry.id === selectedId);
  title.textContent = exercise?.title ?? 'Your exercise';
  topic.textContent = exercise?.topic ?? 'YOUR PRACTICE';
  selectCurrent();
  const channel = crypto.randomUUID();
  const frame = element('iframe', undefined, 'exercise-frame');
  frame.title = (exercise?.title ?? 'Exercise') + ' — problem and answer fields';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.style.visibility = 'hidden';
  frame.srcdoc = buildExerciseDocument({
    html: data.exercise.html,
    channel,
    mathjaxUrl: new URL('/assets/mathjax/tex-svg.js', location.origin).href,
  });
  const progress = loading('Formatting your exercise…');
  const warning = element('div', undefined, 'notice');
  warning.setAttribute('role', 'alert');
  warning.hidden = true;
  warning.append(element('span', 'Math formatting could not load.'), action('Retry formatting', () => displaySession(data)));
  content.replaceChildren(progress, warning, frame);
  frameState = { frame, channel, progress, warning };
  frameTimer = setTimeout(() => finishFrame(true), 20_000);
}

async function openExercise({ exerciseId, sessionId }) {
  exerciseController?.abort();
  const controller = new AbortController();
  exerciseController = controller;
  const current = ++operation;
  clearFrame();
  lastAction = { exerciseId, sessionId };
  selectedId = exerciseId;
  selectCurrent();
  setBusy(true);
  savedLabel.hidden = notice.hidden = true;
  title.textContent = sessionId ? 'Welcome back.' : 'A new idea is on its way.';
  topic.textContent = sessionId ? 'RESTORING YOUR EXERCISE' : 'PREPARING YOUR EXERCISE';
  content.replaceChildren(loading(sessionId ? 'Restoring your exercise…' : 'Opening your exercise…'));
  try {
    const data = await request(
      sessionId ? '/api/sessions/' + encodeURIComponent(sessionId) : '/api/sessions',
      sessionId ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exerciseId }) },
      controller.signal,
    );
    if (current !== operation) return;
    displaySession(data);
    if (!sessionId) {
      const url = new URL(location.href);
      url.searchParams.set('session', data.session.id);
      history.pushState({}, '', url);
    }
  } catch (error) {
    if (controller.signal.aborted || current !== operation) return;
    clearFrame();
    setBusy(false);
    const message = error.name === 'TimeoutError' ? 'Loading took too long. Please try again.' : error.message;
    title.textContent = 'Let’s try that again.';
    topic.textContent = 'YOUR PRACTICE';
    const box = stateMessage('Couldn’t open this exercise', message, () => openExercise(lastAction));
    box.setAttribute('role', 'alert');
    content.replaceChildren(box);
  }
}

function startExercise(exerciseId) {
  if (!busy) void openExercise({ exerciseId });
}

function followUrl() {
  const sessionId = new URL(location.href).searchParams.get('session');
  if (sessionId) void openExercise({ sessionId });
  else resetPanel();
}

window.addEventListener('popstate', followUrl);
window.addEventListener('message', (event) => {
  if (!frameState || event.source !== frameState.frame.contentWindow || event.data?.channel !== frameState.channel) return;
  const height = event.data.height;
  if (Number.isFinite(height) && height > 0) frameState.frame.style.height = Math.max(280, Math.min(3000, height)) + 'px';
  if (event.data.type === 'ready') finishFrame();
  if (event.data.type === 'math-error') finishFrame(true);
});

await loadCatalog();
followUrl();