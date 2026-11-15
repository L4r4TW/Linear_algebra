import {isAnswerFieldName} from './answer-fields.js';
const prefix='practice-draft:v1:';
const sessionPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const sameEntries=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function validDraftAnswers(value){
 if(!value||!Array.isArray(value.fieldNames)||!Array.isArray(value.entries)||value.fieldNames.length>1000||value.entries.length>2000)return false;
 const names=new Set(value.fieldNames);
 return names.size===value.fieldNames.length&&value.fieldNames.every(isAnswerFieldName)&&value.entries.every(pair=>Array.isArray(pair)&&pair.length===2&&names.has(pair[0])&&typeof pair[1]==='string'&&pair[1].length<=100000);
}
export class DraftError extends Error {constructor(code){super(code);this.name='DraftError';this.code=code;}}
function key(id){if(typeof id!=='string'||!sessionPattern.test(id))throw new DraftError('INVALID_SESSION');return prefix+id;}
function validRecord(record,session){return record?.version===1&&record.sessionId===session.id&&record.exerciseId===session.exerciseId&&
 (record.baseSubmissionId===null||typeof record.baseSubmissionId==='string')&&Number.isSafeInteger(record.baseSubmissionNumber)&&record.baseSubmissionNumber>=0&&
 validDraftAnswers(record.answers)&&(record.pending===null||validDraftAnswers(record.pending));}
/** Per-tab storage: access only after a successful owned-session response. No renderer parameters or tokens. */
export function createDraftStore({storage=()=>window.sessionStorage}={}){
 return {
  read(session){
   let raw;try{raw=storage().getItem(key(session.id));}catch{throw new DraftError('STORAGE_UNAVAILABLE');}
   if(raw===null)return null;
   if(raw.length>500000)throw new DraftError('INVALID_DRAFT');
   let record;try{record=JSON.parse(raw);}catch{throw new DraftError('INVALID_DRAFT');}
   if(!validRecord(record,session))throw new DraftError('INVALID_DRAFT');
   return record;
  },
  write(session,submission,answers,pending=null){
   const record={version:1,sessionId:session.id,exerciseId:session.exerciseId,baseSubmissionId:submission?.id??null,baseSubmissionNumber:submission?.number??0,answers:structuredClone(answers),pending:pending?structuredClone(pending):null};
   if(!validRecord(record,session))throw new DraftError('INVALID_DRAFT');
   const raw=JSON.stringify(record);if(raw.length>500000)throw new DraftError('DRAFT_TOO_LARGE');
   try{const target=storage();if(target.getItem(key(session.id))!==raw)target.setItem(key(session.id),raw);}catch{throw new DraftError('STORAGE_UNAVAILABLE');}
  },
  remove(session){try{storage().removeItem(key(session.id));}catch{throw new DraftError('STORAGE_UNAVAILABLE');}}
 };
}
/** Server checked state wins over an unrelated newer check; a matching pending attempt can be reconciled. */
export function planDraftRestoration(record,session,submission,fieldNames){
 if(!record)return {action:'none'};
 if(!validRecord(record,session)||!sameEntries(record.answers.fieldNames,fieldNames))return {action:'ignore',reason:'fields'};
 const currentId=submission?.id??null;
 const sameBase=record.baseSubmissionId===currentId&&record.baseSubmissionNumber===(submission?.number??0);
 const acknowledgedPending=record.pending&&submission&&submission.number>record.baseSubmissionNumber&&sameEntries(record.pending.entries,submission.answers);
 if(!sameBase&&!acknowledgedPending)return {action:'ignore',reason:'newer-result'};
 if(submission&&sameEntries(record.answers.entries,submission.answers))return {action:'clear'};
 return {action:'restore',answers:record.answers,pending:sameBase?record.pending:null};
}