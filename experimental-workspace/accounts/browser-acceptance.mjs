import assert from 'node:assert/strict';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {randomBytes,randomUUID} from 'node:crypto';import {chromium} from 'playwright';
import {createAccountRuntime} from './runtime.mjs';import {createHome} from '../discovery/server.mjs';import {runtimeFingerprint} from '../application/server/catalog-compatibility.mjs';
const raw=JSON.parse(await readFile(new URL('../application/server/exercise-catalog.json',import.meta.url),'utf8')),batches=JSON.parse(await readFile(new URL('../application/server/activation-batches.json',import.meta.url),'utf8')),ids=new Set(batches.batches.filter(batch=>batch.state==='active').flatMap(batch=>batch.exerciseIds)),entries=raw.exercises.filter(entry=>ids.has(entry.id));
assert.equal(entries.length,6);
const lookup=id=>entries.find(entry=>entry.id===id),list=()=>entries.map(({id,title,topicId,topic,description})=>({id,title,topicId,topic,description}));
const runtime=await createAccountRuntime({exerciseLookup:lookup,exerciseList:list,rendererUrl:process.env.RENDERER_URL??'http://linear-algebra-experimental-renderer-1:3000',legacyDirectory:null});
await new Promise(resolve=>runtime.app.listen(0,'127.0.0.1',resolve));const backend='http://127.0.0.1:'+runtime.app.address().port;
const summaries=entries.map(entry=>({...entry,chapter:entry.topic,section:null,canPractice:true})),subjects=[...new Set(entries.map(entry=>entry.subject))].map(subject=>({subject,practice:entries.filter(entry=>entry.subject===subject).length}));
const home=createHome({practiceUrl:backend,catalog:{practice:async()=>summaries,overview:async()=>({practice:{available:true,count:6,subjects},library:{available:false,indexed:0,subjects:[]}}),topics:async()=>({topics:summaries}),search:async()=>({entries:summaries,nextCursor:null})}});
await new Promise(resolve=>home.listen(0,'127.0.0.1',resolve));const homeBackend='http://127.0.0.1:'+home.address().port,origin='http://localhost:3105';
const browser=await chromium.launch(),contexts=[],email='browser-'+randomBytes(12).toString('hex')+'@example.test',password=randomBytes(24).toString('base64url')+'Aa1!';
const report={version:1,observedAt:new Date().toISOString(),runtimeFingerprint:runtimeFingerprint(),scope:'Actual local Supabase/RLS, real private PG, actual gateway and account/player UI. Operator injection retains only the six pre-existing active fixtures. No original student volume or production approval.'};
async function context(){const context=await browser.newContext({viewport:{width:1280,height:950}});contexts.push(context);await context.route(origin+'/**',async route=>{const response=await route.fetch({url:route.request().url().replace(origin,homeBackend)});await route.fulfill({response});});return context;}
const first=await context(),page=await first.newPage();page.setDefaultTimeout(30000);page.on('dialog',dialog=>dialog.accept());
const ready=async p=>{await p.waitForFunction(()=>document.querySelector('#check-answer')&&!document.querySelector('#check-answer').disabled);await p.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]').first().waitFor();};
const field=p=>p.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]');
async function auth(p,signup){await p.goto(origin+'/account');await p.locator('#auth-form').waitFor();await p.locator('#email').fill(email);await p.locator('#password').fill(password);await p.getByRole('button',{name:signup?'Create account':'Sign in',exact:true}).click();await p.locator('#signed-in').waitFor({state:'visible'});}
try{
 await page.goto(origin+'/practice');
 const started=await page.evaluate(async()=>{const r=await fetch('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({exerciseId:'compat-calculus-numeric-01'})});return r.json();});
 assert.ok(started.session?.id);const id=started.session.id,url=origin+'/practice?session='+id;
 await page.goto(url);await ready(page);await field(page).fill('17');await page.waitForTimeout(600);
 await auth(page,true);await page.locator('#claim').click();await page.waitForFunction(()=>document.querySelector('#claim-status').textContent.includes('Transferred 1 sessions'));
 await page.goto(url);await ready(page);assert.equal(await field(page).inputValue(),'17');await page.waitForFunction(()=>document.querySelector('#account-draft-status').textContent.includes('saved to your account'));report.explicitGuestTransferRetainsDraft=true;
 const second=await context(),p2=await second.newPage();p2.setDefaultTimeout(30000);p2.on('dialog',dialog=>dialog.accept());await auth(p2,false);await p2.goto(origin+'/');
 await p2.locator('#continue-link').waitFor({state:'visible'});assert.ok((await p2.locator('#continue-link').getAttribute('href')).includes(id));await p2.locator('#continue-link').click();await ready(p2);await p2.waitForFunction(()=>document.querySelector('#account-draft-status').textContent.includes('restored'));assert.equal(await field(p2).inputValue(),'17');report.crossDeviceContinuation=true;report.crossDeviceDraftRestoration=true;
 await field(p2).fill('11');await p2.waitForFunction(()=>document.querySelector('#account-draft-status').textContent.includes('saved to your account'));
 await field(page).fill('22');await page.getByRole('button',{name:"Keep this tab's answers"}).waitFor();assert.equal(await field(page).inputValue(),'22');
 const remote=await p2.evaluate(async id=>(await(await fetch('/api/sessions/'+id+'/draft')).json()).draft,id);assert.equal(remote.entries.find(([name])=>name==='AnSwEr0001')[1],'11');
 await page.getByRole('button',{name:"Keep this tab's answers"}).click();await page.waitForFunction(()=>document.querySelector('#account-draft-status').textContent.includes('saved to your account'));report.conflictingTabsRequireChoice=true;
 await page.locator('#check-answer').click();await page.locator('#practice-result').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#submission-status').textContent.includes('checked and saved'));
 await page.waitForFunction(()=>document.querySelector('#account-draft-status').textContent.includes('saved to your account'));
 const graded=await page.evaluate(async id=>(await(await fetch('/api/sessions/'+id)).json()).submission,id);assert.equal(graded.number,1);assert.ok(typeof graded.score==='number');report.realPgAttemptSaved=true;
 await p2.reload();await ready(p2);assert.equal(await field(p2).inputValue(),'22');
 const restored=await p2.evaluate(async id=>(await(await fetch('/api/sessions/'+id)).json()).submission,id);assert.equal(restored.id,graded.id);report.gradeRestoresAcrossDevices=true;
 await page.locator('#bookmark-exercise').click();await page.waitForFunction(()=>document.querySelector('#bookmark-status').textContent.includes('your account'));
 await p2.goto(origin+'/progress');await p2.waitForFunction(()=>document.querySelector('#counts').textContent.includes('1 recorded checks'));assert.ok((await p2.locator('#bookmarks').textContent()).includes(lookup('compat-calculus-numeric-01').title));report.privateHistoryAndBookmarks=true;
 const created=await p2.evaluate(async()=>{const response=await fetch('/api/sessions/sets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selection:{},requestKey:crypto.randomUUID()})});return response.json();});assert.equal(created.set.total,6);
 await p2.reload();await p2.getByRole('button',{name:'Continue set',exact:true}).first().click();await ready(p2);assert.equal(new URL(p2.url()).searchParams.get('set'),created.set.id);report.accountPracticeSetsResume=true;
 const third=await context(),outsider=await third.newPage();await outsider.goto(origin+'/account');
 const status=await outsider.evaluate(async id=>(await fetch('/api/sessions/'+id)).status,id);assert.equal(status,404);report.foreignBrowserDenied=true;
 await p2.setViewportSize({width:390,height:850});await p2.goto(url);await ready(p2);assert.equal(await p2.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.ok((await p2.locator('#check-answer').boundingBox()).height>=44);
 await p2.locator('#exercise-title').focus();await p2.keyboard.press('Tab');assert.equal(await p2.locator('#bookmark-exercise').evaluate(el=>el===document.activeElement),true);report.mobileAndKeyboardSemantics=true;
 report.complete=true;await mkdir('/artifacts',{recursive:true});await writeFile('/artifacts/browser-observations.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({complete:true,privateDataDisclosed:false}));
}finally{for(const ctx of contexts){await ctx.unrouteAll({behavior:'ignoreErrors'});await ctx.close();}await browser.close();home.closeAllConnections();runtime.app.closeAllConnections();await Promise.all([new Promise(resolve=>home.close(resolve)),new Promise(resolve=>runtime.app.close(resolve))]);await runtime.db.close();}
