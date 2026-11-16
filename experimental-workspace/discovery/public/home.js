const $=id=>document.getElementById(id);
const controls=['subject','chapter','section','area'];
let overview,requestId=0,controller,starting=false,current=new URL(location.href);const topicCache=new Map();
const number=value=>new Intl.NumberFormat().format(value);
const node=(tag,text,className)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;if(className)value.className=className;return value;};
function params(){const p=new URLSearchParams();for(const key of ['q','view',...controls,'cursor'])if(current.searchParams.get(key))p.set(key,current.searchParams.get(key));return p;}
const view=()=>current.searchParams.get('view')==='library'?'library':'practice';
async function api(path,signal,options={}){
 const response=await fetch(path,{...options,signal,headers:{Accept:'application/json',...options.headers}});
 const value=await response.json();if(!response.ok){const error=new Error(value.error?.message??'The request could not be completed.');error.code=value.error?.code;throw error;}return value;
}
function notice(title,text,action,label){
 const box=node('div',undefined,'notice');box.append(node('h3',title),node('p',text));
 if(action){const button=node('button',label,'secondary');button.type='button';button.addEventListener('click',action);box.append(button);}return box;
}
function go(changes,{focus=false,replace=false}={}){
 const target=new URL(current);for(const [key,value] of Object.entries(changes))value?target.searchParams.set(key,value):target.searchParams.delete(key);
 if(!Object.hasOwn(changes,'cursor'))target.searchParams.delete('cursor');
 if(target.searchParams.get('view')==='practice')target.searchParams.delete('view');
 history[replace?'replaceState':'pushState']({},'',target);current=target;void load(focus);
}
function sync(){
 const mode=view();$('query').value=current.searchParams.get('q')??'';
 const selectedSubject=current.searchParams.get('subject')??'';
 if(selectedSubject&&![...$('subject').options].some(o=>o.value===selectedSubject))$('subject').add(new Option(selectedSubject,selectedSubject));
 $('subject').value=selectedSubject;
 $('practice-view').setAttribute('aria-pressed',String(mode==='practice'));$('library-view').setAttribute('aria-pressed',String(mode==='library'));
 $('area-control').hidden=mode!=='library';
 $('collection-note').textContent=mode==='practice'?'Exercises in this collection are available to try. Your work stays in the same exercise when you return.':'Explore indexed OPL sources across mathematics. Indexed coverage is not practice availability: these entries are awaiting verification, support or a player connection.';
 $('results-title').textContent=mode==='library'?'Explore the indexed library':'Ready to practice';
 $('clear').hidden=!['q',...controls].some(key=>current.searchParams.has(key));
}
function options(id,values,placeholder,selected){
 const select=$(id);select.replaceChildren(new Option(placeholder,''));for(const value of [...new Set(values.filter(Boolean))].sort())select.add(new Option(value,value));
 if(selected&&!values.includes(selected))select.add(new Option(selected,selected));
 select.value=selected??'';select.disabled=values.filter(Boolean).length===0&&!selected;
}
function renderSubjects(){
 const mode=view(),container=$('subjects');container.replaceChildren();container.setAttribute('aria-busy','false');
 if(!overview)return;
 const collection=overview[mode==='practice'?'practice':'library'];
 const count=overview.library.available?number(overview.library.indexed)+' indexed sources':'Library temporarily unavailable';
 $('coverage').textContent=overview.practice.available?number(overview.practice.count)+' available to try · '+count:'Practice temporarily unavailable · '+count;
 $('retry-overview').hidden=collection.available;
 if(!collection.available){container.append(notice('This collection is temporarily unavailable','Retry loading the subjects. Your search and saved work have been kept.',loadOverview,'Retry collections'));return;}
 const subjects=collection.subjects.filter(s=>Number(mode==='practice'?s.practice:s.indexed)>0);
 options('subject',subjects.map(s=>s.subject),'All subjects',current.searchParams.get('subject'));
 if(!subjects.length){container.append(notice('No subjects available here yet',mode==='practice'?'Verified practice will appear here when it is available. You can explore indexed coverage in the library.':'No classified subjects have been indexed. Search can still find unclassified sources.'));return;}
 const icons=[['algebra','⊞'],['calculus','∫'],['geometry','∠'],['statistics','▥'],['equations','∂']];
 for(const subject of subjects){
  const a=node('a',undefined,'subject-card'),url=new URL(location.href);url.search='';if(mode==='library')url.searchParams.set('view','library');url.searchParams.set('subject',subject.subject);a.href=url.pathname+url.search;
  const top=node('div',undefined,'subject-top'),icon=node('span',icons.find(([term])=>subject.subject.toLowerCase().includes(term))?.[1]??'∑','subject-icon');icon.setAttribute('aria-hidden','true');
  top.append(icon,node('span',subject.subject,'subject-name'));
  const meta=node('div',undefined,'subject-meta');meta.append(node('span',mode==='practice'?number(subject.practice)+(subject.practice===1?' exercise':' exercises')+' · Explore topics':number(subject.indexed)+' indexed sources · Browse coverage'),node('span','→'));a.append(top,meta);
  a.addEventListener('click',event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();go({q:null,subject:subject.subject,chapter:null,section:null,area:null},{focus:true});});
  container.append(a);
 }
}
async function loadOverview(){try{overview=await api('/api/discovery/overview');renderSubjects();}catch{overview={practice:{available:false,subjects:[]},library:{available:false,subjects:[]}};renderSubjects();}}
async function start(entry,button){
 if(starting)return;starting=true;button.disabled=true;button.textContent='Opening…';$('start-error').hidden=true;$('start-status').textContent='Preparing your exercise…';
 try{
  const result=await api('/api/sessions',undefined,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({exerciseId:entry.id})});
  if(!/^[a-f0-9-]{36}$/.test(result.session?.id??''))throw Error('The exercise response could not be confirmed.');
  location.assign('/practice?session='+encodeURIComponent(result.session.id));
 }catch(error){
  $('start-error').replaceChildren(node('p',error.message),node('p','You can choose Practice again to try opening this exercise.'));$('start-error').hidden=false;$('start-status').textContent='';
  starting=false;button.disabled=false;button.textContent='Practice →';
 }
}
function renderResults(data){
 $('results').replaceChildren();
 if(!data.entries.length){
  $('results').append(notice('No exercises match this search',view()==='practice'?'Try a broader topic or clear the filters. You can also explore sources awaiting support in the indexed library.':'Try fewer search terms or clear a filter. Some sources have incomplete classifications.',()=>go({q:null,subject:null,chapter:null,section:null,area:null}),'Clear search and filters'));
 }
 for(const entry of data.entries){
  const card=node('article',undefined,'exercise-card');
  card.append(node('p',[entry.subject,entry.chapter,entry.section].filter(Boolean).join(' / ')||'Unclassified source','breadcrumb'),node('h3',entry.title));
  if(entry.description)card.append(node('p',entry.description,'description'));
  if(entry.titleOrigin==='generated-source-label')card.append(node('p','Source label · descriptive title not yet reviewed','source-note'));
  if(entry.attribution){const credit=[...entry.attribution.authors,...entry.attribution.institutions].join(' · ');if(credit)card.append(node('p',credit,'source-note'));}
  const footer=node('div',undefined,'card-footer');
  footer.append(node('span',entry.canPractice?'Available to practice':entry.catalogPracticeReady?'Verified catalog source · player connection pending':'Indexed · awaiting support','badge'+(entry.canPractice?'':' pending')));
  if(entry.canPractice){const button=node('button','Practice →','primary');button.type='button';button.setAttribute('aria-label','Practice '+entry.title);button.addEventListener('click',()=>void start(entry,button));footer.append(button);}
  else if(entry.area)card.append(node('p','OPL / '+entry.area,'source-note'));
  card.append(footer);$('results').append(card);
 }
 $('results-status').textContent=data.entries.length?number(data.entries.length)+(data.nextCursor?' results on this page. More results available.':' results.'):'No matching exercises.';
 $('pagination').hidden=!data.nextCursor&&!current.searchParams.has('cursor');$('previous').disabled=!current.searchParams.has('cursor');$('next').hidden=!data.nextCursor;
 $('next').onclick=()=>go({cursor:data.nextCursor},{focus:true});
 $('previous').onclick=()=>go({cursor:null},{focus:true});
}
async function load(focus=false){
 const sequence=++requestId;controller?.abort();controller=new AbortController();sync();renderSubjects();
 $('results').setAttribute('aria-busy','true');$('results').replaceChildren(node('div',undefined,'skeleton'),node('p','Loading exercises…','sr-only'));
 $('results-status').textContent='Loading exercises…';$('pagination').hidden=true;
 if(focus){$('results-title').tabIndex=-1;$('results-title').focus({preventScroll:true});$('search-results').scrollIntoView({block:'start'});}
 const p=params();const signal=controller.signal;
 try{
  const topicParams=new URLSearchParams({view:view()});if(current.searchParams.get('subject'))topicParams.set('subject',current.searchParams.get('subject'));
  const topicKey=topicParams.toString();let topicResult=topicCache.get(topicKey);
  if(!topicResult||topicResult.until<Date.now()){
   if(topicCache.size>=64)topicCache.clear();
   topicResult={until:Date.now()+15000,promise:api('/api/discovery/topics?'+topicParams)};
   topicCache.set(topicKey,topicResult);topicResult.promise.catch(()=>{if(topicCache.get(topicKey)===topicResult)topicCache.delete(topicKey);});
  }
  const [result,topicsResult]=await Promise.all([api('/api/discovery/search?'+p,signal),topicResult.promise]);
  if(sequence!==requestId)return;
  const topics=topicsResult.topics,subject=current.searchParams.get('subject'),chapter=current.searchParams.get('chapter');
  options('chapter',subject?topics.filter(t=>t.subject===subject).map(t=>t.chapter):[],'All topics',chapter);
  options('section',chapter?topics.filter(t=>t.subject===subject&&t.chapter===chapter).map(t=>t.section):[],'All sections',current.searchParams.get('section'));
  $('area').value=current.searchParams.get('area')??'';renderResults(result);
 }catch(error){
  if(signal.aborted||sequence!==requestId)return;
  $('results-status').textContent='Exercises could not be loaded.';
  const changed=error.code==='CATALOG_CHANGED'||error.code==='INVALID_CURSOR',invalid=error.code==='INVALID_FILTER';
  $('results').replaceChildren(notice(changed||invalid?'This search needs a fresh start':'We could not load this collection',error.message,()=>invalid?go({view:'practice',q:null,subject:null,chapter:null,section:null,area:null,cursor:null}):changed?go({cursor:null}):void load(),changed||invalid?'Restart search':'Retry loading'));
 }finally{if(sequence===requestId)$('results').setAttribute('aria-busy','false');}
}
async function loadContinue(){
 try{
  const result=await api('/api/sessions/recent');
  const messages={none:'Choose an exercise to begin. Your most recent session will appear here.',available:[result.topic,result.title].filter(Boolean).join(' / '),unavailable:'Your last session is unavailable. Open it to review recovery options.', 'temporarily-unavailable':'Your last session could not be checked right now. Your saved work has been kept.'};
  $('continue-description').textContent=messages[result.status]??messages.none;
  if(result.href){$('continue-link').href=result.href;$('continue-link').hidden=false;$('continue-label').textContent=result.status==='available'?'Resume exercise':'Open saved session';}
 }catch{$('continue-description').textContent='Your saved session could not be checked. Reload this page to retry.';}
 finally{$('continue').setAttribute('aria-busy','false');}
}
$('search-form').addEventListener('submit',event=>{event.preventDefault();go({q:$('query').value.trim()||null},{focus:true});});
$('filters').addEventListener('submit',event=>event.preventDefault());
for(const id of controls)$(id).addEventListener('change',()=>{const changes={[id]:$(id).value||null};if(id==='subject'){changes.chapter=null;changes.section=null;}if(id==='chapter')changes.section=null;go(changes,{focus:false});});
for(const mode of ['practice','library'])$(mode+'-view').addEventListener('click',()=>go({view:mode,q:$('query').value.trim()||null,subject:null,chapter:null,section:null,area:null}));
$('clear').addEventListener('click',()=>go({q:null,subject:null,chapter:null,section:null,area:null}));
$('retry-overview').addEventListener('click',()=>void loadOverview());
window.addEventListener('popstate',()=>{current=new URL(location.href);void load();});
await Promise.all([loadOverview(),load(),loadContinue()]);
