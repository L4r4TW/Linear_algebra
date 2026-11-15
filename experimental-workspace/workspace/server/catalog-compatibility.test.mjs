import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCatalogEntry,initialCompatibility} from './catalog-compatibility.mjs';
import {createExerciseCatalog} from './exercise-catalog.mjs';
const make=()=>{
 const profile={version:'v1',sourceRevision:'source',rendererRevision:'renderer',seeds:[1234,4321],viewports:['desktop','mobile'],checks:['rendering','grading','ownership'],capabilities:{text:{status:'verified'}}};
 const entry={id:'one',title:'One',topicId:'topic',topic:'Topic',description:'Friendly',source:{revision:'source',path:'OpenProblemLibrary/one.pg',sha256:'a'.repeat(64)},renderer:{sourceFilePath:'Library/one.pg'},compatibility:{status:'verified',requiredCapabilities:['text']},activation:{state:'enabled',batchId:'batch'}};
 const proof={source:{...entry.source},rendererPath:entry.renderer.sourceFilePath,requiredCapabilities:['text'],cases:profile.seeds.flatMap(verificationSeed=>profile.viewports.map(viewport=>({verificationSeed,viewport,sourceVerified:true,passed:true,phase:'complete',checks:{rendering:true,grading:true,ownership:true},correctScore:1,clearedScore:0,limitations:[]})))};
 return {entry,config:{profile,evidence:{complete:true,profileVersion:'v1',sourceRevision:'source',rendererRevision:'renderer',runtimeFingerprint:'fp',entries:{one:proof}},fingerprint:'fp',batches:[{id:'batch',state:'active',profileVersion:'v1',exerciseIds:['one']}]}};
};
test('new imports cannot assert approval by setting a status',()=>{
 const {entry,config}=make();Object.assign(entry,initialCompatibility(['text']));delete config.evidence.entries.one;
 entry.compatibility.status='verified';entry.activation={state:'enabled',batchId:'batch'};
 assert.equal(assessCatalogEntry(entry,config).status,'unverified');assert.equal(assessCatalogEntry(entry,config).enabled,false);
});
test('matching complete evidence and active batch enable an exercise',()=>{const {entry,config}=make();assert.equal(assessCatalogEntry(entry,config).enabled,true);});
for(const mutation of ['missing','duplicate','partial','failed-check','source-unverified','wrong-score','unfinished'])test('rejects '+mutation+' evidence',()=>{
 const {entry,config}=make(),proof=config.evidence.entries.one;
 if(mutation==='missing')proof.cases.pop();
 if(mutation==='duplicate')proof.cases[1]=structuredClone(proof.cases[0]);
 if(mutation==='partial')config.evidence.complete=false;
 if(mutation==='failed-check')proof.cases[0].checks.ownership=false;
 if(mutation==='source-unverified')proof.cases[0].sourceVerified=false;
 if(mutation==='wrong-score')proof.cases[0].correctScore=.5;
 if(mutation==='unfinished')proof.cases[0].phase='rendering';
 assert.equal(assessCatalogEntry(entry,config).enabled,false);
});
for(const mutation of ['runtime','renderer','library','path','hash','requirements','profile'])test('invalidates '+mutation+' drift',()=>{
 const {entry,config}=make();
 if(mutation==='runtime')config.fingerprint='new';
 if(mutation==='renderer')config.profile.rendererRevision='new';
 if(mutation==='library')entry.source.revision='new';
 if(mutation==='path')entry.renderer.sourceFilePath='Library/new.pg';
 if(mutation==='hash')entry.source.sha256='b'.repeat(64);
 if(mutation==='requirements')entry.compatibility.requiredCapabilities.push('unknown');
 if(mutation==='profile')config.profile.version='new';
 assert.equal(assessCatalogEntry(entry,config).status,'stale');
});
test('unknown capabilities, unsupported widgets and layout limits prevent activation',()=>{
 for(const kind of ['unknown','unsupported','limited']){
  const {entry,config}=make();
  if(kind==='unknown')delete config.profile.capabilities.text;
  if(kind==='unsupported')config.profile.capabilities.text.status='unsupported';
  if(kind==='limited')config.evidence.entries.one.cases[0].limitations.push({code:'NARROW_FRAME_SCROLL',capability:'text',status:'limited',reason:'Overflow'});
  assert.equal(assessCatalogEntry(entry,config).enabled,false);
 }
});
test('rollback withdraws eligibility and retains evidence',()=>{
 for(const change of ['remove','inactive','disabled','status']){
  const {entry,config}=make(),original=JSON.stringify(config.evidence);
  if(change==='remove')config.batches=[];
  if(change==='inactive')config.batches[0].state='inactive';
  if(change==='disabled')entry.activation.state='disabled';
  if(change==='status')entry.compatibility.status='unverified';
  assert.equal(assessCatalogEntry(entry,config).enabled,false);assert.equal(JSON.stringify(config.evidence),original);
 }
});
test('empty profiles fail closed',()=>{const {entry,config}=make();config.profile.seeds=[];config.evidence.entries.one.cases=[];assert.equal(assessCatalogEntry(entry,config).enabled,false);});
test('catalog hides blocked IDs and private metadata and returns defensive copies',()=>{
 const {entry,config}=make(),blocked={...structuredClone(entry),id:'blocked',...initialCompatibility(['text'])};
 const args={...config,catalog:{exercises:[entry,blocked]},batches:{batches:config.batches}},service=createExerciseCatalog(args);
 assert.deepEqual(service.listExercises(),[{id:'one',title:'One',topicId:'topic',topic:'Topic',description:'Friendly'}]);
 assert.equal(service.getExerciseById('blocked'),undefined);assert.equal(service.getExerciseById('missing'),undefined);
 service.getExerciseById('one').source.path='changed';assert.equal(service.getExerciseById('one').source.path,entry.source.path);
 assert.throws(()=>createExerciseCatalog({...args,catalog:{exercises:[entry,entry]}}),/Duplicate/);
});