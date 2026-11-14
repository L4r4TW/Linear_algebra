# Repository development guide

## Read before continuing

Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for the current handoff and [Project_goals.md](Project_goals.md) for product direction. Inspect `git status --short` before editing: the current grading and submission-persistence implementation may still be uncommitted. Preserve existing work.

There are two independent applications:

- Repository root: existing Next.js/React/TypeScript/Supabase app, port 3000. Root npm scripts apply here.
- `experimental-workspace/`: active Node/WeBWorK Docker experiment, practice UI on port 3100 and private renderer editor on port 3101. Read its [AGENTS.md](experimental-workspace/AGENTS.md) before changes in that directory and its [README.md](experimental-workspace/README.md) for exact commands and API contracts.

Keep PG experiments in the experimental workspace unless integration into the main app is explicitly requested. Do not replace the existing app's exercise or Supabase flows as part of sandbox work.

## Local environment and data

- Windows PowerShell; the repository is on Google Drive. Docker Desktop uses its Linux engine/WSL2.
- Never clone the full OPL or renderer source into this synced directory. Renderer builds use the pinned upstream Git context; OPL is in the external `linear-algebra-experimental_opl` Docker volume.
- Sandbox source is copied into its image. Rebuild after edits; do not assume host hot reload or working Google Drive bind mounts.
- Private session JSON lives in `/data/sessions` on `linear-algebra-experimental_sessions`. Normal restart/rebuild preserves it. `docker compose down --volumes` deletes sessions; avoid destructive cleanup.
- Do not expose renderer/editor services publicly or mount repository secrets or the Docker socket into the sandbox.

## PG integration invariants

- Exercise IDs come from the verified server catalog. Paths, seeds, renderer settings, tokens, and privileged instructor responses stay on the server.
- Generate a seed once per session; restore using saved tokens. Never silently replace a failed saved session with a new exercise.
- Verify session ownership before renderer requests. Current ownership is an anonymous HttpOnly browser cookie, not Supabase authentication.
- Keep PG content inside the isolated iframe. Preserve its sandbox, content policy, and message source/origin/channel/request checks.
- Answer pairs preserve generated names, whitespace, order, and valid repeated names. Derive the allowed field contract from server-restored PG HTML, not client metadata.
- Persist updated renderer tokens and the latest submission snapshot atomically. Preserve legacy token-only records; do not fabricate submission history.
- The in-memory grading guard supports one Node process. Account ownership, durable attempt history, and distributed concurrency control are future integration work.

## Validation

For sandbox changes, run commands from `experimental-workspace/`:

```powershell
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 240
docker compose exec -T workspace npm test
```

Run the focused smoke checks and browser suite required by the nested guide for the area changed. Do not substitute root app lint for sandbox tests. Documentation-only edits need link/command checks and `git diff --check`; historical test results must be labelled as such.

For original app changes, use root `npm run lint`, `npm run smoke:admin`, and `npm run build` as applicable. The build can fail on Google Fonts downloads in restricted networks. `supabase/schema.sql` drops existing tables: follow [DATABASE_SETUP.md](DATABASE_SETUP.md) and use migrations for existing data.

## Handoff maintenance

Update PROJECT_CONTEXT.md when implementation status, verification, or next steps change. Keep README entry points and nested workspace guidance consistent. Record what is implemented versus exposed in the UI, and what is committed/pushed versus only present locally. Never include private session files, cookie values, credentials, renderer tokens, or instructor answer maps in documentation or Git.
