import {allowIntentionalNavigation} from './navigation-consent.mjs';
// Operator-only full HTTP/picker acceptance. Expected values and private state stay in memory.
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {auditExerciseStyles} from './style-audit.mjs';
import {runtimeFingerprint} from '../application/server/catalog-compatibility.mjs';
import {createApp} from '../application/server/http-app.mjs';
import {createRendererClient,RendererClientError} from '../application/server/renderer-client.mjs';
import {renderingAudit,keyboardAudit,mobileAudit,retryAudit} from './regression-checks.mjs';
import {writeRegressionReport} from './regression-report.mjs';
import {createExerciseSessions} from '../application/server/exercise-sessions.mjs';
import {getAnswerContract,completeAnswerEntries} from '../application/server/answer-contract.mjs';
const catalog=JSON.parse(await readFile(new URL('./catalog.json',import.meta.url),'utf8'));
const renderer=process.env.RENDERER_URL??'http://renderer:3000';
const output=process.env.COMPATIBILITY_OUTPUT??'/artifacts';
const regression=process.env.COMPATIBILITY_REGRESSION==='1';
const policy=regression?JSON.parse(await readFile(new URL('./unsupported-capabilities.json',import.meta.url),'utf8')):undefined;
const seeds=regression?(process.env.COMPATIBILITY_SEEDS?JSON.parse(process.env.COMPATIBILITY_SEEDS):catalog.verificationSeeds):[null];
const viewports=regression?(process.env.COMPATIBILITY_VIEWPORTS?process.env.COMPATIBILITY_VIEWPORTS.split(','):['desktop','mobile']):['desktop'];
const selected=catalog.exercises.filter(f=>!process.env.WIDGET_FIXTURES||process.env.WIDGET_FIXTURES.split(',').includes(f.id));
if(!selected.length||!seeds.length||!viewports.length||seeds.some(s=>regression&&(!Number.isInteger(s)||s<1||s>2147483647))||new Set(seeds).size!==seeds.length||viewports.some(v=>!['desktop','mobile'].includes(v))||new Set(viewports).size!==viewports.length)throw new Error('Invalid operator regression configuration');
if(process.env.WIDGET_FIXTURES&&process.env.WIDGET_FIXTURES.split(',').some(id=>!catalog.exercises.some(f=>f.id===id)))throw new Error('Unknown operator fixture');
if(regression&&policy.limitations.some(l=>!Array.isArray(l.exerciseIds)||l.exerciseIds.some(id=>!catalog.exercises.some(f=>f.id===id))))throw new Error('Invalid capability policy fixture');
let activeVerificationSeed=seeds[0];
const reportName=regression?'regression-results.json':process.env.STYLE_AUDIT==='1'?'styling-results.json':'widget-results.json';
const directory=await mkdtemp(join(tmpdir(),'widget-acceptance-'));
const check=(ok,code)=>{if(!ok)throw new Error('QA_'+code);};
const approved=new Map(catalog.exercises.map(f=>[f.id,{id:f.id,renderer:{sourceFilePath:f.rendererPath}}]));
const exerciseLookup=id=>approved.get(id);
const client=createRendererClient({baseUrl:renderer,exerciseLookup});
let gradeCalls=0,restoreCalls=0,failNextGrade=false;
const sessions=createExerciseSessions({directory,exerciseLookup,...(regression?{seedGenerator:()=>activeVerificationSeed}:{}),rendererClient:{
 loadExercise:input=>client.loadExercise(input),restoreSession:input=>{restoreCalls++;return client.restoreSession(input);},
 submitAnswers:input=>{gradeCalls++;if(failNextGrade){failNextGrade=false;throw new RendererClientError('NETWORK_ERROR','Operator-injected grade failure');}return client.submitAnswers(input);}
}});
const app=createApp({sessions,rendererBaseUrl:renderer,exerciseList:()=>catalog.exercises.map(f=>({id:f.id,title:f.title,topicId:f.subject,topic:f.subject,description:'Operator compatibility fixture'}))});
app.listen(0,'127.0.0.1');await once(app,'listening');
const backend='http://127.0.0.1:'+app.address().port;
const browser=await chromium.launch();
const report={fixtureCatalogFingerprint:createHash('sha256').update(await readFile(new URL('./catalog.json',import.meta.url))).digest('hex'),runtimeFingerprint:runtimeFingerprint(),profileVersion:JSON.parse(await readFile(new URL('../application/server/compatibility-profile.json',import.meta.url),'utf8')).version,schemaVersion:1,observedAt:new Date().toISOString(),sourceRevision:catalog.sourceRevision,rendererRevision:catalog.rendererRevision,
 scope:'Operator-only temporary HTTP application using injected server catalogs and the real renderer client, owned sessions, picker, sandbox, answer bridge, grading, feedback and persistence. Production defaults are unchanged. Positive fixtures use expected values only in operator memory.',exercises:[]};
