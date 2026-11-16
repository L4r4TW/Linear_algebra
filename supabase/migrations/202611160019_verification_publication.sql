BEGIN;
SET LOCAL search_path=pg_catalog;
CREATE FUNCTION catalog.prepare_verification_release(job_keys uuid[],actor_ref text,release_reason text) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE j catalog.verification_jobs;a catalog.verification_attempts;e catalog.verification_evidence;c catalog.verifier_contexts;s catalog.source_versions;
 v_assessment uuid;release_id uuid;first_env uuid;first_profile uuid;context_key uuid;BEGIN
 IF cardinality(job_keys) NOT BETWEEN 1 AND 100 OR cardinality(job_keys)<>(SELECT count(DISTINCT x) FROM unnest(job_keys)x) OR length(trim(release_reason)) NOT BETWEEN 12 AND 2000 OR nullif(trim(actor_ref),'') IS NULL THEN RAISE EXCEPTION 'Explicit bounded release and reason required' USING ERRCODE='23514';END IF;
 IF (SELECT count(*) FROM catalog.verification_jobs WHERE id=ANY(job_keys))<>cardinality(job_keys) OR (SELECT count(DISTINCT context_id) FROM catalog.verification_jobs WHERE id=ANY(job_keys))<>1 THEN RAISE EXCEPTION 'Exact same-context jobs required' USING ERRCODE='23514';END IF;
 FOR j IN SELECT * FROM catalog.verification_jobs WHERE id=ANY(job_keys) ORDER BY id FOR UPDATE LOOP
  SELECT * INTO c FROM catalog.verifier_contexts WHERE id=j.context_id;
  IF j.state<>'passed' OR j.technical_state<>'passed' OR NOT catalog.verification_job_current(j.id) OR (c.payload->>'certified')::boolean IS DISTINCT FROM true OR NOT EXISTS(SELECT 1 FROM catalog.verifier_health h WHERE h.scope='local-practice' AND h.context_id=c.id AND h.matches AND h.observed_at>now()-interval '60 seconds') THEN RAISE EXCEPTION 'Current certified reviewed proof required' USING ERRCODE='23514';END IF;
  SELECT * INTO a FROM catalog.verification_attempts WHERE job_id=j.id ORDER BY ordinal DESC LIMIT 1;
  IF NOT catalog.verification_reviews_complete(j.id,a.id) THEN RAISE EXCEPTION 'Independent reviews incomplete' USING ERRCODE='23514';END IF;
  PERFORM catalog.materialize_verification(j.id);SELECT * INTO e FROM catalog.verification_evidence WHERE attempt_id=a.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Complete retained evidence required' USING ERRCODE='23514';END IF;
  UPDATE catalog.requirement_sets SET discovery_complete=true WHERE id=e.requirement_set_id AND NOT discovery_complete;
  SELECT assessment_id INTO v_assessment FROM catalog.verification_approvals WHERE job_id=j.id AND attempt_id=a.id;
  IF NOT FOUND THEN
   INSERT INTO catalog.assessments(source_version_id,source_snapshot_id,environment_id,profile_id,requirement_set_id,bundle_digest,status,bundle_id)
   SELECT source_version_id,source_snapshot_id,environment_id,profile_id,requirement_set_id,bundle_digest,'verified',bundle_id FROM catalog.assessments WHERE id=e.assessment_id RETURNING id INTO v_assessment;
   INSERT INTO catalog.verification_approvals(job_id,attempt_id,assessment_id,actor,reason) VALUES(j.id,a.id,v_assessment,actor_ref,release_reason);
  END IF;
  IF NOT catalog.assessment_is_eligible(v_assessment) THEN RAISE EXCEPTION 'Assessment failed strict eligibility' USING ERRCODE='23514';END IF;
  IF release_id IS NULL THEN
   INSERT INTO catalog.activation_releases(scope,environment_id,profile_id,state) VALUES('local-practice',e.environment_id,e.profile_id,'draft') RETURNING id INTO release_id;
   first_env:=e.environment_id;first_profile:=e.profile_id;
  ELSIF first_env<>e.environment_id OR first_profile<>e.profile_id THEN RAISE EXCEPTION 'Release identity conflict' USING ERRCODE='23514';END IF;
  SELECT * INTO s FROM catalog.source_versions WHERE id=j.source_version_id;
  INSERT INTO catalog.activation_members(release_id,exercise_id,source_version_id,source_snapshot_id,environment_id,profile_id,requirement_set_id,assessment_id) VALUES(release_id,s.exercise_id,s.id,s.snapshot_id,e.environment_id,e.profile_id,e.requirement_set_id,v_assessment);
 END LOOP;
 INSERT INTO catalog.deployment_heads(scope,release_id,generation,active) VALUES('local-practice',NULL,0,false) ON CONFLICT DO NOTHING;
 RETURN release_id;
