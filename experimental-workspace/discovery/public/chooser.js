import {savePlan} from './practice-plan-store.js';
const $=id=>document.getElementById(id),levels=['subject','chapter','section'];
let current=new URL(location.href),requestId=0,controller,data,starting=false,debounce;
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const number=n=>new Intl.NumberFormat().format(n);
function parameters(){const p=new URLSearchParams();for(const key of ['view',...levels,...levels.map(level=>level+'Find')])if(current.searchParams.has(key))p.set(key,current.searchParams.get(key));return p;}
async function api(path,options={}){
 const response=await fetch(path,{...options,headers:{Accept:'application/json',...options.headers}});const value=await response.json();
 if(!response.ok){const error=Error(value.error?.message??'The topic could not be loaded.');error.code=value.error?.code;throw error;}return value;
}
function go(changes,{replace=false,focus=null}={}){
 for(const [key,value] of Object.entries(changes))value?current.searchParams.set(key,value):current.searchParams.delete(key);
 if(current.searchParams.get('view')==='practice')current.searchParams.delete('view');
 history[replace?'replaceState':'pushState']({},'',current);void load(focus);
}
function select(level,label){
 const index=levels.indexOf(level),changes={[level]:label};
 for(const child of levels.slice(index+1)){changes[child]=null;changes[child+'Find']=null;}
 go(changes,{focus:level});
}
function render(value,focus){
 data=value;$('topic-error').hidden=true;
 $('topic-practice').setAttribute('aria-pressed',String(value.view==='practice'));$('topic-library').setAttribute('aria-pressed',String(value.view==='library'));
 $('topic-note').textContent=value.view==='practice'?'Choose any available level. Practice creates an ordered set of up to 20 exercises. Topics without sections can be practiced at their parent level.':'These are indexed source classifications, not practice availability. Missing classifications remain accessible in the whole-library search.';
 for(const column of value.columns){
  const {level}=column,ul=$(level+'-options'),search=$(level+'-find');ul.replaceChildren();search.disabled=!column.enabled;
  if(document.activeElement!==search)search.value=current.searchParams.get(level+'Find')??'';
  for(const choice of column.nodes){
   const button=node('button',undefined,'topic-option');button.type='button';button.dataset.level=level;button.dataset.label=choice.label;
   button.setAttribute('aria-pressed',String(value.selection[level]===choice.label));button.setAttribute('aria-label',choice.label+', '+number(value.view==='practice'?choice.available:choice.indexed)+(value.view==='practice'?' available exercises':' indexed sources'));
   button.append(node('span',choice.label),node('small',number(value.view==='practice'?choice.available:choice.indexed)));button.addEventListener('click',()=>select(level,choice.label));const li=node('li');li.append(button);ul.append(li);
  }
  $(level+'-note').textContent=!column.enabled?'Choose a '+(level==='chapter'?'subject':'chapter')+' first.':column.truncated?'Showing 40 of '+number(column.total)+'. Filter this column to find more.':column.nodes.length?'':search.value?'No matching labels. Your current selection is unchanged.':level==='subject'?'No subjects are available.':value.view==='practice'?'No further levels are recorded. You can practice the selected topic.':'No further classification is recorded. Browse the selected parent topic.';
 }
 $('selected-topic').textContent=value.breadcrumb.at(-1)??'Choose a subject';
 $('topic-count').textContent=value.view==='practice'?number(value.available)+(value.available===1?' exercise available':' exercises available'):number(value.indexed)+' indexed sources · '+number(value.available)+' available to practice';
 $('topic-start').disabled=starting||!value.canStart||!value.selection.subject;
 $('topic-start').textContent=starting?'Opening…':'Practice →';
 const resultUrl=new URL('/',location.origin);if(value.view==='library')resultUrl.searchParams.set('view','library');
 for(const level of levels)if(value.selection[level])resultUrl.searchParams.set(level,value.selection[level]);$('topic-results').href=resultUrl.pathname+resultUrl.search;
 const crumb=$('topic-breadcrumb');crumb.replaceChildren();
 for(const [i,label] of value.breadcrumb.entries()){
  if(i)crumb.append(node('span','/'));const link=node('a',label),url=new URL(current);for(const child of levels.slice(i+1)){url.searchParams.delete(child);url.searchParams.delete(child+'Find');}link.href=url.pathname+url.search;
  if(i===value.breadcrumb.length-1)link.setAttribute('aria-current','location');
  link.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();const changes={};for(const child of levels.slice(i+1)){changes[child]=null;changes[child+'Find']=null;}go(changes,{focus:levels[i]});});crumb.append(link);
 }
 $('topic-announcement').textContent=[...value.breadcrumb,$('topic-count').textContent].join('. ');
 if(focus){
  const index=levels.indexOf(focus),mobile=matchMedia('(max-width:660px)').matches;
  const target=mobile&&index<2?$(levels[index+1]+'-heading'):[...$(focus+'-options').querySelectorAll('button')].find(b=>b.dataset.label===value.selection[focus]);
  target?.focus({preventScroll:!mobile});if(mobile)target?.scrollIntoView({block:'start'});
 }
}
async function load(focus){
 const sequence=++requestId;controller?.abort();controller=new AbortController();$('topic-columns').setAttribute('aria-busy','true');$('topic-start').disabled=true;
 try{const value=await api('/api/discovery/chooser?'+parameters(),{signal:controller.signal});if(sequence===requestId)render(value,focus);}
 catch(error){
  if(sequence!==requestId||error.name==='AbortError')return;
  $('topic-error').replaceChildren(node('p',error.code==='TOPIC_UNAVAILABLE'?'This topic is no longer available in this collection. Choose again; your existing work has been kept.':error.message));
  const reset=error.code==='TOPIC_UNAVAILABLE'||error.code==='INVALID_TOPIC',button=node('button',reset?'Reset selections':'Retry topics','secondary');button.type='button';button.addEventListener('click',()=>reset?resetTopics():void load());$('topic-error').append(button);$('topic-error').hidden=false;data=null;
 }
 finally{if(sequence===requestId)$('topic-columns').setAttribute('aria-busy','false');}
}
function resetTopics(){const changes={};for(const level of levels){changes[level]=null;changes[level+'Find']=null;}if(!['practice','library'].includes(current.searchParams.get('view')??'practice'))changes.view=null;go(changes);}
async function startPlan(){
 if(starting||!data?.canStart||!data.selection.subject)return;starting=true;$('topic-start').disabled=true;$('topic-start').textContent='Opening…';$('plan-error').hidden=true;
 let plan,opened;
 try{
  const selector={view:'practice'};for(const level of levels)if(data.selection[level])selector[level]=data.selection[level];
  plan=(await api('/api/discovery/practice-plans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(selector)})).plan;
  savePlan(plan);$('plan-status').textContent='Opening the first of '+plan.total+' exercises…';
  plan.items[0].startState='pending';savePlan(plan);
  const value=await api('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({exerciseId:plan.items[0].exerciseId})});
  if(value.session?.exerciseId!==plan.items[0].exerciseId||!/^[a-f0-9-]{36}$/.test(value.session?.id??''))throw Error('Opening this exercise could not be confirmed.');
  opened=value.session.id;plan.items[0].sessionId=opened;plan.items[0].startState='opened';savePlan(plan);
  location.assign('/practice?session='+encodeURIComponent(opened));
 }catch(error){
  if(plan&&plan.items[0].startState==='pending'){plan.items[0].startState='uncertain';try{savePlan(plan);}catch{}}
  $('plan-error').replaceChildren(node('p',error.message),node('p',opened?'The exercise was opened, but its plan could not be saved. Use the link below to keep that session.':'No replacement exercise will be opened automatically. Your other saved work has been kept.'));
  if(opened){const link=node('a','Open the saved exercise');link.href='/practice?session='+encodeURIComponent(opened);$('plan-error').append(link);}
  $('plan-error').hidden=false;$('plan-status').textContent='';starting=false;$('topic-start').disabled=false;$('topic-start').textContent='Start a new set →';
 }
}
for(const level of levels)$(level+'-find').addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(()=>go({[level+'Find']:$(level+'-find').value||null},{replace:true}),200);});
for(const mode of ['practice','library'])$('topic-'+mode).addEventListener('click',()=>{const changes={view:mode};for(const level of levels){changes[level]=null;changes[level+'Find']=null;}go(changes);});
$('reset-topics').addEventListener('click',resetTopics);$('topic-start').addEventListener('click',()=>void startPlan());
$('topic-columns').addEventListener('keydown',event=>{
 const button=event.target.closest('.topic-option');if(!button)return;
 const index=levels.indexOf(button.dataset.level),buttons=[...$(levels[index]+'-options').querySelectorAll('button')],position=buttons.indexOf(button);let target;
 if(event.key==='ArrowDown')target=buttons[(position+1)%buttons.length];if(event.key==='ArrowUp')target=buttons[(position+buttons.length-1)%buttons.length];
 if(event.key==='Home')target=buttons[0];if(event.key==='End')target=buttons.at(-1);
 if(event.key==='ArrowRight'&&index<2)target=$(levels[index+1]+'-options').querySelector('button');if(event.key==='ArrowLeft'&&index>0)target=$(levels[index-1]+'-options').querySelector('[aria-pressed=true]')??$(levels[index-1]+'-options').querySelector('button');
 if(target){event.preventDefault();target.focus();}
});
window.addEventListener('popstate',()=>{current=new URL(location.href);void load();});await load();
