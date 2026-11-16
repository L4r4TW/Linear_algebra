import {VERSION,CHECKS,SEEDS,VIEWPORTS,REVIEWS} from './contract.mjs';
try{
 const [command,arg]=process.argv.slice(2);
 if(command==='migrate')await import('../importer/setup-local.mjs');
 else if(command==='detect'){const {detectCatalog}=await import('./detect.mjs');console.log(JSON.stringify(await detectCatalog(Number(arg??500))));}
 else console.log(JSON.stringify({version:VERSION,checks:CHECKS,seeds:SEEDS,viewports:VIEWPORTS,requiredReviews:REVIEWS,commands:['migrate','detect [limit]']}));
}catch(e){console.error(e.message);process.exitCode=1;}
