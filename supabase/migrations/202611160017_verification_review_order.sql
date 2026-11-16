BEGIN;
SET LOCAL search_path=pg_catalog;
ALTER TABLE catalog.verification_reviews ADD COLUMN review_order bigint GENERATED ALWAYS AS IDENTITY;
GRANT USAGE,SELECT ON SEQUENCE catalog.verification_reviews_review_order_seq TO service_role;
CREATE OR REPLACE FUNCTION catalog.verification_reviews_complete(job_key uuid,attempt_key uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT NOT EXISTS(SELECT 1 FROM unnest(ARRAY['requirements','mathematical','interaction','deployment']) required(kind_name)
 WHERE (SELECT r.decision FROM catalog.verification_reviews r WHERE r.job_id=job_key AND r.attempt_id=attempt_key AND r.kind=required.kind_name ORDER BY r.review_order DESC LIMIT 1) IS DISTINCT FROM 'accepted') $$;
COMMIT;
