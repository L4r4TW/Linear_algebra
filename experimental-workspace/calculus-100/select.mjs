import {createHash} from 'node:crypto';
import {TOPICS,topicOf} from './contract.mjs';
export const contentKey=bytes=>createHash('sha256').update(bytes.toString('utf8').split(/\r?\n/).filter(line=>!/^\s*#/.test(line)&&line.trim()).join('\n')).digest('hex');
export function selectCandidates(rows,{multiplier=3}={}){
 if(!Number.isInteger(multiplier)||multiplier<1||multiplier>5)throw Error('INVALID_RESERVE_MULTIPLIER');
 const seenSha=new Set(),seenContent=new Set(),selected=[],shortfalls=[],excluded={missingClassification:0,unsupported:0,unverifiedSource:0,duplicate:0};
 const eligible=rows.filter(row=>{
  if(!topicOf(row.metadata?.sourceLabels)){excluded.missingClassification++;return false;}
  if(!row.manifest||row.manifest.unsupported.length){excluded.unsupported++;return false;}
  if(!row.contentKey||!row.sourceVerified){excluded.unverifiedSource++;return false;}return true;
 });
 for(const topic of TOPICS){
  const pool=eligible.filter(row=>topicOf(row.metadata.sourceLabels)===topic.id),counts=new Map();let accepted=0;
  const families=row=>[row.metadata.sourceLabels[2]??'',row.path.split('/').slice(0,-1).join('/'),(row.metadata.institutions??[]).join('|')];
  const cost=row=>families(row).reduce((sum,key,i)=>sum+(counts.get(i+':'+key)??0)*[10,5,2][i],0)+(row.path.startsWith('OpenProblemLibrary/')?0:1000);
  while(pool.length&&accepted<topic.target*multiplier){
   pool.sort((a,b)=>cost(a)-cost(b)||a.path.localeCompare(b.path,'en'));const row=pool.shift();
   if(seenSha.has(row.sha256)||seenContent.has(row.contentKey)){excluded.duplicate++;continue;}
   seenSha.add(row.sha256);seenContent.add(row.contentKey);accepted++;
   for(const [i,key]of families(row).entries())counts.set(i+':'+key,(counts.get(i+':'+key)??0)+1);
   selected.push({...row,courseTopic:topic.id,rank:accepted,plannedWave:accepted<=topic.target?'primary':'reserve',reviewStatus:'pending',practiceAvailable:false});
  }
  if(accepted<topic.target*multiplier)shortfalls.push({topic:topic.id,wanted:topic.target*multiplier,selected:accepted});
 }
 return {selected,excluded,shortfalls};
}
