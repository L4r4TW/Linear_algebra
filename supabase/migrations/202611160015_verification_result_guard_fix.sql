BEGIN;
CREATE OR REPLACE FUNCTION catalog.valid_verification_result(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
DECLARE c jsonb;v jsonb;field_key text;seen text[]:=ARRAY[]::text[];dimension text;BEGIN
 IF jsonb_typeof(value)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(value)k WHERE k NOT IN('cases','technicalState','error','elapsedMs'))
 OR coalesce(value->>'technicalState','') NOT IN('passed','failed','error','unsupported','needs-review') OR jsonb_typeof(value->'cases') IS DISTINCT FROM 'array' OR jsonb_array_length(value->'cases')>4 THEN RETURN false;END IF;
 IF value->>'error' IS NOT NULL AND value->>'error' !~ '^[A-Z0-9_-]{1,100}$' THEN RETURN false;END IF;
 FOR c IN SELECT * FROM jsonb_array_elements(value->'cases') LOOP
  IF jsonb_typeof(c)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(c)k WHERE k NOT IN('seed','viewport','sourceVerified','outcome','checks','correctScore','clearedScore','limitations','error')) THEN RETURN false;END IF;
  IF coalesce(c->>'seed','') NOT IN('1234','4321') OR coalesce(c->>'viewport','') NOT IN('desktop','mobile') OR jsonb_typeof(c->'sourceVerified') IS DISTINCT FROM 'boolean' OR coalesce(c->>'outcome','') NOT IN('passed','failed','error','blocked') THEN RETURN false;END IF;
  dimension:=(c->>'seed')||':'||(c->>'viewport');IF dimension=ANY(seen) THEN RETURN false;END IF;seen:=array_append(seen,dimension);
  IF jsonb_typeof(c->'checks') IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(c->'checks')k WHERE k NOT IN('rendering','interaction','answerCapture','grading','retries','refresh','ownership','keyboard','mobile')) THEN RETURN false;END IF;
  FOREACH field_key IN ARRAY ARRAY['rendering','interaction','answerCapture','grading','retries','refresh','ownership','keyboard','mobile'] LOOP IF jsonb_typeof(c->'checks'->field_key) IS DISTINCT FROM 'boolean' THEN RETURN false;END IF;END LOOP;
  FOREACH field_key IN ARRAY ARRAY['correctScore','clearedScore'] LOOP
   IF jsonb_typeof(c->field_key) IS DISTINCT FROM 'null' THEN IF jsonb_typeof(c->field_key) IS DISTINCT FROM 'number' OR (c->>field_key)::numeric NOT BETWEEN 0 AND 1 THEN RETURN false;END IF;END IF;
  END LOOP;
  IF jsonb_typeof(c->'limitations') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'limitations')>20 THEN RETURN false;END IF;
  FOR v IN SELECT * FROM jsonb_array_elements(c->'limitations') LOOP IF jsonb_typeof(v)<>'string' OR v#>>'{}' !~ '^[A-Z0-9_-]{1,80}$' THEN RETURN false;END IF;END LOOP;
  IF c->>'error' IS NOT NULL AND c->>'error' !~ '^[A-Z0-9_-]{1,100}$' THEN RETURN false;END IF;
  IF value->>'technicalState'='passed' AND(c->>'outcome'<>'passed' OR jsonb_array_length(c->'limitations')>0) THEN RETURN false;END IF;
 END LOOP;
 RETURN true;
END $$;
COMMIT;
