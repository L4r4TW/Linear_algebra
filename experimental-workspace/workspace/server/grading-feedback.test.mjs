import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectFieldFeedback, hasValidFieldFeedback } from './grading-feedback.mjs';
const token = (answers) => 'e30.' + Buffer.from(JSON.stringify({ score: {answers}, private: 'not-for-students' })).toString('base64url') + '.c2ln';
const text = (value) => { if (value == null) return ''; if (typeof value !== 'string') throw Error('Invalid text'); return value; };

test('distinguishes explicit PG input errors from mathematical errors, hints, partial and blank answers', () => {
  const fields = projectFieldFeedback(token({
    a: { score: 1, correct_value: 'PRIVATE' },
    b: { score: 0, student_value:'3', ans_message: 'Check the sign.', error_message: 'The coordinate is incorrect.' },
    c: { score: 0, student_value:null, error_message: 'Undefined variable.', ans_message: 'Parser message.' },
    d: { score: 0 }, e: { score: '0.5', ans_message: 'One part is right.' },
    ignored: { score: 1, correct_ans: 'PRIVATE' },
  }), [['a','2'],['b','3'],['c','nope('],['d',''],['e','x'],['missing','z']], text);
  assert.deepEqual(fields.map(({ name, status, score }) => ({ name, status, score })), [
    { name:'a',status:'correct',score:1 }, { name:'b',status:'incorrect',score:0 },
    { name:'c',status:'invalid',score:0 }, { name:'d',status:'unanswered',score:0 },
    { name:'e',status:'partial',score:0.5 }, { name:'missing',status:'ungraded',score:null },
  ]);
  assert.equal(fields[1].message, 'Check the sign.');
  assert.equal(fields[2].message, 'Undefined variable.');
  assert.doesNotMatch(JSON.stringify(fields), /PRIVATE|correct_value|correct_ans|ignored|not-for-students/);
});

test('does not infer syntax errors from ordinary feedback or reveal suppressed individual grades', () => {
  const payload = token({ a: { score: 0, ans_message: 'Try a different expression.' }, b: { score: 1 } });
  assert.equal(projectFieldFeedback(payload, [['a','5']], text)[0].status, 'incorrect');
  assert.deepEqual(projectFieldFeedback(payload, [['a','5'],['b','1']], text, { individualResults:false }).map((field) => field.status), ['ungraded','ungraded']);
});

test('rejects malformed PG grading claims and unsafe result metadata', () => {
  for (const bad of [undefined, '', 'not-a-token', 'a.b.c', token([]), token({ a:{ score:2 } }), token({ a:{ score:0, ans_message:{} } })]) {
    assert.throws(() => projectFieldFeedback(bad, [['a','1']], text));
  }
  const valid = [{ name:'a',status:'invalid',score:0,message:'Use a number.' }];
  assert.equal(hasValidFieldFeedback(valid, ['a']), true);
  for (const invalid of [null,[...valid,...valid],[{...valid[0],name:'unknown'}],[{...valid[0],status:'guessed'}],[{...valid[0],score:NaN}]]) {
    assert.equal(hasValidFieldFeedback(invalid, ['a']), false);
  }
});

test('suppressed and absent grade entries have explicit distinct reasons and no invented grades',()=>{
 const suppressed=projectFieldFeedback(token({a:{score:1,ans_message:'PRIVATE'}}),[['a','x']],text,{individualResults:false});assert.deepEqual(suppressed,[{name:'a',status:'ungraded',score:null,message:'',reason:'suppressed'}]);
 const missing=projectFieldFeedback(token({}),[['a','x']],text);assert.equal(missing[0].reason,'unavailable');assert.equal(missing[0].score,null);
});
test('stored field status, score and reason must form a coherent result',()=>{
 for(const field of [{status:'correct',score:0},{status:'incorrect',score:1},{status:'partial',score:0},{status:'partial',score:1},{status:'ungraded',score:.5},{status:'invalid',score:1},{status:'correct',score:1,reason:'suppressed'},{status:'ungraded',score:null,reason:'suppressed',message:'hidden'}])assert.equal(hasValidFieldFeedback([{name:'a',message:'',...field}],['a']),false);
 assert.equal(hasValidFieldFeedback([{name:'a',status:'ungraded',score:null,message:'',reason:'suppressed'}],['a']),true);
});
test('PG can award full credit to an empty response; blank detection never overrides that grade',()=>{
 assert.equal(projectFieldFeedback(token({a:{score:1}}),[['a','']],text)[0].status,'correct');
});