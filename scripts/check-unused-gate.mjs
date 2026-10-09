#!/usr/bin/env node
// Unused-code gate (TL-P4-17 entry 4). Runs knip (https://knip.dev, config knip.jsonc) and compares its findings with
// harness/unused-baseline.json. A finding not in the baseline fails; a baseline line that is no longer a finding fails
// too, so the baseline can only shrink.
// Usage: check-unused-gate.mjs [--root <dir>] [--baseline <file>]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare, findingsOf } from './unused-gate-rules.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : fallback;
};
const root = arg('--root', process.cwd());
const baselineFile = arg('--baseline', path.join(root, 'harness/unused-baseline.json'));
const knip = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/.bin/knip');
const baseline = new Set(JSON.parse(fs.readFileSync(baselineFile, 'utf8')).findings);

const run = spawnSync(knip, ['--reporter', 'json', '--no-progress'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error('FAILED: knip gave no report.');
  console.error((run.stderr || run.stdout || '').slice(0, 2000));
  process.exit(1);
}

const found = findingsOf(report);
const { fresh, stale } = compare(found, baseline);

console.log('Unused-code gate check:');
console.log(`  Baseline findings: ${baseline.size}`);
console.log(`  Current findings:  ${found.size}`);

if (fresh.length > 0) {
  console.error('\nFAILED: New unused code detected! Use it or remove it:');
  for (const f of fresh) console.error(`  ${f}`);
}
if (stale.length > 0) {
  console.error('\nFAILED: Baseline lists code that is no longer unused. Remove these lines from harness/unused-baseline.json:');
  for (const f of stale) console.error(`  ${f}`);
}
if (fresh.length > 0 || stale.length > 0) process.exit(1);
console.log(`\nPASSED: ${found.size} known findings, no new ones`);
