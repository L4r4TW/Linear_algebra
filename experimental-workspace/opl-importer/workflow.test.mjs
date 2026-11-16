import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {runImport,open,stage,status,complete} from './workflow.mjs';import {sql,json,literal} from './db.mjs';import {hash,SCOPE} from './inventory.mjs';import {PARSER} from './metadata.mjs';
const entry=(path,content)=>({path:'OpenProblemLibrary/'+path,oid:hash(content).slice(0,40),sha256:hash(content),bytes:content.length,metadata:{parser:PARSER,state:'missing',raw:[],normalized:null,sourceLabels:[null,null,null],diagnostics:['CLASSIFICATION_MISSING'],title:'Synthetic '+path,description:null}});
function data(revision,entries){return {revision:revision.repeat(40),treeOid:'b'.repeat(40),scope:SCOPE,coverageComplete:true,manifestDigest:hash(JSON.stringify(entries)),scannerVersion:'synthetic',parserVersion:PARSER,entries};}
const options=()=>({registry:'synthetic-'+randomUUID(),url:'https://example.invalid',verifyGit:false,batch:1});
test('Interrupt/resume, competing lease, repeat import, changes, removal and reappearance',()=>{
 const opts=options(),first=data('a',[entry('a.pg','a'),entry('b.pg','b'),entry('old.pg','old')]);
 const interrupted=runImport(first,{...opts,stopAfterBatches:1});assert.equal(interrupted.interrupted,true);assert.equal(status(interrupted.runId).staged,1);
 assert.throws(()=>complete(interrupted.runId),/DATABASE_QUERY_FAILED/);
 assert.throws(()=>open(data('c',[entry('different.pg','c')]),opts),/DATABASE_QUERY_FAILED/);
 assert.throws(()=>stage(interrupted.runId,[entry('a.pg','forged')]),/DATABASE_QUERY_FAILED/);
 const result=runImport(first,opts);assert.equal(result.total,3);assert.equal(result.imported,3);assert.equal(result.generation,1);
 const identities=json(`SELECT jsonb_object_agg(path,exercise_id) FROM catalog.import_entries WHERE run_id=${literal(result.runId)};`);
 const replay=runImport(first,opts);assert.equal(replay.replayed,true);assert.equal(replay.generation,1);
 assert.equal(complete(result.runId).generation,1);
 const second=data('c',[entry('a.pg','a'),entry('b.pg','changed'),entry('renamed.pg','old')]);
 const pending=runImport(second,{...opts,stopAfterBatches:1});
 assert.equal(Number(sql(`SELECT count(*) FROM catalog.source_locations l JOIN catalog.repositories r ON r.id=l.repository_id WHERE r.registry_key=${literal(opts.registry)} AND l.state='absent';`)),0);
 const changed=runImport(second,opts);assert.equal(changed.changes.changed,1);assert.equal(changed.changes.unchanged,1);assert.equal(changed.identityReview,1);assert.equal(changed.removed,1);
 const changedIds=json(`SELECT jsonb_object_agg(path,exercise_id) FROM catalog.import_entries WHERE run_id=${literal(changed.runId)};`);
 assert.equal(changedIds['OpenProblemLibrary/a.pg'],identities['OpenProblemLibrary/a.pg']);assert.equal(changedIds['OpenProblemLibrary/b.pg'],identities['OpenProblemLibrary/b.pg']);assert.equal(changedIds['OpenProblemLibrary/renamed.pg'],null);
 const again=runImport(data('d',[entry('a.pg','a'),entry('b.pg','changed'),entry('old.pg','old')]),opts);
 assert.equal(again.changes['reappearance-review'],1);
 assert.equal(Number(sql(`SELECT count(*) FROM catalog.activation_members m JOIN catalog.source_versions s ON s.id=m.source_version_id JOIN catalog.snapshots v ON v.id=s.snapshot_id JOIN catalog.repositories r ON r.id=v.repository_id WHERE r.registry_key=${literal(opts.registry)};`)),0);
});
test('Bad batch rolls back every row and a resumed staged run finishes',()=>{
 const opts=options(),input=data('e',[entry('ok.pg','ok'),entry('next.pg','next')]);const id=open(input,opts);
 assert.throws(()=>stage(id,[input.entries[0],{...input.entries[1],path:'../bad.pg'}]),/DATABASE_QUERY_FAILED/);
 assert.equal(status(id).staged,0);assert.equal(runImport(input,opts).imported,2);
});