END $$;
CREATE FUNCTION catalog.review_invalidates_publication() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE h catalog.deployment_heads;BEGIN
 SELECT * INTO h FROM catalog.deployment_heads WHERE scope='local-practice' FOR UPDATE;
 IF h.active AND EXISTS(SELECT 1 FROM catalog.activation_members m JOIN catalog.verification_approvals p ON p.assessment_id=m.assessment_id WHERE m.release_id=h.release_id AND p.job_id=NEW.job_id) THEN
  PERFORM catalog.withdraw_release('local-practice',h.generation,NEW.actor,'REVIEW_CHANGED: '||NEW.reason);
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER review_withdraws_published_batch AFTER INSERT ON catalog.verification_reviews FOR EACH ROW EXECUTE FUNCTION catalog.review_invalidates_publication();
CREATE FUNCTION catalog_api.practice_opl(query_text text DEFAULT '',include_indexed boolean DEFAULT false,page_size integer DEFAULT 20,after_title text DEFAULT '',after_id uuid DEFAULT '00000000-0000-0000-0000-000000000000')
 RETURNS TABLE(id uuid,exercise_id uuid,title text,description text,subject text,chapter text,section text,can_practice boolean,availability text,sort_key text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT e.id,e.exercise_id,e.metadata->>'title',e.metadata->>'description',e.metadata->'normalized'->>0,e.metadata->'normalized'->>1,e.metadata->'normalized'->>2,
 catalog.is_playable(e.exercise_id,e.source_version_id,'local-practice'),
 CASE WHEN catalog.is_playable(e.exercise_id,e.source_version_id,'local-practice') THEN 'practice-ready' WHEN e.state='identity-review' THEN 'identity-review' ELSE 'awaiting-verification-or-support' END,e.title_sort
 FROM catalog.import_entries e JOIN catalog.import_heads ih ON ih.run_id=e.run_id JOIN catalog.repositories p ON p.id=ih.repository_id
 WHERE p.registry_key='openwebwork-opl' AND(coalesce(include_indexed,false) OR EXISTS(
  SELECT 1 FROM catalog.activation_members m JOIN catalog.deployment_heads h ON h.release_id=m.release_id AND h.active AND h.scope='local-practice'
  WHERE m.source_version_id=e.source_version_id AND catalog.is_playable(e.exercise_id,e.source_version_id,'local-practice')))
 AND(coalesce(trim(query_text),'')='' OR e.search_document @@ plainto_tsquery('simple',left(query_text,200)))
 AND(e.title_sort,e.id)>(after_title,after_id) ORDER BY e.title_sort,e.id LIMIT least(greatest(page_size,1),100) $$;
REVOKE ALL ON FUNCTION catalog.prepare_verification_release(uuid[],text,text),catalog.review_invalidates_publication() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION catalog.prepare_verification_release(uuid[],text,text),catalog.review_invalidates_publication() TO service_role;
REVOKE ALL ON FUNCTION catalog_api.practice_opl(text,boolean,integer,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION catalog_api.practice_opl(text,boolean,integer,text,uuid) TO anon,authenticated;
COMMIT;
