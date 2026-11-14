import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { env } from 'node:process';
import { readFileSync } from 'node:fs';
import { parse, serializeOuter } from 'parse5';
import { listExercises } from './exercise-catalog.mjs';
import { createExerciseSessions, ExerciseSessionError } from './exercise-sessions.mjs';
import { RendererClientError } from './renderer-client.mjs';
import { createExerciseAssets } from './exercise-assets.mjs';

const COOKIE = 'la_experiment_owner';
const OWNER_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const BODY_LIMIT = 8192;

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function ownerFromCookie(request) {
  const values = (request.headers.cookie ?? '').split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(COOKIE + '='))
    .map((part) => part.slice(COOKIE.length + 1));
  return values.length === 1 && OWNER_PATTERN.test(values[0]) ? values[0] : undefined;
}

async function readJsonInput(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send an application/json request.');
  }
  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > BODY_LIMIT) throw new ApiError(413, 'BODY_TOO_LARGE', 'Request body is too large.');
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'INVALID_REQUEST', 'Could not read the request body.');
  } finally {
    request.resume();
  }
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Send valid JSON.');
  }
  return input;
}

async function readStartInput(request) {
  const input = await readJsonInput(request);
  if (
    !input || Array.isArray(input) || typeof input !== 'object' ||
    Object.keys(input).length !== 1 ||
    typeof input.exerciseId !== 'string' || !input.exerciseId.trim() || input.exerciseId.length > 128
  ) {
    throw new ApiError(400, 'INVALID_INPUT', 'Provide only a non-empty exerciseId.');
  }
  return { exerciseId: input.exerciseId };
}

/** Extract the PG problem, excluding the renderer's form, hidden JWTs, and controls.
 * This is a template projection, not a sanitizer for arbitrary/untrusted HTML.
 */
