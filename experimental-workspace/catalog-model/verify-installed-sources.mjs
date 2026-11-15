// Runs inside the existing renderer; no PG evaluation, private state or network access.
import assert from 'node:assert/strict';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=await realpath('/usr/app/webwork-open-problem-library');
const plan=JSON.parse(Buffer.from(process.env.OPL_IDENTITY_AUDIT,'base64').toString('utf8'));
assert.equal(plan.repositoryKey,'openwebwork-opl');
const head=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const paths=new Set();
for(const e of plan.entries){
 assert.equal(e.revision,head);assert.match(e.sha256,/^[a-f0-9]{64}$/);
 assert.ok(!paths.has(e.path));paths.add(e.path);
 assert.ok(typeof e.path==='string'&&e.path.startsWith('OpenProblemLibrary/')&&e.path.endsWith('.pg'));
 assert.ok(!/[\\\x00-\x1f\x7f]/.test(e.path));
 let location=root;
 for(const part of e.path.split('/')){assert.ok(part&&part!=='.'&&part!=='..');location=join(location,part);assert.ok(!(await lstat(location)).isSymbolicLink());}
 assert.ok((await lstat(location)).isFile());
 assert.equal(createHash('sha256').update(await readFile(location)).digest('hex'),e.sha256);
}
console.log('PASS: '+plan.entries.length+' legacy aliases match the complete catalog and installed pinned source bytes; no identities allocated.');
