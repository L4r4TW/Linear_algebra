// Operator-only: pipe encrypted JSON rows from the private database into this process.
// Never serve this module over HTTP or commit its output.
import { readFileSync } from 'node:fs';
import { createVault } from './crypto.mjs';
const vault = createVault(readFileSync('/secrets/encryption-key', 'utf8').trim());
let raw = '';
for await (const chunk of process.stdin) {
  raw += chunk;
  if (raw.length > 2000000) throw Error('EXPORT_TOO_LARGE');
}
for (const row of JSON.parse(raw || '[]')) {
  const report = vault.open(row.encrypted_report, 'report:' + row.id);
  console.log(
    JSON.stringify({
      id: row.id,
      exerciseId: row.exercise_id,
      category: row.category,
      createdAt: row.created_at,
      ...report,
    }),
  );
}
