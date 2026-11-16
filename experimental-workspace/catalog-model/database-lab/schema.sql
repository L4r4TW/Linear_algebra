-- TASK 5.7 LAB ONLY. Not a Supabase migration. No public/auth schemas or existing data touched.
\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database() <> 'catalog_design_lab' OR current_setting('model.design_lab',true) IS DISTINCT FROM 'yes' THEN RAISE EXCEPTION 'Disposable design-lab database and marker required'; END IF; END $$;
CREATE SCHEMA model_lab;
SET search_path=model_lab,pg_catalog;
CREATE DOMAIN digest256 AS text CHECK (VALUE ~ '^[a-f0-9]{64}$');
CREATE TABLE repositories(id uuid PRIMARY KEY, registry_key text NOT NULL UNIQUE);
CREATE TABLE snapshots(id uuid PRIMARY KEY, repository_id uuid NOT NULL REFERENCES repositories ON DELETE RESTRICT, object_format text NOT NULL CHECK(object_format IN ('sha1','sha256')), commit_oid text NOT NULL, CHECK((object_format='sha1' AND commit_oid ~ '^[a-f0-9]{40}$') OR (object_format='sha256' AND commit_oid ~ '^[a-f0-9]{64}$')), UNIQUE(repository_id,object_format,commit_oid));
CREATE TABLE exercises(id uuid PRIMARY KEY, provider text NOT NULL CHECK(provider IN ('opl','authored')), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE aliases(namespace text NOT NULL CHECK(length(btrim(namespace)) BETWEEN 1 AND 64),external_id text NOT NULL CHECK(length(btrim(external_id)) BETWEEN 1 AND 128),exercise_id uuid NOT NULL REFERENCES exercises ON DELETE RESTRICT,PRIMARY KEY(namespace,external_id));
CREATE TABLE source_versions(id uuid PRIMARY KEY,exercise_id uuid NOT NULL REFERENCES exercises ON DELETE RESTRICT,snapshot_id uuid NOT NULL REFERENCES snapshots ON DELETE RESTRICT,path text COLLATE "C" NOT NULL,sha256 digest256 NOT NULL,
 CHECK(path ~ '^(OpenProblemLibrary|Contrib|Pending)/.+' AND path ~* '[.]pg$' AND path !~ '(^|/)[.]{1,2}(/|$)' AND path !~ '//|[[:cntrl:]]' AND position(chr(92) in path)=0),
 UNIQUE(snapshot_id,path),UNIQUE(exercise_id,snapshot_id),UNIQUE(id,exercise_id,snapshot_id),UNIQUE(id,snapshot_id));
-- UNIQUE(exercise_id,snapshot_id) already supplies this lookup index.
CREATE TABLE taxonomy_releases(id uuid PRIMARY KEY,state text NOT NULL CHECK(state IN('draft','published','retired')));
CREATE TABLE topics(id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN('subject','chapter','section')),UNIQUE(id,kind));
CREATE TABLE topic_memberships(release_id uuid NOT NULL REFERENCES taxonomy_releases ON DELETE RESTRICT,node_id uuid NOT NULL,kind text NOT NULL,parent_id uuid,parent_kind text GENERATED ALWAYS AS (CASE kind WHEN 'chapter' THEN 'subject' WHEN 'section' THEN 'chapter' END) STORED,locale text NOT NULL,label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 120),slug text COLLATE "C" NOT NULL CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),position integer NOT NULL CHECK(position>0),
 PRIMARY KEY(release_id,node_id,locale),UNIQUE(release_id,node_id,locale,kind),FOREIGN KEY(node_id,kind) REFERENCES topics(id,kind) ON DELETE RESTRICT,
 CHECK((kind='subject' AND parent_id IS NULL) OR (kind IN('chapter','section') AND parent_id IS NOT NULL)),
 FOREIGN KEY(release_id,parent_id,locale,parent_kind) REFERENCES topic_memberships(release_id,node_id,locale,kind) ON DELETE RESTRICT,
 UNIQUE NULLS NOT DISTINCT(release_id,parent_id,locale,slug),UNIQUE NULLS NOT DISTINCT(release_id,parent_id,locale,position));
