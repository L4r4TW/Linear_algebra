$ErrorActionPreference='Stop'
$catalog=Join-Path $PSScriptRoot '../opl-importer/compose.yaml';$compose=Join-Path $PSScriptRoot 'compose.yaml'
$db='opl_importer_test_'+[guid]::NewGuid().ToString('N').Substring(0,12);$created=$false
try {
 docker compose -f $catalog exec -T database createdb -U postgres $db
 if($LASTEXITCODE -ne 0){throw 'Test database create failed'};$created=$true
 docker compose -f $compose run --rm -e "PGDATABASE=$db" --entrypoint node tools importer/setup-test.mjs
 if($LASTEXITCODE -ne 0){throw 'Pipeline test migrations failed'}
 docker compose -f $compose run --rm -e "PGDATABASE=$db" --entrypoint node tools --test pipeline/contract.test.mjs pipeline/detect.test.mjs pipeline/queue.test.mjs pipeline/worker.test.mjs pipeline/auth.test.mjs pipeline/health.test.mjs
 if($LASTEXITCODE -ne 0){throw 'Pipeline tests failed'}
}finally{if($created){docker compose -f $catalog exec -T database dropdb -U postgres $db;if($LASTEXITCODE -ne 0){throw 'Test database cleanup failed'}}}
