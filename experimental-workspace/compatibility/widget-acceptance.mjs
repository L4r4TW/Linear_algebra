// Operator-only full HTTP/picker acceptance. Expected values and private state stay in memory.
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {auditExerciseStyles} from './style-audit.mjs';
import {createApp} from '../application/server/http-app.mjs';
import {createRendererClient} from '../application/server/renderer-client.mjs';
import {createExerciseSessions} from '../application/server/exercise-sessions.mjs';
import {getAnswerContract,completeAnswerEntries} from '../application/server/answer-contract.mjs';
const catalog=JSON.parse(await readFile(new URL('./catalog.json',import.meta.url),'utf8'));
const renderer=process.env.RENDERER_URL??'http://renderer:3000';
const output=process.env.COMPATIBILITY_OUTPUT??'/artifacts';
const reportName=process.env.STYLE_AUDIT==='1'?'styling-results.json':'widget-results.json';
const directory=await mkdtemp(join(tmpdir(),'widget-acceptance-'));
const check=(ok,code)=>{if(!ok)throw new Error('QA_'+code);};
const approved=new Map(catalog.exercises.map(f=>[f.id,{id:f.id,renderer:{sourceFilePath:f.rendererPath}}]));
const exerciseLookup=id=>approved.get(id);
const client=createRendererClient({baseUrl:renderer,exerciseLookup});
let gradeCalls=0;
const sessions=createExerciseSessions({directory,exerciseLookup,rendererClient:{
 loadExercise:input=>client.loadExercise(input),restoreSession:input=>client.restoreSession(input),
 submitAnswers:input=>{gradeCalls++;return client.submitAnswers(input);}
}});
const app=createApp({sessions,rendererBaseUrl:renderer,exerciseList:()=>catalog.exercises.map(f=>({id:f.id,title:f.title,topicId:f.subject,topic:f.subject,description:'Operator compatibility fixture'}))});
app.listen(0,'127.0.0.1');await once(app,'listening');
const backend='http://127.0.0.1:'+app.address().port;
const browser=await chromium.launch();
const report={schemaVersion:1,observedAt:new Date().toISOString(),sourceRevision:catalog.sourceRevision,rendererRevision:catalog.rendererRevision,
 scope:'Operator-only temporary HTTP application using injected server catalogs and the real renderer client, owned sessions, picker, sandbox, answer bridge, grading, feedback and persistence. Production defaults are unchanged. Positive fixtures use expected values only in operator memory.',exercises:[]};
