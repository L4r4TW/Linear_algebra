import {readFile,stat} from 'node:fs/promises';import {join} from 'node:path';
import {actors,AccountError} from './db.mjs';import {hash} from './crypto.mjs';
import {ExerciseSessionError} from '../application/server/exercise-sessions.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function createRecordStore({db,vault,legacyDirectory,exerciseLookup,runtimeDigest}){
 const context=()=>{const value=actors.getStore();if(!value?.principalId||!value.ownerToken)throw new AccountError('AUTH_REQUIRED',401);return value;};
 const authority=row=>({...row,ownerHash:hash(context().ownerToken)});
 const missing=()=>{const error=Error('Session was not found');error.code='ENOENT';return error;};
 async function appendAttempt(client,record,principalId,provenance){
  const attempt={...record.lastSubmission,provenance,exerciseId:record.exerciseId,source:record._source??null};
  const digest=hash(attempt),previous=(await client.query('SELECT content_digest FROM practice_runtime.attempts WHERE id=$1',[attempt.id])).rows[0];
  if(previous){if(previous.content_digest!==digest)throw new AccountError('ATTEMPT_CONFLICT');return;}
  await client.query('INSERT INTO practice_runtime.attempts(id,session_id,principal_id,ordinal,encrypted_attempt,content_digest,submitted_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[attempt.id,record.id,principalId,attempt.number,vault.seal(attempt,'attempt:'+attempt.id+':'+record.id),digest,attempt.submittedAt]);
 }
 async function importLegacy(record){
  const ctx=context();if(!uuid.test(record?.id??'')||record.ownerHash!==hash(ctx.ownerToken)||!Number.isInteger(record.seed)||typeof record.rendererSessionToken!=='string'||typeof record.rendererProblemToken!=='string')throw missing();
  await db.current(async client=>{
   await client.query('INSERT INTO practice_runtime.sessions(id,principal_id,generation,encrypted_record) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[record.id,ctx.principalId,record.submissionCount??0,vault.seal({...record,_history:'legacy-latest-only'},'session:'+record.id)]);
   const row=(await client.query('SELECT id FROM practice_runtime.sessions WHERE id=$1',[record.id])).rows[0];if(!row)throw new ExerciseSessionError('SESSION_FORBIDDEN','Session was not found.');
   if(record.lastSubmission)await appendAttempt(client,record,ctx.principalId,'legacy-renderer');
  });
 }
 async function read(id){
  if(!uuid.test(id))throw missing();const ctx=context();
  let row=await db.current(async client=>(await client.query('SELECT * FROM practice_runtime.sessions WHERE id=$1',[id])).rows[0]);
  if(!row&&ctx.kind==='anonymous'&&legacyDirectory){
   let record;try{const path=join(legacyDirectory,id+'.json');if((await stat(path)).size>2097152)throw missing();record=JSON.parse(await readFile(path,'utf8'));}catch{throw missing();}
   await importLegacy(record);row=await db.current(async client=>(await client.query('SELECT * FROM practice_runtime.sessions WHERE id=$1',[id])).rows[0]);
  }
  if(!row)throw missing();let record;try{record=vault.open(row.encrypted_record,'session:'+id);}catch{throw new ExerciseSessionError('STORAGE_ERROR','The saved session could not be read.');}
  if(record._source){const current=exerciseLookup(record.exerciseId)?.source;if(!current||current.sha256!==record._source.sha256||current.revision!==record._source.revision||record._source.contextId&&current.contextId!==record._source.contextId||record._source.versionId&&current.versionId!==record._source.versionId)throw new ExerciseSessionError('EXERCISE_WITHDRAWN','The source changed; the saved session was retained.');}
  ctx.record={id,generation:Number(row.generation),principalId:row.principal_id,contract:row.contract,contractGeneration:row.contract_generation===null?null:Number(row.contract_generation)};
  const pending=await db.current(async client=>(await client.query("SELECT state,lease_until,request_key FROM practice_runtime.operations WHERE session_id=$1 AND state IN('in-flight','uncertain')",[id])).rows[0]);
  record=authority(record);if(pending&&pending.request_key!==ctx.operation?.requestKey)record._pendingSubmission=pending.state==='uncertain'||new Date(pending.lease_until).getTime()<Date.now()?'uncertain':'in-flight';
  return record;
 }
 async function save(record,{replace=false}={}){
  const ctx=context();if(!uuid.test(record.id)||record.ownerHash!==hash(ctx.ownerToken))throw new ExerciseSessionError('SESSION_FORBIDDEN','Session was not found.');
  const value=structuredClone(record);delete value._pendingSubmission;const source=exerciseLookup(record.exerciseId)?.source;
  if(!replace&&source)value._source={revision:source.revision,sha256:source.sha256,runtime:runtimeDigest,...(source.contextId?{contextId:source.contextId,versionId:source.versionId}:{})};
  await db.current(async client=>{
   const old=(await client.query('SELECT * FROM practice_runtime.sessions WHERE id=$1 FOR UPDATE',[record.id])).rows[0];
   if(!replace){
    if(old)throw new ExerciseSessionError('SESSION_START_REPLAY','This session already exists.');
    await client.query('INSERT INTO practice_runtime.sessions(id,principal_id,generation,encrypted_record,contract,contract_generation) VALUES($1,$2,$3,$4,$5,$3)',[record.id,ctx.forcedPrincipalId??ctx.principalId,record.submissionCount??0,vault.seal(value,'session:'+record.id),ctx.contract?JSON.stringify(ctx.contract):null]);
   }else{
    if(!old)throw missing();
    if(!ctx.operation||ctx.operation.sessionId!==record.id||record.submissionCount!==Number(old.generation)+1)throw new ExerciseSessionError('SESSION_BUSY','The session changed while checking.');
    const operation=(await client.query("SELECT * FROM practice_runtime.operations WHERE session_id=$1 AND request_key=$2 AND state='in-flight' FOR UPDATE",[record.id,ctx.operation.requestKey])).rows[0];
    if(!operation||Number(operation.base_generation)!==Number(old.generation))throw new ExerciseSessionError('SUBMISSION_UNCERTAIN','The check could not be confirmed.');
    await client.query('UPDATE practice_runtime.sessions SET generation=$1,encrypted_record=$2,contract=$3,contract_generation=$1,updated_at=now() WHERE id=$4',[record.submissionCount,vault.seal(value,'session:'+record.id),ctx.contract?JSON.stringify(ctx.contract):null,record.id]);
    await appendAttempt(client,value,old.principal_id,'server-pg');await client.query("UPDATE practice_runtime.operations SET state='accepted',updated_at=now() WHERE id=$1",[operation.id]);
   }
  });
  ctx.operationSaved=replace;ctx.record={id:record.id,generation:record.submissionCount??0,principalId:ctx.forcedPrincipalId??ctx.record?.principalId??ctx.principalId,contract:ctx.contract??null,contractGeneration:record.submissionCount??0};
 }
 async function claimSubmission(sessionId,{operationKey,answers}){
  const ctx=context();if(!uuid.test(operationKey))throw new ExerciseSessionError('INVALID_INPUT','Invalid submission identity.');const requestDigest=hash(answers);
  const result=await db.current(async client=>{
   const row=(await client.query('SELECT id,principal_id,generation FROM practice_runtime.sessions WHERE id=$1 FOR UPDATE',[sessionId])).rows[0];if(!row)throw new ExerciseSessionError('SESSION_NOT_FOUND','Session was not found.');
   const previous=(await client.query('SELECT * FROM practice_runtime.operations WHERE session_id=$1 AND request_key=$2',[sessionId,operationKey])).rows[0];
   if(previous){
    if(previous.request_digest!==requestDigest)throw new ExerciseSessionError('INVALID_INPUT','This submission identity was used for different inputs.');
    if(previous.state==='accepted')throw new ExerciseSessionError('SUBMISSION_REPLAY','The check was already saved.');
    if(previous.state==='uncertain')throw new ExerciseSessionError('SUBMISSION_UNCERTAIN','The check could not be confirmed.');
    if(previous.state==='in-flight')throw new ExerciseSessionError(new Date(previous.lease_until).getTime()<Date.now()?'SUBMISSION_UNCERTAIN':'SESSION_BUSY','A check is pending.');
   }
   const pending=(await client.query("SELECT state,lease_until FROM practice_runtime.operations WHERE session_id=$1 AND state IN('in-flight','uncertain')",[sessionId])).rows[0];
   if(pending)throw new ExerciseSessionError(pending.state==='uncertain'||new Date(pending.lease_until).getTime()<Date.now()?'SUBMISSION_UNCERTAIN':'SESSION_BUSY','A check is pending.');
   if(previous)await client.query("UPDATE practice_runtime.operations SET state='in-flight',base_generation=$1,lease_until=now()+interval '90 seconds',updated_at=now() WHERE id=$2",[row.generation,previous.id]);
   else await client.query("INSERT INTO practice_runtime.operations(session_id,principal_id,request_key,request_digest,base_generation,state,lease_until) VALUES($1,$2,$3,$4,$5,'in-flight',now()+interval '90 seconds')",[sessionId,row.principal_id,operationKey,requestDigest,row.generation]);
   return {sessionId,requestKey:operationKey};
  });ctx.operation=result;ctx.operationSaved=false;ctx.gradingStarted=false;
 }
 async function releaseSubmission(sessionId){
  const ctx=context();if(!ctx.operation||ctx.operation.sessionId!==sessionId||ctx.operationSaved)return;
  await db.current(client=>client.query("UPDATE practice_runtime.operations SET state=$1,updated_at=now() WHERE session_id=$2 AND request_key=$3 AND state='in-flight'",[ctx.gradingStarted?'uncertain':'failed-before-renderer',sessionId,ctx.operation.requestKey]));
 }
 async function captureContract(contract){
  const ctx=context();ctx.contract=contract;if(ctx.record&&!ctx.operation)await db.current(client=>client.query('UPDATE practice_runtime.sessions SET contract=$1,contract_generation=$2 WHERE id=$3 AND generation=$2',[JSON.stringify(contract),ctx.record.generation,ctx.record.id]));
 }
 return {read,save,claimSubmission,releaseSubmission,captureContract,importLegacy};
}
