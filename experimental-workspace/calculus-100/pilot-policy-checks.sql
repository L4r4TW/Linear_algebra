BEGIN;
DO $$ DECLARE n integer;s uuid;j uuid;BEGIN
 n:=jsonb_array_length(catalog_backend.local_pilot_catalog()->'entries');
 IF n<>10 THEN RAISE EXCEPTION 'Expected ten live pilot grants';END IF;
 IF EXISTS(SELECT 1 FROM catalog.verification_reviews) THEN RAISE EXCEPTION 'Pilot must not fabricate independent reviews';END IF;
 IF has_table_privilege('catalog_player','catalog_backend.local_pilot_grants','SELECT') OR has_function_privilege('anon','catalog_backend.local_pilot_catalog()','EXECUTE') THEN RAISE EXCEPTION 'Pilot authority exposed';END IF;
 SELECT source_version_id,job_id INTO s,j FROM catalog_backend.local_pilot_grants LIMIT 1;
 UPDATE catalog_backend.local_pilot_grants SET active=false WHERE source_version_id=s;
 IF jsonb_array_length(catalog_backend.local_pilot_catalog()->'entries')<>9 THEN RAISE EXCEPTION 'Withdrawal failed';END IF;
 UPDATE catalog_backend.local_pilot_grants SET active=true WHERE source_version_id=s;
 UPDATE catalog.verification_jobs SET technical_state='failed' WHERE id=j;
 IF jsonb_array_length(catalog_backend.local_pilot_catalog()->'entries')<>9 THEN RAISE EXCEPTION 'Failed evidence admitted';END IF;
 UPDATE catalog.verification_jobs SET technical_state='passed' WHERE id=j;
 UPDATE catalog.verifier_health SET matches=false WHERE scope='local-practice';
 IF jsonb_array_length(catalog_backend.local_pilot_catalog()->'entries')<>0 THEN RAISE EXCEPTION 'Unhealthy context admitted';END IF;
END $$;
ROLLBACK;
