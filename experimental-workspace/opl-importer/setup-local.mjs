import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sql,literal} from './db.mjs';
sql(readFileSync('/importer/platform-local.sql','utf8'));
for(const name of readdirSync('/migrations').filter(n=>/^20261116\d+.*\.sql$/.test(n)).sort()) {
 const bytes=readFileSync('/migrations/'+name),hash=createHash('sha256').update(bytes).digest('hex');
 const previous=sql(`SELECT sha256 FROM importer_admin.migrations WHERE name=${literal(name)};`);
 if(previous) {if(previous!==hash) throw Error('MIGRATION_CHECKSUM_DRIFT: '+name);continue;}
 const source=bytes.toString('utf8');
 if(!/COMMIT;\s*$/.test(source)) throw Error('Migration must end in COMMIT');
 sql(source.replace(/COMMIT;\s*$/,`INSERT INTO importer_admin.migrations VALUES(${literal(name)},${literal(hash)});COMMIT;`));
 console.log('Applied '+name);
}
