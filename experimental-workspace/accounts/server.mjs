import {readFile} from 'node:fs/promises';
import {createDatabase,actors} from './db.mjs';import {createVault} from './crypto.mjs';import {createAccounts} from './auth.mjs';
import {createRecordStore} from './record-store.mjs';import {createAccountSessions} from './session-service.mjs';import {createSetStore} from './set-store.mjs';import {createStudentData} from './student-data.mjs';import {createLegacyImport} from './legacy-import.mjs';import {createAccountApp} from './http-app.mjs';
import {ExerciseSessionError} from '../application/server/exercise-sessions.mjs';import {PracticeSetError} from '../application/server/practice-sets.mjs';
import {createRendererClient} from '../application/server/renderer-client.mjs';import {listExercises,getExerciseById} from '../application/server/exercise-catalog.mjs';import {runtimeFingerprint} from '../application/server/catalog-compatibility.mjs';
const db=createDatabase({domainErrors:[ExerciseSessionError,PracticeSetError]}),vault=createVault((await readFile('/secrets/encryption-key','utf8')).trim()),accounts=createAccounts({db,vault});
const store=createRecordStore({db,vault,legacyDirectory:'/legacy',exerciseLookup:getExerciseById,runtimeDigest:runtimeFingerprint()});
const baseSessions=createAccountSessions({store,rendererClient:createRendererClient(),exerciseLookup:getExerciseById});
async function continueAt(result){
 const ctx=actors.getStore(),record=ctx.record;if(!record)return result;
 await db.current(async client=>{
  const item=(await client.query('SELECT set_id,position FROM practice_runtime.set_items WHERE session_id=$1 LIMIT 1',[record.id])).rows[0];
  await client.query('INSERT INTO practice_runtime.continuations(principal_id,session_id,set_id,item) VALUES($1,$2,$3,$4) ON CONFLICT(principal_id) DO UPDATE SET session_id=EXCLUDED.session_id,set_id=EXCLUDED.set_id,item=EXCLUDED.item,updated_at=now()',[record.principalId,record.id,item?.set_id??null,item?.position??null]);
 });return result;
}
const sessions={...baseSessions,async startSession(...args){return continueAt(await baseSessions.startSession(...args));},async resumeSession(...args){return continueAt(await baseSessions.resumeSession(...args));}};
const baseSets=createSetStore({db,vault,entries:()=>listExercises().map(entry=>({...entry,subject:getExerciseById(entry.id)?.subject??null,chapter:entry.topic,section:null})),exerciseLookup:getExerciseById,startSession:input=>sessions.startSession(input)});
const importLegacy=createLegacyImport({directory:'/legacy',db,vault,store});
const practiceSets={...baseSets};
for(const name of ['get','openItem','move'])practiceSets[name]=async(...args)=>{
 try{return await baseSets[name](...args);}catch(error){
  if(error.code!=='SET_NOT_FOUND'||actors.getStore()?.kind!=='anonymous')throw error;
  await importLegacy();return baseSets[name](...args);
 }
};
const data=createStudentData({db,vault,store,sessions,exerciseLookup:getExerciseById});
const app=createAccountApp({db,accounts,data,sessions,practiceSets,importLegacy,exerciseList:listExercises,setExerciseLookup:getExerciseById,rendererBaseUrl:process.env.RENDERER_URL,origin:process.env.APP_ORIGIN??'http://localhost:3100'});
app.requestTimeout=10000;app.headersTimeout=10000;app.keepAliveTimeout=5000;
app.listen(3000,'0.0.0.0',()=>console.log('Private account practice backend ready.'));
const stop=()=>app.close(async()=>{await db.close();process.exit(0);});process.on('SIGTERM',stop);process.on('SIGINT',stop);
