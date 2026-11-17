BEGIN;
REVOKE UPDATE,DELETE,TRUNCATE ON practice_runtime.attempts FROM practice_backend;
INSERT INTO practice_runtime.migrations(version) VALUES('002-immutable-attempts') ON CONFLICT DO NOTHING;
COMMIT;
