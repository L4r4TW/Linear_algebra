import {chromium} from 'playwright';import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';
const key=readFileSync('/secrets/operator-key','utf8').trim(),base='http://127.0.0.1:3002';
assert.equal((await fetch(base+'/api/overview')).status,401);
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1200,height:900}});
await context.route('http://localhost:3102/**',async route=>{const response=await route.fetch({url:route.request().url().replace('http://localhost:3102',base)});await route.fulfill({response});});
const page=await context.newPage();let pageErrors=0;page.on('pageerror',()=>pageErrors++);
try{
 await page.goto('http://localhost:3102');await page.locator('input[name=password]').fill(key);await page.getByRole('button',{name:'Sign in',exact:false}).click();
 await page.locator('#console').waitFor({state:'visible'});await page.locator('#stats .stat').first().waitFor();
 assert.equal(await page.locator('#stats .stat').count(),4);assert.ok((await page.locator('#environment').textContent()).includes('uncertified'));
 await page.getByRole('button',{name:'Library',exact:true}).click();await page.getByText('No practice-ready entries in this database yet.',{exact:false}).waitFor();
 await page.locator('#include-indexed').check();await page.locator('#library-list .card').first().waitFor();assert.ok(await page.locator('#library-list .card').count()>0);
 await page.locator('#library-query').fill('"><script>throw new Error(1)</script>');await page.getByRole('button',{name:'Search library',exact:true}).click();await page.waitForTimeout(100);
 await page.getByRole('button',{name:'Verification queue',exact:true}).click();await page.locator('#jobs button').first().click();await page.locator('#detail').waitFor({state:'visible'});
 assert.ok((await page.locator('#evidence').textContent()).includes('technicalState'));await page.keyboard.press('Escape');await page.locator('#detail').waitFor({state:'hidden'});
 const cookies=(await context.cookies()).map(c=>c.name+'='+c.value).join('; ');
 assert.equal((await fetch(base+'/api/refresh',{method:'POST',headers:{cookie:cookies,origin:'http://attacker.invalid','content-type':'application/json'},body:'{"requeue":true}'})).status,403);
 await page.setViewportSize({width:360,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 assert.equal(pageErrors,0);
 writeFileSync('/tmp/dashboard-observations.json',JSON.stringify({operatorAuth:true,privateApiDenied:true,csrfDenied:true,indexedToggle:true,practiceReadyDefault:true,evidenceDialogKeyboard:true,mobile360:true,pageErrors,complete:true},null,2));
 console.log('PASS: authenticated desktop/mobile dashboard, library toggle, evidence dialog, CSRF and no script execution.');
}finally{await browser.close();}
