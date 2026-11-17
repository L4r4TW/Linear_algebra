import {parse} from 'parse5';
import {getAnswerContract} from '../application/server/answer-contract.mjs';
import assert from 'node:assert/strict';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {chromium} from 'playwright';import {solveStudentQuestion} from '../calculus/student-oracles.mjs';
const pilot=JSON.parse(await readFile(new URL('../calculus/local-pilot.json',import.meta.url),'utf8')),origin='http://localhost:3105',backend='http://linear-algebra-discovery-home-1:3005',browser=await chromium.launch();
const report={version:1,observedAt:new Date().toISOString(),scope:'Live local 3105 home/backend/catalog/private PG, random per-session seeds. Independent student-question answers; no human review or physical-device claim.',cases:[]};let phase='start',current;
try{
 for(const mobile of [false,true])for(const exercise of pilot.exercises){
 current={id:exercise.id,viewport:mobile?'mobile':'desktop'};phase='start';
 const context=await browser.newContext({viewport:{width:mobile?390:1280,height:960},isMobile:mobile,hasTouch:mobile});
 await context.route(origin+'/**',async route=>{try{const r=await route.fetch({url:route.request().url().replace(origin,backend)});await route.fulfill({response:r});}catch{await route.fulfill({status:503,json:{error:{code:'TEST_TRANSPORT_UNAVAILABLE'}}}).catch(()=>{});}});
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('dialog',dialog=>dialog.accept());await page.goto(origin+'/?q='+encodeURIComponent(exercise.title));
 const catalog=await page.evaluate(async()=> (await(await fetch('/api/exercises')).json()).exercises);assert.equal(catalog.length,16);assert.equal(catalog.filter(e=>e.reviewStatus==='tested-local-pilot').length,10);
 const card=page.locator('.exercise-card').filter({has:page.getByRole('heading',{name:exercise.title,exact:true})});await card.getByRole('button',{name:'Practice '+exercise.title,exact:true}).click();await page.waitForURL('**/practice?session=*');
 const ready=()=>page.waitForFunction(()=>document.querySelector('#check-answer')&&!document.querySelector('#check-answer').disabled&&!document.querySelector('#practice-controls').hidden&&!document.querySelector('#session-status').hidden);await ready();const sessionId=new URL(page.url()).searchParams.get('session'),frame=page.frameLocator('.exercise-frame');
 phase='solve';const html=await page.evaluate(async id=>(await(await fetch('/api/sessions/'+id)).json()).exercise.html,sessionId);const plain=n=>(n.nodeName==='#text'?n.value:'')+(n.childNodes??[]).map(plain).join(' ');const text=plain(parse(html)),values=solveStudentQuestion(exercise.solver,text).map(String),names=[...getAnswerContract(html).keys()],fields={count:()=>names.length,nth:i=>frame.locator('[name='+JSON.stringify(names[i])+']')};phase='field-count';assert.equal(await fields.count(),values.length);
 for(let i=0;i<values.length;i++)await fields.nth(i).fill(values[i]);
 phase='draft';await page.waitForTimeout(650);await page.reload();await ready();for(let i=0;i<values.length;i++)assert.equal(await fields.nth(i).inputValue(),values[i]);
 phase='grade';const responsePromise=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/answers'));await page.locator('#check-answer').focus();await page.keyboard.press('Enter');const response=await responsePromise;assert.equal(response.status(),200);assert.equal((await response.json()).submission.score,1);await ready();
 phase='restore';await page.reload();await ready();assert.equal(new URL(page.url()).searchParams.get('session'),sessionId);for(let i=0;i<values.length;i++)assert.equal(await fields.nth(i).inputValue(),values[i]);await page.locator('#pilot-note').waitFor({state:'visible'});
 if(exercise.solver===2){
 phase='report';await fields.nth(0).fill('unfinished draft');await page.waitForTimeout(650);await page.getByRole('button',{name:'Report a problem',exact:true}).click();await page.locator('#report-message').fill('Synthetic browser acceptance: display issue for operator testing.');
 await page.route('**/reports',route=>route.fulfill({status:503,json:{error:{code:'TEST_OUTAGE'}}}));
 await page.locator('#report-send').click();await page.waitForFunction(()=>document.querySelector('#report-status').textContent.includes('could not be saved'));assert.ok((await page.locator('#report-message').inputValue()).length>10);assert.equal(await fields.nth(0).inputValue(),'unfinished draft');
 await page.unroute('**/reports');await page.locator('#report-send').click();await page.waitForFunction(()=>document.querySelector('#report-status').textContent.includes('was saved'));assert.equal(await fields.nth(0).inputValue(),'unfinished draft');
 const foreign=await browser.newContext();const denied=await foreign.request.post(backend+'/api/sessions/'+sessionId+'/reports',{headers:{Origin:origin},data:{requestId:crypto.randomUUID(),category:'display',message:'Synthetic foreign report attempt.'}});assert.equal(denied.status(),404);await foreign.close();
 await page.reload();await ready();assert.equal(await fields.nth(0).inputValue(),'unfinished draft');report.reportingFailureRetryDraftAndOwnership=true;
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);report.cases.push({...current,liveDiscovery:true,randomSeedGrading:true,draftRefresh:true,checkedRestoration:true,keyboard:true,layout:true});await context.close();console.log(JSON.stringify({...current,passed:true}));
 }
 report.complete=report.cases.length===20&&report.reportingFailureRetryDraftAndOwnership===true;await mkdir('/artifacts',{recursive:true});await writeFile('/artifacts/live-pilot.json',JSON.stringify(report,null,2)+'\n');
}catch(error){console.error(JSON.stringify({complete:false,phase,current,error:error.name,questionShapeChanged:error.message==='QUESTION_SHAPE_CHANGED'}));process.exitCode=1;}finally{await browser.close();}
