import {mkdirSync,writeFileSync} from 'node:fs';
import {preflight} from './db.mjs';
import {inventory,summary,PIN} from './inventory.mjs';
try {
 const [command,argument]=process.argv.slice(2);
 if(command==='doctor') console.log(JSON.stringify({database:preflight(),readOnly:true}));
 else if(command==='inventory') {
  const result=await inventory({revision:argument??PIN});mkdirSync('/state',{recursive:true});
  writeFileSync('/state/inventory.json',JSON.stringify(result));
  writeFileSync('/state/inventory-report.json',JSON.stringify(summary(result),null,2)+'\n');
  console.log(JSON.stringify(summary(result)));
 } else throw Error('Usage: doctor | inventory [exact-revision]');
} catch(error) {console.error(error.message);process.exitCode=1;}
