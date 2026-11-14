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

## Open Problem Library

The official repository is cloned into Docker volume `linear-algebra-experimental_opl`, at `/library/webwork-open-problem-library` when the volume is mounted at `/library`.

The initial checkout in the local `webwork-open-problem-library/` directory failed due to Windows path-length limits and Google Drive directory conflicts. That directory is an incomplete copy, not the working library. It remains excluded from application Git tracking and Docker builds.

Inspect the Linux copy without changing it:

```powershell
docker run --rm --mount type=volume,source=linear-algebra-experimental_opl,target=/library,readonly alpine:3.23 ls /library/webwork-open-problem-library
```

The volume is independent of the starter Compose application and persists when `docker compose down` is run. The renderer is not connected to it yet. Check `OPL_LICENSE` and individual problem licenses before redistributing exercises. Upstream: https://github.com/openwebwork/webwork-open-problem-library.git
