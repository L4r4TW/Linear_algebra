-- Source-bound queue/dashboard reads must not rescan the whole OPL observation per job.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='2s';
CREATE INDEX import_entry_source_version ON catalog.import_entries(source_version_id,run_id) WHERE source_version_id IS NOT NULL;
COMMIT;
