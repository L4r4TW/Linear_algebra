import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { ESLint } from 'eslint';
import * as prettier from 'prettier';
import prettierOptions from './prettier.config.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const write = process.argv.includes('--write');
const files = [];
// Deliberately exclude canonical PG runtime, evidence, sources, secrets and legacy apps.
for (const scope of ['accounts', 'discovery', 'practice-400', 'maintenance']) {
  const directory = join(root, 'experimental-workspace', scope);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.mjs')) files.push(join(directory, entry.name));
    if (entry.isDirectory() && entry.name === 'public') {
      for (const name of await readdir(join(directory, 'public'))) {
        if (/\.(js|css|html)$/.test(name)) files.push(join(directory, 'public', name));
      }
    }
  }
}
files.sort();
const changed = [];
for (const file of files) {
  const before = await readFile(file, 'utf8');
  const after = await prettier.format(before, { ...prettierOptions, filepath: file });
  if (before === after) continue;
  const name = relative(root, file).replaceAll('\\', '/');
  changed.push(name);
  if (write) await writeFile(file, after);
  else console.error('Formatting: ' + name);
}
const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: fileURLToPath(new URL('./eslint.config.mjs', import.meta.url)),
});
const results = await eslint.lintFiles(files.filter((file) => /\.(js|mjs)$/.test(file)));
const formatter = await eslint.loadFormatter('stylish');
const diagnostics = formatter.format(results);
if (diagnostics) console.error(diagnostics);
const errors = results.reduce((sum, result) => sum + result.errorCount + result.warningCount, 0);
if (process.env.QUALITY_ARTIFACTS) {
  await mkdir(process.env.QUALITY_ARTIFACTS, { recursive: true });
  await writeFile(join(process.env.QUALITY_ARTIFACTS, 'changed.json'), JSON.stringify(changed));
}
console.log(
  JSON.stringify({
    files: files.length,
    javascriptFiles: results.length,
    formattingChanges: changed.length,
    lintErrors: errors,
    write,
  }),
);
if (errors || (!write && changed.length)) process.exitCode = 1;
