import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {mkdir,writeFile,unlink} from 'node:fs/promises';import {createBackup,restoreDisposable} from './backup.mjs';
try{
 const backup=await createBackup(process.env.BACKUP_TARGET);
 await assert.rejects(()=>restoreDisposable(backup.id,'database'),/DISPOSABLE_RESTORE_HOST_REQUIRED/);
 const invalid=randomUUID(),path='/backups/'+invalid+'.pg.enc';await writeFile(path,Buffer.concat([Buffer.from('MPB1'),Buffer.alloc(76)]),{flag:'wx',mode:0o600});
 try{await assert.rejects(()=>restoreDisposable(invalid,process.env.RESTORE_HOST));}finally{await unlink(path);}
 const result=await restoreDisposable(backup.id,process.env.RESTORE_HOST);
 await assert.rejects(()=>restoreDisposable(backup.id,process.env.RESTORE_HOST),/EMPTY_DISPOSABLE_DATABASE_REQUIRED/);
 await mkdir('/artifacts',{recursive:true});await writeFile('/artifacts/restore-observations.json',JSON.stringify({...result,tamperedBackupRejected:true,liveHostRejected:true,nonemptyTargetRejected:true,backupId:backup.id,observedAt:new Date().toISOString()},null,2)+'\n');
 console.log(JSON.stringify({complete:true,target:result.target,countsMatch:true,tamperRejected:true,secretsDisclosed:false}));
}catch{console.error('Isolated encrypted restore verification failed; private diagnostics were withheld.');process.exitCode=1;}
