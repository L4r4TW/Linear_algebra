import {test} from 'node:test';import assert from 'node:assert/strict';
import {projectAuthoredHints} from './authored-hints.mjs';
const wrap=message=>'<div class="hint accordion my-3"><details class="accordion-item"><summary>Hint:</summary><div class="accordion-collapse collapse"><div class="accordion-body">'+message+'</div></div></details></div>';
const html=hint=>'<html><head><script src="/working.js"></script></head><body><div id="problem_body"><p>Question</p><input name="AnSwEr0001">'+hint+'<div class="solution">PRIVATE_SOLUTION</div></div></body></html>';
test('only authored existence plus actual supported hint content makes a hint available',()=>{
 const r=projectAuthoredHints(html(wrap('Try <b>drawing</b> \\(x^2\\).<br>Compare the terms.')),{hintExists:true});assert.deepEqual(r.hint,{available:true,message:'Try drawing \\(x^2\\).\nCompare the terms.'});assert.doesNotMatch(r.html,/class="hint|PRIVATE_SOLUTION|Try drawing/);assert.match(r.html,/AnSwEr0001/);assert.match(r.html,/working.js/);
});
test('existence flag alone, missing flag and empty authored hints never produce an action',()=>{
 for(const [body,flag] of [['',true],[wrap(''),true],[wrap('Hidden'),false],[wrap('Hidden'),undefined]]){const r=projectAuthoredHints(html(body),{hintExists:flag});assert.deepEqual(r.hint,{available:false});assert.doesNotMatch(r.html,/Hidden|class="hint|PRIVATE_SOLUTION/);}
});
test('unsupported raw hint wrappers, active content, controls and diagrams are not replaced with guessed hints',()=>{
 for(const hint of ['<div class="hint">Unstructured hint</div>',wrap('<img src="/diagram.png">Read the graph'),wrap('<input name="answer">'),wrap('<script>PRIVATE</script>Text'),wrap('<div class="solution">PRIVATE</div>Text'),wrap('x'.repeat(64001))]){const r=projectAuthoredHints(html(hint),{hintExists:true});assert.deepEqual(r.hint,{available:false});assert.doesNotMatch(r.html,/Unstructured|diagram.png|PRIVATE|class="hint/);}
});
test('marked solutions cannot become hints, while legacy math markers are reduced to inert notation',()=>{
 const r=projectAuthoredHints(html(wrap('Use <script type="math/tex">\\frac{x}{2}</script><a href="javascript:PRIVATE">notation</a>')),{hintExists:true});assert.equal(r.hint.message,'Use \\(\\frac{x}{2}\\)notation');assert.doesNotMatch(JSON.stringify(r),/PRIVATE|javascript/);
});
test('multiple available hint blocks preserve authored order and are capped without partial disclosure',()=>{
 assert.equal(projectAuthoredHints(html(wrap('First')+wrap('Second')),{hintExists:true}).hint.message,'First\n\nSecond');assert.deepEqual(projectAuthoredHints(html(wrap('x').repeat(9)),{hintExists:true}).hint,{available:false});assert.deepEqual(projectAuthoredHints(html(wrap('x'.repeat(16001))),{hintExists:true}).hint,{available:false});
});
test('hints outside the problem wrapper and ordinary help prose do not advertise authored hints',()=>{
 const r=projectAuthoredHints('<html><body>'+wrap('Outside')+'<div id="problem_body"><p>Ordinary help.</p></div></body></html>',{hintExists:true});assert.deepEqual(r.hint,{available:false});assert.match(r.html,/Ordinary help/);
});
test('hidden hints and hints nested in authored/staged containers remain unavailable',()=>{
 for(const content of [wrap('Delayed').replace('class="hint accordion','hidden class="hint accordion'),wrap('Delayed').replace('class="accordion-body"','class="accordion-body" style="display:none"'),'<div class="scaffold">'+wrap('Future stage')+'</div>','<div hidden>'+wrap('Hidden ancestor')+'</div>']){const r=projectAuthoredHints(html(content),{hintExists:true});assert.deepEqual(r.hint,{available:false});assert.doesNotMatch(r.html,/Delayed|Future stage|Hidden ancestor/);}
});