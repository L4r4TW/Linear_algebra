$ErrorActionPreference='Stop'
$compose=Join-Path $PSScriptRoot 'compose.yaml'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$probe='discovery_qa_'+[guid]::NewGuid().ToString('N').Substring(0,12)
$created=$false
function Check([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
try{
 docker compose -f $compose config --quiet;Check 'Invalid discovery Compose'
 & (Join-Path $PSScriptRoot 'setup.ps1')
 docker compose -f $compose exec -T home npm test;Check 'Discovery unit/server tests failed'
 docker compose -f $compose exec -T home node --test catalog.integration.mjs;Check 'Real catalog tests failed'
 docker image inspect linear-algebra-picker-qa:latest *> $null
 if($LASTEXITCODE -ne 0){
  docker build -f (Join-Path $root 'experimental-workspace/browser-tests/Dockerfile') -t linear-algebra-picker-qa (Join-Path $root 'experimental-workspace');Check 'Pinned browser base build failed'
 }
 docker build -f (Join-Path $PSScriptRoot 'Browser.Dockerfile') -t linear-algebra-discovery-qa $root;Check 'Discovery browser image build failed'
 $created=$true
 docker run --name $probe --network linear-algebra-discovery_console --shm-size=1g linear-algebra-discovery-qa
 Check 'Discovery/chooser browser acceptance failed'
 $hashes=@()
 foreach($file in @('catalog.mjs','chooser.mjs','server.mjs','practice-metadata.json','package.json','public/index.html','public/home.js','public/home.css','public/chooser.html','public/chooser.js','public/chooser.css','public/practice-plan-store.js','catalog.test.mjs','chooser.test.mjs','server.test.mjs','catalog.integration.mjs','browser.test.mjs','chooser.browser.mjs','Dockerfile','Browser.Dockerfile','compose.yaml','setup.ps1','verify.ps1')){
  $hashes += [pscustomobject]@{file=$file;sha256=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $file) -Algorithm SHA256).Hash.ToLowerInvariant()}
 }
 foreach($name in @('discovery','chooser')){
  $temporary=Join-Path ([IO.Path]::GetTempPath()) ($probe+'_'+$name+'.json')
  docker cp ($probe+':/qa/artifacts/'+$name+'-observations.json') $temporary
  Check 'Sanitized acceptance report copy failed'
  try{$report=Get-Content -LiteralPath $temporary -Raw|ConvertFrom-Json}finally{Remove-Item -LiteralPath $temporary}
  if(-not $report.complete){throw 'Incomplete browser observations'}
  $report|Add-Member -NotePropertyName sourceHashes -NotePropertyValue $hashes -Force
  $report|Add-Member -NotePropertyName serverTests -NotePropertyValue 13 -Force
  $report|Add-Member -NotePropertyName realDatabaseTests -NotePropertyValue 1 -Force
  $report|Add-Member -NotePropertyName browserTests -NotePropertyValue $(if($name -eq 'discovery'){7}else{5}) -Force
  $report|Add-Member -NotePropertyName imageId -NotePropertyValue ((docker image inspect linear-algebra-discovery --format '{{.Id}}')-join '') -Force
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot ($name+'-observations.json')),($report|ConvertTo-Json -Depth 8)+[char]10,[Text.UTF8Encoding]::new($false))
 }
 docker compose -f (Join-Path $root 'experimental-workspace/compose.yaml') exec -T workspace node server/check-catalog.mjs
 Check 'Existing practice catalog check failed'
}finally{if($created){docker rm -f $probe|Out-Null}}
