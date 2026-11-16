import {readBookmarks,toggleBookmark} from '/assets/bookmarks.js';
import {unfinishedAnswers,nextActionText} from '/assets/practice-actions.js';
import {renderFeedbackContent,feedbackMathReady} from '/assets/feedback-content.js';
import {feedbackOutcome} from '/assets/feedback-model.js';
import {ExerciseRequestError,sessionRecovery} from '/assets/session-recovery.js';
import {createDraftStore,planDraftRestoration,sameEntries,validDraftAnswers} from '/assets/draft-answers.js';
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
const chooseButton=document.querySelector('#choose-exercise');
const nextStep=document.querySelector('#result-next-step');
const reviewButton = document.querySelector('#review-answers');
const hintPanel=document.querySelector('#practice-hint');
const hintButton=document.querySelector('#view-hint');
const hintContent=document.querySelector('#hint-content');
const hintMessage=document.querySelector('#hint-message');
const welcome = content.firstElementChild.cloneNode(true);

let exercises = [];
let selectedId;
let busy = false;
let catalogController;
let exerciseController;
let operation = 0;
let frameState;
let frameTimer;
let submission;
let interaction = 0;
let navigationPending=false, pendingHistory=false, restoringHistory=false, cancelledFocus;
let historyIndex=Number.isSafeInteger(history.state?.practiceStep)?history.state.practiceStep:0;
history.replaceState({...history.state,practiceStep:historyIndex},'',location.href);
let committedUrl=location.href;


const bookmarkButton=document.querySelector('#bookmark-exercise');
const bookmarkStatus=document.querySelector('#bookmark-status');
const breadcrumb=document.querySelector('#practice-breadcrumb');
function updatePracticeShell(){
 const exercise=exercises.find(entry=>entry.id===selectedId),active=Boolean(frameState?.session?.exerciseId===selectedId);
 panel.classList.toggle('has-session',active);
 bookmarkButton.hidden=!active;bookmarkButton.disabled=busy||Boolean(submission)||navigationPending||!frameState?.ready;
 breadcrumb.replaceChildren();
 const home=element('a','Mathematics');home.href='/';breadcrumb.append(home);
 if(exercise?.topic){breadcrumb.append(element('span',' / '),element('span',exercise.topic));}
 if(!active){bookmarkButton.setAttribute('aria-pressed','false');return;}
 try{bookmarkButton.setAttribute('aria-pressed',String(readBookmarks(localStorage).includes(selectedId)));}
 catch{bookmarkButton.setAttribute('aria-pressed','false');}
}
bookmarkButton.addEventListener('click',()=>{
 if(bookmarkButton.disabled||!frameState?.ready)return;
 try{
  const saved=toggleBookmark(selectedId,localStorage);bookmarkButton.setAttribute('aria-pressed',String(saved));
  bookmarkStatus.textContent=saved?'Bookmarked on this browser. Account syncing is not connected yet.':'Bookmark removed from this browser.';
 }catch{bookmarkStatus.textContent='Bookmarks could not be saved in this browser. Your exercise and answers have been kept.';}
});

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
  updatePracticeShell();
  const submitting = Boolean(submission);
  chooseButton.disabled=busy||submitting||navigationPending||!frameState?.ready;
  controls.hidden = !frameState?.ready;
  checkButton.disabled = busy || submitting || navigationPending || !frameState?.ready || Boolean(frameState?.recoveryRequired);
  reviewButton.disabled = busy || navigationPending || !frameState?.ready;
  hintPanel.hidden=!frameState?.ready||frameState.hint?.available!==true;
  hintButton.disabled=busy||submitting||navigationPending||!frameState?.ready;
  checkButton.setAttribute('aria-busy', String(submitting));
  checkLabel.textContent = submitting ? 'Checking…' : 'Check answer';
  checkButton.querySelector('.spinner').hidden = !submitting;
  panel.setAttribute('aria-busy', String(busy));
  for (const button of catalog.querySelectorAll('.exercise-choice')) button.disabled = busy || submitting || navigationPending;
  for (const button of frameState?.warning.querySelectorAll('button') ?? []) button.disabled = submitting;
}

function displayHint(hint){
 if(!frameState)return;
 const next=hint?.available===true&&typeof hint.message==='string'&&hint.message.trim()?hint:{available:false};
 const changed=frameState.hint?.message!==next.message;
 frameState.hint=next;
 if(changed||!next.available){hintContent.hidden=true;hintButton.textContent='View hint';hintButton.setAttribute('aria-expanded','false');hintMessage.replaceChildren();}
 updateControls();
}
hintButton.addEventListener('click',()=>{
 if(hintButton.disabled||frameState?.hint?.available!==true)return;
 const opening=hintContent.hidden;hintContent.hidden=!opening;
 hintButton.textContent=opening?'Hide hint':'View hint';hintButton.setAttribute('aria-expanded',String(opening));
 if(opening){void renderFeedbackContent(hintMessage,frameState.hint.message,feedbackMathReady);announce('Authored hint shown. Your answers have not been checked or changed.');}
 else{hintMessage.replaceChildren();announce('Hint hidden.');}
});

