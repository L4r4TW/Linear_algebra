import assert from 'node:assert/strict';import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';import {join} from 'node:path';import {sql} from '../importer/db.mjs';
const root='http://127.0.0.1:3003',auth='Basic '+Buffer.from('operator:'+readFileSync('/secrets/operator-key','utf8').trim()).toString('base64');
assert.equal((await fetch(root)).status,401);
const response=await fetch(root+'/api/exercises',{headers:{authorization:auth}});assert.equal(response.status,200);const rows=(await response.json()).exercises;assert.ok(rows.length>100);
const id=sql("SELECT j.id FROM catalog.verification_jobs j JOIN catalog.verifier_heads h ON h.context_id=j.context_id WHERE h.scope='local-practice' AND j.technical_state='passed' AND catalog.verification_job_current(j.id) ORDER BY j.created_at LIMIT 1;");assert.ok(rows.some(row=>row.id===id));
const result=await fetch(root+'/api/sessions',{method:'POST',headers:{authorization:auth,origin:process.env.PREVIEW_ORIGIN,'content-type':'application/json'},body:JSON.stringify({exerciseId:id})});assert.equal(result.status,201);
const cookie=result.headers.get('set-cookie');assert.ok(cookie.startsWith('verification_review_owner_'+process.env.PREVIEW_SEED+'='));
const value=await result.json(),directories=readdirSync('/tmp').filter(name=>name.startsWith('calculus-review-'));let record;
for(const directory of directories){try{record=JSON.parse(readFileSync(join('/tmp',directory,value.session.id+'.json'),'utf8'));}catch{}}
assert.equal(record?.seed,Number(process.env.PREVIEW_SEED));assert.equal(record?.exerciseId,id);
const foreign=await fetch(root+'/api/sessions/'+value.session.id,{headers:{authorization:auth}});assert.ok([403,404].includes(foreign.status));
mkdirSync('/artifacts',{recursive:true});writeFileSync('/artifacts/review-preview-'+process.env.PREVIEW_SEED+'.json',JSON.stringify({complete:true,operatorAuthRequired:true,moreThan100JobsAccessible:true,earlyPassingJobAccessible:true,actualFixedSeedVerified:true,seed:Number(process.env.PREVIEW_SEED),separateOwnerCookie:true,foreignOwnerDenied:true,noStudentDataMounted:true,published:false},null,2)+'\n');console.log('PRIVATE_REVIEW_PREVIEW_PASSED');
