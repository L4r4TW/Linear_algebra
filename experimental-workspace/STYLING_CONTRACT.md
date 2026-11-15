# Exercise styling contract

Updated 2026-11-15. This contract covers the experimental renderer integration, not the separate root Next.js app. Tested overrides live in [exercise.css](workspace/public/exercise.css); classification and stylesheet loading live in [exercise-frame.js](workspace/public/exercise-frame.js). Evidence: [compatibility/styling-observations.json](compatibility/styling-observations.json).

## Ownership and cascade

| Layer | Styling owner and allowed changes | Boundary to preserve |
| --- | --- | --- |
| Application shell | [picker.css](workspace/public/picker.css): catalog, headings, loading/errors, result panel, Check answer button, iframe border/outer layout. Typography, spacing, colors and responsive shell containers are application-owned. | Keep keyboard/focus/status semantics and iframe sizing/message checks. Shell CSS cannot reach the opaque iframe. |
| Frame surround | `body[data-practice-frame]`: whitespace (18px top, 8px sides, 24px bottom), white frame background, and namespaced `--practice-*` tokens. | Preserve renderer base typography and foreground. Even an inherited base font changes widget buttons and measured geometry. No frame-wide font/reset/box-sizing rule. |
| Plain question prose | `.practice-prose`: 16px system font, 1.6 line height, dark-green foreground. | Opt in only unadorned top-level or direct `.PGML` paragraphs without protected/complex descendants. Authored classes/inline styles and widget/graph/table/diagram paragraphs are not opted in. |
| Ordinary native answers | `.practice-answer`: 16px text, 48px minimum height, modest padding/margins, border/background/radius and maximum width; textarea minimum 108px. | Only eligible enabled native PG answers outside protected structures, tables and inline-styled fields. Preserve `name`, `id`, `type`, `size`, options, labels, values, duplicate order, and evaluator syntax. |
| Native choices | Reviewed radio/checkbox controls use a 24px minimum control size and application accent. Associated single-control labels can receive `.practice-choice-label` (inline-block, 44px minimum height). | Keep the actual input and label relationship and option values/order. Do not rebuild choice markup as generic buttons or apply these rules inside widgets. New label layouts still require review. |
| Table/matrix answers | Keep upstream input sizing, padding, font and table display. Eligible fields may receive only `.practice-focus` for a visible focus ring/scroll margin. | Do not force widths, flex/grid layout, cell display, brackets or fixed touch dimensions. The tested matrix is nine scalar fields in a 3x3 table, not every matrix editor. |
| Application feedback | `[data-practice-feedback]`: spacing, semantic state colors, readable wrapped text, border/radius and system font. | Style only our generated feedback nodes; keep canonical text/reviewed notation ([feedback rules](FEEDBACK_PRESENTATION.md)), status labels, accessible descriptions/invalid markers, and the widget adapter's placement/focus relationships. Color alone must not communicate correctness. |
| Ordinary mathematics | `.practice-math`: overflow handling and focus ring for long expressions. | Mark MathJax outside protected widgets only. Preserve generated SVG, assistive MathML, delimiters, font metrics and mathematical color annotations. Do not target glyph paths or resize every SVG. |
| PG widgets and diagrams | Upstream styles/scripts own graph canvases, axes, toolbar/icon geometry, editors, scaffold sections, images, and their internal labels. | Preserve structure, selectors, inline dimensions/transforms, SVG viewBox/paint, asset URLs, hidden controls, initialization order and interaction state. No global `input`, `button`, `label`, `p`, `a`, `svg`, `table`, `.collapse`, or `mjx-container` appearance reset. |

Approved renderer stylesheets load first, in their preserved dependency order. The dedicated application exercise stylesheet loads afterward, but targets only its own marker classes/data attributes. PG body styles and authored inline rules remain part of the cascade: this is a compatibility policy, not a CSS sanitizer or a promise to override every author's design. Do not add `!important` to win a styling conflict; review the fixture and narrow the rule.

## Protected selectors and opt-outs

