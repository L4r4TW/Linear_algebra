# Experimental Docker workspace

Independent Node.js sandbox for fresh experiments. The existing Next.js application and Supabase configuration are separate.

## Start

Start Docker Desktop using Linux containers, then run from the repository root:

```powershell
cd experimental-workspace
docker compose up --build -d --wait
```

Open http://localhost:3100. Check health with:

```powershell
Invoke-RestMethod http://localhost:3100/health
docker compose ps
```

## Develop

Edit files in `workspace/`, then run `docker compose up --build -d --wait` again to apply changes.

This project is on a Google Drive virtual drive. Its bind mount appeared empty inside Docker during verification, so source files are copied into the image at build time instead. Container edits are temporary; keep source changes on the host and rebuild.

The initial server has no external dependencies and does not connect to Supabase or WeBWorK. When adding dependencies, update the Dockerfile to install them from the sandbox's package manifest during the build.

```powershell
docker compose exec workspace sh
docker compose logs -f workspace
docker compose down
```

The dedicated Compose project is `linear-algebra-experimental`, with its own network. No host directories or application secrets are mounted. Port 3100 is bound to localhost. Run Compose commands from this directory to target this sandbox.

## Windows prerequisites

WSL 2 is installed on this host. Docker Desktop must be running with its Linux engine ready before Compose can start containers. If the engine pipe is missing, start Docker Desktop and wait for startup to finish.
