// Operator acceptance probe. It pauses only after committed batches, before publication.
import {loadInventory,runImport} from './workflow.mjs';
import {writeFileSync} from 'node:fs';
const result=runImport(loadInventory(),{batch:500,stopAfterBatches:2});
if(!result.interrupted)throw Error('Import is already complete; use controlled recovery fixtures for a fresh crash test');
writeFileSync('/state/crash-checkpoint.json',JSON.stringify(result));
console.log('PAUSED_AFTER_COMMIT '+JSON.stringify(result));
setInterval(()=>{},1000);
