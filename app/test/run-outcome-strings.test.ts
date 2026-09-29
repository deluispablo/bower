/**
 * R-RUN-4 (#756): every result surface says what a run did through
 * `RunOutcome`, so the old ad-hoc result strings are gone from `app/src`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** The code without its comments, so a doc line may still name the old words. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const BANNED = [
  /Nothing new to process/,
  /Nothing new this time/,
  /\bfiles? processed\b/,
];

/**
 * Surfaces still owned by other issues: Home's bubble text (`home.ts`) and
 * the run store's done toast (`run-store.tsx`) move to `RunOutcome` with
 * their own issues. Remove each entry as it lands.
 */
const NOT_YET_MIGRATED = new Set(['home.ts', 'run-store.tsx']);

describe('R-RUN-4: no old result strings in app/src', () => {
  const files = sourceFiles(SRC).map((path) => ({
    name: relative(SRC, path).replaceAll('\\', '/'),
    code: withoutComments(readFileSync(path, 'utf8')),
  }));

  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('never says "Nothing new to process", "Nothing new this time" or "N files processed"', () => {
    const hits = files
      .filter(({ name }) => !NOT_YET_MIGRATED.has(name))
      .flatMap(({ name, code }) =>
        BANNED.filter((pattern) => pattern.test(code)).map(
          (pattern) => `${name}: ${pattern.source}`,
        ),
      );
    expect(hits).toEqual([]);
  });

  it('the Bower tab, Activity and the Tidy up button say "processed" nowhere', () => {
    const own = [
      'routes/bower.tsx',
      'bower-tab.ts',
      'activity.ts',
      'components/activity-panel.tsx',
      'components/process-button.tsx',
    ];
    const hits = files
      .filter(({ name }) => own.includes(name))
      .filter(({ code }) => /["'`>][^"'`<\n]*\bprocessed\b/.test(code))
      .map(({ name }) => name);
    expect(hits).toEqual([]);
  });
});
