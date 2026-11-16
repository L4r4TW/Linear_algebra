-- Isolated local catalog only. Never apply to hosted Supabase.
DO $$ BEGIN IF current_database()<>'opl_catalog' THEN RAISE EXCEPTION 'Local catalog database required';END IF;
IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;END IF;END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE SCHEMA IF NOT EXISTS importer_admin;
CREATE TABLE IF NOT EXISTS importer_admin.migrations(name text PRIMARY KEY,sha256 text NOT NULL);
