# Repeatable OPL importer

Tasks **6.1–6.7 are complete**. The pinned library has **77,134 indexed PG sources** in a separate, persistent local PostgreSQL catalog. Read the [full import report](full-import-observations.json) and [repository handoff](../../PROJECT_CONTEXT.md).

| Library area | Indexed sources |
| --- | ---: |
| OpenProblemLibrary | 40,541 |
| Contrib | 29,624 |
| Pending | 6,969 |
| Total | 77,134 |

These are tracked source occurrences, not a claim that every file is a runnable exercise. The import creates **no compatibility approval or practice activation**. The existing practice frontend still enables its six verified JSON entries.

## Run from the repository root

Docker Desktop's Linux engine and the existing `linear-algebra-experimental_opl` volume are required. The PostgreSQL and Node runtimes are digest-pinned; this image no longer depends on an application image. The first build downloads Git/system dependencies.

```powershell
docker compose -f experimental-workspace/opl-importer/compose.yaml build importer
docker compose -f experimental-workspace/opl-importer/compose.yaml up -d --wait database
docker compose -f experimental-workspace/opl-importer/compose.yaml run --rm --entrypoint node importer setup-local.mjs
docker compose -f experimental-workspace/opl-importer/compose.yaml run --rm importer doctor
docker compose -f experimental-workspace/opl-importer/compose.yaml run --rm importer metadata
```

