import {actors} from '/service/accounts/db.mjs';
import assert from 'node:assert/strict';import pg from 'pg';import {writeFile,mkdir,readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {createPublishedCatalog} from '/service/accounts/published-catalog.mjs';import {createAccountRuntime} from '/service/accounts/runtime.mjs';import {runtimeFingerprint} from '/service/application/server/catalog-compatibility.mjs';
const database=process.env.ADAPTER_TEST_DATABASE;if(!/^opl_importer_test_[a-z0-9]+$/.test(database??''))throw Error('DISPOSABLE_CATALOG_REQUIRED');
const pool=new pg.Pool({host:'linear-algebra-opl-catalog-database-1',database,user:'catalog_player',max:1});
const rendererUrl='http://linear-algebra-calculus-renderer-1:3000',profile=JSON.parse(await readFile('/service/application/server/compatibility-profile.json','utf8'));
const catalog=createPublishedCatalog({query:async()=>(await pool.query('SELECT catalog_backend.player_catalog() AS snapshot')).rows[0].snapshot,rendererUrl,runtimeDigest:runtimeFingerprint(),sourceRevision:profile.sourceRevision});
const runtime=await createAccountRuntime({publishedCatalog:catalog,rendererUrl,legacyDirectory:null});await new Promise(r=>runtime.app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+runtime.app.address().port;
let cookie;async function request(path,{method='GET',body,foreign=false}={}){const response=await fetch(base+path,{method,headers:{Origin:'http://localhost:3100',...(cookie&&!foreign?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json','Idempotency-Key':randomUUID()}:{})},...(body?{body:JSON.stringify(body)}:{})});const value=await response.json();if(!foreign&&response.headers.getSetCookie().length)cookie=response.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');return {status:response.status,value};}
try{
 const list=await request('/api/exercises'),entry=list.value.exercises.find(e=>e.title==='Derivative adapter fixture');assert.ok(entry);assert.ok(!/sourceFilePath|sha256|contextId/.test(JSON.stringify(entry)));
 const started=await request('/api/sessions',{method:'POST',body:{exerciseId:entry.id}});assert.equal(started.status,201);const id=started.value.session.id,seed=started.value.session.seed;
 const actor=(await runtime.accounts.resolveCookies(cookie)).actor;const before=await actors.run(actor,()=>runtime.store.read(id));assert.equal(before._source.contextId,catalog.get(entry.id).source.contextId);
 const foreign=await request('/api/sessions/'+id,{foreign:true});assert.ok([403,404].includes(foreign.status));
 const checked=await request('/api/sessions/'+id+'/answers',{method:'POST',body:{answers:[]}});assert.equal(checked.status,200);
 const restored=await request('/api/sessions/'+id);assert.equal(restored.status,200);assert.equal(restored.value.session.id,id);assert.equal(restored.value.session.exerciseId,entry.id);assert.equal(restored.value.session.seed,seed);
 const after=await actors.run(actor,()=>runtime.store.read(id));assert.equal(after.seed,before.seed);assert.equal(after.submissionCount,1);
 const set=await request('/api/sessions/sets',{method:'POST',body:{selection:{subject:entry.subject,chapter:entry.chapter,section:entry.section},requestKey:randomUUID()}});assert.equal(set.status,201);
 await mkdir('/artifacts',{recursive:true});await writeFile('/artifacts/player-probe.json',JSON.stringify({complete:true,syntheticApprovalsOnlyInDisposableCatalog:true,realPrivateRenderer:true,databaseUUIDListed:true,privateBindingsExcluded:true,ownedSessionStarted:true,grading:true,sameSessionRestoration:true,foreignOwnerDenied:true,sectionPracticeSet:true},null,2)+'\n');console.log('PUBLISHED_CATALOG_PLAYER_PROBE_PASSED');
}finally{runtime.app.closeAllConnections();await new Promise(r=>runtime.app.close(r));await runtime.db.close();await pool.end();}
