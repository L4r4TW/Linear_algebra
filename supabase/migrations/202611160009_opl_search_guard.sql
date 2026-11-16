-- Generated search fields are derived after BEFORE triggers; exclude them from the immutable input comparison.
BEGIN;
SET LOCAL search_path=pg_catalog;
CREATE OR REPLACE FUNCTION catalog.guard_import_entries() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r catalog.import_runs;BEGIN
 SELECT * INTO r FROM catalog.import_runs WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.run_id ELSE NEW.run_id END FOR UPDATE;
 IF r.state<>'running' THEN RAISE EXCEPTION 'Completed import observations immutable' USING ERRCODE='55000';END IF;
 IF TG_OP='UPDATE' AND(to_jsonb(NEW)-ARRAY['state','change_kind','exercise_id','source_version_id','review','title_sort','search_document'])
 IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','change_kind','exercise_id','source_version_id','review','title_sort','search_document']) THEN RAISE EXCEPTION 'Inventory identity immutable' USING ERRCODE='55000';END IF;
 IF r.inventory_sealed AND TG_OP IN('INSERT','DELETE') THEN RAISE EXCEPTION 'Sealed inventory immutable' USING ERRCODE='55000';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
REVOKE ALL ON FUNCTION catalog.guard_import_entries() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION catalog.guard_import_entries() TO service_role;
COMMIT;
