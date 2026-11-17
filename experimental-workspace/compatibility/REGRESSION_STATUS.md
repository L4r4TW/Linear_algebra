# Compatibility regression results

Observed: 2026-11-16T23:41:20.437Z. Scope: complete default matrix.

Result: **FAIL**; 44/44 cases completed. 16 cases retain documented limitations.

A passing flow does not approve every capability or enable student catalog entries.

| Exercise | Seed | Viewport | Checks | Status | Unsupported or limited capabilities |
| --- | --- | --- | --- | --- | --- |
| dot-product-01 | 1234 | desktop | 9/9 | passed | None observed |
| dot-product-01 | 1234 | mobile | 9/9 | passed | None observed |
| dot-product-01 | 4321 | desktop | 9/9 | passed | None observed |
| dot-product-01 | 4321 | mobile | 9/9 | passed | None observed |
| compat-calculus-numeric-01 | 1234 | desktop | 9/9 | passed | None observed |
| compat-calculus-numeric-01 | 1234 | mobile | 9/9 | passed | None observed |
| compat-calculus-numeric-01 | 4321 | desktop | 9/9 | passed | None observed |
| compat-calculus-numeric-01 | 4321 | mobile | 9/9 | passed | None observed |
| compat-calculus-formula-01 | 1234 | desktop | 9/9 | passed | None observed |
| compat-calculus-formula-01 | 1234 | mobile | 9/9 | passed | None observed |
| compat-calculus-formula-01 | 4321 | desktop | 9/9 | passed | None observed |
| compat-calculus-formula-01 | 4321 | mobile | 9/9 | passed | None observed |
| compat-matrix-grid-01 | 1234 | desktop | 9/9 | passed-with-limitations | NARROW_FRAME_SCROLL |
| compat-matrix-grid-01 | 1234 | mobile | 9/9 | passed-with-limitations | NARROW_FRAME_SCROLL |
| compat-matrix-grid-01 | 4321 | desktop | 9/9 | passed-with-limitations | NARROW_FRAME_SCROLL |
| compat-matrix-grid-01 | 4321 | mobile | 9/9 | passed-with-limitations | NARROW_FRAME_SCROLL |
| compat-statistics-radio-01 | 1234 | desktop | 9/9 | passed | None observed |
| compat-statistics-radio-01 | 1234 | mobile | 9/9 | passed | None observed |
| compat-statistics-radio-01 | 4321 | desktop | 9/9 | passed | None observed |
| compat-statistics-radio-01 | 4321 | mobile | 9/9 | passed | None observed |
| compat-algebra-checkbox-01 | 1234 | desktop | 9/9 | passed | None observed |
| compat-algebra-checkbox-01 | 1234 | mobile | 9/9 | passed | None observed |
| compat-algebra-checkbox-01 | 4321 | desktop | 9/9 | passed | None observed |
| compat-algebra-checkbox-01 | 4321 | mobile | 9/9 | passed | None observed |
| compat-economics-popup-01 | 1234 | desktop | 9/9 | passed | None observed |
| compat-economics-popup-01 | 1234 | mobile | 9/9 | passed | None observed |
| compat-economics-popup-01 | 4321 | desktop | 9/9 | passed | None observed |
| compat-economics-popup-01 | 4321 | mobile | 9/9 | passed | None observed |
| compat-calculus-scaffold-01 | 1234 | desktop | 9/9 | passed-with-limitations | STAGED_CONTENT_REQUIRES_REFRESH |
| compat-calculus-scaffold-01 | 1234 | mobile | 9/9 | passed-with-limitations | STAGED_CONTENT_REQUIRES_REFRESH |
| compat-calculus-scaffold-01 | 4321 | desktop | 9/9 | passed-with-limitations | STAGED_CONTENT_REQUIRES_REFRESH |
| compat-calculus-scaffold-01 | 4321 | mobile | 9/9 | passed-with-limitations | STAGED_CONTENT_REQUIRES_REFRESH |
| compat-algebra-image-01 | 1234 | desktop | 9/9 | passed-with-limitations | NARROW_FRAME_SCROLL |
| compat-algebra-image-01 | 1234 | mobile | 9/9 | passed-with-limitations | NARROW_FRAME_SCROLL |
| compat-algebra-image-01 | 4321 | desktop | 9/9 | passed-with-limitations | NARROW_FRAME_SCROLL |
| compat-algebra-image-01 | 4321 | mobile | 9/9 | passed-with-limitations | NARROW_FRAME_SCROLL |
| compat-calculus-graph-01 | 1234 | desktop | 9/9 | passed | None observed |
| compat-calculus-graph-01 | 1234 | mobile | 9/9 | passed | None observed |
| compat-calculus-graph-01 | 4321 | desktop | 9/9 | passed | None observed |
| compat-calculus-graph-01 | 4321 | mobile | 9/9 | passed | None observed |
| compat-algebra-graphtool-01 | 1234 | desktop | 9/9 | passed-with-limitations | NARROW_FRAME_SCROLL |
| compat-algebra-graphtool-01 | 1234 | mobile | 8/9 | failed | MOBILE_GRAPH_TOUCH_GRADING, NARROW_FRAME_SCROLL |
| compat-algebra-graphtool-01 | 4321 | desktop | 9/9 | passed-with-limitations | NARROW_FRAME_SCROLL |
| compat-algebra-graphtool-01 | 4321 | mobile | 9/9 | passed-with-limitations | NARROW_FRAME_SCROLL |

## Known capability boundaries

- **STAGED_CONTENT_REQUIRES_REFRESH** (unsupported): Newly unlocked or relocked PG stages are applied only after an explicit refresh; the live frame is preserved after grading. Affected fixtures: compat-calculus-scaffold-01.
- **NARROW_FRAME_SCROLL** (limited): The upstream matrix, static image, graph, or elasticity/dropdown layout can exceed a narrow frame, including touch-mobile layouts. Functional scrolling is retained; fitting without horizontal scrolling is not approved. Affected fixtures: compat-matrix-grid-01, compat-algebra-image-01, compat-algebra-graphtool-01, compat-economics-popup-01.
- **MOBILE_GRAPH_TOUCH_GRADING** (unsupported): For fixture seeds 1234 and 4321, touch-mobile point placement does not reach the expected full score. Coordinate/interaction behavior needs investigation; these cases remain failed and are not waived by this policy. Affected fixtures: compat-algebra-graphtool-01.

## Unverified or manual review

- **screen-reader-listening** (manual): Automated focus and semantics checks do not replace NVDA/VoiceOver listening.
- **physical-mobile-devices** (manual): Touch and viewport emulation are tested in Chromium; physical device keyboards and browsers still need review.
- **all-PG-widgets-and-macros** (unsupported): The selected fixtures do not cover file uploads, arbitrary custom editors, compound matrix editors or every GraphTool tool/evaluator.

## Failures

- CASE_FAILED:compat-algebra-graphtool-01:1234:mobile
