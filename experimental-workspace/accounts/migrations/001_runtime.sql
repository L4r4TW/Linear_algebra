-- Private runtime bridge for the NEW local Supabase Auth project only.
-- Never run this as an upgrade/reset of the existing application or OPL catalog database.
BEGIN;
CREATE SCHEMA IF NOT EXISTS practice_runtime;
REVOKE ALL ON SCHEMA practice_runtime FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS practice_runtime.migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS practice_runtime.principals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kind text NOT NULL CHECK(kind IN('anonymous','account','claimed')),
 credential_digest text NOT NULL UNIQUE CHECK(credential_digest~'^[a-f0-9]{64}$'),account_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),CHECK((kind='anonymous' AND account_id IS NULL) OR(kind<>'anonymous' AND account_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_primary_account_principal ON practice_runtime.principals(account_id) WHERE kind='account';
CREATE TABLE IF NOT EXISTS practice_runtime.auth_sessions(
 id_digest text PRIMARY KEY CHECK(id_digest~'^[a-f0-9]{64}$'),account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 encrypted_tokens text NOT NULL CHECK(length(encrypted_tokens)<65536),expires_at timestamptz NOT NULL,revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS practice_runtime.sessions(
 id uuid PRIMARY KEY,principal_id uuid NOT NULL REFERENCES practice_runtime.principals(id) ON DELETE RESTRICT,
 generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0),encrypted_record text NOT NULL CHECK(length(encrypted_record)<2097152),
 contract jsonb,contract_generation bigint,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,principal_id)
);
CREATE TABLE IF NOT EXISTS practice_runtime.attempts(
 id uuid PRIMARY KEY,session_id uuid NOT NULL,principal_id uuid NOT NULL,ordinal bigint NOT NULL CHECK(ordinal>0),
 encrypted_attempt text NOT NULL CHECK(length(encrypted_attempt)<2097152),content_digest text NOT NULL CHECK(content_digest~'^[a-f0-9]{64}$'),
 submitted_at timestamptz NOT NULL,FOREIGN KEY(session_id,principal_id) REFERENCES practice_runtime.sessions(id,principal_id) ON DELETE RESTRICT,
 UNIQUE(session_id,ordinal)
);
CREATE TABLE IF NOT EXISTS practice_runtime.operations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL,principal_id uuid NOT NULL,request_key uuid NOT NULL,
 request_digest text NOT NULL CHECK(request_digest~'^[a-f0-9]{64}$'),base_generation bigint NOT NULL CHECK(base_generation>=0),
 state text NOT NULL CHECK(state IN('in-flight','accepted','failed-before-renderer','uncertain')),lease_until timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(session_id,principal_id) REFERENCES practice_runtime.sessions(id,principal_id) ON DELETE RESTRICT,UNIQUE(session_id,request_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_operation ON practice_runtime.operations(session_id) WHERE state IN('in-flight','uncertain');
CREATE TABLE IF NOT EXISTS practice_runtime.sets(
 id uuid PRIMARY KEY,principal_id uuid NOT NULL REFERENCES practice_runtime.principals(id) ON DELETE RESTRICT,
 request_key uuid NOT NULL,request_digest text NOT NULL CHECK(request_digest~'^[a-f0-9]{64}$'),revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 title text NOT NULL CHECK(length(title)<=200),selection jsonb NOT NULL,position integer NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 19),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(principal_id,request_key),UNIQUE(id,principal_id)
);
CREATE TABLE IF NOT EXISTS practice_runtime.set_items(
 set_id uuid NOT NULL,principal_id uuid NOT NULL,position integer NOT NULL CHECK(position BETWEEN 0 AND 19),
 exercise_id text NOT NULL CHECK(length(exercise_id) BETWEEN 1 AND 128),title text NOT NULL CHECK(length(title)<=300),
 source jsonb NOT NULL,session_id uuid,state text NOT NULL DEFAULT 'not-started' CHECK(state IN('not-started','opening','ready','uncertain')),
 skipped boolean NOT NULL DEFAULT false,claim uuid,lease_until timestamptz,encrypted_plan text,
 PRIMARY KEY(set_id,position),FOREIGN KEY(set_id,principal_id) REFERENCES practice_runtime.sets(id,principal_id) ON DELETE RESTRICT,
 FOREIGN KEY(session_id,principal_id) REFERENCES practice_runtime.sessions(id,principal_id) ON DELETE RESTRICT,
 CHECK((state='ready')=(session_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS practice_runtime.drafts(
 session_id uuid NOT NULL,principal_id uuid NOT NULL,branch text NOT NULL CHECK(length(branch) BETWEEN 1 AND 80),
 revision bigint NOT NULL CHECK(revision>=0),base_attempt_id uuid,encrypted_draft text NOT NULL CHECK(length(encrypted_draft)<131072),
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(session_id,branch),
 FOREIGN KEY(session_id,principal_id) REFERENCES practice_runtime.sessions(id,principal_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS practice_runtime.bookmarks(
 principal_id uuid NOT NULL REFERENCES practice_runtime.principals(id) ON DELETE RESTRICT,
 exercise_id text NOT NULL CHECK(length(exercise_id) BETWEEN 1 AND 128),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(principal_id,exercise_id)
);
CREATE TABLE IF NOT EXISTS practice_runtime.continuations(
 principal_id uuid PRIMARY KEY REFERENCES practice_runtime.principals(id) ON DELETE RESTRICT,session_id uuid NOT NULL,set_id uuid,item integer,
 updated_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(session_id,principal_id) REFERENCES practice_runtime.sessions(id,principal_id) ON DELETE RESTRICT,
 FOREIGN KEY(set_id,principal_id) REFERENCES practice_runtime.sets(id,principal_id) ON DELETE RESTRICT,CHECK(item IS NULL OR item BETWEEN 0 AND 19)
);
CREATE INDEX IF NOT EXISTS runtime_sessions_owner_recent ON practice_runtime.sessions(principal_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS runtime_attempt_history ON practice_runtime.attempts(principal_id,submitted_at DESC,id);
CREATE OR REPLACE FUNCTION practice_runtime.owns_principal(principal uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM practice_runtime.principals p WHERE p.id=principal)
$$;
ALTER TABLE practice_runtime.principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_runtime.principals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS principal_owner ON practice_runtime.principals;
CREATE POLICY principal_owner ON practice_runtime.principals TO practice_backend USING(
 (account_id IS NOT NULL AND account_id=nullif(current_setting('practice.account_id',true),'')::uuid) OR
 (account_id IS NULL AND credential_digest=nullif(current_setting('practice.guest_digest',true),''))
) WITH CHECK(
 (account_id IS NOT NULL AND account_id=nullif(current_setting('practice.account_id',true),'')::uuid) OR
 (account_id IS NULL AND kind='anonymous' AND credential_digest=nullif(current_setting('practice.guest_digest',true),''))
);
ALTER TABLE practice_runtime.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_runtime.auth_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opaque_auth_session ON practice_runtime.auth_sessions;
CREATE POLICY opaque_auth_session ON practice_runtime.auth_sessions TO practice_backend USING(
 (id_digest=nullif(current_setting('practice.auth_digest',true),'') AND revoked_at IS NULL) OR
 account_id=nullif(current_setting('practice.account_id',true),'')::uuid
) WITH CHECK(account_id=nullif(current_setting('practice.account_id',true),'')::uuid);
DO $$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['sessions','attempts','operations','sets','set_items','drafts','bookmarks','continuations'] LOOP
  EXECUTE format('ALTER TABLE practice_runtime.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE practice_runtime.%I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('DROP POLICY IF EXISTS runtime_owner ON practice_runtime.%I',name);
  EXECUTE format('CREATE POLICY runtime_owner ON practice_runtime.%I TO practice_backend USING(practice_runtime.owns_principal(principal_id)) WITH CHECK(practice_runtime.owns_principal(principal_id))',name);
 END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA practice_runtime FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA practice_runtime FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA practice_runtime TO practice_backend;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA practice_runtime TO practice_backend;
GRANT DELETE ON practice_runtime.bookmarks TO practice_backend;
REVOKE ALL ON practice_runtime.migrations FROM practice_backend;
GRANT EXECUTE ON FUNCTION practice_runtime.owns_principal(uuid) TO practice_backend;
INSERT INTO practice_runtime.migrations(version) VALUES('001-runtime-bridge') ON CONFLICT DO NOTHING;
COMMIT;
