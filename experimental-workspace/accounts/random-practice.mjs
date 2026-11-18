import {randomInt} from 'node:crypto';import {STUDY_COLLECTIONS,learningAssignment} from './learning-progress.mjs';
export function randomPracticeMembers(entries,selection,{completed=new Set(),random=randomInt}={}){
 const core=STUDY_COLLECTIONS.find(c=>c.title===selection.subject);
 const members=[...new Map(entries.filter(e=>Object.entries(selection).every(([key,value])=>value===null||e[key]===value)&&(!core||e.collectionId===core.id)).map(e=>[e.id,e])).values()];
 const unfinished=members.filter(e=>!completed.has(learningAssignment(e)?.exerciseKey??e.id));
 const pool=[...(unfinished.length?unfinished:members)];
 for(let i=pool.length-1;i>0;i--){const j=random(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
 return pool.slice(0,20);
}
