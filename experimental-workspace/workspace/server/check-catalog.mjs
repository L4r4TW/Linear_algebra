// Live default-catalog gate check; no instructor values or private state are printed.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectCatalogCompatibility} from './exercise-catalog.mjs';
const base=process.env.API_URL??'http://127.0.0.1:3000';
const assessments=inspectCatalogCompatibility();
const enabled=assessments.filter(a=>a.enabled).map(a=>a.id),disabled=assessments.filter(a=>!a.enabled).map(a=>a.id);
assert.equal(enabled.length,6);assert.equal(disabled.length,5);
const listed=await (await fetch(base+'/api/exercises')).json();
assert.deepEqual(listed.exercises.map(e=>e.id),enabled);
for(const item of listed.exercises)assert.deepEqual(Object.keys(item).sort(),['description','id','title','topic','topicId'].sort());
for(const id of enabled){
 const started=await fetch(base+'/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({exerciseId:id})});
 assert.equal(started.status,201);
 const cookie=started.headers.get('set-cookie').split(';')[0],initial=await started.json(),url=base+'/api/sessions/'+initial.session.id;
 const grade=await fetch(url+'/answers',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({answers:[]})});
 assert.equal(grade.status,200);const graded=await grade.json();
 const restored=await fetch(url,{headers:{Cookie:cookie}});assert.equal(restored.status,200);
 const resumed=await restored.json();assert.equal(resumed.session.exerciseId,id);assert.deepEqual(resumed.submission,graded.submission);
 assert.equal((await fetch(url)).status,404);
}
for(const id of disabled){
 const response=await fetch(base+'/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({exerciseId:id})});assert.equal(response.status,404);
}
console.log(JSON.stringify({result:'PASS',enabled,disabledCount:disabled.length,checks:['listing','start','blank grading','refresh','ownership','blocked IDs']}));