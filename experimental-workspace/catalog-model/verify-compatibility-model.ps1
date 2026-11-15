# Read-only design adapter. Uses the existing assessor; no PG calls, sessions, SQL or activation writes.
$ErrorActionPreference='Stop'
$compose=Join-Path $PSScriptRoot '../compose.yaml'
$code=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'compatibility-model.mjs'))+"`n"+[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'verify-compatibility-model.mjs'))
$code|docker compose -f $compose exec -T workspace node --input-type=module -
if($LASTEXITCODE -ne 0){throw 'Compatibility model checks failed.'}
$container=docker compose -f $compose ps -q workspace
if($LASTEXITCODE -ne 0 -or -not $container){throw 'Workspace unavailable.'}
foreach($name in @('compatibility-model-examples.json','compatibility-model-observations.json')){docker cp "${container}:/tmp/$name" (Join-Path $PSScriptRoot $name);if($LASTEXITCODE -ne 0){throw 'Could not retrieve sanitized model observations.'}}
