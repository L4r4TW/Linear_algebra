import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {preflight} from './db.mjs';
import {inventory,summary,PIN} from './inventory.mjs';
import {metadataInventory} from './metadata.mjs';
import {loadInventory,runImport} from './workflow.mjs';
import {search,counts,topics,issues} from './search.mjs';
function save(name,value){mkdirSync('/state',{recursive:true});writeFileSync('/state/'+name+'.tmp',JSON.stringify(value,null,2)+'\n');renameSync('/state/'+name+'.tmp','/state/'+name);}
try {
 const [command,...args]=process.argv.slice(2);
 if(command==='doctor') console.log(JSON.stringify({database:preflight(),readOnly:true}));
 else if(['inventory','metadata'].includes(command)) {
  if(args.length>1)throw Error('Only one exact revision argument is supported');
  const result=await (command==='metadata'?metadataInventory:inventory)({revision:args[0]??PIN});save(command+'.json',result);
  const report={...summary(result),parserVersion:result.parserVersion,classifications:result.classifications,taxonomies:result.taxonomies};
  save(command+'-report.json',report);console.log(JSON.stringify(report));
 }else if(command==='search'){console.log(JSON.stringify(search({query:args.join(' ')})));
 }else if(command==='counts'){console.log(JSON.stringify(counts()));
 }else if(command==='topics'){console.log(JSON.stringify(topics(args[0]??null,args[1]??null)));
 }else if(command==='issues'){console.log(JSON.stringify(issues({after:args[0]??''})));
 }else if(command==='import'){
  let batch=500,stopAfterBatches=Infinity;
  for(const arg of args){if(/^--batch=\d+$/.test(arg))batch=Number(arg.split('=')[1]);
   else if(/^--stop-after-batches=[1-9]\d*$/.test(arg))stopAfterBatches=Number(arg.split('=')[1]);
   else throw Error('Unknown import argument');}
  const result=runImport(loadInventory(),{batch,stopAfterBatches});save('import-report.json',result);console.log(JSON.stringify(result));
 } else throw Error('Usage: search [words] | counts | topics [subject] [chapter] | issues [after-path] | doctor | inventory [exact-revision] | metadata [exact-revision] | import [--batch=500] [--stop-after-batches=N]');
} catch(error) {console.error(error.message);process.exitCode=1;}
