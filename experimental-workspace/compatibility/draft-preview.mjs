// Operator-only isolated preview for testing runtime changes before new compatibility approval.
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRendererClient} from '../application/server/renderer-client.mjs';
import {createApp} from '../application/server/http-app.mjs';
import {createExerciseSessions} from '../application/server/exercise-sessions.mjs';
const catalog=JSON.parse(await readFile(new URL('../application/server/exercise-catalog.json',import.meta.url),'utf8'));
const entries=catalog.exercises.filter(e=>e.activation.state==='enabled'),lookup=id=>entries.find(e=>e.id===id);
const directory=await mkdtemp(join(tmpdir(),'draft-preview-'));
const sessions=createExerciseSessions({directory,exerciseLookup:lookup,rendererClient:createRendererClient({baseUrl:'http://renderer:3000',exerciseLookup:lookup})});
const app=createApp({sessions,rendererBaseUrl:'http://renderer:3000',origin:'http://localhost:3100',exerciseList:()=>entries.map(({id,title,topicId,topic,description})=>({id,title,topicId,topic,description}))});
app.listen(3000,'0.0.0.0');
process.once('SIGTERM',()=>{app.closeAllConnections();app.close(async()=>{await rm(directory,{recursive:true,force:true});process.exit(0);});});
console.log('Operator-only draft preview. Temporary sessions; no host port.');