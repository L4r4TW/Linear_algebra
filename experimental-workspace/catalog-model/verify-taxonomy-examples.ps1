# Design verification only: public metadata, read-only source access, no PG evaluation or database changes.
$ErrorActionPreference='Stop'
function Read-Json {param([string]$Path) [IO.File]::ReadAllText((Join-Path $PSScriptRoot $Path))|ConvertFrom-Json}
$compose=Join-Path $PSScriptRoot '../compose.yaml'
$eligibleCode='import {listExercises} from "./server/exercise-catalog.mjs";console.log(JSON.stringify(listExercises().map(e=>e.id)));'
$live=$eligibleCode|docker compose -f $compose exec -T workspace node --input-type=module -
if($LASTEXITCODE -ne 0){throw 'Current eligibility lookup failed.'}
$liveIds=$live|ConvertFrom-Json
$payload=[ordered]@{fixture=(Read-Json 'taxonomy-examples.json');plan=(Read-Json 'identity-bootstrap-plan.json');playableIds=@($liveIds)}|ConvertTo-Json -Depth 15 -Compress
$encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))
$prefix="globalThis.taxonomyDesignInput=JSON.parse(Buffer.from('$encoded','base64').toString('utf8'));`n"
$check=$prefix+[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'verify-taxonomy-examples.mjs'))
$check|docker compose -f $compose exec -T renderer node --input-type=module -
if($LASTEXITCODE -ne 0){throw 'Taxonomy design/source checks failed.'}
$container=docker compose -f $compose ps -q renderer
if($LASTEXITCODE -ne 0 -or -not $container){throw 'Renderer container unavailable.'}
docker cp "${container}:/tmp/taxonomy-design-observations.json" (Join-Path $PSScriptRoot 'taxonomy-design-observations.json')
if($LASTEXITCODE -ne 0){throw 'Could not retrieve sanitized taxonomy observations.'}
