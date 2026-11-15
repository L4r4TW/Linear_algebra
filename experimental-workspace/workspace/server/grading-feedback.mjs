const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const statuses = new Set(['correct', 'incorrect', 'partial', 'invalid', 'unanswered', 'ungraded']);

/** Decode only the token returned directly by our configured renderer, never a browser token.
 * This is data projection, not JWT authentication. Transport trust is the same as for
 * the renderer JSON score. Correct answers and all other claims stay private.
 */
export function projectFieldFeedback(token, entries, toText, { individualResults = true } = {}) {
  if (typeof token !== 'string' || token.length > 2_000_000) throw new Error('Missing grading data.');
  const segments = token.split('.');
  if (segments.length !== 3 || segments.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error('Invalid grading data.');
  const payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
  if (!isRecord(payload) || !isRecord(payload.score) || !isRecord(payload.score.answers)) throw new Error('Invalid grading data.');
  return [...new Set(entries.map(([name]) => name))].map((name) => {
    const base = { name, status: 'ungraded', score: null, message: '', reason:individualResults?'unavailable':'suppressed' };
    if (!individualResults || !Object.hasOwn(payload.score.answers, name)) return base;
    const answer = payload.score.answers[name];
    if (!isRecord(answer)) throw new Error('Invalid answer feedback.');
    const error = toText(answer.error_message);
    const message = toText(answer.ans_message);
    // MathObjects also puts mathematical hints into error_message. A parsed
    // student_value distinguishes those hints from a failed parse. Never guess
    // syntax validity from the wording of a message.
    const failedParse = Boolean(error) && Object.hasOwn(answer, 'student_value') && answer.student_value == null;
    const hasError = failedParse || ![undefined, null, false, 0, '0', ''].includes(answer.error_flag);
    let score = answer.score;
    if (typeof score === 'string' && /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(score)) score = Number(score);
    if (score !== undefined && score !== null && (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1)) {
      throw new Error('Invalid answer score.');
    }
    if (score === undefined || score === null) return { ...base, message };
    const blank = !entries.some(([key, value]) => key === name && value.trim());
    const status = score === 1 ? 'correct' : blank ? 'unanswered' : hasError ? 'invalid' : score > 0 ? 'partial' : 'incorrect';
    return { name, status, score, message: status === 'invalid' ? error || message : message || error };
  });
}

export function hasValidFieldFeedback(fields, fieldNames) {
  if (!Array.isArray(fields) || fields.length > fieldNames.length) return false;
  const names = new Set(fieldNames);
  const seen = new Set();
  return fields.every((field) => {
    if (!isRecord(field) || !names.has(field.name) || seen.has(field.name) ||
        !statuses.has(field.status) || typeof field.message !== 'string' ||
        (field.score !== null && (typeof field.score !== 'number' || !Number.isFinite(field.score) || field.score < 0 || field.score > 1))) return false;
    if(field.status==='ungraded'&&field.score!==null||field.status!=='ungraded'&&field.score===null)return false;
    if(field.status==='correct'&&field.score!==1||field.status==='incorrect'&&field.score!==0||field.status==='partial'&&!(field.score>0&&field.score<1))return false;
    if(['invalid','unanswered'].includes(field.status)&&field.score===1)return false;
    if(field.reason!==undefined&&(!['suppressed','unavailable'].includes(field.reason)||field.status!=='ungraded'))return false;
    if(field.reason==='suppressed'&&field.message!=='')return false;
    seen.add(field.name);
    return true;
  });
}
