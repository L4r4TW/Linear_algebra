import test from 'node:test';import assert from 'node:assert/strict';import {createAdmission} from './admission.mjs';
test('admission caps active work, drains in order and releases exactly once',async()=>{
 const pool=createAdmission({maximum:1,waiting:2}),first=await pool.acquire(),order=[];
 const second=pool.acquire().then(release=>{order.push(2);return release;}),third=pool.acquire().then(release=>{order.push(3);return release;});
 await assert.rejects(()=>pool.acquire(),error=>error.code==='PRACTICE_BUSY');assert.equal(pool.snapshot().active,1);assert.equal(pool.snapshot().waiting,2);
 first();first();const next=await second;assert.deepEqual(order,[2]);next();(await third)();assert.deepEqual(order,[2,3]);assert.equal(pool.snapshot().active,0);
});
test('expired and disconnected queued requests never run later',async()=>{
 const pool=createAdmission({maximum:1,waiting:2,waitMs:15}),first=await pool.acquire(),controller=new AbortController();
 const cancelled=pool.acquire({signal:controller.signal}),expired=pool.acquire();controller.abort();
 await assert.rejects(()=>cancelled,error=>error.code==='REQUEST_CANCELLED');await assert.rejects(()=>expired,error=>error.code==='PRACTICE_BUSY');first();
 assert.equal(pool.snapshot().active,0);assert.equal(pool.snapshot().waiting,0);assert.equal(pool.snapshot().expired,1);
});
test('rate windows and their cache remain bounded without evicting active limits',()=>{
 let now=0;const pool=createAdmission({maxBuckets:1,now:()=>now});pool.checkRate('one',{limit:1,windowMs:100});
 assert.throws(()=>pool.checkRate('one',{limit:1}),error=>error.code==='ACCOUNT_RATE_LIMITED');
 assert.throws(()=>pool.checkRate('two'),error=>error.code==='PRACTICE_BUSY');now=101;pool.checkRate('two');
 const metrics=JSON.stringify(pool.snapshot());assert.ok(!metrics.includes('one'));assert.ok(!metrics.includes('two'));assert.equal(pool.snapshot().rateLimited,1);
});

test('active work keeps its lease after disconnect until the operation finishes',async()=>{
 const pool=createAdmission({maximum:1,waiting:1}),controller=new AbortController();let release,entered;
 const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 const first=pool.run(async()=>{entered();await gate;},{signal:controller.signal});await started;controller.abort();
 assert.equal(pool.snapshot().active,1);let ran=false;const next=pool.run(()=>{ran=true;});
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(ran,false);assert.equal(pool.snapshot().waiting,1);
 release();await Promise.all([first,next]);assert.equal(ran,true);assert.equal(pool.snapshot().active,0);
});