function displayResult(checked, entries) {
  resultPanel.hidden = !checked;
  if (!checked) return;
  const stale = Boolean(entries) && !matchesSubmittedAnswers(entries, checked.answers, checked.fieldNames);
  const changed = resultStale.hidden === stale;
  resultStale.hidden = !stale;
  resultTitle.setAttribute('aria-describedby', (checked.feedbackVisibility==='suppressed'?'':'result-score ')+'result-detail' + (stale ? ' result-stale' : ''));
  if (resultPanel.dataset.submissionId === checked.id) {
    if (changed && frameState?.ready && !submission) announce(stale
      ? 'You have unsubmitted changes. The displayed result is from your last check.'
      : 'Your current answers match the last checked submission.');
    return;
  }
  resultPanel.dataset.submissionId = checked.id;
  const model=feedbackOutcome(checked);
  resultPanel.dataset.outcome=model.outcome;
  resultTitle.textContent=model.title;
  resultScore.hidden=model.scoreText===null;
  resultScore.textContent=model.scoreText??'';
  resultDetail.textContent=model.detail;
  nextStep.textContent=nextActionText(checked);
  const messages=checked.feedbackVisibility==='suppressed'?[]:[...new Set([checked.feedback?.summary,checked.feedback?.message].filter(Boolean))];
  void renderFeedbackContent(resultMessage,messages.join('\n\n'),feedbackMathReady);
  resultMessage.hidden = !messages.length;
}

function setBusy(value) {
  busy = value;
  updateControls();
}

function selectCurrent() {
  for (const button of catalog.querySelectorAll('.exercise-choice')) {
    const active = button.dataset.exerciseId === selectedId;
    button.setAttribute('aria-current', String(active));
    button.querySelector('.choice-action').textContent = active ? 'New variation (starts a new session) →' : 'Start exercise →';
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
  try { data = await response.json(); } catch { throw new ExerciseRequestError('INVALID_RESPONSE',response.status,'The service returned an unexpected response. Please try again.'); }
  if (!response.ok) {
    const code=typeof data?.error?.code==='string'?data.error.code:response.status===404?'SESSION_NOT_FOUND':'HTTP_ERROR';
    throw new ExerciseRequestError(code,response.status,typeof data?.error?.message === 'string' ? data.error.message : 'The exercise service is unavailable. Please try again.');
  }
  return data;
}

function chooseExercise() {
  const target=catalog.querySelector('.exercise-choice:not([aria-current=true]):not(:disabled)')??catalog.querySelector('.exercise-choice:not(:disabled)')??document.querySelector('#catalog-title');
  if(!target.hasAttribute('tabindex')&&target.tagName!=='BUTTON')target.tabIndex=-1;
  target.focus();target.scrollIntoView({block:'nearest'});
  if(frameState)announce('Choose an exercise from the list. Your current exercise stays open until you select one.');
}
function recoveryBox(error,request) {
  const recovery=sessionRecovery(error);
  const box=stateMessage(recovery.title,recovery.message,recovery.retry?()=>openExercise(request):undefined);
  if(recovery.retry&&!request.sessionId)box.append(element('p','Trying again starts a new session for the selected exercise.'));
  box.append(action('Choose another exercise',chooseExercise));
  box.dataset.recovery=recovery.code??'SERVICE_ERROR';
  return box;
}
function showSubmissionRecovery(state,error,{restoring=false}={}) {
  const recovery=error instanceof AnswerBridgeError?{terminal:false,reconcile:false}:sessionRecovery(error,{phase:restoring?'load':'grade'});
  const detail=error instanceof AnswerBridgeError?'We couldn’t read the answer fields. Please try again.':recovery.message;
  submissionError.textContent=detail+' Your inputs are still here.';
  state.recoveryRequired=restoring||recovery.terminal||recovery.reconcile;
  if(recovery.terminal)submissionError.append(action('Choose another exercise',chooseExercise));
  else if(restoring||recovery.reconcile)submissionError.append(action('Reload saved session',()=>void reloadSavedSession(state)));
  submissionError.hidden=false;
  return state.recoveryRequired?submissionError.querySelector('button'):checkButton;
}
async function reloadSavedSession(state) {
  if(frameState!==state||state.recoveryController)return;
  const controller=new AbortController(),focusAt=interaction;state.recoveryController=controller;
  const button=submissionError.querySelector('button');if(button)button.disabled=true;
  try{
    const data=await request('/api/sessions/'+encodeURIComponent(state.sessionId),{},controller.signal);
    if(frameState!==state)return;
    if(data?.session?.id!==state.sessionId||data.session.exerciseId!==state.session.exerciseId)throw new ExerciseRequestError('INVALID_RESPONSE',200,'The saved session response could not be verified.');
    const answers=await state.answerBridge.collect();if(frameState!==state)return;
    if(!validDraftAnswers(answers)||JSON.stringify(answers).length>500000)throw new ExerciseRequestError('DRAFT_TOO_LARGE',0,'Unfinished answers are too large to restore safely. Keep this page open and shorten or copy them before reloading.');
    const recoveryDraft={version:1,sessionId:state.sessionId,exerciseId:state.session.exerciseId,baseSubmissionId:state.lastSubmission?.id??null,baseSubmissionNumber:state.lastSubmission?.number??0,answers,pending:state.pendingDraft??null};
    displaySession(data,{focusAt,recoveryDraft});
  }catch(error){
    if(controller.signal.aborted||frameState!==state)return;
    const next=showSubmissionRecovery(state,error,{restoring:true});updateControls();
    if(focusAt===interaction)next?.focus();
  }finally{if(frameState===state)state.recoveryController=undefined;}
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
      button.disabled = busy || Boolean(submission) || navigationPending;
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
    state.draftStorageFailed=false;return true;
  }catch{
    state.draftStorageFailed=true;
    draftNotice('Draft could not be saved in this tab. Keep this page open to avoid losing unfinished answers.');
    return false;
  }
}
async function initializeDraft(state) {
  const initial=await state.answerBridge.collect();
  if(frameState!==state)return;
  state.initialAnswers=initial;
  let restored;
  try{
    const record=state.recoveryDraft??draftStore.read(state.session);
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
  hintPanel.hidden=true;hintContent.hidden=true;hintMessage.replaceChildren();hintButton.textContent='View hint';hintButton.setAttribute('aria-expanded','false');
  resultPanel.hidden = true;
  delete resultPanel.dataset.submissionId;
  resultStale.hidden = true;
  submissionError.textContent = '';
  submissionError.hidden = true;
  clearTimeout(frameTimer);
  if (frameState) {
    frameState.recoveryController?.abort();
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
        ? 'Exercise restored. Last result: ' + [resultTitle.textContent,resultScore.textContent].filter(Boolean).join('. ')+'.'
        : 'Exercise ready. Press Tab to reach the answer fields.');
  }
}