CREATE TABLE topic_assignments(release_id uuid NOT NULL,node_id uuid NOT NULL,locale text NOT NULL,node_kind text NOT NULL DEFAULT 'section' CHECK(node_kind='section'),source_version_id uuid NOT NULL,exercise_id uuid NOT NULL,snapshot_id uuid NOT NULL,is_primary boolean NOT NULL,
 PRIMARY KEY(release_id,source_version_id,node_id,locale),FOREIGN KEY(release_id,node_id,locale,node_kind) REFERENCES topic_memberships(release_id,node_id,locale,kind) ON DELETE RESTRICT,
 FOREIGN KEY(source_version_id,exercise_id,snapshot_id) REFERENCES source_versions(id,exercise_id,snapshot_id) ON DELETE RESTRICT);
CREATE UNIQUE INDEX topic_assignment_primary ON topic_assignments(release_id,source_version_id,locale) WHERE is_primary;
CREATE INDEX topic_assignment_subtree ON topic_assignments(release_id,node_id,locale,exercise_id,source_version_id);
CREATE TABLE environments(id uuid PRIMARY KEY,snapshot_id uuid NOT NULL REFERENCES snapshots ON DELETE RESTRICT,content_digest digest256 NOT NULL UNIQUE,UNIQUE(id,snapshot_id));
CREATE TABLE profiles(id uuid PRIMARY KEY,profile_key text NOT NULL,content_digest digest256 NOT NULL UNIQUE,UNIQUE(profile_key,content_digest));
CREATE TABLE requirement_sets(id uuid PRIMARY KEY,source_version_id uuid NOT NULL REFERENCES source_versions ON DELETE RESTRICT,content_digest digest256 NOT NULL,UNIQUE(source_version_id,content_digest),UNIQUE(id,source_version_id));
-- Eligibility completeness remains the trusted assessor/publisher's job; CHECK cannot certify external PG evidence.
CREATE TABLE assessments(id uuid PRIMARY KEY,source_version_id uuid NOT NULL,source_snapshot_id uuid NOT NULL,environment_id uuid NOT NULL,profile_id uuid NOT NULL REFERENCES profiles ON DELETE RESTRICT,requirement_set_id uuid NOT NULL,bundle_digest digest256 NOT NULL,status text NOT NULL CHECK(status IN('unverified','verified','limited','unsupported','failed','stale')),
 FOREIGN KEY(source_version_id,source_snapshot_id) REFERENCES source_versions(id,snapshot_id) ON DELETE RESTRICT,FOREIGN KEY(environment_id,source_snapshot_id) REFERENCES environments(id,snapshot_id) ON DELETE RESTRICT,FOREIGN KEY(requirement_set_id,source_version_id) REFERENCES requirement_sets(id,source_version_id) ON DELETE RESTRICT,
 UNIQUE(id,source_version_id,environment_id,profile_id,requirement_set_id,status));
CREATE TABLE activation_releases(id uuid PRIMARY KEY,scope text NOT NULL,environment_id uuid NOT NULL REFERENCES environments ON DELETE RESTRICT,profile_id uuid NOT NULL REFERENCES profiles ON DELETE RESTRICT,state text NOT NULL CHECK(state IN('draft','published','withdrawn')),UNIQUE(id,scope),UNIQUE(id,environment_id,profile_id));
CREATE TABLE activation_members(release_id uuid NOT NULL,exercise_id uuid NOT NULL,source_version_id uuid NOT NULL,source_snapshot_id uuid NOT NULL,environment_id uuid NOT NULL,profile_id uuid NOT NULL,requirement_set_id uuid NOT NULL,assessment_id uuid NOT NULL,assessment_status text NOT NULL DEFAULT 'verified' CHECK(assessment_status='verified'),
 PRIMARY KEY(release_id,exercise_id),FOREIGN KEY(source_version_id,exercise_id,source_snapshot_id) REFERENCES source_versions(id,exercise_id,snapshot_id) ON DELETE RESTRICT,
 FOREIGN KEY(release_id,environment_id,profile_id) REFERENCES activation_releases(id,environment_id,profile_id) ON DELETE RESTRICT,
 FOREIGN KEY(assessment_id,source_version_id,environment_id,profile_id,requirement_set_id,assessment_status) REFERENCES assessments(id,source_version_id,environment_id,profile_id,requirement_set_id,status) ON DELETE RESTRICT,
 UNIQUE(release_id,exercise_id,source_version_id));
