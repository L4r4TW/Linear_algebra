$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$runId=[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
$output=Join-Path $PSScriptRoot ('pilot-acceptance/'+$runId)
$probe='calculus_pilot_'+[guid]::NewGuid().ToString('N').Substring(0,12)
function Check([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
$hashes=@()
$files=@()
foreach($area in @('accounts','discovery')){
 $folder=Join-Path $PSScriptRoot ('../'+$area)
 $files+=Get-ChildItem -LiteralPath $folder -File|Where-Object {$_.Extension -in @('.mjs','.yaml','.ps1') -or $_.Name -like '*Dockerfile' -or $_.Name -in @('reviewed-display.json','practice-metadata.json')}
 $files+=Get-ChildItem -LiteralPath (Join-Path $folder 'public') -File
}
$files+=Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../accounts/migrations') -File
$files+=@('local-pilot.json','independent-pilot.json','student-oracles.mjs','verify-local-pilot.ps1','pilot-policy-checks.sql','activate-local-pilot.mjs')|ForEach-Object {Get-Item -LiteralPath (Join-Path $PSScriptRoot $_)}
$files+=Get-Item -LiteralPath (Join-Path $root 'supabase/migrations/202611160025_local_tested_pilot.sql')
foreach($file in ($files|Sort-Object FullName -Unique)){$hashes+=[ordered]@{file=$file.FullName.Substring($root.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}}
Get-Content -Raw (Join-Path $PSScriptRoot 'pilot-policy-checks.sql')|docker exec -i linear-algebra-opl-catalog-database-1 psql -U postgres -d opl_catalog -v ON_ERROR_STOP=1
Check 'Local pilot withdrawal, evidence, health or privacy guard failed'
docker build -f (Join-Path $root 'experimental-workspace/accounts/Browser.Dockerfile') -t linear-algebra-account-browser-qa $root
Check 'Pilot browser build failed'
docker run --rm linear-algebra-account-browser-qa node --test problem-reports.test.mjs published-catalog.test.mjs ../discovery/catalog.test.mjs ../discovery/server.test.mjs ../discovery/chooser.test.mjs
Check 'Pilot/provider/gateway contract failed'
try{
 docker run --name $probe --network linear-algebra-discovery_console --shm-size=1g linear-algebra-account-browser-qa node pilot.browser.mjs
 Check 'Live pilot browser failed'
 New-Item -ItemType Directory -Path $output|Out-Null
 docker cp ($probe+':/artifacts/live-pilot.json') (Join-Path $output 'live-pilot.json');Check 'Pilot report copy failed'
 foreach($entry in $hashes){if((Get-FileHash -LiteralPath (Join-Path $root $entry.file) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256){throw 'Sources changed; acceptance invalid'}}
 $manifest=[ordered]@{version=1;complete=$true;runId=$runId;observedAt=[DateTime]::UtcNow.ToString('o');scope='User-authorized tested local pilot; no independent human reviews; twenty live random-seed desktop/mobile cases plus report recovery/ownership';sourceHashes=$hashes}
 [IO.File]::WriteAllText((Join-Path $output 'manifest.json'),($manifest|ConvertTo-Json -Depth 8)+[char]10,[Text.UTF8Encoding]::new($false))
 Write-Output ('Complete live pilot acceptance: '+$runId)
}finally{docker rm -f $probe|Out-Null}
