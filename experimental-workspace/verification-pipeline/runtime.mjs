import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {chromium} from 'playwright';
let cached;
export function workerRuntime(){return cached??=(function(){
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 return {node:process.version,platform:process.platform,arch:process.arch,
 playwright:JSON.parse(readFileSync('/qa/node_modules/playwright/package.json','utf8')).version,
 parse5:JSON.parse(readFileSync('/qa/node_modules/parse5/package.json','utf8')).version,
 browserBinaryDigest:sha(readFileSync(chromium.executablePath()))};
})();}
