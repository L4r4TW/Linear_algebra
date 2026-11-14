import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAnswerContract, completeAnswerEntries, AnswerContractError } from './answer-contract.mjs';

test('derives fields from the trusted problem wrapper with native disabled-control rules', () => {
  const contract = getAnswerContract(`
    <input name="outside">
    <div id="problem_body">
      <input name="AnSwEr0001"><textarea name="customName"></textarea>
      <input type="hidden" name="AnSwEr0002">
      <input type="hidden" name="sessionJWT"><input name="isInstructor">
      <input name="previous_AnSwEr0001"><input name="MaThQuIlL_AnSwEr0001">
      <input name="disabled" disabled><input type="submit" name="button">
      <fieldset disabled><legend><input name="legendAnswer"></legend><input name="disabledChild"></fieldset>
    </div>`);
  assert.deepEqual([...contract.keys()], ['AnSwEr0001', 'customName', 'AnSwEr0002', 'legendAnswer']);
});

test('allows real repeated names and multiple selections, but rejects extra scalar values', () => {
  const contract = getAnswerContract(`<div id="problem_body">
    <input name="scalar">
    <input type="checkbox" name="checks"><input type="checkbox" name="checks">
    <input type="radio" name="radio"><input type="radio" name="radio">
    <select name="multiple" multiple><option>a</option><option>b</option><optgroup disabled><option>c</option></optgroup></select>
  </div>`);
  const pairs = [['scalar', ' 1 + 2 '], ['checks', 'x'], ['checks', 'y'], ['multiple', 'a'], ['multiple', 'b']];
  assert.deepEqual(completeAnswerEntries(pairs, contract), [...pairs, ['radio', '']]);
  for (const answers of [
    [['scalar', '1'], ['scalar', '2']],
    [['radio', 'a'], ['radio', 'b']],
    [['multiple', 'a'], ['multiple', 'b'], ['multiple', 'c']],
    [['unknown', 'x']], [['__proto__', 'x']], [['sessionJWT', 'x']], [['isInstructor', '1']],
    [['scalar', 1]], [['scalar']], {}, null,
  ]) {
    assert.throws(() => completeAnswerEntries(answers, contract), (error) =>
      error instanceof AnswerContractError && error.code === 'INVALID_ANSWERS');
  }
});

test('clears omitted fields instead of relying on previous JWT answers', () => {
  const contract = getAnswerContract('<div id="problem_body"><input name="a"><input name="b"></div>');
  assert.deepEqual(completeAnswerEntries([], contract), [['a', ''], ['b', '']]);
});

test('rejects missing, ambiguous, or unsupported problem wrappers', () => {
  for (const html of ['', '<input name="a">', '<div id="problem_body"></div>',
    '<div id="problem_body"><input name="a"></div><div id="problem_body"><input name="b"></div>']) {
    assert.throws(() => getAnswerContract(html), (error) => error.code === 'INVALID_CONTRACT');
  }
});