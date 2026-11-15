import { hasValidFieldFeedback } from './grading-feedback.mjs';
import { validateAnswerEntries } from './answer-contract.mjs';

const isDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isId = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

/** Legacy records have neither field; new records keep count and snapshot together. */
export function hasValidSubmissionState(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  const { submissionCount, lastSubmission } = record;
  if (submissionCount === undefined && lastSubmission === undefined) return true;
  if (!Number.isSafeInteger(submissionCount) || submissionCount < 0) return false;
  if (submissionCount === 0) return lastSubmission === null;
  if (!lastSubmission || Array.isArray(lastSubmission) || !isId(lastSubmission.id) ||
      lastSubmission.number !== submissionCount || !isDate(lastSubmission.submittedAt) ||
      !isDate(record.updatedAt) ||
      typeof lastSubmission.score !== 'number' || !Number.isFinite(lastSubmission.score) ||
      lastSubmission.score < 0 || lastSubmission.score > 1 ||
      !lastSubmission.feedback || typeof lastSubmission.feedback.message !== 'string' ||
      typeof lastSubmission.feedback.summary !== 'string' ||
      !Array.isArray(lastSubmission.fieldNames) || !lastSubmission.fieldNames.length ||
      new Set(lastSubmission.fieldNames).size !== lastSubmission.fieldNames.length) return false;
  try {
    validateAnswerEntries(lastSubmission.answers);
    validateAnswerEntries(lastSubmission.fieldNames.map((name) => [name, '']));
  } catch { return false; }
  if (lastSubmission.fieldFeedback !== undefined && !hasValidFieldFeedback(lastSubmission.fieldFeedback, lastSubmission.fieldNames)) return false;
  if(lastSubmission.feedbackVisibility!==undefined&&!['shown','suppressed'].includes(lastSubmission.feedbackVisibility))return false;
  const allowed = new Set(lastSubmission.fieldNames);
  return lastSubmission.answers.every(([name]) => allowed.has(name));
}