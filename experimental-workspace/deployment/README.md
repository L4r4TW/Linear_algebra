# Deployment preparation and operator checks

The public local home uses the account backend. No production release is approved. The original 3100/3101 ports are development-only loopback endpoints, never production ingress.

## Implemented request admission

The account backend accepts at most four session/account requests at once, queues eight for at most three seconds and caps connections at 128. Queue expiration/disconnect never invokes the session service. The per-process API window is 600 requests/minute, each verified principal 240/minute, authentication 120/minute overall and ten attempts per normalized email per five minutes. Rate-key storage is bounded at 2,048 entries; active windows cannot be evicted to bypass limits. These are initial local rollout limits, not measured production capacity or a cluster-wide limiter. Do not increase replica count without budgeting total execution capacity and an ingress-wide limit.

Database submission claims remain the authority across processes; admission does not replace them. Busy/rate errors preserve saved work and allow an explicit retry. /internal/status returns readiness and aggregate admission counts only. The public gateway does not proxy that path. Monitor it privately and alert on nonready, sustained queue pressure, rejected requests, database errors and uncertain submissions. No credentials, answers or owner keys belong in metrics/logs.

Five cryptography/admission tests and all seven account acceptance suites pass in accounts/acceptance/20261117T084832212Z-4b161089. The live private backend reports four active/eight waiting capacity. Generic PG runtime/evidence is unchanged (9375b5c5...), and only the existing six exercises are enabled.

## Encrypted backups and isolated restore

Run from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/deployment/verify-backup.ps1
```

This creates actual account and catalog snapshots, encrypts them with AES-256-GCM, authenticates them before restore, then restores each into a separate fresh disposable PostgreSQL database. Exported snapshots bind the recorded table counts and pg_dump to the same database view. Cluster role/privilege SQL and the account application secrets are encrypted in the manifest; authentication/renderer tokens, raw rows, credential hashes and key bytes never enter the repository. Restores run transactionally, preserve roles/grants and compare every restored table count. Account acceptance also decrypts a stored session with the recovered application key, checks ten forced-RLS tables and confirms attempt-update permission remains denied.

Only sanitized reports are copied to deployment/acceptance/<run>. Actual encrypted backups stay in linear-algebra-experimental_backups; the independent recovery key stays in linear-algebra-experimental_backup_keys. Both survive normal container replacement. Never delete either volume to repair startup. The original account, catalog, OPL and student volumes are never removed or restored over. The restore command rejects real service hostnames and requires an empty disposable target. Existing JSON/SQLite prototype files remain intact; this account/catalog backup does not claim to snapshot those legacy files or importer checkpoint volumes.

Successful current restore proof: acceptance/20261117T085218501Z-1686effb/manifest.json. This is a local recovery test, not offsite disaster recovery. Before public release, configure encrypted off-host backup retention, store the recovery key separately, include legacy/importer/operator files as required, and perform a recovery drill outside this Docker host. No external upload or storage service is configured or claimed.

## Remaining release blockers

- The pinned renderer uses Node 16.20.2, Ubuntu 20.04 and npm install in both public and PG asset trees. Its build mutates a tracked PG lockfile. The existing strict provenance certification remains false. No generated-file exception, source reset or fabricated certification is allowed. An upstream dependency/build remediation must produce a new measured context and complete compatibility evidence.
- Local Auth auto-confirms email. Production needs a chosen HTTPS origin, real mail/verification/recovery configuration and a reviewed account policy.
- Finish least-privilege secret mounts, private renderer deployment configuration, automated release checks and rollback procedures.
- Actual screen-reader listening, physical-device review, representative load/capacity testing, independent mathematical/interaction/deployment reviews and off-host recovery remain unperformed. Automated checks do not attest to them.
- Indexed coverage remains 77,134; only the six explicitly enabled exercises are playable. Keep failures/limitations and withdrawal history. Do not activate imported batches through a flag or catalog count.
