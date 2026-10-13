#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';

// Usage: check-duplication-gate.mjs [--root <dir>] [--baseline <file>]
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : fallback;
};
const root = arg('--root', process.cwd());
const baselineFile = arg('--baseline', path.join(root, 'testing/duplication-baseline.json'));
const jscpd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/.bin/jscpd');
const targets = ['src', 'api', 'runner'].filter((d) => fs.existsSync(path.join(root, d)));
const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));

// Run jscpd and capture output
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

const output = execSync(
  `"${jscpd}" --format typescript,javascript --mode strict --ignore "${ignorePatterns}" ${targets.join(' ')} 2>&1`,
  { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
);

// Extract clone count from the output using regex
const cloneMatch = output.match(/Found (\d+) clones/);
const cloneCount = cloneMatch ? parseInt(cloneMatch[1], 10) : 0;

// Extract duplicated lines and tokens from the table
// Strip ANSI escape codes and look for the Total line
const ansiRegex = /\x1b\[[0-9;]*m/g;
const cleanOutput = output.replace(ansiRegex, '');
const lines = cleanOutput.split('\n');
let duplicatedLines = 0;
let duplicatedTokens = 0;

for (const line of lines) {
  if (line.includes('Total:')) {
    // Extract all numbers from this line
    const numbers = line.match(/(\d+)/g);
    if (numbers && numbers.length >= 8) {
      // The numbers are: files, total lines, total tokens, clones, duplicated lines, 0 (from X.YZ%), YZ (from X.YZ%), duplicated tokens
      duplicatedLines = parseInt(numbers[4], 10);
      duplicatedTokens = parseInt(numbers[7], 10);
    }
    break;
  }
}

console.log(`Duplication gate check:`);
console.log(`  Baseline clones: ${baseline.clones}`);
console.log(`  Current clones:  ${cloneCount}`);
console.log(`  Duplicated lines: ${duplicatedLines} (baseline: ${baseline.duplicatedLines})`);
console.log(`  Duplicated tokens: ${duplicatedTokens} (baseline: ${baseline.duplicatedTokens})`);

if (cloneCount > baseline.clones) {
  console.error(`\nFAILED: New clones detected!`);
  console.error(`Current clones (${cloneCount}) > Baseline clones (${baseline.clones})`);
  process.exit(1);
}

if (cloneCount === baseline.clones) {
  console.log(`\nPASSED: Clone count maintained at ${cloneCount}`);
  process.exit(0);
}

if (cloneCount < baseline.clones) {
  console.error(`\nFAILED: Clone count lower than baseline!`);
  console.error(`lower the baseline to ${cloneCount}`);
  process.exit(1);
}
