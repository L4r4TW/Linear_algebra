// Headless checks of the generated local preview only; no application API or renderer requests.
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch();const errors=[],requests=[];
try{const page=await browser.newPage({viewport:{width:1100,height:900}});page.on('pageerror',e=>errors.push(e.name));page.on('console',m=>{if(m.type()==='error')errors.push('console-error');});page.on('request',r=>requests.push(r.url()));
 await page.setContent(globalThis.metadataPreviewHtml);
 await page.locator('#cards article').nth(5).waitFor();assert.equal(await page.locator('#cards article').count(),6);
 await page.getByRole('searchbox',{name:'Search titles, topics and reviewed terms'}).fill('scalar product');assert.equal(await page.locator('#cards article').count(),1);await page.locator('summary').press('Enter');await page.getByText('Exercise language: Not recorded',{exact:true}).waitFor();await page.getByText('Difficulty: Not rated',{exact:true}).waitFor();assert.equal(await page.locator('article a').getAttribute('rel'),'noopener noreferrer');
 await page.locator('#query').fill('matrix');assert.equal(await page.locator('#cards article').count(),0);await page.getByRole('checkbox',{name:'Include unavailable examples'}).press('Space');assert.equal(await page.locator('#cards article').count(),1);await page.getByText('Not available for practice',{exact:true}).waitFor();
 await page.locator('#query').fill('');assert.equal(await page.locator('#cards article').count(),11);await page.setViewportSize({width:360,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await page.locator('#status').getAttribute('aria-live'),'polite');assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 console.log(JSON.stringify({result:'PASS',observedAt:new Date().toISOString(),scope:'Generated preview only',initialCards:6,indexedCards:11,search:true,unavailableFilter:true,keyboardDisclosure:true,unknownValues:true,cspNoErrors:true,noNetworkRequests:true,narrowViewport:360}));
}finally{await browser.close();}
