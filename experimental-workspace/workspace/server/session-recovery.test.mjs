import test from 'node:test';
import assert from 'node:assert/strict';
import {ExerciseRequestError,sessionRecovery} from '../public/session-recovery.js';
for(const code of ['INVALID_INPUT','SESSION_EXPIRED','SESSION_REJECTED','SESSION_NOT_FOUND','EXERCISE_WITHDRAWN','UNKNOWN_EXERCISE'])test(code+' offers a deliberate choice, not a retry loop',()=>{
 const policy=sessionRecovery(new ExerciseRequestError(code,410,'ignored'));
 assert.equal(policy.terminal,true);assert.equal(policy.retry,false);assert.equal(policy.reconcile,false);assert.ok(policy.message.length>30);
});
for(const code of ['RENDERER_UNAVAILABLE','RENDERER_TIMEOUT'])test(code+' allows explicit loading retry',()=>{
 const policy=sessionRecovery(new ExerciseRequestError(code,503,'ignored'));assert.equal(policy.retry,true);assert.equal(policy.terminal,false);
});
test('missing and unowned sessions use a privacy-preserving recovery explanation',()=>{
 const policy=sessionRecovery(new ExerciseRequestError('SESSION_NOT_FOUND',404,'ignored'));assert.match(policy.message,/missing.*browser may not have access/);assert.doesNotMatch(policy.message,/belongs to|another user/);
});
test('ambiguous grading outcomes require saved-session reconciliation, never automatic resubmission',()=>{
 for(const error of [new TypeError('network'),Object.assign(new Error(),{name:'TimeoutError'}),new ExerciseRequestError('UNCONFIRMED_SUBMISSION',200,''),new ExerciseRequestError('INVALID_RESPONSE',200,''),new ExerciseRequestError('SESSION_BUSY',409,'')]){
  const policy=sessionRecovery(error,{phase:'grade'});assert.equal(policy.reconcile,true);assert.equal(policy.retry,false);assert.equal(policy.terminal,false);
 }
});
test('confirmed service failures keep a manual checking retry available',()=>{
 assert.equal(sessionRecovery(new ExerciseRequestError('RENDERER_UNAVAILABLE',503,''),{phase:'grade'}).reconcile,false);
});
test('unknown codes and prototype names retain safe generic recovery',()=>{
 for(const code of ['toString','__proto__','NEW_ERROR']){const result=sessionRecovery(new ExerciseRequestError(code,500,'Safe message'));assert.equal(result.retry,true);assert.equal(result.message,'Safe message');}
});