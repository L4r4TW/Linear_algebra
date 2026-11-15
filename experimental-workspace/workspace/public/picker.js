import {createDraftStore,planDraftRestoration,sameEntries} from '/assets/draft-answers.js';
import { matchesSubmittedAnswers } from '/assets/field-feedback.js';
import { createAnswerBridge, AnswerBridgeError } from '/assets/answer-bridge.js';
import { buildExerciseDocument } from '/assets/exercise-frame.js';

const catalog = document.querySelector('#catalog');
const content = document.querySelector('#exercise-content');
const title = document.querySelector('#exercise-title');
const topic = document.querySelector('#exercise-topic');
const panel = document.querySelector('#practice');
const count = document.querySelector('#exercise-count');
const savedLabel = document.querySelector('#session-status');
const notice = document.querySelector('#exercise-notice');
const draftStatus = document.querySelector('#draft-status');
const draftStore=createDraftStore();
const controls = document.querySelector('#practice-controls');
const checkButton = document.querySelector('#check-answer');
const checkLabel = document.querySelector('#check-answer-label');
const submissionStatus = document.querySelector('#submission-status');
const submissionError = document.querySelector('#submission-error');
const resultPanel = document.querySelector('#practice-result');
const resultTitle = document.querySelector('#result-title');
const resultScore = document.querySelector('#result-score');
const resultDetail = document.querySelector('#result-detail');
const resultMessage = document.querySelector('#result-message');
const resultStale = document.querySelector('#result-stale');
const announcement = document.querySelector('#practice-announcement');
const reviewButton = document.querySelector('#review-answers');
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
let submission;
let interaction = 0;

function announce(message) {
  if (announcement.textContent !== message) announcement.textContent = message;
}

function recordInteraction() { interaction++; }
for (const type of ['focusin', 'pointerdown', 'keydown', 'wheel', 'touchstart']) {
  document.addEventListener(type, recordInteraction, { capture: true, passive: true });
}

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
  const spinner = element('span', undefined, 'spinner');
  spinner.setAttribute('aria-hidden', 'true');
  box.append(spinner, element('span', message));
  return box;
}

function updateControls() {
  const submitting = Boolean(submission);
  controls.hidden = !frameState?.ready;
  checkButton.disabled = busy || submitting || !frameState?.ready;
  reviewButton.disabled = busy || !frameState?.ready;
  checkButton.setAttribute('aria-busy', String(submitting));
  checkLabel.textContent = submitting ? 'Checking…' : 'Check answer';
  checkButton.querySelector('.spinner').hidden = !submitting;
  panel.setAttribute('aria-busy', String(busy));
  for (const button of catalog.querySelectorAll('.exercise-choice')) button.disabled = busy || submitting;
  for (const button of frameState?.warning.querySelectorAll('button') ?? []) button.disabled = submitting;
}

function displayResult(checked, entries) {
  resultPanel.hidden = !checked;
  if (!checked) return;
  const stale = Boolean(entries) && !matchesSubmittedAnswers(entries, checked.answers, checked.fieldNames);
  const changed = resultStale.hidden === stale;
  resultStale.hidden = !stale;
  resultTitle.setAttribute('aria-describedby', 'result-score result-detail' + (stale ? ' result-stale' : ''));
  if (resultPanel.dataset.submissionId === checked.id) {
    if (changed && frameState?.ready && !submission) announce(stale
      ? 'You have unsubmitted changes. The displayed result is from your last check.'
      : 'Your current answers match the last checked submission.');
    return;
  }
  resultPanel.dataset.submissionId = checked.id;
  const fields = checked.fieldFeedback ?? [];
  const invalid = fields.filter((field) => field.status === 'invalid').length;
  const unanswered = fields.filter((field) => field.status === 'unanswered').length;
  const score = checked.score;
  const outcome = invalid ? 'invalid' : score === 1 ? 'correct' : score > 0 ? 'partial' : unanswered ? 'unanswered' : 'incorrect';
  resultPanel.dataset.outcome = outcome;
  resultTitle.textContent = {
    invalid: 'Check your input', correct: 'All answers correct', partial: 'Partially correct',
    unanswered: 'Some answers are missing', incorrect: 'Not correct yet',
  }[outcome];
  resultScore.textContent = 'Score: ' + new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 }).format(score);
  resultDetail.textContent = invalid
    ? `${invalid} ${invalid === 1 ? 'answer could' : 'answers could'} not be interpreted. Fix the input format, then check again.`
    : outcome === 'correct' ? 'Your submitted answers are correct. Well done.'
      : unanswered ? 'Complete the unanswered fields and review the feedback beside your answers.'
        : 'Review the feedback beside each answer, then try again.';
  if (!fields.length) resultDetail.textContent += ' Check again to see individual field feedback for this saved result.';
  resultMessage.textContent = [checked.feedback?.summary, checked.feedback?.message].filter(Boolean).join(' ');
  resultMessage.hidden = !resultMessage.textContent;
}

