import pg from 'pg';import {AsyncLocalStorage} from 'node:async_hooks';import {readFileSync} from 'node:fs';
const {Pool}=pg;export const actors=new AsyncLocalStorage();
export class AccountError extends Error{constructor(code,status=409){super(code);this.code=code;this.status=status;}}
export function createDatabase({host=process.env.ACCOUNT_DB_HOST??'database',database=process.env.ACCOUNT_DB_NAME??'accounts',password=readFileSync('/secrets/practice-db-password','utf8').trim(),max=8,domainErrors=[]}={}){
 const pool=new Pool({host,database,user:'practice_backend',password,max,connectionTimeoutMillis:3000,idleTimeoutMillis:30000,application_name:'mathpractice-account-backend'});
 pool.on('error',()=>{});let waiting=0;
 async function transaction(context,work){
  if(waiting>=24)throw new AccountError('ACCOUNT_BUSY',503);waiting++;
  let client;
  try{
   client=await pool.connect();await client.query('BEGIN');
   await client.query("SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','1500',true),set_config('practice.account_id',$1,true),set_config('practice.guest_digest',$2,true),set_config('practice.auth_digest',$3,true)",[context?.accountId??'',context?.guestDigest??'',context?.authDigest??'']);
   const value=await work(client);await client.query('COMMIT');return value;
  }catch(error){if(client)try{await client.query('ROLLBACK');}catch{};if(error instanceof AccountError||domainErrors.some(Type=>error instanceof Type))throw error;throw new AccountError('ACCOUNT_STORAGE_UNAVAILABLE',503);}
  finally{client?.release();waiting--;}
 }
 const current=work=>{const context=actors.getStore();if(!context)throw new AccountError('ACCOUNT_AUTH_REQUIRED',401);return transaction(context,work);};
 return {transaction,current,close:()=>pool.end()};
}