function displaySession(data, { focusAt = interaction, recoveryDraft } = {}) {
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
  frameState = { frame, channel, progress, warning, answerBridge, recoveryDraft, session: data.session, sessionId: data.session.id, lastSubmission: data.submission ?? null, focusAt };
  displayHint(data.exercise.hint);
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

async function loadExercise({ exerciseId, sessionId }) {
  exerciseController?.abort();
  const controller = new AbortController();
  exerciseController = controller;
  const current = ++operation;
  clearFrame();
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
    if (current !== operation || pendingHistory) return;
    if(sessionId&&data?.session?.id!==sessionId||exerciseId&&data?.session?.exerciseId!==exerciseId)throw new ExerciseRequestError('INVALID_RESPONSE',200,'The saved session response could not be verified. Please try again.');
    displaySession(data, { focusAt });
    if (!sessionId) {
      const url = new URL(location.href);
      url.searchParams.set('session', data.session.id);
      historyIndex++;
      history.pushState({practiceStep:historyIndex}, '', url);
      committedUrl=url.href;
    }
  } catch (error) {
    if (controller.signal.aborted || current !== operation) return;
    clearFrame();
    setBusy(false);
    title.textContent = 'Your saved practice';
    topic.textContent = 'YOUR PRACTICE';
    const box = recoveryBox(error,{exerciseId,sessionId});
    box.setAttribute('role', 'alert');
    content.replaceChildren(box);
    announce('');
    const errorHeading = box.querySelector('h3');
    errorHeading.tabIndex = -1;
    if (focusAt === interaction) errorHeading.focus();
  }
}

