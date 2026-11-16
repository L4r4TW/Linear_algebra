import assert from 'node:assert/strict';import {readFileSync,writeFileSync,readdirSync} from 'node:fs';import {json} from '../importer/db.mjs';import {CHECKS,SEEDS,VIEWPORTS,digest} from './contract.mjs';
const current=json("SELECT jsonb_build_object('id',c.id,'certified',c.payload->'certified','workerRuntime',c.payload->'workerRuntime','workerImage',c.payload->>'workerImage','rendererRevision',c.payload->'attestation'->>'rendererRevision','pgRevision',c.payload->'attestation'->>'pgRevision','runtimeDigest',c.payload->>'runtimeDigest','runnerDigest',c.payload->>'runnerDigest','health',h.code) FROM catalog.verifier_heads p JOIN catalog.verifier_contexts c ON c.id=p.context_id LEFT JOIN catalog.verifier_health h ON h.scope='local-practice' AND h.context_id=c.id WHERE p.scope='local-practice';");
const rows=json("SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT j.id job_id,a.external_id exercise_id,j.state,j.technical_state,j.attempt_count,j.max_attempts,attempt.result,attempt.started_at,attempt.finished_at FROM catalog.verification_jobs j JOIN catalog.verifier_heads h ON h.scope='local-practice' AND h.context_id=j.context_id JOIN catalog.source_versions s ON s.id=j.source_version_id JOIN catalog.aliases a ON a.exercise_id=s.exercise_id AND a.namespace='experimental-opl' LEFT JOIN LATERAL(SELECT * FROM catalog.verification_attempts qa WHERE qa.job_id=j.id ORDER BY ordinal DESC LIMIT 1)attempt ON true ORDER BY a.external_id)x;");
const expected=JSON.parse(readFileSync('/qa/pipeline/reference-fixtures.json','utf8')).exercises.map(e=>e.id);
assert.equal(rows.length,expected.length);assert.ok(expected.every(id=>rows.some(r=>r.exercise_id===id)));assert.ok(rows.every(r=>!['queued','running'].includes(r.state)));
assert.equal(current.certified,false);assert.equal(current.health,'MATCHING_RENDERER');
const availability=json("SELECT catalog_api.opl_counts();");assert.equal(availability.indexed,77134);assert.equal(availability.practiceReady,0);
assert.equal(Number(json("SELECT to_json(count(*)) FROM catalog.verification_approvals;")),0);
for(const row of rows){if(row.technical_state==='passed'){assert.equal(row.result.cases.length,4);assert.ok(row.result.cases.every(c=>c.sourceVerified&&CHECKS.every(k=>c.checks[k]===true)&&c.correctScore===1&&c.clearedScore===0));}}
const cases=rows.flatMap(r=>r.result?.cases??[]),elapsedMs=rows.reduce((n,r)=>n+(r.result?.elapsedMs??0),0);
const states={};for(const row of rows)states[row.state]=(states[row.state]??0)+1;
const hashes=[];
for(const name of readdirSync('/qa/pipeline').filter(n=>/\.(mjs|sql|sh)$/.test(n)).sort())hashes.push({file:name,sha256:digest(readFileSync('/qa/pipeline/'+name).toString())});
for(const name of readdirSync('/migrations').filter(n=>/^20261116.*\.sql$/.test(n)).sort())hashes.push({file:name,sha256:digest(readFileSync('/migrations/'+name).toString())});
const result={version:1,observedAt:new Date().toISOString(),scope:'Private verification renderer; temporary operator sessions; no student/session volume, existing runtime or hosted Supabase changes',
 nodeVersion:process.version,context:current,profile:{checks:CHECKS,seeds:SEEDS,viewports:VIEWPORTS},catalog:availability,
 batch:{targets:rows.length,states,executedCases:cases.length,passingCases:cases.filter(c=>c.outcome==='passed'&&CHECKS.every(k=>c.checks[k])&&!c.limitations.length).length,
 failedOrLimitedCases:cases.filter(c=>c.outcome!=='passed'||!CHECKS.every(k=>c.checks[k])||c.limitations.length).length,unsupportedTargets:rows.filter(r=>r.technical_state==='unsupported').length,
 totalWorkerElapsedMs:elapsedMs,serialTargetsPerMinute:elapsedMs?Number((rows.length/(elapsedMs/60000)).toFixed(2)):null,
 note:'Measured bounded reference batch, not full-library throughput or an all-passing compatibility gate. Unsupported/failed/limited results remain ineligible.'},
 jobs:rows.map(({job_id,exercise_id,state,technical_state,attempt_count,result})=>({jobId:job_id,exerciseId:exercise_id,state,technicalState:technical_state,attemptCount:attempt_count,cases:result?.cases??[],error:result?.error??null})),
 checks:{allTargetsAccounted:true,exactBaselinePreserved:true,technicalPassesHaveAllRequiredProof:true,noRealApprovals:true,noUncertifiedActivation:true,existingCatalogStillIndexed:true},
 knownBlockers:['Strict tracked PG provenance remains uncertified; generated lockfile differs. No certification exception was authorized.','Independent mathematical/manual/deployment reviews remain pending.','Known graph/scaffold/narrow-layout limitations remain explicit.'],
 sourceHashes:hashes,complete:true};
writeFileSync('/tmp/pipeline-observations.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({targets:rows.length,states,executedCases:cases.length,elapsedMs,complete:true}));
