import { renderFieldFeedback, matchesSubmittedAnswers } from './field-feedback.js';
import { collectAnswerFields, isAnswerFieldName } from './answer-fields.js';

function escapeAttribute(value) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
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
body{margin:0;padding:18px 4px 24px;font:15px/1.85 system-ui,sans-serif;color:#243e34;overflow-wrap:break-word}
input:not([type=hidden]),textarea,select{max-width:100%;box-sizing:border-box;font:inherit;border:1px solid #b8cebd;border-radius:7px;padding:8px 11px;background:#fafcf8;color:#203b32;margin:6px 0}
input:focus,textarea:focus{outline:3px solid #d9b96a;outline-offset:2px}
mjx-container{max-width:100%;overflow-x:auto;overflow-y:hidden}p{margin-top:0}a{color:#087b69}
.field-feedback{display:block;max-width:100%;margin:4px 0 14px;padding:10px 12px;border-left:3px solid #6b7b70;border-radius:4px;background:#f3f5f1;font-size:13px;line-height:1.55}.field-feedback strong{display:block;font-weight:700}.field-feedback span{display:block;margin-top:3px}.field-feedback[data-status=correct]{border-color:#087b69;background:#edf7f0;color:#155c49}.field-feedback[data-status=incorrect]{border-color:#b34848;background:#fff1ef;color:#853b35}.field-feedback[data-status=invalid],.field-feedback[data-status=partial]{border-color:#ae7a22;background:#fff7e7;color:#775a26}.field-feedback[data-status=changed]{border-color:#80918a;color:#596c61}input[aria-invalid=true],textarea[aria-invalid=true],select[aria-invalid=true]{border-color:#ae7a22}
</style>
<script>
const channel=${JSON.stringify(channel)};
const parentOrigin=${JSON.stringify(scriptUrl.origin)};
const isAnswerFieldName=${isAnswerFieldName.toString()};
const collectAnswerFields=${collectAnswerFields.toString()};
const matchesSubmittedAnswers=${matchesSubmittedAnswers.toString()};
const renderFieldFeedback=${renderFieldFeedback.toString()};
let feedbackFields=[];
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
  });
  new ResizeObserver(resize).observe(document.body);
  resize();
});
function mathLoaded(){
  if(!window.MathJax?.startup?.promise){notify('math-error');return;}
  MathJax.startup.promise.then(()=>notify('ready')).catch(()=>notify('math-error'));
}
</script></head><body>${html}
<script src="${escapedUrl}" onload="mathLoaded()" onerror="notify('math-error')"></script>
</body></html>`;
}