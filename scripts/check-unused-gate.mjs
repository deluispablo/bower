#!/usr/bin/env node
// Unused-code gate (TL-P4-17 entry 4). Runs knip (https://knip.dev, config knip.jsonc) and compares its findings with
// testing/unused-baseline.json. A finding not in the baseline fails; a baseline line that is no longer a finding fails
// too, so the baseline can only shrink.
// A second pass runs `knip --production` (tests are not entries, so a helper only tests call is found) against
// testing/unused-production-baseline.json, with the same rules. With --baseline alone only the first pass runs.
// Usage: check-unused-gate.mjs [--root <dir>] [--baseline <file>] [--production-baseline <file>]
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
const baselineFile = arg('--baseline', path.join(root, 'testing/unused-baseline.json'));
const knip = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/.bin/knip');

const givenBaseline = args.includes('--baseline');
const passes = [
  { label: 'Unused-code', flags: [], file: baselineFile, fresh: 'New unused code detected! Use it or remove it:', stale: 'Baseline lists code that is no longer unused. Remove these lines from' },
];
if (args.includes('--production-baseline') || !givenBaseline) {
  passes.push({
    label: 'Unused-production-code',
    flags: ['--production'],
    file: arg('--production-baseline', path.join(root, 'testing/unused-production-baseline.json')),
    fresh: 'New unused production code detected! Use it or remove it:',
    stale: 'Production baseline lists code that is no longer unused. Remove these lines from',
  });
}

let failed = false;
for (const pass of passes) {
  const baseline = new Set(JSON.parse(fs.readFileSync(pass.file, 'utf8')).findings);
  const run = spawnSync(knip, [...pass.flags, '--reporter', 'json', '--no-progress'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
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

  console.log(`${pass.label} gate check:`);
  console.log(`  Baseline findings: ${baseline.size}`);
  console.log(`  Current findings:  ${found.size}`);

  if (fresh.length > 0) {
    console.error(`\nFAILED: ${pass.fresh}`);
    for (const f of fresh) console.error(`  ${f}`);
  }
  if (stale.length > 0) {
    console.error(`\nFAILED: ${pass.stale} ${path.relative(root, pass.file)}:`);
    for (const f of stale) console.error(`  ${f}`);
  }
  if (fresh.length > 0 || stale.length > 0) failed = true;
  else console.log(`\nPASSED: ${found.size} known findings, no new ones`);
}
if (failed) process.exit(1);
