/** Account synchronization never changes PG controls or manufactures a grading result. */
export async function accountRequest(path,input,{signal}={}){
 const response=await fetch('/api/sessions/account/'+path,{...(input?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{}),signal:signal??AbortSignal.timeout(10000)});
 const value=await response.json();if(!response.ok){const error=Error(value.error?.message??'Account saved work is unavailable.');error.code=value.error?.code;error.status=response.status;throw error;}return value;
}
let identity;
export async function accountIdentity(){
 if(!identity)identity=accountRequest('status').then(value=>value.account).catch(error=>{
  if(error.status===404)return {authenticated:false};identity=null;throw error;
 });return identity;
}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createAccountDraftSync({sessionId,container,restore,current,isCurrent}){
 const controller=new AbortController();let disposed=false,enabled=false,revision=0,base=null,pending=null,timer,running=null,paused=false,remote=null;
 const active=()=>!disposed&&isCurrent();
 function notice(text,actions=[]){if(!active())return;container.replaceChildren(document.createTextNode(text));for(const [label,callback] of actions){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=label;button.addEventListener('click',()=>void callback());container.append(' ',button);}}
 async function request(input){
  const response=await fetch('/api/sessions/'+encodeURIComponent(sessionId)+'/draft',{...(input?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});
  const value=await response.json();if(!response.ok){const error=Error(value.error?.message??'Account draft is unavailable.');error.code=value.error?.code;throw error;}return value.draft;
 }
 async function choose(useRemote){
  if(!active())return;
  try{
   const latest=await request();if(!active())return;
   // Do not silently replace a version that changed after the choice was presented.
   if((latest?.revision??0)!==(remote?.revision??0)){remote=latest;conflict();return;}
   revision=latest?.revision??0;
   if(useRemote&&latest){
    if(latest.baseAttemptId!==base){notice('This account draft belongs to an older check. Reload the saved result before choosing how to reuse that work.');return;}
    await restore(latest.entries);if(!active())return;
   }
   paused=false;pending={entries:current().entries,baseAttemptId:base};await flush();
  }catch(error){failed(error);}
 }
 function conflict(){paused=true;notice('A different account draft is retained. Your current answers remain in this tab. Choose which work to use.',[['Use account draft',()=>choose(true)],["Keep this tab's answers",()=>choose(false)]]);}
 function failed(error){
  if(!active())return;paused=true;
  notice(error.code==='DRAFT_BASE_CHANGED'?'A newer check exists. Your tab answers are retained. Reload the saved session before syncing.':'Account draft could not be saved. Your tab draft is retained.',[['Retry account draft',retry]]);
 }
 async function retry(){try{remote=await request();if(!active())return;conflict();}catch(error){failed(error);}}
 async function write(){
  if(!active()||!enabled||paused||!pending)return;
  const value=pending;pending=null;notice('Saving account draft…');
  try{const saved=await request({...value,revision});if(!active())return;revision=saved.revision;notice('Draft saved to your account. Changes have not been checked.');}
  catch(error){if(!active())return;pending??=value;if(error.code==='DRAFT_CONFLICT'){try{remote=await request();conflict();}catch(failure){failed(failure);}}else failed(error);}
 }
 async function flush(){
  clearTimeout(timer);if(running)await running;
  if(pending&&!paused){running=write();try{await running;}finally{running=null;}}
 }
 async function initialize(submission,snapshot){
  base=submission?.id??null;
  try{
   if(!(await accountIdentity()).authenticated||!active())return;
   enabled=true;remote=await request();if(!active())return;revision=remote?.revision??0;
   const now=current();
   if(remote&&remote.baseAttemptId===base&&equal(now.entries,snapshot.entries)){
    const hasLocal=Boolean(submission?!equal(now.entries,submission.answers):now.entries.some(([,value])=>value!==''));
    if(!hasLocal){await restore(remote.entries);if(active())notice('Account draft restored. Changes have not been checked.');}
    else if(!equal(remote.entries,now.entries))conflict();else notice('Account draft is up to date.');
   }else if(remote)conflict();
   else {notice('Account draft saving is ready.');save(current(),submission);}
  }catch(error){failed(error);}
 }
 function save(snapshot,submission){
  if(!enabled||!active())return;base=submission?.id??null;pending={entries:structuredClone(snapshot.entries),baseAttemptId:base};
  if(!paused){clearTimeout(timer);timer=setTimeout(()=>void flush(),500);}
 }
 return {initialize,save,flush,dispose(){disposed=true;clearTimeout(timer);controller.abort();}};
}
