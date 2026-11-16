# Repeatable OPL importer
6.1 checkpoint: isolated local database and server-only SQL adapter. No existing application, student/session volume, or hosted Supabase is used.
From the repository root:
```powershell
docker compose -f experimental-workspace/opl-importer/compose.yaml build importer
docker compose -f experimental-workspace/opl-importer/compose.yaml up -d --wait database
docker compose -f experimental-workspace/opl-importer/compose.yaml run --rm --entrypoint node importer setup-local.mjs
docker compose -f experimental-workspace/opl-importer/compose.yaml run --rm importer doctor
docker compose -f experimental-workspace/opl-importer/compose.yaml run --rm --entrypoint node importer --test db.test.mjs
```
The separate internal Docker network publishes no ports. Its local development database uses trust authentication only on that network. Do not attach untrusted services or deploy this platform fixture publicly. The database persists in linear-algebra-opl-catalog_catalog; avoid down --volumes. OPL mounts read-only; no PG files are copied to the host. The setup records transactional migration checksums and rejects drift. It does not reset existing public tables or import real Auth/session records.
6.2–6.7 add inventory, metadata, reconciliation, checkpoints, search publication and full-library verification.

## 6.2 inventory checkpoint

Run the importer inventory command (optional exact revision argument). It verifies HEAD, reads tracked regular PG blobs through Git's batch object reader, checks object hashes, and records SHA-256/source paths with a deterministic manifest. No dirty working-tree or untracked source is imported, symlinks are excluded, and read/object failures abort without a complete manifest. State stays in the separate Docker state volume. Pinned scan: 77,134 sources (40,541 OpenProblemLibrary / 29,624 Contrib / 6,969 Pending), zero PG symlinks. Synthetic tests cover dirty/untracked files, repeatability, symlinks and wrong pins. These are indexed-source counts, not playable exercises.

## 6.3 metadata checkpoint

Run metadata to extract line-local comment declarations without executing Perl/PG. It preserves raw declarations and source line numbers, normalizes Unicode/whitespace/case against both pinned taxonomy files, and flags missing/partial/conflicting/malformed/unmapped data. Source or generated titles remain labeled; textbook authors/titles remain bibliographic. Description text is bounded/plain. Language, calibrated difficulty and duration remain unknown. Full pinned results: 38,740 matched, 4,495 missing, 5,936 partial, 81 conflicting, 101 malformed and 27,781 unmapped classifications. Both vocabulary files parse without malformed lines. This parser intentionally flags nonstandard/multiline syntax instead of interpreting Perl.

## 6.4 identity checkpoint

Migration 202611160006 adds backend-only staged observations, per-repository heads/leases and bounded identity reconciliation. Exact existing snapshot/path bindings retain bootstrap UUIDs; changed and unchanged paths preserve identity but receive source observations for each new snapshot. Identical simultaneous copies get separate IDs. Possible renames against vanished baseline paths and absent-path reappearances stay identity-review candidates without automatic merges. Raw classification history is retained. Publication/removal decisions require the complete-run workflow added in 6.5. Transactional tests cover all these cases and roll back synthetic records.

## 6.5 durable workflow checkpoint

Migration 202611160007 adds transactional open/stage/seal/complete primitives. A durable per-repository lease prevents competing imports; the same manifest/parser request resumes committed batches. Publication compares the baseline generation and requires complete scope coverage with no staged entries. Only then are removals recorded and the current source head moved. Existing versions/events remain intact. Full replay returns the stored report without new identities, events or generation changes. Invalid batches roll back as a unit. Concurrent workers may need to retry after a seal/conflict; no automatic lease stealing or PG execution occurs.

Run importer metadata, then importer import. Optional --batch=500 controls bounded transactions; --stop-after-batches=N provides a deliberate recovery checkpoint. Repeating import resumes automatically. The seven current Node tests run in an independently created disposable database via verify.ps1, removed in finally; they cover interruption, lease conflicts, atomic rollback, changed/removed files and identity review.
