import {observeRenderer} from '../pipeline/health.mjs';
let stopping=false,wake;process.on('SIGTERM',()=>{stopping=true;wake?.();});
do{try{console.log(JSON.stringify({at:new Date().toISOString(),...await observeRenderer()}));}catch{console.error('HEALTH_OBSERVATION_UNAVAILABLE');}if(stopping)break;await new Promise(resolve=>{const timer=setTimeout(done,15000);function done(){clearTimeout(timer);wake=null;resolve();}wake=done;});}while(!stopping);
