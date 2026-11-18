# Subject and chapter practice UX

The student home now presents subjects with completion bars. A subject opens /subject?subject=... with a logically ordered chapter path, a whole-subject Start practice action and independent chapter actions. No section selector or third-level breadcrumb remains in the student flow. Source classifications are retained internally; old /browse links redirect to the subject page (or indexed search for library links).

## Completion definition

study-goals-v1 counts a distinct study-collection exercise once after a fully correct, visible server-PG result. Partial/incorrect/unanswered results, skips, repetitions, different seeds and legacy/client-graded history do not add completion. It is completion of a fixed practice goal, not mathematical mastery.

Subject goals are 100; chapter goals come from practice-400/collections.json. Denominators do not increase when catalog availability grows. Earned credit remains after withdrawal; chapter counts are capped at their goal, and subject progress sums capped chapter completions. Changed curricula/goals require an explicit new definition rather than silently editing these denominators.

Anonymous progress belongs to the existing HttpOnly browser proof. Signed-in progress belongs to the account. Signing in alone does not transfer anonymous work: the existing explicit claim flow does. Claimed principals and aliases are deduplicated, so the same exercise cannot earn duplicate credit across browsers/principals. An anonymous cookie's lifetime still limits browser-only recovery; use an account for cross-device continuation.

Existing immutable server-PG attempts can backfill only when their exact source matches a current study assignment. Legacy-latest-only/imported records are not relabelled or reconstructed. Processing is bounded at 500 missing receipts per request; the UI keeps an updating/error state until synchronization finishes, rather than showing an invented zero.

## Private storage and authority

Local Auth migration 004 adds owner-consistent forced-RLS completion/receipt tables and the set order_strategy column. Browser roles have no table access. Backend receipt/credit writes commit in the same transaction as the accepted attempt and updated renderer tokens. Completion classification comes from the server catalog; there is no public endpoint accepting completion claims, scores, principal IDs or source identities.

Assignments are recorded privately with new attempts. A server-only identityId allows old aliases and permanent UUIDs to share one completion identity. Tokens, seeds, private assignments and answer maps are not returned by the progress DTO. GET /api/sessions/account/learning-progress resolves the actual owner and returns only fixed goals, counts, percentages, synchronization state and browser/account scope.

## Random practice

New subject/chapter sets choose up to 20 eligible exercises randomly without replacement. Unfinished exercises are preferred; once all available members are complete, practice becomes review. Random selection happens on the server, using current eligibility and actual owner credits.

Membership, order, session identities and seeds freeze when the set is created/opened. Retrying a request key returns the same saved set. Existing sets retain their original order and are not reshuffled by migration. Previous, Skip, drafts, grading and restoration reuse the tested player.

The browser saves request identity before sending a start request. Blocked storage prevents starting; service failures preserve the request and offer an explicit recovery link. No replacement exercise is silently generated.

## UX and verification

Four subject cards replace the default exercise wall and duplicated browse panels. Search remains available; the indexed library is an optional footer route. Chapters have visible numbering, completion bars, native keyboard controls and a stacked mobile layout. Chapter order is an application curriculum decision, not raw source alphabetical order; chapters are not locked behind artificial prerequisites.

Run from the repository root:

```powershell
docker compose -f experimental-workspace/accounts/compose.yaml build migrate
docker compose -f experimental-workspace/accounts/compose.yaml run --rm --no-deps migrate
docker compose -f experimental-workspace/accounts/compose.yaml -f experimental-workspace/calculus-100/player.override.yaml --profile practice up --build -d --no-deps --wait backend
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/discovery/verify.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/accounts/verify-accounts.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/accounts/verify-learning.ps1
```

Finish any home/backend rebuild before live browser acceptance. Accounts acceptance includes a real Auth/RLS learning probe with a controlled renderer: full/partial/suppressed outcomes, repeated/alias grades, historical backfill, withdrawal, guest claims, privacy and frozen unfinished-first sets. verify-learning.ps1 checks actual private PG grading from a student-question-derived answer, visible subject/chapter updates, non-inflating repetition, explicit claim and cross-device/foreign-browser behavior. QA mounts no student or secret volumes for that live test.

Discovery acceptance covers home/search, real read-only catalog queries, ordered chapter pages, random subject/chapter sets, refresh/history, old URLs, blocked storage, retries, keyboard and narrow screens. The redirect browser case follows the real reachable service URL because fulfilled localhost redirects are not re-routed by Chromium. Manual screen-reader listening and physical-device testing remain separate; no such result is claimed.

The root Next.js app and original 3100 prototype remain intact. No canonical PG frame/client runtime source or fingerprint was changed. The 400-exercise verifier continues independently; UX changes do not waive its source, capability, context or approval-policy checks.
