import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('duplication gate', () => {
  it('a new clone fails the duplication gate', () => {
    // Create a temporary directory with a copy of the source code
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplication-gate-test-'));
    const tempSrcDir = path.join(tempDir, 'src');
    const tempApiDir = path.join(tempDir, 'api');
    const tempRunnerDir = path.join(tempDir, 'runner');

    try {
      // Copy the source directories
      fs.mkdirSync(tempSrcDir, { recursive: true });
      fs.mkdirSync(tempApiDir, { recursive: true });
      fs.mkdirSync(tempRunnerDir, { recursive: true });

      execSync(`cp -r src/* ${tempSrcDir}/`, { stdio: 'pipe' });
      execSync(`cp -r api/* ${tempApiDir}/`, { stdio: 'pipe' });
      execSync(`cp -r runner/* ${tempRunnerDir}/`, { stdio: 'pipe' });

      // Add a duplicated block to create a new clone
      // We'll add duplicate code to api/src/auth.ts
      const authFile = path.join(tempApiDir, 'src', 'auth.ts');
      let content = fs.readFileSync(authFile, 'utf8');

      // Add duplicate functions at the end of the file
      content += `

// Intentional duplicate for testing
export function duplicatedFunction() {
  const x = 1;
  const y = 2;
  const z = 3;
  const a = 4;
  const b = 5;
  const c = 6;
  const d = 7;
  const e = 8;
  const f = 9;
  return x + y + z + a + b + c + d + e + f;
}

export function duplicatedFunctionAgain() {
  const x = 1;
  const y = 2;
  const z = 3;
  const a = 4;
  const b = 5;
  const c = 6;
  const d = 7;
  const e = 8;
  const f = 9;
  return x + y + z + a + b + c + d + e + f;
}
`;

      fs.writeFileSync(authFile, content);

      // Run the duplication gate check on the temp directory
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
        `cd ${tempDir} && npx jscpd --format typescript,javascript --mode strict --ignore "${ignorePatterns}" src api runner 2>&1`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );

      // Extract clone count from the duplicated code output
      const cloneMatch = output.match(/Found (\d+) clones/);
      const currentCloneCount = cloneMatch ? parseInt(cloneMatch[1], 10) : 0;

      // Get the baseline (which should be from the original check-duplication-gate.mjs)
      const baselineFile = 'harness/duplication-baseline.json';
      const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));

      // The current clone count should be greater than the baseline due to the added duplicate
      expect(currentCloneCount).toBeGreaterThan(baseline.clones);
    } finally {
      // Clean up
      execSync(`rm -rf ${tempDir}`, { stdio: 'pipe' });
    }
  });
});
