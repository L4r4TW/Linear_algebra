-- Fail-closed publication validation, immutable release boundaries and narrow owner-read APIs.
BEGIN;
SET LOCAL search_path=pg_catalog;
CREATE FUNCTION catalog.guard_parent_release() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ DECLARE parent uuid;st text; BEGIN
 IF TG_OP='UPDATE' AND NEW.release_id IS DISTINCT FROM OLD.release_id THEN RAISE EXCEPTION 'Release association immutable' USING ERRCODE='55000'; END IF;
 parent:=CASE WHEN TG_OP='DELETE' THEN OLD.release_id ELSE NEW.release_id END;
 EXECUTE format('SELECT state FROM catalog.%I WHERE id=$1 FOR UPDATE',TG_ARGV[0]) INTO st USING parent;
 IF st IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Published release is immutable' USING ERRCODE='55000'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END $$;
CREATE TRIGGER metadata_docs_frozen BEFORE INSERT OR UPDATE OR DELETE ON catalog.metadata_documents FOR EACH ROW EXECUTE FUNCTION catalog.guard_parent_release('metadata_releases');
CREATE TRIGGER metadata_selections_frozen BEFORE INSERT OR UPDATE OR DELETE ON catalog.metadata_selections FOR EACH ROW EXECUTE FUNCTION catalog.guard_parent_release('metadata_releases');
CREATE TRIGGER topic_members_frozen BEFORE INSERT OR UPDATE OR DELETE ON catalog.topic_memberships FOR EACH ROW EXECUTE FUNCTION catalog.guard_parent_release('taxonomy_releases');
CREATE TRIGGER topic_assignments_frozen BEFORE INSERT OR UPDATE OR DELETE ON catalog.topic_assignments FOR EACH ROW EXECUTE FUNCTION catalog.guard_parent_release('taxonomy_releases');
CREATE TRIGGER activation_members_frozen BEFORE INSERT OR UPDATE OR DELETE ON catalog.activation_members FOR EACH ROW EXECUTE FUNCTION catalog.guard_parent_release('activation_releases');
CREATE FUNCTION catalog.guard_sealed_definition() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF(TG_TABLE_NAME='profiles' AND( to_jsonb(OLD)->>'sealed')::boolean) OR(TG_TABLE_NAME='requirement_sets' AND(to_jsonb(OLD)->>'discovery_complete')::boolean) OR(TG_TABLE_NAME='environments' AND(to_jsonb(OLD)->>'certified')::boolean) THEN RAISE EXCEPTION 'Sealed definition immutable' USING ERRCODE='55000'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END $$;
CREATE TRIGGER profiles_frozen BEFORE UPDATE OR DELETE ON catalog.profiles FOR EACH ROW EXECUTE FUNCTION catalog.guard_sealed_definition();
CREATE TRIGGER requirements_frozen BEFORE UPDATE OR DELETE ON catalog.requirement_sets FOR EACH ROW EXECUTE FUNCTION catalog.guard_sealed_definition();
CREATE TRIGGER environments_frozen BEFORE UPDATE OR DELETE ON catalog.environments FOR EACH ROW EXECUTE FUNCTION catalog.guard_sealed_definition();
CREATE FUNCTION catalog.guard_definition_child() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ DECLARE parent uuid;frozen boolean; BEGIN
 IF TG_OP='UPDATE' AND((TG_ARGV[0]='profile' AND(to_jsonb(NEW)->>'profile_id') IS DISTINCT FROM(to_jsonb(OLD)->>'profile_id')) OR(TG_ARGV[0]='requirement' AND(to_jsonb(NEW)->>'requirement_set_id') IS DISTINCT FROM(to_jsonb(OLD)->>'requirement_set_id'))) THEN RAISE EXCEPTION 'Definition association immutable' USING ERRCODE='55000';END IF; IF TG_ARGV[0]='profile' THEN parent:=CASE WHEN TG_OP='DELETE' THEN OLD.profile_id ELSE NEW.profile_id END;SELECT sealed INTO frozen FROM catalog.profiles WHERE id=parent FOR UPDATE;
 ELSE parent:=CASE WHEN TG_OP='DELETE' THEN OLD.requirement_set_id ELSE NEW.requirement_set_id END;SELECT discovery_complete INTO frozen FROM catalog.requirement_sets WHERE id=parent FOR UPDATE;END IF;
 IF frozen THEN RAISE EXCEPTION 'Sealed definition members immutable' USING ERRCODE='55000'; END IF;IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;END $$;
