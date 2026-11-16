import test from 'node:test';
import assert from 'node:assert/strict';
import {literal,preflight,sql} from './db.mjs';
test('Hostile metadata round trips as literal SQL data',()=>{
 const input="O'Brien'); DROP SCHEMA catalog CASCADE; -- \\ newline\n";
 assert.equal(sql('SELECT '+literal(input)+';'),input.trimEnd());
 assert.throws(()=>literal('bad\0value'));
 assert.equal(preflight().ready,true);
});
