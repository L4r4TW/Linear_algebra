import {savePlan} from './practice-plan-store.js';import {loadStudyProgress,progressElements} from './study-progress.js';
const $=id=>document.getElementById(id),url=new URL(location.href);let learningTask=Promise.resolve(),data,starting=false,chapterNodes=new Map(),progress;
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
async function api(path,options={}){const r=await fetch(path,{...options,headers:{Accept:'application/json',...options.headers}}),v=await r.json();if(!r.ok)throw Error(v.error?.message??'The request could not be completed. Your saved work is retained.');return v;}
async function learning(){
 $('retry-progress').hidden=true;$('progress-error').hidden=true;
 try{progress=await loadStudyProgress({onLoading:()=>{$('subject-progress').textContent='Loading progress…';}});$('learning-scope').textContent=progress.scope==='account'?'Progress saved to your account.':'Progress saved in this browser. Sign in and transfer your work for cross-device continuation.';
 const subject=progress.collections.find(c=>c.id===data.collectionId);
 if(!subject){$('subject-progress').textContent='Completion tracking is available in the four study collections.';for(const n of chapterNodes.values())n.progress.textContent='Outside the study-goal tracker.';return;}
 progressElements($('subject-progress'),subject,data.subject);
 for(const c of subject.chapters){const value=chapterNodes.get(c.id);if(value){progressElements(value.progress,c,c.title);value.card.dataset.complete=String(c.percent===100);}}
 }catch(error){$('subject-progress').textContent='Progress unavailable';$('progress-error').textContent=error.message;$('progress-error').hidden=false;$('retry-progress').hidden=false;for(const n of chapterNodes.values())n.progress.textContent='Progress unavailable';}
}
function render(value){
 data=value;document.title=value.subject+' · MathPractice';$('subject-title').textContent=value.subject;$('subject-description').textContent=value.available+' exercises available across '+value.chapters.length+' chapters.';$('subject-start').disabled=!value.available;$('chapters').replaceChildren();chapterNodes=new Map();
 for(const chapter of value.chapters){const card=node('article',undefined,'chapter-card');card.dataset.chapter=chapter.id;const number=node('span',String(chapter.index),'chapter-number');number.setAttribute('aria-hidden','true');const body=node('div'),heading=node('h3',chapter.title);heading.tabIndex=-1;const p=node('div','Loading progress…','chapter-progress');body.append(heading,node('p',chapter.available?chapter.available+' exercises available':'Exercises are being prepared.','muted'),p);const button=node('button','Practice chapter →','secondary');button.type='button';button.disabled=!chapter.available;button.setAttribute('aria-label','Practice '+chapter.title);button.addEventListener('click',()=>start(chapter.title));card.append(number,body,button);$('chapters').append(card);chapterNodes.set(chapter.id,{card,progress:p});if(url.searchParams.get('chapter')===chapter.title){heading.focus({preventScroll:true});card.scrollIntoView({block:'center'});}}
 $('chapters').setAttribute('aria-busy','false');
}
async function load(){
 $('subject-error').hidden=true;$('retry-subject').hidden=true;$('chapters').setAttribute('aria-busy','true');
 try{if([...url.searchParams.keys()].some(k=>!['subject','chapter'].includes(k))||url.searchParams.getAll('subject').length!==1)throw Error('Choose a subject from the home page.');const subject=url.searchParams.get('subject');render(await api('/api/discovery/subject?subject='+encodeURIComponent(subject)));learningTask=learning();}
 catch(error){$('subject-title').textContent='Subject unavailable';$('subject-error').textContent=error.message;$('subject-error').hidden=false;$('retry-subject').hidden=false;$('subject-progress').textContent='';$('chapters').replaceChildren();$('chapters').setAttribute('aria-busy','false');}
}
async function start(chapter){
 if(starting||!data)return;starting=true;$('practice-start-error').hidden=true;$('practice-start-status').textContent='Preparing your practice set…';for(const b of document.querySelectorAll('main button'))b.disabled=true;let setId;
 try{await learningTask;const selection={subject:data.subject,...(chapter?{chapter}:{})};let pending;try{pending=JSON.parse(sessionStorage.getItem('mathpractice.pending-set'));}catch{}
 if(!pending||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(pending.requestKey??'')||JSON.stringify(pending.selection)!==JSON.stringify(selection))pending={requestKey:crypto.randomUUID(),selection};
 pending={requestKey:pending.requestKey,selection};try{sessionStorage.setItem('mathpractice.pending-set',JSON.stringify(pending));}catch{throw Error('Allow site storage to start a saved practice set, then retry. No exercise was started.');}
 const created=await api('/api/sessions/sets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending)});setId=created.set.id;savePlan({version:1,...created.set});
 const opened=await api('/api/sessions/sets/'+setId+'/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({position:0,revision:created.set.revision})});savePlan({version:1,...opened.set});sessionStorage.removeItem('mathpractice.pending-set');location.assign('/practice?session='+encodeURIComponent(opened.sessionId)+'&set='+encodeURIComponent(setId)+'&item=0');
 }catch(error){$('practice-start-error').replaceChildren(node('p',error.message),node('p','Your saved work is retained. Retry resumes this request; it does not silently replace the exercise.'));if(setId){const a=node('a','Open the saved practice set');a.href='/practice?set='+encodeURIComponent(setId)+'&item=0';$('practice-start-error').append(a);}$('practice-start-error').hidden=false;$('practice-start-status').textContent='';starting=false;for(const b of document.querySelectorAll('main button'))b.disabled=false;$('subject-start').disabled=!data.available;for(const c of data.chapters)chapterNodes.get(c.id).card.querySelector('button').disabled=!c.available;}
}
$('subject-start').addEventListener('click',()=>start());$('retry-subject').addEventListener('click',load);$('retry-progress').addEventListener('click',learning);await load();
