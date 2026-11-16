import {git,hash,inventory,ROOT,PIN} from './inventory.mjs';
export const PARSER='opl-header-v1';
export const fold=value=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
const clean=value=>{
 let text=value.trim();
 if((text.startsWith("'")&&text.endsWith("'"))||(text.startsWith('"')&&text.endsWith('"')))text=text.slice(1,-1).trim();
 return /^(?:unknown|unspecified|none|n\/a|tbd|\?+|\[\s*\])?$/i.test(text)?null:text;
};
export function vocabulary(text,name='synthetic') {
 const triples=[];let subject,chapter;const errors=[];
 for(const [i,line] of text.split(/\r?\n/).entries()){
  if(!line.trim()||line.trim().startsWith('#'))continue;
  const depth=line.match(/^\t*/)[0].length,label=line.trim().replace(/\s+/g,' ');
  if(depth===0){subject=label;chapter=null;}
  else if(depth===1&&subject)chapter=label;
  else if(depth===2&&subject&&chapter)triples.push({labels:[subject,chapter,label],taxonomy:name});
  else errors.push({code:'MALFORMED_TAXONOMY_LINE',line:i+1});
 }
 return {triples,errors};
}
export function taxonomyIndex(vocabularies){
 const index=new Map();
 for(const item of vocabularies.flatMap(v=>v.triples)){
  const key=JSON.stringify(item.labels.map(fold)),existing=index.get(key)??[];
  if(!existing.some(e=>JSON.stringify(e.labels)===JSON.stringify(item.labels)))existing.push(item);
  index.set(key,existing);
 }
 return index;
}
function plain(text,max){return text.replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
export function parseMetadata(bytes,path,index=new Map()){
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{
  return {parser:PARSER,state:'malformed',raw:[],diagnostics:['INVALID_UTF8'],normalized:null,title:path.split('/').at(-1).slice(0,-3),description:null,authors:[],institutions:[],bibliographic:{},language:null,difficulty:null,estimatedMinutes:null};
 }
 const raw=[],tags={},diagnostics=[],lines=text.split(/\r?\n/);
 const fields=['DBsubject','DBchapter','DBsection','Author','Institution','KEYWORDS','Language','Level','Title','TitleText1','AuthorText1'];
 for(const [i,line]of lines.entries()){
  const match=line.match(/^\s*#+\s*([A-Za-z][A-Za-z0-9]*)\s*\((.*)\)\s*(?:#.*)?$/);
  const field=match?fields.find(f=>f.toLowerCase()===match[1].toLowerCase()):null;
  if(field){
   const value=clean(match[2]);(tags[field]??=[]).push(value);
   raw.push({field,line:i+1,raw:line,value});
  }else if(/^\s*#+\s*DB(?:subject|chapter|section)\b/i.test(line))diagnostics.push('MALFORMED_CLASSIFICATION_TAG');
 }
 const distinct=['DBsubject','DBchapter','DBsection'].map(f=>[...new Set((tags[f]??[]).filter(Boolean).map(v=>v.normalize('NFKC').trim().replace(/\s+/g,' ')))]);
 const conflicting=distinct.some(values=>new Set(values.map(fold)).size>1);
 const triple=distinct.map(values=>values[0]??null),populated=triple.filter(Boolean).length;
 const matches=populated===3?index.get(JSON.stringify(triple.map(fold)))??[]:[];
 let state=diagnostics.length?'malformed':conflicting||matches.length>1?'conflicting':populated===0?'missing':populated<3?'partial':matches.length===1?'matched':'unmapped';
 if(state!=='matched')diagnostics.push('CLASSIFICATION_'+state.toUpperCase());
 if(['DBsubject','DBchapter','DBsection'].some(f=>(tags[f]??[]).length>1))diagnostics.push('REPEATED_CLASSIFICATION_TAG');
 const begin=lines.findIndex(l=>/^\s*#+\s*DESCRIPTION\s*$/i.test(l));
 const end=lines.findIndex((l,i)=>i>begin&&/^\s*#+\s*ENDDESCRIPTION\s*$/i.test(l));
 const description=begin>=0&&end>begin?plain(lines.slice(begin+1,end).map(l=>l.replace(/^\s*#+\s?/,'' )).join(' '),600)||null:null;
 const section=state==='matched'?matches[0].labels[2]:triple[2];
 const fallback=(section?section+' — ':'')+path.split('/').at(-1).replace(/[.]pg$/i,'').replace(/[_-]+/g,' ');
 // The generated/source title is labeled as such, never confused with editorial review.
 return {parser:PARSER,state,raw,diagnostics:[...new Set(diagnostics)],normalized:state==='matched'?matches[0].labels:null,
 sourceLabels:triple,title:plain(tags.Title?.find(Boolean)??fallback,160)||'Untitled source exercise',
 titleOrigin:tags.Title?.some(Boolean)?'source-header':'generated-source-label',
 description,authors:(tags.Author??[]).filter(Boolean).map(v=>plain(v,300)),institutions:(tags.Institution??[]).filter(Boolean).map(v=>plain(v,300)),
 bibliographic:{titles:(tags.TitleText1??[]).filter(Boolean),authors:(tags.AuthorText1??[]).filter(Boolean)},
 sourceLanguage:(tags.Language??[]).filter(Boolean),sourceLevels:(tags.Level??[]).filter(Boolean),language:null,difficulty:null,estimatedMinutes:null};
}
export async function metadataInventory({root=ROOT,revision=PIN}={}){
 const vocabularies=[],taxonomies=[];
 for(const name of ['Taxonomy2','Taxonomy']){
  const path='OpenProblemLibrary/'+name,bytes=git(root,['show',revision+':'+path]);
  const parsed=vocabulary(bytes.toString('utf8'),name);
  vocabularies.push(parsed);taxonomies.push({path,sha256:hash(bytes),parser:PARSER,triples:parsed.triples.length,diagnostics:parsed.errors});
 }
 const index=taxonomyIndex(vocabularies);
 const result=await inventory({root,revision,parse:(bytes,path)=>parseMetadata(bytes,path,index)});
 result.parserVersion=PARSER;result.taxonomies=taxonomies;
 result.classifications=Object.fromEntries(['matched','missing','partial','conflicting','malformed','unmapped'].map(s=>[s,result.entries.filter(e=>e.metadata.state===s).length]));
 return result;
}
