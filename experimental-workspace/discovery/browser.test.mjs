import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base='http://localhost:3105',backend=process.env.DISCOVERY_BACKEND??'http://linear-algebra-discovery-home-1:3005';
let browser;const observations={version:1,observedAt:new Date().toISOString(),scope:'Real catalog and unchanged practice gateway; temporary anonymous test sessions; sanitized booleans only'};
before(async()=>{browser=await chromium.launch();await mkdir('/qa/artifacts',{recursive:true});});
after(async()=>{await browser?.close();observations.complete=Object.values(observations).filter(v=>typeof v==='boolean').every(Boolean);await writeFile('/qa/artifacts/discovery-observations.json',JSON.stringify(observations,null,2)+'\n');});
async function pageFor(t,viewport={width:1360,height:1000}){
 const context=await browser.newContext({viewport});
 await context.route(base+'/**',async route=>{const response=await route.fetch({url:route.request().url().replace(base,backend)});await route.fulfill({response});});
 t.after(async()=>{await context.unrouteAll({behavior:'ignoreErrors'});await context.close();});const page=await context.newPage();page.setDefaultTimeout(25000);return page;
}
async function settled(page){await page.waitForFunction(()=>document.querySelector('#results').getAttribute('aria-busy')==='false');}
test('home shows real playable subjects and explicit indexed coverage',{timeout:90000},async t=>{
 const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await settled(page);await page.locator('#subjects .subject-card').first().waitFor();
 assert.equal(await page.getByRole('heading',{level:1}).textContent(),'What would you like to practice?');
 assert.equal(await page.locator('.exercise-card .primary').count(),6);assert.equal(await page.locator('.subject-card').count(),4);
 await page.getByRole('button',{name:'Indexed library',exact:true}).click();await settled(page);
 assert.equal(await page.locator('.exercise-card').count(),12);assert.equal(await page.locator('.exercise-card .primary').count(),0);
 assert.match(await page.locator('#coverage').textContent(),/77,134/);
 const first=await page.locator('.exercise-card h3').first().textContent();
 await page.getByRole('button',{name:/Next page/}).click();await settled(page);assert.ok(new URL(page.url()).searchParams.get('cursor'));
 assert.notEqual(await page.locator('.exercise-card h3').first().textContent(),first);
 const url=page.url(),title=await page.locator('.exercise-card h3').first().textContent();
 await page.reload();await settled(page);assert.equal(page.url(),url);assert.equal(await page.locator('.exercise-card h3').first().textContent(),title);
 await page.getByRole('button',{name:'First page'}).click();await settled(page);assert.equal(await page.locator('.exercise-card h3').first().textContent(),first);
 await page.locator('#query').fill('derivative');await page.locator('#query').press('Enter');await settled(page);
 assert.equal(new URL(page.url()).searchParams.get('q'),'derivative');assert.ok(await page.locator('.exercise-card').count()>0);
 await page.goBack();await settled(page);assert.equal(new URL(page.url()).searchParams.has('q'),false);
 assert.deepEqual(errors,[]);observations.realCatalog=true;observations.playableDefault=true;observations.paginationAndShareableUrls=true;observations.browserHistory=true;observations.pageErrorsAbsent=true;
 await page.goto(base);await settled(page);await page.screenshot({path:'/qa/artifacts/discovery-desktop.png',fullPage:true});
});
test('subject and dependent topic filters use real source classifications',{timeout:90000},async t=>{
 const page=await pageFor(t);await page.goto(base+'/?view=library&subject=Linear+algebra');await settled(page);
 assert.equal(await page.locator('#subject').inputValue(),'Linear algebra');
 assert.ok(await page.locator('#chapter option').count()>1);
 const chapter=await page.locator('#chapter option').nth(1).getAttribute('value');await page.locator('#chapter').selectOption(chapter);await settled(page);
 assert.equal(new URL(page.url()).searchParams.get('chapter'),chapter);
 assert.ok(await page.locator('.exercise-card').count()>0);
 assert.ok((await page.locator('.exercise-card .breadcrumb').allTextContents()).every(text=>text.startsWith('Linear algebra / '+chapter)));
 await page.locator('#area').selectOption('OpenProblemLibrary');await settled(page);
 assert.equal(new URL(page.url()).searchParams.get('area'),'OpenProblemLibrary');
 observations.subjectTopicAndAreaFilters=true;
});
test('empty, error, stale cursor, safe text and loading states recover without clearing search',{timeout:90000},async t=>{
 const page=await pageFor(t);await page.goto(base+'/?q=zzzznotarealtopiczzzz');await settled(page);
 await page.getByRole('heading',{name:'No exercises match this search'}).waitFor();
 await page.route('**/api/discovery/search?**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'CATALOG_UNAVAILABLE',message:'The library is temporarily unavailable. Please retry.'}})}));
 await page.locator('#query').fill('vector');await page.locator('#query').press('Enter');await settled(page);
 await page.getByRole('heading',{name:'We could not load this collection'}).waitFor();assert.equal(await page.locator('#query').inputValue(),'vector');
 await page.unroute('**/api/discovery/search?**');await page.getByRole('button',{name:'Retry loading'}).click();await settled(page);assert.ok(await page.locator('.exercise-card').count());
 await page.goto(base+'/?view=library&cursor=bad');await settled(page);await page.getByRole('button',{name:'Restart search'}).click();await settled(page);
 assert.ok(await page.locator('.exercise-card').count());
 await page.route('**/api/discovery/search?**',async route=>{await new Promise(resolve=>setTimeout(resolve,700));await route.fulfill({json:{entries:[{id:'fake',title:'<img src=x onerror=alert(1)>',description:'<script>bad()</script>',canPractice:false,attribution:{authors:[],institutions:[]}}],nextCursor:null}});});
 await page.locator('#query').fill('safe');await page.locator('#query').press('Enter');
 await page.locator('#results[aria-busy=true]').waitFor();await settled(page);
 assert.equal(await page.locator('.exercise-card img,.exercise-card script').count(),0);assert.match(await page.locator('.exercise-card h3').textContent(),/<img/);
 observations.emptyAndErrorRecovery=true;observations.staleCursorRecovery=true;observations.loadingState=true;observations.metadataAsText=true;
});
test('mobile controls and keyboard have visible focus, labels and no horizontal overflow',{timeout:90000},async t=>{
 const page=await pageFor(t,{width:360,height:800});await page.goto(base);await settled(page);
 await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').textContent(),'Skip to mathematics');
 await page.keyboard.press('Enter');await page.getByLabel('Search topics and exercises').focus();await page.keyboard.type('dot product');await page.keyboard.press('Enter');await settled(page);
 assert.match(await page.locator('.exercise-card h3').first().textContent(),/Dot products/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.ok(await page.locator('#results-status[aria-live=polite]').count());
 for(const selector of ['#query','.primary','#subject']){const box=await page.locator(selector).first().boundingBox();assert.ok(box.height>=40);}
 await page.screenshot({path:'/qa/artifacts/discovery-mobile.png',fullPage:true});
 observations.mobile360=true;observations.keyboardAndAnnouncements=true;
});

test('launch, grading, refresh, drafts and owner-checked Continue work through the home origin',{timeout:120000},async t=>{
 const page=await pageFor(t);page.on('dialog',dialog=>dialog.accept());
 await page.goto(base+'/?q=dot+product');await settled(page);
 await page.getByRole('button',{name:'Practice Dot products and vector operations',exact:true}).click();
 await page.waitForURL('**/practice?session=*');
 await page.waitForFunction(()=>document.querySelector('#check-answer')&&!document.querySelector('#check-answer').disabled);await page.locator('#session-status').waitFor({state:'visible'});
 const id=new URL(page.url()).searchParams.get('session');assert.ok(id);
 const field=page.frameLocator('.exercise-frame').locator('[name=AnSwEr0001]');
 await field.fill('0');
 await page.getByRole('button',{name:'Check answer',exact:true}).click();
 await page.locator('#practice-result').waitFor();
 assert.equal(await field.inputValue(),'0');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#check-answer')&&!document.querySelector('#check-answer').disabled);await page.locator('#session-status').waitFor({state:'visible'});
 assert.equal(new URL(page.url()).searchParams.get('session'),id);
 assert.equal(await field.inputValue(),'0');await page.locator('#practice-result').waitFor();
 await field.fill('2');await page.waitForFunction(id=>{const raw=sessionStorage.getItem('practice-draft:v1:'+id);if(!raw)return false;try{return JSON.parse(raw).answers.entries.some(([name,value])=>name==='AnSwEr0001'&&value==='2');}catch{return false;}},id);
 await page.locator('a.brand').click();await page.waitForURL(base+'/');
 await page.locator('#continue-link').waitFor();assert.match(await page.locator('#continue-description').textContent(),/Dot products/);
 await page.getByRole('link',{name:'Resume exercise'}).click();await page.waitForURL('**/practice?session=*');
 await page.waitForFunction(()=>document.querySelector('#check-answer')&&!document.querySelector('#check-answer').disabled);await page.locator('#session-status').waitFor({state:'visible'});
 assert.equal(new URL(page.url()).searchParams.get('session'),id);assert.equal(await field.inputValue(),'2');
 const other=await pageFor(t);await other.goto(base);const foreign=await other.request.get(backend+'/api/sessions/'+id);assert.equal(foreign.status(),404);
 observations.realExerciseLaunch=true;observations.gradingAndRefresh=true;observations.draftsAcrossHomeNavigation=true;observations.ownerCheckedContinue=true;
});
test('failed starts preserve search, prevent duplicate submissions and allow explicit retry',{timeout:90000},async t=>{
 const page=await pageFor(t);await page.goto(base+'/?q=dot+product');await settled(page);let posts=0;
 await page.route('**/api/sessions',async route=>{posts++;await new Promise(resolve=>setTimeout(resolve,400));await route.fulfill({status:503,json:{error:{code:'PRACTICE_UNAVAILABLE',message:'Practice is temporarily unavailable. Your saved work has been kept.'}}});});
 const button=page.getByRole('button',{name:'Practice Dot products and vector operations',exact:true});await button.click();assert.equal(await button.isDisabled(),true);
 await page.locator('#start-error').waitFor();assert.equal(posts,1);assert.equal(new URL(page.url()).searchParams.get('q'),'dot product');assert.equal(await button.isDisabled(),false);
 assert.equal(new URL(page.url()).pathname,'/');
 observations.startFailureAndDuplicateGuard=true;
});

test('partial catalog outage retains practice and unavailable continuation has explicit recovery',{timeout:90000},async t=>{
 const page=await pageFor(t);
 await page.route('**/api/discovery/overview',route=>route.fulfill({json:{practice:{available:true,count:6,subjects:[{subject:'Linear algebra',practice:1}]},library:{available:false,indexed:null,subjects:[]}}}));
 await page.route('**/api/sessions/recent',route=>route.fulfill({json:{status:'temporarily-unavailable',href:'/practice?session=00000000-0000-0000-0000-000000000001'}}));
 await page.goto(base);await settled(page);
 assert.equal(await page.locator('.exercise-card .primary').count(),6);
 await page.getByRole('link',{name:'Open saved session'}).waitFor();assert.match(await page.locator('#continue-description').textContent(),/saved work has been kept/);
 await page.getByRole('button',{name:'Indexed library',exact:true}).click();
 await page.getByRole('heading',{name:'This collection is temporarily unavailable'}).waitFor();
 await page.getByRole('button',{name:'Retry collections',exact:true}).first().waitFor();
 observations.partialOutageAndRecovery=true;
});
