import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const gate = path.resolve(__dirname, '..', 'scripts', 'check-duplication-gate.mjs');

function block(name: string): string {
  const lines = Array.from({ length: 12 }, (_, i) => `  const value${i} = input * ${i + 3} + ${name.length};`);
  return `export function ${name}(input: number): number {\n${lines.join('\n')}\n  return value0 + value1 + value2 + value3 + value4 + value5;\n}\n`;
}

function runGate(root: string, baseline: string, ...extra: string[]) {
  return spawnSync('node', [gate, '--root', root, '--baseline', baseline, ...extra], { encoding: 'utf8' });
}

describe('duplication gate', () => {
  it('a new clone fails the duplication gate', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dup-gate-'));
    try {
      fs.mkdirSync(path.join(root, 'src'));
      fs.writeFileSync(path.join(root, 'src', 'one.ts'), block('alpha'));
      fs.writeFileSync(path.join(root, 'src', 'two.ts'), 'export const two = 2;\n');
      const baseline = path.join(root, 'baseline.json');
      fs.writeFileSync(baseline, JSON.stringify({ clones: 0, duplicatedLines: 0, duplicatedTokens: 0 }));

      expect(runGate(root, baseline).status).toBe(0);

      fs.writeFileSync(path.join(root, 'src', 'two.ts'), block('alpha'));
      const failed = runGate(root, baseline);
      expect(failed.status).not.toBe(0);
      expect(failed.stderr).toContain('New clones');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('a lower count asks to lower the baseline', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dup-gate-'));
    try {
      fs.mkdirSync(path.join(root, 'src'));
      fs.writeFileSync(path.join(root, 'src', 'one.ts'), block('alpha'));
      fs.writeFileSync(path.join(root, 'src', 'two.ts'), 'export const two = 2;\n');
      const baseline = path.join(root, 'baseline.json');
      fs.writeFileSync(baseline, JSON.stringify({ clones: 25, duplicatedLines: 0, duplicatedTokens: 0 }));

      const result = runGate(root, baseline);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('lower the baseline to 0');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('--update writes the current count to a missing baseline and the gate then passes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dup-gate-'));
    try {
      fs.mkdirSync(path.join(root, 'src'));
      fs.writeFileSync(path.join(root, 'src', 'one.ts'), block('alpha'));
      fs.writeFileSync(path.join(root, 'src', 'two.ts'), block('alpha'));
      const baseline = path.join(root, 'baseline.json');

      expect(runGate(root, baseline, '--update').status).toBe(0);
      const written = JSON.parse(fs.readFileSync(baseline, 'utf8')) as Record<string, unknown>;
      expect(Object.keys(written).sort()).toEqual(['clones', 'date']);
      expect(written.clones).toBe(1);
      expect(runGate(root, baseline).status).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('--update leaves the baseline untouched when the scanner fails or reports no count', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dup-gate-'));
    try {
      // A copy of the gate next to a stand-in scanner, which it resolves as node_modules/jscpd/run-jscpd.js.
      fs.mkdirSync(path.join(root, 'scripts'));
      fs.mkdirSync(path.join(root, 'node_modules', 'jscpd'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src'));
      const copy = path.join(root, 'scripts', 'check-duplication-gate.mjs');
      fs.copyFileSync(gate, copy);
      const scanner = path.join(root, 'node_modules', 'jscpd', 'run-jscpd.js');
      const baseline = path.join(root, 'baseline.json');
      const bytes = '{ "clones": 7 }';
      fs.writeFileSync(baseline, bytes);

      for (const body of ['console.log("Found 0 clones."); process.exit(2);', 'console.log("no report");']) {
        fs.writeFileSync(scanner, body);
        const result = spawnSync('node', [copy, '--root', root, '--baseline', baseline, '--update'], {
          encoding: 'utf8',
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('did not report a clone count');
        expect(fs.readFileSync(baseline, 'utf8')).toBe(bytes);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
