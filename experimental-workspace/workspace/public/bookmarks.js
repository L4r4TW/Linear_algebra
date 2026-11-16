const KEY='mathpractice.bookmarks.v1';
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(id);
export function readBookmarks(storage){
 const raw=storage.getItem(KEY);if(raw===null)return [];
 let ids;try{ids=JSON.parse(raw);}catch{throw Error('Saved bookmarks could not be read.');}
 if(!Array.isArray(ids)||ids.length>1000||new Set(ids).size!==ids.length||ids.some(id=>!validId(id)))throw Error('Saved bookmarks could not be read.');
 return ids;
}
export function toggleBookmark(id,storage){
 if(!validId(id))throw Error('This exercise could not be bookmarked.');
 const ids=new Set(readBookmarks(storage)),saved=!ids.has(id);
 if(saved){if(ids.size>=1000)throw Error('This browser has reached its bookmark limit.');ids.add(id);}else ids.delete(id);
 const raw=JSON.stringify([...ids].sort());storage.setItem(KEY,raw);
 if(storage.getItem(KEY)!==raw)throw Error('The bookmark could not be saved.');
 return saved;
}
