import test from 'node:test';
import assert from 'node:assert/strict';
import {feedbackOutcome} from '../public/feedback-model.js';
const result=(score,statuses,extra={})=>({score,fieldFeedback:statuses.map(status=>({status})),...extra});
for(const [score,statuses,outcome] of [[0,['unanswered'],'unanswered'],[0,['invalid'],'invalid'],[0,['incorrect'],'incorrect'],[.25,['correct','unanswered'],'partial'],[.5,['partial'],'partial'],[1,['correct'],'correct']])test('overall PG result '+outcome,()=>assert.equal(feedbackOutcome(result(score,statuses)).outcome,outcome));
test('invalid input takes precedence over partial overall credit without recomputing PG score',()=>{
 const model=feedbackOutcome(result(.9,['invalid','correct','unanswered']));assert.equal(model.outcome,'invalid');assert.equal(model.scoreText,'Score: 90%');assert.match(model.detail,/1 answer could not be interpreted/);
});
test('suppression exposes neither aggregate score nor a derived correctness claim',()=>{
 for(const score of [0,.5,1]){const model=feedbackOutcome(result(score,['ungraded'],{feedbackVisibility:'suppressed'}));assert.equal(model.outcome,'ungraded');assert.equal(model.title,'Answers submitted');assert.equal(model.scoreText,null);assert.match(model.detail,/withheld/);}
});
test('full credit with unavailable or conflicting field details does not assert every answer is correct',()=>{
 assert.equal(feedbackOutcome(result(1,['ungraded'])).title,'Full credit awarded');assert.equal(feedbackOutcome(result(1,[])).title,'Full credit awarded');assert.equal(feedbackOutcome(result(1,['incorrect'])).title,'Full credit awarded');
});
test('small positive and near-full partial scores cannot be rounded into zero or full correctness',()=>{
 assert.equal(feedbackOutcome(result(.00001,['partial'])).scoreText,'Score: >0%');assert.equal(feedbackOutcome(result(.99999,['partial'])).scoreText,'Score: <100%');
});
test('missing aggregate results stay neutral without a promise of feedback on retry',()=>{
 for(const score of [null,undefined,NaN])assert.equal(feedbackOutcome(result(score,['ungraded'])).outcome,'ungraded');assert.doesNotMatch(feedbackOutcome(result(.5,[])).detail,/Check again to see/);
});