// Wraps what generator/p2gen.test.ts.txt wrote under /tmp/p2gen into the fixtures here. Run: node generator/assemble.mjs
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = '00ec9a5';
const gen = '/tmp/p2gen';
const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const file = (path, from) => ({ path, content: JSON.parse(readFileSync(from, 'utf8')) });
const put = (name, files) => writeFileSync(join(here, name), `${JSON.stringify({ source: SOURCE, files }, null, 2)}\n`);
const out = join(gen, 'out/.bower');
const under = (dir, prefix) => walk(join(out, dir)).filter((f) => f.split('/').pop().startsWith(prefix)).sort().map((f) => file(`.bower/${dir}/${f.slice(join(out, dir).length + 1)}`, f));

put('last-run.json', [file('.bower/last-run.json', join(out, 'last-run.json'))]);
put('requests.json', [file('.bower/requests.json', join(out, 'requests.json'))]);
put('hashes.json', [file('.bower/hashes.json', join(out, 'hashes.json'))]);
put('questions.json', [file('.bower/questions.json', join(gen, 'seeded/questions.json'))]);
put('suggestions.json', [file('.bower/suggestions.json', join(gen, 'seeded/suggestions.json'))]);
put('pile-declaration.json', under('piles', 'declaration-'));
put('pile-disposition.json', under('piles', 'disposition-'));
put('run-manifest.json', under('runs', 'manifest-'));
put('run-report.json', under('runs', 'report-'));
const chain = under('runs', 'checkpoint-').sort((a, b) => Number(a.path.split('checkpoint-')[1].split('-')[0]) - Number(b.path.split('checkpoint-')[1].split('-')[0]));
put('run-checkpoint.json', chain);
const kinds = new Set();
for (const f of readdirSync(join(gen, 'journal')).sort()) {
  const content = JSON.parse(readFileSync(join(gen, 'journal', f), 'utf8'));
  const name = `journal-${content.kind}${content.removes ? '-removes' : ''}.json`;
  if (kinds.has(name)) continue;
  kinds.add(name);
  put(name, [{ path: `.bower/changes/${f}`, content }]);
}
