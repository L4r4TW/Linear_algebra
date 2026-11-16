import {readFileSync} from 'node:fs';
import {json,sql,literal,preflight} from './db.mjs';
import {git,ROOT,PIN,SCOPE,hash} from './inventory.mjs';
import {PARSER} from './metadata.mjs';
export function loadInventory(path='/state/metadata.json'){
 const data=JSON.parse(readFileSync(path,'utf8'));
 if(data.coverageComplete!==true||JSON.stringify(data.scope)!==JSON.stringify(SCOPE)||data.parserVersion!==PARSER||!data.entries.length)throw Error('COMPLETE_METADATA_INVENTORY_REQUIRED');
 const digest=hash(JSON.stringify({revision:data.revision,tree:data.treeOid,scope:SCOPE,entries:data.entries.map(({path,oid,sha256})=>({path,oid,sha256}))}));
 if(digest!==data.manifestDigest)throw Error('MANIFEST_DIGEST_MISMATCH');
 if(new Set(data.entries.map(e=>e.path)).size!==data.entries.length)throw Error('DUPLICATE_INVENTORY_PATH');
 return data;
}
export function open(data,{registry='openwebwork-opl',url='https://github.com/openwebwork/webwork-open-problem-library'}={}){
 preflight();
 return sql(`SELECT catalog.open_import(${[registry,url,data.revision,data.treeOid,data.manifestDigest,data.scannerVersion,data.parserVersion].map(literal).join(',')},${data.entries.length});`);
}
export function status(id){return json(`SELECT jsonb_build_object('id',r.id,'state',r.state,'sealed',r.inventory_sealed,'staged',(SELECT count(*) FROM catalog.import_entries WHERE run_id=r.id),'pending',(SELECT count(*) FROM catalog.import_entries WHERE run_id=r.id AND state='staged'),'report',r.report) FROM catalog.import_runs r WHERE r.id=${literal(id)}::uuid;`);}
export function stage(id,entries){return Number(sql(`SELECT catalog.stage_import_entries(${literal(id)}::uuid,${literal(entries)}::jsonb);`));}
export function seal(id){sql(`SELECT catalog.seal_import(${literal(id)}::uuid);`);}
export function reconcile(id,batch=500){return Number(sql(`SELECT catalog.reconcile_import_batch(${literal(id)}::uuid,${batch});`));}
export function complete(id){return json(`SELECT catalog.complete_import(${literal(id)}::uuid);`);}
export function runImport(data,{batch=500,stopAfterBatches=Infinity,registry,url,verifyGit=true}={}){
 if(!Number.isInteger(batch)||batch<1||batch>2000)throw Error('BATCH_SIZE_1_TO_2000_REQUIRED');
 if(verifyGit){
  if(git(ROOT,['rev-parse','HEAD']).toString().trim()!==data.revision)throw Error('PIN_HEAD_MISMATCH');
  const previous=sql("SELECT s.commit_oid FROM catalog.import_heads h JOIN catalog.repositories p ON p.id=h.repository_id JOIN catalog.import_runs r ON r.id=h.run_id JOIN catalog.snapshots s ON s.id=r.snapshot_id WHERE p.registry_key='openwebwork-opl';");
  if(previous&&previous!==data.revision){try{git(ROOT,['merge-base','--is-ancestor',previous,data.revision]);}catch{throw Error('HISTORICAL_OR_DIVERGENT_SNAPSHOT_REQUIRES_REVIEW');}}
 }
 const id=open(data,{registry,url});let state=status(id),batches=0;
 if(state.state==='completed')return {...state.report,replayed:true};
 if(!state.sealed){
  // Query committed paths so out-of-order or repeated staging also resumes safely.
  const existing=new Set(json(`SELECT coalesce(jsonb_agg(path),'[]') FROM catalog.import_entries WHERE run_id=${literal(id)}::uuid;`));
  const remaining=data.entries.filter(entry=>!existing.has(entry.path));
  for(let i=0;i<remaining.length;i+=batch){
   try{stage(id,remaining.slice(i,i+batch));}catch(error){throw Error('STAGE_BATCH_FAILED run='+id+' first='+JSON.stringify(remaining[i]?.path)+' last='+JSON.stringify(remaining[Math.min(i+batch,remaining.length)-1]?.path)+' '+error.message);}batches++;
   if(batches>=stopAfterBatches)return {runId:id,interrupted:true,phase:'staging',...status(id)};
  }
  seal(id);
 }
 while(reconcile(id,batch)>0){batches++;console.error('Committed reconciliation batch '+batches);if(batches>=stopAfterBatches)return {runId:id,interrupted:true,phase:'reconciliation',...status(id)};}
 return complete(id);
}
