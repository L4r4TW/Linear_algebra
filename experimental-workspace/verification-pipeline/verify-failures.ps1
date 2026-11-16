$ErrorActionPreference='Stop'
$compose=Join-Path $PSScriptRoot 'compose.yaml';$catalog=Join-Path $PSScriptRoot '../opl-importer/compose.yaml'
$db='opl_importer_test_'+[guid]::NewGuid().ToString('N').Substring(0,12);$probe='verification-crash-'+[guid]::NewGuid().ToString('N').Substring(0,10)
$created=$false;$stopped=$false;$probeCreated=$false
function Check {param([string]$Message) if($LASTEXITCODE -ne 0){throw $Message}}
try {
 docker compose -f $catalog exec -T database createdb -U postgres $db;Check 'Acceptance database creation failed';$created=$true
 docker compose -f $compose run --rm -e "PGDATABASE=$db" --entrypoint node tools importer/setup-test.mjs;Check 'Acceptance migrations failed'
 $input=docker compose -f $catalog exec -T database psql -X -t -A -U postgres -d opl_catalog -c "SELECT jsonb_build_object('context',(SELECT c.payload FROM catalog.verifier_heads h JOIN catalog.verifier_contexts c ON c.id=h.context_id WHERE h.scope='local-practice'),'sources',(SELECT jsonb_agg(jsonb_build_object('alias',a.external_id,'path',s.path,'sha256',s.sha256,'manifest',m.manifest)) FROM catalog.aliases a JOIN catalog.source_versions s ON s.exercise_id=a.exercise_id JOIN LATERAL(SELECT manifest FROM catalog.capability_manifests m WHERE m.source_version_id=s.id ORDER BY created_at DESC,id DESC LIMIT 1)m ON true WHERE a.namespace='experimental-opl' AND a.external_id IN('dot-product-01','compat-calculus-numeric-01')));"
 Check 'Measured acceptance metadata unavailable'
 ($input -join [char]10)|docker compose -f $compose run --rm -T -e "PGDATABASE=$db" --entrypoint node tools pipeline/acceptance-fixture.mjs seed
 Check 'Acceptance source subset failed'
 docker compose -f $compose stop renderer;Check 'Private renderer stop failed';$stopped=$true
 docker compose -f $compose run --rm --no-deps -e "PGDATABASE=$db" worker worker 1;Check 'Outage worker execution failed'
 docker compose -f $compose run --rm -e "PGDATABASE=$db" --entrypoint node tools pipeline/acceptance-fixture.mjs assert-outage;Check 'Outage was not classified correctly'
 docker compose -f $compose start --wait --wait-timeout 240 renderer;Check 'Private renderer restart failed';$stopped=$false
 docker compose -f $compose run --rm -e "PGDATABASE=$db" --entrypoint node tools pipeline/acceptance-fixture.mjs retry-dot;Check 'Explicit retry failed'
 docker compose -f $compose run --rm -e "PGDATABASE=$db" worker worker 1;Check 'Recovered renderer verification failed'
 docker compose -f $compose run --rm -e "PGDATABASE=$db" --entrypoint node tools pipeline/acceptance-fixture.mjs queue-numeric;Check 'Crash target enqueue failed'
 docker compose -f $compose run -d --name $probe -e "PGDATABASE=$db" --entrypoint node tools pipeline/acceptance-fixture.mjs probe;Check 'Crash probe launch failed';$probeCreated=$true
 $deadline=[DateTime]::UtcNow.AddSeconds(15);$ready=$false
 while([DateTime]::UtcNow -lt $deadline){$log=(&docker logs $probe 2>&1)-join [char]10;if($log -match 'CLAIMED_FOR_CRASH'){$ready=$true;break};Start-Sleep -Milliseconds 100}
 if(-not $ready){throw 'Worker claim checkpoint not reached'}
 docker compose -f $compose run --rm -e "PGDATABASE=$db" --entrypoint node tools pipeline/acceptance-fixture.mjs compete;Check 'Concurrent claim was not prevented'
 docker kill $probe|Out-Null;Check 'Worker kill failed'
 $exit=&docker inspect $probe --format '{{.State.ExitCode}}';if($exit -ne '137'){throw 'Killed worker did not exit 137'}
 Start-Sleep -Seconds 21
 docker compose -f $compose run --rm -e "PGDATABASE=$db" worker worker 1;Check 'Expired lease recovery failed'
 $report=docker compose -f $compose run --rm -e "PGDATABASE=$db" --entrypoint node tools pipeline/acceptance-fixture.mjs assert-recovered;Check 'Failure recovery assertions failed'
 $parsed=($report -join [char]10)|ConvertFrom-Json
 [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'failure-observations.json'),($parsed|ConvertTo-Json -Depth 8)+[char]10,[Text.UTF8Encoding]::new($false))
}finally{
 if($stopped){docker compose -f $compose start --wait --wait-timeout 240 renderer}
 if($probeCreated){docker rm -f $probe|Out-Null}
 if($created){docker compose -f $catalog exec -T database dropdb -U postgres $db;if($LASTEXITCODE -ne 0){throw 'Acceptance database cleanup failed'}}
}