CREATE TRIGGER dimensions_frozen BEFORE INSERT OR UPDATE OR DELETE ON catalog.profile_dimensions FOR EACH ROW EXECUTE FUNCTION catalog.guard_definition_child('profile');
CREATE TRIGGER checks_frozen BEFORE INSERT OR UPDATE OR DELETE ON catalog.profile_checks FOR EACH ROW EXECUTE FUNCTION catalog.guard_definition_child('profile');
CREATE TRIGGER capabilities_frozen BEFORE INSERT OR UPDATE OR DELETE ON catalog.profile_capabilities FOR EACH ROW EXECUTE FUNCTION catalog.guard_definition_child('profile');
CREATE TRIGGER requirement_caps_frozen BEFORE INSERT OR UPDATE OR DELETE ON catalog.requirement_capabilities FOR EACH ROW EXECUTE FUNCTION catalog.guard_definition_child('requirement');
CREATE TRIGGER case_attempts_immutable BEFORE UPDATE OR DELETE ON catalog.case_attempts FOR EACH ROW EXECUTE FUNCTION catalog.reject_mutation();
CREATE TRIGGER bundles_immutable BEFORE UPDATE OR DELETE ON catalog.evidence_bundles FOR EACH ROW EXECUTE FUNCTION catalog.reject_mutation();
CREATE TRIGGER assessments_immutable BEFORE UPDATE OR DELETE ON catalog.assessments FOR EACH ROW EXECUTE FUNCTION catalog.reject_mutation();
CREATE TRIGGER events_immutable BEFORE UPDATE OR DELETE ON catalog.activation_events FOR EACH ROW EXECUTE FUNCTION catalog.reject_mutation();
CREATE TRIGGER private_events_immutable BEFORE UPDATE OR DELETE ON practice_private.events FOR EACH ROW EXECUTE FUNCTION catalog.reject_mutation();
CREATE TRIGGER revisions_immutable BEFORE UPDATE OR DELETE ON practice_private.draft_revisions FOR EACH ROW EXECUTE FUNCTION catalog.reject_mutation();
CREATE FUNCTION catalog.guard_run_members() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ DECLARE r uuid;st text; BEGIN IF TG_OP='UPDATE' AND NEW.run_id IS DISTINCT FROM OLD.run_id THEN RAISE EXCEPTION 'Run association immutable' USING ERRCODE='55000';END IF;r:=CASE WHEN TG_OP='DELETE' THEN OLD.run_id ELSE NEW.run_id END;SELECT state INTO st FROM catalog.verification_runs WHERE id=r FOR UPDATE;IF(TG_TABLE_NAME='verification_targets' AND st<>'queued') OR(TG_TABLE_NAME='case_attempts' AND st<>'running') THEN RAISE EXCEPTION 'Closed run members immutable' USING ERRCODE='55000';END IF;IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END $$;
CREATE TRIGGER targets_frozen BEFORE INSERT OR UPDATE OR DELETE ON catalog.verification_targets FOR EACH ROW EXECUTE FUNCTION catalog.guard_run_members();
CREATE TRIGGER cases_closed BEFORE INSERT ON catalog.case_attempts FOR EACH ROW EXECUTE FUNCTION catalog.guard_run_members();
CREATE FUNCTION catalog.guard_closed_run() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN IF TG_OP='UPDATE' AND OLD.state='running' AND (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state') THEN RAISE EXCEPTION 'Running manifest immutable' USING ERRCODE='55000';END IF;IF TG_OP='UPDATE' AND OLD.state='running' AND NEW.state='queued' THEN RAISE EXCEPTION 'Cannot reopen running manifest' USING ERRCODE='55000';END IF;IF OLD.state NOT IN('queued','running') THEN RAISE EXCEPTION 'Closed run immutable' USING ERRCODE='55000'; END IF;IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;END $$;
CREATE TRIGGER run_frozen BEFORE UPDATE OR DELETE ON catalog.verification_runs FOR EACH ROW EXECUTE FUNCTION catalog.guard_closed_run();
CREATE FUNCTION catalog.assessment_is_eligible(assessment_key uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM catalog.assessments a JOIN catalog.evidence_bundles b ON b.id=a.bundle_id JOIN catalog.verification_runs r ON r.id=b.run_id JOIN catalog.verification_workers w ON w.id=r.worker_id JOIN catalog.profiles p ON p.id=a.profile_id JOIN catalog.environments e ON e.id=a.environment_id JOIN catalog.requirement_sets q ON q.id=a.requirement_set_id
 WHERE a.id=assessment_key AND a.status='verified' AND p.sealed AND q.discovery_complete AND e.certified AND e.pg_revision ~ '^[a-f0-9]{40}([a-f0-9]{24})?$' AND e.renderer_revision ~ '^[a-f0-9]{40}([a-f0-9]{24})?$' AND e.dependency_digest IS NOT NULL AND e.runtime_digest IS NOT NULL AND e.source_manifest_digest IS NOT NULL AND w.state='active' AND r.state='completed'
 AND r.target_count=(SELECT count(*) FROM catalog.verification_targets WHERE run_id=r.id)
 AND EXISTS(SELECT 1 FROM catalog.profile_dimensions WHERE profile_id=p.id) AND EXISTS(SELECT 1 FROM catalog.profile_checks WHERE profile_id=p.id)
 AND NOT EXISTS(SELECT 1 FROM catalog.verification_targets t CROSS JOIN catalog.profile_dimensions d WHERE t.run_id=r.id AND d.profile_id=p.id AND NOT EXISTS(SELECT 1 FROM catalog.case_attempts c WHERE c.run_id=r.id AND c.source_version_id=t.source_version_id AND c.seed=d.seed AND c.viewport=d.viewport))
 AND EXISTS(SELECT 1 FROM catalog.requirement_capabilities WHERE requirement_set_id=q.id)
 AND NOT EXISTS(SELECT 1 FROM catalog.requirement_capabilities rc LEFT JOIN catalog.profile_capabilities pc ON pc.profile_id=p.id AND pc.capability_id=rc.capability_id WHERE rc.requirement_set_id=q.id AND pc.status IS DISTINCT FROM 'verified')
 AND (SELECT count(*) FROM catalog.bundle_cases WHERE bundle_id=b.id)=(SELECT count(*) FROM catalog.profile_dimensions WHERE profile_id=p.id)
 AND NOT EXISTS(SELECT 1 FROM catalog.bundle_cases bc JOIN catalog.case_attempts c ON c.id=bc.case_attempt_id WHERE bc.bundle_id=b.id AND(c.state<>'passed' OR NOT c.source_verified OR c.correct_score IS DISTINCT FROM 1::numeric OR c.cleared_score IS DISTINCT FROM 0::numeric OR c.failure_code IS NOT NULL OR jsonb_array_length(c.limitations)>0 OR EXISTS(SELECT 1 FROM catalog.profile_checks ck WHERE ck.profile_id=p.id AND c.checks->ck.check_key IS DISTINCT FROM 'true'::jsonb)))) $$;
CREATE FUNCTION catalog.is_playable(exercise_key uuid,source_key uuid,scope_key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT EXISTS(SELECT 1 FROM catalog.deployment_heads h JOIN catalog.activation_releases r ON r.id=h.release_id AND r.scope=h.scope JOIN catalog.activation_members m ON m.release_id=r.id WHERE h.scope=scope_key AND h.active AND r.state='published' AND m.exercise_id=exercise_key AND m.source_version_id=source_key AND catalog.assessment_is_eligible(m.assessment_id) AND NOT EXISTS(SELECT 1 FROM catalog.policy_revocations x WHERE x.source_version_id=source_key AND x.scope=scope_key)) $$;
CREATE FUNCTION catalog.publish_release(release_key uuid,expected_generation bigint,actor_ref text,reason text) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$ DECLARE r catalog.activation_releases;h catalog.deployment_heads;n bigint; BEGIN
 SELECT * INTO r FROM catalog.activation_releases WHERE id=release_key FOR UPDATE;IF NOT FOUND OR r.state<>'draft' THEN RAISE EXCEPTION 'Draft release required' USING ERRCODE='55000';END IF;
 INSERT INTO catalog.deployment_heads(scope,release_id,generation,active) VALUES(r.scope,NULL,0,false) ON CONFLICT(scope) DO NOTHING;
 SELECT * INTO h FROM catalog.deployment_heads WHERE scope=r.scope FOR UPDATE;IF h.generation IS DISTINCT FROM expected_generation THEN RAISE EXCEPTION 'Publication generation conflict' USING ERRCODE='40001';END IF;
 IF NOT EXISTS(SELECT 1 FROM catalog.activation_members WHERE release_id=r.id) OR EXISTS(SELECT 1 FROM catalog.activation_members m WHERE m.release_id=r.id AND(NOT catalog.assessment_is_eligible(m.assessment_id) OR EXISTS(SELECT 1 FROM catalog.policy_revocations x WHERE x.source_version_id=m.source_version_id AND x.scope=r.scope))) THEN RAISE EXCEPTION 'Ineligible release member' USING ERRCODE='23514';END IF;
 UPDATE catalog.activation_releases SET state='published' WHERE id=r.id;UPDATE catalog.deployment_heads SET release_id=r.id,generation=generation+1,active=true WHERE scope=r.scope RETURNING generation INTO n;
 INSERT INTO catalog.activation_events(release_id,scope,generation,actor_ref,kind,reason) VALUES(r.id,r.scope,n,actor_ref,'published',reason);RETURN n;END $$;
CREATE FUNCTION catalog.withdraw_release(scope_key text,expected_generation bigint,actor_ref text,reason text) RETURNS bigint LANGUAGE plpgsql SET search_path=pg_catalog AS $$ DECLARE h catalog.deployment_heads;n bigint;BEGIN SELECT * INTO h FROM catalog.deployment_heads WHERE scope=scope_key FOR UPDATE;IF NOT FOUND OR h.generation IS DISTINCT FROM expected_generation THEN RAISE EXCEPTION 'Publication generation conflict' USING ERRCODE='40001';END IF;UPDATE catalog.deployment_heads SET active=false,generation=generation+1 WHERE scope=scope_key RETURNING generation INTO n;INSERT INTO catalog.activation_events(release_id,scope,generation,actor_ref,kind,reason) VALUES(h.release_id,scope_key,n,actor_ref,'withdrawn',reason);RETURN n;END $$;
-- Prevent definition/source membership changes after publication; do not relabel history.
CREATE FUNCTION catalog.guard_bundle_cases() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN IF TG_OP<>'INSERT' OR EXISTS(SELECT 1 FROM catalog.assessments WHERE bundle_id=NEW.bundle_id) THEN RAISE EXCEPTION 'Selected assessment evidence immutable' USING ERRCODE='55000';END IF;RETURN NEW;END $$;
CREATE TRIGGER bundle_members_frozen BEFORE INSERT OR UPDATE OR DELETE ON catalog.bundle_cases FOR EACH ROW EXECUTE FUNCTION catalog.guard_bundle_cases();
DO $immutable$ DECLARE name text;BEGIN FOREACH name IN ARRAY ARRAY['snapshots','topics','raw_classifications','source_taxonomies','classification_assessments','identity_events','metadata_reviews','capability_versions','policy_revocations'] LOOP EXECUTE format('CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON catalog.%I FOR EACH ROW EXECUTE FUNCTION catalog.reject_mutation()',name);END LOOP;END $immutable$;
CREATE FUNCTION catalog.guard_release_header() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
 IF OLD.state<>'draft' THEN RAISE EXCEPTION 'Published release header immutable' USING ERRCODE='55000';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END $$;
CREATE TRIGGER metadata_header_frozen BEFORE UPDATE OR DELETE ON catalog.metadata_releases FOR EACH ROW EXECUTE FUNCTION catalog.guard_release_header();
CREATE TRIGGER taxonomy_header_frozen BEFORE UPDATE OR DELETE ON catalog.taxonomy_releases FOR EACH ROW EXECUTE FUNCTION catalog.guard_release_header();
CREATE TRIGGER activation_header_frozen BEFORE UPDATE OR DELETE ON catalog.activation_releases FOR EACH ROW EXECUTE FUNCTION catalog.guard_release_header();
-- Browser roles receive no private schema/base-table access. Read APIs execute under a NOLOGIN, non-bypass reader.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='practice_api_reader') THEN CREATE ROLE practice_api_reader NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;ELSIF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='practice_api_reader' AND(rolcanlogin OR rolsuper OR rolbypassrls OR rolinherit)) THEN RAISE EXCEPTION 'Unexpected existing API reader role';END IF;END $$;
GRANT practice_api_reader TO CURRENT_USER;
CREATE FUNCTION practice_private.owned_principals() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p.id FROM practice_private.principals p WHERE auth.uid() IS NOT NULL AND p.kind='account' AND p.account_id=auth.uid() AND p.state='active'
 UNION SELECT g.id FROM practice_private.principals p JOIN practice_private.account_claims c ON c.account_principal_id=p.id AND c.state='active' JOIN practice_private.principals g ON g.id=c.anonymous_principal_id AND g.state='active' WHERE auth.uid() IS NOT NULL AND p.kind='account' AND p.account_id=auth.uid() AND p.state='active' $$;
