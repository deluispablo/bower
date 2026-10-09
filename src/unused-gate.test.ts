import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const gate = path.resolve(__dirname, '..', 'scripts', 'check-unused-gate.mjs');

function sampleTree(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unused-gate-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'sample', private: true, type: 'module' }));
  fs.writeFileSync(
    path.join(root, 'knip.json'),
    JSON.stringify({ entry: ['src/index.ts'], project: ['src/**/*.ts'], ignoreExportsUsedInFile: true }),
  );
  fs.writeFileSync(path.join(root, 'src', 'index.ts'), "import { used } from './lib';\nexport const main = used();\n");
  fs.writeFileSync(path.join(root, 'src', 'lib.ts'), 'export const used = () => 1;\n');
  return root;
}

function runGate(root: string, baseline: string) {
  return spawnSync('node', [gate, '--root', root, '--baseline', baseline], { encoding: 'utf8' });
}

describe('unused-code gate', () => {
  it('a new unused export fails the unused-code gate', () => {
    const root = sampleTree();
    try {
      const baseline = path.join(root, 'baseline.json');
      fs.writeFileSync(baseline, JSON.stringify({ findings: [] }));
      expect(runGate(root, baseline).status).toBe(0);

      fs.appendFileSync(path.join(root, 'src', 'lib.ts'), 'export const neverCalled = () => 2;\n');
      const failed = runGate(root, baseline);
      expect(failed.status).not.toBe(0);
      expect(failed.stderr).toContain('New unused code');
      expect(failed.stderr).toContain('exports src/lib.ts neverCalled');

      fs.writeFileSync(baseline, JSON.stringify({ findings: ['exports src/lib.ts neverCalled'] }));
      expect(runGate(root, baseline).status).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('the unused baseline may only shrink', () => {
    const root = sampleTree();
    try {
      const baseline = path.join(root, 'baseline.json');
      fs.writeFileSync(baseline, JSON.stringify({ findings: ['exports src/lib.ts gone'] }));
      const result = runGate(root, baseline);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Baseline lists code that is no longer unused');
      expect(result.stderr).toContain('exports src/lib.ts gone');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
