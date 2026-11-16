// Test-only source subset with real pinned source/capability/runtime metadata. No reviews or approvals.
import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';import {sql,json,literal as L} from '../importer/db.mjs';import {digest} from './contract.mjs';import {enqueue,control,claim,finish} from './queue.mjs';
if(!/^opl_importer_test_[a-z0-9]+$/.test(process.env.PGDATABASE??''))throw Error('DISPOSABLE_DATABASE_REQUIRED');
const mode=process.argv[2];
function source(alias){return sql(`SELECT s.id FROM catalog.aliases a JOIN catalog.source_versions s ON s.exercise_id=a.exercise_id WHERE a.namespace='experimental-opl' AND a.external_id=${L(alias)};`);}
function job(alias){return sql(`SELECT id FROM catalog.verification_jobs WHERE source_version_id=${L(source(alias))}::uuid;`);}
if(mode==='seed'){
 const input=JSON.parse(readFileSync(0,'utf8')),snapshot=sql(`SELECT id FROM catalog.snapshots WHERE commit_oid=${L(input.context.revision)};`);
 if(!snapshot)throw Error('SOURCE_SNAPSHOT_MISSING');
 const context={...input.context,snapshotId:snapshot,certified:false,acceptanceOnly:true},contextDigest=digest(context);
 sql(`BEGIN;DO $$ DECLARE v_run uuid;v_repo uuid;v_source catalog.source_versions;v_row jsonb;v_context uuid;BEGIN
 SELECT repository_id INTO v_repo FROM catalog.snapshots WHERE id=${L(snapshot)}::uuid;
 INSERT INTO catalog.import_runs(snapshot_id,request_key,scope,manifest_digest,scanner_version,state,expected_count,parser_version)
 VALUES(${L(snapshot)}::uuid,'acceptance-'||gen_random_uuid(),'{"operatorTestSubset":true}',${L(context.manifest)},'acceptance-only','running',2,'acceptance-only') RETURNING id INTO v_run;
 FOR v_row IN SELECT * FROM jsonb_array_elements(${L(input.sources)}::jsonb) LOOP
  SELECT * INTO v_source FROM catalog.source_versions WHERE snapshot_id=${L(snapshot)}::uuid AND path=v_row->>'path' AND sha256=v_row->>'sha256';
  IF NOT FOUND THEN RAISE EXCEPTION 'Exact pinned source required';END IF;
  INSERT INTO catalog.import_entries(run_id,path,blob_oid,sha256,byte_count,metadata,state,exercise_id,source_version_id) VALUES(v_run,v_source.path,repeat('a',40),v_source.sha256,1,jsonb_build_object('title',v_row->>'alias','state','missing'),'imported',v_source.exercise_id,v_source.id);
  INSERT INTO catalog.capability_manifests(source_version_id,detector_version,digest,manifest) VALUES(v_source.id,v_row->'manifest'->>'version',v_row->'manifest'->>'digest',v_row->'manifest');
 END LOOP;
 UPDATE catalog.import_runs SET state='completed',inventory_sealed=true WHERE id=v_run;
 INSERT INTO catalog.import_heads(repository_id,run_id) VALUES(v_repo,v_run);
 INSERT INTO catalog.verifier_contexts(snapshot_id,digest,payload) VALUES(${L(snapshot)}::uuid,${L(contextDigest)},${L(context)}::jsonb) RETURNING id INTO v_context;
 INSERT INTO catalog.verifier_heads VALUES('local-practice',v_context,1);
 END $$;COMMIT;`);
 enqueue([source('dot-product-01')],'Acceptance renderer outage probe');
 console.log('SEEDED_ACCEPTANCE_SUBSET');
}else if(mode==='assert-outage'){
 const row=json(`SELECT result FROM catalog.verification_attempts WHERE job_id=${L(job('dot-product-01'))}::uuid ORDER BY ordinal DESC LIMIT 1;`);
 assert.equal(row.technicalState,'error');assert.equal(row.error,'RENDERER_UNAVAILABLE');console.log('OUTAGE_CLASSIFIED_AS_INFRASTRUCTURE_ERROR');
}else if(mode==='retry-dot'){control(job('dot-product-01'),'retry','Explicit retry after private renderer recovery');}
else if(mode==='queue-numeric'){enqueue([source('compat-calculus-numeric-01')],'Acceptance worker crash probe');}
else if(mode==='compete'){assert.equal(claim('acceptance-competitor',20,1),null);console.log('CONCURRENT_CLAIM_PREVENTED');}
else if(mode==='probe'){
 const work=claim('acceptance-crash-probe',20,1);if(!work)throw Error('No crash-probe job');
 console.log('CLAIMED_FOR_CRASH '+work.jobId);setInterval(()=>{},1000);
}else if(mode==='assert-recovered'){
 const dot=json(`SELECT jsonb_agg(jsonb_build_object('state',state,'result',result) ORDER BY ordinal) FROM catalog.verification_attempts WHERE job_id=${L(job('dot-product-01'))}::uuid;`);
 const numeric=json(`SELECT jsonb_agg(jsonb_build_object('state',state,'result',result) ORDER BY ordinal) FROM catalog.verification_attempts WHERE job_id=${L(job('compat-calculus-numeric-01'))}::uuid;`);
 assert.equal(dot.length,2);assert.equal(dot[0].result.error,'RENDERER_UNAVAILABLE');assert.equal(dot[1].result.technicalState,'passed');
 assert.equal(numeric.length,2);assert.equal(numeric[0].state,'expired');assert.equal(numeric[1].result.technicalState,'passed');
 const old=json(`SELECT jsonb_build_object('job',job_id,'token',lease_token) FROM catalog.verification_attempts WHERE job_id=${L(job('compat-calculus-numeric-01'))}::uuid AND ordinal=1;`);
 assert.equal(finish(old.job,old.token,{technicalState:'error',error:'LATE_WORKER_RESULT',cases:[],elapsedMs:0}),false);
 console.log(JSON.stringify({privateRendererOutage:true,explicitRecovery:true,workerKilled:true,leaseRecovered:true,concurrentClaimPrevented:true,lateWorkerFenced:true,retainedAttempts:4,complete:true}));
}
