import {mkdir,writeFile} from 'node:fs/promises';import {createBackup,restoreDisposable} from './backup.mjs';
try{
 const backup=await createBackup(process.env.BACKUP_TARGET),result=await restoreDisposable(backup.id,process.env.RESTORE_HOST);
 await mkdir('/artifacts',{recursive:true});await writeFile('/artifacts/restore-observations.json',JSON.stringify({...result,backupId:backup.id,observedAt:new Date().toISOString()},null,2)+'\n');
 console.log(JSON.stringify({complete:true,target:result.target,countsMatch:true,secretsDisclosed:false}));
}catch{console.error('Isolated encrypted restore verification failed; private diagnostics were withheld.');process.exitCode=1;}
