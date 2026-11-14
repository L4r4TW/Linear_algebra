import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {assessRegression,writeRegressionReport} from './regression-report.mjs';
const policy={limitations:[{code:'NARROW_FRAME_SCROLL',exerciseIds:['matrix'],capability:'mobile',status:'limited',reason:'Requires frame scrolling.'}],unverified:[]};
const row=()=>({id:'native',verificationSeed:1234,viewport:'desktop',passed:true,rendering:{problemPresent:true,imagesLoaded:true},incorrect:{score:0},collection:{helperFieldsExcluded:true},correct:{score:1},cleared:{score:0},retry:{passed:true},restoration:{noNewGrade:true},clearedRestoration:{noNewGrade:true},ownershipProtected:true,gradingOwnershipProtected:true,ownerDataUnchanged:true,keyboard:{passed:true},mobile:{passed:true}});
const report=(r=row())=>({complete:true,observedAt:'2026-11-15',partial:true,expectedCases:[{id:r.id,verificationSeed:r.verificationSeed,viewport:r.viewport}],exercises:[r]});
test('requires every declared check and case rather than accepting an empty or partial result',()=>{
 assert.equal(assessRegression(report(),policy).passed,true);
 const empty=report();empty.expectedCases=[];empty.exercises=[];assert.equal(assessRegression(empty,policy).passed,false);
 const missing=report();missing.exercises=[];assert.equal(assessRegression(missing,policy).passed,false);
 const incomplete=report();incomplete.complete=false;assert.equal(assessRegression(incomplete,policy).passed,false);
 const checkMissing=report();delete checkMissing.exercises[0].retry;assert.equal(assessRegression(checkMissing,policy).passed,false);
});
test('rejects duplicate cases and unexpected capability gaps',()=>{
 const duplicate=report();duplicate.exercises.push(row());assert.equal(assessRegression(duplicate,policy).passed,false);
 const unexpected=report();unexpected.exercises[0].mobile.horizontalFrameScroll=true;assert.equal(assessRegression(unexpected,policy).passed,false);
});
test('known limitations stay visible and do not excuse a failed required check',()=>{
 const r=row();r.id='matrix';r.mobile.horizontalFrameScroll=true;const result=report(r);
 assert.equal(assessRegression(result,policy).passed,true);assert.equal(result.exercises[0].status,'passed-with-limitations');
 result.exercises[0].keyboard.passed=false;assert.equal(assessRegression(result,policy).passed,false);
 const gradeFailure=report(row());gradeFailure.exercises[0].id='matrix';gradeFailure.expectedCases[0].id='matrix';gradeFailure.exercises[0].mobile.horizontalFrameScroll=true;gradeFailure.exercises[0].correct.score=0.5;assert.equal(assessRegression(gradeFailure,policy).passed,false);
});
test('writes readable escaped reports without executing fixture labels',async()=>{
 const output=await mkdtemp(join(tmpdir(),'regression-report-'));try{
  const r=row();r.id='<script>unsafe</script>';const result=report(r);await writeRegressionReport(result,policy,output);
  const html=await readFile(join(output,'index.html'),'utf8');assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>unsafe'));
  assert.match(await readFile(join(output,'REGRESSION_STATUS.md'),'utf8'),/1\/1 cases/);
 }finally{await rm(output,{recursive:true,force:true});}
});
