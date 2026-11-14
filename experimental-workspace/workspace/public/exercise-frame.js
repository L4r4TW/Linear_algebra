import { renderFieldFeedback, matchesSubmittedAnswers } from './field-feedback.js';
import { collectAnswerFields, isAnswerFieldName } from './answer-fields.js';

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

/** Render only the trusted API problem fragment in an opaque, sandboxed frame. */
export function buildExerciseDocument({ html, channel, mathjaxUrl }) {
  const scriptUrl = new URL(mathjaxUrl);
  if (!['http:', 'https:'].includes(scriptUrl.protocol)) throw new Error('Invalid math asset URL.');
  const escapedUrl = escapeAttribute(scriptUrl.href);
  const csp = "default-src 'none'; script-src 'unsafe-inline' " + scriptUrl.origin +
    "; style-src 'unsafe-inline'; img-src data: " + scriptUrl.origin +
    "; connect-src 'none'; form-action 'none'; base-uri 'none';";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
<style>
body{margin:0;padding:18px 8px 24px;font:16px/1.8 system-ui,sans-serif;color:#243e34;overflow-wrap:break-word}
input:not([type=hidden]),textarea,select{max-width:100%;box-sizing:border-box;font:inherit;border:1px solid #b8cebd;border-radius:7px;padding:8px 11px;background:#fafcf8;color:#203b32;margin:6px 0}
input:focus-visible,textarea:focus-visible,select:focus-visible,button:focus-visible,a:focus-visible,[tabindex="0"]:focus-visible{outline:3px solid #075e50;outline-offset:3px}
mjx-container{max-width:100%;overflow-x:auto;overflow-y:hidden}p{margin-top:0}a{color:#087b69}
.field-feedback{display:block;max-width:100%;margin:4px 0 14px;padding:10px 12px;border-left:3px solid #6b7b70;border-radius:4px;background:#f3f5f1;font-size:13px;line-height:1.55}.field-feedback strong{display:block;font-weight:700}.field-feedback span{display:block;margin-top:3px}.field-feedback[data-status=correct]{border-color:#087b69;background:#edf7f0;color:#155c49}.field-feedback[data-status=incorrect]{border-color:#b34848;background:#fff1ef;color:#853b35}.field-feedback[data-status=invalid],.field-feedback[data-status=partial]{border-color:#ae7a22;background:#fff7e7;color:#775a26}.field-feedback[data-status=changed]{border-color:#80918a;color:#596c61}input[aria-invalid=true],textarea[aria-invalid=true],select[aria-invalid=true]{border-color:#ae7a22}
input:not([type=hidden]):not([type=radio]):not([type=checkbox]),select{min-height:48px;font-size:16px}textarea{min-height:108px;font-size:16px}input[type=radio],input[type=checkbox]{min-width:24px;min-height:24px;margin:10px 6px;accent-color:#087b69;padding:0}label:has(input[type=radio]),label:has(input[type=checkbox]){display:inline-flex;align-items:center;min-height:44px;gap:6px}input,textarea,select,[tabindex="0"]{scroll-margin:24px}mjx-container[tabindex="0"]{border-radius:4px}
@media(forced-colors:active){input,textarea,select,.field-feedback{border:1px solid CanvasText}input:focus-visible,textarea:focus-visible,select:focus-visible,button:focus-visible,a:focus-visible,[tabindex="0"]:focus-visible{outline-color:Highlight}}
.sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
input:focus,textarea:focus,select:focus,button:focus,a:focus{outline:3px solid #075e50;outline-offset:3px}
@media(forced-colors:active){input:focus,textarea:focus,select:focus,button:focus,a:focus{outline-color:Highlight}}
</style>
<script>
const channel=${JSON.stringify(channel)};
const parentOrigin=${JSON.stringify(scriptUrl.origin)};
const isAnswerFieldName=${isAnswerFieldName.toString()};
const collectAnswerFields=${collectAnswerFields.toString()};
const matchesSubmittedAnswers=${matchesSubmittedAnswers.toString()};
const renderFieldFeedback=${renderFieldFeedback.toString()};
const shouldSubmitOnEnter=${shouldSubmitOnEnter.toString()};
let feedbackFields=[];
let composing=false;
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
  }else if(event.data.type==='show-feedback'&&Array.isArray(event.data.fields)&&Array.isArray(event.data.entries)){
    feedbackFields=event.data.fields;
    submittedEntries=event.data.entries;
    applyFeedback();
    resize();
  }else if(event.data.type==='focus-answer'&&typeof event.data.name==='string'){
    const root=document.getElementById('problem_body');
    const fields=[...root.querySelectorAll('input,textarea,select')].filter(field=>
      field.name===event.data.name&&field.type!=='hidden'&&!field.disabled);
    const field=fields.find(field=>field.checked)||fields[0];
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
  applyFeedback();
  for(const type of ['focusin','pointerdown','keydown','input','change','wheel','touchstart'])document.addEventListener(type,()=>{
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
function mathLoaded(){
  if(!window.MathJax?.startup?.promise){notify('math-error');return;}
  MathJax.startup.promise.then(()=>{
    function mathScrollTargets(){
      document.querySelectorAll('mjx-container').forEach(node=>{
        if(node.scrollWidth>node.clientWidth+1){node.tabIndex=0;node.setAttribute('role','group');node.setAttribute('aria-label','Mathematical expression; scroll horizontally to read more.');}
        else{node.removeAttribute('tabindex');node.removeAttribute('aria-label');node.removeAttribute('role');}
      });
    }
    mathScrollTargets();
    window.addEventListener('resize',mathScrollTargets);
    notify('ready');
  }).catch(()=>notify('math-error'));
}
</script></head><body><p id="practice-keyboard-help" class="sr-only">Press Enter to check a single-line answer. Use Tab or Shift+Tab to move between answers and controls.</p>${html}
<script src="${escapedUrl}" onload="mathLoaded()" onerror="notify('math-error')"></script>
</body></html>`;
}