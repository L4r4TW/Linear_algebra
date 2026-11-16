param([string]$Image='postgres@sha256:a49f7438ba03589f9b1ca062f2da82e899b48ea1dc50d2449fa09a70be83ebca')
# Disposable PostgreSQL lab only. No existing service, database, network, port or volume is used.
$ErrorActionPreference='Stop'
$labName='linear-algebra-model-lab-'+[guid]::NewGuid().ToString('N').Substring(0,10)
$started=$false
function Sql {param([string]$Text)
 $output=$Text|docker exec -i -e 'PGOPTIONS=-c model.design_lab=yes' $labName psql -X -q -t -A -U postgres -d catalog_design_lab -v ON_ERROR_STOP=1
 if($LASTEXITCODE -ne 0){throw 'PostgreSQL lab statement failed.'}
 return ($output -join "`n").Trim()
}
function Has-File {param([string]$Name) & docker exec $labName test -f ('/tmp/'+$Name) *> $null;return $LASTEXITCODE -eq 0}
function Wait-File {param([string]$Name) $deadline=[DateTime]::UtcNow.AddSeconds(20);while([DateTime]::UtcNow -lt $deadline){if(Has-File $Name){return};Start-Sleep -Milliseconds 100};throw ('Database lab phase timed out: '+$Name)}
function Plan-Indexes {param($Node) if($Node.'Index Name'){$Node.'Index Name'};foreach($child in $Node.Plans){Plan-Indexes $child}}
try{
 Write-Host 'Starting isolated PostgreSQL design lab (no network, ports or application volumes).'
 $id=& docker run --rm -d --name $labName --network none --memory 2500m --shm-size=128m --tmpfs /var/lib/postgresql/data:rw,size=1536m -e POSTGRES_DB=catalog_design_lab -e POSTGRES_HOST_AUTH_METHOD=trust $Image postgres -c shared_buffers=64MB -c max_wal_size=128MB -c min_wal_size=32MB -c checkpoint_timeout=30s
 if($LASTEXITCODE -ne 0){throw 'Could not start PostgreSQL lab.'};$started=$true
 $isolationRaw=& docker inspect $labName
 $isolation=($isolationRaw -join "`n")|ConvertFrom-Json
 $isolation=$isolation[0]
 if($isolation.HostConfig.NetworkMode -ne 'none' -or @($isolation.Mounts|Where-Object {$_.Type -in @('bind','volume')}).Count -gt 0){throw 'Lab isolation check failed.'}
 $deadline=[DateTime]::UtcNow.AddSeconds(45);$ready=$false
 while([DateTime]::UtcNow -lt $deadline){$mainProcess=& docker exec $labName cat /proc/1/comm;if($LASTEXITCODE -eq 0 -and $mainProcess -eq 'postgres'){& docker exec $labName pg_isready -U postgres -d catalog_design_lab *> $null;if($LASTEXITCODE -eq 0){$ready=$true;break}};Start-Sleep -Milliseconds 200}
 if(-not $ready){throw 'PostgreSQL lab did not become ready.'}
 foreach($file in @('schema.sql','fixtures.sql','checks.sql','queries.sql')){Write-Host ('Running '+$file);$null=Sql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot ('database-lab/'+$file))))}
 foreach($file in @('race-a.sql','race-b.sql')){docker cp (Join-Path $PSScriptRoot ('database-lab/'+$file)) ($labName+':/tmp/'+$file)|Out-Null;if($LASTEXITCODE -ne 0){throw 'Race script copy failed.'}}
 docker exec -d $labName sh -c 'psql -X -q -U postgres -d catalog_design_lab -v ON_ERROR_STOP=1 -f /tmp/race-a.sql >/tmp/model-race-a.log 2>&1'
 if($LASTEXITCODE -ne 0){throw 'Could not launch draft writer A.'};Wait-File 'model_cas_a_ready'
 docker exec -d $labName sh -c 'psql -X -q -U postgres -d catalog_design_lab -v ON_ERROR_STOP=1 -f /tmp/race-b.sql >/tmp/model-race-b.log 2>&1'
 if($LASTEXITCODE -ne 0){throw 'Could not launch draft writer B.'}
 $deadline=[DateTime]::UtcNow.AddSeconds(12);$blocked=$false
 while([DateTime]::UtcNow -lt $deadline){$count=Sql "SELECT count(*) FROM pg_stat_activity WHERE application_name='model_lab_cas_b' AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0;";if($count -eq '1'){$blocked=$true;break};Start-Sleep -Milliseconds 100}
 if(-not $blocked){throw 'A real blocking draft race was not observed.'}
 docker exec $labName touch /tmp/model_cas_release
 if($LASTEXITCODE -ne 0){throw 'Could not release draft writer.'};Wait-File 'model_cas_a_done';Wait-File 'model_cas_b_done'
 $null=Sql "SET search_path=model_lab,pg_catalog;SELECT expect_true('Two database connections exhibit actual row-lock blocking',true);SELECT expect_true('Concurrent draft revision advanced only once',(SELECT revision=1 FROM drafts WHERE id=gid(1)));"
 $queries=@(
  [ordered]@{name='catalog-keyset';expectedIndex='search_documents_browse';sql="SELECT exercise_id,title FROM model_lab.published_catalog WHERE release_id=model_lab.gid(1) AND locale='en' AND(title_sort,exercise_id)>('', '00000000-0000-0000-0000-000000000000'::uuid) ORDER BY title_sort,exercise_id LIMIT 20"},
  [ordered]@{name='approved-metadata-search';expectedIndex='search_documents_fts';sql="SELECT exercise_id,title,ts_rank_cd(ARRAY[0.1,0.3,0.4,0.5]::real[],document,model_lab.prefix_query('calibrationneedle')) AS rank FROM model_lab.published_catalog WHERE release_id=model_lab.gid(1) AND locale='en' AND document @@ model_lab.prefix_query('calibrationneedle') ORDER BY rank DESC,exercise_id LIMIT 20"},
  [ordered]@{name='owner-recent-sessions';expectedIndex='sessions_owner_recent';sql="SELECT id,updated_at FROM model_lab.sessions WHERE owner_id=ANY(ARRAY[model_lab.gid(21),model_lab.gid(11)]) ORDER BY updated_at DESC,id DESC LIMIT 20"}
 )
 $plans=@()
 foreach($q in $queries){$raw=Sql ('SET search_path=model_lab,pg_catalog;EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+$q.sql);$decoded=$raw|ConvertFrom-Json;$plan=$decoded[0];$indexes=@(Plan-Indexes $plan.Plan);if($indexes -notcontains $q.expectedIndex){throw ('Expected natural index plan missing: '+$q.name)};$plans+=[ordered]@{name=$q.name;expectedIndex=$q.expectedIndex;observedIndexes=$indexes;explain=$plan}}
 $report=(Sql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'database-lab/summary.sql'))))|ConvertFrom-Json
 if(-not $report.complete){throw 'A database design assertion failed.'}
 $digest=& docker image inspect $Image --format '{{index .RepoDigests 0}}';if($LASTEXITCODE -ne 0){throw 'Could not record lab image identity.'}
 $report|Add-Member hostOrApplicationVolumesMounted $false
 $report|Add-Member temporaryDataLimitMiB 1536
 $report|Add-Member sharedBuffers '64MB'
 $report|Add-Member maxWalSize '128MB'
 $sourceHashes=@(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'database-lab') -Filter '*.sql'|ForEach-Object {[ordered]@{file=$_.Name;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
 $report|Add-Member sourceSqlHashes $sourceHashes
 $report|Add-Member observedAt ([DateTime]::UtcNow.ToString('o'));$report|Add-Member imageDigest $digest;$report|Add-Member containerNetwork 'none';$report|Add-Member queryPlansChecked $plans.Count;$report|Add-Member actualConcurrentRaceVerified $blocked
 [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'database-design-observations.json'),($report|ConvertTo-Json -Depth 10)+"`n",[Text.UTF8Encoding]::new($false))
 [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'database-query-plans.json'),([ordered]@{version=1;observedAt=$report.observedAt;data='Synthetic 100000-document fixture; no real student/catalog records';plannerSettings='Defaults; ANALYZE run; sequential scans not disabled';plans=$plans}|ConvertTo-Json -Depth 35)+"`n",[Text.UTF8Encoding]::new($false))
 Write-Host ('PASS: '+$report.checks.Count+' database checks, '+$plans.Count+' natural query plans, real two-connection draft race.')
}finally{if($started){& docker rm -f $labName|Out-Null}}
