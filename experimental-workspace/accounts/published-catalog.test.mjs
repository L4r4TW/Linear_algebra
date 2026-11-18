import {readFileSync} from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';import {createPublishedCatalog,projectPublished,mergeExerciseLists} from './published-catalog.mjs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),revision='a'.repeat(40),runtimeDigest='b'.repeat(64);
const context={id:id(1),certified:true,runtimeDigest,attestation:{pgTrackedClean:true,build:'fixture'}};
const row={id:id(2),source_version_id:id(3),revision,sha256:'c'.repeat(64),context_id:id(1),path:'OpenProblemLibrary/Example/problem.pg',metadata:{title:'Derivative practice',normalized:['Calculus','Differentiation','Chain rule'],authors:['Author'],raw:{private:'hidden'}}};
const setup=(options={})=>createPublishedCatalog({query:async()=>({context,entries:[row],managedLegacyIds:[]}),rendererUrl:'http://private',runtimeDigest,sourceRevision:revision,fetcher:async()=>Response.json(context.attestation),...options});
test('only published same-context sources project to server-controlled paths; public DTO excludes private bindings',async()=>{const c=setup();await c.refresh();assert.equal(c.get(id(2)).renderer.sourceFilePath,'Library/Example/problem.pg');assert.equal(c.get(id(2)).source.versionId,id(3));assert.equal(c.list()[0].section,null);assert.ok(!/path|sha256|contextId|private|source_version_id|renderer/i.test(JSON.stringify(c.list())));});
test('empty publication authorizes no imported source and never contacts PG',async()=>{let called=false;const c=setup({query:async()=>({entries:[],managedLegacyIds:[]}),fetcher:async()=>{called=true;throw Error();}});await c.refresh();assert.equal(c.get(id(2)),undefined);assert.equal(called,false);});
test('renderer mismatch and database outages fail closed; retry restores the same catalog without new sessions',async()=>{let state='mismatch';const c=setup({query:async()=>{if(state==='outage')throw Error('private connection');return {context,entries:[row],managedLegacyIds:[]};},fetcher:async()=>Response.json(state==='mismatch'?{}:context.attestation)});await c.refresh();assert.throws(()=>c.get(id(2)),{code:'NETWORK_ERROR'});state='good';await c.refresh();assert.equal(c.get(id(2)).id,id(2));state='outage';await c.refresh();assert.deepEqual(c.list(),[]);assert.throws(()=>c.get(id(2)),{code:'NETWORK_ERROR'});});
test('withdrawals remove authorization on the next refresh',async()=>{let active=true;const c=setup({query:async()=>({context,entries:active?[row]:[],managedLegacyIds:[]})});await c.refresh();assert.ok(c.get(id(2)));active=false;await c.refresh();assert.equal(c.get(id(2)),undefined);});
test('path traversal, ambiguous IDs, unclean provenance, source changes and runtime changes cannot authorize',async()=>{for(const change of [{entries:[{...row,path:'OpenProblemLibrary/../secret.pg'}]},{entries:[row,row]},{context:{...context,certified:false}},{context:{...context,runtimeDigest:'d'.repeat(64)}},{entries:[{...row,revision:'d'.repeat(40)}]}]){const c=setup({query:async()=>({context,entries:[row],managedLegacyIds:[],...change})});await c.refresh();assert.deepEqual(c.list(),[]);assert.throws(()=>c.get(id(2)),{code:'NETWORK_ERROR'});}assert.throws(()=>projectPublished({...row,path:'Contrib/a\\b.pg'},{context,sourceRevision:revision}));});
test('concurrent refreshes coalesce and callers cannot mutate authorization',async()=>{let calls=0,release;const barrier=new Promise(r=>release=r);const c=setup({query:async()=>{calls++;await barrier;return {context,entries:[row],managedLegacyIds:[]};}});const requests=[c.refresh(),c.refresh(),c.refresh()];release();await Promise.all(requests);assert.equal(calls,1);c.get(id(2)).renderer.sourceFilePath='Contrib/other.pg';assert.equal(c.get(id(2)).renderer.sourceFilePath,'Library/Example/problem.pg');});

test('publication does not show both a legacy alias and its permanent UUID as different exercises',()=>{const source={revision,sha256:'c'.repeat(64)},entries=new Map([['legacy',{source}],[id(2),{source}]]);const legacy=[{id:'legacy'},{id:'other'}],published=[{id:id(2)}];assert.deepEqual(mergeExerciseLists(legacy,published,id=>entries.get(id)).map(e=>e.id),['other',id(2)]);assert.ok(entries.get('legacy'));assert.deepEqual(mergeExerciseLists(legacy,[],id=>entries.get(id)),legacy);});

