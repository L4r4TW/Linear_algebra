import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const app=new URL(existsSync(new URL('../workspace/',import.meta.url))?'../workspace/':'../application/',import.meta.url);
const {runtimeFingerprint}=await import(new URL('server/catalog-compatibility.mjs',app));
const read=url=>JSON.parse(readFileSync(url,'utf8'));
const catalogUrl=new URL('./catalog.json',import.meta.url),catalog=read(catalogUrl),profile=read(new URL('server/compatibility-profile.json',app));
function fixture(){return {complete:true,partial:false,observedAt:'2026-11-15T00:00:00Z',fixtureCatalogFingerprint:createHash('sha256').update(readFileSync(catalogUrl)).digest('hex'),runtimeFingerprint:runtimeFingerprint(),profileVersion:profile.version,rendererRevision:profile.rendererRevision,sourceRevision:profile.sourceRevision,exercises:catalog.exercises.flatMap(f=>profile.seeds.flatMap(verificationSeed=>profile.viewports.map(viewport=>({id:f.id,verificationSeed,viewport,sourceVerified:true,passed:true,phase:'complete',checks:Object.fromEntries(profile.checks.map(c=>[c,true])),correct:{score:1},cleared:{score:0},limitations:[]}))))};}
function publish(t,report){
 const root=mkdtempSync(join(tmpdir(),'catalog-publish-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const input=join(root,'report.json'),output=join(root,'generated');writeFileSync(input,JSON.stringify(report));
 const result=spawnSync(process.execPath,[new URL('./build-catalog.mjs',import.meta.url).pathname,input,output],{encoding:'utf8'});
 return {result,output};
}
test('publisher activates only reviewed batch members and retains failed candidates',t=>{
 const report=fixture(),candidate=report.exercises.find(c=>c.id==='compat-matrix-grid-01');candidate.passed=false;candidate.checks.mobile=false;candidate.error='QA_LAYOUT';
 const {result,output}=publish(t,report);assert.equal(result.status,0,result.stderr);
 const catalog=read(join(output,'exercise-catalog.json')),evidence=read(join(output,'catalog-compatibility-evidence.json'));
 assert.equal(catalog.exercises.length,11);assert.equal(catalog.exercises.filter(e=>e.activation.state==='enabled').length,6);
 assert.equal(catalog.exercises.find(e=>e.id===candidate.id).compatibility.status,'failed');
 assert.equal(evidence.entries[candidate.id].cases[0].error,'QA_LAYOUT');
});
for(const kind of ['partial','incomplete','runtime','manifest','renderer','source','missing-case','duplicate-case','failed-member'])test('publisher rejects '+kind,t=>{
 const report=fixture();
 if(kind==='partial')report.partial=true;
 if(kind==='incomplete')report.complete=false;
 if(kind==='runtime')report.runtimeFingerprint='stale';
 if(kind==='manifest')report.fixtureCatalogFingerprint='stale';
 if(kind==='renderer')report.rendererRevision='stale';
 if(kind==='source')report.sourceRevision='stale';
 if(kind==='missing-case')report.exercises.shift();
 if(kind==='duplicate-case')report.exercises[1]=structuredClone(report.exercises[0]);
 if(kind==='failed-member')report.exercises[0].correct.score=.5;
 const {result,output}=publish(t,report);assert.notEqual(result.status,0);assert.equal(existsSync(join(output,'exercise-catalog.json')),false);
});