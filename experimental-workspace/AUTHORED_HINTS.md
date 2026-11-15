# Authored hints

The View hint action displays only hint content actually returned by the pinned PG renderer for the owned session. It does not generate advice, request solutions, grade an answer, replace the exercise frame, or create a different exercise.

## Verified upstream behavior

Pins: renderer `1134ffbbf5e656148e579f424f70bcd9f1d15936`, PG `4b3e564cf4e5a36807ca5a341734f8d604e8b77d`, OPL `0d42812d6d02960c846fc0f89215e0d4f1e761b1`.

The primary implementation was inspected inside the renderer container:

- Renderer `lib/WeBWorK/RenderProblem.pm:197-216` computes solutions from instructor/correct-answer/solution settings and computes hints separately from solutions or `showHints`. The app continues its existing student-mode requests, with solutions/correct-answer controls disabled. It does not enable instructor mode or send a new hint override.
- PG `lib/WeBWorK/PG.pm:249` defaults an undefined `showHints` to 1; its option documentation at lines 399-406 distinguishes hints from solutions. That is why the existing app can receive an available hint without a second render request.
- PG `macros/core/PGbasicmacros.pl:993-1032`: `hint()` sets `hintExists=1` even when hint output is disabled. `HINT()` emits a marked `div.hint.accordion > details.accordion-item` only when the hint body is available, with the body in `.accordion-body`. `BEGIN_HINT` ultimately uses this standard mechanism. `SOLUTION` uses a separate `.solution` wrapper and `showSolutions` condition.
- Renderer `lib/RenderApp/Controller/Render.pm:35-79` restores session claims and applies the signed problem configuration. Hint availability is evaluated by PG when starting, grading or restoring that same session. The app does not manufacture attempt thresholds, change attempt counters, or override signed visibility settings. The standard HINT macro itself has no built-in attempt-count threshold; any authored conditions must run in PG and actually return eligible hint content.

**Existence is not availability.** A real source-pinned OPL fixture was rendered with hints disabled: `hintExists` remained 1, but no hint body was returned. The app correctly exposes no action. An authored solution in the same fixture remains withheld in student mode, including while a hint is viewed.

## Application contract

[authored-hints.mjs](workspace/server/authored-hints.mjs) projects hints before asset registration and question HTML projection. It requires the explicit renderer existence flag plus nonempty supported standard hint markup as a direct child of `#problem_body`. Hints nested in authored/staged containers or containing explicit hidden/aria-hidden/inline-hidden content are unsupported and stay unavailable; the app does not bypass a scaffold to extract a future-stage hint. Hints without that evidence, empty/withheld hints and unsupported hint structures never produce a View hint action. All marked hint/solution blocks are removed from the live question body; a solution never becomes hint content. Raw custom `hint()` output without the standard wrapper is not inferred from prose or a heading.

The owner-only session API adds:

```json
{"exercise":{"hint":{"available":false}}}
```

When available, the hint additionally contains a canonical `message` string. No message key is returned when unavailable. Paths, seeds, raw flags, raw HTML, correct-answer claims and tokens are not part of the hint API. No new endpoint or client-selected renderer parameter is needed. Per-answer ans_message/error_message remain grading feedback; they are never repackaged as an authored View hint action.

Only prose and reviewed mathematical notation are supported initially. Canonicalization and safe MathJax rendering follow [FEEDBACK_PRESENTATION.md](FEEDBACK_PRESENTATION.md): text nodes, inert HTML/links, a bounded TeX allowlist, automatic-rescan guards and literal formatting fallback. Diagrams, images, scripts other than exact legacy TeX markers, controls and other unreviewed hint widgets fail closed rather than displaying an incomplete substitute. Multiple standard hint blocks preserve authored order; at most eight blocks and 16,000 total message characters are exposed. Oversized/unsupported/mixed hint sets expose no hint instead of a partial invented explanation. These restrictions need explicit source/capability verification before expansion.

## Disclosure and continuity

The button is shown only when a ready exercise's latest owned response includes an available hint. It supports keyboard/native button activation, a 44px touch target, `aria-expanded`, `aria-controls`, a labelled hint region and an announcement. The student can hide it again. No request to the grading/session API or renderer is made by disclosure; mathematical formatting may load the fixed same-origin math dependency. Inputs, checked-result identity, saved token, submission count and tab draft are not replaced or rewritten by the hint action. Focus follows the activated disclosure button; the app does not programmatically refocus or replace the frame.

A later grade refreshes hint availability using PG's response. The live exercise/answers stay in place. Changed or withdrawn hint content closes and clears the old disclosure; unchanged content can remain open. Changing exercises clears it. Refresh restores the same session and draft, recomputes PG availability and starts the disclosure closed. Availability describes the last server-rendered state, not an interpretation of unsubmitted edits. Viewing hints never silently checks those edits. Renderer failure does not fabricate a hint or initiate a grade retry; already received eligible hint text remains local until the session state is replaced.

## Current scope and evidence

None of the six enabled exercises returned an authored hint at the inspected seeds; the UI therefore shows no artificial View hint button for those entries. Hint support does not activate a new student exercise.

The separate [hint-fixtures.json](compatibility/hint-fixtures.json) pins PCC/Alex Jordan's statistics `DataTypes1.pg`, which has both an authored hint and a solution, plus a no-hint dot-product control. A private operator-only initial request with `showHints=0` verifies withholding under the signed renderer policy; it is not a student option. [hint-observations.json](compatibility/hint-observations.json) records 12 real student-mode cases: available, authored-but-withheld, and absent, at seeds 1234/4321 and desktop/touch-mobile. The audit uses no instructor requests or correct-answer oracle.

For available hints it requires exact PG-authored text, no solution markup, keyboard/mobile use, unchanged live frame/entered pairs/private session bytes, no renderer call or grade on disclosure, repeated-name checkbox drafts, graded-state/draft restoration across refresh, and rejection of a second browser owner before any renderer call. Only booleans, source identities, verification seeds and fixture IDs are serialized. Raw hint/solution content, entered values, session IDs, cookies and tokens stay in operator memory.

Reproduce from `experimental-workspace/` with Compose running:

```powershell
docker build -f compatibility/Dockerfile -t linear-algebra-compatibility-qa .
$hintArtifacts = Join-Path $env:TEMP ('authored-hints-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $hintArtifacts | Out-Null
docker run --rm --network linear-algebra-experimental_default --shm-size=1g --mount type=volume,source=linear-algebra-experimental_opl,target=/opl,readonly --mount "type=bind,source=$hintArtifacts,target=/artifacts" linear-algebra-compatibility-qa node compatibility/hint-audit.mjs
```

The normal [verify-compatibility.ps1](verify-compatibility.ps1) includes this audit alongside the feedback audit and full seeded gate. Unit tests cover absent/misleading flags, unsupported/empty/oversized content, solution exclusion and read-only restoration. Browser tests additionally verify text/vector drafts, safe hint notation and availability withdrawal using labelled synthetic responses. Those synthetic messages are not claimed as extra real authored hints.
Validation on 2026-11-15: 170 server tests, 54 browser checks, 14 publisher/report tests, all 12 real-PG hint cases plus 12 default-catalog seed probes, and all 22 feedback cases plus two stale/revert checks pass. The normal rebuilt app also passes its six-entry API and renderer/session/API/grading/submission-state checks. Renewed full compatibility is 42/44: both mobile GraphTool cases complete with positive touch-grading failures and remain disabled. No check, timeout or activation rule was waived. The six currently enabled entries have no authored hints at either seed; no synthetic hint is shown for them.
