import {test} from 'node:test';import assert from 'node:assert/strict';
import {unfinishedAnswers,nextActionText} from '../public/practice-actions.js';
const answers=entries=>({fieldNames:['a','choices'],entries});
test('unchanged checked groups are clean while blanks, whitespace and repeated-name changes are protected',()=>{
 const baseline=[['a','2'],['choices','x'],['choices','y']];assert.equal(unfinishedAnswers(answers(baseline),baseline),false);
 for(const entries of [[['a',' 2 '],['choices','x'],['choices','y']],[['a','2'],['choices','y'],['choices','x']],[['a','2']]])assert.equal(unfinishedAnswers(answers(entries),baseline),true);
 assert.equal(unfinishedAnswers(answers([['a',''],['choices','']]),[['a','']]),false);
});
test('pending checks and uncertain snapshots never count as safely finished',()=>{
 assert.equal(unfinishedAnswers(undefined,[],{pending:true}),true);assert.equal(unfinishedAnswers(undefined,[],{unknown:true}),true);assert.equal(unfinishedAnswers(undefined,[]),false);assert.equal(unfinishedAnswers(answers([['a','draft']]),undefined),true);assert.equal(unfinishedAnswers(answers([['a','']]),undefined),false);
});
test('all outcomes offer same-exercise retries and choosing another without promising withheld feedback',()=>{
 for(const score of [0,.25,1,null]){const text=nextActionText({score});assert.match(text,/same exercise/);assert.match(text,/choose another exercise/i);}
 const hidden=nextActionText({score:null,feedbackVisibility:'suppressed'});assert.match(hidden,/Feedback remains withheld/);assert.match(hidden,/submit again in this exercise/);
});