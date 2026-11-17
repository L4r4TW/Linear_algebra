param([ValidateSet('accounts','catalog','both')][string]$Target='both')
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
function Check([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
docker build -f (Join-Path $PSScriptRoot 'Backup.Dockerfile') -t linear-algebra-backup-tools $root;Check 'Encrypted backup tools build failed'
docker volume create linear-algebra-experimental_backups|Out-Null;Check 'Backup volume creation failed'
docker volume create linear-algebra-experimental_backup_keys|Out-Null;Check 'Recovery key volume creation failed'
$runId=[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
$output=Join-Path $PSScriptRoot ('acceptance/'+$runId);New-Item -ItemType Directory -Path $output|Out-Null
$targets=if($Target -eq 'both'){@('accounts','catalog')}else{@($Target)}
foreach($item in $targets){
 $suffix=[guid]::NewGuid().ToString('N').Substring(0,12)
 $database='mathpractice_restore_'+$suffix;$network='mathpractice_restore_net_'+$suffix;$volume='mathpractice_restore_data_'+$suffix;$probe='mathpractice_restore_probe_'+$suffix
 try{
  docker network create --internal $network|Out-Null;Check 'Disposable restore network creation failed'
  docker volume create $volume|Out-Null;Check 'Disposable restore volume creation failed'
  $name=if($item -eq 'accounts'){'account_restore'}else{'catalog_restore'}
  docker run -d --name $database --network $network -e ('POSTGRES_DB='+$name) -e POSTGRES_HOST_AUTH_METHOD=trust --mount ('type=volume,source='+$volume+',target=/var/lib/postgresql/data') --health-cmd ('pg_isready -U postgres -d '+$name) --health-interval 1s --health-retries 30 'postgres@sha256:a49f7438ba03589f9b1ca062f2da82e899b48ea1dc50d2449fa09a70be83ebca'|Out-Null
  Check 'Disposable restore database failed'
  $ready=$false
  for($i=0;$i -lt 30;$i++){$status=docker inspect $database --format '{{.State.Health.Status}}';Check 'Restore health check failed';if($status -eq 'healthy'){$ready=$true;break};Start-Sleep -Seconds 1}
  if(-not $ready){throw 'Disposable restore database did not become healthy'}
  docker create --name $probe --network $network --memory 512m --pids-limit 96 -e ('BACKUP_TARGET='+$item) -e ('RESTORE_HOST='+$database) --mount type=volume,source=linear-algebra-accounts_secrets,target=/secrets,readonly --mount type=volume,source=linear-algebra-experimental_backups,target=/backups --mount type=volume,source=linear-algebra-experimental_backup_keys,target=/backup-keys linear-algebra-backup-tools restore-probe.mjs|Out-Null
  Check 'Restore probe creation failed'
  docker network connect linear-algebra-accounts_private $probe;Check 'Account backup connection failed'
  docker network connect linear-algebra-opl-catalog_catalog $probe;Check 'Catalog backup connection failed'
  docker start -a $probe;Check 'Restore probe start failed'
  $exitCode=docker inspect $probe --format '{{.State.ExitCode}}';Check 'Restore state check failed'
  if($exitCode -ne '0'){throw ('Encrypted '+$item+' restore failed')}
  docker cp ($probe+':/artifacts/restore-observations.json') (Join-Path $output ($item+'.json'));Check 'Sanitized restore report copy failed'
 }finally{
  docker rm -f $probe 2>$null|Out-Null
  docker rm -f $database 2>$null|Out-Null
  docker volume rm $volume 2>$null|Out-Null
  docker network rm $network 2>$null|Out-Null
 }
}
$hashes=@();foreach($file in @('Backup.Dockerfile','backup.mjs','restore-probe.mjs','verify-backup.ps1')){$hashes+=[pscustomobject]@{file=$file;sha256=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $file) -Algorithm SHA256).Hash.ToLowerInvariant()}}
$report=@{version=1;complete=$true;observedAt=[DateTime]::UtcNow.ToString('o');targets=$targets;sourceHashes=$hashes;scope='Encrypted live database snapshot backups restored into separate fresh isolated databases; original volumes never modified; no offsite durability claim'}
[IO.File]::WriteAllText((Join-Path $output 'manifest.json'),($report|ConvertTo-Json -Depth 6)+[char]10,[Text.UTF8Encoding]::new($false))
Write-Output ('Complete isolated backup/restore acceptance: '+$runId)
