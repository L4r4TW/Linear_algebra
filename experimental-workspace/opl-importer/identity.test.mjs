import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {json} from './db.mjs';
test('Stable IDs, independent copies, exact new versions, rename and reappearance review',()=>{
 assert.equal(json(readFileSync('/importer/identity-checks.sql','utf8')),true);
});
