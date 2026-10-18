#!/usr/bin/env node

import { spawnSync } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';

// Usage: check-duplication-gate.mjs [--root <dir>] [--baseline <file>] [--update]
// --update writes the current clone count to the baseline instead of checking it.
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : fallback;
};
const root = arg('--root', process.cwd());
const baselineFile = arg('--baseline', path.join(root, 'testing/duplication-baseline.json'));
const update = args.includes('--update');
// Resolved from this script, with a literal require.resolve so knip sees the jscpd devDependency used.
const require = createRequire(import.meta.url);
const jscpd = require.resolve('jscpd/run-jscpd.js');
const targets = ['src', 'api', 'runner'].filter((d) => fs.existsSync(path.join(root, d)));

const ignorePatterns = [
  '**/node_modules/**',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.config.*',
  '**/dist/**',
  '**/build/**',
  '**/.vite/**',
  'e2e/**',
  'test/**',
  '**/coverage/**'
].join(',');

const run = spawnSync(
  process.execPath,
  [jscpd, '--format', 'typescript,javascript', '--mode', 'strict', '--ignore', ignorePatterns, ...targets],
  { cwd: root, encoding: 'utf8' }
);
const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
const cloneMatch = output.match(/Found (\d+) clones/);
if (run.status !== 0 || !cloneMatch) {
  console.error(output || run.error);
  console.error('\nFAILED: the duplication scanner did not report a clone count.');
  process.exit(1);
}
const cloneCount = parseInt(cloneMatch[1], 10);

if (update) {
  const date = new Date().toISOString().split('T')[0];
  fs.writeFileSync(baselineFile, JSON.stringify({ date, clones: cloneCount }, null, 2) + '\n');
  console.log(`Duplication baseline updated to ${cloneCount} clones.`);
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
console.log(`Duplication gate check:`);
console.log(`  Baseline clones: ${baseline.clones}`);
console.log(`  Current clones:  ${cloneCount}`);

if (cloneCount > baseline.clones) {
  console.error(`\nFAILED: New clones detected!`);
  console.error(`Current clones (${cloneCount}) > Baseline clones (${baseline.clones})`);
  process.exit(1);
}

if (cloneCount < baseline.clones) {
  console.error(`\nFAILED: Clone count lower than baseline!`);
  console.error(`lower the baseline to ${cloneCount}, or run this gate with --update`);
  process.exit(1);
}

console.log(`\nPASSED: Clone count maintained at ${cloneCount}`);
