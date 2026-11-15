/** Shared, closure-free name policy; also embedded in the isolated frame. */
export function isAnswerFieldName(name) {
  const reserved = new Set([
    'sourceFilePath', 'problemSource', 'problemSourceURL', 'problemSeed', 'seed',
    'sessionJWT', 'problemJWT', 'answerJWT', 'JWTanswerURL', 'JWTanswerURLstatus',
    'sessionID', 'isInstructor', 'permissionLevel', 'numCorrect', 'numIncorrect',
    'submitAnswers', 'previewAnswers', 'answersSubmitted', 'showCorrectAnswers',
    'showCorrectAnswersButton', 'hideCheckAnswersButton', 'hidePreviewButton',
    'showSolutions', 'showHints', 'outputFormat', '_format', 'displayMode',
    'baseURL', 'formURL', 'SITE_HOST', 'problem-result-score',
  ]);
  return typeof name === 'string' && name.length > 0 && !reserved.has(name) &&
    !name.startsWith('MaThQuIlL_') && !name.startsWith('previous_');
}

/** Read native PG controls without collapsing duplicate names. */
export function collectAnswerFields(root) {
  if (!root) throw new Error('The exercise answer fields are unavailable.');
  const entries = [];
  const names = new Set();
  for (const control of root.querySelectorAll('input, textarea, select')) {
    const name = control.name;
    if (!isAnswerFieldName(name) || control.matches(':disabled')) continue;
    if (control.tagName === 'INPUT' && ['button', 'submit', 'reset', 'image', 'file'].includes(control.type)) continue;
    names.add(name);
    if (control.tagName === 'INPUT' && ['checkbox', 'radio'].includes(control.type) && !control.checked) continue;
    if (control.tagName === 'SELECT') {
      for (const option of control.selectedOptions) {
        if (!option.matches(':disabled')) entries.push([name, option.value]);
      }
    } else {
      entries.push([name, control.value]);
    }
  }
  return { fieldNames: [...names], entries };
}

/** Transactionally restore only the reviewed native controls in the exact original field contract. */
export function restoreAnswerFields(root, snapshot) {
 const current=collectAnswerFields(root);
 if(!snapshot||JSON.stringify(snapshot.fieldNames)!==JSON.stringify(current.fieldNames)||!Array.isArray(snapshot.entries)||snapshot.entries.length>2000)throw new Error('Draft fields do not match.');
 const names=new Set(current.fieldNames);
 if(!snapshot.entries.every(pair=>Array.isArray(pair)&&pair.length===2&&names.has(pair[0])&&typeof pair[1]==='string'&&pair[1].length<=100000))throw new Error('Invalid draft values.');
 const controls=[...root.querySelectorAll('input,textarea,select')].filter(c=>names.has(c.name)&&!c.matches(':disabled')&&!(c.tagName==='INPUT'&&['button','submit','reset','image','file'].includes(c.type)));
 const assignments=[];
 for(const name of current.fieldNames){
  const group=controls.filter(c=>c.name===name),values=snapshot.entries.filter(pair=>pair[0]===name).map(pair=>pair[1]);
  if(group.every(c=>c.tagName==='INPUT'&&['checkbox','radio'].includes(c.type))){
   if(new Set(group.map(c=>c.type)).size!==1||group[0].type==='radio'&&values.length>1)throw new Error('Invalid choice group.');
   const remaining=[...values];
   for(const control of group){const index=remaining.indexOf(control.value);assignments.push({control,checked:index!==-1});if(index!==-1)remaining.splice(index,1);}
   if(remaining.length)throw new Error('Unknown choice value.');
  }else if(group.length===1&&group[0].tagName==='SELECT'){
   const control=group[0],remaining=[...values],selected=[];
   if(!control.multiple&&values.length>1)throw new Error('Invalid selection.');
   for(const option of control.options){const index=remaining.indexOf(option.value),enabled=!option.matches(':disabled');selected.push(enabled&&index!==-1);if(enabled&&index!==-1)remaining.splice(index,1);}
   if(remaining.length)throw new Error('Unknown option value.');assignments.push({control,selected});
  }else if(group.length===1&&(group[0].tagName==='TEXTAREA'||group[0].tagName==='INPUT'&&['text','number','search','email','url','tel'].includes(group[0].type))&&values.length===1){
   assignments.push({control:group[0],value:values[0]});
  }else throw new Error('Draft restoration is not verified for this control.');
 }
 const previous=assignments.map(({control})=>({control,value:control.value,checked:control.checked,selected:control.tagName==='SELECT'?[...control.options].map(o=>o.selected):null}));
 const set=item=>{if(item.selected){item.control.selectedIndex=-1;[...item.control.options].forEach((o,i)=>{o.selected=item.selected[i];});}else if(Object.hasOwn(item,'checked')&&item.checked!==undefined)item.control.checked=item.checked;else item.control.value=item.value;};
 try{
  assignments.forEach(set);
  if(JSON.stringify(collectAnswerFields(root).entries)!==JSON.stringify(snapshot.entries))throw new Error('Draft values do not match native controls.');
 }catch(error){for(const item of previous){if(item.selected)set(item);else if(['checkbox','radio'].includes(item.control.type))item.control.checked=item.checked;else item.control.value=item.value;}throw error;}
 for(const {control} of assignments){control.dispatchEvent(new Event('input',{bubbles:true}));control.dispatchEvent(new Event('change',{bubbles:true}));}
 return collectAnswerFields(root);
}
