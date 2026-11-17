$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $taskRoot
try {
 $base=docker image inspect linear-algebra-experimental-renderer:latest --format '{{.Id}}'
 if($LASTEXITCODE -ne 0 -or $base.Trim() -ne 'sha256:290e446f771be31a3584f475c8944b8dc6fbff29e3af8090ec8d8f1e7035679e'){throw 'Retained legacy Perl/OS base image mismatch. Review a replacement before building.'}
 docker compose -f experimental-workspace/calculus-100/compose.yaml config --quiet
 if($LASTEXITCODE -ne 0){throw 'Invalid calculus Compose configuration'}
 docker compose -f experimental-workspace/calculus-100/compose.yaml build tools renderer
 if($LASTEXITCODE -ne 0){throw 'Candidate build failed'}
 docker compose -f experimental-workspace/calculus-100/compose.yaml up -d --wait renderer
 if($LASTEXITCODE -ne 0){throw 'Candidate renderer failed health'}
 # This pauses only the older operator queue, never either student application.
 docker stop linear-algebra-verification-worker-1
 if($LASTEXITCODE -ne 0){throw 'Could not pause the old operator worker'}
 $workerImage=docker image inspect linear-algebra-calculus-tools --format '{{.Id}}'
 $rendererImage=docker image inspect linear-algebra-calculus-renderer --format '{{.Id}}'
 docker compose -f experimental-workspace/calculus-100/compose.yaml run --rm -e "MEASURED_WORKER_IMAGE=$workerImage" -e "MEASURED_RENDERER_IMAGE=$rendererImage" tools calculus/register.mjs context
 if($LASTEXITCODE -ne 0){throw 'Strict context registration failed'}
 docker compose -f experimental-workspace/calculus-100/compose.yaml run --rm tools calculus/register.mjs enqueue
 if($LASTEXITCODE -ne 0){throw 'Bounded primary queue creation failed'}
 docker compose -f experimental-workspace/calculus-100/compose.yaml up -d --scale worker=2 worker
 if($LASTEXITCODE -ne 0){throw 'Worker startup failed'}
} finally {Pop-Location}
