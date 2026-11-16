BEGIN;
SET LOCAL search_path=pg_catalog;
CREATE TABLE catalog.verifier_contexts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),snapshot_id uuid NOT NULL REFERENCES catalog.snapshots ON DELETE RESTRICT,
 digest catalog.digest256 NOT NULL UNIQUE,payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER verifier_context_immutable BEFORE UPDATE OR DELETE ON catalog.verifier_contexts FOR EACH ROW EXECUTE FUNCTION catalog.reject_mutation();
CREATE TABLE catalog.verifier_heads(scope text PRIMARY KEY,context_id uuid NOT NULL REFERENCES catalog.verifier_contexts ON DELETE RESTRICT,generation bigint NOT NULL DEFAULT 1 CHECK(generation>0));
CREATE TABLE catalog.verification_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_version_id uuid NOT NULL REFERENCES catalog.source_versions ON DELETE RESTRICT,
 manifest_id uuid NOT NULL REFERENCES catalog.capability_manifests ON DELETE RESTRICT,context_id uuid NOT NULL REFERENCES catalog.verifier_contexts ON DELETE RESTRICT,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','running','passed','failed','error','unsupported','needs-review','cancelled','stale')),
 technical_state text CHECK(technical_state IN('passed','failed','error','unsupported','needs-review')),priority integer NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 100),
 attempt_count integer NOT NULL DEFAULT 0,max_attempts integer NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 10),lease_token uuid,lease_owner text,lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(source_version_id,manifest_id,context_id));
CREATE INDEX verification_jobs_claim ON catalog.verification_jobs(state,priority DESC,created_at,id);
CREATE TABLE catalog.verification_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid NOT NULL REFERENCES catalog.verification_jobs ON DELETE RESTRICT,
 ordinal integer NOT NULL CHECK(ordinal>0),lease_token uuid NOT NULL,worker text NOT NULL,state text NOT NULL CHECK(state IN('running','finished','expired','cancelled')),
 result jsonb,started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,UNIQUE(job_id,ordinal));
CREATE TABLE catalog.verification_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid REFERENCES catalog.verification_jobs ON DELETE RESTRICT,
 kind text NOT NULL,actor text NOT NULL,reason text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER verification_events_immutable BEFORE UPDATE OR DELETE ON catalog.verification_events FOR EACH ROW EXECUTE FUNCTION catalog.reject_mutation();
CREATE FUNCTION catalog.enqueue_verification(sources uuid[],context_key uuid,actor_ref text,reason text) RETURNS SETOF uuid LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE source uuid;manifest uuid;job uuid;BEGIN
 IF cardinality(sources) NOT BETWEEN 1 AND 100 OR nullif(trim(actor_ref),'') IS NULL OR nullif(trim(reason),'') IS NULL THEN RAISE EXCEPTION 'Bounded explicit enqueue required' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM catalog.verifier_heads WHERE scope='local-practice' AND context_id=context_key) THEN RAISE EXCEPTION 'Current verification context required' USING ERRCODE='55000';END IF;
 FOREACH source IN ARRAY sources LOOP
  IF NOT EXISTS(SELECT 1 FROM catalog.import_entries e JOIN catalog.import_heads h ON h.run_id=e.run_id JOIN catalog.source_versions s ON s.id=e.source_version_id JOIN catalog.verifier_contexts c ON c.id=context_key AND c.snapshot_id=s.snapshot_id WHERE e.source_version_id=source) THEN RAISE EXCEPTION 'Current source/context required' USING ERRCODE='55000';END IF;
  SELECT id INTO manifest FROM catalog.capability_manifests WHERE source_version_id=source ORDER BY created_at DESC,id DESC LIMIT 1;
  IF manifest IS NULL THEN RAISE EXCEPTION 'Detect capabilities first' USING ERRCODE='55000';END IF;
  INSERT INTO catalog.verification_jobs(source_version_id,manifest_id,context_id) VALUES(source,manifest,context_key) ON CONFLICT DO NOTHING;
  SELECT id INTO job FROM catalog.verification_jobs WHERE source_version_id=source AND manifest_id=manifest AND context_id=context_key;
  INSERT INTO catalog.verification_events(job_id,kind,actor,reason) VALUES(job,'enqueued',actor_ref,reason);
  RETURN NEXT job;
 END LOOP;
