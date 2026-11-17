import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';import {createVault,hash} from './crypto.mjs';
test('private records use authenticated encryption and cannot swap identity or accept tampering',()=>{
 const vault=createVault(randomBytes(32).toString('hex')),value={sessionToken:'synthetic-private-value',answers:[['AnSwEr0001','synthetic input']]},sealed=vault.seal(value,'session:one');
 assert.deepEqual(vault.open(sealed,'session:one'),value);assert.ok(!sealed.includes('synthetic-private-value'));assert.throws(()=>vault.open(sealed,'session:two'));
 const bytes=Buffer.from(sealed.slice(3),'base64url');bytes[bytes.length-1]^=1;assert.throws(()=>vault.open('v1.'+bytes.toString('base64url'),'session:one'));
 assert.notEqual(vault.seal(value,'session:one'),sealed);
});
test('account owner authority is stable, private-key-bound and distinct between accounts',()=>{
 const key=randomBytes(32).toString('hex'),a=createVault(key),b=createVault(key);
 assert.equal(a.ownerToken('one'),b.ownerToken('one'));assert.notEqual(a.ownerToken('one'),a.ownerToken('two'));assert.notEqual(a.ownerToken('one'),createVault(randomBytes(32).toString('hex')).ownerToken('one'));
 assert.match(a.ownerToken('one'),/^[A-Za-z0-9_-]{43}$/);assert.match(hash('opaque credential'),/^[a-f0-9]{64}$/);
});
