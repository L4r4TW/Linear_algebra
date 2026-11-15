# Existing models and OPL metadata audit (task 5.1)

Audited 2026-11-15 against repository baseline `fde4a2b`, the running experimental workspace and the installed OPL checkout. This is a discovery/mapping deliverable, not a database migration or an importer. Proposed entity names below are conceptual and must be finalized in tasks 5.2–5.8.

## Scope and evidence

- Read the checked-in Supabase base schema, all three migrations, seed data, TypeScript database types and active practice component. No remote Supabase connection, credentials or deployed data were inspected. Applied migration state, actual grants, row counts and extra production policies remain unknown.
- Read the experimental catalog, evidence, profile, activation batch, publisher, sessions, submission validator, draft store and HTTP projection. Live catalog assessment confirms 11 indexed / 6 enabled and matching runtime evidence. No grade, session creation, restart, withdrawal or approval was performed.
- Inspected private session records only through aggregate schema counts: 945 JSON filenames existed; the first 100 matching filenames in lexical order were parsed, with no invalid JSON in that sample. All sampled records were version 1 and had owner hashes; 96 had submission-state fields, 44 had a latest submission, and 4 retained the legacy token-only shape. These are development/QA records, not a student census or a complete validity audit. No filenames, IDs, answers, seeds, cookies, hashes or token values are included here.
- Scanned installed regular PG files without evaluating Perl. [Survey script](catalog-audit/survey-opl.mjs) and [sanitized observations](catalog-audit/opl-metadata-observations.json) record the method, counts, taxonomy hashes and source-only examples. The scan excludes `.git` and does not follow symlinks. A filesystem PG occurrence is not a unique verified exercise.
- Installed OPL HEAD is `0d42812d6d02960c846fc0f89215e0d4f1e761b1`; a separate tracked-file status check returned no changes. The survey is a working-tree scan and does not establish the absence of untracked files. Library/renderer sources stay in Docker, outside Google Drive.

