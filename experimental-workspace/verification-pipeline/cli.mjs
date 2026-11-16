import {readFileSync} from 'node:fs';
import {VERSION,CHECKS,SEEDS,VIEWPORTS,REVIEWS} from './contract.mjs';
try{
 const [command,arg]=process.argv.slice(2);
 if(command==='register-context'){
  const {registerContext}=await import('./context.mjs');console.log(JSON.stringify(registerContext(JSON.parse(readFileSync(0,'utf8')))));
 }else if(command==='source-doctor'){
  const {git,ROOT}=await import('../importer/inventory.mjs');
  console.log(JSON.stringify({revision:git(ROOT,['rev-parse','HEAD']).toString().trim(),clean:git(ROOT,['--no-optional-locks','status','--porcelain','--untracked-files=all']).toString().trim()===''}));
 }else if(command==='worker'){
  const {runWorker}=await import('./worker.mjs');console.log(JSON.stringify(await runWorker({loop:arg==='--loop',count:Number(arg??1)})));
 }else if(command==='enqueue-aliases'){
  const {json,literal}=await import('../importer/db.mjs');const {enqueue}=await import('./queue.mjs');const names=process.argv.slice(3);
  if(!names.length||names.length>20)throw Error('ALIAS_BATCH_1_TO_20');
  const sources=json(`SELECT coalesce(jsonb_agg(e.source_version_id),'[]') FROM catalog.aliases a JOIN catalog.import_entries e ON e.exercise_id=a.exercise_id JOIN catalog.import_heads h ON h.run_id=e.run_id WHERE a.namespace='experimental-opl' AND a.external_id IN (${names.map(literal).join(',')});`);
  if(sources.length!==names.length)throw Error('UNKNOWN_OR_AMBIGUOUS_ALIAS');console.log(JSON.stringify({jobs:enqueue(sources)}));
 }else if(command==='queue'){
  const {summary}=await import('./queue.mjs');console.log(JSON.stringify(summary()));
 }else if(command==='migrate')await import('../importer/setup-local.mjs');
 else if(command==='detect'){const {detectCatalog}=await import('./detect.mjs');console.log(JSON.stringify(await detectCatalog(Number(arg??500))));}
 else console.log(JSON.stringify({version:VERSION,checks:CHECKS,seeds:SEEDS,viewports:VIEWPORTS,requiredReviews:REVIEWS,commands:['migrate','detect [limit]','enqueue-aliases [aliases]','worker [count|--loop]','queue']}));
}catch(e){console.error(e.message);process.exitCode=1;}
