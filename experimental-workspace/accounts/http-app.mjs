import { practiceShell, reportScript, collectionStyle } from './report-shell.mjs';
import { createServer } from 'node:http';
import { actors, AccountError } from './db.mjs';
import { createAdmission } from './admission.mjs';
import { hash } from './crypto.mjs';
import { cookieValue } from './auth.mjs';
import { createApp } from '../application/server/http-app.mjs';
const prefix = '/api/sessions/account/';
const errorMessages = {
  ACCOUNT_RATE_LIMITED: 'Too many requests. Your work is retained. Wait a minute before retrying.',
  PRACTICE_BUSY: 'Practice is busy. Your saved work is retained. Please retry shortly.',
  AUTH_REQUIRED: 'Sign in again to access saved work.',
  ACCOUNT_AUTH_REQUIRED: 'Sign in to use account saved work.',
  INVALID_REPORT: 'Describe the problem in 10–2000 characters.',
  REPORT_RATE_LIMITED: 'Please wait before sending more reports.',
  INVALID_CREDENTIALS: 'Check your email and password. Passwords must have at least 12 characters.',
  AUTH_UNAVAILABLE: 'The account service is unavailable. Please retry.',
  ACCOUNT_STORAGE_UNAVAILABLE: 'Saved work is temporarily unavailable. Please retry.',
  GUEST_CLAIMED: 'This anonymous work was transferred to an account. Sign in to continue.',
  GUEST_WORK_UNAVAILABLE: 'No transferable anonymous work was found in this browser.',
  DRAFT_CONFLICT:
    'Another tab or device saved a newer draft. Both versions are retained until you choose.',
  DRAFT_BASE_CHANGED: 'A newer check was saved. Reload the saved result before saving this draft.',
  LEGACY_IMPORT_UNAVAILABLE:
    'Earlier work could not be transferred completely. It remains in the original workspace.',
  LEGACY_IMPORT_REQUIRES_OPERATOR:
    'This transfer needs an operator review. Your original work is retained.',
};
function json(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(JSON.stringify(value));
}
async function body(req, limit = 8192) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json')
    throw new AccountError('INVALID_INPUT', 415);
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > limit) throw new AccountError('BODY_TOO_LARGE', 413);
      chunks.push(chunk);
    }
  } finally {
    req.resume();
  }
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks));
  } catch {
    throw new AccountError('INVALID_INPUT', 400);
  }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new AccountError('INVALID_INPUT', 400);
  return input;
}
function keys(input, allowed) {
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new AccountError('INVALID_INPUT', 400);
}
export function createAccountApp({
  reports,
  db,
  accounts,
  data,
  sessions,
  practiceSets,
  importLegacy,
  exerciseList,
  setExerciseLookup,
  rendererBaseUrl,
  engineStatus = () => null,
  refreshCatalog = async () => {},
  origin = 'http://localhost:3100',
}) {
  const admission = createAdmission();
  const inner = createApp({
    sessions,
    practiceSets,
    exerciseList,
    setExerciseLookup,
    rendererBaseUrl,
    origin,
  }).listeners('request')[0];
  const secure = new URL(origin).protocol === 'https:' ? '; Secure' : '';
  const cookie = (name, value, path = '/', age = 2592000) =>
    name + '=' + value + '; HttpOnly; SameSite=Strict; Path=' + path + '; Max-Age=' + age + secure;
  const publicAccount = (actor) =>
    actor?.kind === 'account'
      ? { authenticated: true, email: actor.email }
      : { authenticated: false };
  return createServer(async (req, res) => {
    const requestAbort = new AbortController();
    res.once('close', () => requestAbort.abort());
    try {
      const url = new URL(req.url, origin);
      if ((req.url ?? '').length > 6000) throw new AccountError('INVALID_INPUT', 400);
      if (url.pathname === '/internal/status' && req.method === 'GET') {
        await db.transaction({}, (client) => client.query('SELECT 1'));
        return json(res, 200, {
          ready: true,
          admission: admission.snapshot(),
          engine: engineStatus(),
        });
      }
      if (url.pathname.startsWith('/api/sessions')) {
        admission.checkRate('all-session-api');
        const release = await admission.acquire({ signal: requestAbort.signal });
        res.once('finish', release);
        res.once('close', release);
      }
      if (
        req.method === 'GET' &&
        (url.pathname === '/' || url.pathname === '/assets/problem-report.js')
      ) {
        res.writeHead(200, {
          'Content-Type':
            url.pathname === '/' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
        });
        res.end(url.pathname === '/' ? practiceShell() : reportScript);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/assets/collection-shell.css') {
        res.writeHead(200, {
          'Content-Type': 'text/css; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(collectionStyle);
        return;
      }
      const reportRoute = url.pathname.match(/^\/api\/sessions\/([a-f0-9-]{36})\/reports$/);
      const accountRoute = url.pathname.startsWith(prefix),
        draft = url.pathname.match(/^\/api\/sessions\/([a-f0-9-]{36})\/draft$/);
      if (
        (accountRoute || draft || url.pathname.startsWith('/api/sessions')) &&
        (req.headers['sec-fetch-site'] === 'cross-site' ||
          (req.headers.origin && req.headers.origin !== origin) ||
          (req.method === 'POST' && req.headers.origin !== origin))
      )
        throw new AccountError('ORIGIN_NOT_ALLOWED', 403);
      if (accountRoute) {
        if (url.search) throw new AccountError('INVALID_INPUT', 400);
        const action = url.pathname.slice(prefix.length);
        if (['signup', 'login'].includes(action)) {
          if (req.method !== 'POST') throw new AccountError('METHOD_NOT_ALLOWED', 405);
          const input = await body(req);
          keys(input, ['email', 'password']);
          admission.checkRate('auth-global', { limit: 120 });
          if (typeof input.email === 'string')
            admission.checkRate('auth:' + hash(input.email.trim().toLowerCase()), {
              limit: 10,
              windowMs: 300000,
            });
          const value = await accounts.signIn({ ...input, signup: action === 'signup' });
          res.setHeader('Set-Cookie', cookie('mathpractice_account', value.cookie));
          return json(res, 200, { account: publicAccount(value.actor) });
        }
        if (action === 'logout') {
          if (req.method !== 'POST') throw new AccountError('METHOD_NOT_ALLOWED', 405);
          keys(await body(req), []);
          const value = await accounts.logout(
            cookieValue(req.headers.cookie, 'mathpractice_account').value,
          );
          res.setHeader('Set-Cookie', [
            cookie('mathpractice_account', '', '/', 0),
            cookie('la_experiment_owner', value, '/api/sessions'),
            cookie('discovery_recent', '', '/api/sessions', 0),
            cookie('discovery_recent_set', '', '/api/sessions', 0),
          ]);
          return json(res, 200, { account: { authenticated: false } });
        }
      }
      // Public static resources and the catalog require no account/session lookup.
      if (!accountRoute && !draft && !url.pathname.startsWith('/api/sessions')) {
        if (url.pathname === '/api/exercises') await refreshCatalog();
        return await inner(req, res);
      }
      const resolved = await accounts.resolveCookies(req.headers.cookie);
      await refreshCatalog();
      admission.checkRate('owner:' + resolved.actor.principalId, { limit: 240 });
      if (resolved.newGuest)
        res.setHeader(
          'Set-Cookie',
          cookie('la_experiment_owner', resolved.newGuest, '/api/sessions'),
        );
      return await actors.run(
        { ...resolved.actor, requestSignal: requestAbort.signal },
        async () => {
          if (accountRoute) {
            const action = url.pathname.slice(prefix.length);
            if (action === 'status' && req.method === 'GET')
              return json(res, 200, {
                account: publicAccount(resolved.actor),
                environment: 'local-development',
                emailOwnershipVerified: false,
              });
            if (action === 'claim' && req.method === 'POST') {
              keys(await body(req), []);
              const guest = cookieValue(req.headers.cookie, 'la_experiment_owner');
              if (!guest.value) throw new AccountError('GUEST_PROOF_REQUIRED', 400);
              // Initializes authority for legacy prototype cookies, using only the actual cookie proof.
              await accounts.resolveGuest(guest.value);
              const result = await data.claimGuest(guest.value, { importLegacy });
              return json(res, 200, result);
            }
            if (action === 'bookmarks') {
              if (req.method === 'GET')
                return json(res, 200, { bookmarks: await data.bookmarks() });
              if (req.method === 'POST') {
                const input = await body(req);
                keys(input, ['exerciseId', 'saved']);
                return json(res, 200, await data.bookmark(input.exerciseId, input.saved));
              }
            }
            if (action === 'learning-progress' && req.method === 'GET')
              return json(res, 200, {
                ...(await data.learningProgress()),
                scope: resolved.actor.kind === 'account' ? 'account' : 'this-browser',
              });
            if (action === 'progress' && req.method === 'GET')
              return json(res, 200, await data.progress());
            if (action === 'continuation' && req.method === 'GET') {
              if (resolved.actor.kind !== 'account')
                throw new AccountError('ACCOUNT_AUTH_REQUIRED', 401);
              const row = await db.current(
                async (client) =>
                  (
                    await client.query(
                      'SELECT session_id,set_id,item FROM practice_runtime.continuations ORDER BY updated_at DESC LIMIT 1',
                    )
                  ).rows[0],
              );
              return json(
                res,
                200,
                row ? { sessionId: row.session_id, setId: row.set_id, item: row.item } : null,
              );
            }
            throw new AccountError('NOT_FOUND', 404);
          }
          if (reportRoute) {
            if (url.search) throw new AccountError('INVALID_INPUT', 400);
            if (req.method !== 'POST') throw new AccountError('METHOD_NOT_ALLOWED', 405);
            if (!reports) throw new AccountError('REPORT_UNAVAILABLE', 503);
            admission.checkRate('reports:' + resolved.actor.principalId, {
              limit: 10,
              windowMs: 3600000,
            });
            return json(res, 200, await reports(reportRoute[1], await body(req)));
          }
          if (draft) {
            if (url.search) throw new AccountError('INVALID_INPUT', 400);
            if (req.method === 'GET')
              return json(res, 200, { draft: await data.getDraft(draft[1]) });
            if (req.method === 'POST')
              return json(res, 200, {
                draft: await data.saveDraft(draft[1], await body(req, 100000)),
              });
            throw new AccountError('METHOD_NOT_ALLOWED', 405);
          }
          // Only this server-derived authority reaches the existing ownership layer.
          req.headers.cookie = 'la_experiment_owner=' + resolved.actor.ownerToken;
          return await inner(req, res);
        },
      );
    } catch (error) {
      if (res.headersSent || res.destroyed) {
        res.destroy();
        return;
      }
      if (['ACCOUNT_RATE_LIMITED', 'PRACTICE_BUSY'].includes(error.code)) {
        res.setHeader('Retry-After', '60');
        res.setHeader('Connection', 'close');
      }
      const status =
        error instanceof AccountError ? error.status : error.code === 'ENOENT' ? 404 : 503;
      const code =
        error instanceof AccountError
          ? error.code
          : error.code === 'ENOENT'
            ? 'SESSION_NOT_FOUND'
            : 'ACCOUNT_UNAVAILABLE';
      json(res, status, {
        error: {
          code,
          message:
            errorMessages[code] ??
            (status === 404
              ? 'Saved work was not found.'
              : 'The request could not be completed. Your saved work is retained.'),
        },
      });
    }
  });
}