Upstream documents were read from the installed pinned checkout: [README and repository-area definitions](https://github.com/openwebwork/webwork-open-problem-library/blob/0d42812d6d02960c846fc0f89215e0d4f1e761b1/README.md), [OPL_LICENSE](https://github.com/openwebwork/webwork-open-problem-library/blob/0d42812d6d02960c846fc0f89215e0d4f1e761b1/OPL_LICENSE), [Taxonomy](https://github.com/openwebwork/webwork-open-problem-library/blob/0d42812d6d02960c846fc0f89215e0d4f1e761b1/OpenProblemLibrary/Taxonomy), and [Taxonomy2](https://github.com/openwebwork/webwork-open-problem-library/blob/0d42812d6d02960c846fc0f89215e0d4f1e761b1/OpenProblemLibrary/Taxonomy2). The license file describes a default with possible alternative notices, including auxiliary assets/macros; this audit retains evidence and does not determine permission for a future deployment.

## Existing-data to platform-model mapping

| Existing data and exact fields | Proposed destination | Reuse / migration / gap |
| --- | --- | --- |
| Catalog v2 `id` (stable string) | Catalog exercise identity plus legacy ID/alias mapping | Preserve all current IDs and saved references. Existing Supabase exercises use UUIDs: do not cast strings to UUIDs or merge identities by title. Rename/duplicate rules are task 5.2. |
| `title`, `description` | Curated display metadata | Reuse the 11 reviewed labels. Record provenance and separate them from imported metadata; most source files cannot supply a ready-made friendly title. |
| `subject`, `topicId`, `topic` | Curated taxonomy nodes and exercise-topic assignments | Present catalog is flat and single-topic; no chapter, section IDs, localization, multiple assignments or mapping provenance. Preserve original OPL labels separately. |
| `source.repository`, `revision`, `path`, `sha256`, `url` | Source repository, import revision and immutable exercise-source version | Good baseline for provenance. Current entries overwrite one selected source identity; retain historical revisions and path aliases. Hash equality alone is not an identity policy. |
| `renderer.sourceFilePath` | Private source-to-renderer resolver | Keep distinct from repository path: current files use `OpenProblemLibrary/...` in source and `Library/...` in renderer requests. Contrib/Pending mappings and dependencies need explicit review; do not derive arbitrary HTTP paths. |
| `source.authors`, `institution`, `attribution`, `licenseEvidence` | Attribution records and license evidence attached to source/version/assets | Preserve notices and uncertainty. Free text is evidence, not a redistribution approval. Problem authors and textbook authors are separate. |
| `verification.seed`, `seeds` | Verification profile/test fixtures | Reuse public fixture seeds, never as ordinary session seed policy. Verification does not authorize play by itself. |
| `compatibility.status`, `requiredCapabilities` | Versioned capability requirements and computed assessment | Keep claims separate from assessment; evidence mismatch fails closed. Unknown requirements stay unverified. |
| Evidence envelope: version, observedAt, profileVersion, runtimeFingerprint, rendererRevision, sourceRevision | Verification run and immutable environment/profile identity | Retain provenance and timestamps; future model also needs explicit PG/dependency/asset identity instead of relying only on a renderer pin and local runtime hash. |
| Evidence per-entry source/path/capabilities and cases: verificationSeed, viewport, sourceVerified, phase, checks, scores, limitations, optional errors | Per-exercise verification cases and observed failures | Normalize for querying/history while preserving reviewed evidence. Current snapshot holds 44 cases, not historical runs or a scalable verification queue. |
| `activation.state`, `batchId`; active batches with profileVersion and exerciseIds | Activation batches, membership, withdrawal/history | Preserve explicit opt-in after verified assessment. Indexed, verified and enabled are distinct. Withdrawal retains source, evidence and student references. |
| Session v1 `id`, `exerciseId`, `seed`, `createdAt`, optional updatedAt | Private exercise session | Preserve same-session identity and seed. Records lack an explicit immutable source-version reference and renderer/PG revision; do not claim those can be reconstructed reliably from today's catalog. |
| Session `ownerHash` | Anonymous principal ownership, later account claim/link | Existing browser cookie is not a Supabase identity. Authenticate account claiming separately; unowned CLI records must not become student-owned by inference. |
| Session rendererSessionToken / rendererProblemToken | Backend-only renderer state | Preserve atomic token/result advancement and legacy compatibility. No public SELECT path or browser-readable table for tokens. Token lifetime/renewal and deployment storage policy remain decisions. |
| `submissionCount`, `lastSubmission` with id, number, submittedAt, fieldNames, ordered answers, score, feedback, fieldFeedback, optional feedbackVisibility | Latest accepted state plus future append-only PG attempts | Reuse score/feedback semantics and ordered repeated-name pairs. Only the latest attempt survives; earlier attempts and later drafts cannot be reconstructed. Suppressed public scores remain null even when a private score exists. |
| Tab draft v1: sessionId, exerciseId, baseSubmissionId/Number, answers, pending | Future private drafts with baseline and conflict version | Preserve field-contract/session binding and pending-grade reconciliation. Today sessionStorage is per tab, has no account/server identity or cross-device sync. A newer unrelated result wins; no live merge or old-conflict recovery UI exists. |
| Supabase `profiles` / auth.users | Existing account identities | Reuse account UUID relationships and username intent after policy review. Do not provision accounts or infer ownership during catalog import. |
| `units` → `themes` → `subthemes`, slugs/titles/positions | Existing authored-course hierarchy; candidate curated taxonomy mappings | Reuse course data intact. Seed units are “Vectors and spaces”, etc., not top-level math subjects. Each exercise has one mandatory subtheme; whole-library browsing needs unclassified entries and multiple topic assignments. |
| Supabase exercises: UUID, type, prompt/solution JSON, difficulty 1–5; migrated title/Markdown/choices/hints/tags/status/creator | Existing authored content, potentially a distinct provider/content type | Preserve functionality. Mandatory prompt/solution/difficulty/subtheme are a poor fit for PG: do not invent static solutions, calibrated difficulty or copy renderer HTML into authored Markdown. Published/draft is editorial state, not renderer compatibility. |
| Supabase attempts: UUID, user/exercise IDs, boolean is_correct, answer JSON, timestamp | Legacy attempts with explicit grading provenance | Keep historical rows, but do not relabel them renderer-verified. Active browser component calculates correctness and inserts it directly; boolean storage loses partial credit, invalid/unanswered/suppressed distinctions, session seed and source identity. |
| Practice sequence, bookmarks, server drafts, topic mastery | New models / later account-progress work | No dedicated tables or sandbox record relationships currently implement them. Define bounded set order/version and progress denominators; do not use catalog size or a count of attempts as mastery. |

## OPL inventory and classification coverage

| Source area | PG files | All three classification tags | Partial classification | No populated classification |
| --- | ---: | ---: | ---: | ---: |
| OpenProblemLibrary | 40,541 | 38,604 | 634 | 1,303 |
| Contrib | 29,624 | 22,717 | 4,620 | 2,287 |
| Pending | 6,969 | 5,305 | 749 | 915 |

An independent `find` count confirmed each source-area PG total. Across all areas: 88,022 regular non-Git files, 77,134 PG files, three skipped symlinks and 64,398 distinct PG byte hashes. There are 11,006 duplicate-hash groups and 12,736 PG occurrences beyond the first hash occurrence. Do not merge these automatically: source location, attribution, version and mathematical equivalence are separate concerns. The scan also records 87 classification-like lines outside its recognized declaration syntax.

These counts distinguish the repository's three source areas. Its own README describes OpenProblemLibrary as the library-browser corpus, Contrib as contributor-managed material and Pending as temporary editorial staging. Default “whole OPL” scope should explicitly identify the curated OpenProblemLibrary corpus. Retain Contrib as a separately identified discovery scope if desired; Pending should not silently become a stable student catalog. This scope decision does not require moving any source files.

| OpenProblemLibrary metadata | Files populated | Coverage of 40,541 PG files |
| --- | ---: | ---: |
| DBsubject | 39,234 | 96.8% |
| DBchapter | 39,085 | 96.4% |
| DBsection | 38,604 | 95.2% |
| Author | 19,583 | 48.3% |
| Institution | 26,998 | 66.6% |
| Level | 25,295 | 62.4% |
| KEYWORDS | 26,808 | 66.1% |
| Language | 35 | 0.1% |
| Title | 0 | 0.0% |
| TitleText1 | 19,563 | 48.3% |
| AuthorText1 | 19,216 | 47.4% |
| MLT | 14,226 | 35.1% |
| MO | 11,959 | 29.5% |
| DESCRIPTION / ENDDESCRIPTION marker pair | 19,673 | 48.5% |

Counts are files with at least one nonempty line-local declaration after outer-quote/placeholder handling. Missingness is not a rendering failure; complete tags are not proof of accurate classification. See JSON for empty/repeated tags, authored subject/Level values and parser limitations.

Both `OpenProblemLibrary/Taxonomy` and `Taxonomy2` exist. The tab-indentation scan finds 30 subjects / 1,347 distinct section triples in Taxonomy and 31 / 1,506 in Taxonomy2. Only 28,054 of 38,604 complete OpenProblemLibrary classifications exactly match Taxonomy; 28,055 exactly match Taxonomy2. Thus a populated triple must not automatically be treated as a canonical chooser assignment. This scan does not adjudicate whether an unmatched triple is a typo, alias, outdated label or a valid extension. Taxonomy2 even retains a literal subject label `Precalculus <<<`; select/version a reviewed taxonomy instead of automatically preferring the larger file.

Source Level values include 6 and 8 as well as 1–5, and 208 OpenProblemLibrary files repeat Level declarations. The current database's mandatory 1–5 difficulty cannot receive those values losslessly. Raw subject variants also differ by case (for example Linear algebra / Linear Algebra). The JSON report represents value frequencies as arrays to preserve case-distinct labels across consumers.

### Interpretation for taxonomy and UX

- Source `DBsubject` / `DBchapter` / `DBsection` naturally supply the three chooser levels. Keep raw source labels, hierarchy/version and provenance before mapping them into friendlier subjects, chapters and sections. Typo/case/alias normalization must be explicit; never discard unmatched exercises.
- The existing dot-product exercise demonstrates why raw and curated taxonomies differ: OPL tags it as Geometry → Vector geometry → Dot product, length, and unit vectors, while our catalog presents Linear algebra → Dot product. Both descriptions can be retained through separate source classification and curated assignments.
- `DESCRIPTION` is source-authored text, sometimes markup or a generic statement; it is not guaranteed to be a polished title. `TitleText1` / `AuthorText1` refer to textbooks. `Author` is the problem attribution; an institution or containing directory is not proof of authorship.
- Preserve raw KEYWORDS syntax rather than splitting blindly on commas. Metadata can contain quotes, lists, repeated values, nonstandard spacing and incomplete declarations. A lexical scan is evidence of coverage, not a production PG metadata parser.
- `Level` needs a documented mapping, not a direct assignment to the existing mandatory difficulty 1–5. Missing language, difficulty, estimated time or learning objectives remain unknown.
- Homepage and chooser counts must distinguish indexed from playable entries. Public discovery currently exposes only id/title/topicId/topic/description for eligible entries; there is no chapter/section tree, pagination, search, subject summary or availability aggregation.
- “Exercise 4 of 20” requires a real stored practice-set sequence; the current latest submission count is an attempt count, not a position or completion measure. Continue practicing needs owned session discovery/account persistence, not a shared last-session pointer.

## Reusable contracts and constraints

1. **Catalog gate:** [exercise-catalog.mjs](workspace/server/exercise-catalog.mjs) and [catalog-compatibility.mjs](workspace/server/catalog-compatibility.mjs) are the reusable eligibility contract. Current live counts: 7 verified claims, 2 limited and 2 unsupported; only 6 enabled. The verified economics entry is outside the active batch. The full 42/44 gate retains both failed mobile GraphTool cases under its unsupported assessment; no status is waived.
2. **Publisher is fixture-bound:** [build-catalog.mjs](compatibility/build-catalog.mjs) reads the eleven-entry operator manifest, a hard-coded friendly-topic map, fixed profile and complete report. It is not an OPL metadata importer. A separate import staging model and scalable publisher/queue are needed; preserve the existing oracle/calibration and privacy boundaries.
3. **Evidence freshness:** runtime/profile/source changes invalidate approval. Catalog data and activation are deliberately excluded from the runtime fingerprint. The current evidence has one pinned source revision and renderer revision; it cannot express mixed historical source deployments, an import audit trail, concurrent version approval or asset-version provenance by itself.
4. **Session continuity:** exact seed, generated field names, ordered duplicate-name answer pairs, token/snapshot atomicity, suppression and ownership must survive migration. Legacy files may lack submissionCount/lastSubmission entirely. Preserve unknown history; never fabricate older attempts or certify today's source as the source of an old attempt.
5. **Storage/concurrency:** local JSON files use exclusive creation/atomic replacement and private permissions; a Set guards one Node process. There is no distributed lock, persisted idempotency key, account linkage or session expiry table. A shared database needs transactions and concurrency/version decisions before multi-instance grading.
6. **Read-only source ingestion:** PG is executable code and source/assets may have custom dependencies. This audit executes none of it. Metadata inference cannot establish capabilities, accepted answers, licensing, hint availability or safe rendering. Store unknown requirements and keep them disabled until verified.

## Supabase access and migration gaps

These are findings about checked-in SQL and browser code, not claims about the live hosted database. The grants, external policies/triggers and applied state were not inspected.

| Finding | Required design consequence |
| --- | --- |
| Base schema drops tables with cascade; existing relationships also cascade exercise/course deletions into history | Use additive migrations and withdrawal/tombstones for the new catalog. Do not apply schema.sql to migrate existing data or cascade away student history. |
| Exercise SELECT policy uses true; the active practice page fetches solution JSON for browser grading | Do not reuse that public table for private PG solutions, seeds or renderer tokens. Separate public catalog projection from backend-only state. Publishing filters in the UI are not database confidentiality rules. |
| Own-attempt insert/update policies check user_id, not renderer provenance; the active component inserts client-calculated is_correct | New PG grades must be backend-authoritative and distinguish legacy client grades. Ownership isolation alone does not make a result renderer-verified. |
| Profiles insert/update policies constrain row ID, while migrations add an admin role used by write policies; no checked-in column restriction or role-protection trigger is present | Before reusing role-based authorization, inspect actual grants and protect role changes server-side/through restricted privileges. Do not treat the existing row policy as protection against changing one's role. No exploit or hosted test was attempted. |
| Global unit positions / global slugs and mandatory single subtheme constrain hierarchy changes | Choose taxonomy keys, scoped slugs/order and multi-assignment explicitly; preserve old URLs and authored-course IDs via mappings rather than renaming tables in place. |
| No PG catalog/session/evidence tables in checked-in SQL/types | Design new structures and RLS/access boundaries before integrating the sandbox. Existing TypeScript types and all consuming queries will need coordinated updates, not just SQL additions. |

Migration order: first finalize identity and versions (5.2), raw/curated taxonomy (5.3), display metadata/provenance (5.4), evidence/activation (5.5), then private student relationships/access (5.6) and query/constraint design (5.7). Task 5.8 can produce additive migrations and fixtures after those decisions. Existing six entries and all student records remain unchanged during this audit.

## Decisions carried into the next subtasks

- Choose stable internal IDs, legacy aliases, conservative rename matching and duplicate representation; identical content hashes alone must not merge independently attributed exercises.
- Decide default ingestion scope: OpenProblemLibrary first, separately labeled Contrib, explicit exclusion/quarantine of Pending. Keep original paths and classifications regardless of browsing choices.
- Version source, raw metadata, curated overrides, taxonomy mappings, import diagnostics and license evidence independently of activation.
- Define dependency/asset identity and the pinned renderer/PG environment needed to reproduce a session; do not assume source hash alone is enough.
- Decide anonymous-account claiming, immutable accepted-attempt history, private drafts/conflicts, suppression-aware progress and distributed idempotency later; importing catalog rows must not manufacture account ownership or prior results.

## Reproduce the source survey

Start the existing Docker workspace first. From the repository root, pipe the script through stdin (Google Drive bind mounts have previously been unreliable):

```powershell
Get-Content ./experimental-workspace/catalog-audit/survey-opl.mjs -Raw |
  docker compose -f ./experimental-workspace/compose.yaml exec -T renderer node --input-type=module - /usr/app/webwork-open-problem-library /tmp/opl-metadata-observations.json
if ($LASTEXITCODE -ne 0) { throw 'OPL survey failed' }
$oplAuditContainer = docker compose -f ./experimental-workspace/compose.yaml ps -q renderer
docker cp "${oplAuditContainer}:/tmp/opl-metadata-observations.json" ./experimental-workspace/catalog-audit/opl-metadata-observations.json
```

The library mount is read-only; only the sanitized report is written to renderer temporary storage and copied back. The script reads Git HEAD locally, performs no network calls and evaluates no PG. Re-run on a new revision rather than editing observed counts. It asserts count partitions and field denominators; read/parse failures exit nonzero. No app test suite or renderer compatibility gate was rerun for this source/documentation audit; prior acceptance evidence remains historical and the runtime stays unchanged.