function setBusy(value) {
  busy = value;
  updateControls();
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
      button.disabled = busy || Boolean(submission);
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
  announce('Loading exercises…');
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
    announce(exercises.length ? 'Exercises are ready. Choose an exercise to start.' : 'No exercises are available right now.');
  } catch (error) {
    if (controller.signal.aborted) return;
    const box = stateMessage('Couldn’t load the exercises', error.message, loadCatalog);
    box.setAttribute('role', 'alert');
    catalog.replaceChildren(box);
    announce('');
  } finally {
    if (catalogController === controller) catalog.setAttribute('aria-busy', 'false');
  }
}

function draftNotice(message) {
  draftStatus.hidden=!message;
  if(draftStatus.textContent!==message)draftStatus.textContent=message;
}
function persistDraft(state,answers) {
  if(frameState!==state||!state.draftReady||!answers)return;
  state.lastDraftSnapshot=structuredClone(answers);
  try{
    const baseline=state.lastSubmission?.answers??state.initialAnswers.entries;
    if(!state.pendingDraft&&sameEntries(answers.entries,baseline)){
      draftStore.remove(state.session);
      draftNotice(state.lastSubmission?'Checked answers saved. No unfinished changes.':'');
    }else{
      draftStore.write(state.session,state.lastSubmission,answers,state.pendingDraft??null);
      draftNotice('Draft saved in this tab. Changes have not been checked.');
    }
  }catch{
    draftNotice('Draft could not be saved in this tab. Keep this page open to avoid losing unfinished answers.');
  }
}
async function initializeDraft(state) {
  const initial=await state.answerBridge.collect();
  if(frameState!==state)return;
  state.initialAnswers=initial;
  let restored;
  try{
    const record=draftStore.read(state.session);
    const plan=planDraftRestoration(record,state.session,state.lastSubmission,initial.fieldNames);
    if(plan.action==='restore'){
      restored=await state.answerBridge.restoreDraft(plan.answers);
      if(frameState!==state)return;
      state.pendingDraft=plan.pending;
      draftNotice('Draft restored in this tab. Changes have not been checked.');
    }else if(plan.action==='clear')draftStore.remove(state.session);
    else if(plan.action==='ignore')draftNotice(plan.reason==='newer-result'
      ?'A newer checked result is available. This tab’s older draft was not applied.'
      :'The saved draft does not match these answer fields. Checked answers are shown.');
  }catch{
    draftNotice('The saved draft could not be restored. Checked answers are shown; keep this page open while editing.');
  }
  if(frameState!==state)return;
  state.draftReady=true;
  state.lastDraftSnapshot=restored??initial;
  if(restored){
    try{draftStore.write(state.session,state.lastSubmission,restored,state.pendingDraft??null);}
    catch{draftNotice('Draft restored, but further changes cannot be saved in this tab. Keep this page open.');}
  }
}
function clearFrame() {
  submission?.controller.abort();
  submission = undefined;
  submissionStatus.textContent = '';
  draftNotice('');
  resultPanel.hidden = true;
  delete resultPanel.dataset.submissionId;
  resultStale.hidden = true;
  submissionError.textContent = '';
  submissionError.hidden = true;
  clearTimeout(frameTimer);
  if (frameState) {
    frameState.answerBridge.destroy();
    panel.dispatchEvent(new CustomEvent('exercise-answers-change', { bubbles: true, detail: null }));
  }
  frameState = undefined;
  updateControls();
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
  announce('Choose an exercise to start practicing.');
  setBusy(false);
  selectCurrent();
}

