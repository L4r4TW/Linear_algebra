# Four focused practice collections

## Completed local delivery (2026-11-18)

All four collections now have 100 distinct playable entries each. final-status.json records complete=true, exact source/job/attempt bindings and every chapter quota. observations/20261118T093004006Z/manifest.json verifies all400 identities against the actual student API and home counters. The final two statistics additions also passed four actual desktop/mobile selection, grading, draft, restoration, ownership and keyboard cases. Earlier 24-case live acceptance remains sampled; each admitted entry independently retains the full technical gate. No independent mathematical or physical-device/screen-reader certification is claimed.

The student experience now has subject cards with private completion percentages and ordered chapter pages; see ../LEARNING_UX.md. Completion is a fixed learning goal, distinct from catalog availability. Older processing statements below are historical.

### Replenish exhausted reserves

extend-pool.mjs appends screened, pinned-hash-checked, deduplicated candidates without resetting existing candidates, ranks, grants or failed evidence. It excludes current unsuccessful jobs and retains the normal admission gate. Stop the controller before extending; it loads its pool at startup. Only one pool writer may run. The file replacement is atomic and detects a changed input pool. This does not change chapter targets or create reviews.

```powershell
docker compose -f experimental-workspace/practice-400/compose.yaml stop controller
docker compose -f experimental-workspace/practice-400/compose.yaml build tools
docker compose -f experimental-workspace/practice-400/compose.yaml run --rm --no-deps tools collections/extend-pool.mjs statistics descriptive 30
docker compose -f experimental-workspace/practice-400/compose.yaml up -d controller health
```

The delivered extension appended30 descriptive-statistics reserves to the existing1200, preserving the pool and completing the last two missing entries. Ordinary restart must not run preparation/extension again. Do not remove volumes. The stopped completed controller needs no work; retain the separate health observer to keep availability fail-closed against actual renderer health.

Goal: 100 distinct playable sources each in differential calculus, algebra, trigonometry and statistics. Topic quotas are in collections.json. Seeds do not count as extra exercises. The root app, original 3100 player and all student data stay intact.

## Implemented

- 1,200 reserve candidates (300 per collection) in linear-algebra-collections_reports. prepare.mjs verifies pinned Git blob hashes from the existing read-only Linux OPL volume, screens incomplete/large/unsupported sources, excludes known defects and deduplicates comment-insensitive content.
- Current full technical passes are reused. New sources run through the unchanged measured two-worker queue: nine required checks, two seeds, desktop and mobile. Failures remain recorded; reserves replace them.
- Explicit user-authorized local tested-practice grants, with no fabricated independent reviews or mathematical certifications. Source screening is not proof of mathematical correctness. Standard independently reviewed publication remains unchanged.
- Calculus-first scheduling, then algebra, trigonometry and statistics. Existing grants remain stable; explicit withdrawals cannot reactivate. Exhausted topics do not stop independent later collections.
- Backend supports 400 exercises (bounded at 1,000 imported entries). Exact source/job/attempt/context, live health, clean provenance and renderer attestation remain required. Migration 26 retains legacy-alias and superseded-pilot withdrawal authority.
- Four visible home collection counters, friendly topic labels and existing search/chooser/practice sets. Zero-ready collections have no practice link. Account-shell catalog scrolling prevents hundreds of items pushing the question down; PG frame code is unchanged.

## Current delivery

Differential calculus reached 100 playable exercises. Remaining collections are processing; consult the live counters at http://localhost:3105 and /api/discovery/overview. This is not completion of all 400.

Counts refer only to admitted collection members, excluding unassigned legacy exercises and indexed-only sources. Report a problem uses the existing encrypted owner-bound store; see ../accounts/PROBLEM_REPORTS.md. No public/commercial deployment or manual screen-reader/physical-device approval is implied.

## Resume and inspect

The existing measured calculus renderer and two workers must be healthy. Do not rebuild their images or replace the context to resume.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/calculus-100/resume.ps1 -NoController
docker compose -f experimental-workspace/practice-400/compose.yaml build tools
docker compose -f experimental-workspace/practice-400/compose.yaml up -d controller health
docker compose -f experimental-workspace/practice-400/compose.yaml logs --tail 3 controller
```

The existing candidate pool and status persist in the dedicated reports volume. Run tools collections/prepare.mjs only to prepare a fresh pool deliberately, not on ordinary resume. Never remove volumes. No Docker socket, account secrets, student volume or host source mount enters the controller.

Migration 26 is applied and tracked in importer_admin.migrations alongside the prior pilot migration 25. Fresh databases use the normal ordered importer migrations. Backend startup uses accounts/compose.yaml plus calculus-100/player.override.yaml; home uses discovery/compose.yaml.

Withdraw a source by setting catalog_backend.collection_grants.active=false in the private local catalog. Retain the row. Reports do not automatically withdraw an exercise; investigate and withdraw individually. Known defects remain excluded.

## Verification

Three collection contract tests and fourteen provider contracts (including a 400-entry snapshot) pass. Transactional guard-checks.sql verifies withdrawal cannot fall back to old pilot grants, wrong source-screen hashes fail closed, and private grants are not browser-readable. Fresh/legacy-upgrade migrations pass 134 assertions. Discovery passes nineteen contracts, the actual read-only database test and twelve home/chooser browser cases.

accounts/collections.browser.mjs checks actual selection, random-seed grading, applicable text drafts, checked restoration, foreign ownership, keyboard and narrow shell on desktop/mobile. Set COLLECTION_ALL=true for all currently admitted sources, or COLLECTION_EXERCISE for a focused source. Instructor calibration maps remain only in private verifier memory; these tests do not constitute independent mathematics review.

Historical fixed-ten pilot acceptance is not the command for the expanded catalog. Retain real failures; never waive technical checks, invent reviews or overwrite fingerprints.

## Remaining work

Finish the other three 100-entry collections, replace exhausted pools if needed, complete final live acceptance over stable membership, document and push milestone snapshots. The background controller is active work, not a claim that 400 are already available.

An independent health service observes the actual private renderer attestation every fifteen seconds, so long verification jobs cannot expire otherwise healthy catalog availability. It retains the existing fail-closed health check; it never forces a matching result. Start it alongside the controller with `docker compose -f experimental-workspace/practice-400/compose.yaml up -d controller health`.

Expanded live acceptance: observations/20261117T220255447Z/manifest.json records 24 passing actual desktop/mobile cases. Account acceptance: ../accounts/acceptance/20261117T220009642Z-d5fb2cea/manifest.json records eight private Auth/RLS/PG groups. The earlier interrupted run was not accepted. These are sampled live checks; every admitted source separately requires its complete four-case technical evidence.
