export async function loadStudyProgress({onLoading=()=>{},signal}={}){
 onLoading();for(let i=0;i<30;i++){const r=await fetch('/api/sessions/account/learning-progress',{headers:{Accept:'application/json'},signal});const v=await r.json();if(!r.ok)throw Error(r.status===401?'Sign in again to view saved progress.':'Progress is temporarily unavailable. You can still choose a chapter.');if(!v.syncing)return v;await new Promise(resolve=>setTimeout(resolve,200));}
 throw Error('Your saved progress is still being updated. Please retry shortly.');
}
export function progressElements(parent,{completed,target,percent},label){
 parent.replaceChildren();const text=document.createElement('span');text.className='progress-label';text.textContent=percent+'% complete · '+completed+' / '+target;const bar=document.createElement('progress');bar.max=100;bar.value=percent;bar.setAttribute('aria-label',label+' completion');parent.append(text,bar);
}
