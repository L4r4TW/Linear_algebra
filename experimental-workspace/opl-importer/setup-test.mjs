// Fresh disposable test database only. The caller creates/drops it and never points this at apps.
import {readFileSync,readdirSync} from 'node:fs';import {sql} from './db.mjs';
if(!/^opl_importer_test_[a-z0-9]+$/.test(process.env.PGDATABASE??''))throw Error('DISPOSABLE_TEST_DATABASE_REQUIRED');
sql(readFileSync('/test-platform.sql','utf8'));
for(const file of readdirSync('/migrations').filter(n=>/^20261116\d+.*\.sql$/.test(n)).sort())sql(readFileSync('/migrations/'+file,'utf8'));
