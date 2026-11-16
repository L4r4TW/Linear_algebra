-- Durable import orchestration. Only a complete sealed run may move the observed source head.
BEGIN;
SET LOCAL search_path=pg_catalog;
CREATE FUNCTION catalog.open_import(registry text,repository_url text,revision text,tree_oid text,manifest text,scanner text,parser text,target_count integer) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE repo uuid;snap uuid;h catalog.import_heads;r catalog.import_runs;request text;
BEGIN
 IF revision !~ '^[a-f0-9]{40}$' OR tree_oid !~ '^[a-f0-9]{40}$' OR manifest !~ '^[a-f0-9]{64}$' OR target_count<0 OR length(parser)=0 THEN RAISE EXCEPTION 'Invalid pinned inventory' USING ERRCODE='23514';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('opl-import:'||registry,0));
 INSERT INTO catalog.repositories(registry_key,canonical_url) VALUES(registry,repository_url) ON CONFLICT(registry_key) DO NOTHING;
 SELECT id INTO repo FROM catalog.repositories WHERE registry_key=registry AND canonical_url=repository_url;
 IF repo IS NULL THEN RAISE EXCEPTION 'Repository URL conflict' USING ERRCODE='23514';END IF;
 INSERT INTO catalog.snapshots(repository_id,object_format,commit_oid,tree_oid) VALUES(repo,'sha1',revision,tree_oid) ON CONFLICT(repository_id,object_format,commit_oid) DO NOTHING;
 SELECT id INTO snap FROM catalog.snapshots WHERE repository_id=repo AND object_format='sha1' AND commit_oid=revision AND(catalog.snapshots.tree_oid IS NULL OR catalog.snapshots.tree_oid=open_import.tree_oid);
 IF snap IS NULL THEN RAISE EXCEPTION 'Snapshot tree conflict' USING ERRCODE='23514';END IF;
 INSERT INTO catalog.import_heads(repository_id) VALUES(repo) ON CONFLICT DO NOTHING;
 SELECT * INTO h FROM catalog.import_heads WHERE repository_id=repo FOR UPDATE;
 request:='opl:'||encode(sha256(convert_to(jsonb_build_array(repo,revision,tree_oid,manifest,scanner,parser)::text,'UTF8')),'hex');
 SELECT * INTO r FROM catalog.import_runs WHERE request_key=request FOR UPDATE;
 IF FOUND THEN
  IF r.expected_count IS DISTINCT FROM target_count THEN RAISE EXCEPTION 'Inventory count conflict' USING ERRCODE='23514';END IF;
  IF r.state='completed' THEN RETURN r.id;END IF;
  IF r.state<>'running' OR r.base_generation<>h.generation THEN RAISE EXCEPTION 'Import cannot resume at changed head' USING ERRCODE='40001';END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM catalog.import_leases WHERE repository_id=repo) THEN RAISE EXCEPTION 'Another import must finish or be recovered first' USING ERRCODE='55P03';END IF;
  INSERT INTO catalog.import_runs(snapshot_id,request_key,scope,manifest_digest,scanner_version,parser_version,state,expected_count,base_generation)
   VALUES(snap,request,jsonb_build_object('roots',jsonb_build_array('OpenProblemLibrary','Contrib','Pending'),'treeOid',tree_oid),manifest,scanner,parser,'running',target_count,h.generation) RETURNING * INTO r;
 END IF;
 INSERT INTO catalog.import_leases(repository_id,run_id) VALUES(repo,r.id) ON CONFLICT DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM catalog.import_leases WHERE repository_id=repo AND run_id=r.id) THEN RAISE EXCEPTION 'Import lease conflict' USING ERRCODE='55P03';END IF;
 RETURN r.id;
