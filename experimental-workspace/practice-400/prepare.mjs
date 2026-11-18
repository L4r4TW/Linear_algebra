import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { json } from '../importer/db.mjs';
import { blobs, ROOT } from '../importer/inventory.mjs';
import { COLLECTIONS, classify, screenSource } from './contract.mjs';
const prior = json(
    "SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT j.source_version_id,j.id,j.technical_state FROM catalog.verification_jobs j WHERE catalog.verification_job_current(j.id))x",
  ),
  passed = new Set(
    prior.filter((j) => j.technical_state === 'passed').map((j) => j.source_version_id),
  );
const rows = json(
  "SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT e.exercise_id id,e.source_version_id,e.path,e.sha256,e.blob_oid oid,s.commit_oid revision,e.metadata-'raw' metadata,m.manifest FROM catalog.import_entries e JOIN catalog.import_heads h ON h.run_id=e.run_id JOIN catalog.source_versions sv ON sv.id=e.source_version_id JOIN catalog.snapshots s ON s.id=sv.snapshot_id LEFT JOIN LATERAL(SELECT manifest FROM catalog.capability_manifests WHERE source_version_id=e.source_version_id ORDER BY created_at DESC,id DESC LIMIT 1)m ON true WHERE e.path LIKE 'OpenProblemLibrary/%' AND e.metadata->'sourceLabels'->>0 IN('Calculus - single variable','Algebra','Precalculus','Trigonometry','Statistics','Probability') ORDER BY e.path)x",
);
const eligible = rows.filter(
    (r) => classify(r.metadata.normalized) && r.manifest?.unsupported?.length === 0,
  ),
  verified = [],
  excluded = {};
let scanned = 0;
for await (const { entry, bytes } of blobs(ROOT, eligible)) {
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== entry.sha256) throw Error('SOURCE_HASH_MISMATCH');
  const body = bytes.toString('utf8'),
    screen = screenSource(body, entry);
  scanned++;
  if (screen.passed) {
    const contentKey = createHash('sha256')
      .update(
        body
          .split(/\r?\n/)
          .filter((line) => !/^\s*#/.test(line) && line.trim())
          .join('\n'),
      )
      .digest('hex');
    verified.push({
      ...entry,
      ...classify(entry.metadata.normalized),
      sourceScreen: screen,
      contentKey,
    });
  } else for (const reason of screen.reasons) excluded[reason] = (excluded[reason] ?? 0) + 1;
  if (scanned % 2000 === 0) console.log(JSON.stringify({ scanned, eligible: verified.length }));
}
const candidates = [],
  seen = new Set(),
  shortfalls = [];
for (const c of COLLECTIONS)
  for (const t of c.topics) {
    const pool = verified.filter((r) => r.collection === c.id && r.topic === t.id),
      families = new Map();
    let rank = 0;
    while (pool.length && rank < t.target * 3) {
      const family = (r) => r.path.split('/').slice(0, -1).join('/');
      pool.sort(
        (a, b) =>
          (passed.has(a.source_version_id) ? -1000 : 0) +
            (families.get(family(a)) ?? 0) * 20 -
            ((passed.has(b.source_version_id) ? -1000 : 0) + (families.get(family(b)) ?? 0) * 20) ||
          a.path.localeCompare(b.path),
      );
      const row = pool.shift();
      if (seen.has(row.contentKey)) continue;
      seen.add(row.contentKey);
      rank++;
      families.set(family(row), (families.get(family(row)) ?? 0) + 1);
      candidates.push({
        ...row,
        rank,
        collectionTitle: c.title,
        topicTitle: t.title,
        displayTitle: t.title + ' · Practice ' + rank,
      });
    }
    if (rank < t.target * 3)
      shortfalls.push({ collection: c.id, topic: t.id, target: t.target, pool: rank });
  }
mkdirSync('/artifacts', { recursive: true });
const result = {
  version: 1,
  observedAt: new Date().toISOString(),
  scope:
    'User-authorized local tested collections; source screening is not mathematical certification',
  scanned,
  excluded,
  shortfalls,
  candidates,
};
writeFileSync('/artifacts/candidates.json', JSON.stringify(result, null, 2) + '\n');
console.log(
  JSON.stringify({
    selected: candidates.length,
    collections: COLLECTIONS.map((c) => ({
      id: c.id,
      candidates: candidates.filter((r) => r.collection === c.id).length,
    })),
    shortfalls,
  }),
);
