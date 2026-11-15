import {matchesSubmittedAnswers} from './field-feedback.js';
/** Missing snapshots are uncertain; exact named-group comparison retains repeated-value order. */
export function unfinishedAnswers(answers,baseline,{pending=false,unknown=false}={}){
 if(pending||unknown)return true;
 if(!answers)return false;
 if(!baseline)return answers.entries.some(([,value])=>value!=='');
 return !matchesSubmittedAnswers(answers.entries,baseline,answers.fieldNames);
}
export function nextActionText(checked){
 if(checked.feedbackVisibility==='suppressed')return 'Return to answers to edit and submit again in this exercise. Feedback remains withheld. Or choose another exercise.';
 if(checked.score===1)return 'Review your answers, or edit and check again in this same exercise. You can also choose another exercise.';
 return 'Return to answers to edit, then use Check answer again in this same exercise. Or choose another exercise.';
}