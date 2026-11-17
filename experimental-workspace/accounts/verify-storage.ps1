$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$compose=Join-Path $PSScriptRoot 'compose.yaml'
$probe='account_store_probe_'+[guid]::NewGuid().ToString('N').Substring(0,12)
$created=$false
function Check([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
try{
 docker compose -f $compose build secrets-init migrate;Check 'Account migration image failed'
 docker compose -f $compose run --rm --no-deps secrets-init;Check 'Private account credential initialization failed'
 docker compose -f $compose run --rm --no-deps migrate;Check 'Private account schema migration failed'
 docker build -f (Join-Path $PSScriptRoot 'Tools.Dockerfile') -t linear-algebra-account-tools $root;Check 'Account storage tools build failed'
 docker run --rm linear-algebra-account-tools node --test crypto.test.mjs;Check 'Account encrypted storage tests failed'
 $created=$true
 docker run --name $probe --network linear-algebra-accounts_private --mount type=volume,source=linear-algebra-accounts_secrets,target=/secrets,readonly linear-algebra-account-tools node database-probe.mjs
 Check 'Actual Supabase account ownership checks failed'
 $temporary=Join-Path ([IO.Path]::GetTempPath()) ($probe+'.json')
 docker cp ($probe+':/artifacts/database-observations.json') $temporary;Check 'Private database report copy failed'
 try{$report=Get-Content -LiteralPath $temporary -Raw|ConvertFrom-Json}finally{Remove-Item -LiteralPath $temporary}
 if(-not $report.complete){throw 'Private database report incomplete'}
 $hashes=@()
 foreach($file in @('migrations/001_runtime.sql','db.mjs','crypto.mjs','crypto.test.mjs','database-probe.mjs','migrate.sh','Migration.Dockerfile','package.json','package-lock.json','Tools.Dockerfile','secrets.mjs','verify-storage.ps1')){
  $hashes += [pscustomobject]@{file=$file;sha256=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $file) -Algorithm SHA256).Hash.ToLowerInvariant()}
 }
 $report|Add-Member -NotePropertyName sourceHashes -NotePropertyValue $hashes -Force
 [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'database-observations.json'),($report|ConvertTo-Json -Depth 8)+[char]10,[Text.UTF8Encoding]::new($false))
}finally{if($created){docker rm -f $probe|Out-Null}}
