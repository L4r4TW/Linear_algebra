import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

export class PracticeSetError extends Error{constructor(code){super(code);this.code=code;}}
const validUuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
function ownerKey(token){if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new PracticeSetError('SET_NOT_FOUND');return digest(token);}
function selector(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.entries(input).some(([key,value])=>!['subject','chapter','section'].includes(key)||typeof value!=='string'||!value.trim()||value.length>200||/[\x00-\x1f\x7f]/.test(value))||input.chapter&&!input.subject||input.section&&!input.chapter)throw new PracticeSetError('INVALID_SET_INPUT');
 return {subject:input.subject??null,chapter:input.chapter??null,section:input.section??null};
}
const binding=entry=>entry?.source&&typeof entry.source.sha256==='string'&&typeof entry.source.revision==='string'?{sha256:entry.source.sha256,revision:entry.source.revision}:null;
export function createPracticeSets({filename,entries,exerciseLookup,startSession,now=Date.now}){
 if(!isAbsolute(filename)||typeof entries!=='function'||typeof exerciseLookup!=='function'||typeof startSession!=='function')throw new PracticeSetError('INVALID_SET_CONFIGURATION');
 mkdirSync(dirname(filename),{recursive:true,mode:0o700});const db=new DatabaseSync(filename);chmodSync(filename,0o600);
 db.exec("PRAGMA journal_mode=WAL;PRAGMA busy_timeout=1000;CREATE TABLE IF NOT EXISTS practice_sets(id TEXT PRIMARY KEY,owner_hash TEXT NOT NULL,request_key TEXT NOT NULL,request_digest TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,UNIQUE(owner_hash,request_key));");
 const load=db.prepare('SELECT * FROM practice_sets WHERE id=? AND owner_hash=?');
 function transaction(work){db.exec('BEGIN IMMEDIATE');try{const value=work();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}
 function read(id,token){
  if(!validUuid(id))throw new PracticeSetError('SET_NOT_FOUND');const row=load.get(id,ownerKey(token));if(!row)throw new PracticeSetError('SET_NOT_FOUND');
  return {...row,value:JSON.parse(row.payload)};
 }
 function save(row){row.revision++;db.prepare('UPDATE practice_sets SET revision=?,payload=? WHERE id=? AND owner_hash=?').run(row.revision,JSON.stringify(row.value),row.id,row.owner_hash);}
 function available(item){return JSON.stringify(binding(exerciseLookup(item.exerciseId)))===JSON.stringify(item.source)&&item.source!==null;}
 function present(row){
  const set=row.value;return {id:row.id,revision:row.revision,title:set.title,selection:set.selection,createdAt:set.createdAt,position:set.position,total:set.items.length,
   policy:{maximum:20,order:'exercise-id-ascending',skipped:'retained-for-revisit',positionMeaning:'location-not-correctness'},
   items:set.items.map((item,index)=>({position:index,exerciseId:item.exerciseId,title:item.title,sessionId:item.sessionId,state:item.state,skipped:item.skipped,available:available(item)}))};
 }
 function create(input,{ownerToken,requestKey}){
  const selection=selector(input),owner=ownerKey(ownerToken);if(!validUuid(requestKey))throw new PracticeSetError('INVALID_SET_INPUT');
  const requestDigest=digest(selection);
  return transaction(()=>{
   const old=db.prepare('SELECT * FROM practice_sets WHERE owner_hash=? AND request_key=?').get(owner,requestKey);
   if(old){if(old.request_digest!==requestDigest)throw new PracticeSetError('SET_CONFLICT');return present({...old,value:JSON.parse(old.payload)});}
   if(db.prepare('SELECT count(*) n FROM practice_sets WHERE owner_hash=?').get(owner).n>=1000)throw new PracticeSetError('SET_LIMIT');
   const members=[...new Map(entries().filter(entry=>Object.entries(selection).every(([key,value])=>value===null||entry[key]===value)).map(entry=>[entry.id,entry])).values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).slice(0,20);
   if(!members.length)throw new PracticeSetError('SET_TOPIC_UNAVAILABLE');
   const items=members.map(entry=>{const source=binding(exerciseLookup(entry.id));if(!source)throw new PracticeSetError('SET_TOPIC_UNAVAILABLE');return {exerciseId:entry.id,title:entry.title,source,sessionId:null,state:'not-started',skipped:false,claim:null,startedAt:null};});
   const value={createdAt:new Date(now()).toISOString(),selection,title:selection.section??selection.chapter??selection.subject??'Available mathematics',position:0,items},id=randomUUID();
   db.prepare('INSERT INTO practice_sets VALUES(?,?,?,?,?,?)').run(id,owner,requestKey,requestDigest,0,JSON.stringify(value));
   return present(read(id,ownerToken));
  });
 }
 function get(id,{ownerToken}){return present(read(id,ownerToken));}
 async function openItem(id,index,{ownerToken,revision}){
  if(!Number.isInteger(index)||index<0||index>19)throw new PracticeSetError('INVALID_SET_INPUT');
  const claim=transaction(()=>{
   const row=read(id,ownerToken);if(revision!==undefined&&row.revision!==revision)throw new PracticeSetError('SET_CONFLICT');const item=row.value.items[index];if(!item)throw new PracticeSetError('SET_NOT_FOUND');
   if(!available(item))throw new PracticeSetError('SET_EXERCISE_UNAVAILABLE');
   if(item.state==='ready')return {sessionId:item.sessionId,existing:true};
   if(item.state==='uncertain')throw new PracticeSetError('SET_ITEM_UNCERTAIN');
   if(item.state==='opening')throw new PracticeSetError(now()-item.startedAt>60000?'SET_ITEM_UNCERTAIN':'SET_BUSY');
   item.state='opening';item.claim=randomUUID();item.startedAt=now();save(row);return {exerciseId:item.exerciseId,claim:item.claim};
  });
  if(claim.existing)return {set:get(id,{ownerToken}),sessionId:claim.sessionId};
  let sessionId;
  try{
   const result=await startSession({exerciseId:claim.exerciseId,ownerToken});sessionId=result?.session?.id;
   if(!validUuid(sessionId))throw new PracticeSetError('SET_ITEM_UNCERTAIN');
   transaction(()=>{const row=read(id,ownerToken),item=row.value.items[index];if(item.claim!==claim.claim||item.state!=='opening')throw new PracticeSetError('SET_ITEM_UNCERTAIN');item.state='ready';item.sessionId=sessionId;save(row);});
  }catch(error){
   transaction(()=>{const row=read(id,ownerToken),item=row.value.items[index];if(item.claim===claim.claim&&item.state==='opening'){item.state='uncertain';save(row);}});
   throw new PracticeSetError('SET_ITEM_UNCERTAIN');
  }
  return {set:get(id,{ownerToken}),sessionId};
 }
 function move(id,{ownerToken,position,revision,skip=false}){
  if(!Number.isInteger(position)||!Number.isInteger(revision)||typeof skip!=='boolean')throw new PracticeSetError('INVALID_SET_INPUT');
  return transaction(()=>{const row=read(id,ownerToken);if(row.revision!==revision)throw new PracticeSetError('SET_CONFLICT');if(position<0||position>=row.value.items.length)throw new PracticeSetError('INVALID_SET_INPUT');
   if(skip)row.value.items[row.value.position].skipped=true;row.value.position=position;save(row);return present(row);});
 }
 return {create,get,openItem,move,close:()=>db.close()};
}
