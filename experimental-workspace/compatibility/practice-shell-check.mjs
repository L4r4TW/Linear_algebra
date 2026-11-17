import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {chromium} from 'playwright';
import {createApp} from '../application/server/http-app.mjs';
import {createExerciseSessions} from '../application/server/exercise-sessions.mjs';
import {createRendererClient} from '../application/server/renderer-client.mjs';
import {runtimeFingerprint} from '../application/server/catalog-compatibility.mjs';
import {allowIntentionalNavigation} from './navigation-consent.mjs';
const fixtures=JSON.parse(await readFile(new URL('./catalog.json',import.meta.url),'utf8')).exercises;
const active=JSON.parse(await readFile(new URL('../application/server/activation-batches.json',import.meta.url),'utf8')).batches.filter(b=>b.state==='active').flatMap(b=>b.exerciseIds);
const selected=fixtures.filter(f=>active.includes(f.id));
const exerciseLookup=id=>{const fixture=selected.find(f=>f.id===id);return fixture?{id,renderer:{sourceFilePath:fixture.rendererPath}}:undefined;};
const directory=await mkdtemp(join(tmpdir(),'practice-shell-')),renderer=process.env.RENDERER_URL??'http://renderer:3000';
const sessions=createExerciseSessions({directory,exerciseLookup,rendererClient:createRendererClient({baseUrl:renderer,exerciseLookup})});
const app=createApp({sessions,rendererBaseUrl:renderer,exerciseList:()=>selected.map(f=>({id:f.id,title:f.title,topicId:f.subject,topic:f.subject,description:'Operator practice-shell verification'}))});
app.listen(0,'127.0.0.1');await once(app,'listening');const backend='http://127.0.0.1:'+app.address().port;
const browser=await chromium.launch();const output=process.env.SHELL_OUTPUT??'/artifacts';await mkdir(output,{recursive:true});
const report={version:1,observedAt:new Date().toISOString(),scope:'Isolated operator shell acceptance, no production session volume or activation',runtimeFingerprint:runtimeFingerprint(),viewports:[]};
try{
 for(const viewport of [{width:1280,height:900},{width:360,height:800}]){
  const context=await browser.newContext({viewport});let errors=0;
  await context.route('http://localhost:3100/**',async route=>{const response=await route.fetch({url:route.request().url().replace('http://localhost:3100',backend)});await route.fulfill({response});});
  const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',()=>errors++);allowIntentionalNavigation(page);
  try{
   await page.goto('http://localhost:3100');await page.locator('.exercise-choice').filter({hasText:'Dot products and vector operations'}).click();
   await page.waitForFunction(()=>document.querySelector('#check-answer')&&!document.querySelector('#check-answer').disabled);
   const id=new URL(page.url()).searchParams.get('session');assert.ok(id);
   assert.match(await page.locator('#practice-breadcrumb').textContent(),/Mathematics/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:output+'/shell-'+viewport.width+'.png',fullPage:true});
   const bookmark=page.getByRole('button',{name:'Bookmark exercise',exact:true});await bookmark.click();assert.equal(await bookmark.getAttribute('aria-pressed'),'true');
   await page.reload();await page.waitForFunction(()=>!document.querySelector('#check-answer').disabled);assert.equal(new URL(page.url()).searchParams.get('session'),id);assert.equal(await bookmark.getAttribute('aria-pressed'),'true');
   const field=page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]');await field.fill('0');
   await page.getByRole('button',{name:'Check answer',exact:true}).click();await page.locator('#practice-result').waitFor();assert.equal(await field.inputValue(),'0');
   await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new Error('blocked storage');};});
   await bookmark.click();await page.waitForFunction(()=>document.querySelector('#bookmark-status').textContent.includes('could not be saved'));
   assert.equal(await field.inputValue(),'0');assert.equal(await page.locator('#check-answer').isDisabled(),false);assert.equal(errors,0);
   report.viewports.push({width:viewport.width,readableShell:true,localBookmarkRestore:true,blockedBookmarkPreservesAnswers:true,grading:true,sameSession:true,pageOverflow:false,pageErrors:errors});
  }finally{await context.unrouteAll({behavior:'ignoreErrors'});await context.close();}
 }
 report.complete=true;await writeFile(output+'/practice-shell-observations.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({complete:true,viewports:report.viewports.length}));
}finally{await browser.close();app.closeAllConnections();await new Promise(resolve=>app.close(resolve));await rm(directory,{recursive:true,force:true});}
