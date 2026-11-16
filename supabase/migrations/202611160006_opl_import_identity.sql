-- Repeatable OPL import staging and identity reconciliation; no runtime activation.
BEGIN;
SET LOCAL search_path=pg_catalog;
ALTER TABLE catalog.import_runs ADD COLUMN expected_count integer CHECK(expected_count>=0),
 ADD COLUMN base_generation bigint NOT NULL DEFAULT 0,
 ADD COLUMN inventory_sealed boolean NOT NULL DEFAULT false,
 ADD COLUMN parser_version text,
 ADD COLUMN report jsonb,
 ADD COLUMN completed_at timestamptz;
CREATE TABLE catalog.import_heads(repository_id uuid PRIMARY KEY REFERENCES catalog.repositories ON DELETE RESTRICT,
 run_id uuid REFERENCES catalog.import_runs ON DELETE RESTRICT,generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0));
CREATE TABLE catalog.import_leases(repository_id uuid PRIMARY KEY REFERENCES catalog.repositories ON DELETE RESTRICT,
 run_id uuid NOT NULL UNIQUE REFERENCES catalog.import_runs ON DELETE RESTRICT);
CREATE TABLE catalog.import_entries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),run_id uuid NOT NULL REFERENCES catalog.import_runs ON DELETE RESTRICT,
 path text COLLATE "C" NOT NULL,blob_oid text NOT NULL CHECK(blob_oid ~ '^[a-f0-9]{40}$'),
 sha256 catalog.digest256 NOT NULL,byte_count integer NOT NULL CHECK(byte_count>=0),metadata jsonb NOT NULL CHECK(jsonb_typeof(metadata)='object'),
 state text NOT NULL DEFAULT 'staged' CHECK(state IN('staged','imported','identity-review')),
 change_kind text CHECK(change_kind IN('new','changed','unchanged','rename-review','reappearance-review')),
 exercise_id uuid REFERENCES catalog.exercises ON DELETE RESTRICT,source_version_id uuid REFERENCES catalog.source_versions ON DELETE RESTRICT,
 review jsonb NOT NULL DEFAULT '[]'::jsonb,UNIQUE(run_id,path),
 CHECK(path ~ '^(OpenProblemLibrary|Contrib|Pending)/.+' AND path ~* '[.]pg$' AND path !~ '(^|/)[.]{1,2}(/|$)|//|[[:cntrl:]]' AND position(chr(92) in path)=0),
 CHECK((state='imported')=(exercise_id IS NOT NULL AND source_version_id IS NOT NULL)));
CREATE INDEX import_entry_pending ON catalog.import_entries(run_id,state,path);
CREATE INDEX import_entry_hash ON catalog.import_entries(run_id,sha256);
CREATE INDEX source_version_hash_lookup ON catalog.source_versions(sha256,snapshot_id);
CREATE FUNCTION catalog.reconcile_import_batch(run_key uuid,batch_size integer DEFAULT 500) RETURNS integer
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r catalog.import_runs;repo uuid;head catalog.import_heads;entry catalog.import_entries;
 location catalog.source_locations;source catalog.source_versions;exercise uuid;source_id uuid;kind text;proposals jsonb;n integer:=0;raw record;
