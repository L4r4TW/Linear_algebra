BEGIN;
SET LOCAL search_path=pg_catalog;
CREATE TABLE catalog.verification_evidence(attempt_id uuid PRIMARY KEY REFERENCES catalog.verification_attempts ON DELETE RESTRICT,job_id uuid NOT NULL REFERENCES catalog.verification_jobs ON DELETE RESTRICT,run_id uuid NOT NULL REFERENCES catalog.verification_runs ON DELETE RESTRICT,bundle_id uuid NOT NULL REFERENCES catalog.evidence_bundles ON DELETE RESTRICT,assessment_id uuid NOT NULL REFERENCES catalog.assessments ON DELETE RESTRICT,environment_id uuid NOT NULL REFERENCES catalog.environments ON DELETE RESTRICT,profile_id uuid NOT NULL REFERENCES catalog.profiles ON DELETE RESTRICT,requirement_set_id uuid NOT NULL REFERENCES catalog.requirement_sets ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE catalog.verification_approvals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid NOT NULL REFERENCES catalog.verification_jobs ON DELETE RESTRICT,attempt_id uuid NOT NULL REFERENCES catalog.verification_evidence(attempt_id) ON DELETE RESTRICT,assessment_id uuid NOT NULL REFERENCES catalog.assessments ON DELETE RESTRICT,actor text NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(job_id,attempt_id));
CREATE TABLE catalog.verifier_health(scope text PRIMARY KEY,context_id uuid NOT NULL REFERENCES catalog.verifier_contexts ON DELETE RESTRICT,matches boolean NOT NULL,observed_at timestamptz NOT NULL DEFAULT now(),code text NOT NULL);
CREATE FUNCTION catalog.verification_job_current(job_key uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM catalog.verification_jobs j JOIN catalog.verifier_heads h ON h.context_id=j.context_id AND h.scope='local-practice' JOIN catalog.import_entries e ON e.source_version_id=j.source_version_id JOIN catalog.import_heads ih ON ih.run_id=e.run_id WHERE j.id=job_key AND j.manifest_id=(SELECT m.id FROM catalog.capability_manifests m WHERE m.source_version_id=j.source_version_id ORDER BY m.created_at DESC,m.id DESC LIMIT 1)) $$;
CREATE FUNCTION catalog.refresh_verification() RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog AS $$ DECLARE affected integer;BEGIN
 WITH changed AS(UPDATE catalog.verification_jobs SET state='stale',lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE state<>'stale' AND NOT catalog.verification_job_current(id) RETURNING id)
 INSERT INTO catalog.verification_events(job_id,kind,actor,reason) SELECT id,'stale','freshness-monitor','SOURCE_REQUIREMENTS_OR_CONTEXT_CHANGED' FROM changed;
 GET DIAGNOSTICS affected=ROW_COUNT;
 UPDATE catalog.verification_attempts a SET state='cancelled',finished_at=now(),result='{"cases":[],"error":"STALE_EXECUTION_CONTEXT"}' FROM catalog.verification_jobs j WHERE a.job_id=j.id AND j.state='stale' AND a.state='running';RETURN affected;
