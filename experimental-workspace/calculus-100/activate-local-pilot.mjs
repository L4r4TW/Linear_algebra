import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {sql,json,literal as L} from '../importer/db.mjs';import {technicalState} from '../pipeline/contract.mjs';
if(!process.argv.includes('--activate'))throw Error('EXPLICIT_ACTIVATE_REQUIRED');
const pilot=JSON.parse(readFileSync(new URL('./local-pilot.json',import.meta.url),'utf8')),raw=readFileSync(new URL('./independent-pilot.json',import.meta.url),'utf8'),proof=JSON.parse(raw);
assert.equal(pilot.exercises.length,10);assert.equal(proof.complete,true);assert.equal(proof.cases.length,40);
const digest=createHash('sha256').update(raw).digest('hex'),notes='User explicitly authorized tested local practice without human/moderator approval, with student problem reports. Agent-assisted source/student-question evidence, not independent human approval. Local noncommercial pilot only.';
const values=[];
for(const e of pilot.exercises){
 const cases=proof.cases.filter(c=>c.id===e.id);assert.equal(cases.length,4);
 for(const seed of [1234,4321])for(const viewport of ['desktop','mobile']){
 const c=cases.find(c=>c.seed===seed&&c.viewport===viewport);assert.ok(c&&c.sourceVerified&&c.independentStudentSolutionAccepted&&c.nativeControlSemantics&&c.keyboardSubmission&&c.sameSessionRestoration&&c.narrowShell);
 }
 const actual=json(`SELECT jsonb_build_object('id',s.exercise_id,'sha256',s.sha256,'path',s.path,'source',j.source_version_id,'current',catalog.verification_job_current(j.id),'result',a.result) FROM catalog.verification_jobs j JOIN catalog.verification_attempts a ON a.job_id=j.id JOIN catalog.source_versions s ON s.id=j.source_version_id WHERE j.id=${L(e.jobId)}::uuid AND a.id=${L(e.attemptId)}::uuid`);
 assert.equal(actual.id,e.id);assert.equal(actual.sha256,e.sha256);assert.equal(actual.path,e.path);assert.equal(actual.source,e.sourceVersionId);assert.equal(actual.current,true);assert.equal(technicalState(actual.result.cases),'passed');
 values.push(`(${L(e.sourceVersionId)}::uuid,${L(e.jobId)}::uuid,${L(e.attemptId)}::uuid,${L(digest)},${L(notes)},true)`);
}
sql(`BEGIN; INSERT INTO catalog_backend.local_pilot_grants(source_version_id,job_id,attempt_id,oracle_digest,policy_reason,active) VALUES ${values.join(',')} ON CONFLICT(source_version_id) DO UPDATE SET job_id=EXCLUDED.job_id,attempt_id=EXCLUDED.attempt_id,oracle_digest=EXCLUDED.oracle_digest,policy_reason=EXCLUDED.policy_reason,active=true;
DO $$ BEGIN IF jsonb_array_length(catalog_backend.local_pilot_catalog()->'entries')<>10 THEN RAISE EXCEPTION 'Pilot technical/current-context guard failed';END IF;END $$; COMMIT;`);
console.log(JSON.stringify({activated:10,policy:'tested-local-pilot',independentReviewsCreated:0,oracleDigest:digest}));
