import { env } from 'node:process';
import { getExerciseById } from './exercise-catalog.mjs';

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
  };
}

/**
 * Node-only renderer client. Configuration is trusted server configuration.
 * No retries: later state-changing requests must not be duplicated implicitly.
 */
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

  return {
    async loadExercise(input) {
      if (!isRecord(input) || !isText(input.exerciseId)) {
        throw new RendererClientError('INVALID_INPUT', 'An exercise ID is required.');
      }
      const { exerciseId, seed } = input;
      const exercise = getExerciseById(exerciseId);
      if (!exercise) {
        throw new RendererClientError('UNKNOWN_EXERCISE', 'Exercise is not in the approved catalog.');
      }
      // Application seed range; generation and persistence belong to the session layer.
      if (!Number.isInteger(seed) || seed < 1 || seed > 2_147_483_647) {
        throw new RendererClientError('INVALID_INPUT', 'Seed must be an integer between 1 and 2147483647.');
      }

      const body = new URLSearchParams({
        sourceFilePath: exercise.renderer.sourceFilePath,
        problemSeed: String(seed),
        _format: 'json',
        outputFormat: 'default',
        isInstructor: '0',
        showSolutions: '0',
        showCorrectAnswersButton: '0',
      });
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
          body,
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
        return validateResponse(data, exerciseId, seed);
      } catch (error) {
        if (timedOut) {
          throw new RendererClientError('TIMEOUT', 'Renderer request timed out.', { cause: error });
        }
        if (error instanceof RendererClientError) throw error;
        throw new RendererClientError('NETWORK_ERROR', 'Could not communicate with the renderer.', { cause: error });
      } finally {
        clearTimeout(timer);
        controller.abort(); // Also releases unread error or redirect response bodies.
      }
    },
  };
}

/** Convenience entry point using RENDERER_URL from the server environment. */
export async function loadExercise(input) {
  return createRendererClient().loadExercise(input);
}