END $$;
CREATE FUNCTION catalog.stage_import_entries(run_key uuid,payload jsonb) RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r catalog.import_runs;item jsonb;prior catalog.import_entries;n integer:=0;BEGIN
 SELECT * INTO r FROM catalog.import_runs WHERE id=run_key FOR UPDATE;
 IF NOT FOUND OR r.state<>'running' OR r.inventory_sealed THEN RAISE EXCEPTION 'Writable inventory required' USING ERRCODE='55000';END IF;
 IF jsonb_typeof(payload)<>'array' OR jsonb_array_length(payload)>2000 THEN RAISE EXCEPTION 'Bounded batch required' USING ERRCODE='23514';END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(payload) LOOP
  SELECT * INTO prior FROM catalog.import_entries WHERE run_id=r.id AND path=item->>'path';
  IF FOUND THEN
   IF prior.sha256 IS DISTINCT FROM item->>'sha256' OR prior.blob_oid IS DISTINCT FROM item->>'oid' OR prior.metadata IS DISTINCT FROM item->'metadata' OR prior.byte_count IS DISTINCT FROM (item->>'bytes')::integer THEN RAISE EXCEPTION 'Staged observation mismatch' USING ERRCODE='23514';END IF;
  ELSE
   INSERT INTO catalog.import_entries(run_id,path,blob_oid,sha256,byte_count,metadata) VALUES(r.id,item->>'path',item->>'oid',item->>'sha256',(item->>'bytes')::integer,item->'metadata');n:=n+1;
   INSERT INTO catalog.import_targets(run_id,path,observed_hash,diagnostic_code) VALUES(r.id,item->>'path',item->>'sha256',CASE WHEN item->'metadata'->>'state'<>'matched' THEN 'CLASSIFICATION_'||upper(item->'metadata'->>'state') END);
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM catalog.import_entries WHERE run_id=r.id)>r.expected_count THEN RAISE EXCEPTION 'Too many inventory targets' USING ERRCODE='23514';END IF;
 RETURN n;
