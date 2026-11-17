import {topicOf} from './contract.mjs';
// Metadata readiness is not independent review or permission to practice.
export function metadataReady(row){
 const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);
 const metadata=row.metadata,labels=metadata?.normalized;
 return text(metadata?.title,1000)&&Array.isArray(labels)&&text(labels[0],200)&&text(labels[1],200)&&(labels[2]===null||labels[2]===undefined||text(labels[2],200))&&topicOf(labels)===row.courseTopic;
}
