# Differential-calculus expansion: current handoff

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
