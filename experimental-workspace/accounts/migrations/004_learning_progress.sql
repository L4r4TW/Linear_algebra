-- Additive local Auth storage only; completion is a fully correct, visible PG result.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS attempt_owner_key ON practice_runtime.attempts(id,principal_id);
CREATE TABLE IF NOT EXISTS practice_runtime.learning_receipts(
 attempt_id uuid PRIMARY KEY,principal_id uuid NOT NULL,
 FOREIGN KEY(attempt_id,principal_id) REFERENCES practice_runtime.attempts(id,principal_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS practice_runtime.learning_credits(
 principal_id uuid NOT NULL,exercise_key text NOT NULL,attempt_id uuid NOT NULL,
 collection_key text NOT NULL CHECK(collection_key IN('calculus','algebra','trigonometry','statistics')),
 chapter_key text NOT NULL,definition text NOT NULL DEFAULT 'study-goals-v1' CHECK(definition='study-goals-v1'),
 earned_at timestamptz NOT NULL,PRIMARY KEY(principal_id,exercise_key),
 FOREIGN KEY(attempt_id,principal_id) REFERENCES practice_runtime.attempts(id,principal_id) ON DELETE RESTRICT
);
DO $$ DECLARE name text;BEGIN
 FOREACH name IN ARRAY ARRAY['learning_receipts','learning_credits'] LOOP
 EXECUTE format('ALTER TABLE practice_runtime.%I ENABLE ROW LEVEL SECURITY',name);
 EXECUTE format('ALTER TABLE practice_runtime.%I FORCE ROW LEVEL SECURITY',name);
 EXECUTE format('DROP POLICY IF EXISTS learning_owner ON practice_runtime.%I',name);
 EXECUTE format('CREATE POLICY learning_owner ON practice_runtime.%I TO practice_backend USING(practice_runtime.owns_principal(principal_id)) WITH CHECK(practice_runtime.owns_principal(principal_id))',name);
 EXECUTE format('REVOKE ALL ON practice_runtime.%I FROM PUBLIC,anon,authenticated',name);
 EXECUTE format('GRANT SELECT,INSERT ON practice_runtime.%I TO practice_backend',name);
 EXECUTE format('REVOKE UPDATE,DELETE ON practice_runtime.%I FROM practice_backend',name);
 END LOOP;
END $$;
ALTER TABLE practice_runtime.sets ADD COLUMN IF NOT EXISTS order_strategy text NOT NULL DEFAULT 'exercise-id-ascending'
 CHECK(order_strategy IN('exercise-id-ascending','random-without-replacement'));
INSERT INTO practice_runtime.migrations(version) VALUES('004-learning-progress') ON CONFLICT DO NOTHING;
COMMIT;
