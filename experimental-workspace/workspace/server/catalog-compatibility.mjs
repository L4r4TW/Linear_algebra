import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
// Data, activation choices and test files are deliberately excluded. Runtime and profile changes invalidate evidence.
export const compatibilityRuntimeFiles=[
 'package-lock.json','server.mjs','server/exercise-assets.mjs','server/catalog-compatibility.mjs','server/compatibility-profile.json','server/exercise-catalog.mjs',
 'server/renderer-client.mjs','server/exercise-sessions.mjs','server/answer-contract.mjs','server/submission-state.mjs','server/grading-feedback.mjs','server/feedback-content.mjs','server/authored-hints.mjs','server/http-app.mjs',
 'server/practice-sets.mjs','public/bookmarks.js','public/index.html','public/picker.js','public/picker.css','public/exercise-frame.js','public/exercise.css','public/session-recovery.js','public/draft-answers.js','public/answer-fields.js','public/answer-bridge.js','public/widget-answers.js','public/feedback-model.js','public/practice-actions.js','public/field-feedback.js','public/feedback-content.js'
];
export function runtimeFingerprint(){
 const digest=createHash('sha256');
 for(const path of compatibilityRuntimeFiles)digest.update(path+'\0').update(readFileSync(new URL('../'+path,import.meta.url))).update('\0');
 return digest.digest('hex');
}
const sameSet=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&new Set(a).size===a.length&&a.length===b.length&&a.every(v=>b.includes(v));
const issue=(code,message,details={})=>({code,message,...details});
/** Pure fail-closed rule for an indexed entry. No browser flags or rendering requests are used. */
export function assessCatalogEntry(entry,{profile,evidence,batches=[],fingerprint}){
 const problems=[];
 const base={enabled:false,status:'unverified',issues:problems};
 if(!profile?.seeds?.length||!profile.viewports?.length||!profile.checks?.length||!profile.capabilities){problems.push(issue('INVALID_PROFILE','A nonempty verification profile is required.'));return base;}
 const requirements=entry?.compatibility?.requiredCapabilities;
 if(!entry||!Array.isArray(requirements)||!requirements.length||new Set(requirements).size!==requirements.length){problems.push(issue('MISSING_CAPABILITIES','Capability requirements must be explicit and unique.'));return base;}
 const proof=evidence?.entries?.[entry.id];
 if(!proof){problems.push(issue('NO_EVIDENCE','This indexed exercise has no verification evidence.'));return base;}
 const identity=proof.source;
 if(!identity||!/^[a-f0-9]{64}$/.test(entry.source?.sha256??'')||!entry.source?.path||identity.revision!==entry.source?.revision||identity.sha256!==entry.source?.sha256||identity.path!==entry.source?.path||proof.rendererPath!==entry.renderer?.sourceFilePath||!sameSet(requirements,proof.requiredCapabilities)){
  problems.push(issue('SOURCE_OR_REQUIREMENTS_CHANGED','The source identity or declared capabilities differ from the tested exercise.'));return {...base,status:'stale'};
 }
 if(evidence.runtimeFingerprint!==fingerprint||evidence.profileVersion!==profile.version||evidence.rendererRevision!==profile.rendererRevision||evidence.sourceRevision!==profile.sourceRevision||entry.source.revision!==profile.sourceRevision){
  problems.push(issue('RUNTIME_OR_PROFILE_CHANGED','Reverification is required for this runtime, renderer, library revision or compatibility profile.'));return {...base,status:'stale'};
 }
 const expected=profile.seeds.flatMap(seed=>profile.viewports.map(viewport=>seed+':'+viewport));
 const cases=proof.cases??[],seen=new Set(cases.map(c=>c.verificationSeed+':'+c.viewport));
 if(!evidence.complete||cases.length!==expected.length||seen.size!==cases.length||expected.some(key=>!seen.has(key))){
  problems.push(issue('INCOMPLETE_EVIDENCE','Every required seed and viewport must be tested exactly once.'));return base;
 }
 const unknown=requirements.filter(cap=>!Object.hasOwn(profile.capabilities,cap));
 const unsupported=requirements.filter(cap=>profile.capabilities[cap]?.status!=='verified');
 for(const cap of unknown)problems.push(issue('UNKNOWN_CAPABILITY','No runtime support is declared for '+cap+'.',{capability:cap}));
 for(const cap of unsupported.filter(c=>!unknown.includes(c)))problems.push(issue('UNSUPPORTED_CAPABILITY',profile.capabilities[cap].reason??('Runtime support is not verified for '+cap+'.'),{capability:cap}));
 for(const c of cases){
  if(!c.sourceVerified||!c.passed||c.phase!=='complete'||profile.checks.some(check=>c.checks?.[check]!==true)||c.correctScore!==1||c.clearedScore!==0)
   problems.push(issue('REGRESSION_FAILURE','A required regression check failed.',{verificationSeed:c.verificationSeed,viewport:c.viewport,failedChecks:profile.checks.filter(check=>c.checks?.[check]!==true),failure:c.error??null}));
  for(const gap of c.limitations??[])if(!problems.some(p=>p.code===gap.code))problems.push(issue(gap.code,gap.reason,{capability:gap.capability,status:gap.status}));
 }
 let status=problems.some(p=>['UNKNOWN_CAPABILITY','UNSUPPORTED_CAPABILITY'].includes(p.code)||p.status==='unsupported')?'unsupported':problems.some(p=>p.code==='REGRESSION_FAILURE')?'failed':problems.length?'limited':'verified';
 // A claimed status alone is never sufficient. New imports default to an explicit non-verified claim.
 if(entry.compatibility.status!==status)problems.push(issue('STATUS_MISMATCH','Stored compatibility status must match the evidence assessment.'));
 const activation=entry.activation;
 const batch=batches.find(b=>b.id===activation?.batchId&&b.state==='active'&&b.profileVersion===profile.version&&b.exerciseIds.includes(entry.id));
 if(activation?.state!=='enabled')problems.push(issue('ACTIVATION_DISABLED','The exercise is indexed but not enabled.'));
 else if(!batch)problems.push(issue('BATCH_NOT_APPROVED','An explicit active batch must include this exercise.'));
 return {status,enabled:status==='verified'&&problems.length===0,issues:problems};
}
/** The importer can index metadata without accidentally authorizing a problem. */
export function initialCompatibility(requiredCapabilities=[]){return {compatibility:{status:'unverified',requiredCapabilities:[...requiredCapabilities]},activation:{state:'disabled',batchId:null}};}
