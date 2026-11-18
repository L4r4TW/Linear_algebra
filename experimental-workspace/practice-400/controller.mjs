import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { COLLECTIONS } from './contract.mjs';
import { json, sql, literal as L } from '../importer/db.mjs';
import { enqueue, currentContext } from '../pipeline/queue.mjs';
import { technicalState } from '../pipeline/contract.mjs';
const pool = JSON.parse(readFileSync('/artifacts/candidates.json', 'utf8')),
  context = JSON.parse(readFileSync('/qa/collections/context.json', 'utf8')),
  loop = process.argv.includes('--loop');
let stopping = false;
process.on('SIGTERM', () => (stopping = true));
do {
  if (currentContext() !== context.id) throw Error('COLLECTION_CONTEXT_CHANGED');
  const authority = json(
      "SELECT coalesce(jsonb_agg(jsonb_build_object('source',source_version_id,'active',active)),'[]') FROM catalog_backend.collection_grants",
    ),
    revoked = new Set(authority.filter((r) => !r.active).map((r) => r.source)),
    active = new Set(authority.filter((r) => r.active).map((r) => r.source));
  const jobs = json(
      `SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT j.id,j.source_version_id,j.state,j.technical_state,catalog.verification_job_current(j.id) current,a.id attempt_id,a.result FROM catalog.verification_jobs j LEFT JOIN LATERAL(SELECT id,result FROM catalog.verification_attempts WHERE job_id=j.id ORDER BY ordinal DESC LIMIT 1)a ON true WHERE j.context_id=${L(context.id)}::uuid)x`,
    ),
    bySource = new Map(jobs.map((j) => [j.source_version_id, j])),
    selected = [],
    topics = [],
    queued = [];
  // Prioritize finishing calculus before spending renderer time on other collections.
  let schedule = true;
  for (const c of COLLECTIONS) {
    let complete = true;
    for (const t of c.topics) {
      const candidates = pool.candidates.filter(
          (r) => r.collection === c.id && r.topic === t.id && !revoked.has(r.source_version_id),
        ),
        passing = candidates
          .filter((r) => {
            const j = bySource.get(r.source_version_id);
            return (
              j?.current &&
              ['passed', 'needs-review'].includes(j.state) &&
              technicalState(j.result?.cases) === 'passed'
            );
          })
          .sort(
            (a, b) =>
              Number(active.has(b.source_version_id)) - Number(active.has(a.source_version_id)) ||
              a.rank - b.rank,
          )
          .slice(0, t.target);
      selected.push(...passing);
      const pending = candidates.filter((r) =>
          ['queued', 'running'].includes(bySource.get(r.source_version_id)?.state),
        ),
        unused = candidates.filter((r) => !bySource.has(r.source_version_id));
      const needed = Math.max(0, t.target - passing.length - pending.length),
        next = schedule ? unused.slice(0, needed) : [];
      queued.push(...next.map((r) => r.source_version_id));
      const status = {
        collection: c.id,
        topic: t.id,
        target: t.target,
        passed: passing.length,
        pending: pending.length,
        enqueued: next.length,
        unused: unused.length,
        exhausted: passing.length < t.target && !pending.length && !unused.length,
      };
      topics.push(status);
      if (passing.length < t.target) complete = false;
    }
    if (
      !complete &&
      topics.some((t) => t.collection === c.id && !t.exhausted && t.passed < t.target)
    )
      schedule = false;
  }
  for (let n = 0; n < queued.length; n += 100)
    enqueue(
      queued.slice(n, n + 100),
      'User-authorized four collection expansion, retained failures and replacement reserves',
    );
  const grants = [];
  for (const row of selected) {
    const job = bySource.get(row.source_version_id),
      review = {
        sourceScreen: row.sourceScreen,
        technicalAttempt: job.attempt_id,
        contentKey: row.contentKey,
        classification: { collection: row.collection, topic: row.topic },
        mathematicalCertification: false,
        humanReview: false,
      },
      digest = createHash('sha256').update(JSON.stringify(review)).digest('hex');
    grants.push(
      `(${L(row.source_version_id)}::uuid,${L(job.id)}::uuid,${L(job.attempt_id)}::uuid,${L(row.collection)},${L(row.collectionTitle)},${L(row.topicTitle)},${L(row.displayTitle)},${L(review)}::jsonb,${L(digest)},true)`,
    );
  }
  if (grants.length)
    sql(
      `INSERT INTO catalog_backend.collection_grants(source_version_id,job_id,attempt_id,collection_key,collection_title,topic_title,display_title,screening,evidence_digest,active) VALUES ${grants.join(',')} ON CONFLICT(source_version_id) DO NOTHING;`,
    );
  const live = json('SELECT catalog_backend.local_pilot_catalog()'),
    liveIds = new Set(live.entries.map((r) => r.id));
  const report = {
    version: 1,
    observedAt: new Date().toISOString(),
    contextId: context.id,
    scope:
      'Automatic technical checks + source screening; user-authorized local practice; no independent human reviews fabricated',
    target: 400,
    topics,
    collections: COLLECTIONS.map((c) => ({
      id: c.id,
      title: c.title,
      target: 100,
      technicalPassed: selected.filter((r) => r.collection === c.id).length,
      playable: selected.filter((r) => r.collection === c.id && liveIds.has(r.id)).length,
    })),
    selected: selected.map((r) => ({
      id: r.id,
      sourceVersionId: r.source_version_id,
      sha256: r.sha256,
      path: r.path,
      collection: r.collection,
      topic: r.topic,
      displayTitle: r.displayTitle,
      jobId: bySource.get(r.source_version_id).id,
      attemptId: bySource.get(r.source_version_id).attempt_id,
    })),
    enqueued: queued.length,
    retainedFailures: jobs.filter((j) => ['failed', 'unsupported', 'error'].includes(j.state))
      .length,
    complete:
      topics.every((t) => t.passed === t.target) && selected.every((r) => liveIds.has(r.id)),
  };
  mkdirSync('/artifacts', { recursive: true });
  writeFileSync('/artifacts/status.json', JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      at: report.observedAt,
      collections: report.collections,
      enqueued: queued.length,
      complete: report.complete,
    }),
  );
  if (!loop || report.complete || topics.every((t) => t.exhausted || t.passed === t.target)) break;
  await new Promise((r) => setTimeout(r, 30000));
} while (!stopping);
