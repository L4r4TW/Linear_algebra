# Practice actions and protected navigation

Continuity subtask 7 adds next actions while preserving the original exercise and unfinished answers. It does not introduce another grading path or reset a session to retry.

## After a result

Every saved outcome has Return to answers and **Choose another exercise**, with nearby guidance. Unanswered/invalid/incorrect/partial results explain editing and using Check answer again in the same exercise. Full-credit results allow review, another check or another exercise. Suppressed results say that edits can be submitted again while feedback remains withheld; the app does not promise new feedback or invent a mathematical explanation.

Return to answers uses the existing authenticated frame focus bridge and prioritizes invalid/missing answers. It never checks, clears or replaces answers. Check answer keeps using the current owned session, seed and stored renderer token. Existing submitting/duplicate guards, failure recovery and stale feedback still apply.

Choose another exercise is a browsing action: it scrolls/focuses an enabled catalog choice, preferring another exercise, while leaving the current frame and answers open. It sends no request and creates no session. Selecting a card is the separate action that can leave the exercise. The current card explicitly labels its fresh variation **New variation (starts a new session)**. Retrying Check answer never invokes that action.

## Protecting an actual leave

Before replacing a live exercise through a catalog selection or application history navigation, the app locks overlapping actions, collects fresh DOM answer pairs through the frame bridge and attempts to persist the current session-bound tab draft. Comparison uses generated names, exact values/whitespace and repeated-name value order. A current DOM value without an input/change event is still collected. Blank/cleared fields are meaningful edits. Pending or unconfirmed checks and unreadable snapshots remain unfinished.

Unfinished work opens the browser's native **Leave this exercise?** confirmation. Cancel keeps the original frame, inputs and session URL. The activated control regains focus when no newer interaction has occurred. Confirm explicitly leaves without checking again. Successful draft storage is described as per-tab storage with Back to return; storage failure instead warns that leaving may lose work. If collection fails, the app warns that it cannot read the current answers and suggests staying to copy them. Failure is never treated as a clean exercise or silent consent.

Leaving does not delete the old draft or private record. A new variation starts with its own new session; the old draft is not applied there. Back can restore the original session/draft under the existing ownership and checked-result precedence rules. If grading was already sent, leaving does not guarantee cancellation at the server. The pending snapshot remains available for later GET restoration; no automatic repeat grade is sent.

Application-created history entries carry an index. Cancelled Back/Forward restores the committed entry without reloading the frame or adding a duplicate history entry. Accepted history follows the requested saved-session URL with GET, or returns to the initial picker. A later history request during another navigation supersedes the pending display; overlapping starts are blocked. The skip link focuses the exercise without manufacturing a hash-history entry. Unknown externally created history state has a conservative URL-restoration fallback; arbitrary third-party history manipulation is not a tested workflow.

The browser's standard beforeunload prompt also protects cached unfinished/pending work during reload, close or document navigation. This handler never starts asynchronous collection or a grade. Browser activation/platform rules govern whether that native prompt is shown; mobile OS termination can bypass it. Drafts remain per-tab sessionStorage, not cross-device or permanent storage. Keep a tab open or check work before closing it. Reload after consent restores the same saved session and tab draft as before.

## Boundaries and verification

The runtime changes are in [picker.js](workspace/public/picker.js), [practice-actions.js](workspace/public/practice-actions.js), [index.html](workspace/public/index.html) and app-owned shell styles. The server only adds the public module to its static allowlist; grading/ownership/storage endpoints are unchanged. No renderer parameters, answer contracts, iframe sandbox, PG widget structure or asset policy are loosened.

Pure tests cover checked-versus-draft group comparisons, whitespace, cleared/repeated values, missing snapshots, pending checks and result guidance. Browser checks cover same-session retries; non-destructive catalog browsing; explicit new-session labels; fresh unsignalled edits; Cancel and accepted leave; duplicate starts; Back/Forward, rapid successive history requests and reload; blocked storage and failed collection; and Cancel during an in-flight grade. The existing real-PG feedback audit now verifies next actions after every graded outcome, including suppression. Hint/feedback/continuity and full seeded compatibility checks remain required.

Operator runners use [navigation-consent.mjs](compatibility/navigation-consent.mjs) to explicitly approve their intentional reloads/leaves, matching their existing test plans. This is QA-only and is never served to students. Dedicated browser tests separately verify cancellation and loss warnings. No grading, restoration, ownership, seed or compatibility assertion is waived.
Local verification on 2026-11-15: 173 server tests, 60 browser checks, 14 publisher/report tests, 12 real-PG hint cases with both-seed probes of the six enabled entries, and 22 real-PG feedback cases plus two stale/revert checks pass. Every feedback case verifies next-action availability. The normal rebuilt workspace also passes live catalog/API and targeted result/session/history browser checks. Full compatibility is 42/44; both known mobile GraphTool touch-grading failures remain disabled. This document accompanies the practice-action commit following 05e30f4.
