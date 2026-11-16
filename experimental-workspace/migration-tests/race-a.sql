\set ON_ERROR_STOP on
SET application_name='migration_cas_a';
SET statement_timeout='25s';
BEGIN;
SELECT migration_test.ok('Concurrent draft writer A creates one revision',practice_private.save_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','cccccccc-cccc-4ccc-8ccc-ccccccccccc1','migration-race',0,migration_test.ref('attempt'),'[]')=1);
\! touch /tmp/migration_cas_a_ready
DO $$ DECLARE deadline timestamptz:=clock_timestamp()+interval '20 seconds';BEGIN WHILE pg_stat_file('/tmp/migration_cas_release',true) IS NULL LOOP IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'CAS release timed out';END IF;PERFORM pg_sleep(0.05);END LOOP;END $$;
COMMIT;
\! touch /tmp/migration_cas_a_done