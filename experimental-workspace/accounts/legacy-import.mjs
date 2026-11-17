import {readdir,readFile,stat} from 'node:fs/promises';import {join} from 'node:path';import {DatabaseSync} from 'node:sqlite';
import {actors,AccountError} from './db.mjs';import {hash} from './crypto.mjs';
export function createLegacyImport({directory,db,vault,store}){
 return async function importLegacy(guest=actors.getStore()){
  let files;try{files=await readdir(directory);}catch(error){if(error.code==='ENOENT')return {sessions:0,sets:0};throw new AccountError('LEGACY_IMPORT_UNAVAILABLE',503);}
  if(files.length>10000)throw new AccountError('LEGACY_IMPORT_REQUIRES_OPERATOR',409);
  let sessions=0,sets=0;const ownRecords=new Map();
  for(const name of files.filter(name=>/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.json$/.test(name))){
   let record;try{const path=join(directory,name);if((await stat(path)).size>2097152)continue;record=JSON.parse(await readFile(path,'utf8'));}catch{continue;}
   if(record.ownerHash!==hash(guest.ownerToken))continue;
   await store.importLegacy(record);ownRecords.set(record.id,record);sessions++;
  }
  const filename=join(directory,'practice-sets.sqlite');try{await stat(filename);}catch(error){if(error.code==='ENOENT')return {sessions,sets};throw new AccountError('LEGACY_IMPORT_UNAVAILABLE',503);}
  const sqlite=new DatabaseSync(filename,{readOnly:true});
  try{
   const rows=sqlite.prepare('SELECT * FROM practice_sets WHERE owner_hash=? LIMIT 1001').all(hash(guest.ownerToken));if(rows.length>1000)throw new AccountError('LEGACY_IMPORT_REQUIRES_OPERATOR');
   for(const row of rows){
    let set;try{set=JSON.parse(row.payload);}catch{throw new AccountError('LEGACY_IMPORT_UNAVAILABLE',503);}
    if(!Array.isArray(set.items)||!set.items.length||set.items.length>20)throw new AccountError('LEGACY_IMPORT_UNAVAILABLE',503);
    await db.current(async client=>{
     const existing=(await client.query('SELECT id FROM practice_runtime.sets WHERE id=$1',[row.id])).rows[0];if(existing)return;
     await client.query('INSERT INTO practice_runtime.sets(id,principal_id,request_key,request_digest,revision,title,selection,position,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[row.id,guest.principalId,row.request_key,row.request_digest,row.revision,set.title,JSON.stringify(set.selection),set.position,set.createdAt]);
     for(const [position,item] of set.items.entries()){
      if(item.sessionId&&!ownRecords.has(item.sessionId))throw new AccountError('LEGACY_IMPORT_UNAVAILABLE',503);
      const state=item.state==='ready'?'ready':item.state==='not-started'?'not-started':'uncertain';
      await client.query('INSERT INTO practice_runtime.set_items(set_id,principal_id,position,exercise_id,title,source,session_id,state,skipped) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[row.id,guest.principalId,position,item.exerciseId,item.title,JSON.stringify(item.source),state==='ready'?item.sessionId:null,state,Boolean(item.skipped)]);
     }
    });sets++;
   }
  }finally{sqlite.close();}
  return {sessions,sets};
 };
}
