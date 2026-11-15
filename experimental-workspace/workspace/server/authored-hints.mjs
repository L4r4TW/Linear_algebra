import {parse,serialize,serializeOuter} from 'parse5';
import {feedbackText} from './feedback-content.mjs';
const attrs=n=>Object.fromEntries((n.attrs??[]).map(a=>[a.name,a.value]));
const isHidden=n=>{const a=attrs(n);return 'hidden' in a||a['aria-hidden']==='true'||/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(a.style??'');};
const hasClass=(n,name)=>(attrs(n).class??'').split(/\s+/).includes(name);
/** Only the pinned HINT/BEGIN_HINT accordion, with prose/reviewed-math content, is supported. */
function hintBody(node){
 if(node.tagName!=='div'||!hasClass(node,'accordion'))return;
 const bodies=[];let supported=true;
 const tags=new Set(['div','details','summary','span','p','br','b','strong','i','em','u','ul','ol','li','sup','sub','code','pre','a']);
 function visit(n){
  if(n.tagName==='script'){
   if(!/^math\/tex(?:;\s*mode=display)?$/.test(attrs(n).type??''))supported=false;
   return;
  }
  if(n.tagName&&!tags.has(n.tagName)||isHidden(n))supported=false;
  if(hasClass(n,'solution'))supported=false;
  if(hasClass(n,'accordion-body'))bodies.push(n);
  for(const child of n.childNodes??[])visit(child);
 }
 visit(node);
 if(!supported||bodies.length!==1||!node.childNodes?.some(n=>n.tagName==='details'&&hasClass(n,'accordion-item')))return;
 try{return feedbackText(serializeOuter(bodies[0]));}catch{return;}
}
/** Existence is not availability. Strip all marked hints/solutions from the live question. */
export function projectAuthoredHints(html,{hintExists=false}={}){
 const document=parse(html),messages=[];let unsupported=false,total=0;
 function visit(node,inProblem=false){
  inProblem ||= attrs(node).id==='problem_body';
  if(!node.childNodes)return;
  node.childNodes=node.childNodes.filter(child=>{
   if(inProblem&&hasClass(child,'solution'))return false;
   if(inProblem&&hasClass(child,'hint')){
    if(hintExists){const message=attrs(node).id==='problem_body'&&!isHidden(node)?hintBody(child):undefined;if(message&&message.length<=16_000&&++total<=8)messages.push(message);else unsupported=true;}
    return false;
   }
   visit(child,inProblem);return true;
  });
 }
 visit(document);
 const message=messages.join('\n\n');
 const available=hintExists&&!unsupported&&Boolean(message)&&message.length<=16_000;
 return {html:serialize(document),hint:available?{available:true,message}:{available:false}};
}