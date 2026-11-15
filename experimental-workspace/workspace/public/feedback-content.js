/** Small TeX vocabulary: no macros, URLs, HTML, styles, extensions or definitions. */
export function reviewedFeedbackTex(tex) {
  if(typeof tex!=='string'||!tex.trim()||tex.length>2048||tex.includes('^^')||/[%$#\u0000-\u001f]/.test(tex))return false;
  const allowed=new Set(('frac dfrac tfrac sqrt vec overline underline hat bar dot ddot left right langle rangle lvert rvert lVert rVert cdot times div pm mp le leq ge geq ne neq approx equiv in notin subset subseteq supset supseteq cup cap emptyset infinity infty partial nabla sum prod int iint lim sin cos tan sec csc cot sinh cosh tanh log ln exp min max det pi theta alpha beta gamma delta epsilon lambda mu sigma phi omega Gamma Delta Sigma Phi Omega mathbb mathrm mathit mathbf mathcal text operatorname quad qquad , ; : ! { } | space').split(' '));
  let depth=0,commands=0;
  for(let i=0;i<tex.length;i++){
    if(tex[i]==='\\'){
      const match=tex.slice(i+1).match(/^[A-Za-z]+|^./);
      if(!match||!allowed.has(match[0])||++commands>128)return false;
      i+=match[0].length;
    }else if(tex[i]==='{'){if(++depth>24)return false;}
    else if(tex[i]==='}'&&--depth<0)return false;
  }
  return depth===0;
}
/** Only explicit PG/MathJax delimiters; currency and arbitrary text are never auto-typeset. */
export function feedbackParts(message) {
  if(typeof message!=='string')return [];
  if(message.length>16_000)return [{type:'text',value:message.slice(0,16_000)+'\n[Message shortened]'}];
  const parts=[],pattern=/\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;
  let start=0,match,count=0;
  while((match=pattern.exec(message))&&count++<32){
    if(match.index>start)parts.push({type:'text',value:message.slice(start,match.index)});
    const tex=match[1]??match[2];
    parts.push(reviewedFeedbackTex(tex)?{type:'math',value:tex,display:match[2]!==undefined,fallback:match[0]}:{type:'text',value:match[0]});
    start=pattern.lastIndex;
  }
  if(start<message.length)parts.push({type:'text',value:message.slice(start)});
  return parts;
}
/** DOM text plus MathJax-generated SVG only. Detached/replaced results reject late renders. */
export function renderFeedbackContent(target,message,mathReady) {
  target.classList.add('mathjax_ignore');
  target.replaceChildren();
  const pending=[];
  for(const part of feedbackParts(message)){
    if(part.type==='text'){const text=target.ownerDocument.createElement('span');text.className='mathjax_ignore';text.textContent=part.value;target.append(text);continue;}
    const node=target.ownerDocument.createElement(part.display?'div':'span');
    node.className='feedback-math mathjax_ignore';node.dataset.mathState='pending';node.textContent=part.fallback;
    target.append(node);
    pending.push(Promise.resolve().then(()=>mathReady()).then(async math=>{
      if(node.parentNode!==target||!target.isConnected)return;
      const result=await math.tex2svgPromise(part.value,{display:part.display});
      if(node.parentNode!==target||!target.isConnected)return;
      if(result.querySelector('[data-mjx-error]'))throw new Error('Math formatting unavailable');
      node.replaceChildren(result);node.dataset.mathState='rendered';
      if(node.scrollWidth>node.clientWidth+1){node.tabIndex=0;node.setAttribute('role','group');node.setAttribute('aria-label','Feedback mathematics; scroll horizontally to read more.');}
    }).catch(()=>{if(node.parentNode===target){node.dataset.mathState='fallback';node.title='Math formatting unavailable; original notation shown.';}}));
  }
  return Promise.all(pending);
}
let feedbackMathPromise;
/** Fixed pinned dependency loaded only for reviewed overall-result notation. */
export function feedbackMathReady() {
  if(!feedbackMathPromise)feedbackMathPromise=new Promise((resolve,reject)=>{
    window.MathJax={tex:{packages:['base','ams']},svg:{fontCache:'local'},options:{enableMenu:false},startup:{typeset:false}};
    const script=document.createElement('script');script.src='/assets/mathjax/tex-svg.js';
    const timer=setTimeout(()=>reject(new Error('Math formatting timed out')),10000);
    script.onload=()=>{clearTimeout(timer);if(window.MathJax?.startup?.promise)window.MathJax.startup.promise.then(()=>resolve(window.MathJax),reject);else reject(new Error('Math formatting unavailable'));};
    script.onerror=()=>{clearTimeout(timer);reject(new Error('Math formatting unavailable'));};
    document.head.append(script);
  });
  return feedbackMathPromise;
}