import {allowIntentionalNavigation} from './navigation-consent.mjs';
// Owned-session real-PG grading audit. No raw responses, entered values, expected answers or JWTs are written.
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {parse} from 'parse5';
import {chromium} from 'playwright';
import {createApp} from '../application/server/http-app.mjs';
import {createExerciseSessions} from '../application/server/exercise-sessions.mjs';
import {createRendererClient} from '../application/server/renderer-client.mjs';
import {runtimeFingerprint} from '../application/server/catalog-compatibility.mjs';
const fixtures=JSON.parse(await readFile(new URL('./feedback-fixtures.json',import.meta.url),'utf8'));
const renderer='http://renderer:3000',origin='http://localhost:3100',output=process.env.COMPATIBILITY_OUTPUT??'/artifacts';
const directory=await mkdtemp(join(tmpdir(),'feedback-audit-'));
const lookup=id=>{const f=fixtures.exercises.find(f=>f.id===id);return f?{id,renderer:{sourceFilePath:f.rendererPath}}:undefined;};
let seed=1234,raw=null,capturing=false,gradeCalls=0;
const nativeFetch=globalThis.fetch;
globalThis.fetch=async (url,options)=>{
 const response=await nativeFetch(url,options);
 const fields=new URLSearchParams(options?.body);
 if(String(url)===renderer+'/render-api'&&fields.has('submitAnswers')){
  gradeCalls++;
  if(capturing){const data=await response.clone().json(),claims=JSON.parse(Buffer.from(data.JWT.answer.split('.')[1],'base64url').toString());raw={score:data.problem_result.score,flag:data.flags.showPartialCorrectAnswers,fields:claims.score.answers};}
 }
 return response;
};
const sessions=createExerciseSessions({directory,exerciseLookup:lookup,seedGenerator:()=>seed,rendererClient:createRendererClient({baseUrl:renderer,exerciseLookup:lookup})});
const app=createApp({sessions,rendererBaseUrl:renderer,origin,exerciseList:()=>fixtures.exercises.map(f=>({id:f.id,title:f.title,topicId:f.subject,topic:f.subject,description:'Private operator feedback fixture'}))});
app.listen(0,'127.0.0.1');await once(app,'listening');const backend='http://127.0.0.1:'+app.address().port;
const report={schemaVersion:1,observedAt:new Date().toISOString(),runtimeFingerprint:runtimeFingerprint(),sourceRevision:fixtures.sourceRevision,rendererRevision:fixtures.rendererRevision,seeds:fixtures.verificationSeeds,scope:'Operator-only temporary owned-session browser app using real student-mode PG responses. Instructor calibration and raw claims stay in memory. No student catalog expansion.',cases:[],staleChecks:[]};
const check=(ok,code)=>{if(!ok)throw new Error('QA_FEEDBACK_'+code);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const frame=page=>page.frames().find(f=>f.parentFrame());
const ready=page=>page.waitForFunction(()=>{const b=document.querySelector('#check-answer');return b&&!b.disabled&&!b.closest('[hidden]');});
const collect=page=>page.evaluate(async()=> (await (await import('/assets/picker.js')).collectCurrentAnswers()).answers);
async function request(fields){const response=await fetch(renderer+'/render-api',{method:'POST',body:new URLSearchParams(fields),signal:AbortSignal.timeout(30000)});check(response.ok,'DIRECT_HTTP');return response.json();}
async function setPairs(page,pairs){
 await frame(page).evaluate(pairs=>{
  const groups=new Map();for(const [name,value] of pairs){const values=groups.get(name)??[];values.push(value);groups.set(name,values);}
  for(const node of document.querySelectorAll('#problem_body input,#problem_body textarea,#problem_body select')){
   if(!isAnswerFieldName(node.name)||node.matches(':disabled'))continue;
   const values=groups.get(node.name)??[];
   if(['checkbox','radio'].includes(node.type)){const index=values.indexOf(node.value);node.checked=index!==-1;if(index!==-1)values.splice(index,1);}
   else node.value=values[0]??'';
   node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));
  }
 },pairs);return collect(page);
}
async function uiBinding(page,submission){return frame(page).evaluate(fields=>fields.every(field=>{
 const p=answerPresentation(document.getElementById('problem_body'),field.name);if(!p)return false;
 const id=p.targets[0]?.getAttribute('data-practice-description'),box=id&&document.getElementById(id);
 return box?.dataset.status===field.status&&p.targets.every(n=>(n.getAttribute('aria-describedby')??'').split(/\s+/).includes(id))&&box.textContent.includes(field.reason==='suppressed'?'Feedback withheld':({correct:'Correct',incorrect:'Incorrect',partial:'Partially correct',invalid:'Invalid input',unanswered:'Not answered',ungraded:'Not graded'})[field.status]);
 }),submission.fieldFeedback);}