CREATE TABLE deployment_heads(scope text PRIMARY KEY,release_id uuid,generation bigint NOT NULL CHECK(generation>=0),active boolean NOT NULL,CHECK(NOT active OR release_id IS NOT NULL),FOREIGN KEY(release_id,scope) REFERENCES activation_releases(id,scope) ON DELETE RESTRICT);
-- Synthetic accounts substitute for auth.users only in the isolated lab.
CREATE TABLE accounts(id uuid PRIMARY KEY);
CREATE TABLE principals(id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN('anonymous','account')),account_id uuid REFERENCES accounts ON DELETE RESTRICT,state text NOT NULL CHECK(state IN('active','disabled','deleted')),CHECK((kind='account')=(account_id IS NOT NULL)),UNIQUE(id,kind));
CREATE UNIQUE INDEX principals_account ON principals(account_id) WHERE kind='account';
CREATE TABLE account_claims(anonymous_principal_id uuid PRIMARY KEY,anonymous_kind text NOT NULL DEFAULT 'anonymous' CHECK(anonymous_kind='anonymous'),account_principal_id uuid NOT NULL,account_kind text NOT NULL DEFAULT 'account' CHECK(account_kind='account'),state text NOT NULL CHECK(state IN('active','revoked')),
 FOREIGN KEY(anonymous_principal_id,anonymous_kind) REFERENCES principals(id,kind) ON DELETE RESTRICT,FOREIGN KEY(account_principal_id,account_kind) REFERENCES principals(id,kind) ON DELETE RESTRICT);
CREATE INDEX account_claims_owner ON account_claims(account_principal_id,anonymous_principal_id) WHERE state='active';
CREATE FUNCTION reject_owner_rebind() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable ownership binding' USING ERRCODE='55000'; END $$;
CREATE TRIGGER claim_target_immutable BEFORE UPDATE OF anonymous_principal_id,account_principal_id,anonymous_kind,account_kind ON account_claims FOR EACH ROW EXECUTE FUNCTION reject_owner_rebind();
CREATE TRIGGER principal_identity_immutable BEFORE UPDATE OF kind,account_id ON principals FOR EACH ROW EXECUTE FUNCTION reject_owner_rebind();
CREATE TABLE practice_sets(id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES principals ON DELETE RESTRICT,taxonomy_release_id uuid NOT NULL REFERENCES taxonomy_releases ON DELETE RESTRICT,UNIQUE(id,owner_id));
CREATE TABLE sessions(id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES principals ON DELETE RESTRICT,exercise_id uuid NOT NULL REFERENCES exercises ON DELETE RESTRICT,binding text NOT NULL CHECK(binding IN('pinned','legacy-unbound')),source_version_id uuid,environment_id uuid,snapshot_id uuid,last_attempt_id uuid,generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((binding='pinned' AND source_version_id IS NOT NULL AND environment_id IS NOT NULL AND snapshot_id IS NOT NULL) OR (binding='legacy-unbound' AND source_version_id IS NULL AND environment_id IS NULL AND snapshot_id IS NULL)),
 FOREIGN KEY(source_version_id,exercise_id,snapshot_id) REFERENCES source_versions(id,exercise_id,snapshot_id) ON DELETE RESTRICT,FOREIGN KEY(environment_id,snapshot_id) REFERENCES environments(id,snapshot_id) ON DELETE RESTRICT,
 UNIQUE(id,owner_id),UNIQUE(id,owner_id,exercise_id),UNIQUE(id,owner_id,binding),UNIQUE(id,owner_id,exercise_id,source_version_id,environment_id));
