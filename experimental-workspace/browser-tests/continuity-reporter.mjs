// Sanitized Node test reporter: test names/status only, never assertions, entered values or network error bodies.
import {mkdir,writeFile,rename} from 'node:fs/promises';
export default async function* (events){
 const cases=[];for await(const event of events){if(!['test:pass','test:fail'].includes(event.type))continue;const passed=event.type==='test:pass',name=String(event.data.name).replace(/[\r\n]/g,' ').slice(0,300);cases.push({name,passed});yield (passed?'PASS ':'FAIL ')+name+'\n';}
 const runtimeFingerprint=process.env.PRACTICE_RUNTIME_FINGERPRINT;if(!/^[a-f0-9]{64}$/.test(runtimeFingerprint??''))throw Error('Missing verified application fingerprint');
 const report={schemaVersion:1,observedAt:new Date().toISOString(),runtimeFingerprint,scope:'Chromium browser suite against the normal owned-session practice application. Static test names and status only; no private response data.',cases,passed:cases.filter(c=>c.passed).length,failed:cases.filter(c=>!c.passed).length,complete:cases.length>0&&cases.every(c=>c.passed)};
 await mkdir('/artifacts',{recursive:true});await writeFile('/artifacts/practice-suite-observations.tmp',JSON.stringify(report,null,2)+'\n');await rename('/artifacts/practice-suite-observations.tmp','/artifacts/practice-suite-observations.json');yield JSON.stringify({tests:cases.length,passed:report.passed,failed:report.failed})+'\n';
}