async function finishFrame(error = false) {
  const state=frameState;
  if(!state||state.resourceFailed||state.initializing)return;
  if(!state.draftReady){
    state.initializing=true;
    try{await initializeDraft(state);}catch{draftNotice('Draft saving is unavailable. Keep this page open to preserve unfinished answers.');}
    finally{state.initializing=false;}
    if(frameState!==state||state.resourceFailed)return;
  }
  if (!frameState || frameState.resourceFailed) return;
  clearTimeout(frameTimer);
  const firstReady = !frameState.ready;
  frameState.ready = true;
  const { frame, progress, warning } = frameState;
  progress.remove();
  frame.style.visibility = 'visible';
  warning.hidden = !error;
  savedLabel.hidden = notice.hidden = false;
  setBusy(false);
  frameState.answerBridge.showFeedback(frameState.lastSubmission?.fieldFeedback ?? [], frameState.lastSubmission?.answers ?? []);
  displayResult(frameState.lastSubmission, frameState.answerBridge.getSnapshot()?.entries);
  if (firstReady) {
    if (frameState.focusAt === interaction) title.focus();
    announce(error ? 'The exercise is ready, but math formatting needs attention.'
      : frameState.lastSubmission
        ? 'Exercise restored. Last result: ' + resultTitle.textContent + '. ' + resultScore.textContent + '.'
        : 'Exercise ready. Press Tab to reach the answer fields.');
  }
}

function displaySession(data, { focusAt = interaction } = {}) {
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
    dependencies: data.exercise.resources?.dependencies ?? [],
    channel,
    mathjaxUrl: new URL('/assets/mathjax/tex-svg.js', location.origin).href,
  });
  const progress = loading('Formatting your exercise…');
  const warning = element('div', undefined, 'notice');
  warning.setAttribute('role', 'alert');
  warning.hidden = true;
  warning.append(element('span', 'Math formatting could not load.'), action('Retry formatting', () => void openExercise({sessionId:data.session.id})));
  content.replaceChildren(progress, warning, frame);
  const answerBridge = createAnswerBridge({
    frame,
    channel,
    onSubmit() { if (frameState?.frame === frame) void submitCurrentAnswers(); },
    onInteraction() { if (frameState?.frame === frame) recordInteraction(); },
    onChange(answers) {
      if (frameState?.frame !== frame) return;
      displayResult(frameState.lastSubmission, answers.entries);
      persistDraft(frameState,answers);
      panel.dispatchEvent(new CustomEvent('exercise-answers-change', {
        bubbles: true,
        detail: { sessionId: data.session.id, answers },
      }));
    },
  });
  frameState = { frame, channel, progress, warning, answerBridge, session: data.session, sessionId: data.session.id, lastSubmission: data.submission ?? null, focusAt };
  frameTimer = setTimeout(() => {
    if (data.exercise.resources?.dependencies?.length) {
      frameState.resourceFailed=true;
      frameState.ready=false;
      progress.hidden=true;
      warning.hidden=false;
      warning.querySelector('span').textContent='Exercise resources took too long to load. Retry before checking answers.';
      warning.querySelector('button').textContent='Retry exercise';
      frame.style.visibility='visible';
      setBusy(false);
      announce('Exercise resources took too long to load. Retry loading the exercise.');
    } else finishFrame(true);
  }, 20_000);
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
  const focusAt = interaction;
  announce(sessionId ? 'Restoring your exercise…' : 'Opening your exercise…');
  try {
    const data = await request(
      sessionId ? '/api/sessions/' + encodeURIComponent(sessionId) : '/api/sessions',
      sessionId ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exerciseId }) },
      controller.signal,
    );
    if (current !== operation) return;
    displaySession(data, { focusAt });
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
    announce('');
    const errorHeading = box.querySelector('h3');
    errorHeading.tabIndex = -1;
    if (focusAt === interaction) errorHeading.focus();
  }
}

function startExercise(exerciseId) {
  if (!busy && !submission) void openExercise({ exerciseId });
}

