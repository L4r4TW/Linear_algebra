\set ON_ERROR_STOP on
SET search_path=model_lab,pg_catalog;
SET application_name='model_lab_cas_a';
BEGIN;
SELECT id FROM sessions WHERE id=gid(1) FOR UPDATE;
WITH changed AS(UPDATE drafts d SET revision=d.revision+1 FROM sessions s WHERE d.id=gid(1) AND d.session_id=s.id AND d.owner_id=s.owner_id AND d.revision=0 AND s.last_attempt_id IS NOT DISTINCT FROM d.base_attempt_id RETURNING 1)
INSERT INTO check_results SELECT 'Concurrent draft worker A changes exactly one row',count(*)=1 FROM changed;
\! touch /tmp/model_cas_a_ready
DO $$ DECLARE deadline timestamptz:=clock_timestamp()+interval '20 seconds'; BEGIN WHILE pg_stat_file('/tmp/model_cas_release',true) IS NULL LOOP IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'CAS release phase timed out'; END IF; PERFORM pg_sleep(0.05); END LOOP; END $$;
COMMIT;
\! touch /tmp/model_cas_a_done
