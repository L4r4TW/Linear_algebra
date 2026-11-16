\set ON_ERROR_STOP on
SET application_name='migration_cas_b';
SET statement_timeout='25s';
SELECT migration_test.reject('Concurrent stale draft writer B cannot overwrite revision',$q$SELECT practice_private.save_draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','cccccccc-cccc-4ccc-8ccc-ccccccccccc1','migration-race',0,migration_test.ref('attempt'),'[]')$q$,'40001');
\! touch /tmp/migration_cas_b_done