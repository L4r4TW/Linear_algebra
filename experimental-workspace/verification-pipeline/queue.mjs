import {sql,json,literal} from '../importer/db.mjs';
export const currentContext=()=>sql("SELECT context_id FROM catalog.verifier_heads WHERE scope='local-practice';");
export function enqueue(sources,reason='Explicit operator batch'){if(!Array.isArray(sources)||sources.length<1||sources.length>100)throw Error('BATCH_1_TO_100');const context=currentContext();if(!context)throw Error('REGISTER_CONTEXT_FIRST');return json(`SELECT coalesce(jsonb_agg(id),'[]') FROM catalog.enqueue_verification(ARRAY[${sources.map(v=>literal(v)+'::uuid').join(',')}],${literal(context)}::uuid,'operator-cli',${literal(reason)})id;`);}
export const claim=(worker,lease=900,concurrency=2)=>json(`SELECT coalesce(catalog.claim_verification(${literal(worker)},${lease},${concurrency}),'null'::jsonb);`);
export const heartbeat=(job,token)=>sql(`SELECT catalog.heartbeat_verification(${literal(job)}::uuid,${literal(token)}::uuid);`)==='t';
export const finish=(job,token,result)=>sql(`SELECT catalog.finish_verification(${literal(job)}::uuid,${literal(token)}::uuid,${literal(result)}::jsonb);`)==='t';
export const control=(job,action,reason)=>sql(`SELECT catalog.control_verification(${literal(job)}::uuid,${literal(action)},'operator-cli',${literal(reason)});`);
export function summary(){return json("SELECT jsonb_build_object('counts',(SELECT jsonb_object_agg(state,n) FROM(SELECT state,count(*) n FROM catalog.verification_jobs GROUP BY state)x),'running',(SELECT count(*) FROM catalog.verification_jobs WHERE state='running'));");}
