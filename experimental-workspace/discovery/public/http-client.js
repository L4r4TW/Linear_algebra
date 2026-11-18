/** Same-origin JSON boundary. Mutations are never automatically retried. */
export class HttpError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'HttpError';
    this.code = code;
    this.status = status;
  }
}

export async function requestJson(
  path,
  { timeoutMs = 20000, fetcher = globalThis.fetch, signal, ...options } = {},
) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');
    const response = await fetcher(path, { ...options, headers, signal: controller.signal });
    let value;
    try {
      value = await response.json();
    } catch {
      throw new HttpError(
        'INVALID_RESPONSE',
        'The response could not be read. Your saved work is retained. Please retry.',
        response.status,
      );
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new HttpError(
        'INVALID_RESPONSE',
        'The response could not be confirmed. Your saved work is retained.',
        response.status,
      );
    if (!response.ok)
      throw new HttpError(
        typeof value.error?.code === 'string' ? value.error.code : 'REQUEST_FAILED',
        typeof value.error?.message === 'string'
          ? value.error.message
          : 'The request could not be completed. Your saved work is retained.',
        response.status,
      );
    return value;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    // An interrupted POST may have committed. The caller must retain its request key.
    if (timedOut)
      throw new HttpError(
        'REQUEST_TIMEOUT',
        'The request timed out. Your saved work is retained. The result could not be confirmed.',
      );
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      'NETWORK_UNAVAILABLE',
      'The service could not be reached. Your saved work is retained. Please retry.',
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/** Cancel pending polling immediately when its owning view is replaced. */
export function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Request cancelled', 'AbortError'));
      return;
    }
    const finish = () => {
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Request cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
