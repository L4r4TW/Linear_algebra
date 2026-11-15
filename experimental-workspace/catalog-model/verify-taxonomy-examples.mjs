// Private design checker: reads pinned source metadata, never PG execution or student state.
import assert from 'node:assert/strict';
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const {fixture,plan,playableIds}=globalThis.taxonomyDesignInput;
const root='/usr/app/webwork-open-problem-library';
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(fixture.state,'design-only-not-applied');
assert.equal(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),fixture.sourceRevision);
const vocabularies={};
for(const t of fixture.sourceTaxonomies){
 const bytes=await readFile(root+'/'+t.path);assert.equal(sha(bytes),t.sha256);
 let subject=null,chapter=null;const triples=new Set();
 for(const line of bytes.toString('utf8').split(/\r?\n/)){if(!line.trim()||line.trim().startsWith('#'))continue;const depth=line.match(/^\t*/)[0].length,label=line.trim();if(depth===0){subject=label;chapter=null;}else if(depth===1){assert.ok(subject);chapter=label;}else if(depth===2){assert.ok(subject&&chapter);triples.add(JSON.stringify([subject,chapter,label]));}else assert.fail('Unexpected source taxonomy indentation');}
 vocabularies[t.key]=triples;
}
const fields=['DBsubject','DBchapter','DBsection'];
const clean=v=>{let value=v.trim();if((value.startsWith("'")&&value.endsWith("'"))||(value.startsWith('"')&&value.endsWith('"')))value=value.slice(1,-1).trim();return value;};
function classify(text){
 const raw=[],values=Object.fromEntries(fields.map(f=>[f,[]]));let malformed=false;
 text.split(/\r?\n/).forEach((line,i)=>{if(!/^\s*#+\s*DB(?:subject|chapter|section)\b/i.test(line))return;const match=line.match(/^\s*#+\s*(DBsubject|DBchapter|DBsection)\s*\((.*)\)\s*$/i);if(!match){raw.push({line:i+1,text:line,recognized:false});malformed=true;return;}const field=fields.find(f=>f.toLowerCase()===match[1].toLowerCase());values[field].push(clean(match[2]));raw.push({line:i+1,text:line,recognized:true,field,argument:match[2]});});
 const tuple=fields.map(f=>values[f][0]??null),populated=tuple.filter(v=>v&&!/^(?:unknown|unspecified|none|n\/a|tbd|\?+)$/i.test(v)).length;
 const status=malformed?'malformed':fields.some(f=>values[f].length>1)?'conflicting':populated===0?'missing':populated<3?'partial':vocabularies['opl-taxonomy'].has(JSON.stringify(tuple))?'matched':'unmapped';
 return {status,raw,tuple,matchesAlternative:populated===3&&vocabularies['opl-taxonomy2'].has(JSON.stringify(tuple))};
}
const nodes=new Map(),siblingSlugs=new Set(),siblingPositions=new Set();
for(const n of fixture.nodes){assert.equal(n.internalNodeId,null);assert.ok(!nodes.has(n.key));assert.match(n.slug,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);assert.ok(n.label.trim());assert.equal(n.locale,fixture.locale);assert.ok(Number.isSafeInteger(n.position)&&n.position>0);const namespace=JSON.stringify([n.parentKey,n.locale]),slug=namespace+':'+n.slug,position=namespace+':'+n.position;assert.ok(!siblingSlugs.has(slug));assert.ok(!siblingPositions.has(position));siblingSlugs.add(slug);siblingPositions.add(position);nodes.set(n.key,n);}
for(const n of nodes.values()){assert.ok(['subject','chapter','section'].includes(n.kind));if(n.kind==='subject')assert.equal(n.parentKey,null);else assert.equal(nodes.get(n.parentKey)?.kind,n.kind==='chapter'?'subject':'chapter');}
const assignments=new Map();
for(const a of fixture.exerciseAssignments){assert.ok(!assignments.has(a.legacyId));assert.ok(a.sectionKeys.length&&new Set(a.sectionKeys).size===a.sectionKeys.length);assert.ok(a.sectionKeys.includes(a.primarySectionKey));assert.equal(a.provenance,'curated-design-example-not-published');for(const key of a.sectionKeys)assert.equal(nodes.get(key)?.kind,'section');assignments.set(a.legacyId,a);}
assert.deepEqual([...assignments.keys()].sort(),plan.entries.map(e=>e.legacyId).sort());
for(const id of playableIds)assert.ok(assignments.has(id));
const rows=[];
for(const e of plan.entries){
 const components=e.source.path.split('/');assert.equal(components[0],'OpenProblemLibrary');let location=root;for(const part of components){assert.ok(part&&part!=='.'&&part!=='..'&&!part.includes('\\'));location+='/'+part;assert.ok(!(await lstat(location)).isSymbolicLink());}
 const bytes=await readFile(location);assert.equal(sha(bytes),e.source.sha256);assert.equal(e.source.revision,fixture.sourceRevision);
 const classification=classify(bytes.toString('utf8'));const a=assignments.get(e.legacyId);
 rows.push({legacyId:e.legacyId,source:e.source,classification,curatedSections:a.sectionKeys,primarySection:a.primarySectionKey,playableAtObservation:playableIds.includes(e.legacyId)});
}
const extra=[];
for(const e of fixture.supplementalSourceExamples){assert.equal(e.scope,'source-only-not-indexed-or-enabled');assert.equal(nodes.get(e.sectionKey)?.kind,'section');assert.match(e.sourcePath,/^OpenProblemLibrary\/[A-Za-z0-9_./-]+\.pg$/);assert.ok(!e.sourcePath.split('/').includes('..'));const bytes=execFileSync('git',['-C',root,'show',fixture.sourceRevision+':'+e.sourcePath]);const classification=classify(bytes.toString('utf8'));assert.equal(classification.status,'matched');extra.push({key:e.key,sourcePath:e.sourcePath,sha256:sha(bytes),classification,curatedSection:e.sectionKey,scope:e.scope});}
for(const c of fixture.classificationCases)assert.equal(classify(c.lines.join('\n')).status,c.expected,c.name);
const subjectIds=new Map([...nodes.values()].filter(n=>n.kind==='subject').map(n=>[n.key,new Set()]));
for(const id of playableIds)for(const sectionKey of assignments.get(id).sectionKeys){const chapter=nodes.get(nodes.get(sectionKey).parentKey),subject=chapter.parentKey;subjectIds.get(subject).add(id);}
const uniquePlayable=new Set([...subjectIds.values()].flatMap(set=>[...set]));assert.equal(uniquePlayable.size,playableIds.length);
assert.equal(subjectIds.get('linear-algebra').has('dot-product-01'),true);assert.equal(subjectIds.get('geometry').has('dot-product-01'),true);
assert.equal(rows.find(r=>r.legacyId==='dot-product-01').classification.tuple[0],'Geometry');
assert.equal(rows.find(r=>r.legacyId==='compat-algebra-graphtool-01').classification.status,'missing');
assert.equal(subjectIds.get('differential-equations').size,0);
const report={version:1,observedAt:new Date().toISOString(),kind:'taxonomy-design-observations',state:'design-only-not-applied',sourceRevision:fixture.sourceRevision,releaseKey:fixture.releaseKey,fixtureDecodedJsonSha256:sha(Buffer.from(JSON.stringify(fixture))),fixtureFingerprintMethod:'SHA-256 of JSON.stringify(fixture) after runner decoding; not raw file bytes.',classifierVersion:'line-comment-demo-v1',sourceTaxonomies:fixture.sourceTaxonomies,exampleNodeCount:nodes.size,subjectCount:subjectIds.size,existingCatalogExamples:rows,supplementalSourceExamples:extra,classificationCases:fixture.classificationCases.map(c=>({name:c.name,status:c.expected,passed:true})),countExamples:{playableDistinct:uniquePlayable.size,subjectMembershipSum:[...subjectIds.values()].reduce((n,set)=>n+set.size,0),bySubject:[...subjectIds].map(([key,ids])=>({key,playableDistinct:ids.size})),note:'Distinct identities within each subtree, not a sum of section/subject counts. Source-only supplemental example is never counted as playable.'},complete:true,limits:['No SQL, account/session changes, activation or UI integration.','The lexical classifier and fixture checks demonstrate the design; they are not a full PG metadata importer or deployed constraints.','Live playable IDs were read from the current workspace eligibility gate, not inferred from taxonomy.']};
await writeFile('/tmp/taxonomy-design-observations.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({result:'PASS',nodes:nodes.size,subjects:subjectIds.size,catalogExamples:rows.length,sourceOnlyExamples:extra.length,classificationCases:fixture.classificationCases.length,distinctPlayable:uniquePlayable.size,subjectMembershipSum:report.countExamples.subjectMembershipSum}));
