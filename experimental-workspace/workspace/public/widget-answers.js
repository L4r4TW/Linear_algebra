import { isAnswerFieldName } from './answer-fields.js';
/** Narrow GraphTool association: a real hidden PG answer and its matching wrapper. */
export function graphAnswerControl(root, name) {
  if (!root || !isAnswerFieldName(name)) return;
  const fields=[...root.querySelectorAll('input[type="hidden"]')].filter(field=>field.name===name&&!field.matches(':disabled'));
  for(const field of fields){
    if(!field.id || field.id!==field.name)continue;
    const outer=field.closest('.graphtool-outer-container');
    if(!outer || !root.contains(outer))continue;
    const containers=[...outer.querySelectorAll('.graphtool-container')].filter(node=>node.id===field.id+'_graphbox');
    if(containers.length===1)return {field,container:containers[0],outer};
  }
}

/** Keep feedback/focus beside the widget that owns the original answer field. */
export function answerPresentation(root, name) {
  const graph=graphAnswerControl(root,name);
  if(graph){
    const focus=graph.container.querySelector('.jxgbox[tabindex],button:not([disabled]),[tabindex="0"]')??graph.container;
    return {kind:'graph-tool',targets:[...new Set([graph.container,focus])],anchor:graph.outer,focus};
  }
  const controls=[...root.querySelectorAll('input,textarea,select')].filter(control=>control.name===name&&control.type!=='hidden'&&!control.matches(':disabled'));
  if(!controls.length)return;
  const last=controls.at(-1);
  let anchor=last.closest('label')??last;
  if(controls.every(control=>['radio','checkbox'].includes(control.type))){
    const group=last.closest('.checkboxes-container,.radiobuttons-container,.radio-buttons-container,[role="radiogroup"],fieldset');
    if(group&&root.contains(group)&&controls.every(control=>group.contains(control))&&
       [...group.querySelectorAll('input,textarea,select')].every(control=>!isAnswerFieldName(control.name)||control.name===name))anchor=group;
  }
  return {kind:'native',targets:controls,anchor,focus:controls.find(control=>control.checked)??controls[0]};
}

/** GraphTool assigns input.value directly. Observe only its mapped answer instance,
 * preserving the native getter/setter and never changing names or serialization.
 */
export function installGraphAnswerAdapters(root, changed) {
  const disposers=[];
  for(const field of root.querySelectorAll('input[type="hidden"]')){
    if(graphAnswerControl(root,field.name)?.field!==field||Object.hasOwn(field,'value'))continue;
    const descriptor=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field),'value');
    if(!descriptor?.get||!descriptor?.set)continue;
    Object.defineProperty(field,'value',{
      configurable:true,
      get(){return descriptor.get.call(this);},
      set(value){const previous=descriptor.get.call(this);descriptor.set.call(this,value);if(descriptor.get.call(this)!==previous)changed();}
    });
    disposers.push(()=>{delete field.value;});
  }
  return ()=>{for(const dispose of disposers)dispose();};
}