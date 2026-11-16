BEGIN;
SET LOCAL search_path=pg_catalog;
CREATE TABLE catalog.verification_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid NOT NULL REFERENCES catalog.verification_jobs ON DELETE RESTRICT,
 attempt_id uuid NOT NULL REFERENCES catalog.verification_attempts ON DELETE RESTRICT,kind text NOT NULL CHECK(kind IN('requirements','mathematical','interaction','deployment')),
 decision text NOT NULL CHECK(decision IN('accepted','rejected')),actor text NOT NULL CHECK(length(trim(actor)) BETWEEN 1 AND 100),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 12 AND 2000),independent boolean NOT NULL CHECK(independent),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX verification_review_latest ON catalog.verification_reviews(job_id,attempt_id,kind,created_at DESC,id DESC);
CREATE TRIGGER verification_review_immutable BEFORE UPDATE OR DELETE ON catalog.verification_reviews FOR EACH ROW EXECUTE FUNCTION catalog.reject_mutation();
ALTER TABLE catalog.verification_reviews ENABLE ROW LEVEL SECURITY;ALTER TABLE catalog.verification_reviews FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY backend_only ON catalog.verification_reviews TO service_role,%I USING(true) WITH CHECK(true)',current_user);END $$;
REVOKE ALL ON catalog.verification_reviews FROM PUBLIC,anon,authenticated;GRANT SELECT,INSERT ON catalog.verification_reviews TO service_role;
CREATE FUNCTION catalog.verification_reviews_complete(job_key uuid,attempt_key uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT NOT EXISTS(SELECT 1 FROM unnest(ARRAY['requirements','mathematical','interaction','deployment'])kind
 WHERE (SELECT r.decision FROM catalog.verification_reviews r WHERE r.job_id=job_key AND r.attempt_id=attempt_key AND r.kind=kind ORDER BY r.created_at DESC,r.id DESC LIMIT 1) IS DISTINCT FROM 'accepted') $$;
CREATE FUNCTION catalog.review_verification(job_key uuid,review_kind text,decision_value text,actor_ref text,review_reason text,independently_checked boolean) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE j catalog.verification_jobs;a catalog.verification_attempts;review_id uuid;BEGIN
 SELECT * INTO j FROM catalog.verification_jobs WHERE id=job_key FOR UPDATE;
 IF NOT FOUND OR j.state IN('queued','running','stale','cancelled') OR NOT EXISTS(SELECT 1 FROM catalog.verifier_heads WHERE scope='local-practice' AND context_id=j.context_id) THEN RAISE EXCEPTION 'Review requires a current finished job' USING ERRCODE='55000';END IF;
 SELECT * INTO a FROM catalog.verification_attempts WHERE job_id=j.id AND state='finished' ORDER BY ordinal DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Finished evidence required' USING ERRCODE='55000';END IF;
 IF decision_value='accepted' AND(j.technical_state<>'passed' OR EXISTS(SELECT 1 FROM catalog.capability_manifests m WHERE m.id=j.manifest_id AND jsonb_array_length(m.manifest->'unsupported')>0)) THEN RAISE EXCEPTION 'Reviews cannot waive failed or unsupported checks' USING ERRCODE='23514';END IF;
 INSERT INTO catalog.verification_reviews(job_id,attempt_id,kind,decision,actor,reason,independent) VALUES(j.id,a.id,review_kind,decision_value,actor_ref,review_reason,independently_checked) RETURNING id INTO review_id;
 UPDATE catalog.verification_jobs SET state=CASE WHEN technical_state='passed' AND catalog.verification_reviews_complete(j.id,a.id) THEN 'passed' ELSE CASE WHEN technical_state='passed' THEN 'needs-review' ELSE state END END,updated_at=now() WHERE id=j.id;
 INSERT INTO catalog.verification_events(job_id,kind,actor,reason,details) VALUES(j.id,'review-'||review_kind,actor_ref,review_reason,jsonb_build_object('decision',decision_value,'attemptId',a.id));
 RETURN review_id;
END $$;
REVOKE ALL ON FUNCTION catalog.verification_reviews_complete(uuid,uuid),catalog.review_verification(uuid,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION catalog.verification_reviews_complete(uuid,uuid),catalog.review_verification(uuid,text,text,text,text,boolean) TO service_role;
COMMIT;
