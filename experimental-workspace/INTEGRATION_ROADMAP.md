# Integration roadmap: milestones 9–13

Authorized 2026-11-17: continue autonomously from task 9 through these milestones. Document/test/push each completed feature checkpoint. Keep existing applications and data intact. Preserve durable checkpoints here and in PROJECT_CONTEXT.md on interruption; never mark unfinished or blocked deliverables complete.

## 9. Subject → chapter → section chooser

- 9.1: bounded dependent-column API over live playable metadata and indexed classifications; explicit missing/uneven metadata and separate counts.
- 9.2: Category_chooser.png desktop layout, stacked mobile navigation, selections/breadcrumb/counts in URLs/history, keyboard and screen-reader semantics.
- 9.3: Practice creates a defined, bounded server-selected plan from the live allowlist; no indexed-source activation. Record its order and first session; durable navigation follows in 11.
- 9.4: actual catalog, stale selection, failure, keyboard, mobile and plan-start acceptance.

## 10. Planned practice screen

- 10.1: establish a dedicated versioned practice shell matching Exercise.png, without rewriting PG answer structures.
- 10.2: breadcrumbs/title/bookmark, readable question, prominent Check answer, authored available Hint, useful field/overall feedback.
- 10.3: retain drafts/recovery/accessibility/mobile behavior; expose protected Previous/Skip/Choose another when the real set model exists.
- 10.4: reverify affected runtime/capabilities before enabling that runtime. Never copy old fingerprints or waive failures.

## 11. Practice sets and navigation

- 11.1: durable owner-bound sets with bounded explicit order and immutable membership.
- 11.2: lazy session creation and retained per-item session IDs, same seed on revisit, concurrency/idempotency.
- 11.3: define Previous, Skip and resume; skipped items remain revisit-able, position is not correctness/mastery.
- 11.4: refresh/back/forward, withdrawn entries, uncertain starts and unfinished-work protection.

## 12. Accounts, saved work and progress

- 12.1: inspect available Supabase environment without disclosing credentials; implement/verify auth/session authority.
- 12.2: explicit anonymous-to-account claim with ownership consistency, protected sessions/drafts/sets/bookmarks/PG attempts.
- 12.3: private backend renderer state, conflict-aware cross-device/tab drafts, reliable submissions and multi-process concurrency.
- 12.4: My progress from real verified attempts/recent activity, partial credit and repeats/skips, explicit stable denominators; no invented mastery.
- Hosted changes require real configuration and migration inspection; synthetic actors/JWT fixtures are not production proof.

## 13. Deployment and controlled rollout

- 13.1: private renderer/backend allowlist, server-controlled parameters, upstream dependency review and execution isolation.
- 13.2: bounded requests/queues, monitoring, backups and tested restoration/rollback.
- 13.3: automated build/migration/regression/evidence validation and explicit release criteria.
- 13.4: actual screen-reader/physical-device review, reviewed batch rollout and withdrawal.
- Manual attestations and missing external access stay explicit; never invent approvals, tests or deployment success.

## Availability and constraints

The local six-exercise player remains usable. The 77,134-source imported catalog currently has no database-ready practice batch. The strict PG provenance gate remains uncertified and independent reviews are outstanding. Milestones 9–13 do not authorize weakening those gates. The earlier 100-exercise idea is a proposed availability target, not a measured promise; report actual playable counts.

## Checkpoint log

- Start: 8.4 pushed as 0d0f616; existing services healthy. Only the saved practice-design note in PROJECT_CONTEXT.md was uncommitted, and it is preserved.
- 9.1 implemented: bounded dependent chooser API and live-allowlist plans. Validation: thirteen unit/server groups plus actual indexed/practice API probes. Next: 9.2 desktop/mobile chooser and 9.3 tab-local plan launch.

- 9.2–9.3 implemented and focused browser-verified. Next: 9.4 combined regression/report, then task 10 practice shell.

- 9.4 complete: 13 unit/server + 1 real database + 12 browser checks and existing live catalog pass. /browse is ready. Next: 10.1–10.2 practice-shell candidate, isolated verification before deployment.

- 10.1–10.2 candidate source implemented; NOT deployed. Full isolated 44-case proof is running in linear-algebra-practice-shell-gate. Preserve old live player until publisher/server/browser checks pass; see PRACTICE_SHELL.md.

- 11.1 standalone persistence groundwork implemented/tested while task-10 proof runs. No HTTP/UI integration yet; see PRACTICE_SETS.md.

- 11.2–11.3 candidate integrated: owned APIs + chooser + real position/guarded navigation. Focused three-exercise PG check passes. Combined full gate/browser verification still running; do not redeploy host source before proof. Task 12 environment preference: new local Supabase (explicit user answer).

- 12.1 user-selected local Supabase Auth/Postgres environment healthy; nine actual Auth checks pass. Separate private volumes only. Backend account/saved-work integration remains pending.

- Tasks 10 and 11.4 complete/deployed: runtime 20fb8629d71be21f0886a47ae17a5ac21d4a5c0f8c0d2df7622dc6eb259e63ad, 182 server + 62 browser + 12 home/chooser checks, actual set and shell reviews. Full operator matrix 43/44 retains seed-4321 mobile GraphTool keyboard failure and all limitations. Same six exercises enabled. Next: 12.2 backend account storage/claim; 12.1 real local Auth foundation already verified. Task 13 release/manual checks remain pending.

- 12.2 private storage primitives verified against actual Supabase users (10 forced-RLS tables, encrypted records, explicit claim/retirement). Backend/Auth-session/student-data adapters and UI still pending.

- Private BFF Auth adapter real-probed; HTTP/UI and actual student-data persistence still pending. Preserve the deployed 10–11 platform while preparing account adapters.

- 12.2 candidate: real database record/set/draft/bookmark/progress/claim and HTTP adapters verified through accounts/verify-adapters.ps1. Live home unchanged; fresh generic-hook full gate is running in linear-algebra-accounts-hook-gate. Public account UI, legacy migration acceptance and release work remain.

- 12 connected: local account/progress UI, remote draft conflicts, bookmarks, cross-device continuation and explicit guest transfer are live through 3105. Current runtime 9375b5c5, full PG 44/44 with 16 limitations, same six active. Seven fresh account suites pass; final original-browser/discovery rechecks and feature push are in progress. Task 13 follows; production/manual review remains pending.


- 12 complete locally: original 62 browser checks and discovery 15 server/1 DB/12 browser plus catalog check all pass. Account and progress routes are live. Seven account suites and 44/44 PG proof retain stated limits. Next: 13 deployment admission, backup/recovery, isolation/CI/release gates; no production release or new imported activation.

- 13 local preparation implemented and verified: scoped secrets, bounded admission/metrics, encrypted account/catalog recovery, actual replica grading, LF-stable evidence, pinned CI contracts, parsed private release templates, dependency audit and enforcing preflight/runbook. Current canonical runtime 3707165b; full gate 42/44 retains both mobile GraphTool failures and 16 limits, same 6 active. Production remains BLOCKED by strict provenance/dependencies, production Auth/TLS, off-host recovery and real manual/load/rights reviews. See deployment/RUNBOOK.md. No production deployment or imported activation.
