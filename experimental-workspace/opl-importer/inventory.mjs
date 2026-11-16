import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export const PIN='0d42812d6d02960c846fc0f89215e0d4f1e761b1';
export const ROOT='/opl/webwork-open-problem-library';
export const SCOPE=['OpenProblemLibrary','Contrib','Pending'];
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function git(root,args) {
 try{return execFileSync('git',['-c','safe.directory='+root,'-C',root,...args],{maxBuffer:64*1024*1024});}
 catch {throw Error('GIT_READ_FAILED');}
}
export function tree(root,revision) {
 if(!/^[a-f0-9]{40}$/.test(revision)) throw Error('EXACT_SHA1_REVISION_REQUIRED');
 const actual=git(root,['rev-parse','HEAD']).toString().trim();
 if(actual!==revision) throw Error('PIN_HEAD_MISMATCH');
 const treeOid=git(root,['rev-parse',revision+'^{tree}']).toString().trim();
 const entries=git(root,['ls-tree','-rz','--full-tree',revision]).toString('utf8').split('\0').filter(Boolean).map(line=>{
  const match=line.match(/^(\d+) (\w+) ([a-f0-9]{40})\t([\s\S]+)$/);
  if(!match) throw Error('INVALID_TREE_RECORD');
  return {mode:match[1],type:match[2],oid:match[3],path:match[4]};
 });
 return {revision,treeOid,entries};
}
export async function* blobs(root,entries) {
 const child=spawn('git',['-c','safe.directory='+root,'-C',root,'cat-file','--batch'],{stdio:['pipe','pipe','ignore']});
 const iterator=child.stdout[Symbol.asyncIterator]();let pending=Buffer.alloc(0);
 child.on('error',()=>{});child.stdin.on('error',()=>{});
 async function take(n) {
  while(pending.length<n) {const next=await iterator.next();if(next.done) throw Error('TRUNCATED_GIT_BLOB');pending=Buffer.concat([pending,next.value]);}
  const value=pending.subarray(0,n);pending=pending.subarray(n);return value;
 }
 async function line() {
  let i;while((i=pending.indexOf(10))<0){const next=await iterator.next();if(next.done)throw Error('TRUNCATED_GIT_HEADER');pending=Buffer.concat([pending,next.value]);}
  return (await take(i+1)).subarray(0,i).toString();
 }
 try {
  for(const entry of entries) {
   child.stdin.write(entry.oid+'\n');
   const header=await line(),match=header.match(/^([a-f0-9]{40}) blob (\d+)$/);
   if(!match||match[1]!==entry.oid) throw Error('INVALID_GIT_BLOB');
   const size=Number(match[2]);if(size>16*1024*1024)throw Error('SOURCE_TOO_LARGE: blob exceeds 16 MiB limit');
   const framed=await take(size+1),bytes=framed.subarray(0,size);
   const oid=createHash('sha1').update('blob '+size+'\0').update(bytes).digest('hex');
   if(oid!==entry.oid)throw Error('SOURCE_OBJECT_MISMATCH');
   yield {entry,bytes};
  }
 } finally {child.stdin.end();child.kill();}
}
export async function inventory({root=ROOT,revision=PIN,parse=()=>null}={}) {
 const source=tree(root,revision),targets=[],diagnostics=[];let symlinks=0;
 for(const entry of source.entries) {
  if(!SCOPE.includes(entry.path.split('/')[0])||!/[.]pg$/i.test(entry.path))continue;
  if(entry.mode==='120000'){symlinks++;continue;}
  if(!['100644','100755'].includes(entry.mode)||entry.type!=='blob')throw Error('UNSUPPORTED_SOURCE_MODE');
  if(entry.path.includes('\\')||/[\u0000-\u001f\u007f\ufffd]/.test(entry.path)||entry.path.split('/').some(p=>p==='.'||p==='..'||!p))throw Error('UNSAFE_SOURCE_PATH');
  targets.push(entry);
 }
 const entries=[];
 for await(const {entry,bytes} of blobs(root,targets)) {
  entries.push({path:entry.path,oid:entry.oid,sha256:hash(bytes),bytes:bytes.length,metadata:parse(bytes,entry.path)});
  if(entries.length%10000===0)console.error('Inventoried '+entries.length+' PG sources');
 }
 const byRoot=Object.fromEntries(SCOPE.map(name=>[name,entries.filter(e=>e.path.startsWith(name+'/')).length]));
 const manifestDigest=hash(JSON.stringify({revision,tree:source.treeOid,scope:SCOPE,entries:entries.map(({path,oid,sha256})=>({path,oid,sha256}))}));
 return {version:1,scannerVersion:'git-object-inventory-v1',revision,treeOid:source.treeOid,scope:SCOPE,manifestDigest,coverageComplete:true,byRoot,symlinksExcluded:symlinks,diagnostics,entries};
}
export function summary(result) {
 return {version:result.version,revision:result.revision,treeOid:result.treeOid,manifestDigest:result.manifestDigest,
 coverageComplete:result.coverageComplete,byRoot:result.byRoot,pgFiles:result.entries.length,symlinksExcluded:result.symlinksExcluded,
 diagnostics:result.diagnostics,method:'Tracked regular PG blobs read and verified from pinned Git objects; no PG execution, working-tree following or host copy'};
}
