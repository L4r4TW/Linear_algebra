$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$compose=Join-Path $PSScriptRoot 'compose.yaml'
$probe='account_auth_probe_'+[guid]::NewGuid().ToString('N').Substring(0,12)
$created=$false
function Check([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
try{
 docker compose -f $compose config --quiet;Check 'Account Compose invalid'
 docker compose -f $compose up --build -d --wait --wait-timeout 180;Check 'Local Supabase Auth startup failed'
 docker build -f (Join-Path $PSScriptRoot 'Tools.Dockerfile') -t linear-algebra-account-tools $root;Check 'Auth probe build failed'
 $created=$true
 docker run --name $probe --network linear-algebra-accounts_private linear-algebra-account-tools
 Check 'Actual Supabase authentication lifecycle failed'
 $temporary=Join-Path ([IO.Path]::GetTempPath()) ($probe+'.json')
 docker cp ($probe+':/artifacts/auth-observations.json') $temporary;Check 'Auth report copy failed'
 try{$report=Get-Content -LiteralPath $temporary -Raw|ConvertFrom-Json}finally{Remove-Item -LiteralPath $temporary}
 if(-not $report.complete){throw 'Auth report incomplete'}
 $hashes=@()
 foreach($file in @('secrets.mjs','init-db.sh','start-auth.sh','compose.yaml','Secrets.Dockerfile','Database.Dockerfile','Auth.Dockerfile','Tools.Dockerfile','auth-probe.mjs','verify-auth.ps1')){
  $hashes += [pscustomobject]@{file=$file;sha256=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $file) -Algorithm SHA256).Hash.ToLowerInvariant()}
 }
 $report|Add-Member -NotePropertyName sourceHashes -NotePropertyValue $hashes -Force
 [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'auth-observations.json'),($report|ConvertTo-Json -Depth 8)+[char]10,[Text.UTF8Encoding]::new($false))
}finally{if($created){docker rm -f $probe|Out-Null}}
