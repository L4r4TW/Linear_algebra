// Operator-only positive-stage diagnostic. No expected answers, JWTs, or HTML are written to artifacts.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {getAnswerContract,completeAnswerEntries} from '../application/server/answer-contract.mjs';
import {problemHtml} from '../application/server/http-app.mjs';
const catalog=JSON.parse(await readFile(new URL('./catalog.json',import.meta.url),'utf8'));
const fixture=catalog.exercises.find(entry=>entry.id==='compat-calculus-scaffold-01');
const seed=catalog.verificationSeeds[0];
const output=process.env.COMPATIBILITY_OUTPUT??'/artifacts';
await mkdir(output,{recursive:true});
async function call(fields){
 const response=await fetch((process.env.RENDERER_URL??'http://renderer:3000')+'/render-api',{method:'POST',body:new URLSearchParams(fields),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Renderer HTTP '+response.status);
 const data=await response.json();if(data.flags?.error_flag)throw Error('PG error');return data;
}
const initial=await call({sourceFilePath:fixture.rendererPath,problemSeed:String(seed),_format:'json',isInstructor:'0',showSolutions:'0',showCorrectAnswersButton:'0'});
const initialFields=[...getAnswerContract(initial.renderedHTML).keys()];
const diagnostic=await call({sourceFilePath:fixture.rendererPath,problemSeed:String(seed),_format:'json',isInstructor:'1'});
const pairs=initialFields.map(name=>{
 const answer=diagnostic.answers[name];const value=answer?.correct_value??answer?.correct_ans;
 if(!['string','number'].includes(typeof value))throw Error('Diagnostic mapping unavailable.');
 return [name,String(value)];
});
const graded=await call([['sessionJWT',initial.JWT.session],['_format','json'],['isInstructor','0'],['submitAnswers','1'],['answersSubmitted','1'],...completeAnswerEntries(pairs,getAnswerContract(initial.renderedHTML))]);
const afterFields=[...getAnswerContract(graded.renderedHTML).keys()];
const restored=await call({sessionJWT:graded.JWT.session,_format:'json'});
const result={id:fixture.id,seed,operatorOnly:true,beforeAnswerNames:initialFields,afterAnswerNames:afterFields,restoredAnswerNames:[...getAnswerContract(restored.renderedHTML).keys()],score:graded.problem_result.score,problemContentChanged:problemHtml(initial.renderedHTML)!==problemHtml(graded.renderedHTML),newFields:afterFields.filter(name=>!initialFields.includes(name))};
assert.equal(result.beforeAnswerNames.length,2);
assert.equal(result.newFields.length,2);
assert.equal(result.score,0.5);
assert.deepEqual(result.restoredAnswerNames,result.afterAnswerNames);
await writeFile(output+'/scaffold-transition.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
