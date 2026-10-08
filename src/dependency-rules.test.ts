/**
 * Rules of who may import whom, checked by dependency-cruiser
 * (docs/harness/METHOD.md, "Rules machines check"; TL-P4-15 c1-dependency-rules).
 */
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { fixture, removeFixtures, ROOT, run } from '@/testing/dependency-gate';

afterAll(removeFixtures);

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

  it('every named exception is still needed, so the list only shrinks', () => {
    const { KNOWN } = createRequire(import.meta.url)(join(ROOT, 'scripts/dependency-exceptions.cjs')) as { KNOWN: { from: string; to: string[]; entry: string }[] };
    const stale = KNOWN.flatMap((k) => k.to.filter((t) => !new RegExp(`from '[^']*/${(t.split('/').pop() ?? t).replace(/\.tsx?$/, '')}'`).test(readFileSync(join(ROOT, k.from), 'utf8'))).map((t) => `${k.from} -> ${t} (${k.entry})`));
    expect(stale, 'These imports are gone: delete their lines from scripts/dependency-exceptions.cjs.').toEqual([]);
  });
});
