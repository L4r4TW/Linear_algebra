// Reference policy for synthetic trusted facts only. Not authentication, RLS or a student API.
function ownerPrincipal(record,db){return db.principals.find(p=>p.key===record?.ownerPrincipalKey&&p.state==='active')??null;}
function activeAccountActor(actor,db){return actor?.kind==='account'&&Boolean(actor.accountKey)&&db.principals.filter(p=>p.kind==='account'&&p.accountKey===actor.accountKey&&p.state==='active').length===1;}
export function ownsStudentRecord(actor,record,db){
 const owner=ownerPrincipal(record,db);if(!owner)return false;
 if(owner.kind==='account')return activeAccountActor(actor,db)&&actor.accountKey===owner.accountKey;
 if(owner.kind!=='anonymous')return false;
 const links=db.claims.filter(c=>c.anonymousPrincipalKey===owner.key);
 if(links.length)return links.length===1&&links[0].state==='active'&&activeAccountActor(actor,db)&&actor.accountKey===links[0].accountKey;
 return Array.isArray(actor?.verifiedAnonymousPrincipalKeys)&&actor.verifiedAnonymousPrincipalKeys.includes(owner.key);
}
export function ownsStudentChild(actor,child,parent,db){return Boolean(child&&parent)&&child.sessionKey===parent.key&&child.ownerPrincipalKey===parent.ownerPrincipalKey&&(child.sourceVersionKey===undefined||child.sourceVersionKey===parent.sourceVersionKey)&&(child.environmentKey===undefined||child.environmentKey===parent.environmentKey)&&ownsStudentRecord(actor,parent,db);}
export function planAnonymousClaim({actor,anonymousPrincipalKey,db,consentVerified=false,originVerified=false,inFlight=false,uncertain=false}){
 if(!activeAccountActor(actor,db)||!consentVerified||!originVerified)return {allowed:false,reason:'unavailable'};
 const principal=db.principals.find(p=>p.key===anonymousPrincipalKey&&p.kind==='anonymous'&&p.state==='active');if(!principal)return {allowed:false,reason:'unavailable'};
 const links=db.claims.filter(c=>c.anonymousPrincipalKey===principal.key);
 if(links.length)return links.length===1&&links[0].state==='active'&&links[0].accountKey===actor.accountKey?{allowed:true,action:'already-linked'}:{allowed:false,reason:'unavailable'};
 if(!actor.verifiedAnonymousPrincipalKeys?.includes(principal.key))return {allowed:false,reason:'unavailable'};
 if(inFlight||uncertain)return {allowed:false,reason:'reconcile-before-claim'};
 return {allowed:true,action:'link',anonymousPrincipalKey:principal.key,accountKey:actor.accountKey};
}
export function planStudentDraftWrite({actor,draft,session,db,expectedRevision,baseSubmissionKey}){
 if(!ownsStudentChild(actor,draft,session,db))return {allowed:false,reason:'unavailable'};
 if(!Number.isSafeInteger(draft.revision)||draft.revision<0||expectedRevision!==draft.revision)return {allowed:false,reason:'revision-conflict'};
 if(baseSubmissionKey!==session.lastSubmissionKey)return {allowed:false,reason:'checked-baseline-conflict'};
 return {allowed:true,nextRevision:draft.revision+1};
}
const publicFieldStatuses=new Set(['correct','incorrect','partial','invalid','unanswered','ungraded']);
export function projectOwnedStudentAttempt(actor,attempt,session,db){
 if(!ownsStudentChild(actor,attempt,session,db))return null;
 const visibility=attempt.state!=='accepted'?'unknown':['shown','suppressed'].includes(attempt.feedbackVisibility)?attempt.feedbackVisibility:'unknown';const shown=visibility==='shown';
 return {id:attempt.key,sessionId:session.key,exerciseId:session.exerciseKey,state:attempt.state,provenance:attempt.provenance,sourceBinding:session.sourceBinding,feedbackVisibility:visibility,score:shown&&Number.isFinite(attempt.score)&&attempt.score>=0&&attempt.score<=1?attempt.score:null,answers:structuredClone(attempt.answers??[]),feedback:shown?{message:typeof attempt.feedback?.message==='string'?attempt.feedback.message:'',summary:typeof attempt.feedback?.summary==='string'?attempt.feedback.summary:''}:{message:'',summary:''},fieldFeedback:(attempt.fieldFeedback??[]).map(field=>({name:field.name,status:shown&&publicFieldStatuses.has(field.status)?field.status:'ungraded',score:shown&&Number.isFinite(field.score)&&field.score>=0&&field.score<=1?field.score:null,message:shown&&typeof field.message==='string'?field.message:'',...(!shown?{reason:visibility==='suppressed'?'suppressed':attempt.state==='accepted'?'visibility-unknown':'submission-unconfirmed'}:{})}))};
}
export function summarizeOwnedStudentWork(actor,sessions,attempts,db){
 const byKey=new Map(sessions.map(s=>[s.key,s])),owned=attempts.filter(a=>{const parent=byKey.get(a.sessionKey);return parent&&ownsStudentChild(actor,a,parent,db);});
 const accepted=owned.filter(a=>a.state==='accepted'),pg=accepted.filter(a=>{const s=byKey.get(a.sessionKey);return a.provenance==='server-pg'&&s.sourceBinding==='pinned'&&Boolean(s.sourceVersionKey&&s.environmentKey)&&a.sourceVersionKey===s.sourceVersionKey&&a.environmentKey===s.environmentKey;});
 const visible=pg.filter(a=>a.feedbackVisibility==='shown'&&Number.isFinite(a.score)&&a.score>=0&&a.score<=1);
 return {acceptedSubmissions:accepted.length,pinnedRendererAttempts:pg.length,visibleGradedAttempts:visible.length,withheldRendererAttempts:pg.filter(a=>a.feedbackVisibility==='suppressed').length,unknownVisibilityRendererAttempts:pg.filter(a=>!['shown','suppressed'].includes(a.feedbackVisibility)).length,fullyCorrectSourceVersions:new Set(visible.filter(a=>a.score===1).map(a=>JSON.stringify([byKey.get(a.sessionKey).exerciseKey,a.sourceVersionKey]))).size,legacyOrUnboundAccepted:accepted.length-pg.length};
}
