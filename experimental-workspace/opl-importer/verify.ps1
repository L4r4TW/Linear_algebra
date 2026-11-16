$ErrorActionPreference='Stop'
$compose=Join-Path $PSScriptRoot 'compose.yaml'
$db='opl_importer_test_'+[guid]::NewGuid().ToString('N').Substring(0,12)
$created=$false
try {
 docker compose -f $compose exec -T database createdb -U postgres $db
 if($LASTEXITCODE -ne 0){throw 'Test database creation failed'};$created=$true
 docker compose -f $compose run --rm -e "PGDATABASE=$db" --entrypoint node importer setup-test.mjs
 if($LASTEXITCODE -ne 0){throw 'Test migrations failed'}
 docker compose -f $compose run --rm -e "PGDATABASE=$db" --entrypoint node importer --test db.test.mjs inventory.test.mjs metadata.test.mjs identity.test.mjs workflow.test.mjs
 if($LASTEXITCODE -ne 0){throw 'Importer tests failed'}
}finally{if($created){docker compose -f $compose exec -T database dropdb -U postgres $db;if($LASTEXITCODE -ne 0){throw 'Disposable test database cleanup failed'}}}
