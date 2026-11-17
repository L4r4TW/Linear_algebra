$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
function Check([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
docker build -f (Join-Path $PSScriptRoot 'Tools.Dockerfile') -t linear-algebra-account-tools $root
Check 'Account adapter image build failed'
$cases=@(@{script='record-store-probe.mjs';report='record-store-observations.json'},@{script='student-data-probe.mjs';report='student-data-observations.json'},@{script='http-probe.mjs';report='http-observations.json'},@{script='legacy-probe.mjs';report='legacy-observations.json'},@{script='bff-probe.mjs';report='bff-observations.json'})
foreach($case in $cases){
 $probe='account_adapter_'+[guid]::NewGuid().ToString('N').Substring(0,12)
 try{
  docker run --name $probe --network linear-algebra-accounts_private --mount type=volume,source=linear-algebra-accounts_secrets,target=/secrets,readonly linear-algebra-account-tools node $case.script
  Check 'Account adapter acceptance failed'
  $temporary=Join-Path ([IO.Path]::GetTempPath()) ($probe+'.json')
  docker cp ($probe+':/artifacts/'+$case.report) $temporary
  Check 'Account adapter report copy failed'
  try{$report=Get-Content -LiteralPath $temporary -Raw|ConvertFrom-Json}finally{Remove-Item -LiteralPath $temporary}
  if(-not $report.complete){throw 'Account adapter report incomplete'}
  $hashes=@()
  foreach($file in @('legacy-import.mjs','legacy-probe.mjs','bff-probe.mjs','record-store.mjs','session-service.mjs','set-store.mjs','student-data.mjs','http-app.mjs','db.mjs','auth.mjs','crypto.mjs','migrations/001_runtime.sql','record-store-probe.mjs','student-data-probe.mjs','http-probe.mjs','Tools.Dockerfile','verify-adapters.ps1')){
   $hashes += [pscustomobject]@{file=$file;sha256=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $file) -Algorithm SHA256).Hash.ToLowerInvariant()}
  }
  foreach($file in @('exercise-sessions.mjs','http-app.mjs','answer-contract.mjs','practice-sets.mjs')){
   $path=Join-Path $PSScriptRoot ('../workspace/server/'+$file)
   $hashes += [pscustomobject]@{file='../workspace/server/'+$file;sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
  }
  $report|Add-Member -NotePropertyName sourceHashes -NotePropertyValue $hashes -Force
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot $case.report),($report|ConvertTo-Json -Depth 8)+[char]10,[Text.UTF8Encoding]::new($false))
 }finally{docker rm -f $probe|Out-Null}
}
