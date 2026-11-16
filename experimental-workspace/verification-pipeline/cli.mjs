import {readFileSync} from 'node:fs';
import {VERSION,CHECKS,SEEDS,VIEWPORTS,REVIEWS} from './contract.mjs';
try{
 const [command,arg]=process.argv.slice(2);
 if(command==='register-context'){const {registerContext}=await import('./context.mjs');console.log(JSON.stringify(registerContext(JSON.parse(readFileSync(0,'utf8')))));}
 else if(command==='source-doctor'){const {git,ROOT}=await import('../importer/inventory.mjs');console.log(JSON.stringify({revision:git(ROOT,['rev-parse','HEAD']).toString().trim(),clean:git(ROOT,['--no-optional-locks','status','--porcelain','--untracked-files=all']).toString().trim()===''}));}
 else if(command==='worker'){const {runWorker}=await import('./worker.mjs');console.log(JSON.stringify(await runWorker({loop:arg==='--loop',count:Number(arg??1)})));}
 else if(command==='queue'){const {summary}=await import('./queue.mjs');console.log(JSON.stringify(summary()));}
 else if(command==='migrate')await import('../importer/setup-local.mjs');
 else if(command==='detect'){const {detectCatalog}=await import('./detect.mjs');console.log(JSON.stringify(await detectCatalog(Number(arg??500))));}
 else console.log(JSON.stringify({version:VERSION,checks:CHECKS,seeds:SEEDS,viewports:VIEWPORTS,requiredReviews:REVIEWS,commands:['migrate','detect [limit]']}));
}catch(e){console.error(e.message);process.exitCode=1;}
