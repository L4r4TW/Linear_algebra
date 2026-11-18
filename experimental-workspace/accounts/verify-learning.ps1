$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$stamp=[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$target=Join-Path $PSScriptRoot ('learning-acceptance/'+$stamp)
$probe='learning_browser_'+[guid]::NewGuid().ToString('N').Substring(0,12)
function Check([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
$files=@()
$files+=Get-ChildItem -LiteralPath $PSScriptRoot -File|Where-Object {$_.Extension -in @('.mjs','.sh','.ps1','.yaml') -or $_.Name -like '*Dockerfile' -or $_.Name -in @('package.json','package-lock.json','reviewed-display.json')}
$files+=Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'public') -File
$files+=Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'migrations') -File
$files+=Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../discovery') -File|Where-Object {$_.Extension -in @('.mjs','.yaml') -or $_.Name -in @('package.json','Dockerfile')}
$files+=Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../discovery/public') -File
$files+=Get-Item -LiteralPath (Join-Path $PSScriptRoot '../practice-400/collections.json')
$files+=Get-Item -LiteralPath (Join-Path $PSScriptRoot '../calculus-100/student-oracles.mjs')
$hashes=@($files|Sort-Object FullName -Unique|ForEach-Object {[ordered]@{file=$_.FullName.Substring($root.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
docker build -f (Join-Path $PSScriptRoot 'Browser.Dockerfile') -t linear-algebra-account-browser-qa $root;Check 'Learning browser build failed'
try{
 docker run --name $probe --network linear-algebra-discovery_console --shm-size=1g linear-algebra-account-browser-qa node learning.browser.mjs
 Check 'Real PG completion/browser acceptance failed'
 New-Item -ItemType Directory -Path $target|Out-Null
 docker cp ($probe+':/artifacts/learning-browser.json') (Join-Path $target 'browser.json');Check 'Learning report copy failed'
 foreach($entry in $hashes){if((Get-FileHash -LiteralPath (Join-Path $root $entry.file) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256){throw 'Source changed during acceptance'}}
 $manifest=[ordered]@{version=1;complete=$true;observedAt=[DateTime]::UtcNow.ToString('o');scope='Real local PG grade and anonymous/account/claim/cross-device progress; synthetic users; no secret/student mounts into QA';sourceHashes=$hashes}
 [IO.File]::WriteAllText((Join-Path $target 'manifest.json'),($manifest|ConvertTo-Json -Depth 8)+[char]10,[Text.UTF8Encoding]::new($false))
 Write-Output ('Complete learning UX acceptance: '+$stamp)
}finally{docker rm -f $probe|Out-Null}
