import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {EventEmitter} from 'node:events';import {protectReview} from './review-auth.mjs';
test('private previews require operator authentication and cannot inherit student or other-seed ownership',async()=>{
 const app=new EventEmitter(),received=[];app.on('request',(req,res)=>{received.push(req.headers.cookie);res.setHeader('Set-Cookie',['la_experiment_owner=probe; Path=/api/sessions; HttpOnly']);res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');});
 const server=createServer(protectReview({auth:{basic:req=>req.headers.authorization==='fixture-proof'},app,seed:1234}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base)).status,401);assert.equal(received.length,0);
  const response=await fetch(base,{headers:{Authorization:'fixture-proof',Cookie:'la_experiment_owner=student; mathpractice_account=student-account; verification_review_owner_4321=other; verification_review_owner_1234=review'}});
  assert.equal(response.status,200);assert.deepEqual(received,['la_experiment_owner=review']);assert.match(response.headers.get('set-cookie'),/^verification_review_owner_1234=/);assert.ok(!response.headers.get('set-cookie').startsWith('la_experiment_owner='));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