CREATE INDEX sessions_owner_recent ON sessions(owner_id,updated_at DESC,id DESC);
CREATE TABLE practice_items(set_id uuid NOT NULL,owner_id uuid NOT NULL,position integer NOT NULL CHECK(position>0),exercise_id uuid NOT NULL,source_version_id uuid NOT NULL,snapshot_id uuid NOT NULL,environment_id uuid NOT NULL,session_id uuid,
 PRIMARY KEY(set_id,position),FOREIGN KEY(set_id,owner_id) REFERENCES practice_sets(id,owner_id) ON DELETE RESTRICT,FOREIGN KEY(source_version_id,exercise_id,snapshot_id) REFERENCES source_versions(id,exercise_id,snapshot_id) ON DELETE RESTRICT,FOREIGN KEY(environment_id,snapshot_id) REFERENCES environments(id,snapshot_id) ON DELETE RESTRICT,
 FOREIGN KEY(session_id,owner_id,exercise_id,source_version_id,environment_id) REFERENCES sessions(id,owner_id,exercise_id,source_version_id,environment_id) ON DELETE RESTRICT);
CREATE TABLE renderer_state(session_id uuid PRIMARY KEY REFERENCES sessions ON DELETE RESTRICT,seed integer NOT NULL CHECK(seed BETWEEN 1 AND 2147483647),session_token bytea,problem_token bytea,generation bigint NOT NULL CHECK(generation>=0));
CREATE TABLE submission_operations(id uuid PRIMARY KEY,session_id uuid NOT NULL,owner_id uuid NOT NULL,idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 128),request_digest digest256 NOT NULL,base_generation bigint NOT NULL CHECK(base_generation>=0),state text NOT NULL CHECK(state IN('queued','in-flight','accepted','failed-before-renderer','uncertain','blocked')),
 FOREIGN KEY(session_id,owner_id) REFERENCES sessions(id,owner_id) ON DELETE RESTRICT,UNIQUE(session_id,idempotency_key),UNIQUE(id,session_id,owner_id),UNIQUE(id,session_id,owner_id,state));
CREATE UNIQUE INDEX one_active_submission ON submission_operations(session_id) WHERE state IN('queued','in-flight','uncertain');
CREATE FUNCTION valid_pairs(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT CASE WHEN jsonb_typeof(value)<>'array' THEN false ELSE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(value) p WHERE NOT CASE WHEN jsonb_typeof(p)='array' THEN jsonb_array_length(p)=2 AND jsonb_typeof(p->0)='string' AND jsonb_typeof(p->1)='string' ELSE false END) END $$;
CREATE TABLE attempts(id uuid PRIMARY KEY,session_id uuid NOT NULL,owner_id uuid NOT NULL,binding text NOT NULL,exercise_id uuid NOT NULL,source_version_id uuid,environment_id uuid,operation_id uuid,operation_state text NOT NULL DEFAULT 'accepted' CHECK(operation_state='accepted'),ordinal bigint NOT NULL CHECK(ordinal>0),provenance text NOT NULL CHECK(provenance IN('server-pg','legacy-renderer','legacy-client')),feedback_visibility text NOT NULL CHECK(feedback_visibility IN('shown','suppressed','unknown')),score numeric CHECK(score>=0 AND score<=1),answers jsonb NOT NULL CHECK(valid_pairs(answers)),submitted_at timestamptz NOT NULL DEFAULT now(),
 CHECK(provenance<>'server-pg' OR (score IS NOT NULL AND operation_id IS NOT NULL)),CHECK((binding='pinned' AND source_version_id IS NOT NULL AND environment_id IS NOT NULL) OR (binding='legacy-unbound' AND source_version_id IS NULL AND environment_id IS NULL)),
 FOREIGN KEY(session_id,owner_id,exercise_id) REFERENCES sessions(id,owner_id,exercise_id) ON DELETE RESTRICT,FOREIGN KEY(session_id,owner_id,binding) REFERENCES sessions(id,owner_id,binding) ON DELETE RESTRICT,FOREIGN KEY(session_id,owner_id,exercise_id,source_version_id,environment_id) REFERENCES sessions(id,owner_id,exercise_id,source_version_id,environment_id) ON DELETE RESTRICT,
 FOREIGN KEY(operation_id,session_id,owner_id,operation_state) REFERENCES submission_operations(id,session_id,owner_id,state) ON DELETE RESTRICT,UNIQUE(operation_id),UNIQUE(session_id,ordinal),UNIQUE(session_id,owner_id,id));
