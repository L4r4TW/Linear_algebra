# Home and discovery (milestone 8)

## Latest: subject/chapter learning flow

Home presents four subject cards with private completion bars. /subject?subject=... shows numbered chapters in curriculum order, subject-wide Start practice and individual chapter actions. No section selector remains; old /browse links redirect. Search and the indexed library remain optional. Completion is supplied by the owner-checked account backend, never inferred from catalog counts. See [../LEARNING_UX.md](../LEARNING_UX.md). New sets use server-random, unfinished-first membership; saved sets and request-key retries remain stable.

Fresh acceptance: 24 contracts, one actual catalog/database test, 12 desktop/mobile home/chapter/player cases and six original smoke cases passed. Run verify.ps1 after rebuilding, then ../accounts/verify-learning.ps1 for real PG-to-progress/account continuation. Older counts and three-column descriptions below are historical; root PROJECT_CONTEXT.md is the current handoff.

## Current local availability

The live account backend now supplies sixteen playable entries: six original exercises and ten calculus exercises under the explicit user-authorized tested-pilot policy. Pilot cards are labelled and the practice shell offers Report a problem. See ../calculus-100/LOCAL_PILOT_POLICY.md and ../accounts/PROBLEM_REPORTS.md. The indexed library and normal independently reviewed database publication counts remain separate. Older six-entry milestones below are historical; the independent localhost:3100 player still has six.


## Checkpoints

1. **8.1 — Discovery contracts and server:** read-only real catalog queries, bounded validated filters/cursors, explicit distinction between indexed sources and launchable practice.
2. **8.2 — Home and search:** screenshot-directed shell, subject cards, search, topic/source filters, shareable URLs, pagination and accessible responsive states.
3. **8.3 — Practice and continuity:** fixed-upstream gateway to the unchanged player, guarded starts, owner-checked Continue practicing, preserved session/draft origin.
4. **8.4 — Acceptance and handoff:** real-catalog/API/browser checks, failures and navigation, desktop/mobile/keyboard review, documentation and push.

## Integration contract

Discovery is an independent Docker service at http://localhost:3105. The existing Next.js app, six-exercise player at localhost:3100, renderer and verification operator remain intact. Practice is served through the discovery origin at /practice, so that its existing cookie ownership, draft storage and session URLs work together with the new home.

Only the existing player's live /api/exercises response authorizes prototype starts. Imported catalog rows never authorize a renderer request. The database's own practice-ready status remains separate; database-backed session adapters are not implemented by this milestone. Zero database-ready exercises is a truthful state, not a reason to bypass certification.

The optional indexed library reads existing catalog_api search/count/topic functions, under the anon database role in read-only transactions. It exposes no SQL, private metadata, PG paths, renderer tokens or correct answers. Source-header descriptions and normalized/raw topic labels are searchable using the existing full-text index. Author/institution/book attribution is displayed where available; it is not falsely advertised as separately indexed search.

Generated source labels are identified as such. Classification is the importer's normalized upstream vocabulary, not a fabricated curated hierarchy. Subject cards only lead to nonempty practice or explicitly labelled indexed coverage.

All APIs are GET-only except the narrow existing practice proxy. Search filters and generation-bound cursor bindings are validated; results are bounded. A stale import cursor requires an explicit search restart. Dependency errors are sanitized; no silent new session or draft deletion occurs.

The deployment is local development, not hosted Supabase or production authentication. No student/session volume, OPL volume, operator secret or Docker socket is mounted in discovery.

## Run locally

Start the existing experimental workspace and OPL catalog first. From the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/discovery/setup.ps1
docker compose -f experimental-workspace/discovery/compose.yaml exec -T home npm test
```

Setup creates only a local discovery_home login inheriting anon and default read-only/4-second query settings. It does not apply migrations, import sources, change publication or grant private-table access. Docker networking is trusted local development; use managed credentials and restricted admission before deployment.

GET /api/discovery/overview separates live prototype availability from database coverage. GET /api/discovery/search accepts q, view=practice|library, subject, chapter, section, area and cursor; pages contain at most twelve entries. GET /api/discovery/topics supplies normalized source classifications. Unknown/repeated parameters and malformed/changed-filter cursors are rejected. Existing database import-generation checks reject stale cursors.

## 8.2: home and search

The screenshot-directed shell is implemented: prominent search, nonempty subject cards, practice/library switch, results, dependent subject/chapter/section and source-area filters, and twelve-entry cursor pagination. Search/filter/cursor state lives in the URL and browser back/forward restores it. Clear filters, retry, stale-cursor restart, loading, empty and dependency-unavailable states are explicit. Source strings use text nodes rather than HTML.

Subject options initialize directly from shared URLs while overview counts load independently. Short-lived (15-second), bounded topic caches deduplicate repeated requests. Available-practice subjects come from the live player, not from imported coverage. The UI follows the reference's neutral cards, thin borders and prominent dark actions; it introduces no account/progress placeholders that imply implemented features.

Initial desktop/mobile visual review and the home/search browser checks passed. Full acceptance and the saved source-bound report are recorded in checkpoint 8.4.

## 8.3: practice and continuation

Practice opens at /practice?session=… on the home origin. The gateway forwards only fixed existing player routes (approved assets, exercise list, session start/restore/answers); it accepts no upstream URL or renderer path. Browser origins are checked before translating to the configured upstream origin. Ownership cookies, server validation, answer contracts and native player navigation/draft protection remain authoritative. The proxy preserves body limits, private cache behavior and renderer-token redaction; no exercise HTML or interaction code is injected or rewritten.

A successful owned session response records only an opaque recent-session ID in an HttpOnly cookie scoped to /api/sessions. GET /api/sessions/recent validates that hint using the existing owner-checked restore endpoint before returning a friendly title and resume link. Missing/unowned records reveal no title. Outages and unavailable sessions retain an explicit link to the original session's recovery screen; they never start a replacement. Opening the home may restore that session upstream for validation, but does not grade it.

Continue is local to this browser's most recent gateway session, not account history or a progress model. Drafts remain tab/session-bound and use sessionStorage. Existing drafts entered at localhost:3100 remain on that origin; they are not silently copied to 3105. Start and resume through 3105 to keep the new flow together. Multiple tabs retain the player's existing independent-draft behavior.

Real browser acceptance covers grading/restoration, leaving via the player's home link, resuming the exact session with unsubmitted edits, and a different owner's rejection. Failed starts retain search and permit explicit retry; a pending start prevents duplicate submissions. No existing player source or compatibility fingerprint was edited.

## 8.4: acceptance and continuation

Run the complete local acceptance from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/discovery/verify.ps1
```

