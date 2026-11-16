-- Test-only Auth/role fixture. Not part of any migration and not a JWT verifier.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;END IF;END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
CREATE SCHEMA migration_test;
CREATE TABLE migration_test.applied(name text PRIMARY KEY,sha256 text NOT NULL);
CREATE TABLE migration_test.results(name text PRIMARY KEY,passed boolean NOT NULL);
CREATE TABLE migration_test.legacy_fingerprints(name text PRIMARY KEY,digest text NOT NULL);
CREATE FUNCTION migration_test.ok(label text,result boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF result IS DISTINCT FROM true THEN RAISE EXCEPTION 'Migration check failed: %',label;END IF;INSERT INTO migration_test.results VALUES(label,true);END $$;
CREATE FUNCTION migration_test.reject(label text,statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE observed text;BEGIN BEGIN EXECUTE statement;RAISE EXCEPTION 'Statement was accepted' USING ERRCODE='P0001';EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS observed=RETURNED_SQLSTATE;IF observed<>expected THEN RAISE EXCEPTION 'Unexpected SQLSTATE for %: % expected %',label,observed,expected;END IF;END;INSERT INTO migration_test.results VALUES(label,true);END $$;
CREATE FUNCTION migration_test.actor_ok(label text,actor uuid,statement text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE result boolean;BEGIN
 BEGIN EXECUTE 'SET LOCAL ROLE authenticated';PERFORM set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);EXECUTE statement INTO result;EXECUTE 'RESET ROLE';IF result IS DISTINCT FROM true THEN RAISE EXCEPTION 'Actor assertion failed';END IF;
 EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE';RAISE EXCEPTION 'Actor check failed: % [%]',label,SQLSTATE;END;
 INSERT INTO migration_test.results VALUES(label,true);END $$;
