import {readFileSync} from 'node:fs';console.log(JSON.stringify(JSON.parse(readFileSync('/qa/pipeline/reference-fixtures.json','utf8')).exercises.map(e=>e.id)));
