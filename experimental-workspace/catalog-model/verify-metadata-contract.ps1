param([switch]$CheckPreview)
# Reference metadata check. Writes only reviewed design artifacts, never application/session/database state.
$ErrorActionPreference='Stop'
function Read-Json {param([string]$Path) [IO.File]::ReadAllText((Join-Path $PSScriptRoot $Path))|ConvertFrom-Json}
function Encoded {param($Value) [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Depth 18 -Compress)))}
$compose=Join-Path $PSScriptRoot '../compose.yaml'
$examples=Read-Json 'metadata-examples.json'
$sourceEncoded=Encoded $examples
$sourceCode="globalThis.metadataSourceInput=JSON.parse(Buffer.from('$sourceEncoded','base64').toString('utf8'));`n"+[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'inspect-metadata-sources.mjs'))
$sourceCode|docker compose -f $compose exec -T renderer node --input-type=module -
if($LASTEXITCODE -ne 0){throw 'Source metadata inventory failed.'}
$renderer=docker compose -f $compose ps -q renderer
if($LASTEXITCODE -ne 0 -or -not $renderer){throw 'Renderer unavailable.'}
docker cp "${renderer}:/tmp/metadata-source-observations.json" (Join-Path $PSScriptRoot 'metadata-source-observations.json')
if($LASTEXITCODE -ne 0){throw 'Source observation copy failed.'}
$eligibleCode='import {listExercises} from "./server/exercise-catalog.mjs";console.log(JSON.stringify(listExercises().map(e=>e.id)));'
$live=$eligibleCode|docker compose -f $compose exec -T workspace node --input-type=module -
if($LASTEXITCODE -ne 0){throw 'Live eligibility lookup failed.'};$liveIds=$live|ConvertFrom-Json
$inputData=[ordered]@{examples=$examples;catalog=(Read-Json '../workspace/server/exercise-catalog.json');taxonomy=(Read-Json 'taxonomy-examples.json');sources=(Read-Json 'metadata-source-observations.json');playableIds=@($liveIds)}
$encoded=Encoded $inputData
$code="globalThis.metadataDesignInput=JSON.parse(Buffer.from('$encoded','base64').toString('utf8'));`n"+[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'metadata-contract.mjs'))+"`n"+[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'verify-metadata-contract.mjs'))
$code|docker compose -f $compose exec -T workspace node --input-type=module -
if($LASTEXITCODE -ne 0){throw 'Metadata projection/preview check failed.'}
$workspace=docker compose -f $compose ps -q workspace
if($LASTEXITCODE -ne 0 -or -not $workspace){throw 'Workspace unavailable.'}
foreach($name in @('catalog-metadata-preview.html','metadata-public-examples.json','metadata-contract-observations.json')){docker cp "${workspace}:/tmp/$name" (Join-Path $PSScriptRoot $name);if($LASTEXITCODE -ne 0){throw 'Metadata artifact copy failed.'}}

if($CheckPreview){
 $html=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'catalog-metadata-preview.html'))
 $htmlEncoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($html))
 $browserCode="globalThis.metadataPreviewHtml=Buffer.from('$htmlEncoded','base64').toString('utf8');`n"+[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'check-metadata-preview.mjs'))
 $result=$browserCode|docker run --rm -i --shm-size=1g --network none linear-algebra-picker-qa node --input-type=module -
 if($LASTEXITCODE -ne 0){throw 'Metadata preview browser check failed. Build browser-tests/Dockerfile if the QA image is missing.'}
 $browserReport=$result|ConvertFrom-Json
 if($browserReport.result -cne 'PASS'){throw 'Incomplete preview browser report.'}
 [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'metadata-preview-observations.json'),($browserReport|ConvertTo-Json -Depth 5)+"`n",[Text.UTF8Encoding]::new($false))
 Write-Output $result
}
