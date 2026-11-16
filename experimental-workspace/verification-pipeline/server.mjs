import {createServer} from 'node:http';import {readFileSync} from 'node:fs';import {createOperatorAuth} from './auth.mjs';
import {sql,json,literal as L} from '../importer/db.mjs';import {enqueue,control,summary} from './queue.mjs';import {refreshAffected} from './evidence.mjs';import {observeRenderer} from './health.mjs';
const origin=process.env.OPERATOR_ORIGIN??'http://localhost:3102',auth=createOperatorAuth(),attempts=new Map();
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
function send(res,status,value){res.writeHead(status,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify(value));}
async function body(req){let size=0,text='';for await(const part of req){size+=part.length;if(size>8192)throw Error('REQUEST_TOO_LARGE');text+=part.toString();}const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_REQUEST');return value;}
function uuid(value){if(typeof value!=='string'||!/^[a-f0-9-]{36}$/.test(value))throw Error('INVALID_ID');return value;}
const overview=()=>json("SELECT jsonb_build_object('queue',(SELECT jsonb_object_agg(state,n) FROM(SELECT state,count(*) n FROM catalog.verification_jobs GROUP BY state)x),'catalog',catalog_api.opl_counts(),'detected',(SELECT count(DISTINCT source_version_id) FROM catalog.capability_manifests),'context',(SELECT jsonb_build_object('id',c.id,'certified',c.payload->'certified','revision',c.payload->>'revision','pgRevision',c.payload->'attestation'->>'pgRevision','health',health.code,'observedAt',health.observed_at) FROM catalog.verifier_heads h JOIN catalog.verifier_contexts c ON c.id=h.context_id LEFT JOIN catalog.verifier_health health ON health.scope=h.scope AND health.context_id=c.id WHERE h.scope='local-practice'),'publication',(SELECT jsonb_build_object('generation',generation,'active',active,'releaseId',release_id) FROM catalog.deployment_heads WHERE scope='local-practice'));");
export function jobs({state='',query='',page=0}={}){
 if(!['','all','queued','running','passed','failed','error','unsupported','needs-review','cancelled','stale'].includes(state)||query.length>200||!Number.isInteger(page)||page<0||page>100000)throw Error('INVALID_FILTER');
 return json(`SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT j.id,j.state,j.technical_state,j.attempt_count,j.max_attempts,j.created_at,j.updated_at,
 coalesce(e.metadata->>'title',s.path) title,m.manifest->'candidateCapabilities' capabilities,catalog.verification_job_current(j.id) current,
 (SELECT count(*) FROM catalog.verification_attempts a WHERE a.job_id=j.id) retained_attempts,
 (SELECT jsonb_array_length(a.result->'cases') FROM catalog.verification_attempts a WHERE a.job_id=j.id ORDER BY ordinal DESC LIMIT 1) case_count
 FROM catalog.verification_jobs j JOIN catalog.source_versions s ON s.id=j.source_version_id JOIN catalog.capability_manifests m ON m.id=j.manifest_id
 LEFT JOIN LATERAL(SELECT metadata FROM catalog.import_entries e WHERE e.source_version_id=s.id LIMIT 1)e ON true
 WHERE(${L(state)} IN('','all') OR j.state=${L(state)}) AND(${L(query)}='' OR coalesce(e.metadata->>'title',s.path) ILIKE '%'||${L(query)}||'%')
 ORDER BY j.created_at DESC,j.id DESC LIMIT 50 OFFSET ${page*50})x;`);
}
export function detail(id){uuid(id);return json(`SELECT jsonb_build_object('id',j.id,'state',j.state,'technicalState',j.technical_state,'source',jsonb_build_object('path',s.path,'sha256',s.sha256,'revision',snap.commit_oid),
 'capabilities',m.manifest,'contextCertified',c.payload->'certified',
 'attempts',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'ordinal',a.ordinal,'state',a.state,'startedAt',a.started_at,'finishedAt',a.finished_at,'result',a.result) ORDER BY ordinal DESC),'[]') FROM catalog.verification_attempts a WHERE a.job_id=j.id),
 'reviews',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',r.kind,'decision',r.decision,'actor',r.actor,'reason',r.reason,'attemptId',r.attempt_id,'order',r.review_order) ORDER BY r.review_order DESC),'[]') FROM catalog.verification_reviews r WHERE r.job_id=j.id),
 'evidence',(SELECT coalesce(jsonb_agg(jsonb_build_object('attemptId',e.attempt_id,'runId',e.run_id,'bundleId',e.bundle_id,'assessmentId',e.assessment_id)),'[]') FROM catalog.verification_evidence e WHERE e.job_id=j.id))
 FROM catalog.verification_jobs j JOIN catalog.source_versions s ON s.id=j.source_version_id JOIN catalog.snapshots snap ON snap.id=s.snapshot_id JOIN catalog.capability_manifests m ON m.id=j.manifest_id JOIN catalog.verifier_contexts c ON c.id=j.context_id WHERE j.id=${L(id)}::uuid;`);}
function library(url){const all=url.searchParams.get('all')==='1',query=(url.searchParams.get('q')??'').slice(0,200);return json(`SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT e.id,e.exercise_id,e.metadata->>'title' title,e.metadata->>'state' classification,e.metadata->'normalized' topics,catalog.is_playable(e.exercise_id,e.source_version_id,'local-practice') can_practice FROM catalog.import_entries e JOIN catalog.import_heads h ON h.run_id=e.run_id JOIN catalog.repositories p ON p.id=h.repository_id WHERE p.registry_key='openwebwork-opl' AND(${all} OR catalog.is_playable(e.exercise_id,e.source_version_id,'local-practice')) AND(${L(query)}='' OR e.search_document @@ plainto_tsquery('simple',${L(query)})) ORDER BY e.title_sort,e.id LIMIT 30)x;`);}
const assets=new Map([['/',['index.html','text/html']],['/operator.js',['operator.js','text/javascript']],['/operator.css',['operator.css','text/css']]]);
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin);
  if(req.method==='POST'&&req.headers.origin!==origin)return send(res,403,{error:'ORIGIN_REJECTED'});
  if(req.method==='POST'&&url.pathname==='/api/login'){
   const address=req.socket.remoteAddress,now=Date.now(),recent=(attempts.get(address)??[]).filter(t=>now-t<60000);if(recent.length>=10)return send(res,429,{error:'TOO_MANY_ATTEMPTS'});
   recent.push(now);attempts.set(address,recent);const input=await body(req);
   if(input.username!=='operator'||!auth.password(input.password))return send(res,401,{error:'INVALID_CREDENTIALS'});
   res.setHeader('Set-Cookie','verification_operator='+auth.cookie()+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800');return send(res,200,{ok:true});
  }
  if(req.method==='GET'&&assets.has(url.pathname)){const [file,type]=assets.get(url.pathname);res.writeHead(200,{...headers,'Content-Type':type});res.end(readFileSync('/qa/pipeline/public/'+file));return;}
  if(!auth.authenticated(req))return send(res,401,{error:'OPERATOR_AUTH_REQUIRED'});
  if(req.method==='GET'&&url.pathname==='/api/overview')return send(res,200,overview());
  if(req.method==='GET'&&url.pathname==='/api/jobs')return send(res,200,jobs({state:url.searchParams.get('state')??'',query:url.searchParams.get('q')??'',page:Number(url.searchParams.get('page')??0)}));
  if(req.method==='GET'&&url.pathname==='/api/library')return send(res,200,library(url));
  const matched=url.pathname.match(/^\/api\/jobs\/([a-f0-9-]{36})$/);
  if(req.method==='GET'&&matched){const row=detail(matched[1]);return send(res,row?200:404,row??{error:'NOT_FOUND'});}
  if(req.method==='POST'){
   const input=await body(req);
   if(url.pathname==='/api/enqueue'){
    if(!Array.isArray(input.entryIds)||input.entryIds.length<1||input.entryIds.length>20)throw Error('BATCH_1_TO_20_REQUIRED');
    const ids=input.entryIds.map(uuid),sources=json(`SELECT coalesce(jsonb_agg(e.source_version_id),'[]') FROM catalog.import_entries e JOIN catalog.import_heads h ON h.run_id=e.run_id WHERE e.id IN(${ids.map(id=>L(id)+'::uuid').join(',')}) AND e.state='imported';`);
    if(sources.length!==new Set(ids).size)throw Error('CURRENT_RESOLVED_SOURCES_REQUIRED');
    return send(res,200,{jobs:enqueue(sources,'Explicit operator dashboard batch')});
   }
   if(url.pathname==='/api/control'){if(typeof input.reason!=='string'||input.reason.trim().length<12)throw Error('REASON_MIN_12_CHARACTERS');control(uuid(input.jobId),input.action,input.reason);return send(res,200,{ok:true});}
   if(url.pathname==='/api/review'){
    if(!['requirements','mathematical','interaction','deployment'].includes(input.kind)||!['accepted','rejected'].includes(input.decision)||input.independent!==true||typeof input.reason!=='string'||input.reason.length<12||input.reason.length>2000)throw Error('INDEPENDENT_REVIEW_AND_REASON_REQUIRED');
    const id=sql(`SELECT catalog.review_verification(${L(uuid(input.jobId))}::uuid,${L(input.kind)},${L(input.decision)},'local-operator',${L(input.reason)},true);`);return send(res,200,{reviewId:id});
   }
   if(url.pathname==='/api/refresh')return send(res,200,refreshAffected({requeue:input.requeue===true,limit:20}));
   if(url.pathname.startsWith('/api/release/')){
    const publisher=await import('./publish.mjs');
    if(url.pathname==='/api/release/prepare')return send(res,200,await publisher.prepareRelease(input.jobIds,input.reason));
    if(url.pathname==='/api/release/publish')return send(res,200,await publisher.publishRelease(input.releaseId,input.generation,input.reason));
    if(url.pathname==='/api/release/withdraw')return send(res,200,publisher.withdraw(input.generation,input.reason));
   }
  }
  return send(res,404,{error:'NOT_FOUND'});
 }catch(error){const message=error.message??'';send(res,409,{error:/^[A-Z0-9_ :.[\]-]{1,200}$/.test(message)?message:message.startsWith('DATABASE_QUERY_FAILED')?message:'REQUEST_FAILED'});}
});
server.listen(3002,'0.0.0.0');async function monitor(){try{await observeRenderer();refreshAffected({requeue:true,limit:20});}catch{}}await monitor();setInterval(monitor,15000);
process.on('SIGTERM',()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
