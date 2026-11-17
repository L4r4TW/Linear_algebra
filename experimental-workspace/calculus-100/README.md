# 100 playable differential-calculus exercises

The user authorized implementation of the eight-stage plan, with documentation and pushes at each milestone. Target: 100 distinct single-variable differential-calculus exercises available through the student frontend. Verification seeds do not count as different exercises.

| Milestone | Deliverable | State |
| --- | --- | --- |
| 1 | Read-only baseline and blockers | Complete |
| 2 | Diverse 200-300-source candidate pool with identities/attribution | Complete |
| 3 | Clean pinned renderer context; six legacy-token restoration checks | Complete |
| 4 | Approved database-to-player adapter | Pending |
| 5 | Bounded verification: at least 400 seed/viewport cases | Pending |
| 6 | Independent content/requirements/interaction/deployment review | Pending |
| 7 | Explicit activation at 10,25,50,100 | Pending |
| 8 | Live acceptance for all 100 | Pending |

## Baseline

baseline.json is measured against the current database and live /api/exercises. Six exercises are playable, three are differential-calculus fixtures. The source catalog has 77,134 indexed sources, including 11,457 single-variable-calculus sources across all chapters. Relevant differentiation, application and limit sections contain thousands of possible candidates. No database exercise is currently practice-ready.

The current queued context remains uncertified because its installed PG tree differs at a generated lockfile. The strict check will remain intact. The student session service authorizes the JSON prototype catalog, and discovery filters to known prototype IDs, so a published database batch needs a real backend/discovery adapter. Four independent attempt-bound review categories remain mandatory. Calibration is not independent mathematical review; no review is fabricated by this project.

## Course quotas

The contract defines 10 limits/continuity,10 definition/differentiability,15 basic rules,20 chain/transcendental,10 implicit/logarithmic,10 higher/tangent/linear,15 curve analysis and10 optimization/related-rates exercises. Proposed classifications and titles remain candidates until reviewed. Preserve source identities and exact hashes; deduplicate content without merging existing catalog identities.

## Isolation and continuation

Tool images copy only code/metadata. PG sources stay in the read-only Linux OPL volume. No student/secret volume is mounted into selection or compatibility workers. Keep the existing applications and accounts intact. Candidate/failed/awaiting-review material does not receive a student start action. Current source snapshots and past verification evidence are preserved.

Build the tool image from the repository root with docker build -f experimental-workspace/calculus-100/Dockerfile -t linear-algebra-calculus-tools . It runs on the catalog network with PGHOST=linear-algebra-opl-catalog-database-1, PGUSER=postgres, PGDATABASE=opl_catalog. Baseline additionally needs the practice network for the public allowlist GET. Only baseline.json is copied from its artifacts to the repository; raw PG never is.

## Milestone 2 acceptance

candidates.json records 300 source-verified, content-deduplicated candidates: 100 primary choices plus 200 reserves, satisfying all eight quotas without a shortfall. Selection checked 6,255 eligible Git blobs against their database SHA-256 and pinned revision. Every record retains UUID/source-version identity, original classification, authors/institutions, source description, capability manifest and unresolved review flags. Unknown rights/language/difficulty stay unknown. Seven contract/selection tests passed. These are candidates, not 300 playable exercises.

Reproduce selection by copying the baseline container's /artifacts/source-metadata.json into /input/source-metadata.json of a fresh tools container with the read-only OPL volume at /opl, then running node calculus/candidates.mjs. No PG is copied out; only /artifacts/candidates.json is retained. This heuristic does not certify source dependency closure, mathematical equivalence, titles or licensing.

## Milestone 3: private clean renderer

The candidate renderer installs pristine pinned renderer/PG sources before npm ci, verifies both original lock hashes, and passes the unchanged pgTrackedClean check. Node 22 comes from a digest-pinned image. context.json records the measured image IDs and certified context; renderer-acceptance.json records successful restoration of six fresh legacy-renderer sessions, preserving their seed, checked score and answer contract. No student record was read. Existing student applications still use their previous renderer.

The build deliberately retains the known Perl/Ubuntu 20 toolchain base (image ID guarded in setup.ps1). This is a local compatibility fix, not a production OS/dependency remediation: npm still reports 7 high and 2 moderate findings per dependency tree. The inherited attester's buildExceptions list describes its historical lock exclusions; this candidate additionally checks both exact lock hashes and the full tracked PG tree. No exception to strict PG provenance was introduced.

From the repository root run powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/calculus-100/setup.ps1. It builds isolated services, pauses only the old operator worker, registers measured context, enqueues the primary 100 and starts two resource-bounded workers. Context replacement stales prior operator evidence; it never removes it or activates candidates. The old operator dashboard targets the old renderer and must not publish this candidate context. Rebuilding worker code may require a new context and rerun; always retain exact evidence rather than copying fingerprints.

At this milestone, the certified context is ready and the 100-source technical batch is running. This is not completion of milestone 5, independent review or activation.
