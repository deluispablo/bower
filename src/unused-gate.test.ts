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

function runGate(root: string, baseline: string, production?: string) {
  const args = [gate, '--root', root, '--baseline', baseline];
  if (production) args.push('--production-baseline', production);
  return spawnSync('node', args, { encoding: 'utf8' });
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

  it('an export only tests call fails the production unused-code gate', () => {
    const root = sampleTree();
    try {
      // Tests are entries of the normal pass only; production marks its entries with "!".
      fs.writeFileSync(
        path.join(root, 'knip.json'),
        JSON.stringify({ entry: ['src/index.ts!', 'src/**/*.test.ts'], project: ['src/**/*.ts!'], ignoreExportsUsedInFile: true }),
      );
      fs.appendFileSync(path.join(root, 'src', 'lib.ts'), 'export const keepFinished = () => 3;\n');
      fs.writeFileSync(path.join(root, 'src', 'lib.test.ts'), "import { keepFinished } from './lib';\nkeepFinished();\n");
      const baseline = path.join(root, 'baseline.json');
      const prod = path.join(root, 'production.json');
      fs.writeFileSync(baseline, JSON.stringify({ findings: [] }));
      fs.writeFileSync(prod, JSON.stringify({ findings: [] }));

      const failed = runGate(root, baseline, prod);
      expect(failed.status).not.toBe(0);
      expect(failed.stderr).toContain('New unused production code');
      expect(failed.stderr).toContain('exports src/lib.ts keepFinished');
      // The normal pass alone accepts it (a test calls it).
      expect(runGate(root, baseline).status).toBe(0);

      fs.writeFileSync(prod, JSON.stringify({ findings: ['exports src/lib.ts keepFinished'] }));
      expect(runGate(root, baseline, prod).status).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('the production unused baseline may only shrink', () => {
    const root = sampleTree();
    try {
      const baseline = path.join(root, 'baseline.json');
      const prod = path.join(root, 'production.json');
      fs.writeFileSync(baseline, JSON.stringify({ findings: [] }));
      fs.writeFileSync(prod, JSON.stringify({ findings: ['exports src/lib.ts gone'] }));
      const result = runGate(root, baseline, prod);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Production baseline lists code that is no longer unused');
      expect(result.stderr).toContain('exports src/lib.ts gone');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
