-- Explicit user-authorized LOCAL pilot; no independent review or normal publication is fabricated.
BEGIN;
CREATE TABLE IF NOT EXISTS catalog_backend.local_pilot_grants(
 source_version_id uuid PRIMARY KEY REFERENCES catalog.source_versions(id) ON DELETE RESTRICT,
 job_id uuid NOT NULL REFERENCES catalog.verification_jobs(id) ON DELETE RESTRICT,
 attempt_id uuid NOT NULL REFERENCES catalog.verification_attempts(id) ON DELETE RESTRICT,
 oracle_digest text NOT NULL CHECK(oracle_digest ~ '^[a-f0-9]{64}$'),
 policy_reason text NOT NULL CHECK(length(policy_reason) BETWEEN 30 AND 2000),
 active boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE catalog_backend.local_pilot_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_backend.local_pilot_grants FORCE ROW LEVEL SECURITY;
REVOKE ALL ON catalog_backend.local_pilot_grants FROM PUBLIC,anon,authenticated,catalog_player,service_role;
CREATE OR REPLACE FUNCTION catalog_backend.local_pilot_catalog() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('entries',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) FROM(
 SELECT e.exercise_id id,e.source_version_id,s.commit_oid revision,e.path,e.sha256,e.metadata-'raw' metadata,j.context_id,
 'tested-local-pilot'::text review_status
 FROM catalog_backend.local_pilot_grants g
 JOIN catalog.verification_jobs j ON j.id=g.job_id AND j.source_version_id=g.source_version_id
 JOIN catalog.verification_attempts a ON a.id=g.attempt_id AND a.job_id=j.id
 JOIN catalog.capability_manifests m ON m.id=j.manifest_id
 JOIN catalog.import_entries e ON e.source_version_id=g.source_version_id
 JOIN catalog.import_heads ih ON ih.run_id=e.run_id
 JOIN catalog.repositories repo ON repo.id=ih.repository_id
 JOIN catalog.source_versions sv ON sv.id=e.source_version_id
 JOIN catalog.snapshots s ON s.id=sv.snapshot_id
 JOIN catalog.verifier_heads vh ON vh.context_id=j.context_id AND vh.scope='local-practice'
 JOIN catalog.verifier_contexts vc ON vc.id=vh.context_id
 JOIN catalog.verifier_health health ON health.context_id=vc.id AND health.scope='local-practice'
 WHERE g.active AND repo.registry_key='openwebwork-opl'
 AND j.technical_state='passed' AND j.state NOT IN('running','queued','failed','error','unsupported','stale','cancelled')
 AND catalog.verification_job_current(j.id)
 AND (vc.payload->>'certified')::boolean IS TRUE AND (vc.payload->'attestation'->>'pgTrackedClean')::boolean IS TRUE
 AND health.matches AND health.observed_at>now()-interval '60 seconds'
 AND a.state='finished' AND a.id=(SELECT last.id FROM catalog.verification_attempts last WHERE last.job_id=j.id ORDER BY last.ordinal DESC LIMIT 1)
 AND a.result->>'technicalState'='passed' AND jsonb_array_length(a.result->'cases')=4
 AND jsonb_array_length(m.manifest->'unsupported')=0
 AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY[1234,4321])seed CROSS JOIN unnest(ARRAY['desktop','mobile'])viewport
 WHERE (SELECT count(*) FROM jsonb_array_elements(a.result->'cases')c
 WHERE (c->>'seed')::integer=seed AND c->>'viewport'=viewport AND c->>'outcome'='passed'
 AND c->'sourceVerified'='true'::jsonb AND c->'correctScore'='1'::jsonb AND c->'clearedScore'='0'::jsonb
 AND c->'limitations'='[]'::jsonb
 AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['rendering','interaction','answerCapture','grading','retries','refresh','ownership','keyboard','mobile'])k WHERE c->'checks'->k IS DISTINCT FROM 'true'::jsonb))<>1)
 AND NOT EXISTS(SELECT 1 FROM catalog.verification_reviews r WHERE r.job_id=j.id AND r.attempt_id=a.id AND r.decision='rejected')
 )x
$$;
REVOKE ALL ON FUNCTION catalog_backend.local_pilot_catalog() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION catalog_backend.local_pilot_catalog() TO catalog_player;
COMMENT ON FUNCTION catalog_backend.local_pilot_catalog() IS 'Explicit user-authorized tested local pilot, NOT independently reviewed publication. Backend opt-in required. Exact latest complete passing evidence and live health; revocable grants retain records.';
COMMIT;