ALTER TABLE sessions ADD FOREIGN KEY(id,owner_id,last_attempt_id) REFERENCES attempts(session_id,owner_id,id) ON DELETE RESTRICT;
CREATE INDEX attempts_owner_history ON attempts(owner_id,submitted_at DESC,id DESC);
-- UNIQUE(session_id,ordinal) supports backward per-session history scans.
CREATE INDEX attempts_visible_credit ON attempts(owner_id,exercise_id,source_version_id) WHERE provenance='server-pg' AND binding='pinned' AND feedback_visibility='shown' AND score=1;
CREATE TABLE drafts(id uuid PRIMARY KEY,session_id uuid NOT NULL,owner_id uuid NOT NULL,branch_key text NOT NULL CHECK(length(branch_key) BETWEEN 1 AND 128),revision bigint NOT NULL CHECK(revision>=0),base_attempt_id uuid,answers jsonb NOT NULL CHECK(valid_pairs(answers)),
 FOREIGN KEY(session_id,owner_id) REFERENCES sessions(id,owner_id) ON DELETE RESTRICT,FOREIGN KEY(session_id,owner_id,base_attempt_id) REFERENCES attempts(session_id,owner_id,id) ON DELETE RESTRICT,UNIQUE(session_id,branch_key));
CREATE TABLE bookmarks(owner_id uuid NOT NULL REFERENCES principals ON DELETE RESTRICT,exercise_id uuid NOT NULL REFERENCES exercises ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(owner_id,exercise_id));
CREATE TABLE search_documents(release_id uuid NOT NULL,exercise_id uuid NOT NULL,source_version_id uuid NOT NULL,locale text NOT NULL,title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),title_sort text COLLATE "C" NOT NULL,description text,reviewed_terms text NOT NULL DEFAULT '',topic_text text NOT NULL DEFAULT '',
 document tsvector GENERATED ALWAYS AS(setweight(to_tsvector('simple'::regconfig,title),'A')||setweight(to_tsvector('simple'::regconfig,reviewed_terms),'B')||setweight(to_tsvector('simple'::regconfig,topic_text),'C')||setweight(to_tsvector('simple'::regconfig,coalesce(description,'')),'D')) STORED,
 PRIMARY KEY(release_id,exercise_id,locale),FOREIGN KEY(release_id,exercise_id,source_version_id) REFERENCES activation_members(release_id,exercise_id,source_version_id) ON DELETE RESTRICT);
