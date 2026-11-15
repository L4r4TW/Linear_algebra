/** Operator runs consent to intentional reloads/session leaves; dedicated browser tests verify Cancel. */
export function allowIntentionalNavigation(context){
 context.on('page',page=>page.on('dialog',dialog=>{
  if(dialog.type()==='beforeunload'||dialog.type()==='confirm'&&dialog.message().startsWith('Leave this exercise?'))return dialog.accept();
  return dialog.dismiss();
 }));
}