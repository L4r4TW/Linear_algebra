import {randomUUID} from 'node:crypto';
import {actors,AccountError} from './db.mjs';import {hash} from './crypto.mjs';
import {completeAnswerEntries} from '../application/server/answer-contract.mjs';
const validId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export function createStudentData({db,vault,store,sessions,exerciseLookup}){
 const context=()=>{const ctx=actors.getStore();if(ctx?.kind!=='account')throw new AccountError('ACCOUNT_AUTH_REQUIRED',401);return ctx;};
 async function owned(id){if(!validId(id))throw new AccountError('SESSION_NOT_FOUND',404);await store.read(id);return actors.getStore().record;}
 async function contractFor(id){
  let row=await owned(id);if(!row.contract||row.contractGeneration!==row.generation){await sessions.resumeSession(id,{ownerToken:context().ownerToken});row=actors.getStore().record;row.contract=actors.getStore().contract;}
  if(!Array.isArray(row.contract))throw new AccountError('DRAFT_FIELDS_UNAVAILABLE',503);return row;
 }
 async function getDraft(id){context();await owned(id);return db.current(async client=>{
  const row=(await client.query("SELECT revision,base_attempt_id,encrypted_draft,updated_at FROM practice_runtime.drafts WHERE session_id=$1 AND branch='account'",[id])).rows[0];
  return row?{revision:Number(row.revision),baseAttemptId:row.base_attempt_id,entries:vault.open(row.encrypted_draft,'draft:'+id+':account'),updatedAt:new Date(row.updated_at).toISOString()}:null;
 });}
 async function saveDraft(id,input){
  context();if(!input||Object.keys(input).sort().join(',')!=='baseAttemptId,entries,revision'||!Number.isSafeInteger(input.revision)||input.revision<0||input.baseAttemptId!==null&&!validId(input.baseAttemptId))throw new AccountError('INVALID_DRAFT',400);
  const contract=await contractFor(id);try{completeAnswerEntries(input.entries,new Map(contract.contract));}catch{throw new AccountError('INVALID_DRAFT',400);}
  if(Buffer.byteLength(JSON.stringify(input.entries))>64000)throw new AccountError('INVALID_DRAFT',413);
  return db.current(async client=>{
   const row=(await client.query('SELECT principal_id,generation,encrypted_record FROM practice_runtime.sessions WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)throw new AccountError('SESSION_NOT_FOUND',404);
   const record=vault.open(row.encrypted_record,'session:'+id);if((record.lastSubmission?.id??null)!==input.baseAttemptId)throw new AccountError('DRAFT_BASE_CHANGED');
   const old=(await client.query("SELECT revision FROM practice_runtime.drafts WHERE session_id=$1 AND branch='account'",[id])).rows[0];if(Number(old?.revision??0)!==input.revision)throw new AccountError('DRAFT_CONFLICT');
   const revision=input.revision+1;
   await client.query("INSERT INTO practice_runtime.drafts(session_id,principal_id,branch,revision,base_attempt_id,encrypted_draft) VALUES($1,$2,'account',$3,$4,$5) ON CONFLICT(session_id,branch) DO UPDATE SET revision=EXCLUDED.revision,base_attempt_id=EXCLUDED.base_attempt_id,encrypted_draft=EXCLUDED.encrypted_draft,updated_at=now()",[id,row.principal_id,revision,input.baseAttemptId,vault.seal(input.entries,'draft:'+id+':account')]);return {revision,baseAttemptId:input.baseAttemptId};
  });
 }
 async function bookmarks(){context();return db.current(async client=>(await client.query('SELECT exercise_id,min(created_at) created_at FROM practice_runtime.bookmarks GROUP BY exercise_id ORDER BY min(created_at) DESC LIMIT 1000')).rows.map(row=>({exerciseId:row.exercise_id,available:Boolean(exerciseLookup(row.exercise_id))})));}
 async function bookmark(exerciseId,saved){
  const ctx=context();if(typeof exerciseId!=='string'||typeof saved!=='boolean'||saved&&!exerciseLookup(exerciseId))throw new AccountError('INVALID_BOOKMARK',400);
  await db.current(async client=>{
   if(saved)await client.query('INSERT INTO practice_runtime.bookmarks(principal_id,exercise_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[ctx.principalId,exerciseId]);
   else await client.query('DELETE FROM practice_runtime.bookmarks WHERE exercise_id=$1',[exerciseId]);
  });return {exerciseId,saved};
 }
 async function claimGuest(ownerToken,{importLegacy}={}){
  const account=context();if(typeof ownerToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(ownerToken))throw new AccountError('GUEST_PROOF_REQUIRED',400);
  const guestDigest=hash(ownerToken),guest={kind:'anonymous',guestDigest,ownerToken};
  // A claimed principal is invisible to guest-only RLS. Never accept a principal/account ID from HTTP.
  const principal=await db.transaction({guestDigest},async client=>(await client.query("SELECT id FROM practice_runtime.principals WHERE credential_digest=$1 AND kind='anonymous' AND account_id IS NULL",[guestDigest])).rows[0]);
  if(!principal)throw new AccountError('GUEST_WORK_UNAVAILABLE',404);guest.principalId=principal.id;
  if(importLegacy)await actors.run(guest,()=>importLegacy(guest));
  const result=await db.transaction({...account,guestDigest},async client=>{
   const row=(await client.query("SELECT id FROM practice_runtime.principals WHERE id=$1 AND credential_digest=$2 AND account_id IS NULL FOR UPDATE",[principal.id,guestDigest])).rows[0];
   if(!row)throw new AccountError('GUEST_WORK_UNAVAILABLE',404);
   const counts=(await client.query('SELECT (SELECT count(*)::int FROM practice_runtime.sessions WHERE principal_id=$1) sessions,(SELECT count(*)::int FROM practice_runtime.sets WHERE principal_id=$1) sets',[row.id])).rows[0];
   await client.query("UPDATE practice_runtime.principals SET kind='claimed',account_id=$1 WHERE id=$2",[account.accountId,row.id]);return counts;
  });return {claimed:true,...result};
 }
 async function progress(){
  context();return db.current(async client=>{
   const total=(await client.query('SELECT count(*)::int attempts,count(DISTINCT session_id)::int sessions FROM practice_runtime.attempts')).rows[0];
   const rows=(await client.query('SELECT id,session_id,ordinal,encrypted_attempt,submitted_at FROM practice_runtime.attempts ORDER BY submitted_at DESC,id DESC LIMIT 50')).rows;
   const recent=rows.map(row=>{
    const attempt=vault.open(row.encrypted_attempt,'attempt:'+row.id+':'+row.session_id),entry=exerciseLookup(attempt.exerciseId),suppressed=attempt.feedbackVisibility==='suppressed'||!entry;
    return {id:row.id,sessionId:row.session_id,exerciseId:attempt.exerciseId,title:entry?.title??'Unavailable exercise',number:Number(row.ordinal),submittedAt:new Date(row.submitted_at).toISOString(),score:suppressed?null:attempt.score,
     outcome:suppressed?'feedback-unavailable':attempt.score===1?'correct':attempt.score===0?'not-correct':'partial',provenance:attempt.provenance==='server-pg'?'renderer-verified':'legacy-latest-only',available:Boolean(entry)};
   });
   const sets=(await client.query('SELECT s.id,s.title,count(i.position)::int total,count(i.position) FILTER(WHERE i.skipped)::int skipped,count(i.position) FILTER(WHERE i.session_id IS NOT NULL)::int opened FROM practice_runtime.sets s JOIN practice_runtime.set_items i ON i.set_id=s.id GROUP BY s.id ORDER BY s.created_at DESC LIMIT 20')).rows;
   return {counts:total,recent,sets,denominator:'Each set retains its original membership; position, skips and repeated attempts are not mastery.',history:'Imported legacy sessions retain only their latest known check; missing attempts are not reconstructed.'};
  });
 }
 return {getDraft,saveDraft,bookmarks,bookmark,claimGuest,progress};
}
