import {randomUUID} from 'node:crypto';
import {DiscoveryError} from './catalog.mjs';
const levels=['subject','chapter','section'];
export function chooserInput(params){
 const allowed=new Set(['view',...levels,'subjectFind','chapterFind','sectionFind']);
 const value={view:'practice',subject:null,chapter:null,section:null,subjectFind:'',chapterFind:'',sectionFind:''};
 for(const [key,text] of params){
  if(!allowed.has(key)||params.getAll(key).length!==1||text.length>200||/[\x00-\x1f\x7f]/.test(text))throw new DiscoveryError('INVALID_TOPIC');
  value[key]=text||value[key];
 }
 if(!['practice','library'].includes(value.view)||value.chapter&&!value.subject||value.section&&!value.chapter)throw new DiscoveryError('INVALID_TOPIC');
 return value;
}
const sum=(rows,key)=>rows.reduce((n,row)=>n+Number(row[key]??0),0);
const same=(row,input,depth)=>levels.slice(0,depth).every(key=>!input[key]||row[key]===input[key]);
export function projectChooser(rows,input){
 const clean=rows.filter(row=>typeof row.subject==='string'&&row.subject.length>0);
 for(let depth=0;depth<3;depth++)if(input[levels[depth]]&&!clean.some(row=>same(row,input,depth+1)))throw new DiscoveryError('TOPIC_UNAVAILABLE',409);
 const columns=levels.map((level,depth)=>{
  const groups=new Map();
  for(const row of clean.filter(row=>same(row,input,depth))){
   if(typeof row[level]!=='string'||!row[level])continue;
   const group=groups.get(row[level])??{label:row[level],indexed:0,available:0};
   group.indexed+=Number(row.indexed??0);group.available+=Number(row.available??0);groups.set(row[level],group);
  }
  const enabled=depth===0||Boolean(input[levels[depth-1]]);
  const matching=enabled?[...groups.values()].filter(node=>node.label.toLocaleLowerCase().includes(input[level+'Find'].trim().toLocaleLowerCase())).sort((a,b)=>a.label.localeCompare(b.label,'en')):[];
  return {level,enabled,total:matching.length,nodes:matching.slice(0,40),truncated:matching.length>40};
 });
 const selected=clean.filter(row=>same(row,input,3));
 return {view:input.view,selection:Object.fromEntries(levels.map(key=>[key,input[key]])),columns,
  breadcrumb:levels.map(key=>input[key]).filter(Boolean),indexed:sum(selected,'indexed'),available:sum(selected,'available'),
  missingChapter:input.subject?sum(clean.filter(row=>row.subject===input.subject&&!row.chapter),'indexed'):0,
  missingSection:input.chapter?sum(clean.filter(row=>same(row,input,2)&&!row.section),'indexed'):0,
  canStart:input.view==='practice'&&selected.some(row=>row.available>0)};
}
export async function chooser(catalog,input){
 const rows=input.view==='practice'?(await catalog.practice()).map(entry=>({...entry,indexed:0,available:1})):(await catalog.topics({view:'library',subject:null,chapter:null})).topics.map(row=>({...row,available:0}));
 return projectChooser(rows,input);
}
export function createPracticePlan(entries,input){
 if(input.view!=='practice')throw new DiscoveryError('PRACTICE_NOT_AVAILABLE',409);
 const members=[...new Map(entries.filter(entry=>same(entry,input,3)&&entry.canPractice===true).map(entry=>[entry.id,entry])).values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).slice(0,20);
 if(!members.length)throw new DiscoveryError('TOPIC_UNAVAILABLE',409);
 return {id:randomUUID(),createdAt:new Date().toISOString(),version:1,selection:Object.fromEntries(levels.map(key=>[key,input[key]])),
  title:input.section??input.chapter??input.subject??'Available mathematics',items:members.map(entry=>({exerciseId:entry.id,title:entry.title,sessionId:null})),
  policy:{maximum:20,order:'exercise-id-ascending',membership:'frozen-at-creation',skipped:'retained-for-revisit'},total:members.length};
}
