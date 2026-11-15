# Unfinished answers and refresh

Unfinished native answers now survive refresh in the same browser tab and original exercise session. They are stored separately from server-saved graded submissions. This is the implementation of continuity subtask 2; recovery-specific UX and authored hints remain separate work.

## Student behavior

- Edits save automatically after the isolated frame reports input/change. The page shows **Draft saved in this tab**; no Check answer request is sent by autosave.
- Refresh first restores the owned server session with its existing seed/token. Then it restores a matching tab draft over the checked answers. It never starts a replacement exercise.
- Feedback still describes the last checked submission. Restored edits mark the overall result and affected fields as changed since the last check. Restoring a draft does not assign a grade.
- A successful check clears the draft only when current answers match the submitted snapshot. Edits made while grading remain a separate draft over the new saved result.
- Choosing another exercise or a new version creates a distinct session; its answers do not inherit another session's draft. Returning through browser history restores the original session's own draft.
- Storage quota/blocking, malformed records and restore failures produce a visible message. Grading remains available and existing inputs remain editable. A failed server load does not erase a draft.

Drafts use `sessionStorage`: they belong to the current tab's page session, survive refresh and navigation in that tab, and are not a cross-device or account autosave feature. Closing the tab or clearing browser data can remove them. A duplicated tab can inherit an initial copy through browser behavior; subsequent copies are independent. Browser storage failure prevents the unfinished work from being saved, and the UI reports that limitation.

## Identity and precedence

`draft-answers.js` stores bounded versioned records under `practice-draft:v1:<session UUID>`. A record includes the exact session/exercise IDs, checked-submission ID/number, generated field names, ordered string answer pairs and an optional pending grading snapshot. It stores no renderer tokens, source paths, random seeds, owner cookies or PG correct answers.

Read/apply happens only after a successful owned-session response. A draft must match both session and exercise identity and the current field-name contract. Corrupt/oversized metadata, reserved fields, unavailable choices and unverified native control types cannot be applied. Browser draft metadata never becomes a backend allowlist or renderer parameter.

| Condition on restore | Result |
| --- | --- |
| No draft | Show the server-restored exercise/checked answers |
| Same session, exercise, fields and checked baseline | Apply unfinished answers over checked answers |
| A newly saved result matches this draft's recorded pending grading snapshot | Reconcile the acknowledged check; keep edits newer than that snapshot |
| Draft values already equal the reconciled checked submission | Clear the redundant draft |
| An unrelated newer check exists | Show the newer checked result and explain that the older local draft was not applied |
| Identity/field mismatch or invalid record | Keep checked answers and show a restore warning |

A pending snapshot records the answers sent to grading before the request starts. If the server accepts that grade but its response is lost, refresh can recognize the saved submission and preserve later edits. This does not provide general request idempotency or automatic multi-tab synchronization; those remain recovery work.

## Native field restoration

`restoreAnswerFields()` in `answer-fields.js` preserves original generated names and values. Checkboxes use every ordered pair, including duplicate values under a repeated name. An omitted checkbox/radio group is explicitly cleared; a missing scalar is rejected rather than silently fabricated. Native text/formula/vector strings retain whitespace. Native selects preserve selected options.

The adapter validates the full assignment before applying it, verifies the resulting ordered snapshot, rolls back invalid native assignments, and emits input/change to initialize reviewed native behavior. It never inserts draft text as HTML, overwrites renderer helper fields or reconstructs GraphTool/custom-editor state. The six enabled fixtures use the supported native controls. The matrix/select operator fixtures retain their independent compatibility limits; GraphTool/scaffold are still disabled.

The parent sends `restore-draft` through the existing opaque iframe bridge. Source, origin, channel, request ID and expected response type are checked. The child validates the native field contract before returning an acknowledged snapshot. The iframe retains `sandbox="allow-scripts"`; it receives no same-origin or storage permission.

## Implementation map

- [draft-answers.js](workspace/public/draft-answers.js): bounded per-tab storage and restoration precedence.
- [answer-fields.js](workspace/public/answer-fields.js): transactional native restoration alongside collection.
- [answer-bridge.js](workspace/public/answer-bridge.js) and [exercise-frame.js](workspace/public/exercise-frame.js): authenticated restore command/response.
- [picker.js](workspace/public/picker.js): load initialization, autosave, pending snapshots, successful-check cleanup and status messages.
- [draft-answers.test.mjs](workspace/server/draft-answers.test.mjs): storage, identity and precedence cases; browser tests cover real native controls and refresh.
- [continuity-audit.json](compatibility/continuity-audit.json): current sanitized six-exercise observations. [continuity-audit-before-drafts.json](compatibility/continuity-audit-before-drafts.json) preserves the original baseline with draft loss.

## Verification

The focused browser checks cover all six enabled exercises on a narrow viewport, repeated-name checkbox pairs and clearing, whitespace/vector strings, checked-result precedence, successful-check cleanup, editing during an accepted-but-lost grade, new-session/owner isolation, corrupt/quota-blocked storage, native selects and duplicate choice values. The pre-existing practice, keyboard, mobile, ownership, failure and resource checks remain part of the browser suite.

The focused continuity audit now **requires** unfinished edits to survive refresh before and after checking, including a transient load failure. Historical missing-draft assertions and observations are retained separately. Full seeded desktop/touch compatibility must be regenerated for the changed runtime before publishing catalog evidence; do not edit fingerprints by hand.

Run the usual browser suite and the focused audit commands in [CONTINUITY_FEEDBACK_AUDIT.md](CONTINUITY_FEEDBACK_AUDIT.md). The private `compatibility/draft-preview.mjs` tool may be used in a temporary QA container to exercise a changed runtime before approval: it injects the six reviewed source entries into an operator-only app with temporary sessions and no host port. It is not a student route, production configuration or an alternative to the eligibility gate. Stop that temporary container when verification is complete.
Final validation: 108 server tests, 37 browser checks, 14 publisher/report tests, the default six-entry API check and revised six-exercise continuity audit passed. The renewed 44-case seeded run has 42 passes and two mobile GraphTool grading failures; those failures remain explicit and GraphTool stays disabled. No real renderer-outage or physical assistive-technology review was rerun for this change.
