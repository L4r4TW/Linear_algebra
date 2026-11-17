import {actors} from './db.mjs';
import {createExerciseSessions} from '../application/server/exercise-sessions.mjs';
import {getAnswerContract} from '../application/server/answer-contract.mjs';
export function createAccountSessions({store,rendererClient,exerciseLookup,directory='/private/unused'}){
 const capture=async result=>{await store.captureContract([...getAnswerContract(result.html)]);return result;};
 const wrapped={
  async loadExercise(input){const ctx=actors.getStore();delete ctx.record;return capture(await rendererClient.loadExercise(input));},
  async restoreSession(input){return capture(await rendererClient.restoreSession(input));},
  async submitAnswers(input){actors.getStore().gradingStarted=true;return capture(await rendererClient.submitAnswers(input));}
 };
 return createExerciseSessions({directory,recordStore:store,rendererClient:wrapped,exerciseLookup,
  // Defaults remain cryptographic; plans are private server state.
  idGenerator:()=>actors.getStore().plannedSession?.id??crypto.randomUUID(),
  seedGenerator:()=>actors.getStore().plannedSession?.seed??randomSeed()});
}
import {randomInt,randomUUID} from 'node:crypto';
const crypto={randomUUID};const randomSeed=()=>randomInt(1,2147483648);
