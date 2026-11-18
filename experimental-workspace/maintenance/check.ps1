param([switch]$Write)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$probe='practice_quality_'+[guid]::NewGuid().ToString('N').Substring(0,12)
$temporary=Join-Path ([IO.Path]::GetTempPath()) ($probe+'.json')
function Check([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
docker build -f (Join-Path $PSScriptRoot 'Dockerfile') -t mathpractice-quality $root
Check 'Quality tools build failed'
try {
 $arguments=@('create','--name',$probe,'--network','none','mathpractice-quality','node','quality.mjs')
 if($Write){$arguments+='--write'}
 & docker @arguments|Out-Null;Check 'Quality container creation failed'
 docker start -a $probe # A lint failure is inspected after copying formatter output.
 $exitCode=docker inspect $probe --format '{{.State.ExitCode}}';Check 'Quality state read failed'
 if($Write){
  docker cp ($probe+':/artifacts/changed.json') $temporary;Check 'Formatted file manifest copy failed'
  $changed=Get-Content -LiteralPath $temporary -Raw|ConvertFrom-Json
  foreach($file in $changed){
   # Only owned operational source can be copied back from this disposable formatter.
   if($file -notmatch '^experimental-workspace/(accounts|discovery|practice-400|maintenance)/(public/)?[a-zA-Z0-9_.-]+\.(mjs|js|css|html)$'){throw 'Unsafe formatter output path'}
   $target=[IO.Path]::GetFullPath((Join-Path $root $file))
   if(-not $target.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Formatter escaped workspace'}
   docker cp ($probe+':/repo/'+$file) $target;Check 'Formatted source copy failed'
  }
 }
 if($exitCode -ne '0'){throw 'Quality checks failed; fix the reported source diagnostics'}
} finally {
 docker rm -f $probe|Out-Null
 if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary}
}
