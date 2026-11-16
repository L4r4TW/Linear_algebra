import {preflight} from './db.mjs';
try {
 if(process.argv[2]==='doctor') console.log(JSON.stringify({database:preflight(),readOnly:true}));
 else throw Error('Usage: doctor');
} catch(error) {console.error(error.message);process.exitCode=1;}