DO $$ DECLARE t record;BEGIN FOR t IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('catalog','practice_private') LOOP EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',t.schemaname,t.tablename);EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',t.schemaname,t.tablename);EXECUTE format('CREATE POLICY backend_only ON %I.%I TO service_role,%I USING(true) WITH CHECK(true)',t.schemaname,t.tablename,current_user);END LOOP;END $$;
GRANT USAGE ON SCHEMA catalog,practice_private TO service_role,practice_api_reader;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA catalog,practice_private TO service_role;
GRANT USAGE ON SCHEMA catalog_api TO anon,authenticated,practice_api_reader;
GRANT USAGE ON SCHEMA auth TO practice_api_reader;
GRANT EXECUTE ON FUNCTION auth.uid() TO practice_api_reader;
GRANT SELECT ON catalog.metadata_heads,catalog.metadata_releases,catalog.metadata_documents TO practice_api_reader;
CREATE POLICY metadata_head_reader ON catalog.metadata_heads TO practice_api_reader USING(true);
CREATE POLICY metadata_release_reader ON catalog.metadata_releases TO practice_api_reader USING(state='published');
CREATE POLICY metadata_document_reader ON catalog.metadata_documents TO practice_api_reader USING(EXISTS(SELECT 1 FROM catalog.metadata_releases r WHERE r.id=release_id AND r.state='published'));
GRANT SELECT(id,owner_id,exercise_id,binding,updated_at) ON practice_private.sessions TO practice_api_reader;
GRANT SELECT(id,session_id,owner_id,ordinal,provenance,binding,source_version_id,environment_id,feedback_visibility,score,answers,feedback,field_feedback) ON practice_private.attempts TO practice_api_reader;
CREATE POLICY session_owner_reader ON practice_private.sessions TO practice_api_reader USING(owner_id IN(SELECT practice_private.owned_principals()));
CREATE POLICY attempt_owner_reader ON practice_private.attempts TO practice_api_reader USING(owner_id IN(SELECT practice_private.owned_principals()));
CREATE FUNCTION catalog_api.exercises(include_unavailable boolean DEFAULT false,page_size integer DEFAULT 20,after_title text DEFAULT '',after_id uuid DEFAULT '00000000-0000-0000-0000-000000000000') RETURNS TABLE(id uuid,title text,description text,subject text,topic text,content_language text,difficulty smallint,estimated_minutes numeric,attribution jsonb,can_practice boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT d.exercise_id,d.title,d.description,d.subject_label,d.topic_label,d.content_language,d.difficulty,d.estimated_minutes,d.attribution,catalog.is_playable(d.exercise_id,d.source_version_id,'local-practice')
 FROM catalog.metadata_documents d JOIN catalog.metadata_heads h ON h.release_id=d.release_id AND h.scope='local-practice' JOIN catalog.metadata_releases r ON r.id=d.release_id AND r.state='published'
 WHERE d.locale='en' AND(d.title_sort,d.exercise_id)>(after_title,after_id) AND(include_unavailable OR catalog.is_playable(d.exercise_id,d.source_version_id,'local-practice')) ORDER BY d.title_sort,d.exercise_id LIMIT least(greatest(page_size,1),100) $$;
CREATE FUNCTION catalog_api.my_sessions(page_size integer DEFAULT 20) RETURNS TABLE(id uuid,exercise_id uuid,binding text,updated_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT s.id,s.exercise_id,s.binding,s.updated_at FROM practice_private.sessions s WHERE s.owner_id IN(SELECT practice_private.owned_principals()) ORDER BY s.updated_at DESC,s.id DESC LIMIT least(greatest(page_size,1),100) $$;
CREATE FUNCTION catalog_api.my_attempts(session_key uuid,page_size integer DEFAULT 20) RETURNS TABLE(id uuid,ordinal bigint,provenance text,binding text,feedback_visibility text,visible_score numeric,answers jsonb,feedback jsonb,field_feedback jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT a.id,a.ordinal,a.provenance,a.binding,a.feedback_visibility,CASE WHEN a.feedback_visibility='shown' THEN a.score ELSE NULL END,a.answers,CASE WHEN a.feedback_visibility='shown' THEN a.feedback ELSE jsonb_build_object('message','','summary','') END,CASE WHEN a.feedback_visibility='shown' THEN a.field_feedback ELSE(SELECT coalesce(jsonb_agg(jsonb_build_object('name',f->>'name','status','ungraded','score',NULL,'message','','reason',CASE WHEN a.feedback_visibility='suppressed' THEN 'suppressed' ELSE 'visibility-unknown' END)),'[]'::jsonb) FROM jsonb_array_elements(a.field_feedback) f) END FROM practice_private.attempts a WHERE a.session_id=session_key AND a.owner_id IN(SELECT practice_private.owned_principals()) ORDER BY a.ordinal DESC LIMIT least(greatest(page_size,1),100) $$;
GRANT CREATE ON SCHEMA catalog_api TO practice_api_reader;
ALTER FUNCTION catalog_api.exercises(boolean,integer,text,uuid) OWNER TO practice_api_reader;
ALTER FUNCTION catalog_api.my_sessions(integer) OWNER TO practice_api_reader;
ALTER FUNCTION catalog_api.my_attempts(uuid,integer) OWNER TO practice_api_reader;
REVOKE CREATE ON SCHEMA catalog_api FROM practice_api_reader;
REVOKE ALL ON ALL TABLES IN SCHEMA catalog,practice_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA catalog,practice_private,catalog_api FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA catalog,practice_private TO service_role;
GRANT EXECUTE ON FUNCTION practice_private.owned_principals() TO practice_api_reader;
GRANT EXECUTE ON FUNCTION catalog.is_playable(uuid,uuid,text) TO practice_api_reader;
GRANT EXECUTE ON FUNCTION catalog_api.exercises(boolean,integer,text,uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION catalog_api.my_sessions(integer),catalog_api.my_attempts(uuid,integer) TO authenticated;
-- Additive legacy safeguard: owner-row RLS must not let a browser promote its profile role.
CREATE FUNCTION practice_private.guard_legacy_profile_role() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$ BEGIN IF current_user IN('anon','authenticated') AND((TG_OP='INSERT' AND NEW.role<>'student') OR(TG_OP='UPDATE' AND NEW.role IS DISTINCT FROM OLD.role)) THEN RAISE EXCEPTION 'Role assignment is privileged' USING ERRCODE='42501';END IF;RETURN NEW;END $$;
DO $$ BEGIN IF to_regclass('public.profiles') IS NOT NULL THEN CREATE TRIGGER catalog_profile_role_guard BEFORE INSERT OR UPDATE OF role ON public.profiles FOR EACH ROW EXECUTE FUNCTION practice_private.guard_legacy_profile_role();END IF;END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog,practice_private REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog,practice_private,catalog_api REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
REVOKE ALL ON FUNCTION practice_private.guard_legacy_profile_role() FROM PUBLIC,anon,authenticated;
COMMIT;
