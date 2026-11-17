$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$runId=[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
$output=Join-Path $PSScriptRoot ('acceptance/'+$runId)
New-Item -ItemType Directory -Path $output|Out-Null
function Check([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
$hashes=@()
$files=@()
$files+=Get-ChildItem -LiteralPath $PSScriptRoot -File|Where-Object {$_.Extension -in @('.mjs','.ps1','.yaml','.json') -or $_.Name -like '*Dockerfile'}
$files+=Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'migrations') -File
$files+=Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'public') -File
$files+=Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../workspace/server') -File|Where-Object {$_.Extension -in @('.mjs','.json')}
$files+=Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../workspace/public') -File
$files+=Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../discovery') -File|Where-Object {$_.Extension -in @('.mjs','.yaml')}
$files+=Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../discovery/public') -File
foreach($file in ($files|Sort-Object FullName -Unique)){
 $relative=$file.FullName.Substring($root.Length+1).Replace('\','/')
 $hashes+=[pscustomobject]@{file=$relative;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
}
docker build -f (Join-Path $PSScriptRoot 'Tools.Dockerfile') -t linear-algebra-account-tools $root
Check 'Account tools build failed'
docker build -f (Join-Path $PSScriptRoot 'Browser.Dockerfile') -t linear-algebra-account-browser-qa $root
Check 'Account browser build failed'
docker run --rm linear-algebra-account-tools node --test crypto.test.mjs admission.test.mjs;Check 'Cryptography/admission checks failed'
$cases=@(
 @{script='work-lifetime-probe.mjs';report='work-lifetime-observations.json';image='linear-algebra-account-tools'},
 @{script='record-store-probe.mjs';report='record-store-observations.json';image='linear-algebra-account-tools'},
 @{script='student-data-probe.mjs';report='student-data-observations.json';image='linear-algebra-account-tools'},
 @{script='http-probe.mjs';report='http-observations.json';image='linear-algebra-account-tools'},
 @{script='legacy-probe.mjs';report='legacy-observations.json';image='linear-algebra-account-tools'},
 @{script='bff-probe.mjs';report='bff-observations.json';image='linear-algebra-account-tools'},
 @{script='draft-sync.browser.mjs';report='draft-sync-observations.json';image='linear-algebra-account-browser-qa';browser=$true},
 @{script='browser-acceptance.mjs';report='browser-observations.json';image='linear-algebra-account-browser-qa';browser=$true;renderer=$true}
)
foreach($case in $cases){
 $probe='account_accept_'+[guid]::NewGuid().ToString('N').Substring(0,12)
 try{
  $arguments=@('create','--name',$probe,'--network','linear-algebra-accounts_private','--mount','type=volume,source=linear-algebra-accounts_secrets,target=/secrets,readonly')
  if($case.browser){$arguments+='--shm-size=1g'}
  $arguments+=@($case.image,'node',$case.script)
  & docker @arguments|Out-Null;Check 'Account acceptance container creation failed'
  if($case.renderer){docker network connect linear-algebra-experimental_default $probe;Check 'Private renderer network connection failed'}
  docker start -a $probe;Check 'Account acceptance start failed'
  $exitCode=docker inspect $probe --format '{{.State.ExitCode}}';Check 'Account acceptance state read failed'
  if($exitCode -ne '0'){throw ('Account acceptance failed: '+$case.script)}
  $target=Join-Path $output $case.report
  docker cp ($probe+':/artifacts/'+$case.report) $target;Check 'Account report copy failed'
  $report=Get-Content -LiteralPath $target -Raw|ConvertFrom-Json
  if(-not $report.complete){throw 'Incomplete account acceptance report'}
 }finally{docker rm -f $probe|Out-Null}
}
$manifest=[ordered]@{version=1;complete=$true;runId=$runId;observedAt=[DateTime]::UtcNow.ToString('o');scope='Local Supabase and private PG acceptance; synthetic users, no original student volume, manual screen-reader/device review excluded';sourceHashes=$hashes;reports=@($cases|ForEach-Object {$_.report})}
foreach($entry in $hashes){
 if((Get-FileHash -LiteralPath (Join-Path $root $entry.file) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256){throw 'Source changed during verification; do not publish this run'}
}
[IO.File]::WriteAllText((Join-Path $output 'manifest.json'),($manifest|ConvertTo-Json -Depth 8)+[char]10,[Text.UTF8Encoding]::new($false))
Write-Output ('Complete immutable account acceptance: '+$runId)
