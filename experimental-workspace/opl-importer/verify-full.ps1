param([switch]$CrashProbe)
$ErrorActionPreference='Stop'
$compose=Join-Path $PSScriptRoot 'compose.yaml'
$name='opl-full-acceptance-'+[guid]::NewGuid().ToString('N').Substring(0,10)
$probe=$name+'-probe';$probeCreated=$false;$reportCreated=$false
try {
 if($CrashProbe){
  docker compose -f $compose run -d --name $probe --entrypoint node importer crash-probe.mjs
  if($LASTEXITCODE -ne 0){throw 'Crash probe launch failed'};$probeCreated=$true
  $deadline=[DateTime]::UtcNow.AddSeconds(50);$ready=$false
  while([DateTime]::UtcNow -lt $deadline){
   $logs=(&docker logs $probe 2>&1) -join "`n"
   if($logs -match 'PAUSED_AFTER_COMMIT '){$ready=$true;break}
   $running=&docker inspect $probe --format '{{.State.Running}}'
   if($running -eq 'false'){throw 'Crash probe exited; it requires an unfinished import (use ordinary verification after completion)'}
   Start-Sleep -Milliseconds 300
  }
  if(-not $ready){throw 'Committed checkpoint not reached'}
  docker kill $probe|Out-Null;if($LASTEXITCODE -ne 0){throw 'Crash probe kill failed'}
  $exit=&docker inspect $probe --format '{{.State.ExitCode}}';if($exit -ne '137'){throw 'Expected killed process exit 137'}
 }
 docker compose -f $compose run --rm importer import
 if($LASTEXITCODE -ne 0){throw 'Full import/resume failed'}
 docker compose -f $compose run --name $name --entrypoint node importer verify-full.mjs
 $reportCreated=$true
 if($LASTEXITCODE -ne 0){throw 'Full-library assertions failed'}
 docker cp ($name+':/state/full-import-observations.json') (Join-Path $PSScriptRoot 'full-import-observations.json')
 if($LASTEXITCODE -ne 0){throw 'Sanitized report copy failed'}
}finally{
 if($probeCreated){docker rm -f $probe|Out-Null}
 if($reportCreated){docker rm -f $name|Out-Null}
}
