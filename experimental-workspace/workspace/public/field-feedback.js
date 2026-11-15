import { collectAnswerFields } from './answer-fields.js';
import { answerPresentation } from './widget-answers.js';
/** Compare values by field, retaining duplicate order and treating omitted groups as blank. */
export function matchesSubmittedAnswers(entries, submitted, names) {
  const values = (pairs, name) => {
    const group = pairs.filter(([key]) => key === name).map(([, value]) => value);
    return group.length ? group : [''];
  };
  return names.every((name) => JSON.stringify(values(entries, name)) === JSON.stringify(values(submitted, name)));
}

/** Runs inside the opaque frame. Messages are rendered as text, never PG HTML. */
export function renderFieldFeedback(root, fields, submitted) {
  if (!root || !Array.isArray(fields) || !Array.isArray(submitted)) return;
  const entries = collectAnswerFields(root).entries;
  for (const node of root.querySelectorAll('[data-practice-feedback]')) node.remove();
  for (const control of root.querySelectorAll('[data-practice-description]')) {
    const id = control.getAttribute('data-practice-description');
    if (!id) continue;
    const described = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((part) => part && part !== id);
    if (described.length) control.setAttribute('aria-describedby', described.join(' '));
    else control.removeAttribute('aria-describedby');
    control.removeAttribute('aria-invalid');
    control.removeAttribute('data-practice-description');
  }
  const descriptions = {
    correct: ['Correct', 'Your answer is correct.'],
    incorrect: ['Incorrect', 'Your answer was understood, but it is not mathematically correct.'],
    partial: ['Partially correct', 'Part of this answer is correct. Review it and try again.'],
    invalid: ['Invalid input', 'PG could not interpret this answer. Check its format.'],
    unanswered: ['Not answered', 'Enter an answer, then check again.'],
    ungraded: ['Not graded', 'No individual result is available for this field.'],
    changed: ['Changed since last check', 'Check again to get feedback on your current answer.'],
  };
  for (const [index, field] of fields.entries()) {
    if (!field || typeof field.name !== 'string' || !descriptions[field.status] || typeof field.message !== 'string') continue;
    const presentation=answerPresentation(root,field.name);
    if(!presentation)continue;
    const related=presentation.targets;
    const changed = !matchesSubmittedAnswers(entries, submitted, [field.name]);
    const status = changed ? 'changed' : field.status;
    const [label, fallback] = status==='ungraded'&&field.reason==='suppressed'?['Feedback withheld','Grading feedback is not shown for this field.']:status==='changed'&&field.reason==='suppressed'?['Changed since last check','Check again to save your current answer. Grading feedback remains withheld.']:descriptions[status];
    const box = document.createElement('div');
    box.id = 'practice-field-feedback-' + index;
    box.className = 'field-feedback';
    box.dataset.practiceFeedback = '';
    box.dataset.status = status;
    const heading = document.createElement('strong');
    heading.textContent = label;
    const message = document.createElement('span');
    message.textContent = !changed && field.message ? field.message : fallback;
    box.append(heading, message);
    presentation.anchor.insertAdjacentElement('afterend', box);
    for (const control of related) {
      const previous = control.getAttribute('aria-describedby');
      control.setAttribute('aria-describedby', (previous ? previous + ' ' : '') + box.id);
      control.setAttribute('data-practice-description', box.id);
      if (status === 'invalid') control.setAttribute('aria-invalid', 'true');
    }
  }
}