test('withdrawal cannot reauthorize a published exercise through its legacy alias',async()=>{
 const legacy={id:'legacy-one',source:{revision,sha256:row.sha256,path:row.path}},source={...row};
 let snapshot={context,entries:[source],managedLegacyIds:['legacy-one']};
 const c=setup({query:async()=>snapshot});await c.refresh();assert.equal(c.legacy(legacy).id,'legacy-one');assert.equal(c.legacy(legacy).source.versionId,row.source_version_id);
 snapshot={context,entries:[],managedLegacyIds:['legacy-one']};await c.refresh();assert.equal(c.legacy(legacy),undefined);
 assert.ok(c.legacy({...legacy,id:'independent-prototype'}));
});
test('unknown or unavailable publication authority never bypasses managed legacy withdrawal',async()=>{
 let broken=true;const c=setup({query:async()=>{if(broken)throw Error('offline');return {context,entries:[row],managedLegacyIds:['legacy-one']};}});
 const legacy={id:'legacy-one',source:{revision,sha256:row.sha256,path:row.path}};
 await c.refresh();assert.throws(()=>c.legacy(legacy),{code:'NETWORK_ERROR'});
 broken=false;await c.refresh();assert.ok(c.legacy(legacy));broken=true;await c.refresh();assert.throws(()=>c.legacy(legacy),{code:'NETWORK_ERROR'});
 assert.throws(()=>c.legacy({...legacy,id:'independent-prototype'}),{code:'NETWORK_ERROR'});
});
test('identical bytes at different source paths cannot substitute for legacy source identity',async()=>{
 const c=setup({query:async()=>({context,entries:[row],managedLegacyIds:['legacy-one']})});await c.refresh();
 assert.equal(c.legacy({id:'legacy-one',source:{revision,sha256:row.sha256,path:'OpenProblemLibrary/different/problem.pg'}}),undefined);
});

test('older projections without alias authority cannot grant practice',async()=>{const c=setup({query:async()=>({context,entries:[]})});await c.refresh();assert.equal(c.status().available,false);assert.throws(()=>c.legacy({id:'legacy-one'}),{code:'NETWORK_ERROR'});});

test('friendly titles are bound to the reviewed source version and hash, without granting admission',()=>{
 const display=JSON.parse(readFileSync(new URL('./reviewed-display.json',import.meta.url),'utf8'))[0];
 const input={...row,source_version_id:display.sourceVersionId,revision:display.revision,sha256:display.sha256};
 assert.equal(projectPublished(input,{context,sourceRevision:display.revision}).title,display.title);
 assert.equal(projectPublished({...input,sha256:'e'.repeat(64)},{context,sourceRevision:display.revision}).title,row.metadata.title);
});

test('local tested-pilot status is explicit and still subject to the normal renderer/source guards',async()=>{
 const c=setup({query:async()=>({context,entries:[{...row,review_status:'tested-local-pilot'}],managedLegacyIds:[]})});await c.refresh();
 assert.equal(c.list()[0].reviewStatus,'tested-local-pilot');assert.equal(c.get(row.id).source.versionId,row.source_version_id);
 const broken=setup({query:async()=>({context:{...context,certified:false},entries:[{...row,review_status:'tested-local-pilot'}],managedLegacyIds:[]})});await broken.refresh();assert.equal(broken.status().available,false);
});

test('a 400-exercise tested catalog retains per-source authorization and rejects oversized snapshots',async()=>{
 const rows=Array.from({length:400},(_,n)=>({...row,id:id(n+100),source_version_id:id(n+1000),review_status:'tested-local-pilot'}));
 const catalog=setup({query:async()=>({context,entries:rows,managedLegacyIds:[]})});await catalog.refresh();assert.equal(catalog.list().length,400);assert.ok(catalog.get(rows[399].id));
 const oversized=setup({query:async()=>({context,entries:Array.from({length:1001},(_,n)=>({...row,id:id(n+100)})),managedLegacyIds:[]})});await oversized.refresh();assert.equal(oversized.status().available,false);
 const grouped=projectPublished({...row,metadata:{...row.metadata,practiceCollection:{id:'calculus',title:'Differential calculus'},practiceTopic:'Derivative definition'}},{context,sourceRevision:revision});assert.equal(grouped.subject,'Differential calculus');assert.equal(grouped.chapter,'Derivative definition');
});
