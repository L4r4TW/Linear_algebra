import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {inventory,hash} from './inventory.mjs';
test('Pinned objects ignore dirty/untracked worktree, exclude symlinks and reject wrong pin',async()=>{
 const root=mkdtempSync('/tmp/opl-inventory-');const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
 try{
  git('init','-q');mkdirSync(root+'/OpenProblemLibrary');
  writeFileSync(root+'/OpenProblemLibrary/a.pg','original');
  symlinkSync('/etc/passwd',root+'/OpenProblemLibrary/link.pg');
  git('add','.');git('-c','user.name=Synthetic','-c','user.email=test@example.invalid','commit','-qm','fixture');
  const revision=git('rev-parse','HEAD');
  writeFileSync(root+'/OpenProblemLibrary/a.pg','dirty');writeFileSync(root+'/OpenProblemLibrary/untracked.pg','untracked');
  const a=await inventory({root,revision}),b=await inventory({root,revision});
  assert.equal(a.entries.length,1);assert.equal(a.entries[0].sha256,hash('original'));
  assert.equal(a.manifestDigest,b.manifestDigest);assert.equal(a.symlinksExcluded,1);
  await assert.rejects(inventory({root,revision:'a'.repeat(40)}),/PIN_HEAD_MISMATCH/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
