/// <reference types="node" />
/** The dev server's dependency list (vite.deps.ts): nothing the app imports is found late (TL-P4-22 addendum 13 (3)). */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPTIMIZED_DEPS, WARMUP_FILES } from '../vite.deps';

/** Every non-test source file under a folder. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    // sw.ts is built by injectManifest, never in Vite's dev pre-bundle.
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== 'test-setup.ts' && name !== 'sw.ts' ? [path] : [];
  });
}

/** The bare module names the app imports at run time (not types, relative paths, the `@/` alias or node: built-ins). */
function bareImports(): string[] {
  const found = new Set<string>();
  for (const file of sources(join(process.cwd(), 'src'))) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (/^\s*(import|export)\s+type\b/.test(line)) continue;
      // A statement's own line (not prose that happens to say "from '…'"): import … from, export … from, } from, import(…).
      const match = /^\s*(?:(?:import|export)\b|\}).*?\bfrom\s*['"]([^'"]+)['"]/.exec(line) ?? /\bimport\(['"]([^'"]+)['"]\)/.exec(line) ?? /^\s*import\s+['"]([^'"]+)['"]/.exec(line);
      const name = match?.[1];
      if (name && !/^(\.|@\/|node:)/.test(name) && name !== 'vitest') found.add(name);
    }
  }
  return [...found].sort();
}

describe('the dev server dependency list', () => {
  it('pre-bundles every bare runtime import of the app', () => {
    const imports = bareImports();
    expect(imports).toContain('react-router');
    expect(OPTIMIZED_DEPS).toEqual(expect.arrayContaining(imports));
    // The automatic JSX runtime is imported by the compiler, not by a line of ours.
    expect(OPTIMIZED_DEPS).toEqual(expect.arrayContaining(['react/jsx-runtime', 'react/jsx-dev-runtime']));
  });

  it('warms up the app entry', () => {
    expect(WARMUP_FILES).toContain('./src/main.tsx');
    expect(readFileSync(join(process.cwd(), 'index.html'), 'utf8')).toContain('/src/main.tsx');
  });
});
