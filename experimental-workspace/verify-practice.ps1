param(
    [switch]$IncludeRendererOutage,
    [switch]$RendererOutageOnly,
    [string]$ApiUrl = 'http://localhost:3100'
)

$ErrorActionPreference = 'Stop'

function Invoke-DockerCheck {
    param([string[]]$CommandArguments)
    & docker @CommandArguments
    if ($LASTEXITCODE -ne 0) { throw ('Docker verification failed: ' + ($CommandArguments -join ' ')) }
}

function Invoke-StudentApi {
    param($Client, [string]$Method, [string]$Path, $Payload = $null)
    $request = [System.Net.Http.HttpRequestMessage]::new(
        [System.Net.Http.HttpMethod]::new($Method), $ApiUrl.TrimEnd('/') + $Path)
    try {
        if ($null -ne $Payload) {
            $request.Content = [System.Net.Http.StringContent]::new(
                (ConvertTo-Json -InputObject $Payload -Depth 12 -Compress),
                [System.Text.Encoding]::UTF8, 'application/json')
        }
        $response = $Client.SendAsync($request).GetAwaiter().GetResult()
        try {
            $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            [pscustomobject]@{ Status = [int]$response.StatusCode; Data = ($body | ConvertFrom-Json) }
        } finally { $response.Dispose() }
    } finally { $request.Dispose() }
}

function Assert-Status {
    param($Response, [int]$Expected, [string]$Stage)
    if ($Response.Status -ne $Expected) { throw ($Stage + ': expected HTTP ' + $Expected + ', received ' + $Response.Status) }
}

function Get-QuestionSignature {
    param([string]$Html)
    $expressions = @([regex]::Matches($Html, '(?s)<script[^>]*>(.*?)</script>') | ForEach-Object { $_.Groups[1].Value })
    if ($expressions.Count -lt 7) { throw 'The verified question is missing its mathematical expressions.' }
    ConvertTo-Json -InputObject $expressions -Compress
}

function Test-RendererRecovery {
    Add-Type -AssemblyName System.Net.Http
    $ownerHandler = [System.Net.Http.HttpClientHandler]::new()
    $ownerHandler.CookieContainer = [System.Net.CookieContainer]::new()
    $owner = [System.Net.Http.HttpClient]::new($ownerHandler)
    $owner.Timeout = [TimeSpan]::FromSeconds(45)
    $strangerHandler = [System.Net.Http.HttpClientHandler]::new()
    $strangerHandler.CookieContainer = [System.Net.CookieContainer]::new()
    $stranger = [System.Net.Http.HttpClient]::new($strangerHandler)
    $stranger.Timeout = [TimeSpan]::FromSeconds(45)
    try {
        # Cookies and submission data remain in memory; no tokens or instructor answers are printed.
        $started = Invoke-StudentApi $owner POST '/api/sessions' @{ exerciseId = 'dot-product-01' }
        Assert-Status $started 201 'Start outage fixture'
        $path = '/api/sessions/' + $started.Data.session.id
        $answers = @(@('AnSwEr0001', ' 2 + 3 '), @('AnSwEr0002', '<1, 2, 3>'), @('AnSwEr0003', '0'), @('AnSwEr0004', '0'))
        $checked = Invoke-StudentApi $owner POST ($path + '/answers') @{ answers = $answers }
        Assert-Status $checked 200 'Grade outage fixture'
        if ($checked.Data.submission.number -ne 1) { throw 'Unexpected initial submission number.' }
        $snapshot = ConvertTo-Json -InputObject $checked.Data.submission -Depth 20 -Compress
        $question = Get-QuestionSignature $checked.Data.exercise.html
        Write-Host 'Temporarily stopping only the experimental renderer to verify a real outage.'
        try {
            # An abrupt outage leaves the old PID file, exercising restart cleanup too.
            Invoke-DockerCheck @('compose', 'kill', '--signal', 'SIGKILL', 'renderer')
            $failed = Invoke-StudentApi $owner POST ($path + '/answers') @{ answers = ,@('AnSwEr0001', 'changed while offline') }
            Assert-Status $failed 503 'Grade while renderer is offline'
            if ($failed.Data.error.code -ne 'RENDERER_UNAVAILABLE') { throw 'Outage did not return the expected friendly error.' }
            Assert-Status (Invoke-StudentApi $owner GET $path) 503 'Restore while renderer is offline'
            Assert-Status (Invoke-StudentApi $stranger GET $path) 404 'Unauthorized restore during outage'
            Assert-Status (Invoke-StudentApi $stranger POST ($path + '/answers') @{ answers = @() }) 404 'Unauthorized grade during outage'
            Assert-Status (Invoke-StudentApi $owner GET '/health') 200 'Workspace health during renderer outage'
        } finally {
            try {
                Invoke-DockerCheck @('compose', 'start', '--wait', '--wait-timeout', '180', 'renderer')
            } catch {
                # Recover service even when the normal-restart regression check fails.
                Write-Warning 'Normal renderer restart failed; recovering only its container without removing volumes.'
                Invoke-DockerCheck @('compose', 'up', '-d', '--force-recreate', '--wait', '--wait-timeout', '180', 'renderer')
                throw 'Renderer required container replacement instead of a normal restart.'
            }
        }
        $restored = Invoke-StudentApi $owner GET $path
        Assert-Status $restored 200 'Restore after renderer recovery'
        if ((ConvertTo-Json -InputObject $restored.Data.submission -Depth 20 -Compress) -cne $snapshot) {
            throw 'Renderer outage or recovery changed the accepted submission.'
        }
        if ((Get-QuestionSignature $restored.Data.exercise.html) -cne $question) {
            throw 'Renderer recovery changed the exercise question or saved answer previews.'
        }
        [pscustomobject]@{
            Check = 'Real renderer outage and recovery'
            UnavailableStatus = 503
            UnauthorizedStatus = 404
            RestoredSubmission = $restored.Data.submission.number
            Result = 'PASS'
        }
    } finally {
        $owner.Dispose()
        $stranger.Dispose()
    }
}

Push-Location -LiteralPath $PSScriptRoot
try {
    Invoke-DockerCheck @('compose', 'config', '--quiet')
    Invoke-DockerCheck @('compose', 'up', '-d', '--wait', '--wait-timeout', '240', 'renderer')
    Invoke-DockerCheck @('compose', 'up', '--build', '-d', '--wait', '--wait-timeout', '120', 'workspace')
    if (-not $RendererOutageOnly) {
        Invoke-DockerCheck @('compose', 'exec', '-T', 'workspace', 'npm', 'test')
        foreach ($check in @('smoke:renderer-client', 'smoke:sessions', 'smoke:api', 'smoke:grading', 'smoke:submission-state')) {
            Invoke-DockerCheck @('compose', 'exec', '-T', 'workspace', 'npm', 'run', $check)
        }
        & (Join-Path $PSScriptRoot 'smoke-renderer.ps1')
        Invoke-DockerCheck @('build', '-f', 'browser-tests/Dockerfile', '-t', 'linear-algebra-picker-qa', '.')
        Invoke-DockerCheck @('run', '--rm', '--network', 'linear-algebra-experimental_default', '--shm-size=1g', 'linear-algebra-picker-qa')
    }
    if ($IncludeRendererOutage -or $RendererOutageOnly) { Test-RendererRecovery }
    [pscustomobject]@{ ExerciseId = 'dot-product-01'; RendererOutageChecked = [bool]($IncludeRendererOutage -or $RendererOutageOnly); FullSuiteChecked = -not $RendererOutageOnly; Result = 'PASS' }
} finally { Pop-Location }
