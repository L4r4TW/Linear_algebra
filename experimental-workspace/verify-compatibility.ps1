param(
    [string[]]$ExerciseId,
    [int[]]$Seeds,
    [ValidateSet('desktop','mobile')][string[]]$Viewports,
    [string]$ArtifactsDirectory = ([IO.Path]::Combine([IO.Path]::GetTempPath(), 'linear-compatibility'))
)
$ErrorActionPreference = 'Stop'
$workspace = $PSScriptRoot
$runDirectory = Join-Path $ArtifactsDirectory ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Force -Path $runDirectory | Out-Null
$resolvedArtifacts = (Resolve-Path -LiteralPath $runDirectory).ProviderPath
function Invoke-DockerCheck {
    param([string[]]$Arguments)
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw ('Verification failed: docker ' + ($Arguments -join ' ')) }
}
Push-Location -LiteralPath $workspace
try {
    $catalog = Get-Content -Raw compatibility/catalog.json | ConvertFrom-Json
    if ($ExerciseId) { foreach ($id in $ExerciseId) { if ($id -notin $catalog.exercises.id) { throw ('Unknown operator exercise ID: ' + $id) } } }
    if ($PSBoundParameters.ContainsKey('Seeds')) { if ($Seeds.Count -eq 0) { throw 'Provide at least one verification seed.' }; foreach ($seed in $Seeds) { if ($seed -lt 1 -or $seed -gt 2147483647) { throw 'Seeds must be in the renderer integer range.' } } }
    # Uses the existing external Linux OPL volume. Never clones library files to the host or removes volumes.
    Invoke-DockerCheck @('compose','config','--quiet')
    Invoke-DockerCheck @('compose','up','--build','-d','--wait','--wait-timeout','240')
    Invoke-DockerCheck @('compose','exec','-T','workspace','npm','test')
    Invoke-DockerCheck @('compose','exec','-T','workspace','node','server/check-catalog.mjs')
    Invoke-DockerCheck @('build','-f','browser-tests/Dockerfile','-t','linear-algebra-picker-qa','.')
    Invoke-DockerCheck @('run','--rm','--network','linear-algebra-experimental_default','--shm-size=1g','linear-algebra-picker-qa')
    Invoke-DockerCheck @('build','-f','compatibility/Dockerfile','-t','linear-algebra-compatibility-qa','.')
    Invoke-DockerCheck @('run','--rm','linear-algebra-compatibility-qa','node','--test','compatibility/regression-report.test.mjs','compatibility/build-catalog.test.mjs')
    $arguments = @('run','--rm','--network','linear-algebra-experimental_default','--shm-size=1g','-e','COMPATIBILITY_REGRESSION=1')
    if ($ExerciseId) { $arguments += @('-e', ('WIDGET_FIXTURES=' + ($ExerciseId -join ','))) }
    if ($PSBoundParameters.ContainsKey('Seeds')) { $arguments += @('-e', ('COMPATIBILITY_SEEDS=' + (ConvertTo-Json -InputObject @($Seeds) -Compress))) }
    if ($Viewports) { $arguments += @('-e', ('COMPATIBILITY_VIEWPORTS=' + ($Viewports -join ','))) }
    $arguments += @('--mount','type=volume,source=linear-algebra-experimental_opl,target=/opl,readonly','--mount',('type=bind,source=' + $resolvedArtifacts + ',target=/artifacts'),'linear-algebra-compatibility-qa','node','compatibility/widget-acceptance.mjs')
    & docker @arguments
    $regressionExit = $LASTEXITCODE
    $resultPath = Join-Path $resolvedArtifacts 'regression-results.json'
    if (-not (Test-Path -LiteralPath $resultPath)) { throw ('No regression report was produced. Artifacts: ' + $resolvedArtifacts) }
    $json = [IO.File]::ReadAllText($resultPath)
    if ($json -match 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.' -or $json -match '"(sessionJWT|problemJWT|answerJWT|correct_value|correct_ans|renderedHTML|rendererSessionToken|seed|answers)"\s*:' -or $json -match '/assets/exercise/[A-Za-z0-9_-]{43}/') { throw 'Private renderer data detected in the operator report; do not publish the artifacts.' }
    $report = $json | ConvertFrom-Json
    Write-Host ('HTML report: ' + (Join-Path $resolvedArtifacts 'index.html'))
    Write-Host ('Markdown report: ' + (Join-Path $resolvedArtifacts 'REGRESSION_STATUS.md'))
    Write-Host ('Cases: {0}/{1}; known limited cases: {2}; focused run: {3}' -f $report.summary.completedCases,$report.summary.expectedCases,$report.summary.limitedCases,$report.partial)
    if ($regressionExit -ne 0 -or -not $report.complete -or -not $report.summary.passed) { throw 'Compatibility regression failed. Open the report for case failures and capability boundaries.' }
} finally { Pop-Location }
