# Release, monitoring and recovery runbook

The local practice platform is usable. Production release is blocked until measured prerequisites and real reviews pass. These procedures do not activate imported exercises or replace pipeline approval.

## Reproduce acceptance

Run the original server tests, accounts/verify-accounts.ps1, discovery/verify.ps1, deployment/verify-backup.ps1 and deployment/verify-replicas.ps1. The replica check uses two actual backend containers and proves one immutable attempt for concurrent duplicate checks. Full PG verification follows verify-compatibility.ps1; its failed/limited fixtures remain explicit. Source or profile changes require matching newly generated evidence, never edited fingerprints.

The GitHub workflow experimental-platform.yml builds a digest-pinned Linux check image and runs current evidence, server, cryptography/admission and discovery contracts. It uses a pinned official checkout commit with read-only permissions and no persisted Git credential. It does not claim that a hosted runner has the OPL volume, real Auth or manual approval. Local integration checks remain mandatory.

The workspace and fixture catalog use LF consistently so Windows and Linux compute identical runtime/fixture fingerprints. Earlier mixed-ending reports remain historical. The superseded partial LF run was stopped when fixture canonicalization was included; only the subsequent complete canonical report can be published.

## Measure release readiness

Run deployment/preflight.ps1. It writes a new sanitized readiness report, checks actual service health/ports, secret access, strict renderer attestation, source-bound account evidence, restore proof, actual replica proof and release override syntax. Run it with -RequireRelease to fail the command when any blocker remains. It never deploys, weakens certification or creates a review.

release-review.example.json is deliberately unapproved. Actual physical-device, screen-reader listening, off-host recovery, HTTPS/ingress, verified-email/recovery, representative-load and rights/content reviews require real people and evidence. Do not invent reviewer entries. Catalog mathematical/interaction/deployment reviews still use the protected verification pipeline.

renderer.release.yaml removes renderer/editor and prototype host ports, keeps execution on an internal network, and sets resource limits. accounts.release.yaml connects the backend to that private execution network and uses an explicit HTTPS origin. home.release.yaml keeps the home loopback-only behind an operator-configured TLS proxy. These are configuration templates, not a deployed production environment. Current email signup expects the local auto-confirm flow; disabling auto-confirm alone does not implement the missing confirmation/recovery UI. Do not apply the templates as a substitute for completing/testing that flow.

## Dependency remediation

review-dependencies.ps1 records an actual npm audit of both renderer asset trees, including dev/build dependencies that may ship browser assets. The current review reports nine findings per tree (seven high and two moderate); it does not measure exploitability or audit OS/Perl dependencies. No automatic fix was installed in the running renderer.

The pinned Dockerfile uses Ubuntu 20.04, Node 16.20.2 and npm install. PG tracked cleanliness is false. Resolve this in a reviewed pinned renderer/PG source and build update: supported base/runtime, reviewed lockfiles, deterministic installation and a new measured context. Do not restore generated lockfiles after installation to manufacture cleanliness. Keep strict checks unchanged. Prove old-session restoration and rerun all integration/compatibility checks before migration; independent reviews are still needed. The existing operator contexts do not automatically certify the new account-backed deployment.

## Monitor

Use Docker health for database/Auth/backend and privately read backend /internal/status for readiness and aggregate active/waiting/rejection/timeout counts. The public gateway must reject /internal/status. Alert on unhealthy dependencies, sustained full queues, rising rejection/error counts and uncertain submissions. Treat per-process counters as reset on restart; do not infer user progress from them. HTTP and actual session-operation admission are independently four active/eight waiting, with a three-second queue wait and bounded rate windows. The operation lease survives an active client disconnect until work completes; a queued disconnect cancels before renderer invocation. Set an ingress-wide budget before adding replicas; these limits do not establish production capacity.

Keep backups and the independent recovery key in separate protected locations. The implemented backup/restore test keeps them in different Docker volumes, verifies authentication before restore, rejects live hostnames/nonempty targets and compares every table count. Configure off-host retention and separate key escrow before public use. Do not put private dumps or keys in Drive/Git or application logs.

## Roll back an application release

Before replacing a service, record its tested image ID, exact Git/source/evidence bindings and schema migration level. Retain the image locally or in an approved immutable registry. Back up accounts and catalog and test recovery first.

If deployment fails, pin the previous compatible ACCOUNT backend and home images in small Compose overrides, then use up --no-build --no-deps -d --wait for those services. Keep their database and secret volume bindings unchanged. Check health, owned restoration, a single explicit grade, draft conflicts and the active catalog through the public home. A rollback is a fresh reviewed deployment, not permission to waive evidence.

Never point the home back to the anonymous 3100 prototype as an account rollback. Never rotate keys, down --volumes, undo additive migrations, delete attempts/sessions or restore a dump over live databases to make a release work. If the previous app cannot read the current schema, retain maintenance/read-only access and perform a forward fix or restore into NEW isolated volumes/databases, validate them and plan an explicit controlled cutover. Preserve the original volumes for investigation. Existing JSON/SQLite prototype records remain read-only migration sources and need their own backup coverage before decommissioning.

## Controlled exercise rollout

Use the existing protected queue/review/publication/withdrawal workflow. New or changed sources stay unverified; catalog inclusion is independent of practice eligibility. Require exact source/runtime/profile evidence and real independent reviews. Roll out small passing batches, observe failures and withdraw eligibility without deleting student records. The current six-exercise prototype batch is not approval for all 77,134 indexed sources.