/** Check one fresh snapshot. Keep the live frame intact on both success and failure. */
async function submitCurrentAnswers() {
  if (busy || submission || !frameState?.ready) return;
  const current = frameState;
  const attempt = { controller: new AbortController() };
  submission = attempt;
  submissionError.hidden = true;
  submissionError.textContent = '';
  submissionStatus.textContent = 'Checking your answers…';
  updateControls();
  const focusAt = interaction;
  let nextFocus;
  announce('Checking your answers…');
  try {
    const snapshot = await collectCurrentAnswers();
    if (submission !== attempt || frameState !== current) return;
    current.pendingDraft=snapshot.answers;
    persistDraft(current,snapshot.answers);
    const data = await request('/api/sessions/' + encodeURIComponent(current.sessionId) + '/answers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: snapshot.answers.entries }),
    }, attempt.controller.signal);
    if (submission !== attempt || frameState !== current) return;
    if (data.session?.id !== current.sessionId || data.session?.exerciseId !== selectedId ||
        !Number.isSafeInteger(data.submission?.number) || data.submission.number < 1) {
      throw new Error('The checking response could not be confirmed.');
    }
    current.lastSubmission = data.submission;
    current.pendingDraft=null;
    persistDraft(current,current.answerBridge.getSnapshot()??snapshot.answers);
    current.answerBridge.showFeedback(data.submission.fieldFeedback ?? [], data.submission.answers);
    displayResult(data.submission, current.answerBridge.getSnapshot()?.entries);
    submissionStatus.textContent = 'Submitted answers checked and saved.';
    announce(resultTitle.textContent + '. ' + resultScore.textContent + '. ' + resultDetail.textContent +
      (resultStale.hidden ? '' : ' You have unsubmitted changes.'));
    nextFocus = resultTitle;
  } catch (error) {
    if (attempt.controller.signal.aborted || submission !== attempt || frameState !== current) return;
    submissionStatus.textContent = '';
    const detail = error instanceof AnswerBridgeError
      ? 'We couldn’t read the answer fields. Please try Check answer again.'
      : error.name === 'TimeoutError' || error instanceof TypeError
        ? 'We couldn’t confirm whether your answers were saved. Please try Check answer again when you’re ready.'
        : error.message;
    submissionError.textContent = detail + ' Your inputs are still here.';
    submissionError.hidden = false;
    announce('');
    nextFocus = checkButton;
  } finally {
    if (submission === attempt && frameState === current) {
      submission = undefined;
      updateControls();
      if (nextFocus && focusAt === interaction) nextFocus.focus();
    }
  }
}

reviewButton.addEventListener('click', () => {
  if (!frameState?.ready) return;
  const fields = frameState.lastSubmission?.fieldFeedback ?? [];
  const priority = ['invalid', 'unanswered', 'incorrect', 'partial', 'ungraded', 'correct'];
  const name = priority.map((status) => fields.find((field) => field.status === status)?.name).find(Boolean)
    ?? frameState.lastSubmission?.fieldNames[0];
  if (name) frameState.answerBridge.focusAnswer(name);
});

checkButton.addEventListener('click', () => { void submitCurrentAnswers(); });

function followUrl() {
  const sessionId = new URL(location.href).searchParams.get('session');
  if (sessionId) void openExercise({ sessionId });
  else resetPanel();
}

/** Current in-memory snapshot for this session; undefined until the frame reports. */
export function getCurrentAnswers() {
  const answers = frameState?.answerBridge.getSnapshot();
  return answers ? { sessionId: frameState.sessionId, answers } : undefined;
}

/** Ask the frame for fresh DOM values immediately before a submission. */
export async function collectCurrentAnswers() {
  const current = frameState;
  if (!current) throw new AnswerBridgeError('NO_FRAME', 'No exercise is open.');
  const answers = await current.answerBridge.collect();
  if (frameState !== current) throw new AnswerBridgeError('FRAME_REPLACED', 'The exercise has changed.');
  return { sessionId: current.sessionId, answers };
}
window.addEventListener('popstate', followUrl);
window.addEventListener('message', (event) => {
  if (!frameState || event.origin !== 'null' || event.source !== frameState.frame.contentWindow || event.data?.channel !== frameState.channel) return;
  const height = event.data.height;
  if (Number.isFinite(height) && height > 0) frameState.frame.style.height = Math.max(280, Math.min(3000, height)) + 'px';
  if (event.data.type === 'resource-error') {
    clearTimeout(frameTimer);
    frameState.resourceFailed=true;
    frameState.warning.querySelector('span').textContent='Exercise resources could not load. Retry before checking answers.';
    frameState.warning.querySelector('button').textContent='Retry exercise';
    frameState.warning.hidden=false;
    frameState.progress.hidden=true;
    frameState.frame.style.visibility='visible';
    frameState.ready=false;
    setBusy(false);
    announce('Exercise resources could not load. Retry loading the exercise.');
    return;
  }
  if (event.data.type === 'ready') finishFrame();
  if (event.data.type === 'math-error') finishFrame(true);
});

await loadCatalog();
followUrl();