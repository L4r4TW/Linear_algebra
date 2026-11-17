import assert from 'node:assert/strict';import {randomBytes,randomUUID} from 'node:crypto';import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createDatabase} from './db.mjs';import {createVault,hash} from './crypto.mjs';
const db=createDatabase(),vault=createVault((await readFile('/secrets/encryption-key','utf8')).trim()),base=process.env.AUTH_URL??'http://auth:9999';
const report={version:1,observedAt:new Date().toISOString(),scope:'New isolated Supabase project; actual GoTrue users and real nonsuperuser forced-RLS transactions; no student data or credentials disclosed'};
async function identity(){
 const response=await fetch(base+'/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'rls-'+randomBytes(12).toString('hex')+'@example.test',password:randomBytes(24).toString('base64url')+'Aa1!'})});
 assert.equal(response.status,200);const auth=await response.json();const checked=await fetch(base+'/user',{headers:{Authorization:'Bearer '+auth.access_token}});assert.equal(checked.status,200);const user=await checked.json();assert.equal(user.id,auth.user.id);return user.id;
}
try{
 const accountA=await identity(),accountB=await identity(),a={accountId:accountA},b={accountId:accountB},guestToken=randomBytes(32).toString('base64url'),guest={guestDigest:hash(guestToken)};
 const addPrincipal=async(context,kind,credential,accountId)=>db.transaction(context,async client=>(await client.query('INSERT INTO practice_runtime.principals(kind,credential_digest,account_id) VALUES($1,$2,$3) RETURNING id',[kind,credential,accountId])).rows[0].id);
 const principalA=await addPrincipal(a,'account',hash(vault.ownerToken(accountA)),accountA),principalB=await addPrincipal(b,'account',hash(vault.ownerToken(accountB)),accountB),principalGuest=await addPrincipal(guest,'anonymous',guest.guestDigest,null);
 const sessionId=randomUUID(),value={version:1,id:sessionId,privateRendererToken:'synthetic-private-token',answers:[['AnSwEr0001','synthetic work']]},cipher=vault.seal(value,'session:'+sessionId);
 await db.transaction(a,client=>client.query('INSERT INTO practice_runtime.sessions(id,principal_id,encrypted_record) VALUES($1,$2,$3)',[sessionId,principalA,cipher]));
 const owned=await db.transaction(a,client=>client.query('SELECT encrypted_record FROM practice_runtime.sessions WHERE id=$1',[sessionId]));assert.deepEqual(vault.open(owned.rows[0].encrypted_record,'session:'+sessionId),value);
 assert.equal((await db.transaction(b,client=>client.query('SELECT id FROM practice_runtime.sessions WHERE id=$1',[sessionId]))).rowCount,0);
 assert.equal((await db.transaction({},client=>client.query('SELECT id FROM practice_runtime.sessions WHERE id=$1',[sessionId]))).rowCount,0);
 report.realAuthenticatedOwners=true;report.crossAccountDenied=true;report.missingActorDenied=true;report.encryptedRoundTrip=true;
 const setId=randomUUID();
 await db.transaction(b,client=>client.query("INSERT INTO practice_runtime.sets(id,principal_id,request_key,request_digest,title,selection) VALUES($1,$2,$3,$4,'Synthetic set','{}')",[setId,principalB,randomUUID(),hash('synthetic')]));
 await assert.rejects(()=>db.transaction(b,client=>client.query("INSERT INTO practice_runtime.set_items(set_id,principal_id,position,exercise_id,title,source,session_id,state) VALUES($1,$2,0,'synthetic','Synthetic','{}',$3,'ready')",[setId,principalB,sessionId])));
 report.crossOwnerParentLinkDenied=true;
 const guestSession=randomUUID();await db.transaction(guest,client=>client.query('INSERT INTO practice_runtime.sessions(id,principal_id,encrypted_record) VALUES($1,$2,$3)',[guestSession,principalGuest,vault.seal({id:guestSession},'session:'+guestSession)]));
 const stolen=await db.transaction({...b,guestDigest:hash('wrong proof')},client=>client.query("UPDATE practice_runtime.principals SET kind='claimed',account_id=$1 WHERE id=$2 AND account_id IS NULL",[accountB,principalGuest]));assert.equal(stolen.rowCount,0);
 const claimed=await db.transaction({...a,...guest},client=>client.query("UPDATE practice_runtime.principals SET kind='claimed',account_id=$1 WHERE id=$2 AND account_id IS NULL",[accountA,principalGuest]));assert.equal(claimed.rowCount,1);
 assert.equal((await db.transaction(guest,client=>client.query('SELECT id FROM practice_runtime.sessions WHERE id=$1',[guestSession]))).rowCount,0);
 assert.equal((await db.transaction(a,client=>client.query('SELECT id FROM practice_runtime.sessions WHERE id=$1',[guestSession]))).rowCount,1);
 assert.equal((await db.transaction(b,client=>client.query('SELECT id FROM practice_runtime.sessions WHERE id=$1',[guestSession]))).rowCount,0);
 report.guestProofRequired=true;report.explicitClaimTransfersAuthority=true;report.oldGuestAuthorityRetired=true;
 const flags=await db.transaction({},async client=>(await client.query("SELECT r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='practice_runtime' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity)::integer forced_tables,has_table_privilege('anon','practice_runtime.sessions','SELECT') anon_can_read,has_table_privilege('authenticated','practice_runtime.sessions','SELECT') authenticated_can_read FROM pg_roles r WHERE r.rolname=current_user")).rows[0]);
 for(const key of ['rolsuper','rolbypassrls','rolcreatedb','rolcreaterole','anon_can_read','authenticated_can_read'])assert.equal(flags[key],false);
 assert.equal(flags.forced_tables,10);report.nonsuperuserBackend=true;report.forcedRlsTables=flags.forced_tables;report.browserBaseAccessDenied=true;
 report.complete=true;await mkdir('/artifacts',{recursive:true});await writeFile('/artifacts/database-observations.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({complete:true,forcedRlsTables:10,credentialsDisclosed:false}));
}finally{await db.close();}
