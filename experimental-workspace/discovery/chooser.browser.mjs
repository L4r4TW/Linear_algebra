import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base='http://localhost:3105',backend='http://linear-algebra-discovery-home-1:3005';
let browser;const observations={version:1,observedAt:new Date().toISOString(),scope:'Task 9 real catalog chooser and temporary owned prototype session; no activation or account assertions'};
before(async()=>{browser=await chromium.launch();await mkdir('/qa/artifacts',{recursive:true});});
after(async()=>{await browser?.close();observations.complete=['desktopColumns','dependentSelection','urlHistory','mobileStack','keyboard','missingMetadata','staleRecovery','definedPlanStart','blockedStorageNoStart','libraryNoPractice'].every(key=>observations[key]===true);await writeFile('/qa/artifacts/chooser-observations.json',JSON.stringify(observations,null,2)+'\n');});
async function pageFor(t,viewport={width:1280,height:900}){
 const context=await browser.newContext({viewport});await context.route(base+'/**',async route=>{const response=await route.fetch({url:route.request().url().replace(base,backend)});await route.fulfill({response});});
 t.after(async()=>{await context.unrouteAll({behavior:'ignoreErrors'});await context.close();});const page=await context.newPage();page.setDefaultTimeout(25000);return page;
}
const ready=page=>page.waitForFunction(()=>document.querySelector('#topic-columns')?.getAttribute('aria-busy')==='false');
test('desktop chooser preserves dependent URL selections, counts and keyboard access',{timeout:90000},async t=>{
 const page=await pageFor(t);await page.goto(base+'/browse?view=library');await ready(page);
 const columns=await page.locator('.topic-column').all();const boxes=await Promise.all(columns.map(c=>c.boundingBox()));assert.ok(boxes[0].x<boxes[1].x&&boxes[1].x<boxes[2].x);
 await page.locator('#subject-options button').filter({hasText:'Linear algebra'}).click();await ready(page);
 assert.equal(new URL(page.url()).searchParams.get('subject'),'Linear algebra');assert.ok(await page.locator('#chapter-options button').count()>0);
 const chapter=await page.locator('#chapter-options button').first().getAttribute('data-label');
 await page.locator('#chapter-options button').first().click();await ready(page);
 assert.equal(new URL(page.url()).searchParams.get('chapter'),chapter);assert.ok(await page.locator('#section-options button').count()>0);
 await page.locator('#section-options button').first().click();await ready(page);
 const url=page.url(),breadcrumb=await page.locator('#topic-breadcrumb').textContent();assert.ok(new URL(url).searchParams.get('section'));
 await page.reload();await ready(page);assert.equal(await page.locator('#topic-breadcrumb').textContent(),breadcrumb);
 await page.goBack();await ready(page);assert.equal(new URL(page.url()).searchParams.has('section'),false);await page.goForward();await ready(page);assert.equal(page.url(),url);
 assert.equal(await page.locator('#topic-start').isDisabled(),true);
 await page.locator('#subject-options button').first().focus();await page.keyboard.press('ArrowDown');assert.ok(await page.locator('#subject-options button').nth(1).evaluate(el=>el===document.activeElement));
 assert.ok(await page.locator('#topic-announcement[aria-live=polite]').count());
 observations.desktopColumns=true;observations.dependentSelection=true;observations.urlHistory=true;observations.keyboard=true;observations.libraryNoPractice=true;
 await page.screenshot({path:'/qa/artifacts/chooser-desktop.png',fullPage:true});
});
test('stacked mobile columns and uneven practice metadata remain usable',{timeout:90000},async t=>{
 const page=await pageFor(t,{width:360,height:800});await page.goto(base+'/browse?subject=Linear+algebra');await ready(page);
 await page.locator('#chapter-options button').first().click();await ready(page);
 assert.equal(await page.locator('#section-options button').count(),0);assert.match(await page.locator('#section-note').textContent(),/No further levels/);
 assert.equal(await page.locator('#topic-start').isDisabled(),false);
 const boxes=await Promise.all((await page.locator('.topic-column').all()).map(c=>c.boundingBox()));assert.ok(boxes[0].y<boxes[1].y&&boxes[1].y<boxes[2].y);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'/qa/artifacts/chooser-mobile.png',fullPage:true});observations.mobileStack=true;observations.missingMetadata=true;
});
test('invalid topics reset and filtering is shareable without clearing selection',{timeout:90000},async t=>{
 const page=await pageFor(t);await page.goto(base+'/browse?subject=Removed+subject');await ready(page);
 await page.getByRole('button',{name:'Reset selections',exact:true}).click();await ready(page);
 assert.equal(new URL(page.url()).searchParams.has('subject'),false);
 await page.locator('#subject-find').fill('linear');await page.waitForURL('**subjectFind=linear');await ready(page);
 assert.equal(await page.locator('#subject-options button').count(),1);await page.locator('#subject-options button').click();await ready(page);
 assert.equal(new URL(page.url()).searchParams.get('subject'),'Linear algebra');observations.staleRecovery=true;
});
test('Practice saves a bounded exact plan before starting its first owned session',{timeout:90000},async t=>{
 const page=await pageFor(t);await page.goto(base+'/browse?subject=Linear+algebra');await ready(page);
 await page.locator('#topic-start').click();await page.waitForURL('**/practice?session=*');
 await page.waitForFunction(()=>document.querySelector('#check-answer')&&!document.querySelector('#check-answer').disabled);
 const sessionId=new URL(page.url()).searchParams.get('session');
 const stored=await page.evaluate(id=>{const planId=sessionStorage.getItem('mathpractice.session-plan.'+id);return JSON.parse(sessionStorage.getItem('mathpractice.plan.'+planId));},sessionId);
 assert.equal(stored.total,1);assert.equal(stored.items[0].exerciseId,'dot-product-01');assert.equal(stored.items[0].sessionId,sessionId);assert.equal(stored.policy.maximum,20);
 observations.definedPlanStart=true;
});
test('blocked plan storage never starts a renderer session',{timeout:90000},async t=>{
 const page=await pageFor(t);await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Storage blocked','SecurityError');};});
 let starts=0;page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/sessions')starts++;});
 await page.goto(base+'/browse?subject=Linear+algebra');await ready(page);await page.locator('#topic-start').click();await page.locator('#plan-error').waitFor();assert.equal(starts,0);assert.equal(new URL(page.url()).pathname,'/browse');
 observations.blockedStorageNoStart=true;
});
