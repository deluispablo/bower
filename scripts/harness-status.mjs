// Prints how many harness entries pass, by category, and the next open one.
import { readFileSync } from 'node:fs';

const features = JSON.parse(readFileSync(new URL('../harness/features.json', import.meta.url), 'utf8'));
const done = features.filter((f) => f.passes).length;
console.log(`${done}/${features.length} entries pass`);
const cats = {};
for (const f of features) {
  const c = (cats[f.category ?? 'feature'] ??= [0, 0]);
  c[1]++;
  if (f.passes) c[0]++;
}
console.log(Object.entries(cats).map(([k, [a, b]]) => `  ${k}: ${a}/${b}`).join('\n'));
const next = features.find((f) => !f.passes);
console.log(next ? `next: ${next.id} (${next.category}): ${next.what}\n  verify: ${next.verify}` : 'all entries pass');
