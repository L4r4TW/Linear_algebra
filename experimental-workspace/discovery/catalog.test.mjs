import test from 'node:test';
import assert from 'node:assert/strict';
import {filters,decodeCursor,createCatalog,publicEntry} from './catalog.mjs';
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const input=query=>filters(new URLSearchParams(query));
test('strict filters reject duplicates, hidden SQL controls and malformed cursors',()=>{
 for(const q of ['view=all','q=a&q=b','q=%00','chapter=A','subject=A&section=B','area=bad','limit=999'])assert.throws(()=>input(q));
 assert.throws(()=>decodeCursor(input('view=library&cursor=abc')));
});
test('library pagination is bound to filters and hides private/control data',async()=>{
 const rows=Array.from({length:13},(_,i)=>({id:id(i+1),import_run_id:id(99),sort_key:'source'+i,title:'Source '+i,metadata:{secret:'no'},path:'private',can_practice:true}));
 const catalog=createCatalog({query:async()=>rows});
 const first=await catalog.search(input('view=library&q=source'));
 assert.equal(first.entries.length,12);assert.ok(first.nextCursor);
 assert.equal(first.entries[0].canPractice,false);
 assert.equal(first.entries[0].catalogPracticeReady,true);
 for(const key of ['path','metadata','sort_key','import_run_id','source_version_id'])assert.ok(!(key in first.entries[0]));
 assert.equal(decodeCursor(input('view=library&q=source&cursor='+first.nextCursor)).id,id(12));
 assert.throws(()=>decodeCursor(input('view=library&q=other&cursor='+first.nextCursor)));
});
test('practice authorizes only the live player list; DB failure leaves it usable',async()=>{
 const catalog=createCatalog({query:async()=>{throw Error('private database details');},fetcher:async()=>Response.json({exercises:[{id:'dot-product-01',title:'Dot product',topic:'Vectors',description:'Scalar products'},{id:'not-in-catalog',title:'Unknown'}]})});
 const result=await catalog.search(input('q=scalar'));assert.equal(result.entries.length,1);
 assert.equal((await catalog.search(input('subject=Other'))).entries.length,0);
 const overview=await catalog.overview();assert.equal(overview.practice.count,1);assert.equal(overview.library.available,false);
});
test('attribution is allowlisted and text remains data',()=>{
 const row=publicEntry({id:id(1),title:'<img src=x onerror=alert(1)>',attribution:{authors:['Author',{}],token:'private'}});
 assert.deepEqual(row.attribution.authors,['Author']);assert.equal(row.title,'<img src=x onerror=alert(1)>');
 assert.equal(row.canPractice,false);
});

test('approved backend UUID entries support section filtering, attribution search and bounded shareable practice pages',async()=>{
 const exercises=Array.from({length:25},(_,i)=>({id:id(i+1),title:'Derivative '+String(i).padStart(2,'0'),subject:'Calculus',chapter:'Differentiation',section:'Chain rule',attribution:{authors:['Example author']}}));
 const catalog=createCatalog({fetcher:async()=>Response.json({exercises})});
 const first=await catalog.search(input('subject=Calculus&chapter=Differentiation&section=Chain+rule&q=author'));assert.equal(first.entries.length,12);assert.ok(first.entries.every(e=>e.canPractice));assert.ok(first.nextCursor);
 const next=await catalog.search(input('subject=Calculus&chapter=Differentiation&section=Chain+rule&q=author&cursor='+first.nextCursor));assert.equal(next.entries.length,12);assert.notEqual(first.entries[0].id,next.entries[0].id);
 await assert.rejects(catalog.search(input('q=other&cursor='+first.nextCursor)),{code:'INVALID_CURSOR'});
 exercises.pop();await assert.rejects(catalog.search(input('subject=Calculus&chapter=Differentiation&section=Chain+rule&q=author&cursor='+first.nextCursor)),{code:'CATALOG_CHANGED'});
 assert.ok((await catalog.topics(input('subject=Calculus'))).topics.every(t=>t.section==='Chain rule'));
});
