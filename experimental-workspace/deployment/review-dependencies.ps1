$ErrorActionPreference='Stop'
$code=@'
const cp=require('child_process'),reports=[];
for(const tree of ['public','lib/PG/htdocs']){
 const r=cp.spawnSync('npm',['audit','--json'],{cwd:'/usr/app/'+tree,encoding:'utf8',timeout:20000,maxBuffer:4000000});
 try{const v=JSON.parse(r.stdout);reports.push({tree,complete:!!v.metadata,vulnerabilities:v.metadata&&v.metadata.vulnerabilities,findings:Object.entries(v.vulnerabilities||{}).map(([name,a])=>({name,severity:a.severity,isDirect:a.isDirect,fixAvailable:!!a.fixAvailable}))});}
 catch{reports.push({tree,complete:false});}
}
console.log(JSON.stringify({version:1,observedAt:new Date().toISOString(),node:process.version,scope:'All npm dependencies, including build/dev dependencies that may ship browser assets. OS and Perl dependencies are not audited here. No fixes installed.',reports}));
'@
$raw=docker exec linear-algebra-experimental-renderer-1 node -e $code
if($LASTEXITCODE -ne 0){throw 'Private renderer dependency inspection failed'}
$report=($raw -join [char]10)|ConvertFrom-Json
if(@($report.reports|Where-Object {-not $_.complete}).Count){throw 'Dependency audit incomplete; do not treat missing results as passing'}
$directory=Join-Path $PSScriptRoot ('dependency-reviews/'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'));New-Item -ItemType Directory -Path $directory|Out-Null
$report|Add-Member -NotePropertyName inspectorSha256 -NotePropertyValue (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $directory 'npm-review.json'),($report|ConvertTo-Json -Depth 8)+[char]10,[Text.UTF8Encoding]::new($false))
$report|ConvertTo-Json -Depth 8
