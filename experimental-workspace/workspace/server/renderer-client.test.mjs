import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { createRendererClient, RendererClientError } from './renderer-client.mjs';
import { getExerciseById } from './exercise-catalog.mjs';

const input = { exerciseId: 'dot-product-01', seed: 1234 };
const valid = () => ({
  renderedHTML: '<form>Vector exercise</form>',
  flags: { error_flag: 0 },
  JWT: { session: 'test-session', problem: 'test-problem' },
  problem_result: { score: 0 },
  resources: { assets: [] },
});

async function serve(t, handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return 'http://127.0.0.1:' + server.address().port;
}

function hasCode(code) {
  return (error) => error instanceof RendererClientError && error.code === code;
}

test('loads a catalog exercise as a student form request and normalizes the response', async (t) => {
  let received;
  const baseUrl = await serve(t, async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    received = { path: request.url, method: request.method, headers: request.headers, fields: new URLSearchParams(body) };
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ ...valid(), debug: { internal: 'private' } }));
  });
  const result = await createRendererClient({ baseUrl: baseUrl + '/' }).loadExercise({
    ...input,
    isInstructor: 1,
    problemSource: 'untrusted',
    sourceFilePath: '../untrusted.pg',
  });
  assert.equal(received.path, '/render-api');
  assert.equal(received.method, 'POST');
  assert.match(received.headers['content-type'], /^application\/x-www-form-urlencoded/);
  assert.equal(received.fields.get('sourceFilePath'), getExerciseById(input.exerciseId).renderer.sourceFilePath);
  assert.equal(received.fields.get('problemSeed'), '1234');
  assert.equal(received.fields.get('_format'), 'json');
  assert.equal(received.fields.get('isInstructor'), '0');
  assert.equal(received.fields.get('showSolutions'), '0');
  assert.equal(received.fields.get('showCorrectAnswersButton'), '0');
  assert.equal(received.fields.has('problemSource'), false);
  assert.deepEqual(result, {
    ...input,
    html: '<form>Vector exercise</form>',
    sessionToken: 'test-session',
    problemToken: 'test-problem',
    score: 0,
    resources: { assets: [] },
    feedback: { message: '', summary: '' },
  });
});

test('rejects unknown paths and invalid seeds before making a request', async (t) => {
  let requests = 0;
  const baseUrl = await serve(t, (_request, response) => {
    requests++;
    response.end(JSON.stringify(valid()));
  });
  const client = createRendererClient({ baseUrl });
  for (const exerciseId of ['../arbitrary.pg', '__proto__', 'DOT-PRODUCT-01']) {
    await assert.rejects(client.loadExercise({ ...input, exerciseId }), hasCode('UNKNOWN_EXERCISE'));
  }
  for (const seed of [0, -1, 1.5, '1234', 2147483648, NaN]) {
    await assert.rejects(client.loadExercise({ ...input, seed }), hasCode('INVALID_INPUT'));
  }
  await assert.rejects(client.loadExercise(null), hasCode('INVALID_INPUT'));
  assert.equal(requests, 0);
});

test('rejects invalid server configuration', () => {
  for (const baseUrl of ['', 'not-a-url', 'file:///tmp/socket', 'http://user:secret@localhost', 'http://localhost?x=1', 'http://localhost/#token']) {
    assert.throws(() => createRendererClient({ baseUrl }), hasCode('INVALID_CONFIGURATION'));
  }
  for (const timeoutMs of [0, -1, 1.5, Infinity, 2147483648]) {
    assert.throws(() => createRendererClient({ baseUrl: 'http://localhost', timeoutMs }), hasCode('INVALID_CONFIGURATION'));
  }
});

test('reports HTTP errors without disclosing the upstream body', async (t) => {
  const baseUrl = await serve(t, (_request, response) => {
    response.writeHead(503);
    response.end('private renderer detail and test-session');
  });
  await assert.rejects(createRendererClient({ baseUrl }).loadExercise(input), (error) => {
    assert.ok(hasCode('HTTP_ERROR')(error));
    assert.equal(error.status, 503);
    assert.doesNotMatch(error.message, /private|test-session/);
    return true;
  });
});

