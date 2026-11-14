import {writeFile} from 'node:fs/promises';
export const requiredChecks=['rendering','interaction','answerCapture','grading','retries','refresh','ownership','keyboard','mobile'];
export function assessRegression(report,policy){
 const failures=[];
 const expected=new Set(report.expectedCases.map(c=>`${c.id}:${c.verificationSeed}:${c.viewport}`));
 const seen=new Set();
 if(!expected.size)failures.push('EMPTY_CASE_MATRIX');
 for(const row of report.exercises){
  const key=`${row.id}:${row.verificationSeed}:${row.viewport}`;
  if(!expected.has(key)||seen.has(key))failures.push('CASE_MATRIX_MISMATCH');seen.add(key);
  row.checks={rendering:Boolean(row.rendering?.problemPresent&&row.rendering?.imagesLoaded),interaction:Boolean(row.incorrectOrInvalid||row.incorrect),answerCapture:Boolean(row.collection?.helperFieldsExcluded),grading:row.correct?.score===1&&row.cleared?.score===0,retries:Boolean(row.retry?.passed),refresh:Boolean(row.restoration?.noNewGrade&&row.clearedRestoration?.noNewGrade),ownership:Boolean(row.ownershipProtected&&row.gradingOwnershipProtected&&row.ownerDataUnchanged),keyboard:Boolean(row.keyboard?.passed),mobile:Boolean(row.mobile?.passed)};
  const observed=(row.capabilityFailures??[]).map(f=>f.code);
  if(row.stageLifecycle?.requiresReload)observed.push('STAGED_CONTENT_REQUIRES_REFRESH');
  if(row.mobile?.horizontalFrameScroll||row.styling?.layouts?.some(l=>l.horizontalFrameScroll))observed.push('NARROW_FRAME_SCROLL');
  row.limitations=[];
  for(const code of observed){
   const known=policy.limitations.find(l=>l.code===code&&l.exerciseIds.includes(row.id));
   if(known)row.limitations.push({code,capability:known.capability,status:known.status,reason:known.reason});
   else failures.push('UNREGISTERED_LIMITATION:'+row.id+':'+code);
  }
  if(!row.passed||requiredChecks.some(name=>!row.checks[name]))failures.push('CASE_FAILED:'+key);
  row.status=!row.passed||requiredChecks.some(name=>!row.checks[name])?'failed':row.limitations.length?'passed-with-limitations':'passed';
 }
 if(seen.size!==expected.size)failures.push('INCOMPLETE_CASE_MATRIX');
 if(!report.complete)failures.push('INCOMPLETE_RUN');
 return {passed:failures.length===0,expectedCases:expected.size,completedCases:seen.size,failures:[...new Set(failures)],limitedCases:report.exercises.filter(row=>row.limitations.length).length};
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function writeRegressionReport(report,policy,output){
 report.summary=assessRegression(report,policy);report.unverified=policy.unverified;
 const lines=['# Compatibility regression results','',`Observed: ${report.observedAt}. Scope: ${report.partial?'focused run':'complete default matrix'}.`, '',`Result: **${report.summary.passed?'PASS':'FAIL'}**; ${report.summary.completedCases}/${report.summary.expectedCases} cases completed. ${report.summary.limitedCases} cases retain documented limitations.`, '', 'A passing flow does not approve every capability or enable student catalog entries.','', '| Exercise | Seed | Viewport | Checks | Status | Unsupported or limited capabilities |','| --- | --- | --- | --- | --- | --- |'];
 const rows=report.exercises.map(row=>[row.id,row.verificationSeed,row.viewport,requiredChecks.filter(name=>row.checks[name]).length+'/'+requiredChecks.length,row.status,row.limitations.map(l=>l.code).join(', ')||row.error||'None observed']);
 for(const row of rows)lines.push('| '+row.join(' | ')+' |');
 lines.push('','## Known capability boundaries','');
 for(const limit of policy.limitations)lines.push(`- **${limit.code}** (${limit.status}): ${limit.reason} Affected fixtures: ${limit.exerciseIds.join(', ')}.`);
 lines.push('','## Unverified or manual review','');
 for(const gap of policy.unverified)lines.push(`- **${gap.capability}** (${gap.status}): ${gap.reason}`);
 if(report.summary.failures.length)lines.push('','## Failures','',...report.summary.failures.map(code=>'- '+code));
 const markdown=lines.join('\n')+'\n';
 const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Compatibility regression</title><style>body{font:16px/1.5 system-ui;margin:24px;color:#183c34;background:#fafbf8}main{max-width:1400px;margin:auto}.table{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;border:1px solid #b8cebd;padding:10px}th{background:#e8f2ec}.failed{background:#ffebe8}.passed-with-limitations{background:#fff4d9}.passed{background:#edf7f0}code{overflow-wrap:anywhere}h1{font-size:28px}li{margin-block:8px}</style><main><h1>Compatibility regression: '+(report.summary.passed?'PASS':'FAIL')+'</h1><p>'+escape(report.observedAt)+' · '+report.summary.completedCases+'/'+report.summary.expectedCases+' cases · '+(report.partial?'Focused run':'Complete default matrix')+'</p><p>Passing tests do not enable the student catalog or approve unsupported capabilities.</p><div class="table"><table><thead><tr>'+['Exercise','Seed','Viewport','Checks','Status','Capability gaps / failure'].map(v=>'<th>'+v+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr class="'+escape(row[4])+'">'+row.map(v=>'<td>'+escape(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><h2>Known capability boundaries</h2><ul>'+policy.limitations.map(l=>'<li><strong>'+escape(l.code)+'</strong> ('+escape(l.status)+'): '+escape(l.reason)+'</li>').join('')+'</ul><h2>Unverified or manual review</h2><ul>'+policy.unverified.map(l=>'<li><strong>'+escape(l.capability)+'</strong> ('+escape(l.status)+'): '+escape(l.reason)+'</li>').join('')+'</ul><h2>Run failures</h2><ul>'+report.summary.failures.map(code=>'<li>'+escape(code)+'</li>').join('')+'</ul></main></html>';
 await writeFile(output+'/regression-results.json',JSON.stringify(report,null,2)+'\n');
 await writeFile(output+'/REGRESSION_STATUS.md',markdown);
 await writeFile(output+'/index.html',html);
 return report.summary;
}