if(regression){
 report.expectedCases=selected.flatMap(f=>seeds.flatMap(verificationSeed=>viewports.map(viewport=>({id:f.id,verificationSeed,viewport}))));
 report.partial=selected.length!==catalog.exercises.length||JSON.stringify(seeds)!==JSON.stringify(catalog.verificationSeeds)||JSON.stringify(viewports)!==JSON.stringify(['desktop','mobile']);
 report.policyVersion=policy.version;
}
await mkdir(output,{recursive:true});
async function pageContext(viewportName='desktop'){
 const context=await browser.newContext({viewport:{width:viewportName==='mobile'?390:1100,height:1000},isMobile:viewportName==='mobile',hasTouch:viewportName==='mobile'});
 allowIntentionalNavigation(context);
 await context.route('http://localhost:3100/**',async route=>{
  try{const response=await route.fetch({url:route.request().url().replace('http://localhost:3100',backend)});await route.fulfill({response});}
  catch{await route.fulfill({status:502,body:'Operator test request failed'});}
 });
 return context;
}
async function ready(page){await page.waitForFunction(()=>{const b=document.querySelector('#check-answer');return b&&!b.disabled&&!b.closest('[hidden]');},{timeout:30000});}
const frameOf=page=>page.frames().find(frame=>frame.parentFrame());
const collect=page=>page.evaluate(async()=>{const p=await import('/assets/picker.js');return (await p.collectCurrentAnswers()).answers;});
const cached=page=>page.evaluate(async()=>{const p=await import('/assets/picker.js');return p.getCurrentAnswers()?.answers;});
async function submit(page){
 const promise=page.waitForResponse(r=>r.request().method()==='POST'&&/\/api\/sessions\/[^/]+\/answers$/.test(new URL(r.url()).pathname));
 if(regression){await page.locator('#check-answer').focus();await page.keyboard.press('Enter');}else await page.locator('#check-answer').click();const response=await promise;
 check(response.status()===200,'GRADE_HTTP');const result=await response.json();await ready(page);return result;
}
async function recordFor(id){return JSON.parse(await readFile(join(directory,id+'.json'),'utf8'));}
async function expected(fixture,seed){
 const response=await fetch(renderer+'/render-api',{method:'POST',redirect:'error',body:new URLSearchParams({sourceFilePath:fixture.rendererPath,problemSeed:String(seed),_format:'json',isInstructor:'1'}),signal:AbortSignal.timeout(30000)});
 check(response.ok,'DIAGNOSTIC_HTTP');const data=await response.json();check(data.answers,'DIAGNOSTIC_MAPPING');return data.answers;
}
async function planFor(page,fixture,diagnostic,id){
 const frame=frameOf(page),record=await recordFor(id);
 const restored=await client.restoreSession({exerciseId:fixture.id,seed:record.seed,sessionToken:record.rendererSessionToken});
 const contract=getAnswerContract(restored.html);
 const groups=await frame.evaluate(()=>{
  const map=new Map();for(const c of document.querySelectorAll('#problem_body input,#problem_body textarea,#problem_body select')){
   if(!c.name||c.matches(':disabled')||c.name.startsWith('MaThQuIlL_')||c.name.startsWith('previous_'))continue;
   const g=map.get(c.name)??{name:c.name,type:c.type,values:[]};
   if(['checkbox','radio'].includes(c.type))g.values.push(c.value);
   if(c.tagName==='SELECT')g.values=[...c.options].filter(o=>!o.disabled).map(o=>o.value);
   map.set(c.name,g);
  }return [...map.values()];
 });
 const plans=[];
 for(const group of groups.filter(g=>contract.has(g.name))){
  if(['radio','checkbox','select-one'].includes(group.type)){
   const candidates=group.type==='checkbox'
    ? Array.from({length:2**group.values.length},(_,bits)=>group.values.filter((_,i)=>bits&(1<<i)))
    : group.values.map(value=>[value]);
   check(candidates.length<=256,'CHOICE_BOUND');let selected;
   for(const candidate of candidates){
    const pairs=candidate.map(value=>[group.name,value]);
    const result=await client.submitAnswers({exerciseId:fixture.id,seed:record.seed,sessionToken:record.rendererSessionToken,answers:completeAnswerEntries(pairs,contract)});
    if(result.fieldFeedback.find(field=>field.name===group.name)?.score===1){selected=candidate;break;}
   }
   check(selected!==undefined,'CHOICE_MAPPING');plans.push({...group,selected});
  }else{
   const answer=diagnostic[group.name],value=answer?.correct_value??answer?.correct_ans;
   check(['string','number'].includes(typeof value),'SCALAR_MAPPING');plans.push({...group,value:String(value)});
  }
 }
 return plans;
}
async function fillPlan(page,plans,{skipGraph=false}={}){
 const frame=frameOf(page);
 for(const toggle of await frame.locator('[data-bs-toggle="collapse"]').all())if(await toggle.getAttribute('aria-expanded')==='false'&&await toggle.isVisible())await toggle.click();
 for(const plan of plans){
  if(plan.type==='hidden'&&skipGraph)continue;
  const fields=frame.locator('[name="'+plan.name+'"]');
  if(['checkbox','radio'].includes(plan.type)){
   for(const field of await fields.all()){
    if(!await field.isVisible())continue;
    const selected=plan.selected.includes(await field.inputValue());
    if(plan.type==='checkbox')await field.setChecked(selected);else if(selected)await field.check();
   }
  }else if(plan.type==='select-one')await fields.selectOption(plan.selected[0]);
  else if(plan.type!=='hidden')await fields.fill(plan.value);
 }
}
async function graphPoints(page,points){
 const frame=frameOf(page);
 for(const [x,y] of points){
  if(regression&&page.viewportSize().width<600)await frame.locator('.gt-point-tool').tap();else await frame.locator('.gt-point-tool').click();
  const position=await frame.evaluate(({x,y})=>{
   const board=Object.values(JXG.boards).find(b=>b.containerObj?.id==='AnSwEr0001_graphbox_graph');
   if(!board)return null;
      // Touch coordinates are rounded to device pixels. Stay inside the board border
   // by less than half a snap step; PG still snaps to the intended boundary point.
   const insetX=Math.min(5,board.unitX/4),insetY=Math.min(5,board.unitY/4);
   return {x:Math.max(insetX,Math.min(board.canvasWidth-insetX,board.origin.scrCoords[1]+x*board.unitX)),y:Math.max(insetY,Math.min(board.canvasHeight-insetY,board.origin.scrCoords[2]-y*board.unitY))};
  },{x,y});
  check(position,'GRAPH_BOARD');if(regression&&page.viewportSize().width<600){
   await frame.evaluate(position=>{const node=document.getElementById('AnSwEr0001_graphbox_graph'),rect=node.getBoundingClientRect();window.scrollBy(rect.left+position.x-innerWidth/2,rect.top+position.y-innerHeight/2);},position);
   await page.waitForTimeout(60);
   await frame.locator('#AnSwEr0001_graphbox_graph').tap({position});
  }else await frame.locator('#AnSwEr0001_graphbox_graph').click({position});
 }
}
async function clearGraph(page){
 const frame=frameOf(page);await page.locator('.exercise-frame').scrollIntoViewIfNeeded();
 if(regression){
  await frame.getByRole('button',{name:'Clear',exact:true}).focus();await page.keyboard.press('Enter');
  await frame.getByRole('button',{name:'Yes',exact:true}).waitFor();await frame.getByRole('button',{name:'Yes',exact:true}).focus();await page.keyboard.press('Enter');
 }else{
  await frame.getByRole('button',{name:'Clear',exact:true}).click();await frame.getByRole('button',{name:'Yes',exact:true}).click();
 }
}
function summary(result){return {score:result.submission.score,statuses:result.submission.fieldFeedback.map(f=>f.status),feedbackCount:result.submission.fieldFeedback.length};}
async function restored(page,id,answers,submission,{allowStageRelock=false,reload=true}={}){
 const before=gradeCalls;if(reload)await page.reload();await ready(page);
 check(new URL(page.url()).searchParams.get('session')===id,'SESSION_ID_CHANGED');
 const current=await collect(page);
 const removed=answers.fieldNames.filter(name=>!current.fieldNames.includes(name));
 const comparable=allowStageRelock?answers.entries.filter(([name])=>current.fieldNames.includes(name)):answers.entries;
 check(!removed.length||(allowStageRelock&&answers.entries.filter(([name])=>removed.includes(name)).every(([,value])=>!value.trim())),'UNEXPECTED_REMOVED_ANSWERS');
 check(JSON.stringify(current.entries)===JSON.stringify(comparable),'RESTORED_PAIRS');
 const record=await recordFor(id);check(record.lastSubmission.id===submission.id,'RESTORED_SUBMISSION');check(JSON.stringify(record.lastSubmission.fieldFeedback)===JSON.stringify(submission.fieldFeedback),'RESTORED_FIELD_FEEDBACK');check(gradeCalls===before,'RESTORE_REGRADED');
 const visibleFields=submission.fieldFeedback.filter(field=>current.fieldNames.includes(field.name));
 const displayed=await frameOf(page).locator('[data-practice-feedback]').evaluateAll(nodes=>nodes.map(node=>node.dataset.status));
 check(JSON.stringify(displayed)===JSON.stringify(visibleFields.map(field=>field.status)),'RESTORED_FEEDBACK_STATUS');
 const count=await frameOf(page).locator('[data-practice-feedback]').count();check(count===submission.fieldFeedback.filter(field=>current.fieldNames.includes(field.name)).length,'RESTORED_FEEDBACK_COUNT');
 return {sameAvailableAnswers:true,removedBlankFieldCount:removed.length,sameSession:true,sameSubmission:true,noNewGrade:true,feedbackCount:count};
}
try{
 for(const fixture of selected){for(const verificationSeed of seeds){for(const viewport of viewports){
  activeVerificationSeed=verificationSeed;failNextGrade=false;
  const row={id:fixture.id,interaction:fixture.interaction,seedPolicy:regression?'fixed operator seed preserved in private session':'fresh random seed preserved in private session',sourceVerified:false,...(regression?{verificationSeed,viewport}:{})};
  const context=await pageContext(viewport);
  try{
   const bytes=await readFile('/opl/webwork-open-problem-library/'+fixture.source.path);
   check(createHash('sha256').update(bytes).digest('hex')===fixture.source.sha256,'SOURCE_HASH');row.sourceVerified=true;
   const page=await context.newPage();let pageErrors=0;page.on('pageerror',()=>{pageErrors++;});
   row.phase='load';
   const failStyles=route=>route.abort('failed');
   if(regression)await page.route('**/assets/exercise.css',failStyles);
   await page.goto('http://localhost:3100');await page.locator('.exercise-choice').filter({hasText:fixture.title}).click();
   if(regression){
    await page.getByText('Exercise resources could not load. Retry before checking answers.').waitFor();
    const originalId=new URL(page.url()).searchParams.get('session');
    await page.unroute('**/assets/exercise.css',failStyles);
    await page.getByRole('button',{name:'Retry exercise',exact:true}).click();await ready(page);
    check(new URL(page.url()).searchParams.get('session')===originalId,'LOADING_RETRY_NEW_SESSION');row.loadingRetry={passed:true,sameSession:true};
   }else await ready(page);
   if(regression||process.env.STYLE_AUDIT==='1'){row.phase='styling';row.styling=await auditExerciseStyles(page);}
   if(regression){row.phase='rendering';row.rendering=await renderingAudit(page,fixture);}
   const id=new URL(page.url()).searchParams.get('session');const record=await recordFor(id);
   const diagnostic=await expected(fixture,record.seed);
   const initial=await collect(page);row.initialFieldCount=initial.fieldNames.length;
   row.phase='blank';const blank=await submit(page);row.blank=summary(blank);check(blank.submission.score===0,'BLANK_SCORE');
   if(regression){
    if(viewport==='mobile')row.mobile=await mobileAudit(page);
    else{const layout=row.styling.layouts.find(l=>l.viewport===320);row.mobile={...layout,passed:true,layoutOnly:true};}
    row.keyboard=await keyboardAudit(page,fixture);
   }
   row.phase='mapping';const plan=await planFor(page,fixture,diagnostic,id);
   row.phase='negative-and-partial';if(fixture.interaction==='graph-tool'){
    await graphPoints(page,[[0,0]]);
    await page.waitForFunction(async()=>{const p=await import('/assets/picker.js');return p.getCurrentAnswers()?.answers.entries.some(([,v])=>v.length);});
    row.hiddenChangeNotified=true;
    const wrong=await submit(page);row.incorrect=summary(wrong);check(wrong.submission.score===0,'GRAPH_WRONG_SCORE');
    check(await frameOf(page).locator('[data-practice-feedback]').count()===1,'GRAPH_FEEDBACK');
    row.phase='graph-clear';await clearGraph(page);
    row.phase='graph-stale-feedback';await frameOf(page).locator('[data-practice-feedback][data-status="changed"]').waitFor();row.staleFeedbackOnClear=true;
    const graph=plan.find(p=>p.type==='hidden');
    const points=[...graph.value.matchAll(/\{point,\s*\(\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\)\s*\}/g)].map(m=>[Number(m[1]),Number(m[2])]);
    check(points.length>1,'GRAPH_POINT_MAPPING');
    await graphPoints(page,points.slice(0,1));const partial=await submit(page);row.partial=summary(partial);check(partial.submission.score>0&&partial.submission.score<1,'GRAPH_PARTIAL');
    await graphPoints(page,points.slice(1));
   }else{
    await fillPlan(page,plan);
    const first=plan.find(p=>!['checkbox','radio','select-one','hidden'].includes(p.type));
    if(first){await frameOf(page).locator('[name="'+first.name+'"]').fill('unknown_symbol_qa');}
    else{const group=plan[0],wrong=group.values.find(v=>!group.selected.includes(v));await frameOf(page).locator('[name="'+group.name+'"]').evaluateAll((fields,value)=>{for(const f of fields)f.checked=f.value===value;},wrong);}
    const wrong=await submit(page);row.incorrectOrInvalid=summary(wrong);check(wrong.submission.score<1,'WRONG_SCORE');
    if(first)check(wrong.submission.fieldFeedback.some(f=>f.status==='invalid'),'INVALID_CLASSIFICATION');
    await fillPlan(page,plan);
   }
   row.phase='correct';let correct=await submit(page);
   if(fixture.interaction==='scaffold'){
    check(correct.submission.score===0.5,'SCAFFOLD_PARTIAL');row.firstStage=summary(correct);
    const before=(await collect(page)).fieldNames.length;await page.reload();await ready(page);
    const after=(await collect(page)).fieldNames.length;check(after>before,'SCAFFOLD_RESTORE_NEW_FIELDS');
    row.stageLifecycle={requiresReload:true,beforeFields:before,afterFields:after};
    await fillPlan(page,await planFor(page,fixture,diagnostic,id));correct=await submit(page);
   }
   row.correct=summary(correct);
   if(regression&&fixture.interaction==='graph-tool'&&viewport==='mobile'&&correct.submission.score!==1){
    row.capabilityFailures=[{code:'MOBILE_GRAPH_TOUCH_GRADING',expectedScore:1,actualScore:correct.submission.score}];
   }else{
    check(correct.submission.score===1,'CORRECT_SCORE');
    check(correct.submission.fieldFeedback.every(f=>f.status==='correct'),'CORRECT_FIELD_FEEDBACK');
   }
   const answers=await collect(page);row.fieldCount=answers.fieldNames.length;
   check(answers.fieldNames.every(name=>!name.startsWith('MaThQuIlL_')&&!name.startsWith('previous_')),'HELPER_FIELD_LEAK');
   row.collection={fieldCount:answers.fieldNames.length,pairCount:answers.entries.length,repeatedPairs:answers.entries.length-new Set(answers.entries.map(([name])=>name)).size,helperFieldsExcluded:true};
   check(!Object.hasOwn(correct.session,'seed')&&!JSON.stringify(correct).includes((await recordFor(id)).rendererSessionToken),'PRIVATE_RENDERER_LEAK');row.privateRendererDataOmitted=true;
   const displayedStatuses=await frameOf(page).locator('[data-practice-feedback]').evaluateAll(nodes=>nodes.map(n=>n.dataset.status));
   check(JSON.stringify(displayedStatuses)===JSON.stringify(correct.submission.fieldFeedback.map(f=>f.status)),'VISIBLE_FIELD_FEEDBACK');
   row.phase='restore';row.restoration=await restored(page,id,answers,correct.submission);
   if(regression){row.phase='retries';row.retry=await retryAudit({page,injectFailure:()=>{failNextGrade=true;},recordFor,id,gradeCount:()=>gradeCalls,backend,ready,restored});}
   row.phase='graph-focus-and-clear';if(fixture.interaction==='graph-tool'){
    await page.evaluate(async()=>{const {collectCurrentAnswers}=await import('/assets/picker.js');await collectCurrentAnswers();});
    await frameOf(page).evaluate(()=>document.activeElement?.blur());
    await page.getByRole('button',{name:/return to answers/i}).click();
    await frameOf(page).waitForFunction(()=>Boolean(document.activeElement?.closest('.graphtool-container')),null,{timeout:5000}).catch(()=>check(false,'GRAPH_FOCUS'));row.graphFocus=true;
    row.phase='graph-clear';await clearGraph(page);
   }else{
    const frame=frameOf(page);
    await frame.evaluate(()=>{for(const c of document.querySelectorAll('#problem_body input,#problem_body textarea,#problem_body select')){
     if(c.type==='hidden'||!c.name||c.matches(':disabled'))continue;
     if(['radio','checkbox'].includes(c.type))c.checked=false;else if(c.tagName==='SELECT')c.selectedIndex=0;else c.value='';
     c.dispatchEvent(new Event('change',{bubbles:true}));
    }});
   }
   row.phase='clear';const cleared=await submit(page);row.cleared=summary(cleared);check(cleared.submission.score<1,'CLEAR_PRIOR_ANSWERS');
   row.clearedRestoration=await restored(page,id,await collect(page),cleared.submission,{allowStageRelock:fixture.interaction==='scaffold'});
   const stranger=await pageContext();try{
    const other=await stranger.newPage();await other.goto('http://localhost:3100');
    if(regression){const created=await other.evaluate(async exerciseId=>{const response=await fetch('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({exerciseId})});return response.status;},fixture.id);check(created===201,'OTHER_OWNER_SESSION');}
    const saved=(await recordFor(id)).lastSubmission.id,restores=restoreCalls,grades=gradeCalls;
    const response=await other.goto('http://localhost:3100/api/sessions/'+id);check(response.status()===404,'OWNERSHIP');row.ownershipProtected=true;
    if(regression){const status=await other.evaluate(async id=>{const r=await fetch('/api/sessions/'+id+'/answers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answers:[]})});return r.status;},id);check(status===404,'GRADING_OWNERSHIP');row.gradingOwnershipProtected=true;check(restores===restoreCalls&&grades===gradeCalls&&(await recordFor(id)).lastSubmission.id===saved,'FOREIGN_OWNER_CHANGED_STATE');row.ownerDataUnchanged=true;}
   }finally{await stranger.close();}
   check((await recordFor(id)).seed===record.seed,'SEED_CHANGED');row.seedPreserved=true;check(pageErrors===0,'PAGE_ERROR');row.pageErrors=pageErrors;row.passed=!row.capabilityFailures?.length;if(!row.passed)row.error='QA_MOBILE_GRAPH_TOUCH_GRADING';row.phase='complete';
  }catch(error){
   if(regression&&fixture.interaction==='graph-tool'){try{const p=context.pages()[0],f=p&&frameOf(p);if(f)row.graphDiagnostics=await f.evaluate(()=>({feedback:[...document.querySelectorAll('[data-practice-feedback]')].map(n=>n.dataset.status),nonempty:[...document.querySelectorAll('.graphtool-outer-container input[type=hidden]')].filter(n=>isAnswerFieldName(n.name)).some(n=>Boolean(n.value)),confirmButtons:document.querySelectorAll('.gt-confirm-button').length,clearDisabled:[...document.querySelectorAll('.gt-button')].find(n=>n.textContent==='Clear')?.disabled,confirmationContainers:document.querySelectorAll('.gt-confirm').length,focusedTag:document.activeElement?.tagName}));}catch{}}
   if(row.graphDiagnostics)row.graphDiagnostics.action=error.message?.includes('Yes')?'confirm':'clear';row.error=error.message?.startsWith('QA_')?error.message:(error.code??error.name??'Error');row.passed=false;}
  finally{await context.close();}
  report.exercises.push(row);await writeFile(output+'/'+reportName,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({id:row.id,verificationSeed:row.verificationSeed,viewport:row.viewport,phase:row.phase,passed:row.passed,error:row.error??null,correct:row.correct?.score}));
 }}}
}finally{
 await browser.close();app.closeAllConnections();await new Promise(resolve=>app.close(resolve));await rm(directory,{recursive:true,force:true});
}
report.complete=true;await writeFile(output+'/'+reportName,JSON.stringify(report,null,2)+'\n');
if(regression){const summary=await writeRegressionReport(report,policy,output);console.log(JSON.stringify(summary));if(!summary.passed)process.exitCode=1;}else if(report.exercises.some(row=>!row.passed))process.exitCode=1;