END $$;
CREATE FUNCTION catalog.pipeline_assessment_current(assessment_key uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT NOT EXISTS(SELECT 1 FROM catalog.verification_evidence e JOIN catalog.assessments a ON a.bundle_id=e.bundle_id WHERE a.id=assessment_key)
 OR EXISTS(SELECT 1 FROM catalog.verification_approvals p JOIN catalog.verification_jobs j ON j.id=p.job_id JOIN catalog.verifier_contexts c ON c.id=j.context_id JOIN catalog.verifier_health health ON health.context_id=c.id AND health.scope='local-practice'
 WHERE p.assessment_id=assessment_key AND j.state='passed' AND catalog.verification_job_current(j.id) AND p.attempt_id=(SELECT a.id FROM catalog.verification_attempts a WHERE a.job_id=j.id ORDER BY a.ordinal DESC LIMIT 1) AND catalog.verification_reviews_complete(j.id,p.attempt_id) AND(c.payload->>'certified')::boolean AND health.matches AND health.observed_at>now()-interval '60 seconds') $$;
CREATE FUNCTION catalog.materialize_verification(job_key uuid) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE j catalog.verification_jobs;a catalog.verification_attempts;s catalog.source_versions;c catalog.verifier_contexts;m catalog.capability_manifests;
 v_env uuid;v_profile uuid;v_req uuid;v_worker uuid;v_run uuid;v_bundle uuid;v_assessment uuid;v_cap uuid;v_row jsonb;v_pair record;req_digest text;result_digest text;
BEGIN
 SELECT * INTO j FROM catalog.verification_jobs WHERE id=job_key FOR UPDATE;
 SELECT * INTO a FROM catalog.verification_attempts WHERE job_id=j.id AND state='finished' ORDER BY ordinal DESC LIMIT 1;
 IF NOT FOUND OR jsonb_array_length(a.result->'cases')<>4 THEN RETURN NULL;END IF;
 SELECT assessment_id INTO v_assessment FROM catalog.verification_evidence WHERE attempt_id=a.id;IF FOUND THEN RETURN v_assessment;END IF;
 SELECT * INTO s FROM catalog.source_versions WHERE id=j.source_version_id;SELECT * INTO c FROM catalog.verifier_contexts WHERE id=j.context_id;SELECT * INTO m FROM catalog.capability_manifests WHERE id=j.manifest_id;
 INSERT INTO catalog.environments(snapshot_id,content_digest,renderer_revision,pg_revision,dependency_digest,runtime_digest,source_manifest_digest,certified)
 VALUES(s.snapshot_id,c.digest,c.payload->'attestation'->>'rendererRevision',c.payload->'attestation'->>'pgRevision',c.payload->>'dependencyDigest',c.payload->>'runtimeDigest',c.payload->>'manifest',coalesce((c.payload->>'certified')::boolean,false)) ON CONFLICT(content_digest) DO NOTHING;
 SELECT id INTO v_env FROM catalog.environments WHERE content_digest=c.digest;
 INSERT INTO catalog.profiles(profile_key,content_digest) VALUES('queue-local-v1',c.payload->>'profileDigest') ON CONFLICT DO NOTHING RETURNING id INTO v_profile;
 IF v_profile IS NULL THEN SELECT id INTO v_profile FROM catalog.profiles WHERE profile_key='queue-local-v1' AND content_digest=c.payload->>'profileDigest';
 ELSE
  INSERT INTO catalog.profile_dimensions SELECT v_profile,seed,viewport FROM unnest(ARRAY[1234,4321])seed CROSS JOIN unnest(ARRAY['desktop','mobile'])viewport;
  INSERT INTO catalog.profile_checks SELECT v_profile,k FROM unnest(ARRAY['rendering','interaction','answerCapture','grading','retries','refresh','ownership','keyboard','mobile'])k;
  FOR v_pair IN SELECT * FROM jsonb_each(c.payload->'profile'->'capabilities') LOOP
   INSERT INTO catalog.capability_versions(capability_key,version) VALUES(v_pair.key,'queue-local-v1') ON CONFLICT DO NOTHING;
   SELECT id INTO v_cap FROM catalog.capability_versions WHERE capability_key=v_pair.key AND version='queue-local-v1';
   INSERT INTO catalog.profile_capabilities VALUES(v_profile,v_cap,v_pair.value->>'status');
  END LOOP;UPDATE catalog.profiles SET sealed=true WHERE id=v_profile;
 END IF;
 req_digest:=encode(sha256(convert_to(m.manifest::text||c.digest,'UTF8')),'hex');
 INSERT INTO catalog.requirement_sets(source_version_id,content_digest) VALUES(s.id,req_digest) ON CONFLICT DO NOTHING RETURNING id INTO v_req;
 IF v_req IS NULL THEN SELECT id INTO v_req FROM catalog.requirement_sets WHERE source_version_id=s.id AND content_digest=req_digest;
 ELSE
  FOR v_row IN SELECT * FROM jsonb_array_elements(m.manifest->'candidateCapabilities') LOOP
   INSERT INTO catalog.capability_versions(capability_key,version) VALUES(v_row#>>'{}','queue-local-v1') ON CONFLICT DO NOTHING;
   SELECT id INTO v_cap FROM catalog.capability_versions WHERE capability_key=v_row#>>'{}' AND version='queue-local-v1';INSERT INTO catalog.requirement_capabilities VALUES(v_req,v_cap);
  END LOOP;
 END IF;
 INSERT INTO catalog.verification_workers(worker_key,state) VALUES('queue:'||c.digest,'active') ON CONFLICT DO NOTHING;SELECT id INTO v_worker FROM catalog.verification_workers WHERE worker_key='queue:'||c.digest;
 result_digest:=encode(sha256(convert_to(a.result::text,'UTF8')),'hex');
 INSERT INTO catalog.verification_runs(environment_id,profile_id,worker_id,manifest_digest,target_count,state) VALUES(v_env,v_profile,v_worker,result_digest,1,'queued') RETURNING id INTO v_run;
 INSERT INTO catalog.verification_targets VALUES(v_run,s.id,v_req);UPDATE catalog.verification_runs SET state='running' WHERE id=v_run;
 FOR v_row IN SELECT * FROM jsonb_array_elements(a.result->'cases') LOOP
  INSERT INTO catalog.case_attempts(run_id,source_version_id,requirement_set_id,environment_id,profile_id,seed,viewport,ordinal,state,source_verified,checks,correct_score,cleared_score,limitations,failure_code)
  VALUES(v_run,s.id,v_req,v_env,v_profile,(v_row->>'seed')::integer,v_row->>'viewport',1,CASE WHEN v_row->>'outcome'='passed' THEN 'passed' ELSE 'failed' END,(v_row->>'sourceVerified')::boolean,v_row->'checks',(v_row->>'correctScore')::numeric,(v_row->>'clearedScore')::numeric,v_row->'limitations',v_row->>'error');
 END LOOP;
 UPDATE catalog.verification_runs SET state='completed' WHERE id=v_run;
 INSERT INTO catalog.evidence_bundles(run_id,source_version_id,requirement_set_id,environment_id,profile_id,selection_reason) VALUES(v_run,s.id,v_req,v_env,v_profile,'Complete selected queue attempt; no cross-attempt stitching') RETURNING id INTO v_bundle;
 INSERT INTO catalog.bundle_cases SELECT v_bundle,v_run,source_version_id,requirement_set_id,environment_id,profile_id,seed,viewport,id FROM catalog.case_attempts WHERE run_id=v_run;
 INSERT INTO catalog.assessments(source_version_id,source_snapshot_id,environment_id,profile_id,requirement_set_id,bundle_digest,status,bundle_id) VALUES(s.id,s.snapshot_id,v_env,v_profile,v_req,result_digest,CASE WHEN a.result->>'technicalState'='passed' THEN 'unverified' ELSE 'failed' END,v_bundle) RETURNING id INTO v_assessment;
 INSERT INTO catalog.verification_evidence VALUES(a.id,j.id,v_run,v_bundle,v_assessment,v_env,v_profile,v_req,now());RETURN v_assessment;
END $$;
DO $$ DECLARE name text;BEGIN FOREACH name IN ARRAY ARRAY['verification_evidence','verification_approvals','verifier_health'] LOOP
 EXECUTE format('ALTER TABLE catalog.%I ENABLE ROW LEVEL SECURITY',name);EXECUTE format('ALTER TABLE catalog.%I FORCE ROW LEVEL SECURITY',name);
 EXECUTE format('CREATE POLICY backend_only ON catalog.%I TO service_role,%I USING(true) WITH CHECK(true)',name,current_user);
 EXECUTE format('REVOKE ALL ON catalog.%I FROM PUBLIC,anon,authenticated',name);EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON catalog.%I TO service_role',name);
END LOOP;END $$;
CREATE TRIGGER verification_evidence_immutable BEFORE UPDATE OR DELETE ON catalog.verification_evidence FOR EACH ROW EXECUTE FUNCTION catalog.reject_mutation();
CREATE TRIGGER verification_approval_immutable BEFORE UPDATE OR DELETE ON catalog.verification_approvals FOR EACH ROW EXECUTE FUNCTION catalog.reject_mutation();
REVOKE ALL ON FUNCTION catalog.verification_job_current(uuid),catalog.refresh_verification(),catalog.pipeline_assessment_current(uuid),catalog.materialize_verification(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION catalog.verification_job_current(uuid),catalog.refresh_verification(),catalog.pipeline_assessment_current(uuid),catalog.materialize_verification(uuid) TO service_role;
CREATE OR REPLACE FUNCTION catalog.assessment_is_eligible(assessment_key uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM catalog.assessments a JOIN catalog.evidence_bundles b ON b.id=a.bundle_id JOIN catalog.verification_runs r ON r.id=b.run_id JOIN catalog.verification_workers w ON w.id=r.worker_id JOIN catalog.profiles p ON p.id=a.profile_id JOIN catalog.environments e ON e.id=a.environment_id JOIN catalog.requirement_sets q ON q.id=a.requirement_set_id
 WHERE a.id=assessment_key AND a.status='verified' AND p.sealed AND q.discovery_complete AND e.certified AND e.pg_revision ~ '^[a-f0-9]{40}([a-f0-9]{24})?$' AND e.renderer_revision ~ '^[a-f0-9]{40}([a-f0-9]{24})?$' AND e.dependency_digest IS NOT NULL AND e.runtime_digest IS NOT NULL AND e.source_manifest_digest IS NOT NULL AND w.state='active' AND r.state='completed'
 AND r.target_count=(SELECT count(*) FROM catalog.verification_targets WHERE run_id=r.id)
 AND EXISTS(SELECT 1 FROM catalog.profile_dimensions WHERE profile_id=p.id) AND EXISTS(SELECT 1 FROM catalog.profile_checks WHERE profile_id=p.id)
 AND NOT EXISTS(SELECT 1 FROM catalog.verification_targets t CROSS JOIN catalog.profile_dimensions d WHERE t.run_id=r.id AND d.profile_id=p.id AND NOT EXISTS(SELECT 1 FROM catalog.case_attempts c WHERE c.run_id=r.id AND c.source_version_id=t.source_version_id AND c.seed=d.seed AND c.viewport=d.viewport))
 AND EXISTS(SELECT 1 FROM catalog.requirement_capabilities WHERE requirement_set_id=q.id)
 AND NOT EXISTS(SELECT 1 FROM catalog.requirement_capabilities rc LEFT JOIN catalog.profile_capabilities pc ON pc.profile_id=p.id AND pc.capability_id=rc.capability_id WHERE rc.requirement_set_id=q.id AND pc.status IS DISTINCT FROM 'verified')
 AND (SELECT count(*) FROM catalog.bundle_cases WHERE bundle_id=b.id)=(SELECT count(*) FROM catalog.profile_dimensions WHERE profile_id=p.id)
 AND NOT EXISTS(SELECT 1 FROM catalog.bundle_cases bc JOIN catalog.case_attempts c ON c.id=bc.case_attempt_id WHERE bc.bundle_id=b.id AND(c.state<>'passed' OR NOT c.source_verified OR c.correct_score IS DISTINCT FROM 1::numeric OR c.cleared_score IS DISTINCT FROM 0::numeric OR c.failure_code IS NOT NULL OR jsonb_array_length(c.limitations)>0 OR EXISTS(SELECT 1 FROM catalog.profile_checks ck WHERE ck.profile_id=p.id AND c.checks->ck.check_key IS DISTINCT FROM 'true'::jsonb)))) AND catalog.pipeline_assessment_current(assessment_key) $$;
COMMIT;
