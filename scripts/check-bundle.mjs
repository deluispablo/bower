// The real app's first download carries no demo or pretend-Drive code: they load
// only when ?source=demo or ?source=fake asks for them. Run after `pnpm build`.
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const entries = [...html.matchAll(/<script[^>]+type="module"[^>]+src="\/([^"]+)"/g)].map((m) => m[1]);
if (!entries.length) throw new Error('No module script in dist/index.html');
// Strings only Alex's made-up folder and the pretend Drive contain.
const MARKERS = ['Larkspur Lane', 'Kittiwake Lettings', 'A made-up', 'bower:fake:'];
const found = [];
for (const e of entries) {
  const js = readFileSync(new URL(`../dist/${e}`, import.meta.url), 'utf8');
  for (const m of MARKERS) if (js.includes(m)) found.push(`${e}: "${m}"`);
}
if (found.length) {
  console.error(`Demo or pretend-Drive code is in the app's entry:\n  ${found.join('\n  ')}\nLoad it with import() in src/data/choose.ts and React.lazy in src/app/App.tsx.`);
  process.exit(1);
}
console.log(`entry chunks clean: ${entries.join(', ')}`);
