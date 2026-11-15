import { randomInt, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, link, unlink, rename } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { env } from 'node:process';
import { getExerciseById } from './exercise-catalog.mjs';
import { hasValidSubmissionState } from './submission-state.mjs';
import { createRendererClient, RendererClientError } from './renderer-client.mjs';
import { AnswerContractError, validateAnswerEntries, getAnswerContract, completeAnswerEntries } from './answer-contract.mjs';

const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isSessionId = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const isOwnerToken = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const ownerHash = (token) => createHash('sha256').update(token).digest('hex');
// One local backend process. Shared across service instances, released even on failures.
const activeSubmissions = new Set();

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
    !isText(record.exerciseId) || !hasValidSubmissionState(record) ||
    !Number.isInteger(record.seed) || record.seed < 1 || record.seed > 2147483647 ||
    !isText(record.rendererSessionToken) || !isText(record.rendererProblemToken) ||
    (record.ownerHash !== undefined && (typeof record.ownerHash !== 'string' || !/^[0-9a-f]{64}$/.test(record.ownerHash))) ||
    (record.updatedAt !== undefined && (!isText(record.updatedAt) || !Number.isFinite(Date.parse(record.updatedAt)))) ||
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
    submission: structuredClone(record.lastSubmission ?? null),
    exercise: {
      html: rendered.html,
      score: record.lastSubmission?.score ?? rendered.score,
      resources: rendered.resources,
    },
  };
}

/** Local persistent sessions. Accounts and attempt-history storage are separate layers. */
export function createExerciseSessions({
  directory = env.EXERCISE_SESSION_DIR,
  exerciseLookup = getExerciseById,
  seedGenerator = () => randomInt(1, 2147483648),
  rendererClient = createRendererClient({exerciseLookup}),
} = {}) {
  if (!isText(directory) || !isAbsolute(directory)) {
    throw new ExerciseSessionError('INVALID_CONFIGURATION', 'Set EXERCISE_SESSION_DIR to an absolute storage directory.');
  }

  async function save(record, { replace = false } = {}) {
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
      if (replace) await rename(temporary, destination);
      else await link(temporary, destination);
    } catch (cause) {
      throw new ExerciseSessionError('STORAGE_ERROR', 'Could not save exercise session.', { cause });
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }

  async function readSession(sessionId, ownerToken) {
    if (!isSessionId(sessionId)) {
      throw new ExerciseSessionError('INVALID_INPUT', 'A valid exercise session ID is required.');
    }
    let record;
    try {
      record = JSON.parse(await readFile(join(directory, sessionId + '.json'), 'utf8'));
    } catch (cause) {
      if (cause.code === 'ENOENT') throw new ExerciseSessionError('SESSION_NOT_FOUND', 'Exercise session was not found.');
      throw new ExerciseSessionError('STORAGE_ERROR', 'Could not read exercise session.', { cause });
    }
    validateRecord(record, sessionId);
    if (record.ownerHash !== undefined) {
      if (!isOwnerToken(ownerToken) || !timingSafeEqual(Buffer.from(record.ownerHash, 'hex'), Buffer.from(ownerHash(ownerToken), 'hex'))) {
        throw new ExerciseSessionError('SESSION_FORBIDDEN', 'Exercise session is not owned by this browser.');
      }
    } else if (ownerToken !== undefined) {
      throw new ExerciseSessionError('SESSION_FORBIDDEN', 'Exercise session was not found.');
    }
    if (!exerciseLookup(record.exerciseId)) {
      throw new ExerciseSessionError('EXERCISE_WITHDRAWN', 'Stored exercise is no longer in the approved catalog.');
    }
    return record;
  }

  return {
    async startSession(input) {
      if (!input || !isText(input.exerciseId)) throw new ExerciseSessionError('INVALID_INPUT', 'An exercise ID is required.');
      if (!exerciseLookup(input.exerciseId)) throw new ExerciseSessionError('UNKNOWN_EXERCISE', 'Exercise is not in the approved catalog.');
      if (input.ownerToken !== undefined && !isOwnerToken(input.ownerToken)) {
        throw new ExerciseSessionError('INVALID_INPUT', 'A valid owner token is required.');
      }
      const id = randomUUID();
      const seed = seedGenerator();
      if (!Number.isInteger(seed) || seed < 1 || seed > 2147483647) {
        throw new ExerciseSessionError('INVALID_CONFIGURATION', 'The session seed generator returned an invalid seed.');
      }
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
        submissionCount: 0,
        lastSubmission: null,
      };
      validateRecord(record, id);
      await save(record);
      return present(record, rendered);
    },

    async resumeSession(sessionId, { ownerToken } = {}) {
      const record = await readSession(sessionId, ownerToken);
      const rendered = await rendererClient.restoreSession({
        exerciseId: record.exerciseId, seed: record.seed, sessionToken: record.rendererSessionToken,
      });
      return present(record, rendered);
    },

    async submitAnswers(sessionId, answers, { ownerToken } = {}) {
      // Grading always requires ownership, including for internal callers.
      if (!isOwnerToken(ownerToken)) throw new ExerciseSessionError('SESSION_FORBIDDEN', 'Exercise session was not found.');
      await readSession(sessionId, ownerToken);
      try { validateAnswerEntries(answers); } catch (cause) {
        throw new ExerciseSessionError('INVALID_ANSWERS', 'Provide answer name/value pairs only.', { cause });
      }
      const lockKey = join(directory, sessionId + '.json');
      if (activeSubmissions.has(lockKey)) {
        throw new ExerciseSessionError('SESSION_BUSY', 'An answer is already being checked.');
      }
      activeSubmissions.add(lockKey);
      try {
        const record = await readSession(sessionId, ownerToken);
        const restored = await rendererClient.restoreSession({
          exerciseId: record.exerciseId, seed: record.seed, sessionToken: record.rendererSessionToken,
        });
        let contract;
        try { contract = getAnswerContract(restored.html); } catch (cause) {
          throw new RendererClientError('INVALID_RESPONSE', 'Renderer answer fields could not be verified.', { cause });
        }
        let complete;
        try { complete = completeAnswerEntries(answers, contract); } catch (cause) {
          if (!(cause instanceof AnswerContractError)) throw cause;
          throw new ExerciseSessionError('INVALID_ANSWERS', 'Some answer fields are not valid for this exercise.', { cause });
        }
        const submittedAt = new Date().toISOString();
        const graded = await rendererClient.submitAnswers({
          exerciseId: record.exerciseId,
          seed: record.seed,
          sessionToken: record.rendererSessionToken,
          answers: complete,
        });
        const updated = {
          ...record,
          rendererSessionToken: graded.sessionToken,
          rendererProblemToken: graded.problemToken,
          updatedAt: new Date().toISOString(),
          submissionCount: (record.submissionCount ?? 0) + 1,
          lastSubmission: {
            id: randomUUID(),
            number: (record.submissionCount ?? 0) + 1,
            submittedAt,
            fieldNames: [...contract.keys()],
            answers: structuredClone(answers),
            score: graded.score,
            feedback: structuredClone(graded.feedback ?? { message: '', summary: '' }),
            fieldFeedback: structuredClone(graded.fieldFeedback ?? []),
          },
        };
        validateRecord(updated, sessionId);
        await save(updated, { replace: true });
        return present(updated, graded);
      } finally {
        activeSubmissions.delete(lockKey);
      }
    },
  };
}