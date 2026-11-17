import assert from 'node:assert/strict';import {randomBytes,randomUUID} from 'node:crypto';import {mkdir,writeFile} from 'node:fs/promises';
const primary='http://linear-algebra-accounts-backend-1:3000',secondary=process.env.SECONDARY_URL,origin='http://localhost:3100';let cookie='';
async function request(base,path,input,key){
 const response=await fetch(base+path,{headers:{Cookie:cookie,...(input?{'Content-Type':'application/json',Origin:origin}:{}),...(key?{'Idempotency-Key':key}:{})},...(input?{method:'POST',body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(30000)});
 for(const value of response.headers.getSetCookie())if(value.startsWith('mathpractice_account='))cookie=value.split(';')[0];
 return {status:response.status,value:await response.json()};
}
try{
 for(let i=0;i<20;i++){try{if((await fetch(secondary+'/health')).ok)break;}catch{}if(i===19)throw Error('REPLICA_NOT_READY');await new Promise(resolve=>setTimeout(resolve,500));}
 const login=await request(primary,'/api/sessions/account/signup',{email:'replica-'+randomBytes(12).toString('hex')+'@example.test',password:randomBytes(24).toString('base64url')+'Aa1!'});assert.equal(login.status,200);assert.ok(cookie);
 const started=await request(primary,'/api/sessions',{exerciseId:'compat-calculus-numeric-01'});assert.equal(started.status,201);const id=started.value.session.id,key=randomUUID(),answers={answers:[['AnSwEr0001','0']]};
 const results=await Promise.all([request(primary,'/api/sessions/'+id+'/answers',answers,key),request(secondary,'/api/sessions/'+id+'/answers',answers,key)]);
 assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);assert.ok(['SESSION_BUSY','SUBMISSION_REPLAY'].includes(results.find(result=>result.status===409).value.error.code));
 const restored=await request(secondary,'/api/sessions/'+id);assert.equal(restored.status,200);assert.equal(restored.value.submission.number,1);
 const replay=await request(secondary,'/api/sessions/'+id+'/answers',answers,key);assert.equal(replay.status,409);assert.equal(replay.value.error.code,'SUBMISSION_REPLAY');
 const history=await request(primary,'/api/sessions/account/progress');assert.equal(history.value.counts.attempts,1);
 const report={version:1,observedAt:new Date().toISOString(),complete:true,scope:'Two separate Node backend containers, actual Supabase and PG; synthetic private test account',sharedOpaqueAccountSession:true,concurrentChecksExactlyOnce:true,secondProcessRestoresSameSession:true,replayDoesNotGrade:true,oneImmutableAttempt:true};
 await mkdir('/artifacts',{recursive:true});await writeFile('/artifacts/replica-observations.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({complete:true,backendProcesses:2,privateDataDisclosed:false}));
}catch{console.error('Separate-process grading acceptance failed; private responses were withheld.');process.exitCode=1;}