await mkdir(output,{recursive:true});
async function pageContext(){
 const context=await browser.newContext({viewport:{width:1100,height:1000}});
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
 await page.locator('#check-answer').click();const response=await promise;
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
  await frame.locator('.gt-point-tool').click();
  const position=await frame.evaluate(({x,y})=>{
   const board=Object.values(JXG.boards).find(b=>b.containerObj?.id==='AnSwEr0001_graphbox_graph');
   if(!board)return null;
   return {x:Math.max(1,Math.min(board.canvasWidth-1,board.origin.scrCoords[1]+x*board.unitX)),y:Math.max(1,Math.min(board.canvasHeight-1,board.origin.scrCoords[2]-y*board.unitY))};
  },{x,y});
  check(position,'GRAPH_BOARD');await frame.locator('#AnSwEr0001_graphbox_graph').click({position});
 }
}
async function clearGraph(page){
 const frame=frameOf(page);await frame.getByRole('button',{name:'Clear',exact:true}).click();
 await frame.getByRole('button',{name:'Yes',exact:true}).click();
}
function summary(result){return {score:result.submission.score,statuses:result.submission.fieldFeedback.map(f=>f.status),feedbackCount:result.submission.fieldFeedback.length};}
async function restored(page,id,answers,submission,{allowStageRelock=false}={}){
 const before=gradeCalls;await page.reload();await ready(page);
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
 for(const fixture of catalog.exercises.filter(f=>!process.env.WIDGET_FIXTURES||process.env.WIDGET_FIXTURES.split(',').includes(f.id))){
  const row={id:fixture.id,interaction:fixture.interaction,seedPolicy:'fresh random seed preserved in private session',sourceVerified:false};
  const context=await pageContext();
  try{
   const bytes=await readFile('/opl/webwork-open-problem-library/'+fixture.source.path);
   check(createHash('sha256').update(bytes).digest('hex')===fixture.source.sha256,'SOURCE_HASH');row.sourceVerified=true;
   const page=await context.newPage();let pageErrors=0;page.on('pageerror',()=>{pageErrors++;});
   row.phase='load';await page.goto('http://localhost:3100');await page.locator('.exercise-choice').filter({hasText:fixture.title}).click();await ready(page);
   if(process.env.STYLE_AUDIT==='1'){row.phase='styling';row.styling=await auditExerciseStyles(page);}
   const id=new URL(page.url()).searchParams.get('session');const record=await recordFor(id);
   const diagnostic=await expected(fixture,record.seed);
   const initial=await collect(page);row.initialFieldCount=initial.fieldNames.length;
   row.phase='blank';const blank=await submit(page);row.blank=summary(blank);check(blank.submission.score===0,'BLANK_SCORE');
   row.phase='mapping';const plan=await planFor(page,fixture,diagnostic,id);
   row.phase='negative-and-partial';if(fixture.interaction==='graph-tool'){
    await graphPoints(page,[[0,0]]);
    await page.waitForFunction(async()=>{const p=await import('/assets/picker.js');return p.getCurrentAnswers()?.answers.entries.some(([,v])=>v.length);});
    row.hiddenChangeNotified=true;
    const wrong=await submit(page);row.incorrect=summary(wrong);check(wrong.submission.score===0,'GRAPH_WRONG_SCORE');
    check(await frameOf(page).locator('[data-practice-feedback]').count()===1,'GRAPH_FEEDBACK');
    await clearGraph(page);
    await frameOf(page).locator('[data-practice-feedback][data-status="changed"]').waitFor();row.staleFeedbackOnClear=true;
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
   row.correct=summary(correct);check(correct.submission.score===1,'CORRECT_SCORE');
   check(correct.submission.fieldFeedback.every(f=>f.status==='correct'),'CORRECT_FIELD_FEEDBACK');
   const answers=await collect(page);row.fieldCount=answers.fieldNames.length;
   check(answers.fieldNames.every(name=>!name.startsWith('MaThQuIlL_')&&!name.startsWith('previous_')),'HELPER_FIELD_LEAK');
   row.collection={fieldCount:answers.fieldNames.length,pairCount:answers.entries.length,repeatedPairs:answers.entries.length-new Set(answers.entries.map(([name])=>name)).size,helperFieldsExcluded:true};
   check(!Object.hasOwn(correct.session,'seed')&&!JSON.stringify(correct).includes((await recordFor(id)).rendererSessionToken),'PRIVATE_RENDERER_LEAK');row.privateRendererDataOmitted=true;
   check(await frameOf(page).locator('[data-practice-feedback][data-status="correct"]').count()===correct.submission.fieldFeedback.length,'VISIBLE_CORRECT_FEEDBACK');
   row.phase='restore';row.restoration=await restored(page,id,answers,correct.submission);
   row.phase='graph-focus-and-clear';if(fixture.interaction==='graph-tool'){
    await page.evaluate(async()=>{const {collectCurrentAnswers}=await import('/assets/picker.js');await collectCurrentAnswers();});
    await frameOf(page).evaluate(()=>document.activeElement?.blur());
    await page.getByRole('button',{name:/return to answers/i}).click();
    await frameOf(page).waitForFunction(()=>Boolean(document.activeElement?.closest('.graphtool-container')),null,{timeout:5000}).catch(()=>check(false,'GRAPH_FOCUS'));row.graphFocus=true;
    await clearGraph(page);
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
   const stranger=await pageContext();try{const other=await stranger.newPage();const response=await other.goto('http://localhost:3100/api/sessions/'+id);check(response.status()===404,'OWNERSHIP');row.ownershipProtected=true;}finally{await stranger.close();}
   check((await recordFor(id)).seed===record.seed,'SEED_CHANGED');row.seedPreserved=true;check(pageErrors===0,'PAGE_ERROR');row.pageErrors=pageErrors;row.passed=true;row.phase='complete';
  }catch(error){row.error=error.message?.startsWith('QA_')?error.message:(error.code??error.name??'Error');row.passed=false;}
  finally{await context.close();}
  report.exercises.push(row);await writeFile(output+'/'+reportName,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({id:row.id,phase:row.phase,passed:row.passed,error:row.error??null,correct:row.correct?.score}));
 }
}finally{
 await browser.close();app.closeAllConnections();await new Promise(resolve=>app.close(resolve));await rm(directory,{recursive:true,force:true});
}
report.complete=true;await writeFile(output+'/'+reportName,JSON.stringify(report,null,2)+'\n');
if(report.exercises.some(row=>!row.passed))process.exitCode=1;