import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export class DiscoveryError extends Error {
 constructor(code,status=400){super(code);this.code=code;this.status=status;}
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const allowed=new Set(['q','view','subject','chapter','section','area','cursor']);
const literal=value=>value===null?'NULL':"'"+value.replaceAll("'","''")+"'";
export function filters(params){
 const result={q:'',view:'practice',subject:null,chapter:null,section:null,area:null,cursor:null};
 for(const [key,value] of params){
  if(!allowed.has(key)||params.getAll(key).length!==1||value.length>(key==='cursor'?4096:200)||/[\u0000-\u001f\u007f]/.test(value))throw new DiscoveryError('INVALID_FILTER');
  result[key]=value||result[key];
 }
 if(!['practice','library'].includes(result.view)||result.area&&!['OpenProblemLibrary','Contrib','Pending'].includes(result.area)||
 result.chapter&&!result.subject||result.section&&!result.chapter)throw new DiscoveryError('INVALID_FILTER');
 result.q=result.q.trim();return result;
}
function binding(input){return createHash('sha256').update(JSON.stringify([input.q,input.view,input.subject,input.chapter,input.section,input.area])).digest('hex');}
export function decodeCursor(input){
 if(!input.cursor)return null;
 try{
  if(!/^[A-Za-z0-9_-]+$/.test(input.cursor))throw Error();
  const value=JSON.parse(Buffer.from(input.cursor,'base64url'));
  if(value.binding!==binding(input)||!uuid.test(value.id)||!uuid.test(value.runId)||typeof value.title!=='string'||value.title.length>1000||/[\x00-\x1f\x7f]/.test(value.title))throw Error();
  return value;
 }catch{throw new DiscoveryError('INVALID_CURSOR');}
}
const cursor=(row,input)=>Buffer.from(JSON.stringify({id:row.id,runId:row.import_run_id,title:row.sort_key,binding:binding(input)})).toString('base64url');
let activeQueries=0;
// Bound subprocesses; no shell, SQL/credentials in arguments, or event-loop blocking queries.
export async function queryDatabase(statement){
 if(activeQueries>=4)throw new DiscoveryError('CATALOG_BUSY',503);activeQueries++;
 try{return await new Promise((resolve,reject)=>{
  const child=execFile('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],{timeout:6000,maxBuffer:2*1024*1024,encoding:'utf8'},(error,stdout,stderr)=>{
   if(error)return reject(new DiscoveryError(/40001/.test(stderr??'')?'CATALOG_CHANGED':'CATALOG_UNAVAILABLE',/40001/.test(stderr??'')?409:503));
   try{resolve(JSON.parse(stdout.trim()));}catch{reject(new DiscoveryError('CATALOG_UNAVAILABLE',503));}
  });
  child.stdin.on('error',()=>{});
  child.stdin.end("BEGIN READ ONLY; SET LOCAL ROLE anon; SET LOCAL statement_timeout='4s'; SET LOCAL standard_conforming_strings=on;\n"+statement+";\nCOMMIT;");
 });}finally{activeQueries--;}
}
const metadata=JSON.parse(readFileSync(new URL('./practice-metadata.json',import.meta.url),'utf8'));
const text=value=>typeof value==='string'?value:null;
export function publicEntry(row){
 return {id:row.id,title:text(row.title)||'Untitled source',titleOrigin:row.title_origin,description:text(row.description),
 subject:text(row.subject),chapter:text(row.chapter),section:text(row.section),area:row.library_area,
 classification:row.classification_state,canPractice:false,catalogPracticeReady:row.can_practice===true,
 availability:row.can_practice?'catalog-verified-awaiting-player-connection':'awaiting-verification-or-support',
 attribution:{authors:Array.isArray(row.attribution?.authors)?row.attribution.authors.filter(v=>typeof v==='string'):[],
 institutions:Array.isArray(row.attribution?.institutions)?row.attribution.institutions.filter(v=>typeof v==='string'):[],
 repository:'WeBWorK Open Problem Library',rightsState:'review-required'}};
}
export function createCatalog({query=queryDatabase,practiceOrigin='http://workspace:3000',fetcher=fetch}={}){
 let cache;const topicCache=new Map();
 async function practice(){
  try{
   const response=await fetcher(practiceOrigin+'/api/exercises',{signal:AbortSignal.timeout(4500)});
   if(!response.ok)throw Error();
   const value=await response.json();
   if(!Array.isArray(value.exercises))throw Error();
   return value.exercises.filter(v=>typeof v.id==='string'&&(metadata.some(m=>m.id===v.id)||uuid.test(v.id)&&text(v.subject)&&text(v.chapter))).map(v=>{
    const source=metadata.find(m=>m.id===v.id);
    return {id:v.id,title:v.title,description:v.description,subject:source?.subject??v.subject,chapter:source?v.topic:v.chapter,section:source?null:text(v.section),topic:v.topic,
     collectionId:v.collectionId??null,reviewStatus:v.reviewStatus??null,canPractice:true,availability:'practice-ready',titleOrigin:source?'reviewed-title':v.titleOrigin??'source-metadata',
     ...(source?{}:{attribution:{authors:Array.isArray(v.attribution?.authors)?v.attribution.authors.filter(a=>typeof a==='string'):[],institutions:Array.isArray(v.attribution?.institutions)?v.attribution.institutions.filter(a=>typeof a==='string'):[]}})};
   });
  }catch{throw new DiscoveryError('PRACTICE_UNAVAILABLE',503);}
 }
 async function overview(){
  const [p,c]=await Promise.allSettled([practice(),summary()]);
  const entries=p.status==='fulfilled'?p.value:[];
  return {practice:{available:p.status==='fulfilled',count:entries.length,subjects:[...new Set(entries.map(e=>e.subject))].sort().map(subject=>({subject,practice:entries.filter(e=>e.subject===subject).length}))},
   collections:[['calculus','Differential calculus'],['algebra','Algebra'],['trigonometry','Trigonometry'],['statistics','Statistics']].map(([id,title])=>({id,title,target:100,available:p.status==='fulfilled',playable:entries.filter(e=>e.collectionId===id).length})),
   library:c.status==='fulfilled'?{available:true,...c.value}:{available:false,indexed:null,subjects:[]}};
 }
 async function summary(){
  if(cache&&cache.until>Date.now())return cache.value;
  const [counts,subjects]=await Promise.all([
   query("SELECT catalog_api.opl_counts()"),
   query("SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT subject,sum(indexed)::integer indexed FROM catalog_api.opl_topics() WHERE subject IS NOT NULL GROUP BY subject ORDER BY subject)x")
  ]);
  const result={indexed:counts.indexed,practiceReady:counts.practiceReady,unclassified:counts.unclassified,subjects};
  cache={value:result,until:Date.now()+15000};return result;
 }
 async function search(input){

  if(input.view==='practice'){
   if(input.area)throw new DiscoveryError('INVALID_FILTER');
   const live=await practice(),generation=createHash('sha256').update(JSON.stringify(live)).digest('hex');let offset=0;
   if(input.cursor){
    try{const c=JSON.parse(Buffer.from(input.cursor,'base64url'));if(c.kind!=='practice'||c.binding!==binding(input)||!Number.isInteger(c.offset)||c.offset<1)throw Error();if(c.generation!==generation)throw new DiscoveryError('CATALOG_CHANGED',409);offset=c.offset;}
    catch(error){if(error instanceof DiscoveryError)throw error;throw new DiscoveryError('INVALID_CURSOR');}
   }
   const entries=live.filter(e=>(!input.subject||e.subject===input.subject)&&(!input.chapter||e.chapter===input.chapter)&&(!input.section||e.section===input.section)&&
    input.q.toLocaleLowerCase().split(/\s+/).every(word=>[e.title,e.description,e.subject,e.chapter,e.section,...(e.attribution?.authors??[]),...(e.attribution?.institutions??[])].filter(Boolean).join(' ').toLocaleLowerCase().includes(word))).sort((a,b)=>a.title.localeCompare(b.title,'en')||a.id.localeCompare(b.id,'en'));
   if(offset>=entries.length&&offset)throw new DiscoveryError('INVALID_CURSOR');
   const next=offset+12;
   return {entries:entries.slice(offset,next),nextCursor:next<entries.length?Buffer.from(JSON.stringify({kind:'practice',binding:binding(input),generation,offset:next})).toString('base64url'):null,view:'practice'};
  }
  const after=decodeCursor(input);
  const args=[input.q,input.subject,input.chapter,input.section,input.area].map(literal).join(',');
  const rows=await query("SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM catalog_api.search_opl("+args+",13,"+literal(after?.title??'')+","+literal(after?.id??'00000000-0000-0000-0000-000000000000')+"::uuid,"+(after?literal(after.runId)+'::uuid':'NULL')+")x");
  const page=rows.slice(0,12);return {entries:page.map(publicEntry),nextCursor:rows.length>12?cursor(page.at(-1),input):null,view:'library'};
 }
 async function topics(input){
  if(input.view==='practice'){
   const entries=await practice();return {topics:entries.filter(e=>!input.subject||input.subject===e.subject).map(e=>({subject:e.subject,chapter:e.chapter,section:e.section??null,indexed:0}))};
  }
  const key=JSON.stringify([input.subject,input.chapter]);
  let cached=topicCache.get(key);
  if(!cached||cached.until<Date.now()){
   if(topicCache.size>=64)topicCache.clear();
   cached={until:Date.now()+15000,promise:query("SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM catalog_api.opl_topics("+literal(input.subject)+","+literal(input.chapter)+")x")};
   topicCache.set(key,cached);cached.promise.catch(()=>{if(topicCache.get(key)===cached)topicCache.delete(key);});
  }
  return {topics:await cached.promise};
 }
 return {practice,overview,search,topics};
}
