// Operator-only staging: approved fixture injection, isolated data, no host ports/production volumes.
import {readFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createApp} from '../application/server/http-app.mjs';import {createRendererClient} from '../application/server/renderer-client.mjs';import {createExerciseSessions} from '../application/server/exercise-sessions.mjs';import {createPracticeSets} from '../application/server/practice-sets.mjs';
const raw=JSON.parse(await readFile(new URL('../application/server/exercise-catalog.json',import.meta.url),'utf8')).exercises;
const batches=JSON.parse(await readFile(new URL('../application/server/activation-batches.json',import.meta.url),'utf8')).batches;
const ids=new Set(batches.filter(batch=>batch.state==='active').flatMap(batch=>batch.exerciseIds));
const selected=raw.filter(entry=>ids.has(entry.id)),lookup=id=>selected.find(entry=>entry.id===id);
const directory=await mkdtemp(join(tmpdir(),'practice-staging-')),renderer=process.env.RENDERER_URL??'http://renderer:3000';
const sessions=createExerciseSessions({directory,exerciseLookup:lookup,rendererClient:createRendererClient({baseUrl:renderer,exerciseLookup:lookup})});
const list=()=>selected.map(({id,title,topicId,topic,description,subject})=>({id,title,topicId,topic,description,subject}));
const sets=createPracticeSets({filename:join(directory,'sets.sqlite'),entries:()=>list().map(e=>({...e,chapter:e.topic,section:null})),exerciseLookup:lookup,startSession:input=>sessions.startSession(input)});
const app=createApp({sessions,practiceSets:sets,setExerciseLookup:lookup,exerciseList:list,rendererBaseUrl:renderer});app.listen(3000,'0.0.0.0');
process.on('SIGTERM',async()=>{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));sets.close();await rm(directory,{recursive:true,force:true});process.exit(0);});
