import {mkdirSync,existsSync,writeFileSync,readFileSync,chmodSync,chownSync} from 'node:fs';import {randomBytes} from 'node:crypto';
mkdirSync('/secrets',{recursive:true,mode:0o750});chownSync('/secrets',999,1000);chmodSync('/secrets',0o750);
for(const name of ['database-password','practice-db-password','auth-db-password','jwt-secret','backend-key','encryption-key']){
 const path='/secrets/'+name;if(!existsSync(path))writeFileSync(path,randomBytes(32).toString('hex')+'\n',{mode:0o640,flag:'wx'});
 if(!/^[a-f0-9]{64}\n?$/.test(readFileSync(path,'utf8')))throw Error('Invalid existing account secret; manual inspection required');
 chownSync(path,999,1000);chmodSync(path,0o640);
}
console.log('Account secret volume initialized; values remain private.');
