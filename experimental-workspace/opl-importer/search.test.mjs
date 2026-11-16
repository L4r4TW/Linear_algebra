import test from 'node:test';import assert from 'node:assert/strict';
import {runImport} from './workflow.mjs';import {search,counts,topics,issues} from './search.mjs';import {sql,json} from './db.mjs';import {hash,SCOPE} from './inventory.mjs';import {PARSER} from './metadata.mjs';
test('Public search, topic counts, cursor isolation and private metadata denial',()=>{
 const make=(path,title,labels=null)=>({path:'OpenProblemLibrary/'+path,oid:hash(path).slice(0,40),sha256:hash(path),bytes:1,metadata:{title,titleOrigin:'generated-source-label',description:'Synthetic source description',state:labels?'matched':'missing',normalized:labels,sourceLabels:labels??[null,null,null],raw:[],diagnostics:labels?[]:['CLASSIFICATION_MISSING'],authors:[],institutions:[],bibliographic:{}}});
 const entries=[make('synthetic-derivative.pg','Derivative basics',['Calculus','Derivatives','Chain rule']),make('synthetic-matrix.pg','Matrix sums',['Linear algebra','Matrices','Addition']),make('synthetic-unknown.pg','Unclassified source')];
 const input={revision:'f'.repeat(40),treeOid:'b'.repeat(40),scope:SCOPE,coverageComplete:true,manifestDigest:hash(JSON.stringify(entries)),scannerVersion:'synthetic-search',parserVersion:PARSER,entries};
 runImport(input,{verifyGit:false});
 const total=counts();assert.equal(total.indexed,3);assert.equal(total.practiceReady,0);assert.equal(total.unclassified,1);
 assert.equal(search({query:'derivative'}).entries.length,1);assert.equal(search({subject:'Linear algebra'}).entries.length,1);
 assert.equal(search({query:"'); DROP SCHEMA catalog CASCADE; --"}).entries.length,0);
 assert.equal(topics('Calculus')[0].indexed,1);assert.equal(issues().length,1);
 const first=search({limit:1}),second=search({limit:1,cursor:first.nextCursor});assert.notEqual(first.entries[0].id,second.entries[0].id);
 const safe=json("SET ROLE anon;SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM catalog_api.search_opl()x;");
 assert.equal(safe.length,3);for(const row of safe){assert.equal(row.can_practice,false);for(const key of ['path','metadata','sha256','seed','session_token','raw'])assert.equal(Object.hasOwn(row,key),false);}
 assert.throws(()=>sql('SET ROLE anon;SELECT metadata FROM catalog.import_entries;'),/DATABASE_QUERY_FAILED/);
 assert.throws(()=>sql('SET ROLE authenticated;SELECT catalog.complete_import(NULL);'),/DATABASE_QUERY_FAILED/);
 const next={...input,revision:'e'.repeat(40),manifestDigest:hash('new search snapshot')};runImport(next,{verifyGit:false});
 assert.throws(()=>search({limit:1,cursor:first.nextCursor}),/DATABASE_QUERY_FAILED/);
});