CREATE INDEX search_documents_browse ON search_documents(release_id,locale,title_sort,exercise_id);
CREATE INDEX search_documents_fts ON search_documents USING gin(document);
CREATE VIEW published_catalog AS SELECT d.release_id,d.exercise_id,d.locale,d.title,d.title_sort,d.description,d.document FROM search_documents d JOIN deployment_heads h ON h.release_id=d.release_id AND h.active JOIN activation_releases r ON r.id=h.release_id AND r.scope=h.scope AND r.state='published';
CREATE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable laboratory record' USING ERRCODE='55000'; END $$;
CREATE TRIGGER source_immutable BEFORE UPDATE OR DELETE ON source_versions FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER alias_immutable BEFORE UPDATE OR DELETE ON aliases FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER attempts_immutable BEFORE UPDATE OR DELETE ON attempts FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE FUNCTION assignment_primary() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE v record; n integer;p integer; BEGIN
 IF TG_OP<>'INSERT' THEN SELECT count(*),count(*) FILTER(WHERE is_primary) INTO n,p FROM topic_assignments WHERE release_id=OLD.release_id AND source_version_id=OLD.source_version_id AND locale=OLD.locale; IF n>0 AND p<>1 THEN RAISE EXCEPTION 'Exactly one primary assignment required' USING ERRCODE='23514'; END IF; END IF;
 IF TG_OP<>'DELETE' THEN SELECT count(*),count(*) FILTER(WHERE is_primary) INTO n,p FROM topic_assignments WHERE release_id=NEW.release_id AND source_version_id=NEW.source_version_id AND locale=NEW.locale; IF n>0 AND p<>1 THEN RAISE EXCEPTION 'Exactly one primary assignment required' USING ERRCODE='23514'; END IF; END IF; RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER assignment_primary_check AFTER INSERT OR UPDATE OR DELETE ON topic_assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assignment_primary();
CREATE ROLE model_lab_browser NOLOGIN;
GRANT USAGE ON SCHEMA model_lab TO model_lab_browser;
GRANT SELECT ON published_catalog TO model_lab_browser;
CREATE TABLE check_results(name text PRIMARY KEY,passed boolean NOT NULL);
CREATE FUNCTION expect_true(test_name text,result boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF result IS DISTINCT FROM true THEN RAISE EXCEPTION 'Design assertion failed: %',test_name; END IF; INSERT INTO check_results VALUES(test_name,true); END $$;
CREATE FUNCTION expect_rejection(test_name text,statement text,expected_state text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE observed text; BEGIN
 BEGIN EXECUTE statement; SET CONSTRAINTS ALL IMMEDIATE; RAISE EXCEPTION 'Expected statement rejection' USING ERRCODE='P0001'; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS observed=RETURNED_SQLSTATE; IF observed<>expected_state THEN RAISE EXCEPTION 'Unexpected rejection for %: % expected %',test_name,observed,expected_state; END IF; END;
 SET CONSTRAINTS ALL DEFERRED; INSERT INTO check_results VALUES(test_name,true); END $$;
-- Normal ownership rebinding and claim deletion cannot undo the stable-principal model.
CREATE TRIGGER claim_no_delete BEFORE DELETE ON account_claims FOR EACH ROW EXECUTE FUNCTION reject_owner_rebind();
CREATE TRIGGER session_identity_immutable BEFORE UPDATE OF id,owner_id,exercise_id,binding,source_version_id,environment_id,snapshot_id ON sessions FOR EACH ROW EXECUTE FUNCTION reject_owner_rebind();
CREATE FUNCTION protect_item_binding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.set_id,NEW.owner_id,NEW.position,NEW.exercise_id,NEW.source_version_id,NEW.environment_id,NEW.snapshot_id) IS DISTINCT FROM (OLD.set_id,OLD.owner_id,OLD.position,OLD.exercise_id,OLD.source_version_id,OLD.environment_id,OLD.snapshot_id) OR (OLD.session_id IS NOT NULL AND NEW.session_id IS DISTINCT FROM OLD.session_id) THEN RAISE EXCEPTION 'Practice item binding is immutable' USING ERRCODE='55000'; END IF; RETURN NEW; END $$;
CREATE TRIGGER item_binding_immutable BEFORE UPDATE ON practice_items FOR EACH ROW EXECUTE FUNCTION protect_item_binding();
ALTER TABLE attempts ADD CONSTRAINT new_pg_requires_pinned_source CHECK(provenance<>'server-pg' OR binding='pinned');
