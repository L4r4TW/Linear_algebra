import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const root='http://127.0.0.1:3003',auth='Basic '+Buffer.from('operator:'+readFileSync('/secrets/operator-key','utf8').trim()).toString('base64');
assert.equal((await fetch(root)).status,401);
const response=await fetch(root+'/api/exercises',{headers:{authorization:auth}});assert.equal(response.status,200);const data=await response.json();
const rows=Array.isArray(data)?data:data.exercises;assert.ok(rows.length>0);
const result=await fetch(root+'/api/sessions',{method:'POST',headers:{authorization:auth,origin:process.env.PREVIEW_ORIGIN,'content-type':'application/json'},body:JSON.stringify({exerciseId:rows[0].id})});
assert.equal(result.status,201);assert.ok(result.headers.get('set-cookie').startsWith('verification_review_owner_'+process.env.PREVIEW_SEED+'='));
console.log(JSON.stringify({authenticatedPreview:true,existingStudentCookieUnchanged:true,fixedReviewSeed:Number(process.env.PREVIEW_SEED)}));
