# Renderer compatibility matrix

Observed on 2026-11-14 against the revisions and PG-file SHA-256 fingerprints in [compatibility/catalog.json](compatibility/catalog.json). Raw, sanitized observations are in [compatibility/observations.json](compatibility/observations.json). Current integration behavior is defined in [INTEGRATION_CONTRACT.md](INTEGRATION_CONTRACT.md).

## Method and scope

- Eleven actual OPL files cover four declared/inferred subject areas: linear algebra, single-variable calculus, statistics, and algebra, including an economics application.
- All eleven generated at seeds **1234 and 4321**. Sampled browser answers were graded/restored at **1234**; blank submissions were graded/restored at **4321**. Browser comparisons used an **820px problem viewport**.
- The reference is the official renderer's complete student document, hosted in a same-origin iframe as its editor expects. Its scripts/styles remain intact. Text input is entered through real MathQuill editors where present; the renderer's native submit button runs its own synchronization helpers and grading navigation.
- The app comparison uses the actual `problemHtml` projection, `buildExerciseDocument`, sandbox/CSP, native collector, answer bridge, and server field contract. An in-memory Playwright parent supplies this frame; these fixtures are not added to the real student picker or session allowlist.
- Samples enter `0` into available text/math editors, select a radio option per group, check up to two options per checkbox group, choose a dropdown option, toggle a scaffold section, or place a graph point. These are transport/interaction probes, not full correct-answer proofs for every exercise.
- Grading the collected app values uses student-mode PG requests and restores the resulting token. No instructor answers are used in those paired browser comparisons. A separate operator-only positive scaffold diagnostic is described below.
- Screenshots are generated before answer entry and remain in the temporary artifact directory. No raw renderer HTML, JWTs, cookies, expected answers, or solution maps are committed with observations.

**Summary:** seven native-answer paths were observed, including the existing fully accepted baseline; six are additional candidates. Four fixtures have blocking presentation/interaction gaps. All eleven have matching native field-name sets; ten have matching sampled answer pairs. Matching scores alone do not establish compatibility.

## Results

Scores are fractions from 0 to 1. The score column compares the official browser submission with the isolated app sample; app-token restoration retained that score in every row.

| Stable ID | Official reference behavior | Isolated application frame | Sample score, reference/app | Assessment |
| --- | --- | --- | --- | --- |
| `dot-product-01` | Four MathQuill-backed fields, vector notation, readable mathematics. | Four native text fields; matching sampled pairs and mathematics. | 0 / 0 | Existing full student-flow baseline; MathQuill enhancement intentionally absent. |
| `compat-calculus-numeric-01` | One MathQuill field for a derivative evaluated at a point. | One native field; same collected answer and score. | 0 / 0 | Native candidate; full owned-session correct-answer cases still needed. |
| `compat-calculus-formula-01` | One MathQuill formula field for a quotient derivative. | Native expression field; same collected answer and score. | 0 / 0 | Native candidate; formula editing is a plain-text replacement, not MathQuill parity. |
| `compat-matrix-grid-01` | Nine MathQuill fields arranged inside a 3x3 matrix bracket layout. | Nine native fields retain names/order and the 3x3 layout, with visibly larger controls. | 0 / 0 | Native grid candidate at 820px; narrow-screen matrix layout and compound matrix evaluators remain unverified. |
| `compat-statistics-radio-01` | Four independent three-option radio groups with labels. | All four groups can be selected; names, selected values, and score match. | 0.25 / 0.25 | Native radio candidate. |
| `compat-algebra-checkbox-01` | Two MathQuill numeric fields and a multi-select explanation group. | Two native fields plus repeated-name checkbox pairs; matching sampled values and partial credit. | 0.333333333333333 / 0.333333333333333 | Native checkbox candidate. |
| `compat-economics-popup-01` | Three MathQuill numeric fields and one dropdown. | Native numeric fields and dropdown preserve the sampled values and score. | 0 / 0 | Native select candidate. |
| `compat-calculus-scaffold-01` | Part 1 initially exposes two answer names; Bootstrap-backed section toggles work. Correct completion reveals two additional answer fields. | Toggle markup exists, but the tested collapse action does not change state. The picker also retains its original frame after grading. | 0 / 0 | **Blocked: staged interaction and post-grade content lifecycle.** |
| `compat-algebra-image-01` | A supplied GIF graph loads; two function-value fields are usable. | Both fields work, but the required image fails: 0/1 loaded and its parent-origin asset request returns 404. | 0 / 0 | **Blocked: static library asset delivery.** |
| `compat-calculus-graph-01` | Two generated PNG graphs load, followed by one numeric field. | The field works, but neither graph loads: 0/2 images and two parent-origin 404s. | 0 / 0 | **Blocked: generated-image/alias delivery.** |
| `compat-algebra-graphtool-01` | JSXGraph/GraphTool initializes SVG boards; the point tool changes the hidden answer state and native submission handles it. | No initialized board; body initialization throws `graphTool is not defined`. Collected hidden state differs from the working reference. | 0 / 0 | **Blocked: header dependencies, initialization, styles, and widget state.** |

