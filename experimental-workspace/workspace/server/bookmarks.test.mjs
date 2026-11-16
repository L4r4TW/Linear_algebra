import test from 'node:test';import assert from 'node:assert/strict';
import {readBookmarks,toggleBookmark} from '../public/bookmarks.js';
function store(){const rows=new Map();return {getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value)};}
test('bookmarks retain only validated exercise identities and explicit toggles',()=>{
 const storage=store();assert.deepEqual(readBookmarks(storage),[]);assert.equal(toggleBookmark('dot-product-01',storage),true);
 assert.equal(toggleBookmark('another',storage),true);assert.equal(toggleBookmark('dot-product-01',storage),false);assert.deepEqual(readBookmarks(storage),['another']);
 assert.throws(()=>toggleBookmark('source/path.pg',storage));
});
test('bookmark corruption and blocked storage fail visibly without changing practice records',()=>{
 assert.throws(()=>readBookmarks({getItem:()=>'{bad'}),/could not be read/);
 assert.throws(()=>toggleBookmark('dot-product-01',{getItem:()=>null,setItem:()=>{throw Error('blocked');}}),/blocked/);
 assert.throws(()=>toggleBookmark('dot-product-01',{getItem:()=>null,setItem:()=>{}}),/could not be saved/);
});
