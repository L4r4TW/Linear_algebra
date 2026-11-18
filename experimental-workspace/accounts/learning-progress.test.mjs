import test from 'node:test';import assert from 'node:assert/strict';import {completionAssignment,learningAssignment,projectLearning} from './learning-progress.mjs';import {randomPracticeMembers} from './random-practice.mjs';
const entry={id:'alias',identityId:'canonical-id',collectionId:'calculus',chapter:'Limits and continuity',source:{sha256:'a',revision:'b',versionId:'c'}};
const attempt={provenance:'server-pg',score:1,source:{...entry.source}};
test('completion requires visible full PG credit with a matching source; aliases share one identity',()=>{
 assert.equal(completionAssignment(attempt,entry).exerciseKey,'canonical-id');
 for(const change of [{score:.5},{score:0},{provenance:'legacy-renderer'},{feedbackVisibility:'suppressed'},{source:{...entry.source,sha256:'changed'}}])assert.equal(completionAssignment({...attempt,...change},entry),null);
 const saved={...attempt,learning:learningAssignment(entry)};assert.equal(completionAssignment(saved,null).exerciseKey,'canonical-id');
});
test('chapter order and completion goals remain stable as catalog availability changes',()=>{
 const result=projectLearning([{collection_key:'calculus',chapter_key:'limits',completed:3}]);assert.equal(result[0].chapters[0].title,'Limits and continuity');assert.equal(result[0].chapters[0].percent,20);assert.equal(result[0].percent,3);assert.equal(result[0].target,100);
});
test('random practice samples the entire pool, prefers unfinished work, and allows review after completion',()=>{
 const rows=Array.from({length:40},(_,i)=>({...entry,id:'id-'+i,identityId:'id-'+i,subject:'Differential calculus',section:null}));
 const chosen=randomPracticeMembers(rows,{subject:'Differential calculus',chapter:null,section:null},{random:()=>0});assert.equal(chosen.length,20);assert.equal(new Set(chosen.map(e=>e.id)).size,20);assert.notDeepEqual(chosen.map(e=>e.id),rows.slice(0,20).map(e=>e.id));
 const completed=new Set(rows.slice(0,35).map(e=>e.id));assert.equal(randomPracticeMembers(rows,{subject:'Differential calculus'},{completed}).length,5);
 assert.equal(randomPracticeMembers(rows,{subject:'Differential calculus'},{completed:new Set(rows.map(e=>e.id))}).length,20);
});
