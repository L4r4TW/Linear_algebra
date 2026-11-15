import {projectAuthoredHints} from '../application/server/authored-hints.mjs';
// Real student-mode hints. Only booleans, fixture IDs and verification seeds leave operator memory.
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import {once} from 'node:events';import {parse,serializeOuter} from 'parse5';import {chromium} from 'playwright';
import {createApp} from '../application/server/http-app.mjs';import {createExerciseSessions} from '../application/server/exercise-sessions.mjs';import {createRendererClient} from '../application/server/renderer-client.mjs';import {feedbackText} from '../application/server/feedback-content.mjs';import {runtimeFingerprint} from '../application/server/catalog-compatibility.mjs';
const fixtures=JSON.parse(await readFile(new URL('./hint-fixtures.json',import.meta.url),'utf8')),origin='http://localhost:3100',renderer='http://renderer:3000',output=process.env.COMPATIBILITY_OUTPUT??'/artifacts';
const directory=await mkdtemp(join(tmpdir(),'authored-hint-audit-')),nativeFetch=globalThis.fetch;let seed=1234,active,raw,rendererCalls=0;
const check=(ok,code)=>{if(!ok)throw new Error('QA_HINT_'+code);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
globalThis.fetch=async(url,options)=>{
 if(String(url)!==renderer+'/render-api')return nativeFetch(url,options);
 const fields=new URLSearchParams(options.body);
 // Operator-only initial request: the renderer locks this policy into problemJWT. No student override exists.
 if(active?.policy==='upstream-disabled'&&fields.has('sourceFilePath'))fields.set('showHints','0');
 rendererCalls++;const response=await nativeFetch(url,{...options,body:fields});const data=await response.clone().json();let messages=[],solutions=0;
 function visit(n){const classes=(n.attrs?.find(a=>a.name==='class')?.value??'').split(/\s+/);if(classes.includes('solution'))solutions++;if(classes.includes('hint')){function body(c){if(c.attrs?.some(a=>a.name==='class'&&a.value.split(/\s+/).includes('accordion-body')))messages.push(feedbackText(serializeOuter(c)));for(const x of c.childNodes??[])body(x);}body(n);return;}for(const x of n.childNodes??[])visit(x);}
 if(data.renderedHTML)visit(parse(data.renderedHTML));raw={exists:[1,'1',true].includes(data.flags?.hintExists),solutionAuthored:[1,'1',true].includes(data.flags?.solutionExists),solutions,message:messages.join('\n\n')};return response;
};
const lookup=id=>{const f=fixtures.exercises.find(f=>f.id===id);return f?{id,renderer:{sourceFilePath:f.rendererPath}}:undefined;};
const sessions=createExerciseSessions({directory,exerciseLookup:lookup,seedGenerator:()=>seed,rendererClient:createRendererClient({baseUrl:renderer,exerciseLookup:lookup})});const app=createApp({sessions,rendererBaseUrl:renderer,origin,exerciseList:()=>fixtures.exercises.map(f=>({id:f.id,title:f.title,topicId:'hints',topic:'Hints',description:'Private operator fixture'}))});app.listen(0,'127.0.0.1');await once(app,'listening');const backend='http://127.0.0.1:'+app.address().port;
const report={schemaVersion:1,observedAt:new Date().toISOString(),runtimeFingerprint:runtimeFingerprint(),sourceRevision:fixtures.sourceRevision,rendererRevision:fixtures.rendererRevision,pgRevision:fixtures.pgRevision,scope:'12 source-verified real-PG student-mode hint cases: two seeds and desktop/mobile. No instructor requests, solution content, tokens, entered pairs or raw messages are serialized.',cases:[]};
const browser=await chromium.launch(),ready=p=>p.waitForFunction(()=>{const b=document.querySelector('#check-answer');return b&&!b.disabled&&!b.closest('[hidden]');}),frame=p=>p.frames().find(f=>f.parentFrame());
const collect=p=>p.evaluate(async()=> (await(await import('/assets/picker.js')).collectCurrentAnswers()).answers.entries);
async function context(viewport){const c=await browser.newContext({viewport:{width:viewport==='mobile'?360:1100,height:950},isMobile:viewport==='mobile',hasTouch:viewport==='mobile'});await c.route(origin+'/**',async route=>{const response=await route.fetch({url:route.request().url().replace(origin,backend)});await route.fulfill({response});});return c;}
try{
 for(const fixture of fixtures.exercises){const bytes=await readFile('/opl/webwork-open-problem-library/'+fixture.source.path);check(createHash('sha256').update(bytes).digest('hex')===fixture.source.sha256,'SOURCE_HASH');active=fixture;
 for(const s of fixtures.verificationSeeds){seed=s;for(const viewport of ['desktop','mobile']){
  const row={id:fixture.id,verificationSeed:s,viewport,sourceVerified:true};report.cases.push(row);const c=await context(viewport);
  try{
   row.phase='load';const p=await c.newPage();let starts=0,grades=0;p.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/sessions'))starts++;if(r.method()==='POST'&&r.url().endsWith('/answers'))grades++;});await p.goto(origin);await p.locator('.exercise-choice[data-exercise-id="'+fixture.id+'"]').click();await ready(p);
   row.phase='availability';const id=new URL(p.url()).searchParams.get('session'),data=await p.evaluate(async id=>(await fetch('/api/sessions/'+id)).json(),id),initial=raw,recordPath=join(directory,id+'.json');check(await frame(p).locator('.hint,.solution').count()===0,'NATIVE_HINT_SOLUTION_EXCLUDED');
   check(initial.solutions===0,'UPSTREAM_SOLUTION_WITHHELD');row.authoredExists=initial.exists;row.available=data.exercise.hint.available;
   if(fixture.expected==='available'){
    check(initial.exists&&initial.solutionAuthored&&initial.message&&data.exercise.hint.message===initial.message,'AUTHOR_MESSAGE_ONLY');
    row.phase='draft';const f=frame(p);await f.locator('input[type=checkbox]').first().check();const draft=await collect(p),before=await readFile(recordPath,'utf8'),calls=rendererCalls;
    row.phase='hint-view';await p.locator('#view-hint').focus();await p.keyboard.press('Enter');await p.locator('#hint-content').waitFor({state:'visible'});check(await p.locator('#hint-message').textContent()===initial.message,'HINT_TEXT');check(await p.locator('#view-hint').getAttribute('aria-expanded')==='true','EXPANSION_SEMANTICS');
    check(frame(p)===f&&same(await collect(p),draft)&&await readFile(recordPath,'utf8')===before&&rendererCalls===calls&&grades===0&&starts===1,'READ_ONLY_DISCLOSURE');
    check(await p.locator('#view-hint').evaluate(n=>n.getBoundingClientRect().height>=44),'TOUCH_TARGET');check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'NARROW_LAYOUT');
    await p.locator('#view-hint').click();check(await p.locator('#hint-content').isHidden(),'HIDE');row.phase='grade';await p.locator('#check-answer').click();await ready(p);await f.locator('input[type=checkbox]').nth(1).check();const edited=await collect(p),graded=await readFile(recordPath,'utf8');await p.locator('#view-hint').click();check(same(await collect(p),edited)&&await readFile(recordPath,'utf8')===graded,'CHECKED_DRAFT_PRESERVED');
    row.phase='restore';await p.reload();await ready(p);check(new URL(p.url()).searchParams.get('session')===id&&same(await collect(p),edited)&&grades===1&&starts===1,'DRAFT_REFRESH');check(await p.locator('#hint-content').isHidden(),'CLOSED_ON_REFRESH');await p.locator('#view-hint').click();check(await p.locator('#hint-message').textContent()===initial.message,'RESTORED_HINT');
    row.originalAuthoredMessageVerified=true;row.keyboardAndTouchVerified=true;row.noRendererRequestOrTokenChangeOnDisclosure=true;row.liveFrameAndDraftPreserved=true;row.sameSessionAndDraftAfterRefresh=true;row.noAdditionalGrade=true;
   }else{
    check(data.exercise.hint.available===false&&!Object.hasOwn(data.exercise.hint,'message')&&!initial.message,'NO_DISCLOSURE');check(await p.locator('#view-hint').isHidden(),'NO_UNAVAILABLE_ACTION');check(initial.exists===(fixture.expected==='unavailable'),'EXISTS_IS_NOT_AVAILABILITY');row.noUnavailableAction=true;
   }
   row.phase='ownership';const other=await context(viewport);try{const stranger=await other.newPage();await stranger.goto(origin);const calls=rendererCalls;const status=await stranger.evaluate(async id=>(await fetch('/api/sessions/'+id)).status,id);check(status===404&&rendererCalls===calls,'OWNERSHIP_BEFORE_RENDERER');}finally{await other.close();}
   row.solutionsWithheld=true;row.ownershipProtected=true;row.phase='complete';row.passed=true;
  }finally{await c.close();}
 }}}
 const indexed=JSON.parse(await readFile(new URL('../application/server/exercise-catalog.json',import.meta.url),'utf8')),enabled=indexed.exercises.filter(e=>e.activation.state==='enabled');
 const enabledClient=createRendererClient({baseUrl:renderer,exerciseLookup:id=>enabled.find(e=>e.id===id)});active=null;report.enabledCatalogHints=[];
 for(const e of enabled)for(const verificationSeed of fixtures.verificationSeeds){const r=await enabledClient.loadExercise({exerciseId:e.id,seed:verificationSeed});const p=projectAuthoredHints(r.html,{hintExists:r.hintExists===true});report.enabledCatalogHints.push({id:e.id,verificationSeed,authoredExists:r.hintExists===true,available:p.hint.available});}
 check(report.enabledCatalogHints.length===12,'ENABLED_CATALOG_MATRIX');
 report.complete=report.cases.length===12&&report.cases.every(c=>c.passed);check(report.complete,'CASE_MATRIX');
}catch(error){report.complete=false;report.failure=error.message?.startsWith('QA_HINT_')?error.message:error.name;process.exitCode=1;}
finally{await browser.close();app.closeAllConnections();await new Promise(resolve=>app.close(resolve));await rm(directory,{recursive:true,force:true});globalThis.fetch=nativeFetch;await mkdir(output,{recursive:true});await writeFile(output+'/hint-observations.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({complete:report.complete,cases:report.cases.length,failure:report.failure??null}));}