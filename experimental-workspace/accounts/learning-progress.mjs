import {readFileSync} from 'node:fs';
export const STUDY_COLLECTIONS=JSON.parse(readFileSync(new URL('../practice-400/collections.json',import.meta.url),'utf8'));
export function learningAssignment(entry){
 const collection=STUDY_COLLECTIONS.find(c=>c.id===entry?.collectionId),chapter=collection?.topics.find(t=>t.title===entry?.chapter);
 if(!chapter)return null;
 return {exerciseKey:entry.identityId??entry.id,collectionKey:collection.id,chapterKey:chapter.id,definition:'study-goals-v1'};
}
export function completionAssignment(attempt,entry){
 if(attempt?.provenance!=='server-pg'||attempt.feedbackVisibility==='suppressed'||attempt.score!==1)return null;
 if(attempt.learning){const a=attempt.learning,c=STUDY_COLLECTIONS.find(c=>c.id===a.collectionKey);return a.definition==='study-goals-v1'&&typeof a.exerciseKey==='string'&&c?.topics.some(t=>t.id===a.chapterKey)?a:null;}
 const source=attempt.source;
 if(!source||!entry?.source||source.sha256!==entry.source.sha256||source.revision!==entry.source.revision||source.versionId&&source.versionId!==entry.source.versionId)return null;
 return learningAssignment(entry);
}
export async function recordLearning(client,{attempt,entry,principalId}){
 const a=completionAssignment(attempt,entry);
 if(a)await client.query('INSERT INTO practice_runtime.learning_credits(principal_id,exercise_key,attempt_id,collection_key,chapter_key,earned_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(principal_id,exercise_key) DO NOTHING',[principalId,a.exerciseKey,attempt.id,a.collectionKey,a.chapterKey,attempt.submittedAt]);
 await client.query('INSERT INTO practice_runtime.learning_receipts(attempt_id,principal_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[attempt.id,principalId]);
}
export function projectLearning(rows){
 return STUDY_COLLECTIONS.map(c=>{
 const chapters=c.topics.map(t=>{const completed=Math.min(t.target,Number(rows.find(r=>r.collection_key===c.id&&r.chapter_key===t.id)?.completed??0));return {id:t.id,title:t.title,target:t.target,completed,percent:Math.floor(completed/t.target*100)};});
 const completed=chapters.reduce((n,t)=>n+t.completed,0);
 return {id:c.id,title:c.title,target:c.target,completed,percent:Math.floor(completed/c.target*100),chapters};
 });
}
export function createLearningProgress({db,vault,exerciseLookup}){
 return async()=>db.current(async client=>{
 const pending=(await client.query('SELECT a.id,a.principal_id,a.session_id,a.encrypted_attempt FROM practice_runtime.attempts a WHERE NOT EXISTS(SELECT 1 FROM practice_runtime.learning_receipts r WHERE r.attempt_id=a.id) ORDER BY a.submitted_at,a.id LIMIT 500')).rows;
 for(const row of pending){const attempt=vault.open(row.encrypted_attempt,'attempt:'+row.id+':'+row.session_id);await recordLearning(client,{attempt,entry:attempt.learning?null:exerciseLookup(attempt.exerciseId),principalId:row.principal_id});}
 const syncing=(await client.query('SELECT EXISTS(SELECT 1 FROM practice_runtime.attempts a WHERE NOT EXISTS(SELECT 1 FROM practice_runtime.learning_receipts r WHERE r.attempt_id=a.id)) more')).rows[0].more;
 const rows=(await client.query('SELECT collection_key,chapter_key,count(*)::int completed FROM(SELECT DISTINCT ON(exercise_key) exercise_key,collection_key,chapter_key FROM practice_runtime.learning_credits ORDER BY exercise_key,earned_at,attempt_id)c GROUP BY collection_key,chapter_key')).rows;
 return {definition:'study-goals-v1',meaning:'A distinct exercise completed with a fully correct, visible WeBWorK result. Repeats, skips and partial answers do not add completion. Fixed study goals do not grow with the catalog; this is completion, not mastery.',syncing,collections:projectLearning(rows)};
 });
}
