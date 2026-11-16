// Server-only CLI adapter. SQL/environment payloads never appear in error messages.
import {spawnSync} from 'node:child_process';
export function literal(value) {
 const text=typeof value==='string'?value:JSON.stringify(value);
 if(text.includes('\0')) throw Error('NUL is not valid SQL text');
 return "'"+text.replaceAll("'","''")+"'";
}
export function sql(statement) {
 const result=spawnSync('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],{
 input:"SET standard_conforming_strings=on;\n"+statement,encoding:'utf8',maxBuffer:64*1024*1024,env:process.env,timeout:120000});
 if(result.error||result.status!==0) {const code=result.stderr?.match(/ERROR:\s+([A-Z0-9]{5})/)?.[1]??'UNKNOWN';const action=({'55P03':'Resume the existing import before starting another','40001':'Reload the current head and retry the same import','23514':'Check inventory completeness, payload shape or immutable source binding','42501':'Check database role grants','55000':'Resume/reconcile the import before publication'})[code]??'Check schema/configuration and migration history';throw Error('DATABASE_QUERY_FAILED ['+code+']: '+action+'; SQL payload omitted');}
 return result.stdout.trim();
}
export function json(statement) {return JSON.parse(sql(statement));}
export function preflight() {
 const result=json("SELECT jsonb_build_object('database',current_database(),'version',current_setting('server_version'),'ready',to_regclass('catalog.source_versions') IS NOT NULL AND to_regprocedure('catalog.is_playable(uuid,uuid,text)') IS NOT NULL);");
 if(!result.ready) throw Error('DATABASE_NOT_MIGRATED');
 return result;
}
