import { parse } from 'parse5';
import { isAnswerFieldName } from '../public/answer-fields.js';

export class AnswerContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AnswerContractError';
    this.code = code;
  }
}

export function validateAnswerEntries(entries) {
  if (!Array.isArray(entries) || entries.length > 1024 || entries.some((entry) =>
    !Array.isArray(entry) || entry.length !== 2 || !isAnswerFieldName(entry[0]) || typeof entry[1] !== 'string')) {
    throw new AnswerContractError('INVALID_ANSWERS', 'Provide answer name/value pairs only.');
  }
}

/** Derive the answer allowlist from trusted renderer HTML, never a client manifest. */
export function getAnswerContract(html) {
  if (typeof html !== 'string') throw new AnswerContractError('INVALID_CONTRACT', 'Invalid problem HTML.');
  const wrappers = [];
  const attributes = (node) => new Map((node.attrs ?? []).map(({ name, value }) => [name, value]));
  function find(node) {
    if (attributes(node).get('id') === 'problem_body') wrappers.push(node);
    for (const child of node.childNodes ?? []) find(child);
  }
  find(parse(html));
  if (wrappers.length !== 1) throw new AnswerContractError('INVALID_CONTRACT', 'Missing or ambiguous problem content.');
  const fields = new Map();

  function enabledOptions(node, disabled = false) {
    const attrs = attributes(node);
    disabled ||= attrs.has('disabled');
    if (node.tagName === 'option') return disabled ? 0 : 1;
    return (node.childNodes ?? []).reduce((count, child) => count + enabledOptions(child, disabled), 0);
  }

  function visit(node, disabled = false) {
    const attrs = attributes(node);
    if (node.tagName === 'fieldset' && attrs.has('disabled')) {
      const legend = node.childNodes?.find((child) => child.tagName === 'legend');
      for (const child of node.childNodes ?? []) visit(child, disabled || child !== legend);
      return;
    }
    const name = attrs.get('name');
    if (['input', 'textarea', 'select'].includes(node.tagName) &&
        !disabled && !attrs.has('disabled') && isAnswerFieldName(name)) {
      const type = (attrs.get('type') ?? 'text').toLowerCase();
      if (node.tagName !== 'input' || !['button', 'submit', 'reset', 'image', 'file'].includes(type)) {
        const group = fields.get(name) ?? { radios: 0, otherMax: 0 };
        if (node.tagName === 'input' && type === 'radio') group.radios++;
        else group.otherMax += node.tagName === 'select' && attrs.has('multiple') ? enabledOptions(node) : 1;
        fields.set(name, group);
      }
    }
    for (const child of node.childNodes ?? []) visit(child, disabled);
  }
  visit(wrappers[0]);
  if (!fields.size) throw new AnswerContractError('INVALID_CONTRACT', 'No supported answer fields were found.');
  return new Map([...fields].map(([name, group]) => [name, { maxValues: group.otherMax + (group.radios ? 1 : 0) }]));
}

/** Reject unknown/duplicate scalar fields; explicitly clear omitted prior answers. */
export function completeAnswerEntries(entries, contract) {
  validateAnswerEntries(entries);
  const counts = new Map();
  for (const [name] of entries) {
    const field = contract.get(name);
    const count = (counts.get(name) ?? 0) + 1;
    if (!field || count > field.maxValues) {
      throw new AnswerContractError('INVALID_ANSWERS', 'Some answer fields are not valid for this exercise.');
    }
    counts.set(name, count);
  }
  const result = entries.map((entry) => [...entry]);
  for (const name of contract.keys()) if (!counts.has(name)) result.push([name, '']);
  return result;
}
