param(
    [string]$RendererUrl = 'http://localhost:3101',
    [string]$ExerciseId = 'dot-product-01'
)

$ErrorActionPreference = 'Stop'
$catalog = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'workspace/server/exercise-catalog.json') | ConvertFrom-Json
$entries = @($catalog.exercises | Where-Object { $_.id -ceq $ExerciseId })
if ($entries.Count -ne 1) { throw ('Unknown or duplicate catalog exercise ID: ' + $ExerciseId) }
$entry = $entries[0]
$exercise = $entry.renderer.sourceFilePath
$seed = [string]$entry.verification.seed

function Invoke-Renderer {
    param([hashtable]$Fields)
    $result = Invoke-RestMethod -Uri ($RendererUrl.TrimEnd('/') + '/render-api') `
        -Method Post -ContentType 'application/x-www-form-urlencoded' -Body $Fields -TimeoutSec 90
    if ($result.flags.error_flag) {
        throw ('PG reported a rendering error: ' + ($result.debug | ConvertTo-Json -Depth 6 -Compress))
    }
    if ($null -eq $result.problem_result.score) { throw 'Renderer returned no grading score.' }
    if (-not $result.renderedHTML) {
        throw 'Renderer returned no exercise HTML.'
    }
    return $result
}

$initial = Invoke-Renderer @{
    sourceFilePath = $exercise
    problemSeed = $seed
    _format = 'json'
    isInstructor = '0'
}
if (-not $initial.JWT.session) { throw 'Renderer returned no session token.' }
if ($initial.PSObject.Properties.Name -contains 'answers') {
    throw 'Student response unexpectedly contains the instructor answer map.'
}

# Only this local diagnostic requests instructor answers to check the PG grader.
$instructor = Invoke-Renderer @{
    sourceFilePath = $exercise
    problemSeed = $seed
    _format = 'json'
    isInstructor = '1'
}
$answerFields = @($instructor.answers.PSObject.Properties)
if ($answerFields.Count -ne $entry.verification.answerFieldCount) { throw 'Answer field count does not match the verified catalog entry.' }

$wrongFields = @{
    sessionJWT = $initial.JWT.session
    _format = 'json'
    submitAnswers = '1'
    answersSubmitted = '1'
}
foreach ($field in $answerFields) { $wrongFields[$field.Name] = 'not_a_valid_answer' }
$wrong = Invoke-Renderer $wrongFields
if ([double]$wrong.problem_result.score -ne 0) { throw 'Invalid answers should score zero.' }

$correctFields = @{
    sessionJWT = $wrong.JWT.session
    _format = 'json'
    submitAnswers = '1'
    answersSubmitted = '1'
}
foreach ($field in $answerFields) {
    if ($null -eq $field.Value.correct_value) { throw ('No expected answer for ' + $field.Name) }
    $correctFields[$field.Name] = [string]$field.Value.correct_value
}
$correct = Invoke-Renderer $correctFields
if ([double]$correct.problem_result.score -ne 1) { throw 'Correct answers should score one.' }

$restored = Invoke-Renderer @{ sessionJWT = $correct.JWT.session; _format = 'json' }
if ([double]$restored.problem_result.score -ne 1) { throw 'Restored session lost its score.' }

[pscustomobject]@{
    ExerciseId = $entry.id
    Exercise = $exercise
    Seed = $seed
    AnswerFields = $answerFields.Count
    IncorrectScore = $wrong.problem_result.score
    CorrectScore = $correct.problem_result.score
    RestoredScore = $restored.problem_result.score
    Result = 'PASS'
}