All final official reference pages completed the observed browser flow without page errors. The earlier bare top-level reference produced a `window.frameElement.id` error from upstream `problem.js`; the final reference embeds the document as the official editor does. That error was a harness hosting mismatch, not an application compatibility finding.

## Positive scaffold transition

[compatibility/scaffold-transition.json](compatibility/scaffold-transition.json) records an additional operator-only PG diagnostic at seed 1234:

- Before completion: `AnSwEr0001`, `AnSwEr0002`.
- After completing Part 1: score **0.5**, with new fields `AnSwEr0003`, `AnSwEr0004` in the returned problem.
- Restoring that token retains all four field names. The problem content changed.

The diagnostic uses instructor expected values only in memory to create the positive fixture; neither expected values nor private tokens are emitted. It proves an engine-driven content transition, not a completed scaffold UI flow in our app.

Our current picker saves the returned token/result but keeps the live frame and only updates feedback. That protects edits during ordinary grading, while leaving new scaffold content unapplied until a later reload. Loading Bootstrap alone will not resolve this gap: resource initialization and a deliberate post-grade content/state update policy are both required.

## Safe changes established so far

- The application shell, topic picker, loading/error/result UI, and responsive controls remain separate from PG content.
- For the tested native paths, labels, field names, duplicate pairs, table structure, and sample scores survived the projection and styling changes.
- Replacing MathQuill with native fields is an explicit feature tradeoff. Equal sampled answer strings do not prove equivalence for every editor input, accessibility mode, or formula syntax.
- Images, widget containers, scripts, and staged problem bodies cannot be treated as decorative markup. A zero score or an accepted POST can coexist with a nonfunctional graph.

## Next implementation priorities

1. Design session-aware delivery for approved library/generated assets using renderer alias metadata; do not expose arbitrary renderer files.
2. Preserve and initialize approved PG dependencies in the correct order inside the isolated frame. Address stylesheet and script lifecycle together.
3. Define post-grade problem-content reconciliation for scaffolds/dynamic questions, preserving unsaved edits, ownership, tokens, bridge cleanup, and focus behavior.
4. Promote native candidates only after real owned-session correct/incorrect grading, feedback, refresh, keyboard, and narrow-screen tests. Keep unsupported fixtures out of the student catalog.

This is an initial compatibility sample. File upload, custom editors, compound matrix evaluators, every PG macro, all subjects, multiple browsers, and full mobile behavior for these eleven fixtures are not established by this study.
## Controlled-loader follow-up

The matrix above preserves the pre-loader baseline. [ASSET_LOADING.md](ASSET_LOADING.md) describes the implemented mechanism; [asset-loading-observations.json](compatibility/asset-loading-observations.json) records the new run with the same eleven sources/seeds and paired-browser method.

| Previously blocked capability | Result with the controlled loader | Remaining acceptance gate |
| --- | --- | --- |
| Static library image | Required GIF loads (1/1). | Full owned-session exercise acceptance. |
| Generated graph images | Both PNGs load (2/2). | Full owned-session exercise acceptance. |
| Scaffold collapse | The tested section toggle changes state with approved Bootstrap/Scaffold dependencies. | Applying newly revealed fields after grading remains unimplemented. |
| GraphTool | Initializes three SVG boards (including auxiliary boards), displays both toolbar icons, and the tested point action updates the hidden answer. Sampled pairs match the official renderer. | Correct-answer, retry/refresh, keyboard, and mobile acceptance for this widget. |

All eleven paired cases finished without application page errors; native field names, sampled pairs, and sampled grading/restoration scores match the reference. These are operator comparisons, not approval of eleven student exercises. The public allowlist still contains only `dot-product-01`. Original form submission helpers, MathQuill enhancement, and arbitrary widget dependencies are still excluded.
