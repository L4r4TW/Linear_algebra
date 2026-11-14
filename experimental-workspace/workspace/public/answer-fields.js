/**
 * Read enabled answer controls in PG's problem wrapper using successful-control
 * semantics. Keep ordered pairs: repeated checkbox/select names must not collapse.
 * This function is self-contained because the frame embeds its source.
 */
export function collectAnswerFields(root) {
  if (!root) throw new Error('The exercise answer fields are unavailable.');
  const reserved = new Set([
    'sourceFilePath', 'problemSource', 'problemSourceURL', 'problemSeed', 'seed',
    'sessionJWT', 'problemJWT', 'answerJWT', 'JWTanswerURL', 'JWTanswerURLstatus',
    'sessionID', 'isInstructor', 'permissionLevel', 'numCorrect', 'numIncorrect',
    'submitAnswers', 'previewAnswers', 'answersSubmitted', 'showCorrectAnswers',
    'showCorrectAnswersButton', 'hideCheckAnswersButton', 'hidePreviewButton',
    'showSolutions', 'showHints', 'outputFormat', '_format', 'displayMode',
    'baseURL', 'formURL', 'SITE_HOST', 'problem-result-score',
  ]);
  const entries = [];
  const names = new Set();
  for (const control of root.querySelectorAll('input, textarea, select')) {
    const name = control.name;
    if (!name || control.matches(':disabled') || reserved.has(name) ||
        name.startsWith('MaThQuIlL_') || name.startsWith('previous_')) continue;
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
