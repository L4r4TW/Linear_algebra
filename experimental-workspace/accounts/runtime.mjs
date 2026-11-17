import {readFile} from 'node:fs/promises';
import {createDatabase,actors} from './db.mjs';import {createVault} from './crypto.mjs';import {createAccounts} from './auth.mjs';
import {createRecordStore} from './record-store.mjs';import {createAccountSessions} from './session-service.mjs';import {createSetStore} from './set-store.mjs';import {createStudentData} from './student-data.mjs';import {createLegacyImport} from './legacy-import.mjs';import {createAccountApp} from './http-app.mjs';
import {ExerciseSessionError} from '../application/server/exercise-sessions.mjs';import {PracticeSetError} from '../application/server/practice-sets.mjs';
import {createRendererClient} from '../application/server/renderer-client.mjs';import {listExercises,getExerciseById} from '../application/server/exercise-catalog.mjs';import {runtimeFingerprint} from '../application/server/catalog-compatibility.mjs';
export async function createAccountRuntime({exerciseLookup=getExerciseById,exerciseList=listExercises,rendererUrl=process.env.RENDERER_URL,origin=process.env.APP_ORIGIN??'http://localhost:3100',legacyDirectory='/legacy',rendererClient=createRendererClient({baseUrl:rendererUrl,exerciseLookup})}={}){
const db=createDatabase({domainErrors:[ExerciseSessionError,PracticeSetError]}),vault=createVault((await readFile('/secrets/encryption-key','utf8')).trim()),accounts=createAccounts({db,vault});
const store=createRecordStore({db,vault,legacyDirectory,exerciseLookup,runtimeDigest:runtimeFingerprint()});
const baseSessions=createAccountSessions({store,rendererClient,exerciseLookup});
async function continueAt(result){
 const ctx=actors.getStore(),record=ctx.record;if(!record)return result;
 await db.current(async client=>{
  const item=(await client.query('SELECT set_id,position FROM practice_runtime.set_items WHERE session_id=$1 LIMIT 1',[record.id])).rows[0];
  await client.query('INSERT INTO practice_runtime.continuations(principal_id,session_id,set_id,item) VALUES($1,$2,$3,$4) ON CONFLICT(principal_id) DO UPDATE SET session_id=EXCLUDED.session_id,set_id=EXCLUDED.set_id,item=EXCLUDED.item,updated_at=now()',[record.principalId,record.id,item?.set_id??null,item?.position??null]);
 });return result;
}
const sessions={...baseSessions,async startSession(...args){return continueAt(await baseSessions.startSession(...args));},async resumeSession(...args){return continueAt(await baseSessions.resumeSession(...args));}};
const baseSets=createSetStore({db,vault,entries:()=>exerciseList().map(entry=>({...entry,subject:exerciseLookup(entry.id)?.subject??null,chapter:entry.topic,section:null})),exerciseLookup,startSession:input=>sessions.startSession(input)});
const importLegacy=legacyDirectory?createLegacyImport({directory:legacyDirectory,db,vault,store}):async()=>({sessions:0,sets:0});
const practiceSets={...baseSets};
for(const name of ['get','openItem','move'])practiceSets[name]=async(...args)=>{
 try{return await baseSets[name](...args);}catch(error){
  if(error.code!=='SET_NOT_FOUND'||actors.getStore()?.kind!=='anonymous')throw error;
  await importLegacy();return baseSets[name](...args);
 }
};
const data=createStudentData({db,vault,store,sessions,exerciseLookup});
const app=createAccountApp({db,accounts,data,sessions,practiceSets,importLegacy,exerciseList,setExerciseLookup:exerciseLookup,rendererBaseUrl:rendererUrl,origin});
app.requestTimeout=10000;app.headersTimeout=10000;app.keepAliveTimeout=5000;
return {app,db,accounts,data,sessions,practiceSets,store};
}
