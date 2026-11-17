import {randomBytes} from 'node:crypto';import {AccountError} from './db.mjs';import {hash} from './crypto.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const opaque=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
export function cookieValue(header,name){
 const values=(header??'').split(';').map(part=>part.trim()).filter(part=>part.startsWith(name+'=')).map(part=>part.slice(name.length+1));
 return {present:values.length>0,value:values.length===1&&opaque(values[0])?values[0]:null};
}
export function createAccounts({db,vault,authUrl='http://auth:9999',fetcher=fetch,now=Date.now}){
 async function call(path,body,accessToken){
  let response;
  try{response=await fetcher(authUrl+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(accessToken?{Authorization:'Bearer '+accessToken}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});}
  catch{throw new AccountError('AUTH_UNAVAILABLE',503);}
  if(!response.ok)throw new AccountError(path.startsWith('/token')?'INVALID_CREDENTIALS':'AUTH_REQUIRED',401);
  if(response.status===204)return null;
  try{return await response.json();}catch{throw new AccountError('AUTH_UNAVAILABLE',503);}
 }
 function pair(value){
  if(typeof value?.access_token!=='string'||value.access_token.length>50000||typeof value.refresh_token!=='string'||value.refresh_token.length>1024||!Number.isInteger(value.expires_in)||value.expires_in<1||value.expires_in>86400)throw new AccountError('AUTH_UNAVAILABLE',503);
  return {accessToken:value.access_token,refreshToken:value.refresh_token,expiresAt:new Date(now()+value.expires_in*1000)};
 }
 async function primary(client,accountId){
  const ownerToken=vault.ownerToken(accountId),credential=hash(ownerToken);
  await client.query("INSERT INTO practice_runtime.principals(kind,credential_digest,account_id) VALUES('account',$1,$2) ON CONFLICT DO NOTHING",[credential,accountId]);
  const row=(await client.query("SELECT id FROM practice_runtime.principals WHERE kind='account' AND account_id=$1",[accountId])).rows[0];
  if(!row)throw new AccountError('AUTH_UNAVAILABLE',503);return {principalId:row.id,ownerToken};
 }
 async function createSession(value){
  const tokens=pair(value),user=await call('/user',null,tokens.accessToken);if(!uuid.test(user.id))throw new AccountError('AUTH_UNAVAILABLE',503);
  const cookie=randomBytes(32).toString('base64url'),authDigest=hash(cookie);
  const account=await db.transaction({accountId:user.id,authDigest},async client=>{
   const principal=await primary(client,user.id);
   await client.query('INSERT INTO practice_runtime.auth_sessions(id_digest,account_id,encrypted_tokens,expires_at) VALUES($1,$2,$3,$4)',[authDigest,user.id,vault.seal({accessToken:tokens.accessToken,refreshToken:tokens.refreshToken},'auth:'+authDigest),tokens.expiresAt]);
   return principal;
  });
  return {cookie,actor:{kind:'account',accountId:user.id,email:user.email,authDigest,...account}};
 }
 async function signIn({email,password,signup=false}){
  if(typeof email!=='string'||email.length>254||!email.includes('@')||/\s/.test(email)||typeof password!=='string'||password.length<12||password.length>128)throw new AccountError('INVALID_CREDENTIALS',400);
  const value=await call(signup?'/signup':'/token?grant_type=password',{email,password});return createSession(value);
 }
 async function resolveSession(cookie){
  if(!opaque(cookie))throw new AccountError('AUTH_REQUIRED',401);const authDigest=hash(cookie);
  return db.transaction({authDigest},async client=>{
   const row=(await client.query('SELECT * FROM practice_runtime.auth_sessions WHERE id_digest=$1 AND revoked_at IS NULL FOR UPDATE',[authDigest])).rows[0];if(!row)throw new AccountError('AUTH_REQUIRED',401);
   let tokens;try{tokens=vault.open(row.encrypted_tokens,'auth:'+authDigest);}catch{throw new AccountError('AUTH_UNAVAILABLE',503);}
   let expiration=row.expires_at;
   if(new Date(expiration).getTime()<now()+30000){const refreshed=pair(await call('/token?grant_type=refresh_token',{refresh_token:tokens.refreshToken}));tokens={accessToken:refreshed.accessToken,refreshToken:refreshed.refreshToken};expiration=refreshed.expiresAt;}
   const user=await call('/user',null,tokens.accessToken);if(!uuid.test(user.id)||user.id!==row.account_id)throw new AccountError('AUTH_REQUIRED',401);
   await client.query("SELECT set_config('practice.account_id',$1,true)",[user.id]);
   if(expiration!==row.expires_at)await client.query('UPDATE practice_runtime.auth_sessions SET encrypted_tokens=$1,expires_at=$2 WHERE id_digest=$3',[vault.seal(tokens,'auth:'+authDigest),expiration,authDigest]);
   return {kind:'account',accountId:user.id,email:user.email,authDigest,...await primary(client,user.id)};
  });
 }
 async function resolveGuest(ownerToken){
  if(!opaque(ownerToken))throw new AccountError('AUTH_REQUIRED',401);const guestDigest=hash(ownerToken);
  return db.transaction({guestDigest},async client=>{
   let row=(await client.query("SELECT id FROM practice_runtime.principals WHERE credential_digest=$1 AND kind='anonymous' AND account_id IS NULL",[guestDigest])).rows[0];
   if(!row)row=(await client.query("INSERT INTO practice_runtime.principals(kind,credential_digest) VALUES('anonymous',$1) ON CONFLICT DO NOTHING RETURNING id",[guestDigest])).rows[0];
   if(!row)throw new AccountError('GUEST_CLAIMED',401);
   return {kind:'anonymous',guestDigest,principalId:row.id,ownerToken};
  });
 }
 async function resolveCookies(header){
  const auth=cookieValue(header,'mathpractice_account');
  if(auth.present)return {actor:await resolveSession(auth.value),newGuest:null};
  const guest=cookieValue(header,'la_experiment_owner');if(guest.present&&!guest.value)throw new AccountError('AUTH_REQUIRED',401);
  const ownerToken=guest.value??randomBytes(32).toString('base64url');return {actor:await resolveGuest(ownerToken),newGuest:guest.value?null:ownerToken};
 }
 async function logout(cookie){
  if(opaque(cookie)){const authDigest=hash(cookie);await db.transaction({authDigest},async client=>{
   const row=(await client.query('SELECT * FROM practice_runtime.auth_sessions WHERE id_digest=$1 AND revoked_at IS NULL FOR UPDATE',[authDigest])).rows[0];if(!row)return;
   await client.query("SELECT set_config('practice.account_id',$1,true)",[row.account_id]);
   try{const tokens=vault.open(row.encrypted_tokens,'auth:'+authDigest);await call('/logout?scope=global',{},tokens.accessToken);}catch{}
   await client.query('UPDATE practice_runtime.auth_sessions SET revoked_at=now() WHERE id_digest=$1',[authDigest]);
  });}
  return randomBytes(32).toString('base64url');
 }
 return {signIn,resolveSession,resolveGuest,resolveCookies,logout};
}
