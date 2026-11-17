param([switch]$RequireRelease)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$checks=[ordered]@{}
function DockerJson([string[]]$Arguments){$value=& docker @Arguments;if($LASTEXITCODE -ne 0){throw 'Private operator inspection failed'};return ($value -join [char]10)|ConvertFrom-Json}
$backend=DockerJson @('inspect','linear-algebra-accounts-backend-1')
$renderer=DockerJson @('inspect','linear-algebra-experimental-renderer-1')
$auth=DockerJson @('inspect','linear-algebra-accounts-auth-1')
$attestation=DockerJson @('exec','linear-algebra-verification-renderer-1','cat','/usr/app/verification-build.json')
$checks.backendHealthy=$backend.State.Health.Status -eq 'healthy'
$checks.noBackendHostPorts=@($backend.NetworkSettings.Ports.psobject.Properties|Where-Object {$null -ne $_.Value}).Count -eq 0
$checks.noRendererHostPorts=@($renderer.NetworkSettings.Ports.psobject.Properties|Where-Object {$null -ne $_.Value}).Count -eq 0
$checks.strictRendererCertification=$attestation.pgTrackedClean -eq $true -and $attestation.rendererSourceClean -eq $true -and $attestation.recipeMatches -eq $true
& docker exec linear-algebra-accounts-backend-1 node -e "const f=require('fs');if(JSON.stringify(f.readdirSync('/secrets').sort())!==JSON.stringify(['encryption-key','practice-db-password']))process.exit(1)"
$checks.scopedBackendSecrets=$LASTEXITCODE -eq 0
& docker exec linear-algebra-accounts-auth-1 sh -c 'test ! -f /secrets/encryption-key && test ! -f /secrets/database-password && test -f /secrets/jwt-secret'
$checks.scopedAuthSecrets=$LASTEXITCODE -eq 0
$checks.emailAutoconfirmDisabled=-not($auth.Config.Env -contains 'GOTRUE_MAILER_AUTOCONFIRM=true')
$checks.currentAccountEvidence=$false
$latest=Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../accounts/acceptance') -Directory|Sort-Object Name -Descending|Where-Object {Test-Path -LiteralPath (Join-Path $_.FullName 'manifest.json')}|Select-Object -First 1
if($latest){
 $manifest=Get-Content -LiteralPath (Join-Path $latest.FullName 'manifest.json') -Raw|ConvertFrom-Json
 $valid=$manifest.complete -eq $true
 foreach($binding in $manifest.sourceHashes){$path=Join-Path $root $binding.file;if(-not(Test-Path -LiteralPath $path) -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $binding.sha256){$valid=$false}}
 $checks.currentAccountEvidence=$valid
}
$checks.backupRestoreVerified=$false;$checks.actualReplicaVerified=$false
foreach($directory in (Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'acceptance') -Directory|Sort-Object Name -Descending)){
 $file=Join-Path $directory.FullName 'manifest.json';if(-not(Test-Path -LiteralPath $file)){continue};$manifest=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json
 if($manifest.targets.Count -eq 2 -and $manifest.complete){$valid=$true;foreach($binding in $manifest.sourceHashes){if((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $binding.file) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $binding.sha256){$valid=$false}};if($valid){$checks.backupRestoreVerified=$true}}
 if($manifest.backendImage -eq $backend.Image -and $manifest.complete){$checks.actualReplicaVerified=$true}
}
$previousOrigin=$env:MATHPRACTICE_RELEASE_ORIGIN
try{
 $env:MATHPRACTICE_RELEASE_ORIGIN='https://practice.example.invalid'
 & docker compose -f (Join-Path $PSScriptRoot '../compose.yaml') -f (Join-Path $PSScriptRoot 'renderer.release.yaml') config --quiet;$one=$LASTEXITCODE -eq 0
 & docker compose -f (Join-Path $PSScriptRoot '../accounts/compose.yaml') -f (Join-Path $PSScriptRoot 'accounts.release.yaml') --profile practice config --quiet;$two=$LASTEXITCODE -eq 0
 & docker compose -f (Join-Path $PSScriptRoot '../discovery/compose.yaml') -f (Join-Path $PSScriptRoot 'home.release.yaml') config --quiet
 $checks.releaseTemplatesParse=$one -and $two -and $LASTEXITCODE -eq 0
}finally{$env:MATHPRACTICE_RELEASE_ORIGIN=$previousOrigin}
$reviews=$null;$reviewFile=Join-Path $PSScriptRoot 'release-review.json'
if(Test-Path -LiteralPath $reviewFile){$reviews=Get-Content -LiteralPath $reviewFile -Raw|ConvertFrom-Json}
foreach($name in @('physicalDevice','screenReaderListening','offHostRecovery','httpsAndIngress','verifiedEmailAndRecoveryFlow','representativeLoad','productionRightsAndContentReview')){
 $review=if($reviews -and $reviews.checks){$reviews.checks.$name}else{$null}
 $checks[$name]=$null -ne $review -and $review.result -eq 'passed' -and -not [string]::IsNullOrWhiteSpace($review.reviewer) -and -not [string]::IsNullOrWhiteSpace($review.observedAt) -and -not [string]::IsNullOrWhiteSpace($review.evidence)
}
$checks.upstreamDependencyRemediation=$false # Node 16/Ubuntu 20.04/npm-install context is measured and unresolved.
$blocked=@($checks.Keys|Where-Object {$checks[$_] -ne $true})
$report=[ordered]@{version=1;observedAt=[DateTime]::UtcNow.ToString('o');complete=$true;releaseReady=$blocked.Count -eq 0;checks=$checks;blockers=$blocked;scope='Local measured readiness and explicit operator review requirements; this command never deploys, certifies a context or activates exercises'}
$directory=Join-Path $PSScriptRoot ('preflight/'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'));New-Item -ItemType Directory -Path $directory|Out-Null
[IO.File]::WriteAllText((Join-Path $directory 'readiness.json'),($report|ConvertTo-Json -Depth 6)+[char]10,[Text.UTF8Encoding]::new($false))
Write-Output ($report|ConvertTo-Json -Depth 6)
if($RequireRelease -and -not $report.releaseReady){throw 'Release blocked. See the saved readiness report; no deployment was performed.'}
