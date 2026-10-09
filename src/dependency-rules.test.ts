/**
 * Rules of who may import whom, checked by dependency-cruiser (docs/harness/METHOD.md, "Rules machines check";
 * TL-P4-15 c1-dependency-rules). dependency-cruiser itself runs once, in `pnpm check` (scripts/check-dependencies.mjs);
 * these tests read the rule list, so they stay fast (TL-P4-17 entry 3).
 */
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
type Rule = { name: string; severity: string; from: { path: string; pathNot?: string[] }; to: { path: string; pathNot?: string[] } };
const load = createRequire(import.meta.url);
const { forbidden } = load(join(ROOT, '.dependency-cruiser.cjs')) as { forbidden: Rule[] };
const { KNOWN } = load(join(ROOT, 'scripts/dependency-exceptions.cjs')) as { KNOWN: { from: string; to: string[]; entry: string }[] };
const hits = (re: string, path: string): boolean => new RegExp(re).test(path);
const rulesNamed = (name: string): Rule[] => forbidden.filter((r) => r.name === name);

describe('dependency rules', () => {
  it('the rule list names every forbidden import', () => {
    expect(new Set(forbidden.map((r) => r.name))).toEqual(new Set(['production-imports-no-fake-or-demo', 'screens-use-data-only-through-sources']));
    expect(forbidden.every((r) => r.severity === 'error')).toBe(true);
  });

  it('screens never import a data source directly', () => {
    // Screens (features, app, ui, bird) reach data only through sources: every source folder is a target.
    const [screens, shell] = rulesNamed('screens-use-data-only-through-sources');
    for (const from of ['src/features/a/Screen.ts', 'src/app/Shell.tsx', 'src/ui/Button.tsx', 'src/bird/presence.ts']) expect(hits(screens?.from.path ?? '', from), from).toBe(true);
    for (const target of ['demo', 'drive', 'vault', 'live', 'worker', 'fake', 'contract'].map((d) => `src/data/${d}/x.ts`).concat('src/data/choose.ts')) expect(hits(screens?.to.path ?? '', target), target).toBe(true);
    expect(hits(screens?.to.path ?? '', 'src/data/sources.ts')).toBe(false);
    expect(hits(screens?.from.path ?? '', 'src/data/provider.tsx')).toBe(false);
    expect(hits(shell?.from.path ?? '', 'src/app/App.tsx')).toBe(true);
  });

  it('production code imports no fake or demo module', () => {
    // Production code never imports a fake or demo module: the two folders, and any file named fake-*.
    const [general] = rulesNamed('production-imports-no-fake-or-demo');
    for (const target of ['src/data/fake/pretend.ts', 'src/data/demo/world.ts', 'src/data/drive/fake-drive.ts', 'runner/src/x/fake-run.tsx']) expect(hits(general?.to.path ?? '', target), target).toBe(true);
    for (const target of ['src/data/provider.tsx', 'src/data/drive/drive-http.ts', 'src/data/fakery.ts']) expect(hits(general?.to.path ?? '', target), target).toBe(false);
    for (const from of ['src/features/a/Screen.ts', 'src/domain/x.ts', 'runner/src/a.ts', 'api/src/a.ts']) expect(hits(general?.from.path ?? '', from), from).toBe(true);
    // ...but not the fakes themselves, the test helpers or the fixtures.
    for (const from of ['src/data/fake/pretend.ts', 'src/testing/dependency-gate.ts', 'src/a/b.fixture.ts']) expect((general?.from.pathNot ?? []).some((re) => hits(re, from)), from).toBe(true);
  });

  it('every named exception is still needed, so the list only shrinks', () => {
    const stale = KNOWN.flatMap((k) => k.to.filter((t) => !new RegExp(`from '[^']*/${(t.split('/').pop() ?? t).replace(/\.tsx?$/, '')}'`).test(readFileSync(join(ROOT, k.from), 'utf8'))).map((t) => `${k.from} -> ${t} (${k.entry})`));
    expect(stale, 'These imports are gone: delete their lines from scripts/dependency-exceptions.cjs.').toEqual([]);
  });

  it('every named exception allows only the targets it names', () => {
    for (const k of KNOWN) {
      const own = rulesNamed('production-imports-no-fake-or-demo').filter((r) => hits(r.from.path, k.from) && r.to.pathNot);
      expect(own.length, `${k.from} has its own rule`).toBeGreaterThan(0);
      for (const t of k.to) expect(own.every((r) => (r.to.pathNot ?? []).some((re) => hits(re, t))), `${k.from} may import ${t}`).toBe(true);
    }
  });
});
