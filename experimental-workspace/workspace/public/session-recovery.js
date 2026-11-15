/** Recovery choices are controlled by our API codes, never raw renderer text. */
export class ExerciseRequestError extends Error {
 constructor(code,status,message){super(message);this.name='ExerciseRequestError';this.code=code;this.status=status;}
}
export function sessionRecovery(error,{phase='load'}={}){
 const code=error?.code;
 const choices={
  INVALID_INPUT:['This session link is invalid','This session link is not valid. Choose an exercise from the topic list to continue.'],
  SESSION_EXPIRED:['This saved session has expired','The renderer confirmed that this saved session has expired. Saved answers and any draft in this tab have been kept. Choose another exercise to continue.'],
  SESSION_REJECTED:['This saved session cannot be resumed','The exercise service no longer accepts this saved session. Saved answers and any draft in this tab have been kept. Choose another exercise to continue.'],
  SESSION_NOT_FOUND:['Session unavailable in this browser','Session was not found. It may be missing, or this browser may not have access. Open the link in the browser where you started, or choose another exercise.'],
  EXERCISE_WITHDRAWN:['This exercise is currently unavailable','This exercise is no longer enabled for practice. Your saved session and tab draft have been kept. Choose another available exercise.'],
  UNKNOWN_EXERCISE:['This exercise is currently unavailable','This exercise is not available in the practice catalog. Choose another available exercise.']
 };
 if(Object.hasOwn(choices,code))return {code,title:choices[code][0],message:choices[code][1],retry:false,reconcile:false,terminal:true};
 const uncertain=phase==='grade'&&(error?.name==='TimeoutError'||error instanceof TypeError||['INVALID_RESPONSE','UNCONFIRMED_SUBMISSION','SESSION_BUSY'].includes(code));
 if(uncertain)return {code,title:'Check the saved session before retrying',message:code==='SESSION_BUSY'
  ?'An answer is already being checked. Wait a moment, then reload this saved session before checking again.'
  :'We could not confirm whether your answers were saved. Reload this saved session to check the latest result before checking again.',retry:false,reconcile:true,terminal:false};
 if(phase==='load'&&error instanceof TypeError)return {code,title:'The exercise service could not be reached',message:'This browser could not reach the exercise service. Try again when the connection returns. Any saved session and tab draft have been kept.',retry:true,reconcile:false,terminal:false};
 if(code==='RENDERER_UNAVAILABLE')return {code,title:'The exercise service is unavailable',message:'The exercise service is temporarily unavailable. Try again when it returns. Any saved session and tab draft have been kept.',retry:true,reconcile:false,terminal:false};
 if(code==='RENDERER_TIMEOUT'||error?.name==='TimeoutError')return {code,title:'The exercise service took too long',message:phase==='grade'
  ?'Checking took too long. Your inputs and tab draft are still here. Try Check answer again when the service responds.'
  :'Loading took too long. Try again to load this same saved session. Any tab draft has been kept.',retry:true,reconcile:false,terminal:false};
 return {code,title:phase==='grade'?'Your answers could not be checked':'Couldn’t open this exercise',message:typeof error?.message==='string'?error.message:'The exercise service is unavailable. Please try again.',retry:true,reconcile:false,terminal:false};
}