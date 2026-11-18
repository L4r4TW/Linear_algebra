# Maintainability review (2026-11-18)

This pass reviews the active account/discovery/study-collection code, its request and persistence boundaries, test/build wiring and contributor entry points. Formatting/static checks cover 80 operational files. The canonical PG integration, upstream renderer, complete importer/verifier implementations and original Next.js app are outside this pass; their existing evidence and behavior remain intact. This is not a security or production scalability certification.

## Findings addressed

| Finding | Change | Regression evidence |
| --- | --- | --- |
| CI contract image omitted the curriculum required by new imports | Include shared study files and exercise their contracts in CI | Clean contract-image build and tests |
| Subject, completion and collection code parsed/reasoned about the same definitions separately | Shared validated immutable curriculum, stable chapter order and indexed assignment lookups | Duplicate IDs/targets/order/future-chapter contracts |
| Practice deduplicated display aliases rather than canonical identities | Deduplicate canonical exercise identity before bounded random selection | Alias/unfinished/review contracts |
| Browser fetches could hang or expose raw transport/parser errors | One bounded cancellable JSON boundary for discovery/account pages, sanitized errors, no automatic mutation retry | Timeout, cancellation and malformed-response contracts |
| Storage could silently discard a request key; cache key ordering could reset it | Read-after-write verification and semantic selection comparison, with retained creation identity | Silent/explicit storage failure and lost-response retry contracts |
| Browser back/forward cache could restore disabled controls or stale progress | Lifecycle cancellation and explicit restoration refresh, ignoring stale progress requests | Cached-page browser regression |
| Discovery reports hard-coded stale server counts and captured source hashes only after execution | Read the actual TAP summary and bind/check hashes before/after the run | Source-bound discovery acceptance |
| Dense compressed modules and implicit browser globals made review difficult | Consistent formatting, ownership/crypto/concurrency comments, explicit test globals and removal of unused bindings | Formatter and correctness lint; unchanged PG fingerprint |

The sampler scans eligible identities once and makes at most 20 random draws, rather than shuffling the entire candidate pool. Chapter counts and completion projections use maps rather than repeated catalog scans. No stored order is reshuffled, no schema/data reset occurs, and no migration is needed for this pass.

## Boundaries retained

- All 400 collection members keep source/job/attempt/context admission and live-renderer checks.
- Forced RLS, server-derived ownership, encrypted private state and atomic attempts/tokens/credits remain unchanged.
- Request timeouts do not prove a POST failed. A set retry uses its retained request key; uncertain PG grading remains blocked.
- Fixed study goals are completion, not mastery. Explicit guest claims remain required for account continuation.
- Historical reports are preserved; fresh acceptance must be associated with the actual current source/images.

## Remaining work

Progress/history queries still need measured query-plan and load testing before a large public rollout. The current app caps live imports and request/database concurrency; this refactor does not remove those bounds. Upstream dependency remediation, public Auth/email/TLS policy, distributed deployment capacity, backup operations and manual accessibility/device release checks remain under the deployment criteria. Older importer/verifier and canonical PG code can receive separate focused review/formatting work with their own validation, rather than invalidating their evidence during a shell cleanup.

Verification results and immutable report locations are recorded in the newest root PROJECT_CONTEXT.md entry. Run the commands in [CONTRIBUTING.md](../CONTRIBUTING.md) to reproduce the pass.

## Verification of this review

Fresh source-bound evidence: maintenance/observations/20261118T103343273Z/manifest.json. Final quality: 80 files, 70 JavaScript modules, zero formatting changes and zero lint errors. Account/discovery/shared/calculus contracts passed 25/30/6/19 respectively; canonical PG contracts passed 181 with one existing skip and matching runtime evidence. Real acceptance passed 13 discovery browser cases, one read-only DB check, nine account groups and actual PG-to-progress/explicit-claim/cross-device checks. All 400 exact collection identities remain available. See the newest PROJECT_CONTEXT.md entry for immutable report paths and the retained incomplete harness run.
