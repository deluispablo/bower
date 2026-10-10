import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

it('every var() in src CSS names a defined custom property', () => {
  const files = sourceFiles('src');
  const cssFiles = files.filter((path) => path.endsWith('.css'));
  const tsxFiles = files.filter((path) => path.endsWith('.tsx'));
  const defined = new Set<string>();
  for (const path of cssFiles) {
    const css = readFileSync(path, 'utf8');
    // Includes tokens.css, generated from tokens.json, and local declarations.
    for (const match of css.matchAll(/(--[\w-]+)\s*:/g)) {
      defined.add(match[1] ?? '');
    }
  }
  for (const path of tsxFiles) {
    const tsx = readFileSync(path, 'utf8');
    // Quoted style keys, including ['--lw' as string], and runtime style writes.
    for (const match of tsx.matchAll(/['"](--[\w-]+)['"](?:\s+as\s+string)?\s*\]?\s*:/g)) {
      defined.add(match[1] ?? '');
    }
    for (const match of tsx.matchAll(/\.style\.setProperty\(\s*['"](--[\w-]+)['"]/g)) {
      defined.add(match[1] ?? '');
    }
  }

  const undefinedUses: string[] = [];
  for (const path of cssFiles.sort()) {
    const css = readFileSync(path, 'utf8');
    // Match the first argument even when var() supplies a fallback.
    for (const match of css.matchAll(/var\(\s*(--[\w-]+)\s*(?=[,)])/g)) {
      const name = match[1] ?? '';
      if (!defined.has(name)) {
        const line = css.slice(0, match.index).split('\n').length;
        undefinedUses.push(`${path}:${line}: ${name}`);
      }
    }
  }
  expect(undefinedUses).toEqual([]);
});
