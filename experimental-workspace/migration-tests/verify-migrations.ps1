param([string]$Image='postgres@sha256:a49f7438ba03589f9b1ca062f2da82e899b48ea1dc50d2449fa09a70be83ebca')
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$name='linear-algebra-migrations-'+[guid]::NewGuid().ToString('N').Substring(0,10);$started=$false
function Sql {param([string]$Db,[string]$Text) $output=$Text|docker exec -i $name psql -X -q -t -A -U postgres -d $Db -v ON_ERROR_STOP=1;if($LASTEXITCODE -ne 0){throw ('Migration SQL failed in '+$Db)};return ($output -join "`n").Trim()}
function Read {param([string]$Relative) [IO.File]::ReadAllText((Join-Path $root $Relative))}
$files=@(Get-ChildItem -LiteralPath (Join-Path $root 'supabase/migrations') -Filter '20261116*.sql'|Sort-Object Name)
function Apply {param([string]$Db) foreach($file in $files){$hash=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant();$seen=Sql $Db ("SELECT coalesce(max(sha256),'') FROM migration_test.applied WHERE name='"+$file.Name+"';");if($seen){if($seen -cne $hash){throw 'Applied migration checksum drift'};continue};Write-Host ($Db+': '+$file.Name);$null=Sql $Db ([IO.File]::ReadAllText($file.FullName));$null=Sql $Db ("INSERT INTO migration_test.applied VALUES('"+$file.Name+"','"+$hash+"');")}}
function Wait-Phase {param([string]$Phase) $deadline=[DateTime]::UtcNow.AddSeconds(22);while([DateTime]::UtcNow -lt $deadline){&docker exec $name test -f ('/tmp/'+$Phase) *> $null;if($LASTEXITCODE -eq 0){return};Start-Sleep -Milliseconds 100};throw ('Concurrent test timed out: '+$Phase)}
function Race {param([string]$Db)
 foreach($file in @('race-a.sql','race-b.sql')){docker cp (Join-Path $PSScriptRoot $file) ($name+':/tmp/'+$file)|Out-Null;if($LASTEXITCODE -ne 0){throw 'Race copy failed'}}
 &docker exec $name sh -c 'rm -f /tmp/migration_cas_a_ready /tmp/migration_cas_a_done /tmp/migration_cas_b_done /tmp/migration_cas_release';if($LASTEXITCODE -ne 0){throw 'Race phase setup failed'}
 &docker exec -d $name sh -c ('psql -X -q -U postgres -d '+$Db+' -v ON_ERROR_STOP=1 -f /tmp/race-a.sql >/tmp/migration-race-a.log 2>&1');if($LASTEXITCODE -ne 0){throw 'Writer A launch failed'};Wait-Phase 'migration_cas_a_ready'
 &docker exec -d $name sh -c ('psql -X -q -U postgres -d '+$Db+' -v ON_ERROR_STOP=1 -f /tmp/race-b.sql >/tmp/migration-race-b.log 2>&1');if($LASTEXITCODE -ne 0){throw 'Writer B launch failed'}
 $deadline=[DateTime]::UtcNow.AddSeconds(12);$blocked=$false
 while([DateTime]::UtcNow -lt $deadline){$count=Sql $Db "SELECT count(*) FROM pg_stat_activity WHERE application_name='migration_cas_b' AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0;";if($count -eq '1'){$blocked=$true;break};Start-Sleep -Milliseconds 100};if(-not $blocked){throw 'Actual concurrent lock blocking not observed'}
 &docker exec $name touch /tmp/migration_cas_release;if($LASTEXITCODE -ne 0){throw 'Race release failed'};Wait-Phase 'migration_cas_a_done';Wait-Phase 'migration_cas_b_done'
 $null=Sql $Db "SELECT migration_test.ok('Real two-connection draft race preserves single revision',(SELECT revision=1 FROM practice_private.drafts WHERE branch_key='migration-race'));"
}
try{
 $id=& docker run --rm -d --name $name --network none --memory 1800m --shm-size=128m --tmpfs /var/lib/postgresql/data:rw,size=1024m -e POSTGRES_HOST_AUTH_METHOD=trust $Image postgres -c shared_buffers=64MB -c max_wal_size=128MB -c min_wal_size=32MB
 if($LASTEXITCODE -ne 0){throw 'Could not start migration verifier'};$started=$true
 $raw=&docker inspect $name;$inspection=($raw -join "`n")|ConvertFrom-Json;$inspection=$inspection[0]
 if($inspection.HostConfig.NetworkMode -ne 'none' -or @($inspection.Mounts|Where-Object {$_.Type -in @('bind','volume')}).Count -gt 0 -or @($inspection.HostConfig.PortBindings.PSObject.Properties).Count -gt 0){throw 'Migration verifier isolation check failed'}
 $deadline=[DateTime]::UtcNow.AddSeconds(45);$ready=$false;while([DateTime]::UtcNow -lt $deadline){$comm=&docker exec $name cat /proc/1/comm;if($comm -eq 'postgres'){&docker exec $name pg_isready -U postgres *> $null;if($LASTEXITCODE -eq 0){$ready=$true;break}};Start-Sleep -Milliseconds 150};if(-not $ready){throw 'Migration database not ready'}
 $reports=@()
 foreach($db in @('migration_fresh','migration_upgrade')){
  $null=Sql 'postgres' ('CREATE DATABASE '+$db+';');$null=Sql $db (Read 'experimental-workspace/migration-tests/platform.sql')
  if($db -eq 'migration_upgrade'){
   Write-Host 'Creating legacy authored-app fixture in the disposable database only.'
   foreach($old in @('supabase/schema.sql','supabase/migrations/20260221_admin_exercise_panel.sql','supabase/migrations/20260221_admin_structure_rls.sql','supabase/migrations/20260221_remove_archived_status.sql','supabase/seed.sql')){$null=Sql $db (Read $old)}
   $null=Sql $db (Read 'experimental-workspace/migration-tests/legacy-before.sql')
  }
  Apply $db
  Apply $db
  $before=Sql $db "SELECT md5(jsonb_agg(to_jsonb(a) ORDER BY namespace,external_id)::text) FROM catalog.aliases a;"
  $null=Sql $db (Read 'supabase/migrations/202611160004_bootstrap_existing_opl_metadata.sql')
  $after=Sql $db "SELECT md5(jsonb_agg(to_jsonb(a) ORDER BY namespace,external_id)::text) FROM catalog.aliases a;"
  if($before -cne $after){throw 'Bootstrap replay changed permanent identities'}
  $null=Sql $db "SELECT migration_test.ok('Bootstrap replay preserves permanent alias identities',true);"
  $null=Sql $db (Read 'experimental-workspace/migration-tests/model-fixtures.sql')
  $null=Sql $db (Read 'experimental-workspace/migration-tests/checks.sql')
  $null=Sql $db (Read 'experimental-workspace/migration-tests/negative-evidence.sql')
  Race $db
  if($db -eq 'migration_upgrade'){$null=Sql $db (Read 'experimental-workspace/migration-tests/legacy-after.sql')}
  $report=(Sql $db "SELECT jsonb_build_object('databaseMode',current_database(),'postgresVersion',current_setting('server_version'),'checks',(SELECT jsonb_agg(jsonb_build_object('name',name,'passed',passed) ORDER BY name) FROM migration_test.results),'complete',(SELECT bool_and(passed) FROM migration_test.results),'newTables',(SELECT count(*) FROM pg_tables WHERE schemaname IN('catalog','practice_private')),'aliases',(SELECT count(*) FROM catalog.aliases));")|ConvertFrom-Json
  $reports+=@($report)
 }
 $digest=&docker image inspect $Image --format '{{index .RepoDigests 0}}'
 $evidence=[ordered]@{version=1;observedAt=[DateTime]::UtcNow.ToString('o');imageDigest=$digest;scope='Fresh and authored-app upgrade on isolated PostgreSQL with test-only Auth context, not hosted Supabase or HTTP JWT validation';network='none';hostOrApplicationVolumesMounted=$false;liveStudentRecordsRead=0;actualConcurrentRaceVerified=$true;testSourceHashes=@(Get-ChildItem -LiteralPath $PSScriptRoot -File|Where-Object {$_.Extension -in @('.sql','.ps1')}|Sort-Object Name|ForEach-Object {[ordered]@{name=$_.Name;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}});reports=$reports;complete=(@($reports|Where-Object {-not $_.complete}).Count -eq 0);migrations=@($files|ForEach-Object {[ordered]@{name=$_.Name;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})}
 [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'migration-observations.json'),($evidence|ConvertTo-Json -Depth 15)+"`n",[Text.UTF8Encoding]::new($false))
 Write-Host ('PASS: '+($reports|ForEach-Object {$_.checks.Count}|Measure-Object -Sum).Sum+' checks across fresh and legacy-upgrade databases.')
}finally{if($started){&docker rm -f $name|Out-Null}}
