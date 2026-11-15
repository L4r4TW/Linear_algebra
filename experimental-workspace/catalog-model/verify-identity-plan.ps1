# Design-inventory check only: no session access, PG execution, schema writes or catalog activation.
$ErrorActionPreference='Stop'
$plan=([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'identity-bootstrap-plan.json'))|ConvertFrom-Json)
$catalog=([IO.File]::ReadAllText((Join-Path $PSScriptRoot '../workspace/server/exercise-catalog.json'))|ConvertFrom-Json)
if($plan.kind -cne 'identity-bootstrap-plan' -or $plan.status -cne 'design-only-not-applied' -or $plan.aliasNamespace -cne 'experimental-opl'){throw 'Unexpected identity plan contract.'}
if($plan.entries.Count -ne $catalog.exercises.Count -or $plan.entries.Count -eq 0){throw 'Identity plan must cover the complete current catalog.'}
$seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach($entry in $plan.entries){
 if(-not $seen.Add($entry.legacyId) -or $null -ne $entry.internalExerciseId){throw 'Aliases must be unique and UUID allocation must remain unapplied.'}
 $matches=@($catalog.exercises|Where-Object {$_.id -ceq $entry.legacyId})
 if($matches.Count -ne 1){throw 'Identity plan alias does not identify exactly one catalog exercise.'}
 $existing=$matches[0]
 if($existing.source.repository -cne $plan.repositoryUrl -or $existing.source.path -cne $entry.source.path -or $existing.source.revision -cne $entry.source.revision -or $existing.source.sha256 -cne $entry.source.sha256 -or $existing.renderer.sourceFilePath -cne $entry.existingRendererPath){throw 'Identity plan differs from the existing catalog source or resolver.'}
}
$payload=[ordered]@{repositoryKey=$plan.repositoryKey;entries=@($plan.entries|ForEach-Object {$_.source})}|ConvertTo-Json -Depth 5 -Compress
$encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))
$check=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'verify-installed-sources.mjs'))
$compose=Join-Path $PSScriptRoot '../compose.yaml'
$check|docker compose -f $compose exec -T -e "OPL_IDENTITY_AUDIT=$encoded" renderer node --input-type=module -
if($LASTEXITCODE -ne 0){throw 'Installed source verification failed.'}
