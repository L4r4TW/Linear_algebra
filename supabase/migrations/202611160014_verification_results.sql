BEGIN;
SET LOCAL search_path=pg_catalog;
CREATE FUNCTION catalog.valid_verification_result(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
DECLARE c jsonb;v jsonb;k text;seen text[]:=ARRAY[]::text[];dimension text;BEGIN
 IF jsonb_typeof(value)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(value)k WHERE k NOT IN('cases','technicalState','error','elapsedMs'))
 OR value->>'technicalState' NOT IN('passed','failed','error','unsupported','needs-review') OR jsonb_typeof(value->'cases') IS DISTINCT FROM 'array' OR jsonb_array_length(value->'cases')>4 THEN RETURN false;END IF;
 IF value->>'error' IS NOT NULL AND value->>'error' !~ '^[A-Z0-9_-]{1,100}$' THEN RETURN false;END IF;
 FOR c IN SELECT * FROM jsonb_array_elements(value->'cases') LOOP
  IF jsonb_typeof(c)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(c)k WHERE k NOT IN('seed','viewport','sourceVerified','outcome','checks','correctScore','clearedScore','limitations','error')) THEN RETURN false;END IF;
  IF c->>'seed' NOT IN('1234','4321') OR c->>'viewport' NOT IN('desktop','mobile') OR jsonb_typeof(c->'sourceVerified') IS DISTINCT FROM 'boolean' OR c->>'outcome' NOT IN('passed','failed','error','blocked') THEN RETURN false;END IF;
  dimension:=(c->>'seed')||':'||(c->>'viewport');IF dimension=ANY(seen) THEN RETURN false;END IF;seen:=array_append(seen,dimension);
  IF jsonb_typeof(c->'checks') IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(c->'checks')k WHERE k NOT IN('rendering','interaction','answerCapture','grading','retries','refresh','ownership','keyboard','mobile')) THEN RETURN false;END IF;
  FOREACH k IN ARRAY ARRAY['rendering','interaction','answerCapture','grading','retries','refresh','ownership','keyboard','mobile'] LOOP IF jsonb_typeof(c->'checks'->k) IS DISTINCT FROM 'boolean' THEN RETURN false;END IF;END LOOP;
  FOREACH k IN ARRAY ARRAY['correctScore','clearedScore'] LOOP
   IF jsonb_typeof(c->k) IS DISTINCT FROM 'null' THEN IF jsonb_typeof(c->k) IS DISTINCT FROM 'number' OR (c->>k)::numeric NOT BETWEEN 0 AND 1 THEN RETURN false;END IF;END IF;
  END LOOP;
  IF jsonb_typeof(c->'limitations') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'limitations')>20 THEN RETURN false;END IF;
  FOR v IN SELECT * FROM jsonb_array_elements(c->'limitations') LOOP IF jsonb_typeof(v)<>'string' OR v#>>'{}' !~ '^[A-Z0-9_-]{1,80}$' THEN RETURN false;END IF;END LOOP;
  IF c->>'error' IS NOT NULL AND c->>'error' !~ '^[A-Z0-9_-]{1,100}$' THEN RETURN false;END IF;
  IF value->>'technicalState'='passed' AND(c->>'outcome'<>'passed' OR jsonb_array_length(c->'limitations')>0) THEN RETURN false;END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION catalog.valid_verification_result(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION catalog.valid_verification_result(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION catalog.finish_verification(job_key uuid,token_key uuid,result_payload jsonb) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE j catalog.verification_jobs;technical text;BEGIN
 IF catalog.valid_verification_result(result_payload) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Invalid sanitized case payload' USING ERRCODE='23514';END IF;
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
COMMIT;
