// One job, four fixed seed/viewport cases. All instructor material stays in this disposable process.
import {readFileSync,writeFileSync} from 'node:fs';import {mkdir,readFile} from 'node:fs/promises';import {spawn} from 'node:child_process';import {join} from 'node:path';
import {json,literal} from '../importer/db.mjs';import {git,ROOT} from '../importer/inventory.mjs';import {runtimeFingerprint} from '../application/server/catalog-compatibility.mjs';
import {observeRenderer,sameAttestation} from './health.mjs';
import {workerRuntime} from './runtime.mjs';
import {runnerDigest} from './context.mjs';import {safeCase,technicalState} from './contract.mjs';
const [jobId,dir]=process.argv.slice(2);if(!/^[a-f0-9-]{36}$/.test(jobId??''))throw Error('JOB_ID_REQUIRED');
const started=Date.now();let output;
try{
 const job=json(`SELECT jsonb_build_object('source',to_jsonb(s),'revision',snap.commit_oid,'manifest',m.manifest,'context',c.payload,
 'current',EXISTS(SELECT 1 FROM catalog.verifier_heads h WHERE h.scope='local-practice' AND h.context_id=j.context_id))
 FROM catalog.verification_jobs j JOIN catalog.source_versions s ON s.id=j.source_version_id JOIN catalog.snapshots snap ON snap.id=s.snapshot_id
 JOIN catalog.capability_manifests m ON m.id=j.manifest_id JOIN catalog.verifier_contexts c ON c.id=j.context_id WHERE j.id=${literal(jobId)};`);
 if(!job?.current||!sameAttestation(job.context.workerRuntime,workerRuntime())||job.context.runnerDigest!==runnerDigest()||job.context.runtimeDigest!==runtimeFingerprint()||git(ROOT,['rev-parse','HEAD']).toString().trim()!==job.revision)throw Error('STALE_EXECUTION_CONTEXT');
 const health=await observeRenderer();if(!health.matches)throw Error(health.code);
 if(job.manifest.unsupported?.length)output={cases:[],technicalState:'unsupported',error:'UNSUPPORTED_CAPABILITY',elapsedMs:0};
 else{
  const catalog=JSON.parse(readFileSync('/qa/pipeline/reference-fixtures.json','utf8'));
  let fixture=catalog.exercises.find(f=>f.source.path===job.source.path&&f.source.sha256===job.source.sha256);
  if(!fixture){
   const rendererPath=job.source.path.startsWith('OpenProblemLibrary/')?job.source.path.replace(/^OpenProblemLibrary\//,'Library/'):
    job.source.path.startsWith('Contrib/')?job.source.path:'webwork-open-problem-library/'+job.source.path;
   fixture={id:job.source.id,title:'Queued exercise '+job.source.id,subject:'Operator verification',interaction:job.manifest.interaction??'text',requiredCapabilities:job.manifest.candidateCapabilities,
    source:{path:job.source.path,sha256:job.source.sha256},rendererPath};catalog.exercises.push(fixture);
  }
  catalog.sourceRevision=job.revision;catalog.verificationSeeds=[1234,4321];
  writeFileSync('/qa/compatibility/catalog.json',JSON.stringify(catalog));await mkdir(join(dir,'artifacts'),{recursive:true});
  await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['/qa/compatibility/widget-acceptance.mjs'],{stdio:'ignore',env:{...process.env,
    WIDGET_FIXTURES:fixture.id,COMPATIBILITY_REGRESSION:'1',COMPATIBILITY_OUTPUT:join(dir,'artifacts')}});
   child.once('error',reject);child.once('exit',resolve);
  });
  const report=JSON.parse(await readFile(join(dir,'artifacts/regression-results.json'),'utf8'));
  const cases=report.exercises.map(row=>safeCase({seed:row.verificationSeed,viewport:row.viewport,sourceVerified:row.sourceVerified,
   outcome:row.passed?'passed':'failed',checks:row.checks,correctScore:row.correct?.score,clearedScore:row.cleared?.score,
   limitations:[...new Set([...(row.limitations??[]).map(v=>v.code),...((row.mobile?.horizontalFrameScroll||row.styling?.layouts?.some(l=>l.horizontalFrameScroll))?['NARROW_FRAME_SCROLL']:[])])],
   error:row.error?.startsWith('QA_')?row.error:row.error?'RENDER_OR_INTERACTION_ERROR':null}));
  output={cases,technicalState:technicalState(cases),error:report.complete?null:'INCOMPLETE_RUN',elapsedMs:Date.now()-started};
 }
}catch(error){output={cases:[],technicalState:'error',error:['STALE_EXECUTION_CONTEXT','RENDERER_UNAVAILABLE','RENDERER_BUILD_CHANGED'].includes(error.message)?error.message:'RENDERER_OR_RUNNER_ERROR',elapsedMs:Date.now()-started};}
writeFileSync(join(dir,'result.json'),JSON.stringify(output));
