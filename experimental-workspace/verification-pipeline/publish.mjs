import {json,sql,literal as L} from '../importer/db.mjs';import {observeRenderer} from './health.mjs';import {materializeEvidence} from './evidence.mjs';
function reason(value){if(typeof value!=='string'||value.trim().length<12||value.length>2000)throw Error('REASON_12_TO_2000_CHARACTERS_REQUIRED');return value;}
function uuid(value){if(typeof value!=='string'||!/^[a-f0-9-]{36}$/.test(value))throw Error('INVALID_RELEASE_ID');return value;}
function generation(value){if(!Number.isSafeInteger(value)||value<0)throw Error('EXPECTED_GENERATION_REQUIRED');return value;}
export async function prepareRelease(ids,note){
 reason(note);if(!Array.isArray(ids)||ids.length<1||ids.length>100)throw Error('RELEASE_BATCH_1_TO_100');ids=ids.map(uuid);
 const status=json("SELECT jsonb_build_object('certified',c.payload->'certified') FROM catalog.verifier_heads h JOIN catalog.verifier_contexts c ON c.id=h.context_id WHERE h.scope='local-practice';");
 if(status?.certified!==true)throw Error('PUBLICATION_BLOCKED: ENVIRONMENT_UNCERTIFIED');
 if(!(await observeRenderer()).matches)throw Error('PUBLICATION_BLOCKED: RENDERER_BUILD_OR_SERVICE_UNAVAILABLE');
 for(const id of ids)materializeEvidence(id);
 const id=sql(`SELECT catalog.prepare_verification_release(ARRAY[${ids.map(v=>L(v)+'::uuid').join(',')}],'local-operator',${L(note)});`);
 return json(`SELECT jsonb_build_object('releaseId',r.id,'expectedGeneration',h.generation,'scope',r.scope,'replacesCurrentManifest',true,'members',(SELECT jsonb_agg(jsonb_build_object('exerciseId',m.exercise_id,'sourceVersionId',m.source_version_id,'assessmentId',m.assessment_id)) FROM catalog.activation_members m WHERE m.release_id=r.id)) FROM catalog.activation_releases r JOIN catalog.deployment_heads h ON h.scope=r.scope WHERE r.id=${L(id)}::uuid;`);
}
export async function publishRelease(id,expected,note){
 reason(note);uuid(id);generation(expected);
 if(!(await observeRenderer()).matches)throw Error('PUBLICATION_BLOCKED: RENDERER_BUILD_OR_SERVICE_UNAVAILABLE');
 return {generation:Number(sql(`SELECT catalog.publish_release(${L(id)}::uuid,${expected},'local-operator',${L(note)});`))};
}
export function withdraw(expected,note){reason(note);generation(expected);return {generation:Number(sql(`SELECT catalog.withdraw_release('local-practice',${expected},'local-operator',${L(note)});`))};}
