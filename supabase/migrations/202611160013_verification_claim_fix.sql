BEGIN;
CREATE OR REPLACE FUNCTION catalog.claim_verification(worker_ref text,lease_seconds integer DEFAULT 900,concurrency_limit integer DEFAULT 2) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE j catalog.verification_jobs;a uuid;BEGIN
 IF worker_ref !~ '^[A-Za-z0-9_-]{1,80}$' OR lease_seconds NOT BETWEEN 2 AND 1800 OR concurrency_limit NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'Invalid worker limits' USING ERRCODE='23514';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('verification-claim',0));
 FOR j IN SELECT * FROM catalog.verification_jobs WHERE state='running' AND lease_until<now() FOR UPDATE SKIP LOCKED LOOP
  UPDATE catalog.verification_attempts SET state='expired',finished_at=now(),result='{"error":"WORKER_LEASE_EXPIRED","cases":[]}' WHERE job_id=j.id AND lease_token=j.lease_token AND state='running';
  UPDATE catalog.verification_jobs SET state=CASE WHEN attempt_count<max_attempts THEN 'queued' ELSE 'error' END,technical_state='error',lease_token=NULL,lease_owner=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;
  INSERT INTO catalog.verification_events(job_id,kind,actor,reason) VALUES(j.id,'lease-expired','queue','WORKER_LEASE_EXPIRED');
 END LOOP;
 UPDATE catalog.verification_jobs pending_job SET state='stale',updated_at=now() WHERE state='queued' AND(
  NOT EXISTS(SELECT 1 FROM catalog.verifier_heads WHERE scope='local-practice' AND context_id=pending_job.context_id)
  OR NOT EXISTS(SELECT 1 FROM catalog.import_entries e JOIN catalog.import_heads h ON h.run_id=e.run_id WHERE e.source_version_id=pending_job.source_version_id));
 IF (SELECT count(*) FROM catalog.verification_jobs WHERE state='running' AND lease_until>now())>=concurrency_limit THEN RETURN NULL;END IF;
 SELECT * INTO j FROM catalog.verification_jobs WHERE state='queued' AND attempt_count<max_attempts ORDER BY priority DESC,created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE catalog.verification_jobs SET state='running',attempt_count=attempt_count+1,lease_token=gen_random_uuid(),lease_owner=worker_ref,lease_until=now()+make_interval(secs=>lease_seconds),updated_at=now() WHERE id=j.id RETURNING * INTO j;
 INSERT INTO catalog.verification_attempts(job_id,ordinal,lease_token,worker,state) VALUES(j.id,j.attempt_count,j.lease_token,worker_ref,'running') RETURNING id INTO a;
 RETURN jsonb_build_object('jobId',j.id,'attemptId',a,'token',j.lease_token,'sourceVersionId',j.source_version_id,'manifestId',j.manifest_id,'contextId',j.context_id);
END $$;
REVOKE ALL ON FUNCTION catalog.claim_verification(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION catalog.claim_verification(text,integer,integer) TO service_role;
COMMIT;
