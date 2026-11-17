import {metadataReady} from './candidate-ready.mjs';
import {TOPICS} from './contract.mjs';
export const REVIEW_KINDS=['requirements','mathematical','interaction','deployment'];
export function reviewPlan({candidates,jobs,contextId}){
 const bySource=new Map(jobs.map(row=>[row.source_version_id,row])),groups=TOPICS.map(topic=>({topic,rows:candidates.filter(row=>row.courseTopic===topic.id&&metadataReady(row)&&bySource.get(row.source_version_id)?.technical_state==='passed'&&bySource.get(row.source_version_id)?.current===true&&['needs-review','passed'].includes(bySource.get(row.source_version_id)?.state)).slice(0,topic.target)}));
 const order=[],counts=new Map();
 while(groups.some(group=>group.rows.length)){
  const available=groups.filter(group=>group.rows.length).sort((a,b)=>(counts.get(a.topic.id)??0)/a.topic.target-(counts.get(b.topic.id)??0)/b.topic.target||TOPICS.indexOf(a.topic)-TOPICS.indexOf(b.topic));
  const group=available[0],row=group.rows.shift(),job=bySource.get(row.source_version_id);counts.set(group.topic.id,(counts.get(group.topic.id)??0)+1);
  order.push({exerciseId:row.id,sourceVersionId:row.source_version_id,jobId:job.id,attemptId:job.attempt_id??null,courseTopic:group.topic.id,title:row.metadata.title,
   source:{path:row.path,sha256:row.sha256,revision:row.revision,url:'https://github.com/openwebwork/webwork-open-problem-library/blob/'+row.revision+'/'+row.path.split('/').map(encodeURIComponent).join('/')},
   attribution:{authors:row.metadata.authors??[],institutions:row.metadata.institutions??[]},sourceClassification:row.metadata.sourceLabels,
   warnings:[...(/antideriv|integrals|integration/i.test(row.path)?['DIFFERENTIAL_SCOPE_REVIEW_REQUIRED']:[]),...(!row.metadata.description?['SOURCE_DESCRIPTION_MISSING']:[]),...(!row.metadata.authors?.length?['AUTHOR_CREDIT_UNDECLARED']:[])],
   unresolvedRequirements:row.manifest.unresolved,requiredCapabilities:row.manifest.candidateCapabilities,
   reviewComplete:job.review_complete===true&&job.state==='passed',reviewStatus:job.review_complete===true&&job.state==='passed'?'reviewed':'pending',
   verificationSeeds:[1234,4321],reviewPreviews:['http://localhost:3103','http://localhost:3104']});
 }
 const waves=[10,25,50,100].map(size=>{const members=order.slice(0,size);return {size,availableTechnical:members.length,ready:members.length===size&&members.every(row=>row.reviewComplete),pendingReviews:members.filter(row=>!row.reviewComplete).length,jobIds:members.map(row=>row.jobId),exerciseIds:members.map(row=>row.exerciseId)};});
 return {version:1,contextId,technicalSelected:order.length,independentReviewed:order.filter(row=>row.reviewComplete).length,requiredReviewKinds:REVIEW_KINDS,
 activationInstruction:'Keep pending review, as explicitly requested by the user. This report performs no approval, preparation or publication.',waves,entries:order};
}
