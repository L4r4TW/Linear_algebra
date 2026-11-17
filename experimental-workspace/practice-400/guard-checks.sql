BEGIN;
DO $$ DECLARE n integer;k uuid;old_screen jsonb;BEGIN
 n:=jsonb_array_length(catalog_backend.local_pilot_catalog()->'entries');
 IF n<70 THEN RAISE EXCEPTION 'Expected bulk-tested practice sources';END IF;
 IF has_table_privilege('catalog_player','catalog_backend.collection_grants','SELECT') OR has_table_privilege('anon','catalog_backend.collection_grants','SELECT') THEN RAISE EXCEPTION 'Private grants exposed';END IF;
 SELECT c.source_version_id,c.screening INTO k,old_screen FROM catalog_backend.collection_grants c JOIN catalog_backend.local_pilot_grants p USING(source_version_id) WHERE c.active LIMIT 1;
 IF k IS NULL THEN RAISE EXCEPTION 'Shared pilot fixture missing';END IF;
 UPDATE catalog_backend.collection_grants SET active=false WHERE source_version_id=k;
 IF jsonb_array_length(catalog_backend.local_pilot_catalog()->'entries')<>n-1 THEN RAISE EXCEPTION 'Withdrawal fell back to old pilot authority';END IF;
 UPDATE catalog_backend.collection_grants SET active=true,screening=jsonb_set(screening,'{sourceScreen,sha256}',to_jsonb(repeat('0',64))) WHERE source_version_id=k;
 IF jsonb_array_length(catalog_backend.local_pilot_catalog()->'entries')<>n-1 THEN RAISE EXCEPTION 'Mismatched source screening admitted';END IF;
 UPDATE catalog_backend.collection_grants SET screening=old_screen WHERE source_version_id=k;
 IF jsonb_array_length(catalog_backend.local_pilot_catalog()->'entries')<>n THEN RAISE EXCEPTION 'Exact source restore failed';END IF;
 IF EXISTS(SELECT 1 FROM catalog.verification_reviews) THEN RAISE EXCEPTION 'Unexpected independent reviews';END IF;
END $$;
ROLLBACK;