export function problemHtml(html) {
  const document = parse(html);
  const matches = [];
  function visit(node) {
    if (node.attrs?.some((attribute) => attribute.name === 'id' && attribute.value === 'problem_body')) {
      matches.push(node);
    }
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(document);
  if (matches.length !== 1) {
    throw new ApiError(502, 'INVALID_RENDERER_CONTENT', 'The exercise content could not be prepared.');
  }
  // These controls belong to the server, even if an upstream template moves them.
  const privateFields = new Set(['sessionJWT', 'problemJWT', 'answerJWT', 'sourceFilePath', 'problemSeed']);
  function removePrivateFields(node) {
    if (!node.childNodes) return;
    node.childNodes = node.childNodes.filter((child) => !child.attrs?.some(
      (attribute) => attribute.name === 'name' && privateFields.has(attribute.value),
    ));
    for (const child of node.childNodes) removePrivateFields(child);
  }
  removePrivateFields(matches[0]);
  return serializeOuter(matches[0]);
}

function publicSession(result, assets) {
  let prepared, html;
  try {
    prepared = assets.prepare({html:result.exercise.html, resources:result.exercise.resources, identity:result.session.id});
    html = prepared.project(problemHtml(result.exercise.html));
  } catch { throw new ApiError(502,'UNSUPPORTED_EXERCISE_RESOURCE','The exercise requires a resource that is not supported yet.'); }
  return {
    session: {
      id: result.session.id,
      exerciseId: result.session.exerciseId,
      createdAt: result.session.createdAt,
    },
    submission: result.submission ? {
      id: result.submission.id,
      number: result.submission.number,
      submittedAt: result.submission.submittedAt,
      fieldNames: [...result.submission.fieldNames],
      answers: result.submission.answers.map((entry) => [...entry]),
      score: result.submission.score,
      feedback: { ...result.submission.feedback },
      fieldFeedback: (result.submission.fieldFeedback ?? []).map((field) => ({
        name: field.name, status: field.status, score: field.score, message: field.message,
      })),
    } : null,
    exercise: {
      html,
      score: result.exercise.score,
      resources: {
        assets: [], dependencies: prepared.dependencies,
      },
    },
  };
}

function failure(error) {
  if (error instanceof ApiError) return error;
  if (error instanceof ExerciseSessionError) {
    if (error.code === 'SESSION_BUSY') return new ApiError(409, 'SESSION_BUSY', 'An answer is already being checked. Please wait.');
    if (error.code === 'INVALID_ANSWERS') return new ApiError(400, 'INVALID_ANSWERS', 'Some answer fields are not valid for this exercise.');
    if (error.code === 'INVALID_INPUT') return new ApiError(400, 'INVALID_INPUT', 'The session request is invalid.');
    if (error.code === 'UNKNOWN_EXERCISE') return new ApiError(404, 'UNKNOWN_EXERCISE', 'Exercise is unavailable.');
    if (error.code === 'SESSION_NOT_FOUND') return new ApiError(404, 'SESSION_NOT_FOUND', 'Session was not found.');
    return new ApiError(500, 'SESSION_SERVICE_ERROR', 'The session could not be accessed.');
  }
  if (error instanceof RendererClientError) {
    if (error.code === 'TIMEOUT') return new ApiError(504, 'RENDERER_TIMEOUT', 'The exercise took too long to load. Please try again.');
    if (error.code === 'NETWORK_ERROR') return new ApiError(503, 'RENDERER_UNAVAILABLE', 'The exercise service is temporarily unavailable.');
    return new ApiError(502, 'RENDERER_ERROR', 'The exercise could not be loaded.');
  }
  return new ApiError(500, 'INTERNAL_ERROR', 'The request could not be completed.');
}

const publicFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/assets/picker.js', ['picker.js', 'text/javascript; charset=utf-8']],
  ['/assets/picker.css', ['picker.css', 'text/css; charset=utf-8']],
  ['/assets/exercise-frame.js', ['exercise-frame.js', 'text/javascript; charset=utf-8']],
  ['/assets/field-feedback.js', ['field-feedback.js', 'text/javascript; charset=utf-8']],
  ['/assets/answer-fields.js', ['answer-fields.js', 'text/javascript; charset=utf-8']],
  ['/assets/answer-bridge.js', ['answer-bridge.js', 'text/javascript; charset=utf-8']],
].map(([path, [file, contentType]]) => [path, {
  body: readFileSync(new URL('../public/' + file, import.meta.url)), contentType,
}]));
/** Local prototype with anonymous browser ownership; account authentication comes later. */
export function createApp({
  sessions = createExerciseSessions(),
  origin = env.APP_ORIGIN ?? 'http://localhost:3100',
  rendererBaseUrl = env.RENDERER_URL,
} = {}) {
  const originUrl = new URL(origin);
  if (!['http:', 'https:'].includes(originUrl.protocol) || originUrl.username || originUrl.password ||
      originUrl.pathname !== '/' || originUrl.search || originUrl.hash) {
    throw new Error('APP_ORIGIN must be the application HTTP origin.');
  }
  const allowedOrigin = originUrl.origin;
  const assets = createExerciseAssets({rendererBaseUrl});
  const cookieSecure = originUrl.protocol === 'https:' ? '; Secure' : '';

  async function handle(request, response) {
    try {
      const url = new URL(request.url, 'http://localhost');
      const isApi = url.pathname.startsWith('/api/');
      if (isApi) {
        if (request.headers['sec-fetch-site'] === 'cross-site' ||
            (request.headers.origin && request.headers.origin !== allowedOrigin)) {
          throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Use the application origin for API requests.');
        }
        if (url.search) throw new ApiError(400, 'INVALID_INPUT', 'Query parameters are not supported.');
      }

      if (url.pathname === '/api/exercises') {
        if (request.method !== 'GET') {
          response.setHeader('Allow', 'GET');
          throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET for this endpoint.');
        }
        json(response, 200, { exercises: listExercises() });
        return;
      }
      if (url.pathname === '/api/sessions') {
        if (request.method !== 'POST') {
          response.setHeader('Allow', 'POST');
          throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use POST for this endpoint.');
        }
        const input = await readStartInput(request);
        const existingOwner = ownerFromCookie(request);
        const ownerToken = existingOwner ?? randomBytes(32).toString('base64url');
        const result = await sessions.startSession({ ...input, ownerToken });
        const output = publicSession(result, assets);
        json(response, 201, output, {
          Location: '/api/sessions/' + result.session.id,
          ...(!existingOwner ? {
            'Set-Cookie': COOKIE + '=' + ownerToken + '; Path=/api/sessions; HttpOnly; SameSite=Strict; Max-Age=2592000' + cookieSecure,
          } : {}),
        });
        return;
      }
      const answerMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/answers$/);
      if (answerMatch) {
        if (request.method !== 'POST') {
          response.setHeader('Allow', 'POST');
          throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use POST for this endpoint.');
        }
        const ownerToken = ownerFromCookie(request);
        if (!ownerToken) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session was not found.');
        const input = await readJsonInput(request);
        if (!input || Array.isArray(input) || typeof input !== 'object' ||
            Object.keys(input).length !== 1 || !Array.isArray(input.answers)) {
          throw new ApiError(400, 'INVALID_INPUT', 'Provide only an answers array of name/value pairs.');
        }
        const result = await sessions.submitAnswers(answerMatch[1], input.answers, { ownerToken });
        json(response, 200, publicSession(result, assets));
        return;
      }
      const match = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (match) {
        if (request.method !== 'GET') {
          response.setHeader('Allow', 'GET');
          throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET for this endpoint.');
        }
        const ownerToken = ownerFromCookie(request);
        if (!ownerToken) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session was not found.');
        json(response, 200, publicSession(await sessions.resumeSession(match[1], { ownerToken }), assets));
        return;
      }
      const exerciseAsset = url.pathname.match(/^\/assets\/exercise\/([A-Za-z0-9_-]{43})\/(0|[1-9]\d*)$/);
      if (exerciseAsset && request.method === 'GET' && !url.search) {
        let asset;
        try { asset = await assets.read(exerciseAsset[1],exerciseAsset[2]); }
        catch { throw new ApiError(502,'EXERCISE_RESOURCE_ERROR','An exercise resource could not load.'); }
        if (!asset) throw new ApiError(404,'NOT_FOUND','Resource was not found.');
        response.writeHead(200,{
          'Content-Type':asset.contentType,
          'Cache-Control':'private, no-store',
          'X-Content-Type-Options':'nosniff',
          'Access-Control-Allow-Origin':'*',
          'Referrer-Policy':'no-referrer',
          'Content-Security-Policy':"sandbox; default-src 'none'; style-src 'unsafe-inline'",
        });
        response.end(asset.body); return;
      }
      if (url.pathname === '/health' && request.method === 'GET') {
        json(response, 200, { status: 'ok', workspace: 'experimental' });
        return;
      }
      if (request.method === 'GET' && publicFiles.has(url.pathname)) {
        const asset = publicFiles.get(url.pathname);
        response.writeHead(200, {
          'Content-Type': asset.contentType,
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(asset.body);
        return;
      }
      const mathjax = url.pathname.match(/^\/assets\/mathjax\/((?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.js)$/);
      if (request.method === 'GET' && mathjax) {
        try {
          const source = new URL('node_modules/mathjax/es5/' + mathjax[1], rendererBaseUrl.replace(/\/$/, '') + '/');
          const asset = await fetch(source, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
          if (!asset.ok) throw new Error('Math asset unavailable');
          const body = await asset.text();
          response.writeHead(200, {
            'Content-Type': 'text/javascript; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
            'X-Content-Type-Options': 'nosniff',
          });
          response.end(body);
          return;
        } catch {
          throw new ApiError(502, 'MATH_RESOURCE_ERROR', 'Math formatting is temporarily unavailable.');
        }
      }      throw new ApiError(404, 'NOT_FOUND', 'Endpoint was not found.');
    } catch (error) {
      request.resume();
      const publicError = failure(error);
      if (!response.headersSent && !response.destroyed) {
        json(response, publicError.status, { error: { code: publicError.code, message: publicError.message } });
      }
    }
  }

  return createServer({ requestTimeout: 10_000, headersTimeout: 10_000 }, (request, response) => {
    void handle(request, response);
  });
}