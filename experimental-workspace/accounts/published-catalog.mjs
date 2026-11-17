import {readFileSync} from 'node:fs';
import pg from 'pg';
import {RendererClientError} from '../application/server/renderer-client.mjs';
const reviewedDisplay=JSON.parse(readFileSync(new URL('./reviewed-display.json',import.meta.url),'utf8'));
const sourceKey=entry=>entry?.source?JSON.stringify([entry.source.revision,entry.source.path,entry.source.sha256]):null;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hex=n=>new RegExp('^[a-f0-9]{'+n+'}$');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const text=(v,max=200)=>typeof v==='string'&&!/[\x00-\x1f\x7f]/.test(v)&&v.length<=max?v:null;
const strings=v=>Array.isArray(v)?v.map(s=>text(s,500)).filter(Boolean):[];
export function projectPublished(row,{context,sourceRevision}){
 if(!uuid.test(row.id??'')||!uuid.test(row.source_version_id??'')||row.context_id!==context.id||!hex(64).test(row.sha256??'')||row.revision!==sourceRevision)throw Error('INVALID_APPROVED_SOURCE');
 const path=row.path;if(typeof path!=='string'||!path.endsWith('.pg')||!['OpenProblemLibrary','Contrib','Pending'].includes(path.split('/')[0])||path.split('/').some(p=>!p||p==='.'||p==='..')||/[\\\x00-\x1f\x7f]/.test(path))throw Error('INVALID_APPROVED_PATH');
 const metadata=row.metadata??{},[subject,chapter,section]=(metadata.normalized??[]).map(s=>text(s));
 const display=reviewedDisplay.find(item=>item.sourceVersionId===row.source_version_id&&item.sha256===row.sha256&&item.revision===row.revision);
 const title=text(display?.title??metadata.title,1000),description=text(metadata.description,5000)??'';
 if(!title||!subject||!chapter)throw Error('APPROVED_METADATA_INCOMPLETE');
 const rendererPath=path.startsWith('OpenProblemLibrary/')?path.replace(/^OpenProblemLibrary\//,'Library/'):path.startsWith('Contrib/')?path:'webwork-open-problem-library/'+path;
 return {reviewStatus:row.review_status==='tested-local-pilot'?'tested-local-pilot':'independently-reviewed',id:row.id,title,description,topicId:'catalog:'+chapter,topic:section??chapter,subject,chapter,section:section??null,titleOrigin:display?'reviewed-title':metadata.titleOrigin??'source-metadata',
 attribution:{authors:strings(metadata.authors),institutions:strings(metadata.institutions)},
 source:{path:row.path,versionId:row.source_version_id,revision:row.revision,sha256:row.sha256,contextId:context.id},renderer:{sourceFilePath:rendererPath}};
}
export function publicPublished(entry){
 const {id,title,description,topicId,topic,subject,chapter,section,titleOrigin,attribution,reviewStatus}=entry;
 return {id,title,description,topicId,topic,subject,chapter,section,titleOrigin,attribution,reviewStatus};
}
export function createPublishedCatalog({query,rendererUrl,runtimeDigest,sourceRevision,fetcher=fetch}){
 let entries=new Map(),pending,unavailable=true,initialized=false,managedLegacyIds=new Set();
 async function refresh(){
  if(pending)return pending;
  pending=(async()=>{
   try{
    const snapshot=await query(),context=snapshot?.context;
    if(!Array.isArray(snapshot?.entries)||snapshot.entries.length>100)throw Error('INVALID_PUBLISHED_CATALOG');
    const managed=snapshot.managedLegacyIds;if(!Array.isArray(managed)||managed.length>1000||managed.some(id=>typeof id!=='string'||!(/^[a-z0-9-]{1,100}$/).test(id)))throw Error('INVALID_LEGACY_GOVERNANCE');
    managedLegacyIds=new Set(managed);initialized=true;
    if(!snapshot.entries.length){entries=new Map();unavailable=false;return;}
    if(!uuid.test(context?.id??'')||context.certified!==true||context.runtimeDigest!==runtimeDigest||context.attestation?.pgTrackedClean!==true)throw Error('STALE_PUBLISHED_CONTEXT');
    const response=await fetcher(rendererUrl.replace(/\/$/,'')+'/verification-build.json',{signal:AbortSignal.timeout(3000),redirect:'error'});
    if(!response.ok||JSON.stringify(canonical(await response.json()))!==JSON.stringify(canonical(context.attestation)))throw Error('RENDERER_CONTEXT_CHANGED');
    const next=new Map();for(const row of snapshot.entries){const entry=projectPublished(row,{context,sourceRevision});if(next.has(entry.id))throw Error('DUPLICATE_APPROVED_ID');next.set(entry.id,entry);}
    entries=next;unavailable=false;
   }catch{entries=new Map();unavailable=true;}
  })().finally(()=>{pending=null;});
  return pending;
 }
 return {refresh,legacy(entry){if(!entry)return;if(!initialized||unavailable)throw new RendererClientError('NETWORK_ERROR','Catalog authority is unavailable. Your saved work is retained.');if(!managedLegacyIds.has(entry.id))return structuredClone(entry);const active=[...entries.values()].find(value=>sourceKey(value)===sourceKey(entry));return active?{...structuredClone(active),id:entry.id}:undefined;},list:()=>[...entries.values()].map(publicPublished),get(id){if(unavailable&&uuid.test(id??''))throw new RendererClientError('NETWORK_ERROR','Approved exercises are temporarily unavailable. Your saved work is retained.');return entries.has(id)?structuredClone(entries.get(id)):undefined;},status:()=>({available:!unavailable,count:entries.size})};
}
export function createCatalogQuery({host=process.env.CATALOG_DB_HOST}={}){
 const pool=new pg.Pool({host,database:'opl_catalog',user:'catalog_player',max:2,connectionTimeoutMillis:2000,idleTimeoutMillis:10000,statement_timeout:3000,application_name:'mathpractice-published-catalog'});
 pool.on('error',()=>{});
 return {async query(){const result=await pool.query('SELECT catalog_backend.player_catalog() AS snapshot');const snapshot=result.rows[0].snapshot;if(process.env.LOCAL_TESTED_PILOT==='true'){const pilot=await pool.query('SELECT catalog_backend.local_pilot_catalog() AS snapshot');const ids=new Set(snapshot.entries.map(e=>e.id));snapshot.entries.push(...pilot.rows[0].snapshot.entries.filter(e=>!ids.has(e.id)));}return snapshot;},close:()=>pool.end()};
}

export function mergeExerciseLists(legacy,published,lookup){
 const publishedSources=new Set(published.map(entry=>sourceKey(lookup(entry.id))).filter(Boolean));
 return [...legacy.filter(entry=>!publishedSources.has(sourceKey(lookup(entry.id)))),...published];
}
