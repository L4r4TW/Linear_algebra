import { randomInt, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, link, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { env } from 'node:process';
import { getExerciseById } from './exercise-catalog.mjs';
import { createRendererClient } from './renderer-client.mjs';

const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isSessionId = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

const isOwnerToken = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const ownerHash = (token) => createHash('sha256').update(token).digest('hex');

export class ExerciseSessionError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message, { cause });
    this.name = 'ExerciseSessionError';
    this.code = code;
  }
}

function validateRecord(record, id) {
  if (
    !record || record.version !== 1 || record.id !== id || !isSessionId(record.id) ||
    !isText(record.exerciseId) ||
    !Number.isInteger(record.seed) || record.seed < 1 || record.seed > 2147483647 ||
    !isText(record.rendererSessionToken) || !isText(record.rendererProblemToken) ||
    (record.ownerHash !== undefined && (typeof record.ownerHash !== 'string' || !/^[0-9a-f]{64}$/.test(record.ownerHash))) ||
    !isText(record.createdAt) || !Number.isFinite(Date.parse(record.createdAt))
  ) {
    throw new ExerciseSessionError('STORAGE_ERROR', 'Stored exercise session is invalid.');
  }
}

function present(record, rendered) {
  return {
    session: {
      id: record.id,
      exerciseId: record.exerciseId,
      seed: record.seed,
      createdAt: record.createdAt,
    },
    exercise: {
      html: rendered.html,
      score: rendered.score,
      resources: rendered.resources,
    },
  };
}

/**
 * Local persistent session service. Tokens stay in private JSON records.
 * HTTP routes, authentication, grading updates, and Supabase storage are separate layers.
 */
export function createExerciseSessions({
  directory = env.EXERCISE_SESSION_DIR,
  rendererClient = createRendererClient(),
} = {}) {
  if (!isText(directory) || !isAbsolute(directory)) {
    throw new ExerciseSessionError('INVALID_CONFIGURATION', 'Set EXERCISE_SESSION_DIR to an absolute storage directory.');
  }

  async function save(record) {
    const temporary = join(directory, '.' + record.id + '-' + randomUUID() + '.tmp');
    const destination = join(directory, record.id + '.json');
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify(record) + '\n', 'utf8');
        await file.sync();
      } finally {
        await file.close();
      }
      // Publish a complete file atomically, without overwriting an existing session.
      await link(temporary, destination);
    } catch (cause) {
      throw new ExerciseSessionError('STORAGE_ERROR', 'Could not save exercise session.', { cause });
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }

  return {
    async startSession(input) {
      if (!input || !isText(input.exerciseId)) {
        throw new ExerciseSessionError('INVALID_INPUT', 'An exercise ID is required.');
      }
      if (!getExerciseById(input.exerciseId)) {
        throw new ExerciseSessionError('UNKNOWN_EXERCISE', 'Exercise is not in the approved catalog.');
      }
      if (input.ownerToken !== undefined && !isOwnerToken(input.ownerToken)) {
        throw new ExerciseSessionError('INVALID_INPUT', 'A valid owner token is required.');
      }
      const id = randomUUID();
      const seed = randomInt(1, 2147483648);
      const rendered = await rendererClient.loadExercise({ exerciseId: input.exerciseId, seed });
      const record = {
        version: 1,
        ...(input.ownerToken !== undefined ? { ownerHash: ownerHash(input.ownerToken) } : {}),
        id,
        exerciseId: input.exerciseId,
        seed,
        rendererSessionToken: rendered.sessionToken,
        rendererProblemToken: rendered.problemToken,
        createdAt: new Date().toISOString(),
      };
      validateRecord(record, id);
      await save(record);
      return present(record, rendered);
    },

    async resumeSession(sessionId, { ownerToken } = {}) {
      if (!isSessionId(sessionId)) {
        throw new ExerciseSessionError('INVALID_INPUT', 'A valid exercise session ID is required.');
      }
      let record;
      try {
        record = JSON.parse(await readFile(join(directory, sessionId + '.json'), 'utf8'));
      } catch (cause) {
        if (cause.code === 'ENOENT') {
          throw new ExerciseSessionError('SESSION_NOT_FOUND', 'Exercise session was not found.');
        }
        throw new ExerciseSessionError('STORAGE_ERROR', 'Could not read exercise session.', { cause });
      }
      validateRecord(record, sessionId);
      if (record.ownerHash !== undefined) {
        if (!isOwnerToken(ownerToken) || !timingSafeEqual(Buffer.from(record.ownerHash, 'hex'), Buffer.from(ownerHash(ownerToken), 'hex'))) {
          throw new ExerciseSessionError('SESSION_NOT_FOUND', 'Exercise session was not found.');
        }
      } else if (ownerToken !== undefined) {
        // Legacy/unowned CLI diagnostic records are never available through the browser API.
        throw new ExerciseSessionError('SESSION_NOT_FOUND', 'Exercise session was not found.');
      }
      if (!getExerciseById(record.exerciseId)) {
        throw new ExerciseSessionError('UNKNOWN_EXERCISE', 'Stored exercise is no longer in the approved catalog.');
      }
      const rendered = await rendererClient.restoreSession({
        exerciseId: record.exerciseId,
        seed: record.seed,
        sessionToken: record.rendererSessionToken,
      });
      return present(record, rendered);
    },
  };
}
