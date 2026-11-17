$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
function Check([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
$suffix=[guid]::NewGuid().ToString('N').Substring(0,12);$replica='account_replica_'+$suffix;$probe='account_replica_probe_'+$suffix
try{
 $image=docker inspect linear-algebra-accounts-backend-1 --format '{{.Image}}';Check 'Live backend image lookup failed'
 docker create --name $replica --network linear-algebra-accounts_private --user 1000:1000 --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m --cap-drop ALL --security-opt no-new-privileges:true --memory 384m --pids-limit 96 -e APP_ORIGIN=http://localhost:3100 -e RENDERER_URL=http://linear-algebra-experimental-renderer-1:3000 --mount type=volume,source=linear-algebra-accounts_secrets,target=/secrets,readonly,volume-subpath=backend $image node server.mjs|Out-Null
 Check 'Separate backend process creation failed'
 docker network connect linear-algebra-experimental_default $replica;Check 'Private renderer network connection failed'
 docker start $replica|Out-Null;Check 'Separate backend start failed'
 docker create --name $probe --network linear-algebra-accounts_private -e ('SECONDARY_URL=http://'+$replica+':3000') 'node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee' node /replica-probe.mjs|Out-Null
 Check 'Replica probe creation failed'
 docker cp (Join-Path $PSScriptRoot 'replica-probe.mjs') ($probe+':/replica-probe.mjs');Check 'Replica probe source copy failed'
 docker start -a $probe;Check 'Replica probe start failed'
 $code=docker inspect $probe --format '{{.State.ExitCode}}';if($code -ne '0'){throw 'Actual separate-process grading acceptance failed'}
 $directory=Join-Path $PSScriptRoot ('acceptance/'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')+'-'+$suffix);New-Item -ItemType Directory -Path $directory|Out-Null
 docker cp ($probe+':/artifacts/replica-observations.json') (Join-Path $directory 'replica-observations.json');Check 'Sanitized replica report copy failed'
 $hashes=@();foreach($file in @('replica-probe.mjs','verify-replicas.ps1')){$hashes+=[pscustomobject]@{file=$file;sha256=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $file) -Algorithm SHA256).Hash.ToLowerInvariant()}}
 $manifest=@{version=1;complete=$true;backendImage=$image;sourceHashes=$hashes}
 [IO.File]::WriteAllText((Join-Path $directory 'manifest.json'),($manifest|ConvertTo-Json -Depth 6)+[char]10,[Text.UTF8Encoding]::new($false))
 Write-Output ('Complete actual replica acceptance: '+$directory)
}finally{docker rm -f $probe 2>$null|Out-Null;docker rm -f $replica 2>$null|Out-Null}
