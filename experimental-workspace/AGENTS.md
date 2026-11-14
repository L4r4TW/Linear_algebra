# Experimental workspace conventions

- Keep experiments inside this directory, separate from the existing Next.js application.
- Run Compose commands from this directory or pass its compose.yaml explicitly.
- The starter uses Node.js with no external packages. It does not integrate WeBWorK or Supabase.
- Source is copied into the image: Google Drive bind mounts appeared empty during verification. Edit host source and rebuild to apply changes.
- Do not mount the repository root, Docker socket, or application secrets.
- Use the dedicated Compose project and network. Bind new exposed services to localhost on separate ports.
- Validate changes with docker compose config, docker compose up --build -d --wait, and an HTTP request to /health.
- Verify official renderer documentation and API behavior before adding PG integration.
