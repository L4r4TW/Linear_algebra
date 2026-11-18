const open = document.querySelector('#report-open'),
  form = document.querySelector('#report-form'),
  status = document.querySelector('#report-status'),
  message = document.querySelector('#report-message'),
  send = document.querySelector('#report-send');
let session = null,
  reportSession = null,
  pending = false,
  requestId = null,
  lastPayload = null;
function current() {
  return new URL(location.href).searchParams.get('session');
}
async function update() {
  const id = current();
  open.disabled = !id || pending;
  if (id === session) return;
  session = id;
  if (!pending) {
    form.hidden = true;
    reportSession = null;
    message.value = '';
    requestId = null;
    lastPayload = null;
  }
  document.querySelector('#pilot-note').hidden = true;
  if (!id) return;
  try {
    const [r, c] = await Promise.all([fetch('/api/sessions/' + id), fetch('/api/exercises')]);
    if (!r.ok || !c.ok) return;
    const value = await r.json(),
      catalog = await c.json();
    if (session === id)
      document.querySelector('#pilot-note').hidden = !catalog.exercises.some(
        (e) => e.id === value.session.exerciseId && e.reviewStatus === 'tested-local-pilot',
      );
  } catch {}
}
open.addEventListener('click', () => {
  reportSession = current();
  if (!reportSession) return;
  form.hidden = false;
  status.textContent = '';
  document.querySelector('#report-heading').focus();
});
document.querySelector('#report-cancel').addEventListener('click', () => {
  if (pending) return;
  form.hidden = true;
  open.focus();
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pending || !form.reportValidity()) return;
  if (reportSession !== current()) {
    status.textContent = 'The exercise changed. Open a report for the current exercise.';
    return;
  }
  const payload = {
    category: document.querySelector('#report-category').value,
    message: message.value,
  };
  const signature = JSON.stringify(payload);
  if (signature !== lastPayload) {
    requestId = crypto.randomUUID();
    lastPayload = signature;
  }
  pending = true;
  send.disabled = true;
  message.disabled = true;
  document.querySelector('#report-category').disabled = true;
  document.querySelector('#report-cancel').disabled = true;
  open.disabled = true;
  status.textContent = 'Sending report…';
  try {
    const r = await fetch('/api/sessions/' + reportSession + '/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, requestId }),
    });
    if (!r.ok)
      throw Error(
        r.status === 429
          ? 'Please wait before sending more reports.'
          : 'Report could not be saved. Your message is kept; please retry.',
      );
    status.textContent = 'Thank you. Your report was saved. You can keep practicing.';
    form.hidden = true;
    message.value = '';
    requestId = null;
    lastPayload = null;
    open.focus();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    pending = false;
    send.disabled = false;
    message.disabled = false;
    document.querySelector('#report-category').disabled = false;
    document.querySelector('#report-cancel').disabled = false;
    void update();
  }
});
window.addEventListener('popstate', update);
new MutationObserver(update).observe(document.querySelector('#exercise-title'), {
  childList: true,
  subtree: true,
});
void update();
