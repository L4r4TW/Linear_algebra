import { mkdirSync, existsSync, writeFileSync, readFileSync, chmodSync, chownSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
mkdirSync('/secrets', { recursive: true, mode: 0o750 });
chownSync('/secrets', 999, 1000);
chmodSync('/secrets', 0o750);
for (const name of [
  'database-password',
  'practice-db-password',
  'auth-db-password',
  'jwt-secret',
  'backend-key',
  'encryption-key',
]) {
  const path = '/secrets/' + name;
  if (!existsSync(path))
    writeFileSync(path, randomBytes(32).toString('hex') + '\n', { mode: 0o640, flag: 'wx' });
  if (!/^[a-f0-9]{64}\n?$/.test(readFileSync(path, 'utf8')))
    throw Error('Invalid existing account secret; manual inspection required');
  chownSync(path, 999, 1000);
  chmodSync(path, 0o640);
}
console.log('Account secret volume initialized; values remain private.');

const scopes = {
  database: ['database-password', 'auth-db-password'],
  auth: ['auth-db-password', 'jwt-secret'],
  backend: ['practice-db-password', 'encryption-key'],
  migration: ['database-password', 'practice-db-password'],
};
for (const [scope, names] of Object.entries(scopes)) {
  const directory = '/secrets/' + scope;
  mkdirSync(directory, { recursive: true, mode: 0o750 });
  chownSync(directory, 999, 1000);
  chmodSync(directory, 0o750);
  for (const name of names) {
    const original = readFileSync('/secrets/' + name, 'utf8'),
      path = directory + '/' + name;
    if (existsSync(path)) {
      if (readFileSync(path, 'utf8') !== original)
        throw Error('Scoped secret differs; inspection required');
    } else writeFileSync(path, original, { flag: 'wx', mode: 0o640 });
    chownSync(path, 999, 1000);
    chmodSync(path, 0o640);
  }
}
console.log('Scoped account secrets initialized without rotating existing keys.');
