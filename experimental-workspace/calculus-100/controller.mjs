import {readFile,writeFile,mkdir} from 'node:fs/promises';import {json,literal} from '../importer/db.mjs';import {enqueue,currentContext} from '../pipeline/queue.mjs';import {planBatch} from './batch-plan.mjs';
const candidates=JSON.parse(await readFile('/qa/calculus/candidates.json','utf8')).candidates,context=JSON.parse(await readFile('/qa/calculus/context.json','utf8'));
const loop=process.argv.includes('--loop');let stopping=false,stopSleeping;process.on('SIGTERM',()=>{stopping=true;stopSleeping?.();});await mkdir('/artifacts',{recursive:true});
do{
 if(currentContext()!==context.id)throw Error('CALCULUS_CONTEXT_CHANGED_STOPPED');
 const jobs=json(`SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT j.id,j.source_version_id,j.state,j.technical_state,j.attempt_count,a.result FROM catalog.verification_jobs j LEFT JOIN LATERAL(SELECT result FROM catalog.verification_attempts WHERE job_id=j.id ORDER BY ordinal DESC LIMIT 1)a ON true WHERE j.context_id=${literal(context.id)}::uuid AND j.source_version_id IN(${candidates.map(row=>literal(row.source_version_id)+'::uuid').join(',')}))x`);
 const plan=planBatch(candidates,jobs);
 if(plan.enqueue.length){for(let i=0;i<plan.enqueue.length;i+=100)enqueue(plan.enqueue.slice(i,i+100),'Calculus reserve replacement for retained failed/unsupported cases; independent reviews pending.');}
 const report={version:1,observedAt:new Date().toISOString(),contextId:context.id,scope:'Technical transport/layout verification only; no independent reviews, publication or student availability inferred.',...plan,jobs};
 await writeFile('/artifacts/technical-status.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({observedAt:report.observedAt,technicalComplete:plan.complete,exhausted:plan.exhausted,queuedNow:plan.enqueue.length,passed:plan.topics.reduce((n,t)=>n+t.technicalPassed,0),pending:plan.topics.reduce((n,t)=>n+t.pending,0)}));
 if(!loop||plan.complete||plan.topics.every(topic=>topic.exhausted||topic.technicalPassed>=topic.target))break;
 await new Promise(resolve=>{const done=()=>{clearTimeout(timer);stopSleeping=null;resolve();};const timer=setTimeout(done,30000);stopSleeping=done;});
}while(!stopping);
