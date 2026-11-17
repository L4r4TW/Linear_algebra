-- Keep anonymous discovery under its existing timeout during bounded verification.
-- Project tiny scalar rows before grouping; preserve reader RLS and strict readiness checks.
BEGIN;
SET LOCAL search_path=pg_catalog;
CREATE OR REPLACE FUNCTION catalog_api.opl_counts() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog SET jit=off AS $$
 WITH current AS(SELECT h.run_id,h.generation FROM catalog.import_heads h JOIN catalog.repositories p ON p.id=h.repository_id WHERE p.registry_key='openwebwork-opl'),
 rows AS MATERIALIZED(
  SELECT split_part(e.path,'/',1) area,e.state='identity-review' needs_review,e.metadata->>'state'<>'matched' unclassified
  FROM catalog.import_entries e JOIN current c ON c.run_id=e.run_id),
 totals AS MATERIALIZED(SELECT area,count(*) n,count(*) FILTER(WHERE needs_review) identity_review,count(*) FILTER(WHERE unclassified) unclassified FROM rows GROUP BY 1)
 SELECT jsonb_build_object('runId',(SELECT run_id FROM current),'generation',(SELECT generation FROM current),
 'indexed',coalesce((SELECT sum(n) FROM totals),0),'identityReview',coalesce((SELECT sum(identity_review) FROM totals),0),
 'unclassified',coalesce((SELECT sum(unclassified) FROM totals),0),'practiceReady',catalog.opl_ready_count((SELECT run_id FROM current)),
 'areas',(SELECT jsonb_object_agg(area,n) FROM totals));
$$;
ALTER FUNCTION catalog_api.opl_topics(text,text) SET jit=off;
ALTER FUNCTION catalog_api.search_opl(text,text,text,text,text,integer,text,uuid,uuid) SET jit=off;
COMMIT;