test('rejects invalid JSON', async (t) => {
  const baseUrl = await serve(t, (_request, response) => response.end('<html>Error</html>'));
  await assert.rejects(createRendererClient({ baseUrl }).loadExercise(input), hasCode('INVALID_RESPONSE'));
});

test('rejects malformed student responses, including instructor answer maps', async (t) => {
  let payload;
  const baseUrl = await serve(t, (_request, response) => response.end(JSON.stringify(payload)));
  const client = createRendererClient({ baseUrl });
  for (const invalid of [
    null,
    { ...valid(), flags: [] },
    { ...valid(), renderedHTML: '' },
    { ...valid(), JWT: { session: '', problem: 'test-problem' } },
    { ...valid(), JWT: { session: 'test-session' } },
    { ...valid(), problem_result: { score: '0' } },
    { ...valid(), problem_result: { score: 2 } },
    { ...valid(), resources: [] },
    { ...valid(), answers: { AnSwEr0001: { correct_value: 'secret' } } },
  ]) {
    payload = invalid;
    await assert.rejects(client.loadExercise(input), hasCode('INVALID_RESPONSE'));
  }
});

test('reports PG errors even when HTTP succeeds', async (t) => {
  const baseUrl = await serve(t, (_request, response) => {
    response.end(JSON.stringify({ ...valid(), flags: { error_flag: 1 }, debug: 'private' }));
  });
  await assert.rejects(createRendererClient({ baseUrl }).loadExercise(input), hasCode('PG_ERROR'));
});

test('times out while waiting for response headers', async (t) => {
  const baseUrl = await serve(t, () => {});
  await assert.rejects(createRendererClient({ baseUrl, timeoutMs: 100 }).loadExercise(input), hasCode('TIMEOUT'));
});

test('times out while reading a stalled response body', async (t) => {
  const baseUrl = await serve(t, (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{"renderedHTML":');
  });
  await assert.rejects(createRendererClient({ baseUrl, timeoutMs: 100 }).loadExercise(input), hasCode('TIMEOUT'));
});

test('reports disconnected upstream connections as network errors', async (t) => {
  const baseUrl = await serve(t, (request) => request.socket.destroy());
  await assert.rejects(createRendererClient({ baseUrl }).loadExercise(input), hasCode('NETWORK_ERROR'));
});

test('does not follow renderer redirects', async (t) => {
  let targetRequests = 0;
  const target = await serve(t, (_request, response) => {
    targetRequests++;
    response.end(JSON.stringify(valid()));
  });
  const baseUrl = await serve(t, (_request, response) => {
    response.writeHead(307, { Location: target + '/elsewhere' });
    response.end();
  });
  await assert.rejects(createRendererClient({ baseUrl }).loadExercise(input), hasCode('NETWORK_ERROR'));
  assert.equal(targetRequests, 0);
});

test('restores a saved session using its token rather than regenerating the problem', async (t) => {
  let fields;
  const baseUrl = await serve(t, async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    fields = new URLSearchParams(body);
    response.end(JSON.stringify(valid()));
  });
  const client = createRendererClient({ baseUrl });
  await assert.rejects(client.restoreSession({ ...input, sessionToken: '' }), hasCode('INVALID_INPUT'));
  const result = await client.restoreSession({ ...input, sessionToken: 'stored+token/with=symbols' });
  assert.deepEqual([...fields], [
    ['sessionJWT', 'stored+token/with=symbols'],
    ['_format', 'json'],
  ]);
  assert.equal(result.exerciseId, input.exerciseId);
  assert.equal(result.seed, input.seed);
});
test('submits stored-token grading as student form data with duplicate values preserved', async (t) => {
  let fields;
  const baseUrl = await serve(t, async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    fields = new URLSearchParams(body);
    response.end(JSON.stringify({ ...valid(), JWT: { session: 'updated-session', problem: 'test-problem', answer: 'e30.' + Buffer.from(JSON.stringify({ score:{answers:{}} })).toString('base64url') + '.c2ln' }, problem_result: { score: 0.75 } }));
  });
  const answers = [['AnSwEr0001', ' 1 + 2 '], ['choices', 'a+b'], ['choices', '<1,2>']];
  const result = await createRendererClient({ baseUrl }).submitAnswers({
    ...input, sessionToken: 'stored+token', answers, isInstructor: 1, score: 1, sourceFilePath: 'untrusted',
  });
  assert.equal(fields.get('sessionJWT'), 'stored+token');
  assert.equal(fields.get('submitAnswers'), '1');
  assert.equal(fields.get('answersSubmitted'), '1');
  assert.equal(fields.get('isInstructor'), '0');
  assert.equal(fields.get('showSolutions'), '0');
  assert.equal(fields.get('showCorrectAnswersButton'), '0');
  assert.equal(fields.has('sourceFilePath'), false);
  assert.equal(fields.has('problemSeed'), false);
  assert.equal(fields.has('score'), false);
  assert.equal(fields.get('AnSwEr0001'), ' 1 + 2 ');
  assert.deepEqual(fields.getAll('choices'), ['a+b', '<1,2>']);
  assert.equal(result.score, 0.75);
  assert.equal(result.sessionToken, 'updated-session');
});

