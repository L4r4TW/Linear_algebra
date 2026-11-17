-- New local Auth database only. Reports never modify sessions or grading state.
BEGIN;
CREATE TABLE IF NOT EXISTS practice_runtime.problem_reports(
 id uuid PRIMARY KEY,
 session_id uuid NOT NULL,principal_id uuid NOT NULL,exercise_id text NOT NULL,
 category text NOT NULL CHECK(category IN('question','grading','display','accessibility','other')),
 encrypted_report text NOT NULL CHECK(length(encrypted_report)<16384),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(session_id,principal_id) REFERENCES practice_runtime.sessions(id,principal_id) ON DELETE RESTRICT
);
ALTER TABLE practice_runtime.problem_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_runtime.problem_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_owner ON practice_runtime.problem_reports;
CREATE POLICY report_owner ON practice_runtime.problem_reports TO practice_backend USING(practice_runtime.owns_principal(principal_id)) WITH CHECK(practice_runtime.owns_principal(principal_id));
REVOKE ALL ON practice_runtime.problem_reports FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON practice_runtime.problem_reports TO practice_backend;
REVOKE UPDATE,DELETE ON practice_runtime.problem_reports FROM practice_backend;
INSERT INTO practice_runtime.migrations(version) VALUES('003-problem-reports') ON CONFLICT DO NOTHING;
COMMIT;