On a **fresh, unfinished import**, verify real process-kill recovery and finish the import:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/opl-importer/verify-full.ps1 -CrashProbe
```

The probe pauses after two committed staging batches, kills only its own importer container, requires exit 137, and resumes the same run. The acceptance run performed during implementation killed the importer with **1,000 committed rows and no published head**; the same run completed successfully. The probe deliberately refuses an already completed import.

For ordinary operation and completed reruns:

```powershell
docker compose -f experimental-workspace/opl-importer/compose.yaml run --rm importer import
docker compose -f experimental-workspace/opl-importer/compose.yaml run --rm importer counts
docker compose -f experimental-workspace/opl-importer/compose.yaml run --rm importer search dot product
docker compose -f experimental-workspace/opl-importer/compose.yaml run --rm importer search derivative
docker compose -f experimental-workspace/opl-importer/compose.yaml run --rm importer topics
docker compose -f experimental-workspace/opl-importer/compose.yaml run --rm importer issues
```

`inventory` produces a source-only inventory. `metadata [exact-revision]` adds lexical metadata extraction; its default pin is `0d42812d6d02960c846fc0f89215e0d4f1e761b1`. The exact revision must match the volume's HEAD. Git objects, not potentially dirty/untracked working-tree files, are read and verified; symlinks are excluded. Neither Perl nor PG executes.

The importer uses all three roots. `--batch=500` controls transactional batch size (1–2000). `--stop-after-batches=N` deliberately stops at a committed checkpoint; rerun the same command without the option to finish. Completed requests return their stored report without advancing the head or duplicating records.

## Storage and isolation

- `linear-algebra-opl-catalog_catalog`: persistent database.
- `linear-algebra-opl-catalog_state`: inventories, checkpoints and reports.
- Existing OPL volume: read-only mount; no PG files are copied into Google Drive.
- Existing app databases and student/session volumes: never mounted or reset.
- Internal Docker network, no published ports. Local database trust authentication is restricted to that separate network; do not attach untrusted services or deploy this local platform fixture publicly.

Keep both catalog volumes when stopping/rebuilding. Do not use `down --volumes` to recover an import. No environment files or hosted Supabase credentials are loaded.

`setup-local.mjs` supplies a deliberately local Auth-shaped platform and applies all ten ordered `20261116*.sql` migrations using transactional checksum history. It never runs the destructive authored-app schema reset. Hosted Supabase requires its own version/history/role/API-exposure inspection and staging rehearsal; do not apply `platform-local.sql` there.

## Identity, updates and recovery

Each exercise receives one persisted UUID, independent of path/hash/import order. All eleven bootstrap aliases retain their original UUID/source association. Existing paths retain identity across new snapshots, including changed content; every new snapshot gets an immutable source observation even when PG bytes match, since dependencies may change elsewhere.

Simultaneous identical copies remain separate identities. Possible renames against vanished baseline paths and absent-path reappearances are retained as identity-review candidates without automatic merges or recycled IDs. Accepting/rejecting those proposals needs a later reviewed identity-decision workflow. Historical sources, aliases, metadata and compatibility evidence remain intact.

A durable per-repository lease blocks competing runs. The same manifest/scanner/parser request resumes committed paths, including out-of-order staging, then reconciles bounded batches. A bad batch rolls back in full. Errors include a safe SQLSTATE/action; staging failures identify the run and source-path range without echoing SQL or source bodies. Correct the cause and resume the same request. There is no automatic lease stealing or destructive cancellation; an abandoned different request requires operator reconciliation.

Only a complete sealed inventory with no pending entries and the expected head generation can publish. Only then are missing paths marked absent. Interrupted/failed scans cannot remove sources or move the head. History-only replay cannot roll back current publication; the CLI rejects historical/divergent new revisions via Git ancestry checks. Concurrent same-request workers may need an explicit retry after a seal/conflict.

Parser/scanner version changes must be explicit. Never modify old observations or migration checksums to hide drift. Review source changes and compatibility on their exact new source/environment versions; imports never inherit approval by alias or byte hash.

## Metadata and discovery

Line-local comment tags and both pinned taxonomy files are parsed without executing source code. Raw classifications/line numbers, authors, institutions and bibliographic references are retained separately. Normalization uses Unicode, whitespace and case; conflicting or nonstandard/multiline declarations remain diagnosed. Textbook titles/authors are not substituted for problem titles/authors. Language, calibrated difficulty and duration remain unknown.

Source/generated titles are labeled by origin; they are not editorially reviewed metadata. The public source discovery projection is separate from the existing reviewed `metadata_documents` release. Classification matches refer to the source vocabularies, not a newly approved curated navigation tree. Rights/asset notice review and dependency/capability discovery remain outstanding.

| Classification | Sources |
| --- | ---: |
| Matched | 38,740 |
| Missing | 4,495 |
| Partial | 5,936 |
| Conflicting | 81 |
| Malformed | 101 |
| Unmapped | 27,781 |

The malformed group includes 18 invalid UTF-8 sources and 83 malformed declaration cases. These sources remain indexed with fallback labels. `issues [after-path]` is an operator-only, bounded source-path/diagnostic/action report; it never executes a problem. Missing data needs upstream declarations or reviewed manual mapping; unmapped triples need explicit mapping review. Do not guess classifications or mark these sources verified.

Server-only [search.mjs](search.mjs) supports text search, exact subject/chapter/section/area filters, bounded pages and keyset cursors pinned to an import run. Stale cursors fail explicitly after publication changes. Database RPCs `catalog_api.search_opl`, `opl_counts` and `opl_topics` expose safe plain metadata and computed availability through a NOLOGIN, non-bypass reader. Browser roles cannot read raw base tables or call import mutations. Paths, raw headers, hashes and renderer controls are excluded from discovery responses; UI adapters must render strings as text.

Indexed, unclassified, identity-review and practice-ready counts are distinct. There are currently **0 practice-ready entries in this new database**, alongside the unchanged six-entry experimental frontend catalog. No account/session migration or HTTP/frontend catalog wiring is included.

## Verification and report

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/opl-importer/verify.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/opl-importer/verify-full.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/migration-tests/verify-migrations.ps1
```

Fresh results: **9 importer test groups**, **13 full-library assertions**, and **134 fresh/legacy-upgrade checks** pass. Importer fixtures use a separate random test database dropped in finally. They cover dirty/untracked trees, wrong pins, metadata gaps, hostile SQL strings, copies/renames/reappearances, interruption in staging and reconciliation, out-of-order recovery, competing leases, atomic rollback, immutable history, public search, stale cursors and private-access denial.

Full acceptance checks the 77,134-source catalog, eleven aliases, checkpoint continuation, exact unchanged-rerun identity/version/event/classification fingerprints, multi-subject search, nonoverlapping pages and natural browse/GIN index plans. Query timings are warm local measurements, not production SLOs. Its original crash checkpoint must remain in the state volume when rerunning this acceptance command.

Only the sanitized [full-import-observations.json](full-import-observations.json) is copied to the repository. Large inventories and database records remain in Docker. [Migration observations](../migration-tests/migration-observations.json) now cover all ten migrations and 60 catalog/private tables; the original 5.8 foundation had 57. No renderer or existing application code changed, so earlier renderer/browser results remain historical.

Next: connect a server HTTP discovery adapter and the planned home/search/subject–chapter–section chooser to this catalog, while showing indexed versus practice-ready status. Account/practice database integration, reviewed taxonomy/metadata enrichment and verification batches remain separate work.
