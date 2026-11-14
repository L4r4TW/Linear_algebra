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
</style>
<script>
const channel=${JSON.stringify(channel)};
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