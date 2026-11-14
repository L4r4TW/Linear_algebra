# Controlled exercise assets

The experimental application preserves reviewed renderer dependencies inside the existing opaque iframe. It does not expose the renderer as a general file proxy. Implementation: [exercise-assets.mjs](workspace/server/exercise-assets.mjs), [http-app.mjs](workspace/server/http-app.mjs), and [exercise-frame.js](workspace/public/exercise-frame.js).

## Request and execution flow

1. The existing session API verifies anonymous browser ownership and loads/restores/grades using private server-held renderer tokens.
2. The server reads dependency tags from the trusted renderer head, projects only `#problem_body`, and rewrites approved image aliases and asset references. It never copies the outer form, head inline configuration, hidden JWT controls, or editor/submit helpers into the frame.
3. Each presentation receives a random 256-bit capability. Public HTML and dependency metadata contain only `/assets/exercise/<capability>/<index>` URLs, not renderer paths, seeds, JWTs, alias maps, or upstream query strings.
4. The frame emits reviewed stylesheet/script tags in their original relative order and retains each script's `defer` behavior. Blocking dependencies execute before body parsing; deferred dependencies execute after parsing and before PG's existing DOMContentLoaded initializers. Body inline scripts remain in the projected body.
5. The backend resolves each opaque index to its server-recorded resource, fetches without cookies or redirects, and serves the appropriate fixed MIME type. The browser never contacts the renderer or CDN directly for these assets.

The response shape is `exercise.resources: {assets: [], dependencies: [{kind, url, defer}]}`. The old upstream asset list is no longer returned. The existing MathJax proxy and application MathJax setup remain separate; a duplicate upstream MathJax configuration is not loaded.

## Reviewed policy

| Resource | Approved source |
| --- | --- |
| Base JavaScript | Renderer jQuery distribution and Bootstrap bundle. |
| PG JavaScript | Hashed GraphTool core/point/quadratic/cubic/interval scripts, Scaffold, and details-accordion. |
| Stylesheets | Renderer Bootstrap and hashed PG Problem, GraphTool, and Scaffold styles. |
| Graph engine | Exactly JSXGraph 1.7.0 `jsxgraphcore.min.js` and `jsxgraph.min.css` from jsDelivr, verified against fixed SHA-256 hashes before serving. |
| Problem images | Renderer-generated/library-image aliases under `/pg_files/tmp/images/` with approved image extensions. Exact alias lookup is supported; renderer regex mappings are not executed. |
| Stylesheet images | The reviewed GraphTool toolbar SVG filenames under its `images/` directory, rewritten into the same capability. Inline data images remain usable. |

`@import` and unapproved stylesheet URL references are removed/replaced with an empty data URL. This is a restricted resource policy, not a general CSS sanitizer. Fonts, arbitrary CSS imports, arbitrary external URLs, editor scripts, original form/submit helpers, upstream MathQuill initialization, and general renderer filesystem access remain unsupported. Required unapproved body image/script URLs fail preparation with a friendly error. Unreviewed head dependencies are excluded; their widgets require a new compatibility review.

The graph engine's hashes are part of the source policy. Updating that dependency requires reviewing the new bytes, updating the hashes, and repeating the graph interaction checks. The fixed CDN must be reachable by the backend on a cache miss; failure or an integrity mismatch blocks exercise readiness.

## Isolation, lifetime, and failure behavior

- The iframe keeps `sandbox="allow-scripts"` with an opaque origin, no form submission, and no same-origin access. CSP continues to block network connections, arbitrary origins, and external fonts. Parent-origin script/image loading remains constrained by the application routes and resource registry; stylesheets from the application origin are now permitted.
- GraphTool reads a help preference from `localStorage`, which opaque frames cannot use. A frame-local, ephemeral adapter accepts only `GraphToolHelpEnabled`. It neither accesses application storage nor persists across frame replacement. Other widget storage contracts are not implemented.
- Capabilities are short-lived read grants, not renderer tokens. They are minted only by an owned session response, have a one-hour lifetime, and grant access only to registered resource indices. Opaque iframe subresources do not need the ownership cookie. Sharing an asset capability shares read access to that limited manifest until expiry/eviction; it grants no session or grading access.
- The registry is process-local: at most 64 manifests, 128 resources per manifest, 2 MiB per fetched resource, 32 MiB cached bytes, and a 15-second upstream deadline covering headers/body. Old manifests are evicted when necessary. Normal app restart loses capabilities; restoring the owned session mints new ones without changing its seed/token state.
- Resource responses use `private, no-store`, `nosniff`, a no-referrer policy, permissive read CORS for opaque consumers, and a sandboxed/default-deny response CSP for direct navigation. No upstream cookies, headers, private errors, or redirects are relayed.
- Failed dependencies, body initialization errors, and failed problem images report a session-bound frame error. The parent shows a retry action and keeps grading disabled, including after the loading deadline. Retry restores the same owned session to mint fresh capabilities. Math-formatting fallback also waits for the frame's other load work to complete.
- Grading still preserves the live frame and unsaved edits. Newly revealed scaffold stages returned after grading are **not** reconciled into that frame yet. Loading dependencies fixes collapse behavior, not the post-grade content lifecycle.

## Verification and continuation

Run the server suite, API smoke, and browser suite using the commands in [README.md](README.md). The operator [compatibility probe](compatibility/README.md) now uses this registry and the actual frame builder while keeping fixture IDs outside the student allowlist. The original [observations.json](compatibility/observations.json) remains the pre-loader baseline; post-loader results are recorded separately in [asset-loading-observations.json](compatibility/asset-loading-observations.json).

The study covers sampled behavior at seed 1234 and generation/blank grading/restoration at 4321. Images, scaffold toggling, graph initialization, icon delivery, and hidden-state transport are checked independently of score. This does not approve all fixtures for students or establish full correct-answer/mobile coverage for GraphTool. Add those gates and staged-content reconciliation before expanding the public catalog.