# Student-facing catalog metadata (task 5.4)

Defined 2026-11-15 after taxonomy design `1818f7c`. Builds on [the audit](CATALOG_MODEL_AUDIT.md), [exercise identity](EXERCISE_IDENTITY.md), and [topic taxonomy](TOPIC_TAXONOMY.md). This task supplies the metadata specification, executable reference projection/search, eleven examples and a local card preview. It does not integrate a new API, import the whole library, apply SQL or change the live six-exercise picker.

## Inspect the proposed cards

Open [catalog-metadata-preview.html](catalog-model/catalog-metadata-preview.html) in a browser. It is a generated, self-contained local preview with search, an explicit unavailable-example filter, topic breadcrumbs and source-credit disclosures. It defaults to six examples that the live local eligibility gate currently permits; eleven are visible when unavailable examples are included. It cannot start sessions, grade answers, save progress or enable entries. Its availability is a timestamped snapshot, not a live API.

Try “scalar product” to find dot product, or “matrix” after enabling unavailable examples. Unknown exercise language, difficulty and time remain unknown in details. The preview has no external resources/network requests on load; source-credit links navigate only after a user chooses them. The live practice app remains at http://localhost:3100.

## Data layers and ownership

| Layer | Proposed records and provenance | Access / update behavior |
| --- | --- | --- |
| Raw imported metadata | Source-version ID, declaration name/occurrence/line, original argument/text, parser version and diagnostics; source DESCRIPTION and bibliography retained separately | Operator/import data. Immutable source observations, not display HTML or a public search document. Unknown syntax remains raw and unevaluated. |
| Metadata candidate | Exercise/source-version applicability, field, value, locale when relevant, origin/reference, review state, time and review method | Imported and derived suggestions remain proposed. A new import creates candidates without overwriting editorial decisions. Do not treat a classifier confidence as approval. |
| Editorial selection/override | Selected candidate or explicit value, source-version applicability, reviewer/service rule version, rationale, approved locale and supersession history | Backend/editorial writes only. Review state and metadata revisions are separate from compatibility/activation. Keep prior selections and provenance instead of destructive replacement. |
| Effective metadata revision | Resolved selections, metadata revision ID, matching source identity, taxonomy release and approved output locale | Atomically published snapshot for queries/cache invalidation later. A selection for an old source hash becomes stale unless an explicit reviewed reuse rule establishes applicability. |
| Student projection | Allowlisted display values, topic summaries, public credits, neutral rights status and separately computed availability | No raw source declarations, provenance internals, verification seeds, renderer paths, capabilities, private ownership, session tokens, student pairs or instructor answers. |
| Search projection | Approved effective title, description, reviewed search terms and curated topic labels, with exercise identity | Derived index; never search arbitrary PG text, solutions, raw HTML, renderer tokens or student submissions. Operator source/path search is a separate authorized feature. |

Use the stable exercise identity and immutable source versions from task 5.2. Current examples refer to permanent legacy IDs because no UUID migration is applied. A metadata revision or title change is not a new exercise and does not rewrite student attempts. Database constraints, publication transactions and private access policies remain tasks 5.6–5.8.

## Field specification

