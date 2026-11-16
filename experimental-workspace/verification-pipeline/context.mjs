import {readFileSync,readdirSync} from 'node:fs';
import {json,sql,literal} from '../importer/db.mjs';
import {runtimeFingerprint} from '../application/server/catalog-compatibility.mjs';
import {workerRuntime} from './runtime.mjs';
import {VERSION,digest} from './contract.mjs';
export function runnerDigest(){
 const files=readdirSync('/qa/pipeline').filter(n=>n.endsWith('.mjs')&&!n.endsWith('.test.mjs')).sort().map(n=>['pipeline/'+n,digest(readFileSync('/qa/pipeline/'+n).toString())]);
 for(const n of readdirSync('/qa/compatibility').filter(n=>n.endsWith('.mjs')||n==='unsupported-capabilities.json').sort())files.push(['compatibility/'+n,digest(readFileSync('/qa/compatibility/'+n).toString())]);
 files.push(['reference-fixtures',digest(readFileSync('/qa/pipeline/reference-fixtures.json').toString())]);return digest(files);
}
export function registerContext(input){
 if(!/^sha256:[a-f0-9]{64}$/.test(input.workerImage??''))throw Error('MEASURED_WORKER_IMAGE_REQUIRED');
 if(input.attestation?.rendererRevision!=='1134ffbbf5e656148e579f424f70bcd9f1d15936'||!/^[a-f0-9]{40}$/.test(input.attestation?.pgRevision??'')||
 !/^[a-f0-9]{64}$/.test(input.attestation?.installedPgDigest??'')||!/^sha256:[a-f0-9]{64}$/.test(input.rendererImage??''))throw Error('MEASURED_RENDERER_ATTESTATION_REQUIRED');
 const head=json("SELECT jsonb_build_object('snapshotId',r.snapshot_id,'revision',s.commit_oid,'manifest',r.manifest_digest) FROM catalog.import_heads h JOIN catalog.repositories p ON p.id=h.repository_id JOIN catalog.import_runs r ON r.id=h.run_id JOIN catalog.snapshots s ON s.id=r.snapshot_id WHERE p.registry_key='openwebwork-opl';");
 const profile=JSON.parse(readFileSync('/qa/application/server/compatibility-profile.json','utf8'));
 if(input.sourceRevision!==head.revision||input.sourceClean!==true||head.revision!==profile.sourceRevision)throw Error('CLEAN_MATCHING_SOURCE_SNAPSHOT_REQUIRED');
 const payload={version:VERSION,...head,attestation:input.attestation,rendererImage:input.rendererImage,workerImage:input.workerImage,workerRuntime:workerRuntime(),runtimeDigest:runtimeFingerprint(),
 runnerDigest:runnerDigest(),profile,profileDigest:digest(profile),dependencyDigest:digest({image:input.rendererImage,workerImage:input.workerImage,pg:input.attestation.installedPgDigest}),certified:input.attestation.pgTrackedClean===true};
 const id=sql(`BEGIN;INSERT INTO catalog.verifier_contexts(snapshot_id,digest,payload) VALUES(${literal(head.snapshotId)}::uuid,${literal(digest(payload))},${literal(payload)}::jsonb) ON CONFLICT(digest) DO NOTHING;
 SELECT id FROM catalog.verifier_contexts WHERE digest=${literal(digest(payload))};COMMIT;`);
 sql(`INSERT INTO catalog.verifier_heads(scope,context_id) VALUES('local-practice',${literal(id)}::uuid) ON CONFLICT(scope) DO UPDATE SET context_id=excluded.context_id,generation=catalog.verifier_heads.generation+1 WHERE catalog.verifier_heads.context_id<>excluded.context_id;`);
 return {id,certified:payload.certified,pgRevision:payload.attestation.pgRevision,runtimeDigest:payload.runtimeDigest,runnerDigest:payload.runnerDigest};
}