END $$;
CREATE FUNCTION catalog.claim_verification(worker_ref text,lease_seconds integer DEFAULT 900,concurrency_limit integer DEFAULT 2) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE j catalog.verification_jobs;a uuid;BEGIN
 IF worker_ref !~ '^[A-Za-z0-9_-]{1,80}$' OR lease_seconds NOT BETWEEN 2 AND 1800 OR concurrency_limit NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'Invalid worker limits' USING ERRCODE='23514';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('verification-claim',0));
 FOR j IN SELECT * FROM catalog.verification_jobs WHERE state='running' AND lease_until<now() FOR UPDATE SKIP LOCKED LOOP
  UPDATE catalog.verification_attempts SET state='expired',finished_at=now(),result='{"error":"WORKER_LEASE_EXPIRED","cases":[]}' WHERE job_id=j.id AND lease_token=j.lease_token AND state='running';
  UPDATE catalog.verification_jobs SET state=CASE WHEN attempt_count<max_attempts THEN 'queued' ELSE 'error' END,technical_state='error',lease_token=NULL,lease_owner=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;
  INSERT INTO catalog.verification_events(job_id,kind,actor,reason) VALUES(j.id,'lease-expired','queue','WORKER_LEASE_EXPIRED');
 END LOOP;
 UPDATE catalog.verification_jobs j SET state='stale',updated_at=now() WHERE state='queued' AND(
  NOT EXISTS(SELECT 1 FROM catalog.verifier_heads WHERE scope='local-practice' AND context_id=j.context_id)
  OR NOT EXISTS(SELECT 1 FROM catalog.import_entries e JOIN catalog.import_heads h ON h.run_id=e.run_id WHERE e.source_version_id=j.source_version_id));
 IF (SELECT count(*) FROM catalog.verification_jobs WHERE state='running' AND lease_until>now())>=concurrency_limit THEN RETURN NULL;END IF;
 SELECT * INTO j FROM catalog.verification_jobs WHERE state='queued' AND attempt_count<max_attempts ORDER BY priority DESC,created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE catalog.verification_jobs SET state='running',attempt_count=attempt_count+1,lease_token=gen_random_uuid(),lease_owner=worker_ref,lease_until=now()+make_interval(secs=>lease_seconds),updated_at=now() WHERE id=j.id RETURNING * INTO j;
 INSERT INTO catalog.verification_attempts(job_id,ordinal,lease_token,worker,state) VALUES(j.id,j.attempt_count,j.lease_token,worker_ref,'running') RETURNING id INTO a;
 RETURN jsonb_build_object('jobId',j.id,'attemptId',a,'token',j.lease_token,'sourceVersionId',j.source_version_id,'manifestId',j.manifest_id,'contextId',j.context_id);
END $$;
CREATE FUNCTION catalog.heartbeat_verification(job_key uuid,token_key uuid,lease_seconds integer DEFAULT 900) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN IF lease_seconds NOT BETWEEN 2 AND 1800 THEN RAISE EXCEPTION 'Invalid lease' USING ERRCODE='23514';END IF;
 UPDATE catalog.verification_jobs SET lease_until=now()+make_interval(secs=>lease_seconds) WHERE id=job_key AND state='running' AND lease_token=token_key AND lease_until>now();RETURN FOUND;END $$;
