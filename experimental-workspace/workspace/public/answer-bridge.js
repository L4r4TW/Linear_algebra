export class AnswerBridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AnswerBridgeError';
    this.code = code;
  }
}

function validSnapshot(data) {
  if (!Number.isSafeInteger(data.revision) || data.revision < 0 ||
      !Array.isArray(data.fieldNames) || !Array.isArray(data.entries)) return false;
  if (data.fieldNames.some((name) => typeof name !== 'string' || !name)) return false;
  const names = new Set(data.fieldNames);
  return names.size === data.fieldNames.length && data.entries.every((entry) =>
    Array.isArray(entry) && entry.length === 2 &&
    typeof entry[0] === 'string' && names.has(entry[0]) && typeof entry[1] === 'string');
}

/** Bind one opaque exercise frame to its parent. No DOM access or same-origin permission. */
export function createAnswerBridge({ frame, channel, onChange = () => {}, timeoutMs = 3000 }) {
  const pending = new Map();
  let closed = false;
  let latest;
  let revision = -1;

  function copy(data) {
    return structuredClone({ fieldNames: data.fieldNames, entries: data.entries });
  }

  function remember(data) {
    if (data.revision < revision) return;
    revision = data.revision;
    latest = copy(data);
    onChange(copy(latest));
  }

  function receive(event) {
    if (closed || event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.channel !== channel) return;
    const data = event.data;
    if (data.type === 'answers-changed' && validSnapshot(data)) {
      remember(data);
    } else if (data.type === 'answers' || data.type === 'answer-collection-error') {
      const request = pending.get(data.requestId);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(data.requestId);
      if (data.type === 'answer-collection-error' || !validSnapshot(data)) {
        request.reject(new AnswerBridgeError('INVALID_RESPONSE', 'The answer fields could not be collected.'));
        return;
      }
      remember(data);
      request.resolve(copy(data));
    }
  }

  window.addEventListener('message', receive);
  return {
    getSnapshot() { return latest ? copy(latest) : undefined; },

    collect() {
      if (closed) return Promise.reject(new AnswerBridgeError('FRAME_REPLACED', 'The exercise has changed.'));
      if (!frame.contentWindow) return Promise.reject(new AnswerBridgeError('NO_FRAME', 'No exercise is open.'));
      const requestId = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new AnswerBridgeError('TIMEOUT', 'The exercise did not return its answers. Please try again.'));
        }, timeoutMs);
        pending.set(requestId, { resolve, reject, timer });
        // Opaque sandbox origins require '*'; the child verifies parent source/origin/channel.
        frame.contentWindow.postMessage({ channel, type: 'collect-answers', requestId }, '*');
      });
    },

    destroy() {
      if (closed) return;
      closed = true;
      window.removeEventListener('message', receive);
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new AnswerBridgeError('FRAME_REPLACED', 'The exercise has changed.'));
      }
      pending.clear();
      latest = undefined;
    },
  };
}
