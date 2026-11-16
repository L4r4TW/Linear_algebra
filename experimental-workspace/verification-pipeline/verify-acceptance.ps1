param([switch]$SkipFailures)
$ErrorActionPreference='Stop'
$compose=Join-Path $PSScriptRoot 'compose.yaml'
function Check {param([string]$Message) if($LASTEXITCODE -ne 0){throw $Message}}
docker compose -f $compose build tools;Check 'Verifier build failed'
docker compose -f $compose run --rm tools migrate;Check 'Verifier migrations failed'
& (Join-Path $PSScriptRoot 'setup-context.ps1');Check 'Context setup failed'
& (Join-Path $PSScriptRoot 'verify.ps1');Check 'Unit/database checks failed'
if(-not $SkipFailures){& (Join-Path $PSScriptRoot 'verify-failures.ps1');Check 'Failure acceptance failed'}
$aliasJson=docker compose -f $compose run --rm --entrypoint node tools pipeline/reference-aliases.mjs
Check 'Reference aliases unavailable';$aliases=@(($aliasJson -join [char]10)|ConvertFrom-Json)
docker compose -f $compose run --rm tools enqueue-aliases @aliases;Check 'Reference batch enqueue failed'
docker compose -f $compose run --rm worker worker 20;Check 'Bounded reference worker failed'
docker compose -f $compose up -d operator preview1234 preview4321;Check 'Operator services failed'
docker compose -f $compose exec -T operator node pipeline/dashboard-check.mjs;Check 'Dashboard acceptance failed'
$raw=docker compose -f $compose exec -T operator cat /tmp/dashboard-observations.json;Check 'Dashboard report unavailable'
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'dashboard-observations.json'),($raw -join [char]10)+[char]10,[Text.UTF8Encoding]::new($false))
$name='verification-report-'+[guid]::NewGuid().ToString('N').Substring(0,10)
try{
 docker compose -f $compose run --name $name --entrypoint node tools pipeline/report.mjs;Check 'Reference batch report failed'
 docker cp ($name+':/tmp/pipeline-observations.json') (Join-Path $PSScriptRoot 'pipeline-observations.json');Check 'Sanitized report copy failed'
}finally{docker rm -f $name|Out-Null}
docker compose -f $compose up -d worker;Check 'Persistent worker startup failed'
