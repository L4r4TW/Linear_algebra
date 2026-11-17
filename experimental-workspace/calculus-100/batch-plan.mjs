import {TOPICS} from './contract.mjs';
export function planBatch(candidates,jobs){
 const bySource=new Map(jobs.map(job=>[job.source_version_id,job])),enqueue=[],topics=[];
 for(const topic of TOPICS){
  const rows=candidates.filter(row=>row.courseTopic===topic.id),passed=rows.filter(row=>bySource.get(row.source_version_id)?.technical_state==='passed'),pending=rows.filter(row=>['queued','running'].includes(bySource.get(row.source_version_id)?.state));
  const unused=rows.filter(row=>!bySource.has(row.source_version_id));
  const needed=Math.max(0,topic.target-passed.length-pending.length),next=unused.slice(0,needed);enqueue.push(...next.map(row=>row.source_version_id));
  topics.push({id:topic.id,target:topic.target,technicalPassed:passed.length,pending:pending.length,unused:unused.length,exhausted:passed.length<topic.target&&!pending.length&&!next.length,selected:passed.slice(0,topic.target).map(row=>({id:row.id,sourceVersionId:row.source_version_id,jobId:bySource.get(row.source_version_id).id}))});
 }
 return {enqueue,topics,complete:topics.every(topic=>topic.technicalPassed>=topic.target),exhausted:topics.some(topic=>topic.exhausted)};
}