BEGIN
 SELECT * INTO r FROM catalog.import_runs WHERE id=run_key FOR UPDATE;
 IF NOT FOUND OR r.state<>'running' OR NOT r.inventory_sealed THEN RAISE EXCEPTION 'Sealed running inventory required' USING ERRCODE='55000';END IF;
 SELECT repository_id INTO repo FROM catalog.snapshots WHERE id=r.snapshot_id;
 SELECT * INTO head FROM catalog.import_heads WHERE repository_id=repo FOR UPDATE;
 IF head.generation IS DISTINCT FROM r.base_generation OR NOT EXISTS(SELECT 1 FROM catalog.import_leases WHERE repository_id=repo AND run_id=r.id) THEN RAISE EXCEPTION 'Import generation/lease conflict' USING ERRCODE='40001';END IF;
 FOR entry IN SELECT * FROM catalog.import_entries WHERE run_id=r.id AND state='staged' ORDER BY path LIMIT least(greatest(batch_size,1),2000) FOR UPDATE LOOP
  exercise:=NULL;source_id:=NULL;kind:=NULL;proposals:='[]';
  SELECT * INTO location FROM catalog.source_locations WHERE repository_id=repo AND path=entry.path;
  IF FOUND AND location.state<>'present' THEN
   kind:='reappearance-review';proposals:=jsonb_build_array(jsonb_build_object('path',entry.path,'exerciseId',location.exercise_id));
  ELSE
   SELECT * INTO source FROM catalog.source_versions WHERE snapshot_id=r.snapshot_id AND path=entry.path;
   IF FOUND THEN
    IF source.sha256<>entry.sha256 OR(location.exercise_id IS NOT NULL AND location.exercise_id<>source.exercise_id) THEN RAISE EXCEPTION 'Immutable source identity conflict' USING ERRCODE='23514';END IF;
    exercise:=source.exercise_id;source_id:=source.id;
   ELSIF location.exercise_id IS NOT NULL THEN exercise:=location.exercise_id;
   ELSE
    -- Only vanished baseline paths propose a rename. Simultaneous copies remain independent.
    IF head.run_id IS NOT NULL THEN
     SELECT coalesce(jsonb_agg(jsonb_build_object('path',old.path,'exerciseId',old.exercise_id)),'[]') INTO proposals
     FROM catalog.import_entries old WHERE old.run_id=head.run_id AND old.state='imported' AND old.sha256=entry.sha256
      AND NOT EXISTS(SELECT 1 FROM catalog.import_entries seen WHERE seen.run_id=r.id AND seen.path=old.path);
    ELSE
     SELECT coalesce(jsonb_agg(jsonb_build_object('path',old.path,'exerciseId',old.exercise_id)),'[]') INTO proposals
     FROM catalog.source_versions old JOIN catalog.snapshots snap ON snap.id=old.snapshot_id
     WHERE snap.repository_id=repo AND old.sha256=entry.sha256
      AND NOT EXISTS(SELECT 1 FROM catalog.import_entries seen WHERE seen.run_id=r.id AND seen.path=old.path);
    END IF;
    IF jsonb_array_length(proposals)>0 THEN kind:='rename-review';
    ELSE INSERT INTO catalog.exercises(provider) VALUES('opl') RETURNING id INTO exercise;END IF;
   END IF;
   IF exercise IS NOT NULL THEN
    IF head.run_id IS NOT NULL THEN
     SELECT * INTO source FROM catalog.source_versions WHERE id=(SELECT source_version_id FROM catalog.import_entries WHERE run_id=head.run_id AND path=entry.path);
     kind:=CASE WHEN NOT FOUND THEN 'new' WHEN source.sha256=entry.sha256 THEN 'unchanged' ELSE 'changed' END;
    ELSE kind:=CASE WHEN source_id IS NOT NULL THEN 'unchanged' ELSE 'new' END;END IF;
    IF source_id IS NULL THEN
     INSERT INTO catalog.source_versions(exercise_id,snapshot_id,path,sha256) VALUES(exercise,r.snapshot_id,entry.path,entry.sha256) RETURNING id INTO source_id;
    END IF;
    INSERT INTO catalog.raw_classifications(source_version_id,parser_version,field,ordinal,source_line,raw_text,parsed_value)
     SELECT source_id,r.parser_version,value->>'field',row_number() OVER(PARTITION BY value->>'field' ORDER BY ord)::integer,
      (value->>'line')::integer,value->>'raw',value->>'value'
     FROM jsonb_array_elements(entry.metadata->'raw') WITH ORDINALITY x(value,ord)
     WHERE value->>'field' IN('DBsubject','DBchapter','DBsection') ON CONFLICT DO NOTHING;
    INSERT INTO catalog.classification_assessments(source_version_id,parser_version,state,details)
     SELECT source_id,r.parser_version,entry.metadata->>'state',jsonb_build_object('normalized',entry.metadata->'normalized','diagnostics',entry.metadata->'diagnostics')
     WHERE NOT EXISTS(SELECT 1 FROM catalog.classification_assessments WHERE source_version_id=source_id AND parser_version=r.parser_version);
   END IF;
  END IF;
  UPDATE catalog.import_entries SET state=CASE WHEN exercise IS NULL THEN 'identity-review' ELSE 'imported' END,
   exercise_id=exercise,source_version_id=source_id,change_kind=kind,review=proposals WHERE id=entry.id;
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;
-- Every new base table remains backend-only under forced RLS.
DO $$ DECLARE name text;BEGIN FOREACH name IN ARRAY ARRAY['import_heads','import_leases','import_entries'] LOOP
 EXECUTE format('ALTER TABLE catalog.%I ENABLE ROW LEVEL SECURITY',name);
 EXECUTE format('ALTER TABLE catalog.%I FORCE ROW LEVEL SECURITY',name);
 EXECUTE format('CREATE POLICY backend_only ON catalog.%I TO service_role,%I USING(true) WITH CHECK(true)',name,current_user);
END LOOP;END $$;
REVOKE ALL ON catalog.import_heads,catalog.import_leases,catalog.import_entries FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON catalog.import_heads,catalog.import_leases,catalog.import_entries TO service_role;
REVOKE ALL ON FUNCTION catalog.reconcile_import_batch(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION catalog.reconcile_import_batch(uuid,integer) TO service_role;
COMMIT;
