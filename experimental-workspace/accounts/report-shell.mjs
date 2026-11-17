import {readFileSync} from 'node:fs';
export function practiceShell(){
 const html=readFileSync(new URL('../application/public/index.html',import.meta.url),'utf8');
 const block=`<section aria-label="Exercise quality" id="problem-report" class="page-footer">
 <p id="pilot-note" hidden>Tested local pilot. If something looks wrong, please report it.</p>
 <button type="button" id="report-open" class="action" disabled>Report a problem</button>
 <form id="report-form" hidden>
 <h2 id="report-heading" tabindex="-1">Report a problem</h2>
 <p>Your answers and exercise stay here. Please describe the issue without personal information.</p>
 <p><label for="report-category">Problem type</label> <select id="report-category"><option value="question">Question or mathematics</option><option value="grading">Answer checking</option><option value="display">Display</option><option value="accessibility">Accessibility</option><option value="other">Other</option></select></p>
 <p><label for="report-message">What went wrong?</label><br><textarea id="report-message" required minlength="10" maxlength="2000" rows="4" cols="28"></textarea></p>
 <button type="submit" id="report-send" class="action">Send report</button> <button type="button" id="report-cancel" class="action">Cancel</button>
 </form><p id="report-status" role="status" aria-live="polite"></p></section>
 <script type="module" src="/assets/problem-report.js"></script>`;
 return html.replace('<p class="page-footer">Take your time. Understanding grows with practice.</p>',block);
}
export const reportScript=readFileSync(new URL('./public/problem-report.js',import.meta.url));