| Field | Effective value / bounds | Source and missing-value rule |
| --- | --- | --- |
| Title | Required plain text, 1–160 characters after trimming | Prefer an approved locale-specific editorial/legacy title. Source DESCRIPTION or a curated section can produce a proposed title for review, not automatic approval. Generic fallback is “Practice exercise”; never use a filename, path, textbook title or random question parameters. |
| Description | Optional plain text, up to 600 characters | Short learning-task summary independent of generated seed. No answers, solved values, fabricated explanation or promised interaction absent from the source. Unknown/explicitly empty is null; do not fall back to raw PG/HTML. |
| Search terms | Up to 20 approved plain terms, 1–80 characters each | Reviewed keywords/synonyms; preserve original KEYWORDS separately. “Scalar product” is useful for the selected dot-product exercise; do not indiscriminately equate dot product with cross/vector product. |
| Metadata locale | Locale of the actual display text | Distinct from requested interface locale and exercise content language. The reference is an English preview; unsupported requested locales receive an explicitly English generic fallback, not a claim of translated content. |
| Content language | Approved BCP 47 language tag or null | Source language declarations are candidates and may be missing. English titles/menus, institution and repository defaults do not prove English problem content. Unknown stays null, not an invented en value. |
| Difficulty | Approved rating plus scale ID, otherwise null | Versioned scale `practice-difficulty-v1` uses integers 1–5 only when reviewed/calibrated by a recorded method. Source Level is preserved as authored data, not cast to this rating. Source values include 6/8; even values 1–5 are not automatically comparable. |
| Estimated time | Approved positive number of minutes, otherwise null | Require a recorded estimation method/sample and scope. The reference bounds candidates at 480 minutes as a payload sanity limit, not evidence of normal completion time. Zero is not “unknown”; it is invalid. Never infer duration from file length, answer count or Level. |
| Topics | Approved published section assignments plus subject/chapter/section labels and context | Follow task 5.3; cross-listing does not duplicate catalog identity. Preview uses explicitly unpublished design assignments; live publication remains separate. |
| Problem contributors | Credited names/roles plus evidence, potentially empty | Preserve author/adaptation credits as credited. Do not invent authors from directory names, institution or textbook AuthorText fields. Existing catalog comment-based credits are retained even when the narrow header collector finds no Author tag. |
| Institution | Optional credited institution, separate from author | Preserve source/legacy provenance; unknown stays null. An institution is not automatically an author or rights holder. |
| Library/source credit | Provider label and an approved public attribution URL | Keep the current OPL source attribution. Public source-credit URLs are an intentional exception to hiding source locations: they refer to public repository credit, never a renderer endpoint, local path, opaque asset capability or token-bearing URL. |
| Rights status | Independent evidence/review state; reference defaults review-required | Metadata/compatibility approval is not permission to redistribute or deploy commercially. Preserve notices and uncertainty without inventing a universal license clearance badge. |
| Availability | Server-computed practice state plus friendly label | Never derive from metadata completeness, search ranking, source Level or an enabled-looking client field. The examples read the existing fail-closed catalog gate; future deployment-specific rights policy remains separate. |

Reference budgets limit public payloads and uncontrolled text; importer diagnostics must preserve oversized/raw source values rather than silently truncate and call them reviewed. Language values are canonicalized only for an approved display/search field, not by editing source evidence. Some mathematical symbols need subject-specific search aliases later; plain metadata token search does not establish mathematical equivalence.

## Review, fallback and update rules

Candidate review states are missing, proposed, approved, rejected and stale. Absence and an explicit editorial decision to omit a description are distinguishable in storage, even though both may project null. The example field records keep origin/reference/locale and review state; later persistence adds immutable reviewer/time/method history rather than claiming the example JSON is a complete editorial database.

An effective selection must match the exact source identity, applicable locale, approval state and value bounds. The reference rejects stale-source selections, unapproved titles, invalid ratings/durations and unsafe credit links. Source updates create new candidates and mark old selections for applicability review; they never overwrite a corrected title or automatically carry a manually reviewed learning claim into a changed problem. Approved versioned rules can establish reuse at scale with provenance.

Locale fallback is explicit. For the initial English interface, approved English records supply the display text; if no applicable title exists, use the English generic fallback and identify its actual metadataLocale independently of requestedLocale. ContentLanguage remains independent. A later multilingual UI may add approved fallback chains and translated labels; it must not infer translated problem content or silently label English text as another language.

Textbook TitleText1/AuthorText1/edition/problem references belong to bibliographic records. They are neither friendly exercise titles nor proof of problem authorship. The audit found no standard Title declarations in the curated corpus, so the importer must tolerate missing friendly titles and stage reviewed/generated suggestions without fabricating approval.

## Attribution and rights evidence

The [source inventory](catalog-model/metadata-source-observations.json) verifies all eleven PG file hashes against the pinned catalog and records selected header declarations, root OPL_LICENSE hash, and candidate ancestor README/LICENSE/COPYING/COPYRIGHT notices. It does not execute PG, evaluate metadata expressions or inspect student sessions.

No Language declaration was recognized in these eleven examples; language remains null for all of them. Ten contain source Level declarations, but difficulty remains null for all eleven. None has a reviewed completion-time estimate. This is a narrow source sample, not a new full-library prevalence survey.

Notice discovery is not a legal determination or complete license parser. Zero ancestor candidates does not mean no restrictions or notices exist; individual trailing notices, auxiliary assets/custom macros, directory conventions and alternatives still need review. README candidates are evidence to inspect, not automatically license texts. Keep the source default, any overrides, scope, source location/hash, reviewer/method and unresolved status separately. Do not collapse mixed source/asset notices to a single SPDX identifier or silently call the entire OPL unrestricted. Existing local availability is not changed by this task.

