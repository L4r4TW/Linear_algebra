import pg from 'pg';import {spawn} from 'node:child_process';import {randomBytes,randomUUID,createCipheriv,createDecipheriv} from 'node:crypto';
import {mkdir,readFile,writeFile,open,stat,appendFile} from 'node:fs/promises';import {createReadStream,createWriteStream} from 'node:fs';import {pipeline} from 'node:stream/promises';import {Writable} from 'node:stream';import {pathToFileURL} from 'node:url';import {createVault} from './crypto.mjs';
const names=['database-password','practice-db-password','auth-db-password','jwt-secret','backend-key','encryption-key'];
const targets={accounts:{host:'database',database:'accounts'},catalog:{host:'linear-algebra-opl-catalog-database-1',database:'opl_catalog'}};
const quote=value=>'"'+value.replaceAll('"','""')+'"';
async function key(){await mkdir('/backup-keys',{recursive:true,mode:0o700});try{await writeFile('/backup-keys/key',randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}return (await readFile('/backup-keys/key','utf8')).trim();}
function command(program,args,{password,host,database,input}={}){
 const process=spawn(program,args,{env:{...globalThis.process.env,PGHOST:host,PGDATABASE:database,PGUSER:'postgres',...(password?{PGPASSWORD:password}:{})},stdio:['pipe','pipe','ignore']});
 const done=new Promise((resolve,reject)=>{process.once('error',()=>reject(Error('BACKUP_COMMAND_UNAVAILABLE')));process.once('exit',code=>code===0?resolve():reject(Error('BACKUP_COMMAND_FAILED')));});done.catch(()=>{});
 if(input!==undefined)process.stdin.end(input);return {process,done};
}
async function collect(child,limit=8388608){const parts=[];let bytes=0;for await(const chunk of child.process.stdout){bytes+=chunk.length;if(bytes>limit){child.process.kill();throw Error('BACKUP_METADATA_LIMIT');}parts.push(chunk);}await child.done;return Buffer.concat(parts).toString('utf8');}
async function counts(client){const tables=(await client.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT IN('pg_catalog','information_schema') ORDER BY schemaname,tablename")).rows,result=[];for(const table of tables){const n=(await client.query('SELECT count(*)::text n FROM '+quote(table.schemaname)+'.'+quote(table.tablename))).rows[0].n;result.push({...table,count:n});}return result;}
export async function createBackup(target){
 const config=targets[target];if(!config)throw Error('INVALID_BACKUP_TARGET');await mkdir('/backups',{recursive:true,mode:0o700});
 const secret=await key(),vault=createVault(secret),password=target==='accounts'?(await readFile('/secrets/database-password','utf8')).trim():undefined,id=randomUUID(),connection={...config,password};
 const client=new pg.Client({...connection,user:'postgres',connectionTimeoutMillis:5000});await client.connect();
 const dataFile='/backups/'+id+'.pg.enc';
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const snapshot=(await client.query('SELECT pg_export_snapshot() snapshot')).rows[0].snapshot;
  const manifest={version:1,id,target,createdAt:new Date().toISOString(),tables:await counts(client),roles:await collect(command('pg_dumpall',['--roles-only'],connection)),secrets:{}};
  if(target==='accounts')for(const name of names){const value=(await readFile('/secrets/'+name,'utf8')).trim();if(!/^[a-f0-9]{64}$/.test(value))throw Error('INVALID_BACKUP_SECRET');manifest.secrets[name]=value;}
  const dump=command('pg_dump',['--format=custom','--snapshot='+snapshot],connection),nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(secret,'hex'),nonce);cipher.setAAD(Buffer.from('mathpractice-backup-v1:'+id));
  const handle=await open(dataFile,'wx',0o600);
  try{await handle.write(Buffer.concat([Buffer.from('MPB1'),nonce]));await pipeline(dump.process.stdout,cipher,createWriteStream(dataFile,{fd:handle.fd,autoClose:false,start:16}));await dump.done;await appendFile(dataFile,cipher.getAuthTag());await handle.sync();}
  catch(error){dump.process.kill();throw error;}finally{await handle.close();}
  await writeFile('/backups/'+id+'.manifest.enc',vault.seal(manifest,'backup-manifest:'+id),{flag:'wx',mode:0o600});await client.query('COMMIT');return {id,target,complete:true};
 }finally{await client.end();}
}
async function decrypt(id){
 if(!/^[a-f0-9-]{36}$/.test(id))throw Error('INVALID_BACKUP_ID');const file='/backups/'+id+'.pg.enc',secret=await key(),size=(await stat(file)).size;if(size<33)throw Error('INVALID_BACKUP');
 const handle=await open(file,'r');let header=Buffer.alloc(16),tag=Buffer.alloc(16);try{await handle.read(header,0,16,0);await handle.read(tag,0,16,size-16);}finally{await handle.close();}
 if(header.subarray(0,4).toString()!=='MPB1')throw Error('INVALID_BACKUP');
 const stream=()=>{const decipher=createDecipheriv('aes-256-gcm',Buffer.from(secret,'hex'),header.subarray(4));decipher.setAAD(Buffer.from('mathpractice-backup-v1:'+id));decipher.setAuthTag(tag);return {input:createReadStream(file,{start:16,end:size-17}),decipher};};
 const verified=stream();await pipeline(verified.input,verified.decipher,new Writable({write(_chunk,_encoding,done){done();}}));
 const manifest=createVault(secret).open(await readFile('/backups/'+id+'.manifest.enc','utf8'),'backup-manifest:'+id);if(manifest.id!==id)throw Error('INVALID_BACKUP');
 return {manifest,stream};
}
export async function restoreDisposable(id,host){
 if(!/^mathpractice_restore_[a-f0-9]{12}$/.test(host))throw Error('DISPOSABLE_RESTORE_HOST_REQUIRED');
 const {manifest,stream}=await decrypt(id),database=manifest.target==='accounts'?'account_restore':'catalog_restore',connection={host,database},client=new pg.Client({...connection,user:'postgres',connectionTimeoutMillis:5000});await client.connect();
 try{
  if((await client.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname NOT IN('pg_catalog','information_schema')")).rows[0].n!==0)throw Error('EMPTY_DISPOSABLE_DATABASE_REQUIRED');
  const roles=manifest.roles.replace(/^CREATE ROLE postgres;\r?\n/m,'');const roleCommand=command('psql',['-X','-q','-v','ON_ERROR_STOP=1'],{...connection,input:roles});roleCommand.process.stdout.resume();await roleCommand.done;
  const restore=command('pg_restore',['--single-transaction','--exit-on-error','--dbname='+database],connection),data=stream();restore.process.stdout.resume();
  try{await pipeline(data.input,data.decipher,restore.process.stdin);await restore.done;}catch(error){restore.process.kill();throw error;}
  const actual=await counts(client);if(JSON.stringify(actual)!==JSON.stringify(manifest.tables))throw Error('RESTORED_COUNTS_DIFFER');
  if(manifest.target==='accounts'){
   const vault=createVault(manifest.secrets['encryption-key']),row=(await client.query('SELECT id,encrypted_record FROM practice_runtime.sessions LIMIT 1')).rows[0];
   if(row)vault.open(row.encrypted_record,'session:'+row.id);
   const rls=(await client.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='practice_runtime' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity")).rows[0].n;
   if(rls!==10)throw Error('RESTORED_RLS_MISSING');
   if((await client.query("SELECT has_table_privilege('practice_backend','practice_runtime.attempts','UPDATE') mutable")).rows[0].mutable)throw Error('RESTORED_IMMUTABILITY_MISSING');
  }
  return {complete:true,target:manifest.target,countsMatch:true,authenticatedBackup:true,transactionalRestore:true,...(manifest.target==='accounts'?{applicationKeyRecovered:true,forcedRlsTables:10,immutableAttempts:true}:{})};
 }finally{await client.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{if(process.argv[2]!=='create')throw Error('EXPLICIT_CREATE_REQUIRED');const result=await createBackup(process.argv[3]);await mkdir('/artifacts',{recursive:true});await writeFile('/artifacts/backup-observations.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
 catch{console.error('Encrypted backup failed; no private diagnostics were emitted.');process.exitCode=1;}
}
