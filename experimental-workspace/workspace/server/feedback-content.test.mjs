import {test} from 'node:test';
import assert from 'node:assert/strict';
import {feedbackText} from './feedback-content.mjs';
import {feedbackParts,reviewedFeedbackTex} from '../public/feedback-content.js';
test('student feedback preserves prose structure, entities, scripts containing TeX and plain exponents',()=>{
 assert.equal(feedbackText('<div>First &amp; second</div><div>Try <b>x</b><sup>2</sup><br>then y<sub>1</sub>.</div>'),'First & second\n\nTry x^(2)\nthen y_(1).');
 assert.equal(feedbackText('Compare <script type="math/tex">\\frac{1}{2}</script> with <script type="math/tex; mode=display">x^2</script>.'),'Compare \\(\\frac{1}{2}\\) with \\[x^2\\].');
});
test('no feedback HTML, attributes, executable content or hidden answer containers are projected',()=>{
 const text=feedbackText('<img src="PRIVATE" onerror="PRIVATE"><a href="javascript:PRIVATE">Review</a><script>PRIVATE</script><style>PRIVATE</style><iframe>PRIVATE</iframe><template>PRIVATE</template><span hidden>PRIVATE</span><span aria-hidden="true">PRIVATE</span><div class="correct-answer">PRIVATE</div><div class="solution">PRIVATE</div><input value="PRIVATE">');
 assert.equal(text,'Review');assert.doesNotMatch(text,/PRIVATE|href|onerror/);
 assert.equal(feedbackText('<span>&lt;img src=x onerror=alert(1)&gt;</span>'),'<img src=x onerror=alert(1)>');
});
test('feedback bounds and types fail before persisting invalid messages',()=>{
 assert.equal(feedbackText(undefined),'');assert.throws(()=>feedbackText({correct_ans:'PRIVATE'}));assert.throws(()=>feedbackText('x'.repeat(64001)));
});
test('only explicit math delimiters produce reviewed notation; dollars remain literal',()=>{
 const parts=feedbackParts('Cost $5. Compare \\(\\frac{1}{2}\\) and \\[x_1^2\\].');
 assert.deepEqual(parts.filter(p=>p.type==='math').map(({value,display})=>({value,display})),[{value:'\\frac{1}{2}',display:false},{value:'x_1^2',display:true}]);
 assert.equal(parts[0].value,'Cost $5. Compare ');
});
test('TeX commands capable of definitions, resources, links or styling always remain inert text',()=>{
 for(const tex of ['\\href{javascript:alert(1)}{x}','\\url{https://example.test}','\\require{html}','\\htmlClass{a}{x}','\\style{color:red}{x}','\\def\\x{1}\\x','\\newcommand{\\x}{1}','\\includegraphics{x}','\\class{a}{x}','\\unicode{x}','\\begin{matrix}1\\end{matrix}','{x','x}','% comment','x$y','a'.repeat(2049),' '.repeat(3)]){
  assert.equal(reviewedFeedbackTex(tex),false,tex);assert.equal(feedbackParts('\\('+tex+'\\)').some(p=>p.type==='math'),false);
 }
 assert.equal(reviewedFeedbackTex('\\left\\langle x_1,\\sqrt{2}\\right\\rangle \\ne \\vec{v}'),true);
});
test('feedback parsing has bounded segment, command and nesting work',()=>{
 assert.equal(reviewedFeedbackTex('\\pi '.repeat(129)),false);assert.equal(reviewedFeedbackTex('{'.repeat(25)+'x'+'}'.repeat(25)),false);
 assert.equal(feedbackParts('\\(x\\)'.repeat(40)).filter(p=>p.type==='math').length,32);
 assert.equal(feedbackParts('x'.repeat(16001))[0].value.endsWith('[Message shortened]'),true);
});