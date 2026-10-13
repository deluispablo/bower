#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';

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
  `npx jscpd --format typescript,javascript --mode strict --ignore "${ignorePatterns}" src api runner 2>&1`,
  { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
);

// Extract clone count from the output
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

const baseline = {
  date: new Date().toISOString().split('T')[0],
  clones: cloneCount,
  duplicatedLines: duplicatedLines,
  duplicatedTokens: duplicatedTokens,
  note: 'Updated by update-duplication-baseline.mjs'
};

fs.writeFileSync('testing/duplication-baseline.json', JSON.stringify(baseline, null, 2) + '\n');

console.log('Updated duplication baseline:');
console.log(JSON.stringify(baseline, null, 2));
