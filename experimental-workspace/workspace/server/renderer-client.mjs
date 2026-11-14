import { projectFieldFeedback } from './grading-feedback.mjs';
import { env } from 'node:process';
import { parseFragment } from 'parse5';
import { getExerciseById } from './exercise-catalog.mjs';
import { validateAnswerEntries } from './answer-contract.mjs';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;

/** Server-side diagnostic. Do not serialize causes or upstream details to browsers. */
export class RendererClientError extends Error {
  constructor(code, message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'RendererClientError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

function feedbackText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new RendererClientError('INVALID_RESPONSE', 'Renderer returned invalid feedback.');
  }
  function text(node) {
    if (node.nodeName === '#text') return node.value;
    if (node.tagName === 'style' || (node.tagName === 'script' &&
        !node.attrs?.some((attribute) => attribute.name === 'type' && attribute.value.startsWith('math/tex')))) return '';
    const content = (node.childNodes ?? []).map(text).join('');
    return ['div', 'p', 'br', 'li', 'ul', 'ol'].includes(node.tagName) ? ' ' + content + ' ' : content;
  }
  return text(parseFragment(value)).replace(/\s+/g, ' ').trim();
}
function validateResponse(data, exerciseId, seed) {
  if (!isRecord(data) || !isRecord(data.flags)) {
    throw new RendererClientError('INVALID_RESPONSE', 'Renderer returned an invalid response.');
  }
  if (![undefined, null, false, 0, '0', ''].includes(data.flags.error_flag)) {
    throw new RendererClientError('PG_ERROR', 'PG could not render the exercise.');
  }
  if (
    !isText(data.renderedHTML) ||
    !isRecord(data.JWT) ||
    !isText(data.JWT.session) ||
    !isText(data.JWT.problem) ||
    !isRecord(data.problem_result) ||
    typeof data.problem_result.score !== 'number' ||
    !Number.isFinite(data.problem_result.score) ||
    data.problem_result.score < 0 ||
    data.problem_result.score > 1 ||
    !isRecord(data.resources) ||
    Object.hasOwn(data, 'answers')
  ) {
    throw new RendererClientError('INVALID_RESPONSE', 'Renderer returned an invalid student response.');
  }

  return {
    exerciseId,
    seed,
    html: data.renderedHTML,
    sessionToken: data.JWT.session,
    problemToken: data.JWT.problem,
    score: data.problem_result.score,
    resources: data.resources,
    feedback: {
      message: feedbackText(data.problem_result.msg),
      summary: feedbackText(data.problem_result.summary),
    },
  };
}

function validateExerciseInput(input) {
  if (!isRecord(input) || !isText(input.exerciseId)) {
    throw new RendererClientError('INVALID_INPUT', 'An exercise ID is required.');
  }
  const exercise = getExerciseById(input.exerciseId);
  if (!exercise) throw new RendererClientError('UNKNOWN_EXERCISE', 'Exercise is not in the approved catalog.');
  if (!Number.isInteger(input.seed) || input.seed < 1 || input.seed > 2_147_483_647) {
    throw new RendererClientError('INVALID_INPUT', 'Seed must be an integer between 1 and 2147483647.');
  }
  return exercise;
}

/** Node-only client. Configuration and persisted session tokens are trusted server data. */
export function createRendererClient({ baseUrl = env.RENDERER_URL, timeoutMs = 30_000 } = {}) {
  let endpoint;
  try {
    if (!isText(baseUrl)) throw new Error('Missing URL');
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('Invalid URL');
    }
    endpoint = new URL(url.href.replace(/\/$/, '') + '/render-api');
  } catch {
    throw new RendererClientError('INVALID_CONFIGURATION', 'Set RENDERER_URL to the renderer HTTP base URL.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
    throw new RendererClientError('INVALID_CONFIGURATION', 'Renderer timeout must be a positive integer in milliseconds.');
  }

  async function request(fields, exerciseId, seed, answers) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: new URLSearchParams(fields),
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) {
        throw new RendererClientError('HTTP_ERROR', 'Renderer returned an unsuccessful HTTP status.', {
          status: response.status,
        });
      }
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new RendererClientError('INVALID_RESPONSE', 'Renderer returned invalid JSON.');
      }
      const result = validateResponse(data, exerciseId, seed);
      if (answers) {
        try {
          result.fieldFeedback = projectFieldFeedback(data.JWT.answer, answers, feedbackText, {
            individualResults: ![false, 0, '0'].includes(data.flags.showPartialCorrectAnswers),
          });
        } catch {
          throw new RendererClientError('INVALID_RESPONSE', 'Renderer returned invalid answer feedback.');
        }
      }
      return result;
    } catch (error) {
      if (timedOut) throw new RendererClientError('TIMEOUT', 'Renderer request timed out.', { cause: error });
      if (error instanceof RendererClientError) throw error;
      throw new RendererClientError('NETWORK_ERROR', 'Could not communicate with the renderer.', { cause: error });
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  return {
    async loadExercise(input) {
      const exercise = validateExerciseInput(input);
      return request({
        sourceFilePath: exercise.renderer.sourceFilePath,
        problemSeed: String(input.seed),
        _format: 'json',
        outputFormat: 'default',
        isInstructor: '0',
        showSolutions: '0',
        showCorrectAnswersButton: '0',
      }, input.exerciseId, input.seed);
    },

    async submitAnswers(input) {
      validateExerciseInput(input);
      if (!isText(input.sessionToken)) {
        throw new RendererClientError('INVALID_INPUT', 'A stored renderer session token is required.');
      }
      try { validateAnswerEntries(input.answers); } catch (cause) {
        throw new RendererClientError('INVALID_INPUT', 'Provide answer name/value pairs only.', { cause });
      }
      return request([
        ['sessionJWT', input.sessionToken],
        ['_format', 'json'],
        ['submitAnswers', '1'],
        ['answersSubmitted', '1'],
        ['isInstructor', '0'],
        ['showSolutions', '0'],
        ['showCorrectAnswersButton', '0'],
        ...input.answers,
      ], input.exerciseId, input.seed, input.answers);
    },
    async restoreSession(input) {
      validateExerciseInput(input);
      if (!isText(input.sessionToken)) {
        throw new RendererClientError('INVALID_INPUT', 'A stored renderer session token is required.');
      }
      // The renderer token preserves the original problem, seed, and student settings.
      // Do not fall back to loadExercise: that would silently discard session state.
      return request({
        sessionJWT: input.sessionToken,
        _format: 'json',
      }, input.exerciseId, input.seed);
    },
  };
}

/** Convenience entry point using RENDERER_URL from the server environment. */
export async function loadExercise(input) {
  return createRendererClient().loadExercise(input);
}