CREATE FUNCTION catalog.finish_verification(job_key uuid,token_key uuid,result_payload jsonb) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE j catalog.verification_jobs;technical text;BEGIN
 SELECT * INTO j FROM catalog.verification_jobs WHERE id=job_key FOR UPDATE;
 IF NOT FOUND OR j.state<>'running' OR j.lease_token IS DISTINCT FROM token_key OR j.lease_until<=now() THEN RETURN false;END IF;
 IF jsonb_typeof(result_payload)<>'object' OR octet_length(result_payload::text)>200000 OR EXISTS(SELECT 1 FROM jsonb_object_keys(result_payload)k WHERE k NOT IN('cases','technicalState','error','elapsedMs')) OR jsonb_typeof(result_payload->'cases')<>'array' THEN RAISE EXCEPTION 'Sanitized result required' USING ERRCODE='23514';END IF;
 technical:=result_payload->>'technicalState';
 IF technical NOT IN('passed','failed','error','unsupported','needs-review') THEN RAISE EXCEPTION 'Result state required' USING ERRCODE='23514';END IF;
 IF technical='passed' AND(jsonb_array_length(result_payload->'cases')<>4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(result_payload->'cases')c WHERE c->'sourceVerified' IS DISTINCT FROM 'true'::jsonb OR (c->>'correctScore')::numeric IS DISTINCT FROM 1::numeric OR (c->>'clearedScore')::numeric IS DISTINCT FROM 0::numeric OR EXISTS(SELECT 1 FROM unnest(ARRAY['rendering','interaction','answerCapture','grading','retries','refresh','ownership','keyboard','mobile'])k WHERE c->'checks'->k IS DISTINCT FROM 'true'::jsonb))) THEN RAISE EXCEPTION 'Complete technical checks required' USING ERRCODE='23514';END IF;
 UPDATE catalog.verification_attempts SET state='finished',result=result_payload,finished_at=now() WHERE job_id=j.id AND lease_token=token_key AND state='running';
 UPDATE catalog.verification_jobs SET state=CASE WHEN technical='passed' THEN 'needs-review' ELSE technical END,technical_state=technical,lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;
 INSERT INTO catalog.verification_events(job_id,kind,actor,reason) VALUES(j.id,'result-recorded','worker',technical);RETURN true;
END $$;
CREATE FUNCTION catalog.control_verification(job_key uuid,action text,actor_ref text,reason text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE j catalog.verification_jobs;BEGIN
 IF action NOT IN('retry','cancel') OR nullif(trim(actor_ref),'') IS NULL OR nullif(trim(reason),'') IS NULL THEN RAISE EXCEPTION 'Explicit action/reason required' USING ERRCODE='23514';END IF;
 SELECT * INTO j FROM catalog.verification_jobs WHERE id=job_key FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Job missing' USING ERRCODE='55000';END IF;
 IF action='retry' THEN
  IF j.state IN('queued','running') OR j.attempt_count>=j.max_attempts OR NOT EXISTS(SELECT 1 FROM catalog.verifier_heads WHERE scope='local-practice' AND context_id=j.context_id) THEN RAISE EXCEPTION 'Retry not eligible; use current context' USING ERRCODE='55000';END IF;
  UPDATE catalog.verification_jobs SET state='queued',updated_at=now() WHERE id=j.id;
 ELSE
  UPDATE catalog.verification_attempts SET state='cancelled',finished_at=now(),result='{"cases":[],"error":"OPERATOR_CANCELLED"}' WHERE job_id=j.id AND state='running';
  UPDATE catalog.verification_jobs SET state='cancelled',lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;
 END IF;
 INSERT INTO catalog.verification_events(job_id,kind,actor,reason) VALUES(j.id,action,actor_ref,reason);
END $$;
CREATE FUNCTION catalog.guard_verification_attempt() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.state<>'running' THEN RAISE EXCEPTION 'Retained attempt immutable' USING ERRCODE='55000';END IF;RETURN NEW;END $$;
CREATE TRIGGER verification_attempt_immutable BEFORE UPDATE OR DELETE ON catalog.verification_attempts FOR EACH ROW EXECUTE FUNCTION catalog.guard_verification_attempt();
DO $$ DECLARE name text;BEGIN FOREACH name IN ARRAY ARRAY['verifier_contexts','verifier_heads','verification_jobs','verification_attempts','verification_events'] LOOP
 EXECUTE format('ALTER TABLE catalog.%I ENABLE ROW LEVEL SECURITY',name);EXECUTE format('ALTER TABLE catalog.%I FORCE ROW LEVEL SECURITY',name);
 EXECUTE format('CREATE POLICY backend_only ON catalog.%I TO service_role,%I USING(true) WITH CHECK(true)',name,current_user);
 EXECUTE format('REVOKE ALL ON catalog.%I FROM PUBLIC,anon,authenticated',name);EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON catalog.%I TO service_role',name);
END LOOP;END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA catalog FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA catalog TO service_role;
GRANT EXECUTE ON FUNCTION catalog.is_playable(uuid,uuid,text),catalog.opl_ready_count(uuid) TO practice_api_reader;
COMMIT;
