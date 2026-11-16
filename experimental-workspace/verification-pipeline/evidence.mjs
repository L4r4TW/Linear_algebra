import {json,sql,literal as L} from '../importer/db.mjs';import {enqueue,currentContext} from './queue.mjs';
export function materializeEvidence(id){return sql(`SELECT catalog.materialize_verification(${L(id)}::uuid);`);}
export function refreshAffected({requeue=false,limit=20}={}){
 const stale=Number(sql('SELECT catalog.refresh_verification();'));if(!requeue)return {stale,enqueued:0};
 const context=currentContext();if(!context)return {stale,enqueued:0};if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('REQUEUE_LIMIT_1_TO_100');
 const sources=json(`SELECT coalesce(jsonb_agg(source_version_id),'[]') FROM(SELECT DISTINCT e.source_version_id FROM catalog.verification_jobs old JOIN catalog.source_versions s ON s.id=old.source_version_id JOIN catalog.import_entries e ON e.exercise_id=s.exercise_id JOIN catalog.import_heads h ON h.run_id=e.run_id JOIN LATERAL(SELECT id FROM catalog.capability_manifests m WHERE m.source_version_id=e.source_version_id ORDER BY created_at DESC,id DESC LIMIT 1)m ON true WHERE old.state='stale' AND NOT EXISTS(SELECT 1 FROM catalog.verification_jobs fresh WHERE fresh.source_version_id=e.source_version_id AND fresh.context_id=${L(context)}::uuid AND fresh.manifest_id=m.id) LIMIT ${limit})x;`);
 return {stale,enqueued:sources.length?enqueue(sources,'Reverify affected source/requirements/integration').length:0};
}