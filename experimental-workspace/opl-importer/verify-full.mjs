import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {loadInventory,runImport,status} from './workflow.mjs';
import {search,counts,topics,issues} from './search.mjs';
import {json,sql,literal} from './db.mjs';
import {hash,PIN} from './inventory.mjs';
const data=loadInventory(),checks=[];
function ok(name,result){assert.equal(result,true,name);checks.push({name,passed:true});}
const before=counts(),state=status(before.runId);
ok('Pinned complete library is published',data.revision===PIN&&state.state==='completed'&&before.indexed===data.entries.length);
ok('Current pinned inventory contains all three roots',data.entries.length===77134&&JSON.stringify(data.byRoot)===JSON.stringify({OpenProblemLibrary:40541,Contrib:29624,Pending:6969}));
ok('No imports become practice-ready without evidence/activation',before.practiceReady===0&&state.report.activationCreated===false);
const fingerprint=()=>json(`SELECT jsonb_build_object('head',h.run_id,'generation',h.generation,
 'identityDigest',(SELECT md5(string_agg(e.path||':'||e.exercise_id::text||':'||e.source_version_id::text,',' ORDER BY e.path)) FROM catalog.import_entries e WHERE e.run_id=h.run_id),
 'versions',(SELECT count(*) FROM catalog.source_versions s JOIN catalog.snapshots v ON v.id=s.snapshot_id WHERE v.repository_id=h.repository_id),
 'identities',(SELECT count(DISTINCT exercise_id) FROM catalog.import_entries WHERE run_id=h.run_id),
 'events',(SELECT count(*) FROM catalog.identity_events WHERE repository_id=h.repository_id),
 'classifications',(SELECT count(*) FROM catalog.classification_assessments a JOIN catalog.source_versions s ON s.id=a.source_version_id JOIN catalog.snapshots v ON v.id=s.snapshot_id WHERE v.repository_id=h.repository_id))
 FROM catalog.import_heads h JOIN catalog.repositories p ON p.id=h.repository_id WHERE p.registry_key='openwebwork-opl';`);
const first=fingerprint(),replayed=runImport(data),second=fingerprint();
ok('Completed rerun returns its stored report without duplicate identities/versions/events',replayed.replayed===true&&JSON.stringify(first)===JSON.stringify(second));
ok('All initial paths have distinct stable exercise identities',first.identities===77134);
ok('All eleven bootstrap aliases retain their original exact source identity',sql(`SELECT count(*)=11 AND bool_and(a.exercise_id=e.exercise_id) FROM catalog.aliases a JOIN catalog.source_versions s ON s.exercise_id=a.exercise_id JOIN catalog.import_entries e ON e.source_version_id=s.id WHERE a.namespace='experimental-opl' AND e.run_id=${literal(before.runId)};`)==='t');
const derivative=search({query:'derivative',limit:20}),vector=search({query:'vector',limit:20}),page1=search({limit:100}),page2=search({limit:100,cursor:page1.nextCursor});
ok('Full-text search returns source metadata across subjects',derivative.entries.length>0&&vector.entries.length>0);
ok('Keyset pages have no repeated entries',page1.entries.length===100&&page2.entries.length===100&&!page1.entries.some(a=>page2.entries.some(b=>a.id===b.id)));
ok('Public rows contain no source controls, raw headers, or renderer state',page1.entries.every(row=>['path','metadata','raw','sha256','blob_oid','seed','session_token','problem_token'].every(key=>!Object.hasOwn(row,key))));
const topicRows=topics();
ok('Normalized topic counts cover exactly matched sources',topicRows.reduce((n,row)=>n+Number(row.indexed),0)===data.classifications.matched);
const diagnostics=json(`SELECT coalesce(jsonb_object_agg(code,n),'{}') FROM(SELECT code,count(*) n FROM catalog.import_entries e CROSS JOIN LATERAL jsonb_array_elements_text(e.metadata->'diagnostics') code WHERE e.run_id=${literal(before.runId)} GROUP BY code)x;`);
const checkpoint=JSON.parse(readFileSync('/state/crash-checkpoint.json','utf8'));
ok('The completed run resumed its original committed checkpoint',checkpoint.runId===before.runId&&checkpoint.interrupted===true&&checkpoint.staged===1000&&checkpoint.sealed===false);
const plans={};
for(const [name,query] of Object.entries({browse:`SELECT id FROM catalog.import_entries WHERE run_id=${literal(before.runId)} ORDER BY title_sort,id LIMIT 20`,search:`SELECT id FROM catalog.import_entries WHERE run_id=${literal(before.runId)} AND search_document @@ plainto_tsquery('simple','orthogonal') LIMIT 20`})){
 sql('ANALYZE catalog.import_entries;');
 const plan=json('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+query);
 function indexes(node){return [...(node['Index Name']?[node['Index Name']]:[]),...(node.Plans??[]).flatMap(indexes)];}
 plans[name]={indexes:indexes(plan[0].Plan),planningMilliseconds:plan[0]['Planning Time'],executionMilliseconds:plan[0]['Execution Time']};
}
ok('Natural browse plan uses the catalog browse index',plans.browse.indexes.includes('import_entry_browse'));
ok('Natural text search uses the GIN index',plans.search.indexes.includes('import_entry_search'));
const sources=[...readdirSync('/importer').filter(n=>/\.(mjs|sql)$/.test(n)).map(name=>({name,sha256:hash(readFileSync('/importer/'+name))})),
 ...readdirSync('/migrations').filter(n=>/^20261116.*\.sql$/.test(n)).map(name=>({name,sha256:hash(readFileSync('/migrations/'+name))}))];
const report={version:1,observedAt:new Date().toISOString(),scope:'Isolated local PostgreSQL catalog; pinned Git source metadata only; no PG execution, hosted Supabase or application/session-volume changes',
 nodeVersion:process.version,revision:data.revision,treeOid:data.treeOid,manifestDigest:data.manifestDigest,counts:before,import:state.report,
 classifications:data.classifications,diagnosticCounts:diagnostics,checkpointRecovery:{runId:checkpoint.runId,phase:checkpoint.phase,committedRows:checkpoint.staged,originalRunPreserved:true},
 rerun:{replayed:true,before:first,after:second},checks,queryPlans:plans,operatorIssueSamples:issues({limit:5}),sourceHashes:sources,complete:checks.every(c=>c.passed)};
writeFileSync('/state/full-import-observations.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({checks:checks.length,counts:before,report:'/state/full-import-observations.json',complete:report.complete}));