END $$;
CREATE FUNCTION catalog.seal_import(run_key uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r catalog.import_runs;BEGIN
 SELECT * INTO r FROM catalog.import_runs WHERE id=run_key FOR UPDATE;
 IF NOT FOUND OR r.state<>'running' OR (SELECT count(*) FROM catalog.import_entries WHERE run_id=r.id) IS DISTINCT FROM r.expected_count THEN RAISE EXCEPTION 'Incomplete inventory cannot be sealed' USING ERRCODE='23514';END IF;
 UPDATE catalog.import_runs SET inventory_sealed=true,coverage_complete=true WHERE id=r.id;
END $$;
CREATE FUNCTION catalog.complete_import(run_key uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r catalog.import_runs;repo uuid;h catalog.import_heads;removed integer;result jsonb;
BEGIN
 SELECT * INTO r FROM catalog.import_runs WHERE id=run_key FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing import' USING ERRCODE='55000';END IF;
 IF r.state='completed' THEN RETURN r.report;END IF;
 SELECT repository_id INTO repo FROM catalog.snapshots WHERE id=r.snapshot_id;
 SELECT * INTO h FROM catalog.import_heads WHERE repository_id=repo FOR UPDATE;
 IF r.state<>'running' OR NOT r.inventory_sealed OR NOT r.coverage_complete OR r.base_generation IS DISTINCT FROM h.generation OR NOT EXISTS(SELECT 1 FROM catalog.import_leases WHERE repository_id=repo AND run_id=r.id)
  OR (SELECT count(*) FROM catalog.import_entries WHERE run_id=r.id) IS DISTINCT FROM r.expected_count OR EXISTS(SELECT 1 FROM catalog.import_entries WHERE run_id=r.id AND state='staged') THEN RAISE EXCEPTION 'Incomplete/stale import cannot publish or remove sources' USING ERRCODE='55000';END IF;
 IF EXISTS(SELECT 1 FROM catalog.import_entries e JOIN catalog.source_versions s ON s.id=e.source_version_id WHERE e.run_id=r.id AND(s.snapshot_id<>r.snapshot_id OR s.exercise_id<>e.exercise_id OR s.path<>e.path OR s.sha256<>e.sha256)) THEN RAISE EXCEPTION 'Entry source context conflict' USING ERRCODE='23514';END IF;
 WITH ev AS(
  INSERT INTO catalog.identity_events(repository_id,exercise_id,kind,source_path,actor_ref,reason)
  SELECT repo,l.exercise_id,'source-absent',l.path,'opl-importer',r.id::text FROM catalog.source_locations l
   WHERE l.repository_id=repo AND l.state='present' AND split_part(l.path,'/',1) IN('OpenProblemLibrary','Contrib','Pending')
    AND NOT EXISTS(SELECT 1 FROM catalog.import_entries e WHERE e.run_id=r.id AND e.path=l.path)
  RETURNING id,source_path
 ) UPDATE catalog.source_locations l SET state='absent',generation=l.generation+1,last_event_id=ev.id FROM ev WHERE l.repository_id=repo AND l.path=ev.source_path;
 GET DIAGNOSTICS removed=ROW_COUNT;
 IF EXISTS(SELECT 1 FROM catalog.import_entries e JOIN catalog.source_locations l ON l.repository_id=repo AND l.path=e.path WHERE e.run_id=r.id AND e.state='imported' AND l.exercise_id<>e.exercise_id) THEN RAISE EXCEPTION 'Location rebind denied' USING ERRCODE='23514';END IF;
 WITH ev AS(
  INSERT INTO catalog.identity_events(repository_id,exercise_id,kind,source_path,actor_ref,reason)
  SELECT repo,exercise_id,'source-'||change_kind,path,'opl-importer',r.id::text FROM catalog.import_entries WHERE run_id=r.id AND state='imported'
  RETURNING id,exercise_id,source_path
 ) INSERT INTO catalog.source_locations(repository_id,path,exercise_id,state,last_event_id)
 SELECT repo,source_path,exercise_id,'present',id FROM ev
 ON CONFLICT(repository_id,path) DO UPDATE SET state='present',generation=catalog.source_locations.generation+1,last_event_id=excluded.last_event_id;
 result:=jsonb_build_object('runId',r.id,'snapshotId',r.snapshot_id,'manifestDigest',r.manifest_digest,'parser',r.parser_version,
  'total',r.expected_count,'imported',(SELECT count(*) FROM catalog.import_entries WHERE run_id=r.id AND state='imported'),
  'identityReview',(SELECT count(*) FROM catalog.import_entries WHERE run_id=r.id AND state='identity-review'),
  'changes',(SELECT jsonb_object_agg(kind,n) FROM(SELECT change_kind kind,count(*) n FROM catalog.import_entries WHERE run_id=r.id GROUP BY change_kind)x),
  'removed',removed,'classifications',(SELECT jsonb_object_agg(kind,n) FROM(SELECT metadata->>'state' kind,count(*) n FROM catalog.import_entries WHERE run_id=r.id GROUP BY metadata->>'state')x),
  'activationCreated',false,'generation',h.generation+1);
 UPDATE catalog.import_heads SET run_id=r.id,generation=generation+1 WHERE repository_id=repo;
 UPDATE catalog.import_runs SET state='completed',report=result,completed_at=now() WHERE id=r.id;
 DELETE FROM catalog.import_leases WHERE repository_id=repo AND run_id=r.id;
 RETURN result;
END $$;
CREATE FUNCTION catalog.guard_import_entries() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r catalog.import_runs;BEGIN
 SELECT * INTO r FROM catalog.import_runs WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.run_id ELSE NEW.run_id END FOR UPDATE;
 IF r.state<>'running' THEN RAISE EXCEPTION 'Completed import observations immutable' USING ERRCODE='55000';END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['state','change_kind','exercise_id','source_version_id','review']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','change_kind','exercise_id','source_version_id','review']) THEN RAISE EXCEPTION 'Inventory identity immutable' USING ERRCODE='55000';END IF;
 IF r.inventory_sealed AND TG_OP IN('INSERT','DELETE') THEN RAISE EXCEPTION 'Sealed inventory immutable' USING ERRCODE='55000';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
CREATE TRIGGER import_entry_guard BEFORE INSERT OR UPDATE OR DELETE ON catalog.import_entries FOR EACH ROW EXECUTE FUNCTION catalog.guard_import_entries();
CREATE FUNCTION catalog.guard_completed_import() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF OLD.state='completed' THEN RAISE EXCEPTION 'Completed import immutable' USING ERRCODE='55000';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END $$;
CREATE TRIGGER import_history_guard BEFORE UPDATE OR DELETE ON catalog.import_runs FOR EACH ROW EXECUTE FUNCTION catalog.guard_completed_import();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA catalog FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA catalog TO service_role;
GRANT EXECUTE ON FUNCTION catalog.is_playable(uuid,uuid,text) TO practice_api_reader;
COMMIT;