function pendingWork(state,answers=state?.answerBridge.getSnapshot()){
 return Boolean(state)&&unfinishedAnswers(answers,state.lastSubmission?.answers??state.initialAnswers?.entries,{pending:Boolean(submission||state.pendingDraft),unknown:!state.draftReady&&Boolean(answers)});
}
function restoreCancelledFocus(){
 const saved=cancelledFocus;cancelledFocus=undefined;
 if(saved&&saved.frame===frameState&&saved.at===interaction&&saved.node?.isConnected&&!saved.node.disabled)saved.node.focus();
}
function restoreHistory(){
 const target=history.state?.practiceStep;
 if(Number.isSafeInteger(target)&&target!==historyIndex){restoringHistory=true;history.go(historyIndex-target);}
 else history.replaceState({practiceStep:historyIndex},'',committedUrl);
}
/** Read/persist fresh controls before a destructive transition; consent never submits answers. */
async function navigate(action,{fromHistory=false}={}){
 if(navigationPending)return;
 const returnFocus=document.activeElement,focusAt=interaction;
 navigationPending=true;updateControls();
 const state=frameState;let allowed=true;
 try{
  if(state){
   let answers,saved=false,unknown=false;const wasChecking=Boolean(submission||state.pendingDraft);
   try{answers=await state.answerBridge.collect();if(frameState!==state){if(fromHistory||pendingHistory){restoreHistory();pendingHistory=false;}return;}saved=persistDraft(state,answers)===true;}
   catch{unknown=true;}
   if(unknown||unfinishedAnswers(answers,state.lastSubmission?.answers??state.initialAnswers?.entries,{pending:wasChecking||Boolean(state.pendingDraft),unknown:!state.draftReady})){
    const message=unknown?'Your current answers could not be read. Leaving may lose them. Stay to copy your work if needed.':wasChecking||state.pendingDraft?'Your last check has not been confirmed. Leaving does not cancel that check and may leave unfinished work.':saved?'Your unchecked work is saved in this tab for this session. Keep this tab open and use Back to return.':'Your unchecked work could not be saved. Leaving may lose it.';
    allowed=window.confirm('Leave this exercise?\n\n'+message+'\n\nChoose Cancel to keep working, or OK to leave without checking again.');
   }
  }
  if(!allowed){cancelledFocus={node:returnFocus,at:focusAt,frame:state};if(fromHistory||pendingHistory)restoreHistory();pendingHistory=false;return;}
  if(fromHistory||pendingHistory){do{pendingHistory=false;await followUrl();}while(pendingHistory);}
  else{await action();while(pendingHistory){pendingHistory=false;await followUrl();}}
 }finally{if(!restoringHistory){navigationPending=false;updateControls();restoreCancelledFocus();}}
}
function openExercise(target){return navigate(()=>loadExercise(target));}
function startExercise(exerciseId) {
  if (!busy && !submission && !navigationPending) void openExercise({ exerciseId });
}

/** Check one fresh snapshot. Keep the live frame intact on both success and failure. */
async function submitCurrentAnswers() {
  if (busy || submission || navigationPending || !frameState?.ready || frameState.recoveryRequired) return;
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
      throw new ExerciseRequestError('UNCONFIRMED_SUBMISSION',200,'The checking response could not be confirmed.');
    }
    current.lastSubmission = data.submission;
    displayHint(data.exercise.hint);
    current.pendingDraft=null;
    persistDraft(current,current.answerBridge.getSnapshot()??snapshot.answers);
    current.answerBridge.showFeedback(data.submission.fieldFeedback ?? [], data.submission.answers);
    displayResult(data.submission, current.answerBridge.getSnapshot()?.entries);
    submissionStatus.textContent = 'Submitted answers checked and saved.';
    announce([resultTitle.textContent,resultScore.textContent,resultDetail.textContent].filter(Boolean).join('. ') +
      (resultStale.hidden ? '' : ' You have unsubmitted changes.'));
    nextFocus = resultTitle;
  } catch (error) {
    if (attempt.controller.signal.aborted || submission !== attempt || frameState !== current) return;
    submissionStatus.textContent = '';
    nextFocus=showSubmissionRecovery(current,error);
    announce('');
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

async function followUrl() {
  historyIndex=Number.isSafeInteger(history.state?.practiceStep)?history.state.practiceStep:historyIndex;
  committedUrl=location.href;
  const sessionId = new URL(location.href).searchParams.get('session');
  if (sessionId) await loadExercise({ sessionId });
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
window.addEventListener('popstate',()=>{
 if(restoringHistory){restoringHistory=false;navigationPending=false;updateControls();restoreCancelledFocus();return;}
 if(new URL(location.href).searchParams.get('session')===new URL(committedUrl).searchParams.get('session')&&!navigationPending){committedUrl=location.href;return;}
 pendingHistory=true;if(!navigationPending)void navigate(()=>followUrl(),{fromHistory:true});
});
window.addEventListener('beforeunload',event=>{if(pendingWork(frameState)||navigationPending){event.preventDefault();event.returnValue='';}});
chooseButton.addEventListener('click',chooseExercise);
document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();panel.focus();panel.scrollIntoView({block:'start'});});
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