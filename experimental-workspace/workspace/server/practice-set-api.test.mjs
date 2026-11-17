import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {createApp} from './http-app.mjs';import {createPracticeSets} from './practice-sets.mjs';
async function fixture(t,{fail=false}={}){
 const directory=await mkdtemp(join(tmpdir(),'set-api-')),items=['a','b'].map(id=>({id,title:id,subject:'Math',chapter:'Vectors',section:null,source:{sha256:id.repeat(64),revision:'c'.repeat(40)}}));let calls=0;
 const sets=createPracticeSets({filename:join(directory,'sets.sqlite'),entries:()=>items,exerciseLookup:id=>items.find(item=>item.id===id),startSession:async()=>{calls++;if(fail)throw Error('private renderer details');return {session:{id:randomUUID()}};}});
 const app=createApp({sessions:{},exerciseList:()=>[],practiceSets:sets});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));sets.close();await rm(directory,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+app.address().port;
 const post=(path,body,cookie)=>fetch(base+path,{method:'POST',headers:{Origin:'http://localhost:3100','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 return {base,post,calls:()=>calls};
}
test('set API establishes the existing anonymous owner and projects no source or renderer state',async t=>{
 const f=await fixture(t),key=randomUUID();let response=await f.post('/api/sessions/sets',{selection:{subject:'Math'},requestKey:key});assert.equal(response.status,201);
 const cookie=response.headers.get('set-cookie').split(';')[0],{set}=await response.json();assert.equal(set.total,2);assert.match(response.headers.get('set-cookie'),/Path=\/api\/sessions; HttpOnly/);
 assert.ok(!JSON.stringify(set).includes('sha256'));assert.ok(!JSON.stringify(set).includes('owner_hash'));assert.ok(!JSON.stringify(set).includes('session_token'));
 response=await f.post('/api/sessions/sets',{selection:{subject:'Math'},requestKey:key},cookie);assert.equal((await response.json()).set.id,set.id);
 assert.equal((await fetch(f.base+'/api/sessions/sets/'+set.id)).status,404);
 assert.equal((await f.post('/api/sessions/sets/'+set.id+'/open',{position:0})).status,404);
 assert.equal((await f.post('/api/sessions/sets',{selection:{subject:'Math'},requestKey:randomUUID(),seed:1},cookie)).status,400);
});
test('owned HTTP retries reuse a retained session and stale navigation fails without changing it',async t=>{
 const f=await fixture(t),created=await f.post('/api/sessions/sets',{selection:{subject:'Math'},requestKey:randomUUID()}),cookie=created.headers.get('set-cookie').split(';')[0],{set}=await created.json(),path='/api/sessions/sets/'+set.id;
 const opened=await (await f.post(path+'/open',{position:0,revision:0},cookie)).json();
 const restored=await (await f.post(path+'/open',{position:0,revision:opened.set.revision},cookie)).json();assert.equal(restored.sessionId,opened.sessionId);assert.equal(f.calls(),1);
 assert.equal((await f.post(path+'/position',{position:1,revision:0},cookie)).status,409);
 const moved=await (await f.post(path+'/position',{position:1,revision:opened.set.revision,skip:true},cookie)).json();assert.equal(moved.set.items[0].skipped,true);
 assert.equal((await (await fetch(f.base+path,{headers:{Cookie:cookie}})).json()).set.items[0].sessionId,opened.sessionId);
});
test('uncertain set starts stay explicit, sanitized and non-repeating over HTTP',async t=>{
 const f=await fixture(t,{fail:true}),created=await f.post('/api/sessions/sets',{selection:{subject:'Math'},requestKey:randomUUID()}),cookie=created.headers.get('set-cookie').split(';')[0],{set}=await created.json(),path='/api/sessions/sets/'+set.id+'/open';
 const first=await f.post(path,{position:0},cookie);assert.equal(first.status,409);const error=await first.json();assert.equal(error.error.code,'SET_ITEM_UNCERTAIN');assert.ok(!JSON.stringify(error).includes('private renderer'));
 const second=await f.post(path,{position:0},cookie);assert.equal(second.status,409);assert.equal(f.calls(),1);
});
