$ErrorActionPreference='Stop'
$compose=Join-Path $PSScriptRoot 'compose.yaml'
docker compose -f $compose up -d --wait --wait-timeout 240 renderer
if($LASTEXITCODE -ne 0){throw 'Private renderer not ready'}
$raw=docker compose -f $compose exec -T renderer cat /usr/app/verification-build.json
if($LASTEXITCODE -ne 0){throw 'Renderer attestation unavailable'}
$attestation=($raw -join "`n")|ConvertFrom-Json
$renderer=docker compose -f $compose ps -q renderer
$image=docker inspect $renderer --format '{{.Image}}'
$source=docker compose -f $compose run --rm tools source-doctor
if($LASTEXITCODE -ne 0){throw 'Source snapshot check failed'}
$source=($source -join "`n")|ConvertFrom-Json
$workerImage=docker image inspect linear-algebra-verification --format '{{.Id}}'
$input=[ordered]@{attestation=$attestation;rendererImage=$image;workerImage=$workerImage;sourceRevision=$source.revision;sourceClean=$source.clean}|ConvertTo-Json -Depth 8 -Compress
$input|docker compose -f $compose run --rm -T tools register-context
if($LASTEXITCODE -ne 0){throw 'Context registration failed'}
