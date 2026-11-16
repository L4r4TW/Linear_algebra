-- Safe discovery over the latest complete OPL observation, independent of practice activation.
BEGIN;
SET LOCAL search_path=pg_catalog;
CREATE INDEX classification_assessment_source_parser ON catalog.classification_assessments(source_version_id,parser_version);
ALTER TABLE catalog.import_entries ADD COLUMN title_sort text COLLATE "C" GENERATED ALWAYS AS(lower(coalesce(metadata->>'title',''))) STORED,
 ADD COLUMN search_document tsvector GENERATED ALWAYS AS(
 setweight(to_tsvector('simple'::regconfig,coalesce(metadata->>'title','')),'A')||
 setweight(to_tsvector('simple'::regconfig,coalesce((metadata->'normalized')::text,'')||' '||coalesce((metadata->'sourceLabels')::text,'')),'B')||
 setweight(to_tsvector('simple'::regconfig,coalesce(metadata->>'description','')),'C')) STORED;
CREATE INDEX import_entry_browse ON catalog.import_entries(run_id,title_sort,id);
CREATE INDEX import_entry_search ON catalog.import_entries USING gin(search_document);
CREATE INDEX import_entry_topic ON catalog.import_entries(run_id,(metadata->'normalized'->>0),(metadata->'normalized'->>1),(metadata->'normalized'->>2));
CREATE FUNCTION catalog_api.search_opl(query_text text DEFAULT '',subject_filter text DEFAULT NULL,chapter_filter text DEFAULT NULL,section_filter text DEFAULT NULL,area_filter text DEFAULT NULL,
 page_size integer DEFAULT 20,after_title text DEFAULT '',after_id uuid DEFAULT '00000000-0000-0000-0000-000000000000',expected_run uuid DEFAULT NULL)
 RETURNS TABLE(import_run_id uuid,id uuid,exercise_id uuid,title text,title_origin text,description text,subject text,chapter text,section text,classification_state text,library_area text,availability text,can_practice boolean,sort_key text,attribution jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_run uuid;BEGIN
 SELECT h.run_id INTO current_run FROM catalog.import_heads h JOIN catalog.repositories p ON p.id=h.repository_id WHERE p.registry_key='openwebwork-opl';
 IF expected_run IS NOT NULL AND current_run IS DISTINCT FROM expected_run THEN RAISE EXCEPTION 'Catalog cursor is outdated; restart search' USING ERRCODE='40001';END IF;
 RETURN QUERY SELECT e.run_id,e.id,e.exercise_id,e.metadata->>'title',coalesce(e.metadata->>'titleOrigin','generated-source-label'),e.metadata->>'description',
 e.metadata->'normalized'->>0,e.metadata->'normalized'->>1,e.metadata->'normalized'->>2,e.metadata->>'state',split_part(e.path,'/',1),
 CASE WHEN e.state='identity-review' THEN 'identity-review' WHEN catalog.is_playable(e.exercise_id,e.source_version_id,'local-practice') THEN 'practice-ready' ELSE 'verification-pending-or-inactive' END,
 e.state='imported' AND catalog.is_playable(e.exercise_id,e.source_version_id,'local-practice'),e.title_sort,
 jsonb_build_object('authors',coalesce(e.metadata->'authors','[]'),'institutions',coalesce(e.metadata->'institutions','[]'),'bibliographic',coalesce(e.metadata->'bibliographic','{}'),'repository',p.canonical_url,'revision',s.commit_oid,'rightsState','review-required')
 FROM catalog.import_entries e JOIN catalog.import_runs r ON r.id=e.run_id AND r.state='completed'
 JOIN catalog.snapshots s ON s.id=r.snapshot_id JOIN catalog.repositories p ON p.id=s.repository_id
 WHERE e.run_id=current_run AND(e.title_sort,e.id)>(after_title,after_id)
 AND(coalesce(trim(query_text),'')='' OR e.search_document @@ plainto_tsquery('simple',left(query_text,200)))
 AND(subject_filter IS NULL OR e.metadata->'normalized'->>0=subject_filter)
 AND(chapter_filter IS NULL OR e.metadata->'normalized'->>1=chapter_filter)
 AND(section_filter IS NULL OR e.metadata->'normalized'->>2=section_filter)
 AND(area_filter IS NULL OR split_part(e.path,'/',1)=area_filter)
 ORDER BY e.title_sort,e.id LIMIT least(greatest(page_size,1),100);
END $$;
CREATE FUNCTION catalog_api.opl_counts() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH current AS(SELECT h.run_id,h.generation FROM catalog.import_heads h JOIN catalog.repositories p ON p.id=h.repository_id WHERE p.registry_key='openwebwork-opl'),
 entries AS(SELECT e.* FROM catalog.import_entries e JOIN current c ON c.run_id=e.run_id)
 SELECT jsonb_build_object('runId',(SELECT run_id FROM current),'generation',(SELECT generation FROM current),
 'indexed',(SELECT count(*) FROM entries),'identityReview',(SELECT count(*) FROM entries WHERE state='identity-review'),
 'unclassified',(SELECT count(*) FROM entries WHERE metadata->>'state'<>'matched'),
 'practiceReady',(SELECT count(DISTINCT e.exercise_id) FROM entries e JOIN catalog.activation_members m ON m.source_version_id=e.source_version_id WHERE catalog.is_playable(e.exercise_id,e.source_version_id,'local-practice')),
 'areas',(SELECT jsonb_object_agg(area,n) FROM(SELECT split_part(path,'/',1) area,count(*) n FROM entries GROUP BY 1)x));
$$;
CREATE FUNCTION catalog_api.opl_topics(subject_filter text DEFAULT NULL,chapter_filter text DEFAULT NULL) RETURNS TABLE(subject text,chapter text,section text,indexed bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT e.metadata->'normalized'->>0,e.metadata->'normalized'->>1,e.metadata->'normalized'->>2,count(DISTINCT e.id)
 FROM catalog.import_entries e JOIN catalog.import_heads h ON h.run_id=e.run_id JOIN catalog.repositories p ON p.id=h.repository_id
 WHERE p.registry_key='openwebwork-opl' AND e.metadata->>'state'='matched'
 AND(subject_filter IS NULL OR e.metadata->'normalized'->>0=subject_filter)
 AND(chapter_filter IS NULL OR e.metadata->'normalized'->>1=chapter_filter)
 GROUP BY 1,2,3 ORDER BY 1,2,3;
$$;
GRANT SELECT ON catalog.import_heads,catalog.repositories,catalog.snapshots,catalog.import_runs TO practice_api_reader;
-- Reader gets metadata/index columns only; PG path, blob hashes and raw declarations remain private.
GRANT SELECT(id,run_id,exercise_id,source_version_id,state,path,metadata,title_sort,search_document) ON catalog.import_entries TO practice_api_reader;
CREATE POLICY import_head_reader ON catalog.import_heads TO practice_api_reader USING(true);
CREATE POLICY import_repository_reader ON catalog.repositories TO practice_api_reader USING(true);
CREATE POLICY import_snapshot_reader ON catalog.snapshots TO practice_api_reader USING(true);
CREATE POLICY import_run_reader ON catalog.import_runs TO practice_api_reader USING(state='completed');
CREATE POLICY import_entry_reader ON catalog.import_entries TO practice_api_reader USING(EXISTS(SELECT 1 FROM catalog.import_runs r WHERE r.id=run_id AND r.state='completed'));
-- Count readiness through a narrow definer helper rather than granting evidence/member tables to reader.
CREATE FUNCTION catalog.opl_ready_count(run_key uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT count(DISTINCT e.exercise_id) FROM catalog.import_entries e JOIN catalog.activation_members m ON m.source_version_id=e.source_version_id WHERE e.run_id=run_key AND catalog.is_playable(e.exercise_id,e.source_version_id,'local-practice') $$;
CREATE OR REPLACE FUNCTION catalog_api.opl_counts() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH current AS(SELECT h.run_id,h.generation FROM catalog.import_heads h JOIN catalog.repositories p ON p.id=h.repository_id WHERE p.registry_key='openwebwork-opl'),
 entries AS(SELECT e.* FROM catalog.import_entries e JOIN current c ON c.run_id=e.run_id)
 SELECT jsonb_build_object('runId',(SELECT run_id FROM current),'generation',(SELECT generation FROM current),'indexed',(SELECT count(*) FROM entries),
 'identityReview',(SELECT count(*) FROM entries WHERE state='identity-review'),'unclassified',(SELECT count(*) FROM entries WHERE metadata->>'state'<>'matched'),
 'practiceReady',catalog.opl_ready_count((SELECT run_id FROM current)),
 'areas',(SELECT jsonb_object_agg(area,n) FROM(SELECT split_part(path,'/',1) area,count(*) n FROM entries GROUP BY 1)x));
$$;
GRANT CREATE ON SCHEMA catalog_api TO practice_api_reader;
ALTER FUNCTION catalog_api.search_opl(text,text,text,text,text,integer,text,uuid,uuid) OWNER TO practice_api_reader;
ALTER FUNCTION catalog_api.opl_counts() OWNER TO practice_api_reader;
ALTER FUNCTION catalog_api.opl_topics(text,text) OWNER TO practice_api_reader;
REVOKE CREATE ON SCHEMA catalog_api FROM practice_api_reader;
REVOKE ALL ON FUNCTION catalog.opl_ready_count(uuid),catalog_api.search_opl(text,text,text,text,text,integer,text,uuid,uuid),catalog_api.opl_counts(),catalog_api.opl_topics(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION catalog.opl_ready_count(uuid) TO practice_api_reader,service_role;
GRANT EXECUTE ON FUNCTION catalog_api.search_opl(text,text,text,text,text,integer,text,uuid,uuid),catalog_api.opl_counts(),catalog_api.opl_topics(text,text) TO anon,authenticated;
COMMIT;
