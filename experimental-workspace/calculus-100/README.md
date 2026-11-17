# Differential-calculus expansion: current handoff

## Superseding checkpoint: 100 calculus exercises are playable

The focused collection pipeline in ../practice-400/README.md has reached 100 differential-calculus collection members. Open http://localhost:3105/?subject=Differential+calculus. The earlier fixed-ten pilot and hundred-candidate review hold below are historical. Remaining algebra/trigonometry/statistics collections are processing; do not claim all 400 are complete.

The user-authorized tested-practice route uses actual current complete technical evidence and source screening, not fabricated independent mathematics/human reviews. Existing private renderer, source/ownership gates, student reports and saved work remain intact.

## Current: sixteen playable entries and student reports

The user explicitly authorized tested local practice without moderator/human approval. **Ten calculus exercises are now active alongside the original six**, at [the calculus collection](http://localhost:3105/?subject=Calculus+-+single+variable). The initial scope is local-pilot.json. Cards and the practice shell identify tested pilots; the shell offers Report a problem. Read [LOCAL_PILOT_POLICY.md](LOCAL_PILOT_POLICY.md) and [the report guide](../accounts/PROBLEM_REPORTS.md).

We did not retry the rejected four-review mutation or manufacture independent approvals. Migration 25 provides a separate revocable pilot authority requiring exact current passing source/job/attempt evidence, both seeds/viewports, all nine checks, fresh health and clean certified renderer provenance. The existing standard independently reviewed publication gate is unchanged. The backend requires explicit LOCAL_TESTED_PILOT=true and a loopback application origin, and validates the live renderer attestation. Standard database publication counts still exclude this pilot; the backend live list drives student discovery/start.

The known two source defects and nineteen topic-scope exclusions stay disabled. The remaining sixty-nine sources still need source analysis; the historical hundred-candidate transport proof is not an approval for those sources. The user no longer requires moderator approval for local tested practice. Continue toward one hundred with concrete source checks, replacement candidates, technical verification and student-report handling.

### Reproduce local activation

Keep all existing Docker volumes. These commands apply only to the existing local development databases/context:

```powershell
Get-Content -Raw supabase/migrations/202611160025_local_tested_pilot.sql | docker exec -i linear-algebra-opl-catalog-database-1 psql -U postgres -d opl_catalog -v ON_ERROR_STOP=1
docker build -f experimental-workspace/calculus-100/Controller.Dockerfile -t linear-algebra-calculus-pilot-tools .
docker run --rm --network linear-algebra-opl-catalog_catalog -e PGHOST=linear-algebra-opl-catalog-database-1 -e PGUSER=postgres -e PGDATABASE=opl_catalog linear-algebra-calculus-pilot-tools calculus/activate-local-pilot.mjs --activate
docker compose -f experimental-workspace/accounts/compose.yaml build migrate
docker compose -f experimental-workspace/accounts/compose.yaml run --rm --no-deps migrate
docker compose -f experimental-workspace/accounts/compose.yaml -f experimental-workspace/calculus-100/player.override.yaml --profile practice up --build -d --no-deps --wait backend
docker compose -f experimental-workspace/discovery/compose.yaml up --build -d --wait home
```

Activation checks the independent forty-case proof and the actual current technical results before inserting ten explicit user-authorized grants. It creates no independent review records, normal assessment approvals or normal publication release. It can be repeated without duplicate grants. Original 3100/root apps and all stored sessions remain intact.


Verified checkpoint: [twenty live pilot cases](pilot-acceptance/20261117T193002484Z-96e7764c/manifest.json) plus 32 pilot/provider/gateway contracts; [eight account acceptance groups](../accounts/acceptance/20261117T193001486Z-46dcaaa5/manifest.json); eighteen discovery contracts, one actual read-only catalog test and twelve home/chooser browser checks; and 134 fresh/legacy-upgrade migration assertions all passed. The original six-entry catalog smoke check also passed. Earlier interrupted/stale-assumption runs were not accepted as proof.

### Current acceptance

Run these with stable services; do not rebuild/restart home/backend while live browser checks are in progress:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/calculus-100/verify-local-pilot.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/accounts/verify-accounts.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/discovery/verify.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/migration-tests/verify-migrations.ps1
```

The live pilot suite covers twenty actual random-seed desktop/mobile sessions from home selection through independent student-question solutions, PG grading, draft refresh and checked restoration. It also verifies report failure/retry, ownership and preserved unfinished answers. Its immutable source-bound manifests are under pilot-acceptance/. Account acceptance retains the separate eight-suite private Auth/RLS/PG proof. Discovery has eighteen contracts, the real read-only catalog check and twelve home/chooser browser cases. Fresh/legacy-upgrade migration acceptance passes 134 assertions including migration 25. The original runtime fingerprint remains unchanged; no PG frame/control code was changed.

Earlier prototype-only, review-hold and activation-blocked descriptions below are historical.

## Historical pre-policy review findings and activation block

The user has now requested review and activation, revoking the earlier hold. **No new exercises have been activated.** Automatic approval review rejected recording four accepted reviews per exercise under an automated actor, on the grounds that this would substitute for the required genuine independent sign-offs. Do not retry that mutation indirectly or lower the gate. Obtain explicit approval of the proposed agent-assisted local-pilot review policy, or genuine operator sign-offs.

The concrete proposal is [local-pilot.json](local-pilot.json): ten source-reviewed exercises with friendly title proposals. [independent-pilot.json](independent-pilot.json) contains 40 passing actual PG/browser cases using answers derived only from student-visible questions, not instructor answer maps. Full source formulas and parameter domains were independently checked. This is review evidence, not accepted database review records.

[review-findings.json](review-findings.json) records two genuine source defects: an implicit-differentiation tangency point outside its curve, and fixed graphs inconsistent with a randomized function. It also identifies 19 of the original 100 whose chapters are outside this differential-calculus set. Sixty-nine other candidates remain without a completed source review. Historical 400-case evidence proves transport, not mathematical or subject correctness.

The classifier now requires a differential-calculus chapter before applying section keywords, so integration/trigonometric-substitution and Taylor-series sections cannot silently fill derivative-rule quotas. Do not treat the historical 100-source readiness snapshot as 100 source-reviewed differential-calculus exercises.

The proposed local pilot excludes all identified defects and out-of-scope entries. Its review scope is local noncommercial use, source/DOM/keyboard review and emulated mobile. Physical-device and screen-reader listening are not claimed. Original problem sources are unchanged. A visible /sources page links the pinned OPL license notice and CC BY-NC-SA 3.0 terms; catalog cards retain declared author/institution credits.

The friendly display file is metadata only: version/revision/hash must match, and it cannot authorize admission. All real approvals and publication remain zero; live practice stays at six.

---


The technical set contains **100 distinct, source-classified candidates**, with all eight topic quotas met and **400 passing PG/browser cases** (two seeds and two viewports per exercise). They remain **pending independent review**, as explicitly requested by the user. No real reviews or database publications were created. Students still have the existing six exercises at http://localhost:3105.

| Milestone | State |
| --- | --- |
| 1. Baseline and blockers | Complete; [baseline.json](baseline.json) |
| 2. Candidate pool | Complete; 300 candidates, including reserves |
| 3. Strict clean renderer | Complete locally; production dependency/OS work remains |
| 4. Approved catalog-to-player adapter | Implemented, tested and connected; no imported activation |
| 5. Bounded technical verification | Complete: 100 selected sources, 400 passing cases |
| 6. Independent reviews | Review tools/materials ready; reviews pending by user instruction |
| 7. Controlled 10/25/50/100 rollout | Read-only wave plans ready; every wave blocked on reviews |
| 8. Final acceptance | Isolated preactivation acceptance passed; live 100-exercise acceptance awaits reviews/publication |

## Evidence

- [technical-status.json](technical-status.json): current source/job bindings, every retained latest result, topic quotas and metadata exclusions. Failed checks remain failures; nothing was waived.
- [review-pack.json](review-pack.json): 100 selected identities, pinned source links, attribution, capabilities, unresolved requirements, scope warnings and proposed release membership. Review reasons/answer maps are not copied into this report.
- [preactivation.json](preactivation.json): validates all 400 selected cases and actual private-to-public metadata projections; an isolated browser checks all 100 entries over nine pages, section filtering, URL restoration, keyboard use and mobile layout. Backend admission in this test is synthetic: it does not approve or activate sources, contact PG or create student sessions.
- [legacy-browser-acceptance.json](legacy-browser-acceptance.json): 24 passing cases for the existing six entries on the clean renderer.
- [renderer-acceptance.json](renderer-acceptance.json): six fresh legacy-renderer checked sessions restored on the candidate, preserving seed, score and field contract.
- [operator-acceptance.json](operator-acceptance.json), [seed 1234](review-preview-1234.json), [seed 4321](review-preview-4321.json): authenticated operator controls, mandatory review acknowledgement, mobile layout, namespaced ownership and actual fixed seeds. No approval/publication actions were performed.

The pool was chosen after verifying 6,255 eligible pinned Git blobs. Metadata readiness is separate from a PG technical pass: ambiguous classifications remain excluded from the selected set, with their evidence retained. Source classifications and proposed course topics are not independent mathematical or curated taxonomy approval.

The quotas are 10 limits/continuity, 10 derivative definition/differentiability, 15 basic rules, 20 chain/transcendental derivatives, 10 implicit/logarithmic differentiation, 10 higher derivatives/tangents/linear approximation, 15 curve analysis and 10 optimization/related rates.

## Resume safely

From the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/calculus-100/resume.ps1
```

This validates existing measured image IDs, verifier context and clean pinned OPL volume, then starts existing containers. It does not rebuild images, replace the context, approve or activate anything. The quota controller exits successfully when its work is complete; its report persists in the calculus reports volume.

Ordinary setup.ps1 delegates to resume when context.json exists. Only use setup.ps1 -NewContext when intentionally rebuilding and reverifying. A new measured context stales old proof without deleting its history. Never rewrite fingerprint values to regain eligibility. The fresh build requires the retained legacy Perl/OS base image guarded by setup.ps1.

Keep the existing OPL, session, account, catalog and report volumes. Never use down --volumes as cleanup. No PG source is copied into Google Drive.

## Reproduce checks

```powershell
docker compose -f experimental-workspace/calculus-100/compose.yaml config --quiet
docker run --rm --workdir /qa/calculus linear-algebra-calculus-review --test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/calculus-100/verify-preactivation.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/calculus-100/verify-player.ps1
```

The pure calculus suite has 18 checks. The player probe generates a fresh isolated Auth/database and backend-scoped secrets, uses a guarded disposable catalog with synthetic approvals, and tests real private PG start/grading/restoration, ownership and section sets. It never mounts real account secrets/student volumes into the multi-network probe. An earlier proposal to do so was rejected by automatic approval review and replaced by this isolated runner.

The account provider also has explicit tests for publication, withdrawal, stale/missing authority, renderer mismatch, path identity and legacy aliases. SQL projection/grant tests run in disposable databases only. CI runs provider and calculus contracts alongside the existing evidence/server/discovery checks.

## Services and integration boundary

The 3105 account backend uses the clean private renderer and published-catalog provider through [player.override.yaml](player.override.yaml). Recreate it with both accounts/compose.yaml and this override. Original 3100 remains an independent anonymous prototype on its old renderer; the root Next.js application is unchanged.

The private catalog_backend.player_catalog() RPC returns current, published, reviewed, strict-eligible sources. Browser roles cannot call it. Paths, seeds, settings and tokens remain server-controlled. Imported session/set bindings retain source version and approval context. Withdrawals retain student records. Publication history also governs legacy aliases: neither an old ID nor a catalog outage may bypass withdrawal. Catalog-enabled practice requires available catalog authority.

Discovery accepts imported UUIDs only from the backend's live list. It retains chapter/section/attribution and uses twelve-entry, filter/generation-bound pages. Identical source bytes at different paths are not interchangeable. Public lists suppress duplicate legacy/UUID cards for the same source; old owned session identities are retained.

Local additive migrations 20-24 provide the private projection, bounded discovery queries, the source-version lookup index and persistent legacy publication authority. No hosted migration or production authorization is claimed. The local trusted Docker database role needs separate credential/grant review before deployment.

## Review and rollout hold

Operator: http://localhost:3102. Fixed-seed previews: http://localhost:3103 and http://localhost:3104. Apply [operator.override.yaml](operator.override.yaml) alongside verification-pipeline/compose.yaml to use this renderer/context. Preview lists cover up to 500 current jobs and lookup does not hide older jobs behind the original 100-item cutoff. Operator keys remain in their private volume; see the pipeline guide for retrieval.

Four genuine, attempt-bound reviews remain mandatory: requirements/dependencies, independent mathematics/content, interaction/accessibility and local deployment/rights. PG instructor calibration is transport/evaluator evidence, not independent mathematical proof. Source/parent-directory rights, ambiguous scope, meaningful titles and unautomated checks need review.

**Keep all candidates pending.** The wave report performs no approval, preparation or publication. After the user resumes rollout and reviews are complete, use the existing strict operator publication workflow, inspect exact membership/generation, and activate 10, 25, 50, then 100. Each manifest replaces the database scope; preserve earlier members intentionally. Run real live selection/grading/restoration/ownership acceptance after each batch, and retain withdrawal/rollback options.

The clean candidate uses pristine pinned renderer/PG sources and npm ci, verifying both original lock hashes and the unchanged full tracked-PG check. It still inherits Ubuntu 20/legacy Perl and reports seven high/two moderate npm findings per asset tree. Production release, actual screen-reader listening, physical-device review, independent mathematics and rights approval remain incomplete.
