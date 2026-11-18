import {readFileSync} from 'node:fs';import {DiscoveryError} from './catalog.mjs';
const collections=JSON.parse(readFileSync(new URL('../practice-400/collections.json',import.meta.url),'utf8'));
export function subjectInput(params){if([...params.keys()].some(k=>k!=='subject')||params.getAll('subject').length!==1)throw new DiscoveryError('INVALID_TOPIC');const s=params.get('subject');if(!s||s.length>200||/[\x00-\x1f\x7f]/.test(s))throw new DiscoveryError('INVALID_TOPIC');return s;}
export function projectSubject(entries,subject){
 const config=collections.find(c=>c.title===subject),rows=[...new Map(entries.filter(e=>e.subject===subject&&(!config||e.collectionId===config.id)).map(e=>[e.id,e])).values()];
 if(!config&&!rows.length)throw new DiscoveryError('TOPIC_UNAVAILABLE',404);
 const order={algebra:['expressions','exponents','linear','systems','quadratic','polynomials','logarithms'],trigonometry:['angles','circle','functions','inverse','identities','equations','triangles']}[config?.id];
 const chapters=config?[...config.topics].sort((a,b)=>order?order.indexOf(a.id)-order.indexOf(b.id):0):[...new Set(rows.map(e=>e.chapter).filter(Boolean))].sort().map((title,i)=>({id:String(i),title,target:null}));
 return {subject,collectionId:config?.id??null,target:config?.target??null,available:rows.length,tracking:Boolean(config),chapters:chapters.map((c,index)=>({...c,index:index+1,available:rows.filter(e=>e.chapter===c.title).length})),definition:'study-goals-v1'};
}
