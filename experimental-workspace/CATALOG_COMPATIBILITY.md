# Catalog compatibility and activation contract

This is the eligibility contract for the future full-OPL importer. It currently governs only the localhost experimental workspace, independently of the root Next.js/Supabase app. [compatibility/CATALOG_STATUS.md](compatibility/CATALOG_STATUS.md) is the current per-entry decision record.

## Indexed does not mean playable

`workspace/server/exercise-catalog.json` contains indexed metadata, including disabled candidates. Each entry keeps a stable ID, friendly subject/topic/title, exact PG path, repository/revision/SHA-256, declared authors/institution, source URL and attribution/license evidence. Empty author lists retain their original meaning; they are not permission to invent an author.

Every entry declares `compatibility.status` and `compatibility.requiredCapabilities`. New imports use `initialCompatibility(requirements)` from `catalog-compatibility.mjs`: status `unverified`, activation `disabled`, no batch. Missing/unknown capabilities cannot confer approval. Detecting a macro or matching an already supported capability is candidate discovery, not verification of a new file.

| Status | Meaning | Playable? |
| --- | --- | --- |
| unverified | Missing or incomplete required evidence | No |
| verified | All required checks pass with no observed limitations | Only with an active batch |
| limited | Required checks pass, but an observed layout/interaction limit remains | No |
| unsupported | A required capability or observed behavior is unsupported by this profile | No |
| failed | A required check or grading assertion fails | No |
| stale | Source, capabilities, runtime, renderer, library or profile differs from evidence | No |

The stored status is a reviewable claim; the server recomputes eligibility. A mismatch fails closed. Failures are not erased by enabling a flag, and a known limitation never waives a failed check. Unsupported takes classification precedence over failed; the evidence still retains both.

## Required evidence

`compatibility-profile.json` pins the renderer and OPL revisions, reviewed capability vocabulary, seeds 1234/4321, desktop/touch-mobile, and nine checks: rendering, interaction, answer capture, grading, retries, refresh, ownership, keyboard and mobile layout. These are local automated compatibility requirements, not public-deployment certification. Screen-reader listening and physical-device review remain manual release checks.

Each file needs exactly one complete case for every required seed/viewport combination. All checks and source-hash verification must pass, correct grading must reach 1, clearing answers must grade 0, and no observed limitation may remain. Per-file proof is required even when another file uses identical capabilities. Fixture seeds never control ordinary sessions, which still generate and preserve a random seed.

`catalog-compatibility-evidence.json` stores sanitized cases, scores, check outcomes and failure/limitation details. It binds them to the exact source identity and capability requirements. `runtimeFingerprint()` hashes the reviewed app/server/frontend sources, asset loader, dependency lock and compatibility profile. Changed runtime bytes (including line-ending changes) invalidate evidence at the next process start. Source/configuration is immutable inside the image; rebuild after edits. Catalog data and activation choices are excluded from the runtime hash so withdrawing a batch does not require retesting unchanged runtime code.

The operator report also fingerprints the exact fixture manifest. The publisher rejects focused/partial reports and mismatched runtime, manifest, profile or pinned revisions. Complete reports may contain failures for other files: their individual evidence is retained and they remain disabled; unrelated verified entries can progress.

The runtime trusts the deployment's pinned renderer build and source volume. It does not query Git revisions on every request. An importer/deployment must verify actual installed source hashes against the pinned manifest, invalidate evidence when renderer/PG/assets change, and never mislabel a changed renderer or volume with old revision metadata.

## Batch activation and rollback

`activation-batches.json` records explicit IDs, profile version, and active/inactive state. An entry needs `activation.state: enabled` and a matching active batch; batch membership alone is insufficient. Unknown IDs, stale proof, status mismatch, unsupported requirements, limits, incomplete cases and failed grading cannot be authorized by a batch.

The first local batch includes the vector exercise, numeric/formula derivatives, statistics radio groups, algebra checkboxes and generated-graph derivative question. Matrix-grid, static GIF, dropdown, scaffold and GraphTool candidates remain indexed with their failure details. In particular, a generated graph image is different from an interactive GraphTool widget.

`listExercises()` and `getExerciseById()` share the same rule. Public APIs expose only friendly approved summaries. Disabled IDs cannot start, restore or grade through the normal lookup. Session records remain intact with their original seed/token/submission; re-enabling permits restoration when PG still accepts that token. No silent replacement or reroll. Batch changes take effect on rebuild/restart, not by editing a running container.

`inspectCatalogCompatibility()` is an operator-only module export; it is not a public endpoint. Do not expose source paths, verification metadata, failure internals or private tokens through student APIs.

## Publisher workflow

