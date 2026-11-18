import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReport } from './problem-reports.mjs';
const valid = {
  requestId: '00000000-0000-4000-8000-000000000001',
  category: 'grading',
  message: 'The result appears incorrect.',
};
test('report accepts bounded text and rejects client-controlled source, owner, answers and HTML authority', () => {
  assert.equal(validateReport(valid).category, 'grading');
  for (const change of [
    { category: 'accepted' },
    { message: 'short' },
    { message: 'x'.repeat(2001) },
    { requestId: 'invalid' },
    { source: {} },
    { ownerId: 'x' },
    { answers: [] },
  ])
    assert.throws(() => validateReport({ ...valid, ...change }), { code: 'INVALID_REPORT' });
  assert.equal(
    validateReport({
      ...valid,
      message: '<script>text stays encrypted text</script>',
    }).message.includes('<script>'),
    true,
  );
});
