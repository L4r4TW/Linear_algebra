import test from 'node:test';
import assert from 'node:assert/strict';
import {createDraftStore,planDraftRestoration,validDraftAnswers} from '../public/draft-answers.js';
const session={id:'11111111-1111-4111-8111-111111111111',exerciseId:'one'};
const other={id:'22222222-2222-4222-8222-222222222222',exerciseId:'one'};
const answers={fieldNames:['a','choices','radio'],entries:[['a','  <1, 2, 3>  '],['choices','x'],['choices','x'],['choices','y']]};
function setup(){const data=new Map();return {data,store:createDraftStore({storage:()=>({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)})})};}
test('per-session drafts preserve exact values, duplicate choice pairs and unchecked groups',()=>{
 const {store}=setup();store.write(session,null,answers);assert.deepEqual(store.read(session).answers,answers);assert.equal(store.read(other),null);
 const plan=planDraftRestoration(store.read(session),session,null,answers.fieldNames);assert.equal(plan.action,'restore');assert.deepEqual(plan.answers,answers);
});
test('draft takes precedence over its checked baseline without modifying that submission',()=>{
 const {store}=setup(),submission={id:'check',number:1,answers:[['a','1']]};const before=structuredClone(submission);
 store.write(session,submission,answers);assert.equal(planDraftRestoration(store.read(session),session,submission,answers.fieldNames).action,'restore');assert.deepEqual(submission,before);
});
test('a newer unrelated check prevents restoring an older draft',()=>{
 const {store}=setup();store.write(session,{id:'old',number:1},answers);
 assert.deepEqual(planDraftRestoration(store.read(session),session,{id:'new',number:2,answers:[['a','2']]},answers.fieldNames),{action:'ignore',reason:'newer-result'});
});
test('accepted-but-lost grading restores edits made after the pending snapshot',()=>{
 const {store}=setup(),pending={fieldNames:answers.fieldNames,entries:[['a','1']]};store.write(session,null,answers,pending);
 const plan=planDraftRestoration(store.read(session),session,{id:'saved',number:1,answers:pending.entries},answers.fieldNames);
 assert.equal(plan.action,'restore');assert.equal(plan.pending,null);assert.deepEqual(plan.answers,answers);
});
test('an acknowledged pending attempt identical to saved work clears the draft',()=>{
 const {store}=setup();store.write(session,null,answers,answers);
 assert.equal(planDraftRestoration(store.read(session),session,{id:'saved',number:1,answers:answers.entries},answers.fieldNames).action,'clear');store.remove(session);assert.equal(store.read(session),null);
});
test('changed field contracts and wrong exercise identity cannot restore',()=>{
 const {store}=setup();store.write(session,null,answers);const record=store.read(session);
 assert.equal(planDraftRestoration(record,session,null,['new']).action,'ignore');
 assert.equal(planDraftRestoration(record,{...session,exerciseId:'two'},null,answers.fieldNames).action,'ignore');assert.throws(()=>store.read({...session,exerciseId:'two'}));
});
test('malformed, oversized and reserved-field drafts fail closed',()=>{
 for(const bad of [null,{fieldNames:['a','a'],entries:[]},{fieldNames:['sessionJWT'],entries:[]},{fieldNames:['a'],entries:[['b','x']]},{fieldNames:['a'],entries:[['a',1]]},{fieldNames:['a'],entries:[['a','x'.repeat(100001)]]}])assert.equal(validDraftAnswers(bad),false);
 const {store,data}=setup();store.write(session,null,answers);const key=[...data.keys()][0];
 for(const bad of ['{','null','x'.repeat(500001)]){data.set(key,bad);assert.throws(()=>store.read(session));}
});
test('blocked storage, quota failures and removal failures surface rather than claiming success',()=>{
 for(const method of ['getItem','setItem','removeItem']){
  const storage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};storage[method]=()=>{throw new Error('blocked');};const store=createDraftStore({storage:()=>storage});
  assert.throws(()=>method==='getItem'?store.read(session):method==='setItem'?store.write(session,null,answers):store.remove(session),e=>e.code==='STORAGE_UNAVAILABLE');
 }
});