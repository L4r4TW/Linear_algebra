import test from 'node:test';
import assert from 'node:assert/strict';
import {createHome} from './server.mjs';
const id='00000000-0000-0000-0000-000000000001';
const metadata={practice:async()=>[{id:'dot-product-01',title:'Dot products',chapter:'Vectors'}],overview:async()=>({practice:{count:6}}),search:async()=>({entries:[]}),topics:async()=>({topics:[]})};
async function app(t,fetcher){
 const server=createHome({origin:'http://localhost:3105',catalog:metadata,fetcher});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 return 'http://127.0.0.1:'+server.address().port;
}
test('discovery is GET-only and rejects cross-origin API access and arbitrary proxy targets',async t=>{
 const base=await app(t,()=>{throw Error('Unexpected upstream request');});
 assert.equal((await fetch(base+'/api/discovery/search?q=a&q=b')).status,400);
 assert.equal((await fetch(base+'/api/discovery/search',{method:'POST',headers:{Origin:'http://localhost:3105'}})).status,405);
 assert.equal((await fetch(base+'/api/discovery/overview',{headers:{Origin:'https://attacker.invalid'}})).status,403);
 assert.equal((await fetch(base+'/api/discovery/overview',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
 assert.equal((await fetch(base+'/proxy?url=http://attacker.invalid')).status,404);
});
test('fixed practice proxy forwards ownership, only trusted origin, and preserved cookie paths',async t=>{
 const base=await app(t,async(url,options)=>{
  assert.equal(url,'http://linear-algebra-experimental-workspace-1:3000/api/sessions');
  assert.equal(options.headers.Origin,'http://localhost:3100');assert.equal(options.headers.Cookie,'la_experiment_owner=private');
  assert.deepEqual(JSON.parse(options.body),{exerciseId:'dot-product-01'});
  return Response.json({session:{id,exerciseId:'dot-product-01'}},{status:201,headers:{'Set-Cookie':'la_experiment_owner=private; Path=/api/sessions; HttpOnly; SameSite=Strict'}});
 });
 assert.equal((await fetch(base+'/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 const response=await fetch(base+'/api/sessions',{method:'POST',headers:{Origin:'http://localhost:3105','Content-Type':'application/json',Cookie:'la_experiment_owner=private'},body:JSON.stringify({exerciseId:'dot-product-01'})});
 assert.equal(response.status,201);assert.equal((await response.json()).session.id,id);
 assert.ok(response.headers.getSetCookie().some(v=>v.startsWith('discovery_recent='+id)&&v.includes('Path=/api/sessions')));
});
test('Continue is ownership checked, public-only and preserves unavailable session identity',async t=>{
 let owned=false;
 const base=await app(t,async(url,options)=>{
  assert.ok(url.endsWith('/api/sessions/'+id));assert.ok(options.headers.Cookie.includes('discovery_recent='));
  return owned?Response.json({session:{id,exerciseId:'dot-product-01'},privateToken:'never disclose',exercise:{html:'private content'}}):Response.json({error:{code:'NOT_FOUND'}},{status:404});
 });
 const headers={Cookie:'discovery_recent='+id};
 let result=await (await fetch(base+'/api/sessions/recent',{headers})).json();assert.equal(result.status,'unavailable');assert.ok(result.href.includes(id));assert.ok(!result.title);
 owned=true;result=await (await fetch(base+'/api/sessions/recent',{headers})).json();
 assert.equal(result.status,'available');assert.equal(result.title,'Dot products');
 assert.ok(!JSON.stringify(result).includes('never disclose'));assert.ok(!result.exercise);
});
test('private upstream errors are sanitized and old session URLs stay explicit',async t=>{
 const base=await app(t,async()=>{throw Error('private hostname, SQL and credentials');});
 const response=await fetch(base+'/api/sessions/'+id);assert.equal(response.status,503);
 assert.ok(!(await response.text()).includes('credentials'));
 const redirect=await fetch(base+'/?session='+id,{redirect:'manual'});assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'/practice?session='+id);
});

test('oversized practice requests fail before reaching the player',async t=>{
 const base=await app(t,()=>{throw Error('Unexpected oversized upstream request');});
 const response=await fetch(base+'/api/sessions',{method:'POST',headers:{Origin:'http://localhost:3105','Content-Type':'application/json'},body:JSON.stringify({exerciseId:'x'.repeat(9000)})});
 assert.equal(response.status,413);assert.equal((await response.json()).error.code,'BODY_TOO_LARGE');
});