The runner validates Compose, starts/rebuilds only discovery, runs nine server/contract tests, one actual read-only database test, seven browser tests, and the unchanged player's live six-entry catalog check. It uses the existing pinned Playwright QA image (building it when absent). Its own random QA container is removed in finally. No OPL checkout, student volume cleanup, hosted migration, importer run or publication is performed.

The [sanitized observations](discovery-observations.json) record source hashes, image identity and passing checks for:

- Six playable exercises and four nonempty practice subjects; 77,134 separately indexed sources.
- Read-only anon-scoped queries, base-table denial, distinct cursor pages and real stale-generation rejection.
- Search, dependent topic/source filters, refreshable URLs, pagination and back/forward navigation.
- Loading, empty, failure/retry, stale-cursor restart and partial catalog-outage recovery.
- Text-only source metadata and fixed-upstream/origin/body-size gateway boundaries.
- Actual exercise launch, PG grading, saved-result refresh, same-session unsubmitted edits across home navigation, and ownership rejection.
- Duplicate-start prevention, failed-start recovery, keyboard/labels/live-region semantics and 360px mobile layout without page overflow.

Desktop and mobile home screenshots were visually inspected before answer entry; screenshots and browser profiles are not committed. Actual screen-reader listening and physical-device review remain manual release checks. This is focused home/gateway acceptance; the original 173-server/62-browser and 42/44 compatibility figures remain historical and were not relabelled as new results.

The imported database still has zero practice-ready exercises. The new home does not resolve PG provenance or supply independent approvals. Future work includes reviewed curated taxonomy/navigation, database-backed session adapters, approved batches, accounts/progress and production deployment. Keep indexed discovery separate from practice authorization.

## Task 9: dependent chooser and topic plans

9.1 adds GET /api/discovery/chooser with view, subject/chapter/section and subjectFind/chapterFind/sectionFind. It returns three dependent columns, at most forty nodes per column, matched totals, exact selection breadcrumbs and separate prototype-available/indexed counts. Filtering reaches nodes beyond the initial bound. Unknown/repeated/control parameters and stale or nonexistent selections are rejected. Missing levels are retained explicitly; no artificial sections are invented.

POST /api/discovery/practice-plans is the sole discovery mutation and requires the home Origin plus a bounded JSON object containing only view/subject/chapter/section strings. It freezes up to twenty currently live-allowlisted exercises in exercise-ID order, with a random plan ID, friendly metadata and null session slots. It neither starts renderer sessions nor activates imported sources. Library-only plans fail. The plan is initially a tab-local sequencing contract; durable owner-bound persistence/navigation is milestone 11.

9.1 validation: thirteen unit/server groups and actual indexed/live API probes pass. Linear algebra has 2,640 indexed classified sources across nine chapters and zero imported playable entries; the live prototype's linear-algebra plan contains its one enabled exercise. The chooser UI and plan launch are the next checkpoint. Earlier discovery-observations.json remains historical milestone-8 evidence until refreshed acceptance.

9.2–9.3 implement /browse using the supplied Category_chooser direction: dependent desktop columns, stacked mobile groups, clear selected buttons, breadcrumbs, counts, filtered large lists and native buttons with Arrow/Home/End and parent/child keyboard focus. Home subject cards now open this browser. Selection/filter state is shareable and restored by refresh/back/forward. Indexed mode has no Practice permission.

Practice first saves its server-selected plan in sessionStorage, then creates its first session through the existing owner-checked API and saves that session identity before entering the unchanged player. Storage failure prevents session creation. An unconfirmed start is retained as uncertain and never automatically retried; an explicit new-set action is labelled accordingly. Existing plans/drafts are not deleted. This is a real bounded plan with a first session, not yet durable/account-backed multi-item navigation (task 11).

Five real-catalog chooser browser checks pass: dependent desktop selection/history/keyboard, mobile stacking and missing metadata, stale-topic/filter recovery, exact first-session plan storage, and blocked-storage safety. Desktop/mobile pre-answer screenshots were visually compared with the reference and are kept out of Git. Actual screen-reader listening remains a manual release check.

9.4 complete: combined acceptance passes thirteen unit/server groups, one actual read-only database group, twelve browser checks (seven home and five chooser), and the unchanged player's live catalog gate. Current sanitized reports are discovery-observations.json and chooser-observations.json, each bound to twenty-three implementation/test hashes. Repeat with discovery/verify.ps1. The imported catalog remains unactivated and six prototype exercises remain playable. Task 9 is complete within its real local-data scope; durable sets, account storage and the planned practice shell remain tasks 10–12.
