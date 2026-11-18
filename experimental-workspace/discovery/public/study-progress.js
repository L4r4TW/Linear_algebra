import { requestJson, delay } from './http-client.js';

const MAX_BACKFILL_REQUESTS = 30;
export async function loadStudyProgress({
  onLoading = () => {},
  signal,
  request = requestJson,
  pause = delay,
} = {}) {
  onLoading();
  for (let attempt = 0; attempt < MAX_BACKFILL_REQUESTS; attempt++) {
    const value = await request('/api/sessions/account/learning-progress', { signal });
    if (!value.syncing) return value;
    await pause(200, signal);
  }
  throw Error('Your saved progress is still being updated. Please retry shortly.');
}

export function progressElements(parent, { completed, target, percent }, label) {
  parent.replaceChildren();
  const text = document.createElement('span');
  text.className = 'progress-label';
  text.textContent = percent + '% complete · ' + completed + ' / ' + target;
  const bar = document.createElement('progress');
  bar.max = 100;
  bar.value = percent;
  bar.setAttribute('aria-label', label + ' completion');
  parent.append(text, bar);
}
