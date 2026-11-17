import {readFile,writeFile,mkdir} from 'node:fs/promises';import {registerContext} from '../pipeline/context.mjs';import {git,ROOT,PIN} from '../importer/inventory.mjs';import {enqueue} from '../pipeline/queue.mjs';
const mode=process.argv[2]??'context';
if(mode==='context'){
 const response=await fetch(process.env.RENDERER_URL+'/verification-build.json',{signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('ATTESTATION_UNAVAILABLE');
 const attestation=await response.json();if(attestation.pgTrackedClean!==true)throw Error('STRICT_PG_PROVENANCE_REQUIRED');
 const clean=git(ROOT,['--no-optional-locks','status','--porcelain','--untracked-files=all']).toString().trim()==='';
 const context=registerContext({attestation,workerImage:process.env.MEASURED_WORKER_IMAGE,rendererImage:process.env.MEASURED_RENDERER_IMAGE,sourceRevision:PIN,sourceClean:clean});
 await mkdir('/artifacts',{recursive:true});await writeFile('/artifacts/context.json',JSON.stringify({...context,attestation,workerImage:process.env.MEASURED_WORKER_IMAGE,rendererImage:process.env.MEASURED_RENDERER_IMAGE},null,2)+'\n');
 console.log(JSON.stringify(context));
}else if(mode==='enqueue'){
 const report=JSON.parse(await readFile('/qa/calculus/candidates.json','utf8')),sources=report.candidates.filter(row=>row.plannedWave==='primary').map(row=>row.source_version_id);
 console.log(JSON.stringify({jobs:enqueue(sources,'100-exercise differential calculus primary batch; technical verification only, independent reviews pending.')}));
}else throw Error('UNKNOWN_COMMAND');
