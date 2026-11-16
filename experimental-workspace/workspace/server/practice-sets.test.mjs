import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomBytes,randomUUID} from 'node:crypto';
import {createPracticeSets} from './practice-sets.mjs';
async function setup(t,start){
 const directory=await mkdtemp(join(tmpdir(),'practice-sets-')),filename=join(directory,'sets.sqlite'),ownerToken=randomBytes(32).toString('base64url'),other=randomBytes(32).toString('base64url');
 let live=true;const exercises=[{id:'a',title:'First',subject:'Math',chapter:'Vectors',section:null,source:{sha256:'a'.repeat(64),revision:'b'.repeat(40)}},{id:'b',title:'Second',subject:'Math',chapter:'Vectors',section:null,source:{sha256:'c'.repeat(64),revision:'b'.repeat(40)}}];
 const configuration={filename,entries:()=>live?exercises:[],exerciseLookup:id=>live?exercises.find(e=>e.id===id):null,startSession:start??(async()=>({session:{id:randomUUID()}}))};
 const services=[];const open=()=>{const service=createPracticeSets(configuration);services.push(service);return service;};t.after(async()=>{for(const service of services)service.close();await rm(directory,{recursive:true,force:true});});
 return {service:open(),open,ownerToken,other,withdraw:()=>{live=false;}};
}
test('sets persist immutable order and owner identity across restarts and idempotent creation',async t=>{
 const f=await setup(t),requestKey=randomUUID(),set=f.service.create({subject:'Math'},{ownerToken:f.ownerToken,requestKey});
 assert.deepEqual(set.items.map(item=>item.exerciseId),['a','b']);assert.equal(f.open().create({subject:'Math'},{ownerToken:f.ownerToken,requestKey}).id,set.id);
 assert.throws(()=>f.service.create({subject:'Other'},{ownerToken:f.ownerToken,requestKey}),/SET_CONFLICT/);
 assert.throws(()=>f.service.get(set.id,{ownerToken:f.other}),/SET_NOT_FOUND/);assert.ok(!JSON.stringify(set).includes('owner_hash'));
});
test('independent database connections fence item creation; a lost response retries the same saved session',async t=>{
 let complete,calls=0;const f=await setup(t,async()=>{calls++;await new Promise(resolve=>complete=resolve);return {session:{id:randomUUID()}};});
 const set=f.service.create({subject:'Math'},{ownerToken:f.ownerToken,requestKey:randomUUID()});
 const pending=f.service.openItem(set.id,0,{ownerToken:f.ownerToken});await assert.rejects(()=>f.open().openItem(set.id,0,{ownerToken:f.ownerToken}),/SET_BUSY/);complete();
 const first=await pending,again=await f.open().openItem(set.id,0,{ownerToken:f.ownerToken});assert.equal(first.sessionId,again.sessionId);assert.equal(calls,1);
});
test('uncertain renderer starts never silently generate another session',async t=>{
 let calls=0;const f=await setup(t,async()=>{calls++;throw Error('response lost');});
 const set=f.service.create({subject:'Math'},{ownerToken:f.ownerToken,requestKey:randomUUID()});
 await assert.rejects(()=>f.service.openItem(set.id,0,{ownerToken:f.ownerToken}),/SET_ITEM_UNCERTAIN/);
 await assert.rejects(()=>f.open().openItem(set.id,0,{ownerToken:f.ownerToken}),/SET_ITEM_UNCERTAIN/);assert.equal(calls,1);
});
test('position is optimistic, skipped items remain, and withdrawal keeps history',async t=>{
 const f=await setup(t),set=f.service.create({subject:'Math'},{ownerToken:f.ownerToken,requestKey:randomUUID()});
 const next=f.service.move(set.id,{ownerToken:f.ownerToken,position:1,revision:set.revision,skip:true});assert.equal(next.items[0].skipped,true);assert.equal(next.position,1);
 assert.throws(()=>f.service.move(set.id,{ownerToken:f.ownerToken,position:0,revision:set.revision}),/SET_CONFLICT/);
 f.withdraw();assert.equal(f.service.get(set.id,{ownerToken:f.ownerToken}).items.length,2);assert.ok(f.service.get(set.id,{ownerToken:f.ownerToken}).items.every(item=>!item.available));
 await assert.rejects(()=>f.service.openItem(set.id,1,{ownerToken:f.ownerToken}),/SET_EXERCISE_UNAVAILABLE/);
});
