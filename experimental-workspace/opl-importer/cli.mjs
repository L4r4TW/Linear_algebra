import {mkdirSync,writeFileSync} from 'node:fs';
import {preflight} from './db.mjs';
import {inventory,summary,PIN} from './inventory.mjs';
import {metadataInventory} from './metadata.mjs';
try {
 const [command,argument]=process.argv.slice(2);
 if(command==='doctor') console.log(JSON.stringify({database:preflight(),readOnly:true}));
 else if(['inventory','metadata'].includes(command)) {
  const result=await (command==='metadata'?metadataInventory:inventory)({revision:argument??PIN});mkdirSync('/state',{recursive:true});
  writeFileSync('/state/'+command+'.json',JSON.stringify(result));
  const report={...summary(result),parserVersion:result.parserVersion,classifications:result.classifications,taxonomies:result.taxonomies};
  writeFileSync('/state/'+command+'-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 } else throw Error('Usage: doctor | inventory [exact-revision] | metadata [exact-revision]');
} catch(error) {console.error(error.message);process.exitCode=1;}
