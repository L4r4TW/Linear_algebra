import {randomUUID,randomInt} from 'node:crypto';
import {actors,AccountError} from './db.mjs';import {hash} from './crypto.mjs';
import {PracticeSetError} from '../application/server/practice-sets.mjs';
const validId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const binding=entry=>entry?.source?{sha256:entry.source.sha256,revision:entry.source.revision,...(entry.source.contextId?{contextId:entry.source.contextId,versionId:entry.source.versionId}:{})}:null;
function selectionOf(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.entries(input).some(([k,v])=>!['subject','chapter','section'].includes(k)||typeof v!=='string'||!v.trim()||v.length>200||/[\x00-\x1f\x7f]/.test(v))||input.chapter&&!input.subject||input.section&&!input.chapter)throw new PracticeSetError('INVALID_SET_INPUT');
 return {subject:input.subject??null,chapter:input.chapter??null,section:input.section??null};
}
export function createSetStore({db,vault,entries,exerciseLookup,startSession}){
 const context=()=>{const ctx=actors.getStore();if(!ctx?.principalId)throw new AccountError('AUTH_REQUIRED',401);return ctx;};
 async function read(client,id,{lock=false}={}){
  if(!validId(id))throw new PracticeSetError('SET_NOT_FOUND');
  const row=(await client.query('SELECT * FROM practice_runtime.sets WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0];
  if(!row)throw new PracticeSetError('SET_NOT_FOUND');
  row.items=(await client.query('SELECT * FROM practice_runtime.set_items WHERE set_id=$1 ORDER BY position',[id])).rows;return row;
 }
 const available=item=>{const current=binding(exerciseLookup(item.exercise_id));return current!==null&&current.sha256===item.source.sha256&&current.revision===item.source.revision&&(!item.source.contextId||current.contextId===item.source.contextId)&&(!item.source.versionId||current.versionId===item.source.versionId);};
 function present(row){return {id:row.id,revision:Number(row.revision),title:row.title,selection:row.selection,createdAt:new Date(row.created_at).toISOString(),position:row.position,total:row.items.length,
 policy:{maximum:20,order:'exercise-id-ascending',skipped:'retained-for-revisit',positionMeaning:'location-not-correctness'},
 items:row.items.map(item=>({position:item.position,exerciseId:item.exercise_id,title:item.title,sessionId:item.session_id,state:item.state,skipped:item.skipped,available:available(item)}))};}
 async function create(input,{ownerToken,requestKey}){
  const ctx=context();if(ownerToken!==ctx.ownerToken||!validId(requestKey))throw new PracticeSetError('INVALID_SET_INPUT');
  const selection=selectionOf(input),requestDigest=hash(selection);
  return db.current(async client=>{
   // Principal row lock also serializes creation of different request keys at the per-owner limit.
   await client.query('SELECT id FROM practice_runtime.principals WHERE id=$1 FOR UPDATE',[ctx.principalId]);
   const old=(await client.query('SELECT id,request_digest FROM practice_runtime.sets WHERE principal_id=$1 AND request_key=$2',[ctx.principalId,requestKey])).rows[0];
   if(old){if(old.request_digest!==requestDigest)throw new PracticeSetError('SET_CONFLICT');return present(await read(client,old.id));}
   const count=(await client.query('SELECT count(*)::int n FROM practice_runtime.sets WHERE principal_id=$1',[ctx.principalId])).rows[0].n;if(count>=1000)throw new PracticeSetError('SET_LIMIT');
   const members=[...new Map(entries().filter(entry=>Object.entries(selection).every(([k,v])=>v===null||entry[k]===v)).map(entry=>[entry.id,entry])).values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).slice(0,20);
   if(!members.length)throw new PracticeSetError('SET_TOPIC_UNAVAILABLE');
   const id=randomUUID(),title=selection.section??selection.chapter??selection.subject??'Available mathematics';
   await client.query('INSERT INTO practice_runtime.sets(id,principal_id,request_key,request_digest,title,selection) VALUES($1,$2,$3,$4,$5,$6)',[id,ctx.principalId,requestKey,requestDigest,title,JSON.stringify(selection)]);
   for(const [position,entry] of members.entries()){
    const source=binding(exerciseLookup(entry.id));if(!source)throw new PracticeSetError('SET_TOPIC_UNAVAILABLE');
    await client.query('INSERT INTO practice_runtime.set_items(set_id,principal_id,position,exercise_id,title,source) VALUES($1,$2,$3,$4,$5,$6)',[id,ctx.principalId,position,entry.id,entry.title,JSON.stringify(source)]);
   }
   return present(await read(client,id));
  });
 }
 const get=async(id,{ownerToken})=>{if(ownerToken!==context().ownerToken)throw new PracticeSetError('SET_NOT_FOUND');return db.current(async client=>present(await read(client,id)));};
 async function openItem(id,index,{ownerToken,revision}){
  const ctx=context();if(ownerToken!==ctx.ownerToken)throw new PracticeSetError('SET_NOT_FOUND');if(!Number.isInteger(index)||index<0||index>19)throw new PracticeSetError('INVALID_SET_INPUT');
  const claim=await db.current(async client=>{
   const row=await read(client,id,{lock:true});if(revision!==undefined&&Number(row.revision)!==revision)throw new PracticeSetError('SET_CONFLICT');
   const item=row.items[index];if(!item)throw new PracticeSetError('SET_NOT_FOUND');if(!available(item))throw new PracticeSetError('SET_EXERCISE_UNAVAILABLE');
   if(item.state==='ready')return {existing:true,sessionId:item.session_id};
   if(item.state==='uncertain')throw new PracticeSetError('SET_ITEM_UNCERTAIN');
   if(item.state==='opening')throw new PracticeSetError(new Date(item.lease_until).getTime()<Date.now()?'SET_ITEM_UNCERTAIN':'SET_BUSY');
   const plan={id:randomUUID(),seed:randomInt(1,2147483648)},token=randomUUID();
   await client.query("UPDATE practice_runtime.set_items SET state='opening',claim=$1,lease_until=now()+interval '90 seconds',encrypted_plan=$2 WHERE set_id=$3 AND position=$4",[token,vault.seal(plan,'set-plan:'+id+':'+index),id,index]);
   await client.query('UPDATE practice_runtime.sets SET revision=revision+1 WHERE id=$1',[id]);
   return {token,plan,principalId:row.principal_id,exerciseId:item.exercise_id};
  });
  if(claim.existing)return {set:await get(id,{ownerToken}),sessionId:claim.sessionId};
  try{
   const session=await actors.run({...ctx,plannedSession:claim.plan,forcedPrincipalId:claim.principalId},()=>startSession({exerciseId:claim.exerciseId,ownerToken}));
   if(session?.session?.id!==claim.plan.id)throw new PracticeSetError('SET_ITEM_UNCERTAIN');
   await db.current(async client=>{
    await read(client,id,{lock:true});
    const updated=await client.query("UPDATE practice_runtime.set_items SET state='ready',session_id=$1 WHERE set_id=$2 AND position=$3 AND state='opening' AND claim=$4",[claim.plan.id,id,index,claim.token]);
    if(updated.rowCount!==1)throw new PracticeSetError('SET_ITEM_UNCERTAIN');
    await client.query('UPDATE practice_runtime.sets SET revision=revision+1 WHERE id=$1',[id]);
   });
  }catch{
   await db.current(client=>client.query("UPDATE practice_runtime.set_items SET state='uncertain' WHERE set_id=$1 AND position=$2 AND state='opening' AND claim=$3",[id,index,claim.token]));
   throw new PracticeSetError('SET_ITEM_UNCERTAIN');
  }
  return {set:await get(id,{ownerToken}),sessionId:claim.plan.id};
 }
 async function move(id,{ownerToken,position,revision,skip=false}){
  if(ownerToken!==context().ownerToken)throw new PracticeSetError('SET_NOT_FOUND');
  if(!Number.isInteger(position)||!Number.isInteger(revision)||typeof skip!=='boolean')throw new PracticeSetError('INVALID_SET_INPUT');
  return db.current(async client=>{
   const row=await read(client,id,{lock:true});if(Number(row.revision)!==revision)throw new PracticeSetError('SET_CONFLICT');if(position<0||position>=row.items.length)throw new PracticeSetError('INVALID_SET_INPUT');
   if(skip)await client.query('UPDATE practice_runtime.set_items SET skipped=true WHERE set_id=$1 AND position=$2',[id,row.position]);
   await client.query('UPDATE practice_runtime.sets SET position=$1,revision=revision+1 WHERE id=$2',[position,id]);return present(await read(client,id));
  });
 }
 return {create,get,openItem,move};
}
