// Operator publisher writes reviewable files, never changes the application in place.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const app=new URL(existsSync(new URL('../workspace/',import.meta.url))?'../workspace/':'../application/',import.meta.url);
const {runtimeFingerprint,assessCatalogEntry,initialCompatibility}=await import(new URL('server/catalog-compatibility.mjs',app));
const read=url=>JSON.parse(readFileSync(url,'utf8'));
const fixtures=read(new URL('./catalog.json',import.meta.url));
const profile=read(new URL('server/compatibility-profile.json',app));
const batches=read(new URL('server/activation-batches.json',app));
const reportPath=process.argv[2],output=process.argv[3];
if(!reportPath||!output)throw new Error('Usage: node compatibility/build-catalog.mjs REPORT.json OUTPUT_DIRECTORY');
const report=read(resolve(reportPath)),fingerprint=runtimeFingerprint();
if(report.fixtureCatalogFingerprint!==createHash('sha256').update(readFileSync(new URL('./catalog.json',import.meta.url))).digest('hex')||!report.complete||report.partial||report.runtimeFingerprint!==fingerprint||report.profileVersion!==profile.version||report.rendererRevision!==profile.rendererRevision||report.sourceRevision!==profile.sourceRevision)throw new Error('A complete report for the current runtime and pinned revisions is required.');
const evidence={version:1,complete:true,observedAt:report.observedAt,profileVersion:report.profileVersion,runtimeFingerprint:fingerprint,sourceRevision:report.sourceRevision,rendererRevision:report.rendererRevision,entries:{}};
const topics={
 'dot-product-01':['dot-product','Dot product','Practice dot products and scalar multiplication using three-dimensional vectors.'],
 'compat-calculus-numeric-01':['derivatives','Derivatives','Evaluate a derivative at a given point.'],
 'compat-calculus-formula-01':['derivatives','Derivatives','Practice differentiating a quotient.'],
 'compat-calculus-graph-01':['derivative-graphs','Derivatives from graphs','Read a graph and estimate a derivative.'],
 'compat-statistics-radio-01':['statistics','Statistics','Choose answers to statistics questions.'],
 'compat-algebra-checkbox-01':['algebra','Algebra','Combine calculations with multiple selections.']
};
const exercises=fixtures.exercises.map(f=>{
 const rows=report.exercises.filter(c=>c.id===f.id);
 evidence.entries[f.id]={source:{revision:fixtures.sourceRevision,path:f.source.path,sha256:f.source.sha256},rendererPath:f.rendererPath,requiredCapabilities:f.requiredCapabilities,cases:rows.map(c=>({verificationSeed:c.verificationSeed,viewport:c.viewport,sourceVerified:c.sourceVerified,passed:c.passed,phase:c.phase,checks:c.checks,correctScore:c.correct?.score,clearedScore:c.cleared?.score,limitations:c.limitations??[],...(c.error?{error:c.error}:{}),...(c.capabilityFailures?{capabilityFailures:c.capabilityFailures}:{})}))};
 const [topicId,topic,description]=topics[f.id]??[f.subject.toLowerCase().replace(/[^a-z0-9]+/g,'-'),f.subject,f.title];
 const entry={id:f.id,title:f.title,subject:f.subject,topicId,topic,description,renderer:{sourceFilePath:f.rendererPath},source:{...f.source,repository:fixtures.sourceRepository,revision:fixtures.sourceRevision,authors:f.authors,institution:f.institution,licenseEvidence:fixtures.licenseEvidence},verification:{seed:profile.seeds[0],seeds:profile.seeds},...initialCompatibility(f.requiredCapabilities)};
 entry.compatibility.status=assessCatalogEntry(entry,{profile,evidence,batches:batches.batches,fingerprint}).status;
 const batch=batches.batches.find(b=>b.state==='active'&&b.profileVersion===profile.version&&b.exerciseIds.includes(f.id));
 if(batch){if(entry.compatibility.status!=='verified')throw new Error('Batch requests unverified exercise: '+f.id);entry.activation={state:'enabled',batchId:batch.id};}
 return entry;
});
if(report.exercises.some(row=>!exercises.some(f=>f.id===row.id)))throw new Error('Unknown source identity in report.');
const assessments=exercises.map(entry=>({id:entry.id,...assessCatalogEntry(entry,{profile,evidence,batches:batches.batches,fingerprint})}));
if(assessments.some(a=>exercises.find(e=>e.id===a.id).activation.state==='enabled'&&!a.enabled))throw new Error('Requested activation failed policy.');
mkdirSync(output,{recursive:true});
for(const [name,value] of Object.entries({'exercise-catalog.json':{version:2,exercises},'catalog-compatibility-evidence.json':evidence,'catalog-eligibility.json':{profileVersion:profile.version,observedAt:report.observedAt,runtimeFingerprint:fingerprint,exercises:assessments}}))writeFileSync(join(output,name),JSON.stringify(value,null,2)+'\n');
writeFileSync(join(output,'CATALOG_STATUS.md'),['# Catalog eligibility','',`Observed: ${report.observedAt}. Profile: ${profile.version}. Localhost experiment only.`,'','| Exercise | Compatibility | Enabled | Recorded reasons |','| --- | --- | --- | --- |',...assessments.map(a=>`| ${a.id} | ${a.status} | ${a.enabled?'yes':'no'} | ${[...new Set(a.issues.map(i=>i.code))].join(', ')||'All required checks passed'} |`),'','Seed/viewport failures remain in catalog-compatibility-evidence.json. Future entries default to unverified and disabled.',''].join('\n'));
console.log(JSON.stringify({indexed:exercises.length,enabled:assessments.filter(a=>a.enabled).map(a=>a.id),output}));