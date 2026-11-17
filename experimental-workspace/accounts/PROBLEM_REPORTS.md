# Student problem reports

Report a problem appears beneath the exercise in the account-backed practice shell at localhost:3105. It supports question/mathematics, grading, display, accessibility and other issues. Students describe the issue in 10–2000 characters. The current exercise and drafts stay in place, including after a failed send. Sending disables report edits to prevent losing newer text. A successful acknowledgement means durable storage, not a promise that an issue has already been fixed.

POST /api/sessions/:id/reports accepts only requestId (UUID), category and message. The server resolves the actual anonymous/account cookie, checks origin and ownership, and binds the record to the saved exercise/source and checked-submission identity. Browser-supplied paths, seeds, owners, scores or source identities are rejected. Retries use the same report UUID; successful retries do not duplicate records. The database caps an owner at five new reports per hour, with an additional bounded HTTP rate guard. No report triggers grading, approval, withdrawal or session replacement.

Migration 003_problem_reports.sql applies only to the independent local Supabase Auth database. Forced RLS and owner-consistent foreign keys protect immutable report rows. Message and source context are encrypted with identity-bound AES-GCM; reports do not automatically copy answers or renderer tokens. Guest work transferred explicitly into an account retains ownership through its original principal. No public report-list endpoint exists.

## Operator access

The local database operator can inspect aggregate counts without decrypting messages:

```powershell
docker exec linear-algebra-accounts-database-1 psql -U postgres -d accounts -c "SELECT category,count(*) FROM practice_runtime.problem_reports GROUP BY category;"
```

To inspect recent submitted reports, use the existing trusted private database/backend pair. The following prints private report text and source context for the operator; never paste its output into Git, public logs or acceptance reports:

```powershell
docker exec linear-algebra-accounts-database-1 psql -U postgres -d accounts -Atc "SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM(SELECT id,exercise_id,category,created_at,encrypted_report FROM practice_runtime.problem_reports ORDER BY created_at DESC LIMIT 100)r" | docker exec -i linear-algebra-accounts-backend-1 node reports-export.mjs
```

Synthetic acceptance reports clearly identify themselves as test reports. There is no notification service or report triage dashboard yet. Reports are user observations, not mathematical certification. Investigate reproducibly, withdraw a defective pilot grant if necessary, and retain student sessions/history. The current local-pilot withdrawal and complete disable commands are documented in ../calculus-100/LOCAL_PILOT_POLICY.md.

## Verification

accounts/verify-accounts.ps1 covers actual owned HTTP/RLS storage, anonymous-to-account continuity, idempotent reporting and origin/ownership rejection alongside the existing account suites. calculus-100/verify-local-pilot.ps1 checks real desktop/mobile reporting, failed sends, explicit retry and unchanged draft restoration. Reports contain sanitized flags only. Manual screen-reader listening and physical mobile review remain unperformed.
