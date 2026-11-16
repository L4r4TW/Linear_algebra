import {spawn} from 'node:child_process';import {randomUUID} from 'node:crypto';import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {existsSync} from 'node:fs';import {claim,heartbeat,finish} from './queue.mjs';
export async function boundedChild(script,args,{timeoutMs=600000,onHeartbeat=()=>true}={}){
 return new Promise(resolve=>{
  const child=spawn(process.execPath,[script,...args],{stdio:['ignore','ignore','ignore'],detached:true,env:process.env});
  let done=false;const kill=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}};
  const end=(code,error)=>{if(done)return;done=true;clearTimeout(deadline);clearInterval(pulse);process.off('SIGTERM',terminate);process.off('SIGINT',terminate);resolve({code,error});};
  const deadline=setTimeout(()=>{kill();end(null,'JOB_TIMEOUT');},timeoutMs);
  const pulse=setInterval(()=>{try{if(!onHeartbeat()){kill();end(null,'LEASE_LOST');}}catch{kill();end(null,'HEARTBEAT_ERROR');}},10000);
  const terminate=()=>{kill();end(null,'WORKER_INTERRUPTED');};process.on('SIGTERM',terminate);process.on('SIGINT',terminate);
  child.once('error',()=>end(null,'WORKER_CHILD_ERROR'));child.once('exit',code=>end(code,null));
 });
}
export async function runWorker({loop=false,count=1}={}){
 const worker='worker-'+randomUUID();let processed=0,stopping=false;
 process.once('SIGTERM',()=>{stopping=true;});process.once('SIGINT',()=>{stopping=true;});
 while(!stopping&&(loop||processed<count)){
  const job=claim(worker);if(!job){if(!loop)break;await new Promise(r=>setTimeout(r,1000));continue;}
  const dir=await mkdtemp(join(tmpdir(),'queued-verification-'));let result;
  try{
   if(!existsSync('/qa/pipeline/run-job.mjs'))result={technicalState:'error',error:'RUNNER_NOT_INSTALLED',cases:[],elapsedMs:0};
   else{
    const started=Date.now(),child=await boundedChild('/qa/pipeline/run-job.mjs',[job.jobId,dir],{onHeartbeat:()=>heartbeat(job.jobId,job.token)});
    result=child.error?{technicalState:'error',error:child.error,cases:[],elapsedMs:Date.now()-started}:JSON.parse(await readFile(join(dir,'result.json'),'utf8'));
   }
   const accepted=finish(job.jobId,job.token,result);console.log(JSON.stringify({jobId:job.jobId,accepted,technicalState:result.technicalState}));
  }catch{finish(job.jobId,job.token,{technicalState:'error',error:'WORKER_RESULT_ERROR',cases:[],elapsedMs:0});}
  finally{await rm(dir,{recursive:true,force:true});}
  processed++;
 }
 return {processed};
}
