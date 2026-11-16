import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';
test('Reviewed publication, stale CAS, withdrawal, review revocation and retained sessions',()=>{
 const result=spawnSync('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],{input:readFileSync('/qa/pipeline/publication-checks.sql'),encoding:'utf8'});
 if(result.status!==0)throw Error(result.stderr.split('\n').filter(l=>/ERROR:|CONTEXT:/.test(l)).join('\n'));assert.equal(result.stdout.trim(),'true');
});
