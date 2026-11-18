import {readFileSync,writeFileSync,renameSync} from 'node:fs';import {createHash} from 'node:crypto';import {COLLECTIONS,classify,screenSource} from './contract.mjs';import {json} from '../importer/db.mjs';import {blobs,ROOT} from '../importer/inventory.mjs';
const collection=process.argv[2],topic=process.argv[3],maximum=Number(process.argv[4]??30),c=COLLECTIONS.find(c=>c.id===collection),t=c?.topics.find(t=>t.id===topic);
if(!t||!Number.isInteger(maximum)||maximum<1||maximum>100)throw Error('VALID_COLLECTION_TOPIC_AND_ADDITIONAL_1_TO_100_REQUIRED');
const initial=readFileSync('/artifacts/candidates.json','utf8'),pool=JSON.parse(initial),seen=new Set(pool.candidates.map(r=>r.contentKey)),ids=new Set(pool.candidates.map(r=>r.source_version_id));
const bad=new Set(json("SELECT coalesce(jsonb_agg(source_version_id),'[]') FROM catalog.verification_jobs WHERE catalog.verification_job_current(id) AND technical_state IN('failed','error','unsupported','cancelled','stale')"));
const rows=json("SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT e.exercise_id id,e.source_version_id,e.path,e.sha256,e.blob_oid oid,s.commit_oid revision,e.metadata-'raw' metadata,m.manifest FROM catalog.import_entries e JOIN catalog.import_heads h ON h.run_id=e.run_id JOIN catalog.source_versions sv ON sv.id=e.source_version_id JOIN catalog.snapshots s ON s.id=sv.snapshot_id LEFT JOIN LATERAL(SELECT manifest FROM catalog.capability_manifests WHERE source_version_id=e.source_version_id ORDER BY created_at DESC,id DESC LIMIT 1)m ON true WHERE e.path LIKE 'OpenProblemLibrary/%' AND e.metadata->'sourceLabels'->>0 IN('Calculus - single variable','Algebra','Precalculus','Trigonometry','Statistics','Probability') ORDER BY e.path)x");
const eligible=rows.filter(r=>{const a=classify(r.metadata.normalized);return a?.collection===collection&&a.topic===topic&&!ids.has(r.source_version_id)&&!bad.has(r.source_version_id)&&r.manifest?.unsupported?.length===0;}),candidates=[];
for await(const {entry,bytes}of blobs(ROOT,eligible)){
 if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('SOURCE_HASH_MISMATCH');
 const body=bytes.toString('utf8'),sourceScreen=screenSource(body,entry),contentKey=createHash('sha256').update(body.split(/\r?\n/).filter(l=>!/^\s*#/.test(l)&&l.trim()).join('\n')).digest('hex');
 if(!sourceScreen.passed||seen.has(contentKey))continue;seen.add(contentKey);candidates.push({...entry,collection,topic,sourceScreen,contentKey,byteCount:bytes.length});
}
candidates.sort((a,b)=>a.byteCount-b.byteCount||a.path.localeCompare(b.path));
let rank=Math.max(0,...pool.candidates.filter(r=>r.collection===collection&&r.topic===topic).map(r=>r.rank));
const added=candidates.slice(0,maximum).map(r=>({...r,rank:++rank,collectionTitle:c.title,topicTitle:t.title,displayTitle:t.title+' · Practice '+rank}));
pool.candidates.push(...added);pool.extensions??=[];pool.extensions.push({at:new Date().toISOString(),collection,topic,added:added.length,scope:'Append-only reserves; retained prior candidates, grants and failed evidence'});
if(readFileSync('/artifacts/candidates.json','utf8')!==initial)throw Error('POOL_CHANGED_RETRY_WITH_CONTROLLER_STOPPED');
const temporary='/artifacts/candidates.extension-'+process.pid+'.json';writeFileSync(temporary,JSON.stringify(pool,null,2)+'\n',{flag:'wx'});renameSync(temporary,'/artifacts/candidates.json');console.log(JSON.stringify({collection,topic,added:added.length,totalCandidates:pool.candidates.length,existingEntriesPreserved:true}));