The classifier excludes `.graphtool-outer-container`, `.jxgbox`, `.mq-editable-field`, `.mq-math-mode`, contenteditable editors, `[role="grid"]`, and `[data-practice-preserve-style]` ancestry. Table controls and inline-styled controls retain their appearance. Math overflow classes are not added inside graph/editor/opt-out regions.

Preserve PG's generated `AnSwEr*` fields, `MaThQuIlL_*`/`previous_*` helpers, `*_graphbox` and graph board IDs, `.gt-*` controls, JSXGraph SVG structure, Bootstrap scaffold collapse/accordion classes/data attributes, checked/selected/disabled states, label associations, and source order. Our classes are additions; they are not replacements for upstream selectors.

An approved custom renderer fragment can wrap a specialized region in `data-practice-preserve-style` to opt out of application control/prose/math appearance rules. This does not bypass sandboxing, ownership, answer validation or asset policy. It is not a student API parameter. Unknown editor/widget structures need a representative fixture and explicit review before catalog enablement; matching a native input alone does not prove the whole widget can be restyled.

## Small override set and change rules

Edit `picker.css` for the shell. Edit `exercise.css` for exercise appearance; keep styles out of grading, resource resolution and bridge code. The frame loads the fixed `/assets/exercise.css` static route through the existing stylesheet CSP permission. Missing exercise CSS uses the same fail-closed resource error/retry path as other required dependencies. No renderer token, path, seed or additional network permission is introduced.

Use `--practice-text`, `--practice-surface`, `--practice-border`, and `--practice-focus` only for application-owned prose/controls/feedback. Keep contrast, visible focus, 16px native answer text and comfortable touch targets. Do not override Bootstrap `--bs-*`, graph palettes, MathJax font configuration or author diagram colors through a shared theme token. Forced-colors overrides are restricted to our native controls/feedback/focus indicators.

Before widening a selector, identify its owner and the affected PG structure. Add a fixture if the interaction is not represented. Verify names/values and grading/restoration, compare protected computed geometry with application overrides disabled, inspect both wide and narrow layouts, and retain keyboard/semantic checks. Never fix overflow by hiding content, scaling a graph canvas/SVG, shrinking every input, flattening a matrix table or forcing `display:block` onto widget children.

## Verification and remaining layout work

The style audit runs **before answer entry**, then the same operator runner verifies blank/wrong/partial/correct grading, feedback, clearing and restoration. It checks protected table controls, GraphTool containers/buttons/boards and SVG viewports/paint with the exercise stylesheet enabled versus disabled. The browser suite additionally checks shell isolation, author opt-outs, style classification, focus/forced colors, native touch sizing and preserved fixture geometry.

Viewport measurements at 820px and 320px distinguish the parent page from the frame's document. The shell must not overflow horizontally. A fixed-width exercise may still need horizontal scrolling inside its frame: the matrix, static image and GraphTool currently do at the narrow viewport. That is recorded evidence, not mobile approval. Keep upstream geometry until a separate per-widget responsive/scroll design has been tested; do not label all eleven fixtures fully mobile-ready.

The [widget verification](WIDGET_VERIFICATION.md) still applies: automatic scaffold advancement/relocking remains a separate task. Only `dot-product-01` is enabled in the default student catalog. Screen-reader listening and complete keyboard/mobile acceptance for every candidate remain promotion gates.

Current validation: **77 server tests**, **28 browser checks**, live API smoke (one public exercise), and eleven style-audited owned widget cases. All eleven reached correctness 1 and cleared to 0, preserving restoration behavior. Nine protected matrix entries and the GraphTool container/buttons/boards/SVG passed computed-style comparisons. This does not replace visual review or promote the fixtures.

Feedback notation overrides are limited to .field-feedback-message / #result-message and their generated .feedback-math wrappers: preserve line breaks, bound width and provide horizontal scrolling without editing MathJax glyphs, assistive MathML or PG widget descendants. A generic feedback span selector must not apply block layout to MathJax descendants. The full seeded gate reruns the protected-geometry audit for this change.
