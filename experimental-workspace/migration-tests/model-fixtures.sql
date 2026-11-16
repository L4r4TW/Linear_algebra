-- Synthetic DB fixtures only; no actual users, credentials, answers or renderer execution.
INSERT INTO auth.users(id,email) VALUES('11111111-1111-4111-8111-111111111111','synthetic-a@example.invalid'),('22222222-2222-4222-8222-222222222222','synthetic-b@example.invalid') ON CONFLICT(id) DO NOTHING;
INSERT INTO practice_private.principals(id,kind,account_id,state) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','account','11111111-1111-4111-8111-111111111111','active'),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','account','22222222-2222-4222-8222-222222222222','active'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','anonymous',NULL,'active');
CREATE TABLE migration_test.refs(key text PRIMARY KEY,id uuid NOT NULL);
DO $$ DECLARE source uuid;snap uuid;exercise uuid;env uuid;profile uuid;cap uuid;req uuid;worker uuid;run uuid;bundle uuid;assessment uuid;release uuid;case_id uuid;d record;BEGIN
 SELECT s.id,s.snapshot_id,s.exercise_id INTO source,snap,exercise FROM catalog.source_versions s JOIN catalog.aliases a ON a.exercise_id=s.exercise_id WHERE a.namespace='experimental-opl' AND a.external_id='dot-product-01';
 INSERT INTO catalog.environments(snapshot_id,content_digest,renderer_revision,pg_revision,dependency_digest,runtime_digest,source_manifest_digest,certified) VALUES(snap,repeat('1',64),repeat('a',40),repeat('b',40),repeat('2',64),repeat('3',64),repeat('4',64),true) RETURNING id INTO env;
 INSERT INTO catalog.profiles(profile_key,content_digest) VALUES('synthetic-migration-profile',repeat('5',64)) RETURNING id INTO profile;
 INSERT INTO catalog.profile_dimensions SELECT profile,seed,viewport FROM unnest(ARRAY[1234,4321]) seed CROSS JOIN unnest(ARRAY['desktop','mobile']) viewport;
 INSERT INTO catalog.profile_checks SELECT profile,c FROM unnest(ARRAY['rendering','interaction','answerCapture','grading','retries','refresh','ownership','keyboard','mobile']) c;
 INSERT INTO catalog.capability_versions(capability_key,version) VALUES('synthetic-native','test-v1') RETURNING id INTO cap;
 INSERT INTO catalog.profile_capabilities VALUES(profile,cap,'verified');UPDATE catalog.profiles SET sealed=true WHERE id=profile;
 INSERT INTO catalog.requirement_sets(source_version_id,content_digest) VALUES(source,repeat('6',64)) RETURNING id INTO req;
 INSERT INTO catalog.requirement_capabilities VALUES(req,cap);UPDATE catalog.requirement_sets SET discovery_complete=true WHERE id=req;
 INSERT INTO catalog.verification_workers(worker_key,state) VALUES('synthetic-test-worker','active') RETURNING id INTO worker;
 INSERT INTO catalog.verification_runs(environment_id,profile_id,worker_id,manifest_digest,target_count,state) VALUES(env,profile,worker,repeat('7',64),1,'queued') RETURNING id INTO run;
 INSERT INTO catalog.verification_targets VALUES(run,source,req);UPDATE catalog.verification_runs SET state='running' WHERE id=run;
 FOR d IN SELECT seed,viewport FROM catalog.profile_dimensions WHERE profile_id=profile LOOP
  INSERT INTO catalog.case_attempts(run_id,source_version_id,requirement_set_id,environment_id,profile_id,seed,viewport,ordinal,state,source_verified,checks,correct_score,cleared_score) VALUES(run,source,req,env,profile,d.seed,d.viewport,1,'passed',true,'{"rendering":true,"interaction":true,"answerCapture":true,"grading":true,"retries":true,"refresh":true,"ownership":true,"keyboard":true,"mobile":true}',1,0);
 END LOOP;
 UPDATE catalog.verification_runs SET state='completed' WHERE id=run;
 INSERT INTO catalog.evidence_bundles(run_id,source_version_id,requirement_set_id,environment_id,profile_id,selection_reason) VALUES(run,source,req,env,profile,'Synthetic SQL validation only') RETURNING id INTO bundle;
 INSERT INTO catalog.bundle_cases SELECT bundle,run,source,req,env,profile,seed,viewport,id FROM catalog.case_attempts WHERE run_id IN(SELECT id FROM catalog.verification_runs WHERE worker_id=worker);
 INSERT INTO catalog.assessments(source_version_id,source_snapshot_id,environment_id,profile_id,requirement_set_id,bundle_digest,status,bundle_id) VALUES(source,snap,env,profile,req,repeat('8',64),'verified',bundle) RETURNING id INTO assessment;
 INSERT INTO catalog.activation_releases(scope,environment_id,profile_id,state) VALUES('local-practice',env,profile,'draft') RETURNING id INTO release;
 INSERT INTO catalog.activation_members(release_id,exercise_id,source_version_id,source_snapshot_id,environment_id,profile_id,requirement_set_id,assessment_id) VALUES(release,exercise,source,snap,env,profile,req,assessment);
 INSERT INTO migration_test.refs VALUES('source',source),('snapshot',snap),('exercise',exercise),('environment',env),('profile',profile),('requirement',req),('worker',worker),('run',run),('bundle',bundle),('assessment',assessment),('release',release);
 INSERT INTO practice_private.sessions(id,owner_id,exercise_id,binding,source_version_id,environment_id,snapshot_id) VALUES
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',exercise,'pinned',source,env,snap),('cccccccc-cccc-4ccc-8ccc-ccccccccccc2','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',exercise,'pinned',source,env,snap),('cccccccc-cccc-4ccc-8ccc-ccccccccccc3','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',exercise,'pinned',source,env,snap),('cccccccc-cccc-4ccc-8ccc-ccccccccccc4','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',exercise,'legacy-unbound',NULL,NULL,NULL);
 INSERT INTO practice_private.renderer_state(session_id,seed,generation) VALUES('cccccccc-cccc-4ccc-8ccc-ccccccccccc1',7,0),('cccccccc-cccc-4ccc-8ccc-ccccccccccc2',7,0),('cccccccc-cccc-4ccc-8ccc-ccccccccccc3',7,0);
END $$;
CREATE FUNCTION migration_test.ref(key_name text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM migration_test.refs WHERE key=key_name $$;
