// Operator-only previews. No student data, instructor responses or publication side effects.
import {createServer} from 'node:http';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createOperatorAuth} from '../pipeline/auth.mjs';import {json,literal} from '../importer/db.mjs';import {createApp} from '../application/server/http-app.mjs';import {createExerciseSessions} from '../application/server/exercise-sessions.mjs';import {createRendererClient} from '../application/server/renderer-client.mjs';import {protectReview} from './review-auth.mjs';
const seed=Number(process.env.PREVIEW_SEED??1234);if(![1234,4321].includes(seed))throw Error('FIXED_REVIEW_SEED_REQUIRED');
const auth=createOperatorAuth(),directory=await mkdtemp(join(tmpdir(),'calculus-review-')),renderer=process.env.RENDERER_URL;
const selection="FROM catalog.verification_jobs j JOIN catalog.verifier_heads h ON h.context_id=j.context_id AND h.scope='local-practice' JOIN catalog.source_versions s ON s.id=j.source_version_id JOIN catalog.import_entries e ON e.source_version_id=s.id JOIN catalog.import_heads ih ON ih.run_id=e.run_id WHERE j.state NOT IN('stale','cancelled')";
function entries(){return json("SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT j.id,s.path,e.metadata->>'title' title "+selection+" ORDER BY e.title_sort,j.id LIMIT 500)x;");}
function lookup(id){
 if(!/^[a-f0-9-]{36}$/.test(id??''))return;
 const row=json("SELECT jsonb_build_object('id',j.id,'path',s.path) "+selection+" AND j.id="+literal(id)+"::uuid;");
 if(!row)return;return {id:row.id,renderer:{sourceFilePath:row.path.replace(/^OpenProblemLibrary\//,'Library/').replace(/^Pending\//,'webwork-open-problem-library/Pending/')}};
}
const client=createRendererClient({baseUrl:renderer,exerciseLookup:lookup}),sessions=createExerciseSessions({directory,exerciseLookup:lookup,rendererClient:client,seedGenerator:()=>seed});
const app=createApp({sessions,rendererBaseUrl:renderer,origin:process.env.PREVIEW_ORIGIN,
 exerciseList:()=>entries().map(row=>({id:row.id,title:row.title+' · seed '+seed,topicId:'review',topic:'Pending operator review',description:'Unapproved source preview. Complete independent review before recording any decision.'}))});
const server=createServer(protectReview({auth,app,seed}));server.requestTimeout=10000;server.maxConnections=64;server.listen(3003,'0.0.0.0');
process.on('SIGTERM',()=>{server.closeAllConnections();server.close(async()=>{await rm(directory,{recursive:true,force:true});process.exit(0);});});
