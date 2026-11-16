import {readFileSync} from 'node:fs';console.log(readFileSync('/secrets/operator-key','utf8').trim());
