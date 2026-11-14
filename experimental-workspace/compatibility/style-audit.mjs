// Called before entering any test answers. Reports measurements/booleans, never PG HTML or private state.
export async function auditExerciseStyles(page){
 const originalViewport=page.viewportSize();
 const frame=page.frames().find(f=>f.parentFrame());
 const boundary=await frame.evaluate(()=>{
  const link=document.querySelector('[data-practice-exercise-style]');
  if(!link?.sheet)throw new Error('QA_STYLE_SHEET_MISSING');
  const root=document.getElementById('problem_body');
  const protectedNodes=[...root.querySelectorAll('table input:not([type=hidden]),table select,table textarea,.graphtool-container,.graphtool-container button,.jxgbox,.jxgbox svg')];
  const signature=()=>protectedNodes.map(node=>{
   const style=getComputedStyle(node),box=node.getBoundingClientRect();
   return [box.width,box.height,style.padding,style.display,style.boxSizing,style.fontSize,style.lineHeight,node.getAttribute('viewBox'),style.fill,style.stroke];
  });
  const names=()=>[...root.querySelectorAll('input,textarea,select')].map(n=>[n.name,n.id,n.getAttribute('size'),n.getAttribute('type')]);
  const structure=names();
  const styled=signature();link.sheet.disabled=true;const upstream=signature();link.sheet.disabled=false;
  const differences=[];styled.forEach((values,i)=>values.forEach((value,j)=>{if(value!==upstream[i][j])differences.push({tag:protectedNodes[i].tagName,property:['width','height','padding','display','boxSizing','fontSize','lineHeight','viewBox','fill','stroke'][j],styled:value,upstream:upstream[i][j]});}));
  const protectedUnmarked=[...root.querySelectorAll('.graphtool-outer-container .practice-answer,.jxgbox .practice-answer,.mq-editable-field .practice-answer,table .practice-answer')].length===0;
  return {differences,protectedNodeCount:protectedNodes.length,protectedGeometryEqual:JSON.stringify(styled)===JSON.stringify(upstream),fieldStructureEqual:JSON.stringify(structure)===JSON.stringify(names()),protectedUnmarked,nativeStyledCount:root.querySelectorAll('.practice-answer').length,tableFieldCount:root.querySelectorAll('table input:not([type=hidden])').length,graphIconCount:[...root.querySelectorAll('.gt-tool-button')].filter(n=>getComputedStyle(n).backgroundImage!=='none').length};
 });
 if(!boundary.protectedGeometryEqual){console.log('Protected geometry differences: '+JSON.stringify(boundary.differences));throw new Error('QA_STYLE_PROTECTED_GEOMETRY');}
 if(!boundary.fieldStructureEqual||!boundary.protectedUnmarked)throw new Error('QA_STYLE_PROTECTED_STRUCTURE');
 const layouts=[];
 for(const width of [820,320]){
  await page.setViewportSize({width,height:1000});
  await page.waitForTimeout(100);
  layouts.push(await frame.evaluate(width=>{
   const fields=[...document.querySelectorAll('.practice-answer:not([type=radio]):not([type=checkbox])')];
   return {viewport:width,frameWidth:innerWidth,documentWidth:document.documentElement.scrollWidth,horizontalFrameScroll:document.documentElement.scrollWidth>innerWidth+1,nativeTextTargets:fields.every(n=>getComputedStyle(n).fontSize==='16px'&&n.getBoundingClientRect().height>=48),widgetMathUnmarked:!document.querySelector('.graphtool-container .practice-math,.jxgbox .practice-math')};
  },width));
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('QA_STYLE_OUTER_OVERFLOW');
 }
 await page.setViewportSize(originalViewport);
 await page.waitForTimeout(100);
 if(layouts.some(row=>!row.nativeTextTargets||!row.widgetMathUnmarked))throw new Error('QA_STYLE_TARGET_OR_WIDGET_MATH');
 return {boundary,layouts};
}