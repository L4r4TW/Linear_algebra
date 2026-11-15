/** Pure presentation model. PG's aggregate is authoritative and independent of field weighting. */
export function feedbackOutcome(checked){
 const fields=checked.fieldFeedback??[],score=checked.score;
 if(checked.feedbackVisibility==='suppressed')return {outcome:'ungraded',title:'Answers submitted',detail:'Grading feedback is withheld for this exercise. Your submitted answers have been saved.',scoreText:null};
 if(typeof score!=='number'||!Number.isFinite(score)||score<0||score>1)return {outcome:'ungraded',title:'Answers submitted',detail:'No overall grading result is available for this saved submission.',scoreText:null};
 const invalid=fields.filter(f=>f.status==='invalid').length,unanswered=fields.filter(f=>f.status==='unanswered').length;
 const outcome=invalid?'invalid':score===1?'correct':score>0?'partial':unanswered?'unanswered':'incorrect';
 const allCorrect=fields.length>0&&fields.every(f=>f.status==='correct');
 const title={invalid:'Check your input',correct:allCorrect?'All answers correct':'Full credit awarded',partial:'Partially correct',unanswered:'Some answers are missing',incorrect:'Not correct yet'}[outcome];
 let detail=invalid?`${invalid} ${invalid===1?'answer could':'answers could'} not be interpreted. Fix the input format, then check again.`
  :outcome==='correct'?(allCorrect?'Your submitted answers are correct. Well done.':'PG awarded full credit. Review any available individual feedback.')
  :unanswered?'Complete the unanswered fields and review the feedback beside your answers.':'Review the feedback beside each answer, then try again.';
 if(!fields.length||fields.every(f=>f.status==='ungraded'))detail+=' Individual feedback is not available for this saved result.';
 const rounded=Math.round(score*1000)/10;
 const percentage=score>0&&rounded===0?'>0%':score<1&&rounded===100?'<100%':new Intl.NumberFormat(undefined,{style:'percent',maximumFractionDigits:1}).format(score);
 return {outcome,title,detail,scoreText:'Score: '+percentage};
}