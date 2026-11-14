# Experimental workspace conventions

- Keep experiments inside this directory, separate from the existing Next.js application.
- Run Compose commands from this directory or pass its compose.yaml explicitly.
- The renderer is the official pinned upstream source with its PG submodule, built using Docker's Git context. Do not clone its source or OPL onto Google Drive.
- Mount the external linear-algebra-experimental_opl volume's webwork-open-problem-library subdirectory read-only into the renderer.
- Keep renderer/editor ports on localhost. This development configuration allows raw PG execution and is not for public deployment.
- The starter uses Node.js with no external packages. RENDERER_URL points to the renderer on the Docker network; the main app and Supabase are not integrated.
- Starter source is copied into its image because Google Drive bind mounts appeared empty. Edit host source and rebuild.
- Do not mount the repository root, Docker socket, or application secrets.
- Validate Compose changes with docker compose config and docker compose up --build -d --wait. Run powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./smoke-renderer.ps1 for renderer changes; it checks rendering, grading, and session restoration.
- The smoke check's instructor answer map is for local diagnostics only. Future student APIs must allowlist problem files, keep privileged parameters server-side, and accept grading only from PG.
- Verify the pinned renderer's API implementation and actual responses before adding integration code.

- Maintain workspace/server/exercise-catalog.json as the exercise allowlist. Use stable unique IDs; keep PG paths in server code and return only friendly summaries to clients. Add only real verified OPL entries with source attribution. Verification seeds are fixtures, not the future session seed policy.

- Use workspace/server/renderer-client.mjs for exercise loading. Keep renderer configuration, catalog paths, error causes, and session tokens server-side. Validate client changes with docker compose exec -T workspace npm test and npm run smoke:renderer-client inside that container.
