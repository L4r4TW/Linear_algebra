# Local account environment (task 12)

The user explicitly selected a new local Supabase development environment. This minimal stack runs the official Supabase Auth (GoTrue) server and a separate PostgreSQL database with its own private volumes/network. It does not mount, migrate or replace the existing app, catalog, OPL or student-session volumes. Studio, Storage and Realtime are unnecessary for this phase and are not installed.

The Auth version/digest comes from the [official Supabase Docker configuration](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml); the deployment approach follows [Supabase self-hosting](https://supabase.com/docs/guides/self-hosting/docker). Container images are pinned by digest. Five random secrets are generated inside a Docker volume, retained across restarts and not written to Google Drive, Git, logs or command arguments.

This initial stack exposes no host ports. Email/password signup is enabled with LOCAL-ONLY automatic email confirmation; this does not verify real-world email ownership and is not a production policy. No account UI, saved-work transfer or progress is claimed at this checkpoint. Backend/session integration follows after actual Auth verification. Actual credentials and tokens must remain private.

Start from the repository root with docker compose -f experimental-workspace/accounts/compose.yaml up --build -d --wait. Never use down --volumes to repair an error. Back up database and secret volumes together before changing keys; losing those keys breaks encrypted records and Auth sessions.

## Verified 12.1 environment

The actual Auth probe passes nine checks: health, signup, password login, /user identity validation, forged JWT rejection (403 on this pinned version), wrong-password rejection, refresh, logout and rejection of the logged-out refresh token. Random test credentials remain in process memory; only sanitized flags/hashes are saved. Local synthetic test accounts remain in the new isolated Auth database, never in the original application.

Repeat with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/accounts/verify-auth.ps1
```

This verifies actual GoTrue authority, unlike the earlier SQL-only Auth fixtures. It does not yet establish ownership for practicing: account-to-guest claim, encrypted backend Auth sessions, private saved history/progress and cross-device drafts are still pending 12.2–12.4. No browser receives an Auth JWT from this probe.

## 12.2 private storage primitives (not UI integration yet)

The new local Auth database now has an additive practice_runtime bridge schema with ten forced-RLS student/credential tables. The non-superuser practice_backend role cannot create roles/databases, bypass RLS or expose base tables to anon/authenticated browser roles. Owner-consistent composite foreign keys protect sessions, set items, attempts and drafts. It is separate from the pre-existing catalog/practice schemas; the existing application and 77,134-source database were not migrated or reset.

db.mjs binds verified server identity/guest proof to a transaction on one pooled client, with bounded waits/timeouts and sanitized errors. crypto.mjs encrypts private records with AES-256-GCM and identity-bound associated data; opaque credentials are hashed. Auth tokens, renderer tokens and answer data must never be returned from these storage primitives. The backend account HTTP authority is still to be connected; callers may not supply arbitrary trusted account IDs from browser JSON.

Actual /user-validated Supabase accounts were used to prove cross-account/missing-actor denial, encrypted round trip, cross-owner parent-link rejection, wrong guest-proof rejection, explicit claim and retired anonymous authority. Two separate encryption tests cover tampering, record swapping and stable private account-owner derivation.

Run verify-storage.ps1 after starting the Auth stack. The report database-observations.json contains booleans/counts/hashes only. Synthetic accounts/rows are created only in this new local development database and are not production students. Account UI, real saved-work import, history/progress, drafts and multi-process submission coordination remain pending; these tests do not claim those integrations are complete.

## Verified server-side Auth session adapter (12.2, still private)

auth.mjs now resolves identity through the actual GoTrue /user endpoint, stores access/refresh tokens encrypted in the forced-RLS database, and gives the browser an unrelated random opaque session value. Account-owner authority is derived privately and is stable across devices; it is never a browser JWT or a caller-selected account ID. Unknown/duplicate cookies fail closed, claimed guest credentials cannot become anonymous authorities again, and BFF logout revokes its opaque session immediately.

The actual bff-probe.mjs check passes two separate sign-ins for one account, stable cross-device identity, distinct opaque sessions, encrypted token storage, random/duplicate-cookie rejection, claimed-guest rejection and immediate BFF logout. The pinned upstream logout currently uses global refresh-session scope; no claim is made that all unexpired access JWTs are revoked immediately. The public account controller/UI and saved-work adapters are still pending and must explicitly define logout scope.

The Auth/crypto/database files are server-only. Never serialize the internal actor or owner token into an HTTP response. Only a narrow public account DTO may be exposed. Real guest-work transfer, private session/attempt persistence, remote drafts and progress still require application integration.

## Task 12.2 adapter checkpoint (candidate, not live routing)

The account backend now has encrypted session/attempt storage, PostgreSQL practice sets, revision-checked account drafts, bookmarks, explicit guest claims and a narrow HTTP BFF. Run accounts/verify-adapters.ps1 from the repository root to reproduce three actual-database suites with real local Supabase identities and a controlled renderer double. These are adapter checks, not live PG/browser acceptance. Reports include source hashes and sanitized flags only.

Accepted attempts, updated renderer tokens and operation state commit together. Independent database connections cannot grade the same session concurrently; accepted idempotency keys require reloading the saved result. A check sent to PG without a confirmed database commit becomes uncertain and blocks another check. Pre-renderer validation failures permit an explicit retry. Account drafts retain exact ordered pairs, use a server-derived field contract and compare both revision and last checked attempt. They never silently overwrite another tab's newer draft.

HTTP account routes live under /api/sessions/account/ so the existing path-scoped guest cookie can prove an explicit transfer. Signing in alone does not claim guest work. Only the verified server actor reaches the existing ownership API; public responses exclude actor credentials and Auth/renderer tokens. The original prototype and new account project remain separate at this checkpoint. Local 3100 is still a development prototype, not an account-secured public endpoint.

The live home remains on the previously verified 20fb runtime and six exercises. Generic session hooks change the candidate fingerprint: the checked-in old evidence intentionally fails closed until the full compatibility runner and publisher generate matching evidence. A direct pre-publication server test run therefore failed catalog-dependent cases; no gate was waived. Public account UI, read-only legacy migration acceptance, account continuation and live PG/browser acceptance remain to be connected. Milestone 13 remains pending.
