// Isolated preactivation acceptance; candidate admission is synthetic, never published.
import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import {chromium} from 'playwright';
import {technicalState} from './pipeline-contract.mjs';import {projectPublished,publicPublished} from '../accounts/published-catalog.mjs';import {createCatalog} from '../discovery/catalog.mjs';import {createHome} from '../discovery/server.mjs';import {runtimeFingerprint} from '../application/server/catalog-compatibility.mjs';
const read=async name=>JSON.parse(await readFile(new URL(name,import.meta.url),'utf8'));
const [status,pack,context,pool]=await Promise.all(['technical-status.json','review-pack.json','context.json','candidates.json'].map(read));
assert.equal(status.complete,true);assert.equal(pack.technicalSelected,100);assert.equal(pack.contextId,context.id);assert.equal(status.contextId,context.id);assert.equal(runtimeFingerprint(),context.runtimeDigest);
assert.equal(context.certified,true);assert.equal(context.attestation.pgTrackedClean,true);assert.ok(pack.waves.every(w=>!w.ready));assert.equal(pack.independentReviewed,0);
const candidates=new Map(pool.candidates.map(c=>[c.source_version_id,c])),jobs=new Map(status.jobs.map(j=>[j.source_version_id,j]));
const entries=pack.entries.map(entry=>{
 const job=jobs.get(entry.sourceVersionId),source=candidates.get(entry.sourceVersionId);
 assert.equal(job.current,true);assert.equal(technicalState(job.result.cases),'passed');
 return publicPublished(projectPublished({...source,context_id:context.id},{context,sourceRevision:pool.sourceRevision}));
});
assert.equal(new Set(entries.map(e=>e.id)).size,100);
for(const entry of entries)for(const key of ['source','renderer','seed','sessionToken','sourceFilePath'])assert.ok(!Object.hasOwn(entry,key));
let upstreamWrites=0;
const catalog=createCatalog({fetcher:async()=>Response.json({exercises:entries}),query:async sql=>sql.includes('opl_counts')?{indexed:77134,practiceReady:0,unclassified:38394}:[{subject:'Calculus - single variable',indexed:11457}]});
const home=createHome({catalog,fetcher:async(_url,options)=>{if(options.method==='POST')upstreamWrites++;return Response.json({account:{authenticated:false}});}});
await new Promise(resolve=>home.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+home.address().port,browser=await chromium.launch();
let phase='start';
try{
 const browserContext=await browser.newContext({viewport:{width:1100,height:900}}),page=await browserContext.newPage();let pageErrors=0;page.on('pageerror',()=>pageErrors++);
 await browserContext.route('http://localhost:3105/**',async route=>{try{const r=await route.fetch({url:route.request().url().replace('http://localhost:3105',base)});await route.fulfill({response:r});}catch{await route.fulfill({status:503,body:'Test transport failed'}).catch(()=>{});}});
 const settled=()=>page.waitForFunction(()=>document.querySelector('#results')?.getAttribute('aria-busy')==='false');
 await page.goto('http://localhost:3105');await settled();await page.locator('#subjects .subject-card').first().waitFor();
 assert.match(await page.locator('#coverage').textContent(),/100 available to try/);
 phase='pagination';const seen=new Set();let pages=0;
 do{
  await settled();const result=await page.evaluate(async()=>await(await fetch('/api/discovery/search'+location.search)).json());pages++;
  assert.equal(await page.locator('.exercise-card').count(),result.entries.length);assert.ok(result.entries.length<=12);
  for(const row of result.entries){assert.ok(!seen.has(row.id));seen.add(row.id);}
  if(!result.nextCursor)break;
  await page.locator('#next').click();
 }while(pages<10);
 assert.equal(seen.size,100);assert.equal(pages,9);
 phase='filter-and-restoration';const sample=entries.find(e=>e.section),params=new URLSearchParams({subject:sample.subject,chapter:sample.chapter,section:sample.section});
 await page.goto('http://localhost:3105/?'+params);await settled();assert.ok(await page.locator('.exercise-card').count());const url=page.url();await page.reload();await settled();assert.equal(page.url(),url);
 phase='mobile';await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.keyboard.press('Tab');assert.notEqual(await page.evaluate(()=>document.activeElement.tagName),'BODY');
 await page.goto('http://localhost:3105/browse?'+params);await page.locator('[aria-pressed=true]').first().waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 assert.equal(pageErrors,0);assert.equal(upstreamWrites,0);
 const sourceHashes=[];for(const file of ['preactivation.mjs','technical-status.json','review-pack.json','../accounts/published-catalog.mjs','../discovery/catalog.mjs','../discovery/server.mjs'])sourceHashes.push({file,sha256:createHash('sha256').update(await readFile(new URL(file,import.meta.url))).digest('hex')});
 await mkdir('/artifacts',{recursive:true});await writeFile('/artifacts/preactivation.json',JSON.stringify({version:1,observedAt:new Date().toISOString(),complete:true,scope:'Isolated discovery using actual candidate metadata and synthetic backend admission; not live activation or independent mathematical review.',distinctSources:100,passingTechnicalCases:400,sourceProjection:100,pages,sectionFilter:true,urlRestoration:true,mobile390:true,keyboard:true,pageErrors,upstreamWrites,independentReviewed:0,studentActivation:false,contextId:context.id,sourceHashes},null,2)+'\n');console.log('PREACTIVATION_100_SOURCE_ACCEPTANCE_PASSED');
}catch(error){console.error(JSON.stringify({complete:false,phase,error:error?.name??'Error'}));process.exitCode=1;}
finally{await browser.close();home.closeAllConnections();await new Promise(resolve=>home.close(resolve));}
