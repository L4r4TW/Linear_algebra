// Operator-only continuity audit against the default student catalog. No answers or private session data are written.
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {runtimeFingerprint} from '../application/server/catalog-compatibility.mjs';
const catalog=JSON.parse(await readFile(new URL('../application/server/exercise-catalog.json',import.meta.url),'utf8'));
const expected=catalog.exercises.filter(e=>e.activation.state==='enabled').map(e=>e.id);
const base='http://localhost:3100',backend=process.env.PICKER_BACKEND_URL??'http://workspace:3000';
const output=process.env.COMPATIBILITY_OUTPUT??'/artifacts';
const report={schemaVersion:1,observedAt:new Date().toISOString(),runtimeFingerprint:runtimeFingerprint(),scope:'Default catalog browser audit; random session seeds; desktop Chromium. Draft-enabled baseline. No positive-answer oracle or actual renderer outage.',exercises:[]};
const check=(value,code)=>{if(!value)throw new Error('AUDIT_'+code);};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ready=page=>page.waitForFunction(()=>{const b=document.querySelector('#check-answer');return b&&!b.disabled&&!b.closest('[hidden]');});
const frame=page=>page.frames().find(f=>f.parentFrame());
const collect=page=>page.evaluate(async()=> (await (await import('/assets/picker.js')).collectCurrentAnswers()).answers.entries);
const identity=page=>new URL(page.url()).searchParams.get('session');
const question=page=>frame(page).evaluate(()=>({math:window.MathJax?.startup?.document?[...MathJax.startup.document.math].map(m=>m.math):[],names:[...document.querySelectorAll('#problem_body input[name],#problem_body select[name],#problem_body textarea[name]')].map(n=>n.name)}));
async function edit(page){
 const f=frame(page),text=f.locator('#problem_body input[type=text],#problem_body input:not([type]),#problem_body textarea');
 if(await text.count())await text.first().fill('314159');
 const choice=f.locator('#problem_body input[type=radio],#problem_body input[type=checkbox]');
 if(await choice.count())await choice.first().check();
 return collect(page);
}
const browser=await chromium.launch();
try{
 for(const id of expected){
  const row={id};report.exercises.push(row);
  const context=await browser.newContext({viewport:{width:1100,height:1000}});
  try{
   await context.route(base+'/**',async route=>{const response=await route.fetch({url:route.request().url().replace(base,backend)});await route.fulfill({response});});
   const page=await context.newPage();let starts=0,grades=0;
   page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/sessions'))starts++;if(r.method()==='POST'&&r.url().endsWith('/answers'))grades++;});
   await page.goto(base);
   const listed=await page.evaluate(async()=> (await fetch('/api/exercises')).json());check(equal(listed.exercises.map(e=>e.id),expected),'DEFAULT_CATALOG');
   await page.locator('.exercise-choice[data-exercise-id="'+id+'"]').click();await ready(page);
   const session=identity(page),initial=await collect(page),initialQuestion=await question(page);
   const unchecked=await edit(page);check(!equal(unchecked,initial),'DRAFT_EDIT');
   await page.reload();await ready(page);
   row.sameExerciseBeforeGrading=identity(page)===session&&equal(await question(page),initialQuestion);
   row.uncheckedDraftRestored=equal(await collect(page),unchecked);
      check(row.sameExerciseBeforeGrading&&row.uncheckedDraftRestored,'UNCHECKED_REFRESH');
   await frame(page).evaluate(()=>{for(const node of document.querySelectorAll('#problem_body input,#problem_body textarea')){if(['checkbox','radio'].includes(node.type))node.checked=false;else if(node.type==='text'||node.tagName==='TEXTAREA')node.value='';node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));}});
   check(equal(await collect(page),initial),'CLEAR_DRAFT');
   const grading=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/answers'));
   await page.locator('#check-answer').click();const response=await grading;check(response.status()===200,'BLANK_GRADE');
   const graded=await response.json();await ready(page);check(graded.submission.score===0,'BLANK_SCORE');
   const submitted=await collect(page),count=grades;
   await page.reload();await ready(page);
   const saved=await page.evaluate(async s=>(await fetch('/api/sessions/'+s)).json(),session);
   row.checkedAnswersRestored=equal(await collect(page),submitted);
   row.feedbackSnapshotRestored=equal(saved.submission,graded.submission);
   row.fieldFeedbackVisible=await frame(page).locator('.field-feedback').count()===graded.submission.fieldFeedback.length;
   row.refreshDidNotGrade=grades===count;
   row.sameExerciseAfterGrading=identity(page)===session&&equal(await question(page),initialQuestion);
   row.blankStatuses=[...new Set(graded.submission.fieldFeedback.map(f=>f.status))];
   check(row.checkedAnswersRestored&&row.feedbackSnapshotRestored&&row.fieldFeedbackVisible&&row.refreshDidNotGrade&&row.sameExerciseAfterGrading,'CHECKED_RESTORE');
   const draft=await edit(page);await page.locator('#result-stale').waitFor({state:'visible'});row.changedResultMarked=true;
   const pattern='**/api/sessions/*/answers';
   const fail=route=>route.fulfill({status:503,json:{error:{code:'RENDERER_UNAVAILABLE',message:'The exercise service is temporarily unavailable.'}}});
   await page.route(pattern,fail);await page.locator('#check-answer').click();await page.locator('#submission-error').waitFor({state:'visible'});await ready(page);
   row.failedCheckPreservesInputs=equal(await collect(page),draft)&&identity(page)===session;
   const calls=grades;await page.waitForTimeout(200);row.noAutomaticGradeRetry=grades===calls;
   check(row.failedCheckPreservesInputs&&row.noAutomaticGradeRetry,'FAILED_CHECK');await page.unroute(pattern,fail);
   await page.reload();await ready(page);row.editsAfterCheckRestored=equal(await collect(page),draft);
   check(row.editsAfterCheckRestored&&equal(await collect(page),draft),'CHECKED_DRAFT_REFRESH');
   const restorePattern='**/api/sessions/'+session;
   const unavailable=route=>route.fulfill({status:503,json:{error:{code:'RENDERER_UNAVAILABLE',message:'The exercise service is temporarily unavailable.'}}});
   await page.route(restorePattern,unavailable);await page.reload();await page.locator('#exercise-content [role=alert]').waitFor({state:'visible'});
   check(identity(page)===session&&starts===1,'RESTORE_FAILURE_REROLL');await page.unroute(restorePattern,unavailable);
   await page.locator('#exercise-content').getByRole('button',{name:'Try again',exact:true}).click();await ready(page);
   row.loadFailureRetrySameSession=identity(page)===session&&starts===1&&equal(await collect(page),draft);
   check(row.loadFailureRetrySameSession,'RESTORE_RETRY');
   const text=frame(page).locator('#problem_body input[type=text],#problem_body input:not([type]),#problem_body textarea');
   if(await text.count()){
    const name=await text.first().getAttribute('name');
    for(const [value,status] of [['gibberish(','invalid'],['314159','incorrect']]){
     await frame(page).locator('[name="'+name+'"]').fill(value);
     const resultPromise=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/answers'));
     await page.locator('#check-answer').click();const result=await resultPromise;check(result.status()===200,'CLASSIFICATION_HTTP');
     const data=await result.json();await ready(page);
     const field=data.submission.fieldFeedback.find(f=>f.name===name);check(field?.status===status,'FIELD_CLASSIFICATION');
     row[status+'FieldMessageProvided']=Boolean(field.message);
     const pairs=await collect(page),beforeReload=grades;
     await page.reload();await ready(page);
     const restored=await page.evaluate(async s=>(await fetch('/api/sessions/'+s)).json(),session);
     row[status+'FeedbackRestored']=equal(restored.submission,data.submission)&&equal(await collect(page),pairs)&&grades===beforeReload&&identity(page)===session;
     check(row[status+'FeedbackRestored'],'CLASSIFICATION_RESTORE');
    }
    row.numericInputClassification='invalid and incorrect verified';
   }else row.numericInputClassification='not applicable to native radio choices';
   row.passed=true;
  }catch(error){row.passed=false;row.error=/^AUDIT_[A-Z_]+$/.test(error.message)?error.message:'AUDIT_BROWSER_OR_SERVICE_FAILURE';}
  finally{await context.close();}
  console.log(JSON.stringify(row));
 }
}finally{await browser.close();}
report.complete=report.exercises.length===6&&report.exercises.every(e=>e.passed);
await mkdir(output,{recursive:true});await writeFile(output+'/continuity-audit.json',JSON.stringify(report,null,2)+'\n');
if(!report.complete)process.exitCode=1;