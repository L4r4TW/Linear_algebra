# Home and discovery (milestone 8)

## Checkpoints

1. **8.1 — Discovery contracts and server:** read-only real catalog queries, bounded validated filters/cursors, explicit distinction between indexed sources and launchable practice.
2. **8.2 — Home and search:** screenshot-directed shell, subject cards, search, topic/source filters, shareable URLs, pagination and accessible responsive states.
3. **8.3 — Practice and continuity:** fixed-upstream gateway to the unchanged player, guarded starts, owner-checked Continue practicing, preserved session/draft origin.
4. **8.4 — Acceptance and handoff:** real-catalog/API/browser checks, failures and navigation, desktop/mobile/keyboard review, documentation and push.

## Integration contract

Discovery is an independent Docker service at http://localhost:3105. The existing Next.js app, six-exercise player at localhost:3100, renderer and verification operator remain intact. Practice is served through the discovery origin at /practice, so that its existing cookie ownership, draft storage and session URLs work together with the new home.

Only the existing player's live /api/exercises response authorizes prototype starts. Imported catalog rows never authorize a renderer request. The database's own practice-ready status remains separate; database-backed session adapters are not implemented by this milestone. Zero database-ready exercises is a truthful state, not a reason to bypass certification.

The optional indexed library reads existing catalog_api search/count/topic functions, under the anon database role in read-only transactions. It exposes no SQL, private metadata, PG paths, renderer tokens or correct answers. Source-header descriptions and normalized/raw topic labels are searchable using the existing full-text index. Author/institution/book attribution is displayed where available; it is not falsely advertised as separately indexed search.

Generated source labels are identified as such. Classification is the importer's normalized upstream vocabulary, not a fabricated curated hierarchy. Subject cards only lead to nonempty practice or explicitly labelled indexed coverage.

All APIs are GET-only except the narrow existing practice proxy. Search filters and generation-bound cursor bindings are validated; results are bounded. A stale import cursor requires an explicit search restart. Dependency errors are sanitized; no silent new session or draft deletion occurs.

The deployment is local development, not hosted Supabase or production authentication. No student/session volume, OPL volume, operator secret or Docker socket is mounted in discovery.

## Run locally

Start the existing experimental workspace and OPL catalog first. From the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File experimental-workspace/discovery/setup.ps1
docker compose -f experimental-workspace/discovery/compose.yaml exec -T home npm test
```

Setup creates only a local discovery_home login inheriting anon and default read-only/4-second query settings. It does not apply migrations, import sources, change publication or grant private-table access. Docker networking is trusted local development; use managed credentials and restricted admission before deployment.

GET /api/discovery/overview separates live prototype availability from database coverage. GET /api/discovery/search accepts q, view=practice|library, subject, chapter, section, area and cursor; pages contain at most twelve entries. GET /api/discovery/topics supplies normalized source classifications. Unknown/repeated parameters and malformed/changed-filter cursors are rejected. Existing database import-generation checks reject stale cursors.
