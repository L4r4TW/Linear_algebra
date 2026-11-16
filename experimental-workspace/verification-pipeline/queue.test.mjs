import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {sql} from '../importer/db.mjs';
test('Durable deduplication, concurrency limit, expiry fencing, retained retries and cancellation',()=>{
 const result=spawnSync('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],{input:readFileSync('/qa/pipeline/queue-checks.sql'),encoding:'utf8'});
 if(result.status!==0)throw Error(result.stderr.split('\n').filter(l=>/ERROR:|CONTEXT:/.test(l)).join('\n'));
 assert.equal(result.stdout.trim(),'true');
});
test('Browser roles cannot read jobs or execute queue mutations',()=>{assert.throws(()=>sql('SET ROLE anon;SELECT * FROM catalog.verification_jobs;'),/DATABASE_QUERY_FAILED/);assert.throws(()=>sql("SET ROLE authenticated;SELECT catalog.claim_verification('forged');"),/DATABASE_QUERY_FAILED/);});
