const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function savePlan(plan, storage = sessionStorage) {
  if (
    !plan ||
    !uuid.test(plan.id) ||
    plan.version !== 1 ||
    !Array.isArray(plan.items) ||
    plan.items.length < 1 ||
    plan.items.length > 20 ||
    plan.items.some(
      (item) =>
        typeof item.exerciseId !== 'string' ||
        item.exerciseId.length > 128 ||
        (item.sessionId !== null && !uuid.test(item.sessionId)),
    )
  )
    throw Error('The practice plan could not be confirmed.');
  const key = 'mathpractice.plan.' + plan.id,
    text = JSON.stringify(plan);
  storage.setItem(key, text);
  if (storage.getItem(key) !== text)
    throw Error('The practice plan could not be saved in this tab.');
  if (plan.items[0].sessionId)
    storage.setItem('mathpractice.session-plan.' + plan.items[0].sessionId, plan.id);
  return plan;
}
export function readPlan(id, storage = sessionStorage) {
  if (!uuid.test(id)) return null;
  const text = storage.getItem('mathpractice.plan.' + id);
  if (!text) return null;
  try {
    const plan = JSON.parse(text);
    return plan.id === id &&
      plan.version === 1 &&
      Array.isArray(plan.items) &&
      plan.items.length <= 20
      ? plan
      : null;
  } catch {
    return null;
  }
}
