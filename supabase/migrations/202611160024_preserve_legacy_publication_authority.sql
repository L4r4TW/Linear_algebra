-- Retain publication authority across withdrawal; legacy aliases must not bypass it.
BEGIN;
SET LOCAL search_path=pg_catalog;
CREATE OR REPLACE FUNCTION catalog_backend.player_catalog() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('context',(
  SELECT jsonb_build_object('id',c.id,'runtimeDigest',c.payload->'runtimeDigest','certified',c.payload->'certified','attestation',c.payload->'attestation')
  FROM catalog.verifier_heads h JOIN catalog.verifier_contexts c ON c.id=h.context_id WHERE h.scope='local-practice'),
 'managedLegacyIds',coalesce((SELECT jsonb_agg(DISTINCT a.external_id) FROM catalog.aliases a JOIN catalog.activation_members m ON m.exercise_id=a.exercise_id JOIN catalog.activation_releases r ON r.id=m.release_id WHERE a.namespace='experimental-opl' AND r.scope='local-practice' AND r.state IN('published','withdrawn')),'[]'::jsonb),
 'entries',coalesce((
  SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM(
   SELECT e.exercise_id id,e.source_version_id,s.commit_oid revision,e.path,e.sha256,e.metadata-'raw' metadata,j.context_id
   FROM catalog.import_entries e JOIN catalog.import_heads ih ON ih.run_id=e.run_id
   JOIN catalog.repositories repo ON repo.id=ih.repository_id
   JOIN catalog.source_versions sv ON sv.id=e.source_version_id JOIN catalog.snapshots s ON s.id=sv.snapshot_id
   JOIN catalog.activation_members am ON am.exercise_id=e.exercise_id AND am.source_version_id=e.source_version_id
   JOIN catalog.deployment_heads dh ON dh.release_id=am.release_id AND dh.scope='local-practice' AND dh.active
   JOIN catalog.verification_approvals va ON va.assessment_id=am.assessment_id
   JOIN catalog.verification_jobs j ON j.id=va.job_id
   JOIN catalog.verifier_heads vh ON vh.context_id=j.context_id AND vh.scope='local-practice'
   JOIN catalog.verifier_contexts vc ON vc.id=vh.context_id
   WHERE repo.registry_key='openwebwork-opl' AND (vc.payload->>'certified')::boolean IS TRUE
    AND catalog.verification_job_current(j.id)
    AND catalog.is_playable(e.exercise_id,e.source_version_id,'local-practice')
  )x),'[]'::jsonb))
$$;
COMMIT;
