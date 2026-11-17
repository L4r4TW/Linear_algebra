import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
import {createRendererClient} from '../application/server/renderer-client.mjs';import {listExercises} from '../application/server/exercise-catalog.mjs';import {getAnswerContract,completeAnswerEntries} from '../application/server/answer-contract.mjs';
const old=createRendererClient({baseUrl:'http://linear-algebra-experimental-renderer-1:3000'}),candidate=createRendererClient({baseUrl:'http://renderer:3000'}),results=[];
for(const entry of listExercises()){
 const input={exerciseId:entry.id,seed:1234},loaded=await old.loadExercise(input),contract=getAnswerContract(loaded.html);
 const checked=await old.submitAnswers({...input,sessionToken:loaded.sessionToken,answers:completeAnswerEntries([],contract)});
 const restored=await candidate.restoreSession({...input,sessionToken:checked.sessionToken});
 assert.equal(restored.exerciseId,input.exerciseId);assert.equal(restored.seed,input.seed);assert.equal(restored.score,checked.score);assert.deepEqual([...getAnswerContract(restored.html)],[...getAnswerContract(checked.html)]);
 results.push({id:entry.id,priorRendererTokenRestored:true,seedPreserved:true,scorePreserved:true,answerContractPreserved:true});
}
await mkdir('/artifacts',{recursive:true});await writeFile('/artifacts/renderer-acceptance.json',JSON.stringify({observedAt:new Date().toISOString(),passed:results.length,cases:results,scope:'Fresh in-memory legacy-renderer sessions checked before candidate restoration; no student data read or modified.'},null,2)+'\n');console.log(JSON.stringify({passed:results.length}));
