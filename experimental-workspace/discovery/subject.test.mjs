import test from 'node:test';import assert from 'node:assert/strict';import {projectSubject,subjectInput} from './subject.mjs';
test('a subject shows ordered chapters, stable goals, no sections, and distinct available members',()=>{
 const e={id:'one',subject:'Differential calculus',collectionId:'calculus',chapter:'Limits and continuity',section:'Ignored source label'};
 const result=projectSubject([e,e,{...e,id:'legacy',collectionId:null}],e.subject);assert.equal(result.available,1);assert.equal(result.chapters[0].title,'Limits and continuity');assert.equal(result.chapters[1].title,'Derivative definition');assert.equal(result.chapters[0].target,15);assert.equal(result.chapters[1].available,0);assert.equal(JSON.stringify(result).includes('section'),false);
});
test('subject inputs reject ambiguity and unavailable subjects remain explicit',()=>{assert.equal(subjectInput(new URLSearchParams('subject=Algebra')),'Algebra');for(const value of ['','subject=A&subject=B','subject=A&section=B'])assert.throws(()=>subjectInput(new URLSearchParams(value)));assert.throws(()=>projectSubject([],'Missing'),{code:'TOPIC_UNAVAILABLE'});});

test('algebra and trigonometry present prerequisite foundations before later chapters',()=>{assert.deepEqual(projectSubject([],'Algebra').chapters.slice(0,4).map(c=>c.id),['expressions','exponents','linear','systems']);const ids=projectSubject([],'Trigonometry').chapters.map(c=>c.id);assert.ok(ids.indexOf('inverse')<ids.indexOf('equations'));});
