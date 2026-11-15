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
export function createAnswerBridge({ frame, channel, onChange = () => {}, onSubmit = () => {}, onInteraction = () => {}, timeoutMs = 3000 }) {
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
    if (data.type === 'exercise-interaction') { onInteraction(); return; }
    if (data.type === 'submit-answers') { onSubmit(); return; }
    if (data.type === 'answers-changed' && validSnapshot(data)) {
      remember(data);
    } else if (data.type === 'answers' || data.type === 'answer-collection-error' || data.type === 'answers-restored' || data.type === 'answer-restore-error') {
      const request = pending.get(data.requestId);
      if (!request || !request.types.includes(data.type)) return;
      clearTimeout(request.timer);
      pending.delete(data.requestId);
      if (data.type === 'answer-collection-error' || data.type === 'answer-restore-error' || !validSnapshot(data)) {
        request.reject(new AnswerBridgeError('INVALID_RESPONSE', 'The answer fields could not be collected.'));
        return;
      }
      remember(data);
      request.resolve(copy(data));
    }
  }

  window.addEventListener('message', receive);
  return {
    focusAnswer(name) {
      if (!closed && typeof name === 'string') frame.contentWindow?.postMessage({ channel, type: 'focus-answer', name }, '*');
    },

    showFeedback(fields, entries) {
      if (closed) return;
      frame.contentWindow?.postMessage({ channel, type: 'show-feedback', fields, entries }, '*');
    },

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
        pending.set(requestId, { resolve, reject, timer, types:['answers','answer-collection-error'] });
        // Opaque sandbox origins require '*'; the child verifies parent source/origin/channel.
        frame.contentWindow.postMessage({ channel, type: 'collect-answers', requestId }, '*');
      });
    },

    restoreDraft(snapshot) {
      if(closed)return Promise.reject(new AnswerBridgeError('FRAME_REPLACED','The exercise has changed.'));
      if(!validSnapshot({...snapshot,revision:0}))return Promise.reject(new AnswerBridgeError('INVALID_DRAFT','The saved draft is invalid.'));
      const requestId=crypto.randomUUID();
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{pending.delete(requestId);reject(new AnswerBridgeError('TIMEOUT','The draft could not be restored.'));},timeoutMs);
        pending.set(requestId,{resolve,reject,timer,types:['answers-restored','answer-restore-error']});
        frame.contentWindow?.postMessage({channel,type:'restore-draft',requestId,snapshot},'*');
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
