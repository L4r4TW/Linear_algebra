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
