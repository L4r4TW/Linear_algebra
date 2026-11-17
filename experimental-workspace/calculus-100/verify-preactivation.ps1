$ErrorActionPreference='Stop'
$root=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$probe='calculus-preactivation-'+[guid]::NewGuid().ToString('N').Substring(0,12)
Push-Location $root
try{
 docker build -f experimental-workspace/accounts/Browser.Dockerfile -t linear-algebra-account-browser-qa .
 if($LASTEXITCODE -ne 0){throw 'Fresh browser tools build failed'}
 docker build -f experimental-workspace/calculus-100/Preactivation.Dockerfile -t linear-algebra-calculus-preactivation .
 if($LASTEXITCODE -ne 0){throw 'Preactivation image build failed'}
 docker run --name $probe --network none --shm-size 1g linear-algebra-calculus-preactivation
 if($LASTEXITCODE -ne 0){throw 'Preactivation acceptance failed; no candidate has been activated'}
 docker cp ($probe+':/artifacts/preactivation.json') (Join-Path $PSScriptRoot 'preactivation.json')
 if($LASTEXITCODE -ne 0){throw 'Sanitized report copy failed'}
}finally{docker rm -f $probe 2>$null|Out-Null;Pop-Location}