The public preview retains the catalog's credited contributor strings and known institutions. Empty contributor arrays say “Problem author not recorded”; they do not credit a textbook author as a substitute. An optional public source URL is limited to the exact pinned OPL GitHub source location, with HTTPS, no custom port/user information/query/fragment. Unknown or private links become null. Future attribution details may expose reviewed public notices without exposing renderer URLs or privileged source/answer payloads.

## Search and frontend behavior

- Search only effective approved fields and curated topic labels. Imported KEYWORDS/description text stays out until reviewed or accepted by a versioned editorial rule. Do not parse arbitrary Perl with eval or split quoted keyword lists blindly on commas.
- The reference uses Unicode NFKC/case normalization for a derived index, word prefixes and AND matching across at most twelve query terms. This changes neither stored labels nor source identity. Ranking weights are title 5, approved terms 4, topic labels 3, description 1, with stable ID tie-breaking. Full-library database search, query limits, pagination and query plans remain task 5.7/importer work.
- Default results include only currently playable exercises. An explicitly labeled unavailable/indexed view can show other catalog metadata with neutral availability; it cannot start sessions or turn a metadata record into approval.
- Return each exercise once, including when several topic assignments match. Never treat assignment counts or ratings as student progress/mastery. Keep selected topic context for breadcrumbs as specified in task 5.3.
- Homepage cards and results use a title, concise description and topic summary. Put attribution, language and optional rating/time in details; hide optional badges when unknown rather than show zero, “easy” or a fabricated minute count. The preview explicitly spells out unknowns for review.
- Labels/descriptions are text, not trusted HTML. Do not auto-render PG metadata markup or interpolate it into innerHTML. Correct-answer values, source question bodies and arbitrary feedback do not belong in search snippets.
- Expose meaningful empty/loading/error states when connected to APIs later. Keyboard and mobile behavior belongs to the frontend contract; the local preview checks a small subset and is not a full application accessibility acceptance run.

## Executable examples and preview verification

[metadata-examples.json](catalog-model/metadata-examples.json) covers all eleven current IDs. Title/description selections copy existing catalog labels with legacy provenance; search terms are explicit editorial design examples. Approved states inside this design-only fixture demonstrate the projection contract and do not publish new editorial decisions, taxonomy assignments or capability approval. Content language, difficulty and time are intentionally missing. No UUIDs are allocated.

[metadata-contract.mjs](catalog-model/metadata-contract.mjs) implements the reference allowlisted projection, search and preview construction outside workspace/public and server. [metadata-public-examples.json](catalog-model/metadata-public-examples.json) is reviewable example DTO output, not an API response or new allowlist. The private source observations/fixtures are never loaded by the live student application.

From the repository root, with the existing workspace/renderer running:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/catalog-model/verify-metadata-contract.ps1 -CheckPreview
```

Omit -CheckPreview for source/projection checks only. The optional browser check needs the existing Playwright QA image; if absent, build it from experimental-workspace with `docker build -f browser-tests/Dockerfile -t linear-algebra-picker-qa .`. No browser source bind mount is required. The checker copies only sanitized artifacts back from container temporary storage; re-running changes their timestamps, so review the diff.

Fresh results: **eleven source hashes/inventories and thirteen contract scenarios pass**. Cases cover approved synonyms, availability filtering, query matching, cross-list deduplication, textbook exclusion, proposed/raw metadata rejection, stale-source fallback, unknown ratings/language/time, locale and private URL handling, missing authors, secret-field exclusion, neutral rights status and inert hostile-looking text. See [contract observations](catalog-model/metadata-contract-observations.json).

The separate [Chromium preview check](catalog-model/check-metadata-preview.mjs) passes default six-card and optional eleven-card views, search, keyboard disclosure/filtering, unknown-value display, CSP without errors, no load-time network requests and 360 px layout. See [preview observations](catalog-model/metadata-preview-observations.json). It runs with no Docker network and evaluates no exercise scripts. Actual screen-reader listening, physical mobile devices, live application integration and full compatibility verification are not rerun here. Existing app test counts remain prior evidence.

Next: **5.5 — model compatibility evidence and activation separately**, preserving the existing fail-closed rules while designing full-library verification/rollout records. Then private student relationships (5.6), database/query constraints (5.7), and additive migrations/validation (5.8) can make this model operational before importer/discovery integration.
