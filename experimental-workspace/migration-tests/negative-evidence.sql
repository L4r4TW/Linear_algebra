-- Fail-closed policy tests: synthetic SQL evidence never certifies real PG behavior.
DO $$ DECLARE mode text;r uuid;b uuid;a uuid;c record;BEGIN
 FOREACH mode IN ARRAY ARRAY['missing-dimension','string-true','failed-ownership','source-unverified','observed-limitation'] LOOP
  INSERT INTO catalog.verification_runs(environment_id,profile_id,worker_id,manifest_digest,target_count,state) SELECT environment_id,profile_id,worker_id,manifest_digest,1,'queued' FROM catalog.verification_runs WHERE id=migration_test.ref('run') RETURNING id INTO r;
  INSERT INTO catalog.verification_targets SELECT r,source_version_id,requirement_set_id FROM catalog.verification_targets WHERE run_id=migration_test.ref('run');
  UPDATE catalog.verification_runs SET state='running' WHERE id=r;
  FOR c IN SELECT * FROM catalog.case_attempts WHERE run_id=migration_test.ref('run') LOOP
   INSERT INTO catalog.case_attempts(run_id,source_version_id,requirement_set_id,environment_id,profile_id,seed,viewport,ordinal,state,source_verified,checks,correct_score,cleared_score,limitations)
   VALUES(r,c.source_version_id,c.requirement_set_id,c.environment_id,c.profile_id,c.seed,c.viewport,1,c.state,mode<>'source-unverified',CASE mode WHEN 'string-true' THEN jsonb_set(c.checks,'{grading}','"true"') WHEN 'failed-ownership' THEN jsonb_set(c.checks,'{ownership}','false') ELSE c.checks END,1,0,CASE WHEN mode='observed-limitation' THEN '["synthetic-limitation"]'::jsonb ELSE '[]'::jsonb END);
  END LOOP;
  UPDATE catalog.verification_runs SET state='completed' WHERE id=r;
  INSERT INTO catalog.evidence_bundles(run_id,source_version_id,requirement_set_id,environment_id,profile_id,selection_reason) SELECT r,source_version_id,requirement_set_id,environment_id,profile_id,'Synthetic negative proof' FROM catalog.evidence_bundles WHERE id=migration_test.ref('bundle') RETURNING id INTO b;
  INSERT INTO catalog.bundle_cases SELECT b,r,source_version_id,requirement_set_id,environment_id,profile_id,seed,viewport,id FROM catalog.case_attempts WHERE run_id=r AND(mode<>'missing-dimension' OR seed<>4321 OR viewport<>'mobile');
  INSERT INTO catalog.assessments(source_version_id,source_snapshot_id,environment_id,profile_id,requirement_set_id,bundle_digest,status,bundle_id) SELECT source_version_id,source_snapshot_id,environment_id,profile_id,requirement_set_id,bundle_digest,'verified',b FROM catalog.assessments WHERE id=migration_test.ref('assessment') RETURNING id INTO a;
  PERFORM migration_test.ok('Eligibility rejects '||mode,NOT catalog.assessment_is_eligible(a));
 END LOOP;
END $$;
SELECT migration_test.reject('Published metadata cannot reopen as draft',$q$UPDATE catalog.metadata_releases SET state='draft' WHERE release_key='legacy-display-v1'$q$,'55000');
SELECT migration_test.ok('Canonical feedback rejects missing keys and out-of-range scores',NOT practice_private.valid_feedback('{}') AND NOT practice_private.valid_field_feedback('[{"name":"a","status":"correct","message":"","score":2}]'));