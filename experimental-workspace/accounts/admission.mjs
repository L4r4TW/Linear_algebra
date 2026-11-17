import {AccountError} from './db.mjs';
/** Per-process admission. Database claims still fence a session across processes. */
export function createAdmission({maximum=4,waiting=8,waitMs=3000,maxBuckets=2048,now=Date.now}={}){
 if(!Number.isInteger(maximum)||maximum<1||!Number.isInteger(waiting)||waiting<0||!Number.isFinite(waitMs)||waitMs<1)throw Error('INVALID_ADMISSION_CONFIGURATION');
 let active=0;const queue=[],buckets=new Map(),counts={accepted:0,rejected:0,expired:0,cancelled:0,rateLimited:0};
 function lease(){
  active++;counts.accepted++;let released=false;
  return ()=>{if(released)return;released=true;active--;while(queue.length&&active<maximum){const next=queue.shift();next.cleanup();next.resolve(lease());}};
 }
 function acquire({signal}={}){
  if(signal?.aborted)return Promise.reject(new AccountError('REQUEST_CANCELLED',499));
  if(active<maximum)return Promise.resolve(lease());
  if(queue.length>=waiting){counts.rejected++;return Promise.reject(new AccountError('PRACTICE_BUSY',503));}
  return new Promise((resolve,reject)=>{
   const item={resolve,reject,cleanup(){clearTimeout(timer);signal?.removeEventListener('abort',cancel);}};
   function remove(code){const at=queue.indexOf(item);if(at<0)return;queue.splice(at,1);item.cleanup();reject(new AccountError(code,code==='REQUEST_CANCELLED'?499:503));}
   const cancel=()=>{counts.cancelled++;remove('REQUEST_CANCELLED');},timer=setTimeout(()=>{counts.expired++;remove('PRACTICE_BUSY');},waitMs);
   signal?.addEventListener('abort',cancel,{once:true});queue.push(item);
  });
 }
 function checkRate(key,{limit=600,windowMs=60000}={}){
  const time=now();let bucket=buckets.get(key);
  if(bucket&&bucket.until<=time){buckets.delete(key);bucket=null;}
  if(!bucket){
   if(buckets.size>=maxBuckets){for(const [id,value] of buckets)if(value.until<=time)buckets.delete(id);}
   if(buckets.size>=maxBuckets){counts.rejected++;throw new AccountError('PRACTICE_BUSY',503);}
   bucket={count:0,until:time+windowMs};buckets.set(key,bucket);
  }
  if(bucket.count>=limit){counts.rateLimited++;throw new AccountError('ACCOUNT_RATE_LIMITED',429);}bucket.count++;
 }
 async function run(work,{signal}={}){const release=await acquire({signal});try{if(signal?.aborted)throw new AccountError('REQUEST_CANCELLED',499);return await work();}finally{release();}}
 return {acquire,run,checkRate,snapshot:()=>({active,waiting:queue.length,maximum,maximumWaiting:waiting,...counts})};
}
