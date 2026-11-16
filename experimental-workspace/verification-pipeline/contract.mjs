import {createHash} from 'node:crypto';
export const VERSION='queue-local-v1';
export const CHECKS=['rendering','interaction','answerCapture','grading','retries','refresh','ownership','keyboard','mobile'];
export const SEEDS=[1234,4321],VIEWPORTS=['desktop','mobile'];
export const REVIEWS=['requirements','mathematical','interaction','deployment'];
export const STATES=['queued','running','passed','failed','error','unsupported','needs-review','cancelled','stale'];
export const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function classify({cases=[],requirementsComplete=false,unsupported=[],stale=false,reviews={}}){
 if(stale)return 'stale';
 if(unsupported.length)return 'unsupported';
 if(cases.some(c=>c.outcome==='error'))return 'error';
 if(cases.length!==SEEDS.length*VIEWPORTS.length||new Set(cases.map(c=>c.seed+':'+c.viewport)).size!==cases.length)return 'needs-review';
 if(SEEDS.some(s=>VIEWPORTS.some(v=>!cases.some(c=>c.seed===s&&c.viewport===v))))return 'needs-review';
 if(cases.some(c=>!c.sourceVerified||c.correctScore!==1||c.clearedScore!==0||CHECKS.some(k=>c.checks?.[k]!==true)||c.limitations?.length))return 'failed';
 if(!requirementsComplete||REVIEWS.some(k=>reviews[k]!=='accepted'))return 'needs-review';
 return 'passed';
}
export function safeCase(row){
 // No arbitrary exception strings, expected answers, instructor maps, tokens, HTML, screenshots or cookies.
 const result={seed:row.seed,viewport:row.viewport,sourceVerified:row.sourceVerified===true,
 outcome:['passed','failed','error','blocked'].includes(row.outcome)?row.outcome:'error',
 checks:Object.fromEntries(CHECKS.map(k=>[k,row.checks?.[k]===true])),
 correctScore:typeof row.correctScore==='number'&&row.correctScore>=0&&row.correctScore<=1?row.correctScore:null,
 clearedScore:typeof row.clearedScore==='number'&&row.clearedScore>=0&&row.clearedScore<=1?row.clearedScore:null,
 limitations:Array.isArray(row.limitations)?row.limitations.filter(v=>typeof v==='string'&&/^[A-Z0-9_-]{1,80}$/.test(v)).slice(0,20):[],
 error:typeof row.error==='string'&&/^[A-Z0-9_-]{1,100}$/.test(row.error)?row.error:null};
 if(!SEEDS.includes(result.seed)||!VIEWPORTS.includes(result.viewport))throw Error('INVALID_CASE_DIMENSION');
 return result;
}
