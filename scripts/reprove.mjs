// Runs the verify of every entry that passes and writes its proof line again
// ("reproved"), dropping entries whose verify no longer passes back to open.
// For bringing old entries under the proof rule, or after many verify edits.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const p = new URL('../harness/features.json', import.meta.url);
const features = JSON.parse(readFileSync(p, 'utf8'));
const lines = [];
const failed = [];
for (const f of features.filter((x) => x.passes)) {
  process.stdout.write(`${f.id}… `);
  let out = '';
  try {
    out = execSync(f.verify, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: '/bin/bash', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    failed.push(f.id);
    f.passes = false;
    console.log('FAILED');
    continue;
  }
  if (/No tests? (files )?found/.test(out) || !/[1-9][0-9]* passed/.test(out)) {
    failed.push(f.id);
    f.passes = false;
    console.log('RAN NO TEST');
    continue;
  }
  const hash = createHash('sha256').update(f.verify).digest('hex').slice(0, 16);
  lines.push(`${f.id}\t${hash}\t${new Date().toISOString().slice(0, 10)}\treproved`);
  console.log('ok');
}
writeFileSync(new URL('../harness/proof.log', import.meta.url), lines.join('\n') + '\n');
writeFileSync(p, JSON.stringify(features, null, 2) + '\n');
console.log(`\n${lines.length} proved, ${failed.length} reopened: ${failed.join(', ')}`);
