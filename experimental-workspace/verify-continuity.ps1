param([switch]$OutageOnly,[string]$ArtifactsDirectory)
$ErrorActionPreference='Stop'
function Invoke-DockerCheck {
 param([string[]]$Arguments)
 & docker @Arguments
 if($LASTEXITCODE -ne 0){throw 'Docker continuity verification failed.'}
}
function Write-Phase {param([string]$Name) [IO.File]::WriteAllText((Join-Path $resolvedArtifacts ($Name+'.json')),('{"phase":"'+$Name+'"}'),[Text.UTF8Encoding]::new($false))}
function Wait-Artifact {
 param([string]$Name)
 $deadline=[DateTime]::UtcNow.AddSeconds(120)
 while([DateTime]::UtcNow -lt $deadline){
  if(Test-Path -LiteralPath (Join-Path $resolvedArtifacts $Name)){return}
  $failedPath=Join-Path $resolvedArtifacts 'failure-continuity-observations.json'
  if(Test-Path -LiteralPath $failedPath){$failed=Get-Content -LiteralPath $failedPath -Raw|ConvertFrom-Json;if(-not $failed.complete){throw ('Browser continuity failed: '+$failed.failure)}}
  Start-Sleep -Milliseconds 200
 }
 throw ('Timed out waiting for browser phase: '+$Name)
}
Push-Location -LiteralPath $PSScriptRoot
$qaName='linear-continuity-outage-qa';$qaStarted=$false;$rendererStopped=$false;$restartSucceeded=$false;$fallbackUsed=$false;$sameRendererContainer=$false;$runPassed=$false
try{
 if(-not $ArtifactsDirectory){$ArtifactsDirectory=Join-Path $env:TEMP ('failure-continuity-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))}
 New-Item -ItemType Directory -Path $ArtifactsDirectory -Force|Out-Null
 $resolvedArtifacts=(Resolve-Path -LiteralPath $ArtifactsDirectory).Path
 if(Test-Path -LiteralPath (Join-Path $resolvedArtifacts 'ready.json')){throw 'Use a fresh artifact directory for each run.'}
 Write-Host ('Continuity artifacts: '+$resolvedArtifacts)
 Invoke-DockerCheck @('compose','config','--quiet')
 Invoke-DockerCheck @('compose','up','-d','--wait','--wait-timeout','240','renderer','workspace')
 $expected=(Get-Content workspace/server/catalog-compatibility-evidence.json -Raw|ConvertFrom-Json).runtimeFingerprint
 $fingerprintCode="import {runtimeFingerprint} from './server/catalog-compatibility.mjs';process.stdout.write(runtimeFingerprint());"
 $actual=& docker compose exec -T workspace node --input-type=module -e $fingerprintCode
 if($LASTEXITCODE -ne 0 -or $actual -cne $expected){throw 'The normal workspace does not match current compatibility evidence. Rebuild and reverify before this audit.'}
 if(-not $OutageOnly){
  Invoke-DockerCheck @('compose','exec','-T','workspace','npm','test')
  Invoke-DockerCheck @('compose','exec','-T','workspace','node','server/check-catalog.mjs')
  Invoke-DockerCheck @('build','-f','browser-tests/Dockerfile','-t','linear-algebra-picker-qa','.')
  Invoke-DockerCheck @('run','--rm','--network','linear-algebra-experimental_default','--shm-size=1g','--mount',('type=bind,source='+$resolvedArtifacts+',target=/artifacts'),'-e',('PRACTICE_RUNTIME_FINGERPRINT='+$expected),'linear-algebra-picker-qa','node','--test','--test-reporter=./continuity-reporter.mjs','picker.test.mjs')
 }
 Invoke-DockerCheck @('build','-f','compatibility/Dockerfile','-t','linear-algebra-compatibility-qa','.')
 $beforeRenderer=& docker compose ps -q renderer
 if($LASTEXITCODE -ne 0 -or -not $beforeRenderer){throw 'Renderer container is unavailable.'}
 $qaId=& docker run -d --name $qaName --network linear-algebra-experimental_default --shm-size=1g --mount ('type=bind,source='+$resolvedArtifacts+',target=/artifacts') linear-algebra-compatibility-qa node compatibility/failure-continuity.mjs
 if($LASTEXITCODE -ne 0){throw 'Browser outage container could not start.'};$qaStarted=$true
 Wait-Artifact 'ready.json'
 Write-Host 'Stopping only the experimental renderer for real desktop/mobile failure checks.'
 $rendererStopped=$true
 Invoke-DockerCheck @('compose','kill','--signal','SIGKILL','renderer')
 Write-Phase 'offline'
 Wait-Artifact 'offline-verified.json'
 Invoke-DockerCheck @('compose','start','--wait','--wait-timeout','180','renderer')
 $restartSucceeded=$true
 $afterRenderer=& docker compose ps -q renderer
 $sameRendererContainer=$beforeRenderer -ceq $afterRenderer
 if(-not $sameRendererContainer){throw 'The renderer was replaced instead of restarting normally.'}
 Write-Phase 'online'
 Wait-Artifact 'failure-continuity-observations.json'
 $qaExit=& docker wait $qaName
 if($LASTEXITCODE -ne 0 -or $qaExit -ne '0'){throw 'Browser outage audit failed.'}
 $reportPath=Join-Path $resolvedArtifacts 'failure-continuity-observations.json';$json=[IO.File]::ReadAllText($reportPath)
 if($json -match 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.|"(answers|seed|sessionJWT|problemJWT|answerJWT|sessionId|renderedHTML|html|student_value|correct_value|correct_ans|rendererSessionToken)"\s*:|/assets/exercise/[A-Za-z0-9_-]{43}/'){throw 'Private response data detected in observations; do not publish.'}
 $report=$json|ConvertFrom-Json
 if(-not $report.complete -or $report.cases.Count -ne 2 -or $report.runtimeFingerprint -cne $expected){throw 'Incomplete or stale browser continuity report.'}
 $runPassed=$true
 [pscustomobject]@{Result='PASS';Cases=2;NormalRendererRestart=$restartSucceeded;SameRendererContainer=$sameRendererContainer;FullBrowserSuite=(-not $OutageOnly);Artifacts=$resolvedArtifacts}
}finally{
 try{
  if($rendererStopped -and -not $restartSucceeded){
   try{Invoke-DockerCheck @('compose','start','--wait','--wait-timeout','180','renderer');$restartSucceeded=$true}
   catch{$fallbackUsed=$true;Invoke-DockerCheck @('compose','up','-d','--force-recreate','--wait','--wait-timeout','180','renderer')}
  }
 }finally{
  if($qaStarted){& docker rm -f $qaName|Out-Null}
  if($resolvedArtifacts){
   $orchestration=[ordered]@{schemaVersion=1;observedAt=[DateTime]::UtcNow.ToString('o');runtimeFingerprint=$expected;rendererStopped=$rendererStopped;normalRestartSucceeded=$restartSucceeded;sameRendererContainer=$sameRendererContainer;fallbackUsed=$fallbackUsed;complete=$runPassed}
   [IO.File]::WriteAllText((Join-Path $resolvedArtifacts 'outage-orchestration.json'),($orchestration|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
  }
  Pop-Location
 }
}