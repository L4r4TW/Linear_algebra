# 100 playable differential-calculus exercises

The user authorized implementation of the eight-stage plan, with documentation and pushes at each milestone. Target: 100 distinct single-variable differential-calculus exercises available through the student frontend. Verification seeds do not count as different exercises.

| Milestone | Deliverable | State |
| --- | --- | --- |
| 1 | Read-only baseline and blockers | Complete |
| 2 | Diverse 200-300-source candidate pool with identities/attribution | Next |
| 3 | Clean reproducible renderer context; preserved existing sessions | Pending |
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