Run the seeded gate following [COMPATIBILITY_REGRESSION.md](COMPATIBILITY_REGRESSION.md). It intentionally still exits nonzero for the two mobile GraphTool grading failures. Inspect its complete report before publishing; do not bypass missing cases or regenerate approval from a partial run.

From `experimental-workspace/`, with `$catalogArtifacts` set to that run's temporary artifact directory:

```powershell
docker build -f compatibility/Dockerfile -t linear-algebra-compatibility-qa .
docker run --rm --mount "type=bind,source=$catalogArtifacts,target=/artifacts" linear-algebra-compatibility-qa node compatibility/build-catalog.mjs /artifacts/regression-results.json /artifacts/catalog
```

The publisher writes reviewable `exercise-catalog.json`, `catalog-compatibility-evidence.json`, `catalog-eligibility.json` and `CATALOG_STATUS.md` under the temporary directory. It never writes to the application itself. Review the decisions, then copy the first two files into `workspace/server/` and the status Markdown into `compatibility/`. Keep sanitized full regression observations/report with the evidence. No raw PG HTML, answers, instructor values, cookies, JWTs or private session files belong in Git.

After copying reviewed outputs, rebuild the workspace, run server/browser tests and `docker compose exec -T workspace node server/check-catalog.mjs`. The latter checks all six default enabled entries through listing, start, blank grading, restoration and ownership, plus rejection of all five disabled IDs. Positive grading evidence comes from the owned-session compatibility suite.

## Future full-library importer

1. Read OPL from its Linux volume, without copying tens of thousands of PG files to Drive. Index pinned file hashes, dependency/asset notices and source attribution; preserve stable IDs across updates.
2. Normalize subject/topic metadata and conservatively infer candidate requirements. Any unknown macro/widget/script/asset or uncertain requirement keeps the file unverified and disabled. The existing vocabulary does not cover every OPL interaction.
3. Render and verify candidates in isolated operator sessions. Record source/runtime/profile identity, representative seeds and the complete check matrix; quarantine failures with their details instead of dropping them.
4. Store compact indexed metadata/evidence in a database when scaling beyond this small JSON catalog. Preserve separate compatibility and activation records; use the same fail-closed rule for list/start/restore/grade. Paginate public discovery, enforce server-owned paths/settings and retain the anonymous ownership checks until account ownership is implemented.
5. Review a validated batch, publish atomically, monitor failures, and support withdrawal without deleting sessions or evidence. Reverify affected files after source/dependency/runtime changes. These two seeds do not prove all possible random variants; broaden sampling and track runtime failures as rollout grows.

Compatibility approval is separate from licensing, redistribution, public sandboxing, authentication, rate limits and deployment readiness. Retain individual/parent-directory notices and conditional OPL license evidence. This task enables a small local batch; it does not import or enable the whole library.
## Current validation

173 server tests, 60 browser checks, 14 publisher/report tests, the live six-entry catalog check and baseline renderer/API smoke checks passed. The complete 44-case operator run has 42 passes and two mobile GraphTool failures; its nonzero gate is retained. Both seeds fail positive touch grading in the latest draft-enabled run; the earlier keyboard failure is historical. This does not affect eligibility of the six individually verified batch members. The recovery follow-up also passed the focused real renderer outage/restart check with saved state preserved. Physical screen-reader review remains manual.

The feedback-model follow-up also verifies 20 real-PG grading cases at two seeds, including a separate private suppression fixture. These grading checks do not expand student activation; see [FEEDBACK_MODEL.md](FEEDBACK_MODEL.md).

Feedback-presentation changes include canonical message projection and reviewed notation rendering in the runtime fingerprint. The separate feedback audit now has 22 real-PG cases (including authored equation notation) plus two stale/revert checks. Those extra fixtures do not enter the activation manifest. Keep the same six verified batch members and all blocked candidates when publishing renewed evidence.

Authored hint support is documented in [AUTHORED_HINTS.md](AUTHORED_HINTS.md) and is part of the runtime fingerprint. The separate hint audit verifies standard prose/notation disclosure, withheld/absent cases and both seeds of all six enabled entries. It does not activate the PCC fixture or certify graphical, scripted, unwrapped or staged hints. New source capabilities still require full compatibility/activation review. A hint flag alone cannot establish hint availability or justify enabling an exercise.

Practice-action navigation changes are documented in [PRACTICE_ACTIONS.md](PRACTICE_ACTIONS.md). They change the runtime fingerprint and require fresh seeded evidence for the same activation batch. Navigation consent helpers are private operator tooling; dedicated tests verify Cancel and failure warnings. No new exercise is activated by result controls or a fresh-variation label.
