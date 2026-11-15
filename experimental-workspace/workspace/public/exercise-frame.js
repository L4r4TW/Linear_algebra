import { renderFieldFeedback, matchesSubmittedAnswers } from './field-feedback.js';
import { collectAnswerFields, restoreAnswerFields, isAnswerFieldName } from './answer-fields.js';
import { graphAnswerControl, answerPresentation, installGraphAnswerAdapters } from './widget-answers.js';

function escapeAttribute(value) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

/** Submit only ordinary single-line answer inputs, preserving widget and IME keys. */
export function shouldSubmitOnEnter(event, root) {
  const field = event.target;
  return event.key === 'Enter' && !event.defaultPrevented && !event.repeat &&
    !event.isComposing && event.keyCode !== 229 && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey &&
    field?.tagName === 'INPUT' && root?.contains(field) && !field.disabled && !field.readOnly &&
    ['text', 'number', 'search', 'email', 'tel', 'url'].includes(field.type) && isAnswerFieldName(field.name) &&
    !field.hasAttribute('list') && field.getAttribute('aria-expanded') !== 'true' &&
    !field.closest('[role="combobox"],[role="listbox"],[role="grid"],[contenteditable="true"],[data-enter-submit="off"]');
}

/** Opt in reviewed prose/native answers; never reset table/editor/graph geometry. */
export function markPracticeControls(root) {
  if(!root)return;
  const protectedSelector='.graphtool-outer-container,.jxgbox,.mq-editable-field,.mq-math-mode,[contenteditable="true"],[role="grid"],[data-practice-preserve-style]';
  for(const paragraph of root.querySelectorAll(':scope > p,:scope > .PGML > p')){
    if(!paragraph.classList.length&&!paragraph.hasAttribute('style')&&!paragraph.closest(protectedSelector)&&!paragraph.querySelector(protectedSelector+',table,svg,canvas,img,iframe'))paragraph.classList.add('practice-prose');
  }
  for(const field of root.querySelectorAll('input,textarea,select')){
    field.classList.remove('practice-answer','practice-focus');
    if(!isAnswerFieldName(field.name)||field.matches(':disabled')||field.closest(protectedSelector))continue;
    if(field.tagName==='INPUT'&&!['text','number','search','email','tel','url','radio','checkbox'].includes(field.type))continue;
    field.classList.add('practice-focus');
    if(field.closest('table')||field.hasAttribute('style'))continue;
    field.classList.add('practice-answer');
    if(['radio','checkbox'].includes(field.type)){
      for(const label of field.labels??[])if(root.contains(label)&&label.querySelectorAll('input,textarea,select').length===1&&!label.closest(protectedSelector))label.classList.add('practice-choice-label');
    }
  }
}
/** Render only the trusted API problem fragment in an opaque, sandboxed frame. */
export function buildExerciseDocument({ html, channel, mathjaxUrl, dependencies = [] }) {
  const scriptUrl = new URL(mathjaxUrl);
  if (!['http:', 'https:'].includes(scriptUrl.protocol)) throw new Error('Invalid math asset URL.');
  const dependencyHtml = dependencies.map(dependency => {
    if (!['script','style'].includes(dependency.kind) || !/^\/assets\/exercise\/[A-Za-z0-9_-]{43}\/\d+$/.test(dependency.url)) throw new Error('Invalid exercise dependency.');
    const url = escapeAttribute(new URL(dependency.url,scriptUrl.origin).href);
    return dependency.kind === 'style'
      ? `<link rel="stylesheet" href="${url}" onerror="resourceFailed()">`
      : `<script src="${url}"${dependency.defer ? ' defer' : ''} onerror="resourceFailed()"></script>`;
  }).join('\n');
  const stylesheetUrl=escapeAttribute(new URL('/assets/exercise.css',scriptUrl.origin).href);
  const escapedUrl = escapeAttribute(scriptUrl.href);
  const csp = "default-src 'none'; script-src 'unsafe-inline' " + scriptUrl.origin +
    "; style-src 'unsafe-inline' " + scriptUrl.origin + "; img-src data: " + scriptUrl.origin +
    "; connect-src 'none'; form-action 'none'; base-uri 'none';";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
<script>
// GraphTool stores only its help preference. Opaque frames get an ephemeral,
// key-scoped adapter; no access to application storage or persistent cookies.
try { void window.localStorage; } catch {
  let graphHelp=null;
  Object.defineProperty(window,'localStorage',{value:Object.freeze({
    getItem:key=>key==='GraphToolHelpEnabled'?graphHelp:null,
    setItem:(key,value)=>{if(key==='GraphToolHelpEnabled')graphHelp=String(value)==='false'?'false':'true';},
    removeItem:key=>{if(key==='GraphToolHelpEnabled')graphHelp=null;},
    clear:()=>{graphHelp=null;},
    key:index=>index===0&&graphHelp!==null?'GraphToolHelpEnabled':null,
    get length(){return graphHelp===null?0:1;}
  })});
}
let resourceFailure=false;
function resourceFailed(){resourceFailure=true;parent.postMessage({channel:${JSON.stringify(channel)},type:'resource-error'},${JSON.stringify(scriptUrl.origin)});}
window.addEventListener('error',event=>{if(event.error||event.target?.tagName==='IMG')resourceFailed();},true);
</script>
${dependencyHtml}
<link rel="stylesheet" data-practice-exercise-style href="${stylesheetUrl}" onerror="resourceFailed()">
<script>
const channel=${JSON.stringify(channel)};
const parentOrigin=${JSON.stringify(scriptUrl.origin)};
const isAnswerFieldName=${isAnswerFieldName.toString()};
const collectAnswerFields=${collectAnswerFields.toString()};
const restoreAnswerFields=${restoreAnswerFields.toString()};
const matchesSubmittedAnswers=${matchesSubmittedAnswers.toString()};
const graphAnswerControl=${graphAnswerControl.toString()};
const answerPresentation=${answerPresentation.toString()};
const installGraphAnswerAdapters=${installGraphAnswerAdapters.toString()};
const renderFieldFeedback=${renderFieldFeedback.toString()};
const shouldSubmitOnEnter=${shouldSubmitOnEnter.toString()};
const markPracticeControls=${markPracticeControls.toString()};
let feedbackFields=[];
let composing=false;
let restoringDraft=false;
let submittedEntries=[];
function applyFeedback(){renderFieldFeedback(document.getElementById('problem_body'),feedbackFields,submittedEntries);}
let answerRevision=0;
let changeQueued=false;
function answerMessage(type,requestId){
  try{
    const answers=collectAnswerFields(document.getElementById('problem_body'));
    parent.postMessage({channel,type,requestId,revision:answerRevision++,...answers},parentOrigin);
  }catch{
    if(requestId)parent.postMessage({channel,type:'answer-collection-error',requestId},parentOrigin);
  }
}
window.addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==parentOrigin||event.data?.channel!==channel)return;
  if(event.data.type==='collect-answers'&&typeof event.data.requestId==='string'){
    applyFeedback();
    answerMessage('answers',event.data.requestId);
  }else if(event.data.type==='restore-draft'&&typeof event.data.requestId==='string'){
    restoringDraft=true;
    try{restoreAnswerFields(document.getElementById('problem_body'),event.data.snapshot);applyFeedback();answerMessage('answers-restored',event.data.requestId);resize();}
    catch{parent.postMessage({channel,type:'answer-restore-error',requestId:event.data.requestId},parentOrigin);}
    finally{restoringDraft=false;}
  }else if(event.data.type==='show-feedback'&&Array.isArray(event.data.fields)&&Array.isArray(event.data.entries)){
    feedbackFields=event.data.fields;
    submittedEntries=event.data.entries;
    applyFeedback();
    resize();
  }else if(event.data.type==='focus-answer'&&typeof event.data.name==='string'){
    const root=document.getElementById('problem_body');
    const field=answerPresentation(root,event.data.name)?.focus;

    if(field){field.focus();field.scrollIntoView({block:'center',inline:'nearest'});}
  }
});
function answersChanged(){
  if(changeQueued)return;
  changeQueued=true;
  queueMicrotask(()=>{changeQueued=false;applyFeedback();answerMessage('answers-changed');});
}
window.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.ww-feedback-btn').forEach(node=>node.remove());
  document.querySelectorAll('input,textarea,select').forEach(node=>node.classList.remove('correct','incorrect','partially-correct'));
  markPracticeControls(document.getElementById('problem_body'));
  const dispose=installGraphAnswerAdapters(document.getElementById('problem_body'),answersChanged);
  window.addEventListener('pagehide',dispose,{once:true});
  applyFeedback();
  for(const type of ['focusin','pointerdown','keydown','input','change','wheel','touchstart'])document.addEventListener(type,()=>{
    if(restoringDraft)return;
    parent.postMessage({channel,type:'exercise-interaction'},parentOrigin);
  },{capture:true,passive:true});
  document.addEventListener('compositionstart',()=>{composing=true;});
  document.addEventListener('compositionend',()=>{composing=false;});
  document.addEventListener('keydown',event=>{
    if(composing||!shouldSubmitOnEnter(event,document.getElementById('problem_body')))return;
    event.preventDefault();
    parent.postMessage({channel,type:'submit-answers'},parentOrigin);
  });
  document.addEventListener('input',answersChanged);
  document.addEventListener('change',answersChanged);
  answerMessage('answers-changed');
});
function notify(type){parent.postMessage({channel,type,height:Math.ceil(document.body.scrollHeight)},'*');}
function resize(){notify('resize');}
window.MathJax={
tex:${JSON.stringify({ inlineMath: [[String.fromCharCode(92)+'(',String.fromCharCode(92)+')']], displayMath: [[String.fromCharCode(92)+'[',String.fromCharCode(92)+']']] })},
svg:{fontCache:'local'},options:{enableMenu:false},
startup:{ready(){
  // PG emits legacy script[type="math/tex"] markers. Convert them before typesetting.
  document.querySelectorAll('script[type^="math/tex"]').forEach(node=>{
    const display=node.type.includes('display');
    const span=document.createElement(display?'div':'span');
    const slash=String.fromCharCode(92);
    span.textContent=slash+(display?'[':'(')+node.textContent+slash+(display?']':')');
    node.replaceWith(span);
  });
  MathJax.startup.defaultReady();
}}
};
window.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('input:not([type=hidden]),textarea,select').forEach((field,index)=>{
    if(!field.hasAttribute('aria-label')&&!field.labels?.length)field.setAttribute('aria-label','Answer '+(index+1));
    field.setAttribute('autocomplete','off');
    if(shouldSubmitOnEnter({key:'Enter',target:field},document.getElementById('problem_body'))){
      field.setAttribute('aria-keyshortcuts','Enter');
      field.setAttribute('enterkeyhint','send');
      const previous=field.getAttribute('aria-describedby');
      field.setAttribute('aria-describedby',(previous?previous+' ':'')+'practice-keyboard-help');
    }
  });
  new ResizeObserver(resize).observe(document.body);
  resize();
});
function mathFailed(){
  const report=()=>notify(resourceFailure?'resource-error':'math-error');
  if(document.readyState==='complete')report();else window.addEventListener('load',report,{once:true});
}
function mathLoaded(){
  if(!window.MathJax?.startup?.promise){mathFailed();return;}
  MathJax.startup.promise.then(()=>{
    function mathScrollTargets(){
      document.querySelectorAll('mjx-container').forEach(node=>{
        if(node.closest('.graphtool-outer-container,.jxgbox,.mq-editable-field,.mq-math-mode,[data-practice-preserve-style]'))return;
        node.classList.add('practice-math');
        if(node.scrollWidth>node.clientWidth+1){node.tabIndex=0;node.setAttribute('role','group');node.setAttribute('aria-label','Mathematical expression; scroll horizontally to read more.');}
        else{node.removeAttribute('tabindex');node.removeAttribute('aria-label');node.removeAttribute('role');}
      });
    }
    mathScrollTargets();
    window.addEventListener('resize',mathScrollTargets);
    const ready=()=>{if(!resourceFailure)notify('ready');};
    if(document.readyState==='complete')ready();else window.addEventListener('load',ready,{once:true});
  }).catch(()=>mathFailed());
}
</script></head><body data-practice-frame><p id="practice-keyboard-help" class="practice-sr-only">Press Enter to check a single-line answer. Use Tab or Shift+Tab to move between answers and controls.</p>${html}
<script src="${escapedUrl}" onload="mathLoaded()" onerror="mathFailed()"></script>
</body></html>`;
}