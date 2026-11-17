-- Avoid materializing every wide source metadata row multiple times during discovery counts.
-- Eligibility remains delegated to the existing strict helper.
BEGIN;
SET LOCAL search_path=pg_catalog;
CREATE OR REPLACE FUNCTION catalog_api.opl_counts() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH current AS(SELECT h.run_id,h.generation FROM catalog.import_heads h JOIN catalog.repositories p ON p.id=h.repository_id WHERE p.registry_key='openwebwork-opl'),
 totals AS MATERIALIZED(
  SELECT split_part(e.path,'/',1) area,count(*) n,
   count(*) FILTER(WHERE e.state='identity-review') identity_review,
   count(*) FILTER(WHERE e.metadata->>'state'<>'matched') unclassified
  FROM catalog.import_entries e JOIN current c ON c.run_id=e.run_id GROUP BY 1)
 SELECT jsonb_build_object('runId',(SELECT run_id FROM current),'generation',(SELECT generation FROM current),
 'indexed',coalesce((SELECT sum(n) FROM totals),0),'identityReview',coalesce((SELECT sum(identity_review) FROM totals),0),
 'unclassified',coalesce((SELECT sum(unclassified) FROM totals),0),'practiceReady',catalog.opl_ready_count((SELECT run_id FROM current)),
 'areas',(SELECT jsonb_object_agg(area,n) FROM totals));
$$;
-- CREATE OR REPLACE preserves the existing reader owner and grants.
COMMIT;
