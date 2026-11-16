import {json,sql,literal as L} from '../importer/db.mjs';import {digest} from './contract.mjs';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const sameAttestation=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export async function observeRenderer(){
 const context=json("SELECT jsonb_build_object('id',c.id,'attestation',c.payload->'attestation') FROM catalog.verifier_heads h JOIN catalog.verifier_contexts c ON c.id=h.context_id WHERE h.scope='local-practice';");if(!context)return {matches:false,code:'NO_CONTEXT'};
 let matches=false,code='RENDERER_UNAVAILABLE';
 try{const response=await fetch((process.env.RENDERER_URL??'http://renderer:3000')+'/verification-build.json',{signal:AbortSignal.timeout(5000),redirect:'error'});if(response.ok){matches=sameAttestation(await response.json(),context.attestation);code=matches?'MATCHING_RENDERER':'RENDERER_BUILD_CHANGED';}}catch{}
 sql(`INSERT INTO catalog.verifier_health(scope,context_id,matches,code) VALUES('local-practice',${L(context.id)}::uuid,${matches},${L(code)}) ON CONFLICT(scope) DO UPDATE SET context_id=excluded.context_id,matches=excluded.matches,code=excluded.code,observed_at=clock_timestamp();`);return {matches,code};
}