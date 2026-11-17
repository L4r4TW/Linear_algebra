param([switch]$NoController)
$ErrorActionPreference='Stop'
$context=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'context.json') -Raw|ConvertFrom-Json
function Check([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
foreach($image in @($context.workerImage,$context.rendererImage)){
 docker image inspect $image --format '{{.Id}}'|Out-Null
 Check 'A measured image is missing. Use setup.ps1 -NewContext to build and reverify; do not rewrite context hashes.'
}
$current=(docker exec linear-algebra-opl-catalog-database-1 psql -X -q -t -A -U postgres -d opl_catalog -c "SELECT context_id FROM catalog.verifier_heads WHERE scope='local-practice';")-join ''
Check 'Current verifier context unavailable'
if($current.Trim() -ne $context.id){throw 'Verifier context changed. Inspect its evidence before resuming this batch.'}
$source=(docker run --rm --mount type=volume,source=linear-algebra-experimental_opl,target=/opl,readonly $context.workerImage pipeline/cli.mjs source-doctor)-join ''
Check 'Read-only library check failed'
$source=$source|ConvertFrom-Json
$pin=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'candidates.json') -Raw|ConvertFrom-Json).sourceRevision
if(-not $source.clean -or $source.revision -ne $pin){throw 'Library snapshot is dirty or differs from the reviewed pin; no worker was resumed'}
$expected=@{
 'linear-algebra-calculus-renderer-1'=$context.rendererImage
 'linear-algebra-calculus-worker-1'=$context.workerImage
 'linear-algebra-calculus-worker-2'=$context.workerImage
}
foreach($name in $expected.Keys){
 $actual=(docker inspect $name --format '{{.Image}}')-join '';Check 'Existing verification container missing'
 if($actual.Trim() -ne $expected[$name]){throw 'Container image differs from measured context; rebuild/reverify explicitly.'}
}
docker start linear-algebra-calculus-renderer-1|Out-Null;Check 'Candidate renderer resume failed'
$ready=$false
for($i=0;$i -lt 48;$i++){
 $state=(docker inspect linear-algebra-calculus-renderer-1 --format '{{.State.Health.Status}}')-join '';Check 'Health read failed'
 if($state -eq 'healthy'){$ready=$true;break};Start-Sleep -Seconds 2
}
if(-not $ready){throw 'Candidate renderer failed health; no worker was resumed'}
docker start linear-algebra-calculus-worker-1 linear-algebra-calculus-worker-2|Out-Null;Check 'Worker resume failed'
if(-not $NoController){docker start linear-algebra-calculus-controller|Out-Null;Check 'Existing quota controller resume failed'}
Write-Output 'Resumed the existing measured verification containers. No images rebuilt, context replaced, reviews recorded or sources activated.'
