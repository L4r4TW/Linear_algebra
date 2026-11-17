import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {chromium} from 'playwright';
let remote=null,revision=0,writes=0,fail=false;
const app=createServer(async(req,res)=>{
 res.setHeader('Content-Type',req.url==='/module.js'?'text/javascript':req.url.startsWith('/api/')?'application/json':'text/html');
 if(req.url==='/module.js')return res.end(await readFile(new URL('../application/public/account-sync.js',import.meta.url)));
 if(req.url==='/api/sessions/account/status')return res.end(JSON.stringify({account:{authenticated:true}}));
 if(req.url.startsWith('/api/')){
  if(req.method==='GET')return res.end(JSON.stringify({draft:remote}));
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const input=JSON.parse(Buffer.concat(chunks));writes++;
  if(fail){res.statusCode=503;return res.end(JSON.stringify({error:{code:'ACCOUNT_UNAVAILABLE'}}));}
  if(input.revision!==revision){res.statusCode=409;return res.end(JSON.stringify({error:{code:'DRAFT_CONFLICT'}}));}
  remote={...input,revision:++revision};return res.end(JSON.stringify({draft:remote}));
 }
 res.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body><p id="status" role="status"></p><input id="work"><script type="module">import {createAccountDraftSync} from "/module.js";window.start=async(local="")=>{work.value=local;window.sync=createAccountDraftSync({sessionId:"00000000-0000-4000-8000-000000000001",container:document.getElementById("status"),current:()=>({entries:[["AnSwEr0001",work.value]]}),isCurrent:()=>true,restore:async entries=>{work.value=entries[0][1];}});await sync.initialize(null,{entries:[["AnSwEr0001",local]]});};</script></body></html>');
});
await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch(),base='http://127.0.0.1:'+app.address().port,report={version:1,observedAt:new Date().toISOString(),scope:'Browser draft-coordinator race/recovery checks with controlled account endpoints; separate from live PG acceptance'};
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const start=async(value='')=>{await page.goto(base);await page.waitForFunction(()=>typeof window.start==='function');await page.evaluate(value=>start(value),value);};
 remote={revision:1,baseAttemptId:null,entries:[['AnSwEr0001','remote work']]};revision=1;
 await start();assert.equal(await page.locator('#work').inputValue(),'remote work');report.emptyTabRestoresAccountDraft=true;
 await start('local work');await page.getByRole('button',{name:'Keep this tab\'s answers'}).waitFor();assert.equal(await page.locator('#work').inputValue(),'local work');
 await page.getByRole('button',{name:'Keep this tab\'s answers'}).click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('saved to your account'));assert.equal(remote.entries[0][1],'local work');report.conflictRequiresExplicitChoice=true;
 remote={revision:++revision,baseAttemptId:null,entries:[['AnSwEr0001','other device']]};
 await page.evaluate(()=>{work.value='fresh local';sync.save({entries:[['AnSwEr0001',work.value]]},null);return sync.flush();});
 await page.getByRole('button',{name:'Use account draft'}).waitFor();assert.equal(await page.locator('#work').inputValue(),'fresh local');assert.equal(remote.entries[0][1],'other device');
 await page.getByRole('button',{name:'Use account draft'}).click();await page.waitForFunction(()=>work.value==='other device');report.concurrentSaveDoesNotOverwrite=true;
 fail=true;await page.evaluate(()=>{work.value='retained';sync.save({entries:[['AnSwEr0001',work.value]]},null);return sync.flush();});
 await page.getByRole('button',{name:'Retry account draft'}).waitFor();assert.equal(await page.locator('#work').inputValue(),'retained');report.failureRetainsTabWork=true;
 const before=writes;await page.evaluate(()=>{sync.save({entries:[['AnSwEr0001','late']]},null);sync.dispose();});await page.waitForTimeout(700);assert.equal(writes,before);report.disposalCancelsPendingSave=true;
 assert.deepEqual(errors,[]);report.complete=true;await mkdir('/artifacts',{recursive:true});await writeFile('/artifacts/draft-sync-observations.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({complete:true,checks:5}));
}finally{await browser.close();await new Promise(resolve=>app.close(resolve));}
