import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createExerciseAssets} from './exercise-assets.mjs';
const base = 'http://renderer:3000';
const graph='/pg_files/js/GraphTool/graphtool.c763eac0.min.js';
const css='/pg_files/js/GraphTool/graphtool.19919d77.min.css';
const image='/pg_files/tmp/images/aa___bb.png';
function prepare(registry, html, resources={}) {return registry.prepare({html,resources,identity:'owned-session'});}
function key(url) {return url.split('/').slice(-2);}

test('preserves reviewed dependency order and defer; excludes private document and form helpers',()=>{
 const registry=createExerciseAssets({rendererBaseUrl:base});
 const html=`<html><head><script src="node_modules/jquery/dist/jquery.min.js?version=one"></script><script defer src="${graph}"></script><link rel="stylesheet" href="${css}"><script src="/js/apps/Problem/submithelper.123.min.js"></script><script>const sessionJWT='private';</script></head><body></body></html>`;
 const p=prepare(registry,html);
 assert.deepEqual(p.dependencies.map(d=>[d.kind,d.defer]),[['script',false],['script',true],['style',false]]);
 assert.doesNotMatch(JSON.stringify(p.dependencies),/renderer|private|GraphTool|sessionJWT/);
 assert.ok(p.dependencies.every(d=>/^\/assets\/exercise\/[\w-]{43}\/\d+$/.test(d.url)));
 assert.deepEqual(prepare(registry,html).dependencies,p.dependencies);
});

test('rewrites exact aliases and generated images to distinct opaque capabilities',async()=>{
 const calls=[];
 const registry=createExerciseAssets({rendererBaseUrl:base,fetchAsset:async(url,options)=>{calls.push({url,options});return new Response(Buffer.from('image-bytes'));}});
 const p=prepare(registry,'<html></html>',{alias:{'plot.png':image}});
 const html=p.project('<div id="problem_body"><img src="plot.png"></div>');
 assert.doesNotMatch(html,/plot.png|pg_files|renderer/);
 const url=html.match(/src="([^"]+)/)[1];
 const asset=await registry.read(...key(url));
 assert.equal(asset.contentType,'image/png');assert.equal(asset.body.toString(),'image-bytes');
 await registry.read(...key(url));assert.equal(calls.length,1);
 assert.equal(calls[0].url,base+image);assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.headers.Cookie,undefined);
 const other=registry.prepare({html:'<html></html>',resources:{alias:{'plot.png':image}},identity:'other-owner-session'});
 assert.notEqual(other.project('<img src="plot.png">'),p.project('<img src="plot.png">'));
});

test('rejects arbitrary origins, traversal, encoded paths, tokens, and unreviewed body dependencies',()=>{
 const registry=createExerciseAssets({rendererBaseUrl:base});
 const p=prepare(registry,'<html></html>');
 for(const src of ['https://attacker.test/image.png','//attacker.test/x.png','/render-api?sessionJWT=secret','/pg_files/tmp/images/../images/x.png','/pg_files/tmp/images/%2e%2e/x.png',image+'?sessionJWT=secret','/node_modules/private.js']) assert.throws(()=>p.project(`<div><img src="${src}"></div>`));
 assert.throws(()=>p.project('<script src="/render-api"></script>'));
});

test('expires capabilities, bounds manifests, and does not refetch arbitrary request indices',async()=>{
 let time=100;
 const registry=createExerciseAssets({rendererBaseUrl:base,now:()=>time,ttlMs:50,maxManifests:1});
 const first=prepare(registry,'one').project(`<img src="${image}">`).match(/src="([^"]+)/)[1];
 prepare(registry,'two'); assert.equal(await registry.read(...key(first)),undefined);
 const second=prepare(registry,'two').project(`<img src="${image}">`).match(/src="([^"]+)/)[1];
 assert.equal(await registry.read(key(second)[0],'../../render-api'),undefined);
 time=151; assert.equal(await registry.read(...key(second)),undefined);
});

test('removes transitive stylesheet URLs/imports and rejects oversized or mutated pinned resources',async()=>{
 const registry=createExerciseAssets({rendererBaseUrl:base,fetchAsset:async()=>new Response('@import "https://evil.test/x.css";a{background:url(https://evil.test/x.png)}b{background:url(data:image/png;base64,AA)}')});
 const p=prepare(registry,`<head><link rel="stylesheet" href="${css}"></head>`);
 const result=await registry.read(...key(p.dependencies[0].url));
 assert.doesNotMatch(result.body.toString(),/evil.test|@import/);assert.match(result.body.toString(),/data:image\/png/);
 const mutated=createExerciseAssets({rendererBaseUrl:base,fetchAsset:async()=>new Response('modified')});
 const m=prepare(mutated,'<head><script src="https://cdn.jsdelivr.net/npm/jsxgraph@1.7.0/distrib/jsxgraphcore.min.js"></script></head>');
 await assert.rejects(mutated.read(...key(m.dependencies[0].url)),/integrity/);
 const large=createExerciseAssets({rendererBaseUrl:base,fetchAsset:async()=>new Response('no',{headers:{'Content-Length':'3000000'}})});
 const l=prepare(large,`<head><link rel="stylesheet" href="${css}"></head>`);
 await assert.rejects(large.read(...key(l.dependencies[0].url)),/unavailable/);
});
test('stylesheet GraphTool icons use the same controlled capability instead of exposing relative renderer paths',async()=>{
 const calls=[];
 const registry=createExerciseAssets({rendererBaseUrl:base,fetchAsset:async url=>{calls.push(url);return new Response(url.endsWith('.css')?'.point{background:url(images/PointTool.svg)}.bad{background:url(https://evil.test/x.svg)}':'<svg/>');}});
 const p=prepare(registry,`<head><link rel="stylesheet" href="${css}"></head>`);
 const style=await registry.read(...key(p.dependencies[0].url));
 const icon=style.body.toString().match(/url\("(\/assets\/exercise\/[^\"]+)"\)/)[1];
 assert.doesNotMatch(style.body.toString(),/evil.test|GraphTool|PointTool/);
 const result=await registry.read(...key(icon));assert.equal(result.contentType,'image/svg+xml');
 assert.equal(calls[1],base+'/pg_files/js/GraphTool/images/PointTool.svg');
});