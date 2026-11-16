\set ON_ERROR_STOP on
SET search_path=model_lab,pg_catalog;
SET application_name='model_lab_cas_b';
BEGIN;
SELECT id FROM sessions WHERE id=gid(1) FOR UPDATE;
WITH changed AS(UPDATE drafts d SET revision=d.revision+1 FROM sessions s WHERE d.id=gid(1) AND d.session_id=s.id AND d.owner_id=s.owner_id AND d.revision=0 AND s.last_attempt_id IS NOT DISTINCT FROM d.base_attempt_id RETURNING 1)
INSERT INTO check_results SELECT 'Concurrent stale draft worker B changes zero rows',count(*)=0 FROM changed;
COMMIT;
\! touch /tmp/model_cas_b_done
