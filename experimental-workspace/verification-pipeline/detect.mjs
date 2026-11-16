import {readFileSync} from 'node:fs';
import {json,sql,literal} from '../importer/db.mjs';
import {blobs,git,ROOT,hash} from '../importer/inventory.mjs';
import {digest} from './contract.mjs';
export const DETECTOR='conservative-pg-v1';
const fixtureCatalog=JSON.parse(readFileSync('/qa/compatibility/catalog.json','utf8'));
const profile=JSON.parse(readFileSync('/qa/application/server/compatibility-profile.json','utf8'));
export function detect(text,{path,sha256}={}){
 const fixture=fixtureCatalog.exercises.find(f=>f.source.path===path&&f.source.sha256===sha256);
 const capabilities=new Set(fixture?.requiredCapabilities??['mathjax']),dependencies=[],unresolved=[];
 const macros=[...text.matchAll(/loadMacros\s*\(([\s\S]*?)\)\s*;/g)];
 for(const match of macros){
  const literals=[...match[1].matchAll(/["']([^"'\n]+)["']/g)].map(m=>m[1]);
  for(const name of literals)dependencies.push({kind:'macro',name});
  if(match[1].replace(/["'][^"'\n]*["']/g,'').replace(/[\s,]/g,''))unresolved.push('DYNAMIC_MACRO_LIST');
 }
 if(!macros.length)unresolved.push('MACRO_DISCOVERY_INCOMPLETE');
 for(const [pattern,cap] of [[/GraphTool|parserGraphTool/i,'graph-tool'],[/scaffold_begin|Scaffold::|scaffold\.pl/i,'scaffold'],[/RadioButtons|RadioMultiAnswer/i,'radio-groups'],[/CheckboxList|checkbox_cmp/i,'checkbox-groups'],[/PopUp|popup_menu/i,'native-select'],[/Matrix\(|MatrixAnswer|matrix_cmp/i,'matrix-grid'],[/Vector\(|vector_cmp/i,'vector-syntax'],[/image\s*\(|insertGraph/i,'static-library-image'],[/HEADER_TEXT|<script/i,'header-scripts']])if(pattern.test(text))capabilities.add(cap);
 if(/\b(?:Real|Compute|Formula|String|List)\s*\(|ANS\s*\(|BEGIN_PGML/.test(text))capabilities.add('native-text');
 for(const match of text.matchAll(/(?:image|includePGproblem)\s*\(\s*["']([^"'\n]+)["']/g))dependencies.push({kind:'source-asset',name:match[1]});
 if(/(?:image|includePGproblem)\s*\(\s*[^"'\s]/.test(text))unresolved.push('DYNAMIC_ASSET_REFERENCE');
 if(/<script[^>]+src\s*=|https?:\/\//i.test(text))unresolved.push('EXTERNAL_OR_SCRIPT_REFERENCE_REVIEW');
 if(!fixture)unresolved.push('UNREVIEWED_PG_BEHAVIOR');
 if(/\b(?:Applet|essay_cmp|file_upload|LiveGraphics3D)\b/i.test(text))capabilities.add('unknown-interaction');
 const candidates=[...capabilities].sort(),unsupported=candidates.filter(c=>profile.capabilities[c]?.status!=='verified');
 const result={version:DETECTOR,fixtureId:fixture?.id??null,interaction:fixture?.interaction??'text',candidateCapabilities:candidates,dependencies,
 unresolved:[...new Set(unresolved)].sort(),unsupported,discoveryComplete:false,
 interpretation:'Candidate requirements only. Literal references do not prove installed dependency closure or widget support; independent requirements review is mandatory.'};
 return {...result,digest:digest(result)};
}
export async function detectCatalog(limit=500){
 if(!Number.isInteger(limit)||limit<1||limit>100000)throw Error('DETECTION_LIMIT_1_TO_100000');
 const entries=json(`SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(
 SELECT s.id source_version_id,s.path,s.sha256,i.blob_oid oid,c.commit_oid revision FROM catalog.import_entries i JOIN catalog.import_heads h ON h.run_id=i.run_id
 JOIN catalog.source_versions s ON s.id=i.source_version_id JOIN catalog.snapshots c ON c.id=s.snapshot_id
 JOIN catalog.repositories p ON p.id=h.repository_id WHERE p.registry_key='openwebwork-opl'
 AND NOT EXISTS(SELECT 1 FROM catalog.capability_manifests m WHERE m.source_version_id=s.id AND m.detector_version=${literal(DETECTOR)})
 ORDER BY s.path LIMIT ${limit})x;`);
 if(!entries.length)return {detected:0};
 const head=git(ROOT,['rev-parse','HEAD']).toString().trim();
 if(entries.some(e=>e.revision!==head))throw Error('DETECTOR_SOURCE_PIN_MISMATCH');
 let batch=[],detected=0,unsupported=0;const counts={};
 const commit=()=>{if(!batch.length)return;sql(`INSERT INTO catalog.capability_manifests(source_version_id,detector_version,digest,manifest)
 SELECT (x->>'source')::uuid,${literal(DETECTOR)},x->>'digest',x->'manifest' FROM jsonb_array_elements(${literal(batch)}::jsonb)x ON CONFLICT DO NOTHING;`);batch=[];};
 for await(const {entry,bytes}of blobs(ROOT,entries)){
  if(hash(bytes)!==entry.sha256)throw Error('DETECTOR_SOURCE_HASH_MISMATCH');
  const manifest=detect(bytes.toString('utf8'),entry);batch.push({source:entry.source_version_id,digest:manifest.digest,manifest});detected++;
  if(manifest.unsupported.length)unsupported++;for(const code of manifest.unresolved)counts[code]=(counts[code]??0)+1;
  if(batch.length===500)commit();
 }
 commit();return {detected,unsupported,unresolved:counts,detector:DETECTOR};
}
