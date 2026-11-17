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
