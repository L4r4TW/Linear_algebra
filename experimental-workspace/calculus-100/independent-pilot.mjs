import assert from 'node:assert/strict';import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import {parse} from 'parse5';import {chromium} from 'playwright';
import {createApp} from '../application/server/http-app.mjs';import {createRendererClient} from '../application/server/renderer-client.mjs';import {createExerciseSessions} from '../application/server/exercise-sessions.mjs';import {getAnswerContract} from '../application/server/answer-contract.mjs';import {allowIntentionalNavigation} from '../compatibility/navigation-consent.mjs';import {solveStudentQuestion} from './student-oracles.mjs';
const pilot=JSON.parse(await readFile('/qa/calculus/local-pilot.json','utf8')),directory=await mkdtemp(join(tmpdir(),'independent-pilot-')),renderer='http://linear-algebra-calculus-renderer-1:3000';
const lookup=id=>{const row=pilot.exercises.find(e=>e.id===id);return row?{...row,renderer:{sourceFilePath:row.path.replace(/^OpenProblemLibrary\//,'Library/')}}:undefined;};
const client=createRendererClient({baseUrl:renderer,exerciseLookup:lookup});let seed=1234;
const sessions=createExerciseSessions({directory,rendererClient:client,exerciseLookup:lookup,seedGenerator:()=>seed});
const app=createApp({sessions,rendererBaseUrl:renderer,exerciseList:()=>pilot.exercises.map(e=>({id:e.id,title:e.title,topicId:'review',topic:'Independent review',description:'Private local pilot review'}))});app.listen(0,'127.0.0.1');await new Promise(r=>app.once('listening',r));const base='http://127.0.0.1:'+app.address().port,browser=await chromium.launch();
const text=n=>(n.nodeName==='#text'?n.value:'')+(n.childNodes??[]).map(text).join(' ');
const report={version:1,scope:'Independent source mathematics plus student-question oracles; no instructor maps; actual isolated PG/player; emulated mobile, no physical-device or screen-reader listening claim',observedAt:new Date().toISOString(),cases:[]};let phase='start',current;
try{
 for(const exercise of pilot.exercises)for(seed of [1234,4321])for(const mobile of [false,true]){
  current={id:exercise.id,seed,viewport:mobile?'mobile':'desktop'};phase='source-binding';assert.equal(createHash('sha256').update(await readFile('/opl/webwork-open-problem-library/'+exercise.path)).digest('hex'),exercise.sha256);
  const context=await browser.newContext({viewport:{width:mobile?390:1100,height:1000},isMobile:mobile,hasTouch:mobile});allowIntentionalNavigation(context);
  await context.route('http://localhost:3100/**',async route=>{try{const r=await route.fetch({url:route.request().url().replace('http://localhost:3100',base)});await route.fulfill({response:r});}catch{await route.fulfill({status:503,body:'Review transport failed'}).catch(()=>{});}});
  const page=await context.newPage();await page.goto('http://localhost:3100');
  const id=await page.evaluate(async exerciseId=>{const r=await fetch('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({exerciseId})});if(r.status!==201)throw Error('START_FAILED');return(await r.json()).session.id;},exercise.id);
  await page.goto('http://localhost:3100/?session='+id);const ready=()=>page.waitForFunction(()=>{const b=document.querySelector('#check-answer');return b&&!b.disabled&&!b.closest('[hidden]');});await ready();
  phase='independent-solution';const record=JSON.parse(await readFile(join(directory,id+'.json'),'utf8')),restored=await client.restoreSession({exerciseId:exercise.id,seed,sessionToken:record.rendererSessionToken});
  const values=solveStudentQuestion(exercise.solver,text(parse(restored.html))).map(String),names=[...getAnswerContract(restored.html).keys()];assert.equal(values.length,names.length);
  const frame=page.frames().find(f=>f.parentFrame());for(let i=0;i<names.length;i++){const field=frame.locator('[name="'+names[i]+'"]');assert.equal(await field.count(),1);assert.ok(await field.isVisible());assert.ok(await field.evaluate(e=>!!e.getAttribute('aria-label')||!!e.labels?.length));await field.fill(values[i]);}
  phase='grade';const pending=page.waitForResponse(r=>r.request().method()==='POST'&&/\/answers$/.test(new URL(r.url()).pathname));await page.locator('#check-answer').focus();await page.keyboard.press('Enter');const response=await pending;assert.equal(response.status(),200);const result=await response.json();assert.equal(result.submission.score,1);await ready();
  phase='restore';await page.reload();await ready();const restoredFrame=page.frames().find(f=>f.parentFrame());for(let i=0;i<names.length;i++)assert.equal(await restoredFrame.locator('[name="'+names[i]+'"]').inputValue(),values[i]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  report.cases.push({...current,sourceVerified:true,independentStudentSolutionAccepted:true,fieldCount:names.length,nativeControlSemantics:true,keyboardSubmission:true,sameSessionRestoration:true,narrowShell:true});
  await context.close();console.log(JSON.stringify({...current,passed:true}));
 }
 report.complete=report.cases.length===40;await mkdir('/artifacts',{recursive:true});await writeFile('/artifacts/independent-pilot.json',JSON.stringify(report,null,2)+'\n');
}catch(error){console.error(JSON.stringify({complete:false,phase,current,error:error?.name??'Error'}));process.exitCode=1;}
finally{await browser.close();app.closeAllConnections();await new Promise(r=>app.close(r));await rm(directory,{recursive:true,force:true});}
