// Prints how many harness features pass and which one is next.
import { readFileSync } from 'node:fs';

const features = JSON.parse(readFileSync(new URL('../harness/features.json', import.meta.url), 'utf8'));
const done = features.filter((f) => f.passes).length;
console.log(`${done}/${features.length} features pass`);
const next = features.find((f) => !f.passes);
console.log(next ? `next: ${next.id} (task ${next.task}): ${next.what}\n  verify: ${next.verify}` : 'all features pass');
