import assert from 'node:assert/strict';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {randomBytes} from 'node:crypto';
import {createDatabase} from './db.mjs';import {createVault,hash} from './crypto.mjs';import {createAccounts,cookieValue} from './auth.mjs';
const db=createDatabase(),vault=createVault((await readFile('/secrets/encryption-key','utf8')).trim()),accounts=createAccounts({db,vault}),email='bff-'+randomBytes(12).toString('hex')+'@example.test',password=randomBytes(24).toString('base64url')+'Aa1!';
const report={version:1,observedAt:new Date().toISOString(),scope:'Actual Supabase BFF session and private RLS storage; no browser JWTs, credentials or student records in report'};
try{
 const first=await accounts.signIn({email,password,signup:true}),second=await accounts.signIn({email,password});
 assert.notEqual(first.cookie,second.cookie);assert.equal(first.actor.ownerToken,second.actor.ownerToken);
 const restored=await accounts.resolveSession(first.cookie);assert.equal(restored.accountId,first.actor.accountId);assert.equal(restored.principalId,first.actor.principalId);
 const row=await db.transaction({authDigest:hash(first.cookie)},async client=>(await client.query('SELECT encrypted_tokens FROM practice_runtime.auth_sessions WHERE id_digest=$1',[hash(first.cookie)])).rows[0]);
 assert.ok(row.encrypted_tokens.startsWith('v1.'));assert.ok(!row.encrypted_tokens.includes('access_token'));
 report.actualServerSideAuth=true;report.crossDeviceAccountIdentity=true;report.opaqueDistinctSessions=true;report.authTokensEncrypted=true;
 await assert.rejects(()=>accounts.resolveSession(randomBytes(32).toString('base64url')),/AUTH_REQUIRED/);
 assert.equal(cookieValue('mathpractice_account='+first.cookie+'; mathpractice_account='+second.cookie,'mathpractice_account').value,null);report.forgedAndDuplicateCookiesRejected=true;
 const guestToken=randomBytes(32).toString('base64url'),guest=await accounts.resolveGuest(guestToken);
 await db.transaction({...restored,guestDigest:guest.guestDigest},client=>client.query("UPDATE practice_runtime.principals SET kind='claimed',account_id=$1 WHERE id=$2 AND account_id IS NULL",[restored.accountId,guest.principalId]));
 await assert.rejects(()=>accounts.resolveGuest(guestToken),/GUEST_CLAIMED/);report.claimedGuestCannotReauthenticate=true;
 const reset=await accounts.logout(first.cookie);assert.notEqual(reset,guestToken);await assert.rejects(()=>accounts.resolveSession(first.cookie),/AUTH_REQUIRED/);
 // Supabase global logout can revoke the other refresh session; no claim about unexpired access-token revocation is fabricated.
 report.bffLogoutImmediate=true;report.complete=true;await mkdir('/artifacts',{recursive:true});await writeFile('/artifacts/bff-observations.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({complete:true,credentialsDisclosed:false}));
}finally{await db.close();}
