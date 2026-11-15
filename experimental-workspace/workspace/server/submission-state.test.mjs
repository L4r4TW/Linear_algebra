import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasValidSubmissionState } from './submission-state.mjs';

function record() {
  return {
    submissionCount: 1, updatedAt: '2026-11-14T12:00:01.000Z',
    lastSubmission: {
      id: '00000000-0000-4000-8000-000000000001', number: 1,
      submittedAt: '2026-11-14T12:00:00.000Z',
      fieldNames: ['AnSwEr0001', 'choices'],
      answers: [['AnSwEr0001', ' 2 + 3 '], ['choices', 'a'], ['choices', 'b']],
      score: 0.5, feedback: { message: 'Try again.', summary: 'One answer needs attention.' },
    },
  };
}

test('accepts legacy, empty, and complete latest-submission records', () => {
  assert.equal(hasValidSubmissionState({}), true);
  assert.equal(hasValidSubmissionState({ submissionCount: 0, lastSubmission: null }), true);
  assert.equal(hasValidSubmissionState(record()), true);
});

test('rejects incomplete token/snapshot metadata and invalid result fields', () => {
  const base = record();
  for (const invalid of [
    null,
    { submissionCount: 1 },
    { submissionCount: 0, lastSubmission: base.lastSubmission },
    { ...base, submissionCount: 2 },
    { ...base, submissionCount: -1 },
    { ...base, lastSubmission: null },
    { ...base, lastSubmission: { ...base.lastSubmission, score: 2 } },
    { ...base, lastSubmission: { ...base.lastSubmission, submittedAt: 'invalid' } },
    { ...base, lastSubmission: { ...base.lastSubmission, feedback: { message: {}, summary: '' } } },
    { ...base, lastSubmission: { ...base.lastSubmission, answers: [['unknown', 'x']] } },
    { ...base, lastSubmission: { ...base.lastSubmission, fieldNames: ['sessionJWT'], answers: [] } },
    { ...base, lastSubmission: { ...base.lastSubmission, fieldNames: ['choices', 'choices'] } },
  ]) assert.equal(hasValidSubmissionState(invalid), false);
});
test('preserves new field feedback and accepts legacy snapshots without it', () => {
  const value = record();
  value.lastSubmission.fieldFeedback = [{name:'AnSwEr0001',status:'invalid',score:0,message:'Use a number.'}];
  assert.equal(hasValidSubmissionState(value), true);
  value.lastSubmission.fieldFeedback[0].name = 'unknown';
  assert.equal(hasValidSubmissionState(value), false);
  delete value.lastSubmission.fieldFeedback;
  assert.equal(hasValidSubmissionState(value), true);
});

test('suppression policy persists alongside private PG score and legacy snapshots remain valid',()=>{
 const value=record();value.lastSubmission.feedbackVisibility='suppressed';assert.equal(hasValidSubmissionState(value),true);value.lastSubmission.feedbackVisibility='invented';assert.equal(hasValidSubmissionState(value),false);delete value.lastSubmission.feedbackVisibility;assert.equal(hasValidSubmissionState(value),true);
});