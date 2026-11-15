// Regression-only helpers. No private answers, cookies, HTML or JWTs are reported.
const check=(ok,code)=>{if(!ok)throw new Error('QA_'+code);};
const frameOf=page=>page.frames().find(frame=>frame.parentFrame());
const collect=page=>page.evaluate(async()=>{const p=await import('/assets/picker.js');return (await p.collectCurrentAnswers()).answers;});
export async function renderingAudit(page,fixture){
 const result=await frameOf(page).evaluate(async()=>{
  let mathEngineReady=false;try{if(window.MathJax?.startup?.promise){await MathJax.startup.promise;mathEngineReady=Boolean(MathJax.startup.document);}}catch{}
  const root=document.getElementById('problem_body');return {
   problemPresent:Boolean(root),mathEngineReady,unprocessedMathMarkers:[...root.querySelectorAll('script')].filter(n=>n.type.startsWith('math/tex')).length,mathCount:root.querySelectorAll('mjx-container').length,
   imageCount:root.querySelectorAll('img').length,imagesLoaded:[...root.querySelectorAll('img')].every(n=>n.complete&&n.naturalWidth>0),
   graphBoards:root.querySelectorAll('.jxgbox svg').length,
   sandboxed:window.origin==='null'
  };
 });
 check(result.problemPresent&&result.imagesLoaded&&result.sandboxed,'RENDERING');
 if(fixture.requiredCapabilities.includes('mathjax'))check(result.mathEngineReady&&result.unprocessedMathMarkers===0,'MATH_RENDERING');
 if(fixture.interaction==='graph-tool')check(result.graphBoards>0,'GRAPH_RENDERING');
 return result;
}
export async function keyboardAudit(page,fixture){
 const frame=frameOf(page);
 const expected=await frame.evaluate(()=>{
  const root=document.getElementById('problem_body');
  const names=[...root.querySelectorAll('input,textarea,select')].filter(n=>isAnswerFieldName(n.name)&&!n.matches(':disabled')&&n.type!=='hidden'&&n.getClientRects().length).map(n=>n.name);
  if(root.querySelector('.graphtool-container'))names.push(...[...root.querySelectorAll('.graphtool-outer-container input[type=hidden]')].filter(n=>isAnswerFieldName(n.name)).map(n=>n.name));
  return [...new Set(names)];
 });
 await page.getByRole('button',{name:/return to answers/i}).focus();await page.keyboard.press('Enter');
 await frame.waitForFunction(()=>document.hasFocus()&&document.getElementById('problem_body').contains(document.activeElement),null,{timeout:5000});
 const visited=new Set(),types=new Set();
 for(let i=0;i<100&&visited.size<expected.length;i++){
  const active=await frame.evaluate(()=>{
   if(!document.hasFocus())return {};
   const n=document.activeElement,graph=n?.closest('.graphtool-container');
   return {name:n?.name,tag:n?.tagName,type:n?.type,graph:graph?.id?.replace(/_graphbox$/,'')};
  });
  if(expected.includes(active.name)&&!visited.has(active.name)){
   visited.add(active.name);types.add(active.type);
   if(['text','number','search'].includes(active.type)){await page.keyboard.type('0');await page.keyboard.press('Control+A');await page.keyboard.press('Backspace');}
   else if(active.type==='checkbox'){await page.keyboard.press('Space');}
   else if(active.type==='radio'){await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');}
   else if(active.tag==='SELECT'){await page.keyboard.press('ArrowDown');await page.keyboard.press('Escape');}
  }
  if(expected.includes(active.graph))visited.add(active.graph);
  if(visited.size<expected.length)await page.keyboard.press('Tab');
 }
 check(expected.every(name=>visited.has(name)),'KEYBOARD_FIELD_REACHABILITY');
 let graphPlotted=false;
 if(fixture.interaction==='graph-tool'){
  let reached=false;
  for(let i=0;i<20;i++){
   if(await frame.locator('.gt-point-tool').evaluate(n=>n===document.activeElement)){reached=true;break;}
   await page.keyboard.press('Tab');
  }
  check(reached,'GRAPH_TOOL_TAB_REACHABILITY');
  await page.keyboard.press('Enter');await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
  check((await collect(page)).entries.some(([,value])=>value.length),'GRAPH_KEYBOARD_PLOT');graphPlotted=true;
  await frame.getByRole('button',{name:'Clear',exact:true}).focus();await page.keyboard.press('Enter');
  await frame.getByRole('button',{name:'Yes',exact:true}).waitFor();await frame.getByRole('button',{name:'Yes',exact:true}).focus();await page.keyboard.press('Enter');
  check((await collect(page)).entries.every(([,value])=>!value),'GRAPH_KEYBOARD_CLEAR');
 }
 return {passed:true,reachableFieldCount:visited.size,expectedFieldCount:expected.length,editedControlTypes:[...types],graphPlotted};
}
export async function mobileAudit(page){
 const frame=frameOf(page),measure=await frame.evaluate(()=>({frameWidth:innerWidth,contentWidth:document.documentElement.scrollWidth,horizontalFrameScroll:document.documentElement.scrollWidth>innerWidth+1}));
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'MOBILE_OUTER_OVERFLOW');
 const types=[];
 const controls=frame.locator('#problem_body input:not([type=hidden]),#problem_body select,#problem_body textarea');
 for(const field of await controls.all()){
  if(!await field.isVisible()||!await field.isEnabled())continue;
  const type=await field.evaluate(n=>n.type);
  if(types.includes(type))continue;
  if(await field.evaluate(n=>Boolean(n.closest('.graphtool-outer-container,.jxgbox'))))continue;
  await field.tap();if(type==='select-one')await page.keyboard.press('Escape');types.push(type);
 }
 if(await frame.locator('.gt-point-tool').count()){
  await frame.locator('.gt-point-tool').tap();await page.keyboard.press('Escape');types.push('graph-tool');
 }
 return {...measure,passed:true,touchControlTypes:types};
}
export async function retryAudit({page,injectFailure,recordFor,id,gradeCount,backend,ready,restored}){
 const before=await recordFor(id),answers=await collect(page),calls=gradeCount();
 injectFailure();
 const failedResponse=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/answers'));
 await page.locator('#check-answer').focus();await page.keyboard.press('Enter');
 check((await failedResponse).status()===503,'INJECTED_FAILURE_HTTP');
 await page.locator('#submission-error').waitFor({state:'visible'});await ready(page);
 check(JSON.stringify((await collect(page)).entries)===JSON.stringify(answers.entries),'FAILURE_INPUT_PRESERVATION');
 check((await recordFor(id)).lastSubmission.id===before.lastSubmission.id,'FAILED_GRADE_SAVED');
 await page.waitForTimeout(150);check(gradeCount()===calls+1,'AUTOMATIC_GRADE_RETRY');
 const retryResponse=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/answers'));
 await page.locator('#check-answer').focus();await page.keyboard.press('Enter');check((await retryResponse).status()===200,'EXPLICIT_RETRY');await ready(page);
 const retried=await recordFor(id);check(retried.submissionCount===before.submissionCount+1,'RETRY_COUNT');
 let accepted=false;
 const handler=async route=>{
  try{const response=await route.fetch({url:route.request().url().replace('http://localhost:3100',backend)});accepted=response.status()===200;await route.abort('failed');}
  catch{accepted=false;await route.abort('failed').catch(()=>{});}
 };
 const pattern='**/api/sessions/*/answers';await page.route(pattern,handler);
 try{
  await page.locator('#check-answer').focus();await page.keyboard.press('Enter');await page.locator('#submission-error').waitFor({state:'visible'});check(await page.locator('#check-answer').isDisabled(),'UNCERTAIN_GRADE_REQUIRES_RECONCILIATION');
 }finally{await page.unroute(pattern,handler);}
 check(accepted,'LOST_RESPONSE_NOT_ACCEPTED');
 check(JSON.stringify((await collect(page)).entries)===JSON.stringify(answers.entries),'LOST_RESPONSE_INPUTS');
 const saved=await recordFor(id);check(saved.submissionCount===retried.submissionCount+1,'LOST_RESPONSE_SAVED_ONCE');
 await page.locator('#submission-error').getByRole('button',{name:'Reload saved session',exact:true}).click();await ready(page);
 await restored(page,id,answers,saved.lastSubmission,{reload:false});
 return {passed:true,failedGradeUnchanged:true,inputsPreserved:true,noAutomaticRetry:true,explicitRetrySavedOnce:true,lostResponseRecoveredWithoutRegrading:true};
}
