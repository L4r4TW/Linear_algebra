import {actors,AccountError} from './db.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function validateReport(input){
 if(!input||Array.isArray(input)||Object.keys(input).sort().join(',')!=='category,message,requestId'||!uuid.test(input.requestId??'')||
 !['question','grading','display','accessibility','other'].includes(input.category)||typeof input.message!=='string'||input.message.trim().length<10||input.message.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.message))throw new AccountError('INVALID_REPORT',400);
 return {requestId:input.requestId,category:input.category,message:input.message.trim()};
}
export function createProblemReports({db,vault}){
 return async function submit(sessionId,input){
 const value=validateReport(input);if(!uuid.test(sessionId))throw new AccountError('SESSION_NOT_FOUND',404);
 if(!actors.getStore()?.principalId)throw new AccountError('AUTH_REQUIRED',401);
 return db.current(async client=>{
 const row=(await client.query('SELECT id,principal_id,encrypted_record FROM practice_runtime.sessions WHERE id=$1 FOR UPDATE',[sessionId])).rows[0];
 if(!row)throw new AccountError('SESSION_NOT_FOUND',404);
 const existing=(await client.query('SELECT id,session_id FROM practice_runtime.problem_reports WHERE id=$1',[value.requestId])).rows[0];
 if(existing){if(existing.session_id!==sessionId)throw new AccountError('INVALID_REPORT',400);return {received:true,reportId:existing.id};}
 const n=Number((await client.query("SELECT count(*) n FROM practice_runtime.problem_reports WHERE principal_id=$1 AND created_at>now()-interval '1 hour'",[row.principal_id])).rows[0].n);
 if(n>=5)throw new AccountError('REPORT_RATE_LIMITED',429);
 const record=vault.open(row.encrypted_record,'session:'+sessionId);
 const report={message:value.message,source:record._source??null,submissionId:record.lastSubmission?.id??null};
 await client.query('INSERT INTO practice_runtime.problem_reports(id,session_id,principal_id,exercise_id,category,encrypted_report) VALUES($1,$2,$3,$4,$5,$6)',[value.requestId,sessionId,row.principal_id,record.exerciseId,value.category,vault.seal(report,'report:'+value.requestId)]);
 return {received:true,reportId:value.requestId};
 });
 };
}
