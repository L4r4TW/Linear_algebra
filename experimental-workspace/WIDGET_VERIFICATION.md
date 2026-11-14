# Widget answer and feedback verification

Verified in the experimental workspace on 2026-11-14 against the pinned sources in [compatibility/catalog.json](compatibility/catalog.json). Sanitized results: [compatibility/widget-observations.json](compatibility/widget-observations.json). Reproduction: [compatibility/README.md](compatibility/README.md).

## Supported representations

| Interaction | Actual answer representation | Collection and feedback |
| --- | --- | --- |
| Numeric and formula | One named native text input per answer. | Exact input string goes to PG; correct/invalid/unanswered feedback and saved values restore. |
| Vector notation | `AnSwEr0002` in `dot-product-01` is a MathObjects `Value (Vector)` in one text input; the other three fields are scalar. | Preserve the whole vector string. Do not split coordinates or replace the PG evaluator. |
| Matrix grid | Nine independently named scalar inputs inside a 3x3 layout. | All nine names and values are collected in order and individually graded/restored. This does not establish support for every compound matrix editor. |
| Radio groups | One shared name per group; only the checked option contributes its generated value. | Four groups tested. Empty groups are cleared by the server contract. Feedback follows the choice label/group without separating input and label. |
| Modern checkbox list | Repeated pairs with the same name, one per checked generated option value. | Two scalar fields plus a checkbox group tested. Preserve duplicate order; never turn pairs into an object. |
| Dropdown | One native select and its selected generated option value. | Three scalar fields plus a dropdown tested; selection and feedback restore. |
| Image/graph questions with numeric answers | Native answer controls plus required image assets. | Both the supplied GIF and generated PNG fixtures reach full correctness and restore their saved answers. |
| GraphTool | One hidden PG input stores the widget's serialized graph; helper inputs are not answers. | Read the original hidden value. A narrow adapter reports direct value assignments, renders feedback beside the visible graph, and routes focus into its controls. Wrong, partial, correct, clear, and restore cases pass. |
| Scaffold controls | Native formulas and legacy repeated-name checkboxes; the current stage determines the available field contract. | Part 1 grades to 0.5; explicit refresh reveals the next fields and Part 2 reaches 1. Clearing Part 1 can relock Part 2 on refresh. Automatic stage reconciliation remains unsupported. |

## Narrow adapter behavior

[widget-answers.js](workspace/public/widget-answers.js) recognizes only the pinned GraphTool relationship: an enabled, eligible hidden input whose `id` equals its name, inside `.graphtool-outer-container`, with a matching `<id>_graphbox.graphtool-container`. It does not infer answers from SVG objects, rewrite graph syntax, collect helper fields, or extend the backend allowlist.

GraphTool assigns `input.value` without dispatching native input/change events. The adapter wraps only that input instance's native value getter/setter and queues the existing authenticated snapshot/feedback path when its value changes. It preserves the native value and provides cleanup on pagehide. Unrelated hidden fields remain readable by fresh collection but are not observed by this adapter. No polling, global input prototype override, or widget-specific answer payload is added.

The shared presentation helper associates hidden graph feedback with its visible container and focusable controls. Native controls keep their generated identities; choice feedback sits after the group or label. Feedback stays plain text, retains accessible descriptions and invalid markers, and changes to “Changed since last check” after graph edits/clear. The existing source/origin/channel/request checks and server-derived field/cardinality validation remain in force.

## Evidence and limits

The operator runner starts a temporary, container-local HTTP application with an explicitly injected fixture catalog. It uses the actual renderer client, anonymous ownership, session persistence, picker, isolated frame, asset registry, answer bridge, grading endpoint, and feedback projection. Production factories retain the original catalog defaults: fixture IDs are not added to the normal student API.

For all eleven fixtures, the runner verifies source hashes, blank grading, wrong or invalid input, full correctness, visible field feedback, ordered-pair restoration, saved field-feedback/status restoration without another grade, clearing and restoration, seed preservation, omitted private renderer data, and rejection of a different browser owner. Multi-field negative cases exercise mixed/partial results; GraphTool separately tests wrong (0), partial (between 0 and 1), and fully correct (1) point placements through its real toolbar. All fixtures reached score 1 and cleared to 0 in the recorded run.

Expected scalar/graph values are used only by the operator diagnostic in memory. Choice mappings are calibrated through bounded private PG requests and then selected in the browser. The diagnostic never adds instructor flags or expected-answer maps to student endpoints. No raw answers, seeds, JWTs, cookies, session files, renderer HTML, or screenshots after answer entry are written to the report. Reported field counts, scores, statuses, and booleans are deliberate sanitized evidence.

The run uses fresh random session seeds, preserved through retries/restoration; it complements the earlier fixed-seed comparisons rather than certifying every seed. It does not approve all fixtures for students. Full mobile/keyboard review for every widget, actual screen-reader listening, other GraphTool tools/evaluators, arbitrary custom editors, file uploads, and all PG macros remain outside this proof. The complete automatic scaffold lifecycle still needs post-grade DOM/resource reconciliation, including relocking; a refresh-required staged test must not be described as seamless support.