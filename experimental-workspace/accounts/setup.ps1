$ErrorActionPreference='Stop'
$compose=Join-Path $PSScriptRoot 'compose.yaml'
function Check([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
docker compose -f $compose --profile practice config --quiet;Check 'Invalid local account Compose'
docker compose -f $compose up --build -d --wait --wait-timeout 180 database auth;Check 'Local Auth/database startup failed'
docker compose -f $compose build migrate;Check 'Local account migration image build failed'
docker compose -f $compose run --rm --no-deps migrate;Check 'Additive local account migrations failed'
docker compose -f $compose --profile practice up --build -d --no-deps --wait backend;Check 'Private practice backend startup failed'
Write-Output 'Local account backend ready. Start the pinned experimental renderer and run discovery/setup.ps1 to open the home on localhost:3105. No volumes were removed.'