test('does not send malformed entries or management parameters to the grader', async (t) => {
  let requests = 0;
  const baseUrl = await serve(t, (_request, response) => { requests++; response.end(JSON.stringify(valid())); });
  const client = createRendererClient({ baseUrl });
  for (const answers of [null, {}, [['sessionJWT', 'evil']], [['problemSource', 'evil']], [['submitAnswers', '0']], [['x', 12]], [['x']]]) {
    await assert.rejects(client.submitAnswers({ ...input, sessionToken: 'stored', answers }), hasCode('INVALID_INPUT'));
  }
  await assert.rejects(client.submitAnswers({ ...input, sessionToken: '', answers: [] }), hasCode('INVALID_INPUT'));
  assert.equal(requests, 0);
});
test('normalizes student feedback to text without returning executable HTML', async (t) => {
  const baseUrl = await serve(t, (_request, response) => {
    response.end(JSON.stringify({
      ...valid(),
      problem_result: {
        score: 0.25,
        msg: 'You can earn <b>partial credit</b>.',
        summary: '<div>One answer is correct.</div><div>Three remain unanswered &amp; need work.</div><script>privateJavascript()</script><style>privateStyle</style>',
      },
    }));
  });
  const result = await createRendererClient({ baseUrl }).loadExercise(input);
  assert.deepEqual(result.feedback, {
    message: 'You can earn partial credit.',
    summary: 'One answer is correct. Three remain unanswered & need work.',
  });
});

test('rejects malformed renderer feedback instead of saving an invalid submission result', async (t) => {
  const baseUrl = await serve(t, (_request, response) => {
    response.end(JSON.stringify({ ...valid(), problem_result: { score: 0, msg: { private: 'unexpected' } } }));
  });
  await assert.rejects(createRendererClient({ baseUrl }).loadExercise(input), hasCode('INVALID_RESPONSE'));
});
test('projects only student-safe per-field feedback from the private renderer grading token', async (t) => {
  const answer = 'e30.' + Buffer.from(JSON.stringify({ score:{answers: {
    AnSwEr0001: { score:0, student_value:null, error_message:'Unknown <b>variable</b>.<script>privateScript()</script>', correct_value:'PRIVATE_EXPECTED' },
  }} })).toString('base64url') + '.c2ln';
  const baseUrl = await serve(t, (_request, response) => response.end(JSON.stringify({ ...valid(), JWT:{...valid().JWT,answer} })));
  const result = await createRendererClient({baseUrl}).submitAnswers({...input,sessionToken:'stored',answers:[['AnSwEr0001','z(']]});
  assert.deepEqual(result.fieldFeedback, [{ name:'AnSwEr0001',status:'invalid',score:0,message:'Unknown variable.' }]);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_EXPECTED|privateScript|correct_value/);
  assert.equal(JSON.stringify(result).includes(answer), false);
});

test('does not accept missing or malformed private grading tokens as complete grading responses', async (t) => {
  let answer;
  const baseUrl = await serve(t, (_request, response) => response.end(JSON.stringify({ ...valid(), JWT:{...valid().JWT,answer} })));
  const client = createRendererClient({baseUrl});
  for (answer of [undefined,'invalid','e30.e30.c2ln']) {
    await assert.rejects(client.submitAnswers({...input,sessionToken:'stored',answers:[['AnSwEr0001','1']]}), hasCode('INVALID_RESPONSE'));
  }
});
