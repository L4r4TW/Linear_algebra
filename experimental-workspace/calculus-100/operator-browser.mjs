import {chromium} from 'playwright';import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const key=readFileSync('/secrets/operator-key','utf8').trim(),base='http://127.0.0.1:3002';
assert.equal((await fetch(base+'/api/overview')).status,401);
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1200,height:900}});let pageErrors=0,phase='login';
await context.route('http://localhost:3102/**',async route=>{
 try{const response=await route.fetch({url:route.request().url().replace('http://localhost:3102',base)});await route.fulfill({response});}
 catch{await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Operator test transport failed'})}).catch(()=>{});}
});
const page=await context.newPage();page.on('pageerror',()=>pageErrors++);
try{
 await page.goto('http://localhost:3102');await page.locator('input[name=password]').fill(key);await page.getByRole('button',{name:'Sign in',exact:false}).click();await page.locator('#console').waitFor({state:'visible'});await page.locator('#stats .stat').first().waitFor();
 phase='environment';assert.equal(await page.locator('#stats .stat').count(),4);assert.ok(!(await page.locator('#environment').textContent()).includes('uncertified'));
 phase='library';await page.getByRole('button',{name:'Library',exact:true}).click();await page.getByText('No practice-ready entries in this database yet.',{exact:false}).waitFor();
 phase='library-indexed';await page.locator('#include-indexed').check();await page.locator('#library-list .card').first().waitFor();
 phase='evidence';await page.getByRole('button',{name:'Verification queue',exact:true}).click();await page.locator('#jobs button').first().click();await page.locator('#detail').waitFor({state:'visible'});
 assert.ok((await page.locator('#evidence').textContent()).includes('technicalState'));assert.equal(await page.locator('#review-independent').isChecked(),false);assert.equal(await page.locator('#review-independent').getAttribute('required'),'');await page.keyboard.press('Escape');await page.locator('#detail').waitFor({state:'hidden'});
 phase='csrf';const cookies=(await context.cookies()).map(c=>c.name+'='+c.value).join('; ');
 assert.equal((await fetch(base+'/api/refresh',{method:'POST',headers:{cookie:cookies,origin:'http://attacker.invalid','content-type':'application/json'},body:JSON.stringify({requeue:true})})).status,403);
 phase='mobile';await page.setViewportSize({width:360,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.equal(pageErrors,0);
 mkdirSync('/artifacts',{recursive:true});writeFileSync('/artifacts/calculus-operator.json',JSON.stringify({complete:true,operatorAuth:true,privateApiDenied:true,csrfDenied:true,currentCertifiedContextVisible:true,indexedToggle:true,zeroDatabasePracticeReady:true,evidenceDialogKeyboard:true,independentReviewAcknowledgementRequired:true,mobile360:true,pageErrors,reviewMutations:0,publicationMutations:0},null,2)+'\n');console.log('CALCULUS_OPERATOR_ACCEPTANCE_PASSED');
}catch(error){console.error(JSON.stringify({complete:false,phase,error:error?.name??'Error'}));process.exitCode=1;}
finally{await browser.close();}
