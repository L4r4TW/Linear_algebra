import {readFile,writeFile,mkdir} from 'node:fs/promises';import {blobs,git,ROOT,PIN,hash} from '../importer/inventory.mjs';import {contentKey,selectCandidates} from './select.mjs';import {TOPICS,topicOf} from './contract.mjs';
const rows=JSON.parse(await readFile('/input/source-metadata.json','utf8'));
if(git(ROOT,['rev-parse','HEAD']).toString().trim()!==PIN)throw Error('OPL_PIN_MISMATCH');
const eligible=rows.filter(row=>topicOf(row.metadata.sourceLabels)&&row.manifest?.unsupported.length===0).map(row=>({...row,oid:row.blob_oid}));
let verified=0;
for await(const {entry,bytes}of blobs(ROOT,eligible)){
 if(entry.revision!==PIN||hash(bytes)!==entry.sha256)throw Error('CANDIDATE_SOURCE_HASH_MISMATCH');
 entry.sourceVerified=true;entry.contentKey=contentKey(bytes);delete entry.oid;verified++;
}
const {selected,excluded,shortfalls}=selectCandidates(eligible);
const report={version:1,createdAt:new Date().toISOString(),sourceRevision:PIN,sourceObjectsVerified:verified,selected:selected.length,primary:selected.filter(row=>row.plannedWave==='primary').length,
 topics:TOPICS.map(topic=>({...topic,candidates:selected.filter(row=>row.courseTopic===topic.id).length})),excluded,shortfalls,
 caveats:['No mathematical, requirements, interaction or deployment approval is inferred.','Content-key deduplication is a selection heuristic, not an identity merge or mathematical equivalence proof.','Source labels and descriptions remain unreviewed. Rights evidence must be reviewed before rollout.','Candidate sources have no student start action.'],
 candidates:selected};
await mkdir('/artifacts',{recursive:true});await writeFile('/artifacts/candidates.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({selected:report.selected,primary:report.primary,verified,shortfalls}));
if(shortfalls.length)process.exitCode=1;
