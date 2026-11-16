# Synthetic design checks only. No real students, Supabase requests or session-volume reads.
$ErrorActionPreference='Stop'
$fixture=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'student-record-examples.json'))|ConvertFrom-Json
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$references=@('experimental-workspace/workspace/server/exercise-sessions.mjs','experimental-workspace/workspace/server/http-app.mjs','experimental-workspace/workspace/public/draft-answers.js','supabase/schema.sql','supabase/migrations/20260221_admin_exercise_panel.sql','supabase/migrations/20260221_admin_structure_rls.sql','supabase/migrations/20260221_remove_archived_status.sql','src/app/practice/[topic]/exercise-attempt-card.tsx')
$hashes=@($references|ForEach-Object {[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $root $_) -Algorithm SHA256).Hash.ToLowerInvariant()}})
$payload=[ordered]@{fixture=$fixture;sourceReferences=$hashes}|ConvertTo-Json -Depth 15 -Compress
$encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))
$code="globalThis.studentDesignInput=JSON.parse(Buffer.from('$encoded','base64').toString('utf8'));`n"+[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'student-record-policy.mjs'))+"`n"+[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'verify-student-record-model.mjs'))
$compose=Join-Path $PSScriptRoot '../compose.yaml'
$code|docker compose -f $compose exec -T workspace node --input-type=module -
if($LASTEXITCODE -ne 0){throw 'Student-record design checks failed.'}
$container=docker compose -f $compose ps -q workspace
if($LASTEXITCODE -ne 0 -or -not $container){throw 'Workspace unavailable.'}
docker cp "${container}:/tmp/student-record-observations.json" (Join-Path $PSScriptRoot 'student-record-observations.json')
if($LASTEXITCODE -ne 0){throw 'Could not retrieve sanitized student-record design observations.'}
