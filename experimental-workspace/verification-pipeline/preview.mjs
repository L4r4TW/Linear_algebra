import {createServer} from 'node:http';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createOperatorAuth} from './auth.mjs';import {json} from '../importer/db.mjs';import {createApp} from '../application/server/http-app.mjs';
import {createExerciseSessions} from '../application/server/exercise-sessions.mjs';import {createRendererClient} from '../application/server/renderer-client.mjs';
const seed=Number(process.env.PREVIEW_SEED??1234);if(![1234,4321].includes(seed))throw Error('FIXED_REVIEW_SEED_REQUIRED');
const auth=createOperatorAuth(),directory=await mkdtemp(join(tmpdir(),'verification-review-'));
function entries(){return json("SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT j.id,s.path,coalesce(e.metadata->>'title','Queued source') title FROM catalog.verification_jobs j JOIN catalog.verifier_heads h ON h.context_id=j.context_id JOIN catalog.source_versions s ON s.id=j.source_version_id JOIN catalog.import_entries e ON e.source_version_id=s.id JOIN catalog.import_heads ih ON ih.run_id=e.run_id WHERE j.state NOT IN('stale','cancelled') ORDER BY j.created_at DESC LIMIT 100)x;");}
const lookup=id=>{const row=entries().find(e=>e.id===id);if(!row)return;return {id:row.id,renderer:{sourceFilePath:row.path.replace(/^OpenProblemLibrary\//,'Library/').replace(/^Pending\//,'webwork-open-problem-library/Pending/')}};};
const renderer=process.env.RENDERER_URL??'http://renderer:3000',client=createRendererClient({baseUrl:renderer,exerciseLookup:lookup});
const sessions=createExerciseSessions({directory,exerciseLookup:lookup,rendererClient:client,seedGenerator:()=>seed});
const app=createApp({sessions,rendererBaseUrl:renderer,origin:process.env.PREVIEW_ORIGIN??'http://localhost:3103',
 exerciseList:()=>entries().map(e=>({id:e.id,title:e.title+' · review seed '+seed,topicId:'review',topic:'Operator review',description:'Independent review; this does not approve or activate the exercise.'}))});
const cookie='verification_review_owner_'+seed;
function rewrite(value){return Array.isArray(value)?value.map(rewrite):String(value).replace(/^la_experiment_owner=/,cookie+'=');}
const server=createServer((req,res)=>{
 if(!auth.basic(req)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Verification review"','Cache-Control':'no-store'});res.end('Operator credentials required');return;}
 req.headers.cookie=(req.headers.cookie??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookie+'=')).map(s=>s.replace(cookie+'=','la_experiment_owner=')).join('; ');
 const write=res.writeHead.bind(res);res.writeHead=(status,headers)=>{if(headers)for(const key of Object.keys(headers))if(key.toLowerCase()==='set-cookie')headers[key]=rewrite(headers[key]);return write(status,headers);};
 const set=res.setHeader.bind(res);res.setHeader=(key,value)=>set(key,key.toLowerCase()==='set-cookie'?rewrite(value):value);
 app.emit('request',req,res);
});
server.listen(3003,'0.0.0.0');process.on('SIGTERM',()=>{server.closeAllConnections();server.close(async()=>{await rm(directory,{recursive:true,force:true});process.exit(0);});});
