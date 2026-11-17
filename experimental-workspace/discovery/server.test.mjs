import test from 'node:test';
import assert from 'node:assert/strict';
import {createHome} from './server.mjs';
const id='00000000-0000-0000-0000-000000000001';
const metadata={practice:async()=>[{id:'dot-product-01',title:'Dot products',chapter:'Vectors'}],overview:async()=>({practice:{count:6}}),search:async()=>({entries:[]}),topics:async()=>({topics:[]})};
async function app(t,fetcher){
 const server=createHome({origin:'http://localhost:3105',practiceUrl:'http://practice.test:3000',catalog:metadata,fetcher});
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
  assert.equal(url,'http://practice.test:3000/api/sessions');
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

test('chooser plans are origin-checked, server-selected and reject renderer settings',async t=>{
 const catalog={...metadata,practice:async()=>[{id:'dot-product-01',title:'Dot products',subject:'Math',chapter:'Vectors',section:null,canPractice:true}]};
 const server=createHome({origin:'http://localhost:3105',catalog});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const base='http://127.0.0.1:'+server.address().port,headers={Origin:'http://localhost:3105','Content-Type':'application/json'};
 let response=await fetch(base+'/api/discovery/practice-plans',{method:'POST',headers,body:JSON.stringify({subject:'Math',sourceFilePath:'private'})});assert.equal(response.status,400);
 response=await fetch(base+'/api/discovery/practice-plans',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,403);
 response=await fetch(base+'/api/discovery/practice-plans',{method:'POST',headers,body:JSON.stringify({subject:'Math',chapter:'Vectors'})});assert.equal(response.status,201);
 const {plan}=await response.json();assert.equal(plan.total,1);assert.equal(plan.items[0].exerciseId,'dot-product-01');assert.equal(plan.items[0].sessionId,null);
 response=await fetch(base+'/api/discovery/chooser?subject=Math&chapter=Missing');assert.equal(response.status,409);
});

test('account and draft routes remain fixed and preserve ownership and submission identity',async t=>{
 const calls=[];
 const base=await app(t,async(url,options)=>{calls.push({url,options});return Response.json({account:{authenticated:false}});});
 const headers={Origin:'http://localhost:3105','Content-Type':'application/json',Cookie:'mathpractice_account=opaque; la_experiment_owner=guest','Idempotency-Key':id};
 assert.equal((await fetch(base+'/api/sessions/account/login',{method:'POST',headers,body:JSON.stringify({email:'test@example.test',password:'synthetic-password'})})).status,200);
 assert.ok(calls[0].url.endsWith('/api/sessions/account/login'));assert.equal(calls[0].options.headers.Cookie,headers.Cookie);
 assert.equal(calls[0].options.headers['Idempotency-Key'],id);assert.equal(calls[0].options.headers.Origin,'http://localhost:3100');
 assert.equal((await fetch(base+'/api/sessions/'+id+'/draft',{method:'POST',headers,body:JSON.stringify({entries:[['AnSwEr0001','x'.repeat(10000)]],revision:0,baseAttemptId:null})})).status,200);
 assert.equal((await fetch(base+'/api/sessions/account/arbitrary')).status,404);
 assert.equal((await fetch(base+'/api/sessions/account/login',{method:'POST',headers:{...headers,Origin:'https://foreign.invalid'},body:'{}'})).status,403);
});
test('account Continue uses server-owned continuation and never another anonymous pointer',async t=>{
 let authenticated=true;
 const base=await app(t,async url=>{
  if(url.endsWith('/account/continuation'))return authenticated?Response.json({sessionId:id,setId:null,item:null}):Response.json({error:{}},{status:401});
  assert.ok(url.endsWith('/api/sessions/'+id));return Response.json({session:{id,exerciseId:'dot-product-01'}});
 });
 const headers={Cookie:'mathpractice_account=opaque'};
 let value=await(await fetch(base+'/api/sessions/recent',{headers})).json();assert.equal(value.status,'available');assert.ok(value.href.includes(id));
 authenticated=false;value=await(await fetch(base+'/api/sessions/recent',{headers})).json();assert.equal(value.status,'authentication-required');assert.equal(value.href,'/account');
});

test('source credits and license notices are readable without upstream access',async t=>{const base=await app(t,()=>{throw Error('Unexpected upstream');});const r=await fetch(base+'/sources');assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes('creativecommons.org/licenses/by-nc-sa/3.0/'));assert.ok(html.includes('OPL_LICENSE'));assert.ok(r.headers.get('content-security-policy').includes('default-src'));});
