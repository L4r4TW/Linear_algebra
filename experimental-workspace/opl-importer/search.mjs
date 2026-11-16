import {json,literal} from './db.mjs';
export function search({query='',subject=null,chapter=null,section=null,area=null,limit=20,cursor=null}={}){
 if(typeof query!=='string'||query.length>200||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid search query/limit');
 for(const v of [subject,chapter,section,area])if(v!==null&&(typeof v!=='string'||v.length>200))throw Error('Invalid topic filter');
 if(cursor&&(!/^[a-f0-9-]{36}$/.test(cursor.id)||!/^[a-f0-9-]{36}$/.test(cursor.runId)||typeof cursor.title!=='string'))throw Error('Invalid cursor');
 const args=[query,subject,chapter,section,area].map(v=>v===null?'NULL':literal(v)).join(',');
 const rows=json(`SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM catalog_api.search_opl(${args},${limit},${literal(cursor?.title??'')},${literal(cursor?.id??'00000000-0000-0000-0000-000000000000')}::uuid,${cursor?literal(cursor.runId)+'::uuid':'NULL'}) x;`);
 const last=rows.at(-1);return {entries:rows,nextCursor:rows.length===limit&&last?{id:last.id,title:last.sort_key,runId:last.import_run_id}:null};
}
export function counts(){return json('SELECT catalog_api.opl_counts();');}
export function topics(subject=null,chapter=null){return json(`SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM catalog_api.opl_topics(${subject===null?'NULL':literal(subject)},${chapter===null?'NULL':literal(chapter)}) x;`);}
export function issues({limit=100,after=''}={}){
 if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('Issue limit must be 1–1000');
 return json(`SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(
 SELECT e.path,e.metadata->>'state' classification_state,e.metadata->'diagnostics' diagnostics,e.change_kind,e.review,
 CASE WHEN e.state='identity-review' THEN 'Review correspondence before assigning identity; never merge by hash alone'
 WHEN e.metadata->>'state'='unmapped' THEN 'Review raw triple against pinned taxonomy and propose an explicit mapping'
 WHEN e.metadata->>'state'='missing' THEN 'Add upstream classification or a reviewed manual mapping'
 ELSE 'Inspect retained source declarations and parser diagnostics; do not guess missing labels' END action
 FROM catalog.import_entries e JOIN catalog.import_heads h ON h.run_id=e.run_id JOIN catalog.repositories p ON p.id=h.repository_id
 WHERE p.registry_key='openwebwork-opl' AND(e.state='identity-review' OR e.metadata->>'state'<>'matched') AND e.path>${literal(after)}
 ORDER BY e.path LIMIT ${limit})x;`);
}
