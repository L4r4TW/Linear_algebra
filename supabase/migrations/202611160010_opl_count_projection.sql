-- Counts must select only the NOLOGIN reader's granted metadata columns.
BEGIN;
SET LOCAL search_path=pg_catalog;
CREATE OR REPLACE FUNCTION catalog_api.opl_counts() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH current AS(SELECT h.run_id,h.generation FROM catalog.import_heads h JOIN catalog.repositories p ON p.id=h.repository_id WHERE p.registry_key='openwebwork-opl'),
 entries AS(SELECT e.path,e.state,e.metadata FROM catalog.import_entries e JOIN current c ON c.run_id=e.run_id)
 SELECT jsonb_build_object('runId',(SELECT run_id FROM current),'generation',(SELECT generation FROM current),'indexed',(SELECT count(*) FROM entries),
 'identityReview',(SELECT count(*) FROM entries WHERE state='identity-review'),'unclassified',(SELECT count(*) FROM entries WHERE metadata->>'state'<>'matched'),
 'practiceReady',catalog.opl_ready_count((SELECT run_id FROM current)),
 'areas',(SELECT jsonb_object_agg(area,n) FROM(SELECT split_part(path,'/',1) area,count(*) n FROM entries GROUP BY 1)x));
$$;
REVOKE ALL ON FUNCTION catalog_api.opl_counts() FROM PUBLIC;
COMMIT;
