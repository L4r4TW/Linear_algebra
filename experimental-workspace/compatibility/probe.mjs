import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { createExerciseAssets } from '../application/server/exercise-assets.mjs';
import { problemHtml } from '../application/server/http-app.mjs';
import { getAnswerContract, completeAnswerEntries } from '../application/server/answer-contract.mjs';
import { collectAnswerFields, isAnswerFieldName } from '../application/public/answer-fields.js';
import { buildExerciseDocument } from '../application/public/exercise-frame.js';

const catalog = JSON.parse(await readFile(new URL('./catalog.json', import.meta.url), 'utf8'));
const renderer = process.env.RENDERER_URL ?? 'http://renderer:3000';
const workspace = process.env.WORKSPACE_URL ?? 'http://workspace:3000';
const exerciseAssets = createExerciseAssets({rendererBaseUrl:renderer});
const output = process.env.COMPATIBILITY_OUTPUT ?? '/artifacts';
await mkdir(output, { recursive:true });
const browser = await chromium.launch();
const results = { schemaVersion:1, sourceRevision:catalog.sourceRevision, rendererRevision:catalog.rendererRevision,
  observedAt:new Date().toISOString(), scope:'Operator-only official renderer document in an editor-like same-origin iframe versus actual application projection/frame/bridge; fixtures are not enabled in the student API.', exercises:[] };