async function grade(page,fixture,label,pairs,{score,statuses,outcome,suppressed=false,alreadyEntered=false}={}){
 const row={id:fixture.id,verificationSeed:seed,scenario:label,sourceVerified:true};report.cases.push(row);
 if(!alreadyEntered)await setPairs(page,pairs);const id=new URL(page.url()).searchParams.get('session');capturing=true;raw=null;
 const responsePromise=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/answers'));
 await page.locator('#check-answer').click();const response=await responsePromise;check(response.status()===200,'GRADE_HTTP');const data=await response.json();await ready(page);capturing=false;check(raw,'RAW_RESPONSE');
 const submitted=data.submission,states=submitted.fieldFeedback.map(f=>f.status);check(same(states,statuses),'FIELD_STATES');
 check(await page.locator('#choose-exercise').isVisible()&&await page.locator('#review-answers').isVisible()&&Boolean(await page.locator('#result-next-step').textContent()),'NEXT_ACTIONS');
 check(await uiBinding(page,submitted),'FIELD_BINDING');check(await page.locator('#practice-result').getAttribute('data-outcome')===outcome,'OVERALL_OUTCOME');
 check(submitted.fieldFeedback.every(f=>Object.hasOwn(raw.fields,f.name)),'RAW_FIELD_IDENTITY');
 if(score==='partial')check(raw.score>0&&raw.score<1,'PARTIAL_SCORE');else check(raw.score===score,'PG_SCORE');
 if(suppressed){
  check(raw.flag===0&&submitted.feedbackVisibility==='suppressed'&&submitted.score===null&&data.exercise.score===null,'SUPPRESSED_SCORE');
  check(submitted.fieldFeedback.every(f=>f.score===null&&f.message===''&&f.reason==='suppressed'),'SUPPRESSED_FIELD');
  check(submitted.feedback.message===''&&submitted.feedback.summary==='','SUPPRESSED_MESSAGES');
  check(await page.locator('#result-score').isHidden()&&(await page.locator('#result-score').textContent())==='','HIDDEN_SCORE');
  check(await page.locator('#result-title').textContent()==='Answers submitted','SUPPRESSED_TITLE');
 }else{
  check(data.submission.score===raw.score,'AUTHORITATIVE_AGGREGATE');
  check(submitted.fieldFeedback.every(f=>Number(raw.fields[f.name].score)===f.score),'AUTHORITATIVE_FIELD_SCORES');
 }
 const before=gradeCalls,answers=await collect(page);await page.reload();await ready(page);const restored=await page.evaluate(async id=>(await fetch('/api/sessions/'+id)).json(),id);
 check(same(restored.submission,submitted)&&same(await collect(page),answers)&&gradeCalls===before,'RESTORED_SUBMISSION');
 check(await uiBinding(page,submitted),'RESTORED_BINDING');
 row.pgIndividualFeedbackVisible=raw.flag!==0;row.publicScore=submitted.score;row.fieldStates=submitted.fieldFeedback.map(({name,status,score,reason})=>({name,status,score,...(reason?{reason}:{})}));row.outcome=outcome;row.nextActionsVerified=true;row.fieldBindingVerified=true;row.feedbackAndAnswersRestored=true;row.noGradeOnRefresh=true;row.suppressedDetailsRedacted=suppressed;row.passed=true;
 return {data,answers,id};
}
const browser=await chromium.launch();
try{
 for(const fixture of fixtures.exercises){
  const source=await readFile('/opl/webwork-open-problem-library/'+fixture.source.path);check(createHash('sha256').update(source).digest('hex')===fixture.source.sha256,'SOURCE_HASH');
  for(const verificationSeed of fixtures.verificationSeeds){seed=verificationSeed;
   const context=await browser.newContext({viewport:{width:1100,height:1000}});
 allowIntentionalNavigation(context);
   try{
    await context.route(origin+'/**',async route=>{const response=await route.fetch({url:route.request().url().replace(origin,backend)});await route.fulfill({response});});const page=await context.newPage();await page.goto(origin);await page.locator('.exercise-choice[data-exercise-id="'+fixture.id+'"]').click();await ready(page);
    const base={sourceFilePath:fixture.rendererPath,problemSeed:String(seed),_format:'json',isInstructor:'0',showSolutions:'0',showCorrectAnswersButton:'0'};
    const diagnostic=await request({...base,isInstructor:'1'});const names=(await collect(page)).fieldNames;
    if(fixture.id==='dot-product-01'){
     const correct=names.map(name=>[name,String(diagnostic.answers[name].correct_value??diagnostic.answers[name].correct_ans)]);
     await grade(page,fixture,'unanswered',[],{score:0,statuses:names.map(()=>'unanswered'),outcome:'unanswered'});
     await grade(page,fixture,'invalid',[[names[0],'gibberish(']],{score:0,statuses:['invalid','unanswered','unanswered','unanswered'],outcome:'invalid'});
     const wrong=names.map((name,i)=>[name,i===1?'<314159,314159,314159>':'314159']);await grade(page,fixture,'incorrect',wrong,{score:0,statuses:names.map(()=>'incorrect'),outcome:'incorrect'});
     await grade(page,fixture,'overall-partial',[correct[0]],{score:'partial',statuses:['correct','unanswered','unanswered','unanswered'],outcome:'partial'});
     await grade(page,fixture,'mixed-invalid-and-correct',[[names[0],'gibberish('],correct[1]],{score:'partial',statuses:['invalid','correct','unanswered','unanswered'],outcome:'invalid'});
     const saved=await grade(page,fixture,'correct',correct,{score:1,statuses:names.map(()=>'correct'),outcome:'correct'});
     const before=gradeCalls,edited=correct.map(pair=>[...pair]);edited[0][1]='314159';await setPairs(page,edited);await page.locator('#result-stale').waitFor();
     check(await frame(page).locator('[data-practice-feedback][data-status=changed]').count()===1,'ONLY_CHANGED_FIELD_STALE');check(await frame(page).locator('[data-practice-feedback][data-status=correct]').count()===3,'UNCHANGED_FIELDS_RETAIN_RESULT');
     await page.reload();await ready(page);check(same((await collect(page)).entries,edited),'DRAFT_RESTORATION');await page.locator('#result-stale').waitFor();await setPairs(page,correct);await page.locator('#result-stale').waitFor({state:'hidden'});check(gradeCalls===before,'NO_GRADE_FOR_EDITS');
     report.staleChecks.push({id:fixture.id,verificationSeed:seed,onlyEditedFieldOutdated:true,otherFieldsRetained:true,draftAndStaleStateRestored:true,revertingClearsOutdatedState:true,noGradeForEdits:true});
    }else if(fixture.id==='feedback-suppressed-01'){
     const loaded=await request(base),options=[];const visit=n=>{const a=Object.fromEntries((n.attrs??[]).map(a=>[a.name,a.value]));if(n.tagName==='input'&&a.type==='checkbox')options.push([a.name,a.value]);for(const child of n.childNodes??[])visit(child);};visit(parse(loaded.renderedHTML));
     check(options.length<=10,'CHOICE_BOUND');const expected=String(Object.values(diagnostic.answers)[0].correct_value??Object.values(diagnostic.answers)[0].correct_ans??'');let correct;
     const candidates=[options.filter(([,value])=>expected.includes(value)),...Array.from({length:2**options.length},(_,mask)=>options.filter((_,i)=>mask&(1<<i)))];
     for(const pairs of candidates){const data=await request([['sessionJWT',loaded.JWT.session],['_format','json'],['submitAnswers','1'],['answersSubmitted','1'],['isInstructor','0'],...pairs]);if(data.problem_result.score===1){correct=pairs;break;}}
     check(correct,'CHOICE_CALIBRATION');await grade(page,fixture,'suppressed-unanswered',[],{score:0,statuses:['ungraded'],outcome:'ungraded',suppressed:true});
     const wrong=options.find(pair=>!correct.some(([name,value])=>name===pair[0]&&value===pair[1]));check(wrong,'WRONG_CHOICE');await grade(page,fixture,'suppressed-incorrect',[wrong],{score:0,statuses:['ungraded'],outcome:'ungraded',suppressed:true});
     await grade(page,fixture,'suppressed-correct',correct,{score:1,statuses:['ungraded'],outcome:'ungraded',suppressed:true});
     await setPairs(page,[]);await page.locator('#result-stale').waitFor();check(await frame(page).locator('[data-practice-feedback]').getByText(/remains withheld/).count()===1,'SUPPRESSED_STALE');
    }else if(fixture.id==='feedback-equation-01'){
     check(names.length===2,'EQUATION_FIELD_COUNT');
     const saved=await grade(page,fixture,'authored-equation-notation',[[names[1],'1']],{score:0,statuses:['unanswered','incorrect'],outcome:'unanswered'});
     check(saved.data.submission.fieldFeedback[1].message.includes('\\(y = m x + b\\)'),'AUTHORED_TEX_RETAINED');
     const boxes=frame(page).locator('.field-feedback-message .feedback-math[data-math-state=rendered]');
     await boxes.nth(1).waitFor();check(await boxes.count()===2,'AUTHORED_TEX_RENDERED');
     check(await frame(page).locator('.field-feedback-message mjx-assistive-mml').count()===2,'AUTHORED_TEX_ACCESSIBLE');
     check(!/"(?:correct_value|correct_ans|answerJWT|sessionJWT|problemJWT|student_value)"\s*:/.test(JSON.stringify(saved.data)),'NO_PRIVATE_ANSWER_CLAIMS');
     const row=report.cases.at(-1);row.authoredMathPreserved=true;row.twoExpressionsTypesetAfterRefresh=true;row.assistiveMathRetained=true;row.noCorrectAnswerProjection=true;
    }else{
     const name=names[0],value=String(diagnostic.answers[name].correct_value??diagnostic.answers[name].correct_ans),point=value.match(/\{point,\s*\(\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\)\s*\}/);check(point,'PARTIAL_POINT');
     await frame(page).locator('.gt-point-tool').click();
     const position=await frame(page).evaluate(({name,x,y})=>{const board=Object.values(JXG.boards).find(b=>b.containerObj?.id===name+'_graphbox_graph');if(!board)return null;return {x:Math.max(5,Math.min(board.canvasWidth-5,board.origin.scrCoords[1]+x*board.unitX)),y:Math.max(5,Math.min(board.canvasHeight-5,board.origin.scrCoords[2]-y*board.unitY))};},{name,x:Number(point[1]),y:Number(point[2])});
     check(position,'GRAPH_BOARD');await frame(page).locator('#'+name+'_graphbox_graph').click({position});
     await grade(page,fixture,'field-partial',[],{score:'partial',statuses:['partial'],outcome:'partial',alreadyEntered:true});
    }
   }finally{await context.close();}
  }
 }
 report.complete=report.cases.length===22&&report.cases.every(c=>c.passed)&&report.staleChecks.length===2;
 check(report.complete,'CASE_MATRIX');
}catch(error){report.complete=false;report.failure=error.message?.startsWith('QA_FEEDBACK_')?error.message:error.name;process.exitCode=1;}
finally{capturing=false;await browser.close();app.closeAllConnections();await new Promise(resolve=>app.close(resolve));await rm(directory,{recursive:true,force:true});globalThis.fetch=nativeFetch;await mkdir(output,{recursive:true});await writeFile(output+'/feedback-observations.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({complete:report.complete,cases:report.cases.length,staleChecks:report.staleChecks.length,failure:report.failure??null}));}