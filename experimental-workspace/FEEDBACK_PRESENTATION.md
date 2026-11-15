# Safe PG feedback presentation

The app displays PG-authored student feedback alongside PG's own grades. It does not generate mathematical explanations, reveal instructor answers, or reinterpret message wording as a grade. [FEEDBACK_MODEL.md](FEEDBACK_MODEL.md) defines outcome precedence, field identity, suppression and stale results; this document defines message rendering.

## Sources and public boundary

Only `problem_result.msg`, `problem_result.summary`, and the matching answer token's `ans_message`/`error_message` supply messages. The field projection keeps its existing parser-error precedence. Correct-answer values, previews, answer objects, raw claims, session/problem/answer tokens, renderer controls and instructor diagnostics are not public feedback. Requests always use student mode with solutions and correct-answer controls disabled. The HTTP projection explicitly returns just `message` and `summary`, plus the allowlisted named-field metadata.

PG-authored feedback can explain an error or include mathematical advice. We preserve that authored advice; we do not append a guessed explanation or derive one from correct-answer claims. Without a message, status-based generic guidance describes the grade or asks the student to check the input format. It does not promise a specific mathematical fix. This is a structural boundary, not a general classifier for secrets embedded in authored prose: new exercises still require source/feedback review before activation.

## Reviewed rendering rules

The server's [feedback-content.mjs](workspace/server/feedback-content.mjs) parses feedback with the pinned parse5 parser and projects a bounded canonical **string**, not sanitized HTML:

- Decode text/entities and keep paragraph/list-row breaks and explicit line breaks. Remove presentation classes/styles, URLs, image sources, event handlers and other attributes. Link labels remain text; links and images do not become active content.
- Discard scripts, styles, embedded documents, templates, hidden/aria-hidden content, inline hidden styles and explicitly marked correct-answer/solution containers. Exact legacy `script[type="math/tex"]` / display markers are the sole script exception: only their text becomes explicit TeX delimiters; no script executes.
- Preserve authored inline `\(...\)` and display `\[...\]` notation. Convert ordinary HTML superscripts/subscripts to readable `^(...)` / `_(...)` text. No notation or mathematical relationship is invented.
- Accept at most 64,000 input characters per message. Malformed/non-string/oversized feedback fails renderer-response validation rather than storing an invalid snapshot.

The shared [feedback-content.js](workspace/public/feedback-content.js) builds DOM **text nodes** and narrowly typesets reviewed expressions through the pinned same-origin MathJax SVG dependency. It never inserts PG feedback with `innerHTML`, invokes arbitrary scripts, autotypesets a whole message, or passes raw feedback HTML to MathJax. Message and fragment wrappers carry the pinned engine's `mathjax_ignore` class so a later widget-triggered MathJax rescan cannot activate unreviewed literal notation; direct reviewed conversion is unaffected.

Only explicit delimiters are recognized; dollar signs remain ordinary text. The executable allowlist in `reviewedFeedbackTex` is authoritative. It covers ordinary powers/subscripts, fractions, roots, vectors, selected Greek letters, common operators/relations, standard math fonts and text. Definitions/macros, environments, HTML/CSS commands, links, URLs, extension loading, graphics, comments and unreviewed commands remain literal notation. Messages over 16,000 display characters are shown as shortened text with an explicit notice. Each expression is limited to 2,048 characters, 128 commands and 24 brace levels; at most 32 expressions per message are typeset. Unknown/malformed/unsupported expressions remain readable literal text.

Field feedback uses MathJax already loaded in the isolated exercise frame. Overall-result mathematics lazily loads the same fixed pinned library in the application shell with automatic typesetting off and only the base/AMS TeX packages. No PG problem scripts or HTML execute in the shell. Ordinary prose feedback loads no extra math dependency. The iframe sandbox and message authentication are unchanged.

## Failure, editing and accessibility

Original TeX is visible while optional formatting loads and remains if conversion/loading fails; a fallback description identifies the original notation. Formatting never disables Check answer, retries a grade, changes an answer or changes PG's score. Optional shell-library loading has a 10-second deadline; a refresh can retry a failed load. Unknown commands remain inert text without requesting extensions or remote resources.

Async conversion only attaches to the still-connected current message node. Editing/replacing feedback discards late work. Changed fields show Changed since last check rather than old authored feedback; exact revert re-renders the saved message. Unchanged fields and the overall result remain tied to their checked submission. Overall summaries and messages are separated, with exact duplicate whole messages removed. Suppression clears all messages before rendering, including after refresh; no hidden score or explanation is typeset.

PG line breaks remain readable, MathJax assistive MathML is retained, and named-field `aria-describedby` / `aria-invalid` behavior is preserved. App-owned feedback styles do not change PG control/widget structures. Long equations scroll inside their message; overflowing math receives a keyboard focus target and an accessible scroll description. Automated semantics/layout tests do not replace a manual screen-reader listening review.

## Evidence and reproduction

The source-pinned operator manifest [feedback-fixtures.json](compatibility/feedback-fixtures.json) adds **feedback-equation-01**, authored by RA Cruz at The College of Idaho. Its real student-mode message contains two equation forms and a line break. [feedback-observations.json](compatibility/feedback-observations.json) requires both expressions to typeset with assistive math after owned-session refresh at seeds 1234 and 4321, alongside the original 20 grading/suppression cases and two edit/revert checks. The added fixture stays operator-only and does not expand the six-exercise student allowlist.

Use the real-PG audit commands in [FEEDBACK_MODEL.md](FEEDBACK_MODEL.md), or run [verify-compatibility.ps1](verify-compatibility.ps1). Browser tests additionally exercise synthetic hostile HTML/TeX, overall-result math, service failure, stale async work and narrow-screen keyboard scrolling. Security sentinel tests verify private answer claims and hidden correct-answer markup never enter public messages. Synthetic tests are not claimed as extra real OPL outcomes. Artifacts contain source identities and verification flags, never raw response bodies, correct values, entered answers, cookies or tokens.
Validation on 2026-11-15: 161 server tests, 52 browser checks and 14 publisher/report tests passed, plus all 22 real-PG cases and two stale/revert checks. The rebuilt normal workspace passed its live six-entry catalog check, notation/fallback browser checks and renderer/session/API/grading/submission-state smoke checks. Full seeded compatibility records 42/44 passes; both mobile GraphTool cases remain disabled. Seed 1234 fails touch-positive grading at completion; seed 4321 fails its partial-credit interaction at graph-stale-feedback. No full-gate requirement or timeout was weakened. An earlier concurrent run's dot-product refresh timeout was discarded; the final isolated run passed that case.
