-- All synthetic identities/runs below roll back.
BEGIN;
DO $$ DECLARE repo uuid;snap uuid;run uuid;snap2 uuid;run2 uuid;run3 uuid;old_a uuid;old_copy uuid;old_version uuid;meta jsonb:='{"state":"missing","raw":[],"diagnostics":[],"title":"Synthetic"}';ev uuid;row record;BEGIN
 INSERT INTO catalog.repositories(registry_key,canonical_url) VALUES('synthetic-'||gen_random_uuid(),'https://example.invalid') RETURNING id INTO repo;
 INSERT INTO catalog.snapshots(repository_id,object_format,commit_oid) VALUES(repo,'sha1',repeat('a',40)) RETURNING id INTO snap;
 INSERT INTO catalog.import_runs(snapshot_id,request_key,scope,manifest_digest,scanner_version,state,expected_count,parser_version,inventory_sealed)
 VALUES(snap,'synthetic-'||gen_random_uuid(),'{}',repeat('a',64),'synthetic','running',3,'synthetic-v1',false) RETURNING id INTO run;
 INSERT INTO catalog.import_heads(repository_id) VALUES(repo);INSERT INTO catalog.import_leases VALUES(repo,run);
 INSERT INTO catalog.import_entries(run_id,path,blob_oid,sha256,byte_count,metadata)
 SELECT run,p,repeat('b',40),CASE WHEN p LIKE '%old.pg' THEN repeat('d',64) ELSE repeat('b',64) END,1,meta FROM unnest(ARRAY['OpenProblemLibrary/a.pg','OpenProblemLibrary/copy.pg','OpenProblemLibrary/old.pg']) p;
 PERFORM catalog.seal_import(run);
 IF catalog.reconcile_import_batch(run,1)<>1 OR catalog.reconcile_import_batch(run,100)<>2 OR catalog.reconcile_import_batch(run,100)<>0 THEN RAISE EXCEPTION 'Replay failed';END IF;
 IF (SELECT count(DISTINCT exercise_id) FROM catalog.import_entries WHERE run_id=run)<>3 THEN RAISE EXCEPTION 'Copies merged';END IF;
 SELECT exercise_id,source_version_id INTO old_a,old_version FROM catalog.import_entries WHERE run_id=run AND path='OpenProblemLibrary/a.pg';
 SELECT exercise_id INTO old_copy FROM catalog.import_entries WHERE run_id=run AND path='OpenProblemLibrary/copy.pg';
 FOR row IN SELECT * FROM catalog.import_entries WHERE run_id=run LOOP
  INSERT INTO catalog.identity_events(repository_id,exercise_id,kind,source_path,actor_ref,reason) VALUES(repo,row.exercise_id,'synthetic-observed',row.path,'synthetic','test') RETURNING id INTO ev;
  INSERT INTO catalog.source_locations(repository_id,path,exercise_id,state,last_event_id) VALUES(repo,row.path,row.exercise_id,'present',ev);
 END LOOP;
 UPDATE catalog.import_heads SET run_id=run,generation=1 WHERE repository_id=repo;
 DELETE FROM catalog.import_leases WHERE repository_id=repo;
 INSERT INTO catalog.snapshots(repository_id,object_format,commit_oid) VALUES(repo,'sha1',repeat('b',40)) RETURNING id INTO snap2;
 INSERT INTO catalog.import_runs(snapshot_id,request_key,scope,manifest_digest,scanner_version,state,expected_count,parser_version,inventory_sealed,base_generation)
 VALUES(snap2,'synthetic-'||gen_random_uuid(),'{}',repeat('c',64),'synthetic','running',3,'synthetic-v1',false,1) RETURNING id INTO run2;
 INSERT INTO catalog.import_leases VALUES(repo,run2);
 INSERT INTO catalog.import_entries(run_id,path,blob_oid,sha256,byte_count,metadata)
 SELECT run2,p,repeat('b',40),CASE WHEN p LIKE '%copy.pg' THEN repeat('c',64) WHEN p LIKE '%renamed.pg' THEN repeat('d',64) ELSE repeat('b',64) END,1,meta FROM unnest(ARRAY['OpenProblemLibrary/a.pg','OpenProblemLibrary/copy.pg','OpenProblemLibrary/renamed.pg']) p;
 PERFORM catalog.seal_import(run2);
 PERFORM catalog.reconcile_import_batch(run2,100);
 IF NOT EXISTS(SELECT 1 FROM catalog.import_entries WHERE run_id=run2 AND path='OpenProblemLibrary/a.pg' AND exercise_id=old_a AND source_version_id<>old_version AND change_kind='unchanged') THEN RAISE EXCEPTION 'Unchanged source lost identity/version';END IF;
 IF NOT EXISTS(SELECT 1 FROM catalog.import_entries WHERE run_id=run2 AND path='OpenProblemLibrary/copy.pg' AND exercise_id=old_copy AND change_kind='changed') THEN RAISE EXCEPTION 'Changed source lost identity';END IF;
 IF NOT EXISTS(SELECT 1 FROM catalog.import_entries WHERE run_id=run2 AND path='OpenProblemLibrary/renamed.pg' AND state='identity-review' AND exercise_id IS NULL AND change_kind='rename-review') THEN RAISE EXCEPTION 'Rename was merged automatically';END IF;
 UPDATE catalog.source_locations SET state='absent' WHERE repository_id=repo AND path='OpenProblemLibrary/old.pg';
 DELETE FROM catalog.import_leases WHERE repository_id=repo;
 INSERT INTO catalog.import_runs(snapshot_id,request_key,scope,manifest_digest,scanner_version,state,expected_count,parser_version,inventory_sealed,base_generation)
 VALUES(snap2,'synthetic-'||gen_random_uuid(),'{}',repeat('e',64),'synthetic','running',1,'synthetic-v1',false,1) RETURNING id INTO run3;
 INSERT INTO catalog.import_leases VALUES(repo,run3);
 INSERT INTO catalog.import_entries(run_id,path,blob_oid,sha256,byte_count,metadata) VALUES(run3,'OpenProblemLibrary/old.pg',repeat('b',40),repeat('d',64),1,meta);
 PERFORM catalog.seal_import(run3);
 PERFORM catalog.reconcile_import_batch(run3,100);
 IF NOT EXISTS(SELECT 1 FROM catalog.import_entries WHERE run_id=run3 AND change_kind='reappearance-review' AND exercise_id IS NULL) THEN RAISE EXCEPTION 'Reappearance silently reused identity';END IF;
END $$;
SELECT 'true'::json;
ROLLBACK;
