$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$run=[guid]::NewGuid().ToString('N').Substring(0,12)
$project='calculus-player-probe-'+$run
$catalogDb='opl_importer_test_'+$run
$probe=$project+'-client'
$accountCompose=Join-Path $taskRoot 'experimental-workspace/accounts/compose.yaml'
$reportDir=Join-Path $PSScriptRoot ('acceptance/player-'+$run)
$created=$false
function Check([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
Push-Location $taskRoot
try{
 docker build -f experimental-workspace/calculus-100/Projection.Dockerfile -t linear-algebra-calculus-projection .;Check 'Projection tool build'
 docker build -f experimental-workspace/calculus-100/Controller.Dockerfile -t linear-algebra-calculus-probe-fixture .;Check 'Fixture tool build'
 docker build -f experimental-workspace/accounts/Tools.Dockerfile -t linear-algebra-account-tools .;Check 'Account tool build'
 docker build -f experimental-workspace/calculus-100/PlayerProbe.Dockerfile -t linear-algebra-calculus-player-probe .;Check 'Player probe build'
 docker exec linear-algebra-opl-catalog-database-1 createdb -U postgres $catalogDb;Check 'Disposable catalog creation';$created=$true
 docker run --rm --network linear-algebra-opl-catalog_catalog -e PGHOST=linear-algebra-opl-catalog-database-1 -e PGUSER=postgres -e "PGDATABASE=$catalogDb" linear-algebra-calculus-projection importer/setup-test.mjs;Check 'Disposable migrations'
 docker run --rm --network linear-algebra-opl-catalog_catalog -e PGHOST=linear-algebra-opl-catalog-database-1 -e PGUSER=postgres -e "PGDATABASE=$catalogDb" linear-algebra-calculus-probe-fixture calculus/probe-fixture.mjs;Check 'Synthetic guarded publication fixture'
 docker compose -p $project -f $accountCompose run --rm --no-deps secrets-init;Check 'Fresh scoped probe secrets'
 docker compose -p $project -f $accountCompose up -d --wait --wait-timeout 180 database auth;Check 'Fresh isolated account database/Auth'
 docker compose -p $project -f $accountCompose run --rm --no-deps migrate;Check 'Fresh account schema'
 docker create --name $probe --network ($project+'_private') --mount ('type=volume,source='+$project+'_secrets,target=/secrets,readonly,volume-subpath=backend') -e "ADAPTER_TEST_DATABASE=$catalogDb" linear-algebra-calculus-player-probe|Out-Null;Check 'Isolated player probe creation'
 docker network connect linear-algebra-opl-catalog_catalog $probe;Check 'Catalog network'
 docker network connect linear-algebra-calculus_private $probe;Check 'Private candidate renderer network'
 docker start -a $probe;Check 'Player probe run'
 $exitCode=docker inspect $probe --format '{{.State.ExitCode}}';Check 'Probe exit inspection'
 if($exitCode -ne '0'){throw 'Player probe failed'}
 New-Item -ItemType Directory -Force -Path $reportDir|Out-Null
 docker cp ($probe+':/artifacts/player-probe.json') (Join-Path $reportDir 'player-probe.json');Check 'Sanitized report copy'
 Write-Output ('Isolated player acceptance: '+$reportDir)
}finally{
 docker rm -f $probe 2>$null|Out-Null
 docker compose -p $project -f $accountCompose down
 if($created){docker exec linear-algebra-opl-catalog-database-1 dropdb -U postgres $catalogDb}
 # Only newly generated probe resources are removed; no existing application or student volume is named.
 if($project -notmatch '^calculus-player-probe-[a-f0-9]{12}$'){throw 'Unexpected probe resource name'}
 docker volume rm ($project+'_database') ($project+'_secrets') 2>$null|Out-Null
 Pop-Location
}
