import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {chromium} from 'playwright';
const origin='http://localhost:3105',backend='http://linear-algebra-discovery-home-1:3005',browser=await chromium.launch(),limit=Number(process.env.COLLECTION_SAMPLE??12);
const report={version:1,observedAt:new Date().toISOString(),scope:'Actual home/account/private PG; random seeds; bridge grading/drafts/ownership; no mathematical certification or physical device claim',cases:[]};let phase='catalog',current;
async function context(mobile=false){const c=await browser.newContext({viewport:{width:mobile?390:1280,height:950},isMobile:mobile,hasTouch:mobile});await c.route(origin+'/**',async route=>{try{const r=await route.fetch({url:route.request().url().replace(origin,backend)});await route.fulfill({response:r});}catch{await route.fulfill({status:503,json:{error:{code:'QA_TRANSPORT_UNAVAILABLE'}}}).catch(()=>{});}});return c;}
try{
 const catalog=await(await fetch(backend+'/api/exercises')).json();assert.ok(catalog.exercises.length>16);
 const entries=catalog.exercises.filter(e=>e.collectionId),seen=new Set(),sample=[];
 for(const e of entries)if(!seen.has(e.collectionId+':'+e.chapter)){sample.push(e);seen.add(e.collectionId+':'+e.chapter);}
 for(const e of entries)if(sample.length<limit&&!sample.some(s=>s.id===e.id))sample.push(e);
 if(process.env.COLLECTION_ALL==='true')sample.splice(0,sample.length,...entries);
 if(process.env.COLLECTION_EXERCISE)sample.splice(0,sample.length,...entries.filter(e=>e.id===process.env.COLLECTION_EXERCISE));
 assert.ok(sample.length);report.catalogCount=catalog.exercises.length;
 for(const e of sample)for(const mobile of [false,true]){
 current={id:e.id,collection:e.collectionId,viewport:mobile?'mobile':'desktop'};phase='selection';const ctx=await context(mobile),page=await ctx.newPage();page.setDefaultTimeout(30000);page.on('dialog',d=>d.accept());
 await page.goto(origin+'/?subject='+encodeURIComponent(e.subject)+'&q='+encodeURIComponent(e.title));const card=page.locator('.exercise-card').filter({has:page.getByRole('heading',{name:e.title,exact:true})});phase='start-button';await card.getByRole('button',{name:'Practice '+e.title,exact:true}).click();phase='session-navigation';await page.waitForURL('**/practice?session=*');
 const id=new URL(page.url()).searchParams.get('session'),ready=()=>page.waitForFunction(()=>document.querySelector('#check-answer')&&!document.querySelector('#check-answer').disabled&&!document.querySelector('#practice-controls').hidden&&!document.querySelector('#session-status').hidden);phase='frame-ready';await ready();const frame=page.frameLocator('.exercise-frame');
 phase='draft';const fields=frame.locator('input[name][type=text],input[name]:not([type]),textarea[name]');let drafted=false,name;
 if(await fields.count()){const field=fields.first();name=await field.getAttribute('name');await field.fill('0.125');await page.waitForFunction(id=>sessionStorage.getItem('practice-draft:v1:'+id)!==null,id);await page.reload();await ready();assert.equal(await frame.locator('[name='+JSON.stringify(name)+']').first().inputValue(),'0.125');drafted=true;}
 phase='grade';const pending=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/answers'));await page.locator('#check-answer').focus();await page.keyboard.press('Enter');const response=await pending;assert.equal(response.status(),200);const graded=await response.json();assert.ok(graded.submission?.id);await ready();
 phase='restore';await page.reload();await ready();assert.equal(new URL(page.url()).searchParams.get('session'),id);const restored=await page.evaluate(async id=>(await(await fetch('/api/sessions/'+id)).json()),id);assert.equal(restored.submission.id,graded.submission.id);assert.deepEqual(restored.submission.answers,graded.submission.answers);
 const foreign=await browser.newContext();assert.equal((await foreign.request.get(backend+'/api/sessions/'+id)).status(),404);await foreign.close();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 report.cases.push({...current,selected:true,draftVerified:drafted,grading:true,checkedRestoration:true,ownership:true,keyboard:true,narrowShell:true});await ctx.close();console.log(JSON.stringify({...current,passed:true}));
 }
 report.complete=true;await mkdir('/artifacts',{recursive:true});await writeFile('/artifacts/collection-browser.json',JSON.stringify(report,null,2)+'\n');
}catch(error){console.error(JSON.stringify({complete:false,current,phase,error:error.name}));process.exitCode=1;}finally{await browser.close();}
