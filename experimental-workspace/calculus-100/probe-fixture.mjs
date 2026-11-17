// Synthetic approval fixture only in a guarded disposable catalog database.
import {readFileSync} from 'node:fs';import {sql,literal} from '../importer/db.mjs';
if(!/^opl_importer_test_[a-z0-9]+$/.test(process.env.PGDATABASE??''))throw Error('DISPOSABLE_DATABASE_REQUIRED');
const context=JSON.parse(readFileSync('/qa/calculus/context.json','utf8')),profile=JSON.parse(readFileSync('/qa/application/server/compatibility-profile.json','utf8'));
let source=readFileSync('/qa/pipeline/publication-checks.sql','utf8');
source=source.replace('SELECT * INTO s FROM catalog.source_versions ORDER BY path LIMIT 1;', "SELECT sv.* INTO s FROM catalog.source_versions sv JOIN catalog.aliases a ON a.exercise_id=sv.exercise_id WHERE a.namespace='experimental-opl' AND a.external_id='compat-calculus-numeric-01';");
source=source.replace('{"title":"Synthetic publication source","state":"missing"}',JSON.stringify({title:'Derivative adapter fixture',state:'matched',normalized:['Calculus - single variable','Differentiation','Derivative at a point'],authors:[],institutions:['Rochester'],titleOrigin:'synthetic-test-only'}));
const start=source.indexOf(' meta:='),end=source.indexOf(' INSERT INTO catalog.verifier_contexts',start);
if(start<0||end<0)throw Error('PUBLICATION_FIXTURE_CHANGED');
source=source.slice(0,start)+' meta:='+literal({certified:true,acceptanceOnly:true,profileDigest:'d'.repeat(64),dependencyDigest:'b'.repeat(64),runtimeDigest:context.runtimeDigest,manifest:'a'.repeat(64),attestation:context.attestation,profile:{capabilities:{'native-text':{status:'verified'}}}})+'::jsonb;\n'+source.slice(end);
const cut=source.indexOf(' account_key:=gen_random_uuid();');if(cut<0)throw Error('PUBLICATION_FIXTURE_CHANGED');
source=source.slice(0,cut)+' END $$;COMMIT;';
sql(source);console.log('SYNTHETIC_DISPOSABLE_CATALOG_READY');