function safeUrl(value) { try { const u=new URL(value); return (u.origin+u.pathname).replace(/\/assets\/exercise\/[A-Za-z0-9_-]{43}\//g,'/assets/exercise/[capability]/'); } catch { return value?.split('?')[0]; } }
function safeError(error) { return String(error?.message ?? error).replace(/eyJ[A-Za-z0-9_.-]+/g,'[private token]').slice(0,220); }
async function render(fields) {
  const response=await fetch(renderer+'/render-api',{method:'POST',body:new URLSearchParams(fields),signal:AbortSignal.timeout(30_000)});
  if(!response.ok)throw new Error('Renderer HTTP '+response.status);
  const data=await response.json();
  if(data.flags?.error_flag)throw new Error('PG error_flag='+data.flags.error_flag);
  if(!data.renderedHTML||!data.JWT?.session)throw new Error('Missing renderer content/session');
  if(fields.isInstructor!=='1' && Object.hasOwn(data,'answers'))throw new Error('Unexpected privileged student response');
  return data;
}
const studentFlags={_format:'json',outputFormat:'default',isInstructor:'0',showSolutions:'0',showCorrectAnswersButton:'0'};
async function grade(token,entries){return render([['sessionJWT',token],['_format','json'],['submitAnswers','1'],['answersSubmitted','1'],['isInstructor','0'],['showSolutions','0'],['showCorrectAnswersButton','0'],...entries]);}
async function setupContext() {
  const context=await browser.newContext({viewport:{width:820,height:1000}});
  await context.route('http://localhost:3101/**',async route=>{
    const response=await route.fetch({url:route.request().url().replace('http://localhost:3101',renderer)});
    await route.fulfill({response});
  });
  await context.route('http://localhost:3100/**',async route=>{
    const local=new URL(route.request().url()).pathname.match(/^\/assets\/exercise\/([\w-]{43})\/(\d+)$/);
    if(local){
      try {const asset=await exerciseAssets.read(local[1],local[2]);if(!asset)return route.fulfill({status:404,body:'Unavailable'});return route.fulfill({contentType:asset.contentType,body:asset.body});}
      catch{return route.fulfill({status:502,body:'Unavailable'});}
    }
    const response=await route.fetch({url:route.request().url().replace('http://localhost:3100',workspace)});
    await route.fulfill({response});
  });
  return context;
}
function watch(page){
  const evidence={errors:[],failedRequests:[],httpErrors:[]};
  page.on('pageerror',error=>evidence.errors.push(safeError(error)));
  page.on('requestfailed',request=>evidence.failedRequests.push({url:safeUrl(request.url()),type:request.resourceType(),failure:request.failure()?.errorText}));
  page.on('response',response=>{if(response.status()>=400)evidence.httpErrors.push({url:safeUrl(response.url()),status:response.status()});});
  return evidence;
}
async function inspect(root){return root.evaluate(root=>{
  const fields=[...root.querySelectorAll('input,textarea,select')].map(field=>({
    name:field.name,tag:field.tagName.toLowerCase(),type:field.type,disabled:field.matches(':disabled'),
    visible:field.type!=='hidden'&&Boolean(field.getClientRects().length)&&getComputedStyle(field).visibility!=='hidden',
    options:field.options?.length??0,
  }));
  return {fields,images:[...root.querySelectorAll('img')].map(image=>({src:(image.currentSrc||image.src).startsWith('data:')?'data:[inline]':new URL(image.currentSrc||image.src,document.baseURI).pathname.replace(/\/assets\/exercise\/[A-Za-z0-9_-]{43}\//g,'/assets/exercise/[capability]/'),loaded:image.complete&&image.naturalWidth>0})),
    mathCount:root.querySelectorAll('mjx-container').length,assistiveMathCount:root.querySelectorAll('mjx-assistive-mml math').length,
    inlineScripts:root.querySelectorAll('script:not([src])').length,externalScripts:[...root.querySelectorAll('script[src]')].map(script=>script.src.split('?')[0]),
    graphIconCount:[...root.querySelectorAll('.gt-tool-button')].filter(node=>{const bg=getComputedStyle(node).backgroundImage;return bg!=='none'&&!bg.includes('data:,');}).length,
    mathQuillEditors:root.querySelectorAll('.mq-editable-field').length,graphBoards:root.querySelectorAll('.jxgbox svg').length,scaffoldToggles:root.querySelectorAll('[data-bs-toggle="collapse"],[data-toggle="collapse"]').length,
    popupLinks:root.querySelectorAll('a[target="_blank"]').length,
    pageOverflow:document.documentElement.scrollWidth>innerWidth+1,
  };
});}
async function interact(root,fixture){
  const evidence={textEdits:0,mathQuillEdits:0,radioSelections:0,checkboxSelections:0,selectChanges:0};
  for(const editor of await root.locator('.mq-editable-field').all()){
    if(!await editor.isVisible())continue;
    await editor.click();
    await root.page().keyboard.type('0');
    await root.page().keyboard.press('Tab');
    evidence.mathQuillEdits++;
  }
  for(const field of await root.locator('input:not([type=hidden]),textarea').all()){
    if(!await field.isVisible()||!await field.isEnabled())continue;
    if(await field.evaluate(node=>Boolean(node.closest('.mq-editable-field'))))continue;
    const type=await field.getAttribute('type');
    if(!type||['text','number','search'].includes(type)){
      if(await field.getAttribute('readonly')!==null)continue;
      await field.fill('0');evidence.textEdits++;
    }
  }
  const chosen=new Set();
  for(const field of await root.locator('input[type=radio]').all()){
    const name=await field.getAttribute('name');
    if(!chosen.has(name)&&await field.isVisible()&&await field.isEnabled()){
      await field.check();chosen.add(name);evidence.radioSelections++;
    }
  }
  const checks=new Map();
  for(const field of await root.locator('input[type=checkbox]').all()){
    const name=await field.getAttribute('name');
    if((checks.get(name)??0)<2&&await field.isVisible()&&await field.isEnabled()){
      await field.check();checks.set(name,(checks.get(name)??0)+1);evidence.checkboxSelections++;
    }
  }
  for(const field of await root.locator('select').all()){
    if(!await field.isVisible()||!await field.isEnabled())continue;
    const value=await field.locator('option:not([disabled])').last().getAttribute('value');
    if(value!==null){await field.selectOption(value);evidence.selectChanges++;}
  }
  if(fixture.interaction==='scaffold'){
    const toggle=root.locator('[data-bs-toggle="collapse"],[data-toggle="collapse"]').first();
    evidence.scaffold={present:await toggle.count()>0,changed:false};
    if(evidence.scaffold.present){
      const before=await toggle.getAttribute('aria-expanded');
      await toggle.click({timeout:3000});
      await root.page().waitForTimeout(400);
      evidence.scaffold.changed=(await toggle.getAttribute('aria-expanded'))!==before;
    }
  }
  if(fixture.interaction==='graph-tool'){
    const board=root.locator('.jxgbox').first();
    evidence.graph={boardPresent:await board.count()>0,svgPresent:await root.locator('.jxgbox svg').count()>0,pointAction:false};
    const tool=root.getByRole('button',{name:/point/i}).first();
    if(await tool.count()&&await tool.isVisible())await tool.click({timeout:3000});
    if(evidence.graph.svgPresent){await board.click({position:{x:150,y:150},timeout:3000});evidence.graph.pointAction=true;}
  }
  return evidence;
}
async function browserProbe(fixture,seed,data,projection){
  const prepared=exerciseAssets.prepare({html:data.renderedHTML,resources:data.resources,identity:fixture.id+':'+seed});
  projection=prepared.project(projection);
  const refContext=await setupContext(),appContext=await setupContext();
  try{
    const reference=await refContext.newPage(),app=await appContext.newPage();
    const referenceEvents=watch(reference),appEvents=watch(app);
    const query=new URLSearchParams({sourceFilePath:fixture.rendererPath,problemSeed:String(seed),_format:'html',outputFormat:'default',isInstructor:'0',showSolutions:'0',showCorrectAnswersButton:'0'});
    await reference.route('http://localhost:3101/__compatibility',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><title>Official renderer reference</title><body style="margin:0"><iframe id="rendered-problem" title="Official renderer problem" style="display:block;width:100%;height:1800px;border:0" src="http://localhost:3101/render-api?'+query.toString().replaceAll('&','&amp;')+'"></iframe></body></html>'}));
    await reference.goto('http://localhost:3101/__compatibility',{waitUntil:'domcontentloaded',timeout:30_000});
    await reference.frameLocator('#rendered-problem').locator('#problem_body').waitFor({timeout:8000});
    const refDocument=reference.frames().find(frame=>frame.parentFrame()&&frame.url().startsWith('http://localhost:3101/render-api'));
    if(!refDocument)throw new Error('Missing official reference frame');
    await refDocument.addScriptTag({content:`window.isAnswerFieldName=${isAnswerFieldName.toString()};window.collectAnswerFields=${collectAnswerFields.toString()};`});
    const channel=randomUUID();
    const frameDocument=buildExerciseDocument({html:projection,channel,dependencies:prepared.dependencies,mathjaxUrl:'http://localhost:3100/assets/mathjax/tex-svg.js'});
    await app.route('http://localhost:3100/__compatibility',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><title>Compatibility probe</title><body style="margin:0"><iframe title="Compatibility exercise" sandbox="allow-scripts" style="display:block;width:100%;height:360px;border:0"></iframe></body></html>'}));
    await app.goto('http://localhost:3100/__compatibility');
    await app.evaluate(async({frameDocument,channel})=>{
      const {createAnswerBridge}=await import('/assets/answer-bridge.js');
      const frame=document.querySelector('iframe');
      window.compatibilityBridge=createAnswerBridge({frame,channel});
      window.addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.origin!=='null'||event.data?.channel!==channel)return;const height=event.data.height;if(Number.isFinite(height)&&height>0)frame.style.height=Math.max(280,Math.min(3000,height))+'px';if(['ready','math-error','resource-error'].includes(event.data.type))window.compatibilityReady=event.data.type;});
      frame.srcdoc=frameDocument;
    },{frameDocument,channel});
    await app.waitForFunction(()=>window.compatibilityReady,{timeout:22_000});
    await reference.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});
    const refRoot=reference.frameLocator('#rendered-problem').locator('#problem_body'),appRoot=app.frameLocator('iframe').locator('#problem_body');
    const referenceInitial=await inspect(refRoot),appInitial=await inspect(appRoot);
    const referenceHeight=await refDocument.locator('body').evaluate(body=>body.scrollHeight);
    await reference.locator('#rendered-problem').evaluate((frame,height)=>{frame.style.height=Math.max(280,Math.min(3000,height))+'px';},referenceHeight);
    await reference.locator('#rendered-problem').screenshot({path:output+'/'+fixture.id+'-reference.png'});
    await app.locator('iframe').screenshot({path:output+'/'+fixture.id+'-app.png'});
    const referenceInteraction=await interact(refRoot,fixture);
    const appInteraction=await interact(appRoot,fixture);
    // Native submission runs upstream submit helpers, including MathQuill/graph state synchronization.
    const officialResponse=reference.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/render-api');
    await refDocument.locator('[name=submitAnswers]').click({timeout:8000});
    const submittedResponse=await officialResponse;
    if(!submittedResponse.ok())throw new Error('Official browser submit HTTP '+submittedResponse.status());
    await refDocument.waitForLoadState('domcontentloaded');
    await refDocument.locator('#problem-result-score').waitFor({state:'attached',timeout:8000});
    const officialScore=Number(await refDocument.locator('#problem-result-score').inputValue());
    await refDocument.addScriptTag({content:`window.isAnswerFieldName=${isAnswerFieldName.toString()};window.collectAnswerFields=${collectAnswerFields.toString()};`});
    const referenceAnswers=await refDocument.evaluate(()=>collectAnswerFields(document.getElementById('problem_body')));
    const appAnswers=await app.evaluate(()=>window.compatibilityBridge.collect());
    const contract=getAnswerContract(data.renderedHTML);
    let appGrade;
    try{
      const complete=completeAnswerEntries(appAnswers.entries,contract);
      const graded=await grade(data.JWT.session,complete);
      const restored=await render({_format:'json',sessionJWT:graded.JWT.session});
      appGrade={accepted:true,score:graded.problem_result.score,restoredScore:restored.problem_result.score,restorationReturnedProblem:Boolean(problemHtml(restored.renderedHTML))};
    }catch(error){appGrade={accepted:false,error:safeError(error)};}

    const changedHidden=await appRoot.evaluate(root=>[...root.querySelectorAll('input[type=hidden]')].filter(input=>input.name&&!input.name.startsWith('MaThQuIlL_')&&input.value).length);
    return {reference:{initial:referenceInitial,interaction:referenceInteraction,answerNames:referenceAnswers.fieldNames,entryCount:referenceAnswers.entries.length,score:officialScore,...referenceEvents},
      application:{initial:appInitial,interaction:appInteraction,answerNames:appAnswers.fieldNames,entryCount:appAnswers.entries.length,nonemptyHiddenAnswers:changedHidden,grade:appGrade,...appEvents},
      sameCollectedNames:JSON.stringify(referenceAnswers.fieldNames)===JSON.stringify(appAnswers.fieldNames),sameSampleAnswers:JSON.stringify(referenceAnswers.entries)===JSON.stringify(appAnswers.entries)};
  }finally{await refContext.close();await appContext.close();}
}
try{
 for(const fixture of catalog.exercises){
  const row={id:fixture.id,subject:fixture.subject,requiredCapabilities:fixture.requiredCapabilities,sourceVerified:false,seeds:[]};
  try{
   const source=await readFile('/opl/webwork-open-problem-library/'+fixture.source.path);
   assert.equal(createHash('sha256').update(source).digest('hex'),fixture.source.sha256);
   row.sourceVerified=true;
   for(const seed of catalog.verificationSeeds){
    const observation={seed};
    try{
     const data=await render({...studentFlags,sourceFilePath:fixture.rendererPath,problemSeed:String(seed)});
     const projection=problemHtml(data.renderedHTML);
     observation.renderer={rendered:true,answerNames:[...getAnswerContract(data.renderedHTML).keys()],assets:(data.resources?.assets??[]).filter(value=>typeof value==='string').map(safeUrl),headerScripts:(data.renderedHTML.match(/<script\b[^>]*src=/g)??[]).length,headerStyles:(data.renderedHTML.match(/<link\b[^>]*stylesheet/g)??[]).length,bodyBytes:projection.length};
     if(seed===catalog.verificationSeeds[0])observation.browser=await browserProbe(fixture,seed,data,projection);
     else {
      const fields=completeAnswerEntries([],getAnswerContract(data.renderedHTML));
      const graded=await grade(data.JWT.session,fields);
      const restored=await render({_format:'json',sessionJWT:graded.JWT.session});
      observation.blankSubmission={score:graded.problem_result.score,restoredScore:restored.problem_result.score};
     }
    }catch(error){observation.error=safeError(error);}
    row.seeds.push(observation);
   }
  }catch(error){row.error=safeError(error);}
  results.exercises.push(row);
  await writeFile(output+'/results.json',JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify({id:row.id,seeds:row.seeds.map(seed=>({seed:seed.seed,error:seed.error??null,browser:Boolean(seed.browser),appErrors:seed.browser?.application.errors.length,appScore:seed.browser?.application.grade.score}))}));
 }
}finally{await browser.close();}
results.complete=true;
await writeFile(output+'/results.json',JSON.stringify(results,null,2)+'\n');
console.log('Compatibility observations saved; unsupported behavior is evidence, not a reason to loosen isolation.');
