import { requestJson } from './http-client.js';
const $ = (id) => document.getElementById(id),
  prefix = '/api/sessions/account/';
let busy = false;
const node = (tag, text) => {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
};
const api = (action, input) =>
  requestJson(prefix + action, {
    ...(input
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }
      : {}),
    timeoutMs: 12000,
  });
async function perform(work) {
  if (busy) return;
  busy = true;
  $('error').hidden = true;
  for (const button of document.querySelectorAll('button')) button.disabled = true;
  try {
    await work();
  } catch (e) {
    $('error').hidden = false;
    $('error').textContent = e.message ?? 'The account service is unavailable.';
    $('retry').hidden = false;
  } finally {
    busy = false;
    for (const button of document.querySelectorAll('button')) button.disabled = false;
  }
}
async function progress() {
  $('progress').setAttribute('aria-busy', 'true');
  try {
    const [result, saved] = await Promise.all([api('progress'), api('bookmarks')]);
    $('counts').textContent =
      result.counts.attempts +
      ' recorded checks across ' +
      result.counts.sessions +
      ' sessions. Showing up to 50 recent checks.';
    $('activity').replaceChildren(
      ...result.recent.map((item) => {
        const li = node('li', ''),
          label = node(item.available ? 'a' : 'span', item.title);
        if (item.available) label.href = '/practice?session=' + encodeURIComponent(item.sessionId);
        li.append(
          label,
          node(
            'p',
            item.outcome === 'feedback-unavailable'
              ? 'Feedback unavailable'
              : item.outcome === 'correct'
                ? 'Correct'
                : item.outcome === 'partial'
                  ? 'Partial credit: ' + Math.round(item.score * 100) + '%'
                  : 'Not correct',
          ),
          node(
            'small',
            'Check ' +
              item.number +
              ' · ' +
              new Date(item.submittedAt).toLocaleString() +
              (item.provenance === 'legacy-latest-only' ? ' · Imported latest check' : ''),
          ),
        );
        return li;
      }),
    );
    if (!result.recent.length)
      $('activity').append(node('li', 'No checks yet. Choose a topic to begin.'));
    $('sets').replaceChildren(
      ...result.sets.map((set) => {
        const li = node(
            'li',
            set.title +
              ' — ' +
              set.opened +
              ' of ' +
              set.total +
              ' exercises opened; ' +
              set.skipped +
              ' marked skipped.',
          ),
          button = node('button', 'Continue set');
        button.type = 'button';
        button.className = 'secondary';
        button.addEventListener(
          'click',
          () =>
            void perform(async () => {
              const value = await requestJson('/api/sessions/sets/' + set.id + '/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ position: set.position, revision: Number(set.revision) }),
              });

              location.assign(
                '/practice?' +
                  new URLSearchParams({
                    session: value.sessionId,
                    set: set.id,
                    item: String(set.position),
                  }),
              );
            }),
        );
        li.append(' ', button);
        return li;
      }),
    );
    if (!result.sets.length) $('sets').append(node('li', 'No practice sets yet.'));
    $('bookmarks').replaceChildren(
      ...saved.bookmarks.map((item) => {
        const li = node('li', item.title + (item.available ? '' : ' — currently unavailable'));
        if (item.available) {
          const link = node('a', 'Find exercise');
          link.href = '/?q=' + encodeURIComponent(item.title);
          li.append(' ', link);
        }
        return li;
      }),
    );
    if (!saved.bookmarks.length) $('bookmarks').append(node('li', 'No account bookmarks yet.'));
    $('history-note').textContent = result.history + ' ' + result.denominator;
    $('progress').hidden = false;
  } finally {
    $('progress').setAttribute('aria-busy', 'false');
  }
}
async function load() {
  $('retry').hidden = true;
  $('status').textContent = 'Checking account…';
  const { account } = await api('status');
  $('signed-in').hidden = !account.authenticated;
  $('signed-out').hidden = account.authenticated;
  $('progress').hidden = true;
  $('status').textContent = account.authenticated
    ? 'Account saved work is available.'
    : 'Sign in and explicitly transfer anonymous work to save it to an account.';
  if (account.authenticated) {
    $('identity').textContent = account.email;
    await progress();
  }
}
$('auth-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void perform(async () => {
    await api(event.submitter?.value === 'signup' ? 'signup' : 'login', {
      email: $('email').value,
      password: $('password').value,
    });
    $('password').value = '';
    await load();
    $('account-title').tabIndex = -1;
    $('account-title').focus();
  });
});
$('logout').addEventListener(
  'click',
  () =>
    void perform(async () => {
      await api('logout', {});
      await load();
    }),
);
$('claim').addEventListener(
  'click',
  () =>
    void perform(async () => {
      if (
        !confirm(
          'Transfer anonymous sessions and practice sets from this browser to this account? The old anonymous credential will stop opening them through this platform.',
        )
      )
        return;
      const result = await api('claim', {});
      $('claim-status').textContent =
        'Transferred ' +
        result.sessions +
        ' sessions and ' +
        result.sets +
        ' sets. Original prototype files were retained.';
      await progress();
    }),
);
$('retry').addEventListener('click', () => void perform(load));
void perform(load);
