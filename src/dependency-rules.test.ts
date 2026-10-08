/**
 * Rules of who may import whom, checked by dependency-cruiser
 * (docs/harness/METHOD.md, "Rules machines check"; TL-P4-15 c1-dependency-rules).
 */
/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GATE = join(ROOT, 'scripts/check-dependencies.mjs');
const run = (root: string) => {
  const r = spawnSync('node', [GATE, '--root', root], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

const made: string[] = [];
const fixture = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), 'bower-deps-'));
  made.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
};
afterAll(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('dependency rules', () => {
  it('production code imports no fake or demo module', () => {
    const real = run(ROOT);
    expect(real.out, 'the real tree passes with its named exceptions').toContain('no dependency violations');
    expect(real.code).toBe(0);

    const base = { 'src/data/fake/pretend.ts': 'export const p = 1;\n', 'src/data/demo/world.ts': 'export const w = 1;\n', 'src/data/provider.tsx': 'export const q = 1;\n' };
    const clean = fixture({ ...base, 'src/features/a/Screen.ts': "import { q } from '../../data/provider';\nexport const s = q;\n" });
    expect(run(clean).code).toBe(0);

    const bad = fixture({ ...base, 'src/features/a/Screen.ts': "import { p } from '../../data/fake/pretend';\nexport const s = p;\n" });
    const r = run(bad);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('production-imports-no-fake-or-demo');

    const badFake = fixture({ ...base, 'src/domain/x.ts': "import type { FencedDrive } from '../data/drive/fake-drive';\nexport type X = FencedDrive;\n", 'src/data/drive/fake-drive.ts': 'export type FencedDrive = number;\n' });
    expect(run(badFake).out).toContain('production-imports-no-fake-or-demo');

    // A named exception allows only its own targets: a new break in the same file fails.
    const wider = fixture({ ...base, 'src/data/spine/scripted.ts': "import { w } from '../demo/world';\nexport const s = w;\n" });
    expect(run(wider).code).not.toBe(0);
  });

  it('screens never import a data source directly', () => {
    const bad = fixture({ 'src/data/vault/drive-vault.ts': 'export const v = 1;\n', 'src/features/a/Screen.ts': "import { v } from '../../data/vault/drive-vault';\nexport const s = v;\n" });
    const r = run(bad);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('screens-use-data-only-through-sources');
  